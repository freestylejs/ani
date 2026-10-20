import type { AniGroup, Groupable, RunResult } from '~/ani/core'
import {
    normalizeRepeatCount,
    prefersReducedMotion,
    type ReducedMotionPolicy,
    resolveReducedMotionPolicy,
    TimelineBase,
    type TimelineCommonConfig,
} from '~/ani/core'
import { compilePlan, PlanRuntime } from '~/ani/core/plan_runtime'
import { resolveGroup } from '~/ani/core/resolver'
import { devKey, devWarn } from '~/dev'
import { createAniError } from '~/error'
import {
    type Animatable,
    type AnimationClockInterface,
    defaultClock,
} from '~/loop'
import type { AnimationNode } from '~/nodes'
import { createStyleSheet, type Resolver } from '~/style/create_sheet'
import { createStyleWriter, type StyleWriter } from '~/style/writer'
import { END_TOLERANCE } from '~/utils/time'
import { isFiniteNumber, MAX_REENTRY, reportAsync } from './shared'

declare const __ANI_DEV__: boolean

export interface RafTimelineConfig<G extends Groupable>
    extends TimelineCommonConfig<G> {
    /**
     * Initial velocity per value, in units per second (same shape as `from`;
     * record velocities may be partial). Seeds stateful timings such as
     * `dynamicSpring`; ignored by stateless timings.
     *
     * Playing over a running animation without this option continues from
     * the current `velocity` automatically.
     */
    velocity?: Partial<G>
    /**
     * Whether this `play()` may replace a `PLAYING` run. With `false` it does
     * nothing and resolves `'skipped'`.
     * @default true
     */
    interrupt?: boolean
}

/** Options of {@link rafTimeline}. */
export interface RafTimelineOptions {
    /**
     * Clock that drives the timeline. Defaults to the shared `defaultClock`.
     */
    clock?: AnimationClockInterface | undefined
    /**
     * What a `play()` does while the clock reports `reducedMotion`. The
     * preference is read once at the start of each `play()`.
     * @default 'jump'
     */
    reducedMotion?: ReducedMotionPolicy | undefined
}

export type TimelineStatus = 'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED'

export type OnUpdateCallback<G extends Groupable> = (current: {
    /**
     * Current animation state. Shared (same object) by every callback of one
     * notification: treat it as read-only.
     */
    state: AniGroup<G>
    /**
     * Current animation status
     */
    status: TimelineStatus
}) => void

export interface BindOptions {
    /**
     * Maps animated values to style declarations.
     */
    resolver?: Resolver<Record<string, number>> | undefined
}

/** V2 public surface of the RAF timeline. */
export interface RafTimeline<G extends Groupable> {
    /** Current lifecycle status. */
    readonly status: TimelineStatus
    /**
     * Total duration in seconds of the current plan; `Infinity` when the tree
     * contains `loop(child, Infinity)` (such a run never ends).
     */
    readonly duration: number
    /** Config of the current run, or `null`. */
    readonly config: RafTimelineConfig<G> | null
    /** Frozen snapshot of the latest value, or `null`. */
    readonly value: AniGroup<G> | null
    /** Per-value velocity in units per second, or `null`. */
    readonly velocity: AniGroup<G> | null
    /**
     * Starts (or interrupts) the animation. The promise never rejects and
     * resolves once per run with how it ended.
     */
    play(config: RafTimelineConfig<G>): Promise<RunResult>
    /**
     * Links the time of the timeline to an external progress value (scroll,
     * a scrubbed gesture) instead of the clock. Returns a stop function.
     */
    drive(progress: () => number, config: RafTimelineConfig<G>): () => void
    /** Pauses a `PLAYING` timeline. */
    pause(): void
    /** Resumes a `PAUSED` timeline. */
    resume(): void
    /** Jumps to `targetTime` seconds and pauses. */
    seek(targetTime: number): void
    /** Back to `IDLE`. */
    reset(): void
    /** Stops the timeline for good and releases everything. */
    dispose(): void
    /** Writes the value to `target.style` on every notification. */
    bind(
        target: { style: CSSStyleDeclaration } | HTMLElement,
        options?: BindOptions
    ): () => void
    /** Subscribes to `{ state, status }` notifications. */
    onUpdate(callback: OnUpdateCallback<G>): () => void
}

interface Run {
    readonly promise: Promise<RunResult>
    readonly resolve: (result: RunResult) => void
}

interface Binding {
    readonly writer: StyleWriter
    readonly resolver: Resolver<Record<string, number>> | undefined
}

/** Times one listener may be on the stack: its call plus one nested notification. */
function clamp01(value: number): number {
    return value < 0 ? 0 : value > 1 ? 1 : value
}

function badProgressError(value: unknown): RangeError {
    return createAniError(
        RangeError,
        'ANI_INVALID_CONFIG',
        __ANI_DEV__
            ? `[Timeline] \`drive\` progress must be a finite number, received ${String(value)}.`
            : ''
    )
}

const FACADE_FUNCTIONS = [
    'play',
    'drive',
    'pause',
    'resume',
    'seek',
    'reset',
    'dispose',
    'bind',
    'onUpdate',
] as const

const FACADE_MEMBERS = ['status', 'duration', 'config', 'value', 'velocity']

/**
 * Whether `value` is a RAF timeline: one made by {@link rafTimeline} or a
 * facade with the same public surface (e.g. from `createTimelineController`).
 */
export function isRafTimeline(value: unknown): value is RafTimeline<Groupable> {
    if (value instanceof RafAniTimeline) return true
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Record<string, unknown>
    return (
        FACADE_FUNCTIONS.every((key) => typeof candidate[key] === 'function') &&
        FACADE_MEMBERS.every((key) => key in candidate)
    )
}

/** Config keys of 1.x that no longer exist: they would be silently ignored. */
export function assertConfigKeys(config: object): void {
    const keys = config as { context?: unknown; propertyResolver?: unknown }
    if (keys.context !== undefined) {
        throw createAniError(
            TypeError,
            'ANI_REMOVED_API',
            __ANI_DEV__
                ? '[Timeline] `context` was removed: it was never read. Pass values through the timeline or its nodes.'
                : ''
        )
    }
    if (keys.propertyResolver !== undefined) {
        throw createAniError(
            TypeError,
            'ANI_REMOVED_API',
            __ANI_DEV__
                ? '[Timeline] `propertyResolver` was removed from the play config. Pass it to `bind`: `timeline.bind(element, { resolver })`.'
                : ''
        )
    }
}

/**
 * @private The class behind {@link rafTimeline}; the public type is
 * {@link RafTimeline}.
 */
export class RafAniTimeline<G extends Groupable>
    extends TimelineBase<G>
    // Raf clock
    implements Animatable, RafTimeline<G>
{
    private readonly _clock: AnimationClockInterface
    private readonly _reducedMotion: ReducedMotionPolicy
    // plan seconds per clock second: above 1 for a run sped up by `maxDuration`
    private _speed = 1

    private _masterTime = 0
    private _delay = 0
    private _status: TimelineStatus = 'IDLE'
    private _disposed = false
    /** Bumped on every play/reset/seek: a pending commit belongs to one run. */
    private _runId = 0
    /**
     * Bumped on reset/seek: the frame being notified is stale, so the
     * remaining listeners skip it (a `play()` keeps delivering it).
     */
    private _epoch = 0

    private _currentConfig: RafTimelineConfig<G> | null = null

    /** Config of the current run, or `null`. */
    public get config(): RafTimelineConfig<G> | null {
        return this._currentConfig
    }

    /**
     * Latest value, `null` before the first `play()` (and after `reset()`).
     * The returned object is a frozen snapshot, stable until the next frame;
     * it never aliases engine internals or the `from` passed to `play()`.
     */
    public get value(): AniGroup<G> | null {
        const runtime = this._runtime
        if (!runtime || runtime.values.length === 0) return null
        if (this._snapshotDirty || this._snapshot === null) {
            this._snapshot = Object.freeze(
                this._buildGroup(runtime.values)
            ) as AniGroup<G>
            this._snapshotDirty = false
        }
        return this._snapshot
    }

    /**
     * Per-value velocity in units/second: the integrator velocity for stateful
     * timings (dynamic springs), else the finite difference of the last
     * advanced frame. Zero unless the timeline is `PLAYING`. `null` until a
     * frame has advanced since `play()` / `seek()`.
     */
    public get velocity(): AniGroup<G> | null {
        const runtime = this._runtime
        if (!runtime || !this._advanced) return null
        const count = runtime.values.length
        const out = new Array<number>(count)
        const moving =
            this._status === 'PLAYING' &&
            (this._progress === null || this._moved)
        for (let i = 0; i < count; i++) {
            if (!moving) {
                out[i] = 0
                continue
            }
            const v = runtime.velocities[i]!
            const perPlanSecond = Number.isNaN(v)
                ? this._lastDt > 0
                    ? (runtime.values[i]! - runtime.previous[i]!) / this._lastDt
                    : 0
                : v
            out[i] = perPlanSecond * this._speed
        }
        return this._buildGroup(out) as AniGroup<G>
    }

    /** Current lifecycle status. */
    public get status(): TimelineStatus {
        return this._status
    }

    private _runtime: PlanRuntime | null = null
    private _keys: readonly string[] | null = null
    private _remainingRepeats: number = 0
    private _onUpdateCallbacks = new Set<OnUpdateCallback<G>>()

    private _bindings = new Set<Binding>()
    // how often a callback is on the stack; bounds re-entrant notifications
    private _running = new Map<OnUpdateCallback<G>, number>()
    // sheets of the notification being written, shared by its bindings
    private _defaultSheet: Record<string, unknown> | null = null
    private _customSheets: Map<object, Record<string, unknown>> | null = null

    // update() produced a change that commit() has not published yet
    private _pending = false
    private _pendingRunId = 0

    // the unsettled run: exactly one promise per play(), settled once
    private _run: Run | null = null

    private _lastDt = 0
    private _advanced = false

    // progress source of a driven run, `null` when not driven
    private _progress: (() => number) | null = null
    private _driveId = 0
    // progress sampled in the read phase, consumed by the next update
    private _sample = 0
    private _badProgress = false
    // the driven time changed in the last frame
    private _moved = false

    // Cached group, shared with the onUpdate subscribers of one notification
    // and referentially stable for `value` until the next frame.
    private _cachedGroup: AniGroup<G> | null = null
    private _groupDirty = true
    // frozen copy handed out by `value`
    private _snapshot: AniGroup<G> | null = null
    private _snapshotDirty = true

    constructor(rootNode: AnimationNode<G>, options?: RafTimelineOptions) {
        super(rootNode)
        if (options !== undefined) {
            if (typeof options !== 'object' || options === null) {
                throw createAniError(
                    TypeError,
                    'ANI_REMOVED_API',
                    __ANI_DEV__
                        ? `[rafTimeline] Expected an options object, received ${typeof options}. Use \`rafTimeline(node, { clock })\`.`
                        : ''
                )
            }
            if ('subscribe' in options) {
                throw createAniError(
                    TypeError,
                    'ANI_REMOVED_API',
                    __ANI_DEV__
                        ? '[rafTimeline] The second argument is an options object, not a clock. Use `rafTimeline(node, { clock })`.'
                        : ''
                )
            }
        }
        this._reducedMotion = resolveReducedMotionPolicy(options?.reducedMotion)
        this._clock = options?.clock ?? defaultClock

        this.play = this.play.bind(this)
        this.drive = this.drive.bind(this)
        this.pause = this.pause.bind(this)
        this.seek = this.seek.bind(this)
        this.resume = this.resume.bind(this)
        this.reset = this.reset.bind(this)
        this.dispose = this.dispose.bind(this)
        this.bind = this.bind.bind(this)
    }

    private _settle(result: RunResult): void {
        const run = this._run
        if (run === null) return
        this._run = null
        run.resolve(result)
    }

    private _buildGroup(values: readonly number[]): Groupable {
        const keys = this._keys
        if (!keys) return values.slice()
        // A plain keyed-store loop benchmarked as fast as every CSP-safe
        // template/clone alternative (and as code generation, which is banned).
        const group: Record<string, number> = {}
        for (let i = 0; i < keys.length; i++) {
            group[keys[i]!] = values[i]!
        }
        return group
    }

    private _group(): AniGroup<G> {
        if (!this._groupDirty && this._cachedGroup !== null) {
            return this._cachedGroup
        }
        const runtime = this._runtime
        this._cachedGroup = (
            runtime ? this._buildGroup(runtime.values) : []
        ) as AniGroup<G>
        this._groupDirty = false
        return this._cachedGroup
    }

    private _sheetFor(
        binding: Binding,
        group: Record<string, number>
    ): Record<string, unknown> {
        const resolver = binding.resolver
        if (resolver === undefined) {
            return (this._defaultSheet ??= createStyleSheet(group))
        }
        const sheets = (this._customSheets ??= new Map())
        let sheet = sheets.get(resolver)
        if (sheet === undefined) {
            sheet = createStyleSheet(group, resolver)
            sheets.set(resolver, sheet)
        }
        return sheet
    }

    private _writeBinding(binding: Binding, group: AniGroup<G>): void {
        try {
            if (Array.isArray(group)) {
                this._bindings.delete(binding)
                throw createAniError(
                    TypeError,
                    'ANI_INVALID_OPTIONS',
                    __ANI_DEV__
                        ? '[Timeline] `bind()` can only style record values; positional (array) values have no style property.'
                        : ''
                )
            }
            binding.writer.write(
                this._sheetFor(binding, group as Record<string, number>)
            )
        } catch (error) {
            reportAsync(error)
        }
    }

    private _writeBindings(): void {
        const runtime = this._runtime
        if (!runtime || runtime.values.length === 0) return
        const group = this._group()
        for (const binding of this._bindings) {
            this._writeBinding(binding, group)
        }
        this._defaultSheet = null
        this._customSheets = null
    }

    /** Writes the bound targets, then calls the listeners. */
    private _notify(): void {
        const callbacks = this._onUpdateCallbacks
        if (this._bindings.size > 0) this._writeBindings()
        if (callbacks.size === 0) return
        const epoch = this._epoch
        const payload = { state: this._group(), status: this._status }
        for (const callback of callbacks) {
            // a listener reset / sought this timeline: the frame is stale
            if (epoch !== this._epoch) return
            // a listener that calls play() / seek() / reset() sees the nested
            // notification once; deeper re-entry would never terminate
            const depth = this._running.get(callback) ?? 0
            if (depth >= MAX_REENTRY) continue
            this._running.set(callback, depth + 1)
            try {
                callback(payload)
            } catch (error) {
                reportAsync(error)
            } finally {
                if (depth === 0) this._running.delete(callback)
                else this._running.set(callback, depth)
            }
        }
    }

    /**
     * @private Internal clock read callback. Samples the progress source of a
     * driven run, once per frame, before any subscriber updates.
     */
    read(): void {
        const progress = this._progress
        if (progress === null || this._status !== 'PLAYING') return
        try {
            this._sample = progress()
        } catch (error) {
            this._sample = Number.NaN
            this._reportBadProgress(error)
        }
    }

    // a source that stays invalid is reported once, not once per frame
    private _reportBadProgress(error: unknown): void {
        if (this._badProgress) return
        this._badProgress = true
        reportAsync(error)
    }

    /**
     * @private Internal clock subscription callback. Computes only: bound
     * targets are written and listeners called in `commit()`.
     */
    update(dt: number): void {
        if (this._status !== 'PLAYING' || !this._runtime) return
        if (this._progress !== null) {
            this._follow(dt)
            return
        }

        if (this._delay > 0) {
            this._delay -= dt
            if (this._delay <= 0) {
                dt = -this._delay
                this._delay = 0
            } else {
                return
            }
        }

        this._advance(dt * this._speed)
    }

    /**
     * @private Internal clock commit callback. Writes the bound targets, then
     * notifies the listeners once with the frame's final state, unless the run
     * was replaced since the update.
     */
    commit(): void {
        if (!this._pending) return
        this._pending = false
        if (this._pendingRunId !== this._runId) return
        this._notify()
    }

    /** Driven run: the time is the sampled progress mapped onto the duration. */
    private _follow(dt: number): void {
        const p = this._sample
        if (!isFiniteNumber(p)) {
            this._reportBadProgress(badProgressError(p))
            this._moved = false
            this._advanced = true
            return
        }
        this._badProgress = false
        const time = clamp01(p) * this.duration
        this._lastDt = dt
        this._advanced = true
        if (time === this._masterTime) {
            this._moved = false
            return
        }
        this._moved = true
        this._masterTime = time
        this._runtime!.evaluate(time, dt)
        this._groupDirty = true
        this._snapshotDirty = true
        this._pending = true
        this._pendingRunId = this._runId
    }

    private _advance(dt: number): void {
        const runtime = this._runtime!
        const duration = this.duration
        let time = this._masterTime + dt
        let overshoot = 0
        if (time >= duration - END_TOLERANCE) {
            overshoot = time > duration ? time - duration : 0
            time = duration
        }
        this._masterTime = time

        runtime.evaluate(time, dt)
        this._lastDt = dt
        if (dt > 0) this._advanced = true
        this._groupDirty = true
        this._snapshotDirty = true
        this._pending = true
        this._pendingRunId = this._runId

        const reachedEnd = time >= duration - END_TOLERANCE
        if (reachedEnd || runtime.finished) {
            this._completeRun(reachedEnd ? overshoot : 0)
        }
    }

    /**
     * A run reached its end: start the next repeat (carrying the frame
     * overshoot over, so repeats do not drift) or finish exactly once.
     */
    private _completeRun(overshoot: number): void {
        const runtime = this._runtime!
        const duration = this.duration
        let carry = overshoot

        for (;;) {
            if (
                this._remainingRepeats !== Infinity &&
                this._remainingRepeats <= 0
            ) {
                this._status = 'ENDED'
                this._clock.unsubscribe(this)
                this._settle('ended')
                this._groupDirty = true
                this._snapshotDirty = true
                return
            }
            if (this._remainingRepeats !== Infinity) this._remainingRepeats -= 1

            runtime.reset()
            this._masterTime = 0
            this._advanced = false
            this._groupDirty = true
            this._snapshotDirty = true

            if (carry <= 0 || duration <= 0) return
            if (carry >= duration) {
                // the whole repeat elapsed within this single frame
                carry -= duration
                this._masterTime = duration
                runtime.evaluate(duration, 0)
                continue
            }
            this._masterTime = carry
            runtime.evaluate(carry, carry)
            return
        }
    }

    /** Validates `velocity` and aligns it with the `from` layout. */
    private _resolveVelocitySeed(
        velocity: unknown,
        keys: readonly string[] | null,
        count: number
    ): number[] | null {
        if (velocity === undefined || velocity === null) return null
        if (typeof velocity !== 'object') {
            throw createAniError(
                TypeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? '[Timeline] `velocity` must be an array or record shaped like `from`.'
                    : ''
            )
        }
        const seed = new Array<number>(count).fill(0)
        const source = velocity as Record<string, unknown>
        if (keys === null) {
            if (!Array.isArray(velocity)) {
                throw createAniError(
                    TypeError,
                    'ANI_INVALID_CONFIG',
                    __ANI_DEV__
                        ? '[Timeline] `velocity` must be an array when `from` is an array.'
                        : ''
                )
            }
        } else if (Array.isArray(velocity)) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? '[Timeline] `velocity` must be a record when `from` is a record.'
                    : ''
            )
        }
        for (let i = 0; i < count; i++) {
            const value = source[keys ? keys[i]! : i]
            if (value === undefined) continue
            if (!isFiniteNumber(value)) {
                throw createAniError(
                    TypeError,
                    'ANI_INVALID_CONFIG',
                    __ANI_DEV__
                        ? `[Timeline] \`velocity\` ${keys ? `"${keys[i]}"` : `[${i}]`} must be a finite number, received ${value}.`
                        : ''
                )
            }
            seed[i] = value
        }
        return seed
    }

    /**
     * Interrupt seed: current velocity re-expressed in the new `from` layout.
     */
    private _inheritVelocity(
        keys: readonly string[] | null,
        count: number
    ): number[] | null {
        if (this._status !== 'PLAYING') return null
        const current = this.velocity as
            | Record<string, number>
            | number[]
            | null
        if (current === null) return null
        if ((keys === null) !== Array.isArray(current)) return null
        const seed = new Array<number>(count).fill(0)
        for (let i = 0; i < count; i++) {
            const value = (current as Record<string | number, number>)[
                keys ? keys[i]! : i
            ]
            if (isFiniteNumber(value)) seed[i] = value
        }
        return seed
    }

    /** Validates `config` and builds its plan; touches no state. */
    private _prepare(config: RafTimelineConfig<G>) {
        const from = config.from as unknown
        if (typeof from !== 'object' || from === null) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? '[Timeline] `from` must be an array or a record of numbers.'
                    : ''
            )
        }
        const { keyMap, values } = resolveGroup(config.from)
        for (let i = 0; i < values.length; i++) {
            if (!isFiniteNumber(values[i])) {
                const name = keyMap ? [...keyMap.keys()][i] : `[${i}]`
                throw createAniError(
                    TypeError,
                    'ANI_INVALID_CONFIG',
                    __ANI_DEV__
                        ? `[Timeline] \`from\` ${keyMap ? `"${name}"` : name} must be a finite number, received ${values[i]}.`
                        : ''
                )
            }
        }
        const delay = config.delay ?? 0
        if (!Number.isFinite(delay) || delay < 0) {
            throw createAniError(
                RangeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? `[Timeline] \`delay\` must be a finite number >= 0 (seconds), received ${delay}.`
                    : ''
            )
        }

        const keys = keyMap ? [...keyMap.keys()] : null
        if (keys?.includes('__proto__')) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? '[Timeline] `__proto__` can not be used as an animated property name.'
                    : ''
            )
        }
        const { plan, duration } = this._buildExecutionPlan(
            config.keyframes,
            config.durations
        )
        const compiled = compilePlan(plan, keys, values.length)
        return { keys, values, delay, plan, duration, compiled }
    }

    /**
     * Plays animation.
     *
     * Malformed input (shape mismatches between `from` / segments / `timing`,
     * non-finite numbers, bad overrides) throws synchronously from here and
     * leaves the timeline untouched; nothing can throw later inside the clock.
     *
     * Playing over a `PLAYING` timeline interrupts it. Velocity carries over
     * (see `velocity`), so stateful springs retarget without a visible kink.
     *
     * The run ends at `duration`, or earlier once every value is held by
     * dynamic springs that have settled (segments with a non-physics timing,
     * and `delay()`, always run to their scheduled end).
     *
     * Throws a `TypeError` for more than one argument, or for a `context` /
     * `propertyResolver` in the config (removed), before anything changes.
     *
     * @param config {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame RequestAnimationFrame API} based config.
     * @returns Never rejects. Resolves once per run: `'ended'`, `'interrupted'`
     * (replaced by another `play()`), `'skipped'` (`interrupt: false`),
     * `'reset'` or `'disposed'`.
     */
    public play(
        config: RafTimelineConfig<G>,
        ...extra: unknown[]
    ): Promise<RunResult> {
        if (extra.length > 0) {
            throw createAniError(
                TypeError,
                'ANI_REMOVED_API',
                __ANI_DEV__
                    ? '[Timeline] `play()` takes one argument. Pass `interrupt` in the config: `play({ ...config, interrupt })`.'
                    : ''
            )
        }
        assertConfigKeys(config)
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Timeline] `play()` on a disposed timeline is a no-op.',
                    devKey(this, 'play')
                )
            }
            return Promise.resolve('disposed')
        }
        if (this._status === 'PLAYING' && !(config.interrupt ?? true)) {
            return Promise.resolve('skipped')
        }

        // ---- validate & prepare (no state is touched until this succeeds)
        const { keys, values, delay, plan, duration, compiled } =
            this._prepare(config)
        const policy = this._reducedMotion
        const reduced = policy !== 'ignore' && prefersReducedMotion(this._clock)
        const jump = reduced && policy === 'jump'
        const maxDuration =
            reduced && typeof policy === 'object'
                ? policy.maxDuration
                : Infinity
        // an endless run has no length to shorten: it plays unchanged
        const speed =
            Number.isFinite(duration) && duration > maxDuration
                ? duration / maxDuration
                : 1
        const seed =
            config.velocity === undefined
                ? this._inheritVelocity(keys, values.length)
                : this._resolveVelocitySeed(
                      config.velocity,
                      keys,
                      values.length
                  )
        // seeds are units per clock second, the runtime counts plan seconds
        if (seed !== null && speed !== 1) {
            for (let i = 0; i < seed.length; i++) seed[i] = seed[i]! / speed
        }
        const runtime = new PlanRuntime(compiled, values as number[], seed)

        // ---- commit
        this._settle('interrupted')
        this._progress = null
        let resolve!: (result: RunResult) => void
        const promise = new Promise<RunResult>((done) => {
            resolve = done
        })
        this._run = { promise, resolve }
        this._runId++
        this._currentConfig = config
        this._currentExecutionPlan = plan
        this._commitDuration(duration)
        this._remainingRepeats = normalizeRepeatCount(config.repeat)
        this._delay = delay
        this._keys = keys
        this._runtime = runtime
        this._lastDt = 0
        this._advanced = false
        this._masterTime = 0
        this._groupDirty = true
        this._snapshotDirty = true
        this._speed = speed
        if (jump) {
            this._jumpToEnd(duration)
            return promise
        }
        this._status = 'PLAYING'
        this._clock.subscribe(this)
        this._notify()
        return promise
    }

    /**
     * Links the time of the timeline to an external progress value (scroll,
     * a scrubbed gesture) instead of the clock.
     *
     * Starts a run from `config.from` and replaces the current one (a pending
     * `play()` resolves `'interrupted'`); `repeat`, `delay` and `velocity` are
     * ignored. `progress` is called once synchronously for the first value,
     * then once per frame in the clock's read phase. The time is
     * `clamp(progress(), 0, 1) * duration`; bound targets are written and
     * listeners notified only in frames where it changed. The status stays
     * `PLAYING` and the run never ends by itself. A non-finite progress keeps
     * the previous time and is reported once, asynchronously. Reduced motion
     * does not apply: the user controls the motion.
     *
     * `config` is validated like in `play()`; invalid input, or a `progress`
     * that is not a function, throws synchronously and changes nothing.
     * `play()`, `seek()`, `reset()` and `dispose()` also stop driving.
     * @returns Stop (idempotent): leaves the clock and pauses at the current
     * time; `resume()` then plays forward from there.
     */
    public drive(
        progress: () => number,
        config: RafTimelineConfig<G>
    ): () => void {
        assertConfigKeys(config)
        if (typeof progress !== 'function') {
            throw createAniError(
                TypeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? `[Timeline] \`progress\` must be a function, received ${typeof progress}.`
                    : ''
            )
        }
        const { keys, values, plan, duration, compiled } = this._prepare(config)
        if (!Number.isFinite(duration)) {
            throw createAniError(
                RangeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? '[Timeline] `drive` maps progress onto the duration, which is endless for a tree with `loop(child, Infinity)`.'
                    : ''
            )
        }
        // ignored by a driven run, but validated like in `play()`
        if (config.velocity !== undefined) {
            this._resolveVelocitySeed(config.velocity, keys, values.length)
        }
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Timeline] `drive()` on a disposed timeline is a no-op.',
                    devKey(this, 'drive')
                )
            }
            return () => undefined
        }
        // sampled before any state changes: a throwing source changes nothing
        let first = progress()
        const runtime = new PlanRuntime(compiled, values as number[], null)

        this._settle('interrupted')
        this._runId++
        this._currentConfig = config
        this._currentExecutionPlan = plan
        this._commitDuration(duration)
        this._remainingRepeats = 0
        this._delay = 0
        this._keys = keys
        this._runtime = runtime
        this._lastDt = 0
        this._advanced = false
        this._speed = 1
        this._moved = false
        this._badProgress = false
        if (!isFiniteNumber(first)) {
            this._reportBadProgress(badProgressError(first))
            first = 0
        }
        this._sample = first
        this._masterTime = clamp01(first) * duration
        runtime.evaluate(this._masterTime, 0)
        this._groupDirty = true
        this._snapshotDirty = true
        this._progress = progress
        const id = ++this._driveId
        this._status = 'PLAYING'
        this._clock.subscribe(this)
        this._notify()

        return () => {
            if (this._progress === null || this._driveId !== id) return
            this._progress = null
            if (this._status === 'PLAYING') {
                this._status = 'PAUSED'
                this._clock.unsubscribe(this)
            }
        }
    }

    /**
     * Reduced motion: the run completes at once in the end state of its last
     * repeat (an endless run ends after one), with a single `ENDED`
     * notification and no clock subscription.
     *
     * A run of endless duration never ends: every finite part completes and
     * each endless loop shows the end of its first iteration, then the
     * timeline holds that state `PAUSED`.
     */
    private _jumpToEnd(duration: number): void {
        this._clock.unsubscribe(this)
        this._remainingRepeats = 0
        if (!Number.isFinite(duration)) {
            const runtime = this._runtime!
            runtime.settle()
            this._masterTime = runtime.settledAt
            this._pending = false
            this._status = 'PAUSED'
            this._notify()
            return
        }
        this._masterTime = duration
        this._runtime!.evaluate(duration, 0)
        this._pending = false
        this._status = 'ENDED'
        // settle first, as a run ending on a frame does: a listener that
        // replays from the notification must not interrupt this run
        this._settle('ended')
        this._notify()
    }

    /**
     * Pauses a `PLAYING` timeline (no-op in any other status).
     */
    public pause(): void {
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Timeline] `pause()` on a disposed timeline is a no-op.',
                    devKey(this, 'pause')
                )
            }
            return
        }
        if (this._status !== 'PLAYING') return
        this._status = 'PAUSED'
        this._clock.unsubscribe(this)
    }

    /**
     * Resumes a `PAUSED` timeline (no-op in any other status).
     */
    public resume(): void {
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Timeline] `resume()` on a disposed timeline is a no-op.',
                    devKey(this, 'resume')
                )
            }
            return
        }
        if (this._status !== 'PAUSED' || !this._runtime) {
            return
        }
        this._status = 'PLAYING'
        this._clock.subscribe(this)
    }

    /**
     * Back to `IDLE`: stops the run, clears the value and drops `durations`
     * overrides (`duration` returns to the node's own). Throws a `TypeError`
     * when given an argument.
     */
    public reset(...extra: unknown[]): void {
        if (extra.length > 0) {
            throw createAniError(
                TypeError,
                'ANI_REMOVED_API',
                __ANI_DEV__
                    ? '[Timeline] `reset()` takes no arguments. To drop the subscribers too, use `dispose()`.'
                    : ''
            )
        }
        this._reset(true)
    }

    private _reset(notify: boolean): void {
        this._settle(this._disposed ? 'disposed' : 'reset')
        this._progress = null
        this._runId++
        this._epoch++
        this._status = 'IDLE'
        this._currentConfig = null
        this._masterTime = 0
        this._delay = 0
        this._runtime = null
        this._keys = null
        this._currentExecutionPlan = null
        this._restoreDuration()
        this._lastDt = 0
        this._advanced = false
        this._cachedGroup = null
        this._groupDirty = true
        this._snapshotDirty = true
        this._clock.unsubscribe(this)
        this._remainingRepeats = 0
        if (notify) this._notify()
    }

    /**
     * Stops the timeline for good: leaves the clock, drops every `onUpdate`
     * callback and turns `play()` / `resume()` into no-ops. Idempotent.
     */
    public dispose(): void {
        if (this._disposed) return
        this._disposed = true
        this._reset(false)
        this._onUpdateCallbacks.clear()
        this._bindings.clear()
    }

    /**
     * Jumps to `targetTime` (seconds, clamped to `[0, duration]`).
     *
     * Seeking is a time-domain override: a `PLAYING` or `ENDED` timeline
     * becomes `PAUSED` at the new time (call `resume()` to continue from
     * there), any pending start `delay` is dropped, and subscribers are
     * notified once. Physics timings are re-simulated from their segment start,
     * so the result is deterministic. No-op before the first `play()`.
     */
    public seek(targetTime: number): void {
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Timeline] `seek()` on a disposed timeline is a no-op.',
                    devKey(this, 'seek')
                )
            }
            return
        }
        const runtime = this._runtime
        if (!runtime) return
        if (typeof targetTime !== 'number' || Number.isNaN(targetTime)) {
            throw createAniError(
                RangeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? `[Timeline] seek time must be a number, received ${targetTime}.`
                    : ''
            )
        }
        if (targetTime === Infinity && !Number.isFinite(this.duration)) {
            throw createAniError(
                RangeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? '[Timeline] seek time must be finite: an endless timeline has no end to seek to.'
                    : ''
            )
        }
        if (this._status === 'PLAYING' || this._status === 'ENDED') {
            this._status = 'PAUSED'
            this._clock.unsubscribe(this)
        }
        this._progress = null
        this._runId++
        this._epoch++
        const seekTime = Math.max(0, Math.min(targetTime, this.duration))
        this._delay = 0
        this._masterTime = seekTime
        runtime.evaluate(seekTime, 0)
        this._advanced = false
        this._groupDirty = true
        this._snapshotDirty = true
        this._notify()
    }

    /**
     * Writes the timeline's value to `target.style` on every notification.
     *
     * Only declarations whose written value changed since this binding's
     * previous write are written. A timeline that already has a value writes
     * it immediately; otherwise the first write happens at the next
     * notification. Bound targets are written before the `onUpdate` listeners
     * of the same notification run. Positional (array) values cannot be
     * styled: the first write reports a `TypeError` asynchronously and drops
     * the binding. A failing write never affects other bindings.
     * @param target Element, or any object with a `style`.
     * @returns Unbind (idempotent; written styles are kept).
     */
    public bind(
        target: { style: CSSStyleDeclaration } | HTMLElement,
        options?: BindOptions
    ): () => void {
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Timeline] `bind()` on a disposed timeline is a no-op.',
                    devKey(this, 'bind')
                )
            }
            return () => undefined
        }
        const binding: Binding = {
            writer: createStyleWriter(target),
            resolver: options?.resolver,
        }
        this._bindings.add(binding)
        const runtime = this._runtime
        if (runtime && runtime.values.length > 0) {
            this._writeBinding(binding, this._group())
            this._defaultSheet = null
            this._customSheets = null
        }
        return () => {
            this._bindings.delete(binding)
        }
    }

    /**
     * When timeline updates, subscribes on update callback.
     *
     * Called once per frame, in the commit phase (after bound styles are
     * written), and synchronously by `play()`, `seek()` and `reset()`. Every
     * callback of one notification receives the same `state` object. A
     * throwing callback does not affect the others nor the timeline; its
     * error is rethrown asynchronously.
     * @param callback Subscription callback.
     * @returns Unsubscribe.
     */
    public onUpdate(callback: OnUpdateCallback<G>): () => void {
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Timeline] `onUpdate()` on a disposed timeline is a no-op.',
                    devKey(this, 'onUpdate')
                )
            }
            return () => undefined
        }
        this._onUpdateCallbacks.add(callback)
        return () => {
            this._onUpdateCallbacks.delete(callback)
        }
    }
}

/**
 * Create dynamic timeline. {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame RequestAnimationFrame API} based.
 * @param rootNode Root animation node.
 * @param options Clock and reduced-motion policy. A clock in place of the options throws a `TypeError`: pass `{ clock }`.
 */
export function rafTimeline<G extends Groupable>(
    rootNode: AnimationNode<G>,
    options?: RafTimelineOptions
): RafTimeline<G> {
    return new RafAniTimeline<G>(rootNode, options)
}
