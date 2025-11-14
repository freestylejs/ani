import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import { useEffect, useMemo, useState } from 'react'

export function useAniStates<const AnimationStates extends AnimationStateShape>(
    props: StateProps<AnimationStates>
) {
    const statesController = useMemo(() => createStates(props), [])
    const [timeline, setTimeline] = useState<GetTimeline<AnimationStates>>(
        statesController.timeline()
    )

    useEffect(() => {
        const destroy = statesController.onTimelineChange(setTimeline)
        return () => destroy()
    }, [])

    const [state, setAniState] = useState<keyof AnimationStates>(props.initial)

    const transitionTo: StateController<AnimationStates>['transitionTo'] = (
        newState: keyof AnimationStates,
        timelineConfig,
        canBeIntercepted
    ) => {
        setAniState(newState)
        statesController.transitionTo(
            newState,
            timelineConfig,
            canBeIntercepted
        )
    }

    return [{ state, timeline }, transitionTo] as const
}
