import {
    type AnimationStateShape,
    createStates,
    type Resolver,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import { type Accessor, createSignal, type JSX } from 'solid-js'
import { bindOptions, createBinder, createInitialStyle } from './bind_element'
import { createTimeline } from './create_timeline'

/**
 * State-machine animation: the element follows the machine across its
 * timeline swaps through core. The primitive owns the machine and disposes it
 * with its owner. Use as `<div ref={ref} style={style()}>`.
 *
 * @param config - `createStates` config plus an optional `resolver`.
 * @returns `{ ref, style, state, transitionTo, machine }`
 */
export function createAniStates<const S extends AnimationStateShape>(
    config: StateProps<S> & { resolver?: Resolver<Record<string, number>> }
): {
    ref: (element: HTMLElement) => void
    style: Accessor<JSX.CSSProperties | undefined>
    state: Accessor<keyof S>
    transitionTo: StateController<S>['transitionTo']
    machine: StateController<S>
} {
    const { resolver, ...props } = config
    const machine = createTimeline(() =>
        createStates<S>(props as StateProps<S>)
    )
    const [state, setState] = createSignal<keyof S>(machine.state())
    machine.onTransition((next) => setState(() => next))

    const attach = createBinder(() => machine, false)
    const style = createInitialStyle(
        (config.initialValue ?? config.initialFrom) as Record<string, number>,
        resolver
    )

    return {
        ref: (element) => attach((m) => m.bind(element, bindOptions(resolver))),
        style: () => style,
        state,
        transitionTo: (newState, timelineConfig, canBeIntercepted) =>
            machine.transitionTo(newState, timelineConfig, canBeIntercepted),
        machine,
    }
}
