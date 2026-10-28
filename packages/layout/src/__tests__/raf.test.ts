// Direct unit coverage of the RAF realizer (§4.3): the adapter's only clock
// subscriber. The engine rows exercise it indirectly; this pins the idle
// getter and the idempotent start/stop edges that the coverage gate counts.
import type { Animatable, AnimationClockInterface } from '@freestylejs/ani-core'
import { describe, expect, it, vi } from 'vitest'
import { createRaf } from '../realize/raf'

describe('createRaf', () => {
    it('starts/stops idempotently', () => {
        let animatable: Animatable | null = null
        const subscribe = vi.fn((next: Animatable) => {
            animatable = next
        })
        const unsubscribe = vi.fn()
        const clock = {
            subscribe,
            unsubscribe,
        } as unknown as AnimationClockInterface
        const driver = { update: vi.fn(() => true), commit: vi.fn() }
        const realizer = createRaf(clock, driver)

        realizer.start()
        realizer.start()
        expect(subscribe).toHaveBeenCalledTimes(1)
        expect(animatable).not.toBeNull()

        animatable!.update(16)
        expect(driver.update).toHaveBeenCalledWith(16)
        animatable!.commit?.()
        expect(driver.commit).toHaveBeenCalledTimes(1)

        realizer.stop()
        realizer.stop()
        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('stops itself after the driver reports that the last frame finished', () => {
        let animatable: Animatable | null = null
        const subscribe = vi.fn((next: Animatable) => {
            animatable = next
        })
        const unsubscribe = vi.fn()
        const clock = {
            subscribe,
            unsubscribe,
        } as unknown as AnimationClockInterface
        const driver = { update: vi.fn(() => false), commit: vi.fn() }
        const realizer = createRaf(clock, driver)

        realizer.start()
        animatable!.update(16)
        animatable!.commit?.()
        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })
})
