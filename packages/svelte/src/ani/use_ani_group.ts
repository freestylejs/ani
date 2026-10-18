import type { AniGroup, Groupable, RafGroup } from '@freestylejs/ani-core'
import type { Action } from 'svelte/action'
import type { Readable } from 'svelte/store'
import {
    bindOptions,
    isReadable,
    type StyleResolver,
    toStyleString,
} from './shared'

export interface UseAniGroupOptions<G extends Groupable> {
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
 * Element refs for a group: `<li use:action={index} style={style}>`.
 *
 * `group` may be a group or a store of one; swaps rebind every mounted node.
 * The action binds on mount, rebinds when its index changes and unbinds on
 * destroy; it never disposes the group it was given.
 *
 * @returns `action` and `style`, the initial inline style (when `initialValue` is given).
 */
export function useAniGroup<G extends Groupable>(
    group: RafGroup<G> | Readable<RafGroup<G>>,
    options: UseAniGroupOptions<G> = {}
): { action: Action<HTMLElement, number>; style: string | undefined } {
    const { initialValue, resolver } = options
    const style =
        initialValue === undefined
            ? undefined
            : toStyleString(initialValue, resolver)

    const action: Action<HTMLElement, number> = (node, index) => {
        let position = index as number
        let current: RafGroup<G> | undefined
        let unbind: (() => void) | undefined
        const bind = () => {
            unbind?.()
            unbind = current?.bindAt(position, node, bindOptions(resolver))
        }

        const unsubscribe = isReadable<RafGroup<G>>(group)
            ? group.subscribe((next) => {
                  current = next
                  bind()
              })
            : ((current = group), bind(), undefined)

        return {
            update(next) {
                position = next
                bind()
            },
            destroy() {
                unsubscribe?.()
                unbind?.()
                unbind = undefined
            },
        }
    }

    return { action, style }
}
