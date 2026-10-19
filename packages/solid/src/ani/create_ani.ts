import type { AniGroup, Groupable, RafTimeline } from '@freestylejs/ani-core'
import { createTimelineController } from '@freestylejs/ani-core'
import {
    type Accessor,
    createEffect,
    createSignal,
    onCleanup,
    untrack,
} from 'solid-js'

/**
 * Reactive ani animation hook.
 *
 * @param timeline - `Timeline` or an accessor of one; swaps are followed.
 * @param initialValue - Initial value for the animation state.
 *
 * @returns `[valueAccessor, controller]`; the controller follows swaps.
 */
export function createAni<G extends Groupable>(
    timeline: RafTimeline<G> | Accessor<RafTimeline<G>>,
    initialValue: AniGroup<G>
): readonly [Accessor<AniGroup<G>>, RafTimeline<G>] {
    const current: Accessor<RafTimeline<G>> =
        typeof timeline === 'function' ? timeline : () => timeline
    const [value, setValue] = createSignal<AniGroup<G>>(
        untrack(current).value ?? initialValue
    )

    createEffect(() => {
        const tl = current()
        // Sync immediate value
        const latest = tl.value ?? initialValue
        setValue(() => latest)

        const unsubscribe = tl.onUpdate((val) => {
            setValue(() => val.state)
        })
        onCleanup(unsubscribe)
    })

    return [value, createTimelineController<G>(() => untrack(current))] as const
}
