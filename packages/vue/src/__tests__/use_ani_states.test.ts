// @vitest-environment jsdom

import { a } from '@freestylejs/ani-core'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, onMounted } from 'vue'
import { useAniStates } from '../ani/use_ani_states'
import { createManualClock } from './clock'

const linear = a.timing.linear()
const makeStates = () => ({
    idle: a.ani({ to: { opacity: 0 }, duration: 1, timing: linear }),
    active: a.ani({ to: { opacity: 1 }, duration: 1, timing: linear }),
})

function setup(
    onSetup?: (t: (s: 'idle' | 'active', c?: any, i?: boolean) => void) => void,
    childKick?: boolean
) {
    const m = createManualClock()
    const hook: { transitionTo?: any; state?: any; timeline?: any } = {}
    const Kick = defineComponent({
        props: { go: { type: Function, required: true } },
        setup(props) {
            onMounted(() => (props.go as () => void)())
            return () => h('i')
        },
    })
    const Comp = defineComponent({
        setup() {
            const [r, s, transitionTo] = useAniStates({
                initial: 'idle',
                initialFrom: { opacity: 0 },
                states: makeStates(),
                clock: m.clock,
            })
            hook.transitionTo = transitionTo
            hook.state = s.state
            hook.timeline = s.timeline
            onSetup?.(transitionTo)
            return () =>
                h('div', { ref: r }, [
                    childKick
                        ? h(Kick, {
                              go: () =>
                                  transitionTo('active', {
                                      from: { opacity: 0 },
                                  }),
                          })
                        : null,
                ])
        },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    return {
        m,
        hook,
        container,
        mount: async () => {
            const app = createApp(Comp)
            app.mount(container)
            await nextTick()
            return app
        },
    }
}

describe('vue useAniStates', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('transitions animate the element and mirror the state', async () => {
        const { m, hook, container, mount } = setup()
        const app = await mount()
        const el = container.firstElementChild as HTMLElement
        expect(hook.state.value).toBe('idle')
        hook.transitionTo('active', { from: { opacity: 0 } })
        m.frames(5, 100)
        expect(hook.state.value).toBe('active')
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        app.unmount()
    })

    it('stops the running timeline on unmount', async () => {
        const { m, hook, mount } = setup()
        const app = await mount()
        hook.transitionTo('active', { from: { opacity: 0 }, repeat: Infinity })
        m.frames(3, 100)
        expect(m.clock.size).toBe(1)
        app.unmount()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('does not miss a transition issued during setup()', async () => {
        const { m, container, mount } = setup((t) =>
            t('active', { from: { opacity: 0 } })
        )
        const app = await mount()
        m.frames(5, 100)
        expect(
            Number((container.firstElementChild as HTMLElement).style.opacity)
        ).toBeCloseTo(0.5, 5)
        app.unmount()
    })

    it('does not miss a transition issued by a child before the parent mounted', async () => {
        const { m, container, mount } = setup(undefined, true)
        const app = await mount()
        m.frames(5, 100)
        expect(
            Number((container.firstElementChild as HTMLElement).style.opacity)
        ).toBeCloseTo(0.5, 5)
        app.unmount()
    })

    it('rejects unknown states atomically and keeps the state ref in sync', async () => {
        const { hook, mount } = setup()
        const app = await mount()
        expect(() => hook.transitionTo('nope')).toThrow(RangeError)
        expect(hook.state.value).toBe('idle')
        app.unmount()
    })

    it('keeps state unchanged when a non-interruptible transition is rejected', async () => {
        const { m, hook, mount } = setup()
        const app = await mount()
        hook.transitionTo('active', { from: { opacity: 0 } })
        m.frame(100)
        hook.transitionTo('idle', undefined, false)
        expect(hook.state.value).toBe('active')
        app.unmount()
    })

    it('leaves no clock subscribers after 300 mount/transition/unmount cycles', async () => {
        const { m, hook, mount } = setup()
        for (let i = 0; i < 300; i++) {
            const app = await mount()
            hook.transitionTo('active', {
                from: { opacity: 0 },
                repeat: Infinity,
            })
            app.unmount()
        }
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    }, 60_000)
})
