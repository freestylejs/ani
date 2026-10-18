// @vitest-environment jsdom

import {
    a,
    createClock,
    createStyleSheet,
    type RafGroup,
    rafGroup,
} from '@freestylejs/ani-core'
import { afterEach, describe, expect, it } from 'vitest'
import {
    type ComponentPublicInstance,
    type ComputedRef,
    createApp,
    defineComponent,
    h,
    nextTick,
    ref,
    type StyleValue,
    shallowRef,
} from 'vue'
import { createManualClockWith } from '../../../../core/src/__tests__/integration/harness'
import { useAniGroup } from '../../index'

type GroupBinding = {
    ref: (
        index: number
    ) => (element: Element | ComponentPublicInstance | null) => void
    style: ComputedRef<StyleValue | undefined>
}

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })
const clockOf = () => createManualClockWith(createClock)
const opacity = (el: Element | null | undefined) =>
    Number((el as HTMLElement).style.opacity)

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

/** Mounts one `<li :ref="ref(i)" :style="style">` per entry of `items`. */
function mountList(use: () => GroupBinding, items = ref([0, 1, 2])) {
    const state: { binding?: GroupBinding } = {}
    const view = mountApp(
        defineComponent({
            setup() {
                const binding = use()
                state.binding = binding
                return () =>
                    h(
                        'ul',
                        items.value.map((i) =>
                            h('li', {
                                key: i,
                                ref: binding.ref(i),
                                style: binding.style.value,
                            })
                        )
                    )
            },
        })
    )
    return {
        ...view,
        items,
        binding: state.binding as GroupBinding,
        els: () => [...view.container.querySelectorAll('li')],
    }
}

describe('vue useAniGroup', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('A1: ref(index) binds each element to its own index through the group', async () => {
        const m = clockOf()
        const group = rafGroup(node(), { clock: m.clock, stagger: 0.5 })
        const view = mountList(() => useAniGroup(group))
        const els = view.els()
        expect(els).toHaveLength(3)

        void group.play({ from: { opacity: 0 }, count: 3 })
        m.frames(5, 100)
        expect(opacity(els[0])).toBeCloseTo(0.5, 5)
        expect(opacity(els[1])).toBeCloseTo(0, 5)
        expect(opacity(els[2])).toBeCloseTo(0, 5)

        m.frames(5, 100)
        expect(opacity(els[0])).toBeCloseTo(1, 5)
        expect(opacity(els[1])).toBeCloseTo(0.5, 5)
        expect(opacity(els[2])).toBeCloseTo(0, 5)

        m.frames(5, 100)
        expect(opacity(els[1])).toBeCloseTo(1, 5)
        expect(opacity(els[2])).toBeCloseTo(0.5, 5)
        await view.unmount()
    })

    it('A2: ref(index) returns the same function for the same index', async () => {
        const m = clockOf()
        const group = rafGroup(node(), { clock: m.clock })
        const view = mountList(() => useAniGroup(group))
        const { ref: refAt } = view.binding
        expect(refAt(0)).toBe(refAt(0))
        expect(refAt(2)).toBe(refAt(2))
        expect(refAt(0)).not.toBe(refAt(1))
        await view.unmount()
    })

    it('A3: style is the createStyleSheet of initialValue, undefined without one', async () => {
        const m = clockOf()
        const group = rafGroup(node(), { clock: m.clock })
        const withInitial = mountList(() =>
            useAniGroup(group, { initialValue: { opacity: 0.25 } })
        )
        expect(withInitial.binding.style.value).toEqual(
            createStyleSheet({ opacity: 0.25 })
        )
        for (const el of withInitial.els())
            expect(el.style.opacity).toBe('0.25')
        await withInitial.unmount()

        const bare = mountList(() => useAniGroup(group))
        expect(bare.binding.style.value).toBeUndefined()
        await bare.unmount()
    })

    it('A4: a resolver shapes the initial style and every item', async () => {
        const m = clockOf()
        const group = rafGroup(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() }),
            { clock: m.clock }
        )
        const resolver = {
            x: (value: number) => ({ key: '--x', value: `${value}px` }),
        }
        const view = mountList(() =>
            useAniGroup(group, { initialValue: { x: 5 }, resolver })
        )
        expect(view.binding.style.value).toEqual(
            createStyleSheet({ x: 5 }, resolver)
        )
        for (const el of view.els()) {
            expect(el.style.getPropertyValue('--x')).toBe('5px')
        }

        void group.play({ from: { x: 0 }, count: 3 })
        m.frames(5, 100)
        for (const el of view.els()) {
            expect(el.style.getPropertyValue('--x')).toBe('50px')
        }
        await view.unmount()
    })

    it('A5: a removed item stops being written, the others keep animating', async () => {
        const m = clockOf()
        const group = rafGroup(node(), { clock: m.clock })
        const items = ref([0, 1, 2])
        const view = mountList(() => useAniGroup(group), items)
        const [first, second, third] = view.els()

        void group.play({ from: { opacity: 0 }, count: 3 })
        m.frames(3, 100)
        expect(opacity(third)).toBeCloseTo(0.3, 5)

        items.value = [0, 1]
        await nextTick()
        expect(view.els()).toHaveLength(2)
        m.frames(2, 100)
        expect(opacity(first)).toBeCloseTo(0.5, 5)
        expect(opacity(second)).toBeCloseTo(0.5, 5)
        expect(opacity(third)).toBeCloseTo(0.3, 5)
        await view.unmount()
    })

    it('A6: an item that mounts later is bound to its index', async () => {
        const m = clockOf()
        const group = rafGroup(node(), { clock: m.clock })
        const items = ref([0, 1])
        const view = mountList(() => useAniGroup(group), items)

        void group.play({ from: { opacity: 0 }, count: 3 })
        m.frames(3, 100)

        items.value = [0, 1, 2]
        await nextTick()
        const late = view.els()[2]
        expect(opacity(late)).toBeCloseTo(0.3, 5)
        m.frames(2, 100)
        expect(opacity(late)).toBeCloseTo(0.5, 5)
        await view.unmount()
    })

    it('A7: component instances resolve to their $el', async () => {
        const m = clockOf()
        const group = rafGroup(node(), { clock: m.clock })
        const Child = defineComponent({
            setup: () => () => h('section'),
        })
        let binding!: GroupBinding
        const view = mountApp(
            defineComponent({
                setup() {
                    binding = useAniGroup(group, {
                        initialValue: { opacity: 0.25 },
                    })
                    return () =>
                        [0, 1].map((i) =>
                            h(Child, {
                                key: i,
                                ref: binding.ref(i),
                                style: binding.style.value,
                            })
                        )
                },
            })
        )
        const els = [...view.container.querySelectorAll('section')]
        expect(els).toHaveLength(2)
        expect(els[0]?.style.opacity).toBe('0.25')

        void group.play({ from: { opacity: 0 }, count: 2 })
        m.frames(5, 100)
        expect(opacity(els[0])).toBeCloseTo(0.5, 5)
        expect(opacity(els[1])).toBeCloseTo(0.5, 5)
        await view.unmount()
    })

    it('A8: calling a ref again with the same element does not leak bindings', async () => {
        const m = clockOf()
        const group = rafGroup(node(), { clock: m.clock })
        const view = mountList(() => useAniGroup(group))
        const el = view.els()[1] as HTMLElement
        view.binding.ref(1)(el)
        view.binding.ref(1)(el)

        void group.play({ from: { opacity: 0 }, count: 3 })
        m.frames(3, 100)
        expect(opacity(el)).toBeCloseTo(0.3, 5)

        view.binding.ref(1)(null)
        m.frames(2, 100)
        expect(opacity(el)).toBeCloseTo(0.3, 5)
        await view.unmount()
    })

    it('A9: a Ref group is followed: elements are rebound on swap', async () => {
        const m = clockOf()
        const first = rafGroup(node(), { clock: m.clock })
        const second = rafGroup(node(), { clock: m.clock })
        const current = shallowRef<RafGroup<{ opacity: number }>>(first)
        const view = mountList(() => useAniGroup(current))
        const els = view.els()

        void first.play({ from: { opacity: 0 }, count: 3 })
        m.frames(3, 100)
        expect(opacity(els[0])).toBeCloseTo(0.3, 5)

        void second.play({ from: { opacity: 0.8 }, count: 3 })
        current.value = second
        await nextTick()
        for (const el of els) expect(opacity(el)).toBeCloseTo(0.8, 5)

        // the first group still runs, but no longer writes the elements
        m.frames(1, 100)
        for (const el of els) expect(opacity(el)).toBeCloseTo(0.82, 5)
        await view.unmount()
    })

    it('A10: unmount unbinds the elements and leaves the group alive', async () => {
        const m = clockOf()
        const group = rafGroup(node(), { clock: m.clock })
        const view = mountList(() => useAniGroup(group))
        const els = view.els()
        void group.play({ from: { opacity: 0 }, count: 3 })
        m.frames(3, 100)

        await view.unmount()
        m.frames(2, 100)
        for (const el of els) expect(opacity(el)).toBeCloseTo(0.3, 5)

        const run = group.play({ from: { opacity: 0 }, count: 3 })
        m.frames(12, 100)
        expect(await run).toBe('ended')
    })

    it('A11: nothing subscribes to the clock before the group plays', async () => {
        const m = clockOf()
        const group = rafGroup(node(), { clock: m.clock })
        const view = mountList(() =>
            useAniGroup(group, { initialValue: { opacity: 0.25 } })
        )
        expect(m.clock.size).toBe(0)
        await view.unmount()
        expect(m.clock.size).toBe(0)
    })
})
