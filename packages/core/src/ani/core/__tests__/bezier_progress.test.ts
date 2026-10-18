import { describe, expect, it } from 'vitest'
import { BezierTimingFunction, T } from '~/timing'
import { bezierProgress } from '../bezier_progress'

const PRESETS: [string, BezierTimingFunction][] = [
    ['ease', T.ease()],
    ['easeIn', T.easeIn()],
    ['easeOut', T.easeOut()],
    ['easeInOut', T.easeInOut()],
    ['custom', T.bezier({ p2: { x: 0.2, y: 0.9 }, p3: { x: 0.7, y: 0.3 } })],
    ['flat start', T.bezier({ p2: { x: 0, y: 0.5 }, p3: { x: 1, y: 0.5 } })],
]

describe('bezierProgress', () => {
    it.each(PRESETS)('%s starts at 0 and ends at 1', (_, timing) => {
        expect(bezierProgress(timing, 0)).toBe(0)
        expect(bezierProgress(timing, 1)).toBe(1)
        expect(bezierProgress(timing, -0.5)).toBe(0)
        expect(bezierProgress(timing, 1.5)).toBe(1)
    })

    it.each(PRESETS)('%s agrees with the timing function', (_, timing) => {
        for (let i = 1; i < 200; i++) {
            const x = i / 200
            expect(
                Math.abs(bezierProgress(timing, x) - timing.ease(x))
            ).toBeLessThan(1e-6)
        }
    })

    it.each(PRESETS)('%s is continuous at both ends', (_, timing) => {
        // `ease` itself jumps by ~1e-7 there (its solver stops early)
        expect(1 - bezierProgress(timing, 1 - 1e-15)).toBeLessThan(1e-6)
        expect(bezierProgress(timing, 1e-15)).toBeLessThan(1e-6)
        for (const x of [0, 1e-12, 0.3, 0.5, 0.999999, 1 - 1e-12]) {
            const nudge = Math.abs(
                bezierProgress(timing, x + 1e-15) - bezierProgress(timing, x)
            )
            expect(nudge).toBeLessThan(1e-9)
        }
    })

    it('is the identity for a linear bezier', () => {
        const linear = T.bezier({
            p2: { x: 0.25, y: 0.25 },
            p3: { x: 0.75, y: 0.75 },
        })
        expect(bezierProgress(linear, 0.3)).toBe(0.3)
    })
})
