import type { TimingFunction } from '~/timing'
import { type AnimationId, type NodeOptions, parseNodeOptions } from './base'
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

    constructor(
        children: Children,
        timingOrOptions?: TimingFunction | NodeOptions,
        id?: AnimationId,
        ...extra: unknown[]
    ) {
        const { timing: resolvedTiming, id: resolvedId } = parseNodeOptions(
            timingOrOptions,
            id,
            'sequence',
            extra.length > 0
        )
        super(children, resolvedTiming, resolvedId)
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
 * @param children Sequence children nodes.
 * @param timingOrOptions Loop timing function or options object.
 * @param id Optional ID for the node (positional form).
 */
export function sequence<const Children extends CompositionChildren>(
    children: Children,
    timingOrOptions?: TimingFunction | NodeOptions,
    id?: AnimationId,
    ...extra: unknown[]
): SequenceNode<Children> {
    return new SequenceNode(children, timingOrOptions, id, ...extra)
}
