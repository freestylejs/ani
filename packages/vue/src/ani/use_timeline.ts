import { getCurrentScope, onScopeDispose } from 'vue'

/**
 * Owner primitive: creates an object with `factory` and disposes it with the
 * current scope (component unmount). Outside a scope the caller disposes it.
 *
 * @returns The created object.
 */
export function useTimeline<T extends { dispose(): void }>(
    factory: () => T
): T {
    const owned = factory()
    if (getCurrentScope()) {
        onScopeDispose(() => owned.dispose())
    }
    return owned
}
