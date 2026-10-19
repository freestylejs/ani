import type { AniGroup, Groupable, RafTimeline } from '@freestylejs/ani-core'
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
    timeline: RafTimeline<G> | Readable<RafTimeline<G>>,
    initialValue: AniGroup<G>
): readonly [Readable<AniGroup<G>>, RafTimeline<G>] {
    const getTimeline = (): RafTimeline<G> =>
        isReadable<RafTimeline<G>>(timeline) ? get(timeline) : timeline

    const store = readable(getTimeline().value ?? initialValue, (set) => {
        let unsubscribeUpdate: (() => void) | undefined
        const bind = (tl: RafTimeline<G>) => {
            unsubscribeUpdate?.()
            // Sync immediate value
            set(tl.value ?? initialValue)
            unsubscribeUpdate = tl.onUpdate((e) => set(e.state))
        }

        const unsubscribeStore = isReadable<RafTimeline<G>>(timeline)
            ? timeline.subscribe(bind)
            : (bind(timeline), undefined)

        return () => {
            unsubscribeUpdate?.()
            unsubscribeStore?.()
        }
    })

    return [store, getTimeline()]
}
