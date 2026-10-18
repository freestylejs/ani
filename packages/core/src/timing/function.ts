export interface TimingFunctionContext {
    /**
     * delta t
     */
    dt: number
    /**
     * from value, initial position (`s(0)`)
     */
    from: number
    /**
     * to value, original position (`s(f)`)
     */
    to: number
    /**
     * animation duration, but it is not possible for specific functions
     */
    duration: number
    /**
     * animation end tolerance
     */
    tolerance?: number
    /**
     * Mutable slot owned by the timeline's plan runtime: one object per
     * (timeline, segment, property), only provided when the timing function
     * declares `stateful = true`. Stateful timings keep their integrator state
     * here instead of on the instance, so one instance can safely be shared by
     * several segments, properties, loop iterations and timelines.
     *
     * A timing may publish `state.velocity` (units/second at the queried time)
     * for velocity-continuous retargeting.
     */
    state?: TimingState | undefined
    /**
     * Initial velocity (units/second) to seed a stateful timing with when its
     * state is (re)initialized. Ignored by stateless timings.
     */
    velocity?: number | undefined
}

export type TimingState = Record<string, any>

export abstract class TimingFunction {
    /**
     * Declare `true` for timings that integrate over time (physics).
     * The runtime then passes a private `context.state` per (timeline,
     * segment, property) and must be able to call `step` with arbitrary,
     * non-monotonic `time` (seek): re-derive from `state` deterministically.
     * Stateless timings (the default) are pure functions of `time`.
     */
    public readonly stateful?: boolean

    /**
     * Step function
     * @param time Current time
     * @param context Context for step calculation
     */
    public abstract step(
        time: number,
        context: TimingFunctionContext
    ): {
        value: number
        endOfAnimation: boolean
    }

    private static DEFAULT_TOLERANCE = 0.01 as const
    /**
     * Checks whether the animation has ended.
     *
     * @param time - The current time.
     * @param value - The computed value at the current time.
     * @param context - The animation context.
     * @returns {boolean} True if the animation is ended, false otherwise.
     */
    protected checkEnd(
        time: number,
        value: number,
        context: TimingFunctionContext,
        checkTimeOnly: boolean = true
    ): boolean {
        const tol =
            context.tolerance !== undefined
                ? context.tolerance
                : TimingFunction.DEFAULT_TOLERANCE
        const timeCondition = time >= context.duration
        const end = checkTimeOnly
            ? timeCondition
            : timeCondition && Math.abs(context.to - value) <= tol
        return end
    }
}

export interface Coord {
    x: number
    y: number
}
