// @vitest-environment jsdom

import { a, type RafAniTimeline, rafTimeline } from '@freestylejs/ani-core'
import { createRoot, createSignal } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { createAni } from '../ani/create_ani'
import { createManualClock, trackSubscriptions } from './clock'

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

describe('solid createAni', () => {
    it('tracks frames, follows accessor swaps with a never-stale controller, and unsubscribes on dispose', () => {
        const m = createManualClock()
        const first = rafTimeline(node(), m.clock)
        const second = rafTimeline(node(), m.clock)
        const firstSubs = trackSubscriptions(first)
        const secondSubs = trackSubscriptions(second)
        const [current, setCurrent] =
            createSignal<RafAniTimeline<{ opacity: number }>>(first)

        let value!: () => { opacity: number }
        let controller!: RafAniTimeline<{ opacity: number }>
        const dispose = createRoot((d) => {
            const [v, c] = createAni(current, { opacity: 0.1 })
            value = v
            controller = c
            return d
        })
        expect(value().opacity).toBe(0.1)
        first.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(value().opacity).toBeCloseTo(0.5, 5)

        setCurrent(() => second)
        expect(firstSubs.live).toBe(0)
        expect(secondSubs.live).toBe(1)
        controller.play({ from: { opacity: 0.2 } })
        expect(second.getCurrentValue()).toEqual({ opacity: 0.2 })
        expect(value().opacity).toBe(0.2)
        dispose()
        expect(secondSubs.live).toBe(0)
    })

    it('does not grow subscriptions over 1000 cycles', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        for (let i = 0; i < 1000; i++) {
            createRoot((d) => {
                createAni(() => timeline, { opacity: 0 })
                d()
            })
        }
        expect(subs.live).toBe(0)
    })
})
