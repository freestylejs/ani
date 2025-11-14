import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import { createEffect, createSignal } from 'solid-js'

export function createAniStates<
    const AnimationStates extends AnimationStateShape,
>(
    props: StateProps<AnimationStates>
): readonly [
    {
        state: () => keyof AnimationStates
        timeline: () => GetTimeline<AnimationStates>
    },
    StateController<AnimationStates>['transitionTo'],
] {
    const statesController = createStates(props)
    const [timeline, setTimeline] = createSignal<GetTimeline<AnimationStates>>(
        statesController.timeline()
    )

    createEffect(() => {
        const destroy = statesController.onTimelineChange(setTimeline)
        return () => destroy()
    })

    const [state, setState] = createSignal<keyof AnimationStates>(props.initial)

    const transitionTo: StateController<AnimationStates>['transitionTo'] = (
        newState,
        timelineConfig,
        canBeIntercepted
    ) => {
        setState(newState as string)
        statesController.transitionTo(
            newState,
            timelineConfig,
            canBeIntercepted
        )
    }

    return [{ state, timeline }, transitionTo] as const
}
