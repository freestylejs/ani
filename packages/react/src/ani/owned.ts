import {
    type DependencyList,
    type RefObject,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'

// `useLayoutEffect` warns during SSR (React 18); effects never run there anyway.
export const useIsoLayoutEffect =
    typeof window === 'undefined' ? useEffect : useLayoutEffect

export interface OwnedSlot<T> {
    readonly value: T
    readonly deps: DependencyList
    disposed: boolean
}

function sameDeps(a: DependencyList, b: DependencyList): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (!Object.is(a[i], b[i])) return false
    }
    return true
}

/**
 * Render candidates belong to React state, not to a ref shared with the
 * committed fiber. A suspended/abandoned render cannot replace the live owner.
 * Factories must be pure, discard-safe constructors: acquire external resources
 * or start execution only in commit callbacks/effects/events. React may discard
 * a candidate without ever committing an effect (also during SSR/StrictMode).
 */
export function useOwned<T extends { dispose(): void }>(
    factory: () => T,
    deps: DependencyList
): readonly [T, RefObject<OwnedSlot<T>>] {
    const create = (): OwnedSlot<T> => ({
        value: factory(),
        deps: [...deps],
        disposed: false,
    })
    let [slot, setSlot] = useState(create)
    const committed = useRef(slot)

    if (slot.disposed || !sameDeps(slot.deps, deps)) {
        slot = create()
        // Conditional render-state adjustment is local to this work-in-progress
        // render. React retries before committing children; it rolls this state
        // back if the render is abandoned. No committed resource is disposed here.
        setSlot(slot)
    }

    useIsoLayoutEffect(() => {
        if (slot.disposed) {
            // StrictMode reconnects effects after their cleanup. Re-activate
            // with a new inert object, then rebind through the following render.
            const replacement = create()
            committed.current = replacement
            setSlot(replacement)
        } else {
            committed.current = slot
        }
        return () => {
            if (slot.disposed) return
            slot.disposed = true
            slot.value.dispose()
        }
    }, [slot])

    return [slot.value, committed] as const
}
