import type { AnimationId } from './base'
import { SegmentNode } from './segment'

type PreserveRecord = Record<string, any>

/**
 * Creates a pause in an animation sequence.
 * @param duration Duration of the delay in `seconds`.
 * @param id Optional ID for the node.
 */
export function delay(
    duration: number,
    id?: AnimationId
): SegmentNode<PreserveRecord> {
    return new SegmentNode<PreserveRecord>({ to: {}, duration }, id)
}
