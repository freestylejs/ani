import { afterEach, describe, expect, it, vi } from 'vitest'
import * as root from '../../index'
import { AnimationClock, a, defaultClock, rafTimeline } from '../../index'
import { createManualClock, resetDefaultClock } from '../../testing'

// 100 units per second (x: 0 -> 100 over 1 s)
const fast = () =>
    a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() })
// 10 units per second (x: 0 -> 100 over 10 s)
const slow = () =>
    a.ani({ to: { x: 100 }, duration: 10, timing: a.timing.linear() })

const x = (t: { getCurrentValue(): { x: number } | null }) =>
    t.getCurrentValue()!.x

describe('TST: createManualClock', () => {
    it('A1: frames drive a timeline, now and pending are tracked', () => {
        const m = createManualClock()
        expect(m.now).toBe(1000)
        expect(m.pending).toBe(0)

        const t = rafTimeline(fast(), m.clock)
        t.play({ from: { x: 0 } })
        expect(m.pending).toBe(1)

        m.frames(5, 100)
        expect(x(t)).toBeCloseTo(50, 5)
        expect(m.now).toBe(1500)
        expect(m.pending).toBe(1)
        expect(t.status).toBe('PLAYING')

        m.frames(5, 100)
        expect(t.status).toBe('ENDED')
        expect(x(t)).toBe(100)
        expect(m.pending).toBe(0)
    })

    it('A1: frame() defaults to 16 ms and frames() repeats it', () => {
        const m = createManualClock()
        const t = rafTimeline(slow(), m.clock)
        t.play({ from: { x: 0 } })
        m.frame()
        expect(m.now).toBe(1016)
        expect(x(t)).toBeCloseTo(0.16, 5)
        m.frames(2)
        expect(m.now).toBe(1048)
        expect(x(t)).toBeCloseTo(0.48, 5)
    })

    it('A1: the clock is a real managed clock', () => {
        const m = createManualClock()
        const seen: number[] = []
        m.clock.subscribe({ update: (dt) => seen.push(dt) })
        expect(m.clock.size).toBe(1)
        m.frame(16)
        expect(seen).toHaveLength(1)
        expect(seen[0]).toBeCloseTo(0.016, 5)
        m.clock.dispose()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('A2: advance moves time without a frame; a long gap is smoothed', () => {
        const m = createManualClock()
        const t = rafTimeline(slow(), m.clock)
        t.play({ from: { x: 0 } })
        m.frame(16)
        expect(x(t)).toBeCloseTo(0.16, 5)

        m.advance(5000)
        expect(m.now).toBe(6016)
        expect(x(t)).toBeCloseTo(0.16, 5)

        m.frame(16)
        // 5016 ms of wall time, one ordinary frame of animation time
        expect(x(t)).toBeCloseTo(0.32, 5)
    })

    it('A2: lagThreshold is forwarded to the real clock', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const t = rafTimeline(slow(), m.clock)
        t.play({ from: { x: 0 } })
        m.frame(16)
        m.advance(5000)
        m.frame(16)
        expect(x(t)).toBeCloseTo(0.16 + 50.16, 5)
    })

    it('A2: maxDeltaTime is forwarded to the real clock', () => {
        const m = createManualClock({ maxDeltaTime: 0.01 })
        const t = rafTimeline(slow(), m.clock)
        t.play({ from: { x: 0 } })
        m.frames(3, 16)
        expect(x(t)).toBeCloseTo(0.3, 5)
    })

    it('A3: drop loses the pending frame and a new play re-arms', () => {
        const m = createManualClock()
        const first = rafTimeline(slow(), m.clock)
        first.play({ from: { x: 0 } })
        m.frames(2, 100)
        const before = x(first)
        expect(m.pending).toBe(1)

        m.drop()
        expect(m.pending).toBe(0)
        m.frame(100)
        expect(x(first)).toBe(before)

        m.advance(5000)
        const second = rafTimeline(slow(), m.clock)
        second.play({ from: { x: 0 } })
        expect(m.pending).toBe(1)
        m.frames(2, 100)
        expect(x(first)).toBeGreaterThan(before)
        expect(x(second)).toBeGreaterThan(0)
    })

    it('A4: a hidden gap is a suspension, not 116 ms', () => {
        const m = createManualClock()
        const t = rafTimeline(slow(), m.clock)
        t.play({ from: { x: 0 } })
        m.frame(16)
        expect(x(t)).toBeCloseTo(0.16, 5)

        m.setHidden(true)
        m.advance(100)
        m.setHidden(false)
        m.frame(16)
        expect(x(t)).toBeCloseTo(0.32, 5)
    })

    it('A4: without a visibility event the same gap applies in full', () => {
        const m = createManualClock()
        const t = rafTimeline(slow(), m.clock)
        t.play({ from: { x: 0 } })
        m.frame(16)
        m.advance(100)
        m.frame(16)
        expect(x(t)).toBeCloseTo(0.16 + 1.16, 5)
    })

    it('A4: visibility: false makes setHidden throw a TypeError', () => {
        const m = createManualClock({ visibility: false })
        expect(() => m.setHidden(true)).toThrow(TypeError)
        expect(() => m.setHidden(false)).toThrow(/visibility/i)

        const t = rafTimeline(slow(), m.clock)
        t.play({ from: { x: 0 } })
        m.frame(16)
        m.advance(100)
        m.frame(16)
        expect(x(t)).toBeCloseTo(0.16 + 1.16, 5)
    })

    it('A5: timeScale is forwarded', () => {
        const m = createManualClock({ timeScale: 0.5 })
        expect(m.clock.timeScale).toBe(0.5)
        const t = rafTimeline(slow(), m.clock)
        t.play({ from: { x: 0 } })
        m.frames(2, 16)
        expect(x(t)).toBeCloseTo(0.16, 5)
    })

    it('A5: onError receives a throwing subscriber error', () => {
        const errors: unknown[] = []
        const m = createManualClock({ onError: (e) => errors.push(e) })
        const boom = new Error('bad subscriber')
        const seen: number[] = []
        m.clock.subscribe({
            update: () => {
                throw boom
            },
        })
        m.clock.subscribe({ update: (dt) => seen.push(dt) })
        m.frame(16)
        expect(errors).toEqual([boom])
        expect(seen).toHaveLength(1)
        expect(m.pending).toBe(1)
    })
})

describe('TST: defaultClock', () => {
    afterEach(() => {
        AnimationClock.reset()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('A6: defaultClock is the instance AnimationClock.create returns', () => {
        expect(defaultClock).toBeInstanceOf(AnimationClock)
        expect(AnimationClock.create()).toBe(defaultClock)
        expect(AnimationClock.create(5)).toBe(defaultClock)
        expect(AnimationClock.configure({ lagThreshold: 1 })).toBe(defaultClock)
    })

    function stubFrames() {
        const queue: ((timestamp: number) => void)[] = []
        let time = 1000
        vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
            queue.push(cb)
            return queue.length
        })
        vi.stubGlobal('cancelAnimationFrame', () => undefined)
        vi.spyOn(performance, 'now').mockImplementation(() => time)
        return {
            frame(ms: number) {
                time += ms
                const callbacks = queue.splice(0)
                for (const cb of callbacks) cb(time)
            },
        }
    }

    function checkReset(reset: () => void) {
        const frames = stubFrames()
        const deltas: number[] = []
        defaultClock.subscribe({ update: (dt) => deltas.push(dt) })
        expect(defaultClock.size).toBe(1)
        defaultClock.timeScale = 0.5
        defaultClock.pause()
        expect(defaultClock.paused).toBe(true)

        reset()

        expect(AnimationClock.create()).toBe(defaultClock)
        expect(defaultClock.size).toBe(0)
        expect(defaultClock.timeScale).toBe(1)
        expect(defaultClock.paused).toBe(false)

        // the reference still works as a clock
        defaultClock.subscribe({ update: (dt) => deltas.push(dt) })
        expect(defaultClock.size).toBe(1)
        frames.frame(16)
        expect(deltas).toHaveLength(1)
        expect(deltas[0]).toBeCloseTo(0.016, 5)
    }

    it('A6: AnimationClock.reset keeps the instance and restores defaults', () => {
        checkReset(() => AnimationClock.reset())
    })

    it('A6: resetDefaultClock keeps the instance and restores defaults', () => {
        checkReset(() => resetDefaultClock())
    })

    it('A6: reset restores the construction timing options', () => {
        const frames = stubFrames()
        const deltas: number[] = []
        AnimationClock.configure({ maxDeltaTime: 0.001 })
        resetDefaultClock()
        defaultClock.subscribe({ update: (dt) => deltas.push(dt) })
        frames.frame(16)
        expect(deltas).toHaveLength(1)
        expect(deltas[0]).toBeCloseTo(0.016, 5)
    })

    it('A6: reset stops the frame loop of the default clock', () => {
        const frames = stubFrames()
        const deltas: number[] = []
        defaultClock.subscribe({ update: (dt) => deltas.push(dt) })
        frames.frame(16)
        expect(deltas).toHaveLength(1)
        resetDefaultClock()
        frames.frame(16)
        expect(deltas).toHaveLength(1)
    })
})

describe('TST: root entry', () => {
    it('A7: the root module does not export the testing helpers', () => {
        expect(Reflect.has(root, 'createManualClock')).toBe(false)
        expect(Reflect.has(root, 'resetDefaultClock')).toBe(false)
        expect(Reflect.has(root, 'defaultClock')).toBe(true)
    })
})
