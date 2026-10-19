import { describe, expect, it } from 'vitest'
import { type BezierTimingFunction, timing } from '~/timing'

const PRESETS: [string, BezierTimingFunction][] = [
    ['ease', timing.ease()],
    ['easeIn', timing.easeIn()],
    ['easeOut', timing.easeOut()],
    ['easeInOut', timing.easeInOut()],
    [
        'custom',
        timing.bezier({ p2: { x: 0.2, y: 0.9 }, p3: { x: 0.7, y: 0.3 } }),
    ],
    [
        'flat start',
        timing.bezier({ p2: { x: 0, y: 0.5 }, p3: { x: 1, y: 0.5 } }),
    ],
    ['steep', timing.bezier({ p2: { x: 0.9, y: 0 }, p3: { x: 1, y: 0.1 } })],
]

describe('BezierTimingFunction.ease', () => {
    it.each(PRESETS)('%s starts at 0 and ends at 1', (_, timing) => {
        expect(timing.ease(0)).toBe(0)
        expect(timing.ease(1)).toBe(1)
        expect(timing.ease(-0.5)).toBe(0)
        expect(timing.ease(1.5)).toBe(1)
    })

    it.each(PRESETS)('%s is continuous at both ends', (_, timing) => {
        expect(1 - timing.ease(1 - 1e-15)).toBeLessThan(1e-6)
        expect(timing.ease(1e-15)).toBeLessThan(1e-6)
        // not at the ends of a curve with a vertical tangent, where the true
        // progress itself moves by ~1e-8 for a step of 1e-15 in x
        for (const x of [1e-6, 0.3, 0.5, 0.999999]) {
            const nudge = Math.abs(timing.ease(x + 1e-15) - timing.ease(x))
            expect(nudge).toBeLessThan(1e-9)
        }
    })

    it.each(PRESETS)('%s is monotonic in x for monotonic y', (_, timing) => {
        if (timing.opt.p2.y < 0 || timing.opt.p3.y > 1) return
        let previous = 0
        for (let i = 1; i <= 1000; i++) {
            const value = timing.ease(i / 1000)
            expect(value).toBeGreaterThanOrEqual(previous - 1e-12)
            previous = value
        }
    })

    it('is the identity for a linear bezier', () => {
        const linear = timing.bezier({
            p2: { x: 0.25, y: 0.25 },
            p3: { x: 0.75, y: 0.75 },
        })
        expect(linear.ease(0.3)).toBe(0.3)
    })

    it('step eases the segment', () => {
        const easeInOut = timing.easeInOut()
        const { value, endOfAnimation } = easeInOut.step(0.5, {
            duration: 1,
            from: 10,
            to: 20,
        } as Parameters<typeof easeInOut.step>[1])
        expect(value).toBeCloseTo(15, 12)
        expect(endOfAnimation).toBe(false)
    })

    it('rejects control point x outside [0, 1]', () => {
        expect(() =>
            timing.bezier({ p2: { x: 1.1, y: 0 }, p3: { x: 0.5, y: 1 } })
        ).toThrow(RangeError)
    })
})
