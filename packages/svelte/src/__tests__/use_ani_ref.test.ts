// @vitest-environment jsdom

import { a, type RafAniTimeline, rafTimeline } from '@freestylejs/ani-core'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAniRef } from '../ani/use_ani_ref'
import { createManualClock, trackListeners, trackSubscriptions } from './clock'

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })
const tracked = (el: EventTarget) =>
    el instanceof HTMLElement && el.hasAttribute('data-ani')
const makeEl = () => {
    const el = document.createElement('div')
    el.setAttribute('data-ani', '')
    document.body.appendChild(el)
    return el
}
type Binding = { destroy(): void }
const run = (action: unknown, el: HTMLElement) =>
    (action as (n: HTMLElement) => Binding)(el)

describe('svelte useAniRef', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('applies the initial style, follows frames and reset() restores it', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const [action, controller] = useAniRef({
            timeline,
            initialValue: { opacity: 0.25 },
        })
        const el = makeEl()
        const binding = run(action, el)
        expect(el.style.opacity).toBe('0.25')
        controller.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        controller.reset()
        expect(el.style.opacity).toBe('0.25')
        binding.destroy()
    })

    it('supports CSS custom properties from a resolver', () => {
        const m = createManualClock()
        const timeline = rafTimeline(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() }),
            m.clock
        )
        const [action, controller] = useAniRef({ timeline })
        const el = makeEl()
        const binding = run(action, el)
        controller.play({
            from: { x: 0 },
            propertyResolver: {
                x: (v: number) => ({ key: '--x', value: `${v}px` }),
            } as never,
        })
        m.frames(5, 100)
        expect(el.style.getPropertyValue('--x')).toBe('50px')
        binding.destroy()
    })

    it('releases subscriptions and listeners on destroy, never disposing the user timeline', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        const listeners = trackListeners(tracked)
        const onClick = vi.fn()
        const [action] = useAniRef({
            timeline,
            initialValue: { opacity: 0 },
            events: { onClick },
        })
        const el = makeEl()
        const binding = run(action, el)
        expect(subs.live).toBe(1)
        expect(listeners.live).toBe(1)
        el.click()
        expect(onClick).toHaveBeenCalledTimes(1)

        timeline.play({ from: { opacity: 0 } })
        binding.destroy()
        expect(subs.live).toBe(0)
        expect(listeners.live).toBe(0)
        const before = el.style.opacity
        m.frames(3, 100)
        expect(el.style.opacity).toBe(before)
        el.click()
        expect(onClick).toHaveBeenCalledTimes(1)
        expect(m.clock.size).toBe(1)
        listeners.restore()
    })

    it('follows timeline store swaps and detaches the old timeline', () => {
        const m = createManualClock()
        const first = rafTimeline(node(), m.clock)
        const second = rafTimeline(node(), m.clock)
        const firstSubs = trackSubscriptions(first)
        const secondSubs = trackSubscriptions(second)
        second.play({ from: { opacity: 0.6 } })
        const store = writable<RafAniTimeline<{ opacity: number }>>(first)
        const [action] = useAniRef({
            timeline: store,
            initialValue: { opacity: 0 },
        })
        const el = makeEl()
        const binding = run(action, el)
        expect(firstSubs.live).toBe(1)
        store.set(second)
        expect(firstSubs.live).toBe(0)
        expect(secondSubs.live).toBe(1)
        expect(el.style.opacity).toBe('0.6')
        binding.destroy()
        expect(secondSubs.live).toBe(0)
    })

    it('one action on several nodes: independent bindings, reset restyles all, destroy of one leaves the others live', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        const [action, controller] = useAniRef({
            timeline,
            initialValue: { opacity: 0.3 },
        })
        const n1 = makeEl()
        const n2 = makeEl()
        const b1 = run(action, n1)
        const b2 = run(action, n2)
        expect(subs.live).toBe(2)

        controller.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(Number(n2.style.opacity)).toBeCloseTo(0.5, 5)

        b1.destroy()
        expect(subs.live).toBe(1)
        controller.reset()
        expect(n2.style.opacity).toBe('0.3')
        b2.destroy()
        expect(subs.live).toBe(0)
    })

    it('does not grow subscriptions or listeners over 1000 apply/destroy cycles', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        const listeners = trackListeners(tracked)
        const events = {
            onClick: () => undefined,
            onMouseenter: () => undefined,
        }
        for (let i = 0; i < 1000; i++) {
            const [action] = useAniRef({
                timeline,
                initialValue: { opacity: 0 },
                events,
            })
            const el = makeEl()
            const binding = run(action, el)
            if (i === 0) {
                expect(subs.live).toBe(1)
                expect(listeners.live).toBe(2)
            }
            binding.destroy()
            el.remove()
        }
        expect(subs.live).toBe(0)
        expect(listeners.live).toBe(0)
        listeners.restore()
    })
})
