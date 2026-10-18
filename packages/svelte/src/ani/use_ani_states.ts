import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import type { Action } from 'svelte/action'
import { type Readable, writable } from 'svelte/store'
import { useAniRef } from './use_ani_ref'

/**
 * State-machine animation action. `props` are read once, when called.
 *
 * The hook owns the state controller. Svelte has no component-scope cleanup
 * callable from plain functions, so ownership follows the action: when the
 * last node using it is destroyed the controller is disposed (stopping any
 * running timeline), and applying the action to a new node afterwards starts
 * from a fresh controller in `props.initial`.
 */
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
    let controller = createStates(props)
    let unsubscribeChange: (() => void) | undefined
    let disposed = false
    let liveNodes = 0

    const timelineStore = writable<GetTimeline<AnimationStates>>(
        controller.timeline()
    )
    const stateStore = writable<keyof AnimationStates>(props.initial)

    const connect = () => {
        const current = controller
        unsubscribeChange = current.onTimelineChange((next) => {
            timelineStore.set(next)
            stateStore.set(current.state())
        })
    }
    connect()

    const [refAction] = useAniRef({
        timeline: timelineStore,
        initialValue: (props.initialValue ?? props.initialFrom)!,
    })

    const action: Action<HTMLElement, any> = (node, param) => {
        if (disposed) {
            controller = createStates(props)
            disposed = false
            connect()
            timelineStore.set(controller.timeline())
            stateStore.set(controller.state())
        }
        liveNodes++
        const bound = refAction(node, param)
        return {
            ...bound,
            destroy() {
                bound?.destroy?.()
                if (--liveNodes === 0) {
                    unsubscribeChange?.()
                    controller.dispose()
                    disposed = true
                }
            },
        }
    }

    const transitionTo: StateController<AnimationStates>['transitionTo'] = (
        newState,
        timelineConfig,
        canBeIntercepted
    ) => {
        // After disposal the controller is inert; nothing to mirror.
        if (disposed) return Promise.resolve('disposed')
        // Controller first: it validates atomically and may reject.
        const run = controller.transitionTo(
            newState,
            timelineConfig,
            canBeIntercepted
        )
        stateStore.set(controller.state())
        return run
    }

    return [
        action,
        {
            state: { subscribe: stateStore.subscribe },
            timeline: { subscribe: timelineStore.subscribe },
        },
        transitionTo,
    ] as const
}
