'use client'

import {
    type CSSProperties,
    type ReactNode,
    type Ref,
    useCallback,
    useId,
    useRef,
    useState,
} from 'react'
import { ActionIcon, BASE_CSS, type IosMotionProps } from './shared'

export interface IosStoreItem {
    readonly id: string
    readonly category: string
    readonly title: string
    readonly imageSrc: string
    /** Reserve decoded geometry before a newly mounted image can paint. */
    readonly imageWidth?: number | undefined
    readonly imageHeight?: number | undefined
    readonly content: ReactNode
    readonly darkText?: boolean | undefined
    readonly imageStyle?: CSSProperties | undefined
}
export interface IosAppStoreProps extends IosMotionProps {
    readonly items?: readonly IosStoreItem[] | undefined
    readonly selectedId?: string | null | undefined
    readonly defaultSelectedId?: string | null | undefined
    readonly onSelectionChange?: ((id: string | null) => void) | undefined
    readonly heading?: string | undefined
    readonly avatarSrc?: string | undefined
}
const PHOTO = 'https://examples.motion.dev/photos/app-store/'
/** Public reference artwork; article prose is independent and replaceable via items. */
export const STORE_ITEMS: readonly IosStoreItem[] = [
    {
        id: 'a',
        category: 'Travel',
        title: '5 Inspiring Apps for Your Next Trip',
        imageSrc: `${PHOTO}a.jpg`,
        imageWidth: 750,
        imageHeight: 1200,
        imageStyle: { top: -300 },
        content: (
            <>
                <p>
                    Some journeys begin with a destination. Others begin with a
                    photograph, a conversation, or a place you have never heard
                    of. These thoughtfully designed apps make room for a little
                    of both.
                </p>
                <p>
                    Collect your favourite places, explore a route at your own
                    pace, and leave enough space in the itinerary for something
                    unexpected.
                </p>
            </>
        ),
    },
    {
        id: 'c',
        category: 'How to',
        title: 'Contemplate the Meaning of Life Twice a Day',
        imageSrc: `${PHOTO}c.jpg`,
        imageWidth: 800,
        imageHeight: 1200,
        darkText: true,
        imageStyle: { bottom: -50, width: '110%', left: -20 },
        content: (
            <>
                <p>
                    A moment of quiet can change the shape of a busy day. Take a
                    breath, notice what is around you, and let your thoughts
                    wander beyond the next notification.
                </p>
                <p>
                    Make a small space for reflection in the morning and another
                    in the evening. No perfect answers are required.
                </p>
                <p>
                    Sometimes the most useful thing an app can do is help you
                    put your phone away.
                </p>
            </>
        ),
    },
    {
        id: 'd',
        category: 'Steps',
        title: 'Urban Exploration Apps for the Vertically-Inclined',
        imageSrc: `${PHOTO}d.jpg`,
        imageWidth: 1000,
        imageHeight: 667,
        darkText: true,
        imageStyle: { width: '200%', left: -100 },
        content: (
            <>
                <p>
                    A familiar city looks different from a new perspective.
                    Follow a staircase, turn a corner, and discover the quiet
                    paths that connect the places you already know.
                </p>
                <p>
                    Save an interesting route, share a favourite view, and find
                    a little adventure in the everyday.
                </p>
            </>
        ),
    },
    {
        id: 'b',
        category: 'Hats',
        title: 'Take Control of Your Hat Life With This Stunning New App',
        imageSrc: `${PHOTO}b.jpg`,
        imageWidth: 960,
        imageHeight: 1200,
        imageStyle: { bottom: -100 },
        content: (
            <>
                <p>
                    A great collection deserves a little care. Keep your
                    favourites together, remember the stories behind them, and
                    find the right finishing touch for whatever the day brings.
                </p>
                <p>
                    Browse your collection, discover a new combination, and make
                    the most of the things you already love.
                </p>
                <p>There is always room for a little personality.</p>
            </>
        ),
    },
]
export const STORE_AVATAR =
    'https://images.motion.dev/magazine/ulZPf8sPx65JUasbGmCjltf6uEU.png'
export const STORE_CSS = `${BASE_CSS}
.ani-ios-store{width:100%;max-width:990px;margin:0 auto;padding:150px 0;color:#17191c}
.ani-ios-store-header{height:44px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between}
.ani-ios-store-header h2{font-size:34px;line-height:34px;font-weight:640;letter-spacing:-.05em;margin:5px 0}
.ani-ios-store-avatar{width:40px;height:40px;border-radius:50%;border:1px solid #ddd;object-fit:cover;background:#fff}
.ani-ios-store-grid{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-content:flex-start;gap:20px}
.ani-ios-store-slot{position:relative;list-style:none;padding:0;margin:0;height:420px;flex:0 0 40%;min-width:0}
.ani-ios-store-slot:nth-child(4n+1),.ani-ios-store-slot:nth-child(4n+4){flex:0 1 calc(60% - 20px)}
.ani-ios-store-surface{display:block;position:relative;width:100%;height:100%;border:0;border-radius:20px;background:#fff;overflow:hidden;margin:0;padding:0;text-align:left;font:inherit;letter-spacing:inherit;word-spacing:inherit;color:inherit;cursor:pointer}
.ani-ios-store-image{position:relative;height:420px;overflow:hidden;width:100%}
.ani-ios-store-image img{position:absolute;display:block;width:100%;height:auto;max-width:none;user-select:none}
.ani-ios-store-title{position:absolute;top:15px;left:15px;max-width:300px;color:#fff;pointer-events:none;transform-origin:0 0}
.ani-ios-store-title span{font-size:12px;line-height:12px;font-weight:620;text-transform:uppercase;color:#18222e}
.ani-ios-store-title h3{font-size:22px;line-height:1.2;font-weight:530;letter-spacing:-.02em;margin:8px 0;text-wrap:balance}
.ani-ios-store-surface[data-dark-text="true"] .ani-ios-store-title{color:#0c1116}
.ani-ios-store-body{padding:35px;max-width:700px;width:90vw;color:#5b5f66;font-size:20px;line-height:1.45;letter-spacing:-.02em}
.ani-ios-store-body p{margin:0 0 10px}
.ani-ios-store-body p:last-child{margin-bottom:0}
.ani-ios-store-modal{display:grid;place-items:safe center;position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:40px 0;border:0;background:transparent;overflow:auto;overscroll-behavior:contain;color:#17191c;z-index:1000}
.ani-ios-store-modal[open]{display:grid;place-items:safe center}
.ani-ios-store-modal::backdrop{background:transparent}
.ani-ios-store-scrim{position:fixed;inset:0;border:0;background:rgba(0,0,0,.8);padding:0;cursor:default}
.ani-ios-store-sheet{position:relative;z-index:1;width:min(700px,90vw);max-width:700px;height:auto;cursor:default;flex:none;box-shadow:0 30px 100px #0003}
.ani-ios-store-sheet .ani-ios-store-title{top:30px;left:30px}
.ani-ios-store-close{position:absolute;right:16px;top:16px;z-index:2;border:0;background:#ffffffd9;color:#333;border-radius:50%;padding:7px;cursor:pointer}
.ani-ios-store-close svg{width:18px;height:18px}
.ani-ios-store-close:focus-visible{clip-path:none!important;width:32px!important;height:32px!important;margin:0!important;overflow:visible!important}
@media(max-width:990px){
 .ani-ios-store{padding:60px 10px}
 .ani-ios-store-grid{gap:10px}
 .ani-ios-store-slot,.ani-ios-store-slot:nth-child(4n+1),.ani-ios-store-slot:nth-child(4n+4){flex:0 1 calc(50% - 5px);height:280px}
 .ani-ios-store-slot .ani-ios-store-image img{top:auto!important;bottom:-10px!important;left:0!important;right:0!important;min-width:max(250px,calc(300px * var(--ani-image-ratio)))}
 .ani-ios-store-slot .ani-ios-store-title{visibility:hidden}
 .ani-ios-store-image{height:280px}
 .ani-ios-store-modal{padding:0}
}
`

export function useStoreSelection(props: IosAppStoreProps) {
    const items = props.items ?? STORE_ITEMS
    if (
        items.length === 0 ||
        new Set(items.map((item) => item.id)).size !== items.length
    )
        throw new TypeError(
            'Store items need distinct ids and at least one item.'
        )
    for (const item of items) {
        if (
            ![item.imageWidth ?? 750, item.imageHeight ?? 1200].every(
                (value) => Number.isFinite(value) && value > 0
            )
        )
            throw new RangeError(
                'Store image dimensions must be positive and finite.'
            )
    }
    const [local, setLocal] = useState<string | null>(
        props.defaultSelectedId ?? null
    )
    const selected = props.selectedId === undefined ? local : props.selectedId
    if (
        props.selectedId != null &&
        !items.some((item) => item.id === props.selectedId)
    )
        throw new RangeError('selectedId must identify a store item.')
    const root = useRef<HTMLDivElement | null>(null)
    const lastSelected = useRef(selected)
    if (selected) lastSelected.current = selected
    const id = `ani-store-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
    return {
        items,
        selected,
        root,
        id,
        item: items.find((item) => item.id === selected) ?? null,
        change(next: string | null) {
            if (props.selectedId === undefined) setLocal(next)
            props.onSelectionChange?.(next)
        },
        restoreFocus() {
            const buttons =
                root.current?.querySelectorAll<HTMLButtonElement>(
                    '[data-store-card]'
                ) ?? []
            for (const button of buttons)
                if (button.dataset.storeCard === lastSelected.current) {
                    button.focus({ preventScroll: true })
                    break
                }
        },
    }
}
export function StoreHeader({
    heading = 'Today',
    avatarSrc = STORE_AVATAR,
}: Pick<IosAppStoreProps, 'heading' | 'avatarSrc'>) {
    return (
        <header className="ani-ios-store-header">
            <h2>{heading}</h2>
            <img
                className="ani-ios-store-avatar"
                src={avatarSrc}
                alt=""
                width={40}
                height={40}
            />
        </header>
    )
}
export function StoreContents({
    item,
    detailed,
    imageRef,
    titleRef,
    bitmapRef,
}: {
    item: IosStoreItem
    detailed: boolean
    imageRef?: Ref<HTMLDivElement> | undefined
    titleRef?: Ref<HTMLDivElement> | undefined
    bitmapRef?: Ref<HTMLImageElement> | undefined
}) {
    const width = item.imageWidth ?? 750
    const height = item.imageHeight ?? 1200
    return (
        <>
            <div
                ref={imageRef}
                className="ani-ios-store-image"
                data-store-image={item.id}
            >
                <img
                    ref={bitmapRef}
                    data-store-bitmap={item.id}
                    src={item.imageSrc}
                    width={width}
                    height={height}
                    decoding="sync"
                    style={
                        {
                            ...item.imageStyle,
                            aspectRatio: `${width} / ${height}`,
                            '--ani-image-ratio': width / height,
                        } as CSSProperties
                    }
                    alt=""
                    draggable={false}
                />
            </div>
            <div
                ref={titleRef}
                className="ani-ios-store-title"
                data-store-title={item.id}
            >
                <span>{item.category}</span>
                <h3>{item.title}</h3>
            </div>
            {detailed && (
                <div className="ani-ios-store-body">{item.content}</div>
            )}
        </>
    )
}

/**
 * Mounted only for an active/exiting sheet. Its grid must be measurable before
 * the parent ref promotes it with showModal(): nested layout effects run first.
 * The native modal still owns focus containment/inertness; no document styles.
 */
export function StoreModal({
    title,
    children,
    onClose,
    onUnmount,
    scrimRef,
    scrimStyle,
}: {
    title: string
    children: ReactNode
    onClose: () => void
    onUnmount: () => void
    scrimRef?: Ref<HTMLButtonElement> | undefined
    scrimStyle?: CSSProperties | undefined
}) {
    const dialog = useRef<HTMLDialogElement | null>(null)
    const latest = useRef(onUnmount)
    latest.current = onUnmount
    const attach = useCallback((next: HTMLDialogElement | null) => {
        const old = dialog.current
        dialog.current = next
        if (next) {
            if (!next.open) {
                if (typeof next.showModal === 'function') next.showModal()
                else next.setAttribute('open', '') // Non-native/SSR test fallback, not a native certification.
            }
            next.focus({ preventScroll: true })
        } else if (old) {
            if (typeof old.close === 'function' && old.open) old.close()
            queueMicrotask(() => {
                if (!dialog.current) latest.current()
            })
        }
    }, [])
    return (
        <dialog
            ref={attach}
            className="ani-ios ani-ios-store-modal"
            role="dialog"
            aria-label={title}
            aria-modal="true"
            onCancel={(event) => {
                event.preventDefault()
                onClose()
            }}
        >
            <button
                ref={scrimRef}
                style={scrimStyle}
                type="button"
                tabIndex={-1}
                className="ani-ios-store-scrim"
                aria-label="Close article"
                data-store-scrim=""
                onClick={onClose}
            />
            {children}
        </dialog>
    )
}
export function StoreClose({ onClose }: { onClose: () => void }) {
    return (
        <button
            className="ani-ios-store-close ani-ios-sr"
            type="button"
            data-store-close=""
            aria-label="Close article"
            onClick={onClose}
        >
            <ActionIcon name="close" />
        </button>
    )
}
