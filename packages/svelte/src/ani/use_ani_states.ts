import {
    type AnimationNode,
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type Groupable,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import { type Readable, readable, writable } from 'svelte/store'

export function useAniStates<
    const AnimationStates extends AnimationStateShape = Record<
        string,
        AnimationNode<Groupable>
    >,
>(
    props: StateProps<AnimationStates>
): readonly [
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
        {
            state: readable(props.initial, (set) => stateStore.subscribe(set)),
            timeline: readable(statesController.timeline(), (set) =>
                timelineStore.subscribe(set)
            ),
        },
        transitionTo,
    ] as const
}
