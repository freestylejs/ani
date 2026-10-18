import type { AniGroup, Groupable, RafTimeline } from '@freestylejs/ani-core'
import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import {
    bindOptions,
    createElementRef,
    type ElementRef,
    type StyleResolver,
    useInitialStyle,
    useLatest,
} from './bind_ref'

export interface UseAniRefOptions<G extends Groupable> {
    /** Value rendered as the initial inline style (also on the server). */
    initialValue?: AniGroup<G>
    /** Maps animated values to style declarations. */
    resolver?: StyleResolver
}

/**
 * Non-reactive element animation: the timeline writes the element's style
 * through `bind`, without rendering per frame.
 *
 * `ref` is stable per `timeline`. A new `timeline` rebinds the current
 * element; detaching or unmounting unbinds it. The hook never disposes the
 * `timeline` it is given.
 *
 * @param timeline - Timeline that drives the element.
 * @param options - `initialValue` for the initial `style`, `resolver` read when an element attaches.
 *
 * @returns `{ ref, style }`: spread both onto the element.
 */
export function useAniRef<G extends Groupable>(
    timeline: RafTimeline<G>,
    options: UseAniRefOptions<G> = {}
): { ref: ElementRef; style: CSSProperties | undefined } {
    const resolver = useLatest(options.resolver)
    const style = useInitialStyle(
        options.initialValue as Record<string, number> | undefined,
        options.resolver
    )
    const ref = useMemo(
        () =>
            createElementRef((element) =>
                timeline.bind(element, bindOptions(resolver.current))
            ),
        [timeline, resolver]
    )
    return { ref, style }
}
