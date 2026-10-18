// @vitest-environment jsdom

import { a } from '@freestylejs/ani-core'
import { StrictMode, useEffect, useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAniStates } from '../ani/use_ani_states'
import { createManualClock } from './clock'
import { act, mount } from './helpers'

const linear = a.timing.linear()
const makeStates = () => ({
    idle: a.ani({ to: { opacity: 0 }, duration: 1, timing: linear }),
    active: a.ani({ to: { opacity: 1 }, duration: 1, timing: linear }),
})

function setup() {
    const m = createManualClock()
    const hook: {
        transitionTo?: ReturnType<
            typeof useAniStates<HTMLDivElement, ReturnType<typeof makeStates>>
        >[1]
        state?: string
        identities: Set<unknown>
    } = { identities: new Set() }
    function C({ child }: { child?: boolean }) {
        const ref = useRef<HTMLDivElement>(null)
        const [{ state }, transitionTo] = useAniStates(ref, {
            initial: 'idle',
            initialFrom: { opacity: 0 },
            states: makeStates(),
            clock: m.clock,
        })
        hook.transitionTo = transitionTo
        hook.state = state as string
        hook.identities.add(transitionTo)
        return (
            <div ref={ref} data-state={state}>
                {child ? (
                    <Kick
                        go={() =>
                            transitionTo('active', { from: { opacity: 0 } })
                        }
                    />
                ) : null}
            </div>
        )
    }
    return { m, hook, C }
}

function Kick({ go }: { go: () => void }) {
    useEffect(() => {
        go()
    }, [])
    return null
}

describe('react useAniStates', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('transitions animate the element and mirror the state', async () => {
        const { m, hook, C } = setup()
        const view = await mount(<C />)
        const el = view.container.firstElementChild as HTMLElement
        expect(el.style.opacity).toBe('0')
        expect(hook.state).toBe('idle')

        await act(async () => {
            hook.transitionTo!('active', { from: { opacity: 0 } })
            m.frames(5, 100)
        })
        expect(hook.state).toBe('active')
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        await view.unmount()
    })

    it('stops the running timeline on unmount (no leaked clock subscriber or frame)', async () => {
        const { m, hook, C } = setup()
        const view = await mount(<C />)
        await act(async () => {
            hook.transitionTo!('active', {
                from: { opacity: 0 },
                repeat: Infinity,
            })
            m.frames(3, 100)
        })
        expect(m.clock.size).toBe(1)
        await view.unmount()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('does not miss a transition issued by a child before the hook subscribed', async () => {
        const { m, C } = setup()
        const view = await mount(<C child={true} />)
        const el = view.container.firstElementChild as HTMLElement
        await act(async () => m.frames(5, 100))
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        await view.unmount()
    })

    it('keeps transitionTo referentially stable', async () => {
        const { hook, C } = setup()
        const view = await mount(<C />)
        for (let i = 0; i < 3; i++) await view.rerender(<C />)
        expect(hook.identities.size).toBe(1)
        await view.unmount()
    })

    it('reads props on the first render only (documented rule)', async () => {
        const m = createManualClock()
        let transition!: (s: 'a' | 'b') => void
        function C({ initial }: { initial: 'a' | 'b' }) {
            const ref = useRef<HTMLDivElement>(null)
            const [{ state }, t] = useAniStates(ref, {
                initial,
                initialFrom: { opacity: 0 },
                states: { a: makeStates().idle, b: makeStates().active },
                clock: m.clock,
            })
            transition = t
            return <div ref={ref}>{state}</div>
        }
        const view = await mount(<C initial="a" />)
        await view.rerender(<C initial="b" />)
        expect(view.container.textContent).toBe('a')
        await act(async () => {
            transition('b')
        })
        expect(view.container.textContent).toBe('b')
        await view.unmount()
    })

    it('rejects unknown states atomically and keeps React state in sync', async () => {
        const { hook, C } = setup()
        const view = await mount(<C />)
        expect(() => hook.transitionTo!('nope' as never)).toThrow(RangeError)
        await act(async () => undefined)
        expect(hook.state).toBe('idle')
        await view.unmount()
    })

    it('keeps state unchanged when a non-interruptible transition is rejected', async () => {
        const { m, hook, C } = setup()
        const view = await mount(<C />)
        await act(async () => {
            hook.transitionTo!('active', { from: { opacity: 0 } })
            m.frame(100)
        })
        await act(async () => {
            hook.transitionTo!('idle', undefined, false)
        })
        expect(hook.state).toBe('active')
        await view.unmount()
    })

    it('works under StrictMode: transitions run and unmount disposes', async () => {
        const { m, hook, C } = setup()
        const view = await mount(
            <StrictMode>
                <C />
            </StrictMode>
        )
        const el = view.container.firstElementChild as HTMLElement
        await act(async () => {
            hook.transitionTo!('active', {
                from: { opacity: 0 },
                repeat: Infinity,
            })
            m.frames(5, 100)
        })
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        expect(m.clock.size).toBe(1)
        await view.unmount()
        expect(m.clock.size).toBe(0)
    })

    it('leaves no clock subscribers after 300 mount/transition/unmount cycles', async () => {
        const { m, hook, C } = setup()
        for (let i = 0; i < 300; i++) {
            const view = await mount(<C />)
            await act(async () => {
                hook.transitionTo!('active', {
                    from: { opacity: 0 },
                    repeat: Infinity,
                })
            })
            await view.unmount()
        }
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    }, 60_000)
})
