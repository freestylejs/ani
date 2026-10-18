import {
    type AnimationStateShape,
    createStates,
    type GetTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import {
    type RefObject,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import { useAniRef } from './use_ani_ref'

const useIsoLayoutEffect =
    typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * State-machine animation hook.
 *
 * `props` are read once, when the component first renders (like `useState`'s
 * initial value): later changes to `states`, `initial`, `initialFrom` or
 * `clock` are ignored. Remount with a `key` to start from different props.
 *
 * The hook owns the state controller: it is disposed on unmount (stopping any
 * running timeline). `transitionTo` is referentially stable.
 */
export function useAniStates<
    Element extends HTMLElement,
    const AnimationStates extends AnimationStateShape,
>(ref: RefObject<Element | null>, props: StateProps<AnimationStates>) {
    const propsRef = useRef(props)

    // Re-created lazily if a previous run disposed it (StrictMode / Activity
    // re-run effects on the same hook instance).
    const holder = useRef<{
        controller: StateController<AnimationStates>
        disposed: boolean
    } | null>(null)
    const ensure = useCallback(() => {
        if (!holder.current || holder.current.disposed) {
            holder.current = {
                controller: createStates(propsRef.current),
                disposed: false,
            }
        }
        return holder.current.controller
    }, [])

    const [timeline, setTimeline] = useState<GetTimeline<AnimationStates>>(() =>
        ensure().timeline()
    )
    const [state, setState] = useState<keyof AnimationStates>(
        propsRef.current.initial
    )

    useAniRef(ref, {
        timeline,
        initialValue: propsRef.current.initialFrom,
    })

    // Subscribe, then resync: a transition issued before this effect ran
    // (e.g. from a child's mount effect) would otherwise be missed.
    useIsoLayoutEffect(() => {
        const controller = ensure()
        const entry = holder.current!
        const unsubscribe = controller.onTimelineChange((next) => {
            setTimeline(next)
            setState(controller.state())
        })
        setTimeline(controller.timeline())
        setState(controller.state())
        return () => {
            unsubscribe()
            controller.dispose()
            entry.disposed = true
        }
    }, [ensure])

    const transitionTo: StateController<AnimationStates>['transitionTo'] =
        useCallback((newState, timelineConfig, canBeIntercepted) => {
            const entry = holder.current
            // After unmount the controller is disposed: stay inert.
            if (!entry || entry.disposed) return
            // Controller first: it validates atomically and may reject
            // (`canBeIntercepted`), so React state mirrors what happened.
            entry.controller.transitionTo(
                newState,
                timelineConfig,
                canBeIntercepted
            )
            setState(entry.controller.state())
        }, [])

    return [{ state, timeline }, transitionTo] as const
}
