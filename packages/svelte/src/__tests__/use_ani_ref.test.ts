// @vitest-environment jsdom

import type {
    Animatable,
    AnimationClockInterface,
    RafAniTimeline,
} from '@freestylejs/ani-core'
import { a, rafTimeline } from '@freestylejs/ani-core'
import { describe, expect, it } from 'vitest'
import { useAniRef } from '../ani/use_ani_ref'

class TestClock implements AnimationClockInterface {
    public readonly subscribers = new Set<Animatable>()

    public subscribe(animatable: Animatable): void {
        this.subscribers.add(animatable)
    }

    public unsubscribe(animatable: Animatable): void {
        this.subscribers.delete(animatable)
    }
}

describe('useAniRef', () => {
    it('delegates duration and update while applying styles to the element', () => {
        const clock = new TestClock()
        const timeline = rafTimeline(
            a.ani({ to: { opacity: 1 }, duration: 1 }),
            clock
        )

        const [action, controller] = useAniRef({
            timeline,
            initialValue: { opacity: 0 },
        }) as readonly [
            (node: HTMLElement) => { destroy(): void },
            RafAniTimeline<{ opacity: number }>,
        ]

        const element = document.createElement('div')
        document.body.appendChild(element)

        const binding = action(element)

        expect(element.style.opacity).toBe('0')
        expect(controller.duration).toBe(timeline.duration)

        controller.play({ from: { opacity: 0 } })
        controller.update(0.5)

        expect(controller.getCurrentValue()).toEqual({ opacity: 0.5 })
        expect(element.style.opacity).toBe('0.5')

        binding.destroy()
    })
})
