import type {
    AniGroup,
    Groupable,
    Timeline,
    TimelineController,
} from '@freestylejs/ani-core'
import { useCallback, useMemo, useSyncExternalStore } from 'react'

/**
 * Reactive ani animation hook.
 *
 * @param timeline - `Timeline` instance.
 * @param initialValue - Initial value for the animation.
 *
 * @returns `[value, controller]`.
 */
export function useAni<G extends Groupable>(
    timeline: Timeline<G>,
    initialValue: AniGroup<G>
): readonly [AniGroup<G>, TimelineController<G>] {
    const subscribe = useCallback(
        // [subscribe -> unsubscribe]
        (onStoreChange: () => void) => timeline.onUpdate(onStoreChange),
        [timeline]
    )

    const getSnapshot = useCallback((): AniGroup<G> => {
        return timeline.getCurrentValue() ?? initialValue
    }, [timeline, initialValue])

    const value = useSyncExternalStore(subscribe, getSnapshot)

    const controller = useMemo((): TimelineController<G> => {
        return {
            play: timeline.play,
            seek: timeline.seek,
            pause: timeline.pause,
            resume: timeline.resume,
            reset: timeline.reset,
        }
    }, [timeline])

    return [value, controller] as const
}
