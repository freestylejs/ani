import { describe, expect, it } from 'vitest'
import { a, rafTimeline, type TimingFunction } from '../../index'
import { createManualClock } from '../../testing'

type Curve = { p2: { x: number; y: number }; p3: { x: number; y: number } }

/** Cubic bezier through (0,0), p2, p3, (1,1), one axis. */
function axis(t: number, p1: number, p2: number): number {
    const u = 1 - t
    return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t
}

/** Reference: 200 bisection steps in float64 (x(t) is monotonic). */
function reference(curve: Curve, x: number): number {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2
        if (axis(mid, curve.p2.x, curve.p3.x) < x) lo = mid
        else hi = mid
    }
    return axis((lo + hi) / 2, curve.p2.y, curve.p3.y)
}

function mulberry32(seed: number) {
    let s = seed >>> 0
    return () => {
        s = (s + 0x6d2b79f5) >>> 0
        let t = s
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const presets: Array<[string, Curve]> = [
    ['ease', { p2: { x: 0.25, y: 0.1 }, p3: { x: 0.25, y: 1 } }],
    ['easeIn', { p2: { x: 0.42, y: 0 }, p3: { x: 1, y: 1 } }],
    ['easeOut', { p2: { x: 0, y: 0 }, p3: { x: 0.58, y: 1 } }],
    ['easeInOut', { p2: { x: 0.42, y: 0 }, p3: { x: 0.58, y: 1 } }],
    ['steep', { p2: { x: 0.9, y: 0 }, p3: { x: 1, y: 0.1 } }],
]

function curves(): Array<[string, Curve]> {
    const rand = mulberry32(42)
    const out = [...presets]
    for (let i = 0; i < 20; i++) {
        out.push([
            `random ${i}`,
            {
                p2: { x: rand(), y: rand() * 3 - 1 },
                p3: { x: rand(), y: rand() * 3 - 1 },
            },
        ])
    }
    return out
}

const ease = (fn: TimingFunction, x: number) =>
    (fn as unknown as { ease(x: number): number }).ease(x)

describe('FX4: bezier solver precision', () => {
    it('P1: matches a float64 bisection reference within 1e-10', () => {
        for (const [name, curve] of curves()) {
            const fn = a.timing.bezier(curve)
            let worst = 0
            for (let i = 0; i <= 2000; i++) {
                const x = i / 2000
                const error = Math.abs(ease(fn, x) - reference(curve, x))
                if (error > worst) worst = error
            }
            expect(worst, name).toBeLessThanOrEqual(1e-10)
        }
    })

    it('P2: inputs one ulp apart give results within 1e-12 (scaled)', () => {
        for (const [name, curve] of curves()) {
            const fn = a.timing.bezier(curve)
            // generous bound on |dy/dx| for these curves
            const slope = 1e4
            for (let i = 1; i < 500; i++) {
                const x = i / 500 + 1e-7
                const next = x + Number.EPSILON * x
                const jump = Math.abs(ease(fn, next) - ease(fn, x))
                expect(jump, `${name} at ${x}`).toBeLessThanOrEqual(
                    1e-12 + slope * (next - x)
                )
            }
        }
    })

    it('P3: a folded easeInOut loop equals the flattened sequence within 1e-9', () => {
        const child = a.sequence([
            a.ani({
                to: { x: 100 },
                duration: 0.3,
                timing: a.timing.easeInOut(),
            }),
            a.ani({ to: { x: -40 }, duration: 0.17, timing: a.timing.ease() }),
        ])
        const m = createManualClock({ lagThreshold: Infinity })
        const folded = rafTimeline(a.loop(child, 5), { clock: m.clock })
        const flat = rafTimeline(
            a.sequence([child, child, child, child, child]),
            { clock: m.clock }
        )
        folded.play({ from: { x: 0 } })
        flat.play({ from: { x: 0 } })
        const end = 5 * 0.47
        for (let i = 0; i < 200; i++) {
            const t = (i * 0.0117 + 0.0003) % end
            folded.seek(t)
            flat.seek(t)
            expect(folded.value?.x, `t=${t}`).toBeCloseTo(
                flat.value?.x as number,
                9
            )
        }
        folded.dispose()
        flat.dispose()
    })
})
