// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import { createClock, rafTimeline } from '@freestylejs/ani-core'
import { afterEach, describe, expect, it } from 'vitest'
import {
    createApp,
    defineComponent,
    h,
    isReactive,
    nextTick,
    shallowRef,
} from 'vue'
import {
    createManualClockWith,
    trackSubscriptions,
} from '../../../../core/src/__tests__/integration/harness'
import { useAni } from '../../index'

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

function mountApp(component: ReturnType<typeof defineComponent>) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp(component)
    app.mount(container)
    return {
        container,
        unmount: async () => {
            app.unmount()
            await nextTick()
            container.remove()
        },
    }
}

describe('vue useAni (unchanged)', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('A1: renders each frame value, follows timeline swaps, unsubscribes on unmount', async () => {
        const m = createManualClockWith(createClock)
        const first = rafTimeline(node(), { clock: m.clock })
        const second = rafTimeline(node(), { clock: m.clock })
        const firstSubs = trackSubscriptions(first)
        const secondSubs = trackSubscriptions(second)
        const current = shallowRef(first)

        const view = mountApp(
            defineComponent({
                setup() {
                    const [v] = useAni(current, { opacity: 0.1 })
                    return () => h('p', v.value.opacity.toFixed(2))
                },
            })
        )
        await nextTick()
        expect(view.container.textContent).toBe('0.10')
        expect(firstSubs.live).toBe(1)

        void first.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        await nextTick()
        expect(view.container.textContent).toBe('0.50')

        void second.play({ from: { opacity: 0.8 } })
        current.value = second
        await nextTick()
        expect(view.container.textContent).toBe('0.80')
        expect(firstSubs.live).toBe(0)
        expect(secondSubs.live).toBe(1)

        await view.unmount()
        expect(secondSubs.live).toBe(0)
    })

    it('A2: returns [value, controller] and the value is a shallow ref', async () => {
        const m = createManualClockWith(createClock)
        const timeline = rafTimeline(node(), { clock: m.clock })
        let result!: ReturnType<typeof useAni<{ opacity: number }>>
        const view = mountApp(
            defineComponent({
                setup() {
                    result = useAni(timeline, { opacity: 0 })
                    return () => h('p')
                },
            })
        )
        await nextTick()
        expect(result).toHaveLength(2)
        const [value, controller] = result
        void controller.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(value.value.opacity).toBeCloseTo(0.5, 5)
        expect(isReactive(value.value)).toBe(false)
        await view.unmount()
    })

    it('A3: never disposes the timeline it was given', async () => {
        const m = createManualClockWith(createClock)
        const timeline = rafTimeline(node(), { clock: m.clock })
        const view = mountApp(
            defineComponent({
                setup() {
                    useAni(timeline, { opacity: 0 })
                    return () => h('p')
                },
            })
        )
        await nextTick()
        await view.unmount()

        const run = timeline.play({ from: { opacity: 0 } })
        m.frames(12, 100)
        expect(await run).toBe('ended')
    })
})
