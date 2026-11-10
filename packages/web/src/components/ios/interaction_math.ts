/** Pure product interaction policy. No DOM, clock or replacement animation engine. */
import type { LayoutMotion } from '@freestylejs/ani-layout'

export function finiteClamp(value: number, min: number, max: number): number {
    if (![value, min, max].every(Number.isFinite) || min > max) {
        throw new RangeError(
            'Expected a finite value and ordered finite bounds.'
        )
    }
    return Math.max(min, Math.min(max, value))
}

export function rubberBand(distance: number, limit: number): number {
    if (!Number.isFinite(distance) || !Number.isFinite(limit) || limit <= 0) {
        throw new RangeError(
            'Elastic distance must be finite and its limit positive.'
        )
    }
    return (limit * distance) / (limit + Math.abs(distance))
}

export function sliderPose(raw: number, height: number, maxPull = 20) {
    if (!Number.isFinite(height) || height <= 0)
        throw new RangeError('Slider height must be positive.')
    const value = finiteClamp(raw, 0, 1)
    const pull = rubberBand((value - raw) * height, maxPull)
    const amount = Math.abs(pull) / maxPull
    return { value, pull, sx: 1 - 0.08 * amount, sy: 1 + 0.08 * amount }
}

export interface PointerSample {
    readonly x: number
    readonly y: number
    readonly time: number
}

const SAMPLE_WINDOW_MS = 80
const MIN_SAMPLE_SPAN_MS = 8
const MAX_SAMPLES = 32

/** Bound memory and reject non-monotone/coalesced duplicates, using event time only. */
export function recordSample(
    samples: PointerSample[],
    sample: PointerSample
): void {
    if (![sample.x, sample.y, sample.time].every(Number.isFinite)) return
    const last = samples.at(-1)
    if (last && sample.time < last.time) return
    // Coalesced / final-up events may share a timer-resolution bucket. Keep
    // the latest position without manufacturing a zero-duration velocity.
    if (last && sample.time === last.time) samples[samples.length - 1] = sample
    else samples.push(sample)
    while (
        samples.length > 1 &&
        samples[0]!.time < sample.time - SAMPLE_WINDOW_MS
    )
        samples.shift()
    if (samples.length > MAX_SAMPLES)
        samples.splice(0, samples.length - MAX_SAMPLES)
}

export function sampleVelocity(samples: readonly PointerSample[]): {
    x: number
    y: number
} {
    const last = samples.at(-1)
    const first =
        last &&
        samples.find((sample) => {
            const span = last.time - sample.time
            return span >= MIN_SAMPLE_SPAN_MS && span <= SAMPLE_WINDOW_MS
        })
    if (!first || !last) return { x: 0, y: 0 }
    const seconds = (last.time - first.time) / 1000
    return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds }
}

/** Product snap policy, not a recovered private Motion implementation. */
export function swipeRelease(
    x: number,
    velocity: number,
    width: number,
    reveal: number,
    fullSwipeRatio = 0.8
): { target: number; action: 'left' | 'right' | null } {
    if (
        ![x, velocity, width, reveal, fullSwipeRatio].every(Number.isFinite) ||
        width <= 0 ||
        reveal < 0 ||
        reveal > width ||
        fullSwipeRatio <= 0 ||
        fullSwipeRatio > 1
    ) {
        throw new RangeError('Invalid swipe bounds.')
    }
    if (Math.abs(x) >= width * fullSwipeRatio) {
        return {
            target: Math.sign(x) * width,
            action: x > 0 ? 'left' : 'right',
        }
    }
    const projected = x + velocity * 0.12
    return {
        target:
            Math.abs(projected) > reveal * 0.45
                ? Math.sign(projected) * reveal
                : 0,
        action: null,
    }
}

export function exposureAt(
    start: number,
    deltaX: number,
    pixelsPerStep: number
): number {
    if (!Number.isFinite(pixelsPerStep) || pixelsPerStep <= 0)
        throw new RangeError('Exposure spacing must be positive.')
    return finiteClamp(start - deltaX / pixelsPerStep, -100, 100)
}

/** Bounded elastic drag in displayed coordinates, including a re-caught overshoot. */
export function exposureDrag(start: number, delta: number): number {
    if (![start, delta].every(Number.isFinite))
        throw new RangeError('Exposure drag must be finite.')
    const origin = finiteClamp(start, -115, 115)
    const next = origin + delta
    if (origin > 100 && delta >= 0) {
        const room = 115 - origin
        return room > 0 ? origin + rubberBand(delta, room) : origin
    }
    if (origin < -100 && delta <= 0) {
        const room = origin + 115
        return room > 0 ? origin + rubberBand(delta, room) : origin
    }
    // Moving inward from an elastic catch consumes the displayed overshoot
    // one-to-one; do not apply the rubber band a second time to that pose.
    if (next > 100 && origin <= 100) return 100 + rubberBand(next - 100, 15)
    if (next < -100 && origin >= -100) return -100 + rubberBand(next + 100, 15)
    return next
}

export function exposureBrightness(value: number): number {
    return 2 ** (finiteClamp(value, -100, 100) / 100)
}

/**
 * Product reconstruction from the public neutral/positive-exposure frames:
 * 13px pitch on a 500px ruler, bottom-aligned 20px ticks/40px zero marker,
 * the traversed half collapses while the opposite half exits at the edge.
 * This is visual policy, not Motion's private Carousel implementation.
 */
export function exposureNotch(tick: number, value: number, activity = 0) {
    const v = finiteClamp(value, -115, 115)
    const active = finiteClamp(activity, 0, 1)
    const x = tick * 2.6 - v * 2
    const edge = finiteClamp((250 - Math.abs(x)) / 75, 0, 1)
    const collapsed =
        tick === 0 ? 0 : finiteClamp((Math.sign(tick) * v) / 100, 0, 1)
    const side = 1 - collapsed * collapsed * (3 - 2 * collapsed)
    const emphasis = active * Math.max(0, 1 - Math.abs(x) / 100)
    return {
        height: tick === 0 ? 40 : 20 + 20 * emphasis,
        opacity: edge * side * (tick === 0 ? 1 : 0.6 + emphasis * 0.4),
        emphasis,
    }
}

/** Same mass/stiffness/damping law, expressed by Ani's existing duration/bounce API. */
export function layoutSpring(
    stiffness: number,
    damping: number,
    mass = 1
): LayoutMotion {
    if (
        ![stiffness, damping, mass].every(Number.isFinite) ||
        stiffness <= 0 ||
        damping <= 0 ||
        mass <= 0
    )
        throw new RangeError('Spring parameters must be positive and finite.')
    const omega = Math.sqrt(stiffness / mass)
    const zeta = damping / (2 * Math.sqrt(stiffness * mass))
    return {
        type: 'spring',
        duration: (2 * Math.PI) / omega,
        bounce: zeta <= 1 ? 1 - zeta : 1 / zeta - 1,
    }
}
