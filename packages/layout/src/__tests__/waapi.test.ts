import { timing } from '@freestylejs/ani-core'
import { describe, expect, it } from 'vitest'
import { curveOf } from '../motion'
import { linearEasing } from '../realize/waapi'

/** The piecewise-linear easing `linear(…)` evaluates (even stops). */
function evaluate(easing: string, tau: number): number {
    const stops = easing
        .slice('linear('.length, -1)
        .split(',')
        .map((v) => Number.parseFloat(v))
    const n = stops.length - 1
    const at = Math.min(n - 1, Math.floor(tau * n))
    const local = tau * n - at
    return stops[at]! + (stops[at + 1]! - stops[at]!) * local
}

describe('waapi: sampled easing', () => {
    for (const [name, fn] of [
        ['linear', timing.linear()],
        ['ease-out', timing.easeOut()],
        ['spring', timing.spring({ m: 1, k: 170, c: 22 })],
        ['stiff spring', timing.spring({ m: 1, k: 900, c: 30 })],
    ] as const) {
        it(`${name}: a 600 px move is drawn within 0.05 px`, () => {
            const curve = curveOf(fn)
            const easing = linearEasing(curve, 600)
            let worst = 0
            for (let i = 0; i <= 4000; i++) {
                const tau = i / 4000
                worst = Math.max(
                    worst,
                    600 * Math.abs(evaluate(easing, tau) - curve.value(tau))
                )
            }
            expect(worst).toBeLessThanOrEqual(0.05)
        })
    }

    it('a straight curve needs two stops; the stops grow with the distance', () => {
        expect(linearEasing(curveOf(timing.linear()), 600)).toBe('linear(0, 1)')
        const spring = curveOf(timing.spring({ m: 1, k: 170, c: 22 }))
        const count = (d: number) => linearEasing(spring, d).split(',').length
        expect(count(1000)).toBeGreaterThan(count(10))
    })
})
