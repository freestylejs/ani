import type { ExecutionPlan, Groupable } from '~/ani/core'
import { LinearTimingFunction, type TimingFunction } from '~/timing'
import {
    type AnimationId,
    AnimationNode,
    type ExtractAnimationNode,
} from './base'
import { SegmentNode } from './segment'

export type CompositionChildren = readonly AnimationNode<Groupable>[]
export type CompositionPlan<Children extends CompositionChildren> =
    ExecutionPlan<ExtractAnimationNode<Children[number]>>

function cloneCompositionNodeWithChildren<T extends CompositionChildren>(
    source: CompositionNode<T>,
    children: T
): CompositionNode<T> {
    const clone = Object.create(
        Object.getPrototypeOf(source)
    ) as CompositionNode<T> & {
        children: T
    }
    Object.assign(clone, source)
    clone.children = children
    return clone
}

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
                    const adjustedChildren = adjustTiming(child.children)
                    return cloneCompositionNodeWithChildren(
                        child as CompositionNode<CompositionChildren>,
                        adjustedChildren
                    ) as unknown as T[number]
                }

                return child
            }) as unknown as T
        }

        const timingOverridingChildren = adjustTiming(children)
        this.children = timingOverridingChildren
    }
}
