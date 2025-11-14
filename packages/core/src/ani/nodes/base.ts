import type { ExecutionPlan, Groupable } from '../timeline'

export type AnimationId = string
export type AnimationNodeType = string
export type AnimationDuration = number

/**
 * Nodes in the animation tree
 */
export abstract class AnimationNode<G extends Groupable> {
    abstract readonly type: AnimationNodeType
    abstract readonly duration: AnimationDuration

    readonly id?: AnimationId

    constructor(id?: AnimationId) {
        if (id) {
            this.id = id
        }
    }

    /**
     * Constructs self node and its children into a flat execution plan.
     * @param plan Execution plans to which segments will be added.
     * @param startTime The absolute current start time for this node within the master timeline.
     */
    public abstract construct(plan: ExecutionPlan<G>, startTime: number): void
}

export type ExtractAnimationNode<AnimeNode> = AnimeNode extends AnimationNode<
    infer Group
>
    ? Group
    : never
