import { createStyleSheet, type Resolver } from '@freestylejs/ani-core'
import {
    type ComponentPublicInstance,
    type ComputedRef,
    computed,
    type StyleValue,
} from 'vue'

/** What a Vue function ref receives. */
export type ElementRef = Element | ComponentPublicInstance | null

export type StyleTarget = { style: CSSStyleDeclaration }

/** The styleable element behind a ref value: a component resolves to its `$el`. */
export function resolveTarget(value: ElementRef): StyleTarget | null {
    const el: unknown =
        value !== null && '$el' in value
            ? (value as ComponentPublicInstance).$el
            : value
    if (typeof el !== 'object' || el === null) return null
    return typeof (el as Partial<StyleTarget>).style === 'object'
        ? (el as StyleTarget)
        : null
}

/** `bind` options for an optional resolver (`exactOptionalPropertyTypes`). */
export function withResolver(resolver?: Resolver<Record<string, number>>): {
    resolver?: Resolver<Record<string, number>>
} {
    return resolver ? { resolver } : {}
}

/** Initial inline style of `initialValue`, `undefined` without one. */
export function createInitialStyle(options: {
    initialValue?: object
    resolver?: Resolver<Record<string, number>>
}): ComputedRef<StyleValue | undefined> {
    return computed(() =>
        options.initialValue
            ? createStyleSheet(
                  options.initialValue as Record<string, number>,
                  options.resolver
              )
            : undefined
    )
}

export interface ElementBinder {
    /** Ref callback: moves the binding to `value` (unbinds on `null`). */
    set(value: ElementRef): void
    /** Binds the current element again, e.g. after its source was swapped. */
    rebind(): void
    /** Unbinds and forgets the element. */
    dispose(): void
}

/**
 * Keeps at most one binding alive for the element it was last given.
 * `attach` binds a target through core and returns the unbind.
 */
export function createElementBinder(
    attach: (target: StyleTarget) => () => void
): ElementBinder {
    let target: StyleTarget | null = null
    let unbind: (() => void) | undefined

    const release = () => {
        unbind?.()
        unbind = undefined
    }
    const rebind = () => {
        release()
        if (target) unbind = attach(target)
    }

    return {
        set(value) {
            const next = resolveTarget(value)
            if (next === target) return
            target = next
            rebind()
        },
        rebind,
        dispose() {
            target = null
            release()
        },
    }
}
