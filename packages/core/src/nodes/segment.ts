import type { ExecutionPlan, Groupable, SegmentTiming } from '~/ani/core'
import { planStateOf } from '~/ani/core/plan_state'
import { createAniError } from '~/error'
import { type AnimationId, AnimationNode } from './base'
import { type Footprint, segmentFootprint } from './footprint'

declare const __ANI_DEV__: boolean

function isTarget(to: unknown): boolean {
    if (typeof to !== 'object' || to === null) return false
    return Object.values(to).every(
        (value) => typeof value === 'number' && Number.isFinite(value)
    )
}

function describe(value: unknown): string {
    return value === null ? 'null' : typeof value
}

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
    readonly footprint: Footprint

    constructor(
        props: SegmentNodeProps<G> & { id?: AnimationId },
        id?: AnimationId
    ) {
        const resolvedId = id === undefined ? props.id : id
        super(resolvedId)
        if (!Number.isFinite(props.duration) || props.duration < 0) {
            throw createAniError(
                RangeError,
                'ANI_INVALID_NODE',
                __ANI_DEV__
                    ? `[SegmentNode] duration must be a finite number >= 0 (seconds), received ${props.duration}.`
                    : ''
            )
        }
        if (!isTarget(props.to)) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_NODE',
                __ANI_DEV__
                    ? `[SegmentNode] to must be an array or a record of finite numbers, received ${describe(props.to)}.`
                    : ''
            )
        }
        const nodeProps: SegmentNodeProps<G> = {
            to: props.to,
            duration: props.duration,
            ...(props.timing !== undefined && { timing: props.timing }),
        }
        this.props = nodeProps
        this.footprint = segmentFootprint(props.to, props.duration)
    }

    public get duration(): number {
        return this.props.duration
    }

    public construct(plan: ExecutionPlan<G>, startTime: number): void {
        const state = planStateOf(plan)
        const slot = state.slot++
        state.slotStart[slot] ??= startTime
        plan.push({
            node: this,
            startTime: startTime,
            endTime: startTime + this.duration,
            slot,
        })
    }
}

/**
 * Single animation segment.
 *
 * @param props Animation config with optional node ID.
 */
export function ani<G extends Groupable>(
    props: SegmentNodeProps<G> & { id?: AnimationId }
): SegmentNode<G>
export function ani<G extends Groupable>(
    props: SegmentNodeProps<G> & { id?: AnimationId },
    ...extra: unknown[]
): SegmentNode<G> {
    if (extra.length > 0) {
        throw createAniError(
            TypeError,
            'ANI_REMOVED_API',
            __ANI_DEV__
                ? '[ani] Unexpected extra argument. Pass the id in the props: `ani({ to, duration, id })`.'
                : ''
        )
    }
    return new SegmentNode(props)
}
