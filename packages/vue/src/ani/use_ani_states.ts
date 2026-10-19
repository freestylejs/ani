import {
    type AnimationStateShape,
    createStates,
    createStyleSheet,
    type Resolver,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import {
    type ComputedRef,
    computed,
    getCurrentScope,
    onScopeDispose,
    type Ref,
    readonly,
    type StyleValue,
    shallowRef,
} from 'vue'
import { createElementBinder, type ElementRef, withResolver } from './element'

/**
 * State-machine animation composable. `config` is read once, at setup.
 *
 * The composable owns the state controller and disposes it with its scope
 * (component unmount). The element is written through `machine.bind`, which
 * follows every transition, so `transitionTo` may be called at any time,
 * including inside `setup()`.
 */
export function useAniStates<const S extends AnimationStateShape>(
    config: StateProps<S> & { resolver?: Resolver<Record<string, number>> }
): {
    ref: (element: ElementRef) => void
    style: ComputedRef<StyleValue | undefined>
    state: Readonly<Ref<keyof S>>
    transitionTo: StateController<S>['transitionTo']
    machine: StateController<S>
} {
    const machine = createStates<S>(config)
    const state = shallowRef<keyof S>(machine.state())
    // also fires when a failed transition rolls back
    machine.onTransition((next) => {
        state.value = next
    })

    const binder = createElementBinder((target) =>
        machine.bind(target, withResolver(config.resolver))
    )
    const initial = config.initialValue as Record<string, number>
    const style = computed(() => createStyleSheet(initial, config.resolver))

    if (getCurrentScope()) {
        onScopeDispose(() => {
            binder.dispose()
            machine.dispose()
        })
    }

    return {
        ref: binder.set,
        style,
        state: readonly(state) as Readonly<Ref<keyof S>>,
        transitionTo: machine.transitionTo,
        machine,
    }
}
