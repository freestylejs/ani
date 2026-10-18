// @vitest-environment jsdom

import { createClock, createStyleSheet } from '@freestylejs/ani-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createManualClockWith } from '../../../../core/src/__tests__/integration/harness'
import { useFollow } from '../../index'

const clockOf = () => createManualClockWith(createClock)
const opacity = (el: HTMLElement) => Number(el.style.opacity)

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

/** Mounts `<div :ref="ref" :style="style">` driven by `useFollow`. */
function mountFollow<G extends Record<string, number>>(
    use: () => ReturnType<typeof useFollow<G>>
) {
    const state: { result?: ReturnType<typeof useFollow<G>> } = {}
    const view = mountApp(
        defineComponent({
            setup() {
                const result = use()
                state.result = result
                return () =>
                    h('div', { ref: result.ref, style: result.style.value })
            },
        })
    )
    return {
        ...view,
        result: state.result as ReturnType<typeof useFollow<G>>,
    }
}

describe('vue useFollow', () => {
    afterEach(() => {
        document.body.innerHTML = ''
        vi.restoreAllMocks()
    })

    it('A1: returns { ref, style, follower } and starts at the initial value', async () => {
        const m = clockOf()
        const view = mountFollow(() =>
            useFollow({ opacity: 0.25 }, { clock: m.clock })
        )
        expect(Object.keys(view.result).sort()).toEqual([
            'follower',
            'ref',
            'style',
        ])
        expect(view.result.follower.value).toEqual({ opacity: 0.25 })
        expect(view.result.follower.target).toEqual({ opacity: 0.25 })
        expect(view.result.follower.status).toBe('IDLE')
        expect(m.clock.size).toBe(0)
        await view.unmount()
    })

    it('A2: style is the createStyleSheet of the initial value, resolver included', async () => {
        const m = clockOf()
        const plain = mountFollow(() =>
            useFollow({ opacity: 0.25, translateX: 8 }, { clock: m.clock })
        )
        expect(plain.result.style.value).toEqual(
            createStyleSheet({ opacity: 0.25, translateX: 8 })
        )
        expect(plain.el().style.opacity).toBe('0.25')
        expect(plain.el().style.transform).toBe('translateX(8px)')
        await plain.unmount()

        const resolver = {
            x: (value: number) => ({ key: '--x', value: `${value}px` }),
        }
        const resolved = mountFollow(() =>
            useFollow({ x: 5 }, { clock: m.clock, resolver })
        )
        expect(resolved.result.style.value).toEqual(
            createStyleSheet({ x: 5 }, resolver)
        )
        expect(resolved.el().style.getPropertyValue('--x')).toBe('5px')
        await resolved.unmount()
    })

    it('A3: set moves the element toward the target through bind', async () => {
        const m = clockOf()
        const view = mountFollow(() =>
            useFollow({ opacity: 0 }, { clock: m.clock })
        )
        const el = view.el()
        const run = view.result.follower.set({ opacity: 1 })
        expect(view.result.follower.target).toEqual({ opacity: 1 })

        m.frames(3, 16)
        const mid = opacity(el)
        expect(mid).toBeGreaterThan(0)
        expect(mid).toBeLessThan(1)
        expect(mid).toBeCloseTo(view.result.follower.value.opacity, 5)

        m.frames(120, 16)
        expect(await run).toBe('ended')
        expect(opacity(el)).toBeCloseTo(1, 2)
        expect(view.result.follower.status).toBe('IDLE')
        await view.unmount()
    })

    it('A4: jump writes the element synchronously', async () => {
        const m = clockOf()
        const view = mountFollow(() =>
            useFollow({ opacity: 0 }, { clock: m.clock })
        )
        view.result.follower.jump({ opacity: 0.75 })
        expect(view.el().style.opacity).toBe('0.75')
        expect(view.result.follower.value).toEqual({ opacity: 0.75 })
        expect(m.clock.size).toBe(0)
        await view.unmount()
    })

    it('A5: the spring option is honored', async () => {
        const m = clockOf()
        const stiff = mountFollow(() =>
            useFollow(
                { opacity: 0 },
                { clock: m.clock, spring: { m: 1, k: 2000, c: 90 } }
            )
        )
        const soft = mountFollow(() =>
            useFollow(
                { opacity: 0 },
                { clock: m.clock, spring: { m: 1, k: 20, c: 9 } }
            )
        )
        void stiff.result.follower.set({ opacity: 1 })
        void soft.result.follower.set({ opacity: 1 })
        m.frames(4, 16)
        expect(opacity(stiff.el())).toBeGreaterThan(opacity(soft.el()))
        await stiff.unmount()
        await soft.unmount()
    })

    it('A6: unmount unbinds the element and disposes the follower', async () => {
        const m = clockOf()
        const view = mountFollow(() =>
            useFollow({ opacity: 0 }, { clock: m.clock })
        )
        const el = view.el()
        const follower = view.result.follower
        const run = follower.set({ opacity: 1 })
        m.frames(3, 16)
        const before = opacity(el)
        expect(m.clock.size).toBe(1)

        await view.unmount()
        expect(await run).toBe('disposed')
        expect(m.clock.size).toBe(0)
        m.frames(3, 16)
        expect(opacity(el)).toBe(before)
        expect(await follower.set({ opacity: 0 })).toBe('disposed')
    })

    it('A7: outside a component the caller disposes the follower, without warnings', async () => {
        const m = clockOf()
        const warn = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined)
        const result = useFollow({ opacity: 0 }, { clock: m.clock })
        expect(warn).not.toHaveBeenCalled()
        const el = document.createElement('div')
        result.ref(el)

        void result.follower.set({ opacity: 1 })
        m.frames(3, 16)
        expect(opacity(el)).toBeGreaterThan(0)

        result.follower.dispose()
        expect(m.clock.size).toBe(0)
    })

    it('A8: ref(null) unbinds and calling ref again does not leak bindings', async () => {
        const m = clockOf()
        const view = mountFollow(() =>
            useFollow({ opacity: 0 }, { clock: m.clock })
        )
        const el = view.el()
        view.result.ref(el)
        view.result.ref(el)
        void view.result.follower.set({ opacity: 1 })
        m.frames(3, 16)
        const before = opacity(el)
        expect(before).toBeGreaterThan(0)

        view.result.ref(null)
        m.frames(3, 16)
        expect(opacity(el)).toBe(before)
        await view.unmount()
    })

    it('A9: a component instance resolves to its $el', async () => {
        const m = clockOf()
        const Child = defineComponent({
            setup: () => () => h('section'),
        })
        let result!: ReturnType<typeof useFollow<{ opacity: number }>>
        const view = mountApp(
            defineComponent({
                setup() {
                    result = useFollow({ opacity: 0.25 }, { clock: m.clock })
                    return () =>
                        h(Child, {
                            ref: result.ref,
                            style: result.style.value,
                        })
                },
            })
        )
        const el = view.el()
        expect(el.tagName).toBe('SECTION')
        expect(el.style.opacity).toBe('0.25')

        result.follower.jump({ opacity: 0.5 })
        expect(el.style.opacity).toBe('0.5')
        await view.unmount()
    })

    it('A10: invalid input fails loudly and synchronously', () => {
        const m = clockOf()
        expect(() =>
            useFollow({ opacity: Number.NaN }, { clock: m.clock })
        ).toThrow(TypeError)
    })
})
