// @vitest-environment jsdom

import { a, rafTimeline } from '@freestylejs/ani-core'
import {
    type RefObject,
    StrictMode,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAniRef } from '../ani/use_ani_ref'
import { createManualClock, trackListeners, trackSubscriptions } from './clock'
import { act, mount } from './helpers'

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

const tracked = (el: EventTarget) =>
    el instanceof HTMLElement && el.hasAttribute('data-ani')

describe('react useAniRef', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('applies the initial style and follows clock frames', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        let controller!: ReturnType<typeof useAniRef<{ opacity: number }>>

        function C() {
            const ref = useRef<HTMLDivElement>(null)
            controller = useAniRef(ref, {
                timeline,
                initialValue: { opacity: 0.25 },
            })
            return <div ref={ref} />
        }

        const view = await mount(<C />)
        const el = view.container.firstElementChild as HTMLElement
        expect(el.style.opacity).toBe('0.25')
        expect(controller.duration).toBe(1)

        await act(async () => {
            controller.play({ from: { opacity: 0 } })
            m.frames(5, 100)
        })
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        expect(controller.getCurrentValue()).toEqual({
            opacity: expect.closeTo(0.5, 5),
        })
        await view.unmount()
    })

    it("styles the element before the owner's own layout effects run (no unstyled paint)", async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        let seenInOwnLayoutEffect: string | undefined
        function C() {
            const ref = useRef<HTMLDivElement>(null)
            useAniRef(ref, { timeline, initialValue: { opacity: 0.25 } })
            useLayoutEffect(() => {
                seenInOwnLayoutEffect = ref.current?.style.opacity
            }, [])
            return <div ref={ref} />
        }
        const view = await mount(<C />)
        expect(seenInOwnLayoutEffect).toBe('0.25')
        await view.unmount()
    })

    it('forwards canBeIntercepted and reset() restores the initial style', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        let controller!: ReturnType<typeof useAniRef<{ opacity: number }>>
        function C() {
            const ref = useRef<HTMLDivElement>(null)
            controller = useAniRef(ref, {
                timeline,
                initialValue: { opacity: 0.25 },
            })
            return <div ref={ref} />
        }
        const view = await mount(<C />)
        const el = view.container.firstElementChild as HTMLElement

        await act(async () => {
            controller.play({ from: { opacity: 0 } })
            m.frames(5, 100)
            // rejected: already playing
            controller.play({ from: { opacity: 1 } }, false)
        })
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)

        await act(async () => controller.reset())
        expect(el.style.opacity).toBe('0.25')
        await view.unmount()
    })

    it('supports CSS custom properties and hyphenated keys from a resolver', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() }),
            m.clock
        )
        let controller!: ReturnType<typeof useAniRef<{ x: number }>>
        function C() {
            const ref = useRef<HTMLDivElement>(null)
            controller = useAniRef(ref, { timeline })
            return <div ref={ref} />
        }
        const view = await mount(<C />)
        const el = view.container.firstElementChild as HTMLElement
        await act(async () => {
            controller.play({
                from: { x: 0 },
                propertyResolver: {
                    x: (v: number) => ({ key: '--x', value: `${v}px` }),
                } as never,
            })
            m.frames(5, 100)
        })
        expect(el.style.getPropertyValue('--x')).toBe('50px')
        await view.unmount()
    })

    it('releases subscriptions and listeners on unmount, never disposing the user timeline', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        const listeners = trackListeners(tracked)
        const onClick = vi.fn()

        function C() {
            const ref = useRef<HTMLDivElement>(null)
            useAniRef(ref, {
                timeline,
                initialValue: { opacity: 0 },
                events: { onClick },
            })
            return <div ref={ref} data-ani={true} />
        }

        const view = await mount(<C />)
        const el = view.container.firstElementChild as HTMLElement
        expect(subs.live).toBe(1)
        expect(listeners.live).toBe(1)
        await act(async () => el.click())
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
        // user-owned timeline keeps playing: only the binding detached
        expect(m.clock.size).toBe(1)
        listeners.restore()
    })

    it('passes the animation context to handlers', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        let seen: { current: unknown; duration: number } | undefined
        function C() {
            const ref = useRef<HTMLDivElement>(null)
            useAniRef(ref, {
                timeline,
                initialValue: { opacity: 0.4 },
                events: {
                    onClick: (ctx) => {
                        seen = { current: ctx.current, duration: ctx.duration }
                    },
                },
            })
            return <div ref={ref} />
        }
        const view = await mount(<C />)
        await act(async () =>
            (view.container.firstElementChild as HTMLElement).click()
        )
        expect(seen).toEqual({ current: { opacity: 0.4 }, duration: 1 })
        await view.unmount()
    })

    it('does not rebind listeners when events/initialValue are new objects each render, and calls the latest handler', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const listeners = trackListeners(tracked)
        const calls: number[] = []
        let bump!: () => void

        function C() {
            const ref = useRef<HTMLDivElement>(null)
            const [n, setN] = useState(0)
            bump = () => setN((x) => x + 1)
            useAniRef(ref, {
                timeline,
                initialValue: { opacity: 0 },
                events: { onClick: () => calls.push(n) },
            })
            return <div ref={ref} data-ani={true} />
        }

        const view = await mount(<C />)
        for (let i = 0; i < 10; i++) await act(async () => bump())
        expect(listeners.adds).toBe(1)
        expect(listeners.live).toBe(1)
        await act(async () =>
            (view.container.firstElementChild as HTMLElement).click()
        )
        expect(calls).toEqual([10])
        await view.unmount()
        listeners.restore()
    })

    it('binds initial style and events to a late-mounted element with stable props', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const initialValue = { opacity: 0.25 }
        const onClick = vi.fn()
        const events = { onClick }
        let show!: (v: boolean) => void

        function C() {
            const ref = useRef<HTMLDivElement>(null)
            const [visible, setVisible] = useState(false)
            show = setVisible
            useAniRef(ref, { timeline, initialValue, events })
            return visible ? <div ref={ref} id="late" /> : <span />
        }

        const view = await mount(<C />)
        await act(async () => show(true))
        const el = view.container.querySelector('#late') as HTMLElement
        expect(el.style.opacity).toBe('0.25')
        await act(async () => el.click())
        expect(onClick).toHaveBeenCalledTimes(1)

        // element removed again: detached, no writes to the old node
        await act(async () => show(false))
        timeline.play({ from: { opacity: 0 } })
        m.frames(2, 100)
        expect(el.style.opacity).toBe('0.25')
        await view.unmount()
    })

    it('follows timeline identity changes and detaches the old timeline', async () => {
        const m = createManualClock()
        const first = rafTimeline(node(), m.clock)
        const second = rafTimeline(node(), m.clock)
        const firstSubs = trackSubscriptions(first)
        const secondSubs = trackSubscriptions(second)
        second.play({ from: { opacity: 0.6 } })

        function C({ timeline }: { timeline: typeof first }) {
            const ref = useRef<HTMLDivElement>(null)
            useAniRef(ref, { timeline, initialValue: { opacity: 0 } })
            return <div ref={ref} />
        }

        const view = await mount(<C timeline={first} />)
        const el = view.container.firstElementChild as HTMLElement
        expect(firstSubs.live).toBe(1)
        await view.rerender(<C timeline={second} />)
        expect(firstSubs.live).toBe(0)
        expect(secondSubs.live).toBe(1)
        // new timeline's current value is applied immediately
        expect(el.style.opacity).toBe('0.6')
        await view.unmount()
        expect(secondSubs.live).toBe(0)
    })

    it('keeps one binding under StrictMode double mount and releases it', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        const listeners = trackListeners(tracked)
        const events = { onClick: vi.fn() }
        function C() {
            const ref = useRef<HTMLDivElement>(null)
            useAniRef(ref, { timeline, initialValue: { opacity: 0 }, events })
            return <div ref={ref} data-ani={true} />
        }
        const view = await mount(
            <StrictMode>
                <C />
            </StrictMode>
        )
        expect(subs.live).toBe(1)
        expect(listeners.live).toBe(1)
        await act(async () =>
            (view.container.firstElementChild as HTMLElement).click()
        )
        expect(events.onClick).toHaveBeenCalledTimes(1)
        await view.unmount()
        expect(subs.live).toBe(0)
        expect(listeners.live).toBe(0)
        listeners.restore()
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
        function C() {
            const ref = useRef<HTMLDivElement>(null)
            useAniRef(ref, { timeline, initialValue: { opacity: 0 }, events })
            return <div ref={ref} data-ani={true} />
        }
        for (let i = 0; i < 1000; i++) {
            const view = await mount(<C />)
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

    it('keeps a stable controller across re-renders', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const seen = new Set<unknown>()
        let bump!: () => void
        function C() {
            const ref = useRef<HTMLDivElement>(null)
            const [, setN] = useState(0)
            bump = () => setN((x) => x + 1)
            seen.add(
                useAniRef(ref as RefObject<HTMLDivElement>, {
                    timeline,
                    initialValue: { opacity: 0 },
                })
            )
            return <div ref={ref} />
        }
        const view = await mount(<C />)
        for (let i = 0; i < 5; i++) await act(async () => bump())
        expect(seen.size).toBe(1)
        await view.unmount()
    })
})
