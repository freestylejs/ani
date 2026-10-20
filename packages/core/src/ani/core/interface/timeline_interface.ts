import { createAniError } from '~/error'
import { type AnimationNode, SegmentNode, type SegmentNodeProps } from '~/nodes'
import { type BuiltPlan, buildPlan, unstableLoops } from '../plan_builder'
import { loopEnds, type PlanLoop, planStateOf } from '../plan_state'
import type { ExecutionPlan, ExecutionSegment, Groupable } from './core_types'

declare const __ANI_DEV__: boolean

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
     * Initial delay before animation starts (seconds).
     */
    delay?: number
    /**
     * Dynamic target overrides, one per segment node as written in the tree
     * (ordered by start time). The child of a loop is one entry whatever the
     * loop count; it applies to every iteration.
     */
    keyframes?: Array<G | 'keep'>
    /**
     * Dynamic duration overrides, one per segment node as written in the tree
     * (ordered by start time), see `keyframes`.
     */
    durations?: Array<number | 'keep'>
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
            throw createAniError(
                RangeError,
                'ANI_INVALID_OPTIONS',
                __ANI_DEV__
                    ? `[Timeline] \`reducedMotion.maxDuration\` must be a finite number > 0 (seconds), received ${String(maxDuration)}.`
                    : ''
            )
        }
        return { maxDuration }
    }
    throw createAniError(
        TypeError,
        'ANI_INVALID_OPTIONS',
        __ANI_DEV__
            ? `[Timeline] \`reducedMotion\` must be 'jump', 'ignore' or { maxDuration }, received ${String(policy)}.`
            : ''
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
    plan: ExecutionPlan<G>,
    loops: readonly PlanLoop[]
): number {
    let total = 0
    for (const segment of plan) {
        if (segment.endTime > total) total = segment.endTime
    }
    for (const end of loopEnds(loops).values()) {
        if (end > total) total = end
    }
    return total
}

/** Options of `TimelineBase`. */
export interface TimelineBaseOptions<G extends Groupable> {
    /**
     * Writes every finite loop out instead of representing it once. The values
     * are the same; engines that sample the plan per segment (WAAPI) need it.
     */
    expandLoops?: boolean
    /** Node to plan instead of the root (its duration still is the root's). */
    planRoot?: AnimationNode<G>
}

export abstract class TimelineBase<G extends Groupable> {
    /**
     * Total duration of the currently resolved execution plan.
     * Reflects runtime `durations` overrides. `Infinity` when the tree
     * contains an endless loop.
     */
    public get duration(): number {
        return this._totalDuration
    }

    protected readonly _baseExecutionPlan: ExecutionPlan<G>
    protected _currentExecutionPlan: ExecutionPlan<G> | null = null

    private _totalDuration: number
    private readonly _baseDuration: number
    private readonly _base: BuiltPlan<G>
    private readonly _planRoot: AnimationNode<G>
    private readonly _expandLoops: boolean

    constructor(
        protected readonly rootNode: AnimationNode<G>,
        options: TimelineBaseOptions<G> = {}
    ) {
        this._planRoot = options.planRoot ?? rootNode
        this._expandLoops = options.expandLoops === true
        this._base = buildPlan(this._planRoot, {
            expandAll: this._expandLoops,
        })
        this._baseExecutionPlan = this._base.plan
        // The base plan is shared (compile caches key on its identity) and
        // handed out as-is when no override is requested: keep it immutable.
        for (const segment of this._baseExecutionPlan) Object.freeze(segment)
        Object.freeze(this._baseExecutionPlan)
        this._baseDuration =
            options.planRoot === undefined
                ? computeTotalDuration(
                      this._baseExecutionPlan,
                      this._base.loops
                  )
                : rootNode.duration
        this._totalDuration = this._baseDuration

        this.pause = this.pause.bind(this)
        this.seek = this.seek.bind(this)
        this.reset = this.reset.bind(this)
        this.resume = this.resume.bind(this)
    }

    /**
     * Merges the base plan with runtime dynamic overrides, without touching
     * any timeline state (so a failing `play()` leaves the timeline intact).
     * Overridden segments get their schedule (`endTime`) and the timeline
     * `duration` recomputed from the new durations.
     *
     * Overrides address the segment nodes as written in the tree: all
     * iterations of a loop share the entry of the loop child.
     */
    protected _buildExecutionPlan(
        keyframes?: Array<G | 'keep'>,
        durations?: Array<number | 'keep'>
    ): { plan: ExecutionPlan<G>; duration: number } {
        if (!keyframes && !durations) {
            return {
                plan: this._baseExecutionPlan,
                duration: computeTotalDuration(
                    this._baseExecutionPlan,
                    this._base.loops
                ),
            }
        }

        const { slotCount } = this._base
        if (keyframes && keyframes.length !== slotCount) {
            throw createAniError(
                Error,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? `[Timeline] Keyframe mismatch: Expected ${slotCount}, received ${keyframes.length}.`
                    : ''
            )
        }
        if (durations && durations.length !== slotCount) {
            throw createAniError(
                Error,
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? `[Timeline] Duration mismatch: Expected ${slotCount}, received ${durations.length}.`
                    : ''
            )
        }

        // A loop whose iterations no longer repeat each other (a duration
        // that runs past the iteration, or a target that adds a property
        // another segment writes meanwhile) is written out and the plan
        // rebuilt.
        const expand = new Map<object, Set<number>>()
        let base = this._base
        for (;;) {
            const { plan, loops } = this._override(base, keyframes, durations)
            const bad = unstableLoops(plan, loops, keyframes !== undefined)
            if (bad.length === 0) {
                return { plan, duration: computeTotalDuration(plan, loops) }
            }
            for (const loop of bad) {
                let starts = expand.get(loop.node)
                if (starts === undefined) {
                    starts = new Set()
                    expand.set(loop.node, starts)
                }
                starts.add(loop.startTime)
            }
            base = buildPlan(this._planRoot, {
                expandAll: this._expandLoops,
                expand,
            })
        }
    }

    private _override(
        base: BuiltPlan<G>,
        keyframes: Array<G | 'keep'> | undefined,
        durations: Array<number | 'keep'> | undefined
    ): { plan: ExecutionPlan<G>; loops: PlanLoop[] } {
        const plan: ExecutionPlan<G> = []
        const replaced = new Map<ExecutionSegment<G>, ExecutionSegment<G>>()
        for (const segment of base.plan) {
            const rank = base.rankOf[segment.slot ?? 0]!
            const dynamicTo = keyframes?.[rank]
            const dynamicDuration = durations?.[rank]

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

            const newSegment = new SegmentNode(newSegmentProps, segment.node.id)
            const next: ExecutionSegment<G> = {
                node: newSegment,
                startTime: segment.startTime,
                endTime: segment.startTime + newSegment.duration,
                ...(segment.slot !== undefined && { slot: segment.slot }),
            }
            replaced.set(segment, next)
            plan.push(next)
        }

        const loops = base.loops.map((loop): PlanLoop => {
            const iterations = loop.iterations.map((iteration) =>
                iteration.map((segment) => replaced.get(segment as never)!)
            )
            return {
                ...loop,
                iterations: iterations as unknown as PlanLoop['iterations'],
            }
        })
        planStateOf(plan).loops = loops
        return { plan, loops }
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
