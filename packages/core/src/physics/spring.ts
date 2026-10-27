/**
 * The physical spring of perceptual duration and bounce (Apple's model: mass
 * 1, stiffness `(2π/D)²`). Pure closed forms: stateless, no clock, no DOM.
 */
import { createAniError } from '../error/ani_error'

declare const __ANI_DEV__: boolean

export interface SpringOptions {
    /** Perceptual duration in seconds, finite and > 0. */
    readonly duration: number
    /**
     * Bounce, finite and strictly inside (-1, 1). `0` is critically damped,
     * positive values overshoot, negative values are overdamped.
     * @default 0
     */
    readonly bounce?: number | undefined
}

/** When a spring counts as settled: position (px) and speed (px/s). */
export interface SettleTolerance {
    /** @default 0.1 */
    readonly position?: number | undefined
    /** @default 1 */
    readonly speed?: number | undefined
}

export interface Spring {
    readonly duration: number
    readonly bounce: number
    /** Undamped angular frequency `2π/D`. */
    readonly omega: number
    /** Damping ratio: `1 − b` for `b ≥ 0`, `1/(1 + b)` for `b < 0`. */
    readonly zeta: number
    /**
     * Displacement from the target at time `t` (s), from the initial
     * displacement `x0` and velocity `v0`. `at(0) = x0`, `velocity(0) = v0`.
     */
    at(t: number, x0: number, v0: number): number
    /** Time derivative of `at`. */
    velocity(t: number, x0: number, v0: number): number
    /**
     * First time after which the displacement stays within
     * `tolerance.position` and the speed within `tolerance.speed`, exact from
     * the closed form (the last exit from each tolerance). `Infinity` beyond
     * 1e4 seconds.
     */
    settleTime(x0: number, v0: number, tolerance?: SettleTolerance): number
}

const SERIES = 1e-3
const MAX_SETTLE = 1e4

function invalid(message: string): Error {
    return createAniError(
        RangeError,
        'ANI_INVALID_CONFIG',
        __ANI_DEV__ ? `[ani] ${message}` : ''
    )
}

function assertInitialState(x0: number, v0: number): void {
    if (typeof x0 !== 'number' || !Number.isFinite(x0)) {
        throw invalid(
            `spring initial displacement x0 must be finite, received ${String(x0)}.`
        )
    }
    if (typeof v0 !== 'number' || !Number.isFinite(v0)) {
        throw invalid(
            `spring initial velocity v0 must be finite, received ${String(v0)}.`
        )
    }
}

function assertEvalArgs(t: number, x0: number, v0: number): void {
    if (typeof t !== 'number' || !Number.isFinite(t)) {
        throw invalid(
            `spring time must be a finite number of seconds, received ${String(t)}.`
        )
    }
    assertInitialState(x0, v0)
}

/**
 * The two basis responses of `d″ + 2ζω d′ + ω² d = 0`: `u` with
 * `u(0) = 1, u′(0) = −ζω` and `w` with `w(0) = 0, w′(0) = 1`, so that
 * `d = x0·u + (v0 + ζω·x0)·w`. Written per regime so it stays exact near
 * critical damping and never overflows when heavily overdamped.
 */
function basis(
    t: number,
    alpha: number,
    g2: number
): { readonly u: number; readonly w: number } {
    if (g2 < 0) {
        const beta = Math.sqrt(-g2)
        const e = Math.exp(-alpha * t)
        const bt = beta * t
        const sinOver =
            Math.abs(bt) < SERIES
                ? t * (1 - (bt * bt) / 6)
                : Math.sin(bt) / beta
        return { u: e * Math.cos(bt), w: e * sinOver }
    }
    const gamma = Math.sqrt(g2)
    const gt = gamma * t
    if (gt < SERIES) {
        const e = Math.exp(-alpha * t)
        return { u: e * (1 + (gt * gt) / 2), w: e * t * (1 + (gt * gt) / 6) }
    }
    const p = Math.exp((gamma - alpha) * t)
    const q = Math.exp(-(gamma + alpha) * t)
    return { u: (p + q) / 2, w: (p - q) / (2 * gamma) }
}

/** Last time `h(t) = a·u + c·w` (a, c ≥ 0; g2 ≥ 0) exceeds `eps`. */
function lastCrossing(
    a: number,
    c: number,
    alpha: number,
    g2: number,
    eps: number,
    scale: number
): number {
    const h = (t: number) => {
        const { u, w } = basis(t, alpha, g2)
        return a * u + c * w
    }
    // u′ = −α·u + g2·w and w′ = u − α·w
    const slope = (t: number) => {
        const { u, w } = basis(t, alpha, g2)
        return a * (-alpha * u + g2 * w) + c * (u - alpha * w)
    }
    let hi = scale
    while (h(hi) > eps || slope(hi) > 0) {
        hi *= 2
        if (hi > MAX_SETTLE) return Number.POSITIVE_INFINITY
    }
    // h is decreasing, or rises once and then decreases (a sum of two decaying
    // exponentials with a non-negative slow coefficient): find its peak first
    let lo = 0
    if (slope(0) > 0) {
        let l = 0
        let r = hi
        for (let i = 0; i < 200 && r - l > 1e-12 * r; i++) {
            const m = (l + r) / 2
            if (slope(m) > 0) l = m
            else r = m
        }
        lo = r
    }
    if (h(lo) <= eps) return 0
    for (let i = 0; i < 200 && hi - lo > 1e-12 * hi; i++) {
        const m = (lo + hi) / 2
        if (h(m) > eps) lo = m
        else hi = m
    }
    return hi
}

class PhysicalSpring implements Spring {
    public readonly duration: number
    public readonly bounce: number
    public readonly omega: number
    public readonly zeta: number
    private readonly alpha: number
    private readonly g2: number

    public constructor(duration: number, bounce: number) {
        this.duration = duration
        this.bounce = bounce
        this.omega = (2 * Math.PI) / duration
        this.zeta = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce)
        this.alpha = this.zeta * this.omega
        this.g2 =
            bounce === 0 ? 0 : this.omega * this.omega * (this.zeta ** 2 - 1)
    }

    public at(t: number, x0: number, v0: number): number {
        assertEvalArgs(t, x0, v0)
        if (t <= 0) return x0
        const { u, w } = basis(t, this.alpha, this.g2)
        return x0 * u + (v0 + this.alpha * x0) * w
    }

    public velocity(t: number, x0: number, v0: number): number {
        assertEvalArgs(t, x0, v0)
        if (t <= 0) return v0
        const { u, w } = basis(t, this.alpha, this.g2)
        return v0 * u + (this.g2 * x0 - this.alpha * (v0 + this.alpha * x0)) * w
    }

    public settleTime(
        x0: number,
        v0: number,
        tolerance?: SettleTolerance
    ): number {
        assertInitialState(x0, v0)
        if (
            tolerance !== undefined &&
            (typeof tolerance !== 'object' || tolerance === null)
        ) {
            throw invalid(
                `settle tolerance must be an object, received ${String(tolerance)}.`
            )
        }
        const ex = tolerance?.position ?? 0.1
        const ev = tolerance?.speed ?? 1
        if (
            typeof ex !== 'number' ||
            !Number.isFinite(ex) ||
            !(ex > 0) ||
            typeof ev !== 'number' ||
            !Number.isFinite(ev) ||
            !(ev > 0)
        ) {
            throw invalid('settle tolerances must be finite numbers > 0.')
        }
        const alpha = this.alpha
        const g2 = this.g2
        // d = x0·u + b·w and d′ = v0·u + k·w in the basis of `basis`
        const b = v0 + alpha * x0
        const k = g2 * x0 - alpha * b
        // an upper bound from the closed-form envelopes, then the exact last
        // exit from each tolerance before it
        let bound: number
        if (g2 < 0) {
            const beta = Math.sqrt(-g2)
            const rx = Math.hypot(x0, b / beta)
            const rv = Math.hypot(v0, k / beta)
            bound = Math.max(
                rx > ex ? Math.log(rx / ex) / alpha : 0,
                rv > ev ? Math.log(rv / ev) / alpha : 0
            )
        } else {
            const scale = this.duration
            bound = Math.max(
                lastCrossing(Math.abs(x0), Math.abs(b), alpha, g2, ex, scale),
                lastCrossing(Math.abs(v0), Math.abs(k), alpha, g2, ev, scale)
            )
        }
        if (!(bound <= MAX_SETTLE)) return Number.POSITIVE_INFINITY
        if (bound === 0) return 0
        return Math.max(
            lastExit(x0, b, alpha, g2, ex, bound),
            lastExit(v0, k, alpha, g2, ev, bound)
        )
    }
}

/**
 * Times in `(0, end)` where `f = a·u + c·w` is zero: closed-form and periodic
 * when underdamped, at most one otherwise (a sum of two exponentials).
 */
function zeros(
    a: number,
    c: number,
    alpha: number,
    g2: number,
    end: number
): number[] {
    if (a === 0 && c === 0) return []
    if (g2 < 0) {
        // a·cos βt + (c/β)·sin βt = R·cos(βt − φ)
        const beta = Math.sqrt(-g2)
        const phi = Math.atan2(c / beta, a)
        const out: number[] = []
        let n = Math.ceil((-phi - Math.PI / 2) / Math.PI)
        for (;;) {
            const t = (phi + Math.PI / 2 + n * Math.PI) / beta
            if (t >= end) break
            if (t > 0) out.push(t)
            n += 1
        }
        return out
    }
    const f = (t: number) => {
        const { u, w } = basis(t, alpha, g2)
        return a * u + c * w
    }
    const f0 = f(0)
    const f1 = f(end)
    if (f0 === 0 || f1 === 0 || Math.sign(f0) === Math.sign(f1)) return []
    let lo = 0
    let hi = end
    for (let i = 0; i < 200 && hi - lo > 1e-13 * end; i++) {
        const m = (lo + hi) / 2
        if (Math.sign(f(m)) === Math.sign(f0)) lo = m
        else hi = m
    }
    return [(lo + hi) / 2]
}

/**
 * The last time before `end` at which `|f| > eps`, for `f = a·u + c·w` with
 * `|f(end)| ≤ eps`. `|f|` is monotone between consecutive zeros of `f` and
 * of `f′ = (c − αa)·u + (a·g2 − αc)·w`, so the last piece that starts above
 * `eps` holds the exit, found by bisection.
 */
function lastExit(
    a: number,
    c: number,
    alpha: number,
    g2: number,
    eps: number,
    end: number
): number {
    const f = (t: number) => {
        const { u, w } = basis(t, alpha, g2)
        return Math.abs(a * u + c * w)
    }
    const points = [
        0,
        ...zeros(a, c, alpha, g2, end),
        ...zeros(c - alpha * a, a * g2 - alpha * c, alpha, g2, end),
        end,
    ].sort((x, y) => x - y)
    for (let i = points.length - 2; i >= 0; i--) {
        let lo = points[i]!
        let hi = points[i + 1]!
        if (!(f(lo) > eps)) continue
        if (f(hi) > eps) return hi
        for (let j = 0; j < 200 && hi - lo > 1e-13 * end; j++) {
            const m = (lo + hi) / 2
            if (f(m) > eps) lo = m
            else hi = m
        }
        return hi
    }
    return 0
}

/**
 * A physical spring of perceptual `duration` and `bounce`. Throws
 * `ANI_INVALID_CONFIG` for a non-finite or out-of-range parameter.
 */
export function spring(options: SpringOptions): Spring {
    if (typeof options !== 'object' || options === null) {
        throw invalid(
            `spring options must be an object, received ${String(options)}.`
        )
    }
    const duration = options.duration
    const bounce = options.bounce ?? 0
    if (
        typeof duration !== 'number' ||
        !Number.isFinite(duration) ||
        duration <= 0
    ) {
        throw invalid(
            `spring duration must be a finite number of seconds > 0, received ${String(duration)}.`
        )
    }
    if (
        typeof bounce !== 'number' ||
        !Number.isFinite(bounce) ||
        bounce <= -1 ||
        bounce >= 1
    ) {
        throw invalid(
            `spring bounce must be a finite number strictly inside (-1, 1), received ${String(bounce)}.`
        )
    }
    return new PhysicalSpring(duration, bounce)
}

/** `settleTime` of a spring, as a free function. */
export function settleTime(
    s: Spring,
    x0: number,
    v0: number,
    tolerance?: SettleTolerance
): number {
    if (
        typeof s !== 'object' ||
        s === null ||
        typeof s.settleTime !== 'function'
    ) {
        throw invalid(
            `settleTime requires a Spring from physics.spring(), received ${String(s)}.`
        )
    }
    return s.settleTime(x0, v0, tolerance)
}

/**
 * Perceptual progress `p(t) = min(1, s(t)/s(D))`, with the critically damped
 * step response `s(t) = 1 − (1 + ωt)e^(−ωt)`, `ω = 2π/D`. Monotone, exactly 1
 * at `t = D`, independent of bounce.
 */
export function perceptual(t: number, duration: number): number {
    if (typeof t !== 'number' || !Number.isFinite(t)) {
        throw invalid(
            `perceptual time must be a finite number of seconds, received ${String(t)}.`
        )
    }
    if (
        typeof duration !== 'number' ||
        !Number.isFinite(duration) ||
        duration <= 0
    ) {
        throw invalid(
            `perceptual duration must be a finite number of seconds > 0, received ${String(duration)}.`
        )
    }
    if (t <= 0) return 0
    if (t >= duration) return 1
    const u = (2 * Math.PI * t) / duration
    const s = 1 - (1 + u) * Math.exp(-u)
    return Math.min(1, s / PERCEPTUAL_END)
}

/** `s(D) = 1 − (1 + 2π)e^(−2π) ≈ 0.986399`. */
const PERCEPTUAL_END = 1 - (1 + 2 * Math.PI) * Math.exp(-2 * Math.PI)

/**
 * Distance (px) a release at `velocity` (px/s) coasts under exponential
 * deceleration of `rate` per millisecond: `(v/1000)·r/(1 − r)`. UIKit's normal
 * rate is 0.998, its fast rate 0.99.
 */
export function decay(velocity: number, rate = 0.998): number {
    if (typeof velocity !== 'number' || !Number.isFinite(velocity)) {
        throw invalid(
            `decay velocity must be finite, received ${String(velocity)}.`
        )
    }
    if (
        typeof rate !== 'number' ||
        !Number.isFinite(rate) ||
        !(rate > 0 && rate < 1)
    ) {
        throw invalid(
            `decay rate must be strictly inside (0, 1), received ${String(rate)}.`
        )
    }
    return ((velocity / 1000) * rate) / (1 - rate)
}
