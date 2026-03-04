import { describe, expect, it } from 'vitest'
import type { Animatable, AnimationClockInterface } from '~/loop'
import { ani } from '~/nodes'
import { createStates } from '../states'

class MockClock implements AnimationClockInterface {
    public readonly subscribers = new Set<Animatable>()

    public subscribe(animatable: Animatable): void {
        this.subscribers.add(animatable)
    }

    public unsubscribe(animatable: Animatable): void {
        this.subscribers.delete(animatable)
    }

    public tick(dt: number): void {
        for (const subscriber of this.subscribers) {
            subscriber.update(dt)
        }
    }
}

describe('createStates', () => {
    it('should release previous timeline when transitioning repeatedly', () => {
        const clock = new MockClock()
        const states = createStates({
            initial: 'idle',
            initialFrom: { x: 0 },
            states: {
                idle: ani({ to: { x: 0 }, duration: 1 }),
                active: ani({ to: { x: 100 }, duration: 1 }),
            },
            clock,
        })

        for (let i = 0; i < 1000; i++) {
            const target = i % 2 === 0 ? 'active' : 'idle'
            states.transitionTo(target, { from: { x: 0 } })
            expect(clock.subscribers.size).toBe(1)
        }

        clock.tick(0.5)
        expect(states.timeline().getCurrentValue()).not.toBeNull()
        expect(clock.subscribers.size).toBe(1)
    })
})
