import type { ExecutionPlan, Groupable } from '~/ani/core'
import { TimelineBase, toIterationCount } from '~/ani/core'
import { compilePlan, PlanRuntime } from '~/ani/core/plan_runtime'
import type { TimelineStatus } from '~/ani/raf/timeline'
import type { AnimationNode } from '~/nodes'
import type { Resolver } from '~/style'
import { compileToKeyframes, type WebAniKeyframe } from './compiler'

/** How a `play()` run ended. */
export type RunResult =
    | 'ended'
    | 'interrupted'
    | 'skipped'
    | 'reset'
    | 'disposed'

interface CachedKeyframes {
    keys: string[]
    values: number[]
    resolver: Resolver<Record<string, number>> | undefined
    keyframes: WebAniKeyframe[]
}

const MAX_CACHE_ENTRIES = 8
// Compiled keyframes depend only on (plan, from, resolver) and the plan is a
// pure function of the root node, so every timeline built over the same node
// (e.g. one per element) shares the work. Plans with runtime overrides are not
// cached.
const keyframeCache = new WeakMap<object, CachedKeyframes[]>()

function sameFrom(entry: CachedKeyframes, from: Record<string, number>) {
    const keys = Object.keys(from)
    if (keys.length !== entry.keys.length) return false
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] !== entry.keys[i] || from[keys[i]!] !== entry.values[i]) {
            return false
        }
    }
    return true
}

export interface WaapiPlayConfig<G extends Groupable> {
    /**
     * Starting value (record of CSS properties), or a function returning the
     * starting value of target `index`. Targets with equal values share the
     * compiled keyframes.
     */
    from: G | ((index: number) => G)
    /**
     * Dynamic target overrides. Matches the order of SEGMENT nodes in the plan.
     */
    keyframes?: Array<G | 'keep'>
    /**
     * Dynamic duration overrides. Matches the order of SEGMENT nodes in the plan.
     */
    durations?: Array<number | 'keep'>
    /**
     * Additional runs after the first one. `Infinity` is allowed.
     */
    repeat?: number
    /**
     * Initial delay before the animation starts (seconds).
     */
    delay?: number
    /**
     * Start offset per target (seconds): a fixed step between neighbours, or a
     * function of the target index and the target count.
     */
    stagger?: number | ((index: number, count: number) => number)
    /**
     * Custom style property resolver.
     */
    resolver?: Resolver<Record<string, number>>
    /**
     * Web Animations API config.
     *
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/KeyframeEffect/KeyframeEffect#options KeyframeEffect Options}.
     */
    effect?: Omit<KeyframeEffectOptions, 'duration' | 'iterations' | 'delay'>
    /**
     * Whether a new `play()` may interrupt a running one. When `false`, it
     * resolves `'skipped'` instead. Defaults to `true`.
     */
    interrupt?: boolean
}

interface Variant {
    readonly keys: string[]
    readonly values: number[]
    readonly keyframes: WebAniKeyframe[]
    runtime: PlanRuntime | null
}

interface Run {
    readonly animations: Animation[]
    readonly delaysMs: number[]
    readonly variants: Variant[]
    readonly plan: ExecutionPlan<Groupable>
    readonly duration: number
    readonly iterations: number
    readonly resolve: (result: RunResult) => void
    // `valueAt` cache: last sampled `currentTime` and value per target
    readonly sampledAt: number[]
    readonly sampled: Array<Record<string, number> | null>
    settled: boolean
    finishedCount: number
}

const NO_ANIMATIONS: readonly Animation[] = []

function reportAsync(error: unknown): void {
    queueMicrotask(() => {
        throw error
    })
}

function toElements(targets: Element | ArrayLike<Element>): Element[] {
    const list = targets as ArrayLike<Element> & { nodeType?: unknown }
    // a <form> or <select> element is array-like too: nodes are single targets
    if (typeof list.nodeType === 'number' || typeof list.length !== 'number') {
        return [targets as Element]
    }
    return Array.from(list)
}

function validateFrom(from: unknown, name: string): Record<string, number> {
    if (typeof from !== 'object' || from === null || Array.isArray(from)) {
        throw new TypeError(
            `[Timeline] \`${name}\` must be a record of numbers (CSS property names); the WAAPI engine does not accept arrays.`
        )
    }
    const record = from as Record<string, unknown>
    for (const key of Object.keys(record)) {
        const value = record[key]
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new TypeError(
                `[Timeline] \`${name}\` "${key}" must be a finite number, received ${String(value)}.`
            )
        }
    }
    return record as Record<string, number>
}

function resolveOffsets(
    stagger: WaapiPlayConfig<Groupable>['stagger'],
    count: number
): number[] {
    const offsets = new Array<number>(count).fill(0)
    if (stagger === undefined) return offsets
    if (
        typeof stagger !== 'function' &&
        (typeof stagger !== 'number' || !Number.isFinite(stagger))
    ) {
        throw new RangeError(
            `[Timeline] \`stagger\` must be a finite number >= 0 (seconds) or a function, received ${String(stagger)}.`
        )
    }
    for (let i = 0; i < count; i++) {
        const offset =
            typeof stagger === 'function' ? stagger(i, count) : i * stagger
        if (
            typeof offset !== 'number' ||
            !Number.isFinite(offset) ||
            offset < 0
        ) {
            throw new RangeError(
                `[Timeline] \`stagger\` offset of target #${i} must be a finite number >= 0 (seconds), received ${String(offset)}.`
            )
        }
        offsets[i] = offset
    }
    return offsets
}

export class WebAniTimeline<G extends Groupable> extends TimelineBase<
    G,
    [targets: Element | ArrayLike<Element>, config: WaapiPlayConfig<G>]
> {
    private _status: TimelineStatus = 'IDLE'
    private _disposed = false
    private _run: Run | null = null
    private readonly _statusListeners = new Set<
        (status: TimelineStatus) => void
    >()

    constructor(rootNode: AnimationNode<G>) {
        super(rootNode)

        this.cancel = this.cancel.bind(this)
        this.finish = this.finish.bind(this)
        this.dispose = this.dispose.bind(this)
    }

    /** Current lifecycle status. */
    public get status(): TimelineStatus {
        return this._status
    }

    /** Native animations of the current run, one per target (in order). */
    public get animations(): readonly Animation[] {
        return this._run?.animations ?? NO_ANIMATIONS
    }

    /**
     * Value of the first target, `null` when there is no run.
     * @see {@link WebAniTimeline.valueAt}
     */
    public get value(): Readonly<Record<string, number>> | null {
        return this.valueAt(0)
    }

    /**
     * Value of target `index`, computed from the plan at that animation's
     * `currentTime` (minus its delay, wrapped per repeat, clamped to the run).
     * Computed styles are never read. `null` without a run or out of range.
     *
     * The plan is evaluated with its own timings: `effect` options that change
     * the playhead mapping (`direction`, `easing`, `iterationStart`) are not
     * reflected.
     */
    public valueAt(index: number): Readonly<Record<string, number>> | null {
        const run = this._run
        if (!run || !Number.isInteger(index) || index < 0) return null
        const animation = run.animations[index]
        if (!animation) return null

        const current = animation.currentTime
        const time = typeof current === 'number' ? current : 0
        const cached = run.sampled[index]
        if (cached && run.sampledAt[index] === time) return cached

        const { duration, iterations } = run
        const local = Math.max(0, time - run.delaysMs[index]!) / 1000
        let at = 0
        if (duration > 0) {
            at = local >= duration * iterations ? duration : local % duration
        }

        const variant = run.variants[index]!
        const runtime = (variant.runtime ??= new PlanRuntime(
            compilePlan(run.plan, variant.keys, variant.keys.length),
            variant.values
        ))
        runtime.evaluate(at, 0)
        const value: Record<string, number> = {}
        for (let i = 0; i < variant.keys.length; i++) {
            value[variant.keys[i]!] = runtime.values[i]!
        }
        Object.freeze(value)
        run.sampledAt[index] = time
        run.sampled[index] = value
        return value
    }

    /**
     * Subscribes to status changes.
     *
     * A throwing listener does not affect the others nor the timeline; its
     * error is rethrown asynchronously.
     * @returns Unsubscribe.
     */
    public onStatus(listener: (status: TimelineStatus) => void): () => void {
        if (this._disposed) return () => undefined
        this._statusListeners.add(listener)
        return () => {
            this._statusListeners.delete(listener)
        }
    }

    private _setStatus(status: TimelineStatus): void {
        if (this._status === status) return
        this._status = status
        for (const listener of [...this._statusListeners]) {
            try {
                listener(status)
            } catch (error) {
                reportAsync(error)
            }
        }
    }

    private _isRunning(): boolean {
        return this._status === 'PLAYING' || this._status === 'PAUSED'
    }

    private _settle(run: Run, result: RunResult): void {
        if (run.settled) return
        run.settled = true
        run.resolve(result)
    }

    /**
     * Commits the current styles of a run's animations (best effort: it throws
     * for elements that are not rendered), then cancels them.
     */
    private _release(run: Run, commit: boolean): void {
        for (const animation of run.animations) {
            if (commit) {
                try {
                    animation.commitStyles()
                } catch {
                    // not rendered: nothing to commit
                }
            }
            animation.cancel()
        }
    }

    /**
     * Plays the animation on one or several targets, one native animation per
     * target.
     *
     * Playing over a running animation commits its current styles to the
     * elements and cancels it (the previous promise resolves `'interrupted'`),
     * so there is no visual jump. Velocity is not continuous on WAAPI.
     *
     * @param targets Target element(s).
     * @param config {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API Web Animations API} based config.
     * @returns The result of this run. It never rejects.
     */
    public play(
        targets: Element | ArrayLike<Element>,
        config: WaapiPlayConfig<G>
    ): Promise<RunResult> {
        if (this._disposed) return Promise.resolve('disposed')

        // ---- validate & prepare (no state is touched until this succeeds)
        const elements = toElements(targets)
        const count = elements.length
        if (count === 0) {
            throw new RangeError('[Timeline] `play` needs at least one target.')
        }
        const delay = config.delay ?? 0
        if (typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0) {
            throw new RangeError(
                `[Timeline] \`delay\` must be a finite number >= 0 (seconds), received ${String(delay)}.`
            )
        }
        const offsets = resolveOffsets(config.stagger, count)
        const fromOf = config.from as unknown
        const fromIsFunction = typeof fromOf === 'function'
        const froms: Array<Record<string, number>> = []
        for (let i = 0; i < count; i++) {
            if (!fromIsFunction && i > 0) {
                froms.push(froms[0]!)
                continue
            }
            froms.push(
                fromIsFunction
                    ? validateFrom(
                          (fromOf as (index: number) => unknown)(i),
                          `from(${i})`
                      )
                    : validateFrom(fromOf, 'from')
            )
        }

        if (this._isRunning() && config.interrupt === false) {
            return Promise.resolve('skipped')
        }

        const { plan, duration } = this._buildExecutionPlan(
            config.keyframes,
            config.durations
        )
        const cacheable = !config.keyframes && !config.durations
        const variants: Variant[] = []
        const bySignature = new Map<string, Variant>()
        for (const from of froms) {
            const signature = JSON.stringify(Object.entries(from))
            let variant = bySignature.get(signature)
            if (!variant) {
                variant = {
                    keys: Object.keys(from),
                    values: Object.values(from),
                    keyframes: this._compile(
                        plan,
                        from,
                        config.resolver,
                        cacheable
                    ),
                    runtime: null,
                }
                bySignature.set(signature, variant)
            }
            variants.push(variant)
        }

        const durationMs = duration * 1000
        const requested = toIterationCount(config.repeat)
        const iterations =
            // Infinite iterations require a positive duration per spec.
            durationMs === 0 && requested === Infinity ? 1 : requested
        const delaysMs = offsets.map((offset) => (delay + offset) * 1000)
        // built before the old run is touched: a throwing option keeps it alive
        const animations = elements.map((element, i) => {
            const effect = new KeyframeEffect(element, variants[i]!.keyframes, {
                duration: durationMs,
                iterations,
                delay: delaysMs[i]!,
                fill: 'forwards',
                ...config.effect,
            })
            return new Animation(effect, document.timeline)
        })

        // ---- commit
        this._commitDuration(duration)
        this._currentExecutionPlan = plan
        const previous = this._run
        if (previous) {
            this._release(previous, true)
            this._settle(previous, 'interrupted')
        }

        let resolve!: (result: RunResult) => void
        const promise = new Promise<RunResult>((done) => {
            resolve = done
        })
        const run: Run = {
            animations,
            delaysMs,
            variants,
            plan: plan as ExecutionPlan<Groupable>,
            duration,
            iterations,
            resolve,
            sampledAt: new Array<number>(count).fill(Number.NaN),
            sampled: new Array<Record<string, number> | null>(count).fill(null),
            settled: false,
            finishedCount: 0,
        }
        this._run = run

        for (const animation of animations) {
            animation.play()
            animation.finished.then(
                () => {
                    if (this._run !== run || run.settled) return
                    if (++run.finishedCount === animations.length) {
                        this._settle(run, 'ended')
                        this._setStatus('ENDED')
                    }
                },
                // cancel() surfaces as a rejection; the canceller settles the run
                () => undefined
            )
        }
        this._setStatus('PLAYING')
        return promise
    }

    private _compile(
        plan: ExecutionPlan<G>,
        from: Record<string, number>,
        resolver: Resolver<Record<string, number>> | undefined,
        cacheable: boolean
    ): WebAniKeyframe[] {
        if (cacheable) {
            const entries = keyframeCache.get(this.rootNode)
            const hit = entries?.find(
                (entry) => entry.resolver === resolver && sameFrom(entry, from)
            )
            if (hit) return hit.keyframes
        }

        const keyframes = compileToKeyframes(plan, from as G, resolver)

        if (cacheable) {
            const entries = keyframeCache.get(this.rootNode) ?? []
            if (entries.length >= MAX_CACHE_ENTRIES) entries.shift()
            entries.push({
                keys: Object.keys(from),
                values: Object.values(from),
                resolver,
                keyframes,
            })
            keyframeCache.set(this.rootNode, entries)
        }
        return keyframes
    }

    /**
     * Pauses a `PLAYING` timeline (no-op in any other status).
     */
    public pause(): void {
        const run = this._run
        if (!run || this._status !== 'PLAYING') return
        for (const animation of run.animations) {
            // a finished target keeps its forwards-filled end state
            if (animation.playState !== 'finished') animation.pause()
        }
        this._setStatus('PAUSED')
    }

    /**
     * Resumes a `PAUSED` timeline (no-op in any other status).
     */
    public resume(): void {
        const run = this._run
        if (!run || this._status !== 'PAUSED') return
        for (const animation of run.animations) {
            // play() on a finished animation would rewind it to the start
            if (animation.playState !== 'finished') animation.play()
        }
        this._setStatus('PLAYING')
    }

    /**
     * Jumps every target to `targetTime` (seconds, clamped to one run). Each
     * target keeps its own delay offset. No-op without a run.
     */
    public seek(targetTime: number): void {
        const run = this._run
        if (!run) return
        if (typeof targetTime !== 'number' || Number.isNaN(targetTime)) {
            throw new RangeError(
                `[Timeline] seek time must be a number, received ${targetTime}.`
            )
        }
        const seekTime = Math.max(0, Math.min(targetTime, run.duration))
        run.animations.forEach((animation, i) => {
            animation.currentTime = seekTime * 1000 + run.delaysMs[i]!
        })
    }

    /**
     * Jumps a `PLAYING` or `PAUSED` timeline to its end: status `ENDED`, the
     * run resolves `'ended'` (no-op in any other status). Throws for an endless
     * run (`repeat: Infinity`), which has no end.
     */
    public finish(): void {
        const run = this._run
        if (!run || !this._isRunning()) return
        if (run.iterations === Infinity) {
            throw new RangeError(
                '[Timeline] `finish()` is not available for an endless run (`repeat: Infinity`); use `cancel()`.'
            )
        }
        for (const animation of run.animations) animation.finish()
        this._settle(run, 'ended')
        this._setStatus('ENDED')
    }

    /**
     * Cancels the native animations and returns to `IDLE`: the run resolves
     * `'reset'`, the elements go back to their own styles and `durations`
     * overrides are dropped.
     */
    public cancel(): void {
        const run = this._run
        if (run) {
            this._run = null
            this._release(run, false)
            this._settle(run, 'reset')
        }
        this._currentExecutionPlan = null
        this._restoreDuration()
        this._setStatus('IDLE')
    }

    /**
     * Alias of cancel() for parity with the RAF engine.
     */
    public reset(): void {
        this.cancel()
    }

    /**
     * Cancels the run, drops every listener and turns further `play()` calls
     * into a `'disposed'` result. Idempotent.
     */
    public dispose(): void {
        if (this._disposed) return
        this._disposed = true
        this.cancel()
        this._statusListeners.clear()
    }
}

/**
 * Create web timeline. {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API Web Animations API} based.
 * @param rootNode Root animation node.
 */
export function webTimeline<G extends Groupable>(
    rootNode: AnimationNode<G>
): WebAniTimeline<G> {
    return new WebAniTimeline(rootNode)
}
