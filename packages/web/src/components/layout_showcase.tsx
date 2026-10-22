'use client'

import { ani, timing } from '@freestylejs/ani-core'
import {
    AnimatePresence,
    LayoutGroup,
    useLayout,
    usePresence,
} from '@freestylejs/ani-react/layout'
import { type CSSProperties, type ReactNode, useState } from 'react'

const surface: CSSProperties = {
    position: 'relative',
    border: '1px solid var(--color-fd-border, #e4e4e7)',
    borderRadius: 18,
    background: 'var(--color-fd-card, #fff)',
    color: 'var(--color-fd-foreground, #18181b)',
    overflow: 'hidden',
}

const section: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 20,
    borderRadius: 22,
    border: '1px solid var(--color-fd-border, #e4e4e7)',
    background: 'var(--color-fd-card, #fff)',
}

const button: CSSProperties = {
    appearance: 'none',
    border: '1px solid var(--color-fd-border, #d4d4d8)',
    borderRadius: 999,
    background: 'var(--color-fd-primary, #18181b)',
    color: 'var(--color-fd-primary-foreground, #fff)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 650,
    padding: '9px 15px',
}

const muted = 'var(--color-fd-muted-foreground, #71717a)'

function Eyebrow({ children }: { children: ReactNode }) {
    return (
        <div
            style={{
                color: muted,
                fontSize: 11,
                fontWeight: 750,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
            }}
        >
            {children}
        </div>
    )
}

function ShowcaseCard({
    id,
    title,
    description,
    children,
}: {
    id: string
    title: string
    description: string
    children: ReactNode
}) {
    return (
        <section data-showcase={id} style={section}>
            <Eyebrow>{id}</Eyebrow>
            <h3 style={{ fontSize: 20, fontWeight: 750, margin: 0 }}>
                {title}
            </h3>
            <p
                style={{
                    color: muted,
                    fontSize: 14,
                    lineHeight: 1.6,
                    margin: 0,
                }}
            >
                {description}
            </p>
            <div style={{ display: 'grid', gap: 14 }}>{children}</div>
        </section>
    )
}

function AnchorFrame({ open }: { open: boolean }) {
    const parent = useLayout<HTMLDivElement>({
        layout: 'box',
        layoutAnchor: { x: 0.5, y: 0.5 },
        motion: {
            duration: 0.42,
            timing: timing.spring({ m: 1, k: 170, c: 18 }),
        },
    })
    const child = useLayout<HTMLDivElement>({
        layout: 'box',
        motion: {
            duration: 0.42,
            timing: timing.spring({ m: 1, k: 170, c: 18 }),
        },
    })
    return (
        <div
            ref={parent}
            data-anchor-parent={true}
            style={{
                ...surface,
                alignSelf: 'center',
                alignItems: 'flex-end',
                background: 'linear-gradient(135deg, #f4f4f5, #e4e4e7)',
                display: 'flex',
                height: open ? 186 : 116,
                justifyContent: 'center',
                padding: 16,
                width: open ? 300 : 190,
            }}
        >
            <div
                ref={child}
                data-anchor-child={true}
                style={{
                    background: '#18181b',
                    borderRadius: 12,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '11px 16px',
                }}
            >
                anchored
            </div>
        </div>
    )
}

function CreateButtonFrame({ expanded }: { expanded: boolean }) {
    const ref = useLayout<HTMLButtonElement>({
        layout: 'box',
        layoutId: 'documentation-create-button',
        motion: {
            duration: 0.34,
            timing: timing.spring({ m: 1, k: 190, c: 22 }),
        },
    })
    return (
        <button
            ref={ref}
            data-create-button={true}
            style={{
                ...button,
                alignItems: 'center',
                alignSelf: 'flex-start',
                display: 'flex',
                gap: 10,
                minHeight: 44,
                padding: expanded ? '13px 20px' : '11px 16px',
                width: expanded ? 260 : 156,
            }}
            type="button"
        >
            <span
                style={{
                    alignItems: 'center',
                    background: 'rgba(255,255,255,.18)',
                    borderRadius: 8,
                    display: 'inline-flex',
                    height: 22,
                    justifyContent: 'center',
                    width: 22,
                }}
            >
                +
            </span>
            <span>{expanded ? 'Create a new project' : 'New project'}</span>
        </button>
    )
}

function FolderFrame({ open }: { open: boolean }) {
    const ref = useLayout<HTMLDivElement>({
        layout: 'box',
        layoutId: 'documentation-folder',
        layoutAnchor: { x: 0.5, y: 0.5 },
        motion: {
            duration: 0.4,
            timing: timing.spring({ m: 1, k: 160, c: 20 }),
        },
    })
    return (
        <div
            ref={ref}
            data-folder={true}
            style={{
                ...surface,
                background: open
                    ? 'linear-gradient(145deg, #f5f3ff, #ede9fe)'
                    : 'linear-gradient(145deg, #fafafa, #f4f4f5)',
                height: open ? 180 : 82,
                padding: 14,
                width: open ? 300 : 174,
            }}
        >
            <div style={{ fontSize: 13, fontWeight: 750 }}>iOS Folder</div>
            <div style={{ color: muted, fontSize: 12, marginTop: 3 }}>
                {open ? '6 apps · grouped' : 'Tap to open'}
            </div>
            {open ? (
                <div
                    data-folder-apps={true}
                    style={{
                        display: 'grid',
                        gap: 9,
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        marginTop: 18,
                    }}
                >
                    {[
                        'Notes',
                        'Photos',
                        'Music',
                        'Files',
                        'Health',
                        'Maps',
                    ].map((name) => (
                        <div
                            key={name}
                            style={{
                                background: '#fff',
                                border: '1px solid #ddd6fe',
                                borderRadius: 10,
                                fontSize: 10,
                                fontWeight: 650,
                                padding: '12px 4px',
                                textAlign: 'center',
                            }}
                        >
                            {name}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    )
}

function StoreFrame({ selected }: { selected: boolean }) {
    const compact = useLayout<HTMLDivElement>({
        layout: 'position',
        layoutId: 'documentation-store-card',
    })
    const detail = useLayout<HTMLDivElement>({
        layout: 'position',
        layoutId: 'documentation-store-card',
    })
    return selected ? (
        <div
            ref={detail}
            data-store-detail={true}
            style={{
                ...surface,
                background: 'linear-gradient(145deg, #ecfeff, #cffafe)',
                padding: 18,
                width: 300,
            }}
        >
            <div style={{ fontSize: 12, fontWeight: 750, color: '#0e7490' }}>
                APP STORE
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, marginTop: 8 }}>
                Design tools
            </div>
            <p style={{ color: '#155e75', fontSize: 13, lineHeight: 1.55 }}>
                A compact card grows into a focused product detail surface.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
                {['Editorial', 'Systems', 'Motion'].map((tag) => (
                    <span
                        key={tag}
                        style={{
                            background: 'rgba(14,116,144,.1)',
                            borderRadius: 999,
                            color: '#0e7490',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '5px 9px',
                        }}
                    >
                        {tag}
                    </span>
                ))}
            </div>
        </div>
    ) : (
        <div
            ref={compact}
            data-store-card={true}
            style={{
                ...surface,
                alignItems: 'center',
                background: '#ecfeff',
                display: 'flex',
                gap: 12,
                padding: 14,
                width: 240,
            }}
        >
            <div
                style={{
                    background: '#0891b2',
                    borderRadius: 12,
                    height: 44,
                    width: 44,
                }}
            />
            <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>
                    Design tools
                </div>
                <div style={{ color: '#155e75', fontSize: 12 }}>
                    Product detail
                </div>
            </div>
        </div>
    )
}

const toastMotion = {
    present: { opacity: 1, translateY: 0 },
    initial: { opacity: 0, translateY: 10 },
    exit: ani({
        to: { opacity: 0, translateY: 10 },
        duration: 0.2,
        timing: timing.linear(),
    }),
}

function ToastRow({ text }: { text: string }) {
    const presence = usePresence(toastMotion)
    const ref = useLayout<HTMLDivElement>({
        layout: 'position',
        ref: presence.ref,
    })
    return (
        <div
            ref={ref}
            data-toast={true}
            style={{
                background: '#18181b',
                borderRadius: 12,
                color: '#fff',
                fontSize: 12,
                fontWeight: 650,
                padding: '11px 14px',
                ...presence.style,
            }}
        >
            {text}
        </div>
    )
}

const galleryItems = ['Aurora', 'Mono', 'Tide', 'Orbit', 'Fable', 'Nova']

function GalleryTile({ name }: { name: string }) {
    const ref = useLayout<HTMLDivElement>({ layout: 'position' })
    return (
        <div
            ref={ref}
            data-gallery-tile={true}
            style={{
                ...surface,
                background: 'linear-gradient(145deg, #fff7ed, #ffedd5)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: 104,
                padding: 12,
            }}
        >
            <span style={{ color: '#9a3412', fontSize: 10, fontWeight: 800 }}>
                COLLECTION
            </span>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{name}</span>
        </div>
    )
}

export function LayoutShowcase() {
    const [anchorOpen, setAnchorOpen] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)
    const [folderOpen, setFolderOpen] = useState(false)
    const [storeOpen, setStoreOpen] = useState(false)
    const [layout, setLayout] = useState<'grid' | 'list'>('grid')
    const [nextToast, setNextToast] = useState(3)
    const [toasts, setToasts] = useState([
        { id: 1, text: 'Project synced' },
        { id: 2, text: 'Layout plan compiled' },
    ])

    return (
        <div
            data-layout-showcase={true}
            style={{ display: 'grid', gap: 18, margin: '28px 0' }}
        >
            <div
                style={{
                    ...surface,
                    background:
                        'linear-gradient(120deg, #faf5ff 0%, #eef2ff 55%, #ecfeff 100%)',
                    padding: 24,
                }}
            >
                <Eyebrow>Ani layout / compiled projection</Eyebrow>
                <h2
                    style={{
                        fontSize: 28,
                        letterSpacing: '-.035em',
                        margin: '8px 0 6px',
                    }}
                >
                    Layout motion, without a per-frame loop.
                </h2>
                <p
                    style={{
                        color: muted,
                        fontSize: 14,
                        lineHeight: 1.65,
                        maxWidth: 660,
                    }}
                >
                    These are live documentation fixtures for the reduced B′
                    contract: compositor-native FLIP, bounded projection, shared
                    identity, presence and a 2D gallery. Interact with each
                    surface.
                </p>
            </div>

            <ShowcaseCard
                id="E1"
                title="Layout Anchor"
                description="A spring-driven parent box and an anchored child keep their first-frame continuity while the parent resizes."
            >
                <LayoutGroup deps={[anchorOpen]}>
                    <AnchorFrame open={anchorOpen} />
                </LayoutGroup>
                <button
                    data-action="toggle-anchor"
                    onClick={() => setAnchorOpen((value) => !value)}
                    style={button}
                    type="button"
                >
                    {anchorOpen ? 'Collapse anchor' : 'Expand anchor'}
                </button>
            </ShowcaseCard>

            <ShowcaseCard
                id="E2"
                title="Create Button"
                description="A shared layoutId hands the create button from compact to expanded geometry in one measured frame."
            >
                <div
                    style={{
                        alignItems: 'center',
                        display: 'flex',
                        minHeight: 64,
                    }}
                >
                    <LayoutGroup deps={[createOpen]}>
                        <CreateButtonFrame expanded={createOpen} />
                    </LayoutGroup>
                </div>
                <button
                    data-action="toggle-create"
                    onClick={() => setCreateOpen((value) => !value)}
                    style={button}
                    type="button"
                >
                    {createOpen ? 'Compact create' : 'Expand create'}
                </button>
            </ShowcaseCard>

            <ShowcaseCard
                id="E3"
                title="iOS Folder"
                description="A folder surface opens into a grouped 2D app matrix. The folder uses box motion and a centered anchor."
            >
                <LayoutGroup deps={[folderOpen]}>
                    <FolderFrame open={folderOpen} />
                </LayoutGroup>
                <button
                    data-action="toggle-folder"
                    onClick={() => setFolderOpen((value) => !value)}
                    style={button}
                    type="button"
                >
                    {folderOpen ? 'Close folder' : 'Open folder'}
                </button>
            </ShowcaseCard>

            <ShowcaseCard
                id="E4"
                title="App Store"
                description="A compact product card grows into a focused detail panel using a shared layoutId and position layout."
            >
                <LayoutGroup deps={[storeOpen]}>
                    <StoreFrame selected={storeOpen} />
                </LayoutGroup>
                <button
                    data-action="toggle-store"
                    onClick={() => setStoreOpen((value) => !value)}
                    style={button}
                    type="button"
                >
                    {storeOpen ? 'Back to card' : 'Open product'}
                </button>
            </ShowcaseCard>

            <ShowcaseCard
                id="E5"
                title="Notifications"
                description="popLayout removes exits from flow immediately while siblings and the remaining stack settle with a managed group clock."
            >
                <LayoutGroup deps={[toasts]}>
                    <div
                        data-toast-list={true}
                        style={{
                            display: 'grid',
                            gap: 8,
                            minHeight: 76,
                            position: 'relative',
                        }}
                    >
                        <AnimatePresence initial={false} mode="popLayout">
                            {toasts.map((toast) => (
                                <ToastRow key={toast.id} text={toast.text} />
                            ))}
                        </AnimatePresence>
                    </div>
                </LayoutGroup>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        data-action="add-toast"
                        onClick={() => {
                            setToasts((current) => [
                                ...current,
                                {
                                    id: nextToast,
                                    text: `Notification ${nextToast}`,
                                },
                            ])
                            setNextToast((value) => value + 1)
                        }}
                        style={button}
                        type="button"
                    >
                        Add toast
                    </button>
                    <button
                        data-action="remove-toast"
                        onClick={() => setToasts((current) => current.slice(1))}
                        style={{
                            ...button,
                            background: 'transparent',
                            color: 'inherit',
                        }}
                        type="button"
                    >
                        Remove first
                    </button>
                </div>
            </ShowcaseCard>

            <ShowcaseCard
                id="Gallery"
                title="Reduced 2D Gallery"
                description="Grid and list poses share a layout group; no 3D, drag, scroll observer or loop is used."
            >
                <LayoutGroup deps={[layout]}>
                    <div
                        data-gallery={true}
                        style={{
                            display: 'grid',
                            gap: 10,
                            gridTemplateColumns:
                                layout === 'grid'
                                    ? 'repeat(3, minmax(0, 1fr))'
                                    : '1fr',
                        }}
                    >
                        {galleryItems.map((name) => (
                            <GalleryTile key={name} name={name} />
                        ))}
                    </div>
                </LayoutGroup>
                <button
                    data-action="toggle-gallery"
                    onClick={() =>
                        setLayout((value) =>
                            value === 'grid' ? 'list' : 'grid'
                        )
                    }
                    style={button}
                    type="button"
                >
                    {layout === 'grid' ? 'List pose' : 'Grid pose'}
                </button>
            </ShowcaseCard>
        </div>
    )
}
