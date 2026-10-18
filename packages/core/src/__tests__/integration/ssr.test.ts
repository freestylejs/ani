// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { AnimationClock, a, rafTimeline } from '../../index'

describe('core without a DOM (SSR / plain Node)', () => {
    it('has no window, document or requestAnimationFrame', () => {
        expect(typeof window).toBe('undefined')
        expect(typeof document).toBe('undefined')
        expect(typeof requestAnimationFrame).toBe('undefined')
    })

    it('plays, transitions and disposes without throwing or retaining subscribers', () => {
        const timeline = rafTimeline(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() })
        )
        expect(() => timeline.play({ from: { x: 0 } })).not.toThrow()
        expect(timeline.getCurrentValue()).toEqual({ x: 0 })
        expect(AnimationClock.create().size).toBe(0)

        const states = a.createStates({
            initial: 'idle',
            initialFrom: { x: 0 },
            states: {
                idle: a.ani({ to: { x: 0 }, duration: 1 }),
                active: a.ani({ to: { x: 1 }, duration: 1 }),
            },
        })
        expect(() => states.transitionTo('active')).not.toThrow()
        expect(states.state()).toBe('active')
        expect(() => states.dispose()).not.toThrow()
        expect(AnimationClock.create().size).toBe(0)
    })
})
