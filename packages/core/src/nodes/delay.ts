import type { AnimationId } from './base'
import { SegmentNode } from './segment'

type PreserveRecord = Record<string, any>

/**
 * Options for configuring a delay node.
 */
export interface DelayOptions {
    /** Optional identifier for the node. */
    id?: AnimationId
}

/**
 * Creates a pause in an animation sequence.
 * @param duration Duration of the delay in `seconds`.
 * @param idOrOptions Optional ID for the node, or an options object.
 */
export function delay(
    duration: number,
    idOrOptions?: AnimationId | DelayOptions,
    ...extra: unknown[]
): SegmentNode<PreserveRecord> {
    let resolvedId: AnimationId | undefined

    if (typeof idOrOptions === 'object' && idOrOptions !== null) {
        if (extra.length > 0) {
            throw new TypeError(
                '[delay] Cannot mix options object and positional arguments. Use either an options object or positional arguments.'
            )
        }
        for (const key of Object.keys(idOrOptions)) {
            if (key !== 'id') {
                throw new TypeError(
                    `[delay] Unknown option "${key}". Allowed option is "id".`
                )
            }
        }
        resolvedId = idOrOptions.id
    } else if (typeof idOrOptions === 'string') {
        resolvedId = idOrOptions
    } else if (idOrOptions === undefined) {
        resolvedId = undefined
    } else {
        throw new TypeError(
            `[delay] Expected string ID or options object, received ${typeof idOrOptions}.`
        )
    }

    return new SegmentNode<PreserveRecord>({ to: {}, duration }, resolvedId)
}
