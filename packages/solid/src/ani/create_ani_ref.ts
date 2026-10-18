import type {
    AniGroup,
    Groupable,
    RafTimeline,
    Resolver,
} from '@freestylejs/ani-core'
import type { Accessor, JSX } from 'solid-js'
import { bindOptions, createBinder, createInitialStyle } from './bind_element'

/**
 * Non-reactive element animation: the timeline writes the element's style
 * through core, with no render per frame.
 *
 * `timeline` may be an accessor; swaps rebind the element. The primitive never
 * disposes a timeline it is given. Use as `<div ref={ref} style={style()}>`.
 *
 * @param timeline - Timeline or accessor of one.
 * @param options - `initialValue` for the initial `style()`, `resolver` for the style mapping.
 * @returns `{ ref, style }`
 */
export function createAniRef<G extends Groupable>(
    timeline: RafTimeline<G> | Accessor<RafTimeline<G>>,
    options: {
        initialValue?: AniGroup<G>
        resolver?: Resolver<Record<string, number>>
    } = {}
): {
    ref: (element: HTMLElement) => void
    style: Accessor<JSX.CSSProperties | undefined>
} {
    const { initialValue, resolver } = options
    const isAccessor = typeof timeline === 'function'
    const attach = createBinder<RafTimeline<G>>(
        isAccessor ? timeline : () => timeline,
        isAccessor
    )
    const style = createInitialStyle(
        initialValue as Record<string, number> | undefined,
        resolver
    )

    return {
        ref: (element) =>
            attach((tl) => tl.bind(element, bindOptions(resolver))),
        style: () => style,
    }
}
