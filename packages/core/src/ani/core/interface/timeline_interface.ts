import { type AnimationNode, SegmentNode, type SegmentNodeProps } from '~/nodes'
import type { Resolver } from '~/style'
import type { AnimePrimitive, ExecutionPlan, Groupable } from './core_types'

export interface TimelineCommonConfig<G extends Groupable> {
    /**
     * Starting dynamic value.
     */
    from: G
    /**
     * Animation repeat count.
     */
    repeat?: number
    /**
     * Initial delay before animation starts (ms).
     */
    delay?: number
    /**
     * Dynamic target overrides. Matches the order of SEGMENT nodes in the plan.
     */
    keyframes?: Array<G | 'keep'>
    /**
     * Dynamic duration overrides. Matches the order of SEGMENT nodes in the plan.
     */
    durations?: Array<number | 'keep'>
    /**
     * Custom style property resolver.
     *
     * @example
     * ```ts
     * const timeline = a.timeline(...)
     * timeline.play({
     *    propertyResolver: {
     *       'px': (pxValue) => { key: `top`, value: `${pxValue}px` }
     *    }
     * })
     * ```
     */
    propertyResolver?: G extends AnimePrimitive ? never : Resolver<G>
}

export abstract class TimelineBase<G extends Groupable> {
    public readonly duration: number

    protected readonly _baseExecutionPlan: ExecutionPlan<G>
    protected _currentExecutionPlan: ExecutionPlan<G> | null = null

    constructor(protected readonly rootNode: AnimationNode<G>) {
        this.duration = rootNode.duration
        this._baseExecutionPlan = this._constructExecutionPlan(rootNode)

        this.play = this.play.bind(this)
        this.pause = this.pause.bind(this)
        this.seek = this.seek.bind(this)
        this.reset = this.reset.bind(this)
        this.resume = this.resume.bind(this)
    }

    /**
     * flatten the AST into a linear execution plan.
     */
    private _constructExecutionPlan(
        rootNode: AnimationNode<G>
    ): ExecutionPlan<G> {
        const plan: ExecutionPlan<G> = []
        rootNode.construct(plan, 0)
        return plan
    }

    /**
     * Merges the base plan with runtime dynamic overrides.
     */
    protected _resolveExecutionPlan(
        keyframes?: Array<G | 'keep'>,
        durations?: Array<number | 'keep'>
    ): ExecutionPlan<G> {
        if (!keyframes && !durations) {
            return [...this._baseExecutionPlan]
        }

        const segmentNodes = this._baseExecutionPlan.filter(
            (segment) => segment.node.type === 'SEGMENT'
        )
        const segLength = segmentNodes.length

        if (keyframes && keyframes.length !== segLength) {
            throw new Error(
                `[Timeline] Keyframe mismatch: Expected ${segLength}, received ${keyframes.length}.`
            )
        }
        if (durations && durations.length !== segLength) {
            throw new Error(
                `[Timeline] Duration mismatch: Expected ${segLength}, received ${durations.length}.`
            )
        }

        const newPlan: ExecutionPlan<G> = []
        let keyframeIndex = 0

        for (const segment of this._baseExecutionPlan) {
            if (segment.node.type === 'SEGMENT') {
                const dynamicTo = keyframes?.[keyframeIndex]
                const dynamicDuration = durations?.[keyframeIndex]

                const newSegmentProps: SegmentNodeProps<G> = {
                    ...segment.node.props,
                    ...(dynamicTo &&
                        dynamicTo !== 'keep' && {
                            to: dynamicTo,
                        }),
                    ...(dynamicDuration &&
                        dynamicDuration !== 'keep' && {
                            duration: dynamicDuration,
                        }),
                }

                const newSegment = new SegmentNode(
                    newSegmentProps,
                    segment.node.id
                )
                newPlan.push({ ...segment, node: newSegment })
                keyframeIndex++
            } else {
                newPlan.push({ ...segment })
            }
        }

        return newPlan
    }

    // Abstract public members

    public abstract play(...args: unknown[]): void
    /**
     * Pause animation.
     */
    public abstract pause(): void
    /**
     * Resume animation.
     */
    public abstract resume(): void
    /**
     * Reset(cancel) animation.
     */
    public abstract reset(): void
    /**
     * Seek to specific target time.
     * @param targetTime Target seek time.
     */
    public abstract seek(targetTime: number): void
}
