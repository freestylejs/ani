import type {
    AniGroup,
    Groupable,
    Timeline,
    TimelineController,
} from '@freestylejs/ani-core'
import { type Readable, readable } from 'svelte/store'

export function useAni<G extends Groupable>(
    timeline: Timeline<G>,
    initialValue: AniGroup<G>
): readonly [Readable<AniGroup<G>>, TimelineController<G>] {
    const store = readable(initialValue, (set) => {
        const unsubscribe = timeline.onUpdate((e) => set(e.state))
        return () => {
            unsubscribe()
        }
    })

    const controller: TimelineController<G> = {
        play: timeline.play,
        seek: timeline.seek,
        pause: timeline.pause,
        resume: timeline.resume,
        reset: timeline.reset,
    }

    return [store, controller]
}
