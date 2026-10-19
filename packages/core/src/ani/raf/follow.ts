import type { RunResult } from '~/ani/core'
import type { AnimationClockInterface } from '~/loop'
import { ani } from '~/nodes'
import type { Resolver } from '~/style/create_sheet'
import { timing as presets } from '~/timing'
import { RafAniTimeline } from './timeline'

/** Spring constants of a {@link follow}er, validated like `dynamicSpring`. */
export interface FollowSpring {
    /** Mass constant. */
    m: number
    /** Spring constant. */
    k: number
    /** Damping constant. */
    c: number
    /**
     * Distance and speed under which the follower counts as settled.
     * @default 1e-3
     */
    tolerance?: number
}

export interface FollowOptions {
    /**
     * Spring that pulls the value toward the target.
     * @default { m: 1, k: 170, c: 26 }
     */
    spring?: FollowSpring
    /**
     * Clock that drives the follower. Defaults to the shared clock.
     */
    clock?: AnimationClockInterface
}

export interface FollowSetOptions<G extends Record<string, number>> {
    /**
     * Velocity per key in units per second, replacing the carried velocity of
     * the given keys (the other keys keep theirs).
     */
    velocity?: Partial<G>
}

export interface FollowFrame<G extends Record<string, number>> {
    /** Current value. Shared by every listener of one notification: read-only. */
    state: Readonly<G>
    status: FollowStatus
}

export type FollowStatus = 'IDLE' | 'PLAYING'

export interface Follower<G extends Record<string, number>> {
    /** Frozen current value; the initial value before any motion. */
    readonly value: Readonly<G>
    /** Velocity in units per second, zeros when idle. */
    readonly velocity: Readonly<G>
    /** Where the motion is heading; equals `value` when idle. */
    readonly target: Readonly<G>
    /** `PLAYING` while moving, `IDLE` before any motion and once settled. */
    readonly status: FollowStatus
    /**
     * Merges `target` into the current target (immediately) and springs the
     * value toward it, keeping the current velocity. The promise resolves
     * `'ended'` once settled, `'interrupted'` when a later `set` / `jump`
     * replaces the motion and `'disposed'` after `dispose()`. Invalid input
     * throws synchronously and changes nothing.
     */
    set(target: Partial<G>, options?: FollowSetOptions<G>): Promise<RunResult>
    /**
     * Merges `value` into the current value and target at once: velocity 0,
     * `IDLE`, bound targets written and listeners notified synchronously.
     */
    jump(value: Partial<G>): void
    /**
     * Writes the value to `target.style` (commit phase, changed declarations
     * only). Writes the current value immediately.
     * @returns Unbind (idempotent).
     */
    bind(
        target: { style: CSSStyleDeclaration } | HTMLElement,
        options?: { resolver?: Resolver<Record<string, number>> }
    ): () => void
    /**
     * Subscribes to one frame per clock frame while moving, plus the
     * synchronous notification of `jump`.
     * @returns Unsubscribe.
     */
    onUpdate(listener: (frame: FollowFrame<G>) => void): () => void
    /** Stops the motion and drops bindings and listeners. Idempotent. */
    dispose(): void
}

const DEFAULT_SPRING: FollowSpring = { m: 1, k: 170, c: 26 }

/** Upper bound of one motion (seconds); a spring that has not settled snaps to its target. */
const HORIZON = 600

function describe(value: unknown): string {
    return Array.isArray(value)
        ? 'array'
        : value === null
          ? 'null'
          : typeof value
}

/**
 * Creates a value that chases a target with a spring. Setting a new target
 * keeps the current velocity, so repeated input builds on where the motion is
 * heading (`target`) instead of where it currently is.
 *
 * @param initial Initial value; its keys are fixed for the follower's life.
 * @param options Spring constants and clock.
 */
export function follow<G extends Record<string, number>>(
    initial: G,
    options: FollowOptions = {}
): Follower<G> {
    return new FollowerImpl<G>(initial, options)
}

class FollowerImpl<G extends Record<string, number>> implements Follower<G> {
    private readonly _keys: readonly string[]
    private readonly _zeros: Readonly<G>
    private readonly _timeline: RafAniTimeline<Record<string, number>>
    private readonly _listeners = new Set<(frame: FollowFrame<G>) => void>()

    private _target: Readonly<G>
    private _initial: Readonly<G>
    // velocity of the latest play(), until a frame has advanced
    private _seed: Readonly<G>
    private _muted = false
    private _landing = false
    // number of runs started, to tell whether a nested play replaced one
    private _runs = 0
    private _disposed = false
    private _lastValue: Readonly<G> | null = null

    constructor(initial: G, options: FollowOptions) {
        if (
            typeof initial !== 'object' ||
            initial === null ||
            Array.isArray(initial)
        ) {
            throw new TypeError(
                `[follow] \`initial\` must be a record of numbers, received ${describe(initial)}.`
            )
        }
        const keys = Object.keys(initial)
        const start: Record<string, number> = {}
        const zeros: Record<string, number> = {}
        for (const key of keys) {
            if (key === '__proto__') {
                throw new TypeError(
                    '[follow] `__proto__` can not be used as a property name.'
                )
            }
            const value = (initial as Record<string, unknown>)[key]
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                throw new TypeError(
                    `[follow] \`initial\` "${key}" must be a finite number, received ${String(value)}.`
                )
            }
            start[key] = value
            zeros[key] = 0
        }
        const spring = options.spring ?? DEFAULT_SPRING
        const timing = presets.dynamicSpring({ ...spring })

        this._keys = keys
        this._initial = Object.freeze(start) as Readonly<G>
        this._target = this._initial
        this._zeros = Object.freeze(zeros) as Readonly<G>
        this._seed = this._zeros
        this._timeline = new RafAniTimeline<Record<string, number>>(
            ani({ to: start, duration: HORIZON, timing }),
            options.clock === undefined ? undefined : { clock: options.clock }
        )
        this._timeline.onUpdate((frame) => {
            if (this._muted || this._listeners.size === 0) return
            const payload: FollowFrame<G> = {
                state: frame.state as Readonly<G>,
                status: this.status,
            }
            for (const listener of this._listeners) {
                try {
                    listener(payload)
                } catch (error) {
                    queueMicrotask(() => {
                        throw error
                    })
                }
            }
        })
    }

    get value(): Readonly<G> {
        if (this._disposed) return this._lastValue ?? this._initial
        return (this._timeline.value as Readonly<G> | null) ?? this._initial
    }

    get velocity(): Readonly<G> {
        if (this.status === 'IDLE') return this._zeros
        return (this._timeline.velocity as Readonly<G> | null) ?? this._seed
    }

    get target(): Readonly<G> {
        return this._target
    }

    get status(): FollowStatus {
        if (this._disposed || this._landing) return 'IDLE'
        return this._timeline.status === 'PLAYING' ? 'PLAYING' : 'IDLE'
    }

    set(target: Partial<G>, options?: FollowSetOptions<G>): Promise<RunResult> {
        const merged = this._merge(this._target, target, 'set')
        const carried = this._overrideVelocity(options?.velocity)
        if (this._disposed) return Promise.resolve('disposed')

        if (
            this.status === 'IDLE' &&
            this._equal(merged, this._target) &&
            (carried === null || this._equal(carried, this._zeros))
        ) {
            return Promise.resolve('ended')
        }

        const seed = carried ?? this.velocity
        this._target = merged
        this._seed = seed
        return this._run(this.value, merged, seed, true)
    }

    jump(value: Partial<G>): void {
        const merged = this._merge(this.value, value, 'jump')
        if (this._disposed) return
        this._target = merged
        this._seed = this._zeros
        this._land(merged)
    }

    bind(
        target: { style: CSSStyleDeclaration } | HTMLElement,
        options?: { resolver?: Resolver<Record<string, number>> }
    ): () => void {
        if (this._disposed) return () => undefined
        if (this._timeline.value === null) this._prime()
        return this._timeline.bind(target, options)
    }

    onUpdate(listener: (frame: FollowFrame<G>) => void): () => void {
        if (this._disposed) return () => undefined
        this._listeners.add(listener)
        return () => {
            this._listeners.delete(listener)
        }
    }

    dispose(): void {
        if (this._disposed) return
        this._lastValue = this.value
        this._disposed = true
        this._timeline.dispose()
        this._listeners.clear()
    }

    /** Gives the timeline the initial value (without notifying) so it can be bound. */
    private _prime(): void {
        this._muted = true
        try {
            this._land(this._initial)
        } finally {
            this._muted = false
        }
    }

    /**
     * Puts the timeline at `value`, paused. A listener that starts a new run
     * while this one notifies keeps its run: only the landing run is paused.
     */
    private _land(value: Readonly<G>): void {
        this._landing = true
        try {
            const id = this._runs + 1
            void this._run(value, value, this._zeros, false)
            if (this._runs === id) this._timeline.pause()
        } finally {
            this._landing = false
        }
    }

    private _run(
        from: Readonly<G>,
        to: Readonly<G>,
        velocity: Readonly<G>,
        quiet: boolean
    ): Promise<RunResult> {
        this._runs++
        const wasMuted = this._muted
        if (quiet) this._muted = true
        try {
            return this._timeline.play({
                from,
                keyframes: [to],
                velocity,
            })
        } finally {
            this._muted = wasMuted
        }
    }

    /** Validated copy of `base` with `partial` laid over it, frozen. */
    private _merge(
        base: Readonly<G>,
        partial: unknown,
        method: string
    ): Readonly<G> {
        const changes = this._validate(partial, method, 'value')
        const merged: Record<string, number> = {}
        for (const key of this._keys) {
            merged[key] = key in changes ? changes[key]! : base[key]!
        }
        return Object.freeze(merged) as Readonly<G>
    }

    /** Velocity of a `set` with `velocity` laid over the carried one, or `null`. */
    private _overrideVelocity(velocity: unknown): Readonly<G> | null {
        if (velocity === undefined) return null
        const changes = this._validate(velocity, 'set', 'velocity')
        const carried = this.velocity
        const merged: Record<string, number> = {}
        for (const key of this._keys) {
            merged[key] = key in changes ? changes[key]! : carried[key]!
        }
        return Object.freeze(merged) as Readonly<G>
    }

    private _validate(
        input: unknown,
        method: string,
        what: string
    ): Record<string, number> {
        if (
            typeof input !== 'object' ||
            input === null ||
            Array.isArray(input)
        ) {
            throw new TypeError(
                `[follow] \`${method}()\` ${what} must be a record of numbers, received ${describe(input)}.`
            )
        }
        const changes = Object.create(null) as Record<string, number>
        const record = input as Record<string, unknown>
        for (const key of Object.keys(record)) {
            if (!this._keys.includes(key)) {
                throw new TypeError(
                    `[follow] \`${method}()\` received unknown key "${key}"; keys are fixed by \`initial\` (${this._keys.join(', ')}).`
                )
            }
            const entry = record[key]
            if (typeof entry !== 'number' || !Number.isFinite(entry)) {
                throw new TypeError(
                    `[follow] \`${method}()\` ${what} "${key}" must be a finite number, received ${String(entry)}.`
                )
            }
            changes[key] = entry
        }
        return changes
    }

    private _equal(a: Readonly<G>, b: Readonly<G>): boolean {
        for (const key of this._keys) {
            if (a[key] !== b[key]) return false
        }
        return true
    }
}
