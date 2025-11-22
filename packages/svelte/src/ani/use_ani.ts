import type { AniGroup, Groupable, RafAniTimeline } from '@freestylejs/ani-core'
import { type Readable, readable } from 'svelte/store'

export function useAni<G extends Groupable>(
    timeline: RafAniTimeline<G>,
    initialValue: AniGroup<G>
): readonly [Readable<AniGroup<G>>, RafAniTimeline<G>] {
    const store = readable(
        timeline.getCurrentValue() ?? initialValue,
        (set) => {
            // Sync immediate value
            const current = timeline.getCurrentValue() ?? initialValue
            set(current)

            const unsubscribe = timeline.onUpdate((e) => set(e.state))
            return () => {
                unsubscribe()
            }
        }
    )

    return [store, timeline]
}
