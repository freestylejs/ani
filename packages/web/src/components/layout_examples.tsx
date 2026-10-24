'use client'

/**
 * The Motion-parity layout examples: the Ani version of each layout example in
 * Motion's gallery that the acceptance fixtures (`layout_fixtures.tsx`) do not
 * already cover. Each is a controlled component with fixed geometry. The
 * `showcase` browser module drives these same components on a manual clock and
 * checks every frame of every marked element (`data-lk`) against the
 * independent oracle, so what the showcase shows is what is tested.
 */
import { ani, type Clock, delay, sequence, timing } from '@freestylejs/ani-core'
import {
    AnimatePresence,
    LayoutGroup,
    type LayoutGroupProps,
    useLayout,
    useLayoutGroup,
    usePresence,
} from '@freestylejs/ani-react/layout'
import {
    type CSSProperties,
    type ReactNode,
    type PointerEvent as ReactPointerEvent,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import {
    ACCENT,
    CARD,
    DURATION,
    type FixtureProps,
    INK,
    MUTED,
    presenceClock,
    SPRING,
    Stage,
    TILE_COLORS,
} from './layout_fixtures'

/** The layout motion of every example but the switch. */
export const MOTION = { duration: DURATION, timing: SPRING }

const SOFT = 'var(--color-fd-muted-foreground, #71717a)'
/** A fill under white text or a white knob: the same in both themes. */
const FILL = '#5b5bd6'
const LINE = 'var(--color-fd-border, #e4e4e7)'
const FONT: CSSProperties = {
    font: 'inherit',
    letterSpacing: 'inherit',
    wordSpacing: 'inherit',
    textTransform: 'inherit',
}

export interface ExampleProps extends FixtureProps {
    /** Every snapped element (tests assert there is none). */
    readonly onSnap?: LayoutGroupProps['onSnap']
}

function Group({
    clock,
    onSnap,
    motion = MOTION,
    children,
}: ExampleProps & {
    motion?: LayoutGroupProps['motion']
    children: ReactNode
}) {
    return (
        <LayoutGroup clock={clock} onSnap={onSnap} motion={motion}>
            {children}
        </LayoutGroup>
    )
}

/* ───────────────────────── Switch ───────────────────────── */

export const SWITCH = {
    labels: ['Wi-Fi', 'Bluetooth', 'AirDrop'] as const,
    width: 52,
    height: 32,
    pad: 3,
    knob: 26,
    /** A bouncier spring: the knob overshoots its end a little. */
    motion: {
        duration: 0.45,
        timing: timing.spring({ m: 1, k: 260, c: 20 }),
    },
}

function Switch({
    i,
    on,
    onToggle,
}: {
    i: number
    on: boolean
    onToggle?: ((i: number) => void) | undefined
}) {
    // the only participant: flex moves the knob, layout draws the move
    const knob = useLayout<HTMLSpanElement>()
    const { width, height, pad } = SWITCH
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={SWITCH.labels[i]}
            data-switch={i}
            onClick={() => onToggle?.(i)}
            style={{
                display: 'flex',
                flex: 'none',
                justifyContent: on ? 'flex-end' : 'flex-start',
                alignItems: 'center',
                width,
                height,
                padding: pad,
                boxSizing: 'border-box',
                border: 0,
                borderRadius: height / 2,
                background: on ? FILL : LINE,
                transition: 'background-color 0.25s',
                cursor: 'pointer',
            }}
        >
            <span
                ref={knob}
                data-lk={`switch-${i}`}
                style={{
                    width: SWITCH.knob,
                    height: SWITCH.knob,
                    borderRadius: SWITCH.knob / 2,
                    background: '#ffffff',
                    boxShadow: '0 1px 3px rgb(0 0 0 / 0.25)',
                }}
            />
        </button>
    )
}

export function SwitchFixture({
    on,
    onToggle,
    ...group
}: ExampleProps & {
    on: readonly boolean[]
    onToggle?: ((i: number) => void) | undefined
}) {
    return (
        <Group {...group} motion={SWITCH.motion}>
            <Stage name="switch" width={280} height={168}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 18,
                        background: CARD,
                        boxShadow: '0 4px 16px rgb(0 0 0 / 0.08)',
                    }}
                >
                    {SWITCH.labels.map((label, i) => (
                        <div
                            key={label}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                height: 56,
                                padding: '0 16px',
                                borderTop: i === 0 ? 0 : `1px solid ${LINE}`,
                                fontSize: 14,
                                fontWeight: 600,
                            }}
                        >
                            {label}
                            <Switch
                                i={i}
                                on={on[i] ?? false}
                                onToggle={onToggle}
                            />
                        </div>
                    ))}
                </div>
            </Stage>
        </Group>
    )
}

/* ───────────────────────── Tabs ───────────────────────── */

export const TABS = {
    labels: ['Overview', 'Activity', 'Settings'] as const,
    copy: [
        'Three projects shipped this week, two more are in review.',
        'Twelve comments and four merged changes since yesterday.',
        'Notifications are on for mentions and reviews only.',
    ] as const,
    width: 340,
    height: 44,
}

const PANEL_MOTION = {
    present: { opacity: 1, translateY: 0 },
    initial: { opacity: 0, translateY: 8 },
    enter: ani({
        to: { opacity: 1, translateY: 0 },
        duration: 0.2,
        timing: timing.easeOut(),
    }),
    exit: ani({
        to: { opacity: 0, translateY: -8 },
        duration: 0.12,
        timing: timing.easeIn(),
    }),
}

function Underline() {
    // one id, rendered under whichever tab is selected
    const ref = useLayout<HTMLSpanElement>({ layoutId: 'tab-underline' })
    return (
        <span
            ref={ref}
            data-lk="tab-underline"
            style={{
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: -1,
                height: 2,
                borderRadius: 1,
                background: ACCENT,
            }}
        />
    )
}

function TabPanel({ i, clock }: { i: number; clock: Clock | undefined }) {
    const presence = usePresence(PANEL_MOTION, presenceClock(clock))
    return (
        <div
            ref={presence.ref}
            role="tabpanel"
            data-tab-panel={i}
            style={{
                ...presence.style,
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                padding: 18,
            }}
        >
            <div
                style={{
                    flex: 'none',
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: `linear-gradient(135deg, ${TILE_COLORS[i]}, ${TILE_COLORS[(i + 4) % TILE_COLORS.length]})`,
                }}
            />
            <p style={{ margin: 0, fontSize: 13, lineHeight: '20px' }}>
                {TABS.copy[i]}
            </p>
        </div>
    )
}

export function TabsFixture({
    selected,
    onSelect,
    ...group
}: ExampleProps & {
    selected: number
    onSelect?: ((i: number) => void) | undefined
}) {
    return (
        <Group {...group}>
            <Stage name="tabs" width={TABS.width} height={150}>
                <div
                    style={{
                        overflow: 'hidden',
                        borderRadius: 18,
                        background: CARD,
                        boxShadow: '0 4px 16px rgb(0 0 0 / 0.08)',
                    }}
                >
                    <div
                        role="tablist"
                        style={{
                            display: 'flex',
                            padding: '0 6px',
                            borderBottom: `1px solid ${LINE}`,
                        }}
                    >
                        {TABS.labels.map((label, i) => (
                            <button
                                key={label}
                                type="button"
                                role="tab"
                                aria-selected={selected === i}
                                data-tab={i}
                                onClick={() => onSelect?.(i)}
                                style={{
                                    ...FONT,
                                    position: 'relative',
                                    height: TABS.height,
                                    padding: '0 14px',
                                    border: 0,
                                    background: 'transparent',
                                    color: selected === i ? INK : SOFT,
                                    fontSize: 13,
                                    fontWeight: 650,
                                    cursor: 'pointer',
                                }}
                            >
                                {label}
                                {selected === i ? <Underline /> : null}
                            </button>
                        ))}
                    </div>
                    <AnimatePresence initial={false} mode="wait">
                        <TabPanel
                            key={selected}
                            i={selected}
                            clock={group.clock}
                        />
                    </AnimatePresence>
                </div>
            </Stage>
        </Group>
    )
}

/* ───────────────────────── Smooth tabs ───────────────────────── */

export const NAV = {
    labels: ['Home', 'Pricing', 'Docs', 'Changelog', 'Blog'] as const,
}

function Highlight() {
    // a pill whose width changes: `radius` keeps its corners round
    const ref = useLayout<HTMLSpanElement>({
        layoutId: 'nav-highlight',
        radius: true,
    })
    return (
        <span
            ref={ref}
            data-lk="nav-highlight"
            style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 10,
                background: CARD,
                boxShadow: '0 1px 4px rgb(0 0 0 / 0.12)',
            }}
        />
    )
}

export function NavFixture({
    highlight,
    selected,
    onHover,
    onSelect,
    ...group
}: ExampleProps & {
    /** The item under the pointer, else the selected one. */
    highlight: number
    selected: number
    onHover?: ((i: number | null) => void) | undefined
    onSelect?: ((i: number) => void) | undefined
}) {
    return (
        <Group {...group}>
            <Stage name="nav" width={360} height={60}>
                <nav
                    onPointerLeave={() => onHover?.(null)}
                    style={{
                        display: 'flex',
                        gap: 2,
                        padding: 4,
                        borderRadius: 14,
                        background: MUTED,
                    }}
                >
                    {NAV.labels.map((label, i) => (
                        <button
                            key={label}
                            type="button"
                            data-nav={i}
                            aria-current={selected === i ? 'page' : undefined}
                            onPointerEnter={() => onHover?.(i)}
                            onClick={() => onSelect?.(i)}
                            style={{
                                ...FONT,
                                position: 'relative',
                                padding: '8px 12px',
                                border: 0,
                                borderRadius: 10,
                                background: 'transparent',
                                color: selected === i ? INK : SOFT,
                                fontSize: 13,
                                fontWeight: 650,
                                cursor: 'pointer',
                            }}
                        >
                            {highlight === i ? <Highlight /> : null}
                            {/* above the pill, which moves across items */}
                            <span style={{ position: 'relative', zIndex: 1 }}>
                                {label}
                            </span>
                        </button>
                    ))}
                </nav>
            </Stage>
        </Group>
    )
}

/* ───────────────────────── Accordion ───────────────────────── */

export const ACCORDION = {
    width: 340,
    header: 48,
    gap: 8,
    items: [
        {
            title: 'What does layout animate?',
            body: 'Any change of an element’s box across a commit: flex, grid, size, order, or a move to another parent.',
        },
        {
            title: 'Do I call anything?',
            body: 'No. Mark the elements with useLayout and change your state. There is no capture or play call.',
        },
        {
            title: 'Why does the text stay sharp?',
            body: 'The header and the body are participants with layout: "position", so the card’s scale never reaches them.',
        },
    ],
}

function AccordionItem({
    i,
    open,
    onToggle,
}: {
    i: number
    open: boolean
    onToggle?: ((i: number | null) => void) | undefined
}) {
    const item = useLayout<HTMLDivElement>({ radius: true })
    // the card scales; its content only moves
    const header = useLayout<HTMLButtonElement>({ layout: 'position' })
    // always mounted below the header and clipped by the card, so it rides
    // with the header and the card reveals it as it grows
    const body = useLayout<HTMLDivElement>({ layout: 'position' })
    const { title, body: text } = ACCORDION.items[i]!
    return (
        <div
            ref={item}
            data-lk={`accordion-${i}`}
            data-accordion={i}
            style={{
                height: open ? 'auto' : ACCORDION.header,
                overflow: 'hidden',
                borderRadius: 14,
                background: CARD,
            }}
        >
            <button
                ref={header}
                type="button"
                data-lk={`accordion-${i}-header`}
                data-lk-mode="position"
                aria-expanded={open}
                onClick={() => onToggle?.(open ? null : i)}
                style={{
                    ...FONT,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    height: ACCORDION.header,
                    padding: '0 16px',
                    border: 0,
                    background: 'transparent',
                    color: INK,
                    fontSize: 14,
                    fontWeight: 650,
                    textAlign: 'left',
                    cursor: 'pointer',
                }}
            >
                {title}
                <span
                    aria-hidden={true}
                    style={{
                        display: 'inline-block',
                        color: SOFT,
                        rotate: open ? '180deg' : '0deg',
                        transition: 'rotate 0.3s',
                    }}
                >
                    ▾
                </span>
            </button>
            <div
                ref={body}
                data-lk={`accordion-${i}-body`}
                data-lk-mode="position"
                aria-hidden={!open}
                style={{
                    padding: '0 16px 16px',
                    color: SOFT,
                    fontSize: 13,
                    lineHeight: '20px',
                    opacity: open ? 1 : 0,
                    transition: 'opacity 0.3s',
                }}
            >
                {text}
            </div>
        </div>
    )
}

export function AccordionFixture({
    open,
    onToggle,
    ...group
}: ExampleProps & {
    open: number | null
    onToggle?: ((i: number | null) => void) | undefined
}) {
    return (
        <Group {...group}>
            <Stage name="accordion" width={ACCORDION.width} height={260}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: ACCORDION.gap,
                    }}
                >
                    {ACCORDION.items.map((item, i) => (
                        <AccordionItem
                            key={item.title}
                            i={i}
                            open={open === i}
                            onToggle={onToggle}
                        />
                    ))}
                </div>
            </Stage>
        </Group>
    )
}

/* ───────────────────────── Shuffle ───────────────────────── */

export const SHUFFLE = { count: 12, columns: 4, tile: 64, gap: 10 }

/** A seeded permutation of `order` (Fisher–Yates on mulberry32). */
export function shuffled(order: readonly number[], seed: number): number[] {
    let a = seed >>> 0
    const random = () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const next = [...order]
    for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[next[i], next[j]] = [next[j]!, next[i]!]
    }
    return next
}

function ShuffleTile({ id }: { id: number }) {
    const ref = useLayout<HTMLDivElement>()
    return (
        <div
            ref={ref}
            data-lk={`shuffle-${id}`}
            style={{
                display: 'grid',
                placeItems: 'center',
                width: SHUFFLE.tile,
                height: SHUFFLE.tile,
                borderRadius: 16,
                background: TILE_COLORS[id % TILE_COLORS.length],
                color: '#ffffff',
                fontSize: 15,
                fontWeight: 750,
            }}
        >
            {id + 1}
        </div>
    )
}

export function ShuffleFixture({
    order,
    ...group
}: ExampleProps & { order: readonly number[] }) {
    const { tile, gap, columns } = SHUFFLE
    return (
        <Group {...group}>
            <Stage
                name="shuffle"
                width={columns * tile + (columns - 1) * gap}
                height={3 * tile + 2 * gap}
            >
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columns}, ${tile}px)`,
                        gap,
                    }}
                >
                    {order.map((id) => (
                        <ShuffleTile key={id} id={id} />
                    ))}
                </div>
            </Stage>
        </Group>
    )
}

/* ───────────────────────── Drag to reorder ───────────────────────── */

export const DRAG = {
    labels: ['Design review', 'Write the changelog', 'Ship 2.0', 'Celebrate'],
    width: 300,
    height: 48,
    gap: 8,
}

/** `order` with the item at `from` moved to `to`. */
export function moved<T>(order: readonly T[], from: number, to: number): T[] {
    const next = [...order]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item!)
    return next
}

interface DragState {
    readonly id: number
    readonly element: HTMLElement
    /** The pointer's y at the press, and the slot it was pressed in. */
    readonly startY: number
    readonly startSlot: number
    y: number
    /** The slot last asked for, until the reorder commits. */
    requested: number
}

const SLOT = DRAG.height + DRAG.gap

function DragRow({
    id,
    dragging,
    onPress,
}: {
    id: number
    dragging: boolean
    onPress: (id: number, event: ReactPointerEvent<HTMLElement>) => void
}) {
    const ref = useLayout<HTMLDivElement>()
    return (
        <div
            ref={ref}
            data-lk={`drag-${id}`}
            data-drag-row={id}
            onPointerDown={(event) => onPress(id, event)}
            style={{
                position: 'relative',
                zIndex: dragging ? 1 : 0,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: DRAG.width,
                height: DRAG.height,
                boxSizing: 'border-box',
                padding: '0 14px',
                borderRadius: 12,
                background: CARD,
                boxShadow: dragging
                    ? '0 12px 28px rgb(0 0 0 / 0.18)'
                    : '0 1px 3px rgb(0 0 0 / 0.08)',
                transition: 'box-shadow 0.2s',
                fontSize: 14,
                fontWeight: 600,
                cursor: dragging ? 'grabbing' : 'grab',
                touchAction: 'none',
                userSelect: 'none',
            }}
        >
            <span aria-hidden={true} style={{ color: SOFT, letterSpacing: 1 }}>
                ⋮⋮
            </span>
            {DRAG.labels[id]}
        </div>
    )
}

/**
 * Drag to reorder in user land. The dragged row follows the pointer through
 * its own inline `transform` (the inner map layout composes, §3.1), written
 * outside React so a move renders nothing. Crossing a slot reorders the
 * state: the other rows animate by layout, and the dragged row's transform is
 * re-based on its new slot before the flush, so it does not move. The release
 * drops the transform inside `update()`, which draws the row into its slot.
 */
function DragList({
    order,
    onReorder,
}: {
    order: readonly number[]
    onReorder?: ((order: number[]) => void) | undefined
}) {
    const group = useLayoutGroup()
    const drag = useRef<DragState | null>(null)
    const orderRef = useRef(order)
    orderRef.current = order
    const [dragging, setDragging] = useState<number | null>(null)

    const offset = (state: DragState) => {
        const slot = orderRef.current.indexOf(state.id)
        return state.y - state.startY + (state.startSlot - slot) * SLOT
    }
    const place = (state: DragState) => {
        state.element.style.transform = `translateY(${offset(state)}px)`
    }

    // a reorder moved the dragged row's slot: keep it under the pointer
    useLayoutEffect(() => {
        if (drag.current) place(drag.current)
    })

    useEffect(() => {
        if (dragging === null) return
        const move = (event: PointerEvent) => {
            const state = drag.current
            if (!state) return
            state.y = event.clientY
            // against the order the DOM shows: a reorder may not have
            // committed yet, and the commit re-bases the row (above)
            place(state)
            const from = orderRef.current.indexOf(state.id)
            const to = Math.max(
                0,
                Math.min(
                    orderRef.current.length - 1,
                    state.startSlot +
                        Math.round((state.y - state.startY) / SLOT)
                )
            )
            if (to !== from && to !== state.requested) {
                state.requested = to
                onReorder?.(moved(orderRef.current, from, to))
            }
        }
        const release = () => {
            const state = drag.current
            drag.current = null
            setDragging(null)
            if (state) {
                void group.update(() => {
                    state.element.style.transform = ''
                })
            }
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', release)
        window.addEventListener('pointercancel', release)
        return () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', release)
            window.removeEventListener('pointercancel', release)
        }
    }, [dragging, group, onReorder])

    const press = (id: number, event: ReactPointerEvent<HTMLElement>) => {
        if (drag.current || event.button !== 0) return
        drag.current = {
            id,
            element: event.currentTarget,
            startY: event.clientY,
            startSlot: orderRef.current.indexOf(id),
            y: event.clientY,
            requested: orderRef.current.indexOf(id),
        }
        setDragging(id)
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: DRAG.gap,
            }}
        >
            {order.map((id) => (
                <DragRow
                    key={id}
                    id={id}
                    dragging={dragging === id}
                    onPress={press}
                />
            ))}
        </div>
    )
}

export function DragFixture({
    order,
    onReorder,
    ...group
}: ExampleProps & {
    order: readonly number[]
    onReorder?: ((order: number[]) => void) | undefined
}) {
    return (
        <Group {...group}>
            <Stage
                name="drag"
                width={DRAG.width}
                height={DRAG.labels.length * SLOT - DRAG.gap}
            >
                <DragList order={order} onReorder={onReorder} />
            </Stage>
        </Group>
    )
}

/* ───────────────────────── To-do list ───────────────────────── */

export interface Todo {
    readonly id: string
    readonly text: string
    readonly done: boolean
}

export const TODO = { width: 320, height: 44, gap: 6 }

const TODO_MOTION = {
    present: { opacity: 1, scale: 1 },
    initial: { opacity: 0, scale: 0.94 },
    enter: ani({
        to: { opacity: 1, scale: 1 },
        duration: 0.3,
        timing: SPRING,
    }),
    exit: ani({
        to: { opacity: 0, scale: 0.94 },
        duration: 0.18,
        timing: timing.easeIn(),
    }),
}

/** Open items first, then done ones; each part keeps its order. */
export function sortTodos(todos: readonly Todo[]): Todo[] {
    return [...todos.filter((t) => !t.done), ...todos.filter((t) => t.done)]
}

function TodoRow({
    todo,
    clock,
    onToggle,
    onRemove,
}: {
    todo: Todo
    clock: Clock | undefined
    onToggle?: ((id: string) => void) | undefined
    onRemove?: ((id: string) => void) | undefined
}) {
    const presence = usePresence(TODO_MOTION, presenceClock(clock))
    // presence enters and exits the row; layout moves it
    const ref = useLayout<HTMLLIElement>({
        layout: 'position',
        ref: presence.ref,
    })
    return (
        <li
            ref={ref}
            data-lk={`todo-${todo.id}`}
            data-lk-mode="position"
            data-todo={todo.id}
            style={{
                ...presence.style,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: TODO.width,
                height: TODO.height,
                boxSizing: 'border-box',
                padding: '0 8px 0 12px',
                borderRadius: 12,
                background: CARD,
                boxShadow: '0 1px 3px rgb(0 0 0 / 0.08)',
                listStyle: 'none',
            }}
        >
            <button
                type="button"
                role="checkbox"
                aria-checked={todo.done}
                aria-label={todo.text}
                onClick={() => onToggle?.(todo.id)}
                style={{
                    flex: 'none',
                    width: 20,
                    height: 20,
                    padding: 0,
                    border: `2px solid ${todo.done ? FILL : LINE}`,
                    borderRadius: 10,
                    background: todo.done ? FILL : 'transparent',
                    color: '#ffffff',
                    fontSize: 11,
                    lineHeight: '16px',
                    cursor: 'pointer',
                }}
            >
                {todo.done ? '✓' : ''}
            </button>
            <span
                style={{
                    flex: 1,
                    fontSize: 14,
                    color: todo.done ? SOFT : INK,
                    textDecoration: todo.done ? 'line-through' : 'none',
                }}
            >
                {todo.text}
            </span>
            <button
                type="button"
                aria-label={`Remove ${todo.text}`}
                onClick={() => onRemove?.(todo.id)}
                style={{
                    flex: 'none',
                    width: 28,
                    height: 28,
                    border: 0,
                    borderRadius: 8,
                    background: 'transparent',
                    color: SOFT,
                    fontSize: 16,
                    cursor: 'pointer',
                }}
            >
                ×
            </button>
        </li>
    )
}

export function TodoFixture({
    todos,
    onToggle,
    onRemove,
    ...group
}: ExampleProps & {
    todos: readonly Todo[]
    onToggle?: ((id: string) => void) | undefined
    onRemove?: ((id: string) => void) | undefined
}) {
    return (
        <Group {...group}>
            <Stage
                name="todo"
                width={TODO.width}
                height={6 * (TODO.height + TODO.gap)}
            >
                <ul
                    style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: TODO.gap,
                        margin: 0,
                        padding: 0,
                    }}
                >
                    <AnimatePresence initial={false} mode="popLayout">
                        {sortTodos(todos).map((todo) => (
                            <TodoRow
                                key={todo.id}
                                todo={todo}
                                clock={group.clock}
                                onToggle={onToggle}
                                onRemove={onRemove}
                            />
                        ))}
                    </AnimatePresence>
                </ul>
            </Stage>
        </Group>
    )
}

/* ───────────────────────── Family-style dialog ───────────────────────── */

export const DIALOG = {
    width: 320,
    steps: [
        {
            title: 'Send money',
            action: 'Continue',
            rows: ['From: Everyday wallet', 'To: Robin', 'Network fee: 0.12'],
        },
        { title: 'Confirm', action: 'Send 250.00', rows: ['250.00 to Robin'] },
        {
            title: 'Sent',
            action: 'Done',
            rows: [
                'Robin will see it in a few seconds.',
                'A receipt is on its way to your inbox.',
                'You can undo it for the next 30 seconds.',
                'Fees are refunded if it fails.',
            ],
        },
    ],
}

const STEP_MOTION = {
    present: { opacity: 1, scale: 1 },
    initial: { opacity: 0, scale: 0.96 },
    // the new step waits for the old one to fade, so their text never overlaps
    enter: sequence([
        delay(0.12),
        ani({
            to: { opacity: 1, scale: 1 },
            duration: 0.3,
            timing: SPRING,
        }),
    ]),
    exit: ani({
        to: { opacity: 0, scale: 0.96 },
        duration: 0.12,
        timing: timing.easeIn(),
    }),
}

function DialogStep({
    step,
    clock,
}: {
    step: number
    clock: Clock | undefined
}) {
    const presence = usePresence(STEP_MOTION, presenceClock(clock))
    // the dialog scales; the steps inside it only move
    const ref = useLayout<HTMLDivElement>({
        layout: 'position',
        ref: presence.ref,
    })
    const { title, rows } = DIALOG.steps[step]!
    return (
        <div
            ref={ref}
            data-lk={`dialog-step-${step}`}
            data-lk-mode="position"
            data-dialog-step={step}
            style={{
                ...presence.style,
                width: DIALOG.width - 40,
                transformOrigin: 'center top',
            }}
        >
            <h4 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 750 }}>
                {title}
            </h4>
            {rows.map((row) => (
                <div
                    key={row}
                    style={{
                        padding: '9px 0',
                        borderTop: `1px solid ${LINE}`,
                        color: SOFT,
                        fontSize: 13,
                        lineHeight: '18px',
                    }}
                >
                    {row}
                </div>
            ))}
        </div>
    )
}

function DialogAction({
    step,
    onNext,
}: {
    step: number
    onNext?: (() => void) | undefined
}) {
    const button = useLayout<HTMLButtonElement>({ radius: true })
    const label = useLayout<HTMLSpanElement>({ layout: 'position' })
    return (
        <button
            ref={button}
            type="button"
            data-lk="dialog-action"
            data-dialog-action=""
            onClick={() => onNext?.()}
            style={{
                ...FONT,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                alignSelf: step === 2 ? 'center' : 'stretch',
                height: 44,
                marginTop: 16,
                padding: '0 28px',
                border: 0,
                borderRadius: 22,
                background: FILL,
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
            }}
        >
            <span ref={label} data-lk="dialog-label" data-lk-mode="position">
                {DIALOG.steps[step]!.action}
            </span>
        </button>
    )
}

function DialogSurface({
    step,
    onNext,
    clock,
}: {
    step: number
    onNext?: (() => void) | undefined
    clock: Clock | undefined
}) {
    const ref = useLayout<HTMLDivElement>({ radius: true })
    return (
        <div
            ref={ref}
            data-lk="dialog"
            data-dialog=""
            style={{
                // a bottom sheet: it keeps its bottom edge and grows upwards
                position: 'absolute',
                left: 0,
                bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                width: DIALOG.width,
                boxSizing: 'border-box',
                padding: 20,
                overflow: 'hidden',
                borderRadius: 28,
                background: CARD,
                boxShadow: '0 12px 40px rgb(0 0 0 / 0.16)',
            }}
        >
            <div style={{ position: 'relative' }}>
                <AnimatePresence initial={false} mode="popLayout">
                    <DialogStep key={step} step={step} clock={clock} />
                </AnimatePresence>
            </div>
            <DialogAction step={step} onNext={onNext} />
        </div>
    )
}

export function DialogFixture({
    step,
    onNext,
    ...group
}: ExampleProps & { step: number; onNext?: (() => void) | undefined }) {
    return (
        <Group {...group}>
            <Stage name="dialog" width={DIALOG.width} height={330}>
                <DialogSurface
                    step={step}
                    onNext={onNext}
                    clock={group.clock}
                />
            </Stage>
        </Group>
    )
}

/* ───────────────────────── Stacked notifications ───────────────────────── */

export const STACK = {
    width: 300,
    height: 60,
    gap: 10,
    /** Collapsed: how far each older toast peeks out, and how much narrower it is. */
    peek: 12,
    shrink: 24,
    visible: 3,
}

const STACK_MOTION = {
    present: { opacity: 1, translateY: 0 },
    initial: { opacity: 0, translateY: 24 },
    enter: ani({
        to: { opacity: 1, translateY: 0 },
        duration: 0.35,
        timing: SPRING,
    }),
    exit: ani({
        to: { opacity: 0, translateY: 24 },
        duration: 0.2,
        timing: timing.easeIn(),
    }),
}

/** A toast's box in the stack: index 0 is the newest, in front. */
export function stackBox(
    index: number,
    expanded: boolean
): { left: number; bottom: number; width: number } {
    if (expanded) {
        return {
            left: 0,
            bottom: index * (STACK.height + STACK.gap),
            width: STACK.width,
        }
    }
    const depth = Math.min(index, STACK.visible - 1)
    return {
        left: (depth * STACK.shrink) / 2,
        bottom: depth * STACK.peek,
        width: STACK.width - depth * STACK.shrink,
    }
}

function StackToast({
    id,
    index,
    count,
    expanded,
    clock,
}: {
    id: string
    index: number
    count: number
    expanded: boolean
    clock: Clock | undefined
}) {
    const presence = usePresence(STACK_MOTION, presenceClock(clock))
    // the toast moves and resizes; its text only moves
    const ref = useLayout<HTMLDivElement>({ radius: true, ref: presence.ref })
    const text = useLayout<HTMLDivElement>({ layout: 'position' })
    const box = stackBox(index, expanded)
    const hidden = !expanded && index >= STACK.visible
    return (
        <div
            ref={ref}
            data-lk={`stack-${id}`}
            data-stack-toast={id}
            style={{
                ...presence.style,
                position: 'absolute',
                left: box.left,
                bottom: box.bottom,
                width: box.width,
                height: STACK.height,
                zIndex: count - index,
                boxSizing: 'border-box',
                borderRadius: 16,
                background: CARD,
                boxShadow: '0 6px 20px rgb(0 0 0 / 0.12)',
                visibility: hidden ? 'hidden' : 'visible',
            }}
        >
            <div
                ref={text}
                data-lk={`stack-${id}-text`}
                data-lk-mode="position"
                style={{
                    position: 'absolute',
                    left: 16,
                    top: 12,
                    width: STACK.width - 32,
                    opacity: expanded || index === 0 ? 1 : 0,
                    transition: 'opacity 0.25s',
                }}
            >
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                    Notification {id}
                </div>
                <div style={{ fontSize: 12, color: SOFT }}>
                    Arrived just now
                </div>
            </div>
        </div>
    )
}

export function StackFixture({
    toasts,
    expanded,
    onExpand,
    ...group
}: ExampleProps & {
    /** Newest first. */
    toasts: readonly string[]
    expanded: boolean
    onExpand?: ((expanded: boolean) => void) | undefined
}) {
    return (
        <Group {...group}>
            <Stage
                name="stack"
                width={STACK.width}
                height={4 * (STACK.height + STACK.gap)}
            >
                <div
                    data-stack=""
                    onPointerEnter={() => onExpand?.(true)}
                    onPointerLeave={() => onExpand?.(false)}
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: expanded
                            ? Math.max(1, toasts.length) *
                              (STACK.height + STACK.gap)
                            : STACK.height + (STACK.visible - 1) * STACK.peek,
                    }}
                >
                    <AnimatePresence initial={false}>
                        {toasts.map((id, index) => (
                            <StackToast
                                key={id}
                                id={id}
                                index={index}
                                count={toasts.length}
                                expanded={expanded}
                                clock={group.clock}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            </Stage>
        </Group>
    )
}
