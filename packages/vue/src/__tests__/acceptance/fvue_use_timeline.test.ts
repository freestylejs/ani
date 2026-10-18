// @vitest-environment jsdom

import { a, createClock, follow, rafTimeline } from '@freestylejs/ani-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, effectScope, h, nextTick, ref } from 'vue'
import { createManualClockWith } from '../../../../core/src/__tests__/integration/harness'
import { useTimeline } from '../../index'

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

describe('vue useTimeline', () => {
    afterEach(() => {
        document.body.innerHTML = ''
        vi.restoreAllMocks()
    })

    it('A1: creates once, returns the instance, disposes it once on unmount', async () => {
        const dispose = vi.fn()
        const created = { dispose }
        const factory = vi.fn(() => created)
        const bump = ref(0)
        let result: typeof created | undefined
        const view = mountApp(
            defineComponent({
                setup() {
                    result = useTimeline(factory)
                    return () => h('p', String(bump.value))
                },
            })
        )
        expect(factory).toHaveBeenCalledTimes(1)
        expect(result).toBe(created)

        bump.value++
        await nextTick()
        expect(factory).toHaveBeenCalledTimes(1)
        expect(dispose).not.toHaveBeenCalled()

        await view.unmount()
        expect(dispose).toHaveBeenCalledTimes(1)
        expect(factory).toHaveBeenCalledTimes(1)
    })

    it('A2: disposes a real timeline with its component, leaving the clock', async () => {
        const m = createManualClockWith(createClock)
        let timeline!: ReturnType<typeof rafTimeline<{ opacity: number }>>
        const view = mountApp(
            defineComponent({
                setup() {
                    timeline = useTimeline(() =>
                        rafTimeline(node(), { clock: m.clock })
                    )
                    return () => h('p')
                },
            })
        )
        const run = timeline.play({ from: { opacity: 0 } })
        m.frames(2, 100)
        expect(m.clock.size).toBe(1)

        await view.unmount()
        expect(await run).toBe('disposed')
        expect(m.clock.size).toBe(0)
        expect(await timeline.play({ from: { opacity: 0 } })).toBe('disposed')
    })

    it('A3: disposes a follower created by the factory', async () => {
        const m = createManualClockWith(createClock)
        let follower!: ReturnType<typeof follow<{ x: number }>>
        const view = mountApp(
            defineComponent({
                setup() {
                    follower = useTimeline(() =>
                        follow({ x: 0 }, { clock: m.clock })
                    )
                    return () => h('p')
                },
            })
        )
        void follower.set({ x: 10 })
        m.frames(1, 16)
        expect(follower.status).toBe('PLAYING')

        await view.unmount()
        expect(m.clock.size).toBe(0)
        expect(await follower.set({ x: 20 })).toBe('disposed')
    })

    it('A4: each component instance owns and disposes its own object', async () => {
        const disposers = [vi.fn(), vi.fn()]
        let next = 0
        const make = () => ({ dispose: disposers[next++] as () => void })
        const Item = defineComponent({
            setup() {
                useTimeline(make)
                return () => h('i')
            },
        })
        const show = ref([true, true])
        const view = mountApp(
            defineComponent({
                setup: () => () =>
                    show.value.map((on) => (on ? h(Item) : null)),
            })
        )
        expect(next).toBe(2)

        show.value = [false, true]
        await nextTick()
        expect(disposers[0]).toHaveBeenCalledTimes(1)
        expect(disposers[1]).not.toHaveBeenCalled()

        await view.unmount()
        expect(disposers[0]).toHaveBeenCalledTimes(1)
        expect(disposers[1]).toHaveBeenCalledTimes(1)
    })

    it('A5: is disposed when a plain effect scope stops', () => {
        const dispose = vi.fn()
        const scope = effectScope()
        const result = scope.run(() => useTimeline(() => ({ dispose })))
        expect(result).toBeDefined()
        expect(dispose).not.toHaveBeenCalled()
        scope.stop()
        expect(dispose).toHaveBeenCalledTimes(1)
    })

    it('A6: works outside any scope without warning; the caller disposes', () => {
        const warn = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined)
        const dispose = vi.fn()
        const created = { dispose }
        const result = useTimeline(() => created)
        expect(result).toBe(created)
        expect(dispose).not.toHaveBeenCalled()
        expect(warn).not.toHaveBeenCalled()
        result.dispose()
        expect(dispose).toHaveBeenCalledTimes(1)
    })

    it('A7: a throwing factory fails loudly and synchronously', () => {
        expect(() =>
            useTimeline(() => {
                throw new TypeError('boom')
            })
        ).toThrow('boom')
    })
})
