import { describe, expect, it } from 'vitest'
import { rafTimeline } from '~/ani/raf/timeline'
import { ani, parallel } from '~/nodes'
import { timing } from '~/timing'
import { ManualClock } from './manual_clock'

const springNode = (to = 800) =>
    ani({
        to: { x: to },
        duration: 20,
        timing: timing.dynamicSpring({ m: 1, k: 170, c: 26 }),
    })

describe('velocity', () => {
    it('is null until a frame advanced, then the finite difference', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: { x: 100 }, duration: 1, timing: timing.linear() }),
            { clock }
        )
        expect(line.velocity).toBeNull()
        line.play({ from: { x: 0 } })
        expect(line.velocity).toBeNull()
        clock.tick(0.1)
        expect(line.velocity!.x).toBeCloseTo(100)
    })

    it('reports the integrator velocity of a dynamic spring', () => {
        const clock = new ManualClock()
        const line = rafTimeline(springNode(), { clock })
        line.play({ from: { x: 0 } })
        let previous = 0
        let previousVelocity = 0
        for (let i = 0; i < 12; i++) {
            clock.tick(1 / 120)
            const now = line.value!.x!
            const velocity = line.velocity!.x!
            // the mean of the end-point velocities matches the displacement
            const fd = (now - previous) * 120
            const mean = (velocity + previousVelocity) / 2
            expect(Math.abs(mean - fd)).toBeLessThanOrEqual(0.05 * fd + 1)
            previous = now
            previousVelocity = velocity
        }
        expect(previousVelocity).toBeGreaterThan(1000)
    })

    it('is zero once the timeline stopped and null after a seek', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: [100], duration: 1, timing: timing.linear() }),
            { clock }
        )
        line.play({ from: [0] })
        clock.tick(0.5)
        line.pause()
        expect(line.velocity).toEqual([0])
        line.seek(0.2)
        expect(line.velocity).toBeNull()
    })
})

describe('velocity seeding', () => {
    it('config.velocity seeds a dynamic spring', () => {
        const run = (velocity?: { x: number }) => {
            const clock = new ManualClock()
            const line = rafTimeline(springNode(0), { clock })
            line.play({ from: { x: 0 }, ...(velocity && { velocity }) })
            clock.run(6)
            return line.value!.x!
        }
        // from === to: only an initial velocity makes it move
        expect(run()).toBe(0)
        expect(run({ x: 500 })).toBeGreaterThan(5)
    })

    it('seeds every opening segment, not only the first declared one', () => {
        // Both children start at t=0; the later declaration wins the lane.
        // `from === to`, so only the seed can move the winning segment.
        const run = (velocity?: { x: number }) => {
            const clock = new ManualClock()
            const line = rafTimeline(
                parallel([
                    ani({
                        to: { x: 0 },
                        duration: 5,
                        timing: timing.dynamicSpring({ m: 1, k: 50, c: 5 }),
                    }),
                    ani({
                        to: { x: 0 },
                        duration: 5,
                        timing: timing.dynamicSpring({ m: 1, k: 100, c: 10 }),
                    }),
                ]),
                { clock }
            )
            line.play({ from: { x: 0 }, ...(velocity && { velocity }) })
            clock.run(6)
            return line.value!.x!
        }
        expect(run()).toBe(0)
        expect(run({ x: 500 })).toBeGreaterThan(5)
    })

    it('accepts partial record velocities and array velocities', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({
                to: { x: 0, y: 0 },
                duration: 5,
                timing: timing.dynamicSpring({ m: 1, k: 100, c: 10 }),
            }),
            { clock }
        )
        line.play({ from: { x: 0, y: 0 }, velocity: { y: 300 } })
        clock.run(6)
        expect(line.value!.x).toBe(0)
        expect(line.value!.y).toBeGreaterThan(1)

        const list = rafTimeline(
            ani({
                to: [0, 0],
                duration: 5,
                timing: [
                    timing.dynamicSpring({ m: 1, k: 100, c: 10 }),
                    timing.dynamicSpring({ m: 1, k: 100, c: 10 }),
                ],
            }),
            { clock: new ManualClock() }
        )
        list.play({ from: [0, 0], velocity: [0, 300] })
        list.seek(0.1)
        expect(list.value![0]).toBe(0)
        expect(list.value![1]).toBeGreaterThan(1)
    })

    it('rejects a malformed velocity', () => {
        const line = rafTimeline(springNode(), { clock: new ManualClock() })
        expect(() =>
            line.play({ from: { x: 0 }, velocity: { x: Number.NaN } })
        ).toThrow(TypeError)
    })

    it('retargeting a playing spring is velocity continuous', () => {
        // The reference run is never interrupted; the other run restarts the
        // very same animation from its current value every 2 frames (as a
        // pointer-following UI does). With velocity hand-over both agree.
        const frames = 30
        const refClock = new ManualClock()
        const reference = rafTimeline(springNode(), { clock: refClock })
        reference.play({ from: { x: 0 } })
        refClock.run(frames)

        const clock = new ManualClock()
        const line = rafTimeline(springNode(), { clock })
        line.play({ from: { x: 0 } })
        for (let i = 0; i < frames; i += 2) {
            clock.run(2)
            if (i + 2 < frames) {
                line.play({ from: { ...line.value! } })
            }
        }
        const expected = reference.value!.x!
        const actual = line.value!.x!
        expect(expected).toBeGreaterThan(300)
        // 214/800 px before the fix (velocity reset at each interruption)
        expect(Math.abs(actual - expected) / 800).toBeLessThan(0.02)
    })

    it('an explicit velocity wins over the inherited one; stopped timelines start at rest', () => {
        const rest = (from: number) => {
            const clock = new ManualClock()
            const line = rafTimeline(springNode(), { clock })
            line.play({ from: { x: from } })
            clock.run(6)
            return line.value!.x!
        }
        const run = (reuse: (line: ReturnType<typeof rafTimeline>) => void) => {
            const clock = new ManualClock()
            const line = rafTimeline(springNode(), { clock })
            line.play({ from: { x: 0 } })
            clock.run(10)
            const mid = line.value!.x!
            reuse(line as never)
            clock.run(6)
            return { mid, value: line.value!.x! }
        }
        const restart = (extra: object) => (line: any) =>
            line.play({ from: { x: line.value.x }, ...extra })

        const inherited = run(restart({}))
        const explicitRest = run(restart({ velocity: { x: 0 } }))
        const afterPause = run((line) => {
            line.pause()
            restart({})(line)
        })

        expect(explicitRest.value).toBeCloseTo(rest(explicitRest.mid), 9)
        expect(afterPause.value).toBeCloseTo(rest(afterPause.mid), 9)
        // carrying the velocity makes the spring clearly faster than from rest
        expect(inherited.value).toBeGreaterThan(explicitRest.value + 20)
    })
})
