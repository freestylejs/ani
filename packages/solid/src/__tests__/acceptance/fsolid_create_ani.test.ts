// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import {
    createClock,
    type RafTimeline,
    rafTimeline,
} from '@freestylejs/ani-core'
import { type Accessor, createRoot, createSignal } from 'solid-js'
import { describe, expect, it } from 'vitest'
import * as solid from '../../index'

type Values = { opacity: number }
type Timeline = RafTimeline<Values>

const { createAni } = solid as unknown as {
    createAni(
        timeline: Timeline | Accessor<Timeline>,
        initialValue: Values
    ): readonly [Accessor<Values>, Timeline]
}

/** A real clock fed by an injected frame source: only `frames()` advances time. */
function makeClock() {
    let time = 1000
    let nextId = 1
    const queue = new Map<number, (timestamp: number) => void>()
    const clock = createClock({
        lagThreshold: Infinity,
        requestFrame: (callback) => {
            const id = nextId++
            queue.set(id, callback)
            return id
        },
        cancelFrame: (id) => {
            queue.delete(id)
        },
        now: () => time,
        onError: () => undefined,
    })
    return {
        clock,
        frames(count: number, ms = 100) {
            for (let i = 0; i < count; i++) {
                time += ms
                const callbacks = [...queue.values()]
                queue.clear()
                for (const callback of callbacks) callback(time)
            }
        },
    }
}

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

/** Counts the live `onUpdate` subscriptions of a timeline. */
function countSubscriptions(timeline: Timeline) {
    let live = 0
    const original = timeline.onUpdate.bind(timeline)
    timeline.onUpdate = (callback) => {
        live++
        const unsubscribe = original(callback)
        let active = true
        return () => {
            if (active) {
                active = false
                live--
            }
            unsubscribe()
        }
    }
    return {
        get live() {
            return live
        },
    }
}

describe('FSOLID: createAni (unchanged)', () => {
    it('A1: starts at initialValue, follows frames and unsubscribes with its owner', () => {
        const m = makeClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const subs = countSubscriptions(timeline)
        let value!: Accessor<Values>
        const dispose = createRoot((d) => {
            value = createAni(() => timeline, { opacity: 0.1 })[0]
            return d
        })
        expect(value().opacity).toBe(0.1)
        expect(subs.live).toBe(1)

        void timeline.play({ from: { opacity: 0 } })
        m.frames(5)
        expect(value().opacity).toBeCloseTo(0.5, 5)

        dispose()
        expect(subs.live).toBe(0)
        m.frames(2)
        expect(value().opacity).toBeCloseTo(0.5, 5)
    })

    it('A2: follows accessor swaps, and the returned timeline drives the current one', () => {
        const m = makeClock()
        const first = rafTimeline(node(), { clock: m.clock })
        const second = rafTimeline(node(), { clock: m.clock })
        const firstSubs = countSubscriptions(first)
        const secondSubs = countSubscriptions(second)
        const [current, setCurrent] = createSignal<Timeline>(first)
        let value!: Accessor<Values>
        let controller!: Timeline
        const dispose = createRoot((d) => {
            ;[value, controller] = createAni(current, { opacity: 0.1 })
            return d
        })
        expect(firstSubs.live).toBe(1)

        setCurrent(() => second)
        expect(firstSubs.live).toBe(0)
        expect(secondSubs.live).toBe(1)

        void controller.play({ from: { opacity: 0.2 } })
        expect(value().opacity).toBe(0.2)
        m.frames(5)
        expect(value().opacity).toBeCloseTo(0.6, 5)
        expect(first.value).toBeNull()
        dispose()
        expect(secondSubs.live).toBe(0)
    })

    it('A3: accepts the timeline itself as well as an accessor', () => {
        const m = makeClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const subs = countSubscriptions(timeline)
        let value!: Accessor<Values>
        const dispose = createRoot((d) => {
            value = createAni(timeline, { opacity: 0.1 })[0]
            return d
        })
        expect(value().opacity).toBe(0.1)
        expect(subs.live).toBe(1)
        void timeline.play({ from: { opacity: 0 } })
        m.frames(5)
        expect(value().opacity).toBeCloseTo(0.5, 5)
        dispose()
        expect(subs.live).toBe(0)
    })

    it('A4: never disposes the timeline it is given', async () => {
        const m = makeClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const dispose = createRoot((d) => {
            createAni(() => timeline, { opacity: 0 })
            return d
        })
        dispose()
        const run = timeline.play({ from: { opacity: 0 } })
        m.frames(11)
        expect(await run).toBe('ended')
        expect(timeline.value).toEqual({ opacity: 1 })
    })
})
