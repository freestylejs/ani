import { createStyleSheet, type Resolver } from '@freestylejs/ani-core'
import type { Readable } from 'svelte/store'

export type StyleResolver = Resolver<Record<string, number>>

export function isReadable<T>(value: unknown): value is Readable<T> {
    return (
        !!value &&
        typeof (value as { subscribe?: unknown }).subscribe === 'function'
    )
}

/** `{ resolver }` for core's `bind`, without an explicit `undefined`. */
export function bindOptions(resolver: StyleResolver | undefined): {
    resolver?: StyleResolver
} {
    return resolver === undefined ? {} : { resolver }
}

/**
 * CSS declaration string (`"transform: translateX(0px); opacity: 0"`) for the
 * server-rendered `style` attribute, made by core's `createStyleSheet`.
 */
export function toStyleString(
    values: object,
    resolver: StyleResolver | undefined
): string {
    const sheet = createStyleSheet(values as Record<string, number>, resolver)
    const declarations: string[] = []
    for (const key in sheet) {
        const name = key.includes('-')
            ? key
            : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
        declarations.push(`${name}: ${String(sheet[key])}`)
    }
    return declarations.join('; ')
}
