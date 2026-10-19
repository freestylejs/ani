import type {
    AnimationStateShape,
    StateController,
    StateProps,
} from '@freestylejs/ani-core'
import { createStates } from '@freestylejs/ani-core'
import type { CSSProperties } from 'react'
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import {
    bindOptions,
    createElementRef,
    type ElementRef,
    type StyleResolver,
    useInitialStyle,
    useLatest,
} from './bind_ref'
import { useOwned } from './owned'

/**
 * State-machine animation hook.
 *
 * `config` is read once, when the component first renders (like `useState`'s
 * initial value): later changes are ignored. Remount with a `key` to start
 * from different props.
 *
 * The hook owns the machine: it is disposed on unmount (stopping any running
 * timeline). `ref` writes the machine's value to the element through
 * `machine.bind`; `state` re-renders on transitions; `transitionTo` is stable.
 *
 * @param config - `createStates` props plus an optional style `resolver`.
 */
export function useAniStates<const S extends AnimationStateShape>(
    config: StateProps<S> & { resolver?: StyleResolver }
): {
    ref: ElementRef
    style: CSSProperties | undefined
    state: keyof S
    transitionTo: StateController<S>['transitionTo']
    machine: StateController<S>
} {
    const first = useRef(config)
    const [machine, slot] = useOwned(() => {
        const { resolver: _resolver, ...props } = first.current
        return createStates<S>(props as StateProps<S>)
    }, [])
    const resolver = useLatest(config.resolver)

    const style = useInitialStyle(
        first.current.initialValue as Record<string, number>,
        first.current.resolver
    )

    const ref = useMemo(
        () =>
            createElementRef((element) =>
                machine.bind(element, bindOptions(resolver.current))
            ),
        [machine, resolver]
    )

    const subscribe = useCallback(
        (onChange: () => void) => machine.onTransition(onChange),
        [machine]
    )
    const state = useSyncExternalStore(subscribe, machine.state, machine.state)

    // Reads the live machine, which StrictMode may have re-created.
    const transitionTo: StateController<S>['transitionTo'] = useCallback(
        (newState, timelineConfig) =>
            slot.current.value.transitionTo(newState, timelineConfig),
        [slot]
    )

    return { ref, style, state, transitionTo, machine }
}
