import type { SegmentTiming } from '../engine'
import type { ExecutionPlan, Groupable } from '../timeline'
import { type AnimationId, AnimationNode } from './base'

export interface SegmentNodeProps<G extends Groupable> {
    readonly to: G
    readonly duration?: number
    readonly timing?: SegmentTiming
}

/**
 * Leaf node in the animation tree
 */
export class SegmentNode<G extends Groupable> extends AnimationNode<G> {
    readonly type = 'SEGMENT'
    readonly props: SegmentNodeProps<G>

    constructor(props: SegmentNodeProps<G>, id?: AnimationId) {
        super(id)
        const nodeProps: SegmentNodeProps<G> = {
            to: props.to,
            duration: props.duration ?? 0,
            ...(props.timing !== undefined && { timing: props.timing }),
        }
        this.props = nodeProps
    }

    get duration(): number {
        return this.props.duration!
    }

    public construct(plan: ExecutionPlan<G>, startTime: number): void {
        plan.push({
            node: this,
            startTime: startTime,
            endTime: startTime + this.duration,
        })
    }
}

/**
 * Factory function to create a ani SegmentNode.
 */
export function ani<G extends Groupable>(
    props: SegmentNodeProps<G>,
    id?: AnimationId
): SegmentNode<G> {
    return new SegmentNode(props, id)
}
