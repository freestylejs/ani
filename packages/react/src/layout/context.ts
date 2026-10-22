import type {
    LayoutGroup,
    LayoutMotion,
    LayoutParticipantOptions,
    LayoutResult,
    LayoutSnapshot,
} from '@freestylejs/ani-layout'
import {
    createContext,
    type ReactNode,
    type Ref,
    type RefCallback,
} from 'react'

export interface LayoutFacade {
    group: LayoutGroup | null
    add(element: HTMLElement, options: LayoutParticipantOptions): () => void
    set(element: HTMLElement, options: LayoutParticipantOptions): void
    update(mutate: () => void): Promise<LayoutResult>
    capture(): LayoutSnapshot | null
    play(
        snapshot: LayoutSnapshot,
        motion?: LayoutMotion
    ): Promise<LayoutResult> | null
    finish(): void
    attach(group: LayoutGroup): void
    dispose(): void
}

export function createLayoutFacade(): LayoutFacade {
    let group: LayoutGroup | null = null
    let pendingSnapshot: LayoutSnapshot | null = null
    let pendingPlay: Promise<LayoutResult> | null = null
    let playSnapshot: LayoutSnapshot | null = null
    const pending = new Map<HTMLElement, LayoutParticipantOptions>()
    const cleanups = new Map<HTMLElement, () => void>()

    const addNow = (
        element: HTMLElement,
        options: LayoutParticipantOptions
    ) => {
        if (!group) return () => undefined
        const cleanup = group.add(element, options)
        cleanups.set(element, cleanup)
        return () => {
            if (cleanups.get(element) !== cleanup) return
            cleanups.delete(element)
            cleanup()
        }
    }

    return {
        get group() {
            return group
        },
        add(element, options) {
            if (group) return addNow(element, options)
            pending.set(element, options)
            const remove = () => {
                pending.delete(element)
                const cleanup = cleanups.get(element)
                if (!cleanup) return
                cleanups.delete(element)
                cleanup()
            }
            return remove
        },
        set(element, options) {
            if (pending.has(element)) pending.set(element, options)
            group?.set(element, options)
        },
        update(mutate) {
            if (group) return group.update(mutate)
            mutate()
            return Promise.resolve('no-change')
        },
        capture() {
            if (!group) return null
            if (!pendingSnapshot) {
                const snapshot = group.capture()
                pendingSnapshot = snapshot
                queueMicrotask(() => {
                    if (pendingSnapshot === snapshot) pendingSnapshot = null
                })
                return snapshot
            }
            return pendingSnapshot
        },
        play(snapshot, motion) {
            if (!group || pendingSnapshot !== snapshot) {
                if (pendingPlay && playSnapshot === snapshot) return pendingPlay
                return null
            }
            if (pendingPlay && playSnapshot === snapshot) return pendingPlay
            pendingSnapshot = null
            playSnapshot = snapshot
            pendingPlay = new Promise<LayoutResult>((resolve, reject) => {
                queueMicrotask(() => {
                    if (playSnapshot === snapshot) {
                        pendingPlay = null
                        playSnapshot = null
                    }
                    if (!group) {
                        resolve('disposed')
                        return
                    }
                    void group.play(snapshot, motion).then(resolve, reject)
                })
            })
            return pendingPlay
        },
        finish() {
            group?.finish()
        },
        attach(next) {
            group = next
            for (const [element, options] of pending) {
                addNow(element, options)
            }
            pending.clear()
        },
        dispose() {
            pendingSnapshot = null
            pendingPlay = null
            playSnapshot = null
            for (const cleanup of cleanups.values()) cleanup()
            cleanups.clear()
            pending.clear()
            group?.dispose()
            group = null
        },
    }
}

export const LayoutContext = createContext<LayoutFacade | null>(null)

export interface PresenceContextValue {
    readonly key: string
    readonly token: number
    readonly present: boolean
    readonly willEnter: boolean
    readonly popLayout: boolean
    readonly register: () => number
    readonly unregister: (id: number) => void
    readonly settle: () => void
    readonly reportExit: (id: number, token: number) => void
}

export const PresenceContext = createContext<PresenceContextValue | null>(null)

export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
    if (typeof ref === 'function') {
        ;(ref as RefCallback<T>)(value)
    } else if (ref) {
        ;(ref as { current: T | null }).current = value
    }
}

export type { ReactNode }
