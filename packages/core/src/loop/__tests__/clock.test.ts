import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Animatable } from '../clock'
import { AnimationClock } from '../clock'

describe('AnimationClock', () => {
    beforeEach(() => {
        delete (AnimationClock as unknown as { clock?: AnimationClock }).clock
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('should return singleton instance from create()', () => {
        const first = AnimationClock.create()
        const second = AnimationClock.create()

        expect(first).toBe(second)
    })

    it('should start one RAF loop for multiple subscribers', () => {
        const requestAnimationFrame = vi.fn().mockReturnValue(1)
        const cancelAnimationFrame = vi.fn()

        vi.stubGlobal('window', {
            requestAnimationFrame,
            cancelAnimationFrame,
        })
        vi.stubGlobal('performance', {
            now: () => 0,
        })

        const clock = AnimationClock.create()
        const first: Animatable = { update: vi.fn() }
        const second: Animatable = { update: vi.fn() }

        clock.subscribe(first)
        clock.subscribe(second)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

        clock.unsubscribe(first)
        expect(cancelAnimationFrame).toHaveBeenCalledTimes(0)

        clock.unsubscribe(second)
        expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    })
})
