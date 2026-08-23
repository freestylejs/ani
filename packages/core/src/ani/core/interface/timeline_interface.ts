import { type AnimationNode, SegmentNode, type SegmentNodeProps } from '~/nodes'
import type { Resolver } from '~/style'
import { DynamicSpringTimingFunction, TimingFunction } from '~/timing'
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

/**
 * Normalize repeat count as "additional iterations after first play".
 */
export function normalizeRepeatCount(repeat?: number): number {
    if (repeat === Infinity) return Infinity
    if (!Number.isFinite(repeat) || repeat === undefined || repeat <= 0) {
        return 0
    }
    return Math.floor(repeat)
}

/**
 * Converts repeat count to WAAPI iteration count.
 * repeat=0 -> iterations=1, repeat=1 -> iterations=2
 */
export function toIterationCount(repeat?: number): number {
    const normalized = normalizeRepeatCount(repeat)
    return normalized === Infinity ? Infinity : normalized + 1
}

function collectTimings<G extends Groupable>(
    timing: SegmentNodeProps<G>['timing']
): TimingFunction[] {
    if (!timing) return []
    if (timing instanceof TimingFunction) return [timing]
    if (Array.isArray(timing)) return timing as TimingFunction[]
    return Object.values(timing as Record<string, TimingFunction>)
}

/**
 * Stateful integrators (e.g. DynamicSpring) must not leak state across
 * play/repeat/compile runs, so they are reset whenever a plan is resolved.
 */
function resetStatefulTimings<G extends Groupable>(plan: ExecutionPlan<G>) {
    for (const segment of plan) {
        for (const timing of collectTimings(segment.node.props.timing)) {
            if (timing instanceof DynamicSpringTimingFunction) {
                timing.reset()
            }
        }
    }
}

function computeTotalDuration<G extends Groupable>(
    plan: ExecutionPlan<G>
): number {
    let total = 0
    for (const segment of plan) {
        if (segment.endTime > total) total = segment.endTime
    }
    return total
}

export abstract class TimelineBase<G extends Groupable> {
    /**
     * Total duration of the currently resolved execution plan.
     * Reflects runtime `durations` overrides.
     */
    public get duration(): number {
        return this._totalDuration
    }

    protected readonly _baseExecutionPlan: ExecutionPlan<G>
    protected _currentExecutionPlan: ExecutionPlan<G> | null = null

    private _totalDuration: number

    constructor(protected readonly rootNode: AnimationNode<G>) {
        this._baseExecutionPlan = this._constructExecutionPlan(rootNode)
        this._totalDuration = computeTotalDuration(this._baseExecutionPlan)

        this.play = this.play.bind(this)
        this.pause = this.pause.bind(this)
        this.seek = this.seek.bind(this)
        this.reset = this.reset.bind(this)
        this.resume = this.resume.bind(this)
    }

    /**
     * flatten the AST into a linear execution plan, ordered chronologically
     * so that consumers can evaluate segments in time order.
     */
    private _constructExecutionPlan(
        rootNode: AnimationNode<G>
    ): ExecutionPlan<G> {
        const plan: ExecutionPlan<G> = []
        rootNode.construct(plan, 0)
        // Stable sort: chronological evaluation order with declaration-order
        // tie-breaking for simultaneous starts (e.g. parallel children).
        plan.sort((a, b) => a.startTime - b.startTime)
        return plan
    }

    /**
     * Merges the base plan with runtime dynamic overrides.
     * Overridden segments get their schedule (`endTime`) and the timeline
     * `duration` recomputed from the new durations.
     */
    protected _resolveExecutionPlan(
        keyframes?: Array<G | 'keep'>,
        durations?: Array<number | 'keep'>
    ): ExecutionPlan<G> {
        const newPlan: ExecutionPlan<G> = []

        if (!keyframes && !durations) {
            for (const segment of this._baseExecutionPlan) {
                newPlan.push({ ...segment })
            }
        } else {
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

            let keyframeIndex = 0

            for (const segment of this._baseExecutionPlan) {
                if (segment.node.type === 'SEGMENT') {
                    const dynamicTo = keyframes?.[keyframeIndex]
                    const dynamicDuration = durations?.[keyframeIndex]

                    const newSegmentProps: SegmentNodeProps<G> = {
                        ...segment.node.props,
                        ...(dynamicTo !== undefined &&
                            dynamicTo !== 'keep' && {
                                to: dynamicTo,
                            }),
                        ...(dynamicDuration !== undefined &&
                            dynamicDuration !== 'keep' && {
                                duration: dynamicDuration,
                            }),
                    }

                    const newSegment = new SegmentNode(
                        newSegmentProps,
                        segment.node.id
                    )
                    newPlan.push({
                        node: newSegment,
                        startTime: segment.startTime,
                        endTime: segment.startTime + newSegment.duration,
                    })
                    keyframeIndex++
                } else {
                    newPlan.push({ ...segment })
                }
            }
        }

        this._totalDuration = computeTotalDuration(newPlan)
        resetStatefulTimings(newPlan)

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
