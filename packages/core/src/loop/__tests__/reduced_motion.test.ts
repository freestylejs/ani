import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClock } from '../clock'

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('clock reducedMotion', () => {
    it('tolerates a matchMedia that returns nothing', () => {
        vi.stubGlobal(
            'matchMedia',
            vi.fn(() => null)
        )
        expect(createClock().reducedMotion).toBe(false)
    })

    it('rejects null and objects without a boolean matches', () => {
        for (const bad of [null, {}, { matches: 1 }]) {
            expect(() => createClock({ reducedMotion: bad as never })).toThrow(
                /reducedMotion/
            )
        }
    })

    it('picks up matchMedia that appears after the first read', () => {
        vi.stubGlobal('matchMedia', undefined)
        const clock = createClock()
        expect(clock.reducedMotion).toBe(false)

        vi.stubGlobal(
            'matchMedia',
            vi.fn(() => ({ matches: true }))
        )
        expect(clock.reducedMotion).toBe(true)
    })
})
