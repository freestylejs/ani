import type { AniGroup, Groupable, RafAniTimeline } from '@freestylejs/ani-core'
import { createTimelineController } from '@freestylejs/ani-core'
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'

/**
 * Reactive ani animation hook. Re-renders on every timeline update; for
 * many elements prefer `useAniRef`, which writes styles without rendering.
 *
 * Follows `timeline` identity changes. `initialValue` is read on the first
 * render only (it is the value shown until the timeline has produced one).
 *
 * @param timeline - `Timeline` instance.
 * @param initialValue - Initial value for the animation.
 *
 * @returns `[value, controller]`; the controller is stable per `timeline`.
 */
export function useAni<G extends Groupable>(
    timeline: RafAniTimeline<G>,
    initialValue: AniGroup<G>
): readonly [AniGroup<G>, RafAniTimeline<G>] {
    const initial = useRef(initialValue)

    const subscribe = useCallback(
        // [subscribe -> unsubscribe]
        (onStoreChange: () => void) => timeline.onUpdate(onStoreChange),
        [timeline]
    )

    const getSnapshot = useCallback((): AniGroup<G> => {
        return timeline.value ?? initial.current
    }, [timeline])

    const value = useSyncExternalStore(
        subscribe,
        getSnapshot,
        () => initial.current
    )

    const controller = useMemo(
        () => createTimelineController<G>(() => timeline),
        [timeline]
    )

    return [value, controller] as const
}
