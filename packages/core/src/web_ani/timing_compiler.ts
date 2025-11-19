import { BezierTimingFunction } from '~/timing/bezier'
import { LinearTimingFunction, type TimingFunction } from '../timing'

/**
 * Converts a TimingFunction instance into a WAAPI easing string.
 *
 * @param timing The TimingFunction instance to compile.
 * @returns A valid CSS easing string (e.g., 'linear', 'cubic-bezier(...)'), or null if sampling is required.
 */
export function compileTiming(
    timing: TimingFunction | undefined
): string | null {
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

    // Fallback for complex timing functions (e.g., Spring)
    // Return null to signal that we should sample the values into keyframes.
    return null
}
