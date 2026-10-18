import type { Groupable } from '~/ani/core'
import type { TimingFunction } from '~/timing'

import {
    type AnimationId,
    type AnimationNode,
    type NodeOptions,
    parseNodeOptions,
} from './base'
import { CompositionNode, type CompositionPlan } from './composition'

/**
 * Composition node that repeats a child animation node a specified number of times.
 */
export class LoopNode<G extends Groupable> extends CompositionNode<
    readonly AnimationNode<G>[]
> {
    readonly type = 'LOOP'
    readonly duration: number
    readonly count: number

    constructor(
        child: AnimationNode<G>,
        loopCount: number,
        timingOrOptions?: TimingFunction | NodeOptions,
        id?: AnimationId,
        ...extra: unknown[]
    ) {
        const { timing: resolvedTiming, id: resolvedId } = parseNodeOptions(
            timingOrOptions,
            id,
            'loop',
            extra.length > 0
        )
        super([child], resolvedTiming, resolvedId)
        // Non-finite counts would flatten an unbounded plan (OOM); use
        // `repeat: Infinity` on the timeline for endless playback.
        if (!Number.isInteger(loopCount) || loopCount < 0) {
            throw new RangeError(
                `[loop] loopCount must be a finite integer >= 0, received ${loopCount}. Use the timeline \`repeat: Infinity\` option for endless playback.`
            )
        }
        this.count = loopCount
        this.duration = child.duration * loopCount
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
        let currentTime = startTime
        for (let i = 0; i < this.count; i++) {
            this.child.construct(plan, currentTime)
            currentTime += this.child.duration
        }
    }
}

/**
 * Create loop for children animation.
 *
 * @param child Target animation node to repeat.
 * @param loopCount Loop count.
 * @param timingOrOptions Loop timing function or options object.
 * @param id Optional ID for the node (positional form).
 */
export function loop<G extends Groupable>(
    child: AnimationNode<G>,
    loopCount: number,
    timingOrOptions?: TimingFunction | NodeOptions,
    id?: AnimationId,
    ...extra: unknown[]
): LoopNode<G> {
    return new LoopNode(child, loopCount, timingOrOptions, id, ...extra)
}
