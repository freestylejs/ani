import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import { createSignal, onCleanup } from 'solid-js'
import { createAniRef } from './create_ani_ref'

/**
 * State-machine animation hook. `props` are read once, at setup.
 *
 * The hook owns the state controller and disposes it with its owner,
 * stopping any running timeline.
 */
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
    const [state, setState] = createSignal<keyof AnimationStates>(props.initial)

    statesController.onTimelineChange((next) => {
        setTimeline(() => next)
        setState(() => statesController.state())
    })
    onCleanup(() => statesController.dispose())

    const [ref] = createAniRef({
        timeline,
        initialValue: (props.initialValue ?? props.initialFrom)!,
    })

    const transitionTo: StateController<AnimationStates>['transitionTo'] = (
        newState,
        timelineConfig,
        canBeIntercepted
    ) => {
        // Controller first: it validates atomically and may reject.
        const run = statesController.transitionTo(
            newState,
            timelineConfig,
            canBeIntercepted
        )
        setState(() => statesController.state())
        return run
    }

    return [ref, { state, timeline }, transitionTo] as const
}
