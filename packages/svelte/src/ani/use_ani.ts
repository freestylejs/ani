import type { AniGroup, Groupable, RafAniTimeline } from '@freestylejs/ani-core'
import { get, type Readable, readable } from 'svelte/store'
import { isReadable } from './shared'

/**
 * Reactive ani animation store.
 *
 * `timeline` may be a timeline or a store of one; swaps are followed while the
 * store has subscribers. Nothing is retained without subscribers.
 *
 * @returns `[store, timeline]`; the timeline is the one given, or the current
 * one of a store.
 */
export function useAni<G extends Groupable>(
    timeline: RafAniTimeline<G> | Readable<RafAniTimeline<G>>,
    initialValue: AniGroup<G>
): readonly [Readable<AniGroup<G>>, RafAniTimeline<G>] {
    const getTimeline = (): RafAniTimeline<G> =>
        isReadable<RafAniTimeline<G>>(timeline) ? get(timeline) : timeline

    const store = readable(
        getTimeline().getCurrentValue() ?? initialValue,
        (set) => {
            let unsubscribeUpdate: (() => void) | undefined
            const bind = (tl: RafAniTimeline<G>) => {
                unsubscribeUpdate?.()
                // Sync immediate value
                set(tl.getCurrentValue() ?? initialValue)
                unsubscribeUpdate = tl.onUpdate((e) => set(e.state))
            }

            const unsubscribeStore = isReadable<RafAniTimeline<G>>(timeline)
                ? timeline.subscribe(bind)
                : (bind(timeline), undefined)

            return () => {
                unsubscribeUpdate?.()
                unsubscribeStore?.()
            }
        }
    )

    return [store, getTimeline()]
}
