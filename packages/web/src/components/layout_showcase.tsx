'use client'

/**
 * The layout showcase: the acceptance fixtures (`layout_fixtures.tsx`) and the
 * Motion-parity examples (`layout_examples.tsx`), each with its controls. The
 * browser tests drive these same components and check every frame
 * (ARCHITECTURE.md §11), so what is shown here is what is tested.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
    AccordionFixture,
    DialogFixture,
    DRAG,
    DragFixture,
    NavFixture,
    SHUFFLE,
    ShuffleFixture,
    StackFixture,
    SwitchFixture,
    shuffled,
    TabsFixture,
    type Todo,
    TodoFixture,
} from './layout_examples'
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
    code,
    children,
}: {
    id: string
    title: string
    description: string
    tag: string
    wide?: boolean
    controls: ReactNode
    /** The pattern the demo uses, shown under "Code". */
    code?: string
    children: ReactNode
}) {
    return (
        <section
            className={join(styles.card, wide && styles.wide)}
            data-showcase={id}
        >
            <header className={styles.cardHead}>
                {/* acceptance rows carry their id (E1–E5, ARCHITECTURE §11) */}
                {/^E\d$/.test(id) ? (
                    <span className={styles.index}>{id}</span>
                ) : null}
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
            {code ? (
                <details className={styles.code}>
                    <summary>Code</summary>
                    <pre>
                        <code>{code}</code>
                    </pre>
                </details>
            ) : null}
        </section>
    )
}

function Section({
    title,
    copy,
    children,
}: {
    title: string
    copy: string
    children: ReactNode
}) {
    return (
        <section className={styles.section}>
            <header className={styles.sectionHead}>
                <h3 className={styles.sectionTitle}>{title}</h3>
                <p className={styles.sectionCopy}>{copy}</p>
            </header>
            <div className={styles.grid}>{children}</div>
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
            wide={true}
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

/* ───────────────────────── Motion-parity examples ───────────────────────── */

function SwitchDemo() {
    const [on, setOn] = useState<readonly boolean[]>([true, false, false])
    const toggle = (i: number) =>
        setOn((list) => list.map((v, j) => (j === i ? !v : v)))
    return (
        <ShowcaseCard
            id="Switch"
            title="Switch"
            description="Flexbox moves the knob from start to end; layout draws the move with a bouncy spring. Flick it back mid-flight and it turns around with its speed."
            tag="layout"
            controls={
                <>
                    <Control
                        onClick={() => setOn((list) => list.map((v) => !v))}
                    >
                        Flip all
                    </Control>
                    <span className={styles.state}>Or click a switch.</span>
                </>
            }
            code={`function Switch({ on }) {
    const knob = useLayout()
    return (
        <button style={{ justifyContent: on ? 'flex-end' : 'flex-start' }}>
            <span ref={knob} />
        </button>
    )
}`}
        >
            <SwitchFixture on={on} onToggle={toggle} />
        </ShowcaseCard>
    )
}

function TabsDemo() {
    const [selected, setSelected] = useState(0)
    return (
        <ShowcaseCard
            id="Tabs"
            title="Tabs"
            description="One underline id, rendered under whichever tab is selected: it slides and resizes from the old tab to the new one while the panel swaps."
            tag="layoutId"
            controls={
                <Control onClick={() => setSelected((i) => (i + 1) % 3)}>
                    Next tab
                </Control>
            }
            code={`{tabs.map((tab, i) => (
    <button key={tab} onClick={() => setSelected(i)}>
        {tab}
        {selected === i ? <Underline /> : null}
    </button>
))}

function Underline() {
    const ref = useLayout({ layoutId: 'tab-underline' })
    return <span ref={ref} className="underline" />
}`}
        >
            <TabsFixture selected={selected} onSelect={setSelected} />
        </ShowcaseCard>
    )
}

function NavDemo() {
    const [selected, setSelected] = useState(0)
    const [hovered, setHovered] = useState<number | null>(null)
    return (
        <ShowcaseCard
            id="Smooth tabs"
            title="Smooth tabs"
            description="A pill follows the pointer across items of different widths. Sweep across quickly: every retarget keeps its velocity, and radius keeps the corners round."
            tag="layoutId + radius"
            controls={
                <span className={styles.state}>
                    Hover the bar, click to select.
                </span>
            }
            code={`<nav onPointerLeave={() => setHovered(null)}>
    {items.map((item, i) => (
        <button key={item} onPointerEnter={() => setHovered(i)}>
            {(hovered ?? selected) === i ? <Pill /> : null}
            {item}
        </button>
    ))}
</nav>

const ref = useLayout({ layoutId: 'nav-highlight', radius: true })`}
        >
            <NavFixture
                highlight={hovered ?? selected}
                selected={selected}
                onHover={setHovered}
                onSelect={setSelected}
            />
        </ShowcaseCard>
    )
}

function AccordionDemo() {
    const [open, setOpen] = useState<number | null>(0)
    return (
        <ShowcaseCard
            id="Accordion"
            title="Accordion"
            description="The card grows by layout and reveals its body; the items below slide. Header and body are position-only participants, so the text never stretches."
            tag="size + position"
            controls={
                <Control
                    onClick={() =>
                        setOpen((i) => (i === null ? 0 : (i + 1) % 3))
                    }
                >
                    Open next
                </Control>
            }
            code={`function Item({ open }) {
    const card = useLayout({ radius: true })
    const header = useLayout({ layout: 'position' })
    const body = useLayout({ layout: 'position' })
    return (
        <div ref={card} style={{ height: open ? 'auto' : 48, overflow: 'hidden' }}>
            <button ref={header}>…</button>
            <div ref={body}>…</div>
        </div>
    )
}`}
        >
            <AccordionFixture open={open} onToggle={setOpen} />
        </ShowcaseCard>
    )
}

const SHUFFLE_START = Array.from({ length: SHUFFLE.count }, (_, i) => i)

function ShuffleDemo() {
    const [order, setOrder] = useState<readonly number[]>(SHUFFLE_START)
    const [auto, setAuto] = useState(false)
    const seed = useRef(1)
    const shuffle = () => setOrder((list) => shuffled(list, seed.current++))
    useEffect(() => {
        if (!auto) return
        const id = setInterval(
            () => setOrder((list) => shuffled(list, seed.current++)),
            1100
        )
        return () => clearInterval(id)
    }, [auto])
    return (
        <ShowcaseCard
            id="Shuffle"
            title="Shuffle"
            description="Reorder the array, nothing else. Every tile moves from where it is drawn, so a shuffle during a shuffle is continuous."
            tag="reorder"
            controls={
                <>
                    <Control onClick={shuffle}>Shuffle</Control>
                    <Control
                        ghost={true}
                        onClick={() => setOrder(SHUFFLE_START)}
                    >
                        Sort
                    </Control>
                    <Control ghost={true} onClick={() => setAuto((v) => !v)}>
                        {auto ? 'Stop' : 'Auto'}
                    </Control>
                </>
            }
            code={`{order.map((id) => <Tile key={id} id={id} />)}

function Tile({ id }) {
    const ref = useLayout()
    return <div ref={ref}>{id}</div>
}`}
        >
            <ShuffleFixture order={order} />
        </ShowcaseCard>
    )
}

const DRAG_START = DRAG.labels.map((_, i) => i)

function DragDemo() {
    const [order, setOrder] = useState<readonly number[]>(DRAG_START)
    return (
        <ShowcaseCard
            id="Drag"
            title="Drag to reorder"
            description="Built in user land. The row follows the pointer with its own transform; crossing a slot reorders the state and the others make room; the release draws it into place."
            tag="useLayoutGroup"
            controls={
                <>
                    <Control ghost={true} onClick={() => setOrder(DRAG_START)}>
                        Reset
                    </Control>
                    <span className={styles.state}>Drag a row.</span>
                </>
            }
            code={`// move: outside React, so nothing re-renders
row.style.transform = \`translateY(\${offset}px)\`
// crossing a slot: reorder, then re-base the offset before the flush
setOrder(moved(order, from, to))
// release: layout draws the row into its slot
group.update(() => { row.style.transform = '' })`}
        >
            <DragFixture order={order} onReorder={setOrder} />
        </ShowcaseCard>
    )
}

const TODO_START: readonly Todo[] = [
    { id: 'a', text: 'Buy oat milk', done: false },
    { id: 'b', text: 'Book the dentist', done: false },
    { id: 'c', text: 'Water the plants', done: true },
]

function TodoDemo() {
    const [todos, setTodos] = useState<readonly Todo[]>(TODO_START)
    const [text, setText] = useState('')
    const next = useRef(1)
    const add = () => {
        const value = text.trim() || `Task ${next.current}`
        next.current += 1
        setTodos((list) =>
            [
                { id: `n${next.current}`, text: value, done: false },
                ...list,
            ].slice(0, 6)
        )
        setText('')
    }
    return (
        <ShowcaseCard
            id="To-do"
            title="To-do list"
            description="Add, tick and remove. A ticked item sorts to the bottom; a removed one exits in place under popLayout while the rest close the gap."
            tag="presence + layout"
            controls={
                <form
                    className={styles.form}
                    onSubmit={(event) => {
                        event.preventDefault()
                        add()
                    }}
                >
                    <input
                        className={styles.input}
                        value={text}
                        placeholder="New task"
                        aria-label="New task"
                        onChange={(event) => setText(event.target.value)}
                    />
                    <button type="submit" className={styles.control}>
                        Add
                    </button>
                </form>
            }
            code={`<AnimatePresence mode="popLayout">
    {sorted.map((todo) => <Row key={todo.id} todo={todo} />)}
</AnimatePresence>

function Row({ todo }) {
    const presence = usePresence(rowMotion)
    const ref = useLayout({ layout: 'position', ref: presence.ref })
    return <li ref={ref} style={presence.style}>…</li>
}`}
        >
            <TodoFixture
                todos={todos}
                onToggle={(id) =>
                    setTodos((list) =>
                        list.map((t) =>
                            t.id === id ? { ...t, done: !t.done } : t
                        )
                    )
                }
                onRemove={(id) =>
                    setTodos((list) => list.filter((t) => t.id !== id))
                }
            />
        </ShowcaseCard>
    )
}

function DialogDemo() {
    const [step, setStep] = useState(0)
    const advance = () => setStep((s) => (s + 1) % 3)
    return (
        <ShowcaseCard
            id="Dialog"
            title="Family-style dialog"
            description="A bottom sheet whose height follows its step. The sheet resizes by layout, the steps swap under popLayout, and the button morphs with a sharp label."
            tag="size + popLayout"
            controls={
                <>
                    <Control onClick={advance}>Next step</Control>
                    <Control ghost={true} onClick={() => setStep(0)}>
                        Reset
                    </Control>
                </>
            }
            code={`const sheet = useLayout({ radius: true })
<div ref={sheet} style={{ overflow: 'hidden' }}>
    <AnimatePresence mode="popLayout">
        <Step key={step} />   {/* usePresence + layout: 'position' */}
    </AnimatePresence>
    <Action />                {/* radius button, position-only label */}
</div>`}
        >
            <DialogFixture step={step} onNext={advance} />
        </ShowcaseCard>
    )
}

function StackDemo() {
    const next = useRef(4)
    const [toasts, setToasts] = useState<readonly string[]>(['3', '2', '1'])
    const [expanded, setExpanded] = useState(false)
    return (
        <ShowcaseCard
            id="Stack"
            title="Stacked notifications"
            description="Collapsed, older toasts peek out behind the newest one; hover to fan them out. Every toast moves and resizes by layout, and its text never scales."
            tag="size + presence"
            controls={
                <>
                    <Control
                        onClick={() =>
                            setToasts((list) =>
                                [`${next.current++}`, ...list].slice(0, 5)
                            )
                        }
                    >
                        Add
                    </Control>
                    <Control
                        ghost={true}
                        disabled={toasts.length === 0}
                        onClick={() => setToasts((list) => list.slice(0, -1))}
                    >
                        Remove oldest
                    </Control>
                    <Control
                        ghost={true}
                        onClick={() => setExpanded((v) => !v)}
                    >
                        {expanded ? 'Collapse' : 'Expand'}
                    </Control>
                </>
            }
            code={`function Toast({ index, expanded }) {
    const presence = usePresence(toastMotion)
    const ref = useLayout({ radius: true, ref: presence.ref })
    const text = useLayout({ layout: 'position' })
    return (
        <div ref={ref} style={{ ...presence.style, ...stackBox(index, expanded) }}>
            <div ref={text}>…</div>
        </div>
    )
}`}
        >
            <StackFixture
                toasts={toasts}
                expanded={expanded}
                onExpand={setExpanded}
            />
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
                    <span className={styles.metaPill}>15 examples</span>
                    <span className={styles.metaPill}>
                        every frame checked in Chromium, Firefox and WebKit
                    </span>
                    <span className={styles.metaPill}>
                        interrupt anything mid-flight
                    </span>
                </div>
            </section>

            <Section
                title="Essentials"
                copy="One hook per moving element. Change state; layout draws the difference."
            >
                <SwitchDemo />
                <TabsDemo />
                <NavDemo />
                <AccordionDemo />
            </Section>

            <Section
                title="Lists"
                copy="Reorder, add and remove: siblings make room from the first frame."
            >
                <ShuffleDemo />
                <DragDemo />
                <TodoDemo />
                <StackDemo />
                <ToastDemo />
            </Section>

            <Section
                title="Shared elements"
                copy="One layoutId on two elements: the new one starts where the old one was drawn."
            >
                <CreateDemo />
                <DialogDemo />
                <FolderDemo />
                <CardDemo />
                <GalleryDemo />
            </Section>

            <Section
                title="Precision"
                copy="Anchored children stay on their parent's point at every frame, at any depth."
            >
                <AnchorDemo />
            </Section>
        </div>
    )
}
