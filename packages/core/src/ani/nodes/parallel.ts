import type { TimingFunction } from '~/timing'
import type { Groupable, GroupableRecord } from '../timeline'
import type { AnimationId, AnimationNode } from './base'
import {
    type CompositionChildren,
    CompositionNode,
    type CompositionPlan,
} from './composition'
import { SegmentNode } from './segment'

/**
 * Composition node that runs all of its children at the same time.
 */
export class ParallelNode<
    const Children extends CompositionChildren,
> extends CompositionNode<Children> {
    readonly type = 'PARALLEL'
    readonly duration: number

    constructor(children: Children, timing?: TimingFunction, id?: AnimationId) {
        // Handle object property conflicts
        const seenProperty = new Set<string>()
        const resolvedChildren: AnimationNode<Groupable>[] = []

        for (const child of [...children].reverse()) {
            if (child instanceof SegmentNode) {
                const segment = child as SegmentNode<Groupable>
                const propsTo = segment.props.to

                // record shape
                if (propsTo && !Array.isArray(propsTo)) {
                    const propsToAnimate = Object.keys(propsTo)
                    const finalConstructedTo: Record<string, number> = {}
                    let handledCount = 0

                    for (const propKey of propsToAnimate) {
                        if (!seenProperty.has(propKey)) {
                            finalConstructedTo[propKey] = (
                                propsTo as Record<string, number>
                            )[propKey]!
                            seenProperty.add(propKey)
                            handledCount++
                        }
                    }

                    if (handledCount > 0) {
                        const newSegment = new SegmentNode<Groupable>(
                            {
                                ...segment.props,
                                to: finalConstructedTo as GroupableRecord,
                            },
                            segment.id
                        )
                        resolvedChildren.push(newSegment)
                    }
                    continue // Go to next child
                }
            }

            // Non-conflicts
            resolvedChildren.push(child)
        }

        resolvedChildren.reverse()

        super(resolvedChildren as unknown as Children, timing, id)

        this.duration = Math.max(0, ...children.map((child) => child.duration))
    }

    public construct(plan: CompositionPlan<Children>, startTime: number): void {
        for (const child of this.children) {
            child.construct(plan, startTime)
        }
    }
}

/**
 * Parallel composition animation
 */
export function parallel<const Children extends CompositionChildren>(
    children: Children,
    timing?: TimingFunction,
    id?: AnimationId
): ParallelNode<Children> {
    return new ParallelNode(children, timing, id)
}
