import type { TimingFunction } from '~/timing'
import type { AnimationId } from './base'
import {
    type CompositionChildren,
    CompositionNode,
    type CompositionPlan,
} from './composition'

/**
 * Composition node that runs its children one after another.
 */
export class SequenceNode<
    const Children extends CompositionChildren,
> extends CompositionNode<Children> {
    readonly type = 'SEQUENCE'
    readonly duration: number

    constructor(children: Children, timing?: TimingFunction, id?: AnimationId) {
        super(children, timing, id)
        this.duration = children.reduce((sum, child) => sum + child.duration, 0)
    }

    public construct(plan: CompositionPlan<Children>, startTime: number): void {
        let currentTime = startTime
        for (const child of this.children) {
            child.construct(plan, currentTime)
            currentTime += child.duration
        }
    }
}

/**
 * Sequence composition animation
 * @param timing Loop timing function.
 * @param id Optional ID for the node.
 */
export function sequence<const Children extends CompositionChildren>(
    children: Children,
    timing?: TimingFunction,
    id?: AnimationId
): SequenceNode<Children> {
    return new SequenceNode(children, timing, id)
}
