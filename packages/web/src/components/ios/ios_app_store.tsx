'use client'

import { ani, timing } from '@freestylejs/ani-core'
import {
    AnimatePresence,
    LayoutGroup,
    useLayout,
    usePresence,
} from '@freestylejs/ani-react/layout'
import { useRef } from 'react'
import { layoutSpring } from './interaction_math'
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

const MOTION = layoutSpring(220, 26)
const HOLD = {
    present: { translateY: 0 },
    exit: ani({
        to: { translateY: 0 },
        duration: 0.01,
        timing: timing.linear(),
    }),
}
const SCRIM = {
    initial: { opacity: 0 },
    present: { opacity: 1 },
    enter: ani({
        to: { opacity: 1 },
        duration: 0.18,
        timing: timing.easeOut(),
    }),
    exit: ani({ to: { opacity: 0 }, duration: 0.18, timing: timing.easeOut() }),
}

function SharedContents({
    item,
    detailed,
}: {
    item: IosStoreItem
    detailed: boolean
}) {
    const image = useLayout<HTMLDivElement>({ layoutId: `image-${item.id}` })
    const title = useLayout<HTMLDivElement>({
        layoutId: `title-${item.id}`,
        layout: 'position',
    })
    // Crop and bitmap are different boxes: the bitmap keeps its aspect ratio
    // while the crop changes shape. Sharing only the crop stretches the photo.
    const bitmap = useLayout<HTMLImageElement>({
        layoutId: `bitmap-${item.id}`,
        radius: false,
    })
    return (
        <StoreContents
            item={item}
            detailed={detailed}
            imageRef={image}
            titleRef={title}
            bitmapRef={bitmap}
        />
    )
}
function GridCard({
    item,
    onOpen,
    clock,
}: {
    item: IosStoreItem
    onOpen: () => void
    clock: IosAppStoreProps['clock']
}) {
    const presence = usePresence(HOLD, clock ? { clock } : {})
    const ref = useLayout<HTMLButtonElement>({
        layoutId: `card-${item.id}`,
        radius: true,
        ref: presence.ref,
    })
    return (
        <button
            type="button"
            ref={ref}
            style={presence.style}
            className="ani-ios-store-surface"
            data-store-card={item.id}
            data-dark-text={!!item.darkText}
            onClick={onOpen}
        >
            <SharedContents item={item} detailed={false} />
        </button>
    )
}
function OpenCard({
    item,
    onClose,
    onUnmount,
    clock,
}: {
    item: IosStoreItem
    onClose: () => void
    onUnmount: () => void
    clock: IosAppStoreProps['clock']
}) {
    const presence = usePresence(HOLD, clock ? { clock } : {})
    const ref = useLayout<HTMLDivElement>({
        layoutId: `card-${item.id}`,
        radius: true,
        ref: presence.ref,
    })
    // The backdrop has its own enter AND exit lifetime. It must not remain
    // opaque until the retained shared surface happens to unmount.
    const scrim = usePresence(SCRIM, clock ? { clock } : {})
    return (
        <StoreModal
            title={item.title}
            onClose={onClose}
            onUnmount={onUnmount}
            scrimRef={scrim.ref}
            scrimStyle={scrim.style}
        >
            <div
                ref={ref}
                style={presence.style}
                className="ani-ios-store-surface ani-ios-store-sheet"
                data-store-detail={item.id}
                data-dark-text={!!item.darkText}
            >
                <SharedContents item={item} detailed={true} />
                <StoreClose onClose={onClose} />
            </div>
        </StoreModal>
    )
}

/** App Store shared geometry: actual Ani layout projection, not snapshot animation. */
export function IosAppStore(props: IosAppStoreProps) {
    const selection = useStoreSelection(props)
    const latest = useRef(selection)
    latest.current = selection
    return (
        <LayoutGroup id={selection.id} clock={props.clock} motion={MOTION}>
            <style>{STORE_CSS}</style>
            <div
                ref={selection.root}
                className={`ani-ios ani-ios-store ${props.className ?? ''}`}
                data-ios-store=""
                data-engine="layout"
            >
                <StoreHeader
                    heading={props.heading}
                    avatarSrc={props.avatarSrc}
                />
                <ul
                    className="ani-ios-store-grid"
                    inert={selection.item !== null}
                >
                    {selection.items.map((item) => (
                        <li className="ani-ios-store-slot" key={item.id}>
                            <AnimatePresence initial={false} mode="popLayout">
                                {selection.selected !== item.id && (
                                    <GridCard
                                        key={item.id}
                                        item={item}
                                        clock={props.clock}
                                        onOpen={() => selection.change(item.id)}
                                    />
                                )}
                            </AnimatePresence>
                        </li>
                    ))}
                </ul>
                <AnimatePresence initial={false} mode="popLayout">
                    {selection.item && (
                        <OpenCard
                            key={selection.item.id}
                            item={selection.item}
                            clock={props.clock}
                            onClose={() => latest.current.change(null)}
                            onUnmount={() => latest.current.restoreFocus()}
                        />
                    )}
                </AnimatePresence>
            </div>
        </LayoutGroup>
    )
}
export type { IosAppStoreProps, IosStoreItem } from './store_shared'
