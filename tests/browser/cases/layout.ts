// Layout engine in real browsers on a manual clock: every frame of every node
// against the independent oracle (ARCHITECTURE.md §11), plus snaps, reduced
// motion, lifecycle, byte-exact restore and read discipline (plan T4.3).
import {
    ani,
    isAniError,
    type TimingFunction,
    timing,
} from '@freestylejs/ani-core'
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
    type LayoutStats,
    shareElement,
    supportsViewTransition,
    viewTransition,
} from '@freestylejs/ani-layout'
import {
    expectedBox,
    expectedCrossfade,
    expectedRadiusBlend,
    maxDiff,
    type OBox,
    type OTrackSpec,
} from '../../../packages/layout/src/__tests__/oracle'
import { measure } from '../../../packages/layout/src/dom'
import { expectClose, expectEqual } from './assert'

export const pageOptions = {}

export const knownFailures: Record<string, string> = {}

/** Cases that measure time: never run under coverage instrumentation. */
export const timed = ['COST', 'SCALE']

const FRAME_MS = 16
const DT = FRAME_MS / 1000
/** Per-frame tolerance against the oracle (§11). */
const TOL = 0.5

function pageBox(element: Element): OBox {
    const r = element.getBoundingClientRect()
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }
}

const CORNER_PROPERTIES = [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
] as const

function radiusTokens(value: string): string[] {
    const tokens: string[] = []
    let depth = 0
    let current = ''
    for (const ch of value) {
        if (ch === '(') depth += 1
        if (ch === ')') depth -= 1
        if (ch === ' ' && depth === 0) {
            if (current) tokens.push(current)
            current = ''
        } else {
            current += ch
        }
    }
    if (current) tokens.push(current)
    return tokens
}

function radiusLength(token: string, basis: number): number {
    const direct = Number.parseFloat(token)
    if (!token.startsWith('calc(')) {
        return token.endsWith('%') ? (direct * basis) / 100 : direct
    }
    let sign = 1
    let value = 0
    for (const part of token.slice(5, -1).trim().split(/\s+/)) {
        if (part === '+' || part === '-') {
            sign = part === '+' ? 1 : -1
            continue
        }
        const n = Number.parseFloat(part)
        value += sign * (part.endsWith('%') ? (n * basis) / 100 : n)
        sign = 1
    }
    return value
}

function drawnRadiusError(
    element: HTMLElement,
    expected: readonly number[]
): number {
    const drawn = pageBox(element)
    const style = getComputedStyle(element)
    let worst = 0
    CORNER_PROPERTIES.forEach((property, corner) => {
        const parts = radiusTokens(style.getPropertyValue(property))
        const x = radiusLength(parts[0]!, element.offsetWidth)
        const y = radiusLength(parts[1] ?? parts[0]!, element.offsetHeight)
        worst = Math.max(
            worst,
            Math.abs(
                (x * drawn.w) / element.offsetWidth - expected[corner * 2]!
            ),
            Math.abs(
                (y * drawn.h) / element.offsetHeight - expected[corner * 2 + 1]!
            )
        )
    })
    return worst
}

function node(parent: HTMLElement, css: string): HTMLElement {
    const element = document.createElement('div')
    element.style.cssText = `position: absolute; box-sizing: border-box; ${css}`
    parent.append(element)
    return element
}

/** The four computed corner declarations converted back to on-screen x/y radii. */
function screenRadii(element: HTMLElement): number[] {
    const style = getComputedStyle(element)
    const box = pageBox(element)
    const sx = box.w / element.offsetWidth
    const sy = box.h / element.offsetHeight
    return [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
    ].flatMap((value) => {
        const parts = value.split(' ')
        const resolve = (part: string, size: number) =>
            Number.parseFloat(part) * (part.includes('%') ? size / 100 : 1)
        const x = resolve(parts[0]!, element.offsetWidth)
        const y = resolve(parts[1] ?? parts[0]!, element.offsetHeight)
        return [x * sx, y * sy]
    })
}

function expectRadii(
    element: HTMLElement,
    want: readonly number[],
    label: string
): number {
    const got = screenRadii(element)
    const tolerance = navigator.userAgent.includes('Firefox') ? 0.03 : 0.01
    let worst = 0
    for (let i = 0; i < want.length; i++) {
        const error = Math.abs(got[i]! - want[i]!)
        worst = Math.max(worst, error)
        if (error > tolerance) {
            throw new Error(
                `${label}: radius ${i} is ${got[i]}, expected ${want[i]} (error ${error})`
            )
        }
    }
    return worst
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

/**
 * A track's elapsed time on the frame `elapsed` after its flush (§4.3): a
 * track from rest shows elapsed 0 on its first frame; a track planned for a
 * moving node (with a velocity) continues the last painted frame's time.
 */
function since(track: OTrackSpec, elapsed: number): number {
    return track.velocity ? elapsed + DT : elapsed
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

/**
 * Fractional boxes that scale, with percentage, mixed and px origins and an
 * inline scale: every frame within 0.05 px of the oracle. WebKit applies an
 * origin's percentage to the box snapped to device pixels (§3.1); projecting
 * about the computed origin there was off by |s − 1|·δ (0.28 px in the
 * showcase's dialog).
 */
export async function REFBOX(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.2, timing: linear } })
    try {
        const cases = [
            ['50% 50%', ''],
            ['100% 0', ''],
            ['calc(20% + 3px) 100%', ''],
            ['7px 3px', ''],
            ['50% 50%', 'transform: scale(1.5);'],
        ] as const
        const elements = cases.map(([origin, extra], i) => {
            const element = node(
                h.root,
                `left: ${10.3 + i * 0.37}px; top: ${20 + i * 130}px; width: ${70.1875 + i * 0.29}px; height: ${20.3 + i * 0.17}px; transform-origin: ${origin}; ${extra} background: #345;`
            )
            h.add(element)
            return element
        })
        const before = elements.map(pageBox)
        h.group.capture()
        elements.forEach((element, i) => {
            element.style.width = `${290.3 + i * 0.41}px`
            element.style.height = `${90.7 + i * 0.23}px`
            element.style.left = `${300.6 - i * 0.13}px`
        })
        const after = elements.map(pageBox)
        const tracks = elements.map((element, i) => {
            const style = getComputedStyle(element)
            const [ox, oy] = style.transformOrigin
                .split(' ')
                .map(Number.parseFloat)
            return spec(before[i]!, after[i]!, {
                duration: 0.2,
                timing: linear,
                fx: ox! / Number.parseFloat(style.width),
                fy: oy! / Number.parseFloat(style.height),
            })
        })
        const done = report(h.group.flush())
        let worst = 0
        const count = await frames(
            h.mc,
            40,
            (elapsed) => {
                elements.forEach((element, i) => {
                    worst = Math.max(
                        worst,
                        expectAt(
                            element,
                            expectedBox(tracks[i]!, elapsed),
                            `${cases[i]![0]}${cases[i]![1] ? ' scaled' : ''} t=${elapsed}`,
                            0.05
                        )
                    )
                })
            },
            () => done.value !== null
        )
        expectEqual(done.value, { status: 'ended', snapped: [] }, 'report')
        return `${count} frames × ${elements.length} fractional boxes, max error ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/**
 * The percentage part of a computed transform-origin from the Typed OM (§5.3),
 * which keeps `%` and `calc()` where the resolved value is px only: read only
 * where the browser snaps the reference box; `null` without a Typed OM.
 */
export async function ORIGINPCT(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position: relative; width: 300px; height: 100px;'
    document.body.append(root)
    try {
        const cases: readonly [string, readonly [number, number]][] = [
            ['50% 50%', [0.5, 0.5]],
            ['100% 0', [1, 0]],
            ['10px 3px', [0, 0]],
            ['calc(20% + 3px) 100%', [0.2, 1]],
            ['calc(30% - 2px) 0', [0.3, 0]],
            ['left bottom', [0, 1]],
            ['right 25%', [1, 0.25]],
        ]
        const typed = typeof root.computedStyleMap === 'function'
        const none = () => new Set<Element>()
        for (const [origin, want] of cases) {
            const e = node(
                root,
                `left: 0; top: 0; width: 50.3px; height: 20px; transform-origin: ${origin};`
            )
            const pct = measure(e, false, none, true).originPct
            if (typed) {
                expectClose(pct![0], want[0], 1e-9, `${origin}: x`)
                expectClose(pct![1], want[1], 1e-9, `${origin}: y`)
            } else {
                expectEqual(pct, null, `${origin}: no Typed OM`)
            }
            expectEqual(
                measure(e, false, none, false).originPct,
                null,
                `${origin}: not read where the box is exact`
            )
        }
        return typed
            ? `${cases.length} origins: percentages read from the Typed OM`
            : `no Typed OM: no percentages read (${cases.length} origins)`
    } finally {
        root.remove()
    }
}

/**
 * A moving lead removed and its successor flushed 10 ms into the frame
 * interval, as a browser does: the scope's subscription continues, so the
 * next frame (16 ms after the last) advances the new lead by a full frame
 * (§4.3). Stopping at the removal re-subscribed it at the flush, and the
 * clock gave a re-joined subscriber only the time since it joined (a held or
 * short frame). A removal that leaves nothing moving still unsubscribes
 * before the next frame, once the task's microtasks have run.
 */
export async function JOIN(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 1, timing: linear } })
    try {
        const o = pageBox(h.root)
        const a = node(
            h.root,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        const removeA = h.group.add(a, { layoutId: 'x' })
        h.group.capture()
        await h.group.flush()
        h.group.capture()
        a.style.left = '200px'
        void h.group.flush()
        await frames(h.mc, 13, noCheck)
        const left = pageBox(a)
        // the handoff happens between two frames; the capture of that task
        // measures the lead's last presented box (§5.8)
        h.mc.advance(10)
        h.group.capture()
        removeA()
        a.remove()
        const b = node(
            h.root,
            'left: 400px; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        h.add(b, { layoutId: 'x' })
        const done = report(h.group.flush())
        const track = spec(left, at(o, 400, 0, 40, 40), {
            duration: 1,
            timing: linear,
            velocity: { x: 200, y: 0, w: 0, h: 0 },
        })
        h.mc.frame(FRAME_MS - 10)
        const first = expectAt(
            b,
            expectedBox(track, DT),
            'the first frame after the handoff advances a full frame',
            0.01
        )
        let worst = first
        await frames(
            h.mc,
            80,
            (elapsed) => {
                worst = Math.max(
                    worst,
                    expectAt(
                        b,
                        expectedBox(track, 2 * DT + elapsed),
                        `t=${elapsed}`
                    )
                )
            },
            () => done.value !== null
        )
        expectEqual(done.value!.status, 'ended', 'handoff run')
        // the only mover removed: unsubscribed at the next frame
        const c = node(
            h.root,
            'left: 0; top: 100px; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        const removeC = h.group.add(c)
        h.group.capture()
        c.style.left = '200px'
        void h.group.flush()
        await frames(h.mc, 3, noCheck)
        expectEqual(h.mc.clock.size, 1, 'subscribed while it moves')
        removeC()
        expectEqual(c.style.translate, '', 'restored at the removal')
        await settleMicrotasks()
        expectEqual(h.mc.pending, 0, 'no frame requested')
        expectEqual(h.mc.clock.size, 0, 'unsubscribed before the next frame')
        return `handoff 10 ms into a frame: the next frame advances ${(expectedBox(track, DT).x - left.x).toFixed(2)} px (a full frame), the run on the oracle within ${worst.toFixed(4)} px; a lone removal unsubscribes before the next frame`
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
                        expectedBox(retarget, since(retarget, elapsed)),
                        `retarget t=${elapsed}`
                    )
                )
            },
            () => second.value !== null
        )
        expectEqual(second.value!.status, 'ended', 'second run')
        const v = (positions[1]! - positions[0]!) / DT
        const want =
            (expectedBox(retarget, 2 * DT).x - expectedBox(retarget, DT).x) / DT
        expectClose(v, want, 0.05 * Math.abs(want), 'carried velocity')
        // §4.3: the first frame after the retarget continues the motion from
        // the drawn box; it does not hold it for a frame
        expectClose(
            positions[0]! - drawn.x,
            expectedBox(retarget, DT).x - drawn.x,
            TOL,
            'first frame advances by the carried motion'
        )
        if (Math.abs(positions[0]! - drawn.x) < 1) {
            throw new Error('the retarget held a frame')
        }
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
        let opacityError = 0
        let coverageError = 0
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
                const leadOpacity = Number(getComputedStyle(detail).opacity)
                const followerOpacity = Number(getComputedStyle(card).opacity)
                const fade = expectedCrossfade(linear, elapsed / 0.3)
                opacityError = Math.max(
                    opacityError,
                    Math.abs(leadOpacity - fade.lead),
                    Math.abs(followerOpacity - fade.follower)
                )
                const coverage = 1 - (1 - leadOpacity) * (1 - followerOpacity)
                coverageError = Math.max(coverageError, Math.abs(coverage - 1))
                now = elapsed
            },
            () => done.value !== null && exited !== null
        )
        expectEqual(done.value!.status, 'ended', 'status')
        expectEqual(exited, 'exited', 'presence exit')
        if (opacityError > 1e-5)
            throw new Error(`crossfade opacity off by ${opacityError}`)
        if (coverageError > 1e-5)
            throw new Error(`crossfade coverage off by ${coverageError}`)
        if (!(exitedAt >= 0.3 - 1e-9)) {
            throw new Error(
                `presence released at ${exitedAt} s, before the 0.3 s crossfade ended`
            )
        }
        expectEqual(card.style.opacity, '0', 'follower held invisible')
        expectEqual(detail.style.cssText, detailStyle, 'lead restored')
        presence.dispose()
        return `crossfade opacity within ${opacityError.toFixed(6)}, coverage within ${coverageError.toFixed(6)}; max error ${worst.toFixed(4)} px; release at ${exitedAt.toFixed(3)} s`
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

/**
 * Logs every layout read (rect, computed style) and every inline style write
 * while `on`; with `sizes`, also every layout-size pair (`offsetWidth`, as
 * 'offset') and every Typed OM read (as 'typed'); `stats.styles` counts
 * 'style' and 'typed' together.
 */
function probeDom(sizes = false): Probe {
    const rect = Element.prototype.getBoundingClientRect
    const computed = window.getComputedStyle
    const set = CSSStyleDeclaration.prototype.setProperty
    const remove = CSSStyleDeclaration.prototype.removeProperty
    const offsetWidth = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'offsetWidth'
    )!
    const styleMap = Element.prototype.computedStyleMap
    const probe: Probe = {
        log: [],
        on: false,
        restore() {
            Element.prototype.getBoundingClientRect = rect
            window.getComputedStyle = computed
            CSSStyleDeclaration.prototype.setProperty = set
            CSSStyleDeclaration.prototype.removeProperty = remove
            if (!sizes) return
            Object.defineProperty(
                HTMLElement.prototype,
                'offsetWidth',
                offsetWidth
            )
            if (styleMap) Element.prototype.computedStyleMap = styleMap
        },
    }
    if (sizes) {
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
            ...offsetWidth,
            get(this: HTMLElement) {
                if (probe.on) probe.log.push('offset')
                return offsetWidth.get!.call(this)
            },
        })
        if (styleMap) {
            Element.prototype.computedStyleMap = function (this: Element) {
                if (probe.on) probe.log.push('typed')
                return styleMap.call(this)
            }
        }
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

/**
 * A running retarget reads before any write; a capture and a flush each read
 * one rect and one layout size per participant, driven ones included (§4.1),
 * plus computed styles for the active nodes; zero reads per frame.
 */
export async function T8(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.4, timing: linear } })
    const probe = probeDom(true)
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
        const captureBefore = h.group.stats
        h.group.capture()
        const captureReads = probe.log.filter((e) => e === 'rect').length
        const captureOffsets = probe.log.filter((e) => e === 'offset').length
        const captureStyles = probe.log.filter((e) => e === 'style').length
        const captureTyped = probe.log.filter((e) => e === 'typed').length
        probe.on = false
        const captureStats = h.group.stats
        elements[0]!.style.top = '200px'
        elements[2]!.style.top = '100px'
        probe.on = true
        probe.log.length = 0
        const statsBefore = h.group.stats
        void h.group.flush()
        probe.on = false
        const log = [...probe.log]
        const firstWrite = log.indexOf('write')
        const lateRead = log.findIndex(
            (e, i) => i > firstWrite && e !== 'write'
        )
        const rects = log.filter((e) => e === 'rect').length
        const offsets = log.filter((e) => e === 'offset').length
        const styles = log.filter((e) => e === 'style').length
        const typed = log.filter((e) => e === 'typed').length
        const statsAfter = h.group.stats
        expectEqual(frameReads, 0, 'reads on steady frames')
        expectEqual(
            firstWrite >= 0 && lateRead < 0,
            true,
            `no read after the first write (${log.join(',')})`
        )
        expectEqual(captureReads, 10, 'capture reads the 2 driven nodes too')
        expectEqual(captureOffsets, 10, 'capture reads every layout size')
        expectEqual(rects, 10, 'flush reads every rect')
        expectEqual(offsets, 10, 'flush reads every layout size')
        if (styles > 3) {
            throw new Error(
                `computed-style reads ${styles}, expected ≤ 3 active nodes`
            )
        }
        const counted = (
            from: LayoutStats,
            to: LayoutStats,
            want: { rects: number; offsets: number; styles: number },
            what: string
        ) => {
            expectEqual(
                to.rects - from.rects,
                want.rects,
                `${what} stats.rects`
            )
            expectEqual(
                to.offsets - from.offsets,
                want.offsets,
                `${what} stats.offsets`
            )
            expectEqual(
                to.styles - from.styles,
                want.styles,
                `${what} stats.styles`
            )
            expectEqual(
                to.reads - from.reads,
                want.rects + want.offsets + want.styles,
                `${what} stats.reads`
            )
        }
        counted(
            captureBefore,
            captureStats,
            {
                rects: captureReads,
                offsets: captureOffsets,
                styles: captureStyles + captureTyped,
            },
            'capture'
        )
        counted(
            statsBefore,
            statsAfter,
            { rects, offsets, styles: styles + typed },
            'flush'
        )
        expectEqual(statsAfter.holds, 0, 'stats.holds')
        h.group.finish()
        return `capture ${captureReads} rects + ${captureOffsets} sizes + ${captureStyles} styles; flush ${rects} rects + ${offsets} sizes + ${styles} styles + ${typed} Typed OM before ${log.filter((e) => e === 'write').length} writes; 0 reads in 5 steady frames`
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

function radiusTolerance(): number {
    return navigator.userAgent.includes('Firefox') ? 0.03 : 0.01
}

function expectDrawnRadius(
    element: HTMLElement,
    expected: readonly number[],
    label: string
): number {
    const error = drawnRadiusError(element, expected)
    if (error > radiusTolerance()) {
        throw new Error(
            `${label}: on-screen radius off by ${error.toFixed(4)} px`
        )
    }
    return error
}

type RadiusFlushKind = 'noop' | 'sibling' | 'retarget'

async function radiusMultiFlush(kind: RadiusFlushKind): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.5, timing: linear } })
    try {
        const element = node(
            h.root,
            'left: 0; top: 0; width: 100px; height: 50px; border-radius: 12px; transform-origin: 0 0;'
        )
        const sibling = node(
            h.root,
            'left: 400px; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        h.add(element, { radius: true })
        h.add(sibling)
        h.group.capture()
        element.style.left = '200px'
        element.style.width = '200px'
        element.style.height = '100px'
        const expectedStyle = document.createElement('div')
        expectedStyle.style.cssText = element.style.cssText
        void h.group.flush()

        const radii = [12, 12, 12, 12, 12, 12, 12, 12] as const
        let worst = 0
        await frames(h.mc, 9, () => {
            worst = Math.max(
                worst,
                expectDrawnRadius(element, radii, `${kind}: first run`)
            )
        })

        if (kind === 'noop') {
            void h.group.flush()
        } else {
            h.group.capture()
            if (kind === 'sibling') {
                sibling.style.left = '520px'
            } else {
                element.style.left = '320px'
                element.style.width = '260px'
                element.style.height = '130px'
                expectedStyle.style.left = '320px'
                expectedStyle.style.width = '260px'
                expectedStyle.style.height = '130px'
            }
            void h.group.flush()
        }

        const count = await frames(
            h.mc,
            100,
            () => {
                worst = Math.max(
                    worst,
                    expectDrawnRadius(element, radii, `${kind}: after flush`)
                )
            },
            () => h.mc.clock.size === 0
        )
        expectEqual(h.mc.clock.size, 0, `${kind}: settled`)
        expectEqual(
            element.style.cssText,
            expectedStyle.style.cssText,
            `${kind}: byte-identical inline style`
        )
        return `${kind}: ${count + 9} frames, radius within ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/** P1: a no-op second flush must keep the author's radius. */
export async function RADIUS_NOOP_FLUSH(): Promise<string> {
    return radiusMultiFlush('noop')
}

/** P1: an unrelated sibling commit must not change a moving node's radius source. */
export async function RADIUS_SIBLING_FLUSH(): Promise<string> {
    return radiusMultiFlush('sibling')
}

/** P1: a real retarget must keep the author's radius while carrying motion. */
export async function RADIUS_RETARGET_FLUSH(): Promise<string> {
    return radiusMultiFlush('retarget')
}

/** P1: percentage, elliptical, per-corner, calc and stylesheet radii survive a multi-flush run. */
export async function RADIUS_VALUE_KINDS(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.5, timing: linear } })
    try {
        const sheet = document.createElement('style')
        sheet.textContent = `
            .p1-radius-class {
                border-top-left-radius: 15% 10%;
                border-top-right-radius: 12px 6px;
                border-bottom-right-radius: 10% 20%;
                border-bottom-left-radius: 7px 9px;
            }
        `
        h.root.append(sheet)

        const percent = node(
            h.root,
            'left: 0; top: 0; width: 100px; height: 50px; border-radius: 25% / 10%; transform-origin: 0 0;'
        )
        const elliptical = node(
            h.root,
            'left: 0; top: 120px; width: 100px; height: 50px; border-radius: 24px / 12px; transform-origin: 0 0;'
        )
        const corners = node(
            h.root,
            'left: 0; top: 240px; width: 100px; height: 50px; border-radius: 4px 8px 12px 16px / 6px 10px 14px 18px; transform-origin: 0 0;'
        )
        const fromClass = node(
            h.root,
            'left: 0; top: 360px; width: 100px; height: 50px; transform-origin: 0 0;'
        )
        fromClass.className = 'p1-radius-class'

        const cases = [
            {
                element: percent,
                expected: [50, 10, 50, 10, 50, 10, 50, 10],
                label: 'percent',
            },
            {
                element: elliptical,
                expected: [24, 12, 24, 12, 24, 12, 24, 12],
                label: 'elliptical',
            },
            {
                element: corners,
                expected: [4, 6, 8, 10, 12, 14, 16, 18],
                label: 'four corners',
            },
            {
                element: fromClass,
                expected: [30, 10, 12, 6, 20, 20, 7, 9],
                label: 'stylesheet',
            },
        ] as const
        for (const entry of cases) h.add(entry.element, { radius: true })

        h.group.capture()
        cases.forEach(({ element }, i) => {
            element.style.left = '260px'
            element.style.width = '200px'
            element.style.height = '100px'
            element.style.top = `${i * 140}px`
        })
        const authored = cases.map(({ element }) => element.style.cssText)
        void h.group.flush()

        let worst = 0
        const check = (phase: string) => {
            for (const entry of cases) {
                worst = Math.max(
                    worst,
                    expectDrawnRadius(
                        entry.element,
                        entry.expected,
                        `${entry.label}: ${phase}`
                    )
                )
            }
        }
        await frames(h.mc, 9, () => check('first run'))
        void h.group.flush()
        const count = await frames(
            h.mc,
            100,
            () => check('second flush'),
            () => h.mc.clock.size === 0
        )
        expectEqual(h.mc.clock.size, 0, 'value kinds settled')
        cases.forEach(({ element }, i) => {
            expectEqual(
                element.style.cssText,
                authored[i],
                `${cases[i]!.label}: byte-identical inline style`
            )
        })

        const calc = node(
            h.root,
            'left: 0; top: 560px; width: 100px; height: 50px; border-radius: calc(10% + 2px) / calc(20% + 1px); transform-origin: 0 0;'
        )
        h.add(calc, { radius: true })
        h.group.capture()
        calc.style.left = '260px'
        calc.style.width = '200px'
        calc.style.height = '100px'
        const calcStyle = calc.style.cssText
        void h.group.flush()
        const calcRadius = [22, 21, 22, 21, 22, 21, 22, 21] as const
        let calcWorst = 0
        await frames(h.mc, 9, () => {
            calcWorst = Math.max(
                calcWorst,
                expectDrawnRadius(calc, calcRadius, 'calc first run')
            )
        })
        void h.group.flush()
        const calcCount = await frames(
            h.mc,
            100,
            () => {
                calcWorst = Math.max(
                    calcWorst,
                    expectDrawnRadius(calc, calcRadius, 'calc second flush')
                )
            },
            () => h.mc.clock.size === 0
        )
        expectEqual(
            calc.style.cssText,
            calcStyle,
            'calc byte-identical inline style'
        )
        return `${count + 9} frames × ${cases.length} value kinds within ${worst.toFixed(4)} px; calc ${calcCount + 9} frames within ${calcWorst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/** P1: a plain inline author replacement becomes the radius source at the next flush. */
export async function RADIUS_AUTHOR_CHANGE(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.5, timing: linear } })
    try {
        const element = node(
            h.root,
            'left: 0; top: 0; width: 100px; height: 50px; border-radius: 12px / 8px; transform-origin: 0 0;'
        )
        h.add(element, { radius: true })
        h.group.capture()
        element.style.left = '200px'
        element.style.width = '200px'
        element.style.height = '100px'
        const expectedStyle = document.createElement('div')
        expectedStyle.style.cssText = element.style.cssText
        void h.group.flush()

        const before = [12, 8, 12, 8, 12, 8, 12, 8] as const
        let worst = 0
        await frames(h.mc, 9, () => {
            worst = Math.max(
                worst,
                expectDrawnRadius(element, before, 'before author change')
            )
        })

        h.group.capture()
        element.style.setProperty('border-top-left-radius', '30px 10px')
        expectedStyle.style.setProperty('border-top-left-radius', '30px 10px')
        void h.group.flush()

        const after = [30, 10, 12, 8, 12, 8, 12, 8] as const
        worst = Math.max(
            worst,
            expectDrawnRadius(element, after, 'author change at flush')
        )
        const count = await frames(
            h.mc,
            100,
            () => {
                worst = Math.max(
                    worst,
                    expectDrawnRadius(element, after, 'after author change')
                )
            },
            () => h.mc.clock.size === 0
        )
        expectEqual(h.mc.clock.size, 0, 'author change settled')
        expectEqual(
            element.style.cssText,
            expectedStyle.style.cssText,
            'author change restored byte-identically'
        )
        return `${count + 9} frames, new authored corner from next flush; radius within ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/** P1/P2: reversal keeps the authored sources while continuing from the shared drawn radius. */
export async function RADIUS_CROSSFADE_REVERSAL(): Promise<string> {
    const linear = timing.linear()
    const duration = 0.4
    const h = harness({ motion: { duration, timing: linear } })
    const presenceMotion = {
        present: { translateY: 0 },
        exit: ani({
            to: { translateY: 0 },
            duration: 0.1,
            timing: linear,
        }),
    } as const
    try {
        const card = node(
            h.root,
            'left: 20px; top: 20px; width: 100px; height: 60px; border-radius: 12px; transform-origin: 0 0;'
        )
        const cardAuthoredStyle = card.style.cssText
        h.add(card, { layoutId: 'p1-radius', radius: true })
        const cardPresence = createPresence(card, presenceMotion, {
            clock: h.mc.clock,
        })
        h.group.capture()
        await h.group.flush()

        h.group.capture()
        void cardPresence.exit()
        const detail = node(
            h.root,
            'left: 300px; top: 120px; width: 320px; height: 180px; border-radius: 28px; transform-origin: 0 0;'
        )
        h.add(detail, { layoutId: 'p1-radius', radius: true })
        const detailPresence = createPresence(detail, presenceMotion, {
            clock: h.mc.clock,
        })
        void h.group.flush()

        const cardRadius = [12, 12, 12, 12, 12, 12, 12, 12] as const
        const detailRadius = [28, 28, 28, 28, 28, 28, 28, 28] as const
        let worst = 0
        let firstElapsed = 0
        const check = (want: readonly number[], phase: string, both = true) => {
            worst = Math.max(worst, expectRadii(card, want, `card ${phase}`))
            if (both)
                worst = Math.max(
                    worst,
                    expectRadii(detail, want, `detail ${phase}`)
                )
        }
        check(cardRadius, 'first fade t=0')
        await frames(h.mc, 9, (elapsed) => {
            firstElapsed = elapsed
            check(
                expectedRadiusBlend(
                    cardRadius,
                    detailRadius,
                    linear,
                    elapsed / duration
                ),
                `first fade t=${elapsed.toFixed(3)}`
            )
        })
        const reversedFrom = expectedRadiusBlend(
            cardRadius,
            detailRadius,
            linear,
            firstElapsed / duration
        )

        h.group.capture()
        void cardPresence.enter()
        void detailPresence.exit()
        const reversalStyle = document.createElement('div')
        reversalStyle.style.cssText = cardAuthoredStyle
        reversalStyle.style.transform = card.style.transform
        const reversed = report(h.group.flush())
        check(reversedFrom, 'reversal flush')
        const count = await frames(
            h.mc,
            80,
            (elapsed) =>
                check(
                    expectedRadiusBlend(
                        reversedFrom,
                        cardRadius,
                        linear,
                        (elapsed + DT) / duration
                    ),
                    `reversed fade t=${elapsed.toFixed(3)}`
                ),
            () => reversed.value !== null
        )
        expectEqual(reversed.value?.status, 'ended', 'reversed crossfade')
        check(cardRadius, 'settled lead', false)
        expectEqual(
            card.style.cssText,
            reversalStyle.style.cssText,
            'reversed lead restores byte-identical authored style'
        )
        cardPresence.dispose()
        detailPresence.dispose()
        return `${count + 9} frames across reversal, shared radius continuous and lead settles byte-identically within ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

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
            // a flush without a capture: no valid measurement of what was
            // presented (§4.4); the node that moved from its last known box
            // appears at A, the one that did not is not reported
            const h = harness()
            const a = node(
                h.root,
                'left: 0; top: 0; width: 40px; height: 40px;'
            )
            const still = node(
                h.root,
                'left: 0; top: 60px; width: 40px; height: 40px;'
            )
            h.add(a)
            h.add(still)
            h.group.capture()
            await h.group.flush()
            a.style.left = '100px'
            const r = await h.group.flush()
            expectEqual(r.status, 'stale', 'stale status')
            expectEqual(
                r.snapped.map((s) => [s.element === a, s.reason]),
                [[true, 'stale']],
                'stale'
            )
            expectEqual(a.style.translate, '', 'stale: nothing written')
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
        const needles = [
            'maxNodes',
            'cannot be animated',
            'no valid measurement',
        ]
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
        const count = await frames(h.mc, 40, noCheck, () => done.value !== null)
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

/* ───────────────────── CP4 trial regressions ───────────────────── */

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

function at(o: OBox, x: number, y: number, w: number, h: number): OBox {
    return { x: o.x + x, y: o.y + y, w, h }
}

/** J-016: unchanged and equivalent options (also inside a delay) never restart a track. */
export async function J16(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 1, timing: linear } })
    try {
        const e = node(
            h.root,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        const late = node(
            h.root,
            'left: 0; top: 100px; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        const sprung = node(
            h.root,
            'left: 0; top: 200px; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        const spring = { m: 1, k: 200, c: 20 }
        h.add(e)
        h.add(late, { motion: { delay: 0.5 } })
        h.add(sprung, { motion: { timing: timing.spring(spring) } })
        const elements = [e, late, sprung]
        const before = elements.map(pageBox)
        h.group.capture()
        for (const element of elements) element.style.left = '200px'
        const after = elements.map(pageBox)
        const done = report(h.group.flush())
        const tracks = [
            spec(before[0]!, after[0]!, { duration: 1, timing: linear }),
            spec(before[1]!, after[1]!, {
                duration: 1,
                delay: 0.5,
                timing: linear,
            }),
            spec(before[2]!, after[2]!, {
                duration: 1,
                timing: timing.spring(spring),
            }),
        ]
        // equal effective options: defaults, inherited fields, key order
        const equivalent: LayoutOptions[] = [
            {},
            { layout: true },
            { motion: { duration: 1 } },
            { motion: { delay: 0 } },
            { motion: { timing: timing.linear() } },
            { radius: false },
        ]
        let worst = 0
        let sets = 0
        await frames(
            h.mc,
            120,
            (elapsed) => {
                elements.forEach((element, i) => {
                    worst = Math.max(
                        worst,
                        expectAt(
                            element,
                            expectedBox(tracks[i]!, elapsed),
                            `${i} at ${elapsed.toFixed(3)} s`
                        )
                    )
                })
                if (Math.round(elapsed / DT) % 4 === 3) {
                    h.group.capture()
                    h.group.set(e, equivalent[sets % equivalent.length]!)
                    h.group.set(late, { motion: { delay: 0.5, duration: 1 } })
                    h.group.set(sprung, {
                        motion: {
                            timing: timing.spring({ c: 20, k: 200, m: 1 }),
                        },
                    })
                    void h.group.flush()
                    sets += 1
                }
            },
            () => done.value !== null
        )
        expectEqual(done.value!.status, 'ended', 'never interrupted')
        const defaults = await defaultTimingLeg()
        return `${sets} flushes with equivalent options (defaults, inherited fields, spring key order; inside the delay too); on the oracle, max error ${worst.toFixed(4)} px; ${defaults}`
    } finally {
        h.dispose()
    }
}

/**
 * CP6 trial J-016: under a group without a timing, an omitted timing and an
 * explicit `timing.easeOut()` are the same track; `easeIn()` is another.
 */
async function defaultTimingLeg(): Promise<string> {
    const h = harness({ motion: { duration: 1 } })
    const control = harness({ motion: { duration: 1 } })
    try {
        const css =
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        const e = node(h.root, css)
        // in view: the control's own root lies below the first one
        const c = node(h.root, css.replace('top: 0', 'top: 60px'))
        h.add(e)
        control.add(c)
        const before = pageBox(e)
        h.group.capture()
        control.group.capture()
        e.style.left = '200px'
        c.style.left = '200px'
        const after = pageBox(e)
        const done = report(h.group.flush())
        const changed = report(control.group.flush())
        const track = spec(before, after, {
            duration: 1,
            timing: timing.easeOut(),
        })
        let worst = 0
        let sets = 0
        await frames(
            h.mc,
            120,
            (elapsed) => {
                worst = Math.max(
                    worst,
                    expectAt(
                        e,
                        expectedBox(track, elapsed),
                        `default timing at ${elapsed.toFixed(3)} s`
                    )
                )
                if (Math.round(elapsed / DT) % 4 === 3) {
                    h.group.capture()
                    h.group.set(
                        e,
                        sets % 2 === 0
                            ? { motion: { timing: timing.easeOut() } }
                            : {}
                    )
                    void h.group.flush()
                    sets += 1
                }
            },
            () => done.value !== null
        )
        expectEqual(done.value!.status, 'ended', 'default timing kept')
        // a genuine change retargets
        control.mc.frame(FRAME_MS)
        control.mc.frame(FRAME_MS * 12)
        control.group.capture()
        control.group.set(c, { motion: { timing: timing.easeIn() } })
        void control.group.flush()
        await settleMicrotasks()
        expectEqual(changed.value?.status, 'interrupted', 'easeIn retargets')
        return `omitted ↔ explicit ease-out ${sets}× on the oracle within ${worst.toFixed(4)} px, ended; easeIn interrupts`
    } finally {
        h.dispose()
        control.dispose()
    }
}

/** J-017: a lead retargeted mid-crossfade keeps the asymmetric fade timeline. */
export async function J17(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 1, timing: linear } })
    try {
        const o = pageBox(h.root)
        const card = node(
            h.root,
            'left: 0; top: 0; width: 80px; height: 80px; transform-origin: 0 0; background: #366;'
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
        h.group.capture()
        await h.group.flush()
        const cardBox = pageBox(card)
        h.group.capture()
        let fadeTime = 0
        let exitedAt = -1
        void presence.exit().then(() => {
            exitedAt = fadeTime
        })
        const detail = node(
            h.root,
            'left: 200px; top: 0; width: 400px; height: 80px; transform-origin: 0 0; background: #663;'
        )
        const authoredStyle = detail.style.cssText
        h.add(detail, { layoutId: 'hero' })
        const first = report(h.group.flush())
        let opacityError = 0
        let coverageError = 0
        const checkFade = () => {
            const leadOpacity = Number(getComputedStyle(detail).opacity)
            const followerOpacity = Number(getComputedStyle(card).opacity)
            const want = expectedCrossfade(linear, fadeTime)
            opacityError = Math.max(
                opacityError,
                Math.abs(leadOpacity - want.lead),
                Math.abs(followerOpacity - want.follower)
            )
            const coverage = 1 - (1 - leadOpacity) * (1 - followerOpacity)
            coverageError = Math.max(coverageError, Math.abs(coverage - 1))
        }
        let frame = 0
        await frames(h.mc, 31, () => {
            fadeTime = frame * DT
            frame += 1
            checkFade()
        })
        const drawn = expectedBox(
            spec(cardBox, at(o, 200, 0, 400, 80), {
                duration: 1,
                timing: linear,
            }),
            30 * DT
        )
        const beforeRetarget = [
            Number(getComputedStyle(detail).opacity),
            Number(getComputedStyle(card).opacity),
        ] as const
        h.group.capture()
        detail.style.left = '400px'
        const detailStyle = authoredStyle.replace('left: 200px', 'left: 400px')
        const second = report(h.group.flush())
        expectAt(detail, drawn, 'lead continuous at the retarget')
        expectClose(
            Number(getComputedStyle(detail).opacity),
            beforeRetarget[0],
            1e-6,
            'lead opacity continuous at retarget'
        )
        expectClose(
            Number(getComputedStyle(card).opacity),
            beforeRetarget[1],
            1e-6,
            'follower opacity continuous at retarget'
        )
        await settleMicrotasks()
        expectEqual(first.value?.status, 'interrupted', 'first run')
        const track = spec(drawn, at(o, 400, 0, 400, 80), {
            duration: 1,
            timing: linear,
            velocity: { x: 200, y: 0, w: 320, h: 0 },
        })
        let worst = 0
        let restoredAt = -1
        await frames(
            h.mc,
            120,
            (elapsed) => {
                fadeTime = frame * DT
                frame += 1
                const want = expectedBox(track, since(track, elapsed))
                worst = Math.max(
                    worst,
                    expectAt(detail, want, `lead at ${elapsed.toFixed(3)} s`)
                )
                // drawn at the lead while the fade runs; then held invisible
                if (card.style.opacity !== '0') {
                    worst = Math.max(
                        worst,
                        expectAt(
                            card,
                            want,
                            `follower at ${elapsed.toFixed(3)} s`
                        )
                    )
                }
                checkFade()
                if (restoredAt < 0 && detail.style.opacity === '') {
                    restoredAt = fadeTime
                }
            },
            () => second.value !== null
        )
        if (opacityError > 1e-5)
            throw new Error(`crossfade opacity off by ${opacityError}`)
        if (coverageError > 1e-5)
            throw new Error(`crossfade coverage off by ${coverageError}`)
        if (!(exitedAt >= 1 - 1e-9 && exitedAt <= 1 + 2 * DT)) {
            throw new Error(
                `presence released at ${exitedAt} s, not at the fade's end (1 s)`
            )
        }
        if (!(restoredAt >= 1 - 1e-9 && restoredAt <= 1 + 2 * DT)) {
            throw new Error(
                `lead opacity given back at ${restoredAt} s, not at the fade's end`
            )
        }
        expectEqual(second.value!.status, 'ended', 'second run')
        expectEqual(card.style.opacity, '0', 'follower held invisible')
        expectEqual(detail.style.cssText, detailStyle, 'lead restored')
        presence.dispose()
        return `retarget at 0.48 s: asymmetric opacity within ${opacityError.toFixed(6)}, coverage within ${coverageError.toFixed(6)}; pair on the oracle within ${worst.toFixed(4)} px; release and lead opacity at ${exitedAt.toFixed(3)} s`
    } finally {
        h.dispose()
    }
}

/** J-018: restores happen in the write phase: after every flush read, in the clock's commit. */
export async function J18(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.2, timing: linear } })
    let phase = 'idle'
    const marker = {
        update() {
            phase = 'update'
        },
        commit() {
            phase = 'commit'
        },
    }
    // subscribed before the scope, so its phase is set first in each phase
    h.mc.clock.subscribe(marker)
    const probe = probeDom()
    try {
        const a = node(h.root, 'left: 0; top: 0; width: 40px; height: 40px;')
        const b = node(h.root, 'left: 0; top: 60px; width: 40px; height: 40px;')
        const c = node(
            h.root,
            'left: 0; top: 120px; width: 40px; height: 40px;'
        )
        h.add(a)
        h.add(b)
        h.add(c)
        h.group.capture()
        a.style.left = '100px'
        b.style.left = '100px'
        void h.group.flush()
        await frames(h.mc, 3, noCheck)
        // one driven node leaves the document; the other retargets
        h.group.capture()
        a.remove()
        b.style.left = '300px'
        probe.on = true
        probe.log.length = 0
        void h.group.flush()
        probe.on = false
        const log = [...probe.log]
        const firstWrite = log.indexOf('write')
        const lastRead = log.findLastIndex((e) => e !== 'write')
        expectEqual(
            firstWrite > lastRead,
            true,
            `flush: every read before every write (${log.join(',')})`
        )
        expectEqual(a.style.translate, '', 'disconnected node restored')
        // the natural end: settle writes land in the commit phase
        const phases: string[] = []
        const set = CSSStyleDeclaration.prototype.setProperty
        const remove = CSSStyleDeclaration.prototype.removeProperty
        let ticking = false
        CSSStyleDeclaration.prototype.setProperty = function (
            this: CSSStyleDeclaration,
            ...args: Parameters<CSSStyleDeclaration['setProperty']>
        ) {
            if (ticking) phases.push(`${phase}:set ${args[0]}`)
            return set.apply(this, args)
        }
        CSSStyleDeclaration.prototype.removeProperty = function (
            this: CSSStyleDeclaration,
            property: string
        ) {
            if (ticking) phases.push(`${phase}:remove ${property}`)
            return remove.call(this, property)
        }
        try {
            for (let i = 0; i < 30 && b.style.translate !== ''; i++) {
                ticking = true
                h.mc.frame(FRAME_MS)
                ticking = false
                await settleMicrotasks()
            }
        } finally {
            CSSStyleDeclaration.prototype.setProperty = set
            CSSStyleDeclaration.prototype.removeProperty = remove
        }
        const removals = phases.filter((e) => e.includes(':remove'))
        expectEqual(
            removals.length >= 2,
            true,
            `settle removed translate and scale (${phases.join(', ')})`
        )
        const outside = phases.filter((e) => !e.startsWith('commit:'))
        expectEqual(outside, [], 'every frame write in the commit phase')
        return `flush ${log.filter((e) => e !== 'write').length} reads before ${log.filter((e) => e === 'write').length} writes; ${phases.length} frame writes all in commit (${removals.length} settle removals)`
    } finally {
        probe.restore()
        h.mc.clock.unsubscribe(marker)
        h.dispose()
    }
}

/** J-019: reduced motion turned on mid-run clamps the running tracks at the next flush. */
export async function J19(): Promise<string> {
    const linear = timing.linear()
    const h = harness({
        motion: { duration: 1, timing: linear },
        reducedMotion: { maxDuration: 0.1 },
    })
    try {
        const e = node(h.root, 'left: 0; top: 0; width: 40px; height: 40px;')
        const late = node(
            h.root,
            'left: 0; top: 60px; width: 40px; height: 40px;'
        )
        h.add(e)
        h.add(late, { motion: { delay: 0.5 } })
        const o = pageBox(h.root)
        h.group.capture()
        e.style.left = '200px'
        late.style.left = '200px'
        const styles = [e.style.cssText, late.style.cssText]
        const first = report(h.group.flush())
        await frames(h.mc, 13, noCheck)
        h.mc.setReducedMotion(true)
        h.group.capture()
        const second = report(h.group.flush())
        await settleMicrotasks()
        expectEqual(
            first.value?.status,
            'interrupted',
            'the long run is replaced'
        )
        // re-planned clamped from the drawn box and velocity: the moving node
        // 1 s → 0.1 s from x 38.4 at 200 px/s; the node still in its delay
        // (at rest) 0.5 + 1 s → 1/30 + 1/15 s
        const tracks = [
            spec(at(o, 38.4, 0, 40, 40), at(o, 200, 0, 40, 40), {
                duration: 0.1,
                timing: linear,
                velocity: { x: 200, y: 0, w: 0, h: 0 },
                fx: 0.5,
                fy: 0.5,
            }),
            spec(at(o, 0, 60, 40, 40), at(o, 200, 60, 40, 40), {
                duration: 1 / 15,
                delay: 1 / 30,
                timing: linear,
                fx: 0.5,
                fy: 0.5,
            }),
        ]
        let worst = 0
        const count = await frames(
            h.mc,
            40,
            (elapsed) => {
                ;[e, late].forEach((element, i) => {
                    worst = Math.max(
                        worst,
                        expectAt(
                            element,
                            expectedBox(tracks[i]!, since(tracks[i]!, elapsed)),
                            `clamped ${i} at ${elapsed.toFixed(3)} s`
                        )
                    )
                })
            },
            () => second.value !== null
        )
        expectEqual(second.value!.status, 'ended', 'clamped run')
        if (count * DT > 0.1 + 2 * DT) {
            throw new Error(`the clamped run took ${count} frames (> 0.1 s)`)
        }
        expectEqual(e.style.cssText, styles[0], 'restored')
        expectEqual(late.style.cssText, styles[1], 'delayed node restored')
        expectEqual(h.mc.clock.size, 0, 'no subscriber')
        return `toggle at 0.19 s: the active and the delayed track re-planned clamped, on the oracle every frame within ${worst.toFixed(4)} px, end within ${count} frames (≤ 0.1 s); restored, unsubscribed`
    } finally {
        h.dispose()
    }
}

/** J-020: a lead removed while moving hands off its box and its velocity; retention expires. */
export async function J20(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 1, timing: linear } })
    try {
        const o = pageBox(h.root)
        const a = node(
            h.root,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        const removeA = h.group.add(a, { layoutId: 'x' })
        h.group.capture()
        await h.group.flush()
        h.group.capture()
        a.style.left = '200px'
        void h.group.flush()
        await frames(h.mc, 13, noCheck)
        const left = pageBox(a)
        expectClose(left.x - o.x, 0.192 * 200, 0.01, 'leaving at x')
        // the removal's task measures the lead's last presented box (§5.8)
        h.group.capture()
        removeA()
        a.remove()
        const b = node(
            h.root,
            'left: 400px; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        h.add(b, { layoutId: 'x' })
        const done = report(h.group.flush())
        const track = spec(left, at(o, 400, 0, 40, 40), {
            duration: 1,
            timing: linear,
            velocity: { x: 200, y: 0, w: 0, h: 0 },
        })
        let worst = 0
        await frames(
            h.mc,
            80,
            (elapsed) => {
                worst = Math.max(
                    worst,
                    expectAt(
                        b,
                        expectedBox(track, since(track, elapsed)),
                        `t=${elapsed}`
                    )
                )
            },
            () => done.value !== null
        )
        expectEqual(done.value!.status, 'ended', 'handoff run')
    } finally {
        h.dispose()
    }
    // a presence layer changed above the lead after the capture, before it
    // left: the handoff is the box (and the position and size velocity) the
    // capture measured, in view space as measured (§5.8)
    let carried = 0
    const c = harness({ motion: { duration: 1, timing: linear } })
    try {
        const o = pageBox(c.root)
        const parent = node(
            c.root,
            'left: 100px; top: 0; width: 300px; height: 100px; transform: scale(0.8); transform-origin: 0 0;'
        )
        const a = node(
            parent,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        c.add(parent)
        const removeA = c.group.add(a, { layoutId: 'x' })
        c.group.capture()
        await c.group.flush()
        c.group.capture()
        a.style.left = '200px'
        a.style.width = '100px'
        void c.group.flush()
        await frames(c.mc, 13, noCheck)
        // visual 100 → 260 and 32 → 80 wide under scale 0.8, at 0.192 s
        expectAt(a, at(o, 130.72, 0, 41.216, 32), 'drawn under 0.8', 0.01)
        c.group.capture()
        parent.style.transform = 'none'
        // the same poses through scale 1: local 138.4, 51.52 wide
        expectAt(a, at(o, 138.4, 0, 51.52, 40), 'drawn under 1', 0.01)
        removeA()
        a.remove()
        const b = node(
            c.root,
            'left: 400px; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        c.add(b, { layoutId: 'x' })
        const done = report(c.group.flush())
        // 200 px/s and 60 px/s locally are 160 and 48 on screen under 0.8
        const track = spec(
            at(o, 130.72, 0, 41.216, 32),
            at(o, 400, 0, 40, 40),
            {
                duration: 1,
                timing: linear,
                velocity: { x: 160, y: 0, w: 48, h: 0 },
            }
        )
        await frames(
            c.mc,
            80,
            (elapsed) => {
                carried = Math.max(
                    carried,
                    expectAt(
                        b,
                        expectedBox(track, since(track, elapsed)),
                        `carried t=${elapsed}`
                    )
                )
            },
            () => done.value !== null
        )
        expectEqual(done.value!.status, 'ended', 'carried handoff run')
        expectEqual(b.style.translate, '', 'carried handoff restored')
    } finally {
        c.dispose()
    }
    // expired: no handoff
    const g = harness({ motion: { duration: 1, timing: linear }, retain: 0.02 })
    try {
        const o = pageBox(g.root)
        const a = node(g.root, 'left: 0; top: 0; width: 40px; height: 40px;')
        const removeA = g.group.add(a, { layoutId: 'x' })
        g.group.capture()
        await g.group.flush()
        g.group.capture()
        a.style.left = '200px'
        void g.group.flush()
        await frames(g.mc, 13, noCheck)
        g.group.capture()
        removeA()
        a.remove()
        await sleep(60)
        const b = node(
            g.root,
            'left: 400px; top: 0; width: 40px; height: 40px;'
        )
        g.add(b, { layoutId: 'x' })
        g.group.capture()
        await g.group.flush()
        expectAt(b, at(o, 400, 0, 40, 40), 'no handoff after retain', 0.01)
        return `handoff at x = 38.4 with 200 px/s on the oracle every frame; captured before a parent layer change (0.8 → 1) at x = 130.72, w = 41.216 with 160 / 48 px/s, max error ${carried.toFixed(4)} px; none after retain`
    } finally {
        g.dispose()
    }
}

type End = 'settle' | 'finish' | 'dispose'

async function endRun(
    h: Harness,
    done: { value: LayoutReport | null },
    end: End
): Promise<void> {
    if (end === 'finish') h.group.finish()
    else if (end === 'dispose') h.group.dispose()
    else await frames(h.mc, 120, noCheck, () => done.value !== null)
    await settleMicrotasks()
}

/** J-021: corners owned from mid-run are saved and restored (settle, finish, dispose). */
export async function J21(): Promise<string> {
    const linear = timing.linear()
    const lines: string[] = []
    let worst = 0
    let corners = 0
    for (const end of ['settle', 'finish', 'dispose'] as const) {
        const h = harness({ motion: { duration: 0.5, timing: linear } })
        try {
            const o = pageBox(h.root)
            const e = node(
                h.root,
                'left: 0; top: 0; width: 40px; height: 40px; border-radius: 8px; transform-origin: 0 0;'
            )
            h.add(e)
            h.group.capture()
            e.style.left = '200px'
            e.style.width = '80px'
            const style = e.style.cssText
            report(h.group.flush())
            await frames(h.mc, 13, noCheck)
            h.group.capture()
            h.group.set(e, { radius: true })
            // a changed option retargets: the run to wait for is this one,
            // from the drawn box at 0.192 s and its velocity
            const done = report(h.group.flush())
            const track = spec(
                at(o, 76.8, 0, 55.36, 40),
                at(o, 200, 0, 80, 40),
                {
                    duration: 0.5,
                    timing: linear,
                    velocity: { x: 400, y: 0, w: 80, h: 0 },
                }
            )
            let k = 0
            const check = () => {
                const elapsed = k++ * DT
                const want = expectedBox(track, since(track, elapsed))
                worst = Math.max(
                    worst,
                    expectAt(e, want, `${end} at ${elapsed.toFixed(3)} s`)
                )
                // the corners counter the pose's scale: 8 px as drawn
                const corner = e.style
                    .getPropertyValue('border-top-left-radius')
                    .split(' ')
                    .map(Number.parseFloat)
                const rx = corner[0]! * (want.w / 80)
                const ry = (corner[1] ?? corner[0]!) * (want.h / 40)
                corners = Math.max(corners, Math.abs(rx - 8), Math.abs(ry - 8))
                if (!(corners <= 0.05)) {
                    throw new Error(
                        `${end} at ${elapsed.toFixed(3)} s: drawn corner ${rx} × ${ry} px, not 8 px`
                    )
                }
            }
            await frames(h.mc, 2, check)
            expectEqual(
                e.style.getPropertyPriority('border-top-left-radius'),
                'important',
                'corners owned mid-run'
            )
            if (end === 'settle') {
                await frames(h.mc, 120, check, () => done.value !== null)
                expectEqual(done.value?.status, 'ended', 'settled run')
            }
            await endRun(h, done, end)
            expectEqual(
                e.style.cssText,
                style,
                `${end}: restored byte for byte`
            )
            lines.push(end)
        } finally {
            h.dispose()
        }
    }
    return `radius turned on mid-run: on the oracle every frame within ${worst.toFixed(4)} px, drawn corners 8 px within ${corners.toFixed(4)} px; restored after ${lines.join(', ')}`
}

/** J-022: an inline authored change during a run applies after it (settle, finish, dispose). */
export async function J22(): Promise<string> {
    const linear = timing.linear()
    const lines: string[] = []
    let worst = 0
    for (const end of ['settle', 'finish', 'dispose'] as const) {
        const h = harness({ motion: { duration: 0.5, timing: linear } })
        try {
            const o = pageBox(h.root)
            const e = node(
                h.root,
                'left: 0; top: 0; width: 40px; height: 40px; translate: 4px 0px; transform-origin: 0 0;'
            )
            h.add(e)
            h.group.capture()
            e.style.left = '200px'
            const done = report(h.group.flush())
            await frames(h.mc, 13, noCheck)
            // the author writes inline mid-run (React does this on a re-render)
            e.style.translate = '20px 0px'
            e.style.scale = '1.5'
            // the inline write replaces the owned declaration until the flush in
            // this same task (no paint between). The authored values are taken
            // in as the composition to restore; the run keeps its frozen one,
            // so the track goes on unchanged (4 → 204 px)
            h.group.capture()
            void h.group.flush()
            const track = spec(at(o, 4, 0, 40, 40), at(o, 204, 0, 40, 40), {
                duration: 0.5,
                timing: linear,
            })
            let k = 13
            const check = () => {
                const elapsed = k++ * DT
                // released at the end: the authored composition applies
                const want =
                    elapsed >= 0.5
                        ? at(o, 220, 0, 60, 60)
                        : expectedBox(track, elapsed)
                worst = Math.max(
                    worst,
                    expectAt(e, want, `${end} at ${elapsed.toFixed(3)} s`)
                )
            }
            await frames(h.mc, 2, check)
            if (end === 'settle') {
                await frames(h.mc, 120, check, () => done.value !== null)
                expectEqual(done.value?.status, 'ended', 'the run goes on')
            }
            await endRun(h, done, end)
            const authored = document.createElement('div').style
            authored.translate = '20px 0px'
            expectEqual(
                e.style.translate,
                authored.translate,
                `${end}: authored translate`
            )
            expectEqual(e.style.scale, '1.5', `${end}: authored scale`)
            expectEqual(
                e.style.getPropertyPriority('translate'),
                '',
                `${end}: author's priority`
            )
            expectAt(e, at(o, 220, 0, 60, 60), `${end}: authored box`, 0.01)
            lines.push(end)
        } finally {
            h.dispose()
        }
    }
    return `inline translate 4px → 20px and scale 1 → 1.5 mid-run: the run keeps its frozen composition, on the oracle every frame within ${worst.toFixed(4)} px; applied after ${lines.join(', ')}`
}

/** J-023: unregistering or disconnecting a moving node cancels it; the rest of its run goes on. */
export async function J23(): Promise<string> {
    const linear = timing.linear()
    // the sole node of a run
    {
        const h = harness({ motion: { duration: 1, timing: linear } })
        try {
            const e = node(
                h.root,
                'left: 0; top: 0; width: 40px; height: 40px;'
            )
            const remove = h.group.add(e)
            h.group.capture()
            e.style.left = '200px'
            const style = e.style.cssText
            const done = report(h.group.flush())
            await frames(h.mc, 5, noCheck)
            remove()
            // before any frame: at the end of this task's microtasks (§4.3)
            await settleMicrotasks()
            expectEqual(
                h.mc.clock.size,
                0,
                'unsubscribed before the next frame'
            )
            expectEqual(h.group.stats.tracks, 0, 'no track left')
            expectEqual(e.style.cssText, style, 'restored at once')
            await settleMicrotasks()
            expectEqual(done.value!.status, 'disposed', 'sole node removed')
        } finally {
            h.dispose()
        }
    }
    // part of a run
    let worst = 0
    {
        const h = harness({ motion: { duration: 0.3, timing: linear } })
        try {
            const a = node(
                h.root,
                'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
            )
            const b = node(
                h.root,
                'left: 0; top: 60px; width: 40px; height: 40px; transform-origin: 0 0;'
            )
            const removeA = h.group.add(a)
            h.add(b)
            const before = pageBox(b)
            h.group.capture()
            a.style.left = '200px'
            b.style.left = '200px'
            const after = pageBox(b)
            const done = report(h.group.flush())
            const track = spec(before, after, { duration: 0.3, timing: linear })
            let reports = 0
            await frames(h.mc, 4, (elapsed) => {
                worst = Math.max(
                    worst,
                    expectAt(b, expectedBox(track, elapsed), `b t=${elapsed}`)
                )
            })
            removeA()
            await settleMicrotasks()
            expectEqual(done.value, null, 'the run goes on')
            let frame = 4
            await frames(
                h.mc,
                40,
                () => {
                    worst = Math.max(
                        worst,
                        expectAt(
                            b,
                            expectedBox(track, frame * DT),
                            `b t=${frame * DT}`
                        )
                    )
                    frame += 1
                },
                () => done.value !== null
            )
            if (done.value) reports += 1
            expectEqual(done.value!.status, 'ended', 'the rest ended')
            expectEqual(reports, 1, 'reported once')
        } finally {
            h.dispose()
        }
    }
    // disconnected, then a flush
    {
        const h = harness({ motion: { duration: 1, timing: linear } })
        try {
            const e = node(
                h.root,
                'left: 0; top: 0; width: 40px; height: 40px;'
            )
            h.add(e)
            h.group.capture()
            e.style.left = '200px'
            const done = report(h.group.flush())
            await frames(h.mc, 5, noCheck)
            e.remove()
            h.group.capture()
            await h.group.flush()
            await settleMicrotasks()
            expectEqual(done.value!.status, 'disposed', 'disconnected node')
            expectEqual(e.style.translate, '', 'restored')
            expectEqual(h.mc.clock.size, 0, 'unsubscribed')
        } finally {
            h.dispose()
        }
    }
    return `sole removal: 'disposed', restored at once, unsubscribed before the next frame; partial removal: the rest on the oracle (${worst.toFixed(4)} px), 'ended' once; disconnected: 'disposed'`
}

/** J-025: B of a driven node is what the user saw through a presence layer changed since the last flush. */
export async function J25(): Promise<string> {
    const linear = timing.linear()
    let summary = ''
    const h = harness({ motion: { duration: 1, timing: linear } })
    try {
        const o = pageBox(h.root)
        const parent = node(
            h.root,
            'left: 100px; top: 50px; width: 400px; height: 200px; transform: scale(0.8); transform-origin: 0 0;'
        )
        const child = node(
            parent,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        h.add(parent)
        h.add(child)
        h.group.capture()
        child.style.left = '200px'
        const style = child.style.cssText
        const first = report(h.group.flush())
        await frames(h.mc, 13, noCheck)
        expectAt(child, at(o, 100 + 0.8 * 38.4, 50, 32, 32), 'under scale 0.8')
        // the presence layer changes between flushes
        parent.style.transform = 'scale(1)'
        const seen = pageBox(child)
        h.group.capture()
        child.style.left = '300px'
        const second = report(h.group.flush())
        expectAt(child, seen, 'B is what the user saw (x 138.4, w 40)')
        await settleMicrotasks()
        expectEqual(first.value?.status, 'interrupted', 'first run')
        const track = spec(seen, at(o, 400, 50, 40, 40), {
            duration: 1,
            timing: linear,
            velocity: { x: 200, y: 0, w: 0, h: 0 },
        })
        let worst = 0
        await frames(
            h.mc,
            80,
            (elapsed) => {
                worst = Math.max(
                    worst,
                    expectAt(
                        child,
                        expectedBox(track, since(track, elapsed)),
                        `t=${elapsed}`
                    )
                )
            },
            () => second.value !== null
        )
        expectEqual(
            child.style.cssText,
            style.replace('200px', '300px'),
            'identity settle'
        )
        summary = `after scale 0.8 → 1: B = (${(seen.x - o.x).toFixed(1)}, w ${seen.w}); continuous, on the oracle within ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
    // the child's own layer changes under a moving parent: the parent's motion
    // stays a translation of the child (200 px/s, not 200 / 0.8)
    const m = harness({ motion: { duration: 1, timing: linear } })
    try {
        const o = pageBox(m.root)
        const parent = node(
            m.root,
            'left: 0; top: 0; width: 300px; height: 100px; transform-origin: 0 0;'
        )
        const child = node(
            parent,
            'left: 0; top: 0; width: 40px; height: 40px; transform: scale(0.8); transform-origin: 0 0;'
        )
        m.add(parent)
        m.add(child)
        m.group.capture()
        parent.style.left = '200px'
        void m.group.flush()
        await frames(m.mc, 13, noCheck)
        expectAt(child, at(o, 38.4, 0, 32, 32), 'riding under 0.8', 0.01)
        child.style.transform = 'scale(1)'
        const seen = at(o, 38.4, 0, 40, 40)
        expectAt(child, seen, 'drawn through scale 1', 0.01)
        m.group.capture()
        child.style.left = '100px'
        const second = report(m.group.flush())
        expectAt(child, seen, 'B is what the user saw (x 38.4, w 40)', 0.01)
        const track = spec(seen, at(o, 300, 0, 40, 40), {
            duration: 1,
            timing: linear,
            velocity: { x: 200, y: 0, w: 0, h: 0 },
        })
        let worst = 0
        const count = await frames(
            m.mc,
            120,
            (elapsed) => {
                worst = Math.max(
                    worst,
                    expectAt(
                        child,
                        expectedBox(track, since(track, elapsed)),
                        `own layer t=${elapsed}`
                    )
                )
            },
            () => second.value !== null
        )
        expectEqual(second.value?.status, 'ended', 'own-layer run')
        expectEqual(child.style.translate, '', 'own-layer translate restored')
        expectEqual(child.style.scale, '', 'own-layer scale restored')
        return `${summary}; own scale 0.8 → 1 under a parent moving 200 px/s: B = (38.4, w 40) with vx 200, ${count} frames on the oracle within ${worst.toFixed(4)} px, identity settle`
    } finally {
        m.dispose()
    }
}

/**
 * CP6 trial J-032: a track is drawn in the visual space of the flush that
 * planned it (§11 oracle). A child retargeted under a kept parent whose
 * presence layer changed since the parent's flush starts from what the user
 * saw and follows its own track; the parent keeps the layer over its track.
 */
export async function J32(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 1, timing: linear } })
    try {
        const o = pageBox(h.root)
        const parent = node(
            h.root,
            'left: 0; top: 0; width: 200px; height: 100px; transform: scaleX(0.8); transform-origin: 0 0;'
        )
        const child = node(
            parent,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        h.add(parent)
        h.add(child)
        h.group.capture()
        parent.style.left = '200px'
        void h.group.flush()
        // the trial's repro: the first frame starts the track, the next is at 0.2 s
        h.mc.frame(FRAME_MS)
        h.mc.frame(200)
        await settleMicrotasks()
        // the presence layer changes; the parent's track is kept
        parent.style.transform = 'scaleX(1)'
        const seen = pageBox(child)
        expectAt(child, at(o, 40, 0, 40, 40), 'drawn through scaleX(1)', 0.01)
        h.group.capture()
        child.style.left = '100px'
        const second = report(h.group.flush())
        expectAt(child, seen, 'B is what the user saw (x 40, w 40)')
        const track = spec(seen, at(o, 300, 0, 40, 40), {
            duration: 1,
            timing: linear,
            velocity: { x: 200, y: 0, w: 0, h: 0 },
        })
        let worst = 0
        let parentWorst = 0
        let frame = 0
        let noop: { value: LayoutReport | null } | null = null
        const count = await frames(
            h.mc,
            120,
            (elapsed) => {
                const tp = Math.min(1, 0.2 + DT + elapsed)
                const px = 200 * tp
                // from frame 10 the layer is back at scaleX(0.8): the child
                // shows the change since its own flush (0.8 about the
                // parent's drawn left), the parent none since its flush
                const back = frame >= 10
                const k = back ? 0.8 : 1
                const own = expectedBox(track, since(track, elapsed))
                worst = Math.max(
                    worst,
                    expectAt(
                        child,
                        at(o, px + k * (own.x - o.x - px), 0, k * 40, 40),
                        `child t=${elapsed.toFixed(3)}`
                    )
                )
                parentWorst = Math.max(
                    parentWorst,
                    expectAt(
                        parent,
                        at(o, px, 0, back ? 160 : 200, 100),
                        `parent t=${elapsed.toFixed(3)}`
                    )
                )
                if (frame === 9) parent.style.transform = 'scaleX(0.8)'
                if (frame === 20) {
                    // nothing changed but the layer: both tracks are kept
                    h.group.capture()
                    noop = report(h.group.flush())
                }
                frame += 1
            },
            () => second.value !== null
        )
        expectEqual(
            (noop as { value: LayoutReport | null } | null)?.value?.status,
            'no-change',
            'the no-op flush keeps both tracks'
        )
        expectEqual(second.value?.status, 'ended', 'child run')
        expectEqual(child.style.translate, '', 'child translate restored')
        expectEqual(child.style.scale, '', 'child scale restored')
        return `child retargeted under a kept parent after scaleX 0.8 → 1: B = (${(seen.x - o.x).toFixed(1)}, w ${seen.w}) with vx 200; layer back to 0.8 mid-run and a no-op flush (both kept); ${count} frames: child on its track with the layers since its flush within ${worst.toFixed(4)} px, parent within ${parentWorst.toFixed(4)} px; identity settle`
    } finally {
        h.dispose()
    }
}

/**
 * CP8 trial J-032: the parent, retargeted after its layer changed (scaleX
 * 0.8 → 1), moves the child's CSS box while the child's A in its own flush's
 * space is unchanged. The child's rect at the flush, under the poses last
 * written, measures the parent's unpresented move (J = D − B is 100 px), and
 * its parent's inner scale changed since planning, so the child retargets
 * from exactly what the user saw, with its drawn velocity (§5.7 path 3).
 */
export async function J32B(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 1, timing: linear } })
    try {
        const o = pageBox(h.root)
        const parent = node(
            h.root,
            'left: 0; top: 0; width: 200px; height: 40px; transform: scaleX(0.8); transform-origin: 0 0;'
        )
        const child = node(
            parent,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        h.add(parent)
        h.add(child)
        h.group.capture()
        parent.style.left = '200px'
        child.style.left = '100px'
        void h.group.flush()
        h.mc.frame(FRAME_MS)
        h.mc.frame(200)
        await settleMicrotasks()
        parent.style.transform = 'scaleX(1)'
        const seen = pageBox(child)
        expectAt(child, at(o, 60, 0, 40, 40), 'drawn through scaleX(1)', 0.01)
        h.group.capture()
        // the child's A in its own flush's space stays (280, w 32)
        parent.style.left = '300px'
        child.style.left = '-25px'
        const second = report(h.group.flush())
        expectAt(child, seen, 'the child starts where the user saw it')
        // drawn at R + 1.25 (C − R): 200 + 1.25 · (280 − 200) px/s
        const childTrack = spec(seen, at(o, 275, 0, 40, 40), {
            duration: 1,
            timing: linear,
            velocity: { x: 300, y: 0, w: 0, h: 0 },
        })
        const parentTrack = spec(
            at(o, 40, 0, 200, 40),
            at(o, 300, 0, 200, 40),
            {
                duration: 1,
                timing: linear,
                velocity: { x: 200, y: 0, w: 0, h: 0 },
            }
        )
        let worst = 0
        let parentWorst = 0
        let frame = 0
        let noop: { value: LayoutReport | null } | null = null
        const count = await frames(
            h.mc,
            120,
            (elapsed) => {
                const R =
                    expectedBox(parentTrack, since(parentTrack, elapsed)).x -
                    o.x
                worst = Math.max(
                    worst,
                    expectAt(
                        child,
                        expectedBox(childTrack, since(childTrack, elapsed)),
                        `child t=${elapsed.toFixed(3)}`
                    )
                )
                parentWorst = Math.max(
                    parentWorst,
                    expectAt(
                        parent,
                        at(o, R, 0, 200, 40),
                        `parent t=${elapsed.toFixed(3)}`
                    )
                )
                if (frame === 20) {
                    h.group.capture()
                    noop = report(h.group.flush())
                }
                frame += 1
            },
            () => second.value !== null
        )
        expectEqual(
            (noop as { value: LayoutReport | null } | null)?.value?.status,
            'no-change',
            'the no-op flush keeps both tracks'
        )
        expectEqual(second.value?.status, 'ended', 'parent and child run')
        expectAt(child, at(o, 275, 0, 40, 40), 'child at rest', 0.01)
        expectEqual(child.style.translate, '', 'child translate restored')
        expectEqual(child.style.scale, '', 'child scale restored')
        return `parent retargeted after scaleX 0.8 → 1 moves the child's CSS box: the measured jump retargets the child from (${(seen.x - o.x).toFixed(1)}, w ${seen.w}) at 300 px/s; ${count} frames: child within ${worst.toFixed(4)} px, parent within ${parentWorst.toFixed(4)} px; no-op flush kept both; identity settle`
    } finally {
        h.dispose()
    }
}

/**
 * CP8 trial J-035: an anchored child planned after its parent's layer
 * changed is placed on the parent's anchor point as it draws the parent: in
 * its own flush's space, through the parent's current layer. With `depth`,
 * the layer is a grandparent's and the parent is a kept participant between.
 */
async function anchoredUnderLayer(depth: 1 | 2): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 1, timing: linear } })
    try {
        const o = pageBox(h.root)
        const scaled = node(
            h.root,
            'left: 0; top: 0; width: 200px; height: 100px; transform: scaleX(0.8); transform-origin: 0 0;'
        )
        const parent =
            depth === 1
                ? scaled
                : node(
                      scaled,
                      'left: 0; top: 0; width: 200px; height: 100px; transform-origin: 0 0;'
                  )
        const child = node(
            parent,
            'left: 80px; top: 30px; width: 40px; height: 40px;'
        )
        h.add(scaled)
        if (depth === 2) h.add(parent)
        h.add(child, { layoutAnchor: { x: 0.5, y: 0.5 } })
        h.group.capture()
        scaled.style.left = '200px'
        void h.group.flush()
        h.mc.frame(FRAME_MS)
        h.mc.frame(200)
        await settleMicrotasks()
        scaled.style.transform = 'scaleX(1)'
        const seen = pageBox(child)
        expectAt(child, at(o, 120, 30, 40, 40), 'centred on the parent', 0.01)
        h.group.capture()
        child.style.left = '70px'
        child.style.width = '60px'
        const second = report(h.group.flush())
        expectAt(child, seen, 'B is what the user saw (x 120, w 40)')
        let worst = 0
        let frame = 0
        let noop: { value: LayoutReport | null } | null = null
        const count = await frames(
            h.mc,
            120,
            (elapsed) => {
                const t = Math.min(1, elapsed)
                const R = 200 * Math.min(1, 0.2 + DT + elapsed)
                const W = 40 + 20 * t - 20 * t * (1 - t) ** 2
                worst = Math.max(
                    worst,
                    expectAt(
                        child,
                        at(o, R + 100 - W / 2, 30, W, 40),
                        `child t=${elapsed.toFixed(3)}`
                    )
                )
                expectAt(
                    parent,
                    at(o, R, 0, 200, 100),
                    `parent t=${elapsed.toFixed(3)}`
                )
                if (frame === 20) {
                    h.group.capture()
                    noop = report(h.group.flush())
                }
                frame += 1
            },
            () => second.value !== null
        )
        expectEqual(
            (noop as { value: LayoutReport | null } | null)?.value?.status,
            'no-change',
            'the no-op flush keeps every track'
        )
        expectEqual(second.value?.status, 'ended', 'child run')
        await frames(h.mc, 30, noCheck)
        expectAt(child, at(o, 270, 30, 60, 40), 'child at rest', 0.01)
        expectEqual(child.style.translate, '', 'child translate restored')
        expectEqual(child.style.scale, '', 'child scale restored')
        return `${depth === 1 ? 'parent' : 'grandparent'} layer 0.8 → 1, centred child 40 → 60 wide: B = (${(seen.x - o.x).toFixed(1)}, w ${seen.w}); ${count} frames centred on the parent's visual centre within ${worst.toFixed(4)} px; no-op flush kept every track; identity settle`
    } finally {
        h.dispose()
    }
}

export function J35(): Promise<string> {
    return anchoredUnderLayer(1)
}

export function J35B(): Promise<string> {
    return anchoredUnderLayer(2)
}

/**
 * CP8 re-trial J-037: a continuing crossfade follower keeps the space of the
 * flush that started it, and is drawn at its lead as its own space draws the
 * lead. The pair runs under a parent whose layer changes mid-run (scaleX
 * 0.8 → 1); a no-op flush must change nothing ('noop'). The same run without
 * it is the control; 'moving' puts the layer on a moving grandparent, with a
 * plain participant between; 'retarget' moves the lead instead, so the lead
 * starts in the new space while its follower continues in the old one.
 */
async function crossfadeUnderLayer(
    variant: 'noop' | 'control' | 'moving' | 'retarget'
): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 1, timing: linear } })
    try {
        const o = pageBox(h.root)
        const scaled = node(
            h.root,
            'left: 100px; top: 0; width: 300px; height: 100px; transform: scaleX(0.8); transform-origin: 0 0;'
        )
        h.add(scaled)
        let parent = scaled
        if (variant === 'moving') {
            parent = node(
                scaled,
                'left: 0; top: 0; width: 300px; height: 100px; transform-origin: 0 0;'
            )
            h.add(parent)
        }
        const old = node(
            parent,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        h.add(old, { layoutId: 'pair' })
        const presence = createPresence(
            old,
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
        h.group.capture()
        await h.group.flush()
        h.group.capture()
        let tau = 0
        let exitedAt = -1
        void presence.exit().then(() => {
            exitedAt = tau
        })
        const lead = node(
            parent,
            'left: 200px; top: 0; width: 100px; height: 40px; transform-origin: 0 0;'
        )
        let authored = lead.style.cssText
        h.add(lead, { layoutId: 'pair' })
        // 'moving': the grandparent moves 100 → 200 with the pair
        if (variant === 'moving') scaled.style.left = '200px'
        const run = report(h.group.flush())
        h.mc.frame(FRAME_MS)
        h.mc.frame(200)
        await settleMicrotasks()
        scaled.style.transform = 'scaleX(1)'
        // the track in the 0.8 space: x 100 + 160τ (moving: 100 + 260τ), w
        // 32 + 48τ; the layer, 1 / 0.8 about the scaled element's drawn left
        const slope = variant === 'moving' ? 300 : 200
        const want = (t: number) =>
            at(o, 100 + slope * Math.min(1, t), 0, 40 + 60 * Math.min(1, t), 40)
        expectAt(lead, want(0.2), 'lead after the layer change', 0.01)
        expectAt(old, want(0.2), 'follower after the layer change', 0.01)
        let current = run
        let path = want
        if (variant === 'retarget') {
            // from (140, w 52) at vx 200, vw 60 to (350, w 100), in the new space
            h.group.capture()
            lead.style.left = '250px'
            authored = authored.replace('left: 200px', 'left: 250px')
            current = report(h.group.flush())
            await settleMicrotasks()
            expectEqual(run.value?.status, 'interrupted', 'the first run')
            expectAt(lead, want(0.2), 'lead at the retarget', 0.01)
            expectAt(old, want(0.2), 'follower at the retarget', 0.01)
            const track = spec(want(0.2), at(o, 350, 0, 100, 40), {
                duration: 1,
                timing: linear,
                velocity: { x: 200, y: 0, w: 60, h: 0 },
            })
            path = (t: number) => expectedBox(track, since(track, t - 0.2 - DT))
        } else if (variant !== 'control') {
            h.group.capture()
            const noop = report(h.group.flush())
            await settleMicrotasks()
            expectEqual(noop.value?.status, 'no-change', 'the no-op flush')
            expectAt(lead, want(0.2), 'lead after the no-op flush', 0.01)
            expectAt(old, want(0.2), 'follower after the no-op flush', 0.01)
        }
        let worst = 0
        let fade = 0
        let restoredAt = -1
        const count = await frames(
            h.mc,
            120,
            (elapsed) => {
                tau = 0.2 + DT + elapsed
                const box = path(tau)
                worst = Math.max(
                    worst,
                    expectAt(lead, box, `lead τ=${tau.toFixed(3)}`)
                )
                const lo = Number(getComputedStyle(lead).opacity)
                if (old.style.opacity !== '0') {
                    worst = Math.max(
                        worst,
                        expectAt(old, box, `follower τ=${tau.toFixed(3)}`)
                    )
                    const fo = Number(getComputedStyle(old).opacity)
                    const wantFade = expectedCrossfade(linear, tau)
                    fade = Math.max(
                        fade,
                        Math.abs(lo - wantFade.lead),
                        Math.abs(fo - wantFade.follower)
                    )
                }
                if (restoredAt < 0 && lead.style.opacity === '') {
                    restoredAt = tau
                }
            },
            () => current.value !== null && exitedAt >= 0
        )
        if (fade > 0.01) throw new Error(`opacities off the fade by ${fade}`)
        if (!(exitedAt >= 1 - 1e-9 && exitedAt <= 1 + 2 * DT)) {
            throw new Error(
                `presence released at τ ${exitedAt}, not at the fade's end`
            )
        }
        if (!(restoredAt >= 1 - 1e-9 && restoredAt <= 1 + 2 * DT)) {
            throw new Error(
                `lead opacity given back at τ ${restoredAt}, not at the fade's end`
            )
        }
        if (variant === 'retarget') {
            await frames(h.mc, 120, noCheck, () => lead.style.translate === '')
            expectAt(lead, at(o, 350, 0, 100, 40), 'lead at rest', 0.01)
        } else {
            expectAt(lead, want(1), 'lead at rest', 0.01)
        }
        expectEqual(current.value?.status, 'ended', 'the run')
        expectEqual(lead.style.cssText, authored, 'lead restored')
        expectEqual(old.style.opacity, '0', 'follower held invisible')
        presence.dispose()
        await frames(h.mc, 3, noCheck)
        expectEqual(h.mc.clock.size, 0, 'zero subscribers')
        const on =
            variant === 'retarget'
                ? 'the retargeted lead track (vx 200, vw 60 → 350, w 100)'
                : `x = 100 + ${slope}τ, w = 40 + 60τ`
        return `${variant}: pair at (${(want(0.2).x - o.x).toFixed(1)}, w ${want(0.2).w.toFixed(1)}) after the layer change${variant === 'control' ? '' : variant === 'retarget' ? ' and the lead retarget' : ' and the no-op flush'}; ${count} frames on ${on} within ${worst.toFixed(4)} px; opacities within ${fade.toFixed(4)}; release at τ ${exitedAt.toFixed(3)}; zero subscribers`
    } finally {
        h.dispose()
    }
}

export function J37(): Promise<string> {
    return crossfadeUnderLayer('noop')
}

export function J37Control(): Promise<string> {
    return crossfadeUnderLayer('control')
}

export function J37Moving(): Promise<string> {
    return crossfadeUnderLayer('moving')
}

export function J37Retarget(): Promise<string> {
    return crossfadeUnderLayer('retarget')
}

/**
 * CP8 re-trial J-038: a crossfade that starts after the follower's moving
 * parent changed its layer (scaleX 0.8 → 1), with the new lead outside that
 * parent ('external'): the follower is drawn at its lead as is, so both start
 * at the follower's visual B. 'shared' puts the lead in the same parent;
 * 'unchanged' keeps the layer at 0.8.
 */
async function crossfadeAcrossLayer(
    variant: 'external' | 'shared' | 'unchanged'
): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 1, timing: linear } })
    try {
        const o = pageBox(h.root)
        const parent = node(
            h.root,
            'left: 100px; top: 0; width: 300px; height: 100px; transform: scaleX(0.8); transform-origin: 0 0;'
        )
        h.add(parent)
        const old = node(
            parent,
            'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
        )
        h.add(old, { layoutId: 'pair' })
        const presence = createPresence(
            old,
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
        h.group.capture()
        await h.group.flush()
        // the parent moves 100 → 200 over 1 s; at 0.2 s its layer becomes 1
        h.group.capture()
        parent.style.left = '200px'
        const moved = report(h.group.flush())
        h.mc.frame(FRAME_MS)
        h.mc.frame(200)
        await settleMicrotasks()
        const width = variant === 'unchanged' ? 32 : 40
        const wide = variant === 'unchanged' ? 240 : 300
        if (variant !== 'unchanged') parent.style.transform = 'scaleX(1)'
        const b = at(o, 120, 0, width, 40)
        expectAt(old, b, 'follower B', 0.01)
        // the handoff: a new crossfade from B at the parent's vx 100
        h.group.capture()
        let tau = -1
        let exitedAt = -1
        void presence.exit().then(() => {
            exitedAt = tau
        })
        const lead =
            variant === 'shared'
                ? node(
                      parent,
                      'left: 200px; top: 0; width: 100px; height: 40px; transform-origin: 0 0;'
                  )
                : node(
                      h.root,
                      'left: 400px; top: 0; width: 100px; height: 40px; transform-origin: 0 0;'
                  )
        const authored = lead.style.cssText
        h.add(lead, { layoutId: 'pair' })
        const run = report(h.group.flush())
        await settleMicrotasks()
        expectAt(lead, b, 'lead at the handoff', 0.01)
        expectAt(old, b, 'follower at the handoff', 0.01)
        expectEqual(old.style.opacity, '1', 'follower opacity at the handoff')
        expectEqual(lead.style.opacity, '0', 'lead opacity at the handoff')
        // A: the shared parent's A is 200 wide 300 (layer 1); the root's is 400
        const a = at(o, 400, 0, 100, 40)
        const track = spec(b, a, {
            duration: 1,
            timing: linear,
            velocity: { x: 100, y: 0, w: 0, h: 0 },
        })
        let worst = 0
        let fade = 0
        let restoredAt = -1
        const count = await frames(
            h.mc,
            120,
            (elapsed) => {
                // the fade runs on its lead's timeline (§4.3, §5.6)
                tau = since(track, elapsed)
                // the kept parent stays on its own timeline, under its layer
                const p = 0.2 + DT + elapsed
                worst = Math.max(
                    worst,
                    expectAt(
                        parent,
                        at(o, 100 + 100 * Math.min(1, p), 0, wide, 100),
                        `parent τ=${p.toFixed(3)}`
                    )
                )
                const box = expectedBox(track, since(track, elapsed))
                worst = Math.max(
                    worst,
                    expectAt(lead, box, `lead τ=${tau.toFixed(3)}`)
                )
                const lo = Number(getComputedStyle(lead).opacity)
                if (old.style.opacity !== '0') {
                    worst = Math.max(
                        worst,
                        expectAt(old, box, `follower τ=${tau.toFixed(3)}`)
                    )
                    const fo = Number(getComputedStyle(old).opacity)
                    const wantFade = expectedCrossfade(linear, tau)
                    fade = Math.max(
                        fade,
                        Math.abs(lo - wantFade.lead),
                        Math.abs(fo - wantFade.follower)
                    )
                }
                if (restoredAt < 0 && lead.style.opacity === '') {
                    restoredAt = tau
                }
            },
            () => run.value !== null && exitedAt >= 0
        )
        if (fade > 0.01) throw new Error(`opacities off the fade by ${fade}`)
        if (!(exitedAt >= 1 - 1e-9 && exitedAt <= 1 + 2 * DT)) {
            throw new Error(
                `presence released at τ ${exitedAt}, not at the fade's end`
            )
        }
        if (!(restoredAt >= 1 - 1e-9 && restoredAt <= 1 + 2 * DT)) {
            throw new Error(
                `lead opacity given back at τ ${restoredAt}, not at the fade's end`
            )
        }
        expectEqual(run.value?.status, 'ended', 'the crossfade run')
        expectEqual(
            JSON.stringify(run.value?.snapped ?? []),
            '[]',
            'nothing snapped'
        )
        expectAt(lead, a, 'lead at rest', 0.01)
        expectEqual(lead.style.cssText, authored, 'lead restored')
        expectEqual(old.style.opacity, '0', 'follower held invisible')
        expectEqual(moved.value?.status, 'interrupted', 'the parent run')
        presence.dispose()
        await frames(h.mc, 3, noCheck)
        expectEqual(h.mc.clock.size, 0, 'zero subscribers')
        return `${variant}: pair at B (120, w ${width}) at the handoff; ${count} frames on the track from B at vx 100 to (400, w 100) within ${worst.toFixed(4)} px; opacities within ${fade.toFixed(4)}; release at τ ${exitedAt.toFixed(3)}; zero subscribers`
    } finally {
        h.dispose()
    }
}

export function J38(): Promise<string> {
    return crossfadeAcrossLayer('external')
}

export function J38Shared(): Promise<string> {
    return crossfadeAcrossLayer('shared')
}

export function J38Unchanged(): Promise<string> {
    return crossfadeAcrossLayer('unchanged')
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

/**
 * Cost at 50, 300 and 1,000 participants (plan T6.3): the whole commit with
 * every participant moving, and the steady frame of that run (a third are
 * parents of two nested children each).
 */
export async function SCALE(): Promise<string> {
    const linear = timing.linear()
    document.body.style.margin = '0'
    const lines: string[] = []
    let worstFrame = 0
    for (const count of [50, 300, 1000]) {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            maxNodes: 5000,
            motion: { duration: 1000, timing: linear },
        })
        const stage = document.createElement('div')
        stage.style.cssText =
            'position: relative; width: 1200px; height: 800px;'
        document.body.append(stage)
        const moved: HTMLElement[] = []
        for (let i = 0; moved.length < count; i++) {
            const parent = node(
                stage,
                `left: ${(i % 24) * 50}px; top: ${Math.floor(i / 24) * 40}px; width: 46px; height: 36px;`
            )
            group.add(parent)
            moved.push(parent)
            for (let j = 0; j < 2 && moved.length < count; j++) {
                const child = node(
                    parent,
                    `left: ${j * 22}px; top: 4px; width: 20px; height: 20px;`
                )
                group.add(child)
                moved.push(child)
            }
        }
        const commits: number[] = []
        const frameTimes: number[] = []
        for (let round = 0; round < 7; round++) {
            await macrotask()
            void stage.offsetHeight
            const t = performance.now()
            group.capture()
            for (const e of moved) {
                e.style.left = `${Number.parseFloat(e.style.left) + (round % 2 === 0 ? 3 : -3)}px`
            }
            void group.flush()
            commits.push(performance.now() - t)
            mc.frames(2)
            const batch = 10
            for (let s = 0; s < 6; s++) {
                const f = performance.now()
                for (let k = 0; k < batch; k++) mc.frame(FRAME_MS)
                frameTimes.push((performance.now() - f) / batch)
            }
            group.finish()
        }
        const tracks = count
        const p95 = percentile(frameTimes, 0.95)
        worstFrame = Math.max(worstFrame, p95)
        lines.push(
            `${count} (${tracks} moving): commit ${percentile(commits, 0.5).toFixed(2)} ms, frame p50 ${percentile(frameTimes, 0.5).toFixed(3)} / p95 ${p95.toFixed(3)} ms`
        )
        group.dispose()
        stage.remove()
        expectEqual(mc.clock.size, 0, `${count}: no subscriber left`)
    }
    return lines.join('; ')
}

/**
 * E-1 (CP5 fix proof): a presence transform animating under a running
 * track is a visual layer; a flush that changes no layout box (a re-render)
 * changes nothing on screen and replaces no track, whether the presence
 * change alone moves the box below or above the threshold.
 */
export async function PRESENCE_LAYER(): Promise<string> {
    const linear = timing.linear()
    const run = async (
        presence: (s: number) => string,
        noOpFlush: boolean
    ): Promise<{ boxes: OBox[]; status: string }> => {
        const h = harness({ motion: { duration: 1, timing: linear } })
        try {
            const e = node(
                h.root,
                'left: 0; top: 0; width: 300px; height: 48px; transform-origin: 50% 100%;'
            )
            e.style.transform = presence(0.9)
            h.add(e, { layout: 'position' })
            h.group.capture()
            e.style.top = '56px'
            const done = report(h.group.flush())
            const boxes: OBox[] = []
            for (let k = 0; k < 70; k++) {
                // the presence advances 0.9 → 1 over the first ten frames
                if (k <= 10) e.style.transform = presence(0.9 + k * 0.01)
                if (noOpFlush && k === 5) {
                    h.group.capture()
                    void h.group.flush()
                }
                h.mc.frame(FRAME_MS)
                boxes.push(pageBox(e))
                await settleMicrotasks()
            }
            return { boxes, status: done.value?.status ?? 'running' }
        } finally {
            h.dispose()
        }
    }
    const lines: string[] = []
    for (const [name, presence] of [
        ['scaleX', (s: number) => `scaleX(${s})`],
        [
            'scaleX + translateY',
            (s: number) =>
                `translateY(${((1 - s) * 140).toFixed(3)}px) scaleX(${s})`,
        ],
    ] as const) {
        const control = await run(presence, false)
        const test = await run(presence, true)
        let worst = 0
        control.boxes.forEach((box, k) => {
            worst = Math.max(worst, maxDiff(box, test.boxes[k]!))
        })
        if (!(worst <= 0.02)) {
            throw new Error(
                `${name}: a no-op flush changed the trajectory by ${worst} px`
            )
        }
        expectEqual(
            test.status,
            control.status,
            `${name}: the run is not replaced`
        )
        lines.push(`${name} ${worst.toFixed(4)} px`)
    }
    return `a no-op flush while the presence animates: trajectory identical to the run without it (${lines.join(', ')}); the track is kept`
}

function errorCode(fn: () => void): string {
    try {
        fn()
    } catch (error) {
        return isAniError(error) ? error.code : String(error)
    }
    return 'no error'
}

/** Group options are validated at creation; re-adding an element replaces its options. */
export async function OPTIONS(): Promise<string> {
    const invalid: [string, unknown][] = [
        ['not an object', 3],
        ['null', null],
        ['unknown key', { maxnodes: 10 }],
        ['clock', { clock: {} }],
        ['threshold < 0', { threshold: -1 }],
        ['threshold NaN', { threshold: Number.NaN }],
        ['threshold Infinity', { threshold: Number.POSITIVE_INFINITY }],
        ['maxNodes fraction', { maxNodes: 1.5 }],
        ['maxNodes < 0', { maxNodes: -1 }],
        ['retain < 0', { retain: -0.1 }],
        ['retain NaN', { retain: Number.NaN }],
        ['onSnap', { onSnap: 'log' }],
        ['engine', { engine: 'css' }],
        ['reducedMotion', { reducedMotion: 'sometimes' }],
        ['motion', { motion: { duration: -1 } }],
    ]
    for (const [name, options] of invalid) {
        expectEqual(
            errorCode(() => createLayoutGroup(options as LayoutGroupOptions)),
            'ANI_INVALID_OPTIONS',
            name
        )
    }
    // the boundaries are valid
    createLayoutGroup({ threshold: 0, maxNodes: 0, retain: 0 }).dispose()
    createLayoutGroup({ retain: Number.POSITIVE_INFINITY }).dispose()

    // re-adding replaces the options of the same participant; either remove
    // removes it once
    const h = harness({ motion: { duration: 0.4, timing: timing.linear() } })
    const a = node(h.root, 'left: 0; top: 0; width: 40px; height: 40px;')
    const removeFirst = h.group.add(a, { layout: 'size' })
    const removeSecond = h.group.add(a, { layout: 'position' })
    try {
        h.group.capture()
        a.style.left = '200px'
        a.style.width = '80px'
        void h.group.flush()
        h.mc.frame(FRAME_MS)
        expectEqual(h.group.stats.tracks, 1, 'one participant')
        // 'position': the width is not animated (scale stays the identity)
        expectEqual(a.style.scale, '1', 'the second options apply')
        if (a.style.translate === '') throw new Error('no translate drawn')
        removeFirst()
        expectEqual(h.group.stats.tracks, 0, 'removed')
        expectEqual(a.style.cssText.includes('translate'), false, 'restored')
        removeSecond()
        await settleMicrotasks()
        expectEqual(h.mc.clock.size, 0, 'no subscriber left')
    } finally {
        h.dispose()
    }
    return `${invalid.length} invalid group options throw ANI_INVALID_OPTIONS; boundaries accepted; re-add replaces options, either remove removes once`
}

/** Every cause `measure` snaps as 'unsupported', named in the warning; look-alikes still animate. */
export async function CAUSES(): Promise<string> {
    const sheet = document.createElement('style')
    sheet.textContent = `
@keyframes ani-causes-slide { from { translate: 0 0 } to { translate: 10px 0 } }
@keyframes ani-causes-grow { from { scale: 1 } to { scale: 1.1 } }
@keyframes ani-causes-fade { from { opacity: 1 } to { opacity: 0.5 } }`
    document.head.append(sheet)
    const warnings = silenceWarnings()
    const BOX = 'left: 0; top: 0; width: 40px; height: 40px;'
    // the element moves with an untransitioned wrapper: a transition on
    // `all` would otherwise transition the move itself
    const snaps: [string, string, string][] = [
        [
            'display: inline',
            'position: static; display: inline;',
            'display: inline',
        ],
        [
            'transform rotate',
            `${BOX} transform: rotate(10deg);`,
            'rotation, skew',
        ],
        ['transform skew', `${BOX} transform: skewX(10deg);`, 'rotation, skew'],
        [
            'transition scale',
            `${BOX} transition: scale 0.2s;`,
            'CSS transition or animation',
        ],
        [
            'transition all',
            `${BOX} transition: all 0.2s;`,
            'CSS transition or animation',
        ],
        [
            'transition delay only',
            `${BOX} transition: translate 0s 0.1s;`,
            'CSS transition or animation',
        ],
        [
            'animation translate',
            `${BOX} animation: ani-causes-slide 10s linear infinite;`,
            'CSS transition or animation',
        ],
        [
            'animation scale',
            `${BOX} animation: ani-causes-grow 10s linear infinite;`,
            'CSS transition or animation',
        ],
    ]
    const animates: [string, string][] = [
        ['transition opacity', `${BOX} transition: opacity 0.2s;`],
        ['transition translate 0s', `${BOX} transition: translate 0s;`],
        [
            'transitions listed, translate 0s',
            `${BOX} transition: opacity 0.2s, translate 0s;`,
        ],
        [
            'animation opacity',
            `${BOX} animation: ani-causes-fade 10s linear infinite;`,
        ],
    ]
    try {
        for (const [name, css, cause] of snaps) {
            warnings.messages.length = 0
            const h = harness()
            const wrapper = node(
                h.root,
                'left: 0; top: 0; width: 300px; height: 100px;'
            )
            const e = node(wrapper, css)
            e.textContent = 'text'
            h.add(e)
            try {
                h.group.capture()
                wrapper.style.left = '200px'
                const r = await h.group.flush()
                expectEqual(
                    r.snapped.map((s) => s.reason),
                    ['unsupported'],
                    name
                )
                expectEqual(e.style.translate, '', `${name}: nothing written`)
                expectEqual(h.mc.clock.size, 0, `${name}: no subscriber`)
                if (!warnings.messages.some((m) => m.includes(cause))) {
                    throw new Error(
                        `${name}: no warning naming "${cause}": ${warnings.messages.join(' | ')}`
                    )
                }
            } finally {
                h.dispose()
            }
        }
        for (const [name, css] of animates) {
            const h = harness({ motion: { duration: 0.2 } })
            const e = node(h.root, css)
            h.add(e)
            try {
                h.group.capture()
                e.style.left = '200px'
                const run = report(h.group.flush())
                h.mc.frame(FRAME_MS)
                expectEqual(h.group.stats.tracks, 1, `${name}: animates`)
                h.group.finish()
                await settleMicrotasks()
                expectEqual(run.value?.status, 'ended', `${name}: ended`)
                expectEqual(run.value?.snapped.length, 0, `${name}: no snap`)
            } finally {
                h.dispose()
            }
        }
        return `${snaps.length} causes snap 'unsupported' and name themselves in the warning; ${animates.length} look-alikes animate`
    } finally {
        warnings.restore()
        sheet.remove()
    }
}

/** P2-C: a live shared-id crossfade blends one on-screen elliptical radius on both layers. */
export async function P2RadiusCrossfade(): Promise<string> {
    const linear = timing.linear()
    const duration = 0.4
    const h = harness({ motion: { duration, timing: linear } })
    try {
        const old = node(
            h.root,
            'left: 20px; top: 20px; width: 80px; height: 40px; border-radius: 20px / 12px;'
        )
        h.add(old, { layoutId: 'radius-live', radius: true })
        const presence = createPresence(
            old,
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
        h.group.capture()
        await h.group.flush()

        h.group.capture()
        void presence.exit()
        const lead = node(
            h.root,
            'left: 300px; top: 100px; width: 200px; height: 100px; border-radius: 8px / 24px;'
        )
        h.add(lead, { layoutId: 'radius-live', radius: true })
        const run = report(h.group.flush())
        const from = [20, 12, 20, 12, 20, 12, 20, 12]
        const to = [8, 24, 8, 24, 8, 24, 8, 24]
        let worst = 0
        const check = (elapsed: number) => {
            const want = expectedRadiusBlend(
                from,
                to,
                linear,
                elapsed / duration
            )
            worst = Math.max(
                worst,
                expectRadii(lead, want, `lead radius t=${elapsed.toFixed(3)}`),
                expectRadii(
                    old,
                    want,
                    `follower radius t=${elapsed.toFixed(3)}`
                )
            )
        }
        check(0)
        await frames(h.mc, 40, check, () => run.value !== null)
        expectEqual(run.value?.status, 'ended', 'radius crossfade run')
        presence.dispose()
        return `live shared radius 20×12 → 8×24 on both layers within ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/** P2-C amendment 3: a style-only resting radius change is captured at B for retained and live handoffs. */
export async function P2RadiusCaptureAccuracy(): Promise<string> {
    const linear = timing.linear()
    const duration = 0.4
    let worst = 0

    {
        const h = harness({ motion: { duration, timing: linear }, retain: 1 })
        try {
            const old = node(
                h.root,
                'left: 20px; top: 20px; width: 100px; height: 60px; border-radius: 14px / 10px;'
            )
            const removeOld = h.group.add(old, {
                layoutId: 'radius-capture-retained',
                radius: true,
            })
            h.group.capture()
            await h.group.flush()
            old.style.borderRadius = '30px / 18px'
            h.group.capture()
            removeOld()
            old.remove()
            const lead = node(
                h.root,
                'left: 300px; top: 100px; width: 220px; height: 120px; border-radius: 8px / 24px;'
            )
            h.add(lead, {
                layoutId: 'radius-capture-retained',
                radius: true,
            })
            const run = report(h.group.flush())
            const from = [30, 18, 30, 18, 30, 18, 30, 18]
            const to = [8, 24, 8, 24, 8, 24, 8, 24]
            worst = Math.max(
                worst,
                expectRadii(lead, from, 'retained style-only handoff t=0')
            )
            await frames(
                h.mc,
                40,
                (elapsed) => {
                    worst = Math.max(
                        worst,
                        expectRadii(
                            lead,
                            expectedRadiusBlend(
                                from,
                                to,
                                linear,
                                elapsed / duration
                            ),
                            `retained style-only handoff t=${elapsed.toFixed(3)}`
                        )
                    )
                },
                () => run.value !== null
            )
            expectEqual(run.value?.status, 'ended', 'retained capture run')
        } finally {
            h.dispose()
        }
    }

    {
        const h = harness({ motion: { duration, timing: linear } })
        try {
            const old = node(
                h.root,
                'left: 20px; top: 20px; width: 100px; height: 60px; border-radius: 12px / 9px;'
            )
            h.add(old, {
                layoutId: 'radius-capture-live',
                radius: true,
            })
            const presence = createPresence(
                old,
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
            h.group.capture()
            await h.group.flush()
            old.style.borderRadius = '28px / 16px'
            h.group.capture()
            void presence.exit()
            const lead = node(
                h.root,
                'left: 320px; top: 120px; width: 240px; height: 140px; border-radius: 6px / 22px;'
            )
            h.add(lead, { layoutId: 'radius-capture-live', radius: true })
            const run = report(h.group.flush())
            const from = [28, 16, 28, 16, 28, 16, 28, 16]
            const to = [6, 22, 6, 22, 6, 22, 6, 22]
            worst = Math.max(
                worst,
                expectRadii(lead, from, 'live lead style-only handoff t=0'),
                expectRadii(old, from, 'live follower style-only handoff t=0')
            )
            await frames(
                h.mc,
                40,
                (elapsed) => {
                    const want = expectedRadiusBlend(
                        from,
                        to,
                        linear,
                        elapsed / duration
                    )
                    worst = Math.max(
                        worst,
                        expectRadii(
                            lead,
                            want,
                            `live lead style-only handoff t=${elapsed.toFixed(3)}`
                        ),
                        expectRadii(
                            old,
                            want,
                            `live follower style-only handoff t=${elapsed.toFixed(3)}`
                        )
                    )
                },
                () => run.value !== null
            )
            expectEqual(run.value?.status, 'ended', 'live capture run')
            presence.dispose()
        } finally {
            h.dispose()
        }
    }

    return `style-only resting radius captured for retained and live handoffs within ${worst.toFixed(4)} px`
}

/** P2-C read discipline: capture snapshots shared radii; flush and frame reads stay base. */
export async function P2RadiusReadDiscipline(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.2, timing: linear } })
    const probe = probeDom()
    try {
        const shared = [
            node(
                h.root,
                'left: 20px; top: 20px; width: 80px; height: 40px; border-radius: 20px / 12px;'
            ),
            node(
                h.root,
                'left: 120px; top: 20px; width: 80px; height: 40px; border-radius: 14px;'
            ),
            node(
                h.root,
                'left: 220px; top: 20px; width: 80px; height: 40px; border-radius: 25%;'
            ),
        ]
        const sibling = node(
            h.root,
            'left: 20px; top: 120px; width: 80px; height: 40px;'
        )
        const plain = node(
            h.root,
            'left: 120px; top: 120px; width: 80px; height: 40px; border-radius: 9px;'
        )
        shared.forEach((element, i) =>
            h.add(element, {
                layoutId: `radius-read-discipline-${i}`,
                radius: true,
            })
        )
        h.add(sibling)
        h.add(plain, { radius: true })

        probe.log.length = 0
        probe.on = true
        h.group.capture()
        probe.on = false
        const captureLog = [...probe.log]
        const captureRects = captureLog.filter(
            (entry) => entry === 'rect'
        ).length
        const captureStyles = captureLog.filter(
            (entry) => entry === 'style'
        ).length
        expectEqual(captureRects, 5, 'capture rect reads')
        expectEqual(captureStyles, 3, 'capture shared-radius style reads')
        expectEqual(
            captureLog.slice(0, 5).every((entry) => entry === 'rect') &&
                captureLog.slice(5).every((entry) => entry === 'style'),
            true,
            `capture rects before styles (${captureLog.join(',')})`
        )

        probe.log.length = 0
        probe.on = true
        await h.group.flush()
        probe.on = false
        const noopRects = probe.log.filter((entry) => entry === 'rect').length
        const noopStyles = probe.log.filter((entry) => entry === 'style').length
        expectEqual(noopRects, 5, 'no-op flush rect reads match base')
        expectEqual(noopStyles, 0, 'no-op flush style reads match base')

        h.group.capture()
        sibling.style.left = '160px'
        probe.log.length = 0
        probe.on = true
        const second = report(h.group.flush())
        probe.on = false
        const rects = probe.log.filter((entry) => entry === 'rect').length
        const styles = probe.log.filter((entry) => entry === 'style').length
        expectEqual(rects, 5, 'flush rect reads match base')
        expectEqual(styles, 1, 'flush computed-style reads match base')

        probe.log.length = 0
        probe.on = true
        for (let i = 0; i < 5; i++) h.mc.frame(FRAME_MS)
        probe.on = false
        const frameReads = probe.log.filter((entry) => entry !== 'write').length
        expectEqual(frameReads, 0, 'steady frame reads')

        h.group.finish()
        await settleMicrotasks()
        expectEqual(second.value?.status, 'ended', 'sibling run')
        return `capture ${captureRects} rects then ${captureStyles} styles; no-op flush ${noopRects} rects/${noopStyles} styles; unrelated flush ${rects} rects/${styles} style; frames ${frameReads} reads`
    } finally {
        probe.restore()
        h.dispose()
    }
}

/** P2-B: reduced-motion jump mid-crossfade finishes the fade endpoint before presence unmount. */
export async function P2ReducedMidCrossfade(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.4, timing: linear } })
    try {
        const old = node(
            h.root,
            'left: 20px; top: 20px; width: 80px; height: 80px; opacity: 1;'
        )
        const oldStyle = old.style.cssText
        const removeOld = h.group.add(old, { layoutId: 'reduced-crossfade' })
        const presence = createPresence(
            old,
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
        h.group.capture()
        await h.group.flush()

        h.group.capture()
        let exited: string | null = null
        void presence.exit().then((value) => {
            exited = value
        })
        const lead = node(
            h.root,
            'left: 300px; top: 100px; width: 240px; height: 180px; opacity: 1;'
        )
        const leadStyle = lead.style.cssText
        h.add(lead, { layoutId: 'reduced-crossfade' })
        const running = report(h.group.flush())
        // Let presence's own 0.1 s exit finish while layout still holds it
        // for the longer 0.4 s crossfade.
        await frames(h.mc, 10, noCheck)

        h.mc.setReducedMotion(true)
        h.group.capture()
        const reduced = await h.group.flush()
        await settleMicrotasks()

        expectEqual(reduced.status, 'reduced', 'reduced flush status')
        expectEqual(running.value?.status, 'ended', 'active crossfade finished')
        expectEqual(old.isConnected, true, 'follower still connected')
        expectEqual(old.style.opacity, '0', 'follower held at opacity 0')
        expectEqual(
            getComputedStyle(old).opacity,
            '0',
            'follower computed opacity 0'
        )
        expectEqual(lead.style.cssText, leadStyle, 'lead restored')
        expectEqual(exited, 'exited', 'presence released')
        expectEqual(h.mc.clock.size, 0, 'no clock subscription')

        const expectedUnmountStyle = document.createElement('div')
        expectedUnmountStyle.style.cssText = oldStyle
        expectedUnmountStyle.style.transform = old.style.transform
        removeOld()
        old.remove()
        await settleMicrotasks()
        expectEqual(
            old.style.cssText,
            expectedUnmountStyle.style.cssText,
            'follower unmount restores byte-identically'
        )
        expectEqual(h.mc.clock.size, 0, 'unmount leaves no clock subscription')
        presence.dispose()
        return 'reduced mid-crossfade holds follower at 0, releases presence, restores byte-identically on unmount'
    } finally {
        h.dispose()
    }
}

/** P2-C: a removed lead carries its resolved percentage/elliptical radius through retain. */
export async function P2RadiusRetained(): Promise<string> {
    const linear = timing.linear()
    const duration = 0.4
    const h = harness({ motion: { duration, timing: linear }, retain: 1 })
    try {
        const old = node(
            h.root,
            'left: 20px; top: 20px; width: 80px; height: 40px; border-radius: 50% / 25%;'
        )
        const removeOld = h.group.add(old, {
            layoutId: 'radius-retained',
            radius: true,
        })
        h.group.capture()
        await h.group.flush()

        h.group.capture()
        removeOld()
        old.remove()
        const lead = node(
            h.root,
            'left: 300px; top: 100px; width: 200px; height: 100px; border-radius: 10% / 50%;'
        )
        h.add(lead, { layoutId: 'radius-retained', radius: true })
        const run = report(h.group.flush())
        const from = [40, 10, 40, 10, 40, 10, 40, 10]
        const to = [20, 50, 20, 50, 20, 50, 20, 50]
        let worst = 0
        const check = (elapsed: number) => {
            const want = expectedRadiusBlend(
                from,
                to,
                linear,
                elapsed / duration
            )
            worst = Math.max(
                worst,
                expectRadii(
                    lead,
                    want,
                    `retained radius t=${elapsed.toFixed(3)}`
                )
            )
        }
        check(0)
        await frames(h.mc, 40, check, () => run.value !== null)
        expectEqual(run.value?.status, 'ended', 'retained radius run')
        return `retained %/elliptical radius 40×10 → 20×50 within ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/** P2-C: `radius: false` on either side of a shared handoff turns the blend off. */
export async function P2RadiusOptOut(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.4, timing: linear } })
    try {
        const old = node(
            h.root,
            'left: 20px; top: 20px; width: 80px; height: 40px; border-radius: 20px / 12px;'
        )
        h.add(old, { layoutId: 'radius-optout', radius: false })
        const presence = createPresence(
            old,
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
        h.group.capture()
        await h.group.flush()

        h.group.capture()
        void presence.exit()
        const lead = node(
            h.root,
            'left: 300px; top: 100px; width: 200px; height: 100px; border-radius: 8px / 24px;'
        )
        h.add(lead, { layoutId: 'radius-optout', radius: true })
        const run = report(h.group.flush())
        const own = [8, 24, 8, 24, 8, 24, 8, 24]
        let worst = expectRadii(lead, own, 'opt-out radius t=0')
        await frames(
            h.mc,
            40,
            (elapsed) => {
                worst = Math.max(
                    worst,
                    expectRadii(
                        lead,
                        own,
                        `opt-out radius t=${elapsed.toFixed(3)}`
                    )
                )
            },
            () => run.value !== null
        )
        expectEqual(run.value?.status, 'ended', 'opt-out radius run')
        presence.dispose()
        return `radius: false on one side does not blend; lead stays 8×24 within ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/** A shared `layoutId` owns its corners by default: both sides omit `radius` and still blend. */
export async function RadiusSharedDefault(): Promise<string> {
    const linear = timing.linear()
    const h = harness({ motion: { duration: 0.4, timing: linear } })
    try {
        const old = node(
            h.root,
            'left: 20px; top: 20px; width: 80px; height: 40px; border-radius: 20px / 12px;'
        )
        h.add(old, { layoutId: 'radius-default' })
        const presence = createPresence(
            old,
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
        h.group.capture()
        await h.group.flush()

        h.group.capture()
        void presence.exit()
        const lead = node(
            h.root,
            'left: 300px; top: 100px; width: 200px; height: 100px; border-radius: 8px / 24px;'
        )
        h.add(lead, { layoutId: 'radius-default' })
        const run = report(h.group.flush())
        const from = [20, 12, 20, 12, 20, 12, 20, 12]
        const own = [8, 24, 8, 24, 8, 24, 8, 24]
        let worst = expectRadii(lead, from, 'default radius t=0')
        await frames(
            h.mc,
            40,
            (elapsed) => {
                if (elapsed >= 0.4) return
                worst = Math.max(
                    worst,
                    expectRadii(
                        lead,
                        expectedRadiusBlend(from, own, linear, elapsed / 0.4),
                        `default radius t=${elapsed.toFixed(3)}`
                    )
                )
            },
            () => run.value !== null
        )
        expectEqual(run.value?.status, 'ended', 'default radius run')
        presence.dispose()
        worst = Math.max(
            worst,
            expectRadii(lead, own, 'default radius settled')
        )
        return `omitted radius on both sides blends 20×12 → 8×24 within ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}

/** P2-C: retargeting the lead mid-blend restarts radius mixing from the radius currently drawn. */
export async function P2RadiusRetarget(): Promise<string> {
    const linear = timing.linear()
    const duration = 0.4
    const h = harness({ motion: { duration, timing: linear } })
    try {
        const old = node(
            h.root,
            'left: 20px; top: 20px; width: 80px; height: 40px; border-radius: 20px / 12px;'
        )
        h.add(old, { layoutId: 'radius-retarget', radius: true })
        const presence = createPresence(
            old,
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
        h.group.capture()
        await h.group.flush()

        h.group.capture()
        void presence.exit()
        const lead = node(
            h.root,
            'left: 300px; top: 100px; width: 200px; height: 100px; border-radius: 8px / 24px;'
        )
        const leadAuthoredStyle = lead.style.cssText
        h.add(lead, { layoutId: 'radius-retarget', radius: true })
        const first = report(h.group.flush())
        const from = [20, 12, 20, 12, 20, 12, 20, 12]
        const to = [8, 24, 8, 24, 8, 24, 8, 24]
        let worst = 0
        let firstElapsed = 0
        const check = (
            want: readonly number[],
            phase: string,
            follower = true
        ) => {
            worst = Math.max(worst, expectRadii(lead, want, `lead ${phase}`))
            if (follower)
                worst = Math.max(
                    worst,
                    expectRadii(old, want, `follower ${phase}`)
                )
        }
        check(from, 'first blend t=0')
        await frames(h.mc, 9, (elapsed) => {
            firstElapsed = elapsed
            check(
                expectedRadiusBlend(from, to, linear, elapsed / duration),
                `first blend t=${elapsed.toFixed(3)}`
            )
        })
        const retargetFrom = expectedRadiusBlend(
            from,
            to,
            linear,
            firstElapsed / duration
        )

        h.group.capture()
        lead.style.left = '420px'
        lead.style.width = '240px'
        lead.style.height = '120px'
        const settledStyle = document.createElement('div')
        settledStyle.style.cssText = leadAuthoredStyle
        settledStyle.style.left = '420px'
        settledStyle.style.width = '240px'
        settledStyle.style.height = '120px'
        const second = report(h.group.flush())
        check(retargetFrom, 'retarget flush')
        await settleMicrotasks()
        expectEqual(first.value?.status, 'interrupted', 'first radius run')

        const fadeRemaining = duration - firstElapsed
        const count = await frames(
            h.mc,
            80,
            (elapsed) => {
                const sinceRetarget = elapsed + DT
                const want = expectedRadiusBlend(
                    retargetFrom,
                    to,
                    linear,
                    sinceRetarget / duration
                )
                check(
                    want,
                    `retarget blend t=${elapsed.toFixed(3)}`,
                    sinceRetarget <= fadeRemaining + 1e-9
                )
            },
            () => second.value !== null
        )
        expectEqual(second.value?.status, 'ended', 'retarget radius run')
        check(to, 'settled lead', false)
        expectEqual(
            lead.style.cssText,
            settledStyle.style.cssText,
            'retargeted lead restores byte-identical authored style'
        )
        presence.dispose()
        return `${count + 9} frames across retarget, shared radius continuous and lead settles byte-identically within ${worst.toFixed(4)} px`
    } finally {
        h.dispose()
    }
}
