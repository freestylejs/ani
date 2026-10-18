import type { AniGroup, Groupable, RafTimeline } from '@freestylejs/ani-core'
import type { Action } from 'svelte/action'
import type { Readable } from 'svelte/store'
import {
    bindOptions,
    isReadable,
    type StyleResolver,
    toStyleString,
} from './shared'

export interface UseAniRefOptions<G extends Groupable> {
    /**
     * Initial value, rendered as the `style` string.
     */
    initialValue?: AniGroup<G>
    /**
     * Maps animated values to style declarations.
     */
    resolver?: StyleResolver
}

/**
 * Element ref for a timeline: `<div use:action style={style}>`.
 *
 * `timeline` may be a timeline or a store of one; swaps rebind every mounted
 * node. The action binds on mount and unbinds on destroy; it never disposes
 * the timeline it was given.
 *
 * @returns `action` and `style`, the initial inline style (when `initialValue` is given).
 */
export function useAniRef<G extends Groupable>(
    timeline: RafTimeline<G> | Readable<RafTimeline<G>>,
    options: UseAniRefOptions<G> = {}
): { action: Action<HTMLElement>; style: string | undefined } {
    const { initialValue, resolver } = options
    const style =
        initialValue === undefined
            ? undefined
            : toStyleString(initialValue, resolver)

    const action: Action<HTMLElement> = (node) => {
        let unbind: (() => void) | undefined
        const bind = (current: RafTimeline<G>) => {
            unbind?.()
            unbind = current.bind(node, bindOptions(resolver))
        }

        const unsubscribe = isReadable<RafTimeline<G>>(timeline)
            ? timeline.subscribe(bind)
            : (bind(timeline), undefined)

        return {
            destroy() {
                unsubscribe?.()
                unbind?.()
                unbind = undefined
            },
        }
    }

    return { action, style }
}
