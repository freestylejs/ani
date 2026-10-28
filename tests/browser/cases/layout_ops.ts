// L-OPS-1 and L-OPS-2 (ARCHITECTURE §7.2, §9.2, §11.2): the kill switch
// mid-run and mid-hold in explicit and implicit scopes; every injected engine
// exception ends in 'failed' with byte-identical styles and nothing left
// running. Real browsers, real DOM.
import { ani, defaultClock, timing } from '@freestylejs/ani-core'
import {
    createManualClock,
    type ManualClock,
} from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    createPresence,
    type LayoutDiagnostic,
    type LayoutGroup,
    type LayoutOptions,
    type LayoutReport,
    layoutRuntime,
} from '@freestylejs/ani-layout'
import { useLayout } from '@freestylejs/ani-react/layout'
import { createElement as h, type ReactNode, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import {
    clearLayoutFaults,
    injectLayoutFault,
} from '../../../packages/layout/src/fault'
import { expectClose, expectEqual } from './assert'
import { node, silenceWarnings, viewBox } from './layout_kit'

export const pageOptions = {}

export const knownFailures: Record<string, string> = {}

const FRAME_MS = 16
const D = 0.32
const TOL = 0.5
const motion = { duration: D, timing: timing.linear() }

interface Harness {
    readonly mc: ManualClock
    readonly group: LayoutGroup
    readonly root: HTMLElement
    add(element: HTMLElement, options?: LayoutOptions): void
    dispose(): void
}

function harness(
    options: Parameters<typeof createLayoutGroup>[0] = {}
): Harness {
    document.body.style.margin = '0'
    const root = document.createElement('div')
    root.style.cssText = 'position: relative; width: 900px; height: 700px;'
    document.body.append(root)
    const mc = createManualClock()
    const group = createLayoutGroup({ ...options, clock: mc.clock })
    const removes: (() => void)[] = []
    return {
        mc,
        group,
        root,
        add(element, layoutOptions) {
            removes.push(group.add(element, layoutOptions))
        },
        dispose() {
            for (const remove of removes) remove()
            group.dispose()
            root.remove()
        },
    }
}

function report(promise: Promise<LayoutReport>): {
    value: LayoutReport | null
} {
    const holder: { value: LayoutReport | null } = { value: null }
    void promise.then((value) => {
        holder.value = value
    })
    return holder
}

async function microtasks(): Promise<void> {
    for (let i = 0; i < 6; i++) await Promise.resolve()
}

function boxAt(left: number, top: number, width = 80, height = 80): string {
    return `left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; transform-origin: 0 0; background: #345;`
}

/** Scroll listener additions and removals on the document, by identity. */
function watchScrollListeners(): {
    readonly added: number
    readonly removed: number
    restore(): void
} {
    const add = document.addEventListener.bind(document)
    const remove = document.removeEventListener.bind(document)
    let added = 0
    let removed = 0
    document.addEventListener = function (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
    ) {
        if (type === 'scroll' || type === 'scrollend') added += 1
        add(type, listener, options)
    } as typeof document.addEventListener
    document.removeEventListener = function (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions
    ) {
        if (type === 'scroll' || type === 'scrollend') removed += 1
        remove(type, listener, options)
    } as typeof document.removeEventListener
    return {
        get added() {
            return added
        },
        get removed() {
            return removed
        },
        restore() {
            document.addEventListener = add
            document.removeEventListener = remove
        },
    }
}

/** Runs queued microtasks now, recording what they throw (the dev rethrow). */
function withAsyncThrows<T>(work: () => T): {
    value: T
    thrown: unknown[]
} {
    const thrown: unknown[] = []
    const original = window.queueMicrotask
    window.queueMicrotask = (task: () => void) => {
        try {
            task()
        } catch (error) {
            thrown.push(error)
        }
    }
    try {
        return { value: work(), thrown }
    } finally {
        window.queueMicrotask = original
    }
}

function expectAuthored(
    element: HTMLElement,
    authored: string,
    label: string
): void {
    if (element.style.cssText !== authored) {
        throw new Error(
            `${label}: inline style is not byte-identical\n  authored: ${JSON.stringify(authored)}\n  now:      ${JSON.stringify(element.style.cssText)}`
        )
    }
}

/* ───────────────────────────── L-OPS-1 ───────────────────────────── */

/**
 * The kill switch mid-run and mid-hold, in an explicit and an implicit scope
 * (§7.2): live tracks finish at identity, styles restore byte-identically,
 * reports resolve 'disabled' with reason 'disabled', and no clock
 * subscription or scroll listener is left.
 */
export async function L_OPS_1(): Promise<string> {
    const details: string[] = []
    const events: LayoutDiagnostic[] = []
    const stop = layoutRuntime.onDiagnostic((event) => events.push(event))
    const runScopes: number[] = []
    try {
        // explicit scope, mid-run
        {
            const h = harness({ motion })
            const a = node(h.root, boxAt(0, 0))
            const b = node(h.root, boxAt(160, 0))
            h.add(a, { layoutId: 'ops-a', radius: false })
            h.add(b, { layoutId: 'ops-b', radius: false })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            a.style.left = '240px'
            const authored = a.style.cssText
            const run = report(h.group.flush())
            h.mc.frames(3)
            expectEqual(h.group.stats.tracks, 1, 'explicit: a track runs')
            layoutRuntime.setMode('snap')
            expectAuthored(a, authored, 'explicit mid-run')
            expectEqual(h.group.stats.tracks, 0, 'explicit: no track')
            expectEqual(h.mc.clock.size, 0, 'explicit: no subscription')
            const want = { x: 240, y: 0, w: 80, h: 80 }
            expectClose(viewBox(a).x, want.x, TOL, 'explicit: lands at A')
            await microtasks()
            expectEqual(
                run.value,
                {
                    status: 'disabled',
                    snapped: [{ element: a, reason: 'disabled' }],
                },
                'explicit: report'
            )
            const disabled = events.filter((e) => e.code === 'runtime-disabled')
            expectEqual(disabled.length, 1, 'explicit: one runtime-disabled')
            expectEqual(disabled[0]!.action, 'snap', 'explicit: action')
            expectEqual(disabled[0]!.reason, 'disabled', 'explicit: reason')
            expectEqual(disabled[0]!.engine, 'raf', 'explicit: engine')
            expectEqual(disabled[0]!.version, 1, 'explicit: version')
            runScopes.push(disabled[0]!.scope)
            expectEqual(typeof disabled[0]!.run, 'number', 'explicit: run id')
            // the scope plans again from the next flush
            layoutRuntime.setMode('animate')
            h.group.capture()
            a.style.left = '320px'
            const again = report(h.group.flush())
            h.mc.frames(2)
            expectEqual(h.group.stats.tracks, 1, 'explicit: animates again')
            if (a.style.translate === '') throw new Error('explicit: no pose')
            h.group.finish()
            await microtasks()
            expectEqual(again.value?.status, 'ended', 'explicit: second run')
            layoutRuntime.setMode('snap')
            h.dispose()
            details.push(
                'explicit mid-run: restored, disabled, no subscription'
            )
        }

        // implicit root scope, mid-run (React without a LayoutGroup)
        {
            layoutRuntime.setMode('animate')
            const host = document.createElement('div')
            host.style.cssText =
                'position: relative; width: 600px; height: 400px;'
            document.body.append(host)
            const root: Root = createRoot(host)
            let setLeft!: (left: number) => void
            function Item(): ReactNode {
                const [left, update] = useState(0)
                setLeft = update
                const ref = useLayout<HTMLDivElement>()
                return h('div', {
                    ref,
                    style: {
                        position: 'absolute',
                        left,
                        top: 0,
                        width: 80,
                        height: 80,
                        transformOrigin: '0 0',
                    },
                })
            }
            flushSync(() => root.render(h(Item)))
            await microtasks()
            flushSync(() => setLeft(180))
            await microtasks()
            const item = host.firstElementChild as HTMLElement
            if (item.style.translate === '') {
                throw new Error('implicit: the commit started no track')
            }
            layoutRuntime.setMode('snap')
            expectEqual(item.style.translate, '', 'implicit: pose restored')
            expectEqual(defaultClock.size, 0, 'implicit: no subscription')
            const implicit = events
                .filter((e) => e.code === 'runtime-disabled')
                .at(-1)
            if (!implicit) throw new Error('implicit: no runtime-disabled')
            if (runScopes.includes(implicit.scope)) {
                throw new Error('implicit: reuses the explicit scope id')
            }
            expectEqual(implicit.action, 'snap', 'implicit: action')
            expectEqual(implicit.reason, 'disabled', 'implicit: reason')
            // still plans after setMode('animate')
            layoutRuntime.setMode('animate')
            flushSync(() => setLeft(300))
            await microtasks()
            if (item.style.translate === '') {
                throw new Error('implicit: does not animate after re-enable')
            }
            layoutRuntime.setMode('snap')
            flushSync(() => root.unmount())
            await microtasks()
            host.remove()
            details.push('implicit root: restored, disabled, re-enabled')
        }

        // mid-fade: a live crossfade finishes as a completed fade
        {
            layoutRuntime.setMode('animate')
            const h = harness({ motion })
            const card = node(h.root, boxAt(20, 20))
            const presence = createPresence(
                card,
                {
                    present: { translateY: 0 },
                    exit: ani({
                        to: { translateY: 0 },
                        duration: 0.1,
                        timing: timing.linear(),
                    }),
                },
                { clock: h.mc.clock }
            )
            h.add(card, { layoutId: 'ops-cross', radius: false })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            void presence.exit()
            const detail = node(h.root, boxAt(360, 40, 300, 200))
            h.add(detail, { layoutId: 'ops-cross', radius: false })
            void h.group.flush()
            h.mc.frames(2)
            expectEqual(card.style.opacity, '1', 'mid-fade: follower drawn')
            layoutRuntime.setMode('snap')
            expectEqual(card.style.opacity, '0', 'mid-fade: held at 0')
            expectEqual(detail.style.translate, '', 'mid-fade: lead restored')
            expectEqual(h.group.stats.tracks, 0, 'mid-fade: no track')
            // presence's own exit still runs on the same clock; it ends and
            // unsubscribes on its own, the layout realizer is already gone
            h.mc.frames(10)
            await microtasks()
            expectEqual(h.mc.clock.size, 0, 'mid-fade: clock empties')
            h.dispose()
            details.push('mid-crossfade: follower held at 0, lead restored')
        }

        // mid-hold: the one hold state that exists before the drive seam — an
        // invisible crossfade follower held at opacity 0 (§5.8)
        {
            layoutRuntime.setMode('animate')
            const h = harness({ motion })
            const card = node(h.root, boxAt(20, 20))
            const presence = createPresence(
                card,
                {
                    present: { translateY: 0 },
                    exit: ani({
                        to: { translateY: 0 },
                        duration: 0.1,
                        timing: timing.linear(),
                    }),
                },
                { clock: h.mc.clock }
            )
            h.add(card, { layoutId: 'ops-card', radius: false })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            void presence.exit()
            const detail = node(h.root, boxAt(360, 40, 300, 200))
            h.add(detail, { layoutId: 'ops-card', radius: false })
            void h.group.flush()
            // through the lead's 0.32 s timeline: the follower is held at 0
            for (let i = 0; i < 24; i++) {
                h.mc.frame(FRAME_MS)
                await microtasks()
            }
            expectEqual(card.style.opacity, '0', 'mid-hold: follower invisible')
            layoutRuntime.setMode('snap')
            expectEqual(
                card.style.opacity,
                '0',
                'mid-hold: follower stays invisible'
            )
            expectEqual(detail.style.translate, '', 'mid-hold: lead restored')
            expectEqual(h.mc.clock.size, 0, 'mid-hold: no subscription')
            expectEqual(h.group.stats.tracks, 0, 'mid-hold: no track')
            const held = events
                .filter((e) => e.code === 'runtime-disabled')
                .at(-1)
            expectEqual(held?.action, 'snap', 'mid-hold: diagnostic')
            layoutRuntime.setMode('animate')
            h.dispose()
            details.push(
                'mid-hold (invisible crossfade follower): stays invisible'
            )
        }
        return `L-OPS-1: ${details.join('; ')}`
    } finally {
        stop()
        layoutRuntime.setMode('animate')
        clearLayoutFaults()
    }
}

/* ───────────────────────────── L-OPS-2 ───────────────────────────── */

function measurable(h: Harness): {
    element: HTMLElement
    run: (moveTo: number) => {
        readonly authored: string
        readonly report: Promise<LayoutReport>
    }
} {
    const element = node(h.root, boxAt(0, 0))
    h.add(element, { layoutId: 'ops-fault', radius: false })
    h.group.capture()
    return {
        element,
        run(moveTo) {
            element.style.left = `${moveTo}px`
            return {
                authored: element.style.cssText,
                report: h.group.flush(),
            }
        },
    }
}

/**
 * Each injected engine exception and each user callback: §9.2's boundary.
 * Engine faults: 'failed', styles byte-identical, no listener, subscription
 * or animation left. Callback faults: 'callback-error', state unchanged, dev
 * async rethrow.
 */
export async function L_OPS_2(): Promise<string> {
    const details: string[] = []
    const listeners = watchScrollListeners()
    const quiet = silenceWarnings()
    try {
        // measure
        {
            const h = harness({ motion })
            const t = measurable(h)
            h.group.capture()
            const error = new Error('ops measure')
            injectLayoutFault('measure', error)
            const first = t.run(120)
            const report = await first.report
            expectEqual(report.status, 'failed', 'measure: status')
            expectEqual(
                report.snapped.map((s) => s.reason),
                ['failed'],
                'measure: snapped'
            )
            expectAuthored(t.element, first.authored, 'measure')
            expectEqual(h.mc.clock.size, 0, 'measure: no subscription')
            expectEqual(h.group.stats.tracks, 0, 'measure: no track')
            expectEqual(
                listeners.added,
                listeners.removed,
                'measure: no scroll listener'
            )
            // every affected report resolves, and the engine is usable again
            h.group.capture()
            const again = t.run(200)
            h.mc.frames(3)
            h.group.finish()
            await microtasks()
            const second = await again.report
            expectEqual(second.status, 'ended', 'measure: next flush animates')
            expectAuthored(t.element, again.authored, 'measure: final restore')
            h.dispose()
            details.push('measure: failed, restored')
        }

        // write, mid-flush and mid-frame
        {
            const h = harness({ motion })
            const t = measurable(h)
            injectLayoutFault('write')
            const first = t.run(120)
            const report = await first.report
            expectEqual(report.status, 'failed', 'write flush: status')
            expectAuthored(t.element, first.authored, 'write flush')
            expectEqual(h.mc.clock.size, 0, 'write flush: no subscription')
            h.dispose()
            details.push('write mid-flush: failed, restored')
        }
        {
            const h = harness({ motion })
            const t = measurable(h)
            const running = t.run(120)
            h.mc.frame(FRAME_MS)
            injectLayoutFault('write')
            h.mc.frame(FRAME_MS)
            const report = await running.report
            expectEqual(report.status, 'failed', 'write frame: status')
            expectAuthored(t.element, running.authored, 'write frame')
            expectEqual(h.mc.clock.size, 0, 'write frame: no subscription')
            h.dispose()
            details.push('write mid-frame: failed, restored')
        }

        // animate (WAAPI)
        {
            const h = harness({ motion, engine: 'waapi' })
            const element = node(h.root, boxAt(0, 0))
            h.add(element, { layout: 'position' })
            h.group.capture()
            element.style.left = '180px'
            const authored = element.style.cssText
            injectLayoutFault('animate')
            const report = await h.group.flush()
            expectEqual(report.status, 'failed', 'animate: status')
            expectAuthored(element, authored, 'animate')
            expectEqual(
                document.getAnimations().length,
                0,
                'animate: no animation'
            )
            expectEqual(h.mc.clock.size, 0, 'animate: no subscription')
            h.dispose()
            details.push('animate: failed, no animation left')
        }

        // onSnap: a user callback, isolated
        {
            const h = harness({ motion })
            const element = node(h.root, boxAt(0, 0))
            element.style.rotate = '10deg'
            h.add(element)
            h.group.capture()
            element.style.left = '80px'
            const authored = element.style.cssText
            const events: LayoutDiagnostic[] = []
            const listener = layoutRuntime.onDiagnostic((event) =>
                events.push(event)
            )
            const error = new Error('ops onSnap')
            injectLayoutFault('onSnap', error)
            const { value: run, thrown } = withAsyncThrows(() =>
                h.group.flush()
            )
            const report = await run
            expectEqual(report.status, 'no-change', 'onSnap: run unaffected')
            expectEqual(
                report.snapped[0]!.reason,
                'unsupported',
                'onSnap: snap'
            )
            expectAuthored(element, authored, 'onSnap')
            if (thrown.length !== 1 || thrown[0] !== error) {
                throw new Error(
                    'onSnap: the dev rethrow is not the callback error'
                )
            }
            const callback = events.filter((e) => e.code === 'callback-error')
            expectEqual(callback.length, 1, 'onSnap: callback-error')
            expectEqual(callback[0]!.error, error, 'onSnap: error payload')
            listener()
            h.dispose()
            details.push('onSnap: callback-error, state unchanged')
        }

        // a diagnostic listener: isolated, the others still receive the event
        {
            const h = harness({ motion })
            const element = node(h.root, boxAt(0, 0))
            element.style.rotate = '10deg'
            h.add(element)
            h.group.capture()
            element.style.left = '80px'
            const seen: LayoutDiagnostic[] = []
            const firstEvents: LayoutDiagnostic[] = []
            const first = layoutRuntime.onDiagnostic((event) => {
                firstEvents.push(event)
                if (event.code === 'callback-error') {
                    throw new Error('never recursive')
                }
            })
            const second = layoutRuntime.onDiagnostic((event) =>
                seen.push(event)
            )
            const error = new Error('ops listener')
            injectLayoutFault('diagnostic', error)
            const { value: run, thrown } = withAsyncThrows(() =>
                h.group.flush()
            )
            const report = await run
            expectEqual(
                report.snapped[0]!.reason,
                'unsupported',
                'listener: snap'
            )
            const codes = seen.map((e) => e.code)
            expectEqual(
                codes,
                ['unsupported-geometry', 'callback-error'],
                'listener: order'
            )
            expectEqual(seen[1]!.error, error, 'listener: error payload')
            expectEqual(
                firstEvents.map((event) => event.code),
                [],
                'listener: the faulting listener receives nothing, never callback-error'
            )
            if (thrown.length !== 1 || thrown[0] !== error) {
                throw new Error(
                    'listener: the dev rethrow is not the listener error'
                )
            }
            first()
            second()
            h.dispose()
            details.push(
                'diagnostic listener: callback-error to the others only'
            )
        }

        return `L-OPS-2: ${details.join('; ')}`
    } finally {
        listeners.restore()
        quiet.restore()
        clearLayoutFaults()
    }
}

/* ───────────────────────── caps in a browser ───────────────────────── */

/** §4.1/§9.1: the participant and mover caps, proved with `stats`. */
export async function CAPS(): Promise<string> {
    const events: LayoutDiagnostic[] = []
    const stop = layoutRuntime.onDiagnostic((event) => events.push(event))
    const quiet = silenceWarnings()
    try {
        // participant cap: no reads at capture or flush
        {
            const h = harness({ motion, maxParticipants: 2 })
            const a = node(h.root, boxAt(0, 0))
            const b = node(h.root, boxAt(100, 0))
            const c = node(h.root, boxAt(200, 0))
            for (const element of [a, b, c]) h.add(element)
            const before = h.group.stats
            h.group.capture()
            const afterCapture = h.group.stats
            expectEqual(afterCapture.rects, before.rects, 'cap: capture rects')
            expectEqual(
                afterCapture.styles,
                before.styles,
                'cap: capture styles'
            )
            a.style.left = '40px'
            b.style.left = '160px'
            c.style.left = '260px'
            const report = await h.group.flush()
            const after = h.group.stats
            expectEqual(report.status, 'capped', 'cap: status')
            expectEqual(report.snapped.length, 3, 'cap: every participant')
            expectEqual(after.rects, before.rects, 'cap: flush rects')
            expectEqual(after.styles, before.styles, 'cap: flush styles')
            expectEqual(after.reads, before.reads, 'cap: no read')
            expectEqual(h.mc.clock.size, 0, 'cap: no subscription')
            const cap = events.filter((e) => e.code === 'participant-cap')
            expectEqual(cap.length, 1, 'cap: participant-cap')
            expectEqual(cap[0]!.metrics.rectReads, 0, 'cap: metric rects')
            expectEqual(cap[0]!.metrics.styleReads, 0, 'cap: metric styles')
            if (!quiet.messages.some((m) => m.includes('maxParticipants'))) {
                throw new Error(
                    `cap: no development warning: ${quiet.messages.join(' | ')}`
                )
            }
            h.dispose()
        }
        // mover cap
        {
            const h = harness({ motion, maxNodes: 1 })
            const a = node(h.root, boxAt(0, 0))
            const b = node(h.root, boxAt(100, 0))
            h.add(a)
            h.add(b)
            h.group.capture()
            a.style.left = '40px'
            b.style.left = '160px'
            const report = await h.group.flush()
            expectEqual(report.status, 'capped', 'mover cap: status')
            expectEqual(
                events.filter((e) => e.code === 'mover-cap').length,
                1,
                'mover cap: diagnostic'
            )
            h.dispose()
        }
        return 'participant cap and mover cap: no reads over the cap, typed diagnostics'
    } finally {
        quiet.restore()
        stop()
    }
}
