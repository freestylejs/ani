import type { TimingFunction } from '~/timing'
import type { AnimationId, NodeOptions } from './base'
import {
    type CompositionChildren,
    CompositionNode,
    type CompositionPlan,
} from './composition'
import {
    assertNoEndlessOverlap,
    type Footprint,
    mergeFootprints,
} from './footprint'

/**
 * Options for configuring a stagger node.
 */
export interface StaggerOptions extends NodeOptions {
    /** Fixed delay between each child start time, in seconds. */
    offset: number
}

function parseStaggerArgs(
    offsetOrOptions: number | StaggerOptions,
    timing: TimingFunction | undefined,
    id: AnimationId | undefined,
    extraPositional?: boolean
): {
    offset: number
    timing?: TimingFunction | undefined
    id?: AnimationId | undefined
} {
    if (typeof offsetOrOptions === 'object' && offsetOrOptions !== null) {
        if (timing !== undefined || id !== undefined || extraPositional) {
            throw new TypeError(
                '[stagger] Cannot mix options object and positional arguments. Use either an options object or positional arguments.'
            )
        }
        for (const key of Object.keys(offsetOrOptions)) {
            if (key !== 'offset' && key !== 'timing' && key !== 'id') {
                throw new TypeError(
                    `[stagger] Unknown option "${key}". Allowed options are "offset", "timing", and "id".`
                )
            }
        }
        const offset = (offsetOrOptions as StaggerOptions).offset
        if (
            typeof offset !== 'number' ||
            !Number.isFinite(offset) ||
            offset < 0
        ) {
            throw new RangeError(
                `[stagger] offset must be a finite number >= 0 (seconds), received ${offset}.`
            )
        }
        return {
            offset,
            timing: (offsetOrOptions as StaggerOptions).timing,
            id: (offsetOrOptions as StaggerOptions).id,
        }
    }

    const offset = offsetOrOptions as number
    if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0) {
        throw new RangeError(
            `[stagger] offset must be a finite number >= 0 (seconds), received ${offset}.`
        )
    }
    return {
        offset,
        timing,
        id,
    }
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
    readonly footprint: Footprint

    constructor(
        children: Children,
        offsetOrOptions: number | StaggerOptions,
        timing?: TimingFunction,
        id?: AnimationId,
        ...extra: unknown[]
    ) {
        const {
            offset: resolvedOffset,
            timing: resolvedTiming,
            id: resolvedId,
        } = parseStaggerArgs(offsetOrOptions, timing, id, extra.length > 0)

        super(children, resolvedTiming, resolvedId)

        this.offset = resolvedOffset
        // True temporal coverage: each child ends at (i * offset + duration).
        // Plain loop: spreading into Math.max overflows the stack for large
        // child counts.
        let duration = 0
        for (let i = 0; i < children.length; i++) {
            const end = i * resolvedOffset + children[i]!.duration
            if (end > duration) duration = end
        }
        this.duration = duration

        const placed = this.children.map((child, i) => ({
            footprint: child.footprint,
            offset: i * resolvedOffset,
        }))
        assertNoEndlessOverlap('stagger', placed)
        this.footprint = mergeFootprints(placed)
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
 * @param children Stagger children nodes.
 * @param offsetOrOptions Children animation offset, in seconds, or options object.
 * @param timing Loop timing function (positional form).
 * @param id Optional ID for the node (positional form).
 */
export function stagger<const Children extends CompositionChildren>(
    children: Children,
    offsetOrOptions: number | StaggerOptions,
    timing?: TimingFunction,
    id?: AnimationId,
    ...extra: unknown[]
): StaggerNode<Children> {
    return new StaggerNode(children, offsetOrOptions, timing, id, ...extra)
}
