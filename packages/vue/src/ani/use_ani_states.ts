import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import { onMounted, onUnmounted, type Ref, readonly, ref } from 'vue'

export function useAniStates<
    const AnimationStates extends Record<string, any> & AnimationStateShape,
>(
    props: StateProps<AnimationStates>
): readonly [
    {
        state: Readonly<Ref<keyof AnimationStates>>
        timeline: Readonly<Ref<GetTimeline<AnimationStates>>>
    },
    StateController<AnimationStates>['transitionTo'],
] {
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
        {
            state: readonly(state) as Readonly<Ref<keyof AnimationStates>>,
            timeline: readonly(timeline) as Readonly<
                Ref<GetTimeline<AnimationStates>>
            >,
        },
        transitionTo,
    ] as const
}
