// @vitest-environment jsdom

import { a, type RafAniTimeline, rafTimeline } from '@freestylejs/ani-core'
import { get, writable } from 'svelte/store'
import { describe, expect, it } from 'vitest'
import { useAni } from '../ani/use_ani'
import { createManualClock, trackSubscriptions } from './clock'

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

describe('svelte useAni', () => {
    it('emits frame values, follows store swaps and retains nothing without subscribers', () => {
        const m = createManualClock()
        const first = rafTimeline(node(), m.clock)
        const second = rafTimeline(node(), m.clock)
        const firstSubs = trackSubscriptions(first)
        const secondSubs = trackSubscriptions(second)
        second.play({ from: { opacity: 0.8 } })
        const source = writable<RafAniTimeline<{ opacity: number }>>(first)
        const [store, controller] = useAni(source, { opacity: 0.1 })

        expect(firstSubs.live).toBe(0)
        const seen: number[] = []
        const unsubscribe = store.subscribe((v) => seen.push(v.opacity))
        expect(firstSubs.live).toBe(1)
        expect(seen[0]).toBe(0.1)

        first.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(seen.at(-1)).toBeCloseTo(0.5, 5)

        source.set(second)
        expect(firstSubs.live).toBe(0)
        expect(secondSubs.live).toBe(1)
        expect(seen.at(-1)).toBe(second.getCurrentValue()?.opacity)
        // controller follows the swap
        controller.play({ from: { opacity: 0.2 } })
        expect(second.getCurrentValue()).toEqual({ opacity: 0.2 })

        unsubscribe()
        expect(secondSubs.live).toBe(0)
        expect(get(store).opacity).toBeDefined()
        expect(secondSubs.live).toBe(0)
    })

    it('does not grow subscriptions over 1000 subscribe cycles', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), m.clock)
        const subs = trackSubscriptions(timeline)
        const [store] = useAni(timeline, { opacity: 0 })
        for (let i = 0; i < 1000; i++) store.subscribe(() => undefined)()
        expect(subs.live).toBe(0)
    })
})
