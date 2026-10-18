import type { AniGroup, Groupable, RafAniTimeline } from '@freestylejs/ani-core'
import { createTimelineController } from '@freestylejs/ani-core'
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js'

/**
 * Reactive ani animation hook.
 *
 * @param timeline - `Timeline` accessor; swaps are followed.
 * @param initialValue - Initial value for the animation state.
 *
 * @returns `[valueAccessor, controller]`; the controller follows swaps.
 */
export function createAni<G extends Groupable>(
    timeline: () => RafAniTimeline<G>,
    initialValue: AniGroup<G>
): readonly [() => AniGroup<G>, RafAniTimeline<G>] {
    const [value, setValue] = createSignal<AniGroup<G>>(
        untrack(timeline).getCurrentValue() ?? initialValue
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

    return [
        value,
        createTimelineController<G>(() => untrack(timeline)),
    ] as const
}
