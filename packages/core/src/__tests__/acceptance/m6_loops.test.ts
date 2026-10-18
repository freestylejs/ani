import { afterEach, describe, expect, it } from 'vitest'
import {
    a,
    type RafTimelineConfig,
    type RunResult,
    rafGroup,
    rafTimeline,
    type TimelineStatus,
} from '../../index'
import type { AnimationNode } from '../../nodes'
import { createManualClock } from '../../testing'

type X = { x: number }
type XY = { x: number; y: number }

const linear = a.timing.linear()

const to = (props: Record<string, number>, duration = 1) =>
    a.ani({ to: props, duration, timing: linear })

/** Two segments of 1 s each: x 0 -> 100, then x 100 -> 0. */
const zigzag = () =>
    a.sequence([to({ x: 100 }), to({ x: 0 })]) as AnimationNode<X>

const timelines: Array<{ dispose(): void }> = []

afterEach(() => {
    for (const line of timelines.splice(0)) line.dispose()
})

/** Timeline on a manual clock; `at(t)` seeks and returns the value there. */
function sampler<G extends Record<string, number>>(
    node: AnimationNode<G>,
    from: G
) {
    const m = createManualClock({ lagThreshold: Infinity })
    const line = rafTimeline<G>(node, { clock: m.clock })
    timelines.push(line)
    line.play({ from } as RafTimelineConfig<G>)
    return {
        m,
        line,
        at(time: number): G {
            line.seek(time)
            return line.getCurrentValue() as G
        },
    }
}

const X0: X = { x: 0 }
const XY0: XY = { x: 0, y: 0 }

function expectSameValues<G extends Record<string, number>>(
    left: AnimationNode<G>,
    right: AnimationNode<G>,
    from: G,
    times: readonly number[]
) {
    const l = sampler(left, from)
    const r = sampler(right, from)
    for (const time of times) {
        const lv = l.at(time)
        const rv = r.at(time)
        for (const key of Object.keys(rv)) {
            expect(lv[key], `${key} at ${time}`).toBeCloseTo(rv[key]!, 9)
        }
    }
}

const sweep = (count: number, step: number) =>
    Array.from({ length: count }, (_, i) => i * step)

describe('M6: equivalence with the flattened tree', () => {
    it('A1: loop(child, 3) equals sequence([child, child, child]) at 60 times', () => {
        const child = zigzag()
        const looped = a.loop(child, 3)
        const written = a.sequence([child, child, child])
        const times = sweep(60, 0.1013)
        expect(times[59]).toBeLessThan(6)

        expectSameValues(looped, written, X0, times)
        expectSameValues(looped, written, { x: 37 }, times)

        const l = sampler(looped, X0)
        const w = sampler(written, X0)
        expect(l.at(6).x).toBeCloseTo(w.at(6).x, 9)
        expect(looped.duration).toBe(6)
        expect(l.line.duration).toBe(6)
    })

    it('A1: both end at the same value when played to the end', async () => {
        const child = to({ x: 100 })
        const finals: number[] = []
        for (const node of [
            a.loop(child, 3),
            a.sequence([child, child, child]),
        ]) {
            const m = createManualClock({ lagThreshold: Infinity })
            const line = rafTimeline<X>(node, { clock: m.clock })
            timelines.push(line)
            const run = line.play({ from: X0 })
            m.frames(7, 500)
            expect(line.status).toBe('ENDED')
            await expect(run).resolves.toBe('ended')
            finals.push(line.getCurrentValue()!.x)
        }
        expect(finals[0]).toBeCloseTo(finals[1]!, 9)
        expect(finals[0]).toBeCloseTo(100, 9)
    })

    it('A1: a loop after a segment on the same property starts from its value', () => {
        const child = zigzag()
        const lead = to({ x: 50 })
        expectSameValues(
            a.sequence([lead, a.loop(child, 4)]),
            a.sequence([lead, child, child, child, child]),
            X0,
            sweep(50, 0.2017)
        )
    })

    it('A1: nested loops equal the written-out tree', () => {
        const inner = a.sequence([to({ x: 80 }), to({ y: 30 }, 0.5)])
        const nested = a.loop(
            a.sequence([a.loop(inner, 2), to({ x: 10, y: 5 }, 0.25)]),
            3
        ) as AnimationNode<XY>
        const round = a.sequence([
            inner,
            inner,
            to({ x: 10, y: 5 }, 0.25),
        ]) as AnimationNode<XY>
        const written = a.sequence([round, round, round])
        expectSameValues(nested, written, XY0, sweep(60, 0.1117))
    })

    it('A1: a loop beside a loop on other properties equals the written-out tree', () => {
        const left = zigzag()
        const right = a.sequence([to({ y: 40 }, 0.5), to({ y: 0 }, 0.5)])
        expectSameValues(
            a.parallel([a.loop(left, 3), a.loop(right, 5)]),
            a.parallel([
                a.sequence([left, left, left]),
                a.sequence([right, right, right, right, right]),
            ]) as AnimationNode<XY>,
            XY0,
            sweep(60, 0.1031)
        )
    })

    it('A1: loop(child, 0) is valid and has no duration', () => {
        const none = a.loop(zigzag(), 0)
        expect(none.duration).toBe(0)
    })
})

describe('M6: loop(child, Infinity)', () => {
    it('A2: the value repeats with the period of the child', () => {
        const s = sampler(a.loop(zigzag(), Infinity), X0)
        const at = (time: number) => s.at(time).x

        expect(at(0.5)).toBeCloseTo(50, 9)
        expect(at(1000.5)).toBeCloseTo(at(0.5), 9)
        expect(at(1001.5)).toBeCloseTo(at(1.5), 9)
        expect(at(1000.25)).toBeCloseTo(25, 9)
        expect(at(1e9 + 0.5)).toBeCloseTo(50, 6)
        expect(at(2)).toBeCloseTo(0, 9)
        expect(at(1000.75)).toBeCloseTo(75, 9)
    })

    it('A2: playing 1000.5 s of frames shows the same value as 0.5 s', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<X>(a.loop(zigzag(), Infinity), {
            clock: m.clock,
        })
        timelines.push(line)
        line.play({ from: X0 })

        m.frame(500)
        expect(line.getCurrentValue()!.x).toBeCloseTo(50, 9)
        m.frames(2000, 500)
        expect(line.getCurrentValue()!.x).toBeCloseTo(50, 9)
        expect(line.status).toBe('PLAYING')
    })

    it('A2: the status stays PLAYING after 10 000 frames and ENDED is never emitted', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<X>(a.loop(zigzag(), Infinity), {
            clock: m.clock,
        })
        timelines.push(line)
        const statuses = new Set<TimelineStatus>()
        line.onUpdate(({ status }) => {
            statuses.add(status)
        })
        line.play({ from: X0 })

        m.frames(10_000, 100)

        expect(line.status).toBe('PLAYING')
        expect(statuses.has('ENDED')).toBe(false)
        expect(m.clock.size).toBe(1)
        expect(line.getCurrentValue()!.x).toBeCloseTo(0, 3)
    })

    it('A2: duration is Infinity', () => {
        const infinite = a.loop(zigzag(), Infinity)
        expect(infinite.duration).toBe(Infinity)
        const line = rafTimeline<X>(infinite, {
            clock: createManualClock().clock,
        })
        expect(line.duration).toBe(Infinity)
        line.dispose()
    })

    it('A2: play() stays pending until reset() resolves it "reset"', async () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<X>(a.loop(zigzag(), Infinity), {
            clock: m.clock,
        })
        timelines.push(line)
        const settled: RunResult[] = []
        const run = line.play({ from: X0 })
        run.then((result) => {
            settled.push(result)
        })

        m.frames(10_000, 100)
        await Promise.resolve()
        await Promise.resolve()
        expect(settled).toEqual([])

        line.reset()
        await expect(run).resolves.toBe('reset')
        expect(line.status).toBe('IDLE')
        expect(m.clock.size).toBe(0)
    })

    it('A2: dispose() and an interrupting play() settle the pending run', async () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<X>(a.loop(zigzag(), Infinity), {
            clock: m.clock,
        })
        timelines.push(line)
        const first = line.play({ from: X0 })
        m.frames(10, 100)
        const second = line.play({ from: X0 })
        await expect(first).resolves.toBe('interrupted')

        m.frames(10, 100)
        line.dispose()
        await expect(second).resolves.toBe('disposed')
        expect(m.clock.size).toBe(0)
    })

    it('A2: repeat is ignored', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<X>(a.loop(zigzag(), Infinity), {
            clock: m.clock,
        })
        timelines.push(line)
        line.play({ from: X0, repeat: 2 })
        m.frames(2001, 500)
        expect(line.status).toBe('PLAYING')
        expect(line.duration).toBe(Infinity)
        expect(line.getCurrentValue()!.x).toBeCloseTo(50, 9)
    })

    it('A2: seek accepts any finite t and the iteration-local time decides', () => {
        const s = sampler(a.loop(zigzag(), Infinity), X0)
        expect(s.at(1e6 + 0.5).x).toBeCloseTo(50, 6)
        expect(s.at(0).x).toBeCloseTo(0, 9)
        expect(s.line.status).toBe('PAUSED')
        s.line.seek(12345.5)
        expect(s.line.status).toBe('PAUSED')
        expect(s.line.getCurrentValue()!.x).toBeCloseTo(50, 9)
    })

    it('A2: the first iteration starts from the value at the region start, later ones from the end state', () => {
        const node = a.sequence([
            to({ x: 50 }),
            a.loop(zigzag(), Infinity),
        ]) as AnimationNode<X>
        const s = sampler(node, X0)
        const finite = sampler(
            a.sequence([
                to({ x: 50 }),
                a.loop(zigzag(), 600),
            ]) as AnimationNode<X>,
            X0
        )

        expect(node.duration).toBe(Infinity)
        expect(s.at(0.5).x).toBeCloseTo(25, 9)
        expect(s.at(1.5).x).toBeCloseTo(75, 9)
        expect(s.at(2).x).toBeCloseTo(100, 9)
        expect(s.at(3).x).toBeCloseTo(0, 9)
        expect(s.at(3.5).x).toBeCloseTo(50, 9)
        expect(s.at(1001.5).x).toBeCloseTo(50, 9)

        for (const time of sweep(40, 0.9137)) {
            expect(s.at(time).x).toBeCloseTo(finite.at(time).x, 9)
        }
    })

    it('A2: a loop in a parallel starting later matches the big finite loop', () => {
        const build = (count: number) =>
            a.parallel([
                to({ x: 5 }),
                a.sequence([a.delay(2), a.loop(zigzag(), count)]),
            ]) as AnimationNode<X>
        const infinite = sampler(build(Infinity), X0)
        const finite = sampler(build(50), X0)
        for (const time of sweep(50, 1.7311)) {
            expect(infinite.at(time).x).toBeCloseTo(finite.at(time).x, 9)
        }
    })

    it('A2: loop(infinite, n) and loop(infinite, Infinity) are just infinite', () => {
        const inner = a.loop(zigzag(), Infinity)
        const outer = a.loop(inner, 3)
        const outerInfinite = a.loop(inner, Infinity)
        expect(outer.duration).toBe(Infinity)
        expect(outerInfinite.duration).toBe(Infinity)

        const s = sampler(outer, X0)
        expect(s.at(1000.5).x).toBeCloseTo(50, 9)
    })

    it('A2: every ancestor that contains the loop in time is infinite', () => {
        const infinite = a.loop(zigzag(), Infinity)
        expect(a.sequence([to({ x: 1 }), infinite]).duration).toBe(Infinity)
        expect(a.sequence([infinite]).duration).toBe(Infinity)
        expect(a.parallel([infinite, to({ y: 1 })]).duration).toBe(Infinity)
        expect(a.parallel([to({ y: 1 }), infinite]).duration).toBe(Infinity)
        expect(
            a.parallel([a.sequence([to({ y: 1 }), infinite]), to({ z: 1 }, 5)])
                .duration
        ).toBe(Infinity)
        expect(a.loop(a.sequence([to({ y: 1 }), infinite]), 2).duration).toBe(
            Infinity
        )
    })

    it('A2: rafGroup offsets work as usual for an infinite loop', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const group = rafGroup<X>(a.loop(zigzag(), Infinity), {
            clock: m.clock,
            stagger: 0.5,
        })
        group.play({ from: X0, count: 3 })
        expect(group.duration).toBe(Infinity)

        group.seek(0.25)
        expect(group.valueAt(0)!.x).toBeCloseTo(25, 9)
        expect(group.valueAt(1)!.x).toBeCloseTo(0, 9)
        expect(group.valueAt(2)!.x).toBeCloseTo(0, 9)

        group.seek(1000.75)
        expect(group.valueAt(0)!.x).toBeCloseTo(75, 9)
        expect(group.valueAt(1)!.x).toBeCloseTo(25, 9)
        expect(group.valueAt(2)!.x).toBeCloseTo(25, 9)

        group.resume()
        m.frames(200, 500)
        expect(group.status).toBe('PLAYING')
        group.dispose()
        expect(m.clock.size).toBe(0)
    })
})

describe('M6: unreachable and parallel with an infinite loop', () => {
    it('A3: a sequence child after an infinite loop throws RangeError', () => {
        const infinite = a.loop(zigzag(), Infinity)
        expect(() => a.sequence([infinite, to({ y: 1 })])).toThrow(RangeError)
        expect(() => a.sequence([infinite, to({ y: 1 })])).toThrow(
            /unreachable/i
        )
        expect(() => a.sequence([to({ x: 1 }), infinite, a.delay(1)])).toThrow(
            RangeError
        )
    })

    it('A3: the rule holds through nested containers and loop(infinite, n)', () => {
        const infinite = a.loop(zigzag(), Infinity)
        expect(() =>
            a.sequence([a.sequence([infinite]), to({ y: 1 })])
        ).toThrow(RangeError)
        expect(() => a.sequence([a.loop(infinite, 3), to({ y: 1 })])).toThrow(
            RangeError
        )
        expect(() =>
            a.sequence([a.parallel([infinite, to({ y: 1 })]), to({ z: 1 })])
        ).toThrow(RangeError)
    })

    it('A3: an infinite loop as the last child of a sequence is valid', () => {
        const infinite = a.loop(zigzag(), Infinity)
        expect(() => a.sequence([to({ y: 1 }), infinite])).not.toThrow()
        expect(() => a.sequence([infinite])).not.toThrow()
    })

    it('A3: parallel([loop(child, Infinity), other]) is valid and other completes while the loop continues', () => {
        const node = a.parallel([
            a.loop(zigzag(), Infinity),
            to({ y: 1 }, 2),
        ]) as AnimationNode<XY>
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<XY>(node, { clock: m.clock })
        timelines.push(line)
        const statuses = new Set<TimelineStatus>()
        line.onUpdate(({ status }) => {
            statuses.add(status)
        })
        const settled: RunResult[] = []
        line.play({ from: XY0 }).then((result) => {
            settled.push(result)
        })

        m.frame(1000)
        expect(line.getCurrentValue()!.y).toBeCloseTo(0.5, 9)
        expect(line.getCurrentValue()!.x).toBeCloseTo(100, 9)

        m.frame(2500)
        expect(line.getCurrentValue()!.y).toBeCloseTo(1, 9)
        expect(line.getCurrentValue()!.x).toBeCloseTo(50, 9)
        expect(line.status).toBe('PLAYING')

        m.frames(100, 1000)
        expect(line.getCurrentValue()!.y).toBeCloseTo(1, 9)
        expect(line.status).toBe('PLAYING')
        expect(statuses.has('ENDED')).toBe(false)
        expect(settled).toEqual([])
        expect(line.duration).toBe(Infinity)
    })

    it('A3: parallel with the infinite loop last is valid too', () => {
        expect(() =>
            a.parallel([to({ y: 1 }, 2), a.loop(zigzag(), Infinity)])
        ).not.toThrow()
    })
})

describe('M6: count validation', () => {
    it('A5: invalid counts throw RangeError', () => {
        for (const bad of [-1, 1.5, Number.NaN, -Infinity, '3']) {
            const make = () => a.loop(zigzag(), bad as never)
            expect(make, String(bad)).toThrow(RangeError)
        }
        expect(() => a.loop(zigzag(), undefined as never)).toThrow(RangeError)
        expect(() => a.loop(zigzag(), null as never)).toThrow(RangeError)
        expect(() => a.loop(zigzag(), 2.0000001)).toThrow(RangeError)
    })

    it('A5: the message names the loop and the received value', () => {
        expect(() => a.loop(zigzag(), 1.5)).toThrow(/\[loop\]/)
        expect(() => a.loop(zigzag(), 1.5)).toThrow(/1\.5/)
    })

    it('A5: 0, finite integers and Infinity are accepted', () => {
        expect(() => a.loop(zigzag(), 0)).not.toThrow()
        expect(() => a.loop(zigzag(), 1)).not.toThrow()
        expect(() => a.loop(zigzag(), 1e6)).not.toThrow()
        expect(() => a.loop(zigzag(), Infinity)).not.toThrow()
        expect(a.loop(zigzag(), 4).count).toBe(4)
        expect(a.loop(zigzag(), Infinity).count).toBe(Infinity)
    })
})

describe('M6: constant cost', () => {
    const median = (values: number[]) =>
        [...values].sort((l, r) => l - r)[Math.floor(values.length / 2)]!

    function buildTime(count: number): number {
        const m = createManualClock({ lagThreshold: Infinity })
        const samples: number[] = []
        for (let i = 0; i < 5; i++) {
            const start = performance.now()
            const line = rafTimeline<X>(a.loop(zigzag(), count), {
                clock: m.clock,
            })
            samples.push(performance.now() - start)
            line.dispose()
        }
        return median(samples)
    }

    it('A4: loop(child, 1e6) builds, plays and seeks like the first iterations', () => {
        const node = a.loop(zigzag(), 1e6)
        expect(node.duration).toBe(2e6)

        const s = sampler(node, X0)
        expect(s.line.duration).toBe(2e6)
        expect(s.at(3.5).x).toBeCloseTo(50, 9)
        expect(s.at(999_999.5).x).toBeCloseTo(s.at(3.5).x, 9)
        expect(s.at(999_999.5).x).toBeCloseTo(50, 9)
        expect(s.at(1_999_999.25).x).toBeCloseTo(75, 6)
        expect(s.at(2e6).x).toBeCloseTo(0, 9)
    })

    it('A4: building loop(child, 1e6) is not slower than 2x building loop(child, 2)', () => {
        const small = buildTime(2)
        const big = buildTime(1e6)
        expect(big).toBeLessThanOrEqual(Math.max(2 * small, 5))
    })

    it('A4: loop(child, 1e6) plays frames on the clock', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<X>(a.loop(zigzag(), 1e6), { clock: m.clock })
        timelines.push(line)
        line.play({ from: X0 })
        m.frames(7, 500)
        expect(line.status).toBe('PLAYING')
        expect(line.getCurrentValue()!.x).toBeCloseTo(50, 9)
    })
})

describe('M6: overrides count the loop child once', () => {
    it('A6: keyframes [{ x: 50 }] targets 50 in every iteration', () => {
        const node = a.loop(to({ x: 100 }), 3)
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<X>(node, { clock: m.clock })
        timelines.push(line)
        line.play({ from: X0, keyframes: [{ x: 50 }] })

        const at = (time: number) => {
            line.seek(time)
            return line.getCurrentValue()!.x
        }
        expect(at(0.5)).toBeCloseTo(25, 9)
        expect(at(1)).toBeCloseTo(50, 9)
        expect(at(1.5)).toBeCloseTo(50, 9)
        expect(at(2)).toBeCloseTo(50, 9)
        expect(at(2.5)).toBeCloseTo(50, 9)
        expect(at(3)).toBeCloseTo(50, 9)
        expect(line.duration).toBe(3)
    })

    it('A6: the slot after a loop is the next node as written', () => {
        const node = a.sequence([
            a.loop(to({ x: 100 }), 2),
            to({ x: 0 }),
        ]) as AnimationNode<X>
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<X>(node, { clock: m.clock })
        timelines.push(line)
        line.play({ from: X0, keyframes: [{ x: 10 }, { x: 20 }] })

        const at = (time: number) => {
            line.seek(time)
            return line.getCurrentValue()!.x
        }
        expect(at(1)).toBeCloseTo(10, 9)
        expect(at(2)).toBeCloseTo(10, 9)
        expect(at(2.5)).toBeCloseTo(15, 9)
        expect(at(3)).toBeCloseTo(20, 9)
    })

    it('A6: "keep" keeps the written target for all iterations', () => {
        const node = a.sequence([
            a.loop(to({ x: 100 }), 2),
            to({ x: 0 }),
        ]) as AnimationNode<X>
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<X>(node, { clock: m.clock })
        timelines.push(line)
        line.play({ from: X0, keyframes: ['keep', { x: 20 }] })

        const at = (time: number) => {
            line.seek(time)
            return line.getCurrentValue()!.x
        }
        expect(at(1)).toBeCloseTo(100, 9)
        expect(at(2)).toBeCloseTo(100, 9)
        expect(at(3)).toBeCloseTo(20, 9)
    })

    it('A6: the override arrays have one entry per node as written', () => {
        const node = a.loop(to({ x: 100 }), 3)
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<X>(node, { clock: m.clock })
        timelines.push(line)

        expect(() =>
            line.play({ from: X0, keyframes: [{ x: 1 }, { x: 2 }, { x: 3 }] })
        ).toThrow()
        expect(() =>
            line.play({ from: X0, durations: ['keep', 'keep', 'keep'] })
        ).toThrow()
        expect(() => line.play({ from: X0, keyframes: [] })).toThrow()
        expect(() =>
            line.play({ from: X0, keyframes: ['keep'], durations: ['keep'] })
        ).not.toThrow()
    })

    it('A6: an infinite loop child counts once as well', () => {
        const node = a.parallel([
            a.loop(to({ x: 100 }), Infinity),
            to({ y: 1 }, 2),
        ]) as AnimationNode<XY>
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<XY>(node, { clock: m.clock })
        timelines.push(line)
        // partial targets: each slot replaces the `to` of its node
        line.play({
            from: XY0,
            keyframes: [{ x: 50 }, { y: 4 }] as unknown as XY[],
        })

        line.seek(1000.5)
        expect(line.getCurrentValue()!.x).toBeCloseTo(50, 9)
        expect(line.getCurrentValue()!.y).toBeCloseTo(4, 9)
    })
})

describe('M6: shared properties', () => {
    it('A7: an infinite loop overlapping an outside segment on the same property throws RangeError', () => {
        const make = () =>
            a.parallel([a.loop(to({ x: 100 }), Infinity), to({ x: 5 }, 3)])
        expect(make).toThrow(RangeError)
        expect(make).toThrow(/\bx\b/)
    })

    it('A7: the order of the children does not matter', () => {
        expect(() =>
            a.parallel([to({ x: 5 }, 3), a.loop(to({ x: 100 }), Infinity)])
        ).toThrow(RangeError)
    })

    it('A7: the message names the property that is shared', () => {
        const make = () =>
            a.parallel([
                a.loop(to({ opacity: 1, translateX: 100 }), Infinity),
                to({ translateX: 5 }, 3),
            ])
        expect(make).toThrow(RangeError)
        expect(make).toThrow(/translateX/)
    })

    it('A7: a sibling on another property is fine', () => {
        expect(() =>
            a.parallel([a.loop(to({ x: 100 }), Infinity), to({ y: 5 }, 3)])
        ).not.toThrow()
    })

    it('A7: an overlap created by an outer parallel throws at that parallel', () => {
        const inner = a.sequence([
            to({ y: 1 }),
            a.loop(to({ x: 100 }), Infinity),
        ])
        expect(() => a.parallel([inner, to({ x: 5 }, 3)])).toThrow(RangeError)
    })

    it('A7: the same tree with a finite count keeps working and matches its sequence equivalent', () => {
        const child = to({ x: 100 })
        const looped = a.parallel([
            a.loop(child, 3),
            to({ x: 5 }, 3),
        ]) as AnimationNode<X>
        const written = a.parallel([
            a.sequence([child, child, child]),
            to({ x: 5 }, 3),
        ]) as AnimationNode<X>

        expect(looped.duration).toBe(3)
        expectSameValues(looped, written, X0, sweep(40, 0.0773))
        expectSameValues(looped, written, { x: 60 }, sweep(40, 0.0773))
    })

    it('A7: a finite loop overlapping a longer outside segment keeps working', () => {
        const child = zigzag()
        const looped = a.parallel([
            a.loop(child, 2),
            to({ x: 7 }, 3),
        ]) as AnimationNode<X>
        const written = a.parallel([
            a.sequence([child, child]),
            to({ x: 7 }, 3),
        ]) as AnimationNode<X>
        expectSameValues(looped, written, X0, sweep(40, 0.0991))
    })
})

describe('M6: dynamic springs in a periodic loop', () => {
    const springy = () =>
        a.sequence([
            a.ani({
                to: { x: 100 },
                duration: 1,
                timing: a.timing.dynamicSpring({ m: 1, k: 120, c: 6 }),
            }),
            a.ani({
                to: { x: 0 },
                duration: 1,
                timing: a.timing.dynamicSpring({ m: 1, k: 80, c: 4 }),
            }),
        ]) as AnimationNode<X>

    const locals = [0.05, 0.1, 0.37, 0.5, 0.93, 1.0, 1.2, 1.5, 1.77, 1.99]

    it('A8: iterations 1, 5 and 50 agree at the same iteration-local time', () => {
        const s = sampler(a.loop(springy(), Infinity), X0)
        // out of order on purpose: seeking is deterministic
        const late = locals.map((local) => s.at(2 * 50 + local).x)
        const early = locals.map((local) => s.at(2 * 1 + local).x)
        const mid = locals.map((local) => s.at(2 * 5 + local).x)
        for (let i = 0; i < locals.length; i++) {
            expect(early[i]!, `local ${locals[i]}`).toBeCloseTo(mid[i]!, 9)
            expect(early[i]!, `local ${locals[i]}`).toBeCloseTo(late[i]!, 9)
        }
        expect(Math.max(...early)).toBeGreaterThan(10)
    })

    it('A8: they equal the flattened equivalent for a finite count', () => {
        const child = springy()
        const looped = a.loop(child, 60)
        const written = a.sequence(Array.from({ length: 60 }, () => child))
        const times = [1, 5, 50].flatMap((iteration) =>
            locals.map((local) => 2 * iteration + local)
        )
        expectSameValues(
            looped as AnimationNode<X>,
            written as AnimationNode<X>,
            X0,
            times
        )
    })

    it('A8: the infinite loop equals the big finite loop at the same times', () => {
        const child = springy()
        const infinite = sampler(a.loop(child, Infinity), { x: 20 })
        const finite = sampler(a.loop(child, 60), { x: 20 })
        for (const time of [0.2, 0.9, 1.4, 2.3, 10.7, 99.35, 100.6]) {
            expect(infinite.at(time).x, `t ${time}`).toBeCloseTo(
                finite.at(time).x,
                9
            )
        }
    })

    it('A8: playing frames gives the same value as seeking', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline<X>(a.loop(springy(), Infinity), {
            clock: m.clock,
        })
        timelines.push(line)
        line.play({ from: X0 })
        m.frames(100 * 4 + 1, 250)
        const played = line.getCurrentValue()!.x
        const s = sampler(a.loop(springy(), Infinity), X0)
        expect(played).toBeCloseTo(s.at(100.25).x, 9)
    })
})

describe('M6: reduced motion', () => {
    const tree = () =>
        a.parallel([
            a.loop(a.sequence([to({ x: 100 }), to({ x: 40 })]), Infinity),
            to({ y: 1 }, 2),
        ]) as AnimationNode<XY>

    it("A10: 'jump' shows y = 1 and the end of the first iteration of the loop, at once", () => {
        const m = createManualClock({
            reducedMotion: true,
            lagThreshold: Infinity,
        })
        const line = rafTimeline<XY>(tree(), { clock: m.clock })
        timelines.push(line)

        line.play({ from: XY0 })

        const value = line.getCurrentValue()!
        expect(value.y).toBeCloseTo(1, 9)
        expect(value.x).toBeCloseTo(40, 9)
        expect(line.duration).toBe(Infinity)

        m.frames(3, 1000)
        expect(line.getCurrentValue()!.x).toBeCloseTo(40, 9)
        expect(line.getCurrentValue()!.y).toBeCloseTo(1, 9)
    })

    it("A10: 'jump' is the default and can be given explicitly", () => {
        const m = createManualClock({
            reducedMotion: true,
            lagThreshold: Infinity,
        })
        const line = rafTimeline<XY>(tree(), {
            clock: m.clock,
            reducedMotion: 'jump',
        })
        timelines.push(line)

        line.play({ from: XY0 })

        expect(line.getCurrentValue()!.x).toBeCloseTo(40, 9)
        expect(line.getCurrentValue()!.y).toBeCloseTo(1, 9)
    })

    it("A10: 'jump' applies to the first iteration of a loop that follows a segment", () => {
        const node = a.sequence([
            to({ x: 50 }),
            a.loop(zigzag(), Infinity),
        ]) as AnimationNode<X>
        const m = createManualClock({
            reducedMotion: true,
            lagThreshold: Infinity,
        })
        const line = rafTimeline<X>(node, { clock: m.clock })
        timelines.push(line)

        line.play({ from: X0 })

        expect(line.getCurrentValue()!.x).toBeCloseTo(0, 9)
    })

    it('A10: { maxDuration } does not apply to an infinite run', () => {
        const m = createManualClock({
            reducedMotion: true,
            lagThreshold: Infinity,
        })
        const line = rafTimeline<XY>(tree(), {
            clock: m.clock,
            reducedMotion: { maxDuration: 0.25 },
        })
        timelines.push(line)

        line.play({ from: XY0 })

        expect(line.status).toBe('PLAYING')
        expect(line.getCurrentValue()!.x).toBeCloseTo(0, 9)
        m.frame(1000)
        expect(line.getCurrentValue()!.x).toBeCloseTo(100, 9)
        expect(line.getCurrentValue()!.y).toBeCloseTo(0.5, 9)
        expect(line.status).toBe('PLAYING')
        m.frame(1000)
        expect(line.getCurrentValue()!.x).toBeCloseTo(40, 9)
        expect(line.getCurrentValue()!.y).toBeCloseTo(1, 9)
    })
})
