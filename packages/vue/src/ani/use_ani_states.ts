import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import {
    getCurrentScope,
    onScopeDispose,
    type Ref,
    readonly,
    ref,
    shallowRef,
} from 'vue'
import { useAniRef } from './use_ani_ref'

/**
 * State-machine animation composable. `props` are read once, at setup.
 *
 * The composable owns the state controller and disposes it with its scope
 * (component unmount), stopping any running timeline. `transitionTo` may be
 * called at any time, including inside `setup()`: the timeline swap is
 * subscribed synchronously and bound when the element mounts.
 */
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
    const state = ref<keyof AnimationStates>(props.initial)

    const [elementRef] = useAniRef({
        timeline: timeline,
        initialValue: props.initialFrom,
    })

    statesController.onTimelineChange((newTimeline) => {
        timeline.value = newTimeline
        state.value = statesController.state()
    })
    if (getCurrentScope()) {
        onScopeDispose(() => statesController.dispose())
    }

    const transitionTo: StateController<AnimationStates>['transitionTo'] = (
        newState,
        timelineConfig,
        canBeIntercepted
    ) => {
        // Controller first: it validates atomically and may reject.
        statesController.transitionTo(
            newState,
            timelineConfig,
            canBeIntercepted
        )
        state.value = statesController.state()
    }

    return [
        elementRef,
        {
            state: readonly(state) as Readonly<Ref<keyof AnimationStates>>,
            // NOTE: no readonly() here — wrapping the class instance in a
            // deep readonly proxy breaks identity and blocks internal
            // timeline mutations. shallowRef alone is already shallow.
            timeline: timeline as Readonly<Ref<GetTimeline<AnimationStates>>>,
        },
        transitionTo,
    ] as const
}
