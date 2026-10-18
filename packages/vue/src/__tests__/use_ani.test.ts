// @vitest-environment jsdom

import { a, rafTimeline } from '@freestylejs/ani-core'
import { afterEach, describe, expect, it } from 'vitest'
import {
    createApp,
    defineComponent,
    h,
    isReactive,
    nextTick,
    shallowRef,
} from 'vue'
import { useAni } from '../ani/use_ani'
import { createManualClock, trackSubscriptions } from './clock'

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

describe('vue useAni', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('renders each frame value, follows timeline swaps and unsubscribes on unmount', async () => {
        const m = createManualClock()
        const first = rafTimeline(node(), m.clock)
        const second = rafTimeline(node(), m.clock)
        const firstSubs = trackSubscriptions(first)
        const secondSubs = trackSubscriptions(second)
        second.play({ from: { opacity: 0.8 } })
        const current = shallowRef(first)

        const container = document.createElement('div')
        document.body.appendChild(container)
        const app = createApp(
            defineComponent({
                setup() {
                    const [v] = useAni(current, { opacity: 0.1 })
                    return () => h('p', v.value.opacity.toFixed(2))
                },
            })
        )
        app.mount(container)
        await nextTick()
        expect(container.textContent).toBe('0.10')
        expect(firstSubs.live).toBe(1)

        first.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        await nextTick()
        expect(container.textContent).toBe('0.50')

        current.value = second
        await nextTick()
        expect(container.textContent).toBe(
            (second.getCurrentValue()?.opacity ?? 0).toFixed(2)
        )
        expect(firstSubs.live).toBe(0)
        expect(secondSubs.live).toBe(1)

        app.unmount()
        expect(secondSubs.live).toBe(0)
    })

    it('keeps per-frame values unproxied (shallow state)', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        let value!: { value: { opacity: number } }
        const app = createApp(
            defineComponent({
                setup() {
                    value = useAni(timeline, { opacity: 0 })[0]
                    return () => h('p')
                },
            })
        )
        app.mount(document.createElement('div'))
        await nextTick()
        timeline.play({ from: { opacity: 0 } })
        m.frames(2, 100)
        expect(isReactive(value.value)).toBe(false)
        app.unmount()
    })

    it('does not grow subscriptions over 1000 mount cycles', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        const Comp = defineComponent({
            setup() {
                const [v] = useAni(timeline, { opacity: 0 })
                return () => h('p', String(v.value.opacity))
            },
        })
        for (let i = 0; i < 1000; i++) {
            const app = createApp(Comp)
            app.mount(document.createElement('div'))
            app.unmount()
        }
        expect(subs.live).toBe(0)
    })
})
