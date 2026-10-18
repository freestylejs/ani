import { createStyleSheet, type Resolver } from '@freestylejs/ani-core'
import {
    type Accessor,
    createComputed,
    type JSX,
    on,
    onCleanup,
    untrack,
} from 'solid-js'

/**
 * Initial inline style of `initialValue` in Solid's CSS convention
 * (kebab-case keys; custom properties are kept), or `undefined`.
 */
export function createInitialStyle(
    initialValue: Record<string, number> | undefined,
    resolver: Resolver<Record<string, number>> | undefined
): JSX.CSSProperties | undefined {
    if (initialValue === undefined) return undefined
    const sheet = createStyleSheet(initialValue, resolver)
    const style: Record<string, string | number> = {}
    for (const key of Object.keys(sheet)) {
        const solidKey = key.includes('-')
            ? key
            : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
        style[solidKey] = sheet[key]
    }
    return style as JSX.CSSProperties
}

/** `resolver` as bind options (core rejects an explicit `undefined`). */
export function bindOptions(
    resolver: Resolver<Record<string, number>> | undefined
): { resolver?: Resolver<Record<string, number>> } {
    return resolver === undefined ? {} : { resolver }
}

/**
 * Binds elements to a source through core and releases each with the owner
 * that attached it. When `track` is set, a change of `source` rebinds every
 * attached element to the new source.
 */
export function createBinder<S>(source: Accessor<S>, track: boolean) {
    interface Slot {
        bind: (source: S) => () => void
        release: () => void
    }
    const slots = new Set<Slot>()

    if (track) {
        createComputed(
            on(
                source,
                (next) => {
                    for (const slot of slots) {
                        slot.release()
                        slot.release = slot.bind(next)
                    }
                },
                { defer: true }
            )
        )
    }

    return (bind: (source: S) => () => void): void => {
        const slot: Slot = { bind, release: bind(untrack(source)) }
        slots.add(slot)
        onCleanup(() => {
            slots.delete(slot)
            slot.release()
        })
    }
}
