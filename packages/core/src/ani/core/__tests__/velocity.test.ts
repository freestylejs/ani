import { describe, expect, it } from 'vitest'
import { rafTimeline } from '~/ani/raf/timeline'
import { ani } from '~/nodes'
import { T } from '~/timing'
import { ManualClock } from './manual_clock'

const springNode = (to = 800) =>
    ani({
        to: { x: to },
        duration: 20,
        timing: T.dynamicSpring({ m: 1, k: 170, c: 26 }),
    })

describe('getCurrentVelocity()', () => {
    it('is null until a frame advanced, then the finite difference', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({ to: { x: 100 }, duration: 1, timing: T.linear() }),
            clock
        )
        expect(line.getCurrentVelocity()).toBeNull()
        line.play({ from: { x: 0 } })
        expect(line.getCurrentVelocity()).toBeNull()
        clock.tick(0.1)
        expect(line.getCurrentVelocity()!.x).toBeCloseTo(100)
    })

    it('reports the integrator velocity of a dynamic spring', () => {
        const clock = new ManualClock()
        const line = rafTimeline(springNode(), clock)
        line.play({ from: { x: 0 } })
        let previous = 0
        let previousVelocity = 0
        for (let i = 0; i < 12; i++) {
            clock.tick(1 / 120)
            const now = line.getCurrentValue()!.x!
            const velocity = line.getCurrentVelocity()!.x!
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
            ani({ to: [100], duration: 1, timing: T.linear() }),
            clock
        )
        line.play({ from: [0] })
        clock.tick(0.5)
        line.pause()
        expect(line.getCurrentVelocity()).toEqual([0])
        line.seek(0.2)
        expect(line.getCurrentVelocity()).toBeNull()
    })
})

describe('velocity seeding', () => {
    it('config.velocity seeds a dynamic spring', () => {
        const run = (velocity?: { x: number }) => {
            const clock = new ManualClock()
            const line = rafTimeline(springNode(0), clock)
            line.play({ from: { x: 0 }, ...(velocity && { velocity }) })
            clock.run(6)
            return line.getCurrentValue()!.x!
        }
        // from === to: only an initial velocity makes it move
        expect(run()).toBe(0)
        expect(run({ x: 500 })).toBeGreaterThan(5)
    })

    it('accepts partial record velocities and array velocities', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({
                to: { x: 0, y: 0 },
                duration: 5,
                timing: T.dynamicSpring({ m: 1, k: 100, c: 10 }),
            }),
            clock
        )
        line.play({ from: { x: 0, y: 0 }, velocity: { y: 300 } })
        clock.run(6)
        expect(line.getCurrentValue()!.x).toBe(0)
        expect(line.getCurrentValue()!.y).toBeGreaterThan(1)

        const list = rafTimeline(
            ani({
                to: [0, 0],
                duration: 5,
                timing: [
                    T.dynamicSpring({ m: 1, k: 100, c: 10 }),
                    T.dynamicSpring({ m: 1, k: 100, c: 10 }),
                ],
            }),
            new ManualClock()
        )
        list.play({ from: [0, 0], velocity: [0, 300] })
        list.seek(0.1)
        expect(list.getCurrentValue()![0]).toBe(0)
        expect(list.getCurrentValue()![1]).toBeGreaterThan(1)
    })

    it('rejects a malformed velocity', () => {
        const line = rafTimeline(springNode(), new ManualClock())
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
        const reference = rafTimeline(springNode(), refClock)
        reference.play({ from: { x: 0 } })
        refClock.run(frames)

        const clock = new ManualClock()
        const line = rafTimeline(springNode(), clock)
        line.play({ from: { x: 0 } })
        for (let i = 0; i < frames; i += 2) {
            clock.run(2)
            if (i + 2 < frames) {
                line.play({ from: { ...line.getCurrentValue()! } })
            }
        }
        const expected = reference.getCurrentValue()!.x!
        const actual = line.getCurrentValue()!.x!
        expect(expected).toBeGreaterThan(300)
        // 214/800 px before the fix (velocity reset at each interruption)
        expect(Math.abs(actual - expected) / 800).toBeLessThan(0.02)
    })

    it('an explicit velocity wins over the inherited one; stopped timelines start at rest', () => {
        const rest = (from: number) => {
            const clock = new ManualClock()
            const line = rafTimeline(springNode(), clock)
            line.play({ from: { x: from } })
            clock.run(6)
            return line.getCurrentValue()!.x!
        }
        const run = (reuse: (line: ReturnType<typeof rafTimeline>) => void) => {
            const clock = new ManualClock()
            const line = rafTimeline(springNode(), clock)
            line.play({ from: { x: 0 } })
            clock.run(10)
            const mid = line.getCurrentValue()!.x!
            reuse(line as never)
            clock.run(6)
            return { mid, value: line.getCurrentValue()!.x! }
        }
        const restart = (extra: object) => (line: any) =>
            line.play({ from: { x: line.getCurrentValue().x }, ...extra })

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
