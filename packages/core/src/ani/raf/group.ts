import type { AniGroup, Groupable, RunResult } from '~/ani/core'
import {
    normalizeRepeatCount,
    prefersReducedMotion,
    type ReducedMotionPolicy,
    resolveReducedMotionPolicy,
    TimelineBase,
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
import type { TimelineStatus } from './timeline'

declare const __ANI_DEV__: boolean

export interface RafGroupOptions {
    /**
     * Clock the group subscribes to. Defaults to the shared clock.
     */
    clock?: AnimationClockInterface
    /**
     * Start offset of target `i` in seconds: a constant step (`i * stagger`) or
     * a function of the target index and the target count. Default `0`.
     */
    stagger?: number | ((index: number, count: number) => number)
    /**
     * What a `play()` does while the clock reports `reducedMotion`. The
     * preference is read once at the start of each `play()`.
     * @default 'jump'
     */
    reducedMotion?: ReducedMotionPolicy
}

export interface RafGroupPlayConfig<G extends Groupable> {
    /**
     * Starting value of every target, or a function of the target index.
     */
    from: G | ((index: number) => G)
    /**
     * Number of targets. Defaults to the length of live array bindings
     * (`bind(targets)`); `bindAt` bindings never set the count. Pass `count`
     * when you bind with `bindAt`. Required (a positive integer) when no array
     * of targets is bound.
     */
    count?: number
    /**
     * Dynamic target overrides, one per segment node as written in the tree
     * (the child of a loop counts once).
     */
    keyframes?: Array<G | 'keep'>
    /**
     * Dynamic duration overrides, one per segment node as written in the tree
     * (the child of a loop counts once).
     */
    durations?: Array<number | 'keep'>
    /**
     * Additional runs of the whole group (offsets included).
     */
    repeat?: number
    /**
     * Delay before the run starts, in seconds.
     */
    delay?: number
    /**
     * Initial velocity per value, in units per second. Seeds every target.
     * Without it, a target inherits its own current velocity when it
     * interrupts a `PLAYING` run.
     */
    velocity?: Partial<G>
}

export interface RafGroupBindOptions {
    /**
     * Maps animated values to style declarations.
     */
    resolver?: Resolver<Record<string, number>>
}

export interface RafGroupFrame<G extends Groupable> {
    /**
     * One frozen state per target. Shared (same array) by every listener of
     * one notification: treat it as read-only.
     */
    states: ReadonlyArray<Readonly<AniGroup<G>>>
    status: TimelineStatus
}

export interface RafGroup<G extends Groupable> {
    /** Lifecycle status; `PLAYING` until the last target finished. */
    readonly status: TimelineStatus
    /** Plan duration plus the largest offset, in seconds (one run). */
    readonly duration: number
    /** Targets of the current run, `0` before `play()`. */
    readonly count: number
    /**
     * Starts a run, interrupting the current one. Invalid input throws
     * synchronously and leaves the group untouched.
     */
    play(config: RafGroupPlayConfig<G>): Promise<RunResult>
    /** Pauses a `PLAYING` group. */
    pause(): void
    /** Resumes a `PAUSED` group. */
    resume(): void
    /** Jumps to a group time (clamped to `[0, duration]`), pauses and notifies once. */
    seek(time: number): void
    /** Back to `IDLE`: stops the run and clears every value. */
    reset(): void
    /** Stops the group for good: leaves the clock and drops bindings and listeners. */
    dispose(): void
    /** Frozen snapshot of one target, `null` out of range or before `play()`. */
    valueAt(index: number): Readonly<AniGroup<G>> | null
    /**
     * Writes element `i` of `targets` with target `i`, changed declarations
     * only. Returns an unbind function (idempotent, written styles are kept).
     */
    bind(
        targets: ArrayLike<{ style: CSSStyleDeclaration }>,
        options?: RafGroupBindOptions
    ): () => void
    /**
     * Writes `target` with the value of target `index`, changed declarations
     * only. Returns an unbind function (idempotent, written styles are kept).
     */
    bindAt(
        index: number,
        target: { style: CSSStyleDeclaration } | HTMLElement,
        options?: RafGroupBindOptions
    ): () => void
    /**
     * Subscribes to updates: once per frame in the commit phase (after the
     * bound styles are written) and synchronously on `play`, `seek`, `reset`.
     * @returns Unsubscribe.
     */
    onUpdate(listener: (frame: RafGroupFrame<G>) => void): () => void
}

type Listener<G extends Groupable> = (frame: RafGroupFrame<G>) => void
type Sheet = Record<string, unknown>
type StyleResolver = Resolver<Record<string, number>>

interface Binding {
    readonly writers: readonly StyleWriter[]
    readonly resolver: StyleResolver | undefined
    /** `bindAt`: the only position of `writers` that is set; `null` for `bind`. */
    readonly index: number | null
}

interface SheetCache {
    readonly sheets: Array<Sheet | undefined>
    // `rev` of the runtime a sheet was built from
    readonly stamps: Int32Array
}

interface SeedInfo {
    readonly seed: number[] | null
    readonly key: string
}

const NO_SEED: SeedInfo = { seed: null, key: '' }

/**
 * One run: the distinct `PlanRuntime`s and the targets that share them.
 * Targets of one runtime are listed in index order in `members`.
 */
interface Run {
    readonly count: number
    readonly keys: readonly string[] | null
    readonly laneCount: number
    readonly planDuration: number
    /** One run, offsets included. */
    readonly duration: number
    readonly runtimes: readonly PlanRuntime[]
    readonly offsets: Float64Array
    readonly runtimeOf: Int32Array
    readonly members: Int32Array
    readonly memberStart: Int32Array
    readonly done: Uint8Array
    /** Frame delta of the last evaluation of each runtime (0: none). */
    readonly lastDt: Float64Array
    /** Bumped whenever a runtime is evaluated. */
    readonly rev: Int32Array
    readonly snapshots: Array<Readonly<Groupable> | null>
    readonly caches: Map<StyleResolver | undefined, SheetCache>
    readonly scratch: Record<string, number>
    /** Runtimes that changed since the last notification. */
    readonly changed: number[]
    readonly dirty: Uint8Array
    doneCount: number
}

interface Prepared {
    readonly run: Run
    readonly delay: number
    readonly repeat: number
    readonly speed: number
}

/** Times one listener may be on the stack: its call plus one nested notification. */
const MAX_REENTRY = 2
/** Largest array index: `bindAt` keeps its writer at that position of a sparse array. */
const MAX_INDEX = 2 ** 32 - 2

function reportAsync(error: unknown): void {
    queueMicrotask(() => {
        throw error
    })
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function checkOffset(offset: unknown, index: number): number {
    if (!isFiniteNumber(offset) || offset < 0) {
        throw createAniError(
            RangeError,
            'ANI_INVALID_CONFIG',
            __ANI_DEV__
                ? `[Group] \`stagger\` must be a finite number >= 0 (seconds), received ${offset} for target ${index}.`
                : ''
        )
    }
    return offset
}

/**
 * Reads one target's `from` in the layout of the first one (`keys`, or an
 * array of `laneCount` values), validating shape and finiteness.
 */
function readFrom(
    from: unknown,
    keys: readonly string[] | null,
    laneCount: number,
    index: number
): number[] {
    if (typeof from !== 'object' || from === null) {
        throw createAniError(
            TypeError,
            'ANI_INVALID_CONFIG',
            __ANI_DEV__
                ? `[Group] \`from\` must be an array or a record of numbers (target ${index}).`
                : ''
        )
    }
    const values = new Array<number>(laneCount)
    if (keys === null) {
        if (!Array.isArray(from) || from.length !== laneCount) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? `[Group] \`from\` of target ${index} must be an array of ${laneCount} numbers like the first target.`
                    : ''
            )
        }
        for (let i = 0; i < laneCount; i++) {
            const value = from[i]
            if (!isFiniteNumber(value)) {
                throw createAniError(
                    TypeError,
                    'ANI_INVALID_CONFIG',
                    __ANI_DEV__
                        ? `[Group] \`from\` [${i}] must be a finite number, received ${value} (target ${index}).`
                        : ''
                )
            }
            values[i] = value
        }
        return values
    }
    const record = from as Record<string, unknown>
    if (Array.isArray(from) || Object.keys(record).length !== laneCount) {
        throw createAniError(
            TypeError,
            'ANI_INVALID_CONFIG',
            __ANI_DEV__
                ? `[Group] \`from\` of target ${index} must be a record with the keys of the first target.`
                : ''
        )
    }
    for (let i = 0; i < laneCount; i++) {
        const value = Object.hasOwn(record, keys[i]!)
            ? record[keys[i]!]
            : undefined
        if (!isFiniteNumber(value)) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? `[Group] \`from\` "${keys[i]}" must be a finite number, received ${value} (target ${index}).`
                    : ''
            )
        }
        values[i] = value
    }
    return values
}

/** Validates `velocity` and aligns it with the `from` layout. */
function resolveVelocitySeed(
    velocity: unknown,
    keys: readonly string[] | null,
    count: number
): SeedInfo {
    if (velocity === null || typeof velocity !== 'object') {
        throw createAniError(
            TypeError,
            'ANI_INVALID_CONFIG',
            __ANI_DEV__
                ? '[Group] `velocity` must be an array or record shaped like `from`.'
                : ''
        )
    }
    if (keys === null && !Array.isArray(velocity)) {
        throw createAniError(
            TypeError,
            'ANI_INVALID_CONFIG',
            __ANI_DEV__
                ? '[Group] `velocity` must be an array when `from` is an array.'
                : ''
        )
    }
    if (keys !== null && Array.isArray(velocity)) {
        throw createAniError(
            TypeError,
            'ANI_INVALID_CONFIG',
            __ANI_DEV__
                ? '[Group] `velocity` must be a record when `from` is a record.'
                : ''
        )
    }
    const source = velocity as Record<string, unknown>
    const seed = new Array<number>(count).fill(0)
    for (let i = 0; i < count; i++) {
        const value = source[keys ? keys[i]! : i]
        if (value === undefined) continue
        if (!isFiniteNumber(value)) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? `[Group] \`velocity\` ${keys ? `"${keys[i]}"` : `[${i}]`} must be a finite number, received ${value}.`
                    : ''
            )
        }
        seed[i] = value
    }
    return { seed, key: seed.join(',') }
}

class RafAniGroup<G extends Groupable>
    extends TimelineBase<G>
    implements RafGroup<G>, Animatable
{
    private readonly _clock: AnimationClockInterface
    private readonly _reducedMotion: ReducedMotionPolicy
    private readonly _stagger:
        | number
        | ((index: number, count: number) => number)
    private readonly _planDuration: number
    private _speed = 1

    private _status: TimelineStatus = 'IDLE'
    private _disposed = false
    private _run: Run | null = null
    private _groupTime = 0
    private _delay = 0
    private _remainingRepeats = 0
    private _advanced = false
    private _resolve: ((result: RunResult) => void) | null = null
    /** Bumped on every play/reset/seek: a pending commit belongs to one run. */
    private _runId = 0
    /**
     * Bumped on play/reset/seek: the frame being notified is stale, so the
     * remaining listeners skip it.
     */
    private _epoch = 0
    // update() produced a change that commit() has not published yet
    private _pending = false
    private _pendingRunId = 0

    private readonly _listeners = new Set<Listener<G>>()
    private readonly _bindings = new Set<Binding>()
    // how often a listener is on the stack; bounds re-entrant notifications
    private readonly _running = new Map<Listener<G>, number>()

    constructor(rootNode: AnimationNode<G>, options: RafGroupOptions = {}) {
        super(rootNode)
        const stagger = options.stagger ?? 0
        if (typeof stagger !== 'function') checkOffset(stagger, 0)
        this._stagger = stagger
        this._clock = options.clock ?? defaultClock
        this._reducedMotion = resolveReducedMotionPolicy(options.reducedMotion)
        this._planDuration = this._buildExecutionPlan().duration

        this.play = this.play.bind(this)
        this.pause = this.pause.bind(this)
        this.resume = this.resume.bind(this)
        this.seek = this.seek.bind(this)
        this.reset = this.reset.bind(this)
        this.dispose = this.dispose.bind(this)
        this.valueAt = this.valueAt.bind(this)
        this.bind = this.bind.bind(this)
        this.bindAt = this.bindAt.bind(this)
        this.onUpdate = this.onUpdate.bind(this)
    }

    public get status(): TimelineStatus {
        return this._status
    }

    public override get duration(): number {
        return this._run ? this._run.duration : this._planDuration
    }

    public get count(): number {
        return this._run ? this._run.count : 0
    }

    // ---- run preparation (no state is touched)

    private _boundCount(): number {
        let count = 0
        for (const binding of this._bindings) {
            if (binding.index !== null) continue
            if (binding.writers.length > count) count = binding.writers.length
        }
        return count
    }

    private _resolveCount(requested: number | undefined): number {
        if (requested !== undefined) {
            if (!Number.isInteger(requested) || requested <= 0) {
                throw createAniError(
                    RangeError,
                    'ANI_INVALID_CONFIG',
                    __ANI_DEV__
                        ? `[Group] \`count\` must be a positive integer, received ${requested}.`
                        : ''
                )
            }
            return requested
        }
        const bound = this._boundCount()
        if (bound === 0) {
            throw createAniError(
                RangeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? '[Group] `count` is required when no array of targets is bound; `bindAt` bindings do not set the count.'
                    : ''
            )
        }
        return bound
    }

    private _resolveOffsets(count: number): Float64Array {
        const offsets = new Float64Array(count)
        const stagger = this._stagger
        if (typeof stagger === 'number') {
            for (let i = 0; i < count; i++) offsets[i] = i * stagger
        } else {
            for (let i = 0; i < count; i++) {
                offsets[i] = checkOffset(stagger(i, count), i)
            }
        }
        return offsets
    }

    /** Current velocity of every lane of one runtime of `run` (0 when idle). */
    private _runtimeVelocity(run: Run, index: number): number[] {
        const runtime = run.runtimes[index]!
        const out = new Array<number>(run.laneCount).fill(0)
        const dt = run.lastDt[index]!
        if (run.done[index] || dt <= 0) return out
        for (let k = 0; k < run.laneCount; k++) {
            const v = runtime.velocities[k]!
            const perPlanSecond = Number.isNaN(v)
                ? (runtime.values[k]! - runtime.previous[k]!) / dt
                : v
            out[k] = perPlanSecond * this._speed
        }
        return out
    }

    /**
     * Interrupt seeds: each target's current velocity re-expressed in the new
     * `from` layout. `null` when there is nothing to inherit.
     */
    private _inheritor(
        keys: readonly string[] | null,
        laneCount: number
    ): ((index: number) => SeedInfo) | null {
        const old = this._run
        if (!old || this._status !== 'PLAYING' || !this._advanced) return null
        if ((keys === null) !== (old.keys === null)) return null
        const oldLane = old.keys
            ? new Map(old.keys.map((key, i) => [key, i]))
            : null
        const cache = new Array<SeedInfo | undefined>(old.runtimes.length)
        return (index) => {
            if (index >= old.count) return NO_SEED
            const r = old.runtimeOf[index]!
            let info = cache[r]
            if (info === undefined) {
                const velocity = this._runtimeVelocity(old, r)
                const seed = new Array<number>(laneCount).fill(0)
                let moving = false
                for (let k = 0; k < laneCount; k++) {
                    const lane = oldLane ? oldLane.get(keys![k]!) : k
                    const v = lane === undefined ? undefined : velocity[lane]
                    if (isFiniteNumber(v) && v !== 0) {
                        seed[k] = v
                        moving = true
                    }
                }
                info = moving ? { seed, key: seed.join(',') } : NO_SEED
                cache[r] = info
            }
            return info
        }
    }

    private _prepare(
        config: RafGroupPlayConfig<G>,
        maxDuration: number
    ): Prepared {
        if (typeof config !== 'object' || config === null) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__ ? '[Group] `play()` needs a config object.' : ''
            )
        }
        const count = this._resolveCount(config.count)
        const delay = config.delay ?? 0
        if (!Number.isFinite(delay) || delay < 0) {
            throw createAniError(
                RangeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? `[Group] \`delay\` must be a finite number >= 0 (seconds), received ${delay}.`
                    : ''
            )
        }
        const offsets = this._resolveOffsets(count)

        const source = config.from as unknown
        const fromOf =
            typeof source === 'function'
                ? (source as (index: number) => G)
                : null
        const first = fromOf ? fromOf(0) : source
        if (typeof first !== 'object' || first === null) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? '[Group] `from` must be an array or a record of numbers (or a function returning one).'
                    : ''
            )
        }
        const { keyMap, values: firstValues } = resolveGroup(first as Groupable)
        const keys = keyMap ? [...keyMap.keys()] : null
        if (keys?.includes('__proto__')) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? '[Group] `__proto__` can not be used as an animated property name.'
                    : ''
            )
        }
        const laneCount = firstValues.length
        const firstRead = readFrom(first, keys, laneCount, 0)

        const { plan, duration: planDuration } = this._buildExecutionPlan(
            config.keyframes,
            config.durations
        )
        const compiled = compilePlan(plan, keys, laneCount)
        const fixed =
            config.velocity === undefined
                ? null
                : resolveVelocitySeed(config.velocity, keys, laneCount)
        const inherit = fixed ? null : this._inheritor(keys, laneCount)

        let maxOffset = 0
        for (let i = 0; i < count; i++) {
            if (offsets[i]! > maxOffset) maxOffset = offsets[i]!
        }
        const duration = planDuration + maxOffset
        const speed =
            Number.isFinite(duration) && duration > maxDuration
                ? duration / maxDuration
                : 1

        // distinct (offset, from, seed) triples share one runtime
        const runtimeIndex = new Map<string, number>()
        const runtimes: PlanRuntime[] = []
        const runtimeOffsets: number[] = []
        const runtimeOf = new Int32Array(count)
        for (let i = 0; i < count; i++) {
            const values =
                i === 0 || !fromOf
                    ? firstRead
                    : readFrom(fromOf(i), keys, laneCount, i)
            const info = fixed ?? inherit?.(i) ?? NO_SEED
            let seed = info.seed
            if (seed !== null && speed !== 1) {
                seed = seed.map((v) => v / speed)
            }
            const seedKey = seed ? seed.join(',') : ''
            const id = `${offsets[i]}|${fromOf ? values.join(',') : ''}|${seedKey}`
            let r = runtimeIndex.get(id)
            if (r === undefined) {
                r = runtimes.length
                runtimeIndex.set(id, r)
                runtimes.push(new PlanRuntime(compiled, values, seed))
                runtimeOffsets.push(offsets[i]!)
            }
            runtimeOf[i] = r
        }

        const total = runtimes.length
        const memberStart = new Int32Array(total + 1)
        for (let i = 0; i < count; i++) memberStart[runtimeOf[i]! + 1]!++
        for (let r = 0; r < total; r++) memberStart[r + 1]! += memberStart[r]!
        const members = new Int32Array(count)
        const fill = memberStart.slice(0, total)
        for (let i = 0; i < count; i++) members[fill[runtimeOf[i]!]!++] = i

        const run: Run = {
            count,
            keys,
            laneCount,
            planDuration,
            duration,
            runtimes,
            offsets: Float64Array.from(runtimeOffsets),
            runtimeOf,
            members,
            memberStart,
            done: new Uint8Array(total),
            lastDt: new Float64Array(total),
            rev: new Int32Array(total),
            snapshots: new Array<Readonly<Groupable> | null>(total).fill(null),
            caches: new Map(),
            scratch: {},
            changed: [],
            dirty: new Uint8Array(total),
            doneCount: 0,
        }
        return {
            run,
            delay,
            repeat: normalizeRepeatCount(config.repeat),
            speed,
        }
    }

    // ---- evaluation

    private _touch(run: Run, runtime: number): void {
        run.rev[runtime]!++
        run.snapshots[runtime] = null
        if (run.dirty[runtime]) return
        run.dirty[runtime] = 1
        run.changed.push(runtime)
    }

    /**
     * Evaluates the runtimes at group `time`. Incremental (a frame): targets
     * that have not started or are done are skipped. `full` (seek, wrapped
     * repeats): every runtime is evaluated or reset.
     */
    private _evaluate(run: Run, time: number, dt: number, full: boolean): void {
        const { runtimes, offsets, done, planDuration } = run
        let doneCount = full ? 0 : run.doneCount
        for (let r = 0; r < runtimes.length; r++) {
            if (!full && done[r]) continue
            const runtime = runtimes[r]!
            let local = time - offsets[r]!
            if (local < 0) {
                if (full) {
                    runtime.reset()
                    done[r] = 0
                    run.lastDt[r] = 0
                    this._touch(run, r)
                }
                continue
            }
            const atEnd = local >= planDuration - END_TOLERANCE
            if (atEnd) local = planDuration
            const step = dt < local ? dt : local
            runtime.evaluate(local, step)
            run.lastDt[r] = step
            this._touch(run, r)
            if (atEnd || runtime.finished) {
                done[r] = 1
                doneCount++
            } else {
                done[r] = 0
            }
        }
        run.doneCount = doneCount
    }

    /** Back to group time zero: every target shows its `from` again. */
    private _restart(run: Run): void {
        for (let r = 0; r < run.runtimes.length; r++) {
            run.runtimes[r]!.reset()
            run.done[r] = 0
            run.lastDt[r] = 0
            this._touch(run, r)
        }
        run.doneCount = 0
        this._groupTime = 0
        this._advanced = false
    }

    /**
     * @private Internal clock subscription callback. Computes only: bound
     * targets are written and listeners called in `commit()`.
     */
    update(dt: number): void {
        const run = this._run
        if (this._status !== 'PLAYING' || !run) return

        if (this._delay > 0) {
            this._delay -= dt
            if (this._delay <= 0) {
                dt = -this._delay
                this._delay = 0
            } else {
                return
            }
        }

        this._advance(run, dt * this._speed)
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

    private _advance(run: Run, dt: number): void {
        const duration = run.duration
        let time = this._groupTime + dt
        let overshoot = 0
        if (time >= duration - END_TOLERANCE) {
            overshoot = time > duration ? time - duration : 0
            time = duration
        }
        this._groupTime = time

        this._evaluate(run, time, dt, false)
        if (dt > 0) this._advanced = true
        this._pending = true
        this._pendingRunId = this._runId

        const reachedEnd = time >= duration - END_TOLERANCE
        if (reachedEnd || run.doneCount === run.runtimes.length) {
            this._completeRun(run, reachedEnd ? overshoot : 0)
        }
    }

    /**
     * A run reached its end: start the next repeat (carrying the frame
     * overshoot over, so repeats do not drift) or finish exactly once.
     */
    private _completeRun(run: Run, overshoot: number): void {
        const duration = run.duration
        let carry = overshoot

        for (;;) {
            if (
                this._remainingRepeats !== Infinity &&
                this._remainingRepeats <= 0
            ) {
                this._status = 'ENDED'
                this._clock.unsubscribe(this)
                this._settle('ended')
                return
            }
            if (this._remainingRepeats !== Infinity) this._remainingRepeats -= 1

            this._restart(run)

            if (carry <= 0 || duration <= 0) return
            if (carry >= duration) {
                // the whole repeat elapsed within this single frame
                carry -= duration
                this._groupTime = duration
                this._evaluate(run, duration, 0, true)
                continue
            }
            this._groupTime = carry
            this._evaluate(run, carry, carry, false)
            return
        }
    }

    private _settle(result: RunResult): void {
        const resolve = this._resolve
        if (!resolve) return
        this._resolve = null
        resolve(result)
    }

    // ---- values, styles, listeners

    private _snapshot(run: Run, runtime: number): Readonly<Groupable> {
        let snapshot = run.snapshots[runtime]
        if (snapshot === null || snapshot === undefined) {
            const values = run.runtimes[runtime]!.values
            const keys = run.keys
            if (keys === null) {
                snapshot = Object.freeze(values.slice())
            } else {
                const group: Record<string, number> = {}
                for (let i = 0; i < keys.length; i++) {
                    group[keys[i]!] = values[i]!
                }
                snapshot = Object.freeze(group)
            }
            run.snapshots[runtime] = snapshot
        }
        return snapshot
    }

    private _sheet(
        run: Run,
        resolver: StyleResolver | undefined,
        runtime: number
    ): Sheet | undefined {
        let cache = run.caches.get(resolver)
        if (cache === undefined) {
            cache = {
                sheets: new Array<Sheet | undefined>(run.runtimes.length),
                stamps: new Int32Array(run.runtimes.length).fill(-1),
            }
            run.caches.set(resolver, cache)
        }
        const rev = run.rev[runtime]!
        if (cache.stamps[runtime] === rev) return cache.sheets[runtime]
        const keys = run.keys!
        const values = run.runtimes[runtime]!.values
        const scratch = run.scratch
        for (let i = 0; i < keys.length; i++) scratch[keys[i]!] = values[i]!
        let sheet: Sheet | undefined
        try {
            sheet = createStyleSheet(scratch, resolver)
        } catch (error) {
            reportAsync(error)
        }
        cache.sheets[runtime] = sheet
        cache.stamps[runtime] = rev
        return sheet
    }

    private _dropArrayBinding(binding: Binding): void {
        this._bindings.delete(binding)
        reportAsync(
            createAniError(
                TypeError,
                'ANI_INVALID_OPTIONS',
                __ANI_DEV__
                    ? '[Group] `bind()` can only style record values; positional (array) values have no style property.'
                    : ''
            )
        )
    }

    private _writeOne(writer: StyleWriter, sheet: Sheet): void {
        try {
            writer.write(sheet)
        } catch (error) {
            reportAsync(error)
        }
    }

    /** Writes the targets of every runtime that changed since the last notification. */
    private _writeChanged(run: Run): void {
        if (run.keys === null) {
            for (const binding of this._bindings) {
                this._dropArrayBinding(binding)
            }
            return
        }

        const { changed, members, memberStart } = run

        for (const binding of this._bindings) {
            const { writers, resolver, index } = binding
            if (index !== null) {
                if (index >= run.count) continue
                const r = run.runtimeOf[index]!
                if (!run.dirty[r]) continue
                const sheet = this._sheet(run, resolver, r)
                if (sheet !== undefined) this._writeOne(writers[index]!, sheet)
                continue
            }
            for (let c = 0; c < changed.length; c++) {
                const r = changed[c]!
                const start = memberStart[r]!
                if (members[start]! >= writers.length) continue
                const sheet = this._sheet(run, resolver, r)
                if (sheet === undefined) continue
                for (let m = start; m < memberStart[r + 1]!; m++) {
                    const target = members[m]!
                    if (target >= writers.length) break
                    this._writeOne(writers[target]!, sheet)
                }
            }
        }
    }

    private _writeAll(run: Run, binding: Binding): void {
        if (run.keys === null) {
            this._dropArrayBinding(binding)
            return
        }
        const length = Math.min(binding.writers.length, run.count)
        for (let i = binding.index ?? 0; i < length; i++) {
            const sheet = this._sheet(run, binding.resolver, run.runtimeOf[i]!)
            if (sheet !== undefined) this._writeOne(binding.writers[i]!, sheet)
        }
    }

    private _states(run: Run | null): Array<Readonly<AniGroup<G>>> {
        if (!run) return []
        const states = new Array<Readonly<AniGroup<G>>>(run.count)
        for (let i = 0; i < run.count; i++) {
            states[i] = this._snapshot(run, run.runtimeOf[i]!) as Readonly<
                AniGroup<G>
            >
        }
        return states
    }

    /** Writes the bound targets, then calls the listeners. */
    private _notify(): void {
        const run = this._run
        if (run) {
            if (this._bindings.size > 0) this._writeChanged(run)
            for (let c = 0; c < run.changed.length; c++) {
                run.dirty[run.changed[c]!] = 0
            }
            run.changed.length = 0
        }
        const listeners = this._listeners
        if (listeners.size === 0) return
        const epoch = this._epoch
        const frame: RafGroupFrame<G> = {
            states: this._states(run),
            status: this._status,
        }
        for (const listener of listeners) {
            // a listener played / reset / sought this group: the frame is stale
            if (epoch !== this._epoch) return
            // a listener that calls play() / seek() / reset() sees the nested
            // notification once; deeper re-entry would never terminate
            const depth = this._running.get(listener) ?? 0
            if (depth >= MAX_REENTRY) continue
            this._running.set(listener, depth + 1)
            try {
                listener(frame)
            } catch (error) {
                reportAsync(error)
            } finally {
                if (depth === 0) this._running.delete(listener)
                else this._running.set(listener, depth)
            }
        }
    }

    // ---- public API

    /**
     * Plays the group. Malformed input throws synchronously from here and
     * leaves the group untouched. Resolves once per run: `'ended'` after the
     * last target finished (after repeats), `'interrupted'` when another
     * `play()` replaces the run, `'reset'` or `'disposed'`.
     */
    public play(config: RafGroupPlayConfig<G>): Promise<RunResult> {
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Group] `play()` on a disposed group is a no-op.',
                    devKey(this, 'play')
                )
            }
            return Promise.resolve('disposed')
        }

        // ---- validate & prepare (no state is touched until this succeeds)
        const policy = this._reducedMotion
        const reduced = policy !== 'ignore' && prefersReducedMotion(this._clock)
        const jump = reduced && policy === 'jump'
        const maxDuration =
            reduced && typeof policy === 'object'
                ? policy.maxDuration
                : Infinity
        const { run, delay, repeat, speed } = this._prepare(config, maxDuration)

        // ---- commit
        this._settle('interrupted')
        const promise = new Promise<RunResult>((resolve) => {
            this._resolve = resolve
        })
        this._runId++
        this._epoch++
        this._run = run
        this._remainingRepeats = repeat
        this._delay = delay
        this._groupTime = 0
        this._advanced = false
        this._pending = false
        this._speed = speed
        if (jump) {
            this._jumpToEnd(run)
            return promise
        }
        this._status = 'PLAYING'
        for (let r = 0; r < run.runtimes.length; r++) this._touch(run, r)
        this._clock.subscribe(this)
        this._notify()
        return promise
    }

    private _jumpToEnd(run: Run): void {
        this._clock.unsubscribe(this)
        this._remainingRepeats = 0
        if (!Number.isFinite(run.duration)) {
            let maxSettled = 0
            for (let r = 0; r < run.runtimes.length; r++) {
                const rt = run.runtimes[r]!
                rt.settle()
                if (rt.settledAt > maxSettled) maxSettled = rt.settledAt
                this._touch(run, r)
            }
            this._groupTime = maxSettled
            this._pending = false
            this._status = 'PAUSED'
            this._notify()
            return
        }
        for (let r = 0; r < run.runtimes.length; r++) {
            run.runtimes[r]!.evaluate(run.planDuration, 0)
            run.done[r] = 1
            this._touch(run, r)
        }
        run.doneCount = run.runtimes.length
        this._groupTime = run.duration
        this._pending = false
        this._status = 'ENDED'
        this._settle('ended')
        this._notify()
    }

    /**
     * Pauses a `PLAYING` group (no-op in any other status).
     */
    public pause(): void {
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Group] `pause()` on a disposed group is a no-op.',
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
     * Resumes a `PAUSED` group (no-op in any other status).
     */
    public resume(): void {
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Group] `resume()` on a disposed group is a no-op.',
                    devKey(this, 'resume')
                )
            }
            return
        }
        if (this._status !== 'PAUSED' || !this._run) return
        this._status = 'PLAYING'
        this._clock.subscribe(this)
    }

    /**
     * Back to `IDLE`: stops the run and clears every value. The pending
     * promise resolves `'reset'`; listeners get one `IDLE` notification.
     */
    public reset(): void {
        if (this._disposed) return
        this._clear()
        this._settle('reset')
        this._notify()
    }

    private _clear(): void {
        this._runId++
        this._epoch++
        this._status = 'IDLE'
        this._run = null
        this._groupTime = 0
        this._delay = 0
        this._remainingRepeats = 0
        this._advanced = false
        this._pending = false
        this._speed = 1
        this._clock.unsubscribe(this)
    }

    /**
     * Stops the group for good: leaves the clock, drops every binding and
     * listener and turns `play()` / `resume()` into no-ops. Idempotent.
     */
    public dispose(): void {
        if (this._disposed) return
        this._disposed = true
        this._clear()
        this._settle('disposed')
        this._listeners.clear()
        this._bindings.clear()
    }

    /**
     * Jumps to `time` (seconds, clamped to `[0, duration]`): a `PLAYING` or
     * `ENDED` group becomes `PAUSED` there, any start `delay` is dropped and
     * listeners are notified once. No-op before the first `play()`.
     */
    public seek(time: number): void {
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Group] `seek()` on a disposed group is a no-op.',
                    devKey(this, 'seek')
                )
            }
            return
        }
        const run = this._run
        if (!run) return
        if (typeof time !== 'number' || Number.isNaN(time)) {
            throw createAniError(
                RangeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? `[Group] seek time must be a number, received ${time}.`
                    : ''
            )
        }
        if (time === Infinity && !Number.isFinite(run.duration)) {
            throw createAniError(
                RangeError,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? '[Group] seek time must be finite: an endless group has no end to seek to.'
                    : ''
            )
        }
        if (this._status === 'PLAYING' || this._status === 'ENDED') {
            this._status = 'PAUSED'
            this._clock.unsubscribe(this)
        }
        this._runId++
        this._epoch++
        const target = Math.max(0, Math.min(time, run.duration))
        this._delay = 0
        this._groupTime = target
        this._evaluate(run, target, 0, true)
        this._advanced = false
        this._notify()
    }

    /**
     * Frozen snapshot of target `index`, `null` out of range and before `play()`.
     */
    public valueAt(index: number): Readonly<AniGroup<G>> | null {
        const run = this._run
        if (
            !run ||
            !Number.isInteger(index) ||
            index < 0 ||
            index >= run.count
        ) {
            return null
        }
        return this._snapshot(run, run.runtimeOf[index]!) as Readonly<
            AniGroup<G>
        >
    }

    /**
     * Writes element `i` of `targets` with target `i` on every notification
     * (changed declarations only, one style per distinct runtime and frame).
     * Elements beyond `count` are left alone; missing elements are not
     * written. A group that already has a value writes immediately. Positional
     * (array) values cannot be styled: the first write reports a `TypeError`
     * asynchronously and drops the binding. An invalid element throws a
     * `TypeError` synchronously.
     * @returns Unbind (idempotent; written styles are kept).
     */
    public bind(
        targets: ArrayLike<{ style: CSSStyleDeclaration }>,
        options?: RafGroupBindOptions
    ): () => void {
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Group] `bind()` on a disposed group is a no-op.',
                    devKey(this, 'bind')
                )
            }
            return () => undefined
        }
        const writers: StyleWriter[] = []
        for (let i = 0; i < targets.length; i++) {
            writers.push(createStyleWriter(targets[i]!))
        }
        return this._attach({
            writers,
            resolver: options?.resolver,
            index: null,
        })
    }

    private _attach(binding: Binding): () => void {
        this._bindings.add(binding)
        if (this._run) this._writeAll(this._run, binding)
        return () => {
            this._bindings.delete(binding)
        }
    }

    /**
     * Writes `target` with the value of target `index` on every notification
     * (changed declarations only). If `index` is beyond `count`, writes
     * nothing until a later run has enough targets. A group that already has a
     * value writes immediately. An invalid index or target throws a `TypeError`
     * synchronously.
     * @returns Unbind (idempotent; written styles are kept).
     */
    public bindAt(
        index: number,
        target: { style: CSSStyleDeclaration } | HTMLElement,
        options?: RafGroupBindOptions
    ): () => void {
        if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_OPTIONS',
                __ANI_DEV__
                    ? `[Group] \`index\` must be a non-negative integer, received ${index}.`
                    : ''
            )
        }
        const writer = createStyleWriter(target)
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Group] `bindAt()` on a disposed group is a no-op.',
                    devKey(this, 'bindAt')
                )
            }
            return () => undefined
        }
        const writers: StyleWriter[] = []
        writers[index] = writer
        return this._attach({ writers, resolver: options?.resolver, index })
    }

    /**
     * Subscribes to updates. Called once per frame in the commit phase (after
     * bound styles are written) and synchronously by `play()`, `seek()` and
     * `reset()`. A throwing listener does not affect the others nor the group;
     * its error is rethrown asynchronously.
     * @returns Unsubscribe.
     */
    public onUpdate(listener: Listener<G>): () => void {
        if (this._disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    '[Group] `onUpdate()` on a disposed group is a no-op.',
                    devKey(this, 'onUpdate')
                )
            }
            return () => undefined
        }
        this._listeners.add(listener)
        return () => {
            this._listeners.delete(listener)
        }
    }
}

/**
 * Create a group: one plan drives N targets through one clock subscription.
 * Targets with the same offset and `from` share one evaluation.
 * @param node Root animation node.
 * @param options Clock and per-target start offset.
 */
export function rafGroup<G extends Groupable>(
    node: AnimationNode<G>,
    options?: RafGroupOptions
): RafGroup<G> {
    return new RafAniGroup<G>(node, options)
}
