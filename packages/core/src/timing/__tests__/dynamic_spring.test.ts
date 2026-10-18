import { describe, expect, it } from 'vitest'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import { rafTimeline } from '~/ani/raf/timeline'
import { ani, sequence } from '~/nodes'
import { T } from '~/timing'

type StepContext = Parameters<ReturnType<typeof T.dynamicSpring>['step']>[1]

const ctx = (state: Record<string, any>, over: Partial<StepContext> = {}) =>
    ({ dt: 0, from: 0, to: 100, duration: 100, state, ...over }) as StepContext

/** analytic under-damped spring released at rest */
function analytic(t: number, k: number, c: number, from: number, to: number) {
    const wn = Math.sqrt(k)
    const zeta = c / (2 * wn)
    const wd = wn * Math.sqrt(1 - zeta * zeta)
    const d0 = from - to
    return (
        to +
        Math.exp(-zeta * wn * t) *
            (d0 * Math.cos(wd * t) + ((zeta * wn * d0) / wd) * Math.sin(wd * t))
    )
}

describe('DynamicSpringTimingFunction', () => {
    it('is deterministic: the value depends on the time, not on how it was reached', () => {
        const spring = T.dynamicSpring({ m: 1, k: 120, c: 8 })
        const jump = {}
        const direct = spring.step(0.5, ctx(jump)).value

        const coarse = {}
        for (const t of [0.1, 0.2, 0.3, 0.4]) spring.step(t, ctx(coarse))
        const viaCoarse = spring.step(0.5, ctx(coarse)).value

        const fine = {}
        for (let t = 0; t < 0.5 - 1e-9; t += 1 / 60) spring.step(t, ctx(fine))
        const viaFine = spring.step(0.5, ctx(fine)).value

        expect(viaCoarse).toBeCloseTo(direct, 10)
        expect(viaFine).toBeCloseTo(direct, 10)
    })

    it('stays accurate and stable for a stiff spring queried with a huge step', () => {
        const k = 2000
        const c = 40
        const spring = T.dynamicSpring({ m: 1, k, c })
        const state = {}
        for (const t of [0.1, 0.2, 0.4, 0.8]) {
            const { value } = spring.step(t, ctx(state, { dt: 0.1 }))
            expect(Math.abs(value - analytic(t, k, c, 0, 100))).toBeLessThan(
                0.05
            )
        }
    })

    it('honours opt.tolerance when deciding that the spring has settled', () => {
        const settleTime = (tolerance?: number) => {
            const spring = T.dynamicSpring({
                m: 1,
                k: 100,
                c: 12,
                ...(tolerance !== undefined && { tolerance }),
            })
            const state = {}
            for (let t = 0; t < 20; t += 1 / 120) {
                if (spring.step(t, ctx(state, { duration: 20 })).endOfAnimation)
                    return t
            }
            return Number.POSITIVE_INFINITY
        }
        expect(settleTime(5)).toBeLessThan(settleTime())
    })

    it('snaps to `to` at the segment duration even if it never settles', () => {
        const spring = T.dynamicSpring({ m: 1, k: 100, c: 0 })
        const state = {}
        const mid = spring.step(0.5, ctx(state, { duration: 1 }))
        expect(mid.endOfAnimation).toBe(false)
        const end = spring.step(1, ctx(state, { duration: 1 }))
        expect(end).toEqual({ value: 100, endOfAnimation: true })
    })

    it('keeps separate state per slot even when the instance is shared', () => {
        const spring = T.dynamicSpring({ m: 1, k: 90, c: 9 })
        const a = {}
        const b = {}
        const aloneA = T.dynamicSpring({ m: 1, k: 90, c: 9 })
        const aloneB = T.dynamicSpring({ m: 1, k: 90, c: 9 })
        const alone = { a: {}, b: {} }
        for (let i = 1; i <= 20; i++) {
            const t = i / 60
            const va = spring.step(t, ctx(a, { to: 100 })).value
            const vb = spring.step(t, ctx(b, { from: 10, to: 20 })).value
            expect(va).toBeCloseTo(
                aloneA.step(t, ctx(alone.a, { to: 100 })).value,
                12
            )
            expect(vb).toBeCloseTo(
                aloneB.step(t, ctx(alone.b, { from: 10, to: 20 })).value,
                12
            )
        }
    })

    it('rejects non-physical parameters', () => {
        expect(() => T.dynamicSpring({ m: 0, k: 1, c: 1 })).toThrow(RangeError)
        expect(() => T.dynamicSpring({ m: 1, k: -1, c: 1 })).toThrow(RangeError)
        expect(() => T.dynamicSpring({ m: 1, k: 1, c: -1 })).toThrow(RangeError)
    })
})

describe('dynamic springs inside timelines', () => {
    it('one shared instance drives several properties independently (K3)', () => {
        const spring = T.dynamicSpring({ m: 1, k: 100, c: 10 })
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({
                to: { x: 100, y: 50 },
                duration: 10,
                timing: { x: spring, y: spring },
            }),
            clock
        )
        line.play({ from: { x: 0, y: 0 } })
        for (let i = 0; i < 30; i++) {
            clock.tick(1 / 60)
            const v = line.getCurrentValue()!
            // linear system, same dynamics: y must be exactly half of x
            expect(v.y! * 2).toBeCloseTo(v.x!, 9)
        }
        expect(line.getCurrentValue()!.x).toBeGreaterThan(1)
    })

    it('timelines over the same node do not share integrator state', () => {
        const node = ani({
            to: { x: 100 },
            duration: 10,
            timing: T.dynamicSpring({ m: 1, k: 100, c: 10 }),
        })
        const clockA = new ManualClock()
        const clockB = new ManualClock()
        const a = rafTimeline(node, clockA)
        const b = rafTimeline(node, clockB)
        const soloClock = new ManualClock()
        const solo = rafTimeline(node, soloClock)
        a.play({ from: { x: 0 } })
        b.play({ from: { x: 0 } })
        solo.play({ from: { x: 0 } })
        // interleave unevenly
        for (let i = 0; i < 25; i++) clockA.tick(1 / 60)
        clockB.tick(1 / 60)
        soloClock.tick(1 / 60)
        expect(b.getCurrentValue()!.x).toBeCloseTo(
            solo.getCurrentValue()!.x,
            12
        )
    })

    it('sequence-injected timing restarts cleanly for every segment', () => {
        const spring = T.dynamicSpring({ m: 1, k: 100, c: 10 })
        const chained = rafTimeline(
            sequence(
                [
                    ani({ to: { x: 100 }, duration: 3 }),
                    ani({ to: { x: 0 }, duration: 3 }),
                ],
                spring
            ),
            new ManualClock()
        )
        const reference = rafTimeline(
            ani({ to: { x: 0 }, duration: 3, timing: spring }),
            new ManualClock()
        )
        chained.play({ from: { x: 0 } })
        reference.play({ from: { x: 100 } })
        chained.seek(3.3)
        reference.seek(0.3)
        expect(chained.getCurrentValue()!.x).toBeCloseTo(
            reference.getCurrentValue()!.x,
            6
        )
    })

    it('seek is deterministic and matches playing to that time', () => {
        const spring = T.dynamicSpring({ m: 1, k: 100, c: 6 })
        const node = ani({ to: { x: 100 }, duration: 10, timing: spring })
        const clock = new ManualClock()
        const played = rafTimeline(node, clock)
        played.play({ from: { x: 0 } })
        clock.run(30) // 0.5s
        const target = played.getCurrentValue()!.x

        const sought = rafTimeline(node, new ManualClock())
        sought.play({ from: { x: 0 } })
        sought.seek(0.5)
        expect(sought.getCurrentValue()!.x).toBeCloseTo(target, 8)
        sought.seek(0.2)
        sought.seek(0.5)
        expect(sought.getCurrentValue()!.x).toBeCloseTo(target, 8)
    })

    it('does not depend on the frame rate', () => {
        const node = ani({
            to: { x: 100 },
            duration: 10,
            timing: T.dynamicSpring({ m: 1, k: 100, c: 6 }),
        })
        const at = (dt: number, frames: number) => {
            const clock = new ManualClock()
            const line = rafTimeline(node, clock)
            line.play({ from: { x: 0 } })
            clock.run(frames, dt)
            return line.getCurrentValue()!.x
        }
        expect(at(0.1, 5)).toBeCloseTo(at(1 / 60, 30), 8)
    })

    it('ends early once settled, and settles exactly on `to`', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({
                to: { x: 100 },
                duration: 200,
                timing: T.dynamicSpring({ m: 1, k: 100, c: 20 }),
            }),
            clock
        )
        line.play({ from: { x: 0 } })
        let frames = 0
        while (line.status === 'PLAYING' && frames < 60 * 30) {
            clock.tick(1 / 60)
            frames++
        }
        expect(line.status).toBe('ENDED')
        expect(frames).toBeLessThan(60 * 10)
        expect(line.getCurrentValue()).toEqual({ x: 100 })
        expect(clock.size).toBe(0)
    })

    it('re-playing restarts the spring from rest', () => {
        const clock = new ManualClock()
        const line = rafTimeline(
            ani({
                to: { x: 100 },
                duration: 10,
                timing: T.dynamicSpring({ m: 1, k: 100, c: 10 }),
            }),
            clock
        )
        line.play({ from: { x: 0 } })
        clock.run(20)
        const first = line.getCurrentValue()!.x
        line.pause()
        line.play({ from: { x: 0 } })
        clock.run(20)
        expect(line.getCurrentValue()!.x).toBeCloseTo(first, 12)
    })
})
