import type {
    ExecutionPlan,
    ExecutionSegment,
    Groupable,
} from '~/ani/core/interface/core_types'
import { compilePlan, PlanRuntime } from '~/ani/core/plan_runtime'
import { createStyleSheet, type Resolver } from '~/style'
import { BezierTimingFunction, LinearTimingFunction } from '~/timing'
import { compileTiming } from './timing_compiler'

export interface WebAniKeyframe extends Record<string, string | number | null> {
    offset: number
    easing?: string
}

const FPS = 60
const SAMPLE_RATE = 1 / FPS

type Interval = 'linear' | string | null

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
 * Easing for the keyframe interval `[t, nextT]` shared by all `active`
 * segments, or `null` when it has to be sampled.
 *
 * A missing `timing` is linear (parity with the raf engine). Segments that
 * animate nothing (`delay`) never influence the curve.
 */
function easingForInterval(
    active: ExecutionSegment<Groupable>[],
    t: number,
    nextT: number
): Interval {
    let relevant = 0
    let linear = 0
    let bezierCount = 0
    let bezier: BezierTimingFunction | null = null
    let tilesExactly = true

    for (const segment of active) {
        const to = segment.node.props.to
        if (!Array.isArray(to) && Object.keys(to).length === 0) continue
        relevant++

        const timing = segment.node.props.timing as unknown
        if (timing === undefined || timing instanceof LinearTimingFunction) {
            linear++
            continue
        }
        if (timing instanceof BezierTimingFunction) {
            if (bezier !== null && !sameBezier(bezier, timing)) return null
            bezier = timing
            bezierCount++
            // A bezier curve can only be delegated when a single keyframe
            // interval exactly tiles the segment; otherwise the curve would
            // restart at every split point and diverge from the RAF engine.
            if (segment.startTime !== t || segment.endTime !== nextT) {
                tilesExactly = false
            }
            continue
        }
        // per-property timings / physics: must sample
        return null
    }

    // gap or key-less segments only: state is held, linear maintains it
    if (relevant === linear) return 'linear'
    // a bezier mixed with linear segments is not expressible as one easing
    if (bezier !== null && bezierCount === relevant && tilesExactly) {
        return compileTiming(bezier)
    }
    return null
}

/**
 * Compiles an ExecutionPlan into WAAPI Keyframes.
 *
 * Cost is O(critical points + samples) evaluations of O(animated properties)
 * each, regardless of how many segments the plan has.
 *
 * @param plan The resolved execution plan (from TimelineBase).
 * @param initialFrom The initial state (values).
 */
export function compileToKeyframes<G extends Groupable>(
    plan: ExecutionPlan<G>,
    initialFrom: G,
    resolver?: Resolver<Record<string, number>>
): WebAniKeyframe[] {
    if (Array.isArray(initialFrom)) {
        throw new TypeError(
            '[compileToKeyframes] WAAPI backend requires record-shaped values (CSS property names). Received an array; use the RAF engine for positional values.'
        )
    }

    if (plan.length === 0) {
        return []
    }

    const record = initialFrom as Record<string, number>
    const keys = Object.keys(record)
    const initialValues = keys.map((key) => record[key]!)
    // each compile owns its runtime: physics state never leaks between runs
    const runtime = new PlanRuntime(
        compilePlan(plan as ExecutionPlan<Groupable>, keys, keys.length),
        initialValues
    )

    const styleAt = (time: number): Record<string, any> => {
        runtime.evaluate(time, SAMPLE_RATE)
        const state: Record<string, number> = {}
        for (let i = 0; i < keys.length; i++) {
            state[keys[i]!] = runtime.values[i]!
        }
        return createStyleSheet(state, resolver)
    }

    // 1. Calculate Duration from the Plan, not the Node
    let duration = 0
    for (const segment of plan) {
        if (segment.endTime > duration) duration = segment.endTime
    }

    if (duration === 0) {
        const style = styleAt(0)
        return [
            { offset: 0, ...style },
            { offset: 1, ...style },
        ]
    }

    // 2. Collect critical time points
    const timePoints = new Set<number>([0, duration])
    for (const seg of plan) {
        timePoints.add(seg.startTime)
        timePoints.add(seg.endTime)
    }
    const sortedTimes = Array.from(timePoints).sort((a, b) => a - b)

    // Segments by start, swept alongside the intervals so each interval only
    // looks at the segments that can still be active.
    const byStart = [...plan].sort(
        (a, b) => a.startTime - b.startTime
    ) as ExecutionSegment<Groupable>[]
    let nextSegment = 0
    const active: ExecutionSegment<Groupable>[] = []

    const keyframes: WebAniKeyframe[] = []

    for (let i = 0; i < sortedTimes.length; i++) {
        const currT = sortedTimes[i]!
        const keyframe: WebAniKeyframe = {
            offset: currT / duration,
            ...styleAt(currT),
        }

        keyframes.push(keyframe)

        if (i < sortedTimes.length - 1) {
            const nextT = sortedTimes[i + 1]!

            while (
                nextSegment < byStart.length &&
                byStart[nextSegment]!.startTime <= currT
            ) {
                active.push(byStart[nextSegment]!)
                nextSegment++
            }
            // intervals only move forward: once ended, never active again
            let kept = 0
            for (const segment of active) {
                if (segment.endTime >= nextT) active[kept++] = segment
            }
            active.length = kept

            const easing = easingForInterval(active, currT, nextT)

            if (easing === null) {
                for (let n = 1; ; n++) {
                    const sampleT = currT + n * SAMPLE_RATE
                    if (sampleT >= nextT) break
                    keyframes.push({
                        offset: sampleT / duration,
                        ...styleAt(sampleT),
                        easing: 'linear',
                    })
                }
                keyframe.easing = 'linear'
            } else {
                keyframe.easing = easing
            }
        }
    }

    return keyframes
}
