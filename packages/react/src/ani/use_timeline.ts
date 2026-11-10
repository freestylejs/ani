import type { DependencyList } from 'react'
import { useOwned } from './owned'

/**
 * Owns a committed inert object (a timeline, group or follower). Only a
 * committed dependency change replaces it; abandoned renders cannot reset it.
 * Disposes committed instances on replacement/unmount. StrictMode effect
 * reconnection re-creates a disposed instance.
 *
 * @param factory - Pure, discard-safe constructor. React may discard a render
 * candidate without disposal. Do not start playback or acquire external
 * resources here; activate the object in a ref callback, effect or event.
 * @param deps - Dependencies that replace the object when they change.
 */
export function useTimeline<T extends { dispose(): void }>(
    factory: () => T,
    deps: DependencyList = []
): T {
    return useOwned(factory, deps)[0]
}
