import { TimingFunction, type TimingFunctionContext } from './function'

export class LinearTimingFunction extends TimingFunction {
    public step(
        time: number,
        context: TimingFunctionContext
    ): { value: number; endOfAnimation: boolean } {
        const progress =
            context.duration === 0
                ? 1
                : Math.max(0, Math.min(time / context.duration, 1))

        const value = context.from + (context.to - context.from) * progress

        return { value, endOfAnimation: time >= context.duration }
    }
}
