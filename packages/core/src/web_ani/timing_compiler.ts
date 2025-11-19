import { BezierTimingFunction } from '~/timing/bezier'
import { LinearTimingFunction, type TimingFunction } from '../timing'

/**
 * Converts a TimingFunction instance into a WAAPI easing string.
 *
 * @param timing The TimingFunction instance to compile.
 * @returns A valid CSS easing string (e.g., 'linear', 'cubic-bezier(...)').
 */
export function compileTiming(timing: TimingFunction | undefined): string {
    if (!timing) {
        return 'linear'
    }

    if (timing instanceof LinearTimingFunction) {
        return 'linear'
    }

    if (timing instanceof BezierTimingFunction) {
        const { p2, p3 } = timing.opt
        return `cubic-bezier(${p2.x}, ${p2.y}, ${p3.x}, ${p3.y})`
    }

    // Fallback for unknown or unsupported timing functions (e.g., Spring, DynamicSpring)
    // Ideally, we should sample these into keyframes, but for now, we default to linear
    // to ensure valid output, or we could throw/warn.
    // Since WAAPI keyframes can be dense, a future improvement would be to return 'linear'
    // here but have the caller sample the function if it detects a non-compilable type.

    // For now, return linear.
    return 'linear'
}
