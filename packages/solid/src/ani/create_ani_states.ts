import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import { createEffect, createSignal } from 'solid-js'
import { createAniRef } from './create_ani_ref'

export function createAniStates<
    Element extends HTMLElement,
    const AnimationStates extends AnimationStateShape,
>(
    props: StateProps<AnimationStates>
): readonly [
    (el: Element) => void,
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

    const [ref] = createAniRef({
        timeline,
        initialValue: props.initialFrom,
    })

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

    return [ref, { state, timeline }, transitionTo] as const
}
