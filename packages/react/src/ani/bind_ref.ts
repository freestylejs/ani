import { createStyleSheet, type Resolver } from '@freestylejs/ani-core'
import { type CSSProperties, useRef } from 'react'

export type ElementRef = (element: HTMLElement | null) => void

export type StyleResolver = Resolver<Record<string, number>>

/** A ref callback that binds the attached element and unbinds the detached one. */
export function createElementRef(
    bind: (element: HTMLElement) => () => void
): ElementRef {
    let unbind: (() => void) | null = null
    return (element) => {
        unbind?.()
        unbind = element ? bind(element) : null
    }
}

export function bindOptions(
    resolver: StyleResolver | undefined
): { resolver: StyleResolver } | undefined {
    return resolver ? { resolver } : undefined
}

/** Holds the latest value without causing renders. */
export function useLatest<T>(value: T): { readonly current: T } {
    const ref = useRef(value)
    ref.current = value
    return ref
}

/** The initial inline style: computed on the first render, then stable. */
export function useInitialStyle(
    initialValue: Record<string, number> | undefined,
    resolver: StyleResolver | undefined
): CSSProperties | undefined {
    const ref = useRef<{ style: CSSProperties | undefined } | null>(null)
    if (ref.current === null) {
        ref.current = {
            style: initialValue
                ? createStyleSheet(initialValue, resolver)
                : undefined,
        }
    }
    return ref.current.style
}
