'use client'

import { ani, timing } from '@freestylejs/ani-core'
import {
    AnimatePresence,
    LayoutGroup,
    useLayout,
    usePresence,
} from '@freestylejs/ani-react/layout'
import {
    ArrowLeft,
    ArrowUpRight,
    Bell,
    ChevronDown,
    FileText,
    Folder,
    Grid2X2,
    Layers,
    LayoutGrid,
    List,
    type LucideIcon,
    Plus,
    Sparkles,
    Star,
    X,
    Zap,
} from 'lucide-react'
import { type CSSProperties, type ReactNode, useState } from 'react'
import styles from './layout_showcase.module.css'

const spring = {
    duration: 0.46,
    timing: timing.spring({ m: 1, k: 170, c: 18 }),
}

function join(...values: Array<string | false | null | undefined>): string {
    return values.filter(Boolean).join(' ')
}

function ShowcaseCard({
    id,
    title,
    description,
    tag,
    wide = false,
    children,
}: {
    id: string
    title: string
    description: string
    tag: string
    wide?: boolean
    children: ReactNode
}) {
    return (
        <section
            className={join(styles.card, wide && styles.wide)}
            data-showcase={id}
        >
            <header className={styles.cardHead}>
                <span className={styles.index}>{id}</span>
                <div className={styles.titleWrap}>
                    <h3 className={styles.title}>{title}</h3>
                    <p className={styles.copy}>{description}</p>
                </div>
                <span className={styles.tag}>{tag}</span>
            </header>
            {children}
        </section>
    )
}

function AnchorSurface({
    open,
    onToggle,
}: {
    open: boolean
    onToggle: () => void
}) {
    const parent = useLayout<HTMLDivElement>({
        layout: 'box',
        motion: spring,
    })
    const child = useLayout<HTMLDivElement>({
        layout: 'box',
        layoutAnchor: { x: 0.5, y: 0.5 },
        motion: spring,
    })

    return (
        <div className={styles.stage}>
            <div
                ref={parent}
                className={join(
                    styles.anchorParent,
                    open && styles.anchorParentOpen
                )}
                data-anchor-parent={true}
                onClick={onToggle}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onToggle()
                }}
            >
                <div
                    ref={child}
                    className={join(
                        styles.anchorChild,
                        open && styles.anchorChildOpen
                    )}
                    data-anchor-child={true}
                >
                    <span className={styles.crosshair} />A
                </div>
                <span className={styles.anchorLabel}>anchor 0.5 / 0.5</span>
            </div>
        </div>
    )
}

function AnchorDemo() {
    const [open, setOpen] = useState(false)
    const toggle = () => setOpen((value) => !value)
    return (
        <>
            <LayoutGroup deps={[open]}>
                <AnchorSurface open={open} onToggle={toggle} />
            </LayoutGroup>
            <div className={styles.controls}>
                <button
                    className={styles.control}
                    data-action="toggle-anchor"
                    onClick={toggle}
                    type="button"
                >
                    <ArrowUpRight size={13} />
                    {open ? 'Collapse surface' : 'Expand surface'}
                </button>
                <span className={styles.metaPill}>layoutAnchor</span>
            </div>
        </>
    )
}

const createActions: Array<{ icon: LucideIcon; label: string }> = [
    { icon: FileText, label: 'Document' },
    { icon: LayoutGrid, label: 'Board' },
    { icon: Sparkles, label: 'Prompt' },
    { icon: FileText, label: 'Template' },
]

function CreateSurface({
    open,
    onToggle,
}: {
    open: boolean
    onToggle: () => void
}) {
    const surface = useLayout<HTMLDivElement>({
        layout: 'box',
        layoutId: 'showcase-create-button',
        layoutAnchor: { x: 0.5, y: 0.5 },
        motion: spring,
    })
    return (
        <div className={styles.stage}>
            <div className={styles.createStage}>
                <div
                    ref={surface}
                    className={join(
                        styles.createSurface,
                        open && styles.createSurfaceOpen
                    )}
                    data-create-button={true}
                    onClick={onToggle}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ')
                            onToggle()
                    }}
                >
                    <div className={styles.createTop}>
                        <span className={styles.createIcon}>
                            <Plus size={14} />
                        </span>
                        <span className={styles.createText}>
                            {open ? 'Create something' : 'New project'}
                        </span>
                        <ChevronDown
                            className={join(
                                styles.createChevron,
                                open && styles.createChevronOpen
                            )}
                            size={14}
                        />
                    </div>
                    {open ? (
                        <div className={styles.createMenu}>
                            {createActions.map(({ icon: Icon, label }) => (
                                <div
                                    key={label}
                                    className={styles.createAction}
                                >
                                    <Icon size={12} />
                                    {label}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

function CreateDemo() {
    const [open, setOpen] = useState(false)
    const toggle = () => setOpen((value) => !value)
    return (
        <>
            <LayoutGroup deps={[open]}>
                <CreateSurface open={open} onToggle={toggle} />
            </LayoutGroup>
            <div className={styles.controls}>
                <button
                    className={styles.control}
                    data-action="toggle-create"
                    onClick={toggle}
                    type="button"
                >
                    <Zap size={13} />
                    {open ? 'Collapse menu' : 'Open create menu'}
                </button>
                <span className={styles.metaPill}>shared layoutId</span>
            </div>
        </>
    )
}

const folderApps: Array<{ label: string; icon: LucideIcon; color: string }> = [
    {
        label: 'Notes',
        icon: FileText,
        color: 'linear-gradient(135deg,#f59e0b,#f97316)',
    },
    {
        label: 'Photos',
        icon: Sparkles,
        color: 'linear-gradient(135deg,#ec4899,#8b5cf6)',
    },
    {
        label: 'Music',
        icon: Star,
        color: 'linear-gradient(135deg,#ef4444,#ec4899)',
    },
    {
        label: 'Files',
        icon: Folder,
        color: 'linear-gradient(135deg,#3b82f6,#06b6d4)',
    },
    {
        label: 'Health',
        icon: Zap,
        color: 'linear-gradient(135deg,#22c55e,#14b8a6)',
    },
    {
        label: 'Maps',
        icon: Layers,
        color: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    },
    {
        label: 'Reader',
        icon: FileText,
        color: 'linear-gradient(135deg,#64748b,#334155)',
    },
    {
        label: 'Studio',
        icon: Grid2X2,
        color: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
    },
    {
        label: 'Timer',
        icon: Zap,
        color: 'linear-gradient(135deg,#f97316,#ef4444)',
    },
]

function FolderSurface({
    open,
    onToggle,
}: {
    open: boolean
    onToggle: () => void
}) {
    const surface = useLayout<HTMLDivElement>({
        layout: 'box',
        layoutId: 'showcase-folder',
        layoutAnchor: { x: 0.5, y: 0.5 },
        motion: spring,
    })
    return (
        <div className={join(styles.stage, styles.folderStage)}>
            <div
                ref={surface}
                className={join(
                    styles.folderSurface,
                    open && styles.folderSurfaceOpen
                )}
                data-folder={true}
                onClick={onToggle}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onToggle()
                }}
            >
                <div className={styles.folderTop}>
                    <div>
                        <div className={styles.folderTitle}>Creator Studio</div>
                        <div className={styles.folderSub}>
                            {open ? '9 apps · grouped' : 'Tap to open folder'}
                        </div>
                    </div>
                    <Folder size={16} />
                </div>
                {open ? (
                    <div className={styles.folderApps} data-folder-apps={true}>
                        {folderApps.map(({ label, icon: Icon, color }) => (
                            <div key={label} className={styles.folderApp}>
                                <div
                                    className={styles.folderAppIcon}
                                    style={{ '--tile': color } as CSSProperties}
                                >
                                    <Icon size={17} />
                                </div>
                                <span className={styles.folderAppLabel}>
                                    {label}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.folderMini}>
                        {folderApps.map(({ label, color }) => (
                            <div
                                key={label}
                                className={styles.folderMiniCell}
                                style={{ '--tile': color } as CSSProperties}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function FolderDemo() {
    const [open, setOpen] = useState(false)
    const toggle = () => setOpen((value) => !value)
    return (
        <>
            <LayoutGroup deps={[open]}>
                <FolderSurface open={open} onToggle={toggle} />
            </LayoutGroup>
            <div className={styles.controls}>
                <button
                    className={styles.control}
                    data-action="toggle-folder"
                    onClick={toggle}
                    type="button"
                >
                    <Folder size={13} />
                    {open ? 'Close folder' : 'Open folder'}
                </button>
                <span className={styles.metaPill}>popLayout</span>
            </div>
        </>
    )
}

const storeItems = [
    {
        id: 'atlas',
        category: 'DESIGN SYSTEMS',
        title: 'Atlas',
        meta: 'Field guide · 24 min',
        copy: 'A calm, practical guide to building interfaces that feel inevitable.',
        cover: 'linear-gradient(135deg,#4f46e5,#7c3aed 55%,#ec4899)',
        icon: Layers,
        tags: ['Editorial', 'Systems', 'Craft'],
    },
    {
        id: 'orbit',
        category: 'MOTION',
        title: 'Orbit',
        meta: 'Motion studies · 18 min',
        copy: 'A small collection of physical motion patterns for product teams.',
        cover: 'linear-gradient(135deg,#0f766e,#0891b2 55%,#22d3ee)',
        icon: Sparkles,
        tags: ['Spring', 'Layout', 'Presence'],
    },
    {
        id: 'signal',
        category: 'INTERFACE',
        title: 'Signal',
        meta: 'Product craft · 31 min',
        copy: 'A practical field guide to quieter controls, stronger hierarchy.',
        cover: 'linear-gradient(135deg,#b45309,#f59e0b 55%,#fde68a)',
        icon: Star,
        tags: ['Product', 'Rhythm', 'Focus'],
    },
]

function StoreCard({
    item,
    onSelect,
}: {
    item: (typeof storeItems)[number]
    onSelect: () => void
}) {
    const ref = useLayout<HTMLButtonElement>({
        layout: 'box',
        layoutId: `showcase-store-${item.id}`,
    })
    const Icon = item.icon
    return (
        <button
            ref={ref}
            className={styles.storeCard}
            data-store-card={true}
            onClick={onSelect}
            style={{ '--cover': item.cover } as CSSProperties}
            type="button"
        >
            <span className={styles.storeCover}>
                <Icon size={24} />
            </span>
            <span className={styles.storeBody}>
                <span className={styles.storeCategory}>{item.category}</span>
                <span className={styles.storeTitle}>{item.title}</span>
                <span className={styles.storeMeta}>{item.meta}</span>
            </span>
        </button>
    )
}

function StoreDetail({
    item,
    onClose,
}: {
    item: (typeof storeItems)[number]
    onClose: () => void
}) {
    const ref = useLayout<HTMLDivElement>({
        layout: 'box',
        layoutId: `showcase-store-${item.id}`,
    })
    const Icon = item.icon
    return (
        <div
            ref={ref}
            className={styles.storeDetail}
            data-store-detail={true}
            style={{ '--cover': item.cover } as CSSProperties}
        >
            <div className={styles.detailCover}>
                <Icon size={38} />
                <button
                    aria-label="Close product"
                    className={styles.detailBack}
                    onClick={onClose}
                    type="button"
                >
                    <X size={13} />
                </button>
            </div>
            <div className={styles.detailBody}>
                <div className={styles.storeCategory}>{item.category}</div>
                <div className={styles.detailTitle}>{item.title}</div>
                <p className={styles.detailCopy}>{item.copy}</p>
                <div className={styles.detailTags}>
                    {item.tags.map((tag) => (
                        <span key={tag} className={styles.detailTag}>
                            {tag}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    )
}

function StoreDemo() {
    const [selected, setSelected] = useState<string | null>(null)
    const selectedItem = storeItems.find((item) => item.id === selected)

    return (
        <>
            <div className={join(styles.stage, styles.storeStage)}>
                <LayoutGroup deps={[selected]}>
                    {selectedItem ? (
                        <StoreDetail
                            item={selectedItem}
                            onClose={() => setSelected(null)}
                        />
                    ) : (
                        <div className={styles.storeGrid}>
                            {storeItems.map((item) => (
                                <StoreCard
                                    key={item.id}
                                    item={item}
                                    onSelect={() => setSelected(item.id)}
                                />
                            ))}
                        </div>
                    )}
                </LayoutGroup>
            </div>
            <div className={styles.controls}>
                <button
                    className={styles.control}
                    data-action="toggle-store"
                    onClick={() =>
                        setSelected((value) =>
                            value ? null : storeItems[0]!.id
                        )
                    }
                    type="button"
                >
                    <ArrowLeft size={13} />
                    {selected ? 'Back to storefront' : 'Open featured product'}
                </button>
            </div>
        </>
    )
}

const toastMotion = {
    present: { opacity: 1, translateY: 0 },
    initial: { opacity: 0, translateY: 8 },
    exit: ani({
        to: { opacity: 0, translateY: 8 },
        duration: 0.2,
        timing: timing.linear(),
    }),
}

function ToastRow({
    index,
    text,
    onClose,
}: {
    index: number
    text: string
    onClose: () => void
}) {
    const presence = usePresence(toastMotion)
    const ref = useLayout<HTMLDivElement>({
        layout: 'position',
        ref: presence.ref,
    })
    return (
        <div
            ref={ref}
            className={styles.toast}
            data-toast={true}
            style={{ top: index * 48, zIndex: 10 - index }}
        >
            <div className={styles.toastIcon}>
                <Bell size={12} />
            </div>
            <div className={styles.toastBody}>
                <div className={styles.toastTitle}>Workspace update</div>
                <div className={styles.toastText}>{text}</div>
            </div>
            <button
                aria-label="Dismiss notification"
                className={styles.toastClose}
                onClick={onClose}
                type="button"
            >
                <X size={11} />
            </button>
        </div>
    )
}

function ToastDemo() {
    const [toasts, setToasts] = useState([
        { id: 1, text: 'Project synced with the team' },
        { id: 2, text: 'Layout plan compiled' },
    ])
    const [nextId, setNextId] = useState(3)

    return (
        <>
            <div className={join(styles.stage, styles.toastStage)}>
                <div className={styles.toastPhone}>
                    <div className={styles.toastTop}>
                        <span>Notifications</span>
                        <span className={styles.toastStatus}>
                            <span className={styles.toastStatusDot} />
                            live
                        </span>
                    </div>
                    <LayoutGroup deps={[toasts]}>
                        <div
                            className={styles.toastList}
                            data-toast-list={true}
                        >
                            <AnimatePresence initial={false} mode="popLayout">
                                {toasts.map((toast, index) => (
                                    <ToastRow
                                        key={toast.id}
                                        index={index}
                                        text={toast.text}
                                        onClose={() =>
                                            setToasts((current) =>
                                                current.filter(
                                                    (entry) =>
                                                        entry.id !== toast.id
                                                )
                                            )
                                        }
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    </LayoutGroup>
                </div>
            </div>
            <div className={styles.controls}>
                <button
                    className={styles.control}
                    data-action="add-toast"
                    onClick={() => {
                        setToasts((current) => [
                            ...current,
                            {
                                id: nextId,
                                text: `A new layout notification #${nextId}`,
                            },
                        ])
                        setNextId((value) => value + 1)
                    }}
                    type="button"
                >
                    <Plus size={13} />
                    Push notification
                </button>
                <button
                    className={join(styles.control, styles.controlGhost)}
                    data-action="remove-toast"
                    onClick={() => setToasts((current) => current.slice(1))}
                    type="button"
                >
                    Remove oldest
                </button>
            </div>
        </>
    )
}

const galleryItems = [
    {
        name: 'Aurora',
        meta: 'Gradient study',
        art: 'linear-gradient(135deg,#6366f1,#ec4899)',
        marker: '01',
    },
    {
        name: 'Mono',
        meta: 'Type system',
        art: 'linear-gradient(135deg,#18181b,#52525b)',
        marker: '02',
    },
    {
        name: 'Tide',
        meta: 'Color field',
        art: 'linear-gradient(135deg,#06b6d4,#3b82f6)',
        marker: '03',
    },
    {
        name: 'Orbit',
        meta: 'Motion study',
        art: 'linear-gradient(135deg,#f59e0b,#ef4444)',
        marker: '04',
    },
    {
        name: 'Fable',
        meta: 'Editorial',
        art: 'linear-gradient(135deg,#10b981,#84cc16)',
        marker: '05',
    },
    {
        name: 'Nova',
        meta: 'Interface',
        art: 'linear-gradient(135deg,#8b5cf6,#22d3ee)',
        marker: '06',
    },
]

function GalleryTile({ item }: { item: (typeof galleryItems)[number] }) {
    const ref = useLayout<HTMLDivElement>({ layout: 'box' })
    return (
        <div ref={ref} className={styles.galleryTile} data-gallery-tile={true}>
            <div
                className={styles.tileArt}
                style={{ '--art': item.art } as CSSProperties}
            />
            <span className={styles.tileMarker}>{item.marker}</span>
            <div className={styles.tileInfo}>
                <div className={styles.tileTitle}>{item.name}</div>
                <div className={styles.tileMeta}>{item.meta}</div>
            </div>
        </div>
    )
}

function GalleryDemo() {
    const [layout, setLayout] = useState<'grid' | 'list'>('grid')
    return (
        <>
            <div className={join(styles.stage, styles.galleryStage)}>
                <LayoutGroup deps={[layout]}>
                    <div
                        className={join(
                            styles.gallery,
                            layout === 'grid'
                                ? styles.galleryGrid
                                : styles.galleryList
                        )}
                        data-gallery={true}
                    >
                        {galleryItems.map((item) => (
                            <GalleryTile key={item.name} item={item} />
                        ))}
                    </div>
                </LayoutGroup>
            </div>
            <div className={styles.toolbar}>
                <div className={styles.controls}>
                    <button
                        className={styles.control}
                        data-action="toggle-gallery"
                        onClick={() =>
                            setLayout((value) =>
                                value === 'grid' ? 'list' : 'grid'
                            )
                        }
                        type="button"
                    >
                        {layout === 'grid' ? (
                            <List size={13} />
                        ) : (
                            <Grid2X2 size={13} />
                        )}
                        {layout === 'grid'
                            ? 'Switch to list'
                            : 'Switch to grid'}
                    </button>
                </div>
                <span className={styles.metaPill}>
                    {layout === 'grid' ? '3 columns' : 'single column'}
                </span>
            </div>
        </>
    )
}

export function LayoutShowcase() {
    return (
        <div className={styles.root} data-layout-showcase={true}>
            <section className={styles.hero}>
                <div className={styles.heroTop}>
                    <span className={styles.badge}>
                        <span className={styles.dot} />
                        Layout Lab
                    </span>
                    <span className={styles.metaPill}>Ani 2.0 / docs</span>
                </div>
                <h2 className={styles.heroTitle}>
                    Layout motion that feels
                    <br />
                    <em>physical, not procedural.</em>
                </h2>
                <p className={styles.heroCopy}>
                    A live documentation lab for Ani’s compositor-native layout
                    surface. Resize, morph, stack and reorder real DOM without a
                    per-frame JavaScript loop.
                </p>
                <div className={styles.heroMeta}>
                    <span className={styles.metaPill}>5 layout studies</span>
                    <span className={styles.metaPill}>reduced 2D gallery</span>
                    <span className={styles.metaPill}>WAAPI projection</span>
                </div>
                <div className={styles.preview} aria-hidden="true">
                    <div className={styles.previewCard}>
                        <div className={styles.previewArt} />
                        <div className={styles.previewLine} />
                        <div className={styles.previewLine} />
                    </div>
                    <div className={styles.previewCard}>
                        <div className={styles.previewArt} />
                        <div className={styles.previewLine} />
                        <div className={styles.previewLine} />
                    </div>
                    <div className={styles.previewCard}>
                        <div className={styles.previewArt} />
                        <div className={styles.previewLine} />
                    </div>
                </div>
            </section>

            <div className={styles.grid}>
                <ShowcaseCard
                    id="E1"
                    title="Layout Anchor"
                    description="Resize a spring-driven parent without letting the child drift. The crosshair is the anchor point."
                    tag="projection"
                >
                    <AnchorDemo />
                </ShowcaseCard>

                <ShowcaseCard
                    id="E2"
                    title="Create Button"
                    description="A shared layoutId turns one compact action into a small creation menu while keeping the same surface identity."
                    tag="shared id"
                >
                    <CreateDemo />
                </ShowcaseCard>

                <ShowcaseCard
                    id="E3"
                    title="iOS Folder"
                    description="A reduced 2D folder: tap the tile, reveal the app matrix, and let the surface morph around it."
                    tag="popLayout"
                >
                    <FolderDemo />
                </ShowcaseCard>

                <ShowcaseCard
                    id="E4"
                    title="App Store"
                    description="A storefront card becomes a focused detail panel. The transition is shared identity, not a route swap."
                    tag="shared id"
                >
                    <StoreDemo />
                </ShowcaseCard>

                <ShowcaseCard
                    id="E5"
                    title="Notifications"
                    description="Stacked notifications settle as siblings move, with popLayout removing exits from flow immediately."
                    tag="presence"
                    wide={true}
                >
                    <ToastDemo />
                </ShowcaseCard>

                <ShowcaseCard
                    id="Gallery"
                    title="Reduced 2D Gallery"
                    description="A gallery should feel like a gallery. Toggle pose and watch every tile re-measure through one layout group."
                    tag="grid / list"
                    wide={true}
                >
                    <GalleryDemo />
                </ShowcaseCard>
            </div>
        </div>
    )
}
