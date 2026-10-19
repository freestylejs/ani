import { createAniError } from '~/error'
import type { TimingFunction } from '~/timing'
import {
    type AnimationId,
    assertNoExtraArguments,
    type NodeOptions,
} from './base'
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

const STAGGER_FORM = '`stagger(children, { offset, timing, id })`'

function parseStaggerOptions(options: StaggerOptions): {
    offset: number
    timing?: TimingFunction | undefined
    id?: AnimationId | undefined
} {
    if (typeof options !== 'object' || options === null) {
        throw createAniError(
            TypeError,
            'ANI_REMOVED_API',
            `[stagger] Expected an options object, received ${typeof options}. Use ${STAGGER_FORM}.`
        )
    }
    for (const key of Object.keys(options)) {
        if (key !== 'offset' && key !== 'timing' && key !== 'id') {
            throw createAniError(
                TypeError,
                'ANI_INVALID_NODE',
                `[stagger] Unknown option "${key}". Allowed options are "offset", "timing", and "id".`
            )
        }
    }
    const { offset } = options
    if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0) {
        throw createAniError(
            RangeError,
            'ANI_INVALID_NODE',
            `[stagger] offset must be a finite number >= 0 (seconds), received ${offset}.`
        )
    }
    return { offset, timing: options.timing, id: options.id }
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

    constructor(children: Children, options: StaggerOptions) {
        const {
            offset: resolvedOffset,
            timing: resolvedTiming,
            id: resolvedId,
        } = parseStaggerOptions(options)

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
 * @param options `{ offset, timing, id }`: offset between child start times in seconds, timing inherited by children without their own, optional node ID.
 */
export function stagger<const Children extends CompositionChildren>(
    children: Children,
    options: StaggerOptions
): StaggerNode<Children>
export function stagger<const Children extends CompositionChildren>(
    children: Children,
    options: StaggerOptions,
    ...extra: unknown[]
): StaggerNode<Children> {
    assertNoExtraArguments('stagger', STAGGER_FORM, extra)
    return new StaggerNode(children, options)
}
