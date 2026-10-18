import {
    createStyleSheet,
    type Follower,
    type FollowOptions,
    follow,
    type Resolver,
} from '@freestylejs/ani-core'
import {
    type ComputedRef,
    computed,
    getCurrentScope,
    onScopeDispose,
    type StyleValue,
} from 'vue'
import { createElementBinder, type ElementRef, withResolver } from './element'

/**
 * Spring follower bound to an element: `<div :ref="ref" :style="style">`.
 *
 * The composable owns the follower and disposes it with its scope; outside a
 * scope the caller calls `follower.dispose()`.
 *
 * @param initial Initial value, rendered as the initial inline style.
 * @returns `ref` (function ref), `style` and the `follower`.
 */
export function useFollow<G extends Record<string, number>>(
    initial: G,
    options: FollowOptions & {
        resolver?: Resolver<Record<string, number>>
    } = {}
): {
    ref: (element: ElementRef) => void
    style: ComputedRef<StyleValue | undefined>
    follower: Follower<G>
} {
    const { resolver, ...followOptions } = options
    const follower = follow(initial, followOptions)
    const binder = createElementBinder((target) =>
        follower.bind(target, withResolver(resolver))
    )
    const style = computed(() => createStyleSheet(initial, resolver))

    if (getCurrentScope()) {
        onScopeDispose(() => {
            binder.dispose()
            follower.dispose()
        })
    }

    return { ref: binder.set, style, follower }
}
