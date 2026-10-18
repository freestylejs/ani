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

/**
 * What a timeline does when the user prefers reduced motion.
 *
 * - `'jump'`: every run completes at once in its end state.
 * - `{ maxDuration }`: a run longer than `maxDuration` seconds plays faster so
 *   that it takes `maxDuration`; shorter runs are untouched.
 * - `'ignore'`: the preference is not honored (essential motion).
 */
export type ReducedMotionPolicy = 'jump' | 'ignore' | { maxDuration: number }

/**
 * Validates a policy at construction; `undefined` is the default `'jump'`.
 */
export function resolveReducedMotionPolicy(
    policy: unknown
): ReducedMotionPolicy {
    if (policy === undefined || policy === 'jump') return 'jump'
    if (policy === 'ignore') return 'ignore'
    if (typeof policy === 'object' && policy !== null) {
        const maxDuration = (policy as { maxDuration?: unknown }).maxDuration
        if (
            typeof maxDuration !== 'number' ||
            !Number.isFinite(maxDuration) ||
            maxDuration <= 0
        ) {
            throw new RangeError(
                `[Timeline] \`reducedMotion.maxDuration\` must be a finite number > 0 (seconds), received ${String(maxDuration)}.`
            )
        }
        return { maxDuration }
    }
    throw new TypeError(
        `[Timeline] \`reducedMotion\` must be 'jump', 'ignore' or { maxDuration }, received ${String(policy)}.`
    )
}

/**
 * Whether the `clock` reports a reduced-motion preference. A clock that does
 * not know the preference (a custom one) reports `false`.
 */
export function prefersReducedMotion(clock: object): boolean {
    return (clock as { reducedMotion?: unknown }).reducedMotion === true
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

function computeTotalDuration<G extends Groupable>(
    plan: ExecutionPlan<G>
): number {
    let total = 0
    for (const segment of plan) {
        if (segment.endTime > total) total = segment.endTime
    }
    return total
}

export abstract class TimelineBase<
    G extends Groupable,
    PlayArgs extends readonly unknown[] = readonly any[],
> {
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
    private readonly _baseDuration: number

    constructor(protected readonly rootNode: AnimationNode<G>) {
        this._baseExecutionPlan = this._constructExecutionPlan(rootNode)
        // The base plan is shared (compile caches key on its identity) and
        // handed out as-is when no override is requested: keep it immutable.
        for (const segment of this._baseExecutionPlan) Object.freeze(segment)
        Object.freeze(this._baseExecutionPlan)
        this._baseDuration = computeTotalDuration(this._baseExecutionPlan)
        this._totalDuration = this._baseDuration

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
     * Merges the base plan with runtime dynamic overrides, without touching
     * any timeline state (so a failing `play()` leaves the timeline intact).
     * Overridden segments get their schedule (`endTime`) and the timeline
     * `duration` recomputed from the new durations.
     */
    protected _buildExecutionPlan(
        keyframes?: Array<G | 'keep'>,
        durations?: Array<number | 'keep'>
    ): { plan: ExecutionPlan<G>; duration: number } {
        if (!keyframes && !durations) {
            return {
                plan: this._baseExecutionPlan,
                duration: computeTotalDuration(this._baseExecutionPlan),
            }
        }

        const newPlan: ExecutionPlan<G> = []
        let segLength = 0
        for (const segment of this._baseExecutionPlan) {
            if (segment.node.type === 'SEGMENT') segLength++
        }

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
                newPlan.push(segment)
            }
        }

        return { plan: newPlan, duration: computeTotalDuration(newPlan) }
    }

    /**
     * Same as `_buildExecutionPlan`, but commits the resulting `duration`.
     */
    protected _resolveExecutionPlan(
        keyframes?: Array<G | 'keep'>,
        durations?: Array<number | 'keep'>
    ): ExecutionPlan<G> {
        const { plan, duration } = this._buildExecutionPlan(
            keyframes,
            durations
        )
        this._totalDuration = duration
        return plan
    }

    protected _commitDuration(duration: number): void {
        this._totalDuration = duration
    }

    /**
     * Drops runtime duration overrides.
     */
    protected _restoreDuration(): void {
        this._totalDuration = this._baseDuration
    }

    // Abstract public members

    public abstract play(...args: PlayArgs): unknown
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

/** How a `play()` run ended (shared by every engine). */
export type RunResult =
    | 'ended'
    | 'interrupted'
    | 'skipped'
    | 'reset'
    | 'disposed'
