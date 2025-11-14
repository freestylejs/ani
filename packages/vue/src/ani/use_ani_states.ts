import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import { onMounted, onUnmounted, readonly, ref } from 'vue'

export function useAniStates<const AnimationStates extends AnimationStateShape>(
    props: StateProps<AnimationStates>
) {
    const statesController = createStates(props)
    const timeline = ref<GetTimeline<AnimationStates>>(
        statesController.timeline()
    )

    let unsubscribe: () => void
    onMounted(() => {
        unsubscribe = statesController.onTimelineChange((newTimeline) => {
            timeline.value = newTimeline
        })
    })
    onUnmounted(() => {
        if (unsubscribe) unsubscribe()
    })

    const state = ref<keyof AnimationStates>(props.initial)

    const transitionTo: StateController<AnimationStates>['transitionTo'] = (
        newState,
        timelineConfig,
        canBeIntercepted
    ) => {
        state.value = newState
        statesController.transitionTo(
            newState,
            timelineConfig,
            canBeIntercepted
        )
    }

    return [
        { state: readonly(state), timeline: readonly(timeline) },
        transitionTo,
    ] as const
}
