// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import { createClock, createStyleSheet } from '@freestylejs/ani-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    type ComponentPublicInstance,
    type ComputedRef,
    createApp,
    defineComponent,
    h,
    nextTick,
    type StyleValue,
} from 'vue'
import { createManualClockWith } from '../../../../core/src/__tests__/integration/harness'
import { useAniStates } from '../../index'

const states = () => ({
    idle: a.ani({ to: { opacity: 0 }, duration: 1, timing: a.timing.linear() }),
    shown: a.ani({
        to: { opacity: 1 },
        duration: 1,
        timing: a.timing.linear(),
    }),
})
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

type Setup = {
    ref: (element: Element | ComponentPublicInstance | null) => void
    style: ComputedRef<StyleValue | undefined>
}

/** Mounts `<div :ref="ref" :style="style">` driven by `use`. */
function mountStates<R extends Setup>(use: () => R) {
    const state: { result?: R } = {}
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
    return { ...view, result: state.result as R }
}

describe('vue useAniStates', () => {
    afterEach(() => {
        document.body.innerHTML = ''
        vi.restoreAllMocks()
    })

    it('A1: returns { ref, style, state, transitionTo, machine }, not the old tuple', async () => {
        const m = clockOf()
        const view = mountStates(() =>
            useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0 },
                states: states(),
                clock: m.clock,
            })
        )
        const result = view.result
        expect(Array.isArray(result)).toBe(false)
        expect(Object.keys(result).sort()).toEqual([
            'machine',
            'ref',
            'state',
            'style',
            'transitionTo',
        ])
        expect(typeof result.ref).toBe('function')
        expect(typeof result.transitionTo).toBe('function')
        expect(typeof result.machine.bind).toBe('function')
        expect(typeof result.machine.dispose).toBe('function')
        expect(result.state.value).toBe('idle')
        expect(result.machine.state()).toBe('idle')
        await view.unmount()
    })

    it('A2: style is the createStyleSheet of initialValue, resolver included', async () => {
        const m = clockOf()
        const plain = mountStates(() =>
            useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0.25 },
                states: states(),
                clock: m.clock,
            })
        )
        expect(plain.result.style.value).toEqual(
            createStyleSheet({ opacity: 0.25 })
        )
        expect(plain.el().style.opacity).toBe('0.25')
        await plain.unmount()

        const resolver = {
            x: (value: number) => ({ key: '--x', value: `${value}px` }),
        }
        const resolved = mountStates(() =>
            useAniStates({
                initial: 'open',
                initialValue: { x: 5 },
                states: {
                    open: a.ani({ to: { x: 100 }, duration: 1 }),
                },
                clock: m.clock,
                resolver,
            })
        )
        expect(resolved.result.style.value).toEqual(
            createStyleSheet({ x: 5 }, resolver)
        )
        expect(resolved.el().style.getPropertyValue('--x')).toBe('5px')
        await resolved.unmount()
    })

    it('A3: transitionTo animates the element through machine.bind and updates state', async () => {
        const m = clockOf()
        const view = mountStates(() =>
            useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0 },
                states: states(),
                clock: m.clock,
            })
        )
        const el = view.el()
        const run = view.result.transitionTo('shown')
        expect(view.result.state.value).toBe('shown')

        m.frames(5, 100)
        expect(opacity(el)).toBeCloseTo(0.5, 5)
        m.frames(5, 100)
        expect(opacity(el)).toBeCloseTo(1, 5)
        expect(await run).toBe('ended')
        await view.unmount()
    })

    it('A4: state follows transitions made on the machine directly', async () => {
        const m = clockOf()
        const view = mountStates(() =>
            useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0 },
                states: states(),
                clock: m.clock,
            })
        )
        void view.result.machine.transitionTo('shown')
        expect(view.result.state.value).toBe('shown')
        expect(opacity(view.el())).toBeCloseTo(0, 5)
        m.frames(3, 100)
        expect(opacity(view.el())).toBeCloseTo(0.3, 5)

        void view.result.machine.transitionTo('idle')
        expect(view.result.state.value).toBe('idle')
        await view.unmount()
    })

    it('A5: interrupting a transition continues from the current value', async () => {
        const m = clockOf()
        const view = mountStates(() =>
            useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0 },
                states: states(),
                clock: m.clock,
            })
        )
        const el = view.el()
        const first = view.result.transitionTo('shown')
        m.frames(5, 100)
        expect(opacity(el)).toBeCloseTo(0.5, 5)

        const second = view.result.transitionTo('idle')
        expect(await first).toBe('interrupted')
        m.frames(1, 100)
        const next = opacity(el)
        expect(next).toBeLessThan(0.5)
        expect(next).toBeGreaterThan(0.3)

        m.frames(10, 100)
        expect(await second).toBe('ended')
        expect(opacity(el)).toBeCloseTo(0, 5)
        await view.unmount()
    })

    it('A6: the state is readonly for the caller', async () => {
        const m = clockOf()
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const view = mountStates(() =>
            useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0 },
                states: states(),
                clock: m.clock,
            })
        )
        const writable = view.result.state as { value: string }
        writable.value = 'shown'
        expect(view.result.state.value).toBe('idle')
        await view.unmount()
    })

    it('A7: the machine is disposed with its component and the clock is released', async () => {
        const m = clockOf()
        const view = mountStates(() =>
            useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0 },
                states: states(),
                clock: m.clock,
            })
        )
        const el = view.el()
        const machine = view.result.machine
        const run = machine.transitionTo('shown')
        m.frames(3, 100)
        expect(m.clock.size).toBe(1)

        await view.unmount()
        expect(await run).toBe('disposed')
        expect(m.clock.size).toBe(0)
        m.frames(2, 100)
        expect(opacity(el)).toBeCloseTo(0.3, 5)
        expect(await machine.transitionTo('idle')).toBe('disposed')
    })

    it('A8: outside a component the caller disposes the machine, without warnings', async () => {
        const m = clockOf()
        const warn = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined)
        const result = useAniStates({
            initial: 'idle',
            initialValue: { opacity: 0 },
            states: states(),
            clock: m.clock,
        })
        expect(warn).not.toHaveBeenCalled()
        const el = document.createElement('div')
        result.ref(el)

        const run = result.transitionTo('shown')
        m.frames(5, 100)
        expect(opacity(el)).toBeCloseTo(0.5, 5)
        expect(result.state.value).toBe('shown')

        result.machine.dispose()
        expect(await run).toBe('disposed')
        expect(m.clock.size).toBe(0)
    })

    it('A9: ref(null) unbinds and calling ref again does not leak bindings', async () => {
        const m = clockOf()
        const view = mountStates(() =>
            useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0 },
                states: states(),
                clock: m.clock,
            })
        )
        const el = view.el()
        view.result.ref(el)
        view.result.ref(el)
        void view.result.transitionTo('shown')
        m.frames(3, 100)
        expect(opacity(el)).toBeCloseTo(0.3, 5)

        view.result.ref(null)
        m.frames(2, 100)
        expect(opacity(el)).toBeCloseTo(0.3, 5)
        await view.unmount()
    })

    it('A10: a transition made during setup is shown once the element mounts', async () => {
        const m = clockOf()
        const container = document.createElement('div')
        document.body.appendChild(container)
        let transition!: Promise<string>
        const app = createApp(
            defineComponent({
                setup() {
                    const result = useAniStates({
                        initial: 'idle',
                        initialValue: { opacity: 0 },
                        states: states(),
                        clock: m.clock,
                    })
                    transition = result.transitionTo('shown')
                    return () =>
                        h('div', {
                            ref: result.ref,
                            style: result.style.value,
                        })
                },
            })
        )
        app.mount(container)
        const el = container.firstElementChild as HTMLElement
        m.frames(5, 100)
        expect(opacity(el)).toBeCloseTo(0.5, 5)
        m.frames(5, 100)
        expect(await transition).toBe('ended')
        app.unmount()
        container.remove()
    })

    it('A11: machine exposes the latest value', async () => {
        const m = clockOf()
        const view = mountStates(() =>
            useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0 },
                states: states(),
                clock: m.clock,
            })
        )
        expect(view.result.machine.value.opacity).toBe(0)
        void view.result.transitionTo('shown')
        m.frames(2, 100)
        expect(view.result.machine.value.opacity).toBeCloseTo(0.2, 5)
        await view.unmount()
    })
})
