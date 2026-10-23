// Layout engine in real browsers on a manual clock: every frame of every node
// against the independent oracle (ARCHITECTURE.md §11), plus snaps, reduced
// motion, lifecycle, byte-exact restore and read discipline (plan T4.3).
import { ani, type TimingFunction, timing } from '@freestylejs/ani-core'
import {
    createManualClock,
    type ManualClock,
} from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    createPresence,
    type LayoutGroup,
    type LayoutGroupOptions,
    type LayoutOptions,
    type LayoutReport,
    shareElement,
    supportsViewTransition,
    viewTransition,
} from '@freestylejs/ani-layout'
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

function pageBox(element: Element): OBox {
    const r = element.getBoundingClientRect()
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }
}

function node(parent: HTMLElement, css: string): HTMLElement {
    const element = document.createElement('div')
    element.style.cssText = `position: absolute; box-sizing: border-box; ${css}`
    parent.append(element)
    return element
}

interface Harness {
    readonly mc: ManualClock
    readonly group: LayoutGroup
    readonly root: HTMLElement
    add(element: HTMLElement, options?: LayoutOptions): void
    dispose(): void
}

function harness(options: Omit<LayoutGroupOptions, 'clock'> = {}): Harness {
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

/** A frame check (or observer) that asserts nothing: the frames only advance time. */
function noCheck(): void {
    // nothing to assert
}

/** Microtask turns: promise reactions (run reports, presence) settle. */
async function settleMicrotasks(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve()
}

/**
 * Runs frames until `done()` or `limit`, checking every frame; the first
 * frame after a flush has `dt = 0`, so frame k (from 0) shows elapsed k·DT.
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
        await settleMicrotasks()
    }
    return count
}

function spec(
    before: OBox,
    after: OBox,
    rest: Partial<OTrackSpec> & { duration: number; timing: TimingFunction }
): OTrackSpec {
    return {
        before,
        after,
        velocity: null,
        fx: 0,
        fy: 0,
        mode: true,
        delay: 0,
        ...rest,
    }
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

function silenceWarnings(): { readonly messages: string[]; restore(): void } {
    const original = console.warn
    const messages: string[] = []
    console.warn = (...args: unknown[]) => {
        messages.push(args.map(String).join(' '))
    }
    return {
        messages,
        restore() {
            console.warn = original
        },
    }
}

function report(promise: Promise<LayoutReport>): {
    value: LayoutReport | null
} {
    const holder: { value: LayoutReport | null } = { value: null }
    void promise.then((r) => {
        holder.value = r
    })
    return holder
}

/* ───────────────────────── tracks ───────────────────────── */

/** Flat move + resize: every frame on the oracle, exact settle, byte-identical style, no subscriber. */
export async function T1(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.2, timing: linear } })
    try {
        const element = node(
            h.root,
            'left: 20px; top: 30px; width: 80px; height: 40px; transform-origin: 0 0; background: #345;'
        )
        h.add(element)
        const before = pageBox(element)
        h.group.capture()
        element.style.left = '220px'
        element.style.top = '90px'
        element.style.width = '120px'
        element.style.height = '60px'
        const after = pageBox(element)
        const style = element.style.cssText
        const done = report(h.group.flush())
        const track = spec(before, after, { duration: 0.2, timing: linear })
        let worst = 0
        const count = await frames(
            h.mc,
            40,
            (elapsed) => {
                worst = Math.max(
                    worst,
                    expectAt(
                        element,
                        expectedBox(track, elapsed),
                        `t=${elapsed}`
                    )
                )
            },
            () => done.value !== null
        )
        expectEqual(done.value, { status: 'ended', snapped: [] }, 'report')
        expectEqual(element.style.cssText, style, 'inline style restored')
        expectEqual(h.mc.clock.size, 0, 'no clock subscriber after settle')
        expectAt(element, after, 'final box', 0.01)
        return `${count} frames, max error ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/** Nested depth 3, mixed modes and timings, a delay: every node on its own visual track. */
export async function T2(): Promise<string> {
    const h = harness()
    try {
        const parent = node(
            h.root,
            'left: 10px; top: 10px; width: 300px; height: 200px; transform-origin: 0 0; background: #ddd;'
        )
        const child = node(
            parent,
            'left: 20px; top: 20px; width: 120px; height: 80px; transform-origin: 50% 50%; background: #aaa;'
        )
        const leaf = node(
            child,
            'left: 10px; top: 10px; width: 40px; height: 30px; transform-origin: 100% 0; background: #555;'
        )
        const linear = timing.linear()
        const easeOut = timing.easeOut()
        const spring = timing.spring({ m: 1, k: 170, c: 26 })
        h.add(parent, { motion: { duration: 0.3, timing: linear } })
        h.add(child, {
            layout: 'position',
            motion: { duration: 0.25, delay: 0.05, timing: easeOut },
        })
        h.add(leaf, {
            layout: 'size',
            motion: { duration: 0.35, timing: spring },
        })
        const all = [parent, child, leaf]
        const before = all.map(pageBox)
        h.group.capture()
        parent.style.left = '200px'
        parent.style.width = '420px'
        parent.style.height = '260px'
        child.style.left = '200px'
        child.style.top = '100px'
        child.style.width = '160px'
        leaf.style.width = '90px'
        leaf.style.height = '50px'
        const after = all.map(pageBox)
        const done = report(h.group.flush())
        const tracks = [
            spec(before[0]!, after[0]!, { duration: 0.3, timing: linear }),
            spec(before[1]!, after[1]!, {
                duration: 0.25,
                delay: 0.05,
                timing: easeOut,
                mode: 'position',
                fx: 0.5,
                fy: 0.5,
            }),
            spec(before[2]!, after[2]!, {
                duration: 0.35,
                timing: spring,
                mode: 'size',
                fx: 1,
            }),
        ]
        let worst = 0
        const count = await frames(
            h.mc,
            60,
            (elapsed) => {
                all.forEach((e, i) => {
                    worst = Math.max(
                        worst,
                        expectAt(
                            e,
                            expectedBox(tracks[i]!, elapsed),
                            `node ${i} t=${elapsed}`
                        )
                    )
                })
            },
            () => done.value !== null
        )
        expectEqual(done.value!.status, 'ended', 'status')
        expectEqual(h.mc.clock.size, 0, 'no subscriber')
        return `${count} frames × 3 nodes, max error ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/** E1 Layout Anchor: child centre on the parent's centre every frame; its size holds 70 px until 0.8 s. */
export async function T3(): Promise<string> {
    const linear = timing.linear()
    const h = harness()
    try {
        const parent = node(
            h.root,
            'left: 0; top: 0; width: 150px; height: 150px; background: #ccd;'
        )
        const child = node(
            parent,
            'left: 40px; top: 40px; width: 70px; height: 70px; background: #335;'
        )
        h.add(parent, { motion: { duration: 0.5, timing: linear } })
        h.add(child, {
            layoutAnchor: { x: 0.5, y: 0.5 },
            motion: { duration: 0.5, delay: 0.8, timing: linear },
        })
        h.group.capture()
        parent.style.width = '300px'
        parent.style.height = '300px'
        child.style.left = '100px'
        child.style.top = '100px'
        child.style.width = '100px'
        child.style.height = '100px'
        const done = report(h.group.flush())
        let worst = 0
        let grewAt = -1
        await frames(
            h.mc,
            100,
            (elapsed) => {
                const p = pageBox(parent)
                const c = pageBox(child)
                const off = Math.max(
                    Math.abs(c.x + c.w / 2 - (p.x + p.w / 2)),
                    Math.abs(c.y + c.h / 2 - (p.y + p.h / 2))
                )
                worst = Math.max(worst, off)
                if (off > TOL) {
                    throw new Error(`centre off by ${off} px at ${elapsed} s`)
                }
                if (elapsed <= 0.8 + 1e-9) {
                    expectClose(c.w, 70, 0.01, `size held at ${elapsed} s`)
                } else if (grewAt < 0 && c.w > 70.01) {
                    grewAt = elapsed
                }
            },
            () => done.value !== null
        )
        expectEqual(done.value!.status, 'ended', 'status')
        if (!(grewAt > 0.8 && grewAt <= 0.8 + DT + 1e-9)) {
            throw new Error(
                `size started at ${grewAt} s, expected 0.8 s + one frame`
            )
        }
        return `centre error ≤ ${worst.toFixed(4)} px; size starts at ${grewAt.toFixed(3)} s`
    } finally {
        h.dispose()
    }
}

/** Interruption: a retarget mid-run starts from the drawn box with the drawn velocity; the old run is interrupted. */
export async function T4(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.4, timing: linear } })
    try {
        const element = node(
            h.root,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0; background: #533;'
        )
        h.add(element)
        const before = pageBox(element)
        h.group.capture()
        element.style.left = '300px'
        const after = pageBox(element)
        const first = report(h.group.flush())
        const track = spec(before, after, { duration: 0.4, timing: linear })
        await frames(h.mc, 10, (elapsed) => {
            expectAt(element, expectedBox(track, elapsed), `first t=${elapsed}`)
        })
        const drawn = expectedBox(track, 9 * DT)
        // interrupt: the target moves back
        h.group.capture()
        element.style.left = '100px'
        element.style.translate = 'none'
        const target = pageBox(element)
        element.style.removeProperty('translate')
        const second = report(h.group.flush())
        await settleMicrotasks()
        expectEqual(
            first.value,
            { status: 'interrupted', snapped: [] },
            'first run'
        )
        const retarget = spec(drawn, target, {
            duration: 0.4,
            timing: linear,
            velocity: { x: 300 / 0.4, y: 0, w: 0, h: 0 },
        })
        let worst = 0
        const positions: number[] = []
        await frames(
            h.mc,
            40,
            (elapsed) => {
                positions.push(pageBox(element).x)
                worst = Math.max(
                    worst,
                    expectAt(
                        element,
                        expectedBox(retarget, elapsed),
                        `retarget t=${elapsed}`
                    )
                )
            },
            () => second.value !== null
        )
        expectEqual(second.value!.status, 'ended', 'second run')
        const v = (positions[2]! - positions[1]!) / DT
        const want =
            (expectedBox(retarget, 2 * DT).x - expectedBox(retarget, DT).x) / DT
        expectClose(v, want, 0.05 * Math.abs(want), 'carried velocity')
        expectClose(positions[0]!, drawn.x, TOL, 'continuous position')
        return `retarget at ${drawn.x.toFixed(1)} px; first step ${v.toFixed(0)} px/s; max error ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/** layoutId handoff with a crossfade against an exiting presence node; presence's release waits for the crossfade. */
export async function T5(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.3, timing: linear } })
    try {
        const card = node(
            h.root,
            'left: 20px; top: 20px; width: 80px; height: 80px; transform-origin: 0 0; background: #366;'
        )
        h.add(card, { layoutId: 'hero' })
        const presence = createPresence(
            card,
            {
                present: { translateY: 0 },
                exit: ani({
                    to: { translateY: 0 },
                    duration: 0.1,
                    timing: linear,
                }),
            },
            { clock: h.mc.clock }
        )
        // a first flush makes the card the lead of "hero"
        h.group.capture()
        await h.group.flush()
        const cardBox = pageBox(card)
        h.group.capture()
        let exited: string | null = null
        let now = 0
        let exitedAt = -1
        void presence.exit().then((r) => {
            exited = r
            exitedAt = now
        })
        const detail = node(
            h.root,
            'left: 300px; top: 100px; width: 400px; height: 300px; transform-origin: 0 0; background: #663;'
        )
        const detailStyle = detail.style.cssText
        h.add(detail, { layoutId: 'hero' })
        const detailBox = pageBox(detail)
        const done = report(h.group.flush())
        const track = spec(cardBox, detailBox, {
            duration: 0.3,
            timing: linear,
        })
        let sumError = 0
        let worst = 0
        await frames(
            h.mc,
            40,
            (elapsed) => {
                const want = expectedBox(track, elapsed)
                worst = Math.max(
                    worst,
                    expectAt(detail, want, `lead t=${elapsed}`)
                )
                worst = Math.max(
                    worst,
                    expectAt(card, want, `follower t=${elapsed}`)
                )
                const a = Number(getComputedStyle(detail).opacity)
                const b = Number(getComputedStyle(card).opacity)
                sumError = Math.max(sumError, Math.abs(a + b - 1))
                now = elapsed
            },
            () => done.value !== null && exited !== null
        )
        expectEqual(done.value!.status, 'ended', 'status')
        expectEqual(exited, 'exited', 'presence exit')
        if (sumError > 0.05) throw new Error(`opacity sum off by ${sumError}`)
        if (!(exitedAt >= 0.3 - 1e-9)) {
            throw new Error(
                `presence released at ${exitedAt} s, before the 0.3 s crossfade ended`
            )
        }
        expectEqual(card.style.opacity, '0', 'follower held invisible')
        expectEqual(detail.style.cssText, detailStyle, 'lead restored')
        presence.dispose()
        return `opacity sum within ${sumError.toFixed(4)}; max error ${worst.toFixed(4)} px; release at ${exitedAt.toFixed(3)} s`
    } finally {
        h.dispose()
    }
}

/** CP2 trial J-001 DOM: parent scaleX(.8) moving 0 → 100; the delayed child holds its visual B = 40. */
export async function T6(): Promise<string> {
    const linear = timing.linear()
    const h = harness()
    try {
        const parent = node(
            h.root,
            'left: 0; top: 0; width: 200px; height: 100px; transform: scaleX(0.8); transform-origin: 0 0; background: #ccc;'
        )
        const child = node(
            parent,
            'left: 50px; top: 10px; width: 100px; height: 40px; transform-origin: 0 0; background: #444;'
        )
        h.add(parent, { motion: { duration: 0.4, timing: linear } })
        h.add(child, { motion: { duration: 0.4, delay: 0.4, timing: linear } })
        const before = [parent, child].map(pageBox)
        expectClose(before[1]!.x, 40, 0.01, 'child visual B')
        h.group.capture()
        parent.style.left = '100px'
        const after = [parent, child].map(pageBox)
        expectClose(after[1]!.x, 140, 0.01, 'child visual A')
        const done = report(h.group.flush())
        const tracks = [
            spec(before[0]!, after[0]!, { duration: 0.4, timing: linear }),
            spec(before[1]!, after[1]!, {
                duration: 0.4,
                delay: 0.4,
                timing: linear,
            }),
        ]
        let worst = 0
        let halfway = Number.NaN
        await frames(
            h.mc,
            80,
            (elapsed) => {
                worst = Math.max(
                    worst,
                    expectAt(
                        parent,
                        expectedBox(tracks[0]!, elapsed),
                        `parent t=${elapsed}`
                    )
                )
                worst = Math.max(
                    worst,
                    expectAt(
                        child,
                        expectedBox(tracks[1]!, elapsed),
                        `child t=${elapsed}`
                    )
                )
                if (Math.abs(elapsed - 0.208) < 1e-9) {
                    halfway = pageBox(child).x
                }
            },
            () => done.value !== null
        )
        expectClose(halfway, 40, TOL, 'child near the parent-halfway frame')
        expectEqual(parent.style.translate, '', 'parent restored')
        expectEqual(child.style.translate, '', 'child restored')
        return `child x at the parent-halfway frame ${halfway.toFixed(3)} px; max error ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/** An animating presence transform on a resting parent is a visual layer over the child's track. */
export async function T7(): Promise<string> {
    const linear = timing.linear()
    const h = harness()
    try {
        const parent = node(
            h.root,
            'left: 100px; top: 50px; width: 400px; height: 200px; transform: scale(0.8); transform-origin: 0 0; background: #ccc;'
        )
        const child = node(
            parent,
            'left: 0; top: 20px; width: 50px; height: 50px; transform-origin: 0 0; background: #444;'
        )
        h.add(parent)
        h.add(child, { motion: { duration: 0.3, timing: linear } })
        const before = pageBox(child)
        h.group.capture()
        child.style.left = '200px'
        const after = pageBox(child)
        const done = report(h.group.flush())
        const track = spec(before, after, { duration: 0.3, timing: linear })
        const origin = pageBox(parent)
        let worst = 0
        let step = 0
        await frames(
            h.mc,
            40,
            (elapsed) => {
                // the frame is drawn with the scale set after the previous one
                const k = (0.8 + 0.01 * step) / 0.8
                const v = expectedBox(track, elapsed)
                const want = {
                    x: origin.x + k * (v.x - origin.x),
                    y: origin.y + k * (v.y - origin.y),
                    w: k * v.w,
                    h: k * v.h,
                }
                worst = Math.max(worst, expectAt(child, want, `t=${elapsed}`))
                step += 1
                parent.style.transform = `scale(${0.8 + 0.01 * step})`
            },
            () => done.value !== null
        )
        expectEqual(done.value!.status, 'ended', 'status')
        expectEqual(child.style.translate, '', 'child restored')
        return `${step} frames under a changing presence scale; max error ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── reads and writes ───────────────────────── */

interface Probe {
    readonly log: string[]
    on: boolean
    restore(): void
}

/** Logs every layout read (rect, computed style) and every inline style write while `on`. */
function probeDom(): Probe {
    const rect = Element.prototype.getBoundingClientRect
    const computed = window.getComputedStyle
    const set = CSSStyleDeclaration.prototype.setProperty
    const remove = CSSStyleDeclaration.prototype.removeProperty
    const probe: Probe = {
        log: [],
        on: false,
        restore() {
            Element.prototype.getBoundingClientRect = rect
            window.getComputedStyle = computed
            CSSStyleDeclaration.prototype.setProperty = set
            CSSStyleDeclaration.prototype.removeProperty = remove
        },
    }
    Element.prototype.getBoundingClientRect = function (this: Element) {
        if (probe.on) probe.log.push('rect')
        return rect.call(this)
    }
    window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
        if (probe.on) probe.log.push('style')
        return computed.call(window, element, pseudo)
    }) as typeof window.getComputedStyle
    CSSStyleDeclaration.prototype.setProperty = function (
        this: CSSStyleDeclaration,
        ...args: Parameters<CSSStyleDeclaration['setProperty']>
    ) {
        if (probe.on) probe.log.push('write')
        return set.apply(this, args)
    }
    CSSStyleDeclaration.prototype.removeProperty = function (
        this: CSSStyleDeclaration,
        property: string
    ) {
        if (probe.on) probe.log.push('write')
        return remove.call(this, property)
    }
    return probe
}

/** A running retarget reads before any write; reads per commit = 2N rects + one style per active node; zero reads per frame. */
export async function T8(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.4, timing: linear } })
    const probe = probeDom()
    try {
        const elements: HTMLElement[] = []
        for (let i = 0; i < 10; i++) {
            const e = node(
                h.root,
                `left: ${i * 50}px; top: 0; width: 40px; height: 40px; background: #456;`
            )
            elements.push(e)
            h.add(e)
        }
        h.group.capture()
        elements[0]!.style.top = '100px'
        elements[1]!.style.top = '100px'
        void h.group.flush()
        await frames(h.mc, 5, noCheck)
        // steady frames: writes only
        probe.on = true
        probe.log.length = 0
        for (let i = 0; i < 5; i++) h.mc.frame(FRAME_MS)
        const frameReads = probe.log.filter((e) => e !== 'write').length
        // a running retarget plus a new mover
        probe.log.length = 0
        h.group.capture()
        const captureReads = probe.log.filter((e) => e === 'rect').length
        probe.on = false
        elements[0]!.style.top = '200px'
        elements[2]!.style.top = '100px'
        probe.on = true
        probe.log.length = 0
        const statsBefore = h.group.stats.reads
        void h.group.flush()
        probe.on = false
        const log = [...probe.log]
        const firstWrite = log.indexOf('write')
        const lateRead = log.findIndex(
            (e, i) => i > firstWrite && e !== 'write'
        )
        const rects = log.filter((e) => e === 'rect').length
        const styles = log.filter((e) => e === 'style').length
        expectEqual(frameReads, 0, 'reads on steady frames')
        expectEqual(
            firstWrite >= 0 && lateRead < 0,
            true,
            `no read after the first write (${log.join(',')})`
        )
        expectEqual(captureReads, 8, 'capture skips the 2 driven nodes')
        expectEqual(rects, 10, 'flush reads every rect')
        if (styles > 3) {
            throw new Error(
                `computed-style reads ${styles}, expected ≤ 3 active nodes`
            )
        }
        expectEqual(
            h.group.stats.reads - statsBefore,
            rects + styles,
            'stats.reads'
        )
        h.group.finish()
        return `capture ${captureReads} rects; flush ${rects} rects + ${styles} styles before ${log.filter((e) => e === 'write').length} writes; 0 reads in 5 steady frames`
    } finally {
        probe.restore()
        h.dispose()
    }
}

/** Inline style is byte-identical after a run over authored translate/scale with radius correction. */
export async function T9(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.2, timing: linear } })
    try {
        const element = node(
            h.root,
            'left: 10px; top: 10px; width: 100px; height: 60px; translate: 4px 2px; scale: 1.1; border-radius: 8px; color: red; transform-origin: 0 0; background: #345;'
        )
        h.add(element, { radius: true })
        const before = pageBox(element)
        h.group.capture()
        element.style.left = '200px'
        element.style.width = '200px'
        const after = pageBox(element)
        const style = element.style.cssText
        const done = report(h.group.flush())
        const track = spec(before, after, { duration: 0.2, timing: linear })
        let worst = 0
        let radiusError = 0
        await frames(
            h.mc,
            30,
            (elapsed) => {
                worst = Math.max(
                    worst,
                    expectAt(
                        element,
                        expectedBox(track, elapsed),
                        `t=${elapsed}`
                    )
                )
                // on-screen radius: CSS radius × total x-scale stays 8 px × 1.1
                const css = Number.parseFloat(
                    getComputedStyle(element).borderTopLeftRadius
                )
                const total = pageBox(element).w / element.offsetWidth
                radiusError = Math.max(
                    radiusError,
                    Math.abs(css * total - 8 * 1.1)
                )
            },
            () => done.value !== null
        )
        expectEqual(element.style.cssText, style, 'byte-identical inline style')
        if (radiusError > 0.05) {
            throw new Error(`on-screen radius off by ${radiusError}`)
        }
        return `max error ${worst.toFixed(4)} px; radius within ${radiusError.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── snaps ───────────────────────── */

/** Every snap reason the planner and the reads produce, with onSnap and the development warnings. */
export async function T10(): Promise<string> {
    const warnings = silenceWarnings()
    const reasons: string[] = []
    try {
        {
            // culled: both boxes far below the viewport
            const h = harness({ onSnap: (_e, reason) => reasons.push(reason) })
            const e = node(
                h.root,
                'left: 0; top: 3000px; width: 40px; height: 40px;'
            )
            h.add(e)
            h.group.capture()
            e.style.left = '200px'
            const r = await h.group.flush()
            expectEqual(r.status, 'no-change', 'culled status')
            expectEqual(
                r.snapped.map((s) => s.reason),
                ['culled'],
                'culled'
            )
            expectEqual(h.mc.clock.size, 0, 'culled: no subscriber')
            h.dispose()
        }
        {
            const h = harness({ maxNodes: 1 })
            const a = node(
                h.root,
                'left: 0; top: 0; width: 40px; height: 40px;'
            )
            const b = node(
                h.root,
                'left: 50px; top: 0; width: 40px; height: 40px;'
            )
            h.add(a)
            h.add(b)
            h.group.capture()
            a.style.top = '100px'
            b.style.top = '100px'
            const r = await h.group.flush()
            expectEqual(r.status, 'capped', 'capped status')
            expectEqual(
                r.snapped.map((s) => s.reason),
                ['capped', 'capped'],
                'capped'
            )
            h.dispose()
        }
        {
            // a rotated node and its subtree
            const h = harness()
            const a = node(
                h.root,
                'left: 0; top: 0; width: 80px; height: 80px; rotate: 10deg;'
            )
            const child = node(a, 'left: 0; top: 0; width: 20px; height: 20px;')
            h.add(a)
            h.add(child)
            h.group.capture()
            a.style.top = '100px'
            child.style.left = '30px'
            const r = await h.group.flush()
            expectEqual(
                r.snapped.map((s) => s.reason),
                ['unsupported', 'unsupported'],
                'unsupported subtree'
            )
            expectEqual(a.style.translate, '', 'nothing written')
            h.dispose()
        }
        {
            // a scroll container scrolled between capture and flush
            const h = harness()
            const scroller = node(
                h.root,
                'left: 0; top: 0; width: 200px; height: 100px; overflow: auto;'
            )
            node(scroller, 'left: 0; top: 0; width: 10px; height: 400px;')
            const a = node(
                scroller,
                'left: 0; top: 0; width: 40px; height: 40px;'
            )
            h.add(a)
            h.group.capture()
            a.style.left = '100px'
            scroller.scrollTop = 30
            const r = await h.group.flush()
            expectEqual(r.status, 'stale', 'stale status')
            expectEqual(
                r.snapped.map((s) => s.reason),
                ['stale'],
                'stale'
            )
            h.dispose()
        }
        {
            // a scaled ancestor that is not a participant
            const h = harness()
            const wrapper = node(
                h.root,
                'left: 0; top: 0; width: 300px; height: 300px; scale: 1.5; transform-origin: 0 0;'
            )
            const a = node(
                wrapper,
                'left: 0; top: 0; width: 40px; height: 40px;'
            )
            h.add(a)
            h.group.capture()
            a.style.left = '100px'
            const r = await h.group.flush()
            expectEqual(
                r.snapped.map((s) => s.reason),
                ['unsupported'],
                'scaled non-participant ancestor'
            )
            h.dispose()
        }
        {
            // a transition on translate would animate the engine's own writes
            const h = harness()
            const a = node(
                h.root,
                'left: 0; top: 0; width: 40px; height: 40px; transition: translate 0.2s;'
            )
            h.add(a)
            h.group.capture()
            a.style.left = '100px'
            const r = await h.group.flush()
            expectEqual(
                r.snapped.map((s) => s.reason),
                ['unsupported'],
                'transition on translate'
            )
            h.dispose()
        }
        expectEqual(reasons, ['culled'], 'onSnap')
        const needles = ['maxNodes', 'cannot be animated', 'scroll']
        for (const needle of needles) {
            if (!warnings.messages.some((m) => m.includes(needle))) {
                throw new Error(
                    `no development warning mentioning "${needle}": ${warnings.messages.join(' | ')}`
                )
            }
        }
        return `culled, capped, unsupported (rotate, scaled ancestor, transition), stale; ${warnings.messages.length} development warnings`
    } finally {
        warnings.restore()
    }
}

/** Reduced motion: jump (zero writes, zero subscribers), maxDuration, ignore, and a toggle mid-run. */
export async function T11(): Promise<string> {
    const linear = timing.linear()
    const lines: string[] = []
    {
        const h = harness({ motion: { duration: 0.4, timing: linear } })
        h.mc.setReducedMotion(true)
        const e = node(h.root, 'left: 0; top: 0; width: 40px; height: 40px;')
        h.add(e)
        const observer = new MutationObserver(noCheck)
        h.group.capture()
        e.style.left = '200px'
        observer.observe(e, { attributes: true, attributeFilter: ['style'] })
        const r = await h.group.flush()
        const writes = observer.takeRecords().length
        observer.disconnect()
        expectEqual(r.status, 'reduced', 'jump status')
        expectEqual(
            r.snapped.map((s) => s.reason),
            ['reduced'],
            'jump snapped'
        )
        expectEqual(writes, 0, 'jump: zero writes')
        expectEqual(h.mc.clock.size, 0, 'jump: zero subscribers')
        h.dispose()
        lines.push('jump: 0 writes, 0 subscribers')
    }
    {
        const h = harness({
            motion: { duration: 0.4, timing: linear },
            reducedMotion: { maxDuration: 0.1 },
        })
        h.mc.setReducedMotion(true)
        const e = node(
            h.root,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        h.add(e)
        const before = pageBox(e)
        h.group.capture()
        e.style.left = '200px'
        const after = pageBox(e)
        const done = report(h.group.flush())
        const track = spec(before, after, { duration: 0.1, timing: linear })
        const count = await frames(
            h.mc,
            40,
            (elapsed) => {
                expectAt(e, expectedBox(track, elapsed), `t=${elapsed}`)
            },
            () => done.value !== null
        )
        if (count > 9) throw new Error(`maxDuration run took ${count} frames`)
        h.dispose()
        lines.push(`maxDuration 0.1 s: ${count} frames`)
    }
    {
        const h = harness({
            motion: { duration: 0.2, timing: linear },
            reducedMotion: 'ignore',
        })
        h.mc.setReducedMotion(true)
        const e = node(h.root, 'left: 0; top: 0; width: 40px; height: 40px;')
        h.add(e)
        h.group.capture()
        e.style.left = '200px'
        const done = report(h.group.flush())
        const count = await frames(
            h.mc,
            40,
            noCheck,
            () => done.value !== null
        )
        expectEqual(done.value!.status, 'ended', 'ignore plays')
        if (count < 13) throw new Error(`ignore ran ${count} frames`)
        h.dispose()
        lines.push(`ignore: ${count} frames`)
    }
    {
        const h = harness({ motion: { duration: 0.4, timing: linear } })
        const a = node(h.root, 'left: 0; top: 0; width: 40px; height: 40px;')
        const b = node(
            h.root,
            'left: 0; top: 100px; width: 40px; height: 40px;'
        )
        h.add(a)
        h.add(b)
        h.group.capture()
        a.style.left = '200px'
        const style = a.style.cssText
        const first = report(h.group.flush())
        await frames(h.mc, 5, noCheck)
        h.mc.setReducedMotion(true)
        h.group.capture()
        b.style.left = '200px'
        const r = await h.group.flush()
        await settleMicrotasks()
        expectEqual(r.status, 'reduced', 'toggle status')
        expectEqual(first.value!.status, 'ended', 'active run finished')
        expectEqual(a.style.cssText, style, 'active track restored')
        expectEqual(h.mc.clock.size, 0, 'toggle: no subscriber')
        h.dispose()
        lines.push('toggle: the active run finished at the next flush')
    }
    return lines.join('; ')
}

/** finish() jumps to A and settles; dispose() restores; a throwing mutate discards the capture. */
export async function T12(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.4, timing: linear } })
    try {
        const e = node(h.root, 'left: 0; top: 0; width: 40px; height: 40px;')
        h.add(e)
        h.group.capture()
        e.style.left = '200px'
        const style = e.style.cssText
        const run = h.group.flush()
        await frames(h.mc, 5, noCheck)
        h.group.finish()
        expectEqual((await run).status, 'ended', 'finish → ended')
        expectEqual(e.style.cssText, style, 'finish restores')
        expectEqual(h.mc.clock.size, 0, 'finish unsubscribes')
        h.group.capture()
        e.style.left = '0px'
        const restored = e.style.cssText
        const second = h.group.flush()
        await frames(h.mc, 3, noCheck)
        h.group.dispose()
        expectEqual((await second).status, 'disposed', 'dispose → disposed')
        expectEqual(e.style.cssText, restored, 'dispose restores')
        expectEqual(
            (await h.group.flush()).status,
            'disposed',
            'flush after dispose'
        )
        const g = createLayoutGroup({ clock: h.mc.clock })
        let threw = false
        try {
            void g.update(() => {
                throw new Error('boom')
            })
        } catch (error) {
            threw = (error as Error).message === 'boom'
        }
        expectEqual(threw, true, 'update rethrows synchronously')
        expectEqual((await g.flush()).status, 'no-change', 'capture discarded')
        g.dispose()
        return 'finish: ended + restored; dispose: disposed + restored; update rethrows'
    } finally {
        h.dispose()
    }
}

/** Unrelated re-renders (flushes where nothing moved) restart nothing, inside the delay hold too. */
export async function T13(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.3, delay: 0.1, timing: linear } })
    try {
        const e = node(
            h.root,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        h.add(e)
        h.add(node(h.root, 'left: 0; top: 200px; width: 40px; height: 40px;'))
        const before = pageBox(e)
        h.group.capture()
        e.style.left = '200px'
        const after = pageBox(e)
        const done = report(h.group.flush())
        const track = spec(before, after, {
            duration: 0.3,
            delay: 0.1,
            timing: linear,
        })
        let worst = 0
        let count = 0
        await frames(
            h.mc,
            40,
            (elapsed) => {
                worst = Math.max(
                    worst,
                    expectAt(e, expectedBox(track, elapsed), `t=${elapsed}`)
                )
                count += 1
                if (count % 3 === 0) {
                    h.group.capture()
                    void h.group.flush()
                }
            },
            () => done.value !== null
        )
        expectEqual(done.value!.status, 'ended', 'never interrupted')
        return `${count} frames with a re-render every 3rd; max error ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── View Transitions ───────────────────────── */

export async function VT1(): Promise<string> {
    document.body.style.margin = '0'
    const root = document.createElement('div')
    root.style.cssText = 'position: relative; width: 320px; height: 220px;'
    document.body.append(root)
    const element = node(root, 'left: 0; top: 0; width: 40px; height: 40px;')
    const unbind = shareElement(element, 'hero')
    try {
        let duringName = ''
        const result = await viewTransition(
            () => {
                duringName = element.style.getPropertyValue(
                    'view-transition-name'
                )
                element.style.left = '40px'
            },
            { share: ['hero'], motion: { duration: 0.12 } }
        )
        if (supportsViewTransition()) {
            if (result === 'unsupported' || result === 'yielded') {
                throw new Error(`supported VT returned ${result}`)
            }
        } else {
            expectEqual(result, 'unsupported', 'unsupported fallback')
        }
        if (result === 'finished' && !duringName.startsWith('ani-hero')) {
            throw new Error(
                `shared name missing during transition: ${duringName}`
            )
        }
        expectEqual(
            element.style.getPropertyValue('view-transition-name'),
            '',
            'name restored'
        )
        const origin = root.getBoundingClientRect()
        expectClose(
            element.getBoundingClientRect().left - origin.left,
            40,
            0.6,
            'view transition update'
        )
        return `view transition: ${result}`
    } finally {
        unbind()
        root.remove()
    }
}

/* ───────────────────────── cost (T4.4) ───────────────────────── */

function percentile(values: readonly number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
}

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Time spent inside the DOM reads the engine makes (rects, computed values,
 * offsets, scroll, animations) while `on`. Each call is timed, so the sum is
 * an upper bound of the read time; with coarse timers (Firefox, WebKit) the
 * sum of many quantized intervals is still an unbiased estimate.
 */
function readTimer(): { on: boolean; total: number; restore(): void } {
    const timer = { on: false, total: 0, restore: noCheck }
    const undo: (() => void)[] = []
    const timed = <F extends (...a: never[]) => unknown>(fn: F): F =>
        function (this: unknown, ...args: never[]) {
            if (!timer.on) return fn.apply(this, args)
            const t = performance.now()
            const result = fn.apply(this, args)
            timer.total += performance.now() - t
            return result
        } as F
    const method = (owner: object, key: string) => {
        const original = (owner as Record<string, unknown>)[key] as (
            ...a: never[]
        ) => unknown
        ;(owner as Record<string, unknown>)[key] = timed(original)
        undo.push(() => {
            ;(owner as Record<string, unknown>)[key] = original
        })
    }
    const getter = (sample: object, key: string) => {
        let owner: object | null = sample
        while (owner && !Object.getOwnPropertyDescriptor(owner, key)) {
            owner = Object.getPrototypeOf(owner)
        }
        if (!owner) return
        const descriptor = Object.getOwnPropertyDescriptor(owner, key)!
        if (!descriptor.get || !descriptor.configurable) return
        Object.defineProperty(owner, key, {
            ...descriptor,
            get: timed(descriptor.get),
        })
        undo.push(() => Object.defineProperty(owner!, key, descriptor))
    }
    method(Element.prototype, 'getBoundingClientRect')
    method(window, 'getComputedStyle')
    method(Document.prototype, 'getAnimations')
    const style = getComputedStyle(document.body)
    for (const key of [
        'translate',
        'scale',
        'rotate',
        'transform',
        'transformOrigin',
        'display',
        'transitionDuration',
        'transitionDelay',
        'transitionProperty',
        'width',
        'height',
        'boxSizing',
    ]) {
        getter(style, key)
    }
    for (const key of ['offsetWidth', 'offsetHeight'])
        getter(document.body, key)
    for (const key of ['scrollLeft', 'scrollTop']) getter(document.body, key)
    for (const key of ['scrollX', 'scrollY']) getter(window, key)
    timer.restore = () => {
        for (const fn of undo.reverse()) fn()
    }
    return timer
}

/**
 * Commit cost at 1,000 participants (the §11 gate is on its reads) and the
 * steady frame at 300 nested movers (batched samples: coarse timers).
 */
export async function COST(): Promise<string> {
    const linear = timing.linear()
    document.body.style.margin = '0'
    const mc = createManualClock()
    const group = createLayoutGroup({
        clock: mc.clock,
        maxNodes: 5000,
        motion: { duration: 0.3, timing: linear },
    })
    const grid = document.createElement('div')
    grid.style.cssText = 'position: relative; width: 1200px; height: 700px;'
    document.body.append(grid)
    const items: HTMLElement[] = []
    for (let i = 0; i < 1000; i++) {
        const item = node(
            grid,
            `left: ${(i % 40) * 30}px; top: ${Math.floor(i / 40) * 14}px; width: 28px; height: 12px;`
        )
        items.push(item)
        group.add(item)
    }
    const reads = readTimer()
    const commit = async (movers: number, timed: boolean) => {
        const read: number[] = []
        const total: number[] = []
        for (let round = 0; round < 15; round++) {
            await macrotask()
            void grid.offsetHeight // the previous round's restore is not this commit's
            reads.total = 0
            reads.on = timed
            let t = performance.now()
            group.capture()
            let spent = performance.now() - t
            reads.on = false
            for (let i = 0; i < movers; i++) {
                const item = items[(i * 7 + round) % items.length]!
                item.style.top = `${Number.parseFloat(item.style.top) + (round % 2 === 0 ? 5 : -5)}px`
            }
            void grid.offsetHeight // the commit's own layout is not ours
            reads.on = timed
            t = performance.now()
            void group.flush()
            spent += performance.now() - t
            reads.on = false
            read.push(reads.total)
            total.push(spent)
            group.finish()
        }
        return { read: percentile(read, 0.5), total: percentile(total, 0.5) }
    }
    const gate = await commit(300, true)
    const all = await commit(1000, true)
    reads.restore()
    // the whole commit without timing hooks
    const whole = await commit(300, false)
    const wholeAll = await commit(1000, false)
    group.dispose()
    grid.remove()

    // frame: 100 parents × 2 children, all moving
    const fc = createManualClock()
    const frameGroup = createLayoutGroup({
        clock: fc.clock,
        maxNodes: 5000,
        motion: { duration: 1000, timing: linear },
    })
    const stage = document.createElement('div')
    stage.style.cssText = 'position: relative; width: 1200px; height: 800px;'
    document.body.append(stage)
    const parents: HTMLElement[] = []
    for (let i = 0; i < 100; i++) {
        const parent = node(
            stage,
            `left: ${(i % 20) * 55}px; top: ${Math.floor(i / 20) * 60}px; width: 50px; height: 50px;`
        )
        parents.push(parent)
        frameGroup.add(parent)
        for (let j = 0; j < 2; j++) {
            frameGroup.add(
                node(
                    parent,
                    `left: ${j * 22}px; top: 5px; width: 20px; height: 20px;`
                )
            )
        }
    }
    frameGroup.capture()
    for (const parent of parents) {
        parent.style.left = `${Number.parseFloat(parent.style.left) + 7}px`
        for (const child of parent.children) {
            const c = child as HTMLElement
            c.style.left = `${Number.parseFloat(c.style.left) + 3}px`
        }
    }
    void frameGroup.flush()
    fc.frames(3)
    const batch = 20
    const samples: number[] = []
    for (let s = 0; s < 40; s++) {
        const t = performance.now()
        for (let f = 0; f < batch; f++) fc.frame(FRAME_MS)
        samples.push((performance.now() - t) / batch)
    }
    const tracks = frameGroup.stats.tracks
    frameGroup.dispose()
    stage.remove()
    const p50 = percentile(samples, 0.5)
    const p95 = percentile(samples, 0.95)
    const line = `1,000 participants, 300 moving: commit reads ${gate.read.toFixed(2)} ms (whole commit ${whole.total.toFixed(2)} ms); all 1,000 moving: reads ${all.read.toFixed(2)} ms (whole commit ${wholeAll.total.toFixed(2)} ms); 300 nested movers (${tracks} tracks): frame p50 ${p50.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms (batches of ${batch})`
    if (!(gate.read <= 4) || !(p95 <= 2)) {
        throw new Error(`cost gate failed: ${line}`)
    }
    return line
}
