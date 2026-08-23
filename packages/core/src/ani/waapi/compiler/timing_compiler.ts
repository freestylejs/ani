import {
    BezierTimingFunction,
    LinearTimingFunction,
    type TimingFunction,
} from '~/timing'

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
        if (!(p2.x >= 0 && p2.x <= 1) || !(p3.x >= 0 && p3.x <= 1)) {
            throw new RangeError(
                '[compileTiming] cubic-bezier x values must be within [0, 1] per the CSS spec.'
            )
        }
        return `cubic-bezier(${p2.x}, ${p2.y}, ${p3.x}, ${p3.y})`
    }

    return null
}
