import type { LayoutOptions, LayoutReport } from '@freestylejs/ani-layout'
import { type Ref, type RefCallback, useContext, useMemo, useRef } from 'react'

import { useIsoLayoutEffect } from '../ani/owned'
import {
    assignRef,
    existingScope,
    existingScopes,
    hasDOM,
    LayoutContext,
    type LayoutContextValue,
    type LayoutScope,
    mergeMotion,
    sameOptions,
    scopeOf,
} from './context'

export interface UseLayoutOptions<E extends HTMLElement> extends LayoutOptions {
    ref?: Ref<E>
}

/** The participant's options with its groups' namespace and `motion` applied. */
function resolve(
    options: LayoutOptions,
    context: LayoutContextValue | null
): LayoutOptions {
    const motion = mergeMotion(context?.motion, options.motion)
    const layoutId =
        options.layoutId !== undefined && context?.namespace !== undefined
            ? `${context.namespace}/${options.layoutId}`
            : options.layoutId
    return {
        ...(options.layout !== undefined && { layout: options.layout }),
        ...(layoutId !== undefined && { layoutId }),
        ...(options.layoutAnchor !== undefined && {
            layoutAnchor: options.layoutAnchor,
        }),
        ...(options.layoutCrossfade !== undefined && {
            layoutCrossfade: options.layoutCrossfade,
        }),
        ...('layoutDependency' in options && {
            layoutDependency: options.layoutDependency,
        }),
        ...('layoutKey' in options && {
            layoutKey: options.layoutKey,
        }),
        ...(options.radius !== undefined && { radius: options.radius }),
        ...(motion !== undefined && { motion }),
    }
}

interface Registration {
    readonly scope: LayoutScope
    readonly remove: () => void
    options: LayoutOptions
}

/**
 * Makes the element a participant of the nearest `LayoutGroup`'s scope, or of
 * the implicit root scope of its document. Every render captures the
 * before-boxes; the commit's layout effect queues the scope's one flush. The
 * returned callback is stable while the scope is.
 */
export function useLayout<E extends HTMLElement = HTMLElement>(
    options: UseLayoutOptions<E> = {}
): RefCallback<E> {
    const context = useContext(LayoutContext)
    const element = useRef<E | null>(null)
    const latest = useRef(options)
    latest.current = options
    const resolved = resolve(options, context)
    const latestResolved = useRef(resolved)
    latestResolved.current = resolved
    const registration = useRef<Registration | null>(null)
    const previousRef = useRef(options.ref)

    // render: the before-boxes of the whole scope (§4.1); a first render
    // knows no document yet and touches every implicit root
    const touched = existingScopes(
        context,
        element.current ? [element.current.ownerDocument] : []
    )
    for (const scope of touched) scope.touch()
    const touchedRef = useRef(touched)
    touchedRef.current = touched

    useIsoLayoutEffect(() => {
        const current = registration.current
        if (current && element.current) {
            if (!sameOptions(current.options, latestResolved.current)) {
                current.options = latestResolved.current
                current.scope.set(element.current, current.options)
            }
        }
        current?.scope.commit()
        for (const scope of touchedRef.current) scope.commit()
    })

    useIsoLayoutEffect(() => {
        const previous = previousRef.current
        if (previous === latest.current.ref) return
        assignRef(previous, null)
        if (element.current) assignRef(latest.current.ref, element.current)
        previousRef.current = latest.current.ref
    }, [options.ref])

    const scope = context?.scope
    const contextRef = useRef(context)
    contextRef.current = context
    return useMemo<RefCallback<E>>(
        () => (next) => {
            registration.current?.remove()
            registration.current = null
            element.current = next
            assignRef(latest.current.ref, next)
            if (!next) return
            // the namespace and motion reach a registration through `set`
            const target = scopeOf(contextRef.current, next)
            const participant = latestResolved.current
            registration.current = {
                scope: target,
                remove: target.add(next, participant),
                options: participant,
            }
        },
        [scope]
    )
}

export interface LayoutGroupControl {
    /** `capture()` → `flushSync(fn)` → `flush()`, for changes no participant renders. */
    update(fn: () => void): Promise<LayoutReport>
    /** Every track of the scope jumps to its end and settles. */
    finish(): void
}

/** The nearest scope's control: the `LayoutGroup`'s, or the implicit root's. */
export function useLayoutGroup(): LayoutGroupControl {
    const context = useContext(LayoutContext)
    const scope = context?.scope
    return useMemo(
        () => ({
            update(fn) {
                if (!hasDOM()) {
                    fn()
                    return Promise.resolve({ status: 'no-change', snapped: [] })
                }
                return (scope ?? scopeOf(null)).update(fn)
            },
            finish() {
                ;(scope ?? existingScope(null))?.finish()
            },
        }),
        [scope]
    )
}
