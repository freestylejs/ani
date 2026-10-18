import type { ExecutionPlan, Groupable, SegmentTiming } from '~/ani/core'
import { type AnimationId, AnimationNode } from './base'

export interface SegmentNodeProps<G extends Groupable> {
    readonly to: G
    readonly duration: number
    readonly timing?: SegmentTiming<G>
}

/**
 * Leaf node in the animation tree
 */
export class SegmentNode<G extends Groupable> extends AnimationNode<G> {
    readonly type = 'SEGMENT'
    readonly props: SegmentNodeProps<G>

    constructor(
        props: SegmentNodeProps<G> & { id?: AnimationId },
        id?: AnimationId
    ) {
        const resolvedId = id !== undefined ? id : props.id
        super(resolvedId)
        if (!Number.isFinite(props.duration) || props.duration < 0) {
            throw new RangeError(
                `[SegmentNode] duration must be a finite number >= 0 (seconds), received ${props.duration}.`
            )
        }
        const nodeProps: SegmentNodeProps<G> = {
            to: props.to,
            duration: props.duration,
            ...(props.timing !== undefined && { timing: props.timing }),
        }
        this.props = nodeProps
    }

    public get duration(): number {
        return this.props.duration
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
 * Single animation segment.
 *
 * @param props Animation config with optional node ID.
 * @param id Optional ID for the node (positional form, wins if both given).
 */
export function ani<G extends Groupable>(
    props: SegmentNodeProps<G> & { id?: AnimationId },
    id?: AnimationId
): SegmentNode<G> {
    return new SegmentNode(props, id)
}
