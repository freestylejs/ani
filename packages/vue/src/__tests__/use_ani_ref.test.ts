// @vitest-environment jsdom

import type {
    Animatable,
    AnimationClockInterface,
    RafAniTimeline,
} from '@freestylejs/ani-core'
import { a, rafTimeline } from '@freestylejs/ani-core'
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, type Ref } from 'vue'
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
    it('delegates duration and update while applying styles to the element', async () => {
        const clock = new TestClock()
        const timeline = rafTimeline(
            a.ani({ to: { opacity: 1 }, duration: 1 }),
            clock
        )

        let controller!: RafAniTimeline<{ opacity: number }>
        let elementRef!: Ref<HTMLElement | null>

        const App = defineComponent({
            setup() {
                const [ref, boundController] = useAniRef({
                    timeline,
                    initialValue: { opacity: 0 },
                })

                elementRef = ref
                controller = boundController

                return () => h('div', { ref })
            },
        })

        const container = document.createElement('div')
        document.body.appendChild(container)

        const app = createApp(App)
        app.mount(container)
        await nextTick()

        const element = elementRef.value as HTMLDivElement

        expect(element.style.opacity).toBe('0')
        expect(controller.duration).toBe(timeline.duration)

        controller.play({ from: { opacity: 0 } })
        controller.update(0.5)

        expect(controller.getCurrentValue()).toEqual({ opacity: 0.5 })
        expect(element.style.opacity).toBe('0.5')

        app.unmount()
    })
})
