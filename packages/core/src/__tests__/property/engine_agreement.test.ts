import { describe, expect, it } from 'vitest'
import type { ExecutionPlan } from '~/ani/core'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import { planLoops } from '~/ani/core/plan_state'
import { type RafAniTimeline, rafTimeline } from '~/ani/raf/timeline'
import { compileToKeyframes, type WebAniKeyframe } from '~/ani/waapi/compiler'
import { ani, sequence } from '~/nodes'
import {
    BezierTimingFunction,
    DynamicSpringTimingFunction,
    LinearTimingFunction,
    SpringTimingFunction,
    T,
    TimingFunction,
} from '~/timing'
import { END_TOLERANCE } from '~/utils/time'
import type { AnimationRecord } from './gen'
import {
    caseMessage,
    generateTree,
    mulberry32,
    NUMBER_KEYS,
    type TreeOptions,
} from './gen'
import { planDuration, snapshot, sortedPlan } from './helpers'
import { numericValue, referenceValueAt } from './waapi_reference'

/**
 * P4: RAF/WAAPI agreement. Keyframes sharing an offset follow the Web
 * Animations rule: the last of them is the value at and after that offset and
 * must equal `seek`, the first is the value interpolation reaches from the
 * previous offset and must equal the RAF value just before it. Between
 * offsets the reference WAAPI interpolant (linear chords with the keyframe
 * easing applied to the progress) must track the RAF value: 1e-6 where the
 * compiler delegates the interval to one exactly represented easing, and
 * within the chord error of the RAF curve itself everywhere else.
 */

const CASES = 100
const BASE_SEED = 0xa44001
const KEYFRAME_TOLERANCE = 1e-6
const EXACT_EASING_TOLERANCE = 1e-6
const TIME_EPSILON = 1e-9
/** How far before a keyframe time the left-hand limit is read from RAF. */
const LEFT_LIMIT_GAP = 1e-7
/** Inside the runtime's end tolerance, where a finished spring holds `to`. */
const SPRING_SNAP_READ = END_TOLERANCE / 2
/**
 * Left-hand limit slack, in multiples of the local slope times the gap: the
 * compiler reads the limit ~5e-10 s before the keyframe, the test reads it
 * `LEFT_LIMIT_GAP` before, so they differ by the slope times that gap. The
 * slope is measured from RAF itself, as the steepest chord to a few earlier
 * reads (`SLOPE_BASELINES`): the bezier solver is only accurate to ~1e-7 in
 * progress, so a 1e-7 baseline reads flat plateaus, while a bezier with
 * `p3.x` near 1 gets steeper towards its end, so the shortest baseline that
 * the solver noise allows bounds it best. The factor 2 absorbs what is left.
 */
const LEFT_LIMIT_SLOPE_MARGIN = 2
/**
 * Accuracy of `BezierTimingFunction`'s eased progress (its solver stops at
 * `SUBDIVISION_PRECISION` = 1e-7); measured error stays below ~1e-7 of the
 * travelled distance except for beziers with `p3.x` ~ 1, hence the margin.
 */
const BEZIER_PROGRESS_ERROR = 1e-6
/** Default settling tolerance of `DynamicSpringTimingFunction`. */
const DYNAMIC_SPRING_SETTLE_SNAP = 1e-3
const SLOPE_BASELINES = [1e-6, 1e-5, 1e-4]
/** Spacing of the compiler's samples (FPS in `keyframe_compiler.ts`). */
const SAMPLE_SPACING = 1 / 60
/**
 * The curvature behind the sampled-interval bound is read from RAF on a grid
 * this many times finer than `SAMPLE_SPACING`, so a spring wiggling inside one
 * sample cell is still resolved.
 */
const GRID_REFINEMENT = 16
/**
 * A chord of a curve with `|f''| <= M` over a cell of width `h` deviates from
 * it by at most `h^2 / 8 * M`. `M` is estimated from second differences of the
 * RAF values, which can underestimate the true maximum between grid points, so
 * the bound is doubled. The mutation tests below show it is tight enough to
 * reject samples taken from the wrong place.
 */
const CURVATURE_MARGIN = 2

type Plan = ExecutionPlan<AnimationRecord>
type Segment = Plan[number]
type Line = RafAniTimeline<AnimationRecord>

type IntervalKind = 'exact' | 'sampled'

interface OffsetGroup {
    offset: number
    /** Offset of the last keyframe: later than `offset` within a group of near offsets. */
    lastOffset: number
    first: WebAniKeyframe
    last: WebAniKeyframe
}

interface Case {
    seed: number
    keys: readonly string[]
    from: AnimationRecord
    plan: Plan
    duration: number
    keyframes: WebAniKeyframe[]
    line: Line
    timeOf: (offset: number) => number
    isBoundary: (time: number) => boolean
}

/**
 * Keyframes bucketed by offset, in order. Offsets less than `TIME_EPSILON`
 * seconds apart are one time: the end of an iteration and the start of the
 * next are sums an ulp apart.
 */
function groupByOffset(
    keyframes: readonly WebAniKeyframe[],
    duration: number
): OffsetGroup[] {
    const groups: OffsetGroup[] = []
    for (const keyframe of keyframes) {
        const tail = groups[groups.length - 1]
        if (
            tail !== undefined &&
            (tail.offset === keyframe.offset ||
                (duration > TIME_EPSILON &&
                    Math.abs(tail.offset - keyframe.offset) * duration <=
                        TIME_EPSILON))
        ) {
            tail.last = keyframe
            tail.lastOffset = keyframe.offset
        } else {
            groups.push({
                offset: keyframe.offset,
                lastOffset: keyframe.offset,
                first: keyframe,
                last: keyframe,
            })
        }
    }
    return groups
}

/**
 * Maps a keyframe offset back to seconds. `offset * duration` can land a few
 * ulp before the plan time it came from, on the other side of a jump, so
 * times within `TIME_EPSILON` of a segment boundary snap to the boundary. The
 * end of one iteration and the start of the next are different sums, an ulp
 * apart: the nearest boundary is the one the keyframe came from.
 */
function planTimes(
    plan: Plan,
    duration: number
): Pick<Case, 'timeOf' | 'isBoundary'> {
    const boundaries = new Set<number>([0, duration])
    for (const segment of plan) {
        boundaries.add(segment.startTime)
        boundaries.add(segment.endTime)
    }
    const nearest = (time: number): number | undefined => {
        let found: number | undefined
        for (const boundary of boundaries) {
            const gap = Math.abs(boundary - time)
            if (
                gap <= TIME_EPSILON &&
                (found === undefined || gap < Math.abs(found - time))
            ) {
                found = boundary
            }
        }
        return found
    }
    return {
        timeOf: (offset) => {
            const time = offset * duration
            return nearest(time) ?? time
        },
        isBoundary: (time) => nearest(time) !== undefined,
    }
}

/** The default cases include loops the RAF engine represents once. */
const DEFAULT_TREES: TreeOptions = { keys: NUMBER_KEYS }

function buildCase(seed: number, options: TreeOptions = DEFAULT_TREES): Case {
    const rng = mulberry32(seed)
    const { node, keys, from } = generateTree(rng, options)
    const plan = sortedPlan(node)
    const duration = planDuration(plan)
    const line = rafTimeline(node, new ManualClock())
    line.play({ from })
    return {
        seed,
        keys,
        from,
        plan,
        duration,
        keyframes: compileToKeyframes(plan, from),
        line,
        ...planTimes(plan, duration),
    }
}

function valuesAt(line: Line, time: number): AnimationRecord {
    line.seek(time)
    return snapshot(line.getCurrentValue()!)
}

/**
 * True when the segment driving `key` just before `time` is spring-timed and
 * ends there. Springs snap to `to` when their segment ends (a static spring
 * leaves up to `tolerance` of its amplitude, a dynamic spring whatever it had
 * not yet covered), so RAF itself has no continuous left-hand limit at that
 * point. The compiler cannot know the snap: its last sample cell ramps to it,
 * and that cell is allowed the measured snap on top of the chord error.
 */
function springSnapsAt(plan: Plan, key: string, time: number): boolean {
    const driver = driverBefore(plan, key, time)
    if (driver === null || Math.abs(driver.endTime - time) > TIME_EPSILON) {
        return false
    }
    const own = timingOf(driver, key)
    return (
        own instanceof SpringTimingFunction ||
        own instanceof DynamicSpringTimingFunction
    )
}

/** Last segment (ties: later declaration) writing `key` that started before `time`. */
function driverBefore(plan: Plan, key: string, time: number): Segment | null {
    let driver: Segment | null = null
    for (const segment of plan) {
        if (segment.startTime >= time - TIME_EPSILON) break
        if (key in (segment.node.props.to as AnimationRecord)) driver = segment
    }
    return driver
}

function timingOf(segment: Segment, key: string): TimingFunction | undefined {
    const timing = segment.node.props.timing as unknown
    return timing instanceof TimingFunction
        ? timing
        : (timing as Record<string, TimingFunction> | undefined)?.[key]
}

/**
 * Value noise of a bezier-driven key: `BezierTimingFunction` solves x(t) with
 * four Newton steps and `SUBDIVISION_PRECISION` 1e-7, so its eased progress is
 * only that accurate (and not monotone at that scale), scaled by the distance
 * the segment travels. A dynamic spring that settles inside its segment (both
 * `|x - to|` and `|v|` within its 1e-3 tolerance) snaps to `to`, so RAF can
 * step by up to `DYNAMIC_SPRING_SETTLE_SNAP` anywhere along it.
 */
function engineNoise(c: Case, key: string, time: number): number {
    const driver = driverBefore(c.plan, key, time)
    if (driver === null) return 0
    const timing = timingOf(driver, key)
    if (timing instanceof DynamicSpringTimingFunction) {
        return DYNAMIC_SPRING_SETTLE_SNAP
    }
    if (!(timing instanceof BezierTimingFunction)) return 0
    const start = valuesAt(c.line, driver.startTime)[key]!
    const to = (driver.node.props.to as AnimationRecord)[key]!
    return BEZIER_PROGRESS_ERROR * Math.abs(to - start)
}

function writesValues(segment: Segment): boolean {
    return Object.keys(segment.node.props.to as AnimationRecord).length > 0
}

function sameBezier(a: BezierTimingFunction, b: BezierTimingFunction): boolean {
    return (
        a === b ||
        (a.opt.p2.x === b.opt.p2.x &&
            a.opt.p2.y === b.opt.p2.y &&
            a.opt.p3.x === b.opt.p3.x &&
            a.opt.p3.y === b.opt.p3.y)
    )
}

/**
 * `'exact'` when one easing explains the whole interval `[ta, tb]`: every
 * writer active in it shares a linear or an exactly tiling bezier easing.
 */
function intervalKind(plan: Plan, ta: number, tb: number): IntervalKind {
    const mid = (ta + tb) / 2
    const writing = plan.filter(
        (segment) =>
            writesValues(segment) &&
            segment.startTime <= mid + TIME_EPSILON &&
            segment.endTime >= mid - TIME_EPSILON
    )

    if (
        writing.every((segment) => {
            const timing = segment.node.props.timing
            return (
                timing === undefined ||
                timing === null ||
                timing instanceof LinearTimingFunction
            )
        })
    ) {
        return 'exact'
    }
    if (
        writing.every(
            (segment) =>
                segment.node.props.timing instanceof BezierTimingFunction
        )
    ) {
        const first = writing[0]!.node.props.timing as BezierTimingFunction
        const same = writing.every((segment) =>
            sameBezier(first, segment.node.props.timing as BezierTimingFunction)
        )
        const tiles = writing.every(
            (segment) =>
                Math.abs(segment.startTime - ta) <= TIME_EPSILON &&
                Math.abs(segment.endTime - tb) <= TIME_EPSILON
        )
        if (same && tiles) return 'exact'
    }
    return 'sampled'
}

/** Keyframe times and left-hand limits: how they compare with RAF. */
function checkKeyframes(c: Case, groups: readonly OffsetGroup[]): void {
    const { seed, keys, from, plan, line } = c
    for (const group of groups) {
        const time = c.timeOf(group.offset)
        const after = c.timeOf(group.lastOffset)
        const at = valuesAt(line, after)
        for (const key of keys) {
            expect(
                Math.abs(at[key]! - numericValue(group.last[key])),
                caseMessage(seed, `value at t=${after} key "${key}"`)
            ).toBeLessThanOrEqual(KEYFRAME_TOLERANCE)
        }

        // the first keyframe is the value just before the offset; nothing
        // precedes t=0, where only a jump has a left-hand keyframe and it
        // holds the opening state
        if (time === 0 && group.first === group.last) continue
        let before: AnimationRecord = from
        let snapped: AnimationRecord = from
        const earlier: { span: number; values: AnimationRecord }[] = []
        if (time > 0) {
            before = valuesAt(line, time - LEFT_LIMIT_GAP)
            snapped = valuesAt(line, time - SPRING_SNAP_READ)
            for (const span of SLOPE_BASELINES) {
                if (span >= time) continue
                earlier.push({ span, values: valuesAt(line, time - span) })
            }
        }
        for (const key of keys) {
            // RAF snaps a spring to `to` within END_TOLERANCE of its end, so
            // that is the left-hand value there: read it where it applies
            if (springSnapsAt(plan, key, time)) {
                expect(
                    Math.abs(snapped[key]! - numericValue(group.first[key])),
                    caseMessage(
                        seed,
                        `value at the spring end before t=${time} key "${key}"`
                    )
                ).toBeLessThanOrEqual(KEYFRAME_TOLERANCE)
                continue
            }
            let slope = 0
            for (const { span, values } of earlier) {
                slope = Math.max(
                    slope,
                    Math.abs(before[key]! - values[key]!) /
                        (span - LEFT_LIMIT_GAP)
                )
            }
            const noise = engineNoise(c, key, time)
            expect(
                Math.abs(before[key]! - numericValue(group.first[key])),
                caseMessage(seed, `value just before t=${time} key "${key}"`)
            ).toBeLessThanOrEqual(
                LEFT_LIMIT_SLOPE_MARGIN * slope * LEFT_LIMIT_GAP +
                    noise +
                    KEYFRAME_TOLERANCE
            )
        }
    }
}

/** Largest |second difference| / step^2 of RAF over `[ta, tEnd]` per key. */
function maxCurvature(
    c: Case,
    ta: number,
    tEnd: number
): { curvature: AnimationRecord; end: AnimationRecord } {
    // short cells (before a segment end) get the same resolution per cell
    const cells = Math.max(
        GRID_REFINEMENT,
        Math.ceil((tEnd - ta) / (SAMPLE_SPACING / GRID_REFINEMENT))
    )
    const step = (tEnd - ta) / cells
    const samples: AnimationRecord[] = []
    for (let n = 0; n <= cells; n++) {
        samples.push(valuesAt(c.line, n === cells ? tEnd : ta + n * step))
    }
    const curvature: AnimationRecord = {}
    for (const key of c.keys) {
        let max = 0
        for (let n = 1; n < cells; n++) {
            const second =
                samples[n - 1]![key]! -
                2 * samples[n]![key]! +
                samples[n + 1]![key]!
            max = Math.max(max, Math.abs(second) / (step * step))
        }
        curvature[key] = max
    }
    return { curvature, end: samples[cells]! }
}

/**
 * Worst `error / bound` over every interval between neighbouring offsets, at
 * 25%, 50% and 75% of the way, and where it happened. The bound is 1e-6 for
 * delegated intervals and the chord error of the RAF curve otherwise.
 */
function worstIntervalRatio(
    c: Case,
    keyframes: readonly WebAniKeyframe[]
): { ratio: number; detail: string } {
    const groups = groupByOffset(keyframes, c.duration)
    let worst = { ratio: 0, detail: 'no interval' }
    for (let g = 0; g < groups.length - 1; g++) {
        const ta = c.timeOf(groups[g]!.offset)
        const tb = c.timeOf(groups[g + 1]!.offset)
        const kind = intervalKind(c.plan, ta, tb)
        const bounds: AnimationRecord = {}
        for (const key of c.keys) bounds[key] = EXACT_EASING_TOLERANCE
        if (kind === 'sampled') {
            const { curvature, end } = maxCurvature(c, ta, tb - LEFT_LIMIT_GAP)
            const snapped = valuesAt(c.line, tb - SPRING_SNAP_READ)
            for (const key of c.keys) {
                const h = tb - ta
                const snap = springSnapsAt(c.plan, key, tb)
                    ? Math.abs(snapped[key]! - end[key]!)
                    : 0
                bounds[key] =
                    (h * h * CURVATURE_MARGIN * curvature[key]!) / 8 +
                    snap +
                    engineNoise(c, key, tb) +
                    EXACT_EASING_TOLERANCE
            }
        }
        for (const fraction of [0.25, 0.5, 0.75]) {
            const time = ta + (tb - ta) * fraction
            const actual = valuesAt(c.line, time)
            for (const key of c.keys) {
                const expected = referenceValueAt(
                    keyframes,
                    c.duration,
                    time,
                    key
                )
                const ratio =
                    Math.abs(actual[key]! - expected) /
                    (bounds[key]! + TIME_EPSILON)
                if (ratio > worst.ratio) {
                    worst = {
                        ratio,
                        detail: `key "${key}" at t=${time} (${kind}, error ${Math.abs(
                            actual[key]! - expected
                        )}, bound ${bounds[key]})`,
                    }
                }
            }
        }
    }
    return worst
}

/** How a deliberately broken compiler writes its sampled keyframes. */
type Mutation = 'hold-previous' | 'take-next'

/** Rewrites the samples between plan boundaries; boundaries stay intact. */
function mutateSamples(
    c: Case,
    keyframes: readonly WebAniKeyframe[],
    mutation: Mutation
): WebAniKeyframe[] {
    return keyframes.map((keyframe, index) => {
        if (c.isBoundary(c.timeOf(keyframe.offset))) return keyframe
        const donor =
            mutation === 'hold-previous'
                ? keyframes[index - 1]!
                : keyframes[index + 1]!
        const copy: WebAniKeyframe = { ...keyframe }
        for (const key of c.keys) copy[key] = donor[key]!
        return copy
    })
}

describe('P4: RAF/WAAPI agreement', () => {
    it('matches at keyframes and inside intervals (100 record trees)', () => {
        for (let i = 0; i < CASES; i++) {
            const c = buildCase(BASE_SEED + i)
            checkKeyframes(c, groupByOffset(c.keyframes, c.duration))
            const worst = worstIntervalRatio(c, c.keyframes)
            expect(
                worst.ratio,
                caseMessage(c.seed, worst.detail)
            ).toBeLessThanOrEqual(1)
        }
    })

    it('matches on loops the RAF engine represents once (100 record trees)', () => {
        let folded = 0
        for (let i = 0; i < CASES; i++) {
            const c = buildCase(BASE_SEED + 7000 + i)
            if (planLoops(c.line['_baseExecutionPlan'] as object).length > 0) {
                folded++
            }
            checkKeyframes(c, groupByOffset(c.keyframes, c.duration))
            const worst = worstIntervalRatio(c, c.keyframes)
            expect(
                worst.ratio,
                caseMessage(c.seed, worst.detail)
            ).toBeLessThanOrEqual(1)
        }
        expect(folded, 'trees with a folded loop').toBeGreaterThan(CASES / 10)
    })

    it.each<Mutation>([
        'hold-previous',
        'take-next',
    ])('rejects compiler samples that are wrong (%s)', (mutation) => {
        let sampled = 0
        let rejected = 0
        for (let i = 0; i < CASES; i++) {
            const c = buildCase(BASE_SEED + i)
            const mutated = mutateSamples(c, c.keyframes, mutation)
            if (mutated.every((kf, n) => kf === c.keyframes[n])) continue
            sampled++
            if (worstIntervalRatio(c, mutated).ratio > 1) rejected++
        }
        // most generated trees have sampled curves, and nearly all of those
        // move enough inside a cell to show a wrong sample
        expect(sampled, 'cases with sampled keyframes').toBeGreaterThan(30)
        expect(rejected, `${rejected}/${sampled} rejected`).toBeGreaterThan(
            sampled * 0.9
        )
    })

    it('agrees across a zero-length jump at an interval end (seed 10764340)', () => {
        // Reduced from the first failing generated case (seed 10764340, case
        // 52/100 of the property loop): a sequence whose second child has
        // duration 0, so RAF ramps to 100 and drops to 0 exactly at t=1.
        const node = sequence([
            ani({ to: { y: 100 }, duration: 1, timing: T.linear() }),
            ani({ to: { y: 0 }, duration: 0, timing: T.linear() }),
        ])
        const from = { y: 0 }
        const plan = sortedPlan(node)
        const duration = planDuration(plan)
        const keyframes = compileToKeyframes(plan, from)
        const line = rafTimeline(node, new ManualClock())
        line.play({ from })

        line.seek(0.5)
        expect(
            snapshot(line.getCurrentValue()!).y,
            'seed=10764340 RAF holds the ramp'
        ).toBeCloseTo(50, 9)

        for (const time of [0.5, 1 - 1e-6, 1]) {
            line.seek(time)
            const raf = snapshot(line.getCurrentValue()!).y!
            const waapi = referenceValueAt(keyframes, duration, time, 'y')
            expect(
                Math.abs(waapi - raf),
                `seed=10764340 t=${time} (waapi=${waapi}, raf=${raf})`
            ).toBeLessThanOrEqual(EXACT_EASING_TOLERANCE)
        }
    })
})
