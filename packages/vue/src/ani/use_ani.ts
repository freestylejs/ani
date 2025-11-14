import type {
    AniGroup,
    Groupable,
    Timeline,
    TimelineController,
} from '@freestylejs/ani-core'
import { onMounted, onUnmounted, type Ref, ref } from 'vue'

export function useAni<G extends Groupable>(
    timeline: Timeline<G>,
    initialValue: AniGroup<G>
): readonly [Ref<AniGroup<G>>, TimelineController<G>] {
    const value = ref(initialValue) as Ref<AniGroup<G>>
    let unsubscribe: () => void

    onMounted(() => {
        unsubscribe = timeline.onUpdate((newValue) => {
            value.value = newValue.state
        })
    })

    onUnmounted(() => {
        if (unsubscribe) {
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

    return [value, controller]
}
