import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import { useEffect, useMemo, useState } from 'react'
import { useAniRef } from './use_ani_ref'

export function useAniStates<
    Element extends HTMLElement,
    const AnimationStates extends AnimationStateShape,
>(ref: React.RefObject<Element | null>, props: StateProps<AnimationStates>) {
    const controller = useMemo(() => createStates(props), [])

    const [timeline, setTimeline] = useState<GetTimeline<AnimationStates>>(
        controller.timeline()
    )

    const [state, setState] = useState<keyof AnimationStates>(props.initial)

    useAniRef(ref, {
        timeline,
        initialValue: props.initialFrom,
    })

    useEffect(() => {
        const unsubscribe = controller.onTimelineChange(setTimeline)
        return unsubscribe
    }, [controller])

    const transitionTo: StateController<AnimationStates>['transitionTo'] = (
        newState: keyof AnimationStates,
        timelineConfig,
        canBeIntercepted
    ) => {
        setState(newState)
        controller.transitionTo(newState, timelineConfig, canBeIntercepted)
    }

    return [{ state, timeline }, transitionTo] as const
}
