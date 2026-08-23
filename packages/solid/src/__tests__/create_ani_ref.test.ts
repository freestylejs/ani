// @vitest-environment jsdom

import type {
    Animatable,
    AnimationClockInterface,
    RafAniTimeline,
} from '@freestylejs/ani-core'
import { a, rafTimeline } from '@freestylejs/ani-core'
import { createRoot } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { createAniRef } from '../ani/create_ani_ref'

class TestClock implements AnimationClockInterface {
    public readonly subscribers = new Set<Animatable>()

    public subscribe(animatable: Animatable): void {
        this.subscribers.add(animatable)
    }

    public unsubscribe(animatable: Animatable): void {
        this.subscribers.delete(animatable)
    }
}

describe('createAniRef', () => {
    it('delegates duration and update while applying styles to the element', async () => {
        const clock = new TestClock()
        const timeline = rafTimeline(
            a.ani({ to: { opacity: 1 }, duration: 1 }),
            clock
        )

        const element = document.createElement('div')
        document.body.appendChild(element)

        let controller!: RafAniTimeline<{ opacity: number }>

        const dispose = createRoot((rootDispose) => {
            const [ref, boundController] = createAniRef({
                timeline: () => timeline,
                initialValue: { opacity: 0 },
            })

            ref(element)
            controller = boundController

            return rootDispose
        })

        await Promise.resolve()
        await Promise.resolve()

        expect(element.style.opacity).toBe('0')
        expect(controller.duration).toBe(timeline.duration)

        controller.play({ from: { opacity: 0 } })
        controller.update(0.5)

        await Promise.resolve()
        await Promise.resolve()

        expect(controller.getCurrentValue()).toEqual({ opacity: 0.5 })
        expect(element.style.opacity).toBe('0.5')

        dispose()
    })
})
