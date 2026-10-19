// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import {
    createClock,
    createStyleSheet,
    type RafTimeline,
    rafTimeline,
} from '@freestylejs/ani-core'
import { afterEach, describe, expect, it } from 'vitest'
import {
    type ComponentPublicInstance,
    type ComputedRef,
    createApp,
    defineComponent,
    h,
    nextTick,
    type Ref,
    ref,
    type StyleValue,
    shallowRef,
} from 'vue'
import { createManualClockWith } from '../../../../core/src/__tests__/integration/harness'
import { useAniRef } from '../../index'

type Binding = {
    ref: (element: Element | ComponentPublicInstance | null) => void
    style: ComputedRef<StyleValue | undefined>
}

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })
const clockOf = () => createManualClockWith(createClock)

function mountApp(component: ReturnType<typeof defineComponent>) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp(component)
    app.mount(container)
    return {
        container,
        el: () => container.firstElementChild as HTMLElement,
        unmount: async () => {
            app.unmount()
            await nextTick()
            container.remove()
        },
    }
}

/** Mounts `<div :ref="ref" :style="style">` driven by `use`. */
function mountBinding(use: () => Binding) {
    const state: { binding?: Binding; bump: Ref<number> } = {
        bump: ref(0),
    }
    const view = mountApp(
        defineComponent({
            setup() {
                const binding = use()
                state.binding = binding
                return () =>
                    h(
                        'div',
                        { ref: binding.ref, style: binding.style.value },
                        String(state.bump.value)
                    )
            },
        })
    )
    return { ...view, binding: state.binding as Binding, bump: state.bump }
}

const opacity = (el: HTMLElement) => Number(el.style.opacity)

describe('vue useAniRef', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('A1: renders the initialValue style and follows the clock through bind', async () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const view = mountBinding(() =>
            useAniRef(timeline, { initialValue: { opacity: 0.25 } })
        )
        expect(view.el().style.opacity).toBe('0.25')

        void timeline.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(opacity(view.el())).toBeCloseTo(0.5, 5)
        m.frames(5, 100)
        expect(opacity(view.el())).toBeCloseTo(1, 5)
        await view.unmount()
    })

    it('A2: style is the createStyleSheet of initialValue, undefined without one', async () => {
        const m = clockOf()
        const timeline = rafTimeline(
            a.ani({ to: { opacity: 1, translateX: 10 }, duration: 1 }),
            { clock: m.clock }
        )
        const withInitial = mountBinding(() =>
            useAniRef(timeline, {
                initialValue: { opacity: 0.5, translateX: 4 },
            })
        )
        expect(withInitial.binding.style.value).toEqual(
            createStyleSheet({ opacity: 0.5, translateX: 4 })
        )
        expect(withInitial.el().style.transform).toBe('translateX(4px)')
        await withInitial.unmount()

        const bare = mountBinding(() => useAniRef(timeline))
        expect(bare.binding.style.value).toBeUndefined()
        await bare.unmount()

        const optionless = mountBinding(() => useAniRef(timeline, {}))
        expect(optionless.binding.style.value).toBeUndefined()
        await optionless.unmount()
    })

    it('A3: a resolver shapes both the initial style and the frames', async () => {
        const m = clockOf()
        const timeline = rafTimeline(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() }),
            { clock: m.clock }
        )
        const resolver = {
            x: (value: number) => ({ key: '--x', value: `${value}px` }),
        }
        const view = mountBinding(() =>
            useAniRef(timeline, { initialValue: { x: 5 }, resolver })
        )
        expect(view.binding.style.value).toEqual(
            createStyleSheet({ x: 5 }, resolver)
        )
        expect(view.el().style.getPropertyValue('--x')).toBe('5px')

        void timeline.play({ from: { x: 0 } })
        m.frames(5, 100)
        expect(view.el().style.getPropertyValue('--x')).toBe('50px')
        await view.unmount()
    })

    it('A4: a component instance resolves to its $el', async () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        let binding!: Binding
        const Child = defineComponent({
            setup: () => () => h('section', { class: 'child' }),
        })
        const view = mountApp(
            defineComponent({
                setup() {
                    binding = useAniRef(timeline, {
                        initialValue: { opacity: 0.25 },
                    })
                    return () =>
                        h(Child, {
                            ref: binding.ref,
                            style: binding.style.value,
                        })
                },
            })
        )
        const el = view.el()
        expect(el.tagName).toBe('SECTION')
        expect(el.style.opacity).toBe('0.25')

        void timeline.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(opacity(el)).toBeCloseTo(0.5, 5)
        await view.unmount()
    })

    it('A5: calling ref again with the same element does not leak bindings', async () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const view = mountBinding(() =>
            useAniRef(timeline, { initialValue: { opacity: 0.25 } })
        )
        const el = view.el()
        view.binding.ref(el)
        view.binding.ref(el)
        view.binding.ref(el)

        void timeline.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(opacity(el)).toBeCloseTo(0.5, 5)

        view.binding.ref(null)
        m.frames(2, 100)
        expect(opacity(el)).toBeCloseTo(0.5, 5)
        await view.unmount()
    })

    it('A6: moving to another element stops writing the previous one', async () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const view = mountBinding(() => useAniRef(timeline))
        const first = document.createElement('div')
        const second = document.createElement('div')

        view.binding.ref(first)
        void timeline.play({ from: { opacity: 0 } })
        m.frames(3, 100)
        expect(opacity(first)).toBeCloseTo(0.3, 5)

        view.binding.ref(second)
        expect(opacity(second)).toBeCloseTo(0.3, 5)
        m.frames(2, 100)
        expect(opacity(first)).toBeCloseTo(0.3, 5)
        expect(opacity(second)).toBeCloseTo(0.5, 5)
        await view.unmount()
    })

    it('A7: unmount unbinds the element and leaves the timeline alive', async () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const view = mountBinding(() =>
            useAniRef(timeline, { initialValue: { opacity: 0.25 } })
        )
        const el = view.el()
        void timeline.play({ from: { opacity: 0 } })
        m.frames(3, 100)
        expect(opacity(el)).toBeCloseTo(0.3, 5)

        await view.unmount()
        m.frames(2, 100)
        expect(opacity(el)).toBeCloseTo(0.3, 5)

        const run = timeline.play({ from: { opacity: 0 } })
        m.frames(12, 100)
        expect(await run).toBe('ended')
    })

    it('A8: a Ref timeline is followed: the element is rebound on swap', async () => {
        const m = clockOf()
        const first = rafTimeline(node(), { clock: m.clock })
        const second = rafTimeline(node(), { clock: m.clock })
        const current = shallowRef<RafTimeline<{ opacity: number }>>(first)
        const view = mountBinding(() => useAniRef(current))
        const el = view.el()

        void first.play({ from: { opacity: 0 } })
        m.frames(3, 100)
        expect(opacity(el)).toBeCloseTo(0.3, 5)

        void second.play({ from: { opacity: 0.8 } })
        current.value = second
        await nextTick()
        expect(opacity(el)).toBeCloseTo(0.8, 5)

        // the first timeline still runs, but no longer writes the element
        m.frames(1, 100)
        expect(opacity(el)).toBeCloseTo(0.82, 5)
        await view.unmount()
    })

    it('A9: a re-render does not reset the animated style', async () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const view = mountBinding(() =>
            useAniRef(timeline, { initialValue: { opacity: 0.25 } })
        )
        const el = view.el()
        void timeline.play({ from: { opacity: 0 } })
        m.frames(5, 100)

        view.bump.value++
        await nextTick()
        expect(el.textContent).toBe('1')
        expect(opacity(el)).toBeCloseTo(0.5, 5)
        m.frames(2, 100)
        expect(opacity(el)).toBeCloseTo(0.7, 5)
        await view.unmount()
    })

    it('A10: nothing subscribes to the clock before the timeline plays', async () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const view = mountBinding(() =>
            useAniRef(timeline, { initialValue: { opacity: 0.25 } })
        )
        expect(m.clock.size).toBe(0)
        await view.unmount()
        expect(m.clock.size).toBe(0)
    })
})
