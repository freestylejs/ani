import {
    type Follower,
    type FollowOptions,
    follow,
} from '@freestylejs/ani-core'
import type { CSSProperties } from 'react'
import { useMemo, useRef } from 'react'
import {
    bindOptions,
    createElementRef,
    type ElementRef,
    type StyleResolver,
    useInitialStyle,
    useLatest,
} from './bind_ref'
import { useOwned } from './owned'

/**
 * Spring follower hook: the element chases `follower.set(target)` without
 * rendering per frame.
 *
 * `initial` and `options` are read on the first render only. The hook owns
 * the follower and disposes it on unmount; `follower` is stable.
 *
 * @param initial - Initial value; its keys are fixed for the follower's life.
 * @param options - Spring constants, clock and an optional style `resolver`.
 */
export function useFollow<G extends Record<string, number>>(
    initial: G,
    options: FollowOptions & { resolver?: StyleResolver } = {}
): {
    ref: ElementRef
    style: CSSProperties | undefined
    follower: Follower<G>
} {
    const first = useRef({ initial, options })
    const [follower] = useOwned(() => {
        const { resolver: _resolver, ...followOptions } = first.current.options
        return follow(first.current.initial, followOptions)
    }, [])
    const resolver = useLatest(options.resolver)
    const style = useInitialStyle(first.current.initial, options.resolver)

    const ref = useMemo(
        () =>
            createElementRef((element) =>
                follower.bind(element, bindOptions(resolver.current))
            ),
        [follower, resolver]
    )

    return { ref, style, follower }
}
