import type { PresenceEntry, PresenceKey } from './types'

function sameEntry<T>(a: PresenceEntry<T>, b: PresenceEntry<T>): boolean {
    return (
        a.key === b.key &&
        a.present === b.present &&
        a.token === b.token &&
        Object.is(a.item, b.item)
    )
}

function sameEntries<T>(
    a: readonly PresenceEntry<T>[],
    b: readonly PresenceEntry<T>[]
): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (!sameEntry(a[i]!, b[i]!)) return false
    }
    return true
}

/**
 * Pure keyed render-list transform.
 *
 * Present keys follow `next` order. Missing keys become exiting with a new
 * token. A returning key flips `present` back to true on its existing entry.
 * Exiting entries stay after their nearest previous predecessor, preserving
 * list position instead of jumping to the end.
 */
export function reconcilePresence<T>(
    previous: readonly PresenceEntry<T>[],
    next: Iterable<readonly [key: PresenceKey, item: T]>
): readonly PresenceEntry<T>[] {
    const incoming = new Map<PresenceKey, T>()
    for (const [key, item] of next) incoming.set(key, item)

    const oldByKey = new Map<PresenceKey, PresenceEntry<T>>()
    for (const entry of previous) oldByKey.set(entry.key, entry)

    const result: PresenceEntry<T>[] = []
    for (const [key, item] of incoming) {
        const old = oldByKey.get(key)
        result.push(
            old
                ? { key, item, present: true, token: old.token }
                : { key, item, present: true, token: 0 }
        )
    }

    for (const old of previous) {
        if (incoming.has(old.key)) continue
        const entry = old.present
            ? { ...old, present: false, token: old.token + 1 }
            : old
        let index = 0
        for (let i = previous.indexOf(old) - 1; i >= 0; i--) {
            const key = previous[i]!.key
            const at = result.findIndex((candidate) => candidate.key === key)
            if (at >= 0) {
                index = at + 1
                break
            }
        }
        result.splice(index, 0, entry)
    }

    return sameEntries(result, previous) ? previous : result
}

/**
 * Remove an exiting entry only when both its phase and token still match.
 * A late completion from an earlier exit can never release a re-entered key.
 */
export function settlePresence<T>(
    entries: readonly PresenceEntry<T>[],
    key: PresenceKey,
    token: number
): readonly PresenceEntry<T>[] {
    const index = entries.findIndex((entry) => entry.key === key)
    if (index < 0) return entries
    const entry = entries[index]!
    if (entry.present || entry.token !== token) return entries
    return [...entries.slice(0, index), ...entries.slice(index + 1)]
}
