// @vitest-environment jsdom

import { a, rafGroup, rafTimeline } from '@freestylejs/ani-core'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
    useAniGroup,
    useAniRef,
    useAniStates,
    useFollow,
    useTimeline,
} from '../ani'
import { createManualClock } from './clock'
import { act, mount } from './helpers'

const node = (to = 1) =>
    a.ani({ to: { opacity: to }, duration: 1, timing: a.timing.linear() })

const widthResolver = {
    opacity: (value: number) => ({ key: 'width', value: `${value * 100}px` }),
}

describe('react bindings', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('useTimeline: unmount releases the clock; 1000 mount cycles stay balanced', async () => {
        const m = createManualClock()
        function C() {
            const timeline = useTimeline(() => rafTimeline(node(), m.clock))
            timeline.play({ from: { opacity: 0 } })
            return null
        }
        const strict = await mount(
            <StrictMode>
                <C />
            </StrictMode>
        )
        expect(m.clock.size).toBe(1)
        await strict.unmount()
        expect(m.clock.size).toBe(0)
        for (let i = 0; i < 1000; i++) {
            await (await mount(<C />)).unmount()
        }
        expect(m.clock.size).toBe(0)
    }, 60_000)

    it('useAniRef: the resolver of the latest render is used when an element attaches', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        function C({ show, resolver }: { show: boolean; resolver?: object }) {
            const { ref } = useAniRef(timeline, resolver ? { resolver } : {})
            return show ? <div ref={ref} /> : null
        }
        timeline.play({ from: { opacity: 0 } })
        m.frame(500)
        const view = await mount(<C show={false} />)
        await view.rerender(<C show={true} resolver={widthResolver} />)
        const el = view.container.firstElementChild as HTMLElement
        expect(el.style.width).toBe('50px')
        await view.unmount()
    })

    it('useAniGroup: a bound index writes its own element and unmount unbinds', async () => {
        const m = createManualClock()
        const group = rafGroup(node(), { clock: m.clock, stagger: 0.5 })
        function C() {
            const { ref } = useAniGroup(group)
            return (
                <div>
                    <i ref={ref(0)} />
                    <i ref={ref(1)} />
                </div>
            )
        }
        const view = await mount(<C />)
        await act(async () => {
            group.play({ from: { opacity: 0 }, count: 2 })
            m.frame(500)
        })
        const [first, second] = Array.from(
            view.container.querySelectorAll('i')
        ) as HTMLElement[]
        expect(Number(first?.style.opacity)).toBeCloseTo(0.5, 5)
        expect(Number(second?.style.opacity)).toBeCloseTo(0, 5)
        await view.unmount()
        m.frame(500)
        expect(Number(first?.style.opacity)).toBeCloseTo(0.5, 5)
    })

    it('useAniStates: owns the machine and releases the clock on unmount', async () => {
        const m = createManualClock()
        let transition!: () => Promise<unknown>
        function C() {
            const states = useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0 },
                states: { idle: node(0), active: node(1) },
                clock: m.clock,
            })
            transition = () => states.transitionTo('active')
            return <div ref={states.ref}>{states.state}</div>
        }
        const view = await mount(<C />)
        await act(async () => {
            void transition()
        })
        expect(view.container.textContent).toBe('active')
        expect(m.clock.size).toBe(1)
        await view.unmount()
        expect(m.clock.size).toBe(0)
        expect(await transition()).toBe('disposed')
    })

    it('useAniStates: a transition after a StrictMode re-creation reaches the live machine', async () => {
        const m = createManualClock()
        let transition!: () => Promise<unknown>
        function C() {
            const states = useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0 },
                states: { idle: node(0), active: node(1) },
                clock: m.clock,
            })
            transition = () => states.transitionTo('active')
            return <div ref={states.ref}>{states.state}</div>
        }
        const view = await mount(
            <StrictMode>
                <C />
            </StrictMode>
        )
        await act(async () => {
            void transition()
        })
        expect(view.container.textContent).toBe('active')
        await view.unmount()
    })

    it('useAniStates: accepts the initialFrom alias and a resolver on the initial style', async () => {
        const m = createManualClock()
        function C() {
            const { ref, style } = useAniStates({
                initial: 'idle',
                initialFrom: { opacity: 0.5 },
                states: { idle: node(0) },
                clock: m.clock,
                resolver: widthResolver,
            })
            return <div ref={ref} style={style} />
        }
        const view = await mount(<C />)
        const el = view.container.firstElementChild as HTMLElement
        expect(el.style.width).toBe('50px')
        await view.unmount()
    })

    it('useFollow: the element chases the target and unmount releases the clock', async () => {
        const m = createManualClock()
        let target!: (value: number) => void
        function C() {
            const { ref, follower } = useFollow(
                { opacity: 0 },
                { clock: m.clock }
            )
            target = (value) => void follower.set({ opacity: value })
            return <div ref={ref} />
        }
        const view = await mount(<C />)
        const el = view.container.firstElementChild as HTMLElement
        await act(async () => {
            target(1)
            m.frames(3, 16)
        })
        expect(Number(el.style.opacity)).toBeGreaterThan(0)
        expect(m.clock.size).toBe(1)
        await view.unmount()
        expect(m.clock.size).toBe(0)
    })
})
