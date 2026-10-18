import type { ExecutionPlan, Groupable } from '~/ani/core'
import { TimingFunction } from '~/timing'

export type AnimationId = string
export type AnimationNodeType = string
export type AnimationDuration = number

/**
 * Options for configuring an animation node.
 */
export interface NodeOptions {
    /** Timing / easing function applied to the node. */
    timing?: TimingFunction | undefined
    /** Optional identifier for the node. */
    id?: AnimationId | undefined
}

/**
 * Tell a TimingFunction from an options object.
 */
export function isTimingFunction(value: unknown): value is TimingFunction {
    return (
        value instanceof TimingFunction ||
        typeof (value as TimingFunction | undefined)?.step === 'function'
    )
}

/**
 * Normalizes timing / options arguments for sequence, parallel and loop.
 */
export function parseNodeOptions(
    timingOrOptions: TimingFunction | NodeOptions | undefined,
    id: AnimationId | undefined,
    caller: string,
    extraPositional?: boolean
): { timing?: TimingFunction | undefined; id?: AnimationId | undefined } {
    if (timingOrOptions === undefined) {
        return { timing: undefined, id }
    }

    if (isTimingFunction(timingOrOptions)) {
        return { timing: timingOrOptions, id }
    }

    if (typeof timingOrOptions === 'object' && timingOrOptions !== null) {
        if (id !== undefined || extraPositional) {
            throw new TypeError(
                `[${caller}] Cannot mix options object and positional arguments. Use either an options object or positional arguments.`
            )
        }
        for (const key of Object.keys(timingOrOptions)) {
            if (key !== 'timing' && key !== 'id') {
                throw new TypeError(
                    `[${caller}] Unknown option "${key}". Allowed options are "timing" and "id".`
                )
            }
        }
        return {
            timing: timingOrOptions.timing,
            id: timingOrOptions.id,
        }
    }

    throw new TypeError(
        `[${caller}] Expected TimingFunction or options object, received ${typeof timingOrOptions}.`
    )
}

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

export type ExtractAnimationNode<AnimeNode> =
    AnimeNode extends AnimationNode<infer Group> ? Group : never
