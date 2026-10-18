import type { TimingFunction } from '~/timing'
import { type AnimationId, type NodeOptions, parseNodeOptions } from './base'
import {
    type CompositionChildren,
    CompositionNode,
    type CompositionPlan,
} from './composition'
import { type Footprint, mergeFootprints, type Placed } from './footprint'

/**
 * Composition node that runs its children one after another.
 */
export class SequenceNode<
    const Children extends CompositionChildren,
> extends CompositionNode<Children> {
    readonly type = 'SEQUENCE'
    readonly duration: number
    readonly footprint: Footprint

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
        let duration = 0
        let endless = -1
        const placed: Placed[] = []
        for (let i = 0; i < children.length; i++) {
            const child = children[i]!
            if (endless >= 0) {
                throw new RangeError(
                    `[sequence] Child #${i} is unreachable: child #${endless} never ends because it contains an endless loop. Put the endless child last, or run it in a parallel.`
                )
            }
            placed.push({ footprint: child.footprint, offset: duration })
            duration += child.duration
            if (duration === Infinity) endless = i
        }
        this.duration = duration
        this.footprint = mergeFootprints(placed)
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
