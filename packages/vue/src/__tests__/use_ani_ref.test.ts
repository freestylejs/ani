// @vitest-environment jsdom

import { a, type RafAniTimeline, rafTimeline } from '@freestylejs/ani-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { useAniRef } from '../ani/use_ani_ref'
import { createManualClock, trackListeners, trackSubscriptions } from './clock'

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })
const tracked = (el: EventTarget) =>
    el instanceof HTMLElement && el.hasAttribute('data-ani')

async function mountApp(component: ReturnType<typeof defineComponent>) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp(component)
    app.mount(container)
    await nextTick()
    return {
        container,
        unmount: async () => {
            app.unmount()
            await nextTick()
            container.remove()
        },
    }
}

describe('vue useAniRef', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('applies initial style and follows clock frames', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        let controller!: RafAniTimeline<{ opacity: number }>
        const view = await mountApp(
            defineComponent({
                setup() {
                    const [r, c] = useAniRef({
                        timeline,
                        initialValue: { opacity: 0.25 },
                    })
                    controller = c
                    return () => h('div', { ref: r })
                },
            })
        )
        const el = view.container.firstElementChild as HTMLElement
        expect(el.style.opacity).toBe('0.25')
        controller.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)

        controller.reset()
        expect(el.style.opacity).toBe('0.25')
        await view.unmount()
    })

    it('supports CSS custom properties from a resolver', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() }),
            m.clock
        )
        let controller!: RafAniTimeline<{ x: number }>
        const view = await mountApp(
            defineComponent({
                setup() {
                    const [r, c] = useAniRef({ timeline })
                    controller = c
                    return () => h('div', { ref: r })
                },
            })
        )
        controller.play({
            from: { x: 0 },
            propertyResolver: {
                x: (v: number) => ({ key: '--x', value: `${v}px` }),
            } as never,
        })
        m.frames(5, 100)
        expect(
            (
                view.container.firstElementChild as HTMLElement
            ).style.getPropertyValue('--x')
        ).toBe('50px')
        await view.unmount()
    })

    it('releases subscriptions and listeners on unmount and keeps the user timeline alive', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        const listeners = trackListeners(tracked)
        const onClick = vi.fn()
        const view = await mountApp(
            defineComponent({
                setup() {
                    const [r] = useAniRef({
                        timeline,
                        initialValue: { opacity: 0 },
                        events: { onClick },
                    })
                    return () => h('div', { ref: r, 'data-ani': '' })
                },
            })
        )
        const el = view.container.firstElementChild as HTMLElement
        expect(subs.live).toBe(1)
        expect(listeners.live).toBe(1)
        el.click()
        expect(onClick).toHaveBeenCalledTimes(1)

        timeline.play({ from: { opacity: 0 } })
        await view.unmount()
        expect(subs.live).toBe(0)
        expect(listeners.live).toBe(0)
        const before = el.style.opacity
        m.frames(3, 100)
        expect(el.style.opacity).toBe(before)
        el.click()
        expect(onClick).toHaveBeenCalledTimes(1)
        expect(m.clock.size).toBe(1)
        listeners.restore()
    })

    it('binds to a late-mounted element (v-if)', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const onClick = vi.fn()
        const show = ref(false)
        const view = await mountApp(
            defineComponent({
                setup() {
                    const [r] = useAniRef({
                        timeline,
                        initialValue: { opacity: 0.25 },
                        events: { onClick },
                    })
                    return () =>
                        show.value
                            ? h('div', { ref: r, id: 'late' })
                            : h('span')
                },
            })
        )
        show.value = true
        await nextTick()
        const el = view.container.querySelector('#late') as HTMLElement
        expect(el.style.opacity).toBe('0.25')
        el.click()
        expect(onClick).toHaveBeenCalledTimes(1)
        await view.unmount()
    })

    it('follows timeline ref swaps (shallowRef and deep ref) and detaches the old one', async () => {
        const m = createManualClock()
        const first = rafTimeline(node(), m.clock)
        const second = rafTimeline(node(), m.clock)
        const firstSubs = trackSubscriptions(first)
        const secondSubs = trackSubscriptions(second)
        second.play({ from: { opacity: 0.6 } })

        const current = shallowRef(first)
        const view = await mountApp(
            defineComponent({
                setup() {
                    const [r] = useAniRef({
                        timeline: current,
                        initialValue: { opacity: 0 },
                    })
                    return () => h('div', { ref: r })
                },
            })
        )
        const el = view.container.firstElementChild as HTMLElement
        expect(firstSubs.live).toBe(1)
        current.value = second
        expect(firstSubs.live).toBe(0)
        expect(secondSubs.live).toBe(1)
        expect(el.style.opacity).toBe('0.6')
        await view.unmount()
        expect(secondSubs.live).toBe(0)
    })

    it('uses the raw timeline when given a deep ref (clock never sees a proxy)', async () => {
        const m = createManualClock()
        const deep = ref(rafTimeline(node(), m.clock)) as unknown as {
            value: RafAniTimeline<{ opacity: number }>
        }
        const raw = rafTimeline(node(), m.clock)
        let controller!: RafAniTimeline<{ opacity: number }>
        const view = await mountApp(
            defineComponent({
                setup() {
                    const [r, c] = useAniRef<{ opacity: number }>({
                        timeline: deep as never,
                        initialValue: { opacity: 0 },
                    })
                    controller = c
                    return () => h('div', { ref: r })
                },
            })
        )
        controller.play({ from: { opacity: 0 } })
        expect(m.clock.size).toBe(1)
        // pausing through the controller must unsubscribe the same instance
        controller.pause()
        expect(m.clock.size).toBe(0)
        void raw
        await view.unmount()
    })

    it('does not grow subscriptions or listeners over 1000 mount/unmount cycles', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        const listeners = trackListeners(tracked)
        const events = {
            onClick: () => undefined,
            onMouseenter: () => undefined,
        }
        const Comp = defineComponent({
            setup() {
                const [r] = useAniRef({
                    timeline,
                    initialValue: { opacity: 0 },
                    events,
                })
                return () => h('div', { ref: r, 'data-ani': '' })
            },
        })
        for (let i = 0; i < 1000; i++) {
            const view = await mountApp(Comp)
            if (i === 0) {
                expect(subs.live).toBe(1)
                expect(listeners.live).toBe(2)
            }
            await view.unmount()
        }
        expect(subs.live).toBe(0)
        expect(listeners.live).toBe(0)
        listeners.restore()
    }, 60_000)
})
