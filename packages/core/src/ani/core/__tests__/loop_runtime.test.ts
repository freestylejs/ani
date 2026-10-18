import { describe, expect, it } from 'vitest'
import { rafGroup } from '~/ani/raf/group'
import { rafTimeline } from '~/ani/raf/timeline'
import {
    type AnimationNode,
    ani,
    delay,
    loop,
    parallel,
    sequence,
} from '~/nodes'
import { T } from '~/timing'
import { buildPlan } from '../plan_builder'
import { loopEnd, planLoops } from '../plan_state'
import { ManualClock } from './manual_clock'

type X = { x: number }
type XY = { x: number; y: number }

const linear = T.linear()
const to = (props: Record<string, number>, duration = 1) =>
    ani({ to: props, duration, timing: linear })

function valueAt<G extends Record<string, number>>(
    node: AnimationNode<G>,
    from: G,
    time: number,
    config: Record<string, unknown> = {}
): G {
    const line = rafTimeline(node, new ManualClock())
    line.play({ from, ...config } as never)
    line.seek(time)
    const value = line.getCurrentValue() as G
    line.dispose()
    return value
}

describe('loops represented once', () => {
    it('writes three iterations however large the count is', () => {
        const child = sequence([to({ x: 1 }), to({ x: 0 })])
        for (const count of [4, 1000, 1e6, Infinity]) {
            const built = buildPlan(loop(child, count))
            expect(built.plan).toHaveLength(6)
            expect(built.loops).toHaveLength(1)
        }
        expect(buildPlan(loop(child, 3)).loops).toHaveLength(0)
        expect(buildPlan(loop(child, 3)).plan).toHaveLength(6)
    })

    it('covers the time of every iteration', () => {
        const [region] = buildPlan(loop(to({ x: 1 }, 0.5), 1e6)).loops
        expect(loopEnd(region!)).toBe(5e5)
        expect(buildPlan(loop(to({ x: 1 }, 0.5), 1e6)).plan[2]!.endTime).toBe(
            1.5
        )
    })

    it('plays the last iteration of a big loop and ends there', async () => {
        const clock = new ManualClock()
        const line = rafTimeline<X>(loop(to({ x: 100 }), 1e6), clock)
        const run = line.play({ from: { x: 0 } })
        clock.tick(0.5)
        expect(line.getCurrentValue()!.x).toBeCloseTo(50, 9)
        clock.tick(1e6)
        expect(line.status).toBe('ENDED')
        await expect(run).resolves.toBe('ended')
        expect(line.getCurrentValue()!.x).toBe(100)
    })

    it('ends a folded loop of springs only after its last iteration', async () => {
        const spring = ani({
            to: { x: 100 },
            duration: 0.5,
            timing: T.dynamicSpring({ m: 1, k: 200, c: 30 }),
        })
        const clock = new ManualClock()
        const line = rafTimeline<X>(loop(spring, 6), clock)
        const run = line.play({ from: { x: 0 } })
        // far past one iteration, but before the last
        for (let i = 0; i < 100; i++) clock.tick(1 / 60)
        expect(line.status).toBe('PLAYING')
        for (let i = 0; i < 100; i++) clock.tick(1 / 60)
        expect(line.status).toBe('ENDED')
        await expect(run).resolves.toBe('ended')
    })

    it('nested loops equal the written-out tree', () => {
        const inner = sequence([to({ x: 80 }), to({ y: 30 }, 0.5)])
        const body = sequence([loop(inner, 5), to({ x: 10, y: 5 }, 0.25)])
        const nested = loop(body, 7) as AnimationNode<XY>
        const written = sequence(
            Array.from({ length: 7 }, () =>
                sequence([
                    ...Array.from({ length: 5 }, () => inner),
                    to({ x: 10, y: 5 }, 0.25),
                ])
            )
        ) as AnimationNode<XY>
        const from = { x: 3, y: 9 }
        expect(buildPlan(nested).loops.length).toBeGreaterThan(1)
        for (let i = 0; i < 120; i++) {
            const time = i * 0.4371
            const a = valueAt(nested, from, time)
            const b = valueAt(written, from, time)
            expect(a.x, `x at ${time}`).toBeCloseTo(b.x, 9)
            expect(a.y, `y at ${time}`).toBeCloseTo(b.y, 9)
        }
    })

    it('an endless loop inside a finite one keeps the value of its own iterations', () => {
        const body = sequence([to({ x: 10 }), loop(to({ y: 4 }), Infinity)])
        const node = loop(body, 3) as AnimationNode<XY>
        expect(node.duration).toBe(Infinity)
        const value = valueAt(node, { x: 0, y: 0 }, 1000.5)
        expect(value.x).toBe(10)
        expect(value.y).toBeCloseTo(4, 9)
    })

    it('a delay-only loop keeps its duration', () => {
        const node = sequence([loop(delay(1), 1e6), to({ x: 1 })])
        expect(node.duration).toBe(1e6 + 1)
        expect(valueAt(node, { x: 0 }, 1e6 + 0.5).x).toBeCloseTo(0.5, 9)
        expect(valueAt(node, { x: 0 }, 5e5).x).toBe(0)
    })
})

describe('loops that overlap other segments', () => {
    it('are written out and keep their values', () => {
        const child = sequence([to({ x: 100 }), to({ x: 0 })])
        const looped = parallel([
            loop(child, 9),
            to({ x: 7 }, 20),
        ]) as AnimationNode<X>
        const written = parallel([
            sequence(Array.from({ length: 9 }, () => child)),
            to({ x: 7 }, 20),
        ]) as AnimationNode<X>

        expect(buildPlan(looped).loops).toHaveLength(0)
        expect(buildPlan(looped).plan).toHaveLength(19)
        for (let i = 0; i < 80; i++) {
            const time = i * 0.2371
            expect(valueAt(looped, { x: 1 }, time).x).toBeCloseTo(
                valueAt(written, { x: 1 }, time).x,
                9
            )
        }
    })

    it('stay folded next to segments of other properties', () => {
        const node = parallel([loop(to({ x: 1 }), 50), to({ y: 1 }, 20)])
        expect(planLoops(buildPlan(node).plan)).toHaveLength(1)
    })

    it('stay folded when a segment of the property ends before they start', () => {
        const node = sequence([to({ x: 5 }), loop(to({ x: 1 }), 50)])
        expect(buildPlan(node).loops).toHaveLength(1)
    })
})

describe('overrides address the nodes as written', () => {
    const child = () => sequence([to({ x: 100 }), to({ x: 0 })])

    it('apply one entry to every iteration of a folded loop', () => {
        const node = loop(child(), 50) as AnimationNode<X>
        const keyframes = [{ x: 40 }, { x: 10 }]
        const at = (time: number) =>
            valueAt(node, { x: 0 }, time, { keyframes }).x
        // the first iteration rises from `from`, the others from 10
        expect(at(0.5)).toBeCloseTo(20, 9)
        expect(at(1.5)).toBeCloseTo(25, 9)
        for (const iteration of [1, 2, 30, 49]) {
            const start = iteration * 2
            expect(at(start + 0.5), `iteration ${iteration}`).toBeCloseTo(25, 9)
            expect(at(start + 1), `iteration ${iteration}`).toBeCloseTo(40, 9)
            expect(at(start + 1.5), `iteration ${iteration}`).toBeCloseTo(25, 9)
        }
        expect(at(100)).toBeCloseTo(10, 9)
    })

    it('count the nodes of a loop that runs zero times', () => {
        const node = sequence([loop(to({ x: 1 }), 0), to({ x: 2 })])
        const line = rafTimeline<X>(node, new ManualClock())
        expect(() =>
            line.play({ from: { x: 0 }, keyframes: [{ x: 9 }] })
        ).toThrow(/Expected 2/)
        expect(() =>
            line.play({ from: { x: 0 }, keyframes: ['keep', { x: 9 }] })
        ).not.toThrow()
    })

    it('order the slots by time, like the plan', () => {
        const node = parallel([
            sequence([delay(1), to({ x: 1 })]),
            to({ y: 1 }),
        ]) as AnimationNode<XY>
        const line = rafTimeline<XY>(node, new ManualClock())
        // chronological: the delay and the y segment start at 0, then x
        line.play({
            from: { x: 0, y: 0 },
            keyframes: ['keep', { y: 5 }, { x: 8 }] as never,
        })
        line.seek(1)
        expect(line.getCurrentValue()).toEqual({ x: 0, y: 5 })
        line.seek(2)
        expect(line.getCurrentValue()).toEqual({ x: 8, y: 5 })
    })

    it('write a folded loop out when a duration runs past its iteration', () => {
        const node = loop(to({ x: 100 }), 50) as AnimationNode<X>
        const line = rafTimeline<X>(node, new ManualClock())
        line.play({ from: { x: 0 }, durations: [3] })
        // the segment is cut by the next iteration: 0 -> 1/3 of 100 -> ...
        line.seek(1)
        expect(line.getCurrentValue()!.x).toBeCloseTo(100 / 3, 9)
        line.seek(2)
        expect(line.getCurrentValue()!.x).toBeCloseTo(
            100 / 3 + (100 - 100 / 3) / 3,
            9
        )
        // the last iteration starts at 49 and now lasts 3 s
        expect(line.duration).toBe(52)
    })

    it('reject a duration that runs past the iteration of an endless loop', () => {
        const node = loop(to({ x: 100 }), Infinity) as AnimationNode<X>
        const line = rafTimeline<X>(node, new ManualClock())
        expect(() => line.play({ from: { x: 0 }, durations: [3] })).toThrow(
            RangeError
        )
        expect(line.status).toBe('IDLE')
        // a shorter one is fine
        expect(() =>
            line.play({ from: { x: 0 }, durations: [0.5] })
        ).not.toThrow()
    })
})

describe('endless timelines', () => {
    const endless = () =>
        loop(sequence([to({ x: 100 }), to({ x: 0 })]), Infinity)

    it('refuse drive(): there is no duration to map progress onto', () => {
        const line = rafTimeline<X>(
            endless() as AnimationNode<X>,
            new ManualClock()
        )
        expect(() => line.drive(() => 0.5, { from: { x: 0 } })).toThrow(
            RangeError
        )
        expect(line.status).toBe('IDLE')
    })

    it('seek far beyond 2^53 iterations returns a value of the loop', () => {
        const line = rafTimeline<X>(
            endless() as AnimationNode<X>,
            new ManualClock()
        )
        line.play({ from: { x: 0 } })
        for (const time of [1e16, 1e20, 1e300, Number.MAX_VALUE]) {
            line.seek(time)
            const x = line.getCurrentValue()!.x
            expect(Number.isFinite(x)).toBe(true)
            expect(x).toBeGreaterThanOrEqual(0)
            expect(x).toBeLessThanOrEqual(100)
        }
    })

    it('a group refuses seek(Infinity) and never ends', () => {
        const clock = new ManualClock()
        const group = rafGroup<X>(endless() as AnimationNode<X>, { clock })
        group.play({ from: { x: 0 }, count: 2 })
        expect(() => group.seek(Infinity)).toThrow(RangeError)
        expect(group.status).toBe('PLAYING')
        group.seek(1e7 + 0.25)
        group.resume()
        clock.tick(1)
        expect(group.status).toBe('PLAYING')
        group.dispose()
    })

    it('refuse seek(Infinity) but not a finite time', () => {
        const line = rafTimeline<X>(
            endless() as AnimationNode<X>,
            new ManualClock()
        )
        line.play({ from: { x: 0 } })
        expect(() => line.seek(Infinity)).toThrow(RangeError)
        expect(line.status).toBe('PLAYING')
        line.seek(1e7 + 0.25)
        expect(line.getCurrentValue()!.x).toBeCloseTo(25, 6)
    })

    it('a finite timeline still clamps seek(Infinity) to its end', () => {
        const line = rafTimeline<X>(to({ x: 100 }), new ManualClock())
        line.play({ from: { x: 0 } })
        line.seek(Infinity)
        expect(line.getCurrentValue()!.x).toBe(100)
    })

    it('reduced motion holds the settled state without ending', async () => {
        const node = parallel([endless(), to({ y: 1 }, 2)]) as AnimationNode<XY>
        const clock = Object.assign(new ManualClock(), { reducedMotion: true })
        const line = rafTimeline<XY>(node, clock)
        const seen: string[] = []
        line.onUpdate(({ status }) => {
            seen.push(status)
        })
        const settled: string[] = []
        line.play({ from: { x: 0, y: 0 } }).then((result) => {
            settled.push(result)
        })

        expect(line.getCurrentValue()).toEqual({ x: 0, y: 1 })
        expect(line.status).toBe('PAUSED')
        expect(clock.size).toBe(0)
        expect(seen).toEqual(['PAUSED'])
        await Promise.resolve()
        expect(settled).toEqual([])
        line.reset()
        await Promise.resolve()
        expect(settled).toEqual(['reset'])
    })
})

describe('duration overrides on a loop child', () => {
    const durationOf = (node: AnimationNode<X>, durations: number[]) => {
        const line = rafTimeline<X>(node, new ManualClock())
        line.play({ from: { x: 0 }, durations })
        const duration = line.duration
        line.dispose()
        return duration
    }

    it('end the loop with its last iteration whatever the count', () => {
        const child = () => to({ x: 100 })
        expect(
            [3, 4, 10].map((count) => durationOf(loop(child(), count), [0.5]))
        ).toEqual([2.5, 3.5, 9.5])
    })

    it('equal the written-out sequence', () => {
        const child = to({ x: 100 })
        const written = durationOf(
            sequence([child, child, child, child]),
            [0.5, 0.5, 0.5, 0.5]
        )
        expect(durationOf(loop(child, 4), [0.5])).toBeCloseTo(written, 9)
    })

    it('count the end of a nested loop', () => {
        const node = loop(sequence([loop(to({ x: 100 }), 6), delay(1)]), 5)
        // starts do not move: the last of 5 iterations starts at 4 x 7 = 28
        // and its delay now ends 0.5 s after it starts at 6
        expect(durationOf(node as AnimationNode<X>, [1, 0.5])).toBeCloseTo(
            34.5,
            9
        )
        expect(durationOf(node as AnimationNode<X>, [0.5, 1])).toBeCloseTo(
            35,
            9
        )
    })
})

describe('keyframes overrides that add a shared property', () => {
    const outside = () => sequence([delay(3.5), to({ y: 7 })])

    it('write a folded loop out like the tree written with the new property', () => {
        const looped = parallel([
            loop(to({ x: 100 }), 5),
            outside(),
        ]) as AnimationNode<XY>
        const written = parallel([
            sequence(Array.from({ length: 5 }, () => to({ y: 50 }))),
            outside(),
        ]) as AnimationNode<XY>
        const from = { x: 0, y: 0 }
        for (const time of [0.5, 3.2, 3.7, 4.2, 4.8, 5, 6]) {
            const line = rafTimeline<XY>(looped, new ManualClock())
            line.play({ from, keyframes: [{ y: 50 }, 'keep', 'keep'] as never })
            line.seek(time)
            expect(line.getCurrentValue()!.y, `t=${time}`).toBeCloseTo(
                valueAt(written, from, time).y,
                9
            )
        }
    })

    it('reject it for an endless loop', () => {
        const node = parallel([
            loop(to({ x: 100 }), Infinity),
            outside(),
        ]) as AnimationNode<XY>
        const line = rafTimeline<XY>(node, new ManualClock())
        expect(() =>
            line.play({
                from: { x: 0, y: 0 },
                keyframes: [{ y: 50 }, 'keep', 'keep'] as never,
            })
        ).toThrow(/"y"/)
        expect(line.status).toBe('IDLE')
    })
})
