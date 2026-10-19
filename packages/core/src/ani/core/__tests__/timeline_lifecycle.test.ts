import { afterEach, describe, expect, it, vi } from 'vitest'
import { rafTimeline } from '~/ani/raf/timeline'
import { ani, delay, parallel, sequence } from '~/nodes'
import { timing } from '~/timing'
import { ManualClock } from './manual_clock'

const linear = timing.linear()

describe('status / pause / resume / ENDED', () => {
    it('exposes the lifecycle through `status`', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: linear }),
            { clock }
        )
        expect(line.status).toBe('IDLE')
        line.play({ from: [0] })
        expect(line.status).toBe('PLAYING')
        line.pause()
        expect(line.status).toBe('PAUSED')
        line.resume()
        expect(line.status).toBe('PLAYING')
        line.seek(0.5)
        expect(line.status).toBe('PAUSED')
        line.resume()
        clock.tick(1)
        expect(line.status).toBe('ENDED')
    })

    it('emits ENDED exactly once, pause/resume cannot revive an ended run', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: linear }),
            { clock }
        )
        const statuses: string[] = []
        line.onUpdate(({ status }) => statuses.push(status))
        line.play({ from: [0] })
        clock.tick(1)
        line.pause()
        line.resume()
        clock.tick(1)
        clock.tick(1)
        expect(line.status).toBe('ENDED')
        expect(statuses.filter((s) => s === 'ENDED')).toHaveLength(1)
        expect(clock.size).toBe(0)
    })

    it('pause/resume are no-ops on a timeline that never played', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: linear }),
            { clock }
        )
        line.pause()
        line.resume()
        expect(line.status).toBe('IDLE')
        expect(clock.size).toBe(0)
    })

    it('dispose() leaves the clock, drops subscribers and disables play/resume', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: linear }),
            { clock }
        )
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)
        line.play({ from: [0] })
        expect(clock.size).toBe(1)

        line.dispose()
        line.dispose() // idempotent
        expect(clock.size).toBe(0)
        const calls = onUpdate.mock.calls.length

        line.play({ from: [0] })
        line.resume()
        clock.tick(1)
        expect(clock.size).toBe(0)
        expect(onUpdate).toHaveBeenCalledTimes(calls)
        expect(line.status).toBe('IDLE')
    })
})

describe('repeat', () => {
    it('carries the frame overshoot into the next iteration (no drift)', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: linear }),
            { clock }
        )
        line.play({ from: [0], repeat: Infinity })
        clock.tick(0.4)
        clock.tick(0.4)
        clock.tick(0.4) // 1.2s: 0.2s into the 2nd iteration
        expect(line.value![0]).toBeCloseTo(20)
        clock.run(7, 0.4) // 4.0s total
        expect(line.value![0]).toBeCloseTo(0)
        clock.tick(0.3)
        expect(line.value![0]).toBeCloseTo(30)
    })

    it('skips whole repeats elapsed within one frame and still ends once', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: linear }),
            { clock }
        )
        const statuses: string[] = []
        line.onUpdate(({ status }) => statuses.push(status))
        line.play({ from: [0], repeat: 2 })
        clock.tick(2.5) // 3 runs in total (0-3s): 2.5s lands in the 3rd
        expect(line.status).toBe('PLAYING')
        expect(line.value![0]).toBeCloseTo(50)
        clock.tick(10)
        expect(line.status).toBe('ENDED')
        expect(line.value).toEqual([100])
        expect(statuses.filter((s) => s === 'ENDED')).toHaveLength(1)
    })
})

describe('onUpdate error isolation', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('a throwing subscriber neither stops the others nor the timeline', () => {
        const reported: unknown[] = []
        vi.stubGlobal('queueMicrotask', (task: () => void) => {
            try {
                task()
            } catch (error) {
                reported.push(error)
            }
        })
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: linear }),
            { clock }
        )
        const boom = new Error('subscriber bug')
        const healthy = vi.fn()
        line.onUpdate(() => {
            throw boom
        })
        line.onUpdate(healthy)

        line.play({ from: [0] })
        expect(() => clock.tick(0.5)).not.toThrow()
        expect(healthy).toHaveBeenLastCalledWith({
            state: [50],
            status: 'PLAYING',
        })
        clock.tick(0.5)
        expect(line.status).toBe('ENDED')
        expect(line.value).toEqual([100])
        expect(reported.length).toBeGreaterThan(0)
        expect(reported.every((error) => error === boom)).toBe(true)
    })
})

describe('play() validation', () => {
    const makeLine = (node: Parameters<typeof rafTimeline>[0]) => {
        const clock = new ManualClock()
        return { clock, line: rafTimeline(node as never, { clock }) }
    }

    it('rejects a record timing that misses an animated key', () => {
        const { line, clock } = makeLine(
            ani({
                to: { x: 1, y: 2 },
                duration: 1,
                timing: { x: linear } as never,
            })
        )
        expect(() => line.play({ from: { x: 0, y: 0 } })).toThrow(TypeError)
        expect(() => line.play({ from: { x: 0, y: 0 } })).toThrow(/"y"/)
        expect(line.status).toBe('IDLE')
        expect(clock.size).toBe(0)
    })

    it('rejects from/to arity mismatches', () => {
        const { line } = makeLine(ani({ to: [1, 2], duration: 1 }))
        expect(() => line.play({ from: [0] })).toThrow(TypeError)
    })

    it('rejects properties that are animated but missing from `from`', () => {
        const { line } = makeLine(ani({ to: { x: 1, z: 2 }, duration: 1 }))
        expect(() => line.play({ from: { x: 0 } as never })).toThrow(/"z"/)
    })

    it('rejects non-finite numbers in `from` and `to`', () => {
        const a = makeLine(ani({ to: { x: 1 }, duration: 1 }))
        expect(() => a.line.play({ from: { x: Number.NaN } })).toThrow(
            TypeError
        )
        const b = makeLine(
            ani({ to: { x: Number.POSITIVE_INFINITY }, duration: 1 })
        )
        expect(() => b.line.play({ from: { x: 0 } })).toThrow(TypeError)
    })

    it('rejects negative duration overrides and delays', () => {
        const { line } = makeLine(ani({ to: { x: 1 }, duration: 1 }))
        expect(() => line.play({ from: { x: 0 }, durations: [-1] })).toThrow(
            RangeError
        )
        expect(() => line.play({ from: { x: 0 }, delay: -5 })).toThrow(
            RangeError
        )
    })

    it('a rejected play() leaves the running animation untouched', () => {
        const { line, clock } = makeLine(
            sequence([ani({ to: { x: 100 }, duration: 1, timing: linear })])
        )
        line.play({ from: { x: 0 } })
        clock.tick(0.25)
        expect(() => line.play({ from: { x: Number.NaN } })).toThrow(TypeError)
        expect(line.status).toBe('PLAYING')
        clock.tick(0.25)
        expect(line.value).toEqual({ x: 50 })
    })

    it('never throws from inside a clock tick for malformed timing', () => {
        const { line, clock } = makeLine(
            ani({
                to: { x: 1, y: 2 },
                duration: 1,
                timing: { x: linear } as never,
            })
        )
        try {
            line.play({ from: { x: 0, y: 0 } })
        } catch {
            // expected: synchronous
        }
        expect(() => clock.tick(0.1)).not.toThrow()
    })
})

describe('documented edge semantics', () => {
    it('seek() before the first play() is a no-op', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: linear }),
            { clock }
        )
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)
        line.seek(0.5)
        expect(onUpdate).not.toHaveBeenCalled()
        expect(line.status).toBe('IDLE')
        expect(line.value).toBeNull()
    })

    it('reset() restores the node duration after a durations override', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: linear }),
            { clock }
        )
        line.play({ from: [0], durations: [5] })
        expect(line.duration).toBe(5)
        line.reset()
        expect(line.duration).toBe(1)
    })

    it('velocity is zero after the timeline ended', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: linear }),
            { clock }
        )
        line.play({ from: [0] })
        clock.tick(0.5)
        expect(line.velocity![0]).toBeCloseTo(100)
        clock.tick(0.5)
        expect(line.status).toBe('ENDED')
        expect(line.velocity).toEqual([0])
    })

    it('only held-by-settling-spring timelines end early; delay() keeps its time', () => {
        const spring = () => timing.dynamicSpring({ m: 1, k: 100, c: 20 })
        const clock = new ManualClock()
        const early = rafTimeline(
            ani({ to: { x: 10 }, duration: 100, timing: spring() }),
            { clock }
        )
        early.play({ from: { x: 0 } })
        clock.run(60 * 10)
        expect(early.status).toBe('ENDED')

        const tailClock = new ManualClock()
        const tail = rafTimeline(
            parallel([
                ani({ to: { x: 10 }, duration: 100, timing: spring() }),
                delay(30),
            ]),
            { clock: tailClock }
        )
        tail.play({ from: { x: 0 } })
        tailClock.run(60 * 10)
        // the spring settled long ago, but the 30s delay still has to elapse
        expect(tail.status).toBe('PLAYING')
        tailClock.run(60 * 21)
        expect(tail.status).toBe('ENDED')
    })
})
