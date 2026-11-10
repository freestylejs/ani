import type { ExecutionPlan, Groupable } from '~/ani/core'
import type { TimingFunction } from '~/timing'
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
    clone.children = Object.freeze(children)
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

        // Only segments without their own timing inherit it; subtrees that
        // end up unchanged are shared as-is (no needless deep clones).
        const adjustTiming = <T extends CompositionChildren>(
            children: T
        ): T => {
            let changed = false
            const adjusted = children.map((child) => {
                if (
                    child instanceof SegmentNode &&
                    // child timing none >> override to parent
                    child.props.timing === undefined &&
                    timing
                ) {
                    changed = true
                    return new SegmentNode(
                        {
                            ...child.props,
                            timing: timing,
                        },
                        child.id
                    )
                }

                if (child instanceof CompositionNode) {
                    const adjustedChildren = adjustTiming(child.children)
                    if (adjustedChildren === child.children) return child
                    changed = true
                    return cloneCompositionNodeWithChildren(
                        child as CompositionNode<CompositionChildren>,
                        adjustedChildren
                    ) as unknown as T[number]
                }

                return child
            })
            return (changed ? adjusted : children) as unknown as T
        }

        // Own the array while sharing its immutable nodes. A caller can keep
        // editing its input list without invalidating this tree's cached plan.
        const ownedChildren = [...children] as unknown as Children
        this.children = Object.freeze(adjustTiming(ownedChildren))
    }
}
