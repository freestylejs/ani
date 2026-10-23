// React adapter in real browsers (plan T5.3): render capture and the commit's
// one flush, checked frame by frame against the independent oracle on a manual
// clock; under StrictMode, transitions, deferred values and Suspense the
// picture must not move while time stands still.

import type { Clock } from '@freestylejs/ani-core'
import { ani, type TimingFunction, timing } from '@freestylejs/ani-core'
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

function picture(host: HTMLElement): Map<string, OBox> {
    const boxes = new Map<string, OBox>()
    for (const element of host.querySelectorAll<HTMLElement>('[data-id]')) {
        boxes.set(element.dataset.id!, pageBox(element))
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

function ConcurrentApp({
    clock,
    deferred,
}: {
    clock: Clock
    deferred: boolean
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
        { clock },
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
        // time-sliced: a transition's render spans many tasks
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => h(Slow, { key: i }))
    )
}

function rotate(order: readonly string[], step: number): string[] {
    const next = [...order]
    const [moved] = next.splice(step % next.length, 1)
    next.splice((step * 3 + 1) % next.length, 0, moved!)
    return next
}

/**
 * Runs `body` with time frozen and checks, after every task and every real
 * frame, that no element moved: commits may only change where things go.
 */
async function frozen(
    host: HTMLElement,
    body: () => Promise<void>
): Promise<{ checks: number; commits: number }> {
    const still = picture(host)
    let checks = 0
    let failure: Error | null = null
    let running = true
    const check = () => {
        for (const [id, box] of picture(host)) {
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
        await sleep(300)
    } finally {
        running = false
        observer.disconnect()
        await polling
    }
    check()
    if (failure) throw failure
    return { checks, commits }
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

/** RL3: transitions interrupting each other across time-sliced renders. */
export async function RL3(): Promise<string> {
    return concurrent(false, async () => {
        for (let i = 0; i < 6; i++) {
            startTransition(() =>
                controls.set!((s) => ({ ...s, order: rotate(s.order, i) }))
            )
            await sleep(i % 2 === 0 ? 4 : 25)
        }
    })
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
        return `memoized subtree: snapped with one warning; update(fn) on the oracle, max error ${error.toFixed(4)} px`
    } finally {
        console.warn = warn
        view.dispose()
    }
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

const TOAST = { w: 300, h: 48, gap: 8 }

const toastMotion = {
    present: { opacity: 1, translateY: 0, scaleX: 1 },
    initial: { opacity: 0, translateY: -20, scaleX: 0.9 },
    enter: ani({
        to: { opacity: 1, translateY: 0, scaleX: 1 },
        duration: 0.3,
        timing: timing.linear(),
    }),
    exit: ani({
        to: { opacity: 0, translateY: 0, scaleX: 0.5 },
        duration: 0.2,
        timing: timing.linear(),
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
        { clock: toastClock!.clock },
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

/** E5: five adds 80 ms apart, then a popLayout exit with scaleX. */
export async function E5(): Promise<string> {
    const mc = createManualClock()
    toastClock = mc
    const view = mountRoot()
    try {
        await view.render(h(Toasts, { ids: [] }))
        const ids: string[] = []
        let enterChecks = 0
        for (let n = 1; n <= 5; n++) {
            const before = picture(view.host)
            ids.unshift(`t${n}`)
            await view.render(h(Toasts, { ids: [...ids] }))
            // existing toasts did not jump: the flush drew them where they were
            for (const [id, box] of before) {
                expectAt(byId(view.host, id), box, `add ${n}: ${id} at flush`)
            }
            // first frame equals the enter transform
            const entering = byId(view.host, `t${n}`)
            const m = matrixOf(entering)
            expectClose(m[0]!, 0.9, 1e-3, `t${n} enter scaleX`)
            expectClose(m[5]!, -20, 1e-3, `t${n} enter translateY`)
            expectClose(
                Number(getComputedStyle(entering).opacity),
                0,
                1e-3,
                `t${n} enter opacity`
            )
            enterChecks++
            // 80 ms until the next add
            await frames(mc, 5, () => {
                for (const element of view.host.querySelectorAll('[data-id]')) {
                    const box = pageBox(element)
                    if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) {
                        throw new Error('non-finite box')
                    }
                }
            })
        }
        await settleAll(mc, view.host)
        ids.forEach((id, i) =>
            expectAt(
                byId(view.host, id),
                toastSlot(view.host, i),
                `${id} settled`
            )
        )

        // remove the middle toast: popLayout, siblings final at t = 0
        const leaving = ids[2]!
        const before = picture(view.host)
        const rest = ids.filter((id) => id !== leaving)
        await view.render(h(Toasts, { ids: rest }))
        const exiting = byId(view.host, leaving)
        expectEqual(exiting.style.position, 'absolute', 'popped out of flow')
        expectAt(exiting, before.get(leaving)!, 'popped in place')
        const tracks = rest.map((id, i) => {
            const element = byId(view.host, id)
            // the layout box is final at t = 0 (offsets ignore transforms)
            expectClose(
                element.offsetTop,
                i * (TOAST.h + TOAST.gap),
                0.5,
                `${id} layout final at t = 0`
            )
            expectAt(element, before.get(id)!, `${id} unmoved at flush`)
            return spec(before.get(id)!, toastSlot(view.host, i), {
                mode: 'position',
            })
        })
        const bottom = before.get(leaving)!.y + TOAST.h
        const centre = before.get(leaving)!.x + TOAST.w / 2
        let error = 0
        let removedAt = Number.NaN
        await frames(mc, 40, (elapsed) => {
            rest.forEach((id, i) => {
                error = Math.max(
                    error,
                    expectAt(
                        byId(view.host, id),
                        expectedBox(tracks[i]!, elapsed),
                        `${id} at ${elapsed.toFixed(3)} s`
                    )
                )
            })
            const element = view.host.querySelector<HTMLElement>(
                `[data-id="${leaving}"]`
            )
            if (!element) {
                if (Number.isNaN(removedAt)) removedAt = elapsed
                return
            }
            const box = pageBox(element)
            expectClose(box.y + box.h, bottom, 1, 'bottom edge under scaleX')
            expectClose(box.x + box.w / 2, centre, 1, 'centre under scaleX')
        })
        if (!(removedAt >= 0.2 - 1e-9 && removedAt <= 0.2 + 3 * DT)) {
            throw new Error(`exit released at ${removedAt} s, expected ≈ 0.2 s`)
        }
        return `5 adds 80 ms apart (${enterChecks} enter first frames, no jumps); exit released at ${removedAt.toFixed(3)} s; siblings on the oracle, max error ${error.toFixed(4)} px`
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
        await view.render(app(changed, 200, { maxDuration: 0.2 }))
        const x = pageBox(byId(view.host, 'mover')).x - before.x
        expectClose(x, 200, TOL, 're-created: the layout box')
        expectEqual(changed.clock.size, 0, 're-created: no subscriber')
        expectEqual(byId(view.host, 'mover').style.translate, '', 'restored')
        return `equal { maxDuration: 0.1 }: x ${at.map((v) => v.toFixed(3)).join('/')} at 0.2/0.22/0.24 s, every frame on the first track (error ${error.toFixed(4)} px), one subscriber; { maxDuration: 0.2 } re-creates: x ${x.toFixed(3)}, ${changed.clock.size} subscribers`
    } finally {
        view.dispose()
    }
}
