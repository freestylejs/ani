import {
    type DependencyList,
    type RefObject,
    useEffect,
    useLayoutEffect,
    useReducer,
    useRef,
} from 'react'

// `useLayoutEffect` warns during SSR (React 18); effects never run there anyway.
export const useIsoLayoutEffect =
    typeof window === 'undefined' ? useEffect : useLayoutEffect

export interface OwnedSlot<T> {
    readonly value: T
    readonly deps: DependencyList
    disposed: boolean
}

const bump = (version: number): number => version + 1

function sameDeps(a: DependencyList, b: DependencyList): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (!Object.is(a[i], b[i])) return false
    }
    return true
}

/**
 * Creates the object on first render and disposes it when the component goes
 * away or `deps` change. Re-creates it when an effect re-run (StrictMode)
 * finds it disposed. `slot.current` always holds the live one.
 */
export function useOwned<T extends { dispose(): void }>(
    factory: () => T,
    deps: DependencyList
): readonly [T, RefObject<OwnedSlot<T>>] {
    const create = (): OwnedSlot<T> => ({
        value: factory(),
        deps,
        disposed: false,
    })
    const ref = useRef<OwnedSlot<T> | null>(null)
    const [, refresh] = useReducer(bump, 0)

    if (
        ref.current === null ||
        ref.current.disposed ||
        !sameDeps(ref.current.deps, deps)
    ) {
        ref.current = create()
    }
    const slot = ref.current

    useIsoLayoutEffect(() => {
        if (slot.disposed) {
            ref.current = create()
            refresh()
        }
        return () => {
            // A slot disposed by the StrictMode cleanup is not disposed again.
            if (slot.disposed) return
            slot.disposed = true
            slot.value.dispose()
        }
    }, [slot])

    return [slot.value, ref as RefObject<OwnedSlot<T>>] as const
}
