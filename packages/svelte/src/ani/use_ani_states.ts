import {
    type AnimationStateShape,
    createStates,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import type { Action } from 'svelte/action'
import { type Readable, readable } from 'svelte/store'
import { bindOptions, type StyleResolver, toStyleString } from './shared'
import { useTimeline } from './use_timeline'

/**
 * State machine for an element: `<div use:action style={style}>`, then
 * `transitionTo(...)`.
 *
 * The machine is owned: it is disposed when the component is destroyed. The
 * action follows its timeline swaps; it binds on mount and unbinds on destroy.
 *
 * @returns `action`, `style` (the initial inline style), the `state` store,
 * `transitionTo` and the `machine` itself.
 */
export function useAniStates<const S extends AnimationStateShape>(
    config: StateProps<S> & { resolver?: StyleResolver }
): {
    action: Action<HTMLElement>
    style: string | undefined
    state: Readable<keyof S>
    transitionTo: StateController<S>['transitionTo']
    machine: StateController<S>
} {
    const machine = useTimeline(() => createStates<S>(config))
    const { resolver } = config

    const state = readable<keyof S>(machine.state(), (set) => {
        set(machine.state())
        return machine.onTransition((next) => set(next))
    })

    const action: Action<HTMLElement> = (node) => {
        const unbind = machine.bind(node, bindOptions(resolver))
        return { destroy: unbind }
    }

    return {
        action,
        style: toStyleString(config.initialValue as object, resolver),
        state,
        transitionTo: machine.transitionTo,
        machine,
    }
}
