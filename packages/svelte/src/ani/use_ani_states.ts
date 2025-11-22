import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import type { Action } from 'svelte/action'
import { type Readable, readable, writable } from 'svelte/store'
import { useAniRef } from './use_ani_ref'

export function useAniStates<const AnimationStates extends AnimationStateShape>(
    props: StateProps<AnimationStates>
): readonly [
    Action<HTMLElement, any>,
    {
        state: Readable<keyof AnimationStates>
        timeline: Readable<GetTimeline<AnimationStates>>
    },
    StateController<AnimationStates>['transitionTo'],
] {
    const statesController = createStates(props)
    const timelineStore = writable<GetTimeline<AnimationStates>>(
        statesController.timeline()
    )

    statesController.onTimelineChange((newTimeline) => {
        timelineStore.set(newTimeline)
    })

    const stateStore = writable<keyof AnimationStates>(props.initial)

    const [ref] = useAniRef({
        timeline: timelineStore,
        initialValue: props.initialFrom,
    })

    const transitionTo: StateController<AnimationStates>['transitionTo'] = (
        newState,
        timelineConfig,
        canBeIntercepted
    ) => {
        stateStore.set(newState)
        statesController.transitionTo(
            newState,
            timelineConfig,
            canBeIntercepted
        )
    }

    return [
        ref,
        {
            state: readable(props.initial, (set) => stateStore.subscribe(set)),
            timeline: readable(statesController.timeline(), (set) =>
                timelineStore.subscribe(set)
            ),
        },
        transitionTo,
    ] as const
}
