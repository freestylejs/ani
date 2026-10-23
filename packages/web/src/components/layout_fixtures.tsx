'use client'

/**
 * The layout acceptance fixtures (ARCHITECTURE.md §11, rows E1–E5 and the
 * Gallery). Each is a controlled component with fixed geometry: the showcase
 * renders exactly these, and the browser tests drive the same components on a
 * manual clock and check every frame.
 */
import {
    ani,
    type Clock,
    delay,
    sequence,
    type TimingFunction,
    timing,
} from '@freestylejs/ani-core'
import {
    AnimatePresence,
    LayoutGroup,
    useLayout,
    usePresence,
} from '@freestylejs/ani-react/layout'
import type { CSSProperties, ReactNode } from 'react'

/** The spring every fixture moves with: released from rest, so `e′(0) = 0`. */
export const SPRING: TimingFunction = timing.spring({ m: 1, k: 170, c: 22 })
export const DURATION = 0.5

const INK = 'var(--color-fd-foreground, #1d1d1f)'
const CARD = 'var(--color-fd-card, #ffffff)'
const MUTED = 'var(--color-fd-muted, #eef0f4)'
const ACCENT = 'var(--color-fd-primary, #5b5bd6)'
const TILE_COLORS = [
    '#5b5bd6',
    '#e5484d',
    '#30a46c',
    '#f76b15',
    '#0090ff',
    '#d6409f',
    '#ffc53d',
    '#12a594',
]

/** A presence that only waits: crossfading nodes must not animate opacity (§5.6). */
const HOLD = {
    present: { translateY: 0 },
    exit: ani({
        to: { translateY: 0 },
        duration: 0.01,
        timing: timing.linear(),
    }),
}

/** Presence options for a fixture's clock (absent: the default clock). */
function presenceClock(clock: Clock | undefined): { clock?: Clock } {
    return clock ? { clock } : {}
}

interface FixtureProps {
    /** A manual clock in tests; the default clock in the showcase. */
    readonly clock?: Clock
}

function Stage({
    name,
    width,
    height,
    children,
}: {
    name: string
    width: number
    height: number
    children: ReactNode
}) {
    return (
        <div
            data-fixture={name}
            style={{ position: 'relative', width, height, color: INK }}
        >
            {children}
        </div>
    )
}

/* ───────────────────────── E1 Layout Anchor ───────────────────────── */

export const E1 = {
    small: 150,
    large: 300,
    child: [70, 100] as const,
    cross: 10,
    delay: 0.8,
}

function AnchorParent({ expanded }: { expanded: boolean }) {
    const parent = useLayout<HTMLDivElement>({ radius: true })
    // the child stays on the parent's centre; its own size waits 0.8 s
    const child = useLayout<HTMLDivElement>({
        layoutAnchor: { x: 0.5, y: 0.5 },
        radius: true,
        motion: { delay: E1.delay },
    })
    const cross = useLayout<HTMLDivElement>({
        layoutAnchor: { x: 0.5, y: 0.5 },
    })
    const size = expanded ? E1.large : E1.small
    const inner = expanded ? E1.child[1] : E1.child[0]
    return (
        <div
            ref={parent}
            data-anchor-parent=""
            style={{
                width: size,
                height: size,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 24,
                background: MUTED,
            }}
        >
            <div
                ref={child}
                data-anchor-child=""
                style={{
                    width: inner,
                    height: inner,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 16,
                    background: ACCENT,
                }}
            >
                <div
                    ref={cross}
                    data-anchor-cross=""
                    style={{
                        width: E1.cross,
                        height: E1.cross,
                        borderRadius: 5,
                        background: CARD,
                    }}
                />
            </div>
        </div>
    )
}

export function AnchorFixture({
    expanded,
    clock,
}: FixtureProps & { expanded: boolean }) {
    return (
        <LayoutGroup
            clock={clock}
            motion={{ duration: DURATION, timing: SPRING }}
        >
            <Stage name="anchor" width={E1.large} height={E1.large}>
                <AnchorParent expanded={expanded} />
            </Stage>
        </LayoutGroup>
    )
}

/* ───────────────────────── E2 Create Button ───────────────────────── */

export const E2 = {
    ids: ['create', 'create-icon', 'create-label'] as const,
    label: { fontSize: 11, height: 14 },
    menu: ['New document', 'New folder', 'Upload'] as const,
}

function CreateIcon() {
    const ref = useLayout<HTMLSpanElement>({
        layoutId: 'create-icon',
        layout: 'position',
    })
    return (
        <span
            ref={ref}
            data-layout-id="create-icon"
            style={{
                width: 16,
                height: 16,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 8,
                background: ACCENT,
                color: CARD,
                fontSize: 12,
                lineHeight: '16px',
            }}
        >
            +
        </span>
    )
}

function CreateLabel() {
    // position only: the glyphs keep their size while the wrapper scales
    const ref = useLayout<HTMLSpanElement>({
        layoutId: 'create-label',
        layout: 'position',
    })
    return (
        <span
            ref={ref}
            data-layout-id="create-label"
            style={{
                display: 'block',
                fontSize: E2.label.fontSize,
                lineHeight: `${E2.label.height}px`,
                height: E2.label.height,
                fontWeight: 600,
                whiteSpace: 'nowrap',
            }}
        >
            Create
        </span>
    )
}

function CreateWrapper({
    clock,
    open,
}: {
    clock: Clock | undefined
    open: boolean
}) {
    const presence = usePresence(HOLD, presenceClock(clock))
    const ref = useLayout<HTMLDivElement>({
        layoutId: 'create',
        radius: true,
        ref: presence.ref,
    })
    return (
        <div
            ref={ref}
            data-layout-id="create"
            data-create={open ? 'menu' : 'button'}
            style={{
                ...presence.style,
                display: 'flex',
                flexDirection: open ? 'column' : 'row',
                alignItems: open ? 'stretch' : 'center',
                gap: open ? 10 : 8,
                width: open ? 220 : 'max-content',
                padding: open ? 14 : '12px 16px',
                borderRadius: open ? 18 : 20,
                background: CARD,
                boxShadow: '0 6px 24px rgb(0 0 0 / 0.12)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CreateIcon />
                <CreateLabel />
            </div>
            {open
                ? E2.menu.map((item) => (
                      <div
                          key={item}
                          style={{
                              height: 28,
                              lineHeight: '28px',
                              padding: '0 8px',
                              borderRadius: 8,
                              background: MUTED,
                              fontSize: 12,
                          }}
                      >
                          {item}
                      </div>
                  ))
                : null}
        </div>
    )
}

export function CreateFixture({
    open,
    clock,
}: FixtureProps & { open: boolean }) {
    return (
        <LayoutGroup
            clock={clock}
            motion={{ duration: DURATION, timing: SPRING }}
        >
            <Stage name="create" width={240} height={180}>
                <AnimatePresence initial={false} mode="popLayout">
                    <CreateWrapper
                        key={open ? 'menu' : 'button'}
                        clock={clock}
                        open={open}
                    />
                </AnimatePresence>
            </Stage>
        </LayoutGroup>
    )
}

/* ───────────────────────── E3 iOS Folder ───────────────────────── */

export const E3 = {
    shared: 4,
    others: 5,
    closed: { size: 80, padding: 12, tile: 25, gap: 6 },
    open: { padding: 16, tile: 68, gap: 12, columns: 4 },
    /** Seconds between two non-shared items' enters. */
    stagger: 0.04,
    enterScale: 0.2,
}

/** A tile's box in the stage, closed (inside the folder) or open. */
export function folderTile(
    i: number,
    open: boolean
): {
    x: number
    y: number
    size: number
} {
    if (open) {
        const { padding, tile, gap, columns } = E3.open
        return {
            x: padding + (i % columns) * (tile + gap),
            y: padding + Math.floor(i / columns) * (tile + gap),
            size: tile,
        }
    }
    const { padding, tile, gap } = E3.closed
    return {
        x: padding + (i % 2) * (tile + gap),
        y: padding + Math.floor(i / 2) * (tile + gap),
        size: tile,
    }
}

function SharedTile({ i, open }: { i: number; open: boolean }) {
    const ref = useLayout<HTMLDivElement>({ layoutId: `folder-tile-${i}` })
    const size = open ? E3.open.tile : E3.closed.tile
    return (
        <div
            ref={ref}
            data-layout-id={`folder-tile-${i}`}
            style={{
                width: size,
                height: size,
                borderRadius: open ? 16 : 6,
                background: TILE_COLORS[i % TILE_COLORS.length],
            }}
        />
    )
}

function FolderItem({ i, clock }: { i: number; clock: Clock | undefined }) {
    const k = i - E3.shared
    const at = folderTile(i, true)
    const folder = E3.closed.size / 2
    const presence = usePresence(
        {
            present: { scale: 1, opacity: 1 },
            initial: { scale: E3.enterScale, opacity: 0 },
            enter: sequence([
                delay(k * E3.stagger),
                ani({
                    to: { scale: 1, opacity: 1 },
                    duration: 0.35,
                    timing: SPRING,
                }),
            ]),
            exit: ani({
                to: { scale: E3.enterScale, opacity: 0 },
                duration: 0.2,
                timing: SPRING,
            }),
        },
        presenceClock(clock)
    )
    return (
        <div
            ref={presence.ref}
            data-folder-item={k}
            style={{
                ...presence.style,
                width: at.size,
                height: at.size,
                borderRadius: 16,
                background: TILE_COLORS[i % TILE_COLORS.length],
                // grows out of the folder's centre
                transformOrigin: `${folder - at.x}px ${folder - at.y}px`,
            }}
        />
    )
}

function Folder({ clock }: { clock: Clock | undefined }) {
    const presence = usePresence(HOLD, presenceClock(clock))
    const { size, padding, gap } = E3.closed
    return (
        <div
            ref={presence.ref}
            data-folder="closed"
            style={{
                ...presence.style,
                display: 'grid',
                gridTemplateColumns: `repeat(2, ${E3.closed.tile}px)`,
                gap,
                padding,
                width: size,
                height: size,
                boxSizing: 'border-box',
                borderRadius: 20,
                background: MUTED,
            }}
        >
            {Array.from({ length: E3.shared }, (_, i) => (
                <SharedTile key={i} i={i} open={false} />
            ))}
        </div>
    )
}

function FolderPanel({ clock }: { clock: Clock | undefined }) {
    const presence = usePresence(HOLD, presenceClock(clock))
    const { padding, tile, gap, columns } = E3.open
    return (
        <div
            ref={presence.ref}
            data-folder="open"
            style={{
                ...presence.style,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, ${tile}px)`,
                gap,
                padding,
                width: 'max-content',
                borderRadius: 28,
                background: MUTED,
            }}
        >
            {Array.from({ length: E3.shared }, (_, i) => (
                <SharedTile key={i} i={i} open={true} />
            ))}
            {/* closing: the items shrink back into the folder on their own */}
            <AnimatePresence initial={true}>
                {presence.isPresent
                    ? Array.from({ length: E3.others }, (_, k) => (
                          <FolderItem key={k} i={E3.shared + k} clock={clock} />
                      ))
                    : null}
            </AnimatePresence>
        </div>
    )
}

export function FolderFixture({
    open,
    clock,
}: FixtureProps & { open: boolean }) {
    return (
        <LayoutGroup
            clock={clock}
            motion={{ duration: DURATION, timing: SPRING }}
        >
            <Stage name="folder" width={340} height={260}>
                <AnimatePresence initial={false} mode="popLayout">
                    {open ? (
                        <FolderPanel key="panel" clock={clock} />
                    ) : (
                        <Folder key="folder" clock={clock} />
                    )}
                </AnimatePresence>
            </Stage>
        </LayoutGroup>
    )
}

/* ───────────────────────── E4 App Store card ───────────────────────── */

export const E4 = {
    cards: ['Aurora', 'Harbor', 'Summit'] as const,
    card: { width: 150, height: 200, image: 96, gap: 14 },
    detail: { x: 30, y: 12, width: 420, height: 380, image: 220 },
}

function CardBody({ i, detail }: { i: number; detail: boolean }) {
    const image = useLayout<HTMLDivElement>({ layoutId: `card-${i}-image` })
    const title = useLayout<HTMLDivElement>({
        layoutId: `card-${i}-title`,
        layout: 'position',
    })
    const size = detail ? E4.detail : E4.card
    return (
        <>
            <div
                ref={image}
                data-layout-id={`card-${i}-image`}
                style={{
                    width: '100%',
                    height: size.image,
                    background: `linear-gradient(135deg, ${TILE_COLORS[i]}, ${TILE_COLORS[(i + 3) % TILE_COLORS.length]})`,
                }}
            />
            <div
                ref={title}
                data-layout-id={`card-${i}-title`}
                style={{
                    width: 'max-content',
                    margin: '12px 14px 0',
                    fontSize: 15,
                    lineHeight: '20px',
                    fontWeight: 700,
                }}
            >
                {E4.cards[i]}
            </div>
        </>
    )
}

function GridCard({
    i,
    onOpen,
}: {
    i: number
    onOpen?: ((i: number) => void) | undefined
}) {
    const ref = useLayout<HTMLButtonElement>({
        layoutId: `card-${i}`,
        radius: true,
    })
    return (
        <button
            ref={ref}
            type="button"
            data-layout-id={`card-${i}`}
            data-card={i}
            onClick={() => onOpen?.(i)}
            style={{
                // a button centres its content: the image starts at the top
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                width: E4.card.width,
                height: E4.card.height,
                padding: 0,
                border: 0,
                textAlign: 'left',
                overflow: 'hidden',
                borderRadius: 18,
                background: CARD,
                color: INK,
                boxShadow: '0 4px 16px rgb(0 0 0 / 0.1)',
                cursor: 'pointer',
            }}
        >
            <CardBody i={i} detail={false} />
        </button>
    )
}

function CardDetail({ i, clock }: { i: number; clock: Clock | undefined }) {
    const presence = usePresence(HOLD, presenceClock(clock))
    const ref = useLayout<HTMLDivElement>({
        layoutId: `card-${i}`,
        radius: true,
        ref: presence.ref,
    })
    const { x, y, width, height } = E4.detail
    return (
        <div
            ref={ref}
            data-layout-id={`card-${i}`}
            data-card-detail={i}
            style={{
                ...presence.style,
                position: 'absolute',
                left: x,
                top: y,
                width,
                height,
                overflow: 'hidden',
                borderRadius: 26,
                background: CARD,
                boxShadow: '0 12px 40px rgb(0 0 0 / 0.2)',
            }}
        >
            <CardBody i={i} detail={true} />
            <p
                style={{
                    margin: '10px 14px',
                    fontSize: 13,
                    lineHeight: '19px',
                }}
            >
                The card, its image and its title share ids with the detail: one
                track each, nested, so the image covers the card at every frame.
            </p>
        </div>
    )
}

export function CardFixture({
    open,
    clock,
    onOpen,
}: FixtureProps & {
    open: number | null
    onOpen?: ((i: number) => void) | undefined
}) {
    const { card } = E4
    return (
        <LayoutGroup
            clock={clock}
            motion={{ duration: DURATION, timing: SPRING }}
        >
            <Stage name="card" width={480} height={404}>
                <div style={{ display: 'flex', gap: card.gap }}>
                    {E4.cards.map((_, i) =>
                        open === i ? (
                            <div
                                key={i}
                                style={{
                                    width: card.width,
                                    height: card.height,
                                    borderRadius: 18,
                                    background: MUTED,
                                }}
                            />
                        ) : (
                            <GridCard key={i} i={i} onOpen={onOpen} />
                        )
                    )}
                </div>
                <AnimatePresence initial={false} mode="popLayout">
                    {open === null ? null : (
                        <CardDetail key={open} i={open} clock={clock} />
                    )}
                </AnimatePresence>
            </Stage>
        </LayoutGroup>
    )
}

/* ───────────────────────── E5 Notifications ───────────────────────── */

export const E5 = {
    width: 300,
    height: 48,
    gap: 8,
    enter: { translateY: 14, scaleX: 0.8 },
    exit: { translateY: 10, scaleX: 0.9, duration: 0.2 },
}

const TOAST_MOTION = {
    present: { opacity: 1, translateY: 0, scaleX: 1 },
    initial: {
        opacity: 0,
        translateY: E5.enter.translateY,
        scaleX: E5.enter.scaleX,
    },
    enter: ani({
        to: { opacity: 1, translateY: 0, scaleX: 1 },
        duration: 0.35,
        timing: SPRING,
    }),
    exit: ani({
        to: {
            opacity: 0,
            translateY: E5.exit.translateY,
            scaleX: E5.exit.scaleX,
        },
        duration: E5.exit.duration,
        timing: SPRING,
    }),
}

function Toast({ id, clock }: { id: string; clock: Clock | undefined }) {
    const presence = usePresence(TOAST_MOTION, presenceClock(clock))
    // CSS lays the stack out; presence and layout share the element
    const ref = useLayout<HTMLDivElement>({
        layout: 'position',
        ref: presence.ref,
    })
    return (
        <div
            ref={ref}
            data-toast={id}
            style={{
                ...presence.style,
                flex: 'none',
                width: E5.width,
                height: E5.height,
                boxSizing: 'border-box',
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: 14,
                background: CARD,
                boxShadow: '0 4px 16px rgb(0 0 0 / 0.12)',
                fontSize: 13,
                transformOrigin: 'center bottom',
            }}
        >
            {id}
        </div>
    )
}

export function ToastFixture({
    toasts,
    clock,
}: FixtureProps & { toasts: readonly string[] }) {
    return (
        <LayoutGroup
            clock={clock}
            motion={{ duration: DURATION, timing: SPRING }}
        >
            <Stage
                name="toasts"
                width={E5.width}
                height={5 * (E5.height + E5.gap)}
            >
                <div
                    data-toast-stack=""
                    style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: E5.gap,
                    }}
                >
                    <AnimatePresence initial={false} mode="popLayout">
                        {toasts.map((id) => (
                            <Toast key={id} id={id} clock={clock} />
                        ))}
                    </AnimatePresence>
                </div>
            </Stage>
        </LayoutGroup>
    )
}

/* ───────────────────────── Gallery ───────────────────────── */

export const GALLERY = {
    count: 16,
    grid: { tile: 72, gap: 8, columns: 4 },
    list: { width: 312, height: 28, gap: 6 },
    detail: { size: 312 },
}

/** A tile's box in the stage for a view. */
export function galleryTile(
    i: number,
    view: 'grid' | 'list'
): { x: number; y: number; w: number; h: number } {
    if (view === 'grid') {
        const { tile, gap, columns } = GALLERY.grid
        return {
            x: (i % columns) * (tile + gap),
            y: Math.floor(i / columns) * (tile + gap),
            w: tile,
            h: tile,
        }
    }
    const { width, height, gap } = GALLERY.list
    return { x: 0, y: i * (height + gap), w: width, h: height }
}

function GalleryTile({
    i,
    view,
    onOpen,
}: {
    i: number
    view: 'grid' | 'list'
    onOpen?: ((i: number) => void) | undefined
}) {
    const ref = useLayout<HTMLButtonElement>({ layoutId: `gallery-${i}` })
    const box = galleryTile(i, view)
    return (
        <button
            ref={ref}
            type="button"
            data-layout-id={`gallery-${i}`}
            data-tile={i}
            onClick={() => onOpen?.(i)}
            style={{
                width: box.w,
                height: box.h,
                padding: 0,
                border: 0,
                borderRadius: view === 'grid' ? 12 : 8,
                background: TILE_COLORS[i % TILE_COLORS.length],
                cursor: 'pointer',
            }}
        />
    )
}

function GalleryDetail({ i, clock }: { i: number; clock: Clock | undefined }) {
    const presence = usePresence(HOLD, presenceClock(clock))
    const ref = useLayout<HTMLDivElement>({
        layoutId: `gallery-${i}`,
        ref: presence.ref,
    })
    return (
        <div
            ref={ref}
            data-layout-id={`gallery-${i}`}
            data-gallery-detail={i}
            style={{
                ...presence.style,
                position: 'absolute',
                left: 0,
                top: 0,
                width: GALLERY.detail.size,
                height: GALLERY.detail.size,
                borderRadius: 20,
                background: TILE_COLORS[i % TILE_COLORS.length],
            }}
        />
    )
}

export function GalleryFixture({
    view,
    detail,
    clock,
    onOpen,
}: FixtureProps & {
    view: 'grid' | 'list'
    detail: number | null
    onOpen?: ((i: number) => void) | undefined
}) {
    const { tile, gap, columns } = GALLERY.grid
    const list = GALLERY.list
    const style: CSSProperties =
        view === 'grid'
            ? {
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, ${tile}px)`,
                  gap,
              }
            : { display: 'flex', flexDirection: 'column', gap: list.gap }
    return (
        <LayoutGroup
            clock={clock}
            motion={{ duration: DURATION, timing: SPRING }}
        >
            <Stage
                name="gallery"
                width={list.width}
                height={GALLERY.count * (list.height + list.gap)}
            >
                <div style={style}>
                    {Array.from({ length: GALLERY.count }, (_, i) =>
                        detail === i ? (
                            <div
                                key={i}
                                style={{
                                    ...galleryTileSize(i, view),
                                    borderRadius: 12,
                                    background: MUTED,
                                }}
                            />
                        ) : (
                            <GalleryTile
                                key={i}
                                i={i}
                                view={view}
                                onOpen={onOpen}
                            />
                        )
                    )}
                </div>
                <AnimatePresence initial={false} mode="popLayout">
                    {detail === null ? null : (
                        <GalleryDetail key={detail} i={detail} clock={clock} />
                    )}
                </AnimatePresence>
            </Stage>
        </LayoutGroup>
    )
}

function galleryTileSize(i: number, view: 'grid' | 'list'): CSSProperties {
    const box = galleryTile(i, view)
    return { width: box.w, height: box.h }
}
