import type { ExecutionPlan, Groupable } from '~/ani/core'
import { TimingFunction } from '~/timing'
import type { Footprint } from './footprint'

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
 * Throws for arguments after the options object: positional timing / id are
 * gone.
 */
export function assertNoExtraArguments(
    caller: string,
    form: string,
    extra: readonly unknown[]
): void {
    if (extra.length > 0) {
        throw new TypeError(
            `[${caller}] Unexpected extra argument. Pass everything in one options object: ${form}.`
        )
    }
}

/**
 * Validates the options object of sequence, parallel and loop.
 */
export function parseNodeOptions(
    options: NodeOptions | undefined,
    caller: string,
    form: string
): { timing?: TimingFunction | undefined; id?: AnimationId | undefined } {
    if (options === undefined) {
        return { timing: undefined, id: undefined }
    }

    if (
        typeof options !== 'object' ||
        options === null ||
        isTimingFunction(options)
    ) {
        throw new TypeError(
            `[${caller}] Expected an options object, received ${isTimingFunction(options) ? 'a timing function' : typeof options}. Use ${form}.`
        )
    }
    for (const key of Object.keys(options)) {
        if (key !== 'timing' && key !== 'id') {
            throw new TypeError(
                `[${caller}] Unknown option "${key}". Allowed options are "timing" and "id".`
            )
        }
    }
    return {
        timing: options.timing,
        id: options.id,
    }
}

/**
 * Nodes in the animation tree
 */
export abstract class AnimationNode<G extends Groupable> {
    abstract readonly type: AnimationNodeType
    /** Seconds; `Infinity` when the node contains an endless loop. */
    abstract readonly duration: AnimationDuration
    /** The properties the node writes (used to reject endless overlaps). */
    abstract readonly footprint: Footprint

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
