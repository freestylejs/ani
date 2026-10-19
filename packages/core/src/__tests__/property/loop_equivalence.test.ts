import { describe, expect, it } from 'vitest'
import type { ExecutionPlan, Groupable } from '~/ani/core'
import { buildPlan } from '~/ani/core/plan_builder'
import { compilePlan, PlanRuntime } from '~/ani/core/plan_runtime'
import { type AnimationNode, ani, loop, sequence } from '~/nodes'
import { timing } from '~/timing'
import type { AnimationRecord, TreeOptions } from './gen'
import { caseMessage, generateTree, mulberry32, type Rng } from './gen'
import { planDuration } from './helpers'

/**
 * P7: a loop represented once (periodic) is the loop written out `count`
 * times (flattened): both evaluate to the same values at every time, springs
 * included, whatever the order the times are visited in.
 *
 * Every timing is compared at 1e-9 (relative to the value): the two forms read
 * times an ulp apart, and no timing, bezier included, turns that into more.
 */

const CASES = 300
const BASE_SEED = 0xa47001
const ENDLESS_CASES = 150
const ENDLESS_SEED = 0xa47801
const TOLERANCE = 1e-9
/** Finite twin of an endless loop: far more iterations than the test visits. */
const TWIN_COUNT = 400
/** Endless twins are compared up to this many seconds (the shortest period is 0.05 s). */
const TWIN_HORIZON = 15

interface Boundary {
    startTime: number
    period: number
    count: number
}

function runtimeOf(
    plan: ExecutionPlan<AnimationRecord>,
    keys: readonly string[],
    from: AnimationRecord
): PlanRuntime {
    return new PlanRuntime(
        compilePlan(plan as ExecutionPlan<Groupable>, keys, keys.length),
        keys.map((key) => from[key]!)
    )
}

/** A random time in `[0, max)`, a multiple of 1/4096 s on a grid. */
function randomTime(rng: Rng, max: number, grid: boolean): number {
    const time = rng.range(0, max)
    return grid ? Math.round(time * 4096) / 4096 : time
}

function visit(
    rng: Rng,
    duration: number,
    loops: readonly Boundary[],
    grid: boolean
) {
    const times = [0, duration]
    for (let i = 0; i < 12; i++) times.push(randomTime(rng, duration, grid))
    // loop boundaries are where the periodic form switches iterations; the
    // exact boundary is ill-conditioned (sums of the child's durations and
    // `k * period` differ by an ulp), so the neighbourhood is visited instead
    for (const loop of loops) {
        for (const k of [1, 2, 3, 4, loop.count - 1, loop.count]) {
            const at = loop.startTime + k * loop.period
            if (at > duration) continue
            times.push(at - 1e-7, at + 1e-7)
        }
    }
    // visit in a shuffled order: values may not depend on the history
    for (let i = times.length - 1; i > 0; i--) {
        const j = rng.int(0, i)
        ;[times[i], times[j]] = [times[j]!, times[i]!]
    }
    return times
}

function expectSame(
    left: PlanRuntime,
    right: PlanRuntime,
    keys: readonly string[],
    time: number,
    seed: number
) {
    left.evaluate(time, 0)
    right.evaluate(time, 0)
    for (let k = 0; k < keys.length; k++) {
        const a = left.values[k]!
        const b = right.values[k]!
        expect(
            Math.abs(a - b),
            caseMessage(seed, `t=${time} key "${keys[k]}": ${a} vs ${b}`)
        ).toBeLessThanOrEqual(TOLERANCE * Math.max(1, Math.abs(b)))
    }
}

describe('P7: periodic loops equal their flattened form', () => {
    it.each<[string, TreeOptions]>([
        ['times on a grid', { gridTimes: true }],
        ['any times', {}],
    ])('agree at random times and at iteration boundaries: %s (300 trees)', (_, options) => {
        let folded = 0
        for (let i = 0; i < CASES; i++) {
            const seed = BASE_SEED + i
            const rng = mulberry32(seed)
            const { node, keys, from } = generateTree(rng, options)
            const periodic = buildPlan(node)
            const flat = buildPlan(node, { expandAll: true })
            if (periodic.loops.length > 0) folded++

            const duration = planDuration(flat.plan)
            const left = runtimeOf(periodic.plan, keys, from)
            const right = runtimeOf(flat.plan, keys, from)
            const grid = options.gridTimes === true
            for (const time of visit(rng, duration, periodic.loops, grid)) {
                expectSame(left, right, keys, time, seed)
            }
        }
        // the generator really produces folded loops
        expect(folded).toBeGreaterThan(CASES / 10)
    })

    it.each([
        50, 500, 2000,
    ])('eased loops of %i iterations with durations that are not dyadic', (count) => {
        const rng = mulberry32(BASE_SEED + count)
        for (let trial = 0; trial < 10; trial++) {
            const node = loop(
                sequence([
                    ani({
                        to: { x: 300, y: -200 },
                        duration: rng.range(0.1, 0.6),
                        timing: timing.ease(),
                    }),
                    ani({
                        to: { x: -400, y: 500 },
                        duration: rng.range(0.1, 0.7),
                        timing: timing.easeInOut(),
                    }),
                ]),
                count
            )
            const keys = ['x', 'y']
            const from = { x: 12, y: -7 }
            const left = runtimeOf(buildPlan(node).plan, keys, from)
            const right = runtimeOf(
                buildPlan(node, { expandAll: true }).plan,
                keys,
                from
            )
            for (let i = 0; i < 100; i++) {
                const time = randomTime(rng, node.duration, false)
                expectSame(left, right, keys, time, BASE_SEED + count)
            }
        }
    })

    it('writes no more segments than the flattened form', () => {
        for (let i = 0; i < 50; i++) {
            const seed = BASE_SEED + 5000 + i
            const { node } = generateTree(mulberry32(seed))
            const periodic = buildPlan(node)
            const flat = buildPlan(node, { expandAll: true })
            expect(
                periodic.plan.length,
                caseMessage(seed, 'size')
            ).toBeLessThanOrEqual(flat.plan.length)
        }
    })
})

/** Twin trees from one seed: endless loops, and loops of `TWIN_COUNT`. */
function twins(seed: number, options: TreeOptions) {
    for (let attempt = 0; attempt < 200; attempt++) {
        const at = seed + attempt * 7919
        try {
            const endless = generateTree(mulberry32(at), {
                ...options,
                endlessCount: Infinity,
            })
            const finite = generateTree(mulberry32(at), {
                ...options,
                endlessCount: TWIN_COUNT,
            })
            return { endless, finite, seed: at }
        } catch (error) {
            // an endless loop placed where the rules reject it: try another tree
            if (!(error instanceof RangeError)) throw error
        }
    }
    throw new Error(caseMessage(seed, 'no valid endless tree'))
}

function endlessLoops(node: AnimationNode<AnimationRecord>): number {
    return buildPlan(node).loops.filter((loop) => loop.count === Infinity)
        .length
}

describe('P7: endless loops equal a very large finite count', () => {
    it.each<[string, TreeOptions]>([
        ['times on a grid', { gridTimes: true }],
        ['any times', {}],
    ])('agree before the finite twin ends: %s (150 trees)', (_, options) => {
        let endlessSeen = 0
        for (let i = 0; i < ENDLESS_CASES; i++) {
            const { endless, finite, seed } = twins(
                ENDLESS_SEED + i * 31,
                options
            )
            const isEndless = endlessLoops(endless.node) > 0
            endlessSeen += isEndless ? 1 : 0
            if (isEndless) expect(endless.node.duration).toBe(Infinity)

            const rng = mulberry32(seed)
            const left = runtimeOf(
                buildPlan(endless.node).plan,
                endless.keys,
                endless.from
            )
            const right = runtimeOf(
                buildPlan(finite.node).plan,
                finite.keys,
                finite.from
            )
            const horizon = Math.min(TWIN_HORIZON, finite.node.duration)
            const times = [0, horizon]
            const grid = options.gridTimes === true
            for (let j = 0; j < 20; j++) {
                times.push(randomTime(rng, horizon, grid))
            }
            for (const time of times) {
                expectSame(left, right, endless.keys, time, seed)
            }
        }
        expect(endlessSeen).toBeGreaterThan(ENDLESS_CASES / 10)
    })
})
