import { describe, expect, it } from 'vitest'
import { rafTimeline } from '~/ani/raf/timeline'
import { ani, delay, parallel, sequence, stagger } from '~/nodes'
import { TimingFunction, type TimingFunctionContext, timing } from '~/timing'
import { isEndOfAnimation } from '~/utils/time'
import { ManualClock } from './manual_clock'

class CountingLinear extends TimingFunction {
    public calls = 0
    public step(time: number, context: TimingFunctionContext) {
        this.calls++
        const progress = Math.min(time / context.duration, 1)
        return {
            value: context.from + (context.to - context.from) * progress,
            endOfAnimation: time >= context.duration,
        }
    }
}

describe('same-key overlap rule', () => {
    it('the later-started segment wins and starts from the value at its own start', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            parallel([
                ani({ to: { x: 100 }, duration: 2, timing: timing.linear() }),
                sequence([
                    delay(1),
                    ani({ to: { x: 0 }, duration: 1, timing: timing.linear() }),
                ]),
            ]),
            { clock }
        )
        line.play({ from: { x: 0 } })

        // first segment alone until the second one starts: 50 at t=1
        line.seek(1)
        expect(line.value).toEqual({ x: 50 })
        // second segment interpolates 50 -> 0 (fixed `from`, not the moving 75)
        line.seek(1.5)
        expect(line.value).toEqual({ x: 25 })
        // the first segment is still "active" but was overridden
        line.seek(2)
        expect(line.value).toEqual({ x: 0 })
    })

    it('ties go to the later declaration in array timelines', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            parallel([
                ani({ to: [100], duration: 1, timing: timing.linear() }),
                ani({ to: [200], duration: 1, timing: timing.linear() }),
            ]),
            { clock }
        )
        line.play({ from: [0] })
        line.seek(0.5)
        // the 2nd segment starts at 0 from 0 (not from the 1st one's progress)
        expect(line.value).toEqual([100])
        line.seek(1)
        expect(line.value).toEqual([200])
    })

    it('resolves nested overlaps per key, independent of other keys', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            stagger(
                [
                    ani({
                        to: { x: 100, y: 10 },
                        duration: 1,
                        timing: timing.linear(),
                    }),
                    ani({ to: { x: 0 }, duration: 1, timing: timing.linear() }),
                ],
                { offset: 0.5 }
            ),
            { clock }
        )
        line.play({ from: { x: 0, y: 0 } })
        line.seek(1)
        // x: 2nd segment from 50 (value at 0.5) to 0 at 1.5 => 25; y untouched by it
        expect(line.value).toEqual({ x: 25, y: 10 })
    })
})

describe('delay()', () => {
    it('holds the value in array timelines (was a tick-time throw)', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            sequence([
                ani({ to: [100], duration: 1, timing: timing.linear() }),
                delay(1),
                ani({ to: [200], duration: 1, timing: timing.linear() }),
            ]),
            { clock }
        )
        line.play({ from: [0] })
        expect(() => clock.tick(1.5)).not.toThrow()
        expect(line.value).toEqual([100])
        clock.tick(1)
        expect(line.value).toEqual([150])
    })
})

describe('evaluation cost', () => {
    it('does not re-evaluate finished segments every frame', () => {
        const clock = new ManualClock()
        const timing = new CountingLinear()
        const line = rafTimeline(
            sequence(
                Array.from({ length: 100 }, (_, i) =>
                    ani({ to: { x: i + 1 }, duration: 1, timing })
                )
            ),
            { clock }
        )
        line.play({ from: { x: 0 } })
        line.seek(99.5)
        line.resume()
        timing.calls = 0
        clock.tick(0.1)
        // only the running segment is stepped (old engine: all 100)
        expect(timing.calls).toBeLessThanOrEqual(1)
        expect(line.value!.x).toBeCloseTo(99.6)
    })
})

describe('notifications and snapshots', () => {
    it('hands the very same state object to every subscriber', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: { x: 100 }, duration: 1, timing: timing.linear() }),
            { clock }
        )
        const seen: object[][] = [[], []]
        line.onUpdate(({ state }) => seen[0]!.push(state))
        line.onUpdate(({ state }) => seen[1]!.push(state))
        line.play({ from: { x: 0 } })
        clock.tick(0.5)
        expect(seen[0]).toHaveLength(2)
        for (let i = 0; i < 2; i++) expect(seen[0]![i]).toBe(seen[1]![i])
        expect(seen[0]![0]).not.toBe(seen[0]![1])
    })

    it('value is a frozen snapshot that never aliases `from`', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: timing.linear() }),
            { clock }
        )
        const from = [0]
        line.play({ from })
        const snapshot = line.value!
        expect(snapshot).not.toBe(from)
        expect(() => {
            ;(snapshot as number[])[0] = 999
        }).toThrow(TypeError)
        // mutating the caller's `from` after play() cannot disturb the run
        from[0] = 999
        clock.tick(0.5)
        expect(line.value).toEqual([50])
        // stable between frames, new object after a frame
        expect(line.value).toBe(line.value)
    })
})

describe('end-of-animation tolerance', () => {
    it('does not complete sub-millisecond segments instantly', () => {
        expect(isEndOfAnimation(0.00025, 0.0005)).toBe(false)
        expect(isEndOfAnimation(0.0005, 0.0005)).toBe(true)

        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 0.0005, timing: timing.linear() }),
            { clock }
        )
        line.play({ from: [0] })
        line.seek(0.00025)
        expect(line.value![0]).toBeCloseTo(50)
    })
})

describe('state objects', () => {
    it('is a fresh, never re-mutated object per notification, for any key name', () => {
        const keys = ['constructor', 'a"b', 'line\nbreak', '1', 'translateX']
        const to = Object.fromEntries(keys.map((k, i) => [k, (i + 1) * 10]))
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to, duration: 1, timing: timing.linear() }),
            { clock }
        )
        const seen: Array<Record<string, number>> = []
        line.onUpdate(({ state }) => {
            seen.push(state as Record<string, number>)
        })
        const from = Object.fromEntries(keys.map((k) => [k, 0]))
        line.play({ from })
        clock.tick(0.5)
        clock.tick(0.5)

        expect(new Set(seen).size).toBe(seen.length)
        const [start, middle, end] = seen as [
            Record<string, number>,
            Record<string, number>,
            Record<string, number>,
        ]
        for (const state of seen) {
            expect(Object.getPrototypeOf(state)).toBe(Object.prototype)
            expect(Object.keys(state).sort()).toEqual([...keys].sort())
        }
        // earlier notifications were not touched by later frames
        expect(start.translateX).toBe(0)
        expect(middle.translateX).toBe(25)
        expect(middle['a"b']).toBe(10)
        expect(end.translateX).toBe(50)
    })

    it('rejects __proto__ as a property name', () => {
        const line = rafTimeline(ani({ to: { x: 1 }, duration: 1 }), {
            clock: new ManualClock(),
        })
        const from = JSON.parse('{"__proto__": 0}')
        expect(() => line.play({ from })).toThrow(TypeError)
    })
})
