import type { BezierTimingFunction } from '~/timing'

/** Residual of x(t) at which the solve stops. */
const X_EPSILON = 1e-14
const MAX_ITERATIONS = 64
/** Below this slope Newton steps are unreliable: bisect. */
const MIN_SLOPE = 1e-6

/**
 * Eased progress of a cubic-bezier timing for normalized time `x`.
 *
 * The solver of `BezierTimingFunction.ease` stops after a few steps (about
 * 1e-7 accurate) and is not continuous: two times an ulp apart may get
 * progress values 1e-7 apart. The runtime needs the plan to evaluate the same
 * wherever a loop is represented, so it solves x(t) = x to convergence here.
 */
export function bezierProgress(
    timing: BezierTimingFunction,
    x: number
): number {
    const { p2, p3 } = timing.opt
    if (p2.x === p2.y && p3.x === p3.y) return x
    if (x <= 0) return 0
    if (x >= 1) return 1

    const ax = 1 - 3 * p3.x + 3 * p2.x
    const bx = 3 * p3.x - 6 * p2.x
    const cx = 3 * p2.x
    let low = 0
    let high = 1
    let t = x
    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const residual = ((ax * t + bx) * t + cx) * t - x
        if (Math.abs(residual) < X_EPSILON) break
        if (residual > 0) high = t
        else low = t
        const slope = (3 * ax * t + 2 * bx) * t + cx
        const next = slope > MIN_SLOPE ? t - residual / slope : (low + high) / 2
        t = next > low && next < high ? next : (low + high) / 2
    }

    const ay = 1 - 3 * p3.y + 3 * p2.y
    const by = 3 * p3.y - 6 * p2.y
    const cy = 3 * p2.y
    return ((ay * t + by) * t + cy) * t
}
