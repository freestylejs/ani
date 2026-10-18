// @vitest-environment jsdom

import { a, type RafAniTimeline, rafTimeline } from '@freestylejs/ani-core'
import { createRoot, createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAniRef } from '../ani/create_ani_ref'
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

describe('solid createAniRef', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('applies the initial style, follows frames and reset() restores it', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const el = makeEl()
        let controller!: RafAniTimeline<{ opacity: number }>
        const dispose = createRoot((d) => {
            const [ref, c] = createAniRef({
                timeline: () => timeline,
                initialValue: { opacity: 0.25 },
            })
            ref(el)
            controller = c
            return d
        })
        // effects flush when the root settles
        expect(el.style.opacity).toBe('0.25')
        controller.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        controller.reset()
        expect(el.style.opacity).toBe('0.25')
        dispose()
    })

    it('supports CSS custom properties from a resolver', () => {
        const m = createManualClock()
        const timeline = rafTimeline(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() }),
            m.clock
        )
        const el = makeEl()
        let controller!: RafAniTimeline<{ x: number }>
        const dispose = createRoot((d) => {
            const [ref, c] = createAniRef({ timeline: () => timeline })
            ref(el)
            controller = c
            return d
        })
        controller.play({
            from: { x: 0 },
            propertyResolver: {
                x: (v: number) => ({ key: '--x', value: `${v}px` }),
            } as never,
        })
        m.frames(5, 100)
        expect(el.style.getPropertyValue('--x')).toBe('50px')
        dispose()
    })

    it('releases subscriptions and listeners on dispose, never disposing the user timeline', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        const listeners = trackListeners(tracked)
        const onClick = vi.fn()
        const el = makeEl()

        const dispose = createRoot((d) => {
            const [ref] = createAniRef({
                timeline: () => timeline,
                initialValue: { opacity: 0 },
                events: { onClick },
            })
            ref(el)
            return d
        })
        expect(subs.live).toBe(1)
        expect(listeners.live).toBe(1)
        el.click()
        expect(onClick).toHaveBeenCalledTimes(1)

        timeline.play({ from: { opacity: 0 } })
        dispose()
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

    it('binds an element that arrives after setup (late ref)', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const onClick = vi.fn()
        const el = makeEl()
        let ref!: (el: HTMLElement) => void
        const dispose = createRoot((d) => {
            ;[ref] = createAniRef({
                timeline: () => timeline,
                initialValue: { opacity: 0.25 },
                events: { onClick },
            })
            return d
        })
        // not attached yet: nothing bound
        expect(el.style.opacity).toBe('')
        el.click()
        expect(onClick).not.toHaveBeenCalled()

        ref(el)
        expect(el.style.opacity).toBe('0.25')
        el.click()
        expect(onClick).toHaveBeenCalledTimes(1)
        dispose()
    })

    it('controller follows timeline accessor swaps (never stale) and old timeline detaches', () => {
        const m = createManualClock()
        const first = rafTimeline(node(), m.clock)
        const second = rafTimeline(node(), m.clock)
        const firstSubs = trackSubscriptions(first)
        const secondSubs = trackSubscriptions(second)
        const el = makeEl()
        const [current, setCurrent] =
            createSignal<RafAniTimeline<{ opacity: number }>>(first)

        let controller!: RafAniTimeline<{ opacity: number }>
        const dispose = createRoot((d) => {
            const [ref, c] = createAniRef({
                timeline: current,
                initialValue: { opacity: 0 },
            })
            ref(el)
            controller = c
            return d
        })
        expect(firstSubs.live).toBe(1)
        setCurrent(() => second)
        expect(firstSubs.live).toBe(0)
        expect(secondSubs.live).toBe(1)

        // the controller obtained BEFORE the swap drives the NEW timeline
        controller.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(second.getCurrentValue()).not.toBeNull()
        expect(first.getCurrentValue()).toBeNull()
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        dispose()
        expect(secondSubs.live).toBe(0)
    })

    it('does not grow subscriptions or listeners over 1000 create/dispose cycles', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        const listeners = trackListeners(tracked)
        const events = {
            onClick: () => undefined,
            onMouseenter: () => undefined,
        }
        for (let i = 0; i < 1000; i++) {
            const el = makeEl()
            const dispose = createRoot((d) => {
                const [ref] = createAniRef({
                    timeline: () => timeline,
                    initialValue: { opacity: 0 },
                    events,
                })
                ref(el)
                return d
            })
            if (i === 0) {
                expect(subs.live).toBe(1)
                expect(listeners.live).toBe(2)
            }
            dispose()
            el.remove()
        }
        expect(subs.live).toBe(0)
        expect(listeners.live).toBe(0)
        listeners.restore()
    })
})
