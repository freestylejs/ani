import type { AniGroup, Groupable } from '~/ani/core'
import {
    normalizeRepeatCount,
    TimelineBase,
    type TimelineCommonConfig,
} from '~/ani/core'
import { compilePlan, PlanRuntime } from '~/ani/core/plan_runtime'
import { resolveGroup } from '~/ani/core/resolver'
import {
    type Animatable,
    AnimationClock,
    type AnimationClockInterface,
} from '~/loop'
import type { AnimationNode } from '~/nodes'
import { createStyleSheet, type Resolver } from '~/style/create_sheet'
import { createStyleWriter, type StyleWriter } from '~/style/writer'
import { END_TOLERANCE } from '~/utils/time'

export interface RafTimelineConfig<G extends Groupable, Ctx = any>
    extends TimelineCommonConfig<G> {
    /**
     * Custom context definition during animation cycle.
     */
    context?: Ctx
    /**
     * Initial velocity per value, in units per second (same shape as `from`;
     * record velocities may be partial). Seeds stateful timings such as
     * `dynamicSpring`; ignored by stateless timings.
     *
     * Playing over a running animation without this option continues from
     * `getCurrentVelocity()` automatically.
     */
    velocity?: Partial<G>
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
     * Maps animated values to style declarations. Defaults to the current
     * run's `propertyResolver`.
     */
    resolver?: Resolver<Record<string, number>>
}

interface Binding {
    readonly writer: StyleWriter
    readonly resolver: Resolver<Record<string, number>> | undefined
}

/** Times one listener may be on the stack: its call plus one nested notification. */
const MAX_REENTRY = 2

function reportAsync(error: unknown): void {
    queueMicrotask(() => {
        throw error
    })
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

export class RafAniTimeline<G extends Groupable, Ctx = any>
    extends TimelineBase<
        G,
        [config: RafTimelineConfig<G, Ctx>, canBeIntercepted?: boolean]
    >
    // Raf clock
    implements Animatable
{
    private readonly _clock: AnimationClockInterface

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

    private _currentConfig: RafTimelineConfig<G, Ctx> | null = null
    public get currentConfig() {
        return this._currentConfig
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

    private _lastDt = 0
    private _advanced = false

    // Cached group, shared with the onUpdate subscribers of one notification
    // and referentially stable for getCurrentValue() until the next frame.
    private _cachedGroup: AniGroup<G> | null = null
    private _groupDirty = true
    // frozen copy handed out by getCurrentValue()
    private _snapshot: AniGroup<G> | null = null
    private _snapshotDirty = true

    constructor(rootNode: AnimationNode<G>, clock?: AnimationClockInterface) {
        super(rootNode)
        this._clock = clock ?? AnimationClock.create()

        this.play = this.play.bind(this)
        this.pause = this.pause.bind(this)
        this.seek = this.seek.bind(this)
        this.resume = this.resume.bind(this)
        this.reset = this.reset.bind(this)
        this.dispose = this.dispose.bind(this)
        this.bind = this.bind.bind(this)
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

    /**
     * Latest value, `null` before the first `play()` (and after `reset()`).
     * The returned object is a frozen snapshot, stable until the next frame;
     * it never aliases engine internals or the `from` passed to `play()`.
     */
    public getCurrentValue(): AniGroup<G> | null {
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
    public getCurrentVelocity(): AniGroup<G> | null {
        const runtime = this._runtime
        if (!runtime || !this._advanced) return null
        const count = runtime.values.length
        const out = new Array<number>(count)
        const moving = this._status === 'PLAYING'
        for (let i = 0; i < count; i++) {
            if (!moving) {
                out[i] = 0
                continue
            }
            const v = runtime.velocities[i]!
            out[i] = Number.isNaN(v)
                ? this._lastDt > 0
                    ? (runtime.values[i]! - runtime.previous[i]!) / this._lastDt
                    : 0
                : v
        }
        return this._buildGroup(out) as AniGroup<G>
    }

    private _sheetFor(
        binding: Binding,
        group: Record<string, number>
    ): Record<string, unknown> {
        const resolver = binding.resolver
        if (resolver === undefined) {
            return (this._defaultSheet ??= createStyleSheet(
                group,
                this._currentConfig?.propertyResolver as
                    | Resolver<Record<string, number>>
                    | undefined
            ))
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
                throw new TypeError(
                    '[Timeline] `bind()` can only style record values; positional (array) values have no style property.'
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
     * @private Internal clock subscription callback. Computes only: bound
     * targets are written and listeners called in `commit()`.
     */
    update(dt: number): void {
        if (this._status !== 'PLAYING' || !this._runtime) return

        if (this._delay > 0) {
            this._delay -= dt
            if (this._delay <= 0) {
                dt = -this._delay
                this._delay = 0
            } else {
                return
            }
        }

        this._advance(dt)
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
            throw new TypeError(
                '[Timeline] `velocity` must be an array or record shaped like `from`.'
            )
        }
        const seed = new Array<number>(count).fill(0)
        const source = velocity as Record<string, unknown>
        if (keys === null) {
            if (!Array.isArray(velocity)) {
                throw new TypeError(
                    '[Timeline] `velocity` must be an array when `from` is an array.'
                )
            }
        } else if (Array.isArray(velocity)) {
            throw new TypeError(
                '[Timeline] `velocity` must be a record when `from` is a record.'
            )
        }
        for (let i = 0; i < count; i++) {
            const value = source[keys ? keys[i]! : i]
            if (value === undefined) continue
            if (!isFiniteNumber(value)) {
                throw new TypeError(
                    `[Timeline] \`velocity\` ${keys ? `"${keys[i]}"` : `[${i}]`} must be a finite number, received ${value}.`
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
        const current = this.getCurrentVelocity() as
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
     * @param config {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame RequestAnimationFrame API} based config.
     * @param canBeIntercepted if `true` animation can be intercepted even if already animation started.
     */
    public play(
        config: RafTimelineConfig<G, Ctx>,
        canBeIntercepted: boolean = true
    ): void {
        if (this._disposed) return
        if (this._status === 'PLAYING' && !canBeIntercepted) return

        // ---- validate & prepare (no state is touched until this succeeds)
        const from = config.from as unknown
        if (typeof from !== 'object' || from === null) {
            throw new TypeError(
                '[Timeline] `from` must be an array or a record of numbers.'
            )
        }
        const { keyMap, values } = resolveGroup(config.from)
        for (let i = 0; i < values.length; i++) {
            if (!isFiniteNumber(values[i])) {
                const name = keyMap ? [...keyMap.keys()][i] : `[${i}]`
                throw new TypeError(
                    `[Timeline] \`from\` ${keyMap ? `"${name}"` : name} must be a finite number, received ${values[i]}.`
                )
            }
        }
        const delayMs = config.delay ?? 0
        if (!Number.isFinite(delayMs) || delayMs < 0) {
            throw new RangeError(
                `[Timeline] \`delay\` must be a finite number >= 0 (ms), received ${delayMs}.`
            )
        }

        const keys = keyMap ? [...keyMap.keys()] : null
        if (keys?.includes('__proto__')) {
            throw new TypeError(
                '[Timeline] `__proto__` can not be used as an animated property name.'
            )
        }
        const { plan, duration } = this._buildExecutionPlan(
            config.keyframes,
            config.durations
        )
        const compiled = compilePlan(plan, keys, values.length)
        const seed =
            config.velocity === undefined
                ? this._inheritVelocity(keys, values.length)
                : this._resolveVelocitySeed(
                      config.velocity,
                      keys,
                      values.length
                  )
        const runtime = new PlanRuntime(compiled, values as number[], seed)

        // ---- commit
        this._runId++
        this._currentConfig = config
        this._currentExecutionPlan = plan
        this._commitDuration(duration)
        this._remainingRepeats = normalizeRepeatCount(config.repeat)
        this._delay = delayMs * 1e-3
        this._keys = keys
        this._runtime = runtime
        this._lastDt = 0
        this._advanced = false
        this._masterTime = 0
        this._groupDirty = true
        this._snapshotDirty = true
        this._status = 'PLAYING'
        this._clock.subscribe(this)
        this._notify()
    }

    /**
     * Pauses a `PLAYING` timeline (no-op in any other status).
     */
    public pause(): void {
        if (this._status !== 'PLAYING') return
        this._status = 'PAUSED'
        this._clock.unsubscribe(this)
    }

    /**
     * Resumes a `PAUSED` timeline (no-op in any other status).
     */
    public resume(): void {
        if (this._disposed || this._status !== 'PAUSED' || !this._runtime) {
            return
        }
        this._status = 'PLAYING'
        this._clock.subscribe(this)
    }

    /**
     * Back to `IDLE`: stops the run, clears the value and drops `durations`
     * overrides (`duration` returns to the node's own).
     */
    public reset(
        notify: boolean = true,
        unsubscribeClock: boolean = true
    ): void {
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
        if (unsubscribeClock) {
            this._clock.unsubscribe(this)
        }
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
        this.reset(false, true)
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
        const runtime = this._runtime
        if (!runtime) return
        if (typeof targetTime !== 'number' || Number.isNaN(targetTime)) {
            throw new RangeError(
                `[Timeline] seek time must be a number, received ${targetTime}.`
            )
        }
        if (this._status === 'PLAYING' || this._status === 'ENDED') {
            this._status = 'PAUSED'
            this._clock.unsubscribe(this)
        }
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
        if (this._disposed) return () => undefined
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
        if (this._disposed) return () => undefined
        this._onUpdateCallbacks.add(callback)
        return () => {
            this._onUpdateCallbacks.delete(callback)
        }
    }
}

/**
 * Create dynamic timeline. {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame RequestAnimationFrame API} based.
 * @param rootNode Root animation node.
 * @param clock [Custom clock]
 */
export function rafTimeline<G extends Groupable, Ctx = any>(
    rootNode: AnimationNode<G>,
    clock?: AnimationClockInterface
): RafAniTimeline<G, Ctx> {
    return new RafAniTimeline<G, Ctx>(rootNode, clock)
}
