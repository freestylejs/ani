import { type AniDevWarningCode, docsFor } from './error'

declare const __ANI_DEV__: boolean

const warned = new WeakSet<object>()
const keys = new WeakMap<object, Map<string, object>>()

/**
 * Interned `owner` + `aspect` key object: the "once per key" unit of
 * {@link devWarn}. Kept in a WeakMap, so a warned owner can be collected.
 */
export function devKey(owner: object, aspect: string): object {
    let byAspect = keys.get(owner)
    if (byAspect === undefined) {
        byAspect = new Map()
        keys.set(owner, byAspect)
    }
    let key = byAspect.get(aspect)
    if (key === undefined) {
        key = {}
        byAspect.set(aspect, key)
    }
    return key
}

/**
 * Development-only warning channel: `console.warn` once per key with
 * `[CODE] message <docs url>`. A no-op in production builds, where the call
 * sites are guarded by `__ANI_DEV__` and dropped by the minifier.
 */
export function devWarn(
    code: AniDevWarningCode,
    message: string,
    key: object
): void {
    if (!__ANI_DEV__ || warned.has(key)) return
    warned.add(key)
    // biome-ignore lint/suspicious/noConsole: the dev warning channel
    console.warn(`[${code}] ${message} ${docsFor(code)}`)
}

const propertyOwners = new WeakMap<object, Map<string, object>>()

/**
 * Dev check for `ANI_DEV_CONFLICTING_WRITERS`: records `writer` as the owner
 * of `property` on `target` and warns once per target + property when a
 * different writer writes the same declaration.
 */
export function noteWriter(
    target: object,
    writer: object,
    property: string
): void {
    if (!__ANI_DEV__) return
    let owners = propertyOwners.get(target)
    if (owners === undefined) {
        owners = new Map()
        propertyOwners.set(target, owners)
    }
    const owner = owners.get(property)
    if (owner === undefined) {
        owners.set(property, writer)
        return
    }
    if (owner === writer) return
    devWarn(
        'ANI_DEV_CONFLICTING_WRITERS',
        `[Styles] "${property}" of one element is written by more than one binding; the write of the frame's last writer wins.`,
        devKey(target, property)
    )
}
