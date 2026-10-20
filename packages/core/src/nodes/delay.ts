import { createAniError } from '~/error'
import type { AnimationId } from './base'
import { SegmentNode } from './segment'

declare const __ANI_DEV__: boolean

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
        throw createAniError(
            TypeError,
            'ANI_REMOVED_API',
            __ANI_DEV__
                ? '[delay] Unexpected extra argument. Use `delay(seconds, { id })`.'
                : ''
        )
    }
    if (options !== undefined) {
        if (typeof options !== 'object' || options === null) {
            throw createAniError(
                TypeError,
                'ANI_REMOVED_API',
                __ANI_DEV__
                    ? `[delay] Expected an options object, received ${typeof options}. Use \`delay(seconds, { id })\`.`
                    : ''
            )
        }
        for (const key of Object.keys(options)) {
            if (key !== 'id') {
                throw createAniError(
                    TypeError,
                    'ANI_INVALID_NODE',
                    __ANI_DEV__
                        ? `[delay] Unknown option "${key}". Allowed option is "id".`
                        : ''
                )
            }
        }
    }

    return new SegmentNode<PreserveRecord>({ to: {}, duration }, options?.id)
}
