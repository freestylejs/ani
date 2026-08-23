import type { Groupable } from '~/ani/core'
import type { TimingFunction } from '~/timing'

import type { AnimationId, AnimationNode } from './base'
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
        timing?: TimingFunction,
        id?: AnimationId
    ) {
        super([child], timing, id)
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
 * @param timing Loop timing function.
 * @param id Optional ID for the node.
 */
export function loop<G extends Groupable>(
    child: AnimationNode<G>,
    loopCount: number,
    timing?: TimingFunction,
    id?: AnimationId
): LoopNode<G> {
    return new LoopNode(child, loopCount, timing, id)
}
