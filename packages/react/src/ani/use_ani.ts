import type { AniGroup, Groupable, RafAniTimeline } from '@freestylejs/ani-core'
import { useCallback, useSyncExternalStore } from 'react'

/**
 * Reactive ani animation hook.
 *
 * @param timeline - `Timeline` instance.
 * @param initialValue - Initial value for the animation.
 *
 * @returns `[value, timeline]`.
 */
export function useAni<G extends Groupable>(
    timeline: RafAniTimeline<G>,
    initialValue: AniGroup<G>
): readonly [AniGroup<G>, RafAniTimeline<G>] {
    const subscribe = useCallback(
        // [subscribe -> unsubscribe]
        (onStoreChange: () => void) => timeline.onUpdate(onStoreChange),
        [timeline]
    )

    const getSnapshot = useCallback((): AniGroup<G> => {
        return timeline.getCurrentValue() ?? initialValue
    }, [timeline, initialValue])

    const value = useSyncExternalStore(subscribe, getSnapshot)

    return [value, timeline] as const
}
