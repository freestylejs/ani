// React adapter in real browsers (plan T5.3): render capture and the commit's
// one flush, checked frame by frame against the independent oracle on a manual
// clock; under StrictMode, transitions, deferred values and Suspense the
// picture must not move while time stands still.

import type { Clock } from '@freestylejs/ani-core'
import {
    ani,
    defaultClock,
    type TimingFunction,
    timing,
} from '@freestylejs/ani-core'
import {
    createManualClock,
    type ManualClock,
} from '@freestylejs/ani-core/testing'
import {
    AnimatePresence,
    LayoutGroup,
    type LayoutGroupProps,
    useLayout,
    useLayoutGroup,
    usePresence,
} from '@freestylejs/ani-react/layout'
import {
    createElement as h,
    memo,
    type ReactNode,
    StrictMode,
    Suspense,
    startTransition,
    useDeferredValue,
    useLayoutEffect,
    useState,
} from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import {
    expectedBox,
    maxDiff,
    type OBox,
    type OTrackSpec,
} from '../../../packages/layout/src/__tests__/oracle'
import { expectClose, expectEqual } from './assert'
import { silenceWarnings } from './layout_kit'

export const pageOptions = {}

export const knownFailures: Record<string, string> = {}

const FRAME_MS = 16
const DT = FRAME_MS / 1000
/** Per-frame tolerance against the oracle (§11). */
const TOL = 0.5
/** The layout defaults (§7.1). */
const DURATION = 0.35
const EASE_OUT = timing.easeOut()

/* ───────────────────────── harness ───────────────────────── */

function pageBox(element: Element): OBox {
    const r = element.getBoundingClientRect()
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }
}

function byId(host: HTMLElement, id: string): HTMLElement {
    const element = host.querySelector<HTMLElement>(`[data-id="${id}"]`)
    if (!element) throw new Error(`element ${id} missing`)
    return element
}

function picture(
    host: HTMLElement,
    boxOf: (element: Element) => OBox = pageBox
): Map<string, OBox> {
    const boxes = new Map<string, OBox>()
    for (const element of host.querySelectorAll<HTMLElement>('[data-id]')) {
        boxes.set(element.dataset.id!, boxOf(element))
    }
    return boxes
}

function expectAt(
    element: Element,
    want: OBox,
    label: string,
    tolerance = TOL
): number {
    const got = pageBox(element)
    const error = maxDiff(got, want)
    if (!(error <= tolerance)) {
        throw new Error(
            `${label}: drawn ${JSON.stringify(got)} differs from ${JSON.stringify(want)} by ${error.toFixed(3)} px`
        )
    }
    return error
}

async function microtasks(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve()
}

function macrotask(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

function busy(ms: number): void {
    const end = performance.now() + ms
    while (performance.now() < end) {
        // a slow render: time slicing yields between components
    }
}

interface Mounted {
    readonly host: HTMLElement
    readonly root: Root
    /** Renders synchronously; the commit's flush runs before this resolves. */
    render(node: ReactNode): Promise<void>
    dispose(): void
}

function mountRoot(): Mounted {
    document.body.style.margin = '0'
    const host = document.createElement('div')
    host.style.cssText = 'position: relative; width: 600px; height: 700px;'
    document.body.append(host)
    const root = createRoot(host)
    return {
        host,
        root,
        async render(node) {
            flushSync(() => root.render(node))
            await microtasks()
        },
        dispose() {
            flushSync(() => root.unmount())
            host.remove()
        },
    }
}

/**
 * Advances frames until `done()` or `limit`; the first frame after a flush
 * has `dt = 0`, so frame k (from 0) shows elapsed k·DT. React may commit
 * between frames (a macrotask per frame).
 */
async function frames(
    mc: ManualClock,
    limit: number,
    check: (elapsed: number) => void,
    done: () => boolean = () => false
): Promise<number> {
    let count = 0
    for (; count < limit && !done(); count++) {
        mc.frame(FRAME_MS)
        check(count * DT)
        await microtasks()
        await macrotask()
    }
    return count
}

function spec(
    before: OBox,
    after: OBox,
    rest: Partial<OTrackSpec> = {}
): OTrackSpec {
    return {
        before,
        after,
        velocity: null,
        fx: 0.5,
        fy: 0.5,
        mode: true,
        delay: 0,
        duration: DURATION,
        timing: EASE_OUT as TimingFunction,
        ...rest,
    }
}

/* ───────────────────────── list fixture ───────────────────────── */

const ITEM = { w: 80, h: 30, margin: 4 }
const ITEM_STYLE =
    'width: 80px; height: 30px; margin: 4px; background: rgb(136, 136, 136);'

/** The layout box of the list's slot `i` (flex column, margins do not collapse). */
function slot(host: HTMLElement, i: number, top = 0): OBox {
    const origin = pageBox(host)
    return {
        x: origin.x + ITEM.margin,
        y: origin.y + top + ITEM.margin + i * (ITEM.h + 2 * ITEM.margin),
        w: ITEM.w,
        h: ITEM.h,
    }
}

function Item({ id }: { id: string }): ReactNode {
    const ref = useLayout<HTMLDivElement>()
    return h('div', {
        ref,
        'data-id': id,
        style: {
            width: ITEM.w,
            height: ITEM.h,
            margin: ITEM.margin,
            background: 'rgb(136, 136, 136)',
        },
    })
}

const MemoItem = memo(Item)

function Column({ children }: { children: ReactNode }): ReactNode {
    return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        children
    )
}

function List({
    order,
    clock,
    tick = 0,
}: {
    order: readonly string[]
    clock: Clock
    tick?: number
}): ReactNode {
    return h(
        LayoutGroup,
        { clock },
        h(
            Column,
            null,
            order.map((id) => h(Item, { key: id, id })),
            h('span', { hidden: true }, String(tick))
        )
    )
}

/** Every item of `next` on the oracle from its slot in `previous`, every frame. */
async function reorderOnOracle(
    mc: ManualClock,
    host: HTMLElement,
    previous: readonly string[],
    next: readonly string[],
    commit: () => Promise<void>,
    between: (frame: number) => Promise<void> = async () => undefined
): Promise<{ error: number; trace: OBox[][] }> {
    const authored = new Map(
        next.map((id) => [id, byId(host, id).style.cssText])
    )
    await commit()
    const tracks = next.map((id, i) =>
        spec(slot(host, previous.indexOf(id)), slot(host, i))
    )
    let error = 0
    // t = 0 is drawn by the flush itself (§4.2)
    next.forEach((id, i) => {
        error = Math.max(
            error,
            expectAt(byId(host, id), tracks[i]!.before, `${id} at flush`)
        )
    })
    const trace: OBox[][] = []
    let frame = 0
    await frames(mc, 40, (elapsed) => {
        trace.push(next.map((id) => pageBox(byId(host, id))))
        next.forEach((id, i) => {
            error = Math.max(
                error,
                expectAt(
                    byId(host, id),
                    expectedBox(tracks[i]!, elapsed),
                    `${id} at ${elapsed.toFixed(3)} s`
                )
            )
        })
    })
    for (; frame < 40; frame++) await between(frame)
    for (const id of next) {
        expectEqual(
            byId(host, id).style.cssText,
            authored.get(id)!,
            `${id} restored byte for byte`
        )
    }
    return { error, trace }
}

/* ───────────────────────── cases ───────────────────────── */

/** RL1: list reorder, every frame on the oracle, exact settle. */
export async function RL1(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    try {
        const first = ['a', 'b', 'c', 'd']
        const second = ['d', 'b', 'a', 'c']
        await view.render(h(List, { order: first, clock: mc.clock }))
        const { error } = await reorderOnOracle(
            mc,
            view.host,
            first,
            second,
            () => view.render(h(List, { order: second, clock: mc.clock }))
        )
        expectEqual(
            byId(view.host, 'a').style.cssText,
            ITEM_STYLE,
            'authored style'
        )
        return `reorder: 4 items on the oracle every frame, max error ${error.toFixed(4)} px; styles restored`
    } finally {
        view.dispose()
    }
}

/** RL2: the same reorder under StrictMode (double render, effect replay). */
export async function RL2(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    const app = (order: readonly string[]) =>
        h(StrictMode, null, h(List, { order, clock: mc.clock }))
    try {
        const first = ['a', 'b', 'c', 'd']
        const second = ['c', 'd', 'a', 'b']
        await view.render(app(first))
        const { error } = await reorderOnOracle(
            mc,
            view.host,
            first,
            second,
            () => view.render(app(second))
        )
        // and back, after the remount replay settled
        const back = await reorderOnOracle(mc, view.host, second, first, () =>
            view.render(app(first))
        )
        return `StrictMode: two reorders on the oracle, max error ${Math.max(error, back.error).toFixed(4)} px`
    } finally {
        view.dispose()
    }
}

/* ── concurrency: the picture stands still while time does ── */

const controls: { set: ((update: (s: AppState) => AppState) => void) | null } =
    { set: null }

/** RL3's snap reasons for the current attempt; an aged commit must report `'stale'`. */
let rl3Snaps: { id: string; reason: string }[] = []

interface AppState {
    readonly order: readonly string[]
    readonly suspend: number
}

const resources = new Map<number, { done: boolean; promise: Promise<void> }>()

function readResource(key: number): string {
    if (key === 0) return 'ready'
    let entry = resources.get(key)
    if (!entry) {
        const created = {
            done: false,
            promise: sleep(60).then(() => {
                created.done = true
            }),
        }
        entry = created
        resources.set(key, entry)
    }
    if (!entry.done) throw entry.promise
    return `loaded ${key}`
}

function Detail({ suspend }: { suspend: number }): ReactNode {
    const text = readResource(suspend)
    const ref = useLayout<HTMLParagraphElement>()
    return h(
        'p',
        {
            ref,
            'data-id': 'detail',
            style: { height: 40, margin: 0, width: 200 },
        },
        text
    )
}

function Fallback(): ReactNode {
    const ref = useLayout<HTMLParagraphElement>()
    return h(
        'p',
        {
            ref,
            'data-id': 'fallback',
            style: { height: 12, margin: 0, width: 200 },
        },
        'loading'
    )
}

function Slow(): ReactNode {
    busy(3)
    return null
}

/** Advances the manual clock after the group's render capture: a deterministic aged commit. */
function AgeCapture({ advance }: { advance: () => void }): ReactNode {
    advance()
    return null
}

function ConcurrentApp({
    clock,
    deferred,
    onSnap,
    advance,
}: {
    clock: Clock
    deferred: boolean
    onSnap?: (element: Element, reason: string) => void
    advance?: () => void
}): ReactNode {
    const [state, setState] = useState<AppState>({
        order: ['a', 'b', 'c', 'd', 'e', 'f'],
        suspend: 0,
    })
    useLayoutEffect(() => {
        controls.set = setState
    }, [])
    const deferredOrder = useDeferredValue(state.order)
    const order = deferred ? deferredOrder : state.order
    return h(
        LayoutGroup,
        { clock, onSnap },
        // time-sliced: a transition's render spans many tasks; its last
        // slice renders the participants, so the capture is fresh (§4.1)
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => h(Slow, { key: i })),
        h(
            Suspense,
            { fallback: h(Fallback) },
            h(Detail, { suspend: state.suspend })
        ),
        h(
            Column,
            null,
            order.map((id) => h(Item, { key: id, id }))
        ),
        advance ? h(AgeCapture, { key: 'age-capture', advance }) : null
    )
}

function rotate(order: readonly string[], step: number): string[] {
    const next = [...order]
    const [moved] = next.splice(step % next.length, 1)
    next.splice((step * 3 + 1) % next.length, 0, moved!)
    return next
}

interface FrozenOptions {
    /**
     * Where a box is compared: page space by default; L-MEAS-5 takes out the
     * scrolls the user made, which were presented.
     */
    readonly boxOf?: (element: Element) => OBox
    /** Stops checking once true (an aged commit is allowed to snap). */
    readonly until?: () => boolean
    /** How long the picture is watched after `body`, ms. */
    readonly settle?: number
}

/**
 * Runs `body` with time frozen and checks, after every task and every real
 * frame, that no element moved: commits may only change where things go.
 * Returns the last presented box of each element, in `boxOf`'s space.
 */
async function frozen(
    host: HTMLElement,
    body: () => Promise<void>,
    { boxOf = pageBox, until = () => false, settle = 300 }: FrozenOptions = {}
): Promise<{ checks: number; commits: number; still: Map<string, OBox> }> {
    const still = picture(host, boxOf)
    let checks = 0
    let failure: Error | null = null
    let running = true
    const check = () => {
        if (until()) return
        for (const [id, box] of picture(host, boxOf)) {
            const known = still.get(id)
            if (box.w === 0 && box.h === 0) {
                // hidden (a suspended boundary's content): it lays out anew
                still.delete(id)
                continue
            }
            if (!known) {
                // a mount appears where it lays out
                still.set(id, box)
                continue
            }
            const error = maxDiff(box, known)
            if (!(error <= TOL) && !failure) {
                failure = new Error(
                    `${id} moved by ${error.toFixed(2)} px while time stood still: ${JSON.stringify(known)} → ${JSON.stringify(box)}`
                )
            }
        }
        checks++
    }
    const poll = async () => {
        while (running) {
            check()
            await macrotask()
        }
    }
    const raf = () => {
        if (!running) return
        check()
        requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
    const polling = poll()
    let commits = 0
    const observer = new MutationObserver(() => {
        commits++
    })
    observer.observe(host, { childList: true, subtree: true })
    try {
        await body()
        // let every scheduled render and reveal commit
        await sleep(settle)
    } finally {
        running = false
        observer.disconnect()
        await polling
    }
    check()
    if (failure) throw failure
    return { checks, commits, still }
}

async function settleAll(mc: ManualClock, host: HTMLElement): Promise<void> {
    await frames(mc, 60, () => undefined)
    for (const element of host.querySelectorAll<HTMLElement>('[data-id]')) {
        if (element.style.translate !== '' || element.style.scale !== '') {
            throw new Error(
                `${element.dataset.id} kept an owned style: ${element.style.cssText}`
            )
        }
    }
}

async function concurrent(
    deferred: boolean,
    body: () => Promise<void>
): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    resources.clear()
    try {
        await view.render(h(ConcurrentApp, { clock: mc.clock, deferred }))
        const { checks, commits } = await frozen(view.host, body)
        const pending = [
            ...view.host.querySelectorAll<HTMLElement>('[data-id]'),
        ].filter((element) => element.style.translate !== '')
        if (pending.length === 0) {
            throw new Error('nothing was left to animate: the commits snapped')
        }
        // the final positions: settled, nothing owned left
        await settleAll(mc, view.host)
        const order = [
            ...view.host.querySelectorAll<HTMLElement>('[data-id]'),
        ].map((element) => element.dataset.id)
        return `${checks} checks over ${commits} DOM mutations, picture unmoved; ${pending.length} nodes animated and settled (${order.join('')})`
    } finally {
        view.dispose()
    }
}

const RL3_ATTEMPTS = 3
const RL3_ITEMS = ['a', 'b', 'c', 'd', 'e', 'f'] as const

function listIds(host: HTMLElement): string[] {
    return [...host.querySelectorAll<HTMLElement>('[data-id]')].map(
        (element) => element.dataset.id!
    )
}

/**
 * The exact §4.4 outcome of an aged RL3 commit: every participant sits at its
 * layout box with the authored style, and every moved participant is reported
 * `'stale'`; no other snap reason is allowed. Over-reporting is conservative
 * and permitted; under-reporting a moved participant is not.
 */
function rl3Aged(
    host: HTMLElement,
    before: readonly string[],
    snaps: readonly { id: string; reason: string }[]
): string {
    const after = listIds(host).filter(
        (id) =>
            before.includes(id) && (RL3_ITEMS as readonly string[]).includes(id)
    )
    const moved = after.filter((id) => before.indexOf(id) !== after.indexOf(id))
    if (moved.length === 0) {
        throw new Error(
            'an aged RL3 commit reported a reorder that did not happen'
        )
    }
    const other = snaps.filter((snap) => snap.reason !== 'stale')
    if (other.length > 0) {
        throw new Error(
            `an aged RL3 commit snapped for a reason other than 'stale': ${other
                .map((snap) => `${snap.id}:${snap.reason}`)
                .join(', ')}`
        )
    }
    const stale = new Set(snaps.map((snap) => snap.id))
    const missing = moved.filter((id) => !stale.has(id))
    if (missing.length > 0) {
        throw new Error(
            `an aged RL3 commit left moved participants unreported: ${missing.join(', ')}`
        )
    }
    for (const id of after) {
        const element = byId(host, id)
        expectEqual(
            element.style.cssText,
            ITEM_STYLE,
            `${id} is at its layout box with the authored style after the aged flush`
        )
    }
    return `'stale' ${after.filter((id) => stale.has(id)).join('')}`
}

/** RL3: transitions interrupting each other across time-sliced renders. */
export async function RL3(): Promise<string> {
    const slips: string[] = []
    for (let attempt = 1; attempt <= RL3_ATTEMPTS; attempt++) {
        const mc = createManualClock()
        const view = mountRoot()
        resources.clear()
        rl3Snaps = []
        const quiet = silenceWarnings()
        try {
            await view.render(
                h(ConcurrentApp, {
                    clock: mc.clock,
                    deferred: false,
                    onSnap: (element, reason) => {
                        const id = (element as HTMLElement).dataset.id
                        if (id) rl3Snaps.push({ id, reason })
                    },
                })
            )
            const before = listIds(view.host)
            const { checks, commits } = await frozen(
                view.host,
                async () => {
                    for (let i = 0; i < 6; i++) {
                        startTransition(() =>
                            controls.set!((s) => ({
                                ...s,
                                order: rotate(s.order, i),
                            }))
                        )
                        await sleep(i % 2 === 0 ? 4 : 25)
                    }
                },
                {
                    until: () =>
                        rl3Snaps.some((snap) => snap.reason === 'stale') ||
                        quiet.messages.some((message) =>
                            message.includes('no valid measurement')
                        ),
                }
            )
            const aged =
                rl3Snaps.some((snap) => snap.reason === 'stale') ||
                quiet.messages.some((message) =>
                    message.includes('no valid measurement')
                )
            if (aged) {
                expectStaleWarnings(quiet.messages)
                slips.push(
                    `attempt ${attempt} ${rl3Aged(view.host, before, rl3Snaps)}`
                )
                continue
            }
            expectEqual(quiet.messages.join(' | '), '', 'no warning')
            const pending = [
                ...view.host.querySelectorAll<HTMLElement>('[data-id]'),
            ].filter((element) => element.style.translate !== '')
            if (pending.length === 0) {
                throw new Error(
                    'nothing was left to animate: the commits snapped'
                )
            }
            await settleAll(mc, view.host)
            const order = listIds(view.host)
            const prior = slips.length > 0 ? `${slips.join('; ')}; ` : ''
            return `${prior}${checks} checks over ${commits} DOM mutations, picture unmoved; ${pending.length} nodes animated and settled (${order.join('')})`
        } finally {
            quiet.restore()
            view.dispose()
        }
    }
    throw new Error(
        `RL3 never produced the intended measured transition: ${slips.join('; ')}`
    )
}

/**
 * RL3 under a deliberately aged commit: a child advances the manual clock
 * between the group's render capture and its commit. The only valid outcome
 * is the §4.4 one: every list participant at its layout box, moved
 * participants reported `'stale'`, and no other snap reason.
 */
export async function RL3_AGED(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    resources.clear()
    rl3Snaps = []
    const quiet = silenceWarnings()
    try {
        await view.render(
            h(ConcurrentApp, {
                clock: mc.clock,
                deferred: false,
                advance: () => mc.frame(FRAME_MS),
                onSnap: (element, reason) => {
                    const id = (element as HTMLElement).dataset.id
                    if (id) rl3Snaps.push({ id, reason })
                },
            })
        )
        // The mount's own aged capture is not the sequence under test.
        quiet.messages.length = 0
        const before = listIds(view.host)
        await frozen(
            view.host,
            async () => {
                // The capture is taken during render; AgeCapture advances the
                // clock before the commit, so the commit is deterministically aged.
                startTransition(() =>
                    controls.set!((s) => ({
                        ...s,
                        order: rotate(s.order, 1),
                    }))
                )
                await sleep(80)
            },
            {
                until: () =>
                    rl3Snaps.some((snap) => snap.reason === 'stale') ||
                    quiet.messages.some((message) =>
                        message.includes('no valid measurement')
                    ),
            }
        )
        const aged =
            rl3Snaps.some((snap) => snap.reason === 'stale') ||
            quiet.messages.some((message) =>
                message.includes('no valid measurement')
            )
        if (!aged) {
            throw new Error(
                `premise: the advanced capture did not age the commit (messages: ${quiet.messages.join(' | ') || 'none'}; snaps: ${rl3Snaps.map((snap) => `${snap.id}:${snap.reason}`).join(', ') || 'none'})`
            )
        }
        expectStaleWarnings(quiet.messages)
        return `advanced aged commit: ${rl3Aged(view.host, before, rl3Snaps)}`
    } finally {
        quiet.restore()
        view.dispose()
    }
}

/** RL4: a deferred value renders the list in a later, lower-priority pass. */
export async function RL4(): Promise<string> {
    return concurrent(true, async () => {
        for (let i = 0; i < 6; i++) {
            controls.set!((s) => ({ ...s, order: rotate(s.order, i) }))
            await sleep(i % 2 === 0 ? 4 : 25)
        }
    })
}

/** RL5: Suspense fallback and reveal shift the list. */
export async function RL5(): Promise<string> {
    return concurrent(false, async () => {
        // suspends: the fallback replaces the detail (an urgent update)
        controls.set!((s) => ({ ...s, suspend: 1 }))
        await sleep(20)
        controls.set!((s) => ({ ...s, order: rotate(s.order, 1) }))
        // the reveal commits after the resource resolves
        await sleep(120)
        // a transition that suspends keeps the old content until the reveal
        startTransition(() => controls.set!((s) => ({ ...s, suspend: 2 })))
    })
}

/* ── the trigger contract ── */

const control: { update: ((fn: () => void) => Promise<unknown>) | null } = {
    update: null,
}

/** State above memoized participants: no participant renders the change. */
function Owner({ initial }: { initial: readonly string[] }): ReactNode {
    const [order, setOrder] = useState(initial)
    const group = useLayoutGroup()
    useLayoutEffect(() => {
        controls.set = (update) =>
            setOrder((current) => update({ order: current, suspend: 0 }).order)
        control.update = group.update
    }, [group])
    return h(
        Column,
        null,
        order.map((id) => h(MemoItem, { key: id, id }))
    )
}

/** RL6: a memoized subtree: the dev warning, and `useLayoutGroup().update`. */
export async function RL6(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    const warnings: string[] = []
    const warn = console.warn
    console.warn = (...args: unknown[]) => {
        warnings.push(String(args[0]))
    }
    try {
        const first = ['a', 'b', 'c']
        const second = ['c', 'a', 'b']
        await view.render(
            h(LayoutGroup, { clock: mc.clock }, h(Owner, { initial: first }))
        )
        flushSync(() => controls.set!((s) => ({ ...s, order: second })))
        await microtasks()
        await macrotask()
        // not captured: every item jumped to its new slot
        second.forEach((id, i) =>
            expectAt(byId(view.host, id), slot(view.host, i), `${id} jumped`)
        )
        const matching = warnings.filter((w) =>
            w.includes('useLayoutGroup().update')
        )
        expectEqual(matching.length, 1, 'one trigger-contract warning')

        // the same change through update(fn) animates on the oracle
        const { error } = await reorderOnOracle(
            mc,
            view.host,
            second,
            first,
            async () => {
                // the report resolves when the run ends, frames later
                void control.update!(() =>
                    controls.set!((s) => ({ ...s, order: first }))
                )
                await microtasks()
            }
        )
        // a third change without update: still a single warning per scope
        flushSync(() => controls.set!((s) => ({ ...s, order: second })))
        await microtasks()
        await macrotask()
        expectEqual(
            warnings.filter((w) => w.includes('useLayoutGroup().update'))
                .length,
            1,
            'warned once per scope'
        )
        const attributes = await parentAttributeWarnings(warnings)
        return `memoized subtree: snapped with one warning; update(fn) on the oracle, max error ${error.toFixed(4)} px; ${attributes}`
    } finally {
        console.warn = warn
        view.dispose()
    }
}

/* ── RL6 (J-031): the parent's class and style ── */

const flex = { w: 40, h: 50 }

function FlexItem({ id }: { id: string }): ReactNode {
    const ref = useLayout<HTMLDivElement>()
    return h('div', {
        ref,
        'data-id': id,
        style: {
            width: flex.w,
            height: flex.h,
            flex: 'none',
            background: '#888',
        },
    })
}

const MemoFlexItem = memo(FlexItem)

const flip: { set: ((row: boolean) => void) | null } = { set: null }

/** State above the participants, written into their flex parent's class or style. */
function FlexOwner({
    by,
    memoized,
}: {
    by: 'class' | 'style'
    memoized: boolean
}): ReactNode {
    const [row, setRow] = useState(false)
    useLayoutEffect(() => {
        flip.set = setRow
    }, [])
    const item = memoized ? MemoFlexItem : FlexItem
    const presence = memoized ? MemoPresenceFlexItem : PresenceFlexItem
    return h(
        'div',
        by === 'class'
            ? { className: row ? 'rl6-row' : 'rl6-column' }
            : {
                  style: {
                      display: 'flex',
                      flexDirection: row ? 'row' : 'column',
                  },
              },
        h(item, { id: 'a' }),
        h(item, { id: 'b' }),
        h(presence, { id: 'p' })
    )
}

/** A participant with presence: its enter writes transform and opacity every frame. */
function PresenceFlexItem({ id }: { id: string }): ReactNode {
    const presence = usePresence(replayMotion, { clock: toastClock!.clock })
    const ref = useLayout<HTMLDivElement>({ ref: presence.ref })
    return h('div', {
        ref,
        'data-id': id,
        style: {
            width: flex.w,
            height: flex.h,
            flex: 'none',
            background: '#444',
            ...presence.style,
        },
    })
}

const MemoPresenceFlexItem = memo(PresenceFlexItem)

/**
 * J-031: a memoized subtree under a parent whose class or style changes
 * warns exactly once per scope; a captured change (participants render) and
 * the frames it animates (layout poses, presence transform and opacity) do
 * not warn.
 */
async function parentAttributeWarnings(warnings: string[]): Promise<string> {
    const sheet = document.createElement('style')
    sheet.textContent =
        '.rl6-column { display: flex; flex-direction: column } .rl6-row { display: flex; flex-direction: row }'
    document.head.append(sheet)
    const count = () =>
        warnings.filter((w) => w.includes('useLayoutGroup().update')).length
    const results: string[] = []
    try {
        for (const by of ['class', 'style'] as const) {
            for (const memoized of [false, true]) {
                const mc = createManualClock()
                toastClock = mc
                const view = mountRoot()
                const before = count()
                try {
                    await view.render(
                        h(
                            LayoutGroup,
                            { clock: mc.clock },
                            h(
                                AnimatePresence,
                                { initial: true },
                                h(FlexOwner, { key: 'owner', by, memoized })
                            )
                        )
                    )
                    const origin = pageBox(view.host)
                    const b = byId(view.host, 'b')
                    const from = pageBox(b)
                    expectEqual(
                        [from.x - origin.x, from.y - origin.y],
                        [0, flex.h],
                        `${by}: b in the column`
                    )
                    flushSync(() => flip.set!(true))
                    await microtasks()
                    await macrotask()
                    const moved = byId(view.host, 'b')
                    const to = pageBox(moved)
                    // every frame of the enter and of the layout run
                    await frames(mc, 70, () => undefined)
                    await settleAll(mc, view.host)
                    const added = count() - before
                    if (memoized) {
                        // not captured: b jumped, with one warning
                        expectEqual(
                            [to.x - origin.x, to.y - origin.y],
                            [flex.w, 0],
                            `${by}: b jumped to the row`
                        )
                        expectEqual(added, 1, `${by}: one warning`)
                        // a second change in the same scope: still one
                        flushSync(() => flip.set!(false))
                        await microtasks()
                        await macrotask()
                        expectEqual(
                            count() - before,
                            1,
                            `${by}: warned once per scope`
                        )
                        results.push(
                            `memoized ${by}: b (0, 50) → (40, 0) with ${added} warning`
                        )
                    } else {
                        // captured: b drawn where it was, then animated
                        expectEqual(
                            [to.x - origin.x, to.y - origin.y],
                            [0, flex.h],
                            `${by}: b at its old place at t = 0`
                        )
                        expectEqual(added, 0, `${by}: captured, no warning`)
                        results.push(
                            `rendered ${by}: animated, ${added} warnings`
                        )
                    }
                } finally {
                    view.dispose()
                    toastClock = null
                }
            }
        }
    } finally {
        sheet.remove()
    }
    return results.join(', ')
}

/** RL7: an unrelated re-render every third frame leaves the trajectory identical. */
export async function RL7(): Promise<string> {
    const first = ['a', 'b', 'c', 'd']
    const second = ['b', 'd', 'c', 'a']
    const run = async (rerender: boolean) => {
        const mc = createManualClock()
        const view = mountRoot()
        try {
            await view.render(h(List, { order: first, clock: mc.clock }))
            let tick = 0
            const trace: OBox[][] = []
            await view.render(h(List, { order: second, clock: mc.clock }))
            await frames(mc, 30, () => {
                trace.push(second.map((id) => pageBox(byId(view.host, id))))
                if (rerender && trace.length % 3 === 0) {
                    tick++
                    flushSync(() =>
                        view.root.render(
                            h(List, { order: second, clock: mc.clock, tick })
                        )
                    )
                }
            })
            return trace
        } finally {
            view.dispose()
        }
    }
    const plain = await run(false)
    const touched = await run(true)
    let error = 0
    plain.forEach((boxes, frame) =>
        boxes.forEach((box, i) => {
            error = Math.max(error, maxDiff(box, touched[frame]![i]!))
        })
    )
    // Firefox lays out in 1/60 px units
    expectClose(error, 0, 1 / 60 + 1e-6, 'trajectory with re-renders')
    return `30 frames, a re-render every 3rd: trajectories differ by ${error.toFixed(4)} px`
}

/* ── E5 notifications: presence and layout on one element ── */

// plan.md E5: enter y 14 px / scaleX 0.8 / opacity 0; exit y 10 px /
// scaleX 0.9 / 0.2 s; spring; origin centre-bottom; layout 'position';
// popLayout; five adds 80 ms apart
const TOAST = { w: 300, h: 48, gap: 8 }
const TOAST_SPRING = timing.spring({ m: 1, k: 170, c: 26 })
const TOAST_ENTER = 0.4
const TOAST_EXIT = 0.2
const TOAST_LAYOUT = 0.4

type ToastPose = { opacity: number; translateY: number; scaleX: number }

const TOAST_PRESENT: ToastPose = { opacity: 1, translateY: 0, scaleX: 1 }
const TOAST_INITIAL: ToastPose = { opacity: 0, translateY: 14, scaleX: 0.8 }
const TOAST_EXITED: ToastPose = { opacity: 0, translateY: 10, scaleX: 0.9 }

const toastMotion = {
    present: TOAST_PRESENT,
    initial: TOAST_INITIAL,
    enter: ani({
        to: TOAST_PRESENT,
        duration: TOAST_ENTER,
        timing: TOAST_SPRING,
    }),
    exit: ani({
        to: TOAST_EXITED,
        duration: TOAST_EXIT,
        timing: TOAST_SPRING,
    }),
}

let toastClock: ManualClock | null = null

function Toast({ id }: { id: string }): ReactNode {
    const presence = usePresence(toastMotion, { clock: toastClock!.clock })
    const ref = useLayout<HTMLDivElement>({
        layout: 'position',
        ref: presence.ref,
    })
    return h(
        'div',
        {
            ref,
            'data-id': id,
            style: {
                width: TOAST.w,
                height: TOAST.h,
                flex: 'none',
                transformOrigin: 'center bottom',
                background: 'rgb(40, 40, 40)',
                ...presence.style,
            },
        },
        id
    )
}

function Toasts({ ids }: { ids: readonly string[] }): ReactNode {
    return h(
        LayoutGroup,
        {
            clock: toastClock!.clock,
            motion: { duration: TOAST_LAYOUT, timing: TOAST_SPRING },
        },
        h(
            'div',
            {
                'data-stack': true,
                style: {
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: TOAST.gap,
                    padding: 0,
                },
            },
            h(
                AnimatePresence,
                { initial: false, mode: 'popLayout' },
                ids.map((id) => h(Toast, { key: id, id }))
            )
        )
    )
}

function toastSlot(host: HTMLElement, i: number): OBox {
    const origin = pageBox(host)
    return {
        x: origin.x,
        y: origin.y + i * (TOAST.h + TOAST.gap),
        w: TOAST.w,
        h: TOAST.h,
    }
}

function matrixOf(element: Element): number[] {
    const value = getComputedStyle(element).transform
    if (value === 'none') return [1, 0, 0, 1, 0, 0]
    return /matrix\(([^)]*)\)/
        .exec(value)![1]!
        .split(',')
        .map((n) => Number.parseFloat(n))
}

/**
 * Presence's pose `t` seconds into a transition from `from` to `to`: the
 * timeline evaluates the spring per property over the duration and ends on
 * `to` (Core's timing, not the layout solver).
 */
function toastPose(
    from: ToastPose,
    to: ToastPose,
    duration: number,
    t: number
): ToastPose {
    const at = (key: keyof ToastPose) =>
        t <= 0
            ? from[key]
            : t >= duration
              ? to[key]
              : TOAST_SPRING.step(t, {
                    dt: 0,
                    from: from[key],
                    to: to[key],
                    duration,
                }).value
    return {
        opacity: at('opacity'),
        translateY: at('translateY'),
        scaleX: at('scaleX'),
    }
}

/** A CSS box drawn through presence's pose about its centre-bottom origin. */
function throughPose(css: OBox, pose: ToastPose): OBox {
    const ox = css.x + css.w / 2
    return {
        x: ox - (pose.scaleX * css.w) / 2,
        y: css.y + pose.translateY,
        w: pose.scaleX * css.w,
        h: css.h,
    }
}

interface ToastModel {
    readonly id: string
    slot: number
    /** Frame count at the commit that started its presence transition. */
    start: number
    from: ToastPose
    to: ToastPose
    duration: number
    /** Its layout track: planned at frame `flush`, drawn through `q0`. */
    track: { spec: OTrackSpec; flush: number; q0: OBox } | null
}

/**
 * The independent expectation for a toast after `frame` frames: presence's
 * pose (its timeline advances by the frame time from its first frame on),
 * and in 'position' mode the layout track moves that box by `V(t) − q0`, the
 * track drawn relative to the inner box it was planned against (§3.1, §11).
 * A track from rest shows elapsed 0 on its first frame; a track planned for a
 * moving toast (with a velocity) continues the last painted frame's time (§4.3).
 */
function toastExpected(
    host: HTMLElement,
    toast: ToastModel,
    frame: number
): { box: OBox; pose: ToastPose; moving: OBox | null } {
    const pose = toastPose(
        toast.from,
        toast.to,
        toast.duration,
        (frame - toast.start) * DT
    )
    const inner = throughPose(toastSlot(host, toast.slot), pose)
    const track = toast.track
    if (!track) return { box: inner, pose, moving: null }
    const t =
        Math.max(0, frame - track.flush - (track.spec.velocity ? 0 : 1)) * DT
    const v = expectedBox(track.spec, t)
    // the track's velocity (box per second), while it runs
    let moving: OBox | null = null
    if (t < track.spec.duration) {
        const dt = 1e-4
        const a = expectedBox(track.spec, Math.max(0, t - dt))
        const b = expectedBox(track.spec, t + dt)
        const span = t + dt - Math.max(0, t - dt)
        moving = {
            x: (b.x - a.x) / span,
            y: (b.y - a.y) / span,
            w: 0,
            h: 0,
        }
    }
    return {
        box: {
            x: inner.x + v.x - track.q0.x,
            y: inner.y + v.y - track.q0.y,
            w: inner.w,
            h: inner.h,
        },
        pose,
        moving,
    }
}

/**
 * Checks every toast's drawn box, presence transform and opacity; a
 * mismatch is recorded in `failures` (the run goes on, so one report shows
 * every frame that is off).
 */
function expectToasts(
    host: HTMLElement,
    toasts: readonly ToastModel[],
    frame: number,
    label: string,
    failures: string[]
): number {
    let error = 0
    for (const toast of toasts) {
        const element = byId(host, toast.id)
        const want = toastExpected(host, toast, frame)
        try {
            error = Math.max(
                error,
                expectAt(element, want.box, `${label}: ${toast.id} drawn`)
            )
            const m = matrixOf(element)
            expectClose(
                m[0]!,
                want.pose.scaleX,
                1e-3,
                `${label}: ${toast.id} scaleX`
            )
            expectClose(
                m[5]!,
                want.pose.translateY,
                1e-2,
                `${label}: ${toast.id} translateY`
            )
            expectClose(
                Number(getComputedStyle(element).opacity),
                want.pose.opacity,
                1e-2,
                `${label}: ${toast.id} opacity`
            )
        } catch (failure) {
            failures.push(`frame ${frame} ${(failure as Error).message}`)
        }
    }
    return error
}

/**
 * E5: five adds 80 ms apart, every frame of every enter and every layout
 * track (interrupted ones with their velocity) on the expectation; then a
 * popLayout exit of the middle toast.
 */
export async function E5(): Promise<string> {
    const mc = createManualClock()
    toastClock = mc
    const view = mountRoot()
    let frame = 0
    const step = async () => {
        mc.frame(FRAME_MS)
        frame++
        await microtasks()
        await macrotask()
    }
    try {
        await view.render(h(Toasts, { ids: [] }))
        const toasts: ToastModel[] = []
        const failures: string[] = []
        let error = 0
        let interrupted = 0
        for (let n = 1; n <= 5; n++) {
            // every toast below the new one moves down one slot at this flush
            for (const toast of toasts) {
                const now = toastExpected(view.host, toast, frame)
                toast.slot++
                const pose = now.pose
                const after = throughPose(
                    toastSlot(view.host, toast.slot),
                    pose
                )
                if (now.moving) interrupted++
                toast.track = {
                    spec: spec(now.box, after, {
                        mode: 'position',
                        duration: TOAST_LAYOUT,
                        timing: TOAST_SPRING as TimingFunction,
                        velocity: now.moving,
                    }),
                    flush: frame,
                    q0: after,
                }
            }
            toasts.unshift({
                id: `t${n}`,
                slot: 0,
                start: frame,
                from: TOAST_INITIAL,
                to: TOAST_PRESENT,
                duration: TOAST_ENTER,
                track: null,
            })
            await view.render(h(Toasts, { ids: toasts.map((t) => t.id) }))
            // the flush draws t = 0: no jump, the new toast at its initial pose
            error = Math.max(
                error,
                expectToasts(
                    view.host,
                    toasts,
                    frame,
                    `add ${n} at the flush`,
                    failures
                )
            )
            // 80 ms until the next add
            for (let k = 0; k < 5; k++) {
                await step()
                error = Math.max(
                    error,
                    expectToasts(
                        view.host,
                        toasts,
                        frame,
                        `add ${n}, frame ${k + 1}`,
                        failures
                    )
                )
            }
        }
        // the rest of every enter and track, frame by frame
        for (let k = 0; k < 40; k++) {
            await step()
            error = Math.max(
                error,
                expectToasts(
                    view.host,
                    toasts,
                    frame,
                    `settling, frame ${k + 1}`,
                    failures
                )
            )
        }
        await settleAll(mc, view.host)
        toasts.forEach((toast, i) =>
            expectAt(
                byId(view.host, toast.id),
                toastSlot(view.host, i),
                `${toast.id} settled`
            )
        )
        const adds = `5 adds 80 ms apart: every enter (spring, ${TOAST_ENTER} s, centre-bottom) and every layout track (${interrupted} interrupted with their velocity) on the expectation every frame, max error ${error.toFixed(4)} px`

        // remove the middle toast: popLayout, siblings final at t = 0
        const leaving = toasts[2]!
        const before = picture(view.host)
        const rest = toasts.filter((toast) => toast !== leaving)
        await view.render(h(Toasts, { ids: rest.map((t) => t.id) }))
        const exiting = byId(view.host, leaving.id)
        expectEqual(exiting.style.position, 'absolute', 'popped out of flow')
        expectAt(exiting, before.get(leaving.id)!, 'popped in place')
        rest.forEach((toast, i) => {
            const element = byId(view.host, toast.id)
            // the layout box is final at t = 0 (offsets ignore transforms)
            expectClose(
                element.offsetTop,
                i * (TOAST.h + TOAST.gap),
                0.5,
                `${toast.id} layout final at t = 0`
            )
            const now = toastExpected(view.host, toast, frame)
            toast.slot = i
            const after = toastSlot(view.host, i)
            toast.track = {
                spec: spec(now.box, after, {
                    mode: 'position',
                    duration: TOAST_LAYOUT,
                    timing: TOAST_SPRING as TimingFunction,
                }),
                flush: frame,
                q0: after,
            }
        })
        // the exit: from the present pose, about its popped CSS box
        const popped = before.get(leaving.id)!
        leaving.start = frame
        leaving.from = TOAST_PRESENT
        leaving.to = TOAST_EXITED
        leaving.duration = TOAST_EXIT
        let exitError = 0
        let removedAt = Number.NaN
        let lowest = 0
        for (let k = 0; k < 40; k++) {
            if (k > 0) await step()
            const elapsed = (frame - leaving.start) * DT
            exitError = Math.max(
                exitError,
                expectToasts(
                    view.host,
                    rest,
                    frame,
                    `exit frame ${k}`,
                    failures
                )
            )
            const element = view.host.querySelector<HTMLElement>(
                `[data-id="${leaving.id}"]`
            )
            if (!element) {
                if (Number.isNaN(removedAt)) removedAt = elapsed
                continue
            }
            const pose = toastPose(
                TOAST_PRESENT,
                TOAST_EXITED,
                TOAST_EXIT,
                elapsed
            )
            const want = throughPose(popped, pose)
            exitError = Math.max(
                exitError,
                expectAt(
                    element,
                    want,
                    `${leaving.id} exiting at ${elapsed.toFixed(3)} s`
                )
            )
            expectClose(
                Number(getComputedStyle(element).opacity),
                pose.opacity,
                1e-2,
                `${leaving.id} opacity at ${elapsed.toFixed(3)} s`
            )
            // centre-bottom origin: scaleX never moves the bottom edge
            const box = pageBox(element)
            lowest = Math.max(
                lowest,
                Math.abs(
                    box.y + box.h - (popped.y + popped.h + pose.translateY)
                )
            )
        }
        if (
            !(
                removedAt >= TOAST_EXIT - 1e-9 &&
                removedAt <= TOAST_EXIT + 2 * DT
            )
        ) {
            throw new Error(
                `exit released at ${removedAt} s, expected ≈ ${TOAST_EXIT} s`
            )
        }
        expectClose(lowest, 0, 1, 'bottom edge under scaleX')
        await settleAll(mc, view.host)
        expectEqual(mc.clock.size, 0, 'nothing subscribed after the settle')
        if (failures.length > 0) {
            const first = new Map<string, string>()
            for (const failure of failures) {
                const toast = /: (t\d) /.exec(failure)?.[1] ?? ''
                if (!first.has(toast)) first.set(toast, failure)
            }
            const exitPhase = failures.filter((f) => f.includes(' exit frame '))
            throw new Error(
                `${failures.length} of the per-frame checks are off (${exitPhase.length} in the exit phase), from frame ${/^frame (\d+)/.exec(failures[0]!)?.[1]}; first per toast: ${[...first.values()].join('; ')}`
            )
        }
        return `${adds}; exit (y 10, scaleX 0.9, ${TOAST_EXIT} s spring) on the expectation every frame, bottom edge within ${lowest.toFixed(4)} px, released at ${removedAt.toFixed(3)} s; siblings final at t = 0 and on their tracks, max error ${exitError.toFixed(4)} px`
    } finally {
        view.dispose()
        toastClock = null
    }
}

/* ── the implicit root on the real clock ── */

function RootList({ order }: { order: readonly string[] }): ReactNode {
    return h(
        Column,
        null,
        order.map((id) => h(Item, { key: id, id }))
    )
}

/** RL8: no LayoutGroup: the document's implicit root animates on the real clock. */
export async function RL8(): Promise<string> {
    const view = mountRoot()
    try {
        await view.render(h(RootList, { order: ['a', 'b'] }))
        const from = pageBox(byId(view.host, 'a'))
        await view.render(h(RootList, { order: ['b', 'a'] }))
        expectAt(byId(view.host, 'a'), from, 'a at flush')
        await sleep(120)
        const middle = pageBox(byId(view.host, 'a'))
        const to = slot(view.host, 1)
        if (!(middle.y > from.y + 1 && middle.y < to.y - 1)) {
            throw new Error(
                `a is not between its endpoints at 120 ms: ${middle.y} (${from.y} → ${to.y})`
            )
        }
        await sleep(500)
        expectAt(byId(view.host, 'a'), to, 'a settled')
        expectEqual(byId(view.host, 'a').style.cssText, ITEM_STYLE, 'restored')
        return `implicit root: mid-run at ${middle.y.toFixed(1)} between ${from.y} and ${to.y}; settled and restored`
    } finally {
        view.dispose()
    }
}

/* ── equal options and policies keep the run (J-016, J-026) ── */

function Mover({
    x,
    motion,
}: {
    x: number
    motion: LayoutGroupProps['motion']
}): ReactNode {
    const ref = useLayout<HTMLDivElement>(motion ? { motion } : {})
    return h('div', {
        ref,
        'data-id': 'mover',
        style: {
            marginLeft: x,
            width: 40,
            height: 40,
            background: 'rgb(136, 136, 136)',
        },
    })
}

/**
 * Moves the mover 0 → 200 px over 1 s, re-renders the same geometry with the
 * `late` props at 0.2 s, then draws two 0.02 s frames and the rest of the run.
 * Every frame is checked against the oracle of the first track: an equal
 * option or policy never restarts it (§3.3 invariant 5).
 */
async function rerenderMidRun(
    mc: ManualClock,
    app: (x: number, late: boolean) => ReactNode,
    fn: TimingFunction
): Promise<{ at: readonly number[]; error: number; subscribers: number }> {
    const view = mountRoot()
    try {
        await view.render(app(0, false))
        const mover = () => byId(view.host, 'mover')
        const before = pageBox(mover())
        await view.render(app(200, false))
        const track = spec(
            before,
            { ...before, x: before.x + 200 },
            { duration: 1, timing: fn }
        )
        mc.frame(0)
        mc.frame(200)
        let elapsed = 0.2
        let error = expectAt(mover(), expectedBox(track, elapsed), 'at 0.2 s')
        const at = [pageBox(mover()).x - before.x]
        await view.render(app(200, true))
        const subscribers = mc.clock.size
        error = Math.max(
            error,
            expectAt(
                mover(),
                expectedBox(track, elapsed),
                `at the re-render (${subscribers} clock subscribers)`
            )
        )
        const late: OBox[] = []
        for (let i = 0; i < 2; i++) {
            mc.frame(20)
            late.push(pageBox(mover()))
            at.push(late[i]!.x - before.x)
        }
        late.forEach((box, i) => {
            const want = expectedBox(track, elapsed + 0.02 * (i + 1))
            const diff = maxDiff(box, want)
            if (!(diff <= TOL)) {
                throw new Error(
                    `restarted: x at 0.2/0.22/0.24 s = ${at.map((x) => x.toFixed(6)).join('/')}, the first track gives ${[0, 1, 2].map((k) => (expectedBox(track, elapsed + 0.02 * k).x - before.x).toFixed(6)).join('/')}`
                )
            }
            error = Math.max(error, diff)
        })
        elapsed += 0.04
        while (elapsed < 1) {
            mc.frame(FRAME_MS)
            elapsed += DT
            error = Math.max(
                error,
                expectAt(
                    mover(),
                    expectedBox(track, elapsed),
                    `at ${elapsed.toFixed(3)} s`
                )
            )
        }
        await microtasks()
        expectEqual(mover().style.translate, '', 'settled')
        expectEqual(mc.clock.size, 0, 'no subscriber left')
        return { at, error, subscribers }
    } finally {
        view.dispose()
    }
}

/** J-016: equivalent participant motion (defaults, inherited, key order) keeps the track. */
export async function J16(): Promise<string> {
    const linear = timing.linear()
    const spring = (order: 'mkc' | 'ckm') =>
        order === 'mkc'
            ? timing.spring({ m: 1, k: 200, c: 20 })
            : timing.spring({ c: 20, k: 200, m: 1 })
    const runs: Array<{
        label: string
        app: (mc: ManualClock, x: number, late: boolean) => ReactNode
        fn: TimingFunction
    }> = [
        ...[{ duration: 1 }, { delay: 0 }].map((late) => ({
            label: `{} → ${JSON.stringify(late)}`,
            app: (mc: ManualClock, x: number, changed: boolean) =>
                h(
                    LayoutGroup,
                    {
                        clock: mc.clock,
                        motion: { duration: 1, timing: linear },
                    },
                    h(Mover, { x, motion: changed ? late : undefined })
                ),
            fn: linear,
        })),
        {
            // a spring with its parameters in another key order
            label: 'spring {m,k,c} → {c,k,m}',
            app: (mc, x, changed) =>
                h(
                    LayoutGroup,
                    { clock: mc.clock },
                    h(Mover, {
                        x,
                        motion: {
                            duration: 1,
                            timing: spring(changed ? 'ckm' : 'mkc'),
                        },
                    })
                ),
            fn: spring('mkc'),
        },
    ]
    const results: string[] = []
    const failures: string[] = []
    for (const run of runs) {
        const mc = createManualClock()
        try {
            const { at, error, subscribers } = await rerenderMidRun(
                mc,
                (x, late) => run.app(mc, x, late),
                run.fn
            )
            expectEqual(subscribers, 1, 'the run kept its subscription')
            results.push(
                `${run.label}: x ${at.map((x) => x.toFixed(3)).join('/')} (error ${error.toFixed(4)} px)`
            )
        } catch (error) {
            failures.push(`${run.label}: ${(error as Error).message}`)
        }
    }
    if (failures.length > 0) throw new Error(failures.join('; '))
    // a genuine change still retargets
    const mc = createManualClock()
    const changed = await rerenderMidRun(
        mc,
        (x, late) =>
            h(
                LayoutGroup,
                { clock: mc.clock, motion: { duration: 1, timing: linear } },
                h(Mover, { x, motion: late ? { duration: 0.5 } : undefined })
            ),
        linear
    ).then(
        () => 'kept',
        (error: Error) => error.message
    )
    if (!changed.startsWith('restarted')) {
        throw new Error(`{} → {"duration":0.5} did not retarget: ${changed}`)
    }
    return `${results.join('; ')}; every frame on the first track; {} → {"duration":0.5} retargets`
}

/** J-026: an equal scope policy object keeps the scope and its run; a changed one re-creates it. */
export async function J26(): Promise<string> {
    const linear = timing.linear()
    const motion = { duration: 1, timing: linear }
    const app = (
        mc: ManualClock,
        x: number,
        reducedMotion: { maxDuration: number }
    ) =>
        h(
            LayoutGroup,
            { clock: mc.clock, motion, reducedMotion },
            h(Mover, { x, motion: undefined })
        )
    const stable = { maxDuration: 0.1 }
    const mc = createManualClock()
    const { at, error, subscribers } = await rerenderMidRun(
        mc,
        // the re-render at 0.2 s passes a new object with the same value
        (x, late) => app(mc, x, late ? { maxDuration: 0.1 } : stable),
        linear
    )
    expectEqual(subscribers, 1, 'the run kept its subscription')

    // a changed value re-creates the scope: the run is disposed and restored
    const changed = createManualClock()
    const view = mountRoot()
    try {
        await view.render(app(changed, 0, stable))
        const before = pageBox(byId(view.host, 'mover'))
        await view.render(app(changed, 200, stable))
        changed.frame(0)
        changed.frame(200)
        expectClose(
            pageBox(byId(view.host, 'mover')).x - before.x,
            40,
            TOL,
            'x at 0.2 s'
        )
        expectEqual(changed.clock.size, 1, 'running')
        // the re-created scope's first flush has no capture, and the mover,
        // registered since its last flush and drawn mid-run until now, is
        // reported 'stale' (§4.4)
        const warnings: string[] = []
        // biome-ignore lint/suspicious/noConsole: the row asserts the warning
        const warn = console.warn
        console.warn = (...args: unknown[]) => {
            warnings.push(String(args[0]))
        }
        try {
            await view.render(app(changed, 200, { maxDuration: 0.2 }))
        } finally {
            console.warn = warn
        }
        expectEqual(
            warnings.length === 1 &&
                warnings[0]!.includes(
                    'no valid measurement of what was presented'
                ),
            true,
            `re-created: one capture-less warning (${warnings.join(' | ')})`
        )
        const x = pageBox(byId(view.host, 'mover')).x - before.x
        expectClose(x, 200, TOL, 're-created: the layout box')
        expectEqual(changed.clock.size, 0, 're-created: no subscriber')
        expectEqual(byId(view.host, 'mover').style.translate, '', 'restored')
        return `equal { maxDuration: 0.1 }: x ${at.map((v) => v.toFixed(3)).join('/')} at 0.2/0.22/0.24 s, every frame on the first track (error ${error.toFixed(4)} px), one subscriber; { maxDuration: 0.2 } re-creates: x ${x.toFixed(3)}, ${changed.clock.size} subscribers`
    } finally {
        view.dispose()
    }
}

/* ── popLayout: the CSS box of a transformed exit (J-027) ── */

function PopRow({ clock }: { clock: Clock }): ReactNode {
    const presence = usePresence(
        {
            present: { opacity: 1, translateY: 0, scale: 1 },
            initial: { opacity: 1, translateY: 28, scale: 0.6 },
            enter: ani({
                to: { opacity: 1, translateY: 0, scale: 1 },
                duration: 1,
                timing: timing.linear(),
            }),
            // holds the transform it starts from: the pop must not move it
            exit: ani({
                to: { opacity: 0, translateY: 14, scale: 0.8 },
                duration: 0.2,
                timing: timing.linear(),
            }),
        },
        { clock }
    )
    return h('div', {
        ref: presence.ref,
        'data-id': 'pop',
        style: {
            width: 100,
            height: 50,
            transformOrigin: '0 0',
            background: 'rgb(40, 40, 40)',
            ...presence.style,
        },
    })
}

function PopBlock({ clock, show }: { clock: Clock; show: boolean }): ReactNode {
    return h(
        'div',
        {
            'data-block': true,
            style: {
                position: 'relative',
                boxSizing: 'border-box',
                width: 400,
                height: 300,
                padding: '80px 0 0 50px',
            },
        },
        h(
            AnimatePresence,
            { initial: true, mode: 'popLayout' },
            show ? h(PopRow, { key: 'pop', clock }) : null
        )
    )
}

function SlideRow(): ReactNode {
    const presence = usePresence(
        {
            present: { opacity: 1 },
            exit: ani({
                to: { opacity: 0 },
                duration: 1,
                timing: timing.linear(),
            }),
        },
        { clock: toastClock!.clock }
    )
    const ref = useLayout<HTMLDivElement>({ ref: presence.ref })
    return h('div', {
        ref,
        'data-id': 'slide',
        style: {
            width: 100,
            height: 50,
            flex: 'none',
            background: 'rgb(40, 40, 40)',
            ...presence.style,
        },
    })
}

function SlideBlock({
    spacer,
    show,
}: {
    spacer: boolean
    show: boolean
}): ReactNode {
    return h(
        LayoutGroup,
        {
            clock: toastClock!.clock,
            motion: { duration: 1, timing: timing.linear() },
        },
        h(
            'div',
            {
                style: {
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    width: 400,
                    height: 300,
                },
            },
            spacer ? h('div', { style: { height: 30, flex: 'none' } }) : null,
            h(
                AnimatePresence,
                { initial: false, mode: 'popLayout' },
                show ? h(SlideRow, { key: 'slide' }) : null
            )
        )
    )
}

/** J-027 (a): an exit that interrupts the enter: translateY(14px) scale(0.8) about 0 0. */
async function popMidEnter(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    try {
        await view.render(h(PopBlock, { clock: mc.clock, show: true }))
        mc.frame(250)
        mc.frame(250)
        const origin = pageBox(view.host.querySelector('[data-block]')!)
        const drawn = {
            x: origin.x + 50,
            y: origin.y + 94,
            w: 80,
            h: 40,
        }
        const row = byId(view.host, 'pop')
        expectAt(row, drawn, 'mid-enter at 0.5 s')
        await view.render(h(PopBlock, { clock: mc.clock, show: false }))
        const pop = {
            left: row.style.left,
            top: row.style.top,
            width: row.style.width,
            height: row.style.height,
        }
        let error = expectAt(
            row,
            drawn,
            `popped in place (lifted to ${JSON.stringify(pop)})`
        )
        expectEqual(
            pop,
            { left: '50px', top: '80px', width: '100px', height: '50px' },
            'the CSS box, lifted'
        )
        let released = Number.NaN
        for (let frame = 1; frame <= 20; frame++) {
            mc.frame(FRAME_MS)
            await microtasks()
            await macrotask()
            if (!row.isConnected) {
                released = frame * DT
                break
            }
            error = Math.max(error, expectAt(row, drawn, `exit frame ${frame}`))
        }
        if (!(released >= 0.2 - 1e-9 && released <= 0.2 + 2 * DT)) {
            throw new Error(`exit released at ${released} s, expected ≈ 0.2 s`)
        }
        return `mid-enter exit: lifted to ${pop.left}/${pop.top} ${pop.width} × ${pop.height}, drawn (50, 94, 80, 40) until the release at ${released.toFixed(3)} s (error ${error.toFixed(4)} px)`
    } finally {
        view.dispose()
    }
}

/** J-027 (b): an exit during a layout run: the lifted node keeps its track. */
async function popMidLayout(): Promise<string> {
    const lc = createManualClock()
    toastClock = lc
    const view = mountRoot()
    try {
        await view.render(h(SlideBlock, { spacer: false, show: true }))
        const node = byId(view.host, 'slide')
        const before = pageBox(node)
        await view.render(h(SlideBlock, { spacer: true, show: true }))
        const track = spec(
            before,
            { ...before, y: before.y + 30 },
            { duration: 1, timing: timing.linear() }
        )
        lc.frame(0)
        lc.frame(200)
        let elapsed = 0.2
        let error = expectAt(node, expectedBox(track, elapsed), 'at 0.2 s')
        await view.render(h(SlideBlock, { spacer: true, show: false }))
        expectEqual(node.style.position, 'absolute', 'popped')
        const top = node.style.top
        error = Math.max(
            error,
            expectAt(
                node,
                expectedBox(track, elapsed),
                `popped in place (lifted to top ${top})`
            )
        )
        for (let frame = 1; frame <= 30; frame++) {
            lc.frame(FRAME_MS)
            elapsed += DT
            error = Math.max(
                error,
                expectAt(
                    node,
                    expectedBox(track, elapsed),
                    `exiting at ${elapsed.toFixed(3)} s (lifted to top ${top})`
                )
            )
        }
        expectEqual(top, '30px', 'lifted to its CSS box')
        return `mid-layout exit: lifted to top ${top}, on its track through ${elapsed.toFixed(3)} s (error ${error.toFixed(4)} px)`
    } finally {
        view.dispose()
        toastClock = null
    }
}

/** J-027: popLayout lifts the CSS box, not the drawn one: mid-enter and mid-layout exits stay put. */
export async function J27(): Promise<string> {
    const results: string[] = []
    const failures: string[] = []
    for (const run of [popMidEnter, popMidLayout]) {
        try {
            results.push(await run())
        } catch (error) {
            failures.push((error as Error).message)
        }
    }
    if (failures.length > 0) throw new Error(failures.join('; '))
    return results.join('; ')
}

/* ── presence across a StrictMode replay (J-028) ── */

const replayMotion = {
    present: { opacity: 1, translateY: 0, scaleX: 1 },
    initial: { opacity: 0, translateY: 14, scaleX: 0.8 },
    enter: ani({
        to: { opacity: 1, translateY: 0, scaleX: 1 },
        duration: 1,
        timing: timing.linear(),
    }),
    exit: ani({
        to: { opacity: 0, translateY: 0, scaleX: 1 },
        duration: 1,
        timing: timing.linear(),
    }),
}

function ReplayItem({ id }: { id: string }): ReactNode {
    const presence = usePresence(replayMotion, { clock: toastClock!.clock })
    const ref = useLayout<HTMLDivElement>({
        layout: 'position',
        ref: presence.ref,
    })
    return h('div', {
        ref,
        'data-id': id,
        style: {
            width: 100,
            height: 30,
            flex: 'none',
            transformOrigin: '0 0',
            background: 'rgb(40, 40, 40)',
            ...presence.style,
        },
    })
}

function ReplayList({
    ids,
    onExit,
}: {
    ids: readonly string[]
    onExit: (key: string) => void
}): ReactNode {
    return h(
        StrictMode,
        null,
        h(
            LayoutGroup,
            { clock: toastClock!.clock },
            h(
                Column,
                null,
                h(
                    AnimatePresence,
                    { initial: false, onExitComplete: onExit },
                    ids.map((id) => h(ReplayItem, { key: id, id }))
                )
            )
        )
    )
}

/** Presence's opacity, translateY and scaleX on `element`, and its drawn width. */
function presencePose(element: Element): number[] {
    const m = matrixOf(element)
    return [
        Number(getComputedStyle(element).opacity),
        m[5]!,
        m[0]!,
        element.getBoundingClientRect().width,
    ]
}

function expectPose(element: Element, want: number[], label: string): number {
    const got = presencePose(element)
    const error = Math.max(...got.map((value, i) => Math.abs(value - want[i]!)))
    // opacity, transform and Firefox's 1/60 px width
    if (!(error <= 0.02)) {
        throw new Error(
            `${label}: opacity/translateY/scaleX/width ${got.map((v) => v.toFixed(4)).join('/')}, expected ${want.map((v) => v.toFixed(4)).join('/')}`
        )
    }
    return error
}

/** J-028 (a): two items enter for 1 s; a reorder at 0.2 s moves `a`. */
async function replayMidEnter(): Promise<string> {
    const mc = createManualClock()
    toastClock = mc
    const view = mountRoot()
    const app = (ids: readonly string[]) =>
        h(ReplayList, { ids, onExit: () => undefined })
    const enter = (t: number) => [t, 14 * (1 - t), 0.8 + 0.2 * t, 80 + 20 * t]
    try {
        await view.render(app([]))
        // both enter from opacity 0, translateY 14, scaleX 0.8
        await view.render(app(['a', 'b']))
        mc.frame(200)
        let error = 0
        for (const id of ['a', 'b']) {
            error = Math.max(
                error,
                expectPose(byId(view.host, id), enter(0.2), `${id} at 0.2 s`)
            )
        }
        // React replays the moved fiber's refs and effects; time stands still
        await view.render(app(['b', 'a']))
        for (const id of ['a', 'b']) {
            error = Math.max(
                error,
                expectPose(
                    byId(view.host, id),
                    enter(0.2),
                    `${id} after the reorder`
                )
            )
        }
        for (let frame = 1; frame <= 50; frame++) {
            mc.frame(FRAME_MS)
            await microtasks()
            const elapsed = 0.2 + frame * DT
            for (const id of ['a', 'b']) {
                error = Math.max(
                    error,
                    expectPose(
                        byId(view.host, id),
                        enter(Math.min(1, elapsed)),
                        `${id} entering at ${elapsed.toFixed(3)} s`
                    )
                )
            }
        }
        await settleAll(mc, view.host)
        expectEqual(mc.clock.size, 0, 'no subscriber left')
        return `mid-enter reorder: opacity/scaleX/width 0.20/0.84/84.00 kept, then on the enter every frame (max error ${error.toFixed(4)})`
    } finally {
        view.dispose()
        toastClock = null
    }
}

/** J-028 (b): `b` exits for 1 s; a reorder at 0.2 s moves it: [a, (b), c] → [c, a, (b)]. */
async function replayMidExit(): Promise<string> {
    const mc = createManualClock()
    toastClock = mc
    const view = mountRoot()
    const exits: Array<{ key: string; at: number }> = []
    let elapsed = 0
    const app = (ids: readonly string[]) =>
        h(ReplayList, {
            ids,
            onExit: (key) => exits.push({ key, at: elapsed }),
        })
    const exit = (t: number) => [1 - t, 0, 1, 100]
    try {
        await view.render(app(['a', 'b', 'c']))
        await view.render(app(['a', 'c']))
        mc.frame(200)
        elapsed = 0.2
        const b = byId(view.host, 'b')
        let error = expectPose(b, exit(0.2), 'b exiting at 0.2 s')
        await view.render(app(['c', 'a']))
        expectEqual(b.isConnected, true, 'b still exiting after the reorder')
        error = Math.max(error, expectPose(b, exit(0.2), 'b after the reorder'))
        for (let frame = 1; frame <= 60; frame++) {
            mc.frame(FRAME_MS)
            elapsed = 0.2 + frame * DT
            await microtasks()
            await macrotask()
            if (!b.isConnected) break
            error = Math.max(
                error,
                expectPose(
                    b,
                    exit(Math.min(1, elapsed)),
                    `b at ${elapsed.toFixed(3)} s`
                )
            )
        }
        expectEqual(
            exits.map((e) => e.key),
            ['b'],
            'one exit completion'
        )
        const releasedAt = exits[0]!.at
        if (!(releasedAt >= 1 - 1e-9 && releasedAt <= 1 + 3 * DT)) {
            throw new Error(`b released at ${releasedAt} s, expected ≈ 1 s`)
        }
        await settleAll(mc, view.host)
        expectEqual(mc.clock.size, 0, 'no presence or layout subscriber left')
        return `mid-exit reorder: b kept opacity 0.8, on its exit every frame, released once at ${releasedAt.toFixed(3)} s (max error ${error.toFixed(4)}); nothing subscribed after the settle`
    } finally {
        view.dispose()
        toastClock = null
    }
}

/** J-028: a moved fiber's ref/effect replay keeps presence's running enter and exit. */
export async function J28(): Promise<string> {
    const results: string[] = []
    const failures: string[] = []
    for (const run of [replayMidEnter, replayMidExit]) {
        try {
            results.push(await run())
        } catch (error) {
            failures.push((error as Error).message)
        }
    }
    if (failures.length > 0) throw new Error(failures.join('; '))
    return results.join('; ')
}

/* ── AnimatePresence routes to its document's implicit root (J-029) ── */

const fadeExit = {
    present: { opacity: 1 },
    exit: ani({ to: { opacity: 0 }, duration: 0.1, timing: timing.linear() }),
}

function FadeRow(): ReactNode {
    const presence = usePresence(fadeExit, { clock: toastClock!.clock })
    return h('div', {
        ref: presence.ref,
        'data-id': 'row',
        style: { width: 100, height: 50, flex: 'none' },
    })
}

const Sibling = memo(function Sibling(): ReactNode {
    const ref = useLayout<HTMLDivElement>()
    return h('div', {
        ref,
        'data-id': 'sibling',
        style: { width: 100, height: 40, flex: 'none', background: '#888' },
    })
})

/** No LayoutGroup: a sync exit above a memoized participant of the implicit root. */
function ImplicitStack({ show }: { show: boolean }): ReactNode {
    return h(
        Column,
        null,
        h(
            AnimatePresence,
            { initial: false },
            show ? h(FadeRow, { key: 'row' }) : null
        ),
        h(Sibling)
    )
}

interface Frame {
    readonly doc: Document
    readonly root: Root
    readonly remove: () => void
}

async function frameRoot(): Promise<Frame> {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'width: 400px; height: 300px; border: 0;'
    const loaded = new Promise<void>((resolve) =>
        iframe.addEventListener('load', () => resolve(), { once: true })
    )
    document.body.append(iframe)
    await loaded
    const doc = iframe.contentDocument!
    doc.body.style.margin = '0'
    const host = doc.createElement('div')
    doc.body.append(host)
    return { doc, root: createRoot(host), remove: () => iframe.remove() }
}

/** The sibling's drawn offset from its column, and its owned translate. */
function siblingState(doc: Document): { y: number; translate: string } {
    const sibling = doc.querySelector<HTMLElement>('[data-id="sibling"]')!
    const column = sibling.parentElement!
    return {
        y:
            sibling.getBoundingClientRect().top -
            column.getBoundingClientRect().top,
        translate: sibling.style.translate,
    }
}

/** Exits the row (0.1 s on the manual clock) and drains its settle commit. */
async function exitRow(
    mc: ManualClock,
    doc: Document,
    render: (show: boolean) => void
): Promise<void> {
    render(false)
    await microtasks()
    for (let frame = 0; frame < 20; frame++) {
        mc.frame(FRAME_MS)
        await microtasks()
        await macrotask()
        if (!doc.querySelector('[data-id="row"]')) break
    }
    await microtasks()
    if (doc.querySelector('[data-id="row"]'))
        throw new Error('row not released')
}

/** J-029: the settle commit of an exit captures the implicit root of the exiting element's document. */
export async function J29(): Promise<string> {
    const mc = createManualClock()
    toastClock = mc
    const main = mountRoot()
    const frame = await frameRoot()
    // the default layout clock stands still: t = 0 stays on screen
    defaultClock.pause()
    try {
        const renderMain = (show: boolean) =>
            flushSync(() => main.root.render(h(ImplicitStack, { show })))
        const renderFrame = (show: boolean) =>
            flushSync(() => frame.root.render(h(ImplicitStack, { show })))
        renderMain(true)
        renderFrame(true)
        await microtasks()
        const states: string[] = []
        const failures: string[] = []
        for (const [label, doc, render] of [
            ['main document', document, renderMain],
            ['iframe', frame.doc, renderFrame],
        ] as const) {
            expectEqual(
                siblingState(doc).y,
                50,
                `${label}: sibling below the row`
            )
            await exitRow(mc, doc, render)
            const state = siblingState(doc)
            states.push(
                `${label} y ${state.y} (translate ${state.translate || 'none'})`
            )
            if (state.y !== 50 || state.translate !== '0px 50px') {
                failures.push(
                    `${label}: the sibling jumped to y ${state.y} (translate '${state.translate}') at t = 0`
                )
            }
        }
        if (failures.length > 0) throw new Error(failures.join('; '))
        // both animate and settle on their own once time runs
        defaultClock.resume()
        await sleep(600)
        for (const [label, doc] of [
            ['main document', document],
            ['iframe', frame.doc],
        ] as const) {
            const state = siblingState(doc)
            expectEqual(state, { y: 0, translate: '' }, `${label}: settled`)
        }
        // the iframe's root goes with its last participant; the main one stays
        flushSync(() => frame.root.unmount())
        await microtasks()
        renderMain(true)
        await microtasks()
        expectEqual(
            siblingState(document).translate,
            '0px -50px',
            'main still animates'
        )
        return `${states.join(', ')} at t = 0 with the default clock paused; both settled at y 0; the main root animates after the iframe root left`
    } finally {
        defaultClock.resume()
        frame.remove()
        main.dispose()
        toastClock = null
    }
}

/* ── engine="waapi" (§10) ── */

function FlatItem({ id }: { id: string }): ReactNode {
    const ref = useLayout<HTMLDivElement>({ layout: 'position' })
    return h(
        'div',
        { ref, 'data-id': id, style: { width: 80, height: 30, marginTop: 4 } },
        id
    )
}

/** A group with `engine="waapi"`: a reorder runs as animations from the old boxes; no inline style. */
export async function RL9(): Promise<string> {
    const view = mountRoot()
    const app = (order: string[]) =>
        h(
            LayoutGroup,
            { engine: 'waapi', motion: { duration: 0.3 } },
            order.map((id) => h(FlatItem, { key: id, id }))
        )
    try {
        await view.render(app(['a', 'b']))
        const a = byId(view.host, 'a')
        const from = pageBox(a)
        const style = a.style.cssText
        await view.render(app(['b', 'a']))
        expectAt(a, from, 'a at the commit')
        const animations = a.getAnimations()
        expectEqual(animations.length, 1, 'one animation')
        expectEqual(a.style.cssText, style, 'no inline style written')
        animations[0]!.finish()
        await sleep(0)
        expectEqual(a.getAnimations().length, 0, 'released')
        const to = pageBox(a)
        if (!(to.y > from.y + 20))
            throw new Error(`a did not move: ${from.y} → ${to.y}`)
        return `reorder from the old box as one WAAPI animation per item; no inline style; released at the end (${from.y} → ${to.y})`
    } finally {
        view.dispose()
    }
}

/* ── L-MEAS-5 (§4.1, §4.4, §11.2): React's slices around a scrolled list ── */

/** How far the user scrolls the list, px. */
const MEAS5_SCROLL = 30
/** Slow components in a render: about 90 ms of time slices. */
const MEAS5_SLOW = 30
/** The scope's default `threshold` (§4.4). */
const THRESHOLD = 1

interface Meas5State {
    readonly order: readonly string[]
    readonly outside: readonly string[]
    readonly suspend: number
}

const MEAS5_START: Meas5State = {
    order: ['a', 'b', 'c', 'd', 'e', 'f'],
    outside: ['x', 'y', 'z'],
    suspend: 0,
}

/** One commit, seen from outside the engine. */
interface Meas5Commit {
    /** The component whose layout effect saw it. */
    readonly source: 'app' | 'detail'
    readonly state: Meas5State | null
    /** Its task, and the task of the last participant render before it. */
    readonly task: number
    readonly renderTask: number
    /** Rendering opportunities since that render. */
    readonly framesSinceRender: number
    /** Rendering opportunities since the case began. */
    readonly frame: number
    readonly time: number
    /** The picture the commit's flush drew (t = 0), in the case's space. */
    drawn: Map<string, OBox> | null
}

const meas5 = {
    set: null as ((update: (s: Meas5State) => Meas5State) => void) | null,
    host: null as HTMLElement | null,
    boxOf: pageBox as (element: Element) => OBox,
    commits: [] as Meas5Commit[],
    /** Render passes of the app since the last reset. */
    passes: 0,
    renderTask: 0,
    renderFrame: 0,
    /**
     * The page boxes at the first participant render of the latest task that
     * rendered one: what the scope's capture read (a render in a later task
     * refreshes it, §4.1).
     */
    rendered: null as Map<string, OBox> | null,
    renderedTask: 0,
    /** Slow components rendered since the last reset. */
    slow: 0,
    frames: 0,
}

let taskSeq = 0
let taskOpen = false

/** The current task's number: a microtask closes it, as the capture's task stamp (§4.1). */
function currentTask(): number {
    if (!taskOpen) {
        taskOpen = true
        taskSeq++
        queueMicrotask(() => {
            taskOpen = false
        })
    }
    return taskSeq
}

function noteRender(): void {
    meas5.renderTask = currentTask()
    meas5.renderFrame = meas5.frames
    if (
        meas5.host &&
        (!meas5.rendered || meas5.renderedTask !== meas5.renderTask)
    ) {
        meas5.rendered = picture(meas5.host)
        meas5.renderedTask = meas5.renderTask
    }
}

function Meas5Slow(): ReactNode {
    busy(3)
    meas5.slow++
    return null
}

function noteCommit(source: Meas5Commit['source'], state: Meas5State | null) {
    const entry: Meas5Commit = {
        source,
        state,
        task: currentTask(),
        renderTask: meas5.renderTask,
        framesSinceRender: meas5.frames - meas5.renderFrame,
        frame: meas5.frames,
        time: performance.now(),
        drawn: null,
    }
    meas5.commits.push(entry)
    // the participants' layout effects queued the flush first
    const host = meas5.host
    const boxOf = meas5.boxOf
    if (host) {
        queueMicrotask(() => {
            entry.drawn = picture(host, boxOf)
        })
    }
}

const meas5Gates = new Map<
    number,
    { done: boolean; promise: Promise<void>; open(): void }
>()

/** A resource the case resolves by hand. */
function meas5Gate(key: number) {
    let gate = meas5Gates.get(key)
    if (!gate) {
        let resolve: () => void = () => undefined
        const promise = new Promise<void>((done) => {
            resolve = done
        })
        const created = {
            done: false,
            promise,
            open() {
                created.done = true
                resolve()
            },
        }
        gate = created
        meas5Gates.set(key, gate)
    }
    return gate
}

function Meas5Item({ id }: { id: string }): ReactNode {
    noteRender()
    const ref = useLayout<HTMLDivElement>()
    return h('div', {
        ref,
        'data-id': id,
        style: {
            width: ITEM.w,
            height: ITEM.h,
            margin: ITEM.margin,
            background: 'rgb(136, 136, 136)',
        },
    })
}

function Meas5Detail({ suspend }: { suspend: number }): ReactNode {
    if (suspend !== 0) {
        const gate = meas5Gate(suspend)
        if (!gate.done) throw gate.promise
    }
    noteRender()
    const ref = useLayout<HTMLParagraphElement>()
    useLayoutEffect(() => {
        noteCommit('detail', null)
    })
    return h(
        'p',
        {
            ref,
            'data-id': 'detail',
            style: { height: 40, margin: 0, width: 200 },
        },
        `loaded ${suspend}`
    )
}

function Meas5App({
    clock,
    slow,
    last,
    suspense,
    onSnap,
}: {
    clock: Clock
    /** Slow components in each render of the app. */
    slow: number
    /** Whether the participants render after them, in the committing slice. */
    last: boolean
    suspense: boolean
    onSnap: LayoutGroupProps['onSnap']
}): ReactNode {
    meas5.passes++
    const [state, setState] = useState(MEAS5_START)
    useLayoutEffect(() => {
        meas5.set = setState
    }, [])
    useLayoutEffect(() => {
        noteCommit('app', state)
    })
    const slows = Array.from({ length: slow }, (_, i) =>
        h(Meas5Slow, { key: `slow${i}` })
    )
    const column = { position: 'relative', display: 'flex' } as const
    const content = [
        // an input the user acts on: a discrete event, so its update is
        // urgent (SyncLane) and interrupts a transition's render
        h('button', {
            key: 'urgent',
            'data-urgent': '',
            style: { display: 'none' },
            onClick: () => setState((s) => ({ ...s, outside: NEXT_OUTSIDE })),
        }),
        h(
            'div',
            { key: 'outside', style: { ...column, flexDirection: 'column' } },
            state.outside.map((id) => h(Meas5Item, { key: id, id }))
        ),
        // the user's scrolls stay theirs: no scroll anchoring here (§11.4
        // S2 is L-MEAS-14's)
        h(
            'div',
            {
                key: 'scroller',
                'data-scroller': '',
                style: {
                    position: 'relative',
                    width: 200,
                    height: 360,
                    overflowY: 'scroll',
                    overflowAnchor: 'none',
                },
            },
            h('div', { style: { height: 60 } }),
            suspense
                ? h(
                      Suspense,
                      {
                          fallback: h(
                              'p',
                              { style: { height: 12, margin: 0 } },
                              'loading'
                          ),
                      },
                      h(Meas5Detail, { suspend: state.suspend })
                  )
                : null,
            h(
                'div',
                { style: { ...column, flexDirection: 'column' } },
                state.order.map((id) => h(Meas5Item, { key: id, id }))
            ),
            h('div', { style: { height: 600 } })
        ),
    ]
    return h(
        LayoutGroup,
        { clock, onSnap },
        ...(last ? [...slows, ...content] : [...content, ...slows])
    )
}

/** The layout box (no pose) in page space, from offsets. */
function layoutBox(element: HTMLElement): OBox {
    const parent = element.offsetParent as HTMLElement
    const origin = parent.getBoundingClientRect()
    return {
        x:
            origin.left +
            scrollX +
            parent.clientLeft +
            element.offsetLeft -
            parent.scrollLeft,
        y:
            origin.top +
            scrollY +
            parent.clientTop +
            element.offsetTop -
            parent.scrollTop,
        w: element.offsetWidth,
        h: element.offsetHeight,
    }
}

function premise(what: string): Error {
    return new Error(`the sequence did not occur: ${what}`)
}

async function until(done: () => boolean, label: string): Promise<void> {
    const end = performance.now() + 3000
    while (!done()) {
        if (performance.now() > end) throw premise(label)
        await macrotask()
    }
}

interface Meas5Run {
    readonly mc: ManualClock
    readonly host: HTMLElement
    readonly scroller: HTMLElement
    /** Page space less the scrolls the user made (they were presented). */
    readonly boxOf: (element: Element) => OBox
    /** The last presented box of `id` from a `boxOf` box, in page space. */
    presented(id: string, box: OBox): OBox
    /** A user scroll of the list, presented at the next frame. */
    scroll(dy: number): void
    readonly snaps: { id: string; reason: string }[]
    dispose(): void
}

async function meas5Mount(options: {
    slow: number
    last: boolean
    suspense: boolean
}): Promise<Meas5Run> {
    const mc = createManualClock()
    const view = mountRoot()
    const snaps: { id: string; reason: string }[] = []
    meas5Gates.clear()
    meas5.host = view.host
    meas5.frames = 0
    let counting = true
    const tick = () => {
        if (!counting) return
        meas5.frames++
        requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    await view.render(
        h(Meas5App, {
            clock: mc.clock,
            ...options,
            onSnap: (element, reason) =>
                snaps.push({ id: element.dataset.id ?? '?', reason }),
        })
    )
    const scroller = view.host.querySelector<HTMLElement>('[data-scroller]')!
    const shift = { y: 0 }
    const boxOf = (element: Element): OBox => {
        const box = pageBox(element)
        return scroller.contains(element) ? { ...box, y: box.y + shift.y } : box
    }
    meas5.boxOf = boxOf
    meas5.commits.length = 0
    meas5.passes = 0
    meas5.slow = 0
    meas5.rendered = null
    snaps.length = 0
    return {
        mc,
        host: view.host,
        scroller,
        boxOf,
        presented(id, box) {
            return scroller.contains(byId(view.host, id))
                ? { ...box, y: box.y - shift.y }
                : box
        },
        scroll(dy) {
            const before = scroller.scrollTop
            scroller.scrollTop = before + dy
            shift.y += scroller.scrollTop - before
        },
        snaps,
        dispose() {
            counting = false
            meas5.host = null
            meas5.set = null
            meas5.boxOf = pageBox
            view.dispose()
        },
    }
}

/** A fresh start of the next round. */
function meas5Reset(run: Meas5Run): void {
    meas5.commits.length = 0
    meas5.passes = 0
    meas5.slow = 0
    meas5.rendered = null
    run.snaps.length = 0
}

function authoredStyles(host: HTMLElement): Map<string, string> {
    const styles = new Map<string, string>()
    for (const element of host.querySelectorAll<HTMLElement>('[data-id]')) {
        styles.set(element.dataset.id!, element.style.cssText)
    }
    return styles
}

function expectSnaps(
    run: Meas5Run,
    want: readonly string[],
    label: string
): void {
    const got = run.snaps.map((s) => `${s.id}:${s.reason}`).sort()
    expectEqual(
        got.join(' '),
        want
            .map((id) => `${id}:stale`)
            .sort()
            .join(' '),
        label
    )
}

/**
 * The flush drew every participant at its last presented box (the first
 * frame), then every frame is on the oracle from there to its layout box;
 * the settle restores each authored style byte for byte.
 */
async function meas5OnOracle(
    run: Meas5Run,
    commit: Meas5Commit,
    still: Map<string, OBox>,
    authored: Map<string, string>,
    count = 40,
    /** Whether React may commit between frames (a task per frame). */
    tasks = true
): Promise<number> {
    const tracks: { element: HTMLElement; id: string; spec: OTrackSpec }[] = []
    let error = 0
    for (const element of run.host.querySelectorAll<HTMLElement>('[data-id]')) {
        // hidden by a suspended boundary: not drawn
        if (element.offsetWidth === 0) continue
        const id = element.dataset.id!
        const drawn = commit.drawn?.get(id)
        if (!drawn) throw new Error(`${id}: no first frame was drawn`)
        const box = still.get(id)
        if (!box) {
            // revealed or mounted: it appears at its layout box
            const at = layoutBox(element)
            const first = maxDiff(run.presented(id, drawn), at)
            if (!(first <= TOL)) {
                throw new Error(
                    `${id}: appeared at ${JSON.stringify(drawn)}, not at its layout box ${JSON.stringify(at)}`
                )
            }
            tracks.push({ element, id, spec: spec(at, at) })
            continue
        }
        const first = maxDiff(drawn, box)
        if (!(first <= TOL)) {
            throw new Error(
                `${id}: first frame ${JSON.stringify(drawn)} is not the last presented box ${JSON.stringify(box)} (${first.toFixed(3)} px)`
            )
        }
        error = Math.max(error, first)
        tracks.push({
            element,
            id,
            spec: spec(run.presented(id, box), layoutBox(element)),
        })
    }
    const check = (elapsed: number) => {
        for (const { element, id, spec } of tracks) {
            error = Math.max(
                error,
                expectAt(
                    element,
                    expectedBox(spec, elapsed),
                    `${id} at ${elapsed.toFixed(3)} s`
                )
            )
        }
    }
    if (tasks) {
        await frames(run.mc, count, check)
    } else {
        for (let k = 0; k < count; k++) {
            run.mc.frame(FRAME_MS)
            check(k * DT)
            await microtasks()
        }
    }
    for (const { element, id } of tracks) {
        const want = authored.get(id)
        if (want !== undefined) {
            expectEqual(
                element.style.cssText,
                want,
                `${id} restored byte for byte`
            )
        }
    }
    return error
}

/**
 * §4.4 for an aged flush of resting nodes: each participant appears at its
 * layout box and stays there; exactly those whose box differs from the aged
 * capture's by `threshold` are reported `'stale'`.
 */
async function meas5Aged(
    run: Meas5Run,
    authored: Map<string, string>,
    label: string
): Promise<string[]> {
    const captured = meas5.rendered
    if (!captured) throw premise('no participant rendered')
    const elements = [
        ...run.host.querySelectorAll<HTMLElement>('[data-id]'),
    ].filter((element) => element.offsetWidth > 0)
    const reported: string[] = []
    for (const element of elements) {
        const id = element.dataset.id!
        const at = layoutBox(element)
        const before = captured.get(id)
        if (!before || !(maxDiff(before, at) < THRESHOLD)) reported.push(id)
    }
    expectSnaps(run, reported, `${label}: the exact 'stale' set`)
    await frames(run.mc, 8, (elapsed) => {
        for (const element of elements) {
            expectAt(
                element,
                layoutBox(element),
                `${element.dataset.id} at its layout box at ${elapsed.toFixed(3)} s`
            )
            expectEqual(
                element.style.translate,
                '',
                `${element.dataset.id} has no track`
            )
        }
    })
    for (const element of elements) {
        const want = authored.get(element.dataset.id!)
        if (want !== undefined) {
            expectEqual(
                element.style.cssText,
                want,
                `${element.dataset.id} untouched`
            )
        }
    }
    return reported
}

/** The development warnings an aged flush gives; any other one fails the case. */
function expectStaleWarnings(messages: readonly string[]): void {
    const other = messages.filter(
        (message) => !message.includes('no valid measurement')
    )
    if (other.length > 0) {
        throw new Error(`unexpected warnings: ${other.join(' | ')}`)
    }
}

/**
 * A commit React may make in a later task than its render (a throttled
 * Suspense commit): measured, or aged and reported (§11.4 S3), each exactly.
 */
function isAged(commit: Meas5Commit): boolean {
    return commit.task !== commit.renderTask && commit.framesSinceRender > 0
}

/** A commit whose capture aged: from then on the picture may snap (§4.4). */
const agedSeen = (): boolean => meas5.commits.some(isAged)

async function meas5Outcome(
    run: Meas5Run,
    commit: Meas5Commit,
    still: Map<string, OBox>,
    authored: Map<string, string>,
    messages: readonly string[],
    label: string,
    count = 40
): Promise<string> {
    if (isAged(commit)) {
        const reported = await meas5Aged(run, authored, label)
        expectStaleWarnings(messages)
        return `${label} committed ${commit.framesSinceRender} frames after its render: aged, 'stale' exactly ${reported.join('')}`
    }
    expectEqual(messages.join(' | '), '', `${label}: no warning`)
    expectSnaps(run, [], `${label} is measured`)
    const error = await meas5OnOracle(run, commit, still, authored, count)
    return `${label} measured: first frame = last presented, then on the oracle (max error ${error.toFixed(4)} px)`
}

const NEXT_ORDER = rotate(MEAS5_START.order, 1)
const NEXT_OUTSIDE = ['x', 'z', 'y']

/** Attempts at a sequence whose slices React schedules: an aged one is checked, then retried. */
const MEAS5_ATTEMPTS = 3

/** L-MEAS-5 (a): a time-sliced render scrolled between chunks; a participant renders in the committing slice. */
export async function L_MEAS_5a(): Promise<string> {
    const slips: string[] = []
    for (let attempt = 1; attempt <= MEAS5_ATTEMPTS; attempt++) {
        const run = await meas5Mount({
            slow: MEAS5_SLOW,
            last: true,
            suspense: false,
        })
        const quiet = silenceWarnings()
        try {
            const authored = authoredStyles(run.host)
            let scrolledAt = 0
            const { still } = await frozen(
                run.host,
                async () => {
                    startTransition(() =>
                        meas5.set!((s) => ({
                            ...s,
                            order: NEXT_ORDER,
                            outside: NEXT_OUTSIDE,
                        }))
                    )
                    await until(() => meas5.passes > 0, 'the render began')
                    if (meas5.commits.length > 0) {
                        throw premise('a scroll between chunks of the render')
                    }
                    run.scroll(MEAS5_SCROLL)
                    scrolledAt = meas5.frames
                    await until(() => meas5.commits.length > 0, 'a commit')
                },
                { boxOf: run.boxOf, until: agedSeen }
            )
            const commit = meas5.commits[0]!
            if (commit.task !== commit.renderTask) {
                // React yielded after the participants rendered: not this
                // sequence, but its outcome is checked all the same
                slips.push(
                    await meas5Outcome(
                        run,
                        commit,
                        still,
                        authored,
                        quiet.messages,
                        `attempt ${attempt}`
                    )
                )
                continue
            }
            if (!(commit.frame > scrolledAt)) {
                throw premise('the scroll was presented before the commit')
            }
            expectEqual(quiet.messages.join(' | '), '', 'no warning')
            expectSnaps(run, [], 'a fresh capture reports nothing')
            const error = await meas5OnOracle(run, commit, still, authored)
            const before = slips.length > 0 ? `${slips.join('; ')}; ` : ''
            return `${before}slices over ${commit.frame} frames, scrolled ${MEAS5_SCROLL} px between chunks: first frame = last presented, then on the oracle (max error ${error.toFixed(4)} px); restored`
        } finally {
            quiet.restore()
            run.dispose()
        }
    }
    throw premise(
        `a participant rendered in the committing slice (${slips.join('; ')})`
    )
}

/** L-MEAS-5 (b): the same render with no participant in the committing slice: aged (§4.4). */
export async function L_MEAS_5b(): Promise<string> {
    const run = await meas5Mount({
        slow: MEAS5_SLOW,
        last: false,
        suspense: false,
    })
    const quiet = silenceWarnings()
    try {
        const authored = authoredStyles(run.host)
        await frozen(
            run.host,
            async () => {
                startTransition(() =>
                    meas5.set!((s) => ({
                        ...s,
                        order: NEXT_ORDER,
                        outside: NEXT_OUTSIDE,
                    }))
                )
                // every participant rendered: the slow tail is rendering
                await until(() => meas5.slow > 0, 'the slow chunks began')
                if (meas5.commits.length > 0) {
                    throw premise('a scroll between chunks of the render')
                }
                run.scroll(MEAS5_SCROLL)
                await until(() => meas5.commits.length > 0, 'a commit')
            },
            { boxOf: run.boxOf, until: () => meas5.commits.length > 0 }
        )
        const commit = meas5.commits[0]!
        if (commit.task === commit.renderTask) {
            throw premise('no participant rendered in the committing slice')
        }
        if (!(commit.framesSinceRender > 0)) {
            throw premise('a rendering opportunity before the commit')
        }
        const reported = await meas5Aged(run, authored, 'aged')
        expectStaleWarnings(quiet.messages)
        return `aged after ${commit.framesSinceRender} frames: every participant at its layout box; 'stale' exactly ${reported.join('')} (the moved ones and the scrolled list)`
    } finally {
        quiet.restore()
        run.dispose()
    }
}

/** L-MEAS-5: a transition, scrolled between chunks, interrupted by an urgent update. */
export async function L_MEAS_5_URGENT(): Promise<string> {
    const run = await meas5Mount({
        slow: MEAS5_SLOW,
        last: true,
        suspense: false,
    })
    const quiet = silenceWarnings()
    try {
        const authored = authoredStyles(run.host)
        const order = rotate(MEAS5_START.order, 3)
        const before = await frozen(
            run.host,
            async () => {
                startTransition(() => meas5.set!((s) => ({ ...s, order })))
                await until(() => meas5.passes > 0, 'the transition began')
                run.scroll(MEAS5_SCROLL)
                await sleep(20)
                if (meas5.commits.length > 0) {
                    throw premise('the transition was still rendering')
                }
                // urgent: React drops the transition's work, commits this,
                // then renders the transition again
                run.host
                    .querySelector('[data-urgent]')!
                    .dispatchEvent(new MouseEvent('click', { bubbles: true }))
                await until(() => meas5.commits.length > 0, 'the urgent commit')
            },
            { boxOf: run.boxOf, settle: 0 }
        )
        const urgent = meas5.commits[0]!
        expectEqual(
            `${urgent.state!.order.join('')} ${urgent.state!.outside.join('')}`,
            `${MEAS5_START.order.join('')} ${NEXT_OUTSIDE.join('')}`,
            'the urgent update committed first, alone'
        )
        if (urgent.task !== urgent.renderTask) {
            throw premise('the urgent update rendered in its commit task')
        }
        expectEqual(quiet.messages.join(' | '), '', 'no warning')
        expectSnaps(run, [], 'the urgent commit is measured')
        // its run, to the end, while the transition renders again: no task
        // passes, so React cannot commit in between
        const first = await meas5OnOracle(
            run,
            urgent,
            before.still,
            authored,
            25,
            false
        )
        if (meas5.commits.length > 1) {
            throw premise('the transition was still rendering')
        }
        // the transition's participants render in its last slice, from here
        meas5.rendered = null
        const transition = await frozen(
            run.host,
            async () => {
                await until(
                    () => meas5.commits.length > 1,
                    'the transition commit'
                )
            },
            { boxOf: run.boxOf, until: agedSeen }
        )
        const last = meas5.commits[1]!
        expectEqual(
            `${last.state!.order.join('')} ${last.state!.outside.join('')}`,
            `${order.join('')} ${NEXT_OUTSIDE.join('')}`,
            'then the transition'
        )
        const outcome = await meas5Outcome(
            run,
            last,
            transition.still,
            authored,
            quiet.messages,
            'the transition'
        )
        return `the urgent update committed inside the transition: first frame = last presented, then on the oracle (max error ${first.toFixed(4)} px); ${outcome}`
    } finally {
        quiet.restore()
        run.dispose()
    }
}

/** L-MEAS-5: a Suspense fallback, then a reveal while the list is scrolled (late, then quick). */
export async function L_MEAS_5_SUSPENSE(): Promise<string> {
    const run = await meas5Mount({ slow: 0, last: true, suspense: true })
    const outcomes: string[] = []
    try {
        const authored = authoredStyles(run.host)
        authored.delete('detail')
        for (const [key, late] of [
            [1, true],
            [2, false],
        ] as const) {
            const round = late ? 'late' : 'quick'
            // an urgent update suspends the detail: the fallback shifts the
            // list (React 18.3 may hold its commit for a later task)
            meas5Reset(run)
            let quiet = silenceWarnings()
            try {
                const shown = () => meas5.commits.length > 0
                const fallback = await frozen(
                    run.host,
                    async () => {
                        meas5.set!((s) => ({ ...s, suspend: key }))
                        await until(shown, 'the fallback')
                    },
                    { boxOf: run.boxOf, until: shown }
                )
                outcomes.push(
                    await meas5Outcome(
                        run,
                        meas5.commits[0]!,
                        fallback.still,
                        authored,
                        quiet.messages,
                        `${round} fallback`,
                        25
                    )
                )
            } finally {
                quiet.restore()
            }
            const fallbackAt = meas5.commits[0]!.time

            // the reveal, after a user scroll (React 19 may hold a reveal
            // that comes soon after its fallback for a later task)
            meas5Reset(run)
            quiet = silenceWarnings()
            try {
                const revealed = () =>
                    meas5.commits.some((c) => c.source === 'detail')
                const reveal = await frozen(
                    run.host,
                    async () => {
                        run.scroll(MEAS5_SCROLL)
                        await sleep(40)
                        if (late) {
                            // past React's fallback throttle (300 ms in
                            // 19, 500 ms in 18.3)
                            await sleep(
                                Math.max(
                                    0,
                                    fallbackAt + 650 - performance.now()
                                )
                            )
                        }
                        meas5Gate(key).open()
                        await until(revealed, 'the reveal')
                    },
                    { boxOf: run.boxOf, until: revealed }
                )
                outcomes.push(
                    await meas5Outcome(
                        run,
                        meas5.commits.find((c) => c.source === 'detail')!,
                        reveal.still,
                        authored,
                        quiet.messages,
                        `${round} reveal`
                    )
                )
            } finally {
                quiet.restore()
            }
        }
        return outcomes.join('; ')
    } finally {
        run.dispose()
    }
}

/** L-MEAS-5: two commits in one task, an unpresented scroll between them, coalesce into one flush. */
export async function L_MEAS_5_COALESCE(): Promise<string> {
    const run = await meas5Mount({ slow: 0, last: true, suspense: false })
    try {
        const authored = authoredStyles(run.host)
        // a list the user scrolled earlier: presented
        run.scroll(MEAS5_SCROLL)
        await sleep(40)
        const first = rotate(MEAS5_START.order, 1)
        const second = rotate(first, 3)
        const { still } = await frozen(
            run.host,
            async () => {
                flushSync(() => meas5.set!((s) => ({ ...s, order: first })))
                // in the commits' own task, never presented: part of the
                // change (§4.1 D3), so it is not taken out of the picture
                run.scroller.scrollTop += MEAS5_SCROLL
                flushSync(() =>
                    meas5.set!((s) => ({
                        ...s,
                        order: second,
                        outside: NEXT_OUTSIDE,
                    }))
                )
            },
            { boxOf: run.boxOf }
        )
        expectEqual(meas5.commits.length, 2, 'two commits')
        const [one, two] = meas5.commits
        if (one!.task !== two!.task) throw premise('both commits in one task')
        expectEqual(
            two!.state!.order.join(''),
            second.join(''),
            'the last commit'
        )
        expectSnaps(run, [], 'the first capture is fresh')
        // B from the first capture, A from the last commit
        const error = await meas5OnOracle(run, two!, still, authored)
        return `two commits and a scroll in one task, one flush: first frame = last presented, then on the oracle to the last commit's layout (max error ${error.toFixed(4)} px)`
    } finally {
        run.dispose()
    }
}
