'use client'

/**
 * The layout showcase: the acceptance fixtures (`layout_fixtures.tsx`), each
 * with its controls. The browser tests drive these same components and check
 * every frame (ARCHITECTURE.md §11), so what is shown here is what is tested.
 */
import { type ReactNode, useRef, useState } from 'react'
import {
    AnchorFixture,
    CardFixture,
    CreateFixture,
    E4,
    FolderFixture,
    GALLERY,
    GalleryFixture,
    ToastFixture,
} from './layout_fixtures'
import styles from './layout_showcase.module.css'

function join(...values: Array<string | false | null | undefined>): string {
    return values.filter(Boolean).join(' ')
}

function ShowcaseCard({
    id,
    title,
    description,
    tag,
    wide = false,
    controls,
    children,
}: {
    id: string
    title: string
    description: string
    tag: string
    wide?: boolean
    controls: ReactNode
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
            <div className={styles.controls} data-controls={true}>
                {controls}
            </div>
            <div className={styles.stage}>{children}</div>
        </section>
    )
}

function Control({
    onClick,
    ghost = false,
    disabled = false,
    children,
}: {
    onClick: () => void
    ghost?: boolean
    disabled?: boolean
    children: ReactNode
}) {
    return (
        <button
            type="button"
            className={join(styles.control, ghost && styles.controlGhost)}
            onClick={onClick}
            disabled={disabled}
        >
            {children}
        </button>
    )
}

function AnchorDemo() {
    const [expanded, setExpanded] = useState(false)
    return (
        <ShowcaseCard
            id="E1"
            title="Layout anchor"
            description="The parent grows; the anchored child keeps its point at the parent's centre (the crosshair) and changes its own size after a delay."
            tag="layoutAnchor"
            controls={
                <Control onClick={() => setExpanded((v) => !v)}>
                    {expanded ? 'Shrink' : 'Expand'}
                </Control>
            }
        >
            <AnchorFixture expanded={expanded} />
        </ShowcaseCard>
    )
}

function CreateDemo() {
    const [open, setOpen] = useState(false)
    return (
        <ShowcaseCard
            id="E2"
            title="Create button"
            description="The button and the menu share their wrapper, icon and label ids: one surface morphs, the label keeps its glyph size, and a quick close and reopen continues from where it is."
            tag="shared ids"
            controls={
                <Control onClick={() => setOpen((v) => !v)}>
                    {open ? 'Close menu' : 'Open menu'}
                </Control>
            }
        >
            <CreateFixture open={open} />
        </ShowcaseCard>
    )
}

function FolderDemo() {
    const [open, setOpen] = useState(false)
    return (
        <ShowcaseCard
            id="E3"
            title="Folder"
            description="Four mini tiles grow into the open folder's icons; the other apps enter from the folder at scale 0.2 with a stagger."
            tag="popLayout"
            controls={
                <Control onClick={() => setOpen((v) => !v)}>
                    {open ? 'Close folder' : 'Open folder'}
                </Control>
            }
        >
            <FolderFixture open={open} />
        </ShowcaseCard>
    )
}

function CardDemo() {
    const [open, setOpen] = useState<number | null>(null)
    return (
        <ShowcaseCard
            id="E4"
            title="Card to detail"
            description="Surface, image and title are nested shared ids, one track each: the image covers the card at every frame and the title keeps its size."
            tag="nested ids"
            controls={
                <>
                    {E4.cards.map((name, i) => (
                        <Control
                            key={name}
                            ghost={true}
                            disabled={open === i}
                            onClick={() => setOpen(i)}
                        >
                            {name}
                        </Control>
                    ))}
                    <Control
                        disabled={open === null}
                        onClick={() => setOpen(null)}
                    >
                        Close
                    </Control>
                </>
            }
        >
            <CardFixture open={open} onOpen={setOpen} />
        </ShowcaseCard>
    )
}

function ToastDemo() {
    const next = useRef(1)
    const [toasts, setToasts] = useState<readonly string[]>([])
    const add = () => {
        const id = `t${next.current++}`
        setToasts((list) => [id, ...list].slice(0, 5))
    }
    const removeMiddle = () =>
        setToasts((list) =>
            list.filter((_, i) => i !== Math.floor(list.length / 2))
        )
    return (
        <ShowcaseCard
            id="E5"
            title="Notifications"
            description="CSS lays the stack out. A new toast enters from below at scaleX 0.8 while the others move by layout; an exit pops out of the flow and its siblings close the gap."
            tag="presence + layout"
            wide={true}
            controls={
                <>
                    <Control onClick={add}>Add</Control>
                    <Control
                        ghost={true}
                        disabled={toasts.length === 0}
                        onClick={removeMiddle}
                    >
                        Remove middle
                    </Control>
                    <Control
                        ghost={true}
                        disabled={toasts.length === 0}
                        onClick={() => setToasts([])}
                    >
                        Clear
                    </Control>
                </>
            }
        >
            <ToastFixture toasts={toasts} />
        </ShowcaseCard>
    )
}

function GalleryDemo() {
    const [view, setView] = useState<'grid' | 'list'>('grid')
    const [detail, setDetail] = useState<number | null>(null)
    return (
        <ShowcaseCard
            id="Gallery"
            title="Gallery"
            description={`${GALLERY.count} tiles move between a grid and a list in one layout group; a tile opens into a detail view that shares its id.`}
            tag="grid / list"
            wide={true}
            controls={
                <>
                    <Control
                        onClick={() =>
                            setView((v) => (v === 'grid' ? 'list' : 'grid'))
                        }
                    >
                        {view === 'grid' ? 'Show as list' : 'Show as grid'}
                    </Control>
                    <Control
                        ghost={true}
                        disabled={detail === null}
                        onClick={() => setDetail(null)}
                    >
                        Close detail
                    </Control>
                    <span className={styles.state}>
                        Select a tile to open it.
                    </span>
                </>
            }
        >
            <GalleryFixture view={view} detail={detail} onOpen={setDetail} />
        </ShowcaseCard>
    )
}

export function LayoutShowcase() {
    return (
        <div className={styles.root} data-layout-showcase={true}>
            <section className={styles.hero}>
                <div className={styles.heroTop}>
                    <span className={styles.badge}>
                        <span className={styles.dot} />
                        Layout
                    </span>
                    <span className={styles.metaPill}>
                        @freestylejs/ani-layout
                    </span>
                </div>
                <h2 className={styles.heroTitle}>
                    Layout changes that move
                    <br />
                    <em>from what you saw to where it lands.</em>
                </h2>
                <p className={styles.heroCopy}>
                    Change the DOM the way you always do. Ani measures every
                    participant before and after the commit and draws each one
                    from its old box to its new one with translate and scale, on
                    the same clock as every other Ani animation.
                </p>
                <div className={styles.heroMeta}>
                    <span className={styles.metaPill}>5 studies</span>
                    <span className={styles.metaPill}>16-tile gallery</span>
                    <span className={styles.metaPill}>
                        tested frame by frame in 3 browsers
                    </span>
                </div>
            </section>

            <div className={styles.grid}>
                <AnchorDemo />
                <CreateDemo />
                <FolderDemo />
                <CardDemo />
                <ToastDemo />
                <GalleryDemo />
            </div>
        </div>
    )
}
