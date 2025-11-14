export function isEndOfAnimation(
    currentT: number,
    duration: number,
    tolerance: number = 1e-3
): boolean {
    return currentT === duration || currentT - duration >= tolerance
}
