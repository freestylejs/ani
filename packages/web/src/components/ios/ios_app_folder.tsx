'use client'

import { useFollow } from '@freestylejs/ani-react'
import { LayoutGroup, useLayout } from '@freestylejs/ani-react/layout'
import {
    type CSSProperties,
    type ReactNode,
    useId,
    useRef,
    useState,
} from 'react'
import { layoutSpring } from './interaction_math'
import { BASE_CSS, type IosMotionProps, useCommitEffect } from './shared'

export interface IosFolderItem {
    readonly id: string
    readonly label: string
    readonly iconSrc?: string | undefined
    readonly icon?: ReactNode
}
export interface IosAppFolderProps extends IosMotionProps {
    readonly title?: string | undefined
    readonly items?: readonly IosFolderItem[] | undefined
    readonly open?: boolean | undefined
    readonly defaultOpen?: boolean | undefined
    readonly onOpenChange?: ((open: boolean) => void) | undefined
    readonly onSelect?: ((item: IosFolderItem) => void) | undefined
}
const APPLE = 'https://cdsassets.apple.com/live/7WUAS350/images/pro-apps/'
const PRODUCTIVITY =
    'https://www.apple.com/v/apple-creator-studio/a/images/overview/productivity/icon_productivity_apps__b2b3py4v9vpy_large_2x.png'
function ProductivityIcon({ x }: { x: number }) {
    return (
        <svg viewBox={`${x} 0 108 108`} aria-hidden="true">
            <image href={PRODUCTIVITY} width="480" height="108" />
        </svg>
    )
}
export const CREATOR_APPS: readonly IosFolderItem[] = [
    {
        id: 'pixelmator',
        label: 'Pixelmator Pro',
        iconSrc: `${APPLE}creator-studio-pixelmator-pro-4-4-app-icon.png`,
    },
    {
        id: 'final-cut',
        label: 'Final Cut Pro',
        iconSrc: `${APPLE}creator-studio-final-cut-pro-12-4-app-icon.png`,
    },
    {
        id: 'logic',
        label: 'Logic Pro',
        iconSrc: `${APPLE}creator-studio-logic-pro-12-4-app-icon.png`,
    },
    { id: 'pages', label: 'Pages', icon: <ProductivityIcon x={124} /> },
    { id: 'keynote', label: 'Keynote', icon: <ProductivityIcon x={0} /> },
    {
        id: 'compressor',
        label: 'Compressor',
        iconSrc: `${APPLE}creator-studio-compressor-5-4-app-icon.png`,
    },
    { id: 'freeform', label: 'Freeform', icon: <ProductivityIcon x={372} /> },
    { id: 'numbers', label: 'Numbers', icon: <ProductivityIcon x={248} /> },
]
const MOTION = layoutSpring(200, 22)
const CSS = `${BASE_CSS}
.ani-ios-folder-stage{width:100%;height:100%;min-height:320px;display:grid;place-items:center;color:#5f6368}
.ani-ios-folder-surface{transform-origin:0 0;display:block;position:relative;inset:auto;margin:0;max-width:none;max-height:none;overflow:visible;color:inherit;z-index:1;border:0;outline:none;width:100px;height:100px;padding:10px;border-radius:20px;background:#fff;box-shadow:0 9px 22px #09111f24}
.ani-ios-folder-surface::backdrop{background:transparent}
.ani-ios-folder-surface[data-expanded="true"]{position:fixed;inset:0;margin:auto;width:min(388px,calc(100vw - 32px));height:fit-content;padding:20px;border-radius:24px;background:rgba(255,255,255,.34);box-shadow:none}
.ani-ios-folder-caption{font-size:14px;line-height:20px;letter-spacing:-.2px;white-space:nowrap;color:#6b6d70;position:absolute;left:50%;top:calc(100% + 10px);transform:translateX(-50%);width:max-content}
.ani-ios-folder-surface[data-expanded="true"] .ani-ios-folder-caption{top:-32px;font-size:17px;line-height:24px}
.ani-ios-folder-grid{position:relative;width:100%;height:100%}
.ani-ios-folder-surface[data-expanded="true"] .ani-ios-folder-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:20px;row-gap:23px;height:auto}
.ani-ios-folder-app{display:flex;align-items:center;flex-direction:column;gap:7px;padding:0;border:0;background:none;color:inherit;cursor:pointer;min-width:0;position:relative}
.ani-ios-folder-surface[data-expanded="false"] .ani-ios-folder-app{position:absolute;left:var(--compact-x);top:var(--compact-y);width:var(--compact-size);height:var(--compact-size);pointer-events:none}
.ani-ios-folder-icon{transform-origin:0 0;position:relative;width:100%;aspect-ratio:1;flex:none;min-width:0;min-height:0}
.ani-ios-folder-icon-inner,.ani-ios-folder-icon img,.ani-ios-folder-icon svg{display:block;width:100%;height:100%;object-fit:contain}
.ani-ios-folder-app-label{display:block;flex:none;width:max-content;font-size:10px;line-height:14px;white-space:nowrap;letter-spacing:-.2px}
.ani-ios-folder-surface[data-expanded="false"] .ani-ios-folder-app-label{position:absolute;top:calc(100% + 7px)}
.ani-ios-folder-fallback{display:grid;place-items:center;width:100%;height:100%;background:#26333d;border-radius:24%;color:white;font-weight:600}
.ani-ios-folder-open{position:absolute;inset:0;z-index:2;width:100%;height:100%;padding:0;border:0;border-radius:inherit;background:transparent;cursor:pointer}
`
/** Every icon has one persistent identity. Non-preview icons start at the mini-grid's centre, hidden. */
function compactSlot(index: number, count: number) {
    if (index < 3)
        return {
            x: (index % 2) * 43,
            y: Math.floor(index / 2) * 43,
            size: 37,
            visible: true,
        }
    const firstMini = Math.max(3, count - 4)
    if (index < firstMini) return { x: 53, y: 53, size: 17, visible: false }
    const mini = index - firstMini
    return {
        x: 43 + (mini % 2) * 20,
        y: 43 + Math.floor(mini / 2) * 20,
        size: 17,
        visible: true,
    }
}
function Glyph({
    item,
    open,
    index,
    count,
    onSelect,
    clock,
}: {
    item: IosFolderItem
    open: boolean
    index: number
    count: number
    onSelect: () => void
} & IosMotionProps) {
    const ref = useLayout<HTMLDivElement>({ layoutId: `app-${item.id}` })
    const slot = compactSlot(index, count)
    const visible = open || slot.visible
    const options = {
        ...(clock && { clock }),
        spring: { m: 1, k: 700, c: 50, tolerance: 0.001 },
    }
    const appearance = useFollow({ opacity: visible ? 1 : 0 }, options)
    const label = useFollow({ opacity: open ? 1 : 0 }, options)
    const labelRef = useLayout<HTMLSpanElement>({
        layout: 'position',
        ref: label.ref,
    })
    useCommitEffect(() => {
        if ((appearance.follower as { _disposed?: boolean })._disposed) return
        void appearance.follower.set({ opacity: visible ? 1 : 0 })
    }, [visible, appearance.follower])
    useCommitEffect(() => {
        if ((label.follower as { _disposed?: boolean })._disposed) return
        void label.follower.set({ opacity: open ? 1 : 0 })
    }, [open, label.follower])
    return (
        <button
            type="button"
            className="ani-ios-folder-app"
            tabIndex={open ? 0 : -1}
            aria-hidden={!open}
            onClick={onSelect}
            style={
                {
                    '--compact-x': `${slot.x}px`,
                    '--compact-y': `${slot.y}px`,
                    '--compact-size': `${slot.size}px`,
                } as CSSProperties
            }
        >
            <div
                ref={ref}
                className="ani-ios-folder-icon"
                data-folder-icon={item.id}
            >
                <div
                    ref={appearance.ref}
                    style={appearance.style}
                    className="ani-ios-folder-icon-inner"
                >
                    {item.icon ??
                        (item.iconSrc ? (
                            <img
                                src={item.iconSrc}
                                alt=""
                                width={72}
                                height={72}
                                draggable={false}
                            />
                        ) : (
                            <span className="ani-ios-folder-fallback">
                                {item.label.slice(0, 1)}
                            </span>
                        ))}
                </div>
            </div>
            <span
                ref={labelRef}
                style={label.style}
                className="ani-ios-folder-app-label"
            >
                {item.label}
            </span>
        </button>
    )
}
function Caption({ title }: { title: string }) {
    const ref = useLayout<HTMLSpanElement>({
        layoutId: 'caption',
        layout: 'position',
    })
    return (
        <span ref={ref} className="ani-ios-folder-caption">
            {title}
        </span>
    )
}
function Surface({
    title,
    items,
    open,
    change,
    onSelect,
    clock,
}: {
    title: string
    items: readonly IosFolderItem[]
    open: boolean
    change: (open: boolean) => void
    onSelect: (item: IosFolderItem) => void
} & IosMotionProps) {
    const dialog = useRef<HTMLDialogElement | null>(null)
    const backdropDown = useRef(false)
    const ref = useLayout<HTMLDialogElement>({
        layoutId: 'surface',
        radius: true,
        ref: dialog,
    })
    useCommitEffect(() => {
        const element = dialog.current
        if (!element) return
        if (open && !element.open) element.showModal()
        else if (!open && element.open) element.close()
    }, [open])
    useCommitEffect(
        () => () => {
            if (dialog.current?.open) dialog.current.close()
        },
        []
    )
    // One persistent tree: native top-layer promotion supplies host inertness,
    // while Ani measures the same surface/icons before and after promotion.
    return (
        <dialog
            ref={ref}
            className={`ani-ios-folder-surface ${open ? 'ani-ios-folder-expanded' : 'ani-ios-folder-preview'}`}
            data-expanded={open}
            role={open ? 'dialog' : 'presentation'}
            aria-modal={open ? true : undefined}
            aria-label={open ? title : undefined}
            tabIndex={open ? -1 : undefined}
            onCancel={(event) => {
                event.preventDefault()
                change(false)
            }}
            onKeyDown={(event) => {
                if (open && event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    change(false)
                }
            }}
            onPointerDown={(event) => {
                const r = event.currentTarget.getBoundingClientRect()
                backdropDown.current =
                    event.target === event.currentTarget &&
                    (event.clientX < r.left ||
                        event.clientX > r.right ||
                        event.clientY < r.top ||
                        event.clientY > r.bottom)
            }}
            onPointerCancel={() => {
                backdropDown.current = false
            }}
            onClick={(event) => {
                const dismiss = backdropDown.current
                backdropDown.current = false
                if (open && dismiss && event.target === event.currentTarget)
                    change(false)
            }}
        >
            <div className="ani-ios-folder-grid">
                {items.map((item, index) => (
                    <Glyph
                        key={item.id}
                        item={item}
                        index={index}
                        count={items.length}
                        open={open}
                        clock={clock}
                        onSelect={() => onSelect(item)}
                    />
                ))}
            </div>
            <Caption title={title} />
            {open ? (
                <button
                    className="ani-ios-sr"
                    type="button"
                    onClick={() => change(false)}
                >
                    Close {title}
                </button>
            ) : (
                <button
                    className="ani-ios-folder-open"
                    type="button"
                    data-folder-open=""
                    aria-label={`Open ${title}`}
                    onClick={() => change(true)}
                />
            )}
        </dialog>
    )
}

export function IosAppFolder({
    clock,
    className = '',
    title = 'Creator Studio',
    items = CREATOR_APPS,
    open: controlled,
    defaultOpen = false,
    onOpenChange,
    onSelect,
}: IosAppFolderProps) {
    if (
        items.length === 0 ||
        new Set(items.map((item) => item.id)).size !== items.length
    )
        throw new TypeError(
            'Folder items need distinct ids and at least one item.'
        )
    const instance = useId()
    const [local, setLocal] = useState(defaultOpen)
    const open = controlled ?? local
    const stage = useRef<HTMLDivElement | null>(null)
    const previous = useRef(open)
    const change = (value: boolean) => {
        if (controlled === undefined) setLocal(value)
        onOpenChange?.(value)
    }
    useCommitEffect(() => {
        if (open)
            stage.current
                ?.querySelector<HTMLElement>('[role="dialog"]')
                ?.focus({ preventScroll: true })
        else if (previous.current)
            stage.current
                ?.querySelector<HTMLElement>('[data-folder-open]')
                ?.focus({ preventScroll: true })
        previous.current = open
    }, [open])
    return (
        <LayoutGroup
            id={`ios-folder-${instance}`}
            clock={clock}
            motion={MOTION}
        >
            <style>{CSS}</style>
            <div
                ref={stage}
                className={`ani-ios ani-ios-folder-stage ${className}`}
                data-ios-folder=""
                data-folder-instance={instance}
            >
                <Surface
                    title={title}
                    items={items}
                    open={open}
                    change={change}
                    clock={clock}
                    onSelect={(item) => {
                        onSelect?.(item)
                        change(false)
                    }}
                />
            </div>
        </LayoutGroup>
    )
}
