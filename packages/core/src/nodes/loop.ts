import type { ExecutionSegment, Groupable } from '~/ani/core'
import { type PlanLoop, planStateOf } from '~/ani/core/plan_state'

import {
    type AnimationNode,
    assertNoExtraArguments,
    type NodeOptions,
    parseNodeOptions,
} from './base'
import { CompositionNode, type CompositionPlan } from './composition'
import { type Footprint, loopFootprint } from './footprint'

const LOOP_FORM = '`loop(child, count, { timing, id })`'

/** Iterations written out before the plan repeats the last one. */
const UNROLLED = 3

/**
 * Composition node that repeats a child animation node a specified number of times.
 *
 * `Infinity` repeats forever. The plan holds at most three iterations of the
 * child however large the count is; the runtime derives the others.
 */
export class LoopNode<G extends Groupable> extends CompositionNode<
    readonly AnimationNode<G>[]
> {
    readonly type = 'LOOP'
    readonly duration: number
    readonly count: number
    readonly footprint: Footprint

    constructor(
        child: AnimationNode<G>,
        loopCount: number,
        options?: NodeOptions
    ) {
        const { timing: resolvedTiming, id: resolvedId } = parseNodeOptions(
            options,
            'loop',
            LOOP_FORM
        )
        super([child], resolvedTiming, resolvedId)
        if (
            loopCount !== Infinity &&
            (!Number.isInteger(loopCount) || loopCount < 0)
        ) {
            throw new RangeError(
                `[loop] loopCount must be a finite integer >= 0 or Infinity, received ${String(loopCount)}.`
            )
        }
        this.count = loopCount
        this.duration =
            loopCount === 0 || child.duration === 0
                ? 0
                : child.duration * loopCount
        this.footprint = loopFootprint(
            this.child.footprint,
            child.duration,
            loopCount
        )
    }

    /**
     * Timing-adjusted child (CompositionNode may clone it to inherit timing).
     */
    public get child(): AnimationNode<G> {
        return this.children[0] as AnimationNode<G>
    }

    public construct(
        plan: CompositionPlan<readonly AnimationNode<G>[]>,
        startTime: number
    ): void {
        const state = planStateOf(plan)
        const { child, count } = this
        const period = child.duration
        const slot = state.slot

        if (count === 0) {
            // emits nothing, but the child keeps its slots
            const size = plan.length
            const loops = state.loops.length
            child.construct(plan, startTime)
            plan.length = size
            state.loops.length = loops
            return
        }
        // a child without extent, or without end, can not repeat
        if (!(period > 0) || !Number.isFinite(period)) {
            child.construct(plan, startTime)
            return
        }

        const expand =
            count <= UNROLLED ||
            (count !== Infinity && state.expand?.(this, startTime) === true)
        const iterations = expand ? count : UNROLLED
        const written: ExecutionSegment<G>[][] = []
        for (let i = 0; i < iterations; i++) {
            state.slot = slot
            const from = plan.length
            child.construct(plan, startTime + i * period)
            if (!expand) written.push(plan.slice(from))
        }
        if (!expand) {
            state.loops.push({
                node: this,
                startTime,
                period,
                count,
                iterations: written as unknown as PlanLoop['iterations'],
            })
        }
    }
}

/**
 * Create loop for children animation.
 *
 * @param child Target animation node to repeat.
 * @param loopCount Loop count: an integer >= 0, or `Infinity` to repeat forever.
 * @param options `{ timing, id }`: timing inherited by the child's segments without their own, optional node ID.
 */
export function loop<G extends Groupable>(
    child: AnimationNode<G>,
    loopCount: number,
    options?: NodeOptions
): LoopNode<G>
export function loop<G extends Groupable>(
    child: AnimationNode<G>,
    loopCount: number,
    options?: NodeOptions,
    ...extra: unknown[]
): LoopNode<G> {
    assertNoExtraArguments('loop', LOOP_FORM, extra)
    return new LoopNode(child, loopCount, options)
}
