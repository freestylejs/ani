import type { AniGroup, Groupable, RafAniTimeline } from '@freestylejs/ani-core'
import { createEffect, createSignal, onCleanup } from 'solid-js'

/**
 * Reactive ani animation hook.
 *
 * @param timeline - `Timeline` instance.
 * @param initialValue - Initial value for the animation state.
 *
 * @returns `[valueAccessor, timeline]`.
 */
export function createAni<G extends Groupable>(
    timeline: () => RafAniTimeline<G>,
    initialValue: AniGroup<G>
): readonly [() => AniGroup<G>, RafAniTimeline<G>] {
    const [value, setValue] = createSignal<AniGroup<G>>(
        timeline().getCurrentValue() ?? initialValue
    )

    createEffect(() => {
        const tl = timeline()
        // Sync immediate value
        const current = tl.getCurrentValue() ?? initialValue
        setValue(() => current)

        const unsubscribe = tl.onUpdate((val) => {
            setValue(() => val.state)
        })
        onCleanup(unsubscribe)
    })

    return [value, timeline()] as const
}
