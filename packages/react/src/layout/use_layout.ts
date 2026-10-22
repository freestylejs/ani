import type {
    LayoutParticipantOptions,
    LayoutResult,
} from '@freestylejs/ani-layout'
import { type Ref, type RefCallback, useContext, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'

import { useIsoLayoutEffect } from '../ani/owned'
import { assignRef, LayoutContext } from './context'

function participantOptions(
    options: LayoutParticipantOptions
): LayoutParticipantOptions {
    return {
        ...(options.layout !== undefined && { layout: options.layout }),
        ...(options.layoutId !== undefined && { layoutId: options.layoutId }),
        ...(options.layoutAnchor !== undefined && {
            layoutAnchor: options.layoutAnchor,
        }),
        ...(options.motion !== undefined && { motion: options.motion }),
        ...(options.layoutDependency !== undefined && {
            layoutDependency: options.layoutDependency,
        }),
    }
}

export interface UseLayoutOptions<E extends HTMLElement>
    extends LayoutParticipantOptions {
    ref?: Ref<E>
}

/**
 * Declares the element a participant of the nearest LayoutGroup.
 * The returned callback is stable for the component's lifetime.
 */
export function useLayout<E extends HTMLElement = HTMLElement>(
    options: UseLayoutOptions<E> = {}
): RefCallback<E> {
    const context = useContext(LayoutContext)
    const latest = useRef(options)
    latest.current = options
    const element = useRef<E | null>(null)
    const cleanup = useRef<(() => void) | null>(null)
    const previousRef = useRef(options.ref)

    useIsoLayoutEffect(() => {
        if (!context || !element.current) return
        context.set(element.current, participantOptions(latest.current))
    }, [
        context,
        options.layout,
        options.layoutId,
        options.layoutAnchor,
        options.layoutDependency,
    ])

    useIsoLayoutEffect(() => {
        const previous = previousRef.current
        if (previous === latest.current.ref) return
        assignRef(previous, null)
        if (element.current) assignRef(latest.current.ref, element.current)
        previousRef.current = latest.current.ref
    }, [options.ref])

    useIsoLayoutEffect(() => {
        if (!context) return
        cleanup.current?.()
        cleanup.current = null
        if (element.current) {
            cleanup.current = context.add(
                element.current,
                participantOptions(latest.current)
            )
        }
        return () => {
            cleanup.current?.()
            cleanup.current = null
        }
    }, [context])

    return useMemo(
        () => (next: E | null) => {
            cleanup.current?.()
            cleanup.current = null
            if (!next) {
                assignRef(latest.current.ref, null)
                element.current = null
                return
            }
            element.current = next
            assignRef(latest.current.ref, next)
            if (!context) return
            cleanup.current = context.add(
                next,
                participantOptions(latest.current)
            )
        },
        [context]
    )
}

export interface LayoutGroupControl {
    update(fn: () => void): Promise<LayoutResult>
    finish(): void
}

/**
 * Escape hatch for changes no boundary sees. `update` runs the mutation under
 * flushSync so React commits before the new layout is measured.
 */
export function useLayoutGroup(): LayoutGroupControl {
    const context = useContext(LayoutContext)
    return useMemo(
        () => ({
            update(fn) {
                if (!context) {
                    fn()
                    return Promise.resolve('no-change')
                }
                const snapshot = context.capture()
                if (!snapshot) {
                    fn()
                    return Promise.resolve('no-change')
                }
                flushSync(fn)
                return context.play(snapshot) ?? Promise.resolve('no-change')
            },
            finish() {
                context?.finish()
            },
        }),
        [context]
    )
}
