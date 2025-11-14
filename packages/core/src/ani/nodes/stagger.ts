import type { TimingFunction } from '~/timing'
import type { AnimationId } from './base'
import {
    type CompositionChildren,
    CompositionNode,
    type CompositionPlan,
} from './composition'

interface StaggerNodeProps {
    offset: number
    timing?: TimingFunction
}
/**
 * Composition node that runs its children with a fixed delay between each start time.
 */
export class StaggerNode<
    const Children extends CompositionChildren,
> extends CompositionNode<Children> {
    readonly type = 'STAGGER'
    readonly duration: number
    readonly offset: number

    constructor(children: Children, props: StaggerNodeProps, id?: AnimationId) {
        super(children, props?.timing, id)

        this.offset = props.offset

        if (children.length === 0) {
            this.duration = 0
        } else {
            const lastChild = children[children.length - 1]!
            this.duration =
                (children.length - 1) * this.offset + lastChild.duration
        }
    }

    public construct(plan: CompositionPlan<Children>, startTime: number): void {
        let currentTime = startTime
        for (const child of this.children) {
            child.construct(plan, currentTime)
            currentTime += this.offset
        }
    }
}

/**
 * Stagger composition animation
 */
export function stagger<const Children extends CompositionChildren>(
    children: Children,
    props: StaggerNodeProps,
    id?: AnimationId
): StaggerNode<Children> {
    return new StaggerNode(children, props, id)
}
