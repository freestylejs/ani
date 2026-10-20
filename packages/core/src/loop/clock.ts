import { AniError, createAniError } from '../error/ani_error'

declare const __ANI_DEV__: boolean

export interface Animatable {
    /** Read phase: measure layout or sample inputs. Must not write the DOM. */
    read?(): void
    /**
     * Update phase: advance by `dt` seconds and compute. Must not touch the DOM.
     * @param dt delta time
     */
    update(dt: number): void
    /** Commit phase: write the results of this frame. */
    commit?(): void
}

/**
 * Animation clock interface, can be user-injected.
 */
export interface AnimationClockInterface {
    subscribe(animatable: Animatable): void
    unsubscribe(animatable: Animatable): void
}

/**
 * How frame gaps become animation time.
 */
export interface ClockTimingOptions {
    /**
     * Lag smoothing threshold (seconds). A gap between frames up to this is
     * applied as the real elapsed time, so jank never slows animations down
     * (they stay on the wall clock, in sync with WAAPI, CSS and timers). A
     * longer gap is treated as a suspension (hidden tab, debugger, sleep)
     * and advances by one ordinary frame, so animations resume where they
     * paused instead of jumping. `Infinity` gives pure wall-clock time.
     * @default 0.5
     */
    lagThreshold?: number | undefined
    /**
     * Hard upper bound (seconds) of one frame's delta. Unlimited by default;
     * a finite value dilates animation time whenever a frame takes longer.
     * @default Infinity
     */
    maxDeltaTime?: number | undefined
}

/**
 * Page visibility source used to tell a suspension from ordinary jank.
 * `Document` satisfies this shape, so injecting it in tests is trivial.
 */
export interface VisibilitySource {
    readonly hidden: boolean
    addEventListener(type: 'visibilitychange', listener: () => void): void
    removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export interface CreateClockOptions extends ClockTimingOptions {
    /**
     * Multiplier of every delta handed to subscribers: `0` freezes animation
     * time, `0.5` is half speed, `2` double speed. Finite and >= 0.
     * @default 1
     */
    timeScale?: number | undefined
    /**
     * Frame source. Resolved lazily from the environment when omitted
     * (`window.requestAnimationFrame`, then `globalThis.requestAnimationFrame`).
     */
    requestFrame?:
        | ((callback: (timestamp: number) => void) => number)
        | undefined
    /**
     * Cancels a frame requested with `requestFrame`.
     */
    cancelFrame?: ((id: number) => void) | undefined
    /**
     * Time source in milliseconds, same time domain as the frame timestamps.
     * @default performance.now
     */
    now?: (() => number) | undefined
    /**
     * Receives errors thrown by subscribers. Without it, errors are rethrown
     * asynchronously (they surface as uncaught errors but never stop the
     * clock or other subscribers).
     */
    onError?: ((error: unknown) => void) | undefined
    /**
     * Treat any frame gap during which the document became hidden as a suspension
     * (advances by one ordinary frame), whatever its length. `true` uses
     * `globalThis.document` when it exists; pass an object to inject the source.
     * `false` disables it and attaches no listener.
     * @default true
     */
    visibility?: boolean | VisibilitySource | undefined
    /**
     * The user's reduced-motion preference, exposed as `clock.reducedMotion`
     * and honored by timelines. `'system'` follows
     * `(prefers-reduced-motion: reduce)` (created on first read, read live);
     * without `matchMedia` it is `false`. A boolean forces it; an object
     * with a boolean `matches` (a `MediaQueryList`) is an injected source.
     * @default 'system'
     */
    reducedMotion?: 'system' | boolean | ReducedMotionSource | undefined
}

/**
 * Live reduced-motion source. A `MediaQueryList` satisfies it.
 */
export interface ReducedMotionSource {
    readonly matches: boolean
}

/**
 * A frame clock: what `createClock`, `defaultClock` and `createManualClock`
 * hand out. It also exposes how many animatables it currently drives.
 */
export type Clock = AnimationClockInterface & {
    readonly size: number
    /**
     * Whether the user prefers reduced motion right now (see the
     * `reducedMotion` option).
     */
    readonly reducedMotion: boolean
    /**
     * Queues `fn` for the read phase of the next frame (arms the loop when
     * idle). Runs once; a no-op without a frame source.
     */
    read(fn: () => void): void
    /**
     * Multiplier of every delta handed to `update` (finite, >= 0, default 1).
     * `0` freezes animation time while frames keep running. Takes effect from
     * the next frame; an invalid value throws a `RangeError` and changes
     * nothing.
     */
    timeScale: number
    /**
     * Whether the frame loop is paused with `pause()`.
     */
    readonly paused: boolean
    /**
     * Reconfigure frame timing (`lagThreshold` / `maxDeltaTime`). Atomic:
     * every field is validated first, and an invalid one throws and changes
     * nothing.
     */
    configure(timing: ClockTimingOptions): void
    /**
     * Stops the frame loop but keeps every subscriber and queued read.
     * Idempotent.
     */
    pause(): void
    /**
     * Restarts a paused loop with a fresh time base, so the paused gap is
     * never applied. Idempotent; a no-op when not paused.
     */
    resume(): void
    /**
     * Stops the frame loop and drops every subscriber and queued read.
     */
    dispose(): void
}

const DEFAULT_LAG_THRESHOLD = 1 / 2
/**
 * Gaps up to this (seconds) are ordinary frames (>= 20 fps); the latest one
 * is what a suspension advances by.
 */
const ORDINARY_FRAME_LIMIT = 1 / 20
const DEFAULT_FRAME = 1 / 60
/**
 * Consecutive failing ticks after which a subscriber is unsubscribed.
 */
const QUARANTINE_AFTER = 3
// Marks "did not throw this tick" in the per-tick failure slots.
const NO_ERROR = Symbol('no-error')
/**
 * A pending frame older than this (ms) is considered possibly dropped by the
 * environment and is re-armed on the next `subscribe`.
 */
const STALE_FRAME_MS = 1000

const CONFIGURE_ALLOWED_KEYS = {
    lagThreshold: true,
    maxDeltaTime: true,
} satisfies Record<keyof ClockTimingOptions, true>

const CREATE_CLOCK_ALLOWED_KEYS = {
    lagThreshold: true,
    maxDeltaTime: true,
    timeScale: true,
    requestFrame: true,
    cancelFrame: true,
    now: true,
    onError: true,
    visibility: true,
    reducedMotion: true,
} satisfies Record<keyof CreateClockOptions, true>

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false
    }
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

interface FrameSource {
    owner: unknown
    request: (callback: (timestamp: number) => void) => number
    cancel: ((id: number) => void) | undefined
}

function assertPositive(name: string, value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
        throw createAniError(
            RangeError,
            'ANI_INVALID_OPTIONS',
            __ANI_DEV__
                ? `[Clock] ${name} must be a positive number (Infinity allowed), received ${value}.`
                : ''
        )
    }
    return value
}

function assertTimeScale(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw createAniError(
            RangeError,
            'ANI_INVALID_OPTIONS',
            __ANI_DEV__
                ? `[Clock] timeScale must be a finite number >= 0, received ${String(value)}.`
                : ''
        )
    }
    return value
}

function isVisibilitySource(value: unknown): value is VisibilitySource {
    if (typeof value !== 'object' || value === null) return false
    const source = value as VisibilitySource
    return (
        typeof source.hidden === 'boolean' &&
        typeof source.addEventListener === 'function' &&
        typeof source.removeEventListener === 'function'
    )
}

// Validates the option eagerly; `undefined` keeps the default (`true`).
function resolveVisibility(value: unknown): boolean | VisibilitySource {
    if (value === undefined) return true
    if (typeof value === 'boolean') return value
    if (isVisibilitySource(value)) return value
    throw createAniError(
        TypeError,
        'ANI_INVALID_OPTIONS',
        __ANI_DEV__
            ? `[Clock] visibility must be a boolean or an object with a boolean "hidden" and "addEventListener" / "removeEventListener" functions, received ${String(value)}.`
            : ''
    )
}

// `true` resolves the environment document lazily, so server rendering and
// documents without event support are a silent no-op.
function defaultVisibilitySource(): VisibilitySource | null {
    const doc = (globalThis as { document?: VisibilitySource }).document
    if (!doc) return null
    return typeof doc.addEventListener === 'function' &&
        typeof doc.removeEventListener === 'function'
        ? doc
        : null
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function isReducedMotionSource(value: unknown): value is ReducedMotionSource {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as ReducedMotionSource).matches === 'boolean'
    )
}

// Validates the option eagerly; `undefined` keeps the default (`'system'`).
function resolveReducedMotion(
    value: unknown
): 'system' | boolean | ReducedMotionSource {
    if (value === undefined || value === 'system') return 'system'
    if (typeof value === 'boolean') return value
    if (isReducedMotionSource(value)) return value
    throw createAniError(
        TypeError,
        'ANI_INVALID_OPTIONS',
        __ANI_DEV__
            ? `[Clock] reducedMotion must be 'system', a boolean or an object with a boolean "matches", received ${String(value)}.`
            : ''
    )
}

function rethrowAsync(error: unknown): void {
    if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => {
            throw error
        })
    } else {
        setTimeout(() => {
            throw error
        }, 0)
    }
}

/**
 * Single-loop animation clock.
 *
 * Invariants:
 * - at most one pending frame request at any time;
 * - every tick runs three phases over all subscribers: read (one-shot
 *   `read(fn)` callbacks, then `read()`), update, commit;
 * - a subscriber added during a tick first updates on the next tick;
 * - a subscriber that updated in a tick commits in it, even if it
 *   unsubscribed meanwhile; one unsubscribed before its update does not;
 * - a throwing subscriber never affects other subscribers or the next frame;
 * - subscribing always (re)starts the loop when no live frame is pending;
 * - without a frame source (SSR, plain workers) subscribing is a no-op.
 */
class AnimationClock implements Clock {
    private readonly subscribers: Set<Animatable> = new Set()
    // Reused per-tick snapshot, avoids a per-frame allocation.
    private readonly snapshot: (Animatable | undefined)[] = []
    // Parallel to `snapshot`: whether the subscriber's update ran this tick.
    private readonly updated: boolean[] = []
    // One-shot read callbacks: two reusable arrays swapped every tick.
    private readQueue: ((() => void) | undefined)[] = []
    private readCount = 0
    private readRunning: ((() => void) | undefined)[] = []
    private readRunningCount = 0
    // Subscribe time of animatables that joined while the loop was already
    // running; their first update only advances by the time since joining.
    private readonly joinedAt: Map<Animatable, number> = new Map()
    // Parallel to `snapshot`: the last error thrown this tick, or NO_ERROR.
    private readonly failures: unknown[] = []
    // Consecutive failing ticks per subscriber; touched only on errors.
    private readonly strikes: Map<Animatable, number> = new Map()

    private scale = 1
    private isPaused = false
    private maxDeltaTime = Infinity
    private lagThreshold = DEFAULT_LAG_THRESHOLD
    // Latest ordinary frame gap: what a suspension advances by.
    private ordinaryFrame = DEFAULT_FRAME
    private readonly options: CreateClockOptions
    private readonly visibility: boolean | VisibilitySource
    private readonly reducedMotionOption:
        | 'system'
        | boolean
        | ReducedMotionSource
    // Created once, on the first read of the 'system' preference.
    private systemQuery: ReducedMotionSource | null = null

    // Page visibility: the listener exists only while the loop is armed and is
    // created once per clock. `suspended` is sticky for one frame.
    private visibilitySource: VisibilitySource | null = null
    private visibilityAttached = false
    private visibilityListener: (() => void) | null = null
    private suspended = false

    private armed = false
    private ticking = false
    private frameId: number | null = null
    // Distinguishes the live request from cancelled / dropped ones.
    private generation = 0
    private armedSource: FrameSource | null = null
    private armedAt = 0
    private lastTimestamp = 0

    public constructor(options: CreateClockOptions = {}) {
        this.options = options
        this.visibility = resolveVisibility(this.options.visibility)
        this.reducedMotionOption = resolveReducedMotion(
            this.options.reducedMotion
        )
        if (this.options.timeScale !== undefined) {
            this.scale = assertTimeScale(this.options.timeScale)
        }
        const timing: ClockTimingOptions = {}
        if (this.options.lagThreshold !== undefined) {
            timing.lagThreshold = this.options.lagThreshold
        }
        if (this.options.maxDeltaTime !== undefined) {
            timing.maxDeltaTime = this.options.maxDeltaTime
        }
        this.configure(timing)
    }

    /**
     * Reconfigure frame timing (`lagThreshold` / `maxDeltaTime`). Atomic:
     * every field is validated first, and an invalid one throws and changes
     * nothing.
     */
    public configure(timing: ClockTimingOptions): void {
        if (!isPlainObject(timing)) {
            if (typeof timing === 'number') {
                throw createAniError(
                    TypeError,
                    'ANI_INVALID_OPTIONS',
                    __ANI_DEV__
                        ? `[Clock] configure() takes { lagThreshold, maxDeltaTime }. Did you mean { maxDeltaTime: ${timing} }?`
                        : ''
                )
            }
            throw createAniError(
                TypeError,
                'ANI_INVALID_OPTIONS',
                __ANI_DEV__
                    ? `[Clock] configure() takes { lagThreshold, maxDeltaTime }, received ${
                          Array.isArray(timing)
                              ? 'an array'
                              : timing === null
                                ? 'null'
                                : typeof timing
                      }.`
                    : ''
            )
        }
        for (const key of Object.keys(timing)) {
            if (!Object.hasOwn(CONFIGURE_ALLOWED_KEYS, key)) {
                throw createAniError(
                    TypeError,
                    'ANI_INVALID_OPTIONS',
                    __ANI_DEV__
                        ? `[Clock] configure() received unknown option "${key}". configure takes { lagThreshold, maxDeltaTime }.`
                        : ''
                )
            }
        }
        const lag =
            timing.lagThreshold === undefined
                ? this.lagThreshold
                : assertPositive('lagThreshold', timing.lagThreshold)
        const max =
            timing.maxDeltaTime === undefined
                ? this.maxDeltaTime
                : assertPositive('maxDeltaTime', timing.maxDeltaTime)
        this.lagThreshold = lag
        this.maxDeltaTime = max
    }

    /**
     * Number of animatables currently driven by this clock.
     */
    public get size(): number {
        return this.subscribers.size
    }

    public get reducedMotion(): boolean {
        const option = this.reducedMotionOption
        if (typeof option === 'boolean') return option
        if (option !== 'system') return option.matches
        if (this.systemQuery === null) {
            const matchMedia = (
                globalThis as {
                    matchMedia?: (query: string) => ReducedMotionSource | null
                }
            ).matchMedia
            if (typeof matchMedia !== 'function') return false
            this.systemQuery = matchMedia.call(globalThis, REDUCED_MOTION_QUERY)
        }
        return this.systemQuery?.matches === true
    }

    public get timeScale(): number {
        return this.scale
    }

    public set timeScale(value: number) {
        this.scale = assertTimeScale(value)
    }

    public get paused(): boolean {
        return this.isPaused
    }

    public pause(): void {
        if (this.isPaused) return
        this.isPaused = true
        // A running tick holds no pending frame and skips re-arming itself.
        if (this.ticking) return
        this.cancelPending()
        this.armed = false
        this.detachVisibility()
    }

    public resume(): void {
        if (!this.isPaused) return
        this.isPaused = false
        // The restarted time base covers the paused gap from here on.
        this.joinedAt.clear()
        if (this.ticking) return
        if (this.subscribers.size === 0 && this.readCount === 0) return
        const source = this.resolveSource()
        if (source) this.arm(source, true)
    }

    public subscribe(animatable: Animatable): void {
        const source = this.resolveSource()
        // No frame source (SSR / worker without rAF): never retain.
        if (!source) return

        const joining = !this.subscribers.has(animatable)
        this.subscribers.add(animatable)
        // Joining an idle clock needs no entry: the loop starts "now", so the
        // first frame delta already begins at the subscribe time.
        if (joining && (this.armed || this.ticking)) {
            this.joinedAt.set(animatable, this.now())
        }

        this.ensureArmed(source)
    }

    /**
     * Queues `fn` for the read phase of the next frame, before any
     * subscriber's `read` / `update`. Runs once and does not keep the loop
     * alive afterwards. Without a frame source it is a silent no-op.
     */
    public read(fn: () => void): void {
        const source = this.resolveSource()
        if (!source) return
        this.readQueue[this.readCount++] = fn
        this.ensureArmed(source)
    }

    private ensureArmed(source: FrameSource): void {
        // A running tick re-arms itself once it finishes.
        if (this.ticking || this.isPaused) return

        if (!this.armed) {
            this.arm(source, true)
        } else if (this.isStale(source)) {
            // The environment may have dropped the pending request
            // (e.g. fake rAF reinstalled): never trust the old handle.
            this.cancelPending()
            this.arm(source, false)
        }
    }

    public unsubscribe(animatable: Animatable): void {
        this.subscribers.delete(animatable)
        this.joinedAt.delete(animatable)
        this.strikes.delete(animatable)
        // During a tick the loop decides after all updates ran, so that an
        // unsubscribe + subscribe pair never spawns a second loop.
        if (
            this.subscribers.size === 0 &&
            this.readCount === 0 &&
            !this.ticking
        ) {
            this.cancelPending()
            this.armed = false
            this.detachVisibility()
        }
    }

    /**
     * Stops the frame loop and drops every subscriber and queued read.
     */
    public dispose(): void {
        this.subscribers.clear()
        this.joinedAt.clear()
        this.strikes.clear()
        this.isPaused = false
        for (let i = 0; i < this.readCount; i++) this.readQueue[i] = undefined
        for (let i = 0; i < this.readRunningCount; i++) {
            this.readRunning[i] = undefined
        }
        this.readCount = 0
        this.cancelPending()
        this.armed = false
        this.detachVisibility()
    }

    /**
     * @private Internal: `dispose()` plus the defaults (timing options,
     * `timeScale` 1, not paused), for `resetDefaultClock`.
     */
    restoreDefaults(): void {
        this.dispose()
        this.scale = 1
        this.maxDeltaTime = Infinity
        this.lagThreshold = DEFAULT_LAG_THRESHOLD
        this.ordinaryFrame = DEFAULT_FRAME
    }

    /**
     * Listens only while the loop is armed: `true` resolves the environment
     * document, a broken or missing source is skipped silently. Attaching
     * happens once per armed period, so re-arms never add a second listener.
     */
    private attachVisibility(): void {
        if (this.visibilityAttached || this.visibility === false) return
        const source =
            this.visibility === true
                ? defaultVisibilitySource()
                : this.visibility
        if (!source) return
        this.visibilityAttached = true
        this.visibilitySource = source
        if (!this.visibilityListener) {
            // One function per clock; it reads the source's state at event
            // time, which is what makes only real hidden events suspend.
            this.visibilityListener = () => {
                if (this.visibilitySource?.hidden) this.suspended = true
            }
        }
        try {
            source.addEventListener('visibilitychange', this.visibilityListener)
        } catch (error) {
            this.report(error)
        }
    }

    private detachVisibility(): void {
        this.suspended = false
        if (!this.visibilityAttached) return
        this.visibilityAttached = false
        const source = this.visibilitySource
        if (!source || !this.visibilityListener) return
        try {
            source.removeEventListener(
                'visibilitychange',
                this.visibilityListener
            )
        } catch (error) {
            this.report(error)
        }
    }

    private resolveSource(): FrameSource | null {
        const { requestFrame, cancelFrame } = this.options
        if (requestFrame) {
            return this.sourceOf(null, requestFrame, cancelFrame)
        }
        const g = globalThis as {
            window?: Window
            requestAnimationFrame?: Window['requestAnimationFrame']
            cancelAnimationFrame?: Window['cancelAnimationFrame']
        }
        // `window` first: keeps stubbed windows (tests, embedded realms) in charge.
        const owner: {
            requestAnimationFrame?: Window['requestAnimationFrame']
            cancelAnimationFrame?: Window['cancelAnimationFrame']
        } | null =
            g.window && typeof g.window.requestAnimationFrame === 'function'
                ? g.window
                : typeof g.requestAnimationFrame === 'function'
                  ? g
                  : null
        if (!owner) return null
        return this.sourceOf(
            owner,
            owner.requestAnimationFrame!,
            cancelFrame ?? owner.cancelAnimationFrame
        )
    }

    // Resolved every frame: reuse the armed source while the environment is
    // unchanged, so a running loop allocates nothing per frame.
    private sourceOf(
        owner: unknown,
        request: FrameSource['request'],
        cancel: FrameSource['cancel']
    ): FrameSource {
        const armed = this.armedSource
        if (
            armed &&
            armed.owner === owner &&
            armed.request === request &&
            armed.cancel === cancel
        ) {
            return armed
        }
        return { owner, request, cancel }
    }

    private now(): number {
        if (this.options.now) return this.options.now()
        const perf = (globalThis as { performance?: Performance }).performance
        return perf ? perf.now() : Date.now()
    }

    private isStale(source: FrameSource): boolean {
        const armed = this.armedSource
        if (
            !armed ||
            armed.request !== source.request ||
            armed.owner !== source.owner
        ) {
            return true
        }
        return this.now() - this.armedAt > STALE_FRAME_MS
    }

    private arm(source: FrameSource, restartTime: boolean): void {
        const generation = ++this.generation
        const callback = (timestamp: number) => this.tick(generation, timestamp)
        try {
            if (restartTime) this.lastTimestamp = this.now()
            this.attachVisibility()
            this.frameId = source.owner
                ? source.request.call(source.owner, callback)
                : source.request(callback)
            this.armed = true
            this.armedSource = source
            this.armedAt = this.now()
        } catch (error) {
            // Frame source is broken: stay idle, a later subscribe retries.
            this.armed = false
            this.frameId = null
            this.detachVisibility()
            this.report(error)
        }
    }

    private cancelPending(): void {
        // Invalidate the callback even if the environment cannot cancel it.
        this.generation++
        const source = this.armedSource
        const id = this.frameId
        this.frameId = null
        if (id === null || !source?.cancel) return
        try {
            if (source.owner) source.cancel.call(source.owner, id)
            else source.cancel(id)
        } catch (error) {
            this.report(error)
        }
    }

    private report(error: unknown): void {
        try {
            if (this.options.onError) this.options.onError(error)
            else rethrowAsync(error)
        } catch (reportError) {
            rethrowAsync(reportError)
        }
    }

    /**
     * Elapsed seconds -> delta handed to subscribers (lag smoothing):
     * negative / NaN -> 0; up to `lagThreshold` -> real time; a longer gap or
     * a suspended frame -> one ordinary frame, never more than the elapsed
     * time of the subscriber itself. Never above `maxDeltaTime`.
     */
    private toDelta(seconds: number, suspended: boolean): number {
        if (!(seconds > 0)) return 0
        let delta = seconds
        if (suspended) {
            delta = Math.min(this.ordinaryFrame, seconds)
        } else if (seconds > this.lagThreshold) {
            delta = this.ordinaryFrame
        }
        return delta > this.maxDeltaTime ? this.maxDeltaTime : delta
    }

    // Counts consecutive failing ticks; the third one quarantines the subscriber.
    private settleStrikes(count: number): void {
        const { snapshot, failures, strikes } = this
        for (let i = 0; i < count; i++) {
            const subscriber = snapshot[i]!
            // unsubscribed meanwhile: its count is already gone
            if (!this.subscribers.has(subscriber)) continue
            const error = failures[i]
            if (error === NO_ERROR) {
                if (strikes.size > 0) strikes.delete(subscriber)
                continue
            }
            const failed = (strikes.get(subscriber) ?? 0) + 1
            if (failed < QUARANTINE_AFTER) {
                strikes.set(subscriber, failed)
                continue
            }
            this.unsubscribe(subscriber)
            this.report(
                new AniError(
                    'ANI_SUBSCRIBER_QUARANTINED',
                    __ANI_DEV__
                        ? `A subscriber threw in ${QUARANTINE_AFTER} consecutive ticks and was unsubscribed.`
                        : '',
                    { cause: error }
                )
            )
        }
    }

    private tick(generation: number, timestamp: number): void {
        if (generation !== this.generation || !this.armed) return

        this.frameId = null
        this.ticking = true

        const elapsed = (timestamp - this.lastTimestamp) / 1000
        const suspended = this.suspended
        this.suspended = false
        const scale = this.scale
        const dt = this.toDelta(elapsed, suspended) * scale
        if (!suspended && elapsed > 0 && elapsed <= ORDINARY_FRAME_LIMIT) {
            this.ordinaryFrame = elapsed
        }
        this.lastTimestamp = timestamp

        const snapshot = this.snapshot
        const updated = this.updated
        const failures = this.failures
        let count = 0
        for (const subscriber of this.subscribers) {
            snapshot[count] = subscriber
            failures[count] = NO_ERROR
            updated[count++] = false
        }

        // Reads queued from now on belong to the next tick.
        const reads = this.readQueue
        const readCount = this.readCount
        this.readQueue = this.readRunning
        this.readRunning = reads
        this.readCount = 0
        this.readRunningCount = readCount

        try {
            for (let i = 0; i < readCount; i++) {
                const fn = reads[i]
                if (!fn) continue
                try {
                    fn()
                } catch (error) {
                    this.report(error)
                }
            }

            for (let i = 0; i < count; i++) {
                const subscriber = snapshot[i]!
                if (!subscriber.read) continue
                try {
                    subscriber.read()
                } catch (error) {
                    failures[i] = error
                    this.report(error)
                }
            }

            for (let i = 0; i < count; i++) {
                const subscriber = snapshot[i]!
                // unsubscribed by an earlier subscriber in this very tick
                if (!this.subscribers.has(subscriber)) continue
                let delta = dt
                if (this.joinedAt.size > 0) {
                    const joined = this.joinedAt.get(subscriber)
                    if (joined !== undefined) {
                        this.joinedAt.delete(subscriber)
                        delta =
                            this.toDelta(
                                (timestamp - joined) / 1000,
                                suspended
                            ) * scale
                    }
                }
                updated[i] = true
                try {
                    subscriber.update(delta)
                } catch (error) {
                    failures[i] = error
                    this.report(error)
                }
            }

            for (let i = 0; i < count; i++) {
                if (!updated[i]) continue
                const subscriber = snapshot[i]!
                if (!subscriber.commit) continue
                try {
                    subscriber.commit()
                } catch (error) {
                    failures[i] = error
                    this.report(error)
                }
            }

            this.settleStrikes(count)
        } finally {
            // Clear the slots (no retention) but keep the capacity:
            // `length = 0` drops the backing store, re-allocated every frame.
            for (let i = 0; i < count; i++) {
                snapshot[i] = undefined
                failures[i] = NO_ERROR
                updated[i] = false
            }
            for (let i = 0; i < readCount; i++) reads[i] = undefined
            this.readRunningCount = 0
            this.ticking = false
            this.armed = false

            if (
                !this.isPaused &&
                (this.subscribers.size > 0 || this.readCount > 0)
            ) {
                const source = this.resolveSource()
                if (source) this.arm(source, false)
            }
            // Anything but a live loop holds no visibility listener.
            if (!this.armed) this.detachVisibility()
        }
    }
}

/**
 * Creates an independent (non-singleton) animation clock with its own frame
 * loop. Pass it to `rafTimeline` / `createStates` to isolate engines, drive
 * animations manually in tests (custom `requestFrame`) or use pure
 * wall-clock semantics (`lagThreshold: Infinity`).
 */
export function createClock(options?: CreateClockOptions): Clock {
    if (options !== undefined) {
        if (!isPlainObject(options)) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_OPTIONS',
                __ANI_DEV__
                    ? `[createClock] Expected an options object, received ${
                          Array.isArray(options)
                              ? 'an array'
                              : options === null
                                ? 'null'
                                : typeof options
                      }.`
                    : ''
            )
        }
        for (const key of Object.keys(options)) {
            if (!Object.hasOwn(CREATE_CLOCK_ALLOWED_KEYS, key)) {
                throw createAniError(
                    TypeError,
                    'ANI_INVALID_OPTIONS',
                    __ANI_DEV__
                        ? `[createClock] Unknown option "${key}". Allowed options are ${Object.keys(
                              CREATE_CLOCK_ALLOWED_KEYS
                          )
                              .map((k) => `"${k}"`)
                              .join(', ')}.`
                        : ''
                )
            }
        }
    }
    return new AnimationClock(options ?? {})
}

/**
 * The process-wide shared clock, used by `rafTimeline` and `createStates`
 * when no clock is given. Creating it touches neither the DOM nor
 * `requestAnimationFrame`; the frame source resolves when the loop starts.
 */
export const defaultClock: Clock = new AnimationClock()
const sharedClock = defaultClock as AnimationClock

/**
 * Disposes {@link defaultClock} (stops its frame loop and drops its
 * subscribers) and restores its defaults: timing options, `timeScale` 1, not
 * paused. The instance stays the same, so references remain valid. Intended
 * for test isolation and hot-reload teardown.
 */
export function resetDefaultClock(): void {
    sharedClock.restoreDefaults()
}
