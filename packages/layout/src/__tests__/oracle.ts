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
    const tau =
        t <= 0 ? 0 : spec.duration <= 0 ? 1 : Math.min(1, t / spec.duration)
    const e = easing(spec.timing, tau)
    const s0 = easingSlope0(spec.timing)
    const c: number[] = []
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
