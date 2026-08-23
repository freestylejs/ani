export function isEndOfAnimation(
    currentT: number,
    duration: number,
    tolerance: number = 1e-3
): boolean {
    return Math.abs(currentT - duration) <= tolerance || currentT >= duration
}
