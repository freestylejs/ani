import type { WebAniKeyframe } from '~/ani/waapi/compiler'

/**
 * A reference implementation of the WAAPI keyframe model: properties are
 * interpolated linearly between two neighbouring keyframes, with the easing
 * declared on the starting keyframe remapping the interpolation progress.
 *
 * This is intentionally independent from the library's compiler and timing
 * code; it exists to check RAF/WAAPI agreement from the outside.
 */

interface CubicBezier {
    x1: number
    y1: number
    x2: number
    y2: number
}

/**
 * Bisection steps for x(t) = progress. 60 halvings leave the solved progress
 * far below the 1e-9 accuracy the tests compare with.
 */
const SOLVE_STEPS = 60

/** Absorbs the rounding of `offset * duration / duration`. */
const OFFSET_EPSILON = 1e-12

/** `linear` -> `null`; `cubic-bezier(...)` -> its four control values. */
export function parseEasing(easing: string | undefined): CubicBezier | null {
    if (easing === undefined || easing === 'linear') return null
    const match = /^cubic-bezier\(([^)]+)\)$/.exec(easing)
    if (match === null) {
        throw new TypeError(
            `[waapi_reference] unsupported easing "${easing}"; expected "linear" or "cubic-bezier(...)".`
        )
    }
    const parts = match[1]!.split(',').map((part) => Number(part.trim()))
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
        throw new TypeError(`[waapi_reference] malformed easing "${easing}".`)
    }
    return {
        x1: parts[0]!,
        y1: parts[1]!,
        x2: parts[2]!,
        y2: parts[3]!,
    }
}

function cubic(control1: number, control2: number, t: number): number {
    const inverse = 1 - t
    return (
        3 * inverse * inverse * t * control1 +
        3 * inverse * t * t * control2 +
        t * t * t
    )
}

/** Eased progress of `progress` (both in `[0, 1]`). */
export function easeValue(
    easing: string | undefined,
    progress: number
): number {
    if (progress <= 0) return 0
    if (progress >= 1) return 1
    const bezier = parseEasing(easing)
    if (bezier === null) return progress
    let low = 0
    let high = 1
    for (let i = 0; i < SOLVE_STEPS; i++) {
        const mid = (low + high) / 2
        if (cubic(bezier.x1, bezier.x2, mid) < progress) low = mid
        else high = mid
    }
    return cubic(bezier.y1, bezier.y2, (low + high) / 2)
}

/** Reads a keyframe value, parsing numeric strings; throws for anything else. */
export function numericValue(
    value: string | number | null | undefined
): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value)
        if (Number.isFinite(parsed)) return parsed
    }
    throw new TypeError(
        `[waapi_reference] keyframe value ${String(value)} is not numeric.`
    )
}

/**
 * The reference WAAPI value of `key` at `time` seconds.
 *
 * Keyframes sharing an offset follow the Web Animations rule: at and after
 * that offset the value comes from the last of them (and its easing drives the
 * next interval), while interpolation into the offset from the previous one
 * ends at the first of them.
 */
export function referenceValueAt(
    keyframes: readonly WebAniKeyframe[],
    duration: number,
    time: number,
    key: string
): number {
    const normalized = duration === 0 ? 0 : time / duration
    let index = 0
    while (
        index < keyframes.length - 1 &&
        keyframes[index + 1]!.offset <= normalized + OFFSET_EPSILON
    ) {
        index++
    }
    const start = keyframes[index]!
    const end = keyframes[index + 1]
    const startValue = numericValue(start[key])
    if (end === undefined || normalized <= start.offset) return startValue
    const endValue = numericValue(end[key])
    const progress = (normalized - start.offset) / (end.offset - start.offset)
    const eased = easeValue(start.easing, progress)
    return startValue + (endValue - startValue) * eased
}
