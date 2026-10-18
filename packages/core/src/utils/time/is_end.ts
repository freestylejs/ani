/**
 * Time (in seconds) below which a remaining span is treated as "already ended".
 * Only meant to absorb floating point accumulation error; it must stay far
 * below any real animation duration (sub-millisecond segments are legal).
 */
export const END_TOLERANCE = 1e-9

export function isEndOfAnimation(
    currentT: number,
    duration: number,
    tolerance: number = END_TOLERANCE
): boolean {
    return Math.abs(currentT - duration) <= tolerance || currentT >= duration
}
