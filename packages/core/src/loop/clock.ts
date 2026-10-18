export interface Animatable {
    /**
     * Update animation based on dt
     * @param dt delta time
     */
    update(dt: number): void
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
}

/**
 * Clock that exposes how many animatables it currently drives.
 */
export type ManagedClock = AnimationClockInterface & {
    readonly size: number
}

const DEFAULT_LAG_THRESHOLD = 1 / 2
/**
 * Gaps up to this (seconds) are ordinary frames (>= 20 fps); the latest one
 * is what a suspension advances by.
 */
const ORDINARY_FRAME_LIMIT = 1 / 20
const DEFAULT_FRAME = 1 / 60
/**
 * A pending frame older than this (ms) is considered possibly dropped by the
 * environment and is re-armed on the next `subscribe`.
 */
const STALE_FRAME_MS = 1000

interface FrameSource {
    owner: unknown
    request: (callback: (timestamp: number) => void) => number
    cancel: ((id: number) => void) | undefined
}

function assertPositive(name: string, value: number): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
        throw new RangeError(
            `[AnimationClock] ${name} must be a positive number (Infinity allowed), received ${value}.`
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
    throw new TypeError(
        `[AnimationClock] visibility must be a boolean or an object with a boolean "hidden" and "addEventListener" / "removeEventListener" functions, received ${String(value)}.`
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
 * - a subscriber added during a tick first updates on the next tick;
 * - a throwing subscriber never affects other subscribers or the next frame;
 * - subscribing always (re)starts the loop when no live frame is pending;
 * - without a frame source (SSR, plain workers) subscribing is a no-op.
 */
export class AnimationClock implements ManagedClock {
    private readonly subscribers: Set<Animatable> = new Set()
    // Reused per-tick snapshot, avoids a per-frame allocation.
    private readonly snapshot: (Animatable | undefined)[] = []
    // Subscribe time of animatables that joined while the loop was already
    // running; their first update only advances by the time since joining.
    private readonly joinedAt: Map<Animatable, number> = new Map()

    private maxDeltaTime = Infinity
    private lagThreshold = DEFAULT_LAG_THRESHOLD
    // Latest ordinary frame gap: what a suspension advances by.
    private ordinaryFrame = DEFAULT_FRAME
    private readonly options: CreateClockOptions
    private readonly visibility: boolean | VisibilitySource

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

    protected static clock: AnimationClock | undefined

    /**
     * Process-wide default clock.
     * @param maxDeltaTime when given, it is applied to the (possibly already
     * existing) default clock as a hard per-frame cap. Unlimited by default.
     */
    public static create(maxDeltaTime?: number): AnimationClock {
        if (!AnimationClock.clock) {
            AnimationClock.clock = new AnimationClock(maxDeltaTime)
        } else if (maxDeltaTime !== undefined) {
            AnimationClock.clock.setTiming({ maxDeltaTime })
        }
        return AnimationClock.clock
    }

    /**
     * Reconfigure the default clock (created if needed). A number sets
     * `maxDeltaTime`; an object sets any of `lagThreshold` / `maxDeltaTime`.
     */
    public static configure(
        timing: number | ClockTimingOptions
    ): AnimationClock {
        const clock = AnimationClock.create()
        clock.setTiming(
            typeof timing === 'number' ? { maxDeltaTime: timing } : timing
        )
        return clock
    }

    /**
     * Disposes the process-wide default clock (stops its frame loop and drops
     * its subscribers) so the next `create()` starts from scratch.
     * Intended for test isolation and hot-reload teardown.
     */
    public static reset(): void {
        AnimationClock.clock?.dispose()
        AnimationClock.clock = undefined
    }

    /**
     * Prefer {@link createClock} / {@link AnimationClock.create}.
     */
    public constructor(options: CreateClockOptions | number = {}) {
        this.options =
            typeof options === 'number' ? { maxDeltaTime: options } : options
        this.visibility = resolveVisibility(this.options.visibility)
        this.setTiming(this.options)
    }

    // Validates everything before applying anything.
    private setTiming({
        lagThreshold,
        maxDeltaTime,
    }: ClockTimingOptions): void {
        const lag =
            lagThreshold === undefined
                ? this.lagThreshold
                : assertPositive('lagThreshold', lagThreshold)
        const max =
            maxDeltaTime === undefined
                ? this.maxDeltaTime
                : assertPositive('maxDeltaTime', maxDeltaTime)
        this.lagThreshold = lag
        this.maxDeltaTime = max
    }

    /**
     * Number of animatables currently driven by this clock.
     */
    public get size(): number {
        return this.subscribers.size
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

        // A running tick re-arms itself once it finishes.
        if (this.ticking) return

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
        // During a tick the loop decides after all updates ran, so that an
        // unsubscribe + subscribe pair never spawns a second loop.
        if (this.subscribers.size === 0 && !this.ticking) {
            this.cancelPending()
            this.armed = false
            this.detachVisibility()
        }
    }

    /**
     * Stops the frame loop and drops every subscriber.
     */
    public dispose(): void {
        this.subscribers.clear()
        this.joinedAt.clear()
        this.cancelPending()
        this.armed = false
        this.detachVisibility()
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

    private tick(generation: number, timestamp: number): void {
        if (generation !== this.generation || !this.armed) return

        this.frameId = null
        this.ticking = true

        const elapsed = (timestamp - this.lastTimestamp) / 1000
        const suspended = this.suspended
        this.suspended = false
        const dt = this.toDelta(elapsed, suspended)
        if (!suspended && elapsed > 0 && elapsed <= ORDINARY_FRAME_LIMIT) {
            this.ordinaryFrame = elapsed
        }
        this.lastTimestamp = timestamp

        const snapshot = this.snapshot
        let count = 0
        for (const subscriber of this.subscribers)
            snapshot[count++] = subscriber

        try {
            for (let i = 0; i < count; i++) {
                const subscriber = snapshot[i]!
                // unsubscribed by an earlier subscriber in this very tick
                if (!this.subscribers.has(subscriber)) continue
                let delta = dt
                if (this.joinedAt.size > 0) {
                    const joined = this.joinedAt.get(subscriber)
                    if (joined !== undefined) {
                        this.joinedAt.delete(subscriber)
                        delta = this.toDelta(
                            (timestamp - joined) / 1000,
                            suspended
                        )
                    }
                }
                try {
                    subscriber.update(delta)
                } catch (error) {
                    this.report(error)
                }
            }
        } finally {
            // Clear the slots (no retention) but keep the capacity:
            // `length = 0` drops the backing store, re-allocated every frame.
            for (let i = 0; i < count; i++) snapshot[i] = undefined
            this.ticking = false
            this.armed = false

            if (this.subscribers.size > 0) {
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
export function createClock(options: CreateClockOptions = {}): ManagedClock {
    return new AnimationClock(options)
}
