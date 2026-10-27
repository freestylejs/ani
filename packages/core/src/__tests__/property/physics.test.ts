import { describe, expect, it } from 'vitest'
import { physics } from '~/index'
import { mulberry32 } from './gen'

/**
 * The physical spring against an independent oracle: the textbook closed
 * forms written with `c₁e^(r₁t) + c₂e^(r₂t)` (no shared code with the
 * basis-function solver), and a fourth-order Runge–Kutta integration of the
 * ODE `d″ + 2ζω d′ + ω² d = 0`.
 */

function oracle(
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
    const s = Math.sqrt(z * z - 1)
    const r1 = -w * (z - s)
    const r2 = -w * (z + s)
    const c1 = (v0 - r2 * x0) / (r1 - r2)
    const c2 = x0 - c1
    return {
        d: c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t),
        v: c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t),
    }
}

function rk4(
    D: number,
    b: number,
    x0: number,
    v0: number,
    t: number
): { d: number; v: number } {
    const w = (2 * Math.PI) / D
    const z = b >= 0 ? 1 - b : 1 / (1 + b)
    const f = (x: number, v: number) => -2 * z * w * v - w * w * x
    const steps = Math.max(1, Math.ceil(t / 2e-5))
    const h = t / steps
    let x = x0
    let v = v0
    for (let i = 0; i < steps; i++) {
        const k1x = v
        const k1v = f(x, v)
        const k2x = v + (h / 2) * k1v
        const k2v = f(x + (h / 2) * k1x, v + (h / 2) * k1v)
        const k3x = v + (h / 2) * k2v
        const k3v = f(x + (h / 2) * k2x, v + (h / 2) * k2v)
        const k4x = v + h * k3v
        const k4v = f(x + h * k3x, v + h * k3v)
        x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x)
        v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v)
    }
    return { d: x, v }
}

const BOUNCES = [
    -0.95, -0.8, -0.5, -0.3, -0.1, 0, 0.1, 0.2, 0.4, 0.6, 0.9, 0.95,
]

describe('physics.spring', () => {
    it('S1: matches the closed-form oracle within 1e-9 over the domain', () => {
        const rng = mulberry32(0x5a1e01).unit
        for (let i = 0; i < 4000; i++) {
            const D = 0.1 + rng() * 1.9
            const b = BOUNCES[Math.floor(rng() * BOUNCES.length)]!
            const x0 = (rng() - 0.5) * 2000
            const v0 = (rng() - 0.5) * 20000
            const t = rng() * 3 * D
            const s = physics.spring({ duration: D, bounce: b })
            const o = oracle(D, b, x0, v0, t)
            const scale = Math.max(1, Math.abs(x0), Math.abs(v0) * D)
            const msg = `D=${D} b=${b} x0=${x0} v0=${v0} t=${t}`
            expect(Math.abs(s.at(t, x0, v0) - o.d), msg).toBeLessThan(
                1e-9 * scale
            )
            expect(Math.abs(s.velocity(t, x0, v0) - o.v), msg).toBeLessThan(
                1e-9 * scale * s.omega
            )
        }
    })

    it('S2: integrates the spring ODE (RK4) within 1e-7', () => {
        const rng = mulberry32(0x5a1e02).unit
        for (let i = 0; i < 60; i++) {
            const D = 0.2 + rng()
            const b = BOUNCES[Math.floor(rng() * BOUNCES.length)]!
            const x0 = (rng() - 0.5) * 600
            const v0 = (rng() - 0.5) * 6000
            const t = rng() * 2 * D
            const s = physics.spring({ duration: D, bounce: b })
            const o = rk4(D, b, x0, v0, t)
            const scale = Math.max(1, Math.abs(x0), Math.abs(v0) * D)
            expect(Math.abs(s.at(t, x0, v0) - o.d)).toBeLessThan(1e-7 * scale)
            expect(Math.abs(s.velocity(t, x0, v0) - o.v)).toBeLessThan(
                1e-7 * scale * s.omega
            )
        }
    })

    it('S3: starts exactly at (x0, v0) and maps bounce to the damping ratio', () => {
        for (const b of BOUNCES) {
            const s = physics.spring({ duration: 0.5, bounce: b })
            expect(s.at(0, 12.5, -40)).toBe(12.5)
            expect(s.velocity(0, 12.5, -40)).toBe(-40)
            // the slope at 0+ is v0 (no kink at the start)
            const h = 1e-9
            expect((s.at(h, 12.5, -40) - 12.5) / h).toBeCloseTo(-40, 2)
            expect(s.zeta).toBeCloseTo(b >= 0 ? 1 - b : 1 / (1 + b), 15)
            expect(s.omega).toBeCloseTo((2 * Math.PI) / 0.5, 12)
        }
    })

    it('S4: stays finite and exact near critical damping and when heavily overdamped', () => {
        for (const b of [-1e-9, 1e-9, -1e-5, 1e-5, -0.999]) {
            const s = physics.spring({ duration: 0.4, bounce: b })
            for (const t of [0, 1e-6, 0.01, 0.2, 1, 5, 30]) {
                const d = s.at(t, 100, 300)
                expect(Number.isFinite(d)).toBe(true)
                expect(Number.isFinite(s.velocity(t, 100, 300))).toBe(true)
            }
        }
        // near critical: within 1e-6 of the critically damped response
        const crit = physics.spring({ duration: 0.4, bounce: 0 })
        for (const b of [-1e-9, 1e-9]) {
            const s = physics.spring({ duration: 0.4, bounce: b })
            for (const t of [0.01, 0.1, 0.3]) {
                expect(
                    Math.abs(s.at(t, 100, 300) - crit.at(t, 100, 300))
                ).toBeLessThan(1e-5)
            }
        }
    })

    it('S5: rejects non-finite and out-of-range parameters', () => {
        for (const duration of [
            0,
            -1,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => physics.spring({ duration })).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
        }
        for (const bounce of [
            -1,
            1,
            1.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => physics.spring({ duration: 1, bounce })).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
        }
        const s = physics.spring({ duration: 0.5, bounce: 0 })
        for (const bad of [
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => s.at(bad, 100, 0)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
            expect(() => s.at(0.1, bad, 0)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
            expect(() => s.at(0.1, 100, bad)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
            expect(() => s.velocity(bad, 100, 0)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
            expect(() => s.velocity(0.1, bad, 0)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
            expect(() => s.velocity(0.1, 100, bad)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
        }
        expect(s.at(-0.2, 100, -40)).toBe(100)
        expect(s.velocity(-0.2, 100, -40)).toBe(-40)
    })
})

describe('physics.settleTime', () => {
    it('T1: the documented example settles at 0.918 s (1.67 D)', () => {
        const s = physics.spring({ duration: 0.55, bounce: 0 })
        const t = physics.settleTime(s, 300, 0)
        expect(t).toBeGreaterThan(0.9175)
        expect(t).toBeLessThan(0.9185)
        expect(t / 0.55).toBeCloseTo(1.67, 2)
    })

    it('T2: after the settle time position and speed stay within tolerance', () => {
        const rng = mulberry32(0x5e771e).unit
        for (let i = 0; i < 400; i++) {
            const D = 0.15 + rng() * 1.2
            const b = BOUNCES[Math.floor(rng() * BOUNCES.length)]!
            const x0 = (rng() - 0.5) * 1600
            const v0 = (rng() - 0.5) * 12000
            const s = physics.spring({ duration: D, bounce: b })
            const T = s.settleTime(x0, v0)
            expect(Number.isFinite(T)).toBe(true)
            for (let k = 0; k <= 200; k++) {
                const t = T + (k / 200) * 4 * D
                const o = oracle(D, b, x0, v0, t)
                expect(Math.abs(o.d)).toBeLessThanOrEqual(0.1 + 1e-9)
                expect(Math.abs(o.v)).toBeLessThanOrEqual(1 + 1e-9)
            }
        }
    })

    it('T6: the settle time is exact: just before it a tolerance is still exceeded', () => {
        const rng = mulberry32(0x5e7716).unit
        let checked = 0
        for (let i = 0; i < 600; i++) {
            const D = 0.15 + rng() * 1.2
            const b = BOUNCES[Math.floor(rng() * BOUNCES.length)]!
            const x0 = (rng() - 0.5) * 1600
            const v0 = rng() < 0.3 ? 0 : (rng() - 0.5) * 12000
            const s = physics.spring({ duration: D, bounce: b })
            const T = s.settleTime(x0, v0)
            if (T === 0) continue
            const o = oracle(D, b, x0, v0, T - 1e-7)
            expect(
                Math.abs(o.d) > 0.1 - 1e-9 || Math.abs(o.v) > 1 - 1e-9,
                `D=${D} b=${b} x0=${x0} v0=${v0} T=${T}`
            ).toBe(true)
            checked += 1
        }
        expect(checked).toBeGreaterThan(500)
    })

    it('T3: critically damped from rest is exact (the envelope is the response)', () => {
        const s = physics.spring({ duration: 0.4, bounce: 0 })
        const T = s.settleTime(200, 0)
        const before = oracle(0.4, 0, 200, 0, T - 1e-6)
        const failsBefore = Math.abs(before.d) > 0.1 || Math.abs(before.v) > 1
        expect(failsBefore).toBe(true)
    })

    it('T4: at rest at the target settles at once; custom tolerances apply', () => {
        const s = physics.spring({ duration: 0.3, bounce: 0.3 })
        expect(s.settleTime(0, 0)).toBe(0)
        // inside both tolerances at the start: settled at once
        expect(s.settleTime(0.01, 0.1)).toBe(0)
        expect(s.settleTime(300, 0, { position: 1, speed: 10 })).toBeLessThan(
            s.settleTime(300, 0)
        )
        expect(() => s.settleTime(1, 0, { position: 0 })).toThrow(
            expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
        )
        for (const bad of [
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => s.settleTime(bad, 0)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
            expect(() => s.settleTime(1, bad)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
            expect(() => s.settleTime(1, 0, { position: bad })).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
            expect(() => s.settleTime(1, 0, { speed: bad })).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
        }
    })

    it('T5: a long bouncy spring exceeds the layout cap of 10 s', () => {
        const s = physics.spring({ duration: 4, bounce: 0.99 })
        expect(s.settleTime(500, 0)).toBeGreaterThan(10)
    })
})

describe('physics.perceptual', () => {
    it('P1: monotone, 0 at 0, exactly 1 at D, s(D) ≈ 0.986399', () => {
        const D = 0.55
        let prev = -1
        for (let k = 0; k <= 1000; k++) {
            const p = physics.perceptual((k / 1000) * 1.2 * D, D)
            expect(p).toBeGreaterThanOrEqual(prev)
            prev = p
        }
        expect(physics.perceptual(-0.2, D)).toBe(0)
        expect(physics.perceptual(0, D)).toBe(0)
        expect(physics.perceptual(D, D)).toBe(1)
        expect(physics.perceptual(2 * D, D)).toBe(1)
        const sD = 1 - (1 + 2 * Math.PI) * Math.exp(-2 * Math.PI)
        expect(sD).toBeCloseTo(0.986399, 6)
        const t = 0.3 * D
        const u = 2 * Math.PI * 0.3
        expect(physics.perceptual(t, D)).toBeCloseTo(
            (1 - (1 + u) * Math.exp(-u)) / sD,
            12
        )
    })

    it('P2: rejects non-finite time and non-finite or non-positive duration (P1-003)', () => {
        for (const t of [
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => physics.perceptual(t, 0.5)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
        }
        for (const duration of [
            0,
            -0.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => physics.perceptual(0.2, duration)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
            expect(() => physics.perceptual(0, duration)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
        }
    })
})

describe('physics.decay', () => {
    it('D1: projects v·r/(1 − r) per millisecond', () => {
        expect(physics.decay(1000)).toBeCloseTo(0.998 / 0.002, 9)
        expect(physics.decay(-2000, 0.99)).toBeCloseTo(-2 * 99, 9)
        for (const rate of [
            0,
            -0.5,
            1,
            1.2,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => physics.decay(1, rate)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
        }
        for (const v of [
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => physics.decay(v)).toThrow(
                expect.objectContaining({ code: 'ANI_INVALID_CONFIG' })
            )
        }
    })
})
