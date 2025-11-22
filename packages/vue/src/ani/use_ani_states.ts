import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import {
    onBeforeUnmount,
    onMounted,
    type Ref,
    readonly,
    ref,
    shallowRef,
} from 'vue'
import { useAniRef } from './use_ani_ref'

export function useAniStates<
    const AnimationStates extends Record<string, any> & AnimationStateShape,
>(
    props: StateProps<AnimationStates>
): readonly [
    Ref<HTMLElement | null>,
    {
        state: Readonly<Ref<keyof AnimationStates>>
        timeline: Readonly<Ref<GetTimeline<AnimationStates>>>
    },
    StateController<AnimationStates>['transitionTo'],
] {
    const statesController = createStates(props)
    const timeline = shallowRef<GetTimeline<AnimationStates>>(
        statesController.timeline()
    )

    const [elementRef] = useAniRef({
        timeline: timeline,
        initialValue: props.initialFrom,
    })

    let unsubscribe: () => void
    onMounted(() => {
        unsubscribe = statesController.onTimelineChange((newTimeline) => {
            timeline.value = newTimeline
        })
    })
    onBeforeUnmount(() => {
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
        elementRef,
        {
            state: readonly(state) as Readonly<Ref<keyof AnimationStates>>,
            timeline: readonly(timeline) as Readonly<
                Ref<GetTimeline<AnimationStates>>
            >,
        },
        transitionTo,
    ] as const
}
