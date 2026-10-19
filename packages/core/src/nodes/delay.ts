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
 * @param options Optional `{ id }`.
 */
export function delay(
    duration: number,
    options?: DelayOptions
): SegmentNode<PreserveRecord>
export function delay(
    duration: number,
    options?: DelayOptions,
    ...extra: unknown[]
): SegmentNode<PreserveRecord> {
    if (extra.length > 0) {
        throw new TypeError(
            '[delay] Unexpected extra argument. Use `delay(seconds, { id })`.'
        )
    }
    if (options !== undefined) {
        if (typeof options !== 'object' || options === null) {
            throw new TypeError(
                `[delay] Expected an options object, received ${typeof options}. Use \`delay(seconds, { id })\`.`
            )
        }
        for (const key of Object.keys(options)) {
            if (key !== 'id') {
                throw new TypeError(
                    `[delay] Unknown option "${key}". Allowed option is "id".`
                )
            }
        }
    }

    return new SegmentNode<PreserveRecord>({ to: {}, duration }, options?.id)
}
