import type { ExecutionPlan, Groupable } from '~/ani/core'
import { buildPlan } from '~/ani/core/plan_builder'
import type { AnimationNode } from '~/nodes'
import { DynamicSpringTimingFunction } from '~/timing'
import type { AnimationRecord } from './gen'

/**
 * Flattens a tree exactly like `TimelineBase` (stable chronological sort), with
 * every finite loop written out as `count` copies: the reference the engines'
 * loop handling is compared against.
 */
export function sortedPlan<G extends Groupable>(
    node: AnimationNode<G>
): ExecutionPlan<G> {
    return buildPlan(node, { expandAll: true }).plan
}

/** Total time span of a plan, computed like the keyframe compiler does. */
export function planDuration(plan: ExecutionPlan<Groupable>): number {
    let duration = 0
    for (const segment of plan) {
        if (segment.endTime > duration) duration = segment.endTime
    }
    return duration
}

/**
 * Structural stand-in for a timeline value record: the engine hands out
 * `AniGroup` objects whose open string index reads `number | undefined`,
 * while the property tests snapshot them into plain `AnimationRecord`s.
 */
export interface ValueRecord {
    readonly [key: string]: number | undefined
}

/** A plain (mutable) copy of a timeline value record. */
export function snapshot(value: ValueRecord): AnimationRecord {
    const out: AnimationRecord = {}
    for (const key of Object.keys(value)) {
        out[key] = value[key]!
    }
    return out
}

/** Default settling tolerance of `DynamicSpringTimingFunction`. */
export const DEFAULT_SETTLE_TOLERANCE = 1e-3

export interface PlanOutcome {
    /** Value every key holds after the run reached its end. */
    final: AnimationRecord
    /** Keys touched by a zero-length segment starting at t=0. */
    zeroStartKeys: Set<string>
    /** Keys whose dynamic spring is already settled at t=0. */
    settledAtStartKeys: Set<string>
}

/** Final value per key: the `to` of the last-started segment touching it. */
export function planOutcome(
    plan: ExecutionPlan<AnimationRecord>,
    from: AnimationRecord
): PlanOutcome {
    const final: AnimationRecord = { ...from }
    const zeroStartKeys = new Set<string>()
    const settledAtStartKeys = new Set<string>()
    for (const segment of plan) {
        const to = segment.node.props.to as AnimationRecord
        const timing = segment.node.props.timing
        for (const key of Object.keys(to)) {
            final[key] = to[key]!
            // a zero-length segment starting at 0 already reports its `to`
            if (segment.startTime === 0 && segment.node.duration === 0) {
                zeroStartKeys.add(key)
            }
            // a dynamic spring already within tolerance of `to` snaps at t=0
            if (
                segment.startTime === 0 &&
                segment.node.duration > 0 &&
                timing instanceof DynamicSpringTimingFunction &&
                Math.abs(from[key]! - to[key]!) <= DEFAULT_SETTLE_TOLERANCE
            ) {
                settledAtStartKeys.add(key)
            }
        }
    }
    return { final, zeroStartKeys, settledAtStartKeys }
}
