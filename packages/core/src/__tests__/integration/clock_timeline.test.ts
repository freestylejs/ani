import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { a, rafTimeline } from '../../index'
import { createManualClock } from './manual_clock'

const linear = a.timing.linear()
const node = (duration = 1) =>
    a.ani({ to: { x: 100 }, duration, timing: linear })

// Timelines report callback errors via queueMicrotask(() => { throw e }).
// Capture them instead of letting the runner see an uncaught exception.
let reported: unknown[]
const originalQueueMicrotask = globalThis.queueMicrotask
beforeEach(() => {
    reported = []
    globalThis.queueMicrotask = (task: () => void) => {
        try {
            task()
        } catch (error) {
            reported.push(error)
        }
    }
})
afterEach(() => {
    globalThis.queueMicrotask = originalQueueMicrotask
})

describe('real clock + real timelines', () => {
    it('chains a new run from inside the ENDED notification (same timeline)', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(0.25), m.clock)
        const endedRuns: number[] = []
        let runs = 0
        timeline.onUpdate(({ status }) => {
            if (status === 'ENDED') {
                endedRuns.push(++runs)
                if (runs < 3) timeline.play({ from: { x: 0 } })
            }
        })
        timeline.play({ from: { x: 0 } })
        m.frames(40, 100)
        expect(endedRuns).toEqual([1, 2, 3])
        expect(timeline.status).toBe('ENDED')
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('chains a different timeline from ENDED and the clock drains afterwards', () => {
        const m = createManualClock()
        const first = rafTimeline(node(0.25), m.clock)
        const second = rafTimeline(node(0.25), m.clock)
        first.onUpdate(({ status }) => {
            if (status === 'ENDED') second.play({ from: { x: 0 } })
        })
        first.play({ from: { x: 0 } })
        m.frames(20, 100)
        expect(first.status).toBe('ENDED')
        expect(second.status).toBe('ENDED')
        expect(second.getCurrentValue()).toEqual({ x: 100 })
        expect(m.clock.size).toBe(0)
    })

    it('emits ENDED exactly once per run', () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(0.25), m.clock)
        let ended = 0
        timeline.onUpdate(({ status }) => {
            if (status === 'ENDED') ended++
        })
        timeline.play({ from: { x: 0 } })
        m.frames(30, 100)
        expect(ended).toBe(1)
    })

    it('a throwing onUpdate callback does not stop siblings, other timelines or the clock', () => {
        const m = createManualClock()
        const bad = rafTimeline(node(10), m.clock)
        const good = rafTimeline(node(10), m.clock)
        const sibling = vi.fn()
        let armed = false
        bad.onUpdate(() => {
            if (armed) throw new Error('boom')
        })
        bad.onUpdate(sibling)
        let goodFrames = 0
        good.onUpdate(() => goodFrames++)

        bad.play({ from: { x: 0 } })
        good.play({ from: { x: 0 } })
        armed = true
        const siblingBefore = sibling.mock.calls.length
        const goodBefore = goodFrames
        m.frames(5, 100)

        expect(reported.length).toBeGreaterThan(0)
        expect(goodFrames - goodBefore).toBe(5)
        expect(sibling.mock.calls.length - siblingBefore).toBe(5)
        expect(m.pending).toBe(1)
        // the clock still accepts and drives new timelines
        const fresh = rafTimeline(node(10), m.clock)
        fresh.play({ from: { x: 0 } })
        m.frames(2, 100)
        expect(fresh.getCurrentValue()!.x).toBeGreaterThan(0)
    })

    it('a throwing subscriber is isolated and reported through onError', () => {
        const errors: unknown[] = []
        const m = createManualClock({ onError: (e) => errors.push(e) })
        const seen: number[] = []
        m.clock.subscribe({
            update: () => {
                throw new Error('bad subscriber')
            },
        })
        m.clock.subscribe({ update: (dt) => seen.push(dt) })
        m.frames(3, 16)
        expect(errors).toHaveLength(3)
        expect(seen).toHaveLength(3)
        expect(m.pending).toBe(1)
    })

    it('recovers when the environment silently drops a queued frame', () => {
        const m = createManualClock()
        const survivor = rafTimeline(node(10), m.clock)
        survivor.play({ from: { x: 0 } })
        m.frames(2, 100)
        const before = survivor.getCurrentValue()!.x

        m.drop() // e.g. frame lost across a visibility change
        m.advance(5000)
        const late = rafTimeline(node(10), m.clock)
        late.play({ from: { x: 0 } })
        expect(m.pending).toBe(1)
        m.frames(2, 100)
        expect(survivor.getCurrentValue()!.x).toBeGreaterThan(before)
        expect(late.getCurrentValue()!.x).toBeGreaterThan(0)
    })

    it('stays on the wall clock under jank and pauses across a suspension', () => {
        const m = createManualClock()
        const t = rafTimeline(node(10), m.clock)
        t.play({ from: { x: 0 } })
        // jank: 16 ms, then a 400 ms frame -> both applied in full
        m.frame(16)
        m.frame(400)
        expect(t.getCurrentValue()!.x).toBeCloseTo(4.16, 5)
        // suspension (hidden tab): a 5 s gap advances by one ordinary frame
        m.frame(5000)
        expect(t.getCurrentValue()!.x).toBeCloseTo(4.32, 5)
        m.frame(16)
        expect(t.getCurrentValue()!.x).toBeCloseTo(4.48, 5)
    })

    it('a 1 s animation under 250 ms frames takes 1 s of wall time', () => {
        const m = createManualClock()
        const t = rafTimeline(node(1), m.clock)
        t.play({ from: { x: 0 } })
        m.frames(4, 250)
        expect(t.status).toBe('ENDED')
        expect(t.getCurrentValue()).toEqual({ x: 100 })
    })

    it('follows pure wall time with lagThreshold: Infinity', () => {
        const realtime = createManualClock({ lagThreshold: Infinity })
        const exact = rafTimeline(node(10), realtime.clock)
        exact.play({ from: { x: 0 } })
        realtime.frame(5000)
        expect(exact.getCurrentValue()!.x).toBeCloseTo(50, 5)
    })

    it('drives 1000 concurrent timelines to completion and drains to 0 subscribers', () => {
        const m = createManualClock()
        const timelines = Array.from({ length: 1000 }, (_, i) => {
            const t = rafTimeline(node(0.2 + (i % 10) * 0.1), m.clock)
            t.play({ from: { x: 0 } })
            return t
        })
        expect(m.clock.size).toBe(1000)
        expect(m.pending).toBe(1)
        m.frames(30, 100)
        for (const t of timelines) {
            expect(t.status).toBe('ENDED')
            expect(t.getCurrentValue()).toEqual({ x: 100 })
        }
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('does not accumulate subscribers over 5000 play/dispose cycles', () => {
        const m = createManualClock()
        for (let i = 0; i < 5000; i++) {
            const t = rafTimeline(node(10), m.clock)
            t.play({ from: { x: 0 } })
            if (i % 3 === 0) m.frame(16)
            t.dispose()
        }
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('disposed timelines never update or resubscribe', () => {
        const m = createManualClock()
        const t = rafTimeline(node(10), m.clock)
        const spy = vi.fn()
        t.onUpdate(spy)
        t.play({ from: { x: 0 } })
        t.dispose()
        spy.mockClear()
        t.play({ from: { x: 0 } })
        t.resume()
        m.frames(3, 100)
        expect(spy).not.toHaveBeenCalled()
        expect(m.clock.size).toBe(0)
    })
})

describe('createStates + real clock', () => {
    it('dispose stops a looping state and later transitions are no-ops', () => {
        const m = createManualClock()
        const states = a.createStates({
            initial: 'idle',
            initialFrom: { x: 0 },
            states: { idle: node(), active: node() },
            clock: m.clock,
        })
        states.transitionTo('active', { from: { x: 0 }, repeat: Infinity })
        m.frames(3, 100)
        expect(m.clock.size).toBe(1)
        states.dispose()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
        states.transitionTo('idle')
        expect(m.clock.size).toBe(0)
    })

    it('1000 interrupting transitions keep exactly one live subscriber', () => {
        const m = createManualClock()
        const states = a.createStates({
            initial: 'idle',
            initialFrom: { x: 0 },
            states: { idle: node(), active: node() },
            clock: m.clock,
        })
        for (let i = 0; i < 1000; i++) {
            states.transitionTo(i % 2 ? 'active' : 'idle')
            if (i % 7 === 0) m.frame(16)
            expect(m.clock.size).toBe(1)
        }
        states.dispose()
        expect(m.clock.size).toBe(0)
    })
})
