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

    it('should update maxDeltaTime via configure()', () => {
        let rafCallback: ((ts: number) => void) | undefined
        const requestAnimationFrame = vi.fn().mockImplementation((cb) => {
            rafCallback = cb
            return 1
        })
        const cancelAnimationFrame = vi.fn()
        const updates: number[] = []

        vi.stubGlobal('window', {
            requestAnimationFrame,
            cancelAnimationFrame,
        })
        vi.stubGlobal('performance', {
            now: () => 0,
        })

        const clock = AnimationClock.create(0.1)
        AnimationClock.configure(0.01)

        clock.subscribe({
            update: (dt) => updates.push(dt),
        })

        rafCallback?.(1_000)
        expect(updates[0]).toBe(0.01)
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
