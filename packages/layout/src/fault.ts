/**
 * The internal fault-injection seam of the transactional boundary (§9.2).
 *
 * Tests arm one point with an error; the engine throws it there, exactly
 * once. In production the module is inert: `inject` does nothing and
 * `layoutFault` returns, so no build keeps a live injection path. It is not
 * exported from the package.
 */
import { DEV } from '@freestylejs/ani-core'

export type LayoutFaultPoint =
    | 'measure'
    | 'write'
    | 'animate'
    | 'onSnap'
    | 'diagnostic'

const armed = new Map<LayoutFaultPoint, unknown>()

/** Arms `point` to throw `error` (default: a new `Error`) once. Development only. */
export function injectLayoutFault(
    point: LayoutFaultPoint,
    error: unknown = new Error(`injected layout fault: ${point}`)
): void {
    if (!DEV) return
    armed.set(point, error)
}

/** Disarms every point. */
export function clearLayoutFaults(): void {
    armed.clear()
}

/** Throws `point`'s armed error, once, when this is a development build. */
export function layoutFault(point: LayoutFaultPoint): void {
    if (!DEV) return
    if (!armed.has(point)) return
    const error = armed.get(point)
    armed.delete(point)
    throw error
}
