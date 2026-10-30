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
    type LayoutGroup as LayoutGroupType,
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
    readonly group: LayoutGroupType
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
            const focus = events.filter(
                (e) => e.code === 'focus-in-follower' && e.element === card
            )
            expectEqual(focus.length, 1, 'focus diagnostic count')
            expectEqual(focus[0]!.action, 'none', 'focus diagnostic action')
            const leadBox = viewBox(detail)
            expectClose(leadBox.x, 360, TOL, 'lead at A x')
            expectClose(leadBox.y, 40, TOL, 'lead at A y')
            expectClose(leadBox.w, 300, TOL, 'lead at A w')
            expectClose(leadBox.h, 200, TOL, 'lead at A h')
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

        // H12-05: focus through two nested closed shadow roots
        {
            const h = harness({ motion })
            const outer = document.createElement('div')
            outer.style.cssText =
                'position: absolute; left: 20px; top: 20px; width: 300px; height: 160px;'
            h.root.append(outer)
            const outerRoot = outer.attachShadow({ mode: 'closed' })
            const innerHost = document.createElement('div')
            outerRoot.append(innerHost)
            const innerRoot = innerHost.attachShadow({ mode: 'closed' })
            const follower = document.createElement('div')
            follower.style.cssText =
                'position: absolute; left: 30px; top: 20px; width: 80px; height: 80px; background: #345;'
            const button = document.createElement('button')
            follower.append(button)
            innerRoot.append(follower)
            button.focus()
            expectEqual(document.activeElement, outer, 'nested host focused')
            const presence = createPresence(follower, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(follower, { layoutId: 'a11y-nested', radius: false })
            h.group.capture()
            await h.group.flush()
            void presence.exit()
            h.group.capture()
            h.group.add(node(h.root, boxAt(500, 40, 300, 200)), {
                layoutId: 'a11y-nested',
                radius: false,
            })
            const run = h.group.flush()
            expectEqual(
                follower.hasAttribute('inert'),
                false,
                'nested no inert'
            )
            expectEqual(document.activeElement, outer, 'nested focus kept')
            const focus = events.filter(
                (e) => e.code === 'focus-in-follower' && e.element === follower
            )
            expectEqual(focus.length, 1, 'nested focus diagnostic')
            expectEqual(focus[0]!.action, 'none', 'nested focus action')
            h.mc.frames(3)
            expectEqual(document.activeElement, outer, 'nested focus on frames')
            h.group.dispose()
            await run
            presence.dispose()
            h.root.remove()
            details.push('focus through two nested closed shadow roots')
        }

        // H12-04: focus inside a continuing live follower ends the pair; the
        // follower exits under presence alone and no live fade stays
        {
            const h = harness({ motion })
            const card = node(h.root, boxAt(20, 20))
            const button = document.createElement('button')
            card.append(button)
            const presence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(card, { layoutId: 'a11y-continuing', radius: false })
            h.group.capture()
            await h.group.flush()
            void presence.exit()
            h.group.capture()
            const detail = node(h.root, boxAt(360, 40, 300, 200))
            h.group.add(detail, { layoutId: 'a11y-continuing', radius: false })
            const first = h.group.flush()
            h.mc.frames(2)
            expectEqual(card.hasAttribute('inert'), true, 'continuing inert')
            card.removeAttribute('inert')
            button.focus()
            expectEqual(document.activeElement, button, 'continuing focus')
            h.group.capture()
            const again = h.group.flush()
            expectEqual(
                card.hasAttribute('inert'),
                false,
                'continuing not re-inerted'
            )
            expectEqual(document.activeElement, button, 'continuing focus kept')
            expectEqual(card.style.opacity, '', 'continuing follower opacity')
            expectEqual(detail.style.opacity, '', 'continuing lead opacity')
            expectEqual(card.style.translate, '', 'continuing follower pose')
            const focus = events.filter(
                (e) => e.code === 'focus-in-follower' && e.element === card
            )
            expectEqual(focus.length, 1, 'continuing focus diagnostic')
            expectEqual(focus[0]!.action, 'none', 'continuing focus action')
            h.mc.frames(30)
            expectEqual(
                document.activeElement,
                button,
                'continuing focus settled'
            )
            expectEqual(
                card.hasAttribute('inert'),
                false,
                'continuing settled inert'
            )
            expectEqual(detail.style.opacity, '', 'continuing settled opacity')
            const leadBox = viewBox(detail)
            expectClose(leadBox.x, 360, TOL, 'continuing lead A x')
            expectClose(leadBox.y, 40, TOL, 'continuing lead A y')
            expectEqual(h.group.stats.tracks, 0, 'continuing no live track')
            h.group.dispose()
            await Promise.all([first, again])
            presence.dispose()
            h.root.remove()
            details.push('continuing follower focus: pair ended, focus kept')
        }

        // H12-04: a held invisible follower with focus inside is settled too
        {
            const h = harness({ motion })
            const card = node(h.root, boxAt(20, 20))
            const button = document.createElement('button')
            card.append(button)
            const presence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(card, { layoutId: 'a11y-held', radius: false })
            h.group.capture()
            await h.group.flush()
            void presence.exit()
            h.group.capture()
            const detail = node(h.root, boxAt(360, 40, 300, 200))
            h.group.add(detail, { layoutId: 'a11y-held', radius: false })
            const first = h.group.flush()
            h.mc.frames(26)
            expectEqual(card.style.opacity, '0', 'held follower invisible')
            expectEqual(card.hasAttribute('inert'), true, 'held follower inert')
            card.removeAttribute('inert')
            button.focus()
            expectEqual(document.activeElement, button, 'held focus')
            h.group.capture()
            const again = h.group.flush()
            expectEqual(
                card.style.opacity,
                '',
                'held follower opacity restored'
            )
            expectEqual(
                card.hasAttribute('inert'),
                false,
                'held follower inert gone'
            )
            expectEqual(document.activeElement, button, 'held focus kept')
            const focus = events.filter(
                (e) => e.code === 'focus-in-follower' && e.element === card
            )
            expectEqual(focus.length, 1, 'held focus diagnostic')
            h.mc.frames(2)
            expectClose(viewBox(detail).x, 360, TOL, 'held lead A')
            h.group.dispose()
            await Promise.all([first, again])
            presence.dispose()
            h.root.remove()
            details.push('held invisible follower focus: settled, focus kept')
        }

        // H12-03: a held old follower becomes the focus-skipped new lead
        // under an animating participant ancestor
        {
            const h = harness({ motion })
            const panel = node(h.root, boxAt(0, 0, 700, 500))
            h.group.add(panel, { radius: false })
            const card = node(panel, boxAt(20, 20))
            const cardPresence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(card, { layoutId: 'a11y-held-lead', radius: false })
            h.group.capture()
            await h.group.flush()
            void cardPresence.exit()
            h.group.capture()
            const detail = node(panel, boxAt(360, 40, 300, 200))
            const detailPresence = createPresence(detail, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(detail, { layoutId: 'a11y-held-lead', radius: false })
            const first = h.group.flush()
            h.mc.frames(26)
            expectEqual(card.style.opacity, '0', 'held-lead: held invisible')
            expectEqual(card.hasAttribute('inert'), true, 'held-lead: inert')
            const button = document.createElement('button')
            detail.append(button)
            button.focus()
            void cardPresence.enter()
            void detailPresence.exit()
            h.group.capture()
            panel.style.left = '200px'
            const reverse = h.group.flush()
            expectEqual(card.style.opacity, '', 'held-lead: opacity restored')
            expectEqual(
                card.hasAttribute('inert'),
                false,
                'held-lead: no inert'
            )
            expectEqual(document.activeElement, button, 'held-lead: focus kept')
            const focus = events.filter(
                (e) => e.code === 'focus-in-follower' && e.element === detail
            )
            expectEqual(focus.length, 1, 'held-lead: focus diagnostic')
            expectEqual(focus[0]!.action, 'none', 'held-lead: action none')
            h.mc.frames(30)
            expectClose(viewBox(card).x, 220, TOL, 'held-lead: card at A')
            expectClose(viewBox(detail).x, 560, TOL, 'held-lead: detail at A')
            expectEqual(
                document.activeElement,
                button,
                'held-lead: focus settled'
            )
            h.group.dispose()
            await Promise.all([first, reverse])
            cardPresence.dispose()
            detailPresence.dispose()
            h.root.remove()
            details.push(
                'held follower -> focus-skipped lead under a moving ancestor'
            )
        }

        // H12-21: authored inert present/absent through reversal, abort and
        // dispose (unmount is covered by the #6 blocks above)
        {
            for (const authored of [null, 'authored'] as const) {
                for (const action of [
                    'reversal',
                    'abort',
                    'dispose',
                ] as const) {
                    const h = harness({ motion })
                    const id = `a11y-matrix-${authored ?? 'absent'}-${action}`
                    const card = node(h.root, boxAt(20, 20))
                    if (authored !== null) card.setAttribute('inert', authored)
                    const cardPresence = createPresence(card, a11yPresence, {
                        clock: h.mc.clock,
                    })
                    h.group.add(card, { layoutId: id, radius: false })
                    h.group.capture()
                    await h.group.flush()
                    void cardPresence.exit()
                    h.group.capture()
                    const detail = node(h.root, boxAt(360, 40, 300, 200))
                    const detailPresence = createPresence(
                        detail,
                        a11yPresence,
                        {
                            clock: h.mc.clock,
                        }
                    )
                    const removeDetail = h.group.add(detail, {
                        layoutId: id,
                        radius: false,
                    })
                    const first = h.group.flush()
                    h.mc.frames(2)
                    if (action === 'reversal') {
                        void cardPresence.enter()
                        void detailPresence.exit()
                        h.group.capture()
                        const second = h.group.flush()
                        expectEqual(
                            card.getAttribute('inert'),
                            authored,
                            `matrix ${authored ?? 'absent'} reversal card`
                        )
                        expectEqual(
                            detail.getAttribute('inert'),
                            '',
                            `matrix ${authored ?? 'absent'} reversal detail`
                        )
                        h.group.dispose()
                        await Promise.all([first, second])
                    } else if (action === 'abort') {
                        h.mc.frame(16)
                        injectLayoutFault('write')
                        h.mc.frame(16)
                        const report = await first
                        expectEqual(
                            report.status,
                            'failed',
                            'matrix abort status'
                        )
                        expectEqual(
                            card.getAttribute('inert'),
                            authored,
                            `matrix ${authored ?? 'absent'} abort card`
                        )
                        expectEqual(
                            detail.getAttribute('inert'),
                            null,
                            `matrix ${authored ?? 'absent'} abort detail`
                        )
                        for (const element of [card, detail]) {
                            for (const property of [
                                'translate',
                                'scale',
                                'opacity',
                            ] as const) {
                                expectEqual(
                                    element.style.getPropertyValue(property),
                                    '',
                                    `matrix abort ${property}`
                                )
                            }
                        }
                        h.group.dispose()
                    } else {
                        h.mc.frame(16)
                        h.group.dispose()
                        expectEqual(
                            card.getAttribute('inert'),
                            authored,
                            `matrix ${authored ?? 'absent'} dispose card`
                        )
                        expectEqual(
                            detail.getAttribute('inert'),
                            null,
                            `matrix ${authored ?? 'absent'} dispose detail`
                        )
                        await first
                    }
                    removeDetail()
                    detail.remove()
                    cardPresence.dispose()
                    detailPresence.dispose()
                    h.root.remove()
                }
            }
            details.push(
                'authored inert present/absent through reversal, abort, dispose'
            )
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
    /** Writes per document: C6 scopes the read-after-write rule per document. */
    readonly writes: Map<Document, number>
    violation: string | null
    properties: string[]
    attributes: string[]
}

interface FuzzBox {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
}

let fuzzBatch: FuzzBatch | null = null
/** What the engine wrote during the current event, per property/attribute. */
let fuzzSink: { property?: string; attribute?: string }[] | null = null
/** A style declaration's element, for per-document write accounting. */
const fuzzOwners = new WeakMap<CSSStyleDeclaration, HTMLElement>()

function fuzzDocument(value: Element | Document | null): Document {
    if (value !== null && value.nodeType === 9) return value as Document
    return (value as Element | null)?.ownerDocument ?? document
}

function fuzzRead(value: Element | Document | null, what: string): void {
    if (!fuzzBatch) return
    const doc = fuzzDocument(value)
    if ((fuzzBatch.writes.get(doc) ?? 0) === 0) return
    if (fuzzBatch.violation === null) fuzzBatch.violation = what
}

function fuzzWrite(value: Element | null, property?: string): void {
    if (!fuzzBatch) return
    const doc = value?.ownerDocument ?? document
    fuzzBatch.writes.set(doc, (fuzzBatch.writes.get(doc) ?? 0) + 1)
    if (property !== undefined) fuzzBatch.properties.push(property)
}

function fuzzAttribute(value: Element, name: string): void {
    fuzzWrite(value)
    if (fuzzBatch) fuzzBatch.attributes.push(name)
}

function fuzzRun<T>(work: () => T): T {
    fuzzBatch = {
        writes: new Map(),
        violation: null,
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
            `a ${batch.violation} read followed a write in the same document`
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
        fuzzRead(this, 'rect')
        return rect.call(this)
    }
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        get(this: HTMLElement) {
            fuzzRead(this, 'offsetWidth')
            return offsetWidth.get!.call(this)
        },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get(this: HTMLElement) {
            fuzzRead(this, 'offsetHeight')
            return offsetHeight.get!.call(this)
        },
    })
    window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
        fuzzRead(element, 'computed style')
        return computed(element, pseudo)
    }) as typeof window.getComputedStyle
    CSSStyleDeclaration.prototype.setProperty = function (
        property: string,
        value: string | null,
        priority?: string
    ) {
        fuzzWrite(fuzzOwners.get(this) ?? null, property)
        return setProperty.call(this, property, value, priority)
    }
    CSSStyleDeclaration.prototype.removeProperty = function (property: string) {
        fuzzWrite(fuzzOwners.get(this) ?? null, property)
        return removeProperty.call(this, property)
    }
    Element.prototype.setAttribute = function (name: string, value: string) {
        fuzzAttribute(this, name)
        return setAttribute.call(this, name, value)
    }
    Element.prototype.removeAttribute = function (name: string) {
        fuzzAttribute(this, name)
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
const FUZZ_SHARED = 'fuzz-card'

function fuzzBox(element: HTMLElement): FuzzBox {
    const box = viewBox(element)
    return { x: box.x, y: box.y, w: box.w, h: box.h }
}

function sameFuzzBox(a: FuzzBox, b: FuzzBox): boolean {
    return (
        Math.abs(a.x - b.x) <= FUZZ_TOL &&
        Math.abs(a.y - b.y) <= FUZZ_TOL &&
        Math.abs(a.w - b.w) <= FUZZ_TOL &&
        Math.abs(a.h - b.h) <= FUZZ_TOL
    )
}

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
 * FUZZ (§11.3, C6): the seeded lifecycle model on real DOM in Chromium and
 * WebKit. The B property is per node: its own fresh capture, its shared
 * partner's capture for a handoff/follow, its retained departing box, or the
 * flush's reported snap. Read-after-write is checked per document. This browser
 * suite is the model fuzz; the old unit fuzz was removed because its
 * any-history B predicate was vacuous.
 */
export async function FUZZ(): Promise<string> {
    const seeds = [
        11, 23, 37, 41, 53, 67, 79, 83, 97, 101, 113, 127, 131, 149, 157, 173,
    ]
    const quiet = silenceWarnings()
    const restoreInstrument = instrumentFuzz()
    const scrolls = watchScrollListeners()
    const diagnostics: LayoutDiagnostic[] = []
    const stopDiagnostics = layoutRuntime.onDiagnostic((event) =>
        diagnostics.push(event)
    )
    let passed = 0
    try {
        for (const seed of seeds) {
            diagnostics.length = 0
            const random = fuzzSeed(seed)
            const h = harness({ motion })
            const authored = new Map<
                HTMLElement,
                { style: string; inert: string | null }
            >()
            const reports: Promise<LayoutReport>[] = []
            const exits: Promise<unknown>[] = []
            const enters: Promise<unknown>[] = []
            const a = node(h.root, boxAt(0, 0))
            const b = node(h.root, boxAt(200, 0))
            const scroller = node(h.root, boxAt(0, 300, 500, 200))
            scroller.style.overflow = 'auto'
            const card = node(scroller, boxAt(20, 20))
            const detail = node(document.body, boxAt(600, 40, 300, 200))
            const button = document.createElement('button')
            b.append(button)
            button.focus()
            for (const element of [a, b, card, scroller, detail]) {
                fuzzOwners.set(element.style, element)
                authored.set(element, {
                    style: element.style.cssText,
                    inert: element.getAttribute('inert'),
                })
            }
            const cardPresence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            let detailPresence: ReturnType<typeof createPresence> | null = null
            let cardExiting = false
            let detailPresent = false
            let hidden = false
            let adopted = false
            let removeDetail: (() => void) | null = null
            const retained = new Map<string, FuzzBox>()
            const log: string[] = []
            const observations: {
                readonly element: HTMLElement
                readonly allowed: readonly FuzzBox[]
                readonly box: FuzzBox
                readonly report: Promise<LayoutReport>
            }[] = []
            let activeCapture: {
                readonly boxes: Map<HTMLElement, FuzzBox>
                aged: boolean
            } | null = null

            const removeA = h.group.add(a, { radius: false })
            h.group.add(b, { radius: false })
            const removeCard = h.group.add(card, {
                layoutId: FUZZ_SHARED,
                radius: false,
            })

            const drawn = (): Map<HTMLElement, FuzzBox> => {
                const boxes = new Map<HTMLElement, FuzzBox>()
                for (const element of [a, b, card, detail]) {
                    if (!element.isConnected) continue
                    if (element === a && adopted) continue
                    boxes.set(element, fuzzBox(element))
                }
                return boxes
            }
            const capture = (): void => {
                const count = h.group.stats.captures
                fuzzRun(() => h.group.capture())
                if (h.group.stats.captures === count) return
                activeCapture = { boxes: drawn(), aged: false }
            }
            const frame = (ms = 16): void => {
                fuzzRun(() => h.mc.frame(ms))
                if (activeCapture) activeCapture.aged = true
            }
            const isShared = (element: HTMLElement): boolean =>
                element === card || element === detail
            const partnerOf = (element: HTMLElement): HTMLElement | null => {
                if (element === card) return detail
                if (element === detail) return card
                return null
            }
            const allowedBoxes = (
                element: HTMLElement,
                captureAt: typeof activeCapture
            ): FuzzBox[] => {
                const allowed: FuzzBox[] = []
                const fresh = captureAt !== null && !captureAt.aged
                const retainedBox = retained.get(FUZZ_SHARED)
                if (fresh) {
                    const own = captureAt!.boxes.get(element)
                    if (own) allowed.push(own)
                    if (isShared(element)) {
                        // Both pair boxes are valid in different roles: a
                        // continuing follower draws at the lead's capture; a
                        // new handoff draws at the departing follower's
                        // capture. Anything outside the pair is not a B.
                        const partner = partnerOf(element)
                        const box = partner
                            ? captureAt!.boxes.get(partner)
                            : undefined
                        if (box) allowed.push(box)
                    }
                }
                // a retained departing box is the only B of a retained
                // handoff when the capture supplies none
                if (allowed.length === 0 && retainedBox && isShared(element)) {
                    allowed.push(retainedBox)
                }
                return allowed
            }
            const flush = (): Promise<LayoutReport> => {
                const captureAt = activeCapture
                activeCapture = null
                const fresh = captureAt !== null && !captureAt.aged
                const beforeStyles = new Map<HTMLElement, Map<string, string>>()
                for (const element of [a, b, card, detail]) {
                    beforeStyles.set(element, fuzzStyle(element))
                }
                const report = fuzzRun(() => h.group.flush())
                reports.push(report)
                for (const element of [a, b, card, detail]) {
                    const before = beforeStyles.get(element)!
                    const oldTranslate = before.get('translate') ?? ''
                    const translate = element.style.translate
                    if (translate === '' || translate === oldTranslate) continue
                    if (
                        translate === '0px 0px' &&
                        (element.style.scale === '1 1' ||
                            element.style.scale === '')
                    ) {
                        continue
                    }
                    if (!fresh && oldTranslate !== '') continue
                    const box = fuzzBox(element)
                    const allowed = allowedBoxes(element, captureAt)
                    if (
                        allowed.some((candidate) => sameFuzzBox(candidate, box))
                    )
                        continue
                    observations.push({
                        element,
                        allowed,
                        box,
                        report,
                    })
                }
                return report
            }
            const layoutOwnedRestored = (): void => {
                for (const element of [a, b, card, detail]) {
                    if (element === a && adopted) continue
                    for (const property of [
                        'translate',
                        'scale',
                        'opacity',
                        'border-top-left-radius',
                        'border-top-right-radius',
                        'border-bottom-right-radius',
                        'border-bottom-left-radius',
                        'overflow-anchor',
                    ] as const) {
                        const probe = document.createElement('div')
                        probe.style.cssText = authored.get(element)!.style
                        const wanted = probe.style.getPropertyValue(property)
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
            }
            const lastDiagnostic = (
                code: string
            ): LayoutDiagnostic | undefined =>
                diagnostics.filter((event) => event.code === code).at(-1)

            capture()
            await flush()
            const eventCount = 10 + (seed % 5)
            try {
                for (let step = 0; step < eventCount; step++) {
                    const before = new Map<HTMLElement, Map<string, string>>()
                    for (const element of [a, b, card, detail]) {
                        before.set(element, fuzzStyle(element))
                    }
                    fuzzSink = []
                    let pick = -1
                    try {
                        pick = random()
                        if (pick < 0.14) {
                            capture()
                        } else if (pick < 0.26) {
                            frame()
                        } else if (pick < 0.4) {
                            capture()
                            fuzzRun(() => {
                                const x = Math.round(random() * 260)
                                const y = Math.round(random() * 120)
                                a.style.left = `${x}px`
                                a.style.top = `${y}px`
                                b.style.left = `${260 - x}px`
                                b.style.top = `${y}px`
                            })
                            void flush()
                        } else if (pick < 0.48) {
                            capture()
                            fuzzRun(() => {
                                if (!adopted)
                                    a.style.left = `${Math.round(random() * 260)}px`
                                frame()
                            })
                            void flush()
                        } else if (pick < 0.54) {
                            fuzzRun(() => {
                                if (adopted) return
                                if (a.isConnected) a.remove()
                                else h.root.append(a)
                            })
                            void flush()
                        } else if (pick < 0.64) {
                            if (!cardExiting && card.isConnected) {
                                cardExiting = true
                                const exit = cardPresence.exit()
                                exits.push(exit)
                                void exit.then((result) => {
                                    if (
                                        (result === 'exited' ||
                                            result === 'timeout') &&
                                        card.isConnected
                                    ) {
                                        retained.set(FUZZ_SHARED, fuzzBox(card))
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
                                        layoutId: FUZZ_SHARED,
                                        radius: false,
                                    })
                                    detailPresent = true
                                }
                                void flush()
                            } else if (card.isConnected) {
                                cardExiting = false
                                enters.push(cardPresence.enter())
                                if (detailPresent) {
                                    const exit = detailPresence!.exit()
                                    exits.push(exit)
                                    retained.set(FUZZ_SHARED, fuzzBox(detail))
                                }
                                capture()
                                void flush()
                                if (detailPresent) {
                                    removeDetail?.()
                                    removeDetail = null
                                    detailPresent = false
                                    detail.remove()
                                    detailPresence?.dispose()
                                    detailPresence = null
                                }
                            }
                        } else if (pick < 0.69) {
                            capture()
                            fuzzRun(() =>
                                h.group.set(adopted ? b : a, {
                                    radius: false,
                                    layoutKey: String(Math.round(random() * 3)),
                                })
                            )
                            void flush()
                        } else if (pick < 0.77) {
                            // H12-12: the exiting card is inside the scroller,
                            // the new lead outside; the handoff must degrade
                            if (detailPresent) {
                                removeDetail?.()
                                removeDetail = null
                                detailPresent = false
                                detail.remove()
                                detailPresence?.dispose()
                                detailPresence = null
                            }
                            if (cardExiting) {
                                enters.push(cardPresence.enter())
                                cardExiting = false
                                capture()
                                void flush()
                            }
                            if (card.isConnected) {
                                cardExiting = true
                                const exit = cardPresence.exit()
                                exits.push(exit)
                                void exit.then((result) => {
                                    if (
                                        (result === 'exited' ||
                                            result === 'timeout') &&
                                        card.isConnected
                                    ) {
                                        retained.set(FUZZ_SHARED, fuzzBox(card))
                                        cardExiting = false
                                        removeCard()
                                        card.remove()
                                    }
                                })
                                fuzzRun(() =>
                                    scroller.dispatchEvent(new Event('scroll'))
                                )
                                capture()
                                document.body.append(detail)
                                detailPresence = createPresence(
                                    detail,
                                    a11yPresence,
                                    { clock: h.mc.clock }
                                )
                                removeDetail = h.group.add(detail, {
                                    layoutId: FUZZ_SHARED,
                                    radius: false,
                                })
                                detailPresent = true
                                void flush()
                                if (detail.style.translate !== '') {
                                    throw new Error(
                                        'handoff-scroll-active drew motion'
                                    )
                                }
                                const event = lastDiagnostic(
                                    'handoff-scroll-active'
                                )
                                if (event?.element !== detail) {
                                    throw new Error(
                                        'handoff-scroll-active not reported'
                                    )
                                }
                                if ('onscrollend' in window) {
                                    fuzzRun(() =>
                                        scroller.dispatchEvent(
                                            new Event('scrollend')
                                        )
                                    )
                                }
                            }
                        } else if (pick < 0.82) {
                            // H12-11: reduced motion has an exact outcome
                            h.mc.setReducedMotion(true)
                            capture()
                            fuzzRun(() => {
                                b.style.left =
                                    b.style.left === '40px' ? '220px' : '40px'
                            })
                            const report = await flush()
                            if (report.status !== 'reduced') {
                                throw new Error(
                                    `reduced status ${report.status}`
                                )
                            }
                            if (
                                !report.snapped.some(
                                    (entry) => entry.reason === 'reduced'
                                )
                            ) {
                                throw new Error('reduced not snapped')
                            }
                            for (const element of [a, b]) {
                                for (const property of [
                                    'translate',
                                    'scale',
                                    'opacity',
                                ] as const) {
                                    const probe = document.createElement('div')
                                    probe.style.cssText =
                                        authored.get(element)!.style
                                    if (
                                        element.style.getPropertyValue(
                                            property
                                        ) !==
                                        probe.style.getPropertyValue(property)
                                    ) {
                                        throw new Error(
                                            `reduced did not restore ${property}`
                                        )
                                    }
                                }
                            }
                            // §9.4: a crossfade finished by 'jump' leaves the
                            // exiting follower held at 0 and inert
                            if (cardExiting && card.hasAttribute('inert')) {
                                if (card.style.opacity !== '0') {
                                    throw new Error(
                                        'reduced held follower is not at 0'
                                    )
                                }
                            } else if (card.isConnected) {
                                for (const property of [
                                    'translate',
                                    'scale',
                                    'opacity',
                                ] as const) {
                                    const probe = document.createElement('div')
                                    probe.style.cssText =
                                        authored.get(card)!.style
                                    if (
                                        card.style.getPropertyValue(
                                            property
                                        ) !==
                                        probe.style.getPropertyValue(property)
                                    ) {
                                        throw new Error(
                                            `reduced did not restore card ${property}`
                                        )
                                    }
                                }
                            }
                            h.mc.setReducedMotion(false)
                        } else if (pick < 0.86) {
                            // H12-11: the kill switch resolves disabled
                            if (detailPresent) {
                                removeDetail?.()
                                removeDetail = null
                                detailPresent = false
                                detail.remove()
                                detailPresence?.dispose()
                                detailPresence = null
                            }
                            if (cardExiting) {
                                enters.push(cardPresence.enter())
                                cardExiting = false
                            }
                            capture()
                            fuzzRun(() => {
                                b.style.left =
                                    b.style.left === '40px' ? '220px' : '40px'
                            })
                            const run = flush()
                            frame()
                            layoutRuntime.setMode('snap')
                            const report = await run
                            layoutRuntime.setMode('animate')
                            if (report.status !== 'disabled') {
                                throw new Error(
                                    `disabled status ${report.status}`
                                )
                            }
                            if (
                                report.snapped.length === 0 ||
                                !report.snapped.every(
                                    (entry) => entry.reason === 'disabled'
                                )
                            ) {
                                throw new Error(
                                    'disabled report is not exactly disabled'
                                )
                            }
                            const event = lastDiagnostic('runtime-disabled')
                            if (event?.action !== 'snap') {
                                throw new Error('runtime-disabled missing')
                            }
                            layoutOwnedRestored()
                        } else if (pick < 0.9) {
                            hidden = !hidden
                            h.mc.setHidden(hidden)
                            frame()
                        } else if (pick < 0.95) {
                            // H12-11: an injected engine fault is failed and
                            // byte-identical, including the follower inert
                            capture()
                            fuzzRun(() => {
                                b.style.left =
                                    b.style.left === '40px' ? '220px' : '40px'
                            })
                            injectLayoutFault(
                                random() < 0.5 ? 'measure' : 'write'
                            )
                            const report = await flush()
                            clearLayoutFaults()
                            if (report.status !== 'failed') {
                                throw new Error(`fault status ${report.status}`)
                            }
                            if (
                                report.snapped.length === 0 ||
                                !report.snapped.every(
                                    (entry) => entry.reason === 'failed'
                                )
                            ) {
                                throw new Error(
                                    'failed report is not exactly failed'
                                )
                            }
                            if (
                                lastDiagnostic('internal-error')?.action !==
                                'abort'
                            ) {
                                throw new Error('internal-error missing')
                            }
                            if (h.group.stats.tracks !== 0) {
                                throw new Error('a track survived the abort')
                            }
                            layoutOwnedRestored()
                        } else if (pick < 0.97) {
                            frame()
                        } else if (adopted) {
                            frame()
                        } else {
                            adopted = true
                            fuzzRun(() => {
                                const other =
                                    document.implementation.createHTMLDocument(
                                        'fuzz'
                                    )
                                other.adoptNode(a)
                                other.body.append(a)
                                h.group.capture()
                            })
                            activeCapture = null
                            void flush()
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
                        `${step}:${pick.toFixed(3)} card=${cardPresence.phase} opacity=${card.style.opacity || '-'} inert=${card.hasAttribute('inert')}`
                    )
                    await microtasks()
                    // H12-13: when nothing is moving or holding, layout owns
                    // no inline declaration or inert attribute
                    if (
                        h.group.stats.tracks === 0 &&
                        cardPresence.phase !== 'exiting' &&
                        cardPresence.phase !== 'entering' &&
                        detailPresence?.phase !== 'exiting' &&
                        detailPresence?.phase !== 'entering'
                    ) {
                        layoutOwnedRestored()
                    }
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
                for (const observation of observations) {
                    if (
                        observation.allowed.some((candidate) =>
                            sameFuzzBox(candidate, observation.box)
                        )
                    ) {
                        continue
                    }
                    const report = await observation.report
                    if (
                        !report.snapped.some(
                            (entry) => entry.element === observation.element
                        )
                    ) {
                        throw new Error(
                            `B is not a capture box and the node is not reported snapped: ${JSON.stringify(observation.box)} allowed ${JSON.stringify(observation.allowed)}`
                        )
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
                frame()
                if (h.mc.clock.size !== 0) throw new Error('clock subscription')
                if (h.mc.pending !== 0) throw new Error('frame request')
                if (h.group.stats.tracks !== 0) throw new Error('track left')
                layoutOwnedRestored()
                passed += 1
            } catch (error) {
                throw new Error(
                    `seed ${seed}: ${error instanceof Error ? error.message : String(error)}\nlog ${log.slice(-10).join(' | ')}`
                )
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
        // negative control for the per-document read/write rule (C6/H12-09)
        try {
            fuzzRun(() => {
                document.body.style.setProperty('translate', '0px', 'important')
                document.body.getBoundingClientRect()
            })
            throw new Error('a same-document read after a write was not caught')
        } catch (error) {
            if (
                !(error instanceof Error) ||
                !error.message.includes('same document')
            ) {
                throw error
            }
        }
        {
            const foreignDoc =
                document.implementation.createHTMLDocument('fuzz-foreign')
            const foreign = foreignDoc.createElement('div')
            foreignDoc.body.append(foreign)
            fuzzOwners.set(foreign.style, foreign)
            fuzzRun(() => {
                foreign.style.setProperty('translate', '0px', 'important')
                document.body.getBoundingClientRect()
            })
        }
        // direct B-predicate control: a predicted A box is not the captured B
        {
            const captured = { x: 0, y: 0, w: 80, h: 80 }
            const predicted = { x: 120, y: 0, w: 80, h: 80 }
            if (
                !sameFuzzBox(captured, captured) ||
                sameFuzzBox(captured, predicted)
            ) {
                throw new Error('B predicate accepted a predicted box')
            }
        }
        if (scrolls.added !== scrolls.removed) {
            throw new Error(
                `scroll listeners leaked: ${scrolls.added} added, ${scrolls.removed} removed`
            )
        }
        return `FUZZ: ${passed} seeds × 10–14 events; per-node B, per-document read/write, owned properties, exact fault/disabled/reduced outcomes, handoff-scroll degradation, every report and handle terminal, styles/inert restored`
    } finally {
        stopDiagnostics()
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
 * MUTATION (§11.3): deliberately wrong decisions at the row's observation
 * boundary. M2/M3/M5/M6 are real engine runs with a mutated clock, capture or
 * capability input; M1 is an explicit checker control that feeds the aged B;
 * M4/M8 are labelled synthetic negative controls; M7 (release `dt`) is
 * P4/L-DRIVE-1 per C3.
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
            // checker control for the wrong decision: reuse the aged B (0)
            // by taking a fresh capture at that position, then moving to A
            a.style.left = '0px'
            h.group.capture()
            a.style.left = '120px'
            const mutantRun = h.group.flush()
            const first = viewBox(a).x
            const mutantTracks = h.group.stats.tracks
            h.group.finish()
            const mutantReport = await mutantRun
            const mutant = {
                status: mutantReport.status,
                tracks: mutantTracks,
                x: first,
                a: 120,
                snapped: reasonsOf(mutantReport),
                code: null,
            }
            expectMutation(
                'consume an aged capture (checker control: aged B reused)',
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
                mutant
            )
            h.dispose()
            details.push(
                'M1 aged capture -> L-MEAS-11 (checker: aged B reused)'
            )
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
            // real decision mutation: a clock whose read phase drops the
            // frame marker. The capture never ages, so the engine consumes a
            // B from before the frame (the wrong first frame).
            const mutantClock = createManualClock()
            const proxy = new Proxy(mutantClock.clock, {
                get(target, property) {
                    if (property === 'read') return () => undefined
                    const value = Reflect.get(target, property, target)
                    return typeof value === 'function'
                        ? value.bind(target)
                        : value
                },
            })
            const mutantRoot = document.createElement('div')
            mutantRoot.style.cssText =
                'position: relative; width: 900px; height: 700px;'
            document.body.append(mutantRoot)
            const mutantGroup = createLayoutGroup({
                clock: proxy,
                motion,
            })
            const mutantA = node(mutantRoot, boxAt(0, 0))
            mutantGroup.add(mutantA, { radius: false })
            mutantGroup.capture()
            mutantClock.advance(16)
            mutantA.style.left = '120px'
            const mutantRun = mutantGroup.flush()
            const first = viewBox(mutantA).x
            const mutantTracks = mutantGroup.stats.tracks
            mutantGroup.finish()
            const mutantReport = await mutantRun
            const mutant = {
                status: mutantReport.status,
                tracks: mutantTracks,
                x: first,
                a: 120,
                snapped: reasonsOf(mutantReport),
                code: null,
            }
            expectMutation(
                'skip the frame marker (real clock mutation)',
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
                mutant
            )
            h.dispose()
            mutantGroup.dispose()
            mutantRoot.remove()
            details.push('M2 frame marker -> L-MEAS-13 (real clock mutation)')
        }

        // 3. use the predicted box instead of the measured one -> L-MEAS-4
        {
            const correct = harness({ motion })
            const a = node(correct.root, boxAt(-100, 0))
            correct.add(a, { radius: false })
            correct.group.capture()
            a.style.left = '-50px'
            const correctRun = correct.group.flush()
            const real = {
                tracks: correct.group.stats.tracks,
                first: viewBox(a).x,
                captured: -100,
            }
            correct.group.dispose()
            correct.root.remove()
            await correctRun

            // real mutation: the capture reads A (-50) as B; the engine then
            // has no measured move and the predicted box is the first frame
            const mutantHarness = harness({ motion })
            const m = node(mutantHarness.root, boxAt(-100, 0))
            mutantHarness.add(m, { radius: false })
            const measured = m.getBoundingClientRect.bind(m)
            m.getBoundingClientRect = () => {
                const rect = measured()
                return {
                    ...rect,
                    x: rect.x + 50,
                    left: rect.left + 50,
                    right: rect.right + 50,
                    toJSON: rect.toJSON,
                } as DOMRect
            }
            mutantHarness.group.capture()
            m.getBoundingClientRect = measured
            m.style.left = '-50px'
            const mutantRun = mutantHarness.group.flush()
            const mutant = {
                tracks: mutantHarness.group.stats.tracks,
                first: viewBox(m).x,
                captured: -100,
            }
            expectMutation(
                'use the predicted box instead of the measured one (real mutated capture)',
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
                mutant
            )
            mutantHarness.group.dispose()
            mutantHarness.root.remove()
            await mutantRun
            details.push('M3 predicted box -> L-MEAS-4 (real mutated capture)')
        }

        // 4. drop the layout-size check -> §9.1 size-limit (synthetic control)
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
                'drop the layout-size check (synthetic)',
                'L-MEAS-11 (§9.1 size-limit)',
                (o) => {
                    if (!(o.snapped as string[]).includes('unsupported'))
                        throw new Error(
                            'L-MEAS-11 (§9.1 size-limit): the 60x size change did not snap'
                        )
                    if (o.tracks !== 0)
                        throw new Error(
                            'L-MEAS-11 (§9.1 size-limit): a 60x size change ran'
                        )
                },
                real,
                { status: 'ended', tracks: 1, snapped: [] }
            )
            h.dispose()
            details.push('M4 size check -> §9.1 size-limit (synthetic)')
        }

        // 5. ignore scrollend -> L-HAND-2 (real: scrollend support removed)
        const scrollObservation = async (support: boolean, suffix: string) => {
            const had = Object.getOwnPropertyDescriptor(window, 'onscrollend')
            if (!support)
                delete (window as { onscrollend?: unknown }).onscrollend
            const h = harness({ motion })
            try {
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
                h.group.add(card, {
                    layoutId: `mut-a-${suffix}`,
                    radius: false,
                })
                h.group.add(second, {
                    layoutId: `mut-b-${suffix}`,
                    radius: false,
                })
                h.group.capture()
                await h.group.flush()
                scroller.dispatchEvent(new Event('scroll'))
                void cardPresence.exit()
                h.group.capture()
                const detailA = node(document.body, boxAt(500, 60, 300, 200))
                h.group.add(detailA, {
                    layoutId: `mut-a-${suffix}`,
                    radius: false,
                })
                const first = h.group.flush()
                const before = {
                    tracks: h.group.stats.tracks,
                    opacity: card.style.opacity,
                    translate: detailA.style.translate,
                }
                scroller.dispatchEvent(new Event('scrollend'))
                void secondPresence.exit()
                h.group.capture()
                const detailB = node(document.body, boxAt(500, 300, 300, 200))
                h.group.add(detailB, {
                    layoutId: `mut-b-${suffix}`,
                    radius: false,
                })
                const secondRun = h.group.flush()
                const observation = {
                    beforeTracks: before.tracks,
                    beforeOpacity: before.opacity,
                    beforeTranslate: before.translate,
                    tracks: h.group.stats.tracks,
                    opacity: second.style.opacity,
                    translate: detailB.style.translate,
                }
                h.group.dispose()
                await Promise.all([first, secondRun])
                cardPresence.dispose()
                secondPresence.dispose()
                h.root.remove()
                detailA.remove()
                detailB.remove()
                return observation
            } finally {
                h.group.dispose()
                if (had) Object.defineProperty(window, 'onscrollend', had)
                else delete (window as { onscrollend?: unknown }).onscrollend
            }
        }
        {
            const native = 'onscrollend' in window
            const real = await scrollObservation(native, 'real')
            const checkScroll = (o: Observation) => {
                if (o.beforeTracks !== 0)
                    throw new Error('L-HAND-2: an active scroller handed off')
                if (o.beforeOpacity !== '' || o.beforeTranslate !== '')
                    throw new Error('L-HAND-2: the active handoff drew motion')
                if (o.tracks === 0)
                    throw new Error(
                        'L-HAND-2: scrollend did not clear the active state'
                    )
                if (o.opacity === '' || o.translate === '')
                    throw new Error('L-HAND-2: no flight after scrollend')
            }
            if (native) {
                const mutant = await scrollObservation(false, 'mut')
                expectMutation(
                    'ignore scrollend (real: support removed)',
                    'L-HAND-2',
                    checkScroll,
                    real,
                    mutant
                )
                details.push('M5 scrollend -> L-HAND-2 (real support removed)')
            } else {
                // §5.8/§11.4 S5: without `scrollend` the state is never
                // cleared by time; every handoff out of a scroller that has
                // scrolled degrades the same way. WebKit 26 has no event, so
                // the fallback is asserted instead of the mutation.
                if (
                    real.beforeTracks !== 0 ||
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
        }

        // 6. skip cleanup on abort -> L-OPS-2 (real: inert removal blocked)
        const abortObservation = async (block: boolean, suffix: string) => {
            const h = harness({ motion })
            const card = node(h.root, boxAt(20, 20))
            const presence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(card, {
                layoutId: `mut-abort-${suffix}`,
                radius: false,
            })
            h.group.capture()
            await h.group.flush()
            void presence.exit()
            h.group.capture()
            const lead = node(h.root, boxAt(360, 40, 300, 200))
            h.group.add(lead, {
                layoutId: `mut-abort-${suffix}`,
                radius: false,
            })
            const run = h.group.flush()
            const started = h.group.stats.tracks
            h.mc.frame(16)
            injectLayoutFault('write')
            const original = Element.prototype.removeAttribute
            if (block) {
                Element.prototype.removeAttribute = function (name: string) {
                    if (name === 'inert' && this === card) return
                    return original.call(this, name)
                }
            }
            try {
                h.mc.frame(16)
                const report = await run
                return {
                    status: report.status,
                    inert: card.hasAttribute('inert'),
                    translate: card.style.translate,
                    opacity: card.style.opacity,
                    tracks: h.group.stats.tracks,
                    started,
                    cardOpacity: card.style.opacity,
                    cardInert: card.hasAttribute('inert'),
                    leadOpacity: lead.style.opacity,
                    leadTranslate: lead.style.translate,
                    snapped: reasonsOf(report),
                }
            } finally {
                Element.prototype.removeAttribute = original
                h.dispose()
                presence.dispose()
                h.root.remove()
            }
        }
        {
            const real = await abortObservation(false, 'real')
            const mutant = await abortObservation(true, 'mut')
            expectMutation(
                'skip cleanup on abort (real: inert removal blocked)',
                'L-OPS-2',
                (o) => {
                    if (o.status !== 'failed')
                        throw new Error(
                            `L-OPS-2: status ${String(o.status)} tracks ${String(o.tracks)} started ${String(o.started)} inert ${String(o.inert)} cardOp ${String(o.cardOpacity)} leadOp ${String(o.leadOpacity)} leadTr ${String(o.leadTranslate)} snapped ${JSON.stringify(o.snapped)}`
                        )
                    if (o.inert !== false)
                        throw new Error('L-OPS-2: inert not restored')
                    if (o.translate !== '' || o.opacity !== '')
                        throw new Error('L-OPS-2: styles not restored')
                    if (o.tracks !== 0)
                        throw new Error('L-OPS-2: a layout track is left')
                },
                real,
                mutant
            )
            details.push('M6 abort cleanup -> L-OPS-2 (real blocked removal)')
        }

        // 7. release with dt ≠ 0 -> L-DRIVE-1 (§11.3; C3 moves M7 to P4)
        {
            const h = harness({ motion })
            const a = node(h.root, boxAt(0, 0))
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 60, y: 20 })
            h.mc.frame(FRAME_MS)
            await microtasks()
            const held = viewBox(a)
            handle.release({ x: 500, y: 0 })
            h.mc.frame(FRAME_MS)
            await microtasks()
            const first = viewBox(a)
            h.mc.frame(FRAME_MS)
            await microtasks()
            const second = viewBox(a)
            const diff = (a0: typeof first, b0: typeof first) =>
                Math.max(
                    Math.abs(a0.x - b0.x),
                    Math.abs(a0.y - b0.y),
                    Math.abs(a0.w - b0.w),
                    Math.abs(a0.h - b0.h)
                )
            const real = {
                firstError: diff(first, held),
                secondDx: Math.abs(second.x - first.x),
            }
            // the wrong decision: the release's first update advances by dt,
            // so its first painted frame is the real second frame
            const mutant = {
                firstError: diff(second, held),
                secondDx: 0,
            }
            expectMutation(
                'release with dt ≠ 0 (real second frame as the wrong first)',
                'L-DRIVE-1',
                (o) => {
                    if ((o.firstError as number) > TOL)
                        throw new Error(
                            `L-DRIVE-1: first release frame is ${String(o.firstError)} px from the held box`
                        )
                    if (!((o.secondDx as number) > TOL))
                        throw new Error('L-DRIVE-1: the release never advanced')
                },
                real,
                mutant
            )
            details.push(
                'M7 release first update dt = 0 -> L-DRIVE-1 (wrong first frame control)'
            )
            handle.cancel()
            h.dispose()
        }

        // 8. merge the motion field by field -> L-SPRING-3 (synthetic control)
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
                'merge the motion field by field (synthetic)',
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
            details.push('M8 field-by-field motion -> L-SPRING-3 (synthetic)')
        }

        return `MUTATION: ${details.join('; ')}`
    } finally {
        diagnostics.stop()
        quiet.restore()
        clearLayoutFaults()
        layoutRuntime.setMode('animate')
    }
}

/* ───────────── one writer per element/property/batch (browser) ───────────── */

/**
 * ONE_WRITER (H12-10, §6): inside one flush or frame each element/property is
 * written by layout at most once, the written names are exactly layout's
 * owned set, and an author `translate` is restored byte for byte.
 */
export async function ONE_WRITER(): Promise<string> {
    const quiet = silenceWarnings()
    const counts = new Map<HTMLElement, Map<string, number>>()
    const attributes = new Map<HTMLElement, Map<string, number>>()
    const owners = new WeakMap<CSSStyleDeclaration, HTMLElement>()
    const setProperty = CSSStyleDeclaration.prototype.setProperty
    const removeProperty = CSSStyleDeclaration.prototype.removeProperty
    const setAttribute = Element.prototype.setAttribute
    const removeAttribute = Element.prototype.removeAttribute
    const bump = (
        map: Map<HTMLElement, Map<string, number>>,
        element: HTMLElement,
        name: string
    ) => {
        const values = map.get(element) ?? new Map<string, number>()
        values.set(name, (values.get(name) ?? 0) + 1)
        map.set(element, values)
    }
    const reset = () => {
        counts.clear()
        attributes.clear()
    }
    const assertCounts = () => {
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
        for (const [element, values] of counts) {
            for (const [property, count] of values) {
                if (!owned.has(property)) {
                    throw new Error(`unowned property ${property}`)
                }
                if (count > 1) {
                    throw new Error(
                        `${count} writers for ${property} on one element in one batch`
                    )
                }
            }
            void element
        }
        for (const [element, values] of attributes) {
            for (const [name, count] of values) {
                if (name !== 'inert') {
                    throw new Error(`unowned attribute ${name}`)
                }
                if (count > 1) {
                    throw new Error(
                        `${count} writers for the ${name} attribute in one batch`
                    )
                }
            }
            void element
        }
    }
    CSSStyleDeclaration.prototype.setProperty = function (
        property: string,
        value: string | null,
        priority?: string
    ) {
        const element = owners.get(this)
        if (element) bump(counts, element, property)
        return setProperty.call(this, property, value, priority)
    }
    CSSStyleDeclaration.prototype.removeProperty = function (property: string) {
        const element = owners.get(this)
        if (element) bump(counts, element, property)
        return removeProperty.call(this, property)
    }
    Element.prototype.setAttribute = function (name: string, value: string) {
        bump(attributes, this as HTMLElement, name)
        return setAttribute.call(this, name, value)
    }
    Element.prototype.removeAttribute = function (name: string) {
        bump(attributes, this as HTMLElement, name)
        return removeAttribute.call(this, name)
    }
    try {
        const h = harness({ motion })
        const a = node(h.root, boxAt(0, 0))
        a.style.translate = '5px 7px'
        owners.set(a.style, a)
        h.group.add(a, { radius: false })
        h.group.capture()
        await h.group.flush()
        a.style.left = '140px'
        reset()
        const track = h.group.flush()
        assertCounts()
        // the first frame writes each owned property once
        reset()
        h.mc.frame(16)
        assertCounts()
        h.group.finish()
        await track
        expectEqual(a.style.translate, '5px 7px', 'authored translate restored')
        h.dispose()

        const pair = harness({ motion })
        const card = node(pair.root, boxAt(20, 20))
        const presence = createPresence(card, a11yPresence, {
            clock: pair.mc.clock,
        })
        owners.set(card.style, card)
        pair.group.add(card, { layoutId: 'one-writer', radius: false })
        pair.group.capture()
        await pair.group.flush()
        void presence.exit()
        pair.group.capture()
        const detail = node(pair.root, boxAt(360, 40, 300, 200))
        owners.set(detail.style, detail)
        pair.group.add(detail, { layoutId: 'one-writer', radius: false })
        reset()
        const crossfade = pair.group.flush()
        assertCounts()
        for (const element of [card, detail]) {
            expectEqual(
                counts.get(element)?.get('translate'),
                1,
                'one translate writer'
            )
            expectEqual(
                counts.get(element)?.get('scale'),
                1,
                'one scale writer'
            )
            expectEqual(
                counts.get(element)?.get('opacity'),
                1,
                'one opacity writer'
            )
        }
        expectEqual(attributes.get(card)?.get('inert'), 1, 'one inert writer')
        reset()
        pair.mc.frame(16)
        assertCounts()
        pair.group.dispose()
        await crossfade
        presence.dispose()
        pair.root.remove()
        return 'ONE_WRITER: one write per element/property per flush and frame; only owned names; inert once; authored translate restored'
    } finally {
        CSSStyleDeclaration.prototype.setProperty = setProperty
        CSSStyleDeclaration.prototype.removeProperty = removeProperty
        Element.prototype.setAttribute = setAttribute
        Element.prototype.removeAttribute = removeAttribute
        quiet.restore()
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

        // H12-17: a live crossfade follower in an over-cap flush restores
        {
            const h = harness({ motion, maxParticipants: 2 })
            const card = node(h.root, boxAt(20, 20))
            const presence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(card, { layoutId: 'cap-follow', radius: false })
            h.group.capture()
            await h.group.flush()
            void presence.exit()
            h.group.capture()
            const detail = node(h.root, boxAt(360, 40, 300, 200))
            h.group.add(detail, { layoutId: 'cap-follow', radius: false })
            const crossfade = h.group.flush()
            h.mc.frame(16)
            if (!card.hasAttribute('inert')) {
                throw new Error('cap follower: not inert before the cap')
            }
            h.group.add(node(h.root, boxAt(0, 500)))
            h.group.capture()
            const report = await h.group.flush()
            expectEqual(report.status, 'capped', 'cap follower: status')
            // §5.8/§9.1: a cap is a degradation, not the author's removal. The
            // exiting follower stays invisible and inert while it is still
            // mounted; only the lead/other participants restore on the cap.
            expectEqual(
                card.hasAttribute('inert'),
                true,
                'cap follower: inert retained'
            )
            expectEqual(
                card.style.getPropertyValue('opacity'),
                '0',
                'cap follower: opacity held'
            )
            for (const element of [detail]) {
                for (const property of [
                    'translate',
                    'scale',
                    'opacity',
                ] as const) {
                    expectEqual(
                        element.style.getPropertyValue(property),
                        '',
                        `cap follower: ${property} restored`
                    )
                }
            }
            h.group.dispose()
            expectEqual(
                card.hasAttribute('inert'),
                false,
                'cap follower: inert restored after dispose'
            )
            expectEqual(
                card.style.getPropertyValue('opacity'),
                '',
                'cap follower: opacity restored after dispose'
            )
            await crossfade
            presence.dispose()
            h.root.remove()
            details.push(
                'participant cap with a live follower: held until dispose'
            )
        }

        // H12-17/H12-02: the same follower through a capped flush whose
        // commit throws: abort restores inert and styles
        {
            const h = harness({ motion, maxParticipants: 2 })
            const card = node(h.root, boxAt(20, 20))
            const presence = createPresence(card, a11yPresence, {
                clock: h.mc.clock,
            })
            h.group.add(card, { layoutId: 'cap-fault', radius: false })
            h.group.capture()
            await h.group.flush()
            void presence.exit()
            h.group.capture()
            const detail = node(h.root, boxAt(360, 40, 300, 200))
            h.group.add(detail, { layoutId: 'cap-fault', radius: false })
            const crossfade = h.group.flush()
            h.mc.frame(16)
            h.group.add(node(h.root, boxAt(0, 500)))
            h.group.capture()
            injectLayoutFault('write')
            const report = await h.group.flush()
            expectEqual(report.status, 'failed', 'cap fault follower: status')
            expectEqual(
                card.hasAttribute('inert'),
                false,
                'cap fault follower: inert restored'
            )
            for (const element of [card, detail]) {
                for (const property of [
                    'translate',
                    'scale',
                    'opacity',
                ] as const) {
                    expectEqual(
                        element.style.getPropertyValue(property),
                        '',
                        `cap fault follower: ${property} restored`
                    )
                }
            }
            expectEqual(h.group.stats.tracks, 0, 'cap fault follower: no track')
            h.group.dispose()
            await crossfade
            presence.dispose()
            h.root.remove()
            clearLayoutFaults()
            details.push('capped flush with a follower + fault: abort restored')
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
