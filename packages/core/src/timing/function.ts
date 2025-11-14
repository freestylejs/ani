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
}
export abstract class TimingFunction {
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
