import {
    type Follower,
    type FollowOptions,
    follow,
    type Resolver,
} from '@freestylejs/ani-core'
import type { Accessor, JSX } from 'solid-js'
import { bindOptions, createBinder, createInitialStyle } from './bind_element'
import { createTimeline } from './create_timeline'

/**
 * A value that chases a target with a spring, written to the element through
 * core. The primitive owns the follower and disposes it with its owner. Use as
 * `<div ref={ref} style={style()}>`.
 *
 * @param initial - Initial value; `style()` is its inline style.
 * @param options - Follower options plus an optional `resolver`.
 * @returns `{ ref, style, follower }`
 */
export function createFollow<G extends Record<string, number>>(
    initial: G,
    options: FollowOptions & {
        resolver?: Resolver<Record<string, number>>
    } = {}
): {
    ref: (element: HTMLElement) => void
    style: Accessor<JSX.CSSProperties | undefined>
    follower: Follower<G>
} {
    const { resolver, ...followOptions } = options
    const follower = createTimeline(() => follow(initial, followOptions))
    const attach = createBinder(() => follower, false)
    const style = createInitialStyle(initial, resolver)

    return {
        ref: (element) => attach((f) => f.bind(element, bindOptions(resolver))),
        style: () => style,
        follower,
    }
}
