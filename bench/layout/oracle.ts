/**
 * The independent P5 oracle.
 *
 * This module intentionally imports nothing. Timing curves, the physical
 * spring, the settle rule, the perceptual timeline, crossfade opacity and the
 * radius blend are re-derived from `ARCHITECTURE.md` §5.2, §5.3, §5.8 and
 * §5.9. It shares no code with `packages/layout` (`solve`, `plan`, `motion`,
 * `dom`) or core `physics`; the numerical integrator below is a second,
 * independent implementation used to test the closed form.
 */

export interface Box {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
}

export interface Vec {
    readonly x: number
    readonly y: number
}

export type SpringMotion = {
    readonly type: 'spring'
    readonly duration: number
    readonly bounce: number
}

export type TimingMotion = {
    readonly type: 'timing'
    readonly duration: number
    readonly easing: 'linear' | 'ease-out' | 'ease-in'
}

export type Motion = SpringMotion | TimingMotion

export interface TrackState {
    readonly box: Box
    /** Per-edge velocity in px/s: left edge, top edge, right edge, bottom edge. */
    readonly velocity: Box
}

/* ───────────────────────── easing ───────────────────────── */

export interface CubicBezier {
    readonly x1: number
    readonly y1: number
    readonly x2: number
    readonly y2: number
}

export const LINEAR: CubicBezier = { x1: 0, y1: 0, x2: 1, y2: 1 }
export const EASE_OUT: CubicBezier = { x1: 0, y1: 0, x2: 0.58, y2: 1 }
export const EASE_IN: CubicBezier = { x1: 0.42, y1: 0, x2: 1, y2: 1 }

function bezierCoordinate(a: number, b: number, s: number): number {
    const inv = 1 - s
    return 3 * inv * inv * s * a + 3 * inv * s * s * b + s * s * s
}

function bezierDerivative(a: number, b: number, s: number): number {
    const inv = 1 - s
    return 3 * inv * inv * a + 6 * inv * s * (b - a) + 3 * s * s * (1 - b)
}

/** `x` on the curve at parameter `s`. */
export function bezierX(curve: CubicBezier, s: number): number {
    return bezierCoordinate(curve.x1, curve.x2, s)
}

/** `y` on the curve at parameter `s`. */
export function bezierY(curve: CubicBezier, s: number): number {
    return bezierCoordinate(curve.y1, curve.y2, s)
}

/**
 * The curve as a function of normalized progress `tau`, with its slope. The
 * x parameter is solved by Newton's method with a bisection fallback.
 */
export function bezierAt(
    curve: CubicBezier,
    tau: number
): { value: number; slope: number } {
    if (tau <= 0) {
        return { value: bezierY(curve, 0), slope: bezierSlope0(curve) }
    }
    if (tau >= 1) {
        const endSlope = ((): number => {
            const dx = bezierDerivative(curve.x1, curve.x2, 1)
            const dy = bezierDerivative(curve.y1, curve.y2, 1)
            return dx === 0 ? 0 : dy / dx
        })()
        return { value: bezierY(curve, 1), slope: endSlope }
    }
    let lo = 0
    let hi = 1
    let s = tau
    for (let i = 0; i < 12; i++) {
        const x = bezierX(curve, s) - tau
        if (Math.abs(x) < 1e-12) break
        if (x > 0) hi = s
        else lo = s
        const dx = bezierDerivative(curve.x1, curve.x2, s)
        const next = dx === 0 ? Number.NaN : s - x / dx
        s =
            Number.isFinite(next) && next > lo && next < hi
                ? next
                : (lo + hi) / 2
    }
    const dx = bezierDerivative(curve.x1, curve.x2, s)
    const dy = bezierDerivative(curve.y1, curve.y2, s)
    return { value: bezierY(curve, s), slope: dx === 0 ? 0 : dy / dx }
}

/**
 * e′(0) of the normalized cubic bezier. When the first derivatives vanish the
 * limit of the second (then third) derivatives decides, per §5.2.
 */
export function bezierSlope0(curve: CubicBezier): number {
    if (curve.x1 > 0) return curve.y1 / curve.x1
    if (curve.y1 !== 0) return Number.NaN
    if (curve.x2 > 0) return curve.y2 / curve.x2
    if (curve.y2 === 0) return 1
    return Number.NaN
}

/* ───────────────────────── spring ───────────────────────── */

export function springOmega(duration: number): number {
    return (2 * Math.PI) / duration
}

export function springZeta(bounce: number): number {
    return bounce >= 0 ? 1 - bounce : 1 / (1 + bounce)
}

/**
 * `d(t)` and `d′(t)` of the damped oscillator of §5.3, in the textbook
 * exponential forms. `x0` is the displacement `B − A`; `v0` the incoming
 * velocity in px/s.
 */
export function springDisplacement(
    duration: number,
    bounce: number,
    x0: number,
    v0: number,
    t: number
): { d: number; v: number } {
    if (t <= 0) return { d: x0, v: v0 }
    const w = springOmega(duration)
    const z = springZeta(bounce)
    if (Math.abs(z - 1) < 1e-12) {
        const e = Math.exp(-w * t)
        const c = v0 + w * x0
        return {
            d: (x0 + c * t) * e,
            v: (c - w * (x0 + c * t)) * e,
        }
    }
    if (z < 1) {
        const wd = w * Math.sqrt(1 - z * z)
        const e = Math.exp(-z * w * t)
        const b = (v0 + z * w * x0) / wd
        const d = e * (x0 * Math.cos(wd * t) + b * Math.sin(wd * t))
        const v =
            -z * w * d +
            e * (-x0 * wd * Math.sin(wd * t) + b * wd * Math.cos(wd * t))
        return { d, v }
    }
    const q = Math.sqrt(z * z - 1)
    const r1 = -w * (z - q)
    const r2 = -w * (z + q)
    const c1 = (v0 - r2 * x0) / (r1 - r2)
    const c2 = x0 - c1
    return {
        d: c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t),
        v: c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t),
    }
}

function springAcceleration(
    duration: number,
    bounce: number,
    displacement: number,
    velocity: number
): number {
    const w = springOmega(duration)
    const z = springZeta(bounce)
    return -2 * z * w * velocity - w * w * displacement
}

/** An explicit envelope bound on `|d|` and `|v|` after `t` seconds. */
function springEnvelope(
    duration: number,
    bounce: number,
    x0: number,
    v0: number,
    t: number
): { d: number; v: number } {
    const w = springOmega(duration)
    const z = springZeta(bounce)
    if (Math.abs(z - 1) < 1e-12) {
        const c = v0 + w * x0
        const e = Math.exp(-w * t)
        return {
            d: (Math.abs(x0) + Math.abs(c) * t) * e,
            v: (Math.abs(v0) + w * Math.abs(c) * t) * e,
        }
    }
    if (z < 1) {
        const wd = w * Math.sqrt(1 - z * z)
        const b = (v0 + z * w * x0) / wd
        const amplitude = Math.hypot(x0, b)
        const e = Math.exp(-z * w * t)
        return {
            d: amplitude * e,
            v: (z * w + wd) * amplitude * e,
        }
    }
    const q = Math.sqrt(z * z - 1)
    const r1 = -w * (z - q)
    const r2 = -w * (z + q)
    const c1 = (v0 - r2 * x0) / (r1 - r2)
    const c2 = x0 - c1
    const e = Math.exp(r1 * t)
    return {
        d: (Math.abs(c1) + Math.abs(c2)) * e,
        v: (Math.abs(c1 * r1) + Math.abs(c2 * r2)) * e,
    }
}

/**
 * The physical settle time of §5.3: the first instant after which every
 * channel stays within 0.1 px of the target and its speed within 1 px/s.
 * Extrema are found numerically, then the last tolerance crossing is
 * bisected. This is the independent implementation of the rule; the engine's
 * value is not read.
 */
export function springSettle(
    duration: number,
    bounce: number,
    x0: number,
    v0: number,
    positionTolerance = 0.1,
    speedTolerance = 1
): number {
    if (x0 === 0 && v0 === 0) return 0
    const w = springOmega(duration)
    let bound = Math.max(duration, 1 / w)
    for (;;) {
        const env = springEnvelope(duration, bounce, x0, v0, bound)
        if (env.d <= positionTolerance && env.v <= speedTolerance) break
        bound *= 2
        if (bound > 1e6) return Number.POSITIVE_INFINITY
    }
    // The magnitude of d and v can only change between extrema; sample densely
    // enough to see every one, then refine the last tolerance crossing.
    const steps = Math.max(
        200,
        Math.ceil(bound / Math.max(1e-4, duration / 800))
    )
    const candidates: number[] = [0]
    let previousV = springDisplacement(duration, bounce, x0, v0, 0).v
    let previousA = springAcceleration(duration, bounce, x0, previousV)
    for (let i = 1; i <= steps; i++) {
        const t = (bound * i) / steps
        const { d, v } = springDisplacement(duration, bounce, x0, v0, t)
        const a = springAcceleration(duration, bounce, d, v)
        if (previousV * v <= 0) candidates.push(t)
        if (previousA * a <= 0) candidates.push(t)
        previousV = v
        previousA = a
    }
    candidates.push(bound)
    const excess = (t: number): number => {
        const { d, v } = springDisplacement(duration, bounce, x0, v0, t)
        return Math.max(
            Math.abs(d) / positionTolerance,
            Math.abs(v) / speedTolerance
        )
    }
    let last = 0
    for (let i = 0; i < candidates.length; i++) {
        const t = candidates[i]!
        if (excess(t) > 1) last = t
        const next = candidates[i + 1]
        if (next === undefined || excess(t) <= 1) continue
        const interval = next - t
        const probe = Math.max(
            1,
            Math.ceil(interval / Math.max(1e-5, duration / 4000))
        )
        for (let k = 1; k <= probe; k++) {
            const at = t + (interval * k) / probe
            if (excess(at) > 1) last = at
        }
    }
    if (last === 0) return 0
    let lo = last
    let hi = Math.min(bound, last + Math.max(1e-4, duration / 400))
    while (excess(hi) > 1 && hi < bound) hi = Math.min(bound, hi * 1.5 + 1e-4)
    for (let i = 0; i < 80 && hi - lo > 1e-10; i++) {
        const mid = (lo + hi) / 2
        if (excess(mid) > 1) lo = mid
        else hi = mid
    }
    return hi
}

/**
 * The track's settle time: the maximum channel settle (§5.3). Channels are
 * the origin and the size, i.e. four independent displacements.
 */
export function settleOfBox(
    duration: number,
    bounce: number,
    from: Box,
    to: Box,
    velocity: Box | null
): number {
    const v = velocity ?? { x: 0, y: 0, w: 0, h: 0 }
    const channels: readonly (readonly [number, number, number])[] = [
        [from.x - to.x, v.x, to.x],
        [from.y - to.y, v.y, to.y],
        [from.w - to.w, v.w, to.w],
        [from.h - to.h, v.h, to.h],
    ]
    let settle = 0
    for (const [x0, v0] of channels) {
        settle = Math.max(settle, springSettle(duration, bounce, x0, v0))
    }
    return settle
}

/**
 * A fourth-order Runge-Kutta integration of `d″ + 2ζωd′ + ω²d = 0`. This is
 * the independent high-order reference (never used for scoring); the unit
 * tests compare it with `springDisplacement` and a 0.01 ms reference.
 */
export function integrateSpring(
    duration: number,
    bounce: number,
    x0: number,
    v0: number,
    t: number,
    step = 0.00001
): { d: number; v: number } {
    const w = springOmega(duration)
    const z = springZeta(bounce)
    const accel = (d: number, v: number): number => -2 * z * w * v - w * w * d
    let d = x0
    let v = v0
    let at = 0
    while (at < t) {
        const h = Math.min(step, t - at)
        const k1d = v
        const k1v = accel(d, v)
        const k2d = v + (h / 2) * k1v
        const k2v = accel(d + (h / 2) * k1d, v + (h / 2) * k1v)
        const k3d = v + (h / 2) * k2v
        const k3v = accel(d + (h / 2) * k2d, v + (h / 2) * k2v)
        const k4d = v + h * k3v
        const k4v = accel(d + h * k3d, v + h * k3v)
        d += (h / 6) * (k1d + 2 * k2d + 2 * k3d + k4d)
        v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v)
        at += h
    }
    return { d, v }
}

/* ───────────────────────── timing tracks ───────────────────────── */

export function easingOf(motion: TimingMotion): CubicBezier {
    return motion.easing === 'linear'
        ? LINEAR
        : motion.easing === 'ease-out'
          ? EASE_OUT
          : EASE_IN
}

/**
 * The §5.2 timing track. `tau = (elapsed - delay) / D`; before the delay the
 * channels hold `from`. `k = v0·D + (B − A)·e′(0)` carries the incoming
 * velocity, so `c′(0) = v0`.
 */
export function timingTrack(
    motion: TimingMotion,
    from: Box,
    to: Box,
    velocity: Box | null,
    elapsed: number
): TrackState {
    const delay = 0
    if (elapsed <= delay) {
        return { box: from, velocity: zeroBoxVelocity() }
    }
    const duration = motion.duration
    const tau = Math.min(1, (elapsed - delay) / duration)
    const curve = easingOf(motion)
    const e = bezierAt(curve, tau)
    const slope0 = bezierSlope0(curve)
    const v0 = velocity ?? zeroBoxVelocity()
    const channels: readonly (readonly [number, number, number])[] = [
        [from.x, to.x, v0.x],
        [from.y, to.y, v0.y],
        [from.w, to.w, v0.w],
        [from.h, to.h, v0.h],
    ]
    const values: number[] = []
    const rates: number[] = []
    for (const [b, a, v] of channels) {
        const k = v * duration + (b - a) * slope0
        const bump = k * tau * (1 - tau) * (1 - tau)
        values.push(a + (b - a) * (1 - e.value) + bump)
        const dtau = -(b - a) * e.slope + k * (1 - tau) * (1 - 3 * tau)
        rates.push(tau >= 1 ? 0 : dtau / duration)
    }
    return {
        box: {
            x: values[0]!,
            y: values[1]!,
            w: values[2]!,
            h: values[3]!,
        },
        velocity: {
            x: rates[0]!,
            y: rates[1]!,
            w: rates[2]!,
            h: rates[3]!,
        },
    }
}

/* ───────────────────────── tracks ───────────────────────── */

export function zeroBoxVelocity(): Box {
    return { x: 0, y: 0, w: 0, h: 0 }
}

/**
 * The box a track draws at `elapsed`, including the exact-A step at settle.
 * At and after settle the engine sets the channels to A (§5.3).
 */
export function trackState(
    motion: Motion,
    from: Box,
    to: Box,
    velocity: Box | null,
    elapsed: number,
    settle: number
): TrackState {
    if (elapsed >= settle) {
        return { box: to, velocity: zeroBoxVelocity() }
    }
    if (motion.type === 'timing') {
        return timingTrack(motion, from, to, velocity, elapsed)
    }
    const v0 = velocity ?? zeroBoxVelocity()
    const channels: readonly (readonly [number, number, number])[] = [
        [from.x - to.x, v0.x, to.x],
        [from.y - to.y, v0.y, to.y],
        [from.w - to.w, v0.w, to.w],
        [from.h - to.h, v0.h, to.h],
    ]
    const values: number[] = []
    const rates: number[] = []
    for (const [x0, v, target] of channels) {
        const { d, v: rate } = springDisplacement(
            motion.duration,
            motion.bounce,
            x0,
            v,
            elapsed
        )
        values.push(target + d)
        rates.push(rate)
    }
    return {
        box: {
            x: values[0]!,
            y: values[1]!,
            w: values[2]!,
            h: values[3]!,
        },
        velocity: {
            x: rates[0]!,
            y: rates[1]!,
            w: rates[2]!,
            h: rates[3]!,
        },
    }
}

/** Perceptual progress of a spring lead (§5.3), exactly 1 at `duration`. */
export function perceptualSpring(duration: number, elapsed: number): number {
    if (elapsed <= 0) return 0
    if (elapsed >= duration) return 1
    const w = springOmega(duration)
    const s = (t: number): number => 1 - (1 + w * t) * Math.exp(-w * t)
    return Math.min(1, Math.max(0, s(elapsed) / s(duration)))
}

/** The lead's perceptual progress for a timing lead (§5.3). */
export function perceptualTiming(
    motion: TimingMotion,
    elapsed: number
): number {
    if (elapsed <= 0) return 0
    const tau = Math.min(1, elapsed / motion.duration)
    return Math.min(1, Math.max(0, bezierAt(easingOf(motion), tau).value))
}

export function perceptualOf(motion: Motion, elapsed: number): number {
    return motion.type === 'spring'
        ? perceptualSpring(motion.duration, elapsed)
        : perceptualTiming(motion, elapsed)
}

/* ───────────────────────── crossfade and radius ───────────────────────── */

export function circOut(x: number): number {
    return Math.sqrt(1 - (1 - x) * (1 - x))
}

export function crossfade(
    p: number,
    fromLead: number,
    fromFollower: number
): { lead: number; follower: number } {
    const progress = Math.min(1, Math.max(0, p))
    const incoming = circOut(Math.min(1, progress / 0.5))
    const outgoing = Math.min(1, Math.max(0, (progress - 0.5) / 0.45))
    return {
        lead: fromLead + (1 - fromLead) * incoming,
        follower: fromFollower * (1 - outgoing),
    }
}

export function coverage(lead: number, follower: number): number {
    return 1 - (1 - lead) * (1 - follower)
}

export function blendRadius(from: number, to: number, p: number): number {
    return from + (to - from) * Math.min(1, Math.max(0, p))
}

/* ───────────────────────── box error ───────────────────────── */

export type Edge = 'left' | 'top' | 'right' | 'bottom'

export interface EdgeError {
    readonly max: number
    readonly edge: Edge
    readonly edges: Readonly<Record<Edge, number>>
}

export function edgeError(drawn: Box, expected: Box): EdgeError {
    const edges = {
        left: Math.abs(drawn.x - expected.x),
        top: Math.abs(drawn.y - expected.y),
        right: Math.abs(drawn.x + drawn.w - (expected.x + expected.w)),
        bottom: Math.abs(drawn.y + drawn.h - (expected.y + expected.h)),
    }
    let max = -1
    let edge: Edge = 'left'
    for (const key of ['left', 'top', 'right', 'bottom'] as const) {
        if (edges[key] > max) {
            max = edges[key]
            edge = key
        }
    }
    return { max, edge, edges }
}
