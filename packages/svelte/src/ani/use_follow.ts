import {
    type Follower,
    type FollowOptions,
    follow,
} from '@freestylejs/ani-core'
import type { Action } from 'svelte/action'
import { bindOptions, type StyleResolver, toStyleString } from './shared'
import { useTimeline } from './use_timeline'

export interface UseFollowOptions extends FollowOptions {
    /**
     * Maps animated values to style declarations.
     */
    resolver?: StyleResolver
}

/**
 * Spring follower for an element: `<div use:action style={style}>`, then
 * `follower.set(...)` / `follower.jump(...)`.
 *
 * The follower is owned: it is disposed when the component is destroyed. The
 * action binds on mount and unbinds on destroy.
 *
 * @returns `action`, `style` (the initial inline style) and the `follower`.
 */
export function useFollow<G extends Record<string, number>>(
    initial: G,
    options: UseFollowOptions = {}
): {
    action: Action<HTMLElement>
    style: string | undefined
    follower: Follower<G>
} {
    const { resolver, ...followOptions } = options
    const follower = useTimeline(() => follow(initial, followOptions))

    const action: Action<HTMLElement> = (node) => {
        const unbind = follower.bind(node, bindOptions(resolver))
        return { destroy: unbind }
    }

    return { action, style: toStyleString(initial, resolver), follower }
}
