import { onCleanup } from 'solid-js'

/**
 * Creates a timeline, group, follower or any object with `dispose()` and
 * disposes it when the current owner is cleaned up.
 *
 * @param factory - Called once, synchronously.
 */
export function createTimeline<T extends { dispose(): void }>(
    factory: () => T
): T {
    const object = factory()
    onCleanup(() => object.dispose())
    return object
}
