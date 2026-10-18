import type {
    AniGroup,
    Groupable,
    RafGroup,
    Resolver,
} from '@freestylejs/ani-core'
import type { Accessor, JSX } from 'solid-js'
import { bindOptions, createBinder, createInitialStyle } from './bind_element'

/**
 * Non-reactive element animation for a group: `ref(index)` binds one element
 * to target `index` of the group through core.
 *
 * `group` may be an accessor; swaps rebind every element. The primitive never
 * disposes a group it is given. Use as `<div ref={ref(i)} style={style()}>`.
 *
 * @param group - Group or accessor of one.
 * @param options - `initialValue` for the initial `style()`, `resolver` for the style mapping.
 * @returns `{ ref, style }`
 */
export function createAniGroup<G extends Groupable>(
    group: RafGroup<G> | Accessor<RafGroup<G>>,
    options: {
        initialValue?: AniGroup<G>
        resolver?: Resolver<Record<string, number>>
    } = {}
): {
    ref: (index: number) => (element: HTMLElement) => void
    style: Accessor<JSX.CSSProperties | undefined>
} {
    const { initialValue, resolver } = options
    const isAccessor = typeof group === 'function'
    const attach = createBinder<RafGroup<G>>(
        isAccessor ? group : () => group,
        isAccessor
    )
    const style = createInitialStyle(
        initialValue as Record<string, number> | undefined,
        resolver
    )

    return {
        ref: (index) => (element) =>
            attach((g) => g.bindAt(index, element, bindOptions(resolver))),
        style: () => style,
    }
}
