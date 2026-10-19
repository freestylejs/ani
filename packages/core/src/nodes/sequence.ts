import {
    assertNoExtraArguments,
    type NodeOptions,
    parseNodeOptions,
} from './base'
import {
    type CompositionChildren,
    CompositionNode,
    type CompositionPlan,
} from './composition'
import { type Footprint, mergeFootprints, type Placed } from './footprint'

const SEQUENCE_FORM = '`sequence(children, { timing, id })`'

/**
 * Composition node that runs its children one after another.
 */
export class SequenceNode<
    const Children extends CompositionChildren,
> extends CompositionNode<Children> {
    readonly type = 'SEQUENCE'
    readonly duration: number
    readonly footprint: Footprint

    constructor(children: Children, options?: NodeOptions) {
        const { timing: resolvedTiming, id: resolvedId } = parseNodeOptions(
            options,
            'sequence',
            SEQUENCE_FORM
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
 * @param options `{ timing, id }`: timing inherited by children without their own, optional node ID.
 */
export function sequence<const Children extends CompositionChildren>(
    children: Children,
    options?: NodeOptions
): SequenceNode<Children>
export function sequence<const Children extends CompositionChildren>(
    children: Children,
    options?: NodeOptions,
    ...extra: unknown[]
): SequenceNode<Children> {
    assertNoExtraArguments('sequence', SEQUENCE_FORM, extra)
    return new SequenceNode(children, options)
}
