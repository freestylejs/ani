// @vitest-environment node

import * as a from '@freestylejs/ani-core'
import { createClock, rafGroup, rafTimeline } from '@freestylejs/ani-core'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { createManualClockWith } from '../../../../core/src/__tests__/integration/harness'
import {
    useAni,
    useAniGroup,
    useAniRef,
    useAniStates,
    useFollow,
    useTimeline,
} from '../../index'

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

const render = (component: ReturnType<typeof defineComponent>) =>
    renderToString(createSSRApp(component))

describe('vue SSR', () => {
    it('A1: runs in a DOM-less environment', () => {
        expect(typeof window).toBe('undefined')
        expect(typeof document).toBe('undefined')
    })

    it('A2: useAniRef renders its initialValue as an inline style and retains nothing', async () => {
        const m = createManualClockWith(createClock)
        const timeline = rafTimeline(
            a.ani({ to: { opacity: 1, translateX: 10 }, duration: 1 }),
            { clock: m.clock }
        )
        const html = await render(
            defineComponent({
                setup() {
                    const { ref, style } = useAniRef(timeline, {
                        initialValue: { opacity: 0.25, translateX: 8 },
                    })
                    return () =>
                        h('div', { ref, style: style.value }, 'content')
                },
            })
        )
        expect(html).toContain('opacity:0.25')
        expect(html).toContain('transform:translateX(8px)')
        expect(html).toContain('content')
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('A3: useAniRef honors a resolver on the server', async () => {
        const m = createManualClockWith(createClock)
        const timeline = rafTimeline(a.ani({ to: { x: 100 }, duration: 1 }), {
            clock: m.clock,
        })
        const html = await render(
            defineComponent({
                setup() {
                    const { ref, style } = useAniRef(timeline, {
                        initialValue: { x: 5 },
                        resolver: {
                            x: (value) => ({ key: '--x', value: `${value}px` }),
                        },
                    })
                    return () => h('div', { ref, style: style.value })
                },
            })
        )
        expect(html).toContain('--x:5px')
        expect(m.clock.size).toBe(0)
    })

    it('A4: useAniGroup renders the initialValue style on every item', async () => {
        const m = createManualClockWith(createClock)
        const group = rafGroup(node(), { clock: m.clock })
        const html = await render(
            defineComponent({
                setup() {
                    const { ref, style } = useAniGroup(group, {
                        initialValue: { opacity: 0.25 },
                    })
                    return () =>
                        h(
                            'ul',
                            [0, 1, 2].map((i) =>
                                h('li', {
                                    key: i,
                                    ref: ref(i),
                                    style: style.value,
                                })
                            )
                        )
                },
            })
        )
        expect(html.match(/opacity:0\.25/g)).toHaveLength(3)
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('A5: useAniStates renders the initialValue style and the initial state', async () => {
        const m = createManualClockWith(createClock)
        const html = await render(
            defineComponent({
                setup() {
                    const { ref, style, state } = useAniStates({
                        initial: 'idle',
                        initialValue: { opacity: 0.25 },
                        states: {
                            idle: a.ani({ to: { opacity: 0 }, duration: 1 }),
                            shown: a.ani({ to: { opacity: 1 }, duration: 1 }),
                        },
                        clock: m.clock,
                    })
                    return () =>
                        h(
                            'div',
                            { ref, style: style.value },
                            String(state.value)
                        )
                },
            })
        )
        expect(html).toContain('opacity:0.25')
        expect(html).toContain('>idle<')
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('A6: useFollow renders the initial value as an inline style', async () => {
        const m = createManualClockWith(createClock)
        const html = await render(
            defineComponent({
                setup() {
                    const { ref, style } = useFollow(
                        { opacity: 0.25 },
                        { clock: m.clock }
                    )
                    return () => h('div', { ref, style: style.value })
                },
            })
        )
        expect(html).toContain('opacity:0.25')
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('A7: useAni and useTimeline render without subscribing to a clock', async () => {
        const m = createManualClockWith(createClock)
        const timeline = rafTimeline(node(), { clock: m.clock })
        const html = await render(
            defineComponent({
                setup() {
                    const [value] = useAni(timeline, { opacity: 0.1 })
                    const owned = useTimeline(() =>
                        rafTimeline(node(), { clock: m.clock })
                    )
                    return () =>
                        h('p', `${value.value.opacity}:${owned.status}`)
                },
            })
        )
        expect(html).toContain('0.1:IDLE')
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })
})
