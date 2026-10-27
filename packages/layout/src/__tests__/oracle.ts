/**
 * Independent oracle for the pure core: re-derives every expectation from the
 * architecture's equations. Shares no code with geometry.ts, motion.ts,
 * solve.ts or plan.ts.
 */
import type { TimingFunction } from '@freestylejs/ani-core'

export interface OBox {
    x: number
    y: number
    w: number
    h: number
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** e(τ) normalized to e(0) = 0, e(1) = 1 (ARCHITECTURE §5.1). */
export function easing(fn: TimingFunction, tau: number): number {
    const ctx = { dt: 0, from: 0, to: 1, duration: 1 }
    if (tau <= 0) return 0
    if (tau >= 1) return 1
    const raw = (t: number) => fn.step(t, ctx).value
    return raw(tau) - raw(0) * (1 - tau) + (1 - raw(1)) * tau
}

/** §5.6 asymmetric crossfade, re-derived from the authority spec. */
export function expectedCrossfade(
    fn: TimingFunction,
    tau: number,
    fromLead = 0,
    fromFollower = 1
): { lead: number; follower: number } {
    const p = Math.min(1, Math.max(0, easing(fn, tau)))
    const x = Math.min(1, p / 0.5)
    const incoming = Math.sqrt(1 - (1 - x) ** 2)
    const outgoing = Math.min(1, Math.max(0, (p - 0.5) / 0.45))
    return {
        lead: fromLead + (1 - fromLead) * incoming,
        follower: fromFollower * (1 - outgoing),
    }
}

/** §5.7 on-screen radius blend, re-derived from the authority spec. */
export function expectedRadiusBlend(
    from: readonly number[],
    to: readonly number[],
    fn: TimingFunction,
    tau: number
): number[] {
    const p = Math.min(1, Math.max(0, easing(fn, tau)))
    return from.map((value, i) => value + (to[i]! - value) * p)
}

/**
 * e′(0) of the normalized curve: raw′(0) + raw(0) + (1 − raw(1)), with raw′(0)
 * derived by hand per core timing kind (linear 1; a spring released from rest
 * 0; a bezier y′(0)/x′(0), or the limit of the second, then third derivatives
 * when the first ones vanish).
 */
export function easingSlope0(fn: TimingFunction): number {
    const ctx = { dt: 0, from: 0, to: 1, duration: 1 }
    const r0 = fn.step(0, ctx).value
    const r1 = fn.step(1, ctx).value
    const opt = (fn as { opt?: Record<string, unknown> }).opt
    let raw: number
    if (opt && 'p2' in opt) {
        const p2 = opt.p2 as { x: number; y: number }
        const p3 = opt.p3 as { x: number; y: number }
        // x(t) = 3(1−t)²t·x1 + 3(1−t)t²·x2 + t³, same for y
        if (p2.x > 0) raw = p2.y / p2.x
        else if (p2.y === 0 && p3.x > 0) raw = p3.y / p3.x
        else if (p2.y === 0 && p3.x === 0 && p3.y === 0) raw = 1
        else raw = Number.NaN
    } else if (opt && 'k' in opt) {
        raw = 0
    } else {
        raw = 1
    }
    if (Number.isNaN(raw)) {
        const h = 1e-6
        return (easing(fn, h) - easing(fn, 0)) / h
    }
    return raw + r0 + (1 - r1)
}

export interface OTrackSpec {
    before: OBox
    after: OBox
    /** Incoming velocity of a moving node; `null` at rest. */
    velocity: OBox | null
    /** origin point as fractions of the box */
    fx: number
    fy: number
    mode: true | 'position' | 'size'
    duration: number
    delay: number
    timing: TimingFunction
    /**
     * A physical spring instead of the curve (§5.3): its perceptual duration,
     * bounce, and the local time at which the track ends (its settle).
     */
    spring?: { duration: number; bounce: number; end: number } | undefined
}

/**
 * Displacement and velocity of the damped oscillator `d″ + 2ζω d′ + ω² d = 0`
 * with `ω = 2π/D`, `ζ = 1 − b` (b ≥ 0) or `1/(1 + b)` (b < 0), in the textbook
 * exponential forms (ARCHITECTURE §5.3).
 */
export function springOracle(
    D: number,
    b: number,
    x0: number,
    v0: number,
    t: number
): { d: number; v: number } {
    const w = (2 * Math.PI) / D
    const z = b >= 0 ? 1 - b : 1 / (1 + b)
    if (z === 1) {
        const e = Math.exp(-w * t)
        const c = v0 + w * x0
        return { d: (x0 + c * t) * e, v: (c - w * (x0 + c * t)) * e }
    }
    if (z < 1) {
        const wd = w * Math.sqrt(1 - z * z)
        const e = Math.exp(-z * w * t)
        const B = (v0 + z * w * x0) / wd
        const d = e * (x0 * Math.cos(wd * t) + B * Math.sin(wd * t))
        const v =
            -z * w * d +
            e * (-x0 * wd * Math.sin(wd * t) + B * wd * Math.cos(wd * t))
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

export const ORACLE_REDUCED_GRID = [
    1, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2, 0.1,
] as const
export const ORACLE_SETTLE_CAP = 10

/**
 * Physical settle time `inf { T >= 0 : for all t >= T, |d(t)| <= posTol and |v(t)| <= speedTol }`
 * derived directly from the closed-form oscillator `springOracle`, without
 * calling production `physics.spring` or `settleTime`.
 */
export function settleOracle(
    D: number,
    b: number,
    x0: number,
    v0: number,
    posTol = 0.1,
    speedTol = 1
): number {
    if (x0 === 0 && v0 === 0) return 0
    const w = (2 * Math.PI) / D
    const z = b >= 0 ? 1 - b : 1 / (1 + b)
    const points: number[] = [0]
    let hi = 0

    if (z === 1) {
        const c1 = x0
        const c2 = v0 + w * x0
        if (c2 !== 0) {
            const td = -c1 / c2
            const tv = (c2 - w * c1) / (w * c2)
            const ta = (2 * w * c2 - w * w * c1) / (w * w * c2)
            for (const t of [td, tv, ta]) {
                if (Number.isFinite(t) && t > 0) points.push(t)
            }
        }
        hi = Math.max(1 / w, ...points)
        while (
            (Math.abs(c1) + Math.abs(c2) * hi) * Math.exp(-w * hi) > posTol ||
            (Math.abs(c2 - w * c1) + w * Math.abs(c2) * hi) *
                Math.exp(-w * hi) >
                speedTol
        ) {
            hi *= 2
            if (hi > 1e6) return Number.POSITIVE_INFINITY
        }
    } else if (z > 1) {
        const q = Math.sqrt(z * z - 1)
        const r1 = -w * (z - q)
        const r2 = -w * (z + q)
        const c1 = (v0 - r2 * x0) / (r1 - r2)
        const c2 = x0 - c1
        if (c1 !== 0 && c2 !== 0) {
            for (const ratio of [
                -c2 / c1,
                -(c2 * r2) / (c1 * r1),
                -(c2 * r2 * r2) / (c1 * r1 * r1),
            ]) {
                if (ratio > 0) {
                    const t = Math.log(ratio) / (r1 - r2)
                    if (Number.isFinite(t) && t > 0) points.push(t)
                }
            }
        }
        hi = Math.max(1 / -r1, ...points)
        while (
            Math.abs(c1) * Math.exp(r1 * hi) +
                Math.abs(c2) * Math.exp(r2 * hi) >
                posTol ||
            Math.abs(c1 * r1) * Math.exp(r1 * hi) +
                Math.abs(c2 * r2) * Math.exp(r2 * hi) >
                speedTol
        ) {
            hi *= 2
            if (hi > 1e6) return Number.POSITIVE_INFINITY
        }
    } else {
        const wd = w * Math.sqrt(1 - z * z)
        const a = z * w
        const A = x0
        const B = (v0 + a * x0) / wd
        const C = v0
        const S = B * wd - a * A
        const C2 = S * wd - a * C
        const S2 = -C * wd - a * S
        const rd = Math.hypot(A, B)
        const rv = Math.hypot(C, S)
        const td = rd > posTol ? Math.log(rd / posTol) / a : 0
        const tv = rv > speedTol ? Math.log(rv / speedTol) / a : 0
        hi = Math.max(td, tv)
        if (hi === 0) return 0
        const lo = Math.max(0, hi - (2 * Math.PI) / wd)
        if (lo > 0) points.push(lo)
        const addTrigRoots = (P: number, Q: number) => {
            if (P === 0 && Q === 0) return
            const base = Math.atan2(-P, Q)
            const kMin = Math.floor((lo * wd - base) / Math.PI) - 1
            const kMax = Math.ceil((hi * wd - base) / Math.PI) + 1
            for (let k = kMin; k <= kMax; k++) {
                const t = (base + k * Math.PI) / wd
                if (t > lo && t < hi) points.push(t)
            }
        }
        addTrigRoots(A, B)
        addTrigRoots(C, S)
        addTrigRoots(C2, S2)
    }

    points.push(hi)
    points.sort((p, q) => p - q)

    const lastCrossing = (
        left: number,
        right: number,
        pick: (t: number) => number,
        tol: number
    ): number | null => {
        if (Math.abs(pick(right)) > tol) return right
        if (Math.abs(pick(left)) <= tol) return null
        let l = left
        let r = right
        for (let i = 0; i < 64; i++) {
            const m = 0.5 * (l + r)
            if (Math.abs(pick(m)) > tol) l = m
            else r = m
        }
        return r
    }

    for (let i = points.length - 2; i >= 0; i--) {
        const left = points[i]!
        const right = points[i + 1]!
        if (right <= left) continue
        const td = lastCrossing(
            left,
            right,
            (t) => springOracle(D, b, x0, v0, t).d,
            posTol
        )
        const tv = lastCrossing(
            left,
            right,
            (t) => springOracle(D, b, x0, v0, t).v,
            speedTol
        )
        if (td !== null || tv !== null) {
            return Math.max(td ?? 0, tv ?? 0)
        }
    }
    return 0
}

export interface OReducedSpring {
    readonly factor: number
    readonly duration: number
    readonly delay: number
    readonly bounce: number
    readonly carry: boolean
    readonly settle: number
}

/**
 * Independent reduced-motion spring selection (§9.4, §5.3): clamps `bounce` to
 * `<= 0`, searches `ORACLE_REDUCED_GRID` from largest to smallest first with
 * carried velocity and then from rest (`v0 = 0`), and applies the global 10 s
 * settle cap (`'spring-timeout'`) before accepting a candidate.
 */
export function reducedSpringOracle(
    duration: number,
    bounce: number,
    delay: number,
    maxDuration: number,
    channels: readonly { readonly x0: number; readonly v0: number }[]
): OReducedSpring | 'reduced' | 'spring-timeout' {
    const clampedBounce = Math.min(bounce, 0)
    for (const carry of [true, false]) {
        for (const factor of ORACLE_REDUCED_GRID) {
            const d = duration * factor
            let settle = 0
            for (const ch of channels) {
                settle = Math.max(
                    settle,
                    settleOracle(d, clampedBounce, ch.x0, carry ? ch.v0 : 0)
                )
            }
            if (delay * factor + settle <= maxDuration) {
                if (!(settle <= ORACLE_SETTLE_CAP)) return 'spring-timeout'
                return {
                    factor,
                    duration: d,
                    delay: delay * factor,
                    bounce: clampedBounce,
                    carry,
                    settle,
                }
            }
        }
    }
    return 'reduced'
}

/** §5.3 perceptual progress `min(1, s(t)/s(D))`, `s(t) = 1 − (1 + ωt)e^(−ωt)`. */
export function perceptualOracle(t: number, D: number): number {
    if (t <= 0) return 0
    const s = (x: number) => 1 - (1 + x) * Math.exp(-x)
    return Math.min(1, s((2 * Math.PI * t) / D) / s(2 * Math.PI))
}

/** §5.8 crossfade opacities from a progress `p`. */
export function crossfadeAt(
    p: number,
    fromLead = 0,
    fromFollower = 1
): { lead: number; follower: number } {
    const x = Math.min(1, p / 0.5)
    const incoming = Math.sqrt(1 - (1 - x) ** 2)
    const outgoing = Math.min(1, Math.max(0, (p - 0.5) / 0.45))
    return {
        lead: fromLead + (1 - fromLead) * incoming,
        follower: fromFollower * (1 - outgoing),
    }
}

/**
 * Expected drawn box of a track at `elapsed` seconds: per channel
 * c(τ) = A + (B − A)(1 − e) + kτ(1 − τ)², with k = vD + (B − A)e′(0) for a
 * moving node and k = 0 at rest, over the origin point and the size; pinned
 * channels stay at A; sizes floored.
 */
export function expectedBox(spec: OTrackSpec, elapsed: number): OBox {
    const { fx, fy } = spec
    const ch = (b: OBox) => [b.x + fx * b.w, b.y + fy * b.h, b.w, b.h]
    const B = ch(spec.before)
    const A = ch(spec.after)
    const V = spec.velocity && ch(spec.velocity)
    const t = elapsed - spec.delay
    const c: number[] = []
    if (spec.spring) {
        // c(t) = A + d(t), d(0) = B − A, d′(0) = v (0 at rest); A after the settle
        const { duration: D, bounce, end } = spec.spring
        for (let i = 0; i < 4; i++) {
            const pinned =
                i < 2 ? spec.mode === 'size' : spec.mode === 'position'
            const b = pinned ? A[i]! : B[i]!
            const a = A[i]!
            const v0 = pinned || !V ? 0 : V[i]!
            let v =
                t <= 0
                    ? b
                    : t >= end
                      ? a
                      : a + springOracle(D, bounce, b - a, v0, t).d
            if (i >= 2 && t > 0 && t < end) v = Math.max(v, Math.min(1, a, b))
            c.push(v)
        }
        return {
            x: c[0]! - fx * c[2]!,
            y: c[1]! - fy * c[3]!,
            w: c[2]!,
            h: c[3]!,
        }
    }
    const tau =
        t <= 0 ? 0 : spec.duration <= 0 ? 1 : Math.min(1, t / spec.duration)
    const e = easing(spec.timing, tau)
    const s0 = easingSlope0(spec.timing)
    for (let i = 0; i < 4; i++) {
        const pinned = i < 2 ? spec.mode === 'size' : spec.mode === 'position'
        const b = pinned ? A[i]! : B[i]!
        const a = A[i]!
        const k = pinned || !V ? 0 : V[i]! * spec.duration + (b - a) * s0
        let v =
            tau <= 0
                ? b
                : tau >= 1
                  ? a
                  : a + (b - a) * (1 - e) + k * tau * (1 - tau) ** 2
        if (i >= 2 && tau > 0 && tau < 1) v = Math.max(v, Math.min(1, a, b))
        c.push(v)
    }
    return { x: c[0]! - fx * c[2]!, y: c[1]! - fy * c[3]!, w: c[2]!, h: c[3]! }
}

/** A pose about the origin point, applied to a box: x ↦ O + t + s(x − O). */
export function applyPose(
    pose: { tx: number; ty: number; sx: number; sy: number },
    ox: number,
    oy: number,
    box: OBox
): OBox {
    return {
        x: ox + pose.tx + pose.sx * (box.x - ox),
        y: oy + pose.ty + pose.sy * (box.y - oy),
        w: pose.sx * box.w,
        h: pose.sy * box.h,
    }
}

type OPose = { tx: number; ty: number; sx: number; sy: number }

export const NO_POSE: OPose = { tx: 0, ty: 0, sx: 1, sy: 1 }

/** A node as the browser sees it: CSS box, origin point, own transform. */
export interface ONode {
    parent: number
    /** CSS box in the local frame (the parent's coordinates before its transforms) */
    css: OBox
    /** absolute origin point in the local frame */
    ox: number
    oy: number
    /** the element's own (inner) transform about the origin */
    inner: OPose
}

/**
 * What the browser draws for node `i`: its CSS box through its own inner
 * transform and then its pose (both about its origin), then the same for
 * every ancestor, root-ward. `poses` all identity gives the box at rest.
 */
export function rendered(
    i: number,
    nodes: readonly ONode[],
    poses: readonly OPose[]
): OBox {
    let box = nodes[i]!.css
    for (let j = i; j >= 0; j = nodes[j]!.parent) {
        const n = nodes[j]!
        box = applyPose(n.inner, n.ox, n.oy, box)
        box = applyPose(poses[j]!, n.ox, n.oy, box)
    }
    return box
}

export function maxDiff(a: OBox, b: OBox): number {
    return Math.max(
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y),
        Math.abs(a.w - b.w),
        Math.abs(a.h - b.h)
    )
}
