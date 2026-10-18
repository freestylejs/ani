import { describe, expect, it } from 'vitest'
import { ani } from '~/nodes'
import { T } from '~/timing'
import { createManualClock } from '../../../testing'
import { RafAniTimeline, rafTimeline } from '../timeline'

const linear = T.linear()
const node = (duration = 1) => ani({ to: { x: 100 }, duration, timing: linear })
const spring = () =>
    ani({
        to: { x: 100 },
        duration: 2,
        timing: T.dynamicSpring({ m: 1, k: 100, c: 10 }),
    })

describe('RafAniTimeline reduced motion', () => {
    it('jump ends a spring run at its target', async () => {
        const m = createManualClock({ reducedMotion: true })
        const t = rafTimeline<{ x: number }>(spring(), { clock: m.clock })

        await expect(t.play({ from: { x: 0 } })).resolves.toBe('ended')

        expect(t.getCurrentValue()).toEqual({ x: 100 })
        expect(m.clock.size).toBe(0)
    })

    it('jump drops a pending start delay', async () => {
        const m = createManualClock({ reducedMotion: true })
        const t = rafTimeline<{ x: number }>(node(), { clock: m.clock })

        await expect(t.play({ from: { x: 0 }, delay: 5000 })).resolves.toBe(
            'ended'
        )

        expect(t.getCurrentValue()).toEqual({ x: 100 })
        expect(m.pending).toBe(0)
    })

    it('jump respects duration overrides', async () => {
        const m = createManualClock({ reducedMotion: true })
        const t = rafTimeline<{ x: number }>(node(), { clock: m.clock })

        await t.play({ from: { x: 0 }, keyframes: [{ x: 7 }], durations: [3] })

        expect(t.getCurrentValue()).toEqual({ x: 7 })
        expect(t.duration).toBe(3)
    })

    it('jump notifies listeners once, in the play call', () => {
        const m = createManualClock({ reducedMotion: true })
        const t = rafTimeline<{ x: number }>(node(), { clock: m.clock })
        const seen: string[] = []
        t.onUpdate(({ status }) => {
            seen.push(status)
        })

        t.play({ from: { x: 0 } })
        m.frames(3)

        expect(seen).toEqual(['ENDED'])
    })

    it('a listener that replays on the jump notification does not interrupt it', async () => {
        const m = createManualClock({ reducedMotion: true })
        const t = rafTimeline<{ x: number }>(node(), { clock: m.clock })
        const replays: Promise<string>[] = []
        t.onUpdate(({ status }) => {
            if (status !== 'ENDED' || replays.length > 0) return
            m.setReducedMotion(false)
            replays.push(t.play({ from: { x: 0 } }))
        })

        const first = t.play({ from: { x: 0 } })
        const settled: string[] = []
        replays[0]!.then((result) => settled.push(result))

        expect(await first).toBe('ended')
        await Promise.resolve()
        expect(t.status).toBe('PLAYING')
        expect(settled).toEqual([])
    })

    it('an interrupted sped-up spring run matches an uninterrupted control', () => {
        const stiff = ani({
            to: { x: 800 },
            duration: 2,
            timing: T.dynamicSpring({ m: 1, k: 100, c: 10 }),
        })
        const make = () => {
            const m = createManualClock({
                reducedMotion: true,
                lagThreshold: Infinity,
            })
            const line = rafTimeline<{ x: number }>(stiff, {
                clock: m.clock,
                reducedMotion: { maxDuration: 0.5 },
            })
            line.play({ from: { x: 0 } })
            return { m, line }
        }
        const interrupted = make()
        const control = make()
        for (let i = 0; i < 3; i++) {
            interrupted.m.frame(16)
            control.m.frame(16)
        }
        interrupted.line.play({
            from: { x: interrupted.line.getCurrentValue()!.x },
        })

        let max = 0
        for (let i = 0; i < 10; i++) {
            interrupted.m.frame(16)
            control.m.frame(16)
            max = Math.max(
                max,
                Math.abs(
                    interrupted.line.getCurrentValue()!.x -
                        control.line.getCurrentValue()!.x
                )
            )
        }
        expect(max).toBeLessThanOrEqual(1e-3)
    })

    it('a velocity seed stays in clock units under maxDuration', () => {
        const m = createManualClock({
            reducedMotion: true,
            lagThreshold: Infinity,
        })
        const slow = ani({
            to: { x: 100 },
            duration: 2,
            timing: T.dynamicSpring({ m: 1, k: 0.001, c: 0.001 }),
        })
        const t = rafTimeline<{ x: number }>(slow, {
            clock: m.clock,
            reducedMotion: { maxDuration: 0.5 },
        })
        t.play({ from: { x: 0 }, velocity: { x: 100 } })
        m.frame(16)

        expect(t.getCurrentVelocity()!.x).toBeCloseTo(100, -1)
    })

    it('maxDuration scales the velocity seen by an interrupting play', () => {
        const m = createManualClock({
            reducedMotion: true,
            lagThreshold: Infinity,
        })
        const t = rafTimeline<{ x: number }>(node(1), {
            clock: m.clock,
            reducedMotion: { maxDuration: 0.5 },
        })
        t.play({ from: { x: 0 } })
        m.frame(100)

        // 100 units per plan second, 2x faster: 200 units per second
        expect(t.getCurrentVelocity()!.x).toBeCloseTo(200, 5)
    })

    it('maxDuration speeds a spring run up (larger dt) without changing duration', async () => {
        const m = createManualClock({
            reducedMotion: true,
            lagThreshold: Infinity,
        })
        const t = rafTimeline<{ x: number }>(spring(), {
            clock: m.clock,
            reducedMotion: { maxDuration: 1 },
        })
        const run = t.play({ from: { x: 0 } })

        m.frames(10, 100)

        expect(t.duration).toBe(2)
        expect(t.status).toBe('ENDED')
        await expect(run).resolves.toBe('ended')
    })

    it('a clock that does not know the preference never reduces motion', () => {
        const subscribed: unknown[] = []
        const clock = {
            subscribe: (animatable: unknown) => subscribed.push(animatable),
            unsubscribe: () => undefined,
        }
        const t = new RafAniTimeline<{ x: number }>(node(), { clock })

        t.play({ from: { x: 0 } })

        expect(t.status).toBe('PLAYING')
        expect(subscribed).toEqual([t])
    })

    it('rejects a malformed policy at construction', () => {
        for (const bad of ['always', 3, null, {}, { maxDuration: '1' }]) {
            const make = () =>
                rafTimeline<{ x: number }>(node(), {
                    reducedMotion: bad as never,
                })
            expect(make).toThrow(/reducedMotion/)
        }
        expect(() =>
            rafTimeline<{ x: number }>(node(), {
                reducedMotion: 'always' as never,
            })
        ).toThrow(TypeError)
    })
})
