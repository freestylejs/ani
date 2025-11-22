import type { AniGroup, Groupable, RafAniTimeline } from '@freestylejs/ani-core'
import { onBeforeUnmount, onMounted, type Ref, ref } from 'vue'

export function useAni<G extends Groupable>(
    timeline: RafAniTimeline<G>,
    initialValue: AniGroup<G>
): readonly [Ref<AniGroup<G>>, RafAniTimeline<G>] {
    const value = ref(timeline.getCurrentValue() ?? initialValue) as Ref<
        AniGroup<G>
    >
    let unsubscribe: () => void

    onMounted(() => {
        // Sync immediate value on mount
        const current = timeline.getCurrentValue() ?? initialValue
        value.value = current

        unsubscribe = timeline.onUpdate((newValue) => {
            value.value = newValue.state
        })
    })

    onBeforeUnmount(() => {
        if (unsubscribe) {
            unsubscribe()
        }
    })

    return [value, timeline]
}
