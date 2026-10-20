import { createAniError } from '../error'
import {
    type Clock,
    createClock,
    resetDefaultClock,
    type VisibilitySource,
} from '../loop/clock'

declare const __ANI_DEV__: boolean

export interface ManualClockOptions {
    /** Forwarded to `createClock`. */
    lagThreshold?: number
    /** Forwarded to `createClock`. */
    maxDeltaTime?: number
    /** Forwarded to `createClock`. */
    timeScale?: number
    /** Receives errors thrown by subscribers. */
    onError?: (error: unknown) => void
    /**
     * The manual clock injects its own visibility source (see `setHidden`).
     * `false` disables visibility handling.
     * @default true
     */
    visibility?: boolean
    /**
     * Initial reduced-motion preference (see `setReducedMotion`).
     * @default false
     */
    reducedMotion?: boolean
}

/**
 * A real clock fed by a hand-cranked frame and time source.
 */
export interface ManualClock {
    /** A real clock from `createClock`, the same code path as production. */
    readonly clock: Clock
    /** Current time in ms, starts at 1000. */
    readonly now: number
    /** Queued frame requests (0 or 1 for a healthy clock). */
    readonly pending: number
    /** Advances time by `ms` (default 16) and runs one frame. */
    frame(ms?: number): void
    /** Runs `count` frames of `ms` (default 16) each. */
    frames(count: number, ms?: number): void
    /** Moves time forward without delivering a frame. */
    advance(ms: number): void
    /** Loses the pending frame request, as a browser may. */
    drop(): void
    /** Flips the injected visibility source and fires `visibilitychange`. */
    setHidden(hidden: boolean): void
    /** Flips the injected reduced-motion preference (`clock.reducedMotion`). */
    setReducedMotion(on: boolean): void
}

/**
 * Creates a clock you drive by hand: deterministic time, no timers.
 */
export function createManualClock(
    options: ManualClockOptions = {}
): ManualClock {
    let nextId = 1
    let time = 1000
    const queue = new Map<number, (timestamp: number) => void>()

    const listeners = new Set<() => void>()
    let hidden = false
    const source: VisibilitySource = {
        get hidden() {
            return hidden
        },
        addEventListener: (_type, listener) => {
            listeners.add(listener)
        },
        removeEventListener: (_type, listener) => {
            listeners.delete(listener)
        },
    }
    const visibility = options.visibility ?? true

    const preference = { matches: options.reducedMotion ?? false }

    const clock = createClock({
        reducedMotion: preference,
        lagThreshold: options.lagThreshold,
        maxDeltaTime: options.maxDeltaTime,
        timeScale: options.timeScale,
        onError: options.onError,
        visibility: visibility ? source : false,
        requestFrame: (callback) => {
            const id = nextId++
            queue.set(id, callback)
            return id
        },
        cancelFrame: (id) => {
            queue.delete(id)
        },
        now: () => time,
    })

    const manual: ManualClock = {
        clock,
        get now() {
            return time
        },
        get pending() {
            return queue.size
        },
        frame(ms = 16) {
            time += ms
            const callbacks = [...queue.values()]
            queue.clear()
            for (const callback of callbacks) callback(time)
        },
        frames(count, ms = 16) {
            for (let i = 0; i < count; i++) manual.frame(ms)
        },
        advance(ms) {
            time += ms
        },
        drop() {
            queue.clear()
        },
        setHidden(value) {
            if (!visibility) {
                throw createAniError(
                    TypeError,
                    'ANI_INVALID_OPTIONS',
                    __ANI_DEV__
                        ? '[createManualClock] setHidden is unavailable: visibility is disabled (visibility: false).'
                        : ''
                )
            }
            hidden = value
            for (const listener of [...listeners]) listener()
        },
        setReducedMotion(on) {
            preference.matches = on
        },
    }
    return manual
}

export { resetDefaultClock }
