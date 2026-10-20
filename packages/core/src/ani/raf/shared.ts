/**
 * Helpers shared by the RAF primitives. They are deliberately small and
 * dependency-free so the hot paths do not gain a module cycle.
 */

/** Times one listener may be on the stack: its call plus one nested notification. */
export const MAX_REENTRY = 2

/** Reports a callback/listener error without breaking the current frame. */
export function reportAsync(error: unknown): void {
    queueMicrotask(() => {
        throw error
    })
}

export function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}
