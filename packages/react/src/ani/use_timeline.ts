import type { DependencyList } from 'react'
import { useOwned } from './owned'

/**
 * Owner primitive: creates an object with `dispose()` (a timeline, a group)
 * and disposes it when the component unmounts or `deps` change.
 *
 * The same instance is returned on every render. Under StrictMode, where
 * effects re-run on the same instance, a disposed object is re-created.
 *
 * @param factory - Creates the object; called on the first render and after `deps` change.
 * @param deps - Dependencies that replace the object when they change.
 */
export function useTimeline<T extends { dispose(): void }>(
    factory: () => T,
    deps: DependencyList = []
): T {
    return useOwned(factory, deps)[0]
}
