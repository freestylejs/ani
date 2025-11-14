import { LinearTimingFunction, type TimingFunction } from '~/timing'
import type { ExecutionPlan, Groupable } from '../timeline'
import {
    type AnimationId,
    AnimationNode,
    type ExtractAnimationNode,
} from './base'
import { SegmentNode } from './segment'

export type CompositionChildren = readonly AnimationNode<Groupable>[]
export type CompositionPlan<Children extends CompositionChildren> =
    ExecutionPlan<ExtractAnimationNode<Children[number]>>

/**
 * Composition animation
 */
export abstract class CompositionNode<
    const Children extends CompositionChildren,
> extends AnimationNode<ExtractAnimationNode<Children[number]>> {
    /**
     * Composition children nodes.
     */
    public readonly children: Children

    constructor(children: Children, timing?: TimingFunction, id?: AnimationId) {
        super(id)

        const parentTiming: TimingFunction =
            timing ?? new LinearTimingFunction()

        const adjustTiming = <T extends CompositionChildren>(
            children: T
        ): T => {
            return children.map((child) => {
                if (
                    child instanceof SegmentNode &&
                    // child timing none >> override to parent
                    child.props.timing === undefined &&
                    timing
                ) {
                    return new SegmentNode(
                        {
                            ...child.props,
                            timing: parentTiming,
                        },
                        child.id
                    )
                }

                if (child instanceof CompositionNode) {
                    // @ts-ignore
                    child.children = adjustTiming(child.children)
                    return child
                }

                return child
            }) as unknown as T
        }

        const timingOverridingChildren = adjustTiming(children)
        this.children = timingOverridingChildren
    }
}
