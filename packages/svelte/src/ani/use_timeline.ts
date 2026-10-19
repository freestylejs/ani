import { createAniError } from '@freestylejs/ani-core'
import { onDestroy } from 'svelte'

/**
 * Owner primitive: creates the object with `factory` and disposes it when the
 * component is destroyed. Use it for timelines and groups created in the
 * component; objects that were passed in are never disposed by the bindings.
 *
 * @throws If `factory` is not a function or does not return an object with `dispose()`.
 */
export function useTimeline<T extends { dispose(): void }>(
    factory: () => T
): T {
    if (typeof factory !== 'function') {
        throw createAniError(
            TypeError,
            'ANI_INVALID_OPTIONS',
            `[useTimeline] \`factory\` must be a function, received ${typeof factory}.`
        )
    }
    const owned = factory()
    if (
        typeof owned !== 'object' ||
        owned === null ||
        typeof owned.dispose !== 'function'
    ) {
        throw createAniError(
            TypeError,
            'ANI_INVALID_OPTIONS',
            '[useTimeline] `factory` must return an object with a `dispose()` method.'
        )
    }
    onDestroy(() => owned.dispose())
    return owned
}
