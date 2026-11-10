'use client'

import {
    shareElement,
    type ViewTransitionResult,
    viewTransition,
} from '@freestylejs/ani-layout'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
    type IosAppStoreProps,
    type IosStoreItem,
    STORE_CSS,
    StoreClose,
    StoreContents,
    StoreHeader,
    StoreModal,
    useStoreSelection,
} from './store_shared'
import { storeViewProfile } from './view_profile'

function SnapshotCard({
    item,
    detailed,
    sharedId,
    onOpen,
    onClose,
}: {
    item: IosStoreItem
    detailed: boolean
    sharedId: string
    onOpen: () => void
    onClose: () => void
}) {
    const unregister = useRef<(() => void) | null>(null)
    const ref = useCallback(
        (element: HTMLElement | null) => {
            unregister.current?.()
            unregister.current = element
                ? shareElement(element, sharedId)
                : null
        },
        [sharedId]
    )
    const body = (
        <>
            <StoreContents item={item} detailed={detailed} />
            {detailed && <StoreClose onClose={onClose} />}
        </>
    )
    return detailed ? (
        <div
            ref={ref}
            className="ani-ios-store-surface ani-ios-store-sheet"
            data-store-detail={item.id}
            data-view-card=""
            data-dark-text={!!item.darkText}
        >
            {body}
        </div>
    ) : (
        <button
            type="button"
            ref={ref}
            className="ani-ios-store-surface"
            data-store-card={item.id}
            data-view-card=""
            data-dark-text={!!item.darkText}
            onClick={onOpen}
        >
            {body}
        </button>
    )
}

/** Ani owns the native transition lifecycle/names; scoped CSS owns authored snapshot timing. */
export function IosViewAppStore(props: IosAppStoreProps) {
    const selection = useStoreSelection(props)
    const latest = useRef(selection)
    latest.current = selection
    const [result, setResult] = useState<
        ViewTransitionResult | 'idle' | 'running' | 'failed'
    >('idle')
    const [opening, setOpening] = useState(true)
    const mounted = useRef(true)
    const request = useRef(0)
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
            request.current++
        }
    }, [])
    const transitionClass = `${selection.id}-snapshot`
    const profile = storeViewProfile(opening)
    const change = (next: string | null) => {
        const id = next ?? latest.current.selected
        if (!id) return
        const own = ++request.current
        // The timing declaration must exist before the browser captures styles.
        flushSync(() => {
            setOpening(next !== null)
            setResult('running')
        })
        const classesSupported =
            typeof CSS !== 'undefined' &&
            CSS.supports('view-transition-class', 'ani-snapshot')
        void viewTransition(
            () => {
                if (!mounted.current || own !== request.current) return
                flushSync(() => latest.current.change(next))
            },
            {
                share: [`${selection.id}-${id}`],
                ...(props.clock && { clock: props.clock }),
                // No `motion`: this is the public CSS-authored timing path. Passing
                // a timing motion would deliberately invoke Ani's 100–500ms retimer.
                ...(!classesSupported && { motion: { duration: 0.4 } }),
            }
        ).then(
            (state) => {
                if (mounted.current && own === request.current) setResult(state)
            },
            () => {
                if (mounted.current && own === request.current)
                    setResult('failed')
            }
        )
    }
    const css = `
[data-view-instance="${selection.id}"] [data-view-card]{view-transition-class:${transitionClass}}
::view-transition-group(.${transitionClass}){animation-duration:${profile.durationMs}ms;animation-timing-function:${profile.easing}}
::view-transition-image-pair(.${transitionClass}){mix-blend-mode:normal}
::view-transition-old(.${transitionClass}),::view-transition-new(.${transitionClass}){animation-duration:inherit;animation-timing-function:inherit;mix-blend-mode:normal}
`
    return (
        <>
            <style>{STORE_CSS + css}</style>
            <div
                ref={selection.root}
                className={`ani-ios ani-ios-store ${props.className ?? ''}`}
                data-ios-store=""
                data-view-instance={selection.id}
                data-engine="view-transition"
                data-transition-result={result}
            >
                {selection.item ? (
                    <StoreModal
                        title={selection.item.title}
                        onClose={() => change(null)}
                        onUnmount={() => latest.current.restoreFocus()}
                    >
                        <SnapshotCard
                            item={selection.item}
                            detailed={true}
                            sharedId={`${selection.id}-${selection.item.id}`}
                            onOpen={() => undefined}
                            onClose={() => change(null)}
                        />
                    </StoreModal>
                ) : (
                    <>
                        <StoreHeader
                            heading={props.heading}
                            avatarSrc={props.avatarSrc}
                        />
                        <ul className="ani-ios-store-grid">
                            {selection.items.map((item) => (
                                <li
                                    key={item.id}
                                    className="ani-ios-store-slot"
                                >
                                    <SnapshotCard
                                        item={item}
                                        detailed={false}
                                        sharedId={`${selection.id}-${item.id}`}
                                        onOpen={() => change(item.id)}
                                        onClose={() => change(null)}
                                    />
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </>
    )
}
