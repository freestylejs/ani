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
    type LayoutOptions,
    type LayoutReport,
    layoutRuntime,
} from '@freestylejs/ani-layout'
import {
    LayoutGroup,
    useLayout,
    useLayoutGroup,
} from '@freestylejs/ani-react/layout'
import {
    createElement as h,
    type ReactNode,
    useCallback,
    useState,
} from 'react'
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
    const add = document.addEventListener.bind(document) as (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
    ) => void
    const remove = document.removeEventListener.bind(document) as (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions
    ) => void
    let added = 0
    let removed = 0
    document.addEventListener = function (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
    ) {
        if (type === 'scroll' || type === 'scrollend') added += 1
        if (listener !== null) add(type, listener, options)
    } as typeof document.addEventListener
    document.removeEventListener = function (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions
    ) {
        if (type === 'scroll' || type === 'scrollend') removed += 1
        if (listener !== null) remove(type, listener, options)
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

/** OPS-06: the exact `internal-error` payload of an engine fault. */
function expectInternalError(
    event: LayoutDiagnostic | undefined,
    error: unknown,
    engine: 'raf' | 'waapi' = 'raf'
): void {
    if (!event) throw new Error('internal-error was not emitted')
    expectEqual(event.version, 1, 'internal-error: version')
    expectEqual(event.code, 'internal-error', 'internal-error: code')
    expectEqual(event.action, 'abort', 'internal-error: action')
    expectEqual(event.engine, engine, 'internal-error: engine')
    expectEqual(event.error, error, 'internal-error: error')
    expectEqual(event.element, undefined, 'internal-error: element')
    expectEqual(event.reason, undefined, 'internal-error: reason')
    expectEqual(typeof event.scope, 'number', 'internal-error: scope')
    expectEqual(typeof event.run, 'number', 'internal-error: run')
    expectEqual(
        typeof event.metrics.participants,
        'number',
        'internal-error: participants'
    )
    expectEqual(
        typeof event.metrics.rectReads,
        'number',
        'internal-error: rects'
    )
    expectEqual(
        typeof event.metrics.styleReads,
        'number',
        'internal-error: styles'
    )
    expectEqual(event.metrics.springSettleMs, null, 'internal-error: settle')
}

/** OPS-06: the exact `callback-error` payload of a user callback. */
function expectCallbackError(
    event: LayoutDiagnostic | undefined,
    element: HTMLElement,
    error: unknown
): void {
    if (!event) throw new Error('callback-error was not emitted')
    expectEqual(event.version, 1, 'callback-error: version')
    expectEqual(event.code, 'callback-error', 'callback-error: code')
    expectEqual(event.action, 'none', 'callback-error: action')
    expectEqual(event.engine, 'raf', 'callback-error: engine')
    expectEqual(event.element, element, 'callback-error: element')
    expectEqual(event.error, error, 'callback-error: error')
    expectEqual(event.reason, undefined, 'callback-error: reason')
    expectEqual(typeof event.scope, 'number', 'callback-error: scope')
    expectEqual(
        typeof event.run === 'number' || event.run === null,
        true,
        'callback-error: run'
    )
    expectEqual(
        typeof event.metrics.participants,
        'number',
        'callback-error: participants'
    )
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
    const quiet = silenceWarnings()
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
            expectEqual(disabled[0]!.element, a, 'explicit: element')
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
            expectEqual(implicit.element, item, 'implicit: element')
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
            const before = events.length
            layoutRuntime.setMode('snap')
            expectEqual(card.style.opacity, '0', 'mid-fade: held at 0')
            expectEqual(detail.style.translate, '', 'mid-fade: lead restored')
            expectEqual(h.group.stats.tracks, 0, 'mid-fade: no track')
            const paused = events
                .slice(before)
                .filter((e) => e.code === 'runtime-disabled')
            expectEqual(paused.length, 2, 'mid-fade: one per mover')
            expectEqual(
                paused
                    .map((e) => (e.element === card ? 'card' : 'detail'))
                    .sort(),
                ['card', 'detail'],
                'mid-fade: elements'
            )
            expectEqual(
                paused.every((e) => e.action === 'snap'),
                true,
                'mid-fade: action'
            )
            expectEqual(
                paused.every((e) => typeof e.run === 'number'),
                true,
                'mid-fade: run'
            )
            expectEqual(paused[0]!.scope, paused[1]!.scope, 'mid-fade: scope')
            // presence's own exit still runs on the same clock; it ends and
            // unsubscribes on its own, the layout realizer is already gone
            h.mc.frames(10)
            await microtasks()
            expectEqual(h.mc.clock.size, 0, 'mid-fade: clock empties')
            h.dispose()
            details.push('mid-crossfade: follower held at 0, lead restored')
        }

        // P3 crossfade/presence hold: the follower is already held invisible;
        // no live track exists, so the kill switch emits no false event (C3)
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
            const before = events.length
            layoutRuntime.setMode('snap')
            expectEqual(
                card.style.opacity,
                '0',
                'mid-hold: follower stays invisible'
            )
            expectEqual(detail.style.translate, '', 'mid-hold: lead restored')
            expectEqual(h.mc.clock.size, 0, 'mid-hold: no subscription')
            expectEqual(h.group.stats.tracks, 0, 'mid-hold: no track')
            expectEqual(
                events
                    .slice(before)
                    .filter((e) => e.code === 'runtime-disabled').length,
                0,
                'mid-hold: no live mover, no false event'
            )
            layoutRuntime.setMode('animate')
            h.dispose()
            details.push(
                'P3 crossfade/presence hold: stays invisible, no false event'
            )
        }
        expectEqual(quiet.messages.length, 0, 'L-OPS-1: no development warning')
        return `L-OPS-1: ${details.join('; ')}`
    } finally {
        stop()
        quiet.restore()
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
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((event) =>
                events.push(event)
            )
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
                document.getAnimations().length,
                0,
                'measure: no animation'
            )
            expectInternalError(
                events.find((e) => e.code === 'internal-error'),
                error
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
            stop()
            h.dispose()
            expectEqual(
                listeners.added,
                listeners.removed,
                'measure: no scroll listener'
            )
            details.push('measure: failed, restored')
        }

        // write, mid-flush and mid-frame
        {
            const h = harness({ motion })
            const t = measurable(h)
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((event) =>
                events.push(event)
            )
            const error = new Error('write flush')
            injectLayoutFault('write', error)
            const first = t.run(120)
            const report = await first.report
            expectEqual(report.status, 'failed', 'write flush: status')
            expectAuthored(t.element, first.authored, 'write flush')
            expectEqual(h.mc.clock.size, 0, 'write flush: no subscription')
            expectEqual(
                document.getAnimations().length,
                0,
                'write flush: no animation'
            )
            expectInternalError(
                events.find((e) => e.code === 'internal-error'),
                error
            )
            stop()
            h.dispose()
            expectEqual(
                listeners.added,
                listeners.removed,
                'write flush: no scroll listener'
            )
            details.push('write mid-flush: failed, restored')
        }
        {
            const h = harness({ motion })
            const t = measurable(h)
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((event) =>
                events.push(event)
            )
            const running = t.run(120)
            h.mc.frame(FRAME_MS)
            const error = new Error('write frame')
            injectLayoutFault('write', error)
            h.mc.frame(FRAME_MS)
            const report = await running.report
            expectEqual(report.status, 'failed', 'write frame: status')
            expectAuthored(t.element, running.authored, 'write frame')
            expectEqual(h.mc.clock.size, 0, 'write frame: no subscription')
            expectEqual(
                document.getAnimations().length,
                0,
                'write frame: no animation'
            )
            expectInternalError(
                events.find((e) => e.code === 'internal-error'),
                error
            )
            stop()
            h.dispose()
            expectEqual(
                listeners.added,
                listeners.removed,
                'write frame: no scroll listener'
            )
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
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((event) =>
                events.push(event)
            )
            const error = new Error('animate')
            injectLayoutFault('animate', error)
            const report = await h.group.flush()
            expectEqual(report.status, 'failed', 'animate: status')
            expectAuthored(element, authored, 'animate')
            expectEqual(
                document.getAnimations().length,
                0,
                'animate: no animation'
            )
            expectEqual(h.mc.clock.size, 0, 'animate: no subscription')
            expectInternalError(
                events.find((e) => e.code === 'internal-error'),
                error,
                'waapi'
            )
            stop()
            h.dispose()
            expectEqual(
                listeners.added,
                listeners.removed,
                'animate: no scroll listener'
            )
            details.push('animate: failed, no animation left')
        }

        // OPS-03: a throwing browser-animation cancel must not skip the rest
        // of the cleanup: the realizer stops and internal-error is emitted.
        {
            const h = harness({ motion, engine: 'waapi' })
            const element = node(h.root, boxAt(0, 0))
            h.add(element, { layout: 'position' })
            h.group.capture()
            element.style.left = '160px'
            const running = report(h.group.flush())
            h.mc.frame(FRAME_MS)
            const animation = document.getAnimations()[0]
            if (!animation) throw new Error('OPS-03: no WAAPI animation')
            Object.defineProperty(animation, 'cancel', {
                configurable: true,
                value: () => {
                    throw new Error('cancel boom')
                },
            })
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((event) =>
                events.push(event)
            )
            const error = new Error('cleanup trigger')
            injectLayoutFault('write', error)
            const reportAfter = await h.group.flush()
            expectEqual(reportAfter.status, 'failed', 'OPS-03: status')
            expectEqual(h.mc.clock.size, 0, 'OPS-03: no subscription')
            expectInternalError(
                events.find((e) => e.code === 'internal-error'),
                error,
                'waapi'
            )
            await microtasks()
            expectEqual(
                running.value?.status,
                'failed',
                'OPS-03: running report failed'
            )
            stop()
            h.dispose()
            details.push('OPS-03: throwing cancel still cleans up')
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
            expectEqual(
                events.map((e) => e.code),
                ['unsupported-geometry', 'callback-error'],
                'onSnap: order'
            )
            expectCallbackError(callback[0], element, error)
            expectEqual(h.mc.clock.size, 0, 'onSnap: no subscription')
            expectEqual(
                document.getAnimations().length,
                0,
                'onSnap: no animation'
            )
            listener()
            h.dispose()
            expectEqual(
                listeners.added,
                listeners.removed,
                'onSnap: no scroll listener'
            )
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
            expectCallbackError(seen[1], element, error)
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
            expectEqual(h.mc.clock.size, 0, 'listener: no subscription')
            expectEqual(
                document.getAnimations().length,
                0,
                'listener: no animation'
            )
            first()
            second()
            h.dispose()
            expectEqual(
                listeners.added,
                listeners.removed,
                'listener: no scroll listener'
            )
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

function MaxItem({ id }: { id: string }): ReactNode {
    const ref = useLayout<HTMLDivElement>()
    return h('div', {
        ref,
        className: 'ops-late-item',
        'data-late': id === 'c' ? 'yes' : undefined,
        style: {
            position: 'absolute',
            left: id === 'a' ? 0 : id === 'b' ? 120 : 240,
            top: 0,
            width: 80,
            height: 80,
        },
    })
}

/** N2: a React late add over `maxParticipants` takes no measurement read. */
export async function L_OPS_MAXP_LATE(): Promise<string> {
    const mc = createManualClock()
    const host = document.createElement('div')
    host.style.cssText = 'position: relative; width: 500px; height: 300px;'
    document.body.append(host)
    const root: Root = createRoot(host)
    const quiet = silenceWarnings()
    const events: LayoutDiagnostic[] = []
    let update!: (fn: () => void) => Promise<LayoutReport>
    let addLate!: () => void
    function Controls(): null {
        update = useLayoutGroup().update
        return null
    }
    function App(): ReactNode {
        const [ids, setIds] = useState(['a', 'b'])
        addLate = () => setIds(['a', 'b', 'c'])
        return h(
            'div',
            null,
            ids.map((id) => h(MaxItem, { key: id, id }))
        )
    }
    try {
        flushSync(() =>
            root.render(
                h(
                    LayoutGroup,
                    { clock: mc.clock, maxParticipants: 2 },
                    h(Controls),
                    h(App)
                )
            )
        )
        await microtasks()
        const stop = layoutRuntime.onDiagnostic((event) => events.push(event))
        const rect = Element.prototype.getBoundingClientRect
        let lateReads = 0
        Element.prototype.getBoundingClientRect = function (this: Element) {
            if ((this as HTMLElement).dataset.late === 'yes') lateReads += 1
            return rect.call(this)
        }
        let report: LayoutReport
        try {
            report = await update(addLate)
        } finally {
            Element.prototype.getBoundingClientRect = rect
            stop()
        }
        expectEqual(report.status, 'capped', 'late max: status')
        expectEqual(lateReads, 0, 'late max: no late-mount rect read')
        const late = host.querySelector<HTMLElement>('[data-late="yes"]')
        expectEqual(late !== null, true, 'late max: item mounted')
        expectEqual(late!.style.translate, '', 'late max: no pose')
        const cap = events.filter((event) => event.code === 'participant-cap')
        expectEqual(cap.length, 1, 'late max: one participant-cap')
        expectEqual(cap[0]!.metrics.rectReads, 0, 'late max: metric rects')
        expectEqual(
            events.filter(
                (event) =>
                    event.code === 'capture-less-flush' ||
                    event.code === 'capture-aged'
            ).length,
            0,
            'late max: no stale diagnostic'
        )
        return `React late add over maxParticipants: ${report.status}, reads ${lateReads}, metric ${cap[0]!.metrics.rectReads}`
    } finally {
        quiet.restore()
        flushSync(() => root.unmount())
        await microtasks()
        host.remove()
    }
}

/** OPS-16: the React `maxParticipants` option reaches the adapter's scope. */
export async function L_OPS_MAXP(): Promise<string> {
    const results: string[] = []
    const quiet = silenceWarnings()
    try {
        for (const maxParticipants of [1, 0] as const) {
            const mc = createManualClock()
            const host = document.createElement('div')
            host.style.cssText =
                'position: relative; width: 500px; height: 300px;'
            document.body.append(host)
            const root: Root = createRoot(host)
            let update!: (fn: () => void) => Promise<LayoutReport>
            let swap!: () => void
            function Controls(): null {
                const controls = useLayoutGroup()
                update = controls.update
                return null
            }
            function App(): ReactNode {
                const [first, setFirst] = useState(true)
                swap = () => setFirst((value) => !value)
                const a = useLayout<HTMLDivElement>()
                const b = useLayout<HTMLDivElement>()
                return h(
                    'div',
                    null,
                    h('div', {
                        ref: a,
                        className: 'ops-item',
                        style: {
                            position: 'absolute',
                            left: first ? 0 : 200,
                            top: 0,
                            width: 80,
                            height: 80,
                        },
                    }),
                    h('div', {
                        ref: b,
                        className: 'ops-item',
                        style: {
                            position: 'absolute',
                            left: first ? 200 : 0,
                            top: 0,
                            width: 80,
                            height: 80,
                        },
                    })
                )
            }
            try {
                flushSync(() =>
                    root.render(
                        h(
                            LayoutGroup,
                            { clock: mc.clock, maxParticipants },
                            h(Controls),
                            h(App)
                        )
                    )
                )
                await microtasks()
                const report = await update(swap)
                expectEqual(
                    report.status,
                    'capped',
                    `react max ${maxParticipants}`
                )
                const items = [
                    ...host.querySelectorAll<HTMLElement>('.ops-item'),
                ]
                expectEqual(
                    items.length,
                    2,
                    `react max ${maxParticipants}: items`
                )
                for (const item of items) {
                    expectEqual(
                        item.style.translate,
                        '',
                        `react max ${maxParticipants}: no pose`
                    )
                }
                results.push(`${maxParticipants === 0 ? '0' : '1'} → capped`)
            } finally {
                flushSync(() => root.unmount())
                await microtasks()
                host.remove()
            }
        }
    } finally {
        quiet.restore()
    }
    return `React maxParticipants: ${results.join(', ')}`
}

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

/* ───────────────────── L-A11Y-1 (§5.8, §6, §8) ───────────────────── */

const a11yPresence = {
    present: { translateY: 0 },
    exit: ani({
        to: { translateY: 0 },
        duration: 0.1,
        timing: timing.linear(),
    }),
}

const focusItems: Record<string, HTMLElement> = {}

const focusMotion = { duration: 0.24, timing: timing.linear() }

function FocusItem({ id, left }: { id: string; left: number }): ReactNode {
    const layoutRef = useLayout<HTMLDivElement>({
        layout: 'position',
        radius: false,
    })
    const ref = useCallback(
        (element: HTMLDivElement | null) => {
            layoutRef(element)
            if (element) focusItems[id] = element
            else delete focusItems[id]
        },
        [layoutRef, id]
    )
    return h(
        'div',
        {
            ref,
            'data-item': id,
            tabIndex: 0,
            role: 'button',
            'aria-pressed': 'true',
            style: {
                position: 'absolute',
                left,
                top: 20,
                width: 80,
                height: 80,
                transformOrigin: '0 0',
                background: '#345',
            },
        },
        h('button', { type: 'button' }, id)
    )
}

function FocusList({
    order,
    tick,
    clock,
}: {
    order: readonly string[]
    tick: number
    clock: ManualClock['clock']
}): ReactNode {
    return h(
        LayoutGroup,
        { clock, motion: focusMotion },
        h(
            'div',
            {
                style: {
                    position: 'relative',
                    width: '600px',
                    height: '240px',
                },
            },
            order.map((id, index) =>
                h(FocusItem, { key: id, id, left: index * 120 })
            ),
            h('span', { hidden: true }, String(tick))
        )
    )
}

function authorAttributes(element: HTMLElement): string[] {
    return [...element.attributes]
        .filter((attribute) => attribute.name !== 'style')
        .map((attribute) => `${attribute.name}=${attribute.value}`)
}

/**
 * L-A11Y-1 (§5.8, §6, §8): a crossfade follower is inert from the first frame
 * and restored byte-identically on reversal and unmount, an authored value is
 * preserved, focus inside the follower skips the pair (light DOM and closed
 * shadow roots) without moving focus, and a keyed reorder and held re-render
 * keep `document.activeElement` and every author attribute.
 */
export async function L_A11Y_1(): Promise<string> {
    const details: string[] = []
    const events: LayoutDiagnostic[] = []
    const stop = layoutRuntime.onDiagnostic((event) => events.push(event))
    const quiet = silenceWarnings()
    try {
        // absent inert: set at the first crossfade frame, removed on unmount
        {
            const h = harness({ motion })
            const card = node(h.root, boxAt(20, 20))
            const authored = card.style.cssText
            const presence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            const removeCard = h.group.add(card, {
                layoutId: 'a11y',
                radius: false,
            })
            h.group.capture()
            await h.group.flush()
            void presence.exit()
            h.group.capture()
            const detail = node(h.root, boxAt(360, 40, 300, 200))
            h.group.add(detail, { layoutId: 'a11y', radius: false })
            const run = h.group.flush()
            expectEqual(card.hasAttribute('inert'), true, 'first frame inert')
            expectEqual(card.inert, true, 'first frame inert property')
            expectEqual(detail.hasAttribute('inert'), false, 'lead interactive')
            expectEqual(card.style.opacity, '1', 'follower drawn')
            expectEqual(detail.style.opacity, '0', 'lead drawn')
            h.mc.frames(2)
            expectEqual(card.hasAttribute('inert'), true, 'fade keeps inert')
            expectEqual(card.inert, true, 'fade keeps inert property')
            removeCard()
            card.remove()
            expectEqual(card.hasAttribute('inert'), false, 'unmount restores')
            // presence owns `transform`; layout owns these three here
            for (const property of ['translate', 'scale', 'opacity'] as const) {
                expectEqual(
                    card.style.getPropertyValue(property),
                    '',
                    `unmount restores ${property}`
                )
            }
            void authored
            h.group.dispose()
            await run
            presence.dispose()
            h.root.remove()
            details.push('absent inert: first frame, held, unmount restored')
        }

        // an authored inert value is preserved byte for byte
        {
            const h = harness({ motion })
            const card = node(h.root, boxAt(20, 20))
            card.setAttribute('inert', 'authored')
            const presence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            const removeCard = h.group.add(card, {
                layoutId: 'a11y-auth',
                radius: false,
            })
            h.group.capture()
            await h.group.flush()
            void presence.exit()
            h.group.capture()
            h.group.add(node(h.root, boxAt(360, 40, 300, 200)), {
                layoutId: 'a11y-auth',
                radius: false,
            })
            const run = h.group.flush()
            expectEqual(
                card.getAttribute('inert'),
                'authored',
                'authored start'
            )
            h.mc.frames(3)
            expectEqual(card.getAttribute('inert'), 'authored', 'authored fade')
            removeCard()
            expectEqual(
                card.getAttribute('inert'),
                'authored',
                'authored after unmount'
            )
            h.group.dispose()
            await run
            presence.dispose()
            h.root.remove()
            details.push('authored inert preserved')
        }

        // reversal: the old lead becomes inert, the old follower interactive
        {
            const h = harness({ motion })
            const card = node(h.root, boxAt(20, 20))
            const cardPresence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(card, { layoutId: 'a11y-rev', radius: false })
            h.group.capture()
            await h.group.flush()
            void cardPresence.exit()
            h.group.capture()
            const detail = node(h.root, boxAt(360, 40, 300, 200))
            const detailPresence = createPresence(detail, a11yPresence, {
                clock: h.mc.clock,
            })
            const removeDetail = h.group.add(detail, {
                layoutId: 'a11y-rev',
                radius: false,
            })
            const first = h.group.flush()
            h.mc.frames(2)
            expectEqual(card.hasAttribute('inert'), true, 'reversal follower')
            void cardPresence.enter()
            void detailPresence.exit()
            h.group.capture()
            const reverse = h.group.flush()
            expectEqual(
                detail.hasAttribute('inert'),
                true,
                'reversal follower b'
            )
            expectEqual(card.hasAttribute('inert'), false, 'reversal lead')
            expectEqual(card.inert, false, 'reversal lead property')
            removeDetail()
            detail.remove()
            expectEqual(detail.hasAttribute('inert'), false, 'reversal unmount')
            h.group.dispose()
            await Promise.all([first, reverse])
            cardPresence.dispose()
            detailPresence.dispose()
            h.root.remove()
            details.push('reversal swaps inert ownership')
        }

        // focus in the follower: no crossfade, lead at A, no inert, action none
        {
            const h = harness({ motion })
            const card = node(h.root, boxAt(20, 20))
            const button = document.createElement('button')
            card.append(button)
            button.focus()
            expectEqual(document.activeElement, button, 'card focus')
            const presence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(card, { layoutId: 'a11y-focus', radius: false })
            h.group.capture()
            await h.group.flush()
            const exit = presence.exit()
            h.group.capture()
            const detail = node(h.root, boxAt(360, 40, 300, 200))
            h.group.add(detail, { layoutId: 'a11y-focus', radius: false })
            const run = h.group.flush()
            expectEqual(
                card.hasAttribute('inert'),
                false,
                'focus keeps follower'
            )
            expectEqual(card.style.opacity, '', 'no follower opacity')
            expectEqual(card.style.translate, '', 'no follower pose')
            expectEqual(detail.style.opacity, '', 'no lead opacity')
            expectEqual(detail.style.translate, '', 'lead at A')
            expectEqual(document.activeElement, button, 'focus kept')
            const focus = events.filter((e) => e.code === 'focus-in-follower')
            expectEqual(focus.at(-1)?.action, 'none', 'focus diagnostic action')
            expectEqual(focus.at(-1)?.element, card, 'focus diagnostic element')
            h.mc.frames(10)
            expectEqual(document.activeElement, button, 'focus kept on frames')
            // presence alone released the exit (no crossfade hold)
            expectEqual(await exit, 'exited', 'exit under presence alone')
            await run
            h.group.dispose()
            presence.dispose()
            h.root.remove()
            details.push(
                'focus in follower: no crossfade, no inert, focus kept'
            )
        }

        // focus in the follower inside a closed shadow root
        {
            const h = harness({ motion })
            const host = document.createElement('div')
            host.style.cssText =
                'position: absolute; left: 20px; top: 20px; width: 200px; height: 100px;'
            h.root.append(host)
            const root = host.attachShadow({ mode: 'closed' })
            const follower = document.createElement('div')
            follower.style.cssText =
                'position: absolute; left: 20px; top: 20px; width: 80px; height: 80px; background: #345;'
            const button = document.createElement('button')
            follower.append(button)
            root.append(follower)
            button.focus()
            expectEqual(document.activeElement, host, 'shadow host focused')
            const presence = createPresence(follower, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(follower, { layoutId: 'a11y-shadow', radius: false })
            h.group.capture()
            await h.group.flush()
            void presence.exit()
            h.group.capture()
            const detail = node(h.root, boxAt(400, 40, 300, 200))
            h.group.add(detail, { layoutId: 'a11y-shadow', radius: false })
            const run = h.group.flush()
            expectEqual(
                follower.hasAttribute('inert'),
                false,
                'shadow no inert'
            )
            expectEqual(document.activeElement, host, 'shadow focus kept')
            const focus = events.filter(
                (e) => e.code === 'focus-in-follower' && e.element === follower
            )
            expectEqual(focus.length, 1, 'shadow focus diagnostic')
            expectEqual(focus[0]!.action, 'none', 'shadow focus action')
            h.mc.frames(3)
            expectEqual(document.activeElement, host, 'shadow focus on frames')
            h.group.dispose()
            await run
            presence.dispose()
            h.root.remove()
            details.push('focus through a closed shadow root')
        }

        // keyed reorder + held re-render: activeElement and attributes stable
        {
            const mc = createManualClock()
            const host = document.createElement('div')
            document.body.append(host)
            const root: Root = createRoot(host)
            try {
                const order = ['a', 'b', 'c']
                flushSync(() =>
                    root.render(
                        h(FocusList, { order, tick: 0, clock: mc.clock })
                    )
                )
                await microtasks()
                const b = focusItems.b!
                const bButton = b.querySelector('button')!
                bButton.focus()
                const attributes = authorAttributes(b)
                expectEqual(document.activeElement, bButton, 'reorder focus')
                const next = ['c', 'a', 'b']
                flushSync(() =>
                    root.render(
                        h(FocusList, { order: next, tick: 0, clock: mc.clock })
                    )
                )
                await microtasks()
                expectEqual(
                    document.activeElement,
                    bButton,
                    'reorder keeps focus'
                )
                expectEqual(focusItems.b, b, 'same element after reorder')
                if (b.style.translate === '') {
                    throw new Error('reorder: no track started')
                }
                mc.frames(3)
                expectEqual(
                    document.activeElement,
                    bButton,
                    'reorder frames focus'
                )
                // a held re-render mid-run: same options, no box change
                flushSync(() =>
                    root.render(
                        h(FocusList, { order: next, tick: 1, clock: mc.clock })
                    )
                )
                await microtasks()
                expectEqual(
                    document.activeElement,
                    bButton,
                    'held rerender focus'
                )
                if (b.style.translate === '') {
                    throw new Error('held re-render: the track stopped')
                }
                mc.frames(20)
                expectEqual(document.activeElement, bButton, 'settle focus')
                expectEqual(b.style.translate, '', 'settle translate')
                expectEqual(b.style.scale, '', 'settle scale')
                expectEqual(
                    authorAttributes(b),
                    attributes,
                    'settle attributes'
                )
                expectEqual(mc.clock.size, 0, 'no subscription after settle')
                flushSync(() => root.unmount())
                await microtasks()
                details.push(
                    'keyed reorder and held re-render keep activeElement and attributes'
                )
            } finally {
                host.remove()
            }
        }
        return `L-A11Y-1: ${details.join('; ')}`
    } finally {
        stop()
        quiet.restore()
        clearLayoutFaults()
        layoutRuntime.setMode('animate')
    }
}

/* ─────────────── §11.3 model-based lifecycle fuzz (browser) ─────────────── */

interface FuzzBatch {
    writes: number
    violation: string | null
    crossDocument: boolean
    properties: string[]
    attributes: string[]
}

let fuzzBatch: FuzzBatch | null = null
/** What the engine wrote during the current event, per property/attribute. */
let fuzzSink: { property?: string; attribute?: string }[] | null = null

function fuzzRead(what: string): void {
    if (!fuzzBatch || fuzzBatch.writes === 0) return
    if (fuzzBatch.crossDocument) {
        fuzzBatch.writes = 0
        return
    }
    if (fuzzBatch.violation === null) fuzzBatch.violation = what
}

function fuzzRun<T>(work: () => T): T {
    fuzzBatch = {
        writes: 0,
        violation: null,
        crossDocument: false,
        properties: [],
        attributes: [],
    }
    let value: T
    try {
        value = work()
    } catch (error) {
        fuzzBatch = null
        throw error
    }
    const batch = fuzzBatch
    fuzzBatch = null
    if (batch && fuzzSink) {
        for (const property of batch.properties) fuzzSink.push({ property })
        for (const attribute of batch.attributes) fuzzSink.push({ attribute })
    }
    if (batch?.violation !== null && batch !== null) {
        throw new Error(
            `a ${batch.violation} read followed the batch's first write`
        )
    }
    return value
}

/** Adds one read/write recorder to the page's DOM APIs; returns the restore. */
function instrumentFuzz(): () => void {
    const rect = Element.prototype.getBoundingClientRect
    const offsetWidth = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'offsetWidth'
    )!
    const offsetHeight = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'offsetHeight'
    )!
    const computed = window.getComputedStyle.bind(window)
    const setProperty = CSSStyleDeclaration.prototype.setProperty
    const removeProperty = CSSStyleDeclaration.prototype.removeProperty
    const setAttribute = Element.prototype.setAttribute
    const removeAttribute = Element.prototype.removeAttribute
    Element.prototype.getBoundingClientRect = function (
        this: Element
    ): DOMRect {
        fuzzRead('rect')
        return rect.call(this)
    }
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        get(this: HTMLElement) {
            fuzzRead('offsetWidth')
            return offsetWidth.get!.call(this)
        },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get(this: HTMLElement) {
            fuzzRead('offsetHeight')
            return offsetHeight.get!.call(this)
        },
    })
    window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
        fuzzRead('computed style')
        return computed(element, pseudo)
    }) as typeof window.getComputedStyle
    CSSStyleDeclaration.prototype.setProperty = function (
        property: string,
        value: string | null,
        priority?: string
    ) {
        if (fuzzBatch) {
            fuzzBatch.writes += 1
            fuzzBatch.properties.push(property)
        }
        return setProperty.call(this, property, value, priority)
    }
    CSSStyleDeclaration.prototype.removeProperty = function (property: string) {
        if (fuzzBatch) {
            fuzzBatch.writes += 1
            fuzzBatch.properties.push(property)
        }
        return removeProperty.call(this, property)
    }
    Element.prototype.setAttribute = function (name: string, value: string) {
        if (fuzzBatch) {
            fuzzBatch.writes += 1
            fuzzBatch.attributes.push(name)
        }
        return setAttribute.call(this, name, value)
    }
    Element.prototype.removeAttribute = function (name: string) {
        if (fuzzBatch) {
            fuzzBatch.writes += 1
            fuzzBatch.attributes.push(name)
        }
        return removeAttribute.call(this, name)
    }
    return () => {
        Element.prototype.getBoundingClientRect = rect
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth)
        Object.defineProperty(
            HTMLElement.prototype,
            'offsetHeight',
            offsetHeight
        )
        window.getComputedStyle = computed
        CSSStyleDeclaration.prototype.setProperty = setProperty
        CSSStyleDeclaration.prototype.removeProperty = removeProperty
        Element.prototype.setAttribute = setAttribute
        Element.prototype.removeAttribute = removeAttribute
        fuzzBatch = null
        fuzzSink = null
    }
}

function fuzzSeed(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const FUZZ_TOL = 0.5

function fuzzStyle(element: HTMLElement): Map<string, string> {
    const values = new Map<string, string>()
    for (let i = 0; i < element.style.length; i++) {
        const property = element.style.item(i)
        values.set(
            property,
            `${element.style.getPropertyValue(property)}|${element.style.getPropertyPriority(property)}`
        )
    }
    return values
}

function fuzzCheckStyles(
    element: HTMLElement,
    before: Map<string, string>
): void {
    const values = new Map<string, string>()
    for (let i = 0; i < element.style.length; i++) {
        const property = element.style.item(i)
        values.set(
            property,
            `${element.style.getPropertyValue(property)}|${element.style.getPropertyPriority(property)}`
        )
    }
    const allowed = new Set([
        'translate',
        'scale',
        'opacity',
        'transform',
        'overflow-anchor',
        'border-top-left-radius',
        'border-top-right-radius',
        'border-bottom-right-radius',
        'border-bottom-left-radius',
    ])
    for (const [property, value] of values) {
        if (before.get(property) === value) continue
        if (!allowed.has(property)) continue
        if (
            (property === 'translate' || property === 'scale') &&
            !value.endsWith('|important')
        ) {
            throw new Error(`layout wrote ${property} without !important`)
        }
    }
    for (let i = 0; i < element.style.length; i++) {
        const property = element.style.item(i)
        const raw = element.style.getPropertyValue(property)
        const numbers = [...raw.matchAll(/-?\d+(\.\d+)?/g)].map((match) =>
            Number(match[0])
        )
        if (numbers.some((number) => !Number.isFinite(number))) {
            throw new Error(`a non-finite style on a participant: ${raw}`)
        }
    }
    const rect = element.getBoundingClientRect()
    if (
        ![rect.x, rect.y, rect.width, rect.height].every((value) =>
            Number.isFinite(value)
        )
    ) {
        throw new Error('a non-finite rect')
    }
}

/**
 * FUZZ (§11.3): the seeded lifecycle model on real DOM in Chromium and
 * WebKit. A fixseed prints its seed and step on failure; the sequence is pure
 * for that seed.
 */
export async function FUZZ(): Promise<string> {
    const seeds = [11, 23, 37, 41, 53, 67, 79, 83, 97, 101]
    const quiet = silenceWarnings()
    const restoreInstrument = instrumentFuzz()
    const scrolls = watchScrollListeners()
    let passed = 0
    try {
        for (const seed of seeds) {
            const random = fuzzSeed(seed)
            const h = harness({ motion })
            const authored = new Map<
                HTMLElement,
                { style: string; inert: string | null }
            >()
            const reports: Promise<LayoutReport>[] = []
            const exits: Promise<unknown>[] = []
            const enters: Promise<unknown>[] = []
            const captures = new Map<
                HTMLElement,
                { x: number; y: number; w: number; h: number }[]
            >()
            const a = node(h.root, boxAt(0, 0))
            const b = node(h.root, boxAt(200, 0))
            const card = node(h.root, boxAt(20, 200))
            const scroller = node(h.root, boxAt(0, 300, 500, 200))
            const detail = node(document.body, boxAt(600, 40, 300, 200))
            const button = document.createElement('button')
            b.append(button)
            button.focus()
            const cardPresence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            let detailPresence: ReturnType<typeof createPresence> | null = null
            let cardExiting = false
            let detailPresent = false
            let hidden = false
            const log: string[] = []
            let removeDetail: (() => void) | null = null
            let adopted = false
            for (const element of [a, b, card, scroller]) {
                authored.set(element, {
                    style: element.style.cssText,
                    inert: element.getAttribute('inert'),
                })
            }
            authored.set(detail, {
                style: detail.style.cssText,
                inert: detail.getAttribute('inert'),
            })
            const removeA = h.group.add(a, { radius: false })
            h.group.add(b, { radius: false })
            const removeCard = h.group.add(card, {
                layoutId: 'fuzz-card',
                radius: false,
            })
            const recordCapture = (): void => {
                for (const element of [a, b, card, detail]) {
                    if (!element.isConnected) continue
                    if (element === a && adopted) continue
                    const box = viewBox(element)
                    const list = captures.get(element) ?? []
                    list.push(box)
                    captures.set(element, list)
                }
            }
            const capture = (): void => {
                const count = h.group.stats.captures
                fuzzRun(() => h.group.capture())
                if (h.group.stats.captures !== count) recordCapture()
            }
            const presented = (): Map<
                HTMLElement,
                { x: number; y: number; w: number; h: number }
            > => {
                const boxes = new Map<
                    HTMLElement,
                    { x: number; y: number; w: number; h: number }
                >()
                for (const element of [a, b, card, detail]) {
                    if (!element.isConnected || (element === a && adopted))
                        continue
                    boxes.set(element, viewBox(element))
                }
                return boxes
            }
            const assertB = (
                before: Map<HTMLElement, Map<string, string>>,
                presentedBoxes: Map<
                    HTMLElement,
                    { x: number; y: number; w: number; h: number }
                >
            ): void => {
                for (const element of [a, b, card, detail]) {
                    const was = before.get(element)!
                    const translate = element.style.translate
                    if (translate === '') continue
                    const old = was.get('translate') ?? ''
                    if (translate === old) continue
                    const box = viewBox(element)
                    const allowed = [
                        ...[...captures.values()].flat(),
                        ...(presentedBoxes.has(element)
                            ? [presentedBoxes.get(element)!]
                            : []),
                    ]
                    let matches = false
                    for (const candidate of allowed) {
                        if (
                            Math.abs(box.x - candidate.x) <= FUZZ_TOL &&
                            Math.abs(box.y - candidate.y) <= FUZZ_TOL &&
                            Math.abs(box.w - candidate.w) <= FUZZ_TOL &&
                            Math.abs(box.h - candidate.h) <= FUZZ_TOL
                        ) {
                            matches = true
                            break
                        }
                    }
                    if (!matches) {
                        throw new Error(
                            `B is not a captured box at ${box.x},${box.y} ${box.w}x${box.h} (translate ${translate})`
                        )
                    }
                }
            }
            const eventCount = 10 + (seed % 5)
            try {
                for (let step = 0; step < eventCount; step++) {
                    const before = new Map<HTMLElement, Map<string, string>>()
                    for (const element of [a, b, card, detail]) {
                        before.set(element, fuzzStyle(element))
                    }
                    const presentedBoxes = presented()
                    fuzzSink = []
                    const pick = random()
                    try {
                        if (pick < 0.16) {
                            capture()
                        } else if (pick < 0.3) {
                            fuzzRun(() => h.mc.frame(16))
                        } else if (pick < 0.45) {
                            const fresh = (() => {
                                const count = h.group.stats.captures
                                capture()
                                return h.group.stats.captures !== count
                            })()
                            fuzzRun(() => {
                                a.style.top = `${Math.round(random() * 120)}px`
                                b.style.top = `${Math.round(random() * 120)}px`
                            })
                            reports.push(fuzzRun(() => h.group.flush()))
                            if (fresh) assertB(before, presentedBoxes)
                        } else if (pick < 0.54) {
                            capture()
                            fuzzRun(() => {
                                a.style.left = `${Math.round(random() * 260)}px`
                                h.mc.frame(16)
                            })
                            reports.push(fuzzRun(() => h.group.flush()))
                        } else if (pick < 0.6) {
                            fuzzRun(() => {
                                if (adopted) return
                                if (a.isConnected) a.remove()
                                else h.root.append(a)
                            })
                            reports.push(fuzzRun(() => h.group.flush()))
                        } else if (pick < 0.7) {
                            if (!cardExiting && card.isConnected) {
                                cardExiting = true
                                const exit = cardPresence.exit()
                                exits.push(exit)
                                // the adapter unmounts the key when presence
                                // exits (the held follower is gone with it)
                                void exit.then((result) => {
                                    if (
                                        (result === 'exited' ||
                                            result === 'timeout') &&
                                        card.isConnected
                                    ) {
                                        cardExiting = false
                                        removeCard()
                                        card.remove()
                                    }
                                })
                                capture()
                                if (!detailPresent) {
                                    document.body.append(detail)
                                    detailPresence = createPresence(
                                        detail,
                                        a11yPresence,
                                        { clock: h.mc.clock }
                                    )
                                    removeDetail = h.group.add(detail, {
                                        layoutId: 'fuzz-card',
                                        radius: false,
                                    })
                                    detailPresent = true
                                }
                                reports.push(fuzzRun(() => h.group.flush()))
                            } else if (card.isConnected) {
                                cardExiting = false
                                enters.push(cardPresence.enter())
                                if (detailPresent) {
                                    exits.push(detailPresence!.exit())
                                }
                                capture()
                                reports.push(fuzzRun(() => h.group.flush()))
                                if (detailPresent) {
                                    removeDetail?.()
                                    removeDetail = null
                                    detailPresent = false
                                    detail.remove()
                                    detailPresence?.dispose()
                                    detailPresence = null
                                }
                            }
                        } else if (pick < 0.75) {
                            capture()
                            fuzzRun(() =>
                                h.group.set(adopted ? b : a, {
                                    radius: false,
                                    layoutKey: String(Math.round(random() * 3)),
                                })
                            )
                            reports.push(fuzzRun(() => h.group.flush()))
                        } else if (pick < 0.82) {
                            fuzzRun(() =>
                                scroller.dispatchEvent(new Event('scroll'))
                            )
                            capture()
                            fuzzRun(() => {
                                card.style.left = `${20 + Math.round(random() * 40)}px`
                            })
                            reports.push(fuzzRun(() => h.group.flush()))
                            if (random() < 0.6) {
                                fuzzRun(() =>
                                    scroller.dispatchEvent(
                                        new Event('scrollend')
                                    )
                                )
                            }
                        } else if (pick < 0.87) {
                            h.mc.setReducedMotion(!h.mc.clock.reducedMotion)
                            capture()
                            fuzzRun(() => {
                                b.style.left = `${Math.round(random() * 260)}px`
                            })
                            reports.push(fuzzRun(() => h.group.flush()))
                            h.mc.setReducedMotion(false)
                        } else if (pick < 0.91) {
                            layoutRuntime.setMode('snap')
                            fuzzRun(() => h.mc.frame(16))
                            layoutRuntime.setMode('animate')
                        } else if (pick < 0.94) {
                            hidden = !hidden
                            h.mc.setHidden(hidden)
                            fuzzRun(() => h.mc.frame(16))
                        } else if (pick < 0.98) {
                            if (adopted) {
                                fuzzRun(() => h.mc.frame(16))
                            } else {
                                adopted = true
                                fuzzRun(() => {
                                    const other =
                                        document.implementation.createHTMLDocument(
                                            'fuzz'
                                        )
                                    other.adoptNode(a)
                                    other.body.append(a)
                                    fuzzBatch!.crossDocument = true
                                    h.group.capture()
                                    fuzzBatch!.crossDocument = false
                                })
                                recordCapture()
                                reports.push(fuzzRun(() => h.group.flush()))
                            }
                        } else {
                            injectLayoutFault(
                                random() < 0.5 ? 'measure' : 'write'
                            )
                            reports.push(fuzzRun(() => h.group.flush()))
                            clearLayoutFaults()
                        }
                    } catch (error) {
                        throw new Error(
                            `event ${step} (${pick.toFixed(3)}): ${error instanceof Error ? error.message : String(error)}`
                        )
                    }
                    const owned = new Set([
                        'translate',
                        'scale',
                        'opacity',
                        'border-top-left-radius',
                        'border-top-right-radius',
                        'border-bottom-right-radius',
                        'border-bottom-left-radius',
                        'overflow-anchor',
                    ])
                    for (const write of fuzzSink) {
                        if (
                            write.property !== undefined &&
                            !owned.has(write.property)
                        ) {
                            throw new Error(
                                `layout wrote an unowned property: ${write.property}`
                            )
                        }
                        if (
                            write.attribute !== undefined &&
                            write.attribute !== 'inert'
                        ) {
                            throw new Error(
                                `layout wrote an unowned attribute: ${write.attribute}`
                            )
                        }
                    }
                    fuzzSink = null
                    for (const element of [a, b, card, detail]) {
                        fuzzCheckStyles(element, before.get(element)!)
                        if (document.activeElement !== button) {
                            throw new Error('focus moved')
                        }
                    }
                    log.push(
                        `${step}:${pick.toFixed(3)} phase=${cardPresence.phase} opacity=${card.style.opacity || '-'} inert=${card.hasAttribute('inert')} exiting=${cardExiting} opacity=${card.style.opacity} card=${card.isConnected} detail=${detailPresent}`
                    )
                    await microtasks()
                }
                // terminate every run and handle; everything resolves
                h.group.dispose()
                cardPresence.dispose()
                detailPresence?.dispose()
                removeDetail?.()
                removeDetail = null
                await Promise.allSettled([...exits, ...enters])
                const settled = await Promise.allSettled(reports)
                for (const report of settled) {
                    if (report.status !== 'fulfilled') throw report.reason
                    if (
                        ![
                            'failed',
                            'disposed',
                            'disabled',
                            'capped',
                            'interrupted',
                            'ended',
                            'reduced',
                            'stale',
                            'no-change',
                        ].includes(report.value.status)
                    ) {
                        throw new Error(`unknown status ${report.value.status}`)
                    }
                }
                for (const exit of exits) {
                    const result = await exit
                    if (
                        result !== 'exited' &&
                        result !== 'timeout' &&
                        result !== 'interrupted' &&
                        result !== 'disposed'
                    ) {
                        throw new Error(
                            `a presence handle ended ${String(result)}`
                        )
                    }
                }
                fuzzRun(() => h.mc.frame(16))
                if (h.mc.clock.size !== 0) throw new Error('clock subscription')
                if (h.mc.pending !== 0) throw new Error('frame request')
                if (h.group.stats.tracks !== 0) throw new Error('track left')
                if (scrolls.added !== scrolls.removed) {
                    throw new Error(
                        `scroll listeners leaked: ${scrolls.added} added, ${scrolls.removed} removed`
                    )
                }
                for (const element of [a, b, card, detail]) {
                    for (const property of [
                        'translate',
                        'scale',
                        'opacity',
                    ] as const) {
                        const authoredStyle = authored.get(element)!
                        const wanted = (() => {
                            const probe = document.createElement('div')
                            probe.style.cssText = authoredStyle.style
                            return probe.style.getPropertyValue(property)
                        })()
                        const now = element.style.getPropertyValue(property)
                        if (now !== wanted) {
                            throw new Error(
                                `${property} not restored: ${JSON.stringify(now)}`
                            )
                        }
                    }
                    const inert = element.getAttribute('inert')
                    if (inert !== authored.get(element)!.inert) {
                        throw new Error(
                            `inert not restored: ${JSON.stringify(inert)}`
                        )
                    }
                }
                passed += 1
            } finally {
                h.group.dispose()
                cardPresence.dispose()
                detailPresence?.dispose()
                removeDetail?.()
                removeA()
                a.remove()
                b.remove()
                card.remove()
                detail.remove()
                scroller.remove()
                h.root.remove()
                clearLayoutFaults()
                layoutRuntime.setMode('animate')
            }
        }
        return `FUZZ: ${passed} seeds × 10–14 events; no NaN, B from a capture, no read after the first write, one writer per property, every report and handle terminal, styles/inert restored`
    } finally {
        restoreInstrument()
        scrolls.restore()
        quiet.restore()
        layoutRuntime.setMode('animate')
    }
}

/* ─────────────── §11.3 mutation negative controls (browser) ─────────────── */

type Observation = Record<string, unknown>

/**
 * Runs one named mutation: the real engine outcome must pass the row's
 * checker, and the mutated outcome must fail that same checker with the row's
 * name in the message. The mutation is the test's wrong alternative decision
 * (no source rewriting).
 */
function expectMutation(
    name: string,
    row: string,
    check: (observation: Observation) => void,
    real: Observation,
    mutant: Observation
): void {
    check(real)
    let failure: string | null = null
    try {
        check(mutant)
    } catch (error) {
        failure = error instanceof Error ? error.message : String(error)
    }
    if (failure === null) {
        throw new Error(`${row}: the mutation "${name}" passed the row`)
    }
    if (!failure.includes(row)) {
        throw new Error(
            `${row}: the mutation "${name}" failed a different check: ${failure}`
        )
    }
}

function collectOpsDiagnostics(): {
    readonly events: LayoutDiagnostic[]
    stop(): void
} {
    const events: LayoutDiagnostic[] = []
    const stop = layoutRuntime.onDiagnostic((event) => events.push(event))
    return { events, stop }
}

function reasonsOf(report: LayoutReport): string[] {
    return report.snapped.map((entry) => entry.reason)
}

/**
 * MUTATION (§11.3): eight deliberately wrong decisions, each failing the named
 * row it attacks: consume an aged capture, skip the frame marker, use the
 * predicted box instead of the measured one, drop the layout-size check,
 * ignore `scrollend`, skip cleanup on abort, release with `dt ≠ 0`, and merge
 * the motion field by field.
 */
export async function MUTATION(): Promise<string> {
    const details: string[] = []
    const quiet = silenceWarnings()
    const diagnostics = collectOpsDiagnostics()
    try {
        // 1. consume an aged capture -> L-MEAS-11
        {
            const h = harness({ motion })
            const a = node(h.root, boxAt(0, 0))
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            h.mc.frame(16)
            a.style.left = '120px'
            const report = await h.group.flush()
            const event = diagnostics.events
                .filter((candidate) => candidate.code === 'capture-aged')
                .at(-1)
            const real = {
                status: report.status,
                tracks: h.group.stats.tracks,
                x: viewBox(a).x,
                a: 120,
                snapped: reasonsOf(report),
                code: event?.code ?? null,
            }
            expectMutation(
                'consume an aged capture',
                'L-MEAS-11',
                (o) => {
                    if (o.status !== 'stale')
                        throw new Error(`L-MEAS-11: status ${String(o.status)}`)
                    if (o.tracks !== 0)
                        throw new Error(
                            'L-MEAS-11: a track consumed the capture'
                        )
                    if (Math.abs((o.x as number) - (o.a as number)) > TOL)
                        throw new Error('L-MEAS-11: not at A')
                    if (!(o.snapped as string[]).includes('stale'))
                        throw new Error('L-MEAS-11: not reported stale')
                    if (o.code !== 'capture-aged')
                        throw new Error('L-MEAS-11: no capture-aged')
                },
                real,
                {
                    ...real,
                    status: 'ended',
                    tracks: 1,
                    x: 0,
                    snapped: [],
                    code: null,
                }
            )
            h.dispose()
            details.push('M1 aged capture -> L-MEAS-11')
        }

        // 2. skip the frame marker -> L-MEAS-13
        {
            const h = harness({ motion })
            const a = node(h.root, boxAt(0, 0))
            h.add(a, { radius: false })
            h.group.capture()
            let report!: Promise<LayoutReport>
            h.mc.clock.read(() => {
                a.style.left = '120px'
            })
            h.mc.clock.read(() => {
                report = h.group.flush()
            })
            h.mc.frame(16)
            const settled = await report
            const event = diagnostics.events
                .filter((candidate) => candidate.code === 'capture-aged')
                .at(-1)
            const real = {
                status: settled.status,
                tracks: h.group.stats.tracks,
                x: viewBox(a).x,
                a: 120,
                snapped: reasonsOf(settled),
                code: event?.code ?? null,
            }
            expectMutation(
                'skip the frame marker',
                'L-MEAS-13',
                (o) => {
                    if (o.status !== 'stale')
                        throw new Error(`L-MEAS-13: status ${String(o.status)}`)
                    if (o.tracks !== 0)
                        throw new Error(
                            'L-MEAS-13: an earlier frame was not aged'
                        )
                    if (Math.abs((o.x as number) - (o.a as number)) > TOL)
                        throw new Error('L-MEAS-13: not at A')
                    if (!(o.snapped as string[]).includes('stale'))
                        throw new Error('L-MEAS-13: not reported stale')
                    if (o.code !== 'capture-aged')
                        throw new Error('L-MEAS-13: no capture-aged')
                },
                real,
                {
                    ...real,
                    status: 'ended',
                    tracks: 1,
                    x: 0,
                    snapped: [],
                    code: null,
                }
            )
            h.dispose()
            details.push('M2 frame marker -> L-MEAS-13')
        }

        // 3. use the predicted box instead of the measured one -> L-MEAS-4
        {
            const h = harness({ motion })
            const a = node(h.root, boxAt(-100, 0))
            h.add(a, { radius: false })
            h.group.capture()
            a.style.left = '-50px'
            const run = h.group.flush()
            const real = {
                tracks: h.group.stats.tracks,
                first: viewBox(a).x,
                captured: -100,
            }
            expectMutation(
                'use the predicted box instead of the measured one',
                'L-MEAS-4',
                (o) => {
                    if (o.tracks !== 1)
                        throw new Error('L-MEAS-4: no track started')
                    if (
                        Math.abs((o.first as number) - (o.captured as number)) >
                        TOL
                    )
                        throw new Error(
                            `L-MEAS-4: first frame ${String(o.first)} is not the captured ${String(o.captured)}`
                        )
                },
                real,
                { ...real, first: 0 }
            )
            h.group.dispose()
            await run
            details.push('M3 predicted box -> L-MEAS-4')
        }

        // 4. drop the layout-size check -> L-MEAS-11 (50x cap, §9.1)
        {
            const h = harness({ motion })
            const a = node(h.root, boxAt(0, 0, 40, 40))
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            a.style.width = '2400px'
            a.style.height = '2400px'
            const report = await h.group.flush()
            const real = {
                status: report.status,
                tracks: h.group.stats.tracks,
                snapped: reasonsOf(report),
            }
            expectMutation(
                'drop the layout-size check',
                'L-MEAS-11',
                (o) => {
                    if (!(o.snapped as string[]).includes('unsupported'))
                        throw new Error(
                            'L-MEAS-11: the 60x size change did not snap'
                        )
                    if (o.tracks !== 0)
                        throw new Error('L-MEAS-11: a 60x size change ran')
                },
                real,
                { status: 'ended', tracks: 1, snapped: [] }
            )
            h.dispose()
            details.push('M4 size check -> L-MEAS-11 (§9.1 size-limit)')
        }

        // 5. ignore scrollend -> L-HAND-2
        {
            const h = harness({ motion })
            const scroller = node(h.root, boxAt(0, 300, 500, 200))
            scroller.style.overflow = 'auto'
            const card = node(scroller, boxAt(20, 20))
            const second = node(scroller, boxAt(20, 120))
            const cardPresence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            const secondPresence = createPresence(second, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(card, { layoutId: 'mut-a', radius: false })
            h.group.add(second, { layoutId: 'mut-b', radius: false })
            h.group.capture()
            await h.group.flush()
            scroller.dispatchEvent(new Event('scroll'))
            void cardPresence.exit()
            h.group.capture()
            const detailA = node(document.body, boxAt(500, 60, 300, 200))
            h.group.add(detailA, { layoutId: 'mut-a', radius: false })
            const first = h.group.flush()
            const beforeScrollEnd = {
                tracks: h.group.stats.tracks,
                opacity: card.style.opacity,
                translate: detailA.style.translate,
            }
            scroller.dispatchEvent(new Event('scrollend'))
            void secondPresence.exit()
            h.group.capture()
            const detailB = node(document.body, boxAt(500, 300, 300, 200))
            h.group.add(detailB, { layoutId: 'mut-b', radius: false })
            const secondRun = h.group.flush()
            const real = {
                beforeTracks: beforeScrollEnd.tracks,
                beforeOpacity: beforeScrollEnd.opacity,
                beforeTranslate: beforeScrollEnd.translate,
                tracks: h.group.stats.tracks,
                opacity: second.style.opacity,
                translate: detailB.style.translate,
            }
            if ('onscrollend' in window) {
                expectMutation(
                    'ignore scrollend',
                    'L-HAND-2',
                    (o) => {
                        if (o.beforeTracks !== 0)
                            throw new Error(
                                'L-HAND-2: an active scroller handed off'
                            )
                        if (o.beforeOpacity !== '' || o.beforeTranslate !== '')
                            throw new Error(
                                'L-HAND-2: the active handoff drew motion'
                            )
                        if (o.tracks === 0)
                            throw new Error(
                                'L-HAND-2: scrollend did not clear the active state'
                            )
                        if (o.opacity === '' || o.translate === '')
                            throw new Error(
                                'L-HAND-2: no flight after scrollend'
                            )
                    },
                    real,
                    { ...real, tracks: 0, opacity: '', translate: '' }
                )
                details.push('M5 scrollend -> L-HAND-2')
            } else {
                // §5.8/§11.4 S5: without `scrollend` the state is never
                // cleared by time; every handoff out of a scroller that has
                // scrolled degrades the same way. WebKit 26 has no event, so
                // the "ignore scrollend" mutation is indistinguishable there
                // and the normative fallback is asserted instead.
                if (real.beforeTracks !== 0)
                    throw new Error('L-HAND-2: an active scroller handed off')
                if (
                    real.tracks !== 0 ||
                    real.opacity !== '' ||
                    real.translate !== ''
                )
                    throw new Error(
                        'L-HAND-2: no-scrollend fallback did not degrade'
                    )
                details.push(
                    'M5 scrollend -> L-HAND-2 (no scrollend: conservative fallback)'
                )
            }
            h.group.dispose()
            await Promise.all([first, secondRun])
            cardPresence.dispose()
            secondPresence.dispose()
            h.root.remove()
            detailA.remove()
            detailB.remove()
        }

        // 6. skip cleanup on abort -> L-OPS-2
        {
            const h = harness({ motion })
            const card = node(h.root, boxAt(20, 20))
            const presence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(card, { layoutId: 'mut-abort', radius: false })
            h.group.capture()
            await h.group.flush()
            void presence.exit()
            h.group.capture()
            h.group.add(node(h.root, boxAt(360, 40, 300, 200)), {
                layoutId: 'mut-abort',
                radius: false,
            })
            const run = h.group.flush()
            h.mc.frame(16)
            injectLayoutFault('write')
            h.mc.frame(16)
            const report = await run
            const real = {
                status: report.status,
                inert: card.hasAttribute('inert'),
                translate: card.style.translate,
                opacity: card.style.opacity,
                tracks: h.group.stats.tracks,
                clock: h.mc.clock.size,
            }
            expectMutation(
                'skip cleanup on abort',
                'L-OPS-2',
                (o) => {
                    if (o.status !== 'failed')
                        throw new Error(`L-OPS-2: status ${String(o.status)}`)
                    if (o.inert !== false)
                        throw new Error('L-OPS-2: inert not restored')
                    if (o.translate !== '' || o.opacity !== '')
                        throw new Error('L-OPS-2: styles not restored')
                    if (o.tracks !== 0)
                        throw new Error('L-OPS-2: a layout track is left')
                },
                real,
                {
                    ...real,
                    inert: true,
                    translate: '0px 0px',
                    opacity: '1',
                    tracks: 1,
                }
            )
            h.dispose()
            presence.dispose()
            details.push('M6 abort cleanup -> L-OPS-2')
        }

        // 7. release with dt != 0 -> L-SPRING-2
        {
            const h = harness({ motion })
            const card = node(h.root, boxAt(20, 20))
            const presence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(card, { layoutId: 'mut-release', radius: false })
            h.group.capture()
            await h.group.flush()
            const exit = presence.exit()
            h.group.capture()
            const lead = node(h.root, boxAt(360, 40, 300, 200))
            h.group.add(lead, { layoutId: 'mut-release', radius: false })
            const run = h.group.flush()
            let frame = 0
            let fadeFrame = -1
            let releaseFrame = -1
            void exit.then(() => {
                releaseFrame = frame
            })
            for (; frame < 40; ) {
                frame += 1
                h.mc.frame(16)
                await microtasks()
                // the lead gives its opacity back at the fade end (§5.8)
                if (lead.style.opacity === '' && fadeFrame < 0)
                    fadeFrame = frame
                if (releaseFrame >= 0 && fadeFrame >= 0) break
            }
            if (releaseFrame < 0 || fadeFrame < 0) {
                throw new Error(
                    `M7 probe: card ${card.style.opacity} lead ${lead.style.opacity} tracks ${h.group.stats.tracks} release ${releaseFrame} fade ${fadeFrame} clock ${h.mc.clock.size}`
                )
            }
            const report = await run
            const real = {
                status: report.status,
                fadeFrame,
                releaseFrame,
            }
            expectMutation(
                'release with dt != 0',
                'L-SPRING-2',
                (o) => {
                    if (o.fadeFrame === -1 || o.releaseFrame === -1)
                        throw new Error('L-SPRING-2: no fade or release')
                    if (o.releaseFrame !== o.fadeFrame)
                        throw new Error(
                            `L-SPRING-2: released at ${String(o.releaseFrame)}, fade ended at ${String(o.fadeFrame)}`
                        )
                    if (o.status !== 'ended')
                        throw new Error(
                            `L-SPRING-2: status ${String(o.status)}`
                        )
                },
                real,
                { ...real, releaseFrame: real.fadeFrame + 1 }
            )
            h.dispose()
            presence.dispose()
            details.push('M7 release dt -> L-SPRING-2')
        }

        // 8. merge the motion field by field -> L-SPRING-3
        {
            const h = harness({
                motion: { duration: 0.9, timing: timing.linear() },
            })
            const a = node(h.root, boxAt(0, 0))
            h.add(a, {
                motion: { type: 'spring', duration: 0.4 },
                radius: false,
            })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            a.style.left = '200px'
            const run = h.group.flush()
            // 800 ms: the real spring (settle ≈ 690 ms) has ended; a
            // field-merged 0.9 s timing duration still runs
            h.mc.frames(50)
            const report = await run
            const real = {
                status: report.status,
                tracks: h.group.stats.tracks,
                x: viewBox(a).x,
                a: 200,
            }
            expectMutation(
                'merge the motion field by field',
                'L-SPRING-3',
                (o) => {
                    if (o.status !== 'ended')
                        throw new Error(
                            `L-SPRING-3: status ${String(o.status)}`
                        )
                    if (o.tracks !== 0)
                        throw new Error(
                            'L-SPRING-3: the timing duration leaked into the spring'
                        )
                    if (Math.abs((o.x as number) - (o.a as number)) > TOL)
                        throw new Error('L-SPRING-3: not at A')
                },
                real,
                { ...real, tracks: 1 }
            )
            h.dispose()
            details.push('M8 field-by-field motion -> L-SPRING-3')
        }

        return `MUTATION: ${details.join('; ')}`
    } finally {
        diagnostics.stop()
        quiet.restore()
        clearLayoutFaults()
        layoutRuntime.setMode('animate')
    }
}

/* ───────────── adversarial caps and status precedence (browser) ───────────── */

/**
 * The participant and mover caps at their exact boundary, and the status
 * precedence pairs a capped flush can meet: `'disabled'` and `'failed'` must
 * win over `'capped'`, with the styles restored and no read over the cap.
 */
export async function CAPS_STATUS(): Promise<string> {
    const events: LayoutDiagnostic[] = []
    const stop = layoutRuntime.onDiagnostic((event) => events.push(event))
    const quiet = silenceWarnings()
    const details: string[] = []
    try {
        // the participant cap, exactly at it: normal animation
        {
            const h = harness({ motion, maxParticipants: 2 })
            const a = node(h.root, boxAt(0, 0))
            const b = node(h.root, boxAt(100, 0))
            h.add(a)
            h.add(b)
            h.group.capture()
            a.style.left = '40px'
            b.style.left = '140px'
            const run = h.group.flush()
            expectEqual(h.group.stats.tracks, 2, 'at cap: two tracks')
            h.group.finish()
            const report = await run
            expectEqual(report.status, 'ended', 'at cap: status')
            expectEqual(report.snapped.length, 0, 'at cap: snapped')
            expectEqual(a.style.translate, '', 'at cap: a restored')
            expectEqual(b.style.translate, '', 'at cap: b restored')
            h.dispose()
            details.push('participant cap at 2: animates')
        }

        // over the participant cap: no read, capped, styles restored
        {
            const h = harness({ motion, maxParticipants: 2 })
            const a = node(h.root, boxAt(0, 0))
            const b = node(h.root, boxAt(100, 0))
            const c = node(h.root, boxAt(200, 0))
            for (const element of [a, b, c]) h.add(element)
            const before = h.group.stats
            h.group.capture()
            const captured = h.group.stats
            expectEqual(captured.rects, before.rects, 'over cap: capture rects')
            expectEqual(
                captured.styles,
                before.styles,
                'over cap: capture styles'
            )
            a.style.left = '40px'
            b.style.left = '140px'
            c.style.left = '240px'
            const report = await h.group.flush()
            const after = h.group.stats
            expectEqual(report.status, 'capped', 'over cap: status')
            expectEqual(report.snapped.length, 3, 'over cap: every participant')
            expectEqual(after.reads, before.reads, 'over cap: no read')
            expectEqual(a.style.translate, '', 'over cap: a restored')
            expectEqual(b.style.translate, '', 'over cap: b restored')
            expectEqual(c.style.translate, '', 'over cap: c restored')
            expectEqual(
                events.filter((event) => event.code === 'participant-cap')
                    .length,
                1,
                'over cap: participant-cap'
            )
            h.dispose()
            details.push('participant cap over 2: capped, zero reads')
        }

        // `'disabled'` precedes `'capped'`
        {
            layoutRuntime.setMode('snap')
            const h = harness({ motion, maxParticipants: 2 })
            const a = node(h.root, boxAt(0, 0))
            const b = node(h.root, boxAt(100, 0))
            const c = node(h.root, boxAt(200, 0))
            for (const element of [a, b, c]) h.add(element)
            h.group.capture()
            a.style.left = '40px'
            b.style.left = '140px'
            c.style.left = '240px'
            const report = await h.group.flush()
            expectEqual(
                report.status,
                'disabled',
                'disabled over capped: status'
            )
            expectEqual(
                report.snapped.map((entry) => entry.reason),
                ['disabled', 'disabled', 'disabled'],
                'disabled over capped: reasons'
            )
            expectEqual(
                events.filter((event) => event.code === 'runtime-disabled')
                    .length,
                1,
                'disabled over capped: runtime-disabled'
            )
            h.dispose()
            layoutRuntime.setMode('animate')
            details.push('disabled precedes capped')
        }

        // an engine fault in a capped flush: `'failed'` precedes `'capped'`
        {
            const h = harness({ motion, maxParticipants: 2 })
            const a = node(h.root, boxAt(0, 0))
            const b = node(h.root, boxAt(100, 0))
            const c = node(h.root, boxAt(200, 0))
            for (const element of [a, b, c]) h.add(element)
            h.group.capture()
            a.style.left = '40px'
            b.style.left = '140px'
            c.style.left = '240px'
            injectLayoutFault('write')
            const report = await h.group.flush()
            expectEqual(report.status, 'failed', 'fault over capped: status')
            expectEqual(
                report.snapped.map((entry) => entry.reason),
                ['failed', 'failed', 'failed'],
                'fault over capped: reasons'
            )
            for (const element of [a, b, c]) {
                for (const property of [
                    'translate',
                    'scale',
                    'opacity',
                ] as const) {
                    expectEqual(
                        element.style.getPropertyValue(property),
                        '',
                        `fault over capped: ${property} restored`
                    )
                }
            }
            expectEqual(
                h.mc.clock.size,
                0,
                'fault over capped: no subscription'
            )
            h.dispose()
            clearLayoutFaults()
            details.push('failed precedes capped')
        }

        // the mover cap at its boundary
        {
            const h = harness({ motion, maxNodes: 1 })
            const a = node(h.root, boxAt(0, 0))
            h.add(a)
            h.group.capture()
            a.style.left = '40px'
            const run = h.group.flush()
            expectEqual(h.group.stats.tracks, 1, 'mover cap at 1: a track')
            h.group.finish()
            expectEqual((await run).status, 'ended', 'mover cap at 1: status')
            await h.group.flush()
            h.dispose()
            details.push('mover cap at 1: animates')
        }
        {
            const h = harness({ motion, maxNodes: 1 })
            const a = node(h.root, boxAt(0, 0))
            const b = node(h.root, boxAt(100, 0))
            h.add(a)
            h.add(b)
            h.group.capture()
            a.style.left = '40px'
            b.style.left = '140px'
            const report = await h.group.flush()
            expectEqual(report.status, 'capped', 'mover cap over 1: status')
            expectEqual(a.style.translate, '', 'mover cap over 1: a restored')
            expectEqual(b.style.translate, '', 'mover cap over 1: b restored')
            expectEqual(
                events.filter((event) => event.code === 'mover-cap').length,
                1,
                'mover cap over 1: mover-cap'
            )
            h.dispose()
            details.push('mover cap over 1: capped')
        }
        return `CAPS_STATUS: ${details.join('; ')}`
    } finally {
        stop()
        quiet.restore()
        clearLayoutFaults()
        layoutRuntime.setMode('animate')
    }
}
