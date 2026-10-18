import { describe, expect, it } from 'vitest'
import { T } from '~/timing'

describe('SpringTimingFunction', () => {
    it('is finite at t=0 for an undamped spring (c = 0)', () => {
        const spring = T.spring({ m: 1, k: 100, c: 0 })
        const first = spring.step(0, { dt: 0, from: 0, to: 10, duration: 1 })
        expect(first.value).toBe(0)
        expect(first.endOfAnimation).toBe(false)
        for (const t of [0.1, 0.5, 0.99]) {
            const { value } = spring.step(t, {
                dt: 0,
                from: 0,
                to: 10,
                duration: 1,
            })
            expect(Number.isFinite(value)).toBe(true)
        }
        expect(
            spring.step(1, { dt: 0, from: 0, to: 10, duration: 1 })
                .endOfAnimation
        ).toBe(true)
    })

    it('does not mutate or alias the caller option object', () => {
        const opt = { m: 1, k: 100, c: 10 }
        const spring = T.spring(opt)
        expect(opt).toEqual({ m: 1, k: 100, c: 10 })
        expect(spring.opt.tolerance).toBe(1e-3)
    })

    it('rejects non-physical parameters', () => {
        expect(() => T.spring({ m: 0, k: 1, c: 1 })).toThrow(RangeError)
        expect(() => T.spring({ m: 1, k: 0, c: 1 })).toThrow(RangeError)
        expect(() => T.spring({ m: 1, k: 1, c: -1 })).toThrow(RangeError)
    })
})
