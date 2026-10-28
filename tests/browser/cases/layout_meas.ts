// L-MEAS, L-HAND, L-KEY and L-DOC rows (ARCHITECTURE §3.2, §4, §5.7, §5.8,
// §11.2): measured presentation in real browsers on a manual clock. Every
// frame is checked in view space (`getBoundingClientRect()`) against an
// independent expectation: the closed-form oracle of the track the authority
// prescribes, translated by the camera motion presented since its flush, or
// the measured presented box.
import {
    ani,
    createClock,
    isAniError,
    type TimingFunction,
    timing,
} from '@freestylejs/ani-core'
import type { ManualClock } from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    createPresence,
    type LayoutDiagnostic,
    type LayoutReport,
    layoutRuntime,
    type SnapReason,
} from '@freestylejs/ani-layout'
import {
    expectedBox,
    expectedCrossfade,
    maxDiff,
    type OBox,
    type OTrackSpec,
} from '../../../packages/layout/src/__tests__/oracle'
import { expectEqual, nextFrame } from './assert'
import {
    expectViewAt,
    type Harness,
    harness,
    node,
    report,
    settleMicrotasks,
    shiftBox,
    silenceWarnings,
    viewBox,
} from './layout_kit'

/** `L_MEAS_14_CLASSIC` runs in a Firefox of its own with classic scrollbars (`run.ts`). */
export const pageOptions = { L_MEAS_14_CLASSIC: { classicScrollbars: true } }

/**
 * Rows the current engine cannot pass yet. Each entry names what is missing;
 * the P2 gate requires this record to be empty.
 */
export const knownFailures: Record<string, string> = {}

const FRAME_MS = 16
const DT = FRAME_MS / 1000
/** Duration of every row's motion, seconds. */
const D = 0.32

/* ───────────────────────── helpers ───────────────────────── */

type Names = Map<Element, string>
type Holder = { value: LayoutReport | null }
type Snap = { readonly element: HTMLElement; readonly reason: SnapReason }

/** A timing track from `before` to `after` (transform origin 0 0 unless given). */
function spec(
    before: OBox,
    after: OBox,
    rest: Partial<OTrackSpec> = {}
): OTrackSpec {
    return {
        before,
        after,
        velocity: null,
        fx: 0,
        fy: 0,
        mode: true,
        duration: D,
        delay: 0,
        timing: timing.easeOut(),
        ...rest,
    }
}

/**
 * Elapsed time of a track planned at rest after `f` frames since its flush
 * (§4.5): `f = 0` is the flush's own write (B), and the first frame has
 * `dt = 0`.
 */
function restAt(f: number): number {
    return Math.max(0, f - 1) * DT
}

/** Elapsed time of a track planned for a moving node (§4.5): it continues the last painted frame. */
function movingAt(f: number): number {
    return f * DT
}

/** Box velocity (px/s per channel) of `fn` at `t`, by a central difference of the closed form. */
function velocityOf(fn: (t: number) => OBox, t: number): OBox {
    const h = 1e-5
    const a = fn(t - h)
    const b = fn(t + h)
    return {
        x: (b.x - a.x) / (2 * h),
        y: (b.y - a.y) / (2 * h),
        w: (b.w - a.w) / (2 * h),
        h: (b.h - a.h) / (2 * h),
    }
}

/** One manual-clock frame, then promise reactions. */
async function step(mc: ManualClock): Promise<void> {
    mc.frame(FRAME_MS)
    await settleMicrotasks()
}

function nameOf(names: Names, element: Element): string {
    return names.get(element) ?? `<${element.tagName.toLowerCase()}>`
}

function snapList(names: Names, snapped: readonly Snap[]): string[] {
    return snapped.map((s) => `${nameOf(names, s.element)}: ${s.reason}`).sort()
}

function describeReport(names: Names, r: LayoutReport): string {
    return `status '${r.status}', snapped [${snapList(names, r.snapped).join(', ')}]`
}

/** Throws unless the report is exactly `status` with exactly the `snapped` set. */
function expectReport(
    names: Names,
    r: LayoutReport,
    status: LayoutReport['status'],
    snapped: readonly Snap[],
    label: string
): void {
    const got = describeReport(names, r)
    const want = describeReport(names, { status, snapped })
    if (got !== want) {
        throw new Error(`${label}: report is ${got}, expected ${want}`)
    }
}

/** Throws unless the `onSnap` calls were exactly `snapped`; clears them. */
function expectSnapCalls(
    names: Names,
    calls: Snap[],
    snapped: readonly Snap[],
    label: string
): void {
    const got = snapList(names, calls)
    const want = snapList(names, snapped)
    calls.length = 0
    if (got.join('|') !== want.join('|')) {
        throw new Error(
            `${label}: onSnap calls [${got.join(', ')}], expected [${want.join(', ')}]`
        )
    }
}

/** A flush that plans tracks resolves when they settle, never before a frame. */
async function expectRunning(
    names: Names,
    run: Holder,
    label: string
): Promise<void> {
    await settleMicrotasks()
    if (run.value !== null) {
        throw new Error(
            `${label}: the run resolved before any frame (${describeReport(names, run.value)}); a flush that plans tracks resolves when they settle`
        )
    }
}

/** A flush that plans no track resolves at once; `why` says why none is expected. */
async function expectNoRun(
    run: Holder,
    label: string,
    why: string
): Promise<LayoutReport> {
    await settleMicrotasks()
    if (run.value === null) {
        throw new Error(
            `${label}: the flush started a run (its report is still pending), expected no new track: ${why}`
        )
    }
    return run.value
}

/** Every owned declaration is back: the inline style is the author's, byte for byte. */
function expectRestored(element: HTMLElement, css: string, label: string) {
    expectEqual(element.style.cssText, css, `${label}: inline style restored`)
}

/**
 * The author's inline style of an element read while it is driven: its
 * `cssText` without the engine's owned declarations: its pose (`translate`,
 * `scale`) and, under the scroll-anchoring fallback of §11.4 S2 (Firefox),
 * `overflow-anchor` (§6). Only for elements whose author sets none of them.
 */
function authorText(element: HTMLElement): string {
    const probe = document.createElement('div')
    probe.style.cssText = element.style.cssText
    probe.style.removeProperty('translate')
    probe.style.removeProperty('scale')
    probe.style.removeProperty('overflow-anchor')
    return probe.style.cssText
}

/** Checks each `[element, box, name]` and returns the largest error. */
function expectAll(
    label: string,
    list: readonly (readonly [Element, OBox, string])[]
): number {
    let worst = 0
    for (const [element, want, name] of list) {
        worst = Math.max(worst, expectViewAt(element, want, `${label} ${name}`))
    }
    return worst
}

/**
 * Runs each variant of a row in turn and reports every variant's first
 * failure, so a known failure shows its cause per variant.
 */
async function variants(
    row: string,
    list: readonly (readonly [string, () => Promise<string>])[]
): Promise<string> {
    const notes: string[] = []
    const errors: string[] = []
    for (const [name, run] of list) {
        try {
            notes.push(`${name}: ${await run()}`)
        } catch (error) {
            errors.push(
                `${row} [${name}] ${error instanceof Error ? error.message : String(error)}`
            )
        } finally {
            scrollTo(0, 0)
        }
    }
    if (errors.length > 0) throw new Error(errors.join('\n'))
    return notes.join('; ')
}

function harnessWithSnaps(
    motionTiming: TimingFunction = timing.easeOut(),
    threshold?: number
): {
    h: Harness
    snaps: Snap[]
    names: Names
} {
    const snaps: Snap[] = []
    const h = harness({
        motion: { duration: D, timing: motionTiming },
        ...(threshold === undefined ? {} : { threshold }),
        onSnap(element, reason) {
            snaps.push({ element, reason })
        },
    })
    return { h, snaps, names: new Map() }
}

function addNamed(
    h: Harness,
    names: Names,
    entries: Record<string, HTMLElement>
): void {
    for (const [name, element] of Object.entries(entries)) {
        names.set(element, name)
        h.add(element)
    }
}

/** A flush that changes nothing, so every participant has a last flush (§4.4). */
async function baseline(h: Harness, label: string): Promise<void> {
    h.group.capture()
    const r = await expectNoRun(
        report(h.group.flush()),
        `${label} baseline`,
        'nothing changed'
    )
    if (r.status !== 'no-change' || r.snapped.length > 0) {
        throw new Error(
            `${label} baseline: report ${r.status} with ${r.snapped.length} snapped, expected 'no-change'`
        )
    }
}

/**
 * The `threshold` of the rows whose commit moves a running node by less than
 * it (§5.7 keep test 1), and that move. The move is ten times the per-frame
 * tolerance, so every frame tells the three paths apart: path 1 would draw
 * the node `SUB_MOVE` px off its new A, and path 2 under a live ancestor scale
 * would jump by `(1 − k)·SUB_MOVE` px at the commit.
 */
const KEEP_THRESHOLD = 8
const SUB_MOVE = 5

/** Below this measured jump on every edge, §5.7 path 1 applies. */
const UNCHANGED_PX = 0.01

/**
 * The measured jump `J = D − B` of §5.7, read in the commit's task after the
 * mutation and before `flush()`: `D` is the node's rect with the commit
 * applied, under the pose the engine last wrote; `b` is its presented box
 * (what the capture read). The flush reads the same rect first, so this read
 * changes nothing the engine sees.
 */
function measuredJump(element: Element, b: OBox): OBox {
    const d = viewBox(element)
    return { x: d.x - b.x, y: d.y - b.y, w: d.w - b.w, h: d.h - b.h }
}

function largestEdge(j: OBox): number {
    return Math.max(Math.abs(j.x), Math.abs(j.y), Math.abs(j.w), Math.abs(j.h))
}

function describeJump(j: OBox): string {
    const px = (v: number) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4)
    return `J = (${px(j.x)}, ${px(j.y)}, ${px(j.w)}, ${px(j.h)})`
}

/**
 * The row's premise about `J`, checked as a setup error so a wrong premise is
 * never read as an engine result: 'zero' for a change presented before the
 * capture (§5.7 path 1), 'visible' for a change in the commit's own task.
 */
function expectJump(
    label: string,
    element: Element,
    b: OBox,
    want: 'zero' | 'visible',
    range: readonly [number, number] = [UNCHANGED_PX, Number.POSITIVE_INFINITY]
): OBox {
    const j = measuredJump(element, b)
    const size = largestEdge(j)
    const ok =
        want === 'zero'
            ? size < UNCHANGED_PX
            : size >= range[0] && size <= range[1]
    if (!ok) {
        throw new Error(
            `${label} setup: measured ${describeJump(j)} (largest edge ${size.toFixed(4)} px), expected ${want === 'zero' ? `|J| < ${UNCHANGED_PX} px on every edge` : `a largest edge in [${range[0]}, ${range[1]}] px`}`
        )
    }
    return j
}

/** The frame at which a track from rest planned at frame 0 ends (τ = 1). */
const END_FRAME = Math.round(D / DT) + 1

/**
 * Checks that a run whose tracks were kept ends on its original schedule:
 * at the frame its oracle track ends, or one frame later (the clock's
 * floating-point sum of `dt`). A restart would end at least a dozen frames
 * later.
 */
function expectEndedOnSchedule(
    endedAt: number | null,
    expected: number,
    label: string
): void {
    if (endedAt === null || endedAt < expected || endedAt > expected + 1) {
        throw new Error(
            `${label}: the run ended at frame ${endedAt ?? 'never'}, expected frame ${expected} (no restart)`
        )
    }
}

/* ───────────────────────── L-MEAS-1 ───────────────────────── */

/**
 * L-MEAS-1: chat delete under scroll anchoring, in an inner panel scroller
 * and in the page scroller. A message above the visible area is deleted;
 * scroll anchoring (the browser's, or the app's own where the browser has
 * none) corrects the scroll in the commit's task, so no remaining message
 * moves in view space, and none may move > 0.5 px at any frame (§3.1, §4.1
 * D3, §4.4: a valid capture never reports 'stale').
 */
export function L_MEAS_1(): Promise<string> {
    return variants('L_MEAS_1', [
        ['panel scroller', () => chatDelete('panel')],
        ['page scroller', () => chatDelete('page')],
    ])
}

async function chatDelete(kind: 'panel' | 'page'): Promise<string> {
    const row = `L_MEAS_1 ${kind}`
    const { h, snaps, names } = harnessWithSnaps()
    try {
        const anchors = CSS.supports('overflow-anchor', 'auto')
        const pitch = 70
        const list = document.createElement('div')
        if (kind === 'panel') {
            list.style.cssText =
                'position: absolute; left: 20px; top: 20px; width: 320px; height: 220px; overflow-y: auto; overflow-anchor: auto;'
        } else {
            h.root.style.height = '2400px'
            list.style.cssText = 'position: relative; width: 320px;'
        }
        h.root.append(list)
        const messages: HTMLElement[] = []
        const removers: (() => void)[] = []
        for (let i = 0; i < 12; i++) {
            const message = document.createElement('div')
            message.style.cssText = `position: relative; width: 280px; height: ${pitch - 10}px; margin-bottom: 10px; transform-origin: 0 0;`
            list.append(message)
            names.set(message, `msg${i}`)
            removers.push(h.group.add(message))
            messages.push(message)
        }
        await baseline(h, row)

        // three messages above the visible area; the scroll is presented
        if (kind === 'panel') list.scrollTop = 3 * pitch
        else scrollTo(0, 3 * pitch)
        await nextFrame()
        await nextFrame()
        const kept = messages.slice(1)
        const authored = kept.map((m) => m.style.cssText)
        const before = kept.map(viewBox)

        const scrollBefore = kind === 'panel' ? list.scrollTop : scrollY
        h.group.capture()
        removers[0]!()
        messages[0]!.remove()
        if (!anchors) {
            // no CSS scroll anchoring (WebKit): the app anchors in the same task
            if (kind === 'panel') list.scrollTop -= pitch
            else scrollBy(0, -pitch)
        }
        kept.forEach((m, i) => {
            const now = viewBox(m)
            if (maxDiff(now, before[i]!) > 0.01) {
                throw new Error(
                    `${row} setup: anchoring left ${nameOf(names, m)} at ${JSON.stringify(now)}, not at ${JSON.stringify(before[i])}`
                )
            }
        })
        const scrollAfter = kind === 'panel' ? list.scrollTop : scrollY
        const context = `(the ${kind} scroll went ${scrollBefore} → ${scrollAfter} px by anchoring in the commit's task)`
        const run = report(h.group.flush())
        const check = (label: string) =>
            expectAll(
                `${row} ${label} ${context}`,
                kept.map((m, i) => [m, before[i]!, nameOf(names, m)] as const)
            )
        let worst = check('delete flush write')
        const r = await expectNoRun(
            run,
            `${row} delete flush`,
            'no remaining message moved in view space'
        )
        expectReport(names, r, 'no-change', [], `${row} delete flush`)
        expectSnapCalls(names, snaps, [], `${row} delete flush`)
        for (let f = 1; f <= 25; f++) {
            await step(h.mc)
            worst = Math.max(worst, check(`frame ${f}`))
        }
        kept.forEach((m, i) =>
            expectRestored(m, authored[i]!, `${row} ${nameOf(names, m)}`)
        )
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `${kept.length} messages held ≤ ${worst.toFixed(3)} px for 25 frames (${anchors ? 'CSS' : 'app'} anchoring)`
    } finally {
        scrollTo(0, 0)
        h.dispose()
    }
}

/* ───────────────────────── L-MEAS-2 ───────────────────────── */

/**
 * L-MEAS-2: kanban. A card moves to another column, and that column
 * auto-scrolls in the same task as the mutation (a layout effect). The scroll
 * was never presented, so it is part of the change (§4.1 D3): every
 * participant starts at its presented box and lands on its A, every frame on
 * the oracle.
 */
export async function L_MEAS_2(): Promise<string> {
    const row = 'L_MEAS_2'
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    try {
        const column = (left: number) =>
            node(
                h.root,
                `left: ${left}px; top: 0; width: 160px; height: 220px; overflow-y: auto;`
            )
        const columnA = column(0)
        const columnB = column(200)
        const card = (col: HTMLElement, name: string) => {
            const element = document.createElement('div')
            element.style.cssText =
                'position: relative; width: 140px; height: 60px; margin-bottom: 10px; transform-origin: 0 0;'
            col.append(element)
            names.set(element, name)
            h.add(element)
            return element
        }
        const a0 = card(columnA, 'a0')
        const a1 = card(columnA, 'a1')
        const a2 = card(columnA, 'a2')
        const bs = [0, 1, 2, 3, 4].map((i) => card(columnB, `b${i}`))
        const cards = [a0, a1, a2, ...bs]
        await baseline(h, row)

        const authored = cards.map((c) => c.style.cssText)
        const b = cards.map(viewBox)
        h.group.capture()
        columnB.append(a1)
        columnB.scrollTop = 120
        if (Math.abs(columnB.scrollTop - 120) > 0.5) {
            throw new Error(
                `${row} setup: the column scrolled to ${columnB.scrollTop}, not 120`
            )
        }
        // every card is at rest, so its rect now is its A
        const a = cards.map(viewBox)
        const run = report(h.group.flush())
        const specs = cards.map((_, i) =>
            maxDiff(b[i]!, a[i]!) >= 1
                ? spec(b[i]!, a[i]!, { timing: ease })
                : null
        )
        const check = (label: string, t: number) => {
            try {
                return expectAll(
                    `${row} ${label} t=${t.toFixed(3)}`,
                    cards.map(
                        (c, i) =>
                            [
                                c,
                                specs[i] ? expectedBox(specs[i]!, t) : a[i]!,
                                nameOf(names, c),
                            ] as const
                    )
                )
            } catch (error) {
                // the column was at 120 when A was read; the engine's
                // writes must not move it (§11.4 S2)
                if (error instanceof Error && columnB.scrollTop !== 120) {
                    error.message += `; columnB's scrollTop is ${columnB.scrollTop}, not the 120 it held when A was read: scroll anchoring re-anchored the column after the engine's pose writes, which §11.4 S2 forbids ('layout's writes neither suppress nor alter anchoring')`
                }
                throw error
            }
        }
        let worst = check(
            "flush write (columnB scrolled 0 → 120 px in the commit's task)",
            0
        )
        await expectRunning(names, run, `${row} move flush`)
        let f = 0
        while (run.value === null && f < 60) {
            f++
            await step(h.mc)
            worst = Math.max(worst, check(`frame ${f}`, restAt(f)))
        }
        expectReport(names, run.value!, 'ended', [], `${row} move run`)
        expectSnapCalls(names, snaps, [], `${row} move run`)
        cards.forEach((c, i) => {
            expectViewAt(c, a[i]!, `${row} final ${nameOf(names, c)}`, 0.01)
            expectRestored(c, authored[i]!, `${row} ${nameOf(names, c)}`)
        })
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `${specs.filter(Boolean).length} cards from their presented boxes, ${f} frames ≤ ${worst.toFixed(3)} px`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── L-MEAS-3 ───────────────────────── */

/**
 * L-MEAS-3: an accordion opens and an instant `scrollIntoView` follows in the
 * same task. Participants glide from where they were seen; non-participant
 * content jumps by the scroll; the settle is exact (§4.1 D3).
 */
export async function L_MEAS_3(): Promise<string> {
    const row = 'L_MEAS_3'
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    try {
        h.root.style.height = '2400px'
        const label = node(
            h.root,
            'left: 20px; top: 180px; width: 240px; height: 40px;'
        )
        const header = node(
            h.root,
            'left: 20px; top: 260px; width: 240px; height: 50px; transform-origin: 0 0;'
        )
        const body = node(
            h.root,
            'left: 20px; top: 310px; width: 240px; height: 0px; overflow: hidden;'
        )
        const footer = node(
            h.root,
            'left: 20px; top: 310px; width: 240px; height: 60px; transform-origin: 0 0;'
        )
        addNamed(h, names, { header, footer })
        await baseline(h, row)

        const bHeader = viewBox(header)
        const bFooter = viewBox(footer)
        const bLabel = viewBox(label)
        h.group.capture()
        body.style.height = '240px'
        footer.style.top = '550px'
        // the author's inline styles after the commit's own changes
        const authored = [header.style.cssText, footer.style.cssText]
        footer.scrollIntoView({ behavior: 'instant', block: 'start' })
        const scrolled = scrollY
        if (!(scrolled > 100)) {
            throw new Error(
                `${row} setup: scrollIntoView scrolled ${scrolled} px`
            )
        }
        const aHeader = viewBox(header)
        const aFooter = viewBox(footer)
        const aLabel = shiftBox(bLabel, 0, -scrolled)
        const run = report(h.group.flush())
        const sHeader = spec(bHeader, aHeader, { timing: ease })
        const sFooter = spec(bFooter, aFooter, { timing: ease })
        const check = (phase: string, t: number) =>
            expectAll(`${row} ${phase} t=${t.toFixed(3)}`, [
                [header, expectedBox(sHeader, t), 'header'],
                [footer, expectedBox(sFooter, t), 'footer'],
                // non-participant content jumps by the scroll
                [label, aLabel, 'non-participant'],
            ])
        let worst = check(
            `flush write (the page scrolled 0 → ${scrolled} px in the commit's task)`,
            0
        )
        await expectRunning(names, run, `${row} open flush`)
        let f = 0
        while (run.value === null && f < 60) {
            f++
            await step(h.mc)
            worst = Math.max(worst, check(`frame ${f}`, restAt(f)))
        }
        expectReport(names, run.value!, 'ended', [], `${row} open run`)
        expectSnapCalls(names, snaps, [], `${row} open run`)
        expectViewAt(header, aHeader, `${row} final header`, 0.01)
        expectViewAt(footer, aFooter, `${row} final footer`, 0.01)
        expectRestored(header, authored[0]!, `${row} header`)
        expectRestored(footer, authored[1]!, `${row} footer`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `scrollY ${scrolled}; participants glide from their presented boxes, ${f} frames ≤ ${worst.toFixed(3)} px`
    } finally {
        scrollTo(0, 0)
        h.dispose()
    }
}

/* ───────────────────────── L-MEAS-4 ───────────────────────── */

/**
 * L-MEAS-4: a user scroll mid-run, of an inner scroller and of the page,
 * presented by frames before the commit (§3.1). Drawn boxes follow their
 * content every frame. The commit's path is decided by the measured jump
 * `J = D − B` (§5.7), which each variant reads as its premise:
 * - (i) the commit does not move the node. The scroll was presented, so
 *   `J = 0` and path 1 keeps the track, at rest and under a parent at a live
 *   scale of 0.5 and 2: no restart, and run 1 ends on schedule on the
 *   content-following oracle.
 * - (ii) the commit also moves the node by less than `threshold`. At rest,
 *   path 2: no restart, and the node lands on its new A. Under the live
 *   scale, path 3: the first frame is the measured B, the velocity is
 *   continuous, and run 1 resolves 'interrupted'.
 * - (iii) the commit moves the node 0.005 px (rest space) under a screen
 *   amplification of about 300: `J` is about 1.5 px, so path 3, never path 1.
 */
export function L_MEAS_4(): Promise<string> {
    return variants('L_MEAS_4', [
        ['(i) parent at rest, path 1', () => meas4Rest(0)],
        ['(i) live parent scale 0.5, path 1', () => meas4Live(0.5, 0)],
        ['(i) live parent scale 2, path 1', () => meas4Live(2, 0)],
        ['(ii) parent at rest, path 2', () => meas4Rest(SUB_MOVE)],
        ['(ii) live parent scale 0.5, path 3', () => meas4Live(0.5, SUB_MOVE)],
        ['(ii) live parent scale 2, path 3', () => meas4Live(2, SUB_MOVE)],
        ['(iii) amplified ρ ≈ 300, path 3', meas4Amplified],
    ])
}

/**
 * (i) and (ii) under a resting parent. An inner child (in a scroller inside
 * the parent) and an outer child (directly in the parent) run tracks; the
 * user scrolls the scroller 40 px and the page 50 px; then a commit moves an
 * unrelated participant and, with `move > 0`, both children `move` px right.
 * With `move = 0`, `J = 0`: path 1 leaves both timelines alone. With
 * `move > 0`, `J = move` and every ancestor is at scale 1: path 2 translates
 * both tracks by δ, so the commit's own sub-threshold move is drawn at once
 * and each lands on its new A. Either way run 1 ends on its original
 * schedule.
 */
async function meas4Rest(move: number): Promise<string> {
    const path = move === 0 ? 1 : 2
    const row = `L_MEAS_4 ${move === 0 ? '(i)' : '(ii)'} rest`
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(
        ease,
        move === 0 ? undefined : KEEP_THRESHOLD
    )
    try {
        h.root.style.height = '2000px'
        const parent = node(
            h.root,
            'left: 20px; top: 120px; width: 420px; height: 320px; transform-origin: 0 0;'
        )
        const scroller = node(
            parent,
            'left: 0; top: 0; width: 400px; height: 220px; overflow-y: auto;'
        )
        node(scroller, 'left: 0; top: 0; width: 1px; height: 600px;')
        const inner = node(
            scroller,
            'left: 10px; top: 80px; width: 80px; height: 40px; transform-origin: 0 0;'
        )
        const outer = node(
            parent,
            'left: 10px; top: 250px; width: 80px; height: 40px; transform-origin: 0 0;'
        )
        const trigger = node(
            h.root,
            'left: 500px; top: 120px; width: 60px; height: 40px; transform-origin: 0 0;'
        )
        addNamed(h, names, { parent, inner, outer, trigger })
        await baseline(h, row)

        const parentRest = viewBox(parent)
        const bInner = viewBox(inner)
        const bOuter = viewBox(outer)
        h.group.capture()
        inner.style.left = '170px'
        outer.style.left = '170px'
        const aInner = viewBox(inner)
        const aOuter = viewBox(outer)
        const run1 = report(h.group.flush())
        const sInner = spec(bInner, aInner, { timing: ease })
        const sOuter = spec(bOuter, aOuter, { timing: ease })
        let dx = 0
        let dyInner = 0
        let dyOuter = 0
        let f = 0
        const tracks = (label: string) => {
            const t = restAt(f)
            return expectAll(`${row} ${label} t=${t.toFixed(3)}`, [
                [inner, shiftBox(expectedBox(sInner, t), dx, dyInner), 'inner'],
                [outer, shiftBox(expectedBox(sOuter, t), dx, dyOuter), 'outer'],
                [parent, shiftBox(parentRest, 0, dyOuter), 'parent (at rest)'],
            ])
        }
        let worst = tracks('flush 1 write')
        await expectRunning(names, run1, `${row} flush 1`)
        while (f < 6) {
            f++
            await step(h.mc)
            worst = Math.max(worst, tracks(`frame ${f}`))
        }

        // the user scrolls the inner scroller by 40 px and the page by 50 px
        scroller.scrollTop = 40
        scrollTo(0, 50)
        if (scroller.scrollTop !== 40 || scrollY !== 50) {
            throw new Error(
                `${row} setup: scrolled to ${scroller.scrollTop} / ${scrollY}, not 40 / 50`
            )
        }
        dyInner = -90
        dyOuter = -50
        while (f < 9) {
            f++
            await step(h.mc)
            worst = Math.max(worst, tracks(`scrolled frame ${f}`))
        }

        // the commit: an unrelated participant moves, and with `move` both children
        const presented = [viewBox(inner), viewBox(outer)]
        const bTrigger = viewBox(trigger)
        h.group.capture()
        trigger.style.left = '580px'
        if (move !== 0) {
            inner.style.left = `${170 + move}px`
            outer.style.left = `${170 + move}px`
        }
        const authored = [authorText(inner), authorText(outer)]
        const jumps = [inner, outer].map((element, i) =>
            expectJump(
                `${row} ${nameOf(names, element)}`,
                element,
                presented[i]!,
                move === 0 ? 'zero' : 'visible',
                move === 0 ? undefined : [move - 0.01, move + 0.01]
            )
        )
        const aTrigger = viewBox(trigger)
        const run2 = report(h.group.flush())
        const sTrigger = spec(bTrigger, aTrigger, { timing: ease })
        dx = move
        worst = Math.max(
            worst,
            tracks(
                `commit write (an inner scroll of 40 px and a page scroll of 50 px presented since flush 1${move === 0 ? '' : `; the commit moved both children ${move} px`}; inner ${describeJump(jumps[0]!)}, outer ${describeJump(jumps[1]!)}: path ${path})`
            )
        )
        expectViewAt(trigger, bTrigger, `${row} commit write trigger`)
        await expectRunning(names, run2, `${row} commit`)
        if (run1.value !== null) {
            throw new Error(
                `${row} commit: the kept run resolved at the commit (${describeReport(names, run1.value)}); path ${path} keeps the tracks`
            )
        }
        let g = 0
        let endedAt: number | null = null
        while ((run1.value === null || run2.value === null) && f < 80) {
            f++
            g++
            await step(h.mc)
            worst = Math.max(worst, tracks(`frame ${f}`))
            worst = Math.max(
                worst,
                expectViewAt(
                    trigger,
                    expectedBox(sTrigger, restAt(g)),
                    `${row} frame ${f} trigger`
                )
            )
            if (endedAt === null && run1.value !== null) endedAt = f
        }
        expectEndedOnSchedule(endedAt, END_FRAME, `${row} run 1`)
        expectReport(names, run1.value!, 'ended', [], `${row} run 1`)
        expectReport(names, run2.value!, 'ended', [], `${row} run 2`)
        expectSnapCalls(names, snaps, [], `${row} runs`)
        expectViewAt(
            inner,
            shiftBox(aInner, move, -90),
            `${row} final inner`,
            0.01
        )
        expectViewAt(
            outer,
            shiftBox(aOuter, move, -50),
            `${row} final outer`,
            0.01
        )
        expectRestored(inner, authored[0]!, `${row} inner`)
        expectRestored(outer, authored[1]!, `${row} outer`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `path ${path} (inner ${describeJump(jumps[0]!)}): kept on the original timeline, ended at frame ${endedAt}; ≤ ${worst.toFixed(3)} px`
    } finally {
        scrollTo(0, 0)
        h.dispose()
    }
}

/**
 * (i) and (ii) under a live scale. A parent runs a size track from scale
 * `scale` to 1; its child, in a scroller inside it, runs its own track. The
 * user scrolls the scroller (carried on screen by the parent's live scale)
 * and the page; then a commit moves an unrelated participant and, with
 * `move > 0`, the child `move` px right.
 * - `move = 0`: the scroll was presented, so `J = 0` and path 1 leaves the
 *   child's timeline alone. Its oracle is its own track with the scroll
 *   carried through the parent's live scale, to the end of run 1.
 * - `move > 0`: `J ≠ 0` and an ancestor's pose scale is not 1, so no
 *   translation is exact (§5.7 path 2's condition fails): path 3 retargets the
 *   child from its measured B with its analytic velocity toward its new A.
 */
async function meas4Live(scale: 0.5 | 2, move: number): Promise<string> {
    const path = move === 0 ? 1 : 3
    const row = `L_MEAS_4 ${move === 0 ? '(i)' : '(ii)'} live ${scale}`
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(
        ease,
        move === 0 ? undefined : KEEP_THRESHOLD
    )
    try {
        h.root.style.height = '2000px'
        const restSize = 200
        const parent = node(
            h.root,
            `left: 20px; top: 100px; width: ${restSize * scale}px; height: ${restSize * scale}px; transform-origin: 0 0;`
        )
        const scroller = node(
            parent,
            'left: 0; top: 0; width: 180px; height: 160px; overflow-y: auto;'
        )
        node(scroller, 'left: 0; top: 0; width: 1px; height: 500px;')
        const child = node(
            scroller,
            'left: 10px; top: 60px; width: 60px; height: 30px; transform-origin: 0 0;'
        )
        const trigger = node(
            h.root,
            'left: 600px; top: 100px; width: 60px; height: 40px; transform-origin: 0 0;'
        )
        addNamed(h, names, { parent, child, trigger })
        await baseline(h, row)

        const bParent = viewBox(parent)
        const bChild = viewBox(child)
        h.group.capture()
        parent.style.width = `${restSize}px`
        parent.style.height = `${restSize}px`
        child.style.left = '90px'
        const authoredParent = parent.style.cssText
        const aParent = viewBox(parent)
        const aChild = viewBox(child)
        const run1 = report(h.group.flush())
        const sParent = spec(bParent, aParent, { timing: ease })
        const sChild = spec(bChild, aChild, { timing: ease })
        const pageScroll = 30
        let scrolled = false
        const parentAt = (t: number) =>
            shiftBox(expectedBox(sParent, t), 0, scrolled ? -pageScroll : 0)
        /** The parent's live vertical pose scale at `t`. */
        const kyAt = (t: number) => expectedBox(sParent, t).h / aParent.h
        // the content-following oracle: the child's track, with the inner
        // scroll carried through the parent's live vertical scale, and the
        // page scroll; the inner scroll offset is the browser's (a
        // transformed scroller may hold a fractional offset, Firefox)
        const childAt = (t: number) => {
            const own = expectedBox(sChild, t)
            if (!scrolled) return own
            return shiftBox(own, 0, -kyAt(t) * scroller.scrollTop - pageScroll)
        }
        let f = 0
        const first = (label: string) => {
            const t = restAt(f)
            return expectAll(`${row} ${label} t=${t.toFixed(3)}`, [
                [parent, parentAt(t), 'parent'],
                [child, childAt(t), 'child'],
            ])
        }
        let worst = first('flush 1 write')
        await expectRunning(names, run1, `${row} flush 1`)
        while (f < 6) {
            f++
            await step(h.mc)
            worst = Math.max(worst, first(`frame ${f}`))
        }
        scroller.scrollTop = 24
        scrollTo(0, pageScroll)
        scrolled = true
        if (Math.abs(scroller.scrollTop - 24) > 0.5 || scrollY !== pageScroll) {
            throw new Error(
                `${row} setup: scrolled to ${scroller.scrollTop} / ${scrollY}`
            )
        }
        while (f < 9) {
            f++
            await step(h.mc)
            worst = Math.max(worst, first(`scrolled frame ${f}`))
        }

        // the commit at t_k
        const tk = restAt(f)
        const live = expectedBox(sParent, tk).h / aParent.h
        const measured = viewBox(child)
        const velocity = velocityOf(childAt, tk)
        const sigma = scroller.scrollTop
        const target = shiftBox(aChild, move, -sigma - pageScroll)
        /** A later change of the browser's scroll offset moves the child's layout box under the parent's scale. */
        const drift = (t: number) => -kyAt(t) * (scroller.scrollTop - sigma)
        const bTrigger = viewBox(trigger)
        h.group.capture()
        trigger.style.left = '680px'
        if (move !== 0) child.style.left = `${90 + move}px`
        const authoredChild = authorText(child)
        const jump = expectJump(
            `${row} child`,
            child,
            measured,
            move === 0 ? 'zero' : 'visible'
        )
        const aTrigger = viewBox(trigger)
        const run2 = report(h.group.flush())
        const sRetarget = spec(measured, target, { timing: ease, velocity })
        const sDropped = spec(measured, target, { timing: ease })
        /**
         * The retarget with the velocity of the child's own track only: it
         * leaves out `−k′·σ`, the motion of its scroll offset σ under the
         * parent's changing scale, which is part of what the user sees.
         */
        /** The parent's vertical scale rate at `t_k`, per second. */
        const kRate = (kyAt(tk + 1e-5) - kyAt(tk - 1e-5)) / 2e-5
        const sTrackOnly = spec(measured, target, {
            timing: ease,
            velocity: velocityOf((t) => expectedBox(sChild, t), tk),
        })
        const sTrigger = spec(bTrigger, aTrigger, { timing: ease })
        /** The child's expected box `g` frames after the commit, frame `f` since flush 1. */
        const childNow = (fi: number, gi: number): readonly [OBox, string] =>
            path === 1
                ? [childAt(restAt(fi)), 'child (path 1, its own timeline)']
                : [
                      shiftBox(
                          expectedBox(sRetarget, movingAt(gi)),
                          0,
                          drift(restAt(fi))
                      ),
                      `child (path 3) t'=${movingAt(gi).toFixed(3)}`,
                  ]
        const context = `a ${sigma.toFixed(2)} px inner scroll under the parent's live scale ${live.toFixed(3)} and a ${pageScroll} px page scroll presented since flush 1${move === 0 ? '' : `; the commit moved the child ${move} px`}; ${describeJump(jump)}: path ${path}`
        /**
         * Checks a frame after the commit. A path 3 failure drawn on the
         * retarget without `−k′·σ` (within 0.05 px: the engines' rect
         * quantization) says so and names the authority it breaks.
         */
        const afterCommit = (
            label: string,
            fi: number,
            gi: number,
            list: readonly (readonly [Element, OBox, string])[]
        ): number => {
            try {
                return expectAll(label, list)
            } catch (error) {
                if (path === 3) {
                    const trackOnly = shiftBox(
                        expectedBox(sTrackOnly, movingAt(gi)),
                        0,
                        drift(restAt(fi))
                    )
                    const off = maxDiff(viewBox(child), trackOnly)
                    if (error instanceof Error && off <= 0.05) {
                        error.message += `; the child is drawn within ${off.toFixed(3)} px of ${JSON.stringify(trackOnly)}, the retarget whose initial velocity is its own track's alone: it leaves out −k′·σ = ${(-kRate * sigma).toFixed(1)} px/s, the motion of its ${sigma.toFixed(2)} px scroll offset under the parent's changing scale (k′ = ${kRate.toFixed(3)}/s), which the user saw. §4.2: 'The layout box is static between frames, so (B, v) is the true presented state'; §5.7 path 3: 'the first frame is B and velocity is continuous (invariant 4)'`
                    }
                }
                throw error
            }
        }
        const [atCommit, commitName] = childNow(f, 0)
        worst = Math.max(
            worst,
            afterCommit(`${row} commit write (${context})`, f, 0, [
                [child, atCommit, commitName],
                [child, measured, 'child (measured B)'],
                [parent, parentAt(tk), 'parent'],
                [trigger, bTrigger, 'trigger'],
            ])
        )
        await settleMicrotasks()
        if (path === 1 && run1.value !== null) {
            throw new Error(
                `${row} commit: run 1 resolved at the commit (${describeReport(names, run1.value)}); J = 0, so path 1 keeps the child's track`
            )
        }
        if (path === 3 && run1.value?.status !== 'interrupted') {
            throw new Error(
                `${row} commit: run 1 is ${run1.value ? describeReport(names, run1.value) : 'still running'}; path 3 replaces the child's track, so it resolves 'interrupted'`
            )
        }
        await expectRunning(names, run2, `${row} commit`)
        let g = 0
        let dropGap = 0
        let endedAt: number | null = null
        while ((run1.value === null || run2.value === null) && f < 90) {
            f++
            g++
            await step(h.mc)
            if (path === 3 && g <= 6) {
                const t = movingAt(g)
                dropGap = Math.max(
                    dropGap,
                    maxDiff(expectedBox(sDropped, t), expectedBox(sRetarget, t))
                )
            }
            const [want, name] = childNow(f, g)
            worst = Math.max(
                worst,
                afterCommit(`${row} frame ${f}`, f, g, [
                    [child, want, name],
                    [parent, parentAt(restAt(f)), 'parent'],
                    [trigger, expectedBox(sTrigger, restAt(g)), 'trigger'],
                ])
            )
            if (endedAt === null && run1.value !== null) endedAt = f
        }
        if (path === 1) {
            expectEndedOnSchedule(endedAt, END_FRAME, `${row} run 1`)
            expectReport(names, run1.value!, 'ended', [], `${row} run 1`)
        }
        expectReport(names, run2.value!, 'ended', [], `${row} run 2`)
        expectSnapCalls(names, snaps, [], `${row} runs`)
        expectViewAt(
            child,
            shiftBox(aChild, move, -scroller.scrollTop - pageScroll),
            `${row} final child`,
            0.01
        )
        expectViewAt(
            parent,
            shiftBox(aParent, 0, -pageScroll),
            `${row} final parent`,
            0.01
        )
        expectRestored(parent, authoredParent, `${row} parent`)
        expectRestored(child, authoredChild, `${row} child`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        if (path === 1) {
            return `path 1 (${describeJump(jump)}) under the parent's live scale ${live.toFixed(3)}: kept on the original timeline, ended at frame ${endedAt}; ≤ ${worst.toFixed(3)} px`
        }
        if (!(dropGap > 1)) {
            throw new Error(
                `${row} setup: dropping the velocity changes the path by only ${dropGap.toFixed(3)} px, too little to prove continuity`
            )
        }
        return `path 3 (${describeJump(jump)}) under the parent's live scale ${live.toFixed(3)}: retarget from (B, v) ≤ ${worst.toFixed(3)} px (a dropped velocity would be ${dropGap.toFixed(1)} px off)`
    } finally {
        scrollTo(0, 0)
        h.dispose()
    }
}

/**
 * (iii) The amplified case. The ancestor's pose scale is ≤ 50 (a larger size
 * change snaps, §9.1), so the screen amplification ρ ≈ 300 comes from its
 * pose scale (≈ 16.6 at t_k) times a presence `transform` change since the
 * track was planned (scale 0.05 → 1, a visual layer, §3.2), presented by a
 * frame before the commit. The child sits at the ancestor's origin, so the
 * layer scales its size and leaves its position. The commit then shifts a
 * non-participant wrapper by 0.1 CSS px: a rest displacement of 0.005 px
 * under the planned matrices, far below `threshold` (so the track is kept),
 * drawn about 1.66 px on screen. `J` is not below 0.01 px, so path 1 must not
 * apply; the ancestor's scale is live, so path 3.
 */
async function meas4Amplified(): Promise<string> {
    const row = 'L_MEAS_4 (iii) amplified'
    const linear = timing.linear()
    const { h, snaps, names } = harnessWithSnaps(linear)
    try {
        const q0 = 0.05
        const anc = node(
            h.root,
            `left: 40px; top: 40px; width: 5000px; height: 5000px; transform: scale(${q0}); transform-origin: 0 0;`
        )
        const wrap = node(anc, 'left: 0; top: 0; width: 0; height: 0;')
        const child = node(
            wrap,
            'left: 0; top: 0; width: 800px; height: 800px; transform-origin: 0 0;'
        )
        const trigger = node(
            h.root,
            'left: 700px; top: 40px; width: 60px; height: 40px; transform-origin: 0 0;'
        )
        addNamed(h, names, { anc, child, trigger })
        await baseline(h, row)

        const bAnc = viewBox(anc)
        const bChild = viewBox(child)
        h.group.capture()
        anc.style.width = '200px'
        anc.style.height = '200px'
        child.style.width = '200px'
        child.style.height = '200px'
        const aAnc = viewBox(anc)
        const aChild = viewBox(child)
        const run1 = report(h.group.flush())
        const sAnc = spec(bAnc, aAnc, { timing: linear })
        const sChild = spec(bChild, aChild, { timing: linear })
        const origin = { x: aAnc.x, y: aAnc.y }
        const shift = 0.1
        let layer = 1
        let shifted = 0
        const pose = (t: number) => expectedBox(sAnc, t).w / aAnc.w
        const ancAt = (t: number) => {
            const v = expectedBox(sAnc, t)
            return { x: v.x, y: v.y, w: v.w * layer, h: v.h * layer }
        }
        // the child's track through the layer (about the ancestor's origin)
        // plus the wrapper's shift carried by the ancestor's current scale:
        // what path 1 draws once the wrapper has shifted
        const childAt = (t: number) => {
            const v = expectedBox(sChild, t)
            return {
                x: origin.x + layer * (v.x - origin.x) + shifted * pose(t),
                y: origin.y + layer * (v.y - origin.y),
                w: layer * v.w,
                h: layer * v.h,
            }
        }
        let f = 0
        const first = (label: string) => {
            const t = restAt(f)
            return expectAll(`${row} ${label} t=${t.toFixed(3)}`, [
                [anc, ancAt(t), 'ancestor'],
                [child, childAt(t), 'child'],
            ])
        }
        let worst = first('flush 1 write')
        await expectRunning(names, run1, `${row} flush 1`)
        while (f < 7) {
            f++
            await step(h.mc)
            worst = Math.max(worst, first(`frame ${f}`))
        }
        // the presence layer, presented by a frame
        anc.style.transform = 'scale(1)'
        layer = 1 / q0
        f++
        await step(h.mc)
        worst = Math.max(worst, first(`layered frame ${f}`))

        const tk = restAt(f)
        const rho = pose(tk) * layer
        const delta = shift * q0
        const measured = viewBox(child)
        const velocity = velocityOf(childAt, tk)
        const target = {
            x: origin.x + shift,
            y: origin.y,
            w: 200,
            h: 200,
        }
        const bTrigger = viewBox(trigger)
        h.group.capture()
        // the commit: the wrapper shifts the child 0.1 CSS px
        wrap.style.transform = `translateX(${shift}px)`
        trigger.style.left = '780px'
        const jump = expectJump(
            `${row} child`,
            child,
            measured,
            'visible',
            [1, 2.5]
        )
        shifted = shift
        const aTrigger = viewBox(trigger)
        const run2 = report(h.group.flush())
        const sRetarget = spec(measured, target, { timing: linear, velocity })
        const sTrigger = spec(bTrigger, aTrigger, { timing: linear })
        worst = Math.max(
            worst,
            expectAll(
                `${row} commit write (a ${shift} CSS px wrapper shift in the commit: |δ| = ${delta.toFixed(4)} px under ρ = ${rho.toFixed(1)}, measured ${describeJump(jump)})`,
                [
                    [child, measured, 'child (measured B)'],
                    [anc, ancAt(tk), 'ancestor'],
                    [trigger, bTrigger, 'trigger'],
                ]
            )
        )
        await settleMicrotasks()
        if (run1.value?.status !== 'interrupted') {
            throw new Error(
                `${row} commit: run 1 is ${run1.value ? describeReport(names, run1.value) : 'still running'}; J is ${largestEdge(jump).toFixed(3)} px, so not path 1, and the ancestor's scale is live, so path 3 replaces the child's track and run 1 resolves 'interrupted'`
            )
        }
        await expectRunning(names, run2, `${row} commit`)
        let g = 0
        let path1Gap = 0
        while (run2.value === null && f < 90) {
            f++
            g++
            await step(h.mc)
            const t = movingAt(g)
            path1Gap = Math.max(
                path1Gap,
                maxDiff(childAt(restAt(f)), expectedBox(sRetarget, t))
            )
            worst = Math.max(
                worst,
                expectAll(`${row} frame ${f}`, [
                    [
                        child,
                        expectedBox(sRetarget, t),
                        `child (path 3) t'=${t.toFixed(3)}`,
                    ],
                    [anc, ancAt(restAt(f)), 'ancestor'],
                    [trigger, expectedBox(sTrigger, restAt(g)), 'trigger'],
                ])
            )
        }
        expectReport(names, run2.value!, 'ended', [], `${row} run 2`)
        expectSnapCalls(names, snaps, [], `${row} runs`)
        expectViewAt(child, target, `${row} final child`, 0.01)
        for (const element of [anc, child]) {
            expectEqual(
                `${element.style.translate}|${element.style.scale}`,
                '|',
                `${row} ${nameOf(names, element)}: pose restored`
            )
        }
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        if (!(path1Gap > 5)) {
            throw new Error(
                `${row} setup: path 1 would be only ${path1Gap.toFixed(3)} px off, too little to tell the paths apart`
            )
        }
        return `ρ = ${rho.toFixed(1)} (pose ${pose(tk).toFixed(2)} × inner ${layer}), |δ| = ${delta} px, measured |J| = ${largestEdge(jump).toFixed(3)} px; path 3 ≤ ${worst.toFixed(3)} px (path 1 would be ${path1Gap.toFixed(0)} px off)`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── L-MEAS-6 ───────────────────────── */

/**
 * L-MEAS-6: sticky engages mid-run. The pose is relative to the layout box,
 * so the drawn box follows the sticky offset with no read. (a) With no later
 * commit the run ends exactly on its A, no snap. (b) A later commit keeps the
 * track (path 2): continuity on the original timeline. The sticky
 * displacement is measured on an identical non-participant twin.
 */
export function L_MEAS_6(): Promise<string> {
    return variants('L_MEAS_6', [
        ['(a) no later commit', () => meas6(false)],
        ['(b) a later commit', () => meas6(true)],
    ])
}

async function meas6(withCommit: boolean): Promise<string> {
    const row = `L_MEAS_6 ${withCommit ? '(b)' : '(a)'}`
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    try {
        const stickyIn = (left: number, marginLeft: number) => {
            const scroller = node(
                h.root,
                `left: ${left}px; top: 20px; width: 320px; height: 220px; overflow-y: auto;`
            )
            const flow = document.createElement('div')
            flow.style.cssText =
                'position: relative; width: 300px; height: 700px; padding-top: 80px; box-sizing: border-box;'
            scroller.append(flow)
            const sticky = document.createElement('div')
            sticky.style.cssText = `position: sticky; top: 12px; margin-left: ${marginLeft}px; width: 100px; height: 40px; transform-origin: 0 0;`
            flow.append(sticky)
            return { scroller, sticky }
        }
        const { scroller, sticky } = stickyIn(20, 10)
        const twin = stickyIn(420, 150)
        const trigger = node(
            h.root,
            'left: 800px; top: 20px; width: 60px; height: 40px; transform-origin: 0 0;'
        )
        addNamed(h, names, { sticky, trigger })
        await baseline(h, row)

        const b1 = viewBox(sticky)
        h.group.capture()
        sticky.style.marginLeft = '150px'
        const authored = sticky.style.cssText
        const a1 = viewBox(sticky)
        const run1 = report(h.group.flush())
        const s1 = spec(b1, a1, { timing: ease })
        let dx = 0
        let dy = 0
        let f = 0
        const at = (label: string) => {
            const t = restAt(f)
            return expectViewAt(
                sticky,
                shiftBox(expectedBox(s1, t), dx, dy),
                `${row} ${label} t=${t.toFixed(3)} sticky`
            )
        }
        let worst = at('flush 1 write')
        await expectRunning(names, run1, `${row} flush 1`)
        while (f < 6) {
            f++
            await step(h.mc)
            worst = Math.max(worst, at(`frame ${f}`))
        }

        // scroll 120 px: sticky engages and its box moves by less
        const twinBefore = viewBox(twin.sticky)
        scroller.scrollTop = 120
        twin.scroller.scrollTop = 120
        const twinAfter = viewBox(twin.sticky)
        dx = twinAfter.x - twinBefore.x
        dy = twinAfter.y - twinBefore.y
        if (!(dy > -119 && dy < -1)) {
            throw new Error(
                `${row} setup: the sticky twin moved ${dy} px for a 120 px scroll; sticky did not engage`
            )
        }

        let run2: Holder | null = null
        let sTrigger: OTrackSpec | null = null
        let g = 0
        let endedAt: number | null = null
        while (
            (run1.value === null || (run2 && run2.value === null)) &&
            f < 80
        ) {
            if (withCommit && run2 === null && f === 9) {
                const bTrigger = viewBox(trigger)
                h.group.capture()
                trigger.style.left = '880px'
                const aTrigger = viewBox(trigger)
                run2 = report(h.group.flush())
                sTrigger = spec(bTrigger, aTrigger, { timing: ease })
                worst = Math.max(
                    worst,
                    at(
                        `commit write (sticky engaged: a 120 px scroll moved it ${dy.toFixed(2)} px since flush 1)`
                    )
                )
                await expectRunning(names, run2, `${row} commit`)
                if (run1.value !== null) {
                    throw new Error(
                        `${row} commit: the kept run resolved at the commit (${describeReport(names, run1.value)}); path 2 keeps the track`
                    )
                }
            }
            f++
            if (run2) g++
            await step(h.mc)
            worst = Math.max(worst, at(`frame ${f}`))
            if (sTrigger) {
                expectViewAt(
                    trigger,
                    expectedBox(sTrigger, restAt(g)),
                    `${row} frame ${f} trigger`
                )
            }
            if (endedAt === null && run1.value !== null) endedAt = f
        }
        expectEndedOnSchedule(endedAt, END_FRAME, `${row} run 1`)
        expectReport(names, run1.value!, 'ended', [], `${row} run 1`)
        if (run2) expectReport(names, run2.value!, 'ended', [], `${row} run 2`)
        expectSnapCalls(names, snaps, [], `${row} runs`)
        expectViewAt(sticky, shiftBox(a1, dx, dy), `${row} final sticky`, 0.01)
        expectRestored(sticky, authored, `${row} sticky`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `sticky offset ${dy.toFixed(2)} px; ended at frame ${endedAt}; ≤ ${worst.toFixed(3)} px`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── L-MEAS-7 ───────────────────────── */

/**
 * L-MEAS-7: a browser layout change (an element above grows, like an image
 * loading), then a commit; flat, and nested (a child under a parent with a
 * live size track). The drawn boxes follow the layout every frame
 * (≤ 0.5 px), and the commit's path is decided by the measured jump (§5.7):
 * - presented mid-run (a frame draws it before the capture): the change
 *   moved B and D together, so `J = 0` and path 1 keeps every track, on the
 *   content-following oracle, ending on schedule;
 * - made in the commit's own task: never presented, so it moved A only (D3).
 *   Every moved node is planned again from its measured B and analytic
 *   velocity toward its new A, and run 1 resolves 'interrupted'.
 */
export function L_MEAS_7(): Promise<string> {
    return variants('L_MEAS_7', [
        ['flat, presented: path 1', () => meas7Flat(true)],
        ["flat, in the commit's task: from (B, v)", () => meas7Flat(false)],
        [
            'nested under a live scale, presented: path 1',
            () => meas7Nested(true),
        ],
        [
            "nested under a live scale, in the commit's task: from (B, v)",
            () => meas7Nested(false),
        ],
    ])
}

async function meas7Flat(presented: boolean): Promise<string> {
    const row = `L_MEAS_7 flat ${presented ? 'presented' : "in the commit's task"}`
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    try {
        const stack = node(
            h.root,
            'left: 20px; top: 20px; width: 360px; height: 400px;'
        )
        const banner = document.createElement('div')
        banner.style.cssText = 'position: relative; width: 300px; height: 40px;'
        stack.append(banner)
        const card = document.createElement('div')
        card.style.cssText =
            'position: relative; margin-left: 0px; width: 100px; height: 50px; transform-origin: 0 0;'
        stack.append(card)
        const trigger = node(
            h.root,
            'left: 600px; top: 20px; width: 60px; height: 40px; transform-origin: 0 0;'
        )
        addNamed(h, names, { card, trigger })
        await baseline(h, row)

        const b1 = viewBox(card)
        h.group.capture()
        card.style.marginLeft = '160px'
        const authored = card.style.cssText
        const a1 = viewBox(card)
        const run1 = report(h.group.flush())
        const s1 = spec(b1, a1, { timing: ease })
        const grow = 60
        let dy = 0
        const cardAt = (t: number) => shiftBox(expectedBox(s1, t), 0, dy)
        let f = 0
        const at = (label: string) => {
            const t = restAt(f)
            return expectViewAt(
                card,
                cardAt(t),
                `${row} ${label} t=${t.toFixed(3)} card`
            )
        }
        let worst = at('flush 1 write')
        await expectRunning(names, run1, `${row} flush 1`)
        while (f < 6) {
            f++
            await step(h.mc)
            worst = Math.max(worst, at(`frame ${f}`))
        }
        if (presented) {
            banner.style.height = `${40 + grow}px`
            dy = grow
        }
        while (f < 9) {
            f++
            await step(h.mc)
            worst = Math.max(
                worst,
                at(presented ? `grown frame ${f}` : `frame ${f}`)
            )
        }

        // the commit at t_k
        const tk = restAt(f)
        const measured = viewBox(card)
        const velocity = velocityOf(cardAt, tk)
        const target = shiftBox(a1, 0, grow)
        const bTrigger = viewBox(trigger)
        h.group.capture()
        if (!presented) banner.style.height = `${40 + grow}px`
        trigger.style.left = '680px'
        const jump = expectJump(
            `${row} card`,
            card,
            measured,
            presented ? 'zero' : 'visible',
            presented ? undefined : [grow - 0.01, grow + 0.01]
        )
        const aTrigger = viewBox(trigger)
        const run2 = report(h.group.flush())
        const sTrigger = spec(bTrigger, aTrigger, { timing: ease })
        const sRetarget = spec(measured, target, { timing: ease, velocity })
        const sDropped = spec(measured, target, { timing: ease })
        const context = presented
            ? `the banner above grew ${grow} px, presented since flush 1; ${describeJump(jump)}: path 1`
            : `the banner above grew ${grow} px in the commit's task; ${describeJump(jump)}: A moved, B did not`
        worst = Math.max(
            worst,
            expectAll(`${row} commit write (${context})`, [
                [card, measured, 'card (measured B)'],
                [card, cardAt(tk), 'card (oracle at t_k)'],
                [trigger, bTrigger, 'trigger'],
            ])
        )
        await settleMicrotasks()
        if (presented && run1.value !== null) {
            throw new Error(
                `${row} commit: the kept run resolved at the commit (${describeReport(names, run1.value)}); J = 0, so path 1 keeps the track`
            )
        }
        if (!presented && run1.value?.status !== 'interrupted') {
            throw new Error(
                `${row} commit: run 1 is ${run1.value ? describeReport(names, run1.value) : 'still running'}; the unpresented change moved A only, so the card is planned again from (B, v) and run 1 resolves 'interrupted'`
            )
        }
        await expectRunning(names, run2, `${row} commit`)
        let g = 0
        let dropGap = 0
        let endedAt: number | null = null
        while ((run1.value === null || run2.value === null) && f < 80) {
            f++
            g++
            await step(h.mc)
            if (presented) {
                worst = Math.max(worst, at(`frame ${f}`))
            } else {
                const t = movingAt(g)
                if (g <= 6) {
                    dropGap = Math.max(
                        dropGap,
                        maxDiff(
                            expectedBox(sDropped, t),
                            expectedBox(sRetarget, t)
                        )
                    )
                }
                worst = Math.max(
                    worst,
                    expectViewAt(
                        card,
                        expectedBox(sRetarget, t),
                        `${row} frame ${f} card (from (B, v)) t'=${t.toFixed(3)}`
                    )
                )
            }
            worst = Math.max(
                worst,
                expectViewAt(
                    trigger,
                    expectedBox(sTrigger, restAt(g)),
                    `${row} frame ${f} trigger`
                )
            )
            if (endedAt === null && run1.value !== null) endedAt = f
        }
        if (presented) {
            expectEndedOnSchedule(endedAt, END_FRAME, `${row} run 1`)
            expectReport(names, run1.value!, 'ended', [], `${row} run 1`)
        }
        expectReport(names, run2.value!, 'ended', [], `${row} run 2`)
        expectSnapCalls(names, snaps, [], `${row} runs`)
        expectViewAt(card, target, `${row} final card`, 0.01)
        expectRestored(card, authored, `${row} card`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        if (presented) {
            return `path 1 (${describeJump(jump)}): kept on the original timeline, ended at frame ${endedAt}; ≤ ${worst.toFixed(3)} px`
        }
        if (!(dropGap > 1)) {
            throw new Error(
                `${row} setup: dropping the velocity changes the path by only ${dropGap.toFixed(3)} px, too little to prove continuity`
            )
        }
        return `from (B, v) (${describeJump(jump)}) ≤ ${worst.toFixed(3)} px (a dropped velocity would be ${dropGap.toFixed(1)} px off)`
    } finally {
        h.dispose()
    }
}

async function meas7Nested(presented: boolean): Promise<string> {
    const row = `L_MEAS_7 nested ${presented ? 'presented' : "in the commit's task"}`
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    try {
        const stack = node(
            h.root,
            'left: 20px; top: 20px; width: 420px; height: 500px;'
        )
        const banner = document.createElement('div')
        banner.style.cssText = 'position: relative; width: 300px; height: 40px;'
        stack.append(banner)
        const parent = document.createElement('div')
        parent.style.cssText =
            'position: relative; width: 320px; height: 200px; transform-origin: 0 0;'
        stack.append(parent)
        const child = node(
            parent,
            'left: 10px; top: 20px; width: 80px; height: 40px; transform-origin: 0 0;'
        )
        const trigger = node(
            h.root,
            'left: 600px; top: 20px; width: 60px; height: 40px; transform-origin: 0 0;'
        )
        addNamed(h, names, { parent, child, trigger })
        await baseline(h, row)

        const bParent = viewBox(parent)
        const bChild = viewBox(child)
        h.group.capture()
        parent.style.width = '160px'
        parent.style.height = '100px'
        child.style.left = '90px'
        const authored = [parent.style.cssText, child.style.cssText]
        const aParent = viewBox(parent)
        const aChild = viewBox(child)
        const run1 = report(h.group.flush())
        const sParent = spec(bParent, aParent, { timing: ease })
        const sChild = spec(bChild, aChild, { timing: ease })
        const grow = 50
        let dy = 0
        // the parent's layout box moved: a pure translation of its frame
        const parentAt = (t: number) => shiftBox(expectedBox(sParent, t), 0, dy)
        const childAt = (t: number) => shiftBox(expectedBox(sChild, t), 0, dy)
        let f = 0
        const first = (label: string) => {
            const t = restAt(f)
            return expectAll(`${row} ${label} t=${t.toFixed(3)}`, [
                [parent, parentAt(t), 'parent'],
                [child, childAt(t), 'child'],
            ])
        }
        let worst = first('flush 1 write')
        await expectRunning(names, run1, `${row} flush 1`)
        while (f < 6) {
            f++
            await step(h.mc)
            worst = Math.max(worst, first(`frame ${f}`))
        }
        if (presented) {
            banner.style.height = `${40 + grow}px`
            dy = grow
        }
        while (f < 9) {
            f++
            await step(h.mc)
            worst = Math.max(
                worst,
                first(presented ? `grown frame ${f}` : `frame ${f}`)
            )
        }

        // the commit at t_k
        const tk = restAt(f)
        const live = expectedBox(sParent, tk).w / aParent.w
        const measured = [viewBox(parent), viewBox(child)] as const
        const velocity = [velocityOf(parentAt, tk), velocityOf(childAt, tk)]
        const targets = [shiftBox(aParent, 0, grow), shiftBox(aChild, 0, grow)]
        const bTrigger = viewBox(trigger)
        h.group.capture()
        if (!presented) banner.style.height = `${40 + grow}px`
        trigger.style.left = '680px'
        const jumps = [parent, child].map((element, i) =>
            expectJump(
                `${row} ${nameOf(names, element)}`,
                element,
                measured[i]!,
                presented ? 'zero' : 'visible',
                presented ? undefined : [grow - 0.01, grow + 0.01]
            )
        )
        const aTrigger = viewBox(trigger)
        const run2 = report(h.group.flush())
        const sTrigger = spec(bTrigger, aTrigger, { timing: ease })
        const sRetarget = [0, 1].map((i) =>
            spec(measured[i]!, targets[i]!, {
                timing: ease,
                velocity: velocity[i]!,
            })
        )
        const sDropped = spec(measured[1], targets[1]!, { timing: ease })
        const context = `${presented ? `the banner above grew ${grow} px, presented since flush 1` : `the banner above grew ${grow} px in the commit's task`}; parent scale ${live.toFixed(3)}; child ${describeJump(jumps[1]!)}: ${presented ? 'path 1' : 'A moved, B did not'}`
        worst = Math.max(
            worst,
            expectAll(`${row} commit write (${context})`, [
                [parent, measured[0], 'parent (measured B)'],
                [child, measured[1], 'child (measured B)'],
                [parent, parentAt(tk), 'parent (oracle at t_k)'],
                [child, childAt(tk), 'child (oracle at t_k)'],
                [trigger, bTrigger, 'trigger'],
            ])
        )
        await settleMicrotasks()
        if (presented && run1.value !== null) {
            throw new Error(
                `${row} commit: the kept run resolved at the commit (${describeReport(names, run1.value)}); J = 0, so path 1 keeps both tracks`
            )
        }
        if (!presented && run1.value?.status !== 'interrupted') {
            throw new Error(
                `${row} commit: run 1 is ${run1.value ? describeReport(names, run1.value) : 'still running'}; the unpresented change moved A only, so both nodes are planned again from (B, v) and run 1 resolves 'interrupted'`
            )
        }
        await expectRunning(names, run2, `${row} commit`)
        let g = 0
        let dropGap = 0
        let endedAt: number | null = null
        while ((run1.value === null || run2.value === null) && f < 90) {
            f++
            g++
            await step(h.mc)
            if (presented) {
                worst = Math.max(worst, first(`frame ${f}`))
            } else {
                const t = movingAt(g)
                if (g <= 6) {
                    dropGap = Math.max(
                        dropGap,
                        maxDiff(
                            expectedBox(sDropped, t),
                            expectedBox(sRetarget[1]!, t)
                        )
                    )
                }
                worst = Math.max(
                    worst,
                    expectAll(`${row} frame ${f} t'=${t.toFixed(3)}`, [
                        [
                            parent,
                            expectedBox(sRetarget[0]!, t),
                            'parent (from (B, v))',
                        ],
                        [
                            child,
                            expectedBox(sRetarget[1]!, t),
                            'child (from (B, v))',
                        ],
                    ])
                )
            }
            worst = Math.max(
                worst,
                expectViewAt(
                    trigger,
                    expectedBox(sTrigger, restAt(g)),
                    `${row} frame ${f} trigger`
                )
            )
            if (endedAt === null && run1.value !== null) endedAt = f
        }
        if (presented) {
            expectEndedOnSchedule(endedAt, END_FRAME, `${row} run 1`)
            expectReport(names, run1.value!, 'ended', [], `${row} run 1`)
        }
        expectReport(names, run2.value!, 'ended', [], `${row} run 2`)
        expectSnapCalls(names, snaps, [], `${row} runs`)
        expectViewAt(parent, targets[0]!, `${row} final parent`, 0.01)
        expectViewAt(child, targets[1]!, `${row} final child`, 0.01)
        expectRestored(parent, authored[0]!, `${row} parent`)
        expectRestored(child, authored[1]!, `${row} child`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        if (presented) {
            return `path 1 under the parent's live scale ${live.toFixed(3)} (child ${describeJump(jumps[1]!)}): kept on the original timeline, ended at frame ${endedAt}; ≤ ${worst.toFixed(3)} px`
        }
        if (!(dropGap > 1)) {
            throw new Error(
                `${row} setup: dropping the child's velocity changes its path by only ${dropGap.toFixed(3)} px, too little to prove continuity`
            )
        }
        return `parent and child from (B, v) under the parent's live scale ${live.toFixed(3)} ≤ ${worst.toFixed(3)} px (a dropped velocity would be ${dropGap.toFixed(1)} px off)`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── L-MEAS-8 ───────────────────────── */

/**
 * L-MEAS-8: a fixed sheet with nested participants while the page scrolls.
 * A fixed element does not move in view space, so a page scroll in the
 * commit's task or mid-run moves nothing (§3.2): no motion, no 'stale'; the
 * inner layout animates on its oracle, and a commit mid-run keeps it.
 */
export async function L_MEAS_8(): Promise<string> {
    const row = 'L_MEAS_8'
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    /** Scrolls the page, failing as a setup error when the scroll does not land. */
    const scrollPage = (y: number) => {
        scrollTo(0, y)
        if (scrollY !== y) {
            throw new Error(
                `${row} setup: the page scrolled to ${scrollY}, not ${y}`
            )
        }
    }
    try {
        h.root.style.height = '2400px'
        scrollPage(100)
        const sheet = document.createElement('div')
        sheet.style.cssText =
            'position: fixed; left: 40px; top: 60px; width: 260px; height: 180px; box-sizing: border-box; transform-origin: 0 0;'
        h.root.append(sheet)
        const inner = node(
            sheet,
            'left: 16px; top: 24px; width: 100px; height: 44px; transform-origin: 0 0;'
        )
        addNamed(h, names, { sheet, inner })
        await baseline(h, row)
        const authored = [sheet.style.cssText, inner.style.cssText]

        // 1. the page scrolls in the commit's task; nothing else changes
        const bSheet = viewBox(sheet)
        const bInner = viewBox(inner)
        h.group.capture()
        scrollPage(380)
        const scrollOnly = report(h.group.flush())
        let worst = expectAll(
            `${row} scroll-only flush write (the page scrolled 100 → 380 px in the commit's task; the sheet is viewport-fixed)`,
            [
                [sheet, bSheet, 'sheet'],
                [inner, bInner, 'inner'],
            ]
        )
        const r1 = await expectNoRun(
            scrollOnly,
            `${row} scroll-only flush`,
            'a fixed sheet does not move in view space'
        )
        expectReport(names, r1, 'no-change', [], `${row} scroll-only flush`)
        expectSnapCalls(names, snaps, [], `${row} scroll-only flush`)
        for (let f = 1; f <= 3; f++) {
            await step(h.mc)
            worst = Math.max(
                worst,
                expectAll(`${row} scroll-only frame ${f}`, [
                    [sheet, bSheet, 'sheet'],
                    [inner, bInner, 'inner'],
                ])
            )
        }
        expectRestored(sheet, authored[0]!, `${row} scroll-only sheet`)
        expectRestored(inner, authored[1]!, `${row} scroll-only inner`)

        // 2. the inner layout changes while the page scrolls in the commit's task
        h.group.capture()
        scrollPage(620)
        sheet.style.width = '320px'
        inner.style.left = '136px'
        const authoredRun = [sheet.style.cssText, inner.style.cssText]
        const aSheet = viewBox(sheet)
        const aInner = viewBox(inner)
        const run = report(h.group.flush())
        const sSheet = spec(bSheet, aSheet, { timing: ease })
        const sInner = spec(bInner, aInner, { timing: ease })
        let f = 0
        const at = (label: string) => {
            const t = restAt(f)
            return expectAll(`${row} ${label} t=${t.toFixed(3)}`, [
                [sheet, expectedBox(sSheet, t), 'sheet'],
                [inner, expectedBox(sInner, t), 'inner'],
            ])
        }
        worst = Math.max(worst, at('flush write'))
        await expectRunning(names, run, `${row} flush`)
        while (run.value === null && f < 60) {
            if (f === 4) scrollPage(900)
            if (f === 8) scrollPage(150)
            if (f === 11) {
                // a commit mid-run with an unpresented page scroll: kept (δ = 0)
                h.group.capture()
                scrollPage(400)
                const commit = report(h.group.flush())
                worst = Math.max(
                    worst,
                    at(
                        "commit write (the page scrolled 150 → 400 px in the commit's task)"
                    )
                )
                const r = await expectNoRun(
                    commit,
                    `${row} commit`,
                    'nothing moved in view space, so the tracks are kept'
                )
                expectReport(names, r, 'no-change', [], `${row} commit`)
            }
            f++
            await step(h.mc)
            worst = Math.max(worst, at(`frame ${f}`))
        }
        expectReport(names, run.value!, 'ended', [], `${row} run`)
        expectSnapCalls(names, snaps, [], `${row} run`)
        expectViewAt(sheet, aSheet, `${row} final sheet`, 0.01)
        expectViewAt(inner, aInner, `${row} final inner`, 0.01)
        expectRestored(sheet, authoredRun[0]!, `${row} sheet`)
        expectRestored(inner, authoredRun[1]!, `${row} inner`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `page scrolls 100 → 380 → 620 → 900 → 150 → 400 move nothing; ${f} frames ≤ ${worst.toFixed(3)} px`
    } finally {
        scrollTo(0, 0)
        h.dispose()
    }
}

/* ───────────────────────── L-MEAS-9 ───────────────────────── */

/**
 * L-MEAS-9: nested driven parent and child. (a) A fresh capture mid-run:
 * both retarget from their measured boxes and analytic velocities; each frame
 * both are on their own oracle, so the child cannot shear. (b) A frame passes
 * between `capture()` and `flush()`: the capture is aged (§4.1), the flush
 * keeps both tracks translated by δ and reports them 'stale' (§4.4), and
 * nothing rewinds to the aged box.
 */
export function L_MEAS_9(): Promise<string> {
    return variants('L_MEAS_9', [
        ['(a) fresh capture', meas9Fresh],
        ['(b) aged capture', meas9Aged],
    ])
}

async function meas9Fresh(): Promise<string> {
    const row = 'L_MEAS_9 (a)'
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    try {
        const parent = node(
            h.root,
            'left: 20px; top: 20px; width: 200px; height: 120px; transform-origin: 0 0;'
        )
        const child = node(
            parent,
            'left: 10px; top: 15px; width: 60px; height: 40px; transform-origin: 0 0;'
        )
        addNamed(h, names, { parent, child })
        await baseline(h, row)

        const bParent = viewBox(parent)
        const bChild = viewBox(child)
        h.group.capture()
        parent.style.left = '140px'
        parent.style.width = '300px'
        child.style.left = '90px'
        child.style.width = '100px'
        const aParent = viewBox(parent)
        const aChild = viewBox(child)
        const run1 = report(h.group.flush())
        const sParent = spec(bParent, aParent, { timing: ease })
        const sChild = spec(bChild, aChild, { timing: ease })
        let f = 0
        const first = (label: string) => {
            const t = restAt(f)
            return expectAll(`${row} ${label} t=${t.toFixed(3)}`, [
                [parent, expectedBox(sParent, t), 'parent'],
                [child, expectedBox(sChild, t), 'child'],
            ])
        }
        let worst = first('flush 1 write')
        await expectRunning(names, run1, `${row} flush 1`)
        while (f < 6) {
            f++
            await step(h.mc)
            worst = Math.max(worst, first(`frame ${f}`))
        }

        const tk = restAt(f)
        const mParent = viewBox(parent)
        const mChild = viewBox(child)
        const vParent = velocityOf((t) => expectedBox(sParent, t), tk)
        const vChild = velocityOf((t) => expectedBox(sChild, t), tk)
        const root = viewBox(h.root)
        h.group.capture()
        parent.style.left = '60px'
        parent.style.top = '80px'
        parent.style.width = '240px'
        child.style.left = '40px'
        child.style.top = '35px'
        child.style.width = '80px'
        const authored = [authorText(parent), authorText(child)]
        const aParent2 = { x: root.x + 60, y: root.y + 80, w: 240, h: 120 }
        const aChild2 = { x: aParent2.x + 40, y: aParent2.y + 35, w: 80, h: 40 }
        const run2 = report(h.group.flush())
        const sParent2 = spec(mParent, aParent2, {
            timing: ease,
            velocity: vParent,
        })
        const sChild2 = spec(mChild, aChild2, {
            timing: ease,
            velocity: vChild,
        })
        worst = Math.max(
            worst,
            expectAll(`${row} retarget write`, [
                [parent, mParent, 'parent (measured B)'],
                [child, mChild, 'child (measured B)'],
            ])
        )
        await settleMicrotasks()
        if (run1.value?.status !== 'interrupted') {
            throw new Error(
                `${row} retarget: run 1 is ${run1.value ? describeReport(names, run1.value) : 'still running'}; both tracks were replaced, so it resolves 'interrupted'`
            )
        }
        await expectRunning(names, run2, `${row} retarget`)
        let g = 0
        while (run2.value === null && g < 60) {
            g++
            await step(h.mc)
            const t = movingAt(g)
            worst = Math.max(
                worst,
                expectAll(`${row} retarget frame ${g} t'=${t.toFixed(3)}`, [
                    [parent, expectedBox(sParent2, t), 'parent'],
                    [child, expectedBox(sChild2, t), 'child'],
                ])
            )
        }
        expectReport(names, run2.value!, 'ended', [], `${row} run 2`)
        expectSnapCalls(names, snaps, [], `${row} runs`)
        expectViewAt(parent, aParent2, `${row} final parent`, 0.01)
        expectViewAt(child, aChild2, `${row} final child`, 0.01)
        expectRestored(parent, authored[0]!, `${row} parent`)
        expectRestored(child, authored[1]!, `${row} child`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `both from (B, v), ${g} frames ≤ ${worst.toFixed(3)} px`
    } finally {
        h.dispose()
    }
}

async function meas9Aged(): Promise<string> {
    const row = 'L_MEAS_9 (b)'
    const linear = timing.linear()
    const { h, snaps, names } = harnessWithSnaps(linear)
    try {
        const parent = node(
            h.root,
            'left: 0; top: 0; width: 200px; height: 100px; transform-origin: 0 0;'
        )
        const child = node(
            parent,
            'left: 0; top: 0; width: 80px; height: 40px; transform-origin: 0 0;'
        )
        addNamed(h, names, { parent, child })
        await baseline(h, row)

        const bParent = viewBox(parent)
        const bChild = viewBox(child)
        h.group.capture()
        parent.style.left = '160px'
        child.style.left = '160px'
        const aParent = viewBox(parent)
        const aChild = viewBox(child)
        const run1 = report(h.group.flush())
        const sParent = spec(bParent, aParent, { timing: linear })
        const sChild = spec(bChild, aChild, { timing: linear })
        let dParent = 0
        let dChild = 0
        let f = 0
        const at = (label: string) => {
            const t = restAt(f)
            return expectAll(`${row} ${label} t=${t.toFixed(3)}`, [
                [
                    parent,
                    shiftBox(expectedBox(sParent, t), dParent, 0),
                    'parent',
                ],
                [child, shiftBox(expectedBox(sChild, t), dChild, 0), 'child'],
            ])
        }
        let worst = at('flush 1 write')
        await expectRunning(names, run1, `${row} flush 1`)
        while (f < 4) {
            f++
            await step(h.mc)
            worst = Math.max(worst, at(`frame ${f}`))
        }

        // capture, then a clock frame passes before the flush: aged
        h.group.capture()
        const agedChild = viewBox(child)
        f++
        await step(h.mc)
        worst = Math.max(worst, at(`frame ${f} (after the capture)`))
        if (!(viewBox(child).x > agedChild.x + 5)) {
            throw new Error(
                `${row} setup: the child did not move after the capture`
            )
        }
        parent.style.left = '200px'
        child.style.left = '180px'
        const quiet = silenceWarnings()
        let aged: Holder
        try {
            aged = report(h.group.flush())
        } finally {
            quiet.restore()
        }
        // §4.4: both keep their tracks, translated by δ (+40 and +60)
        dParent = 40
        dChild = 60
        worst = Math.max(
            worst,
            at(
                'aged flush write (a frame ran between capture() and flush(); both tracks kept, translated by δ)'
            )
        )
        const r = await expectNoRun(
            aged,
            `${row} aged flush`,
            'an aged capture never supplies B; driven nodes keep their tracks (§4.4)'
        )
        const stale: Snap[] = [
            { element: parent, reason: 'stale' },
            { element: child, reason: 'stale' },
        ]
        expectReport(names, r, 'stale', stale, `${row} aged flush`)
        expectSnapCalls(names, snaps, stale, `${row} aged flush`)
        if (run1.value !== null) {
            throw new Error(
                `${row} aged flush: run 1 resolved (${describeReport(names, run1.value)}); the kept tracks still run`
            )
        }
        let endedAt: number | null = null
        while (run1.value === null && f < 60) {
            f++
            await step(h.mc)
            worst = Math.max(worst, at(`frame ${f}`))
            if (run1.value !== null) endedAt = f
        }
        expectEndedOnSchedule(endedAt, END_FRAME, `${row} run 1`)
        expectReport(names, run1.value!, 'ended', [], `${row} run 1`)
        expectViewAt(
            parent,
            shiftBox(aParent, 40, 0),
            `${row} final parent`,
            0.01
        )
        expectViewAt(child, shiftBox(aChild, 60, 0), `${row} final child`, 0.01)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `aged: both kept and reported, no rewind; ended at frame ${endedAt}; ≤ ${worst.toFixed(3)} px`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── L-MEAS-10 ───────────────────────── */

/**
 * L-MEAS-10: participants in an open and in a closed shadow root inside an
 * outer scroller, as L-MEAS-4. In each root a shadow participant (`panel`)
 * runs a size track from scale 2; inside it a shadow child and a light-DOM
 * child slotted into the panel's `<slot>` run their own tracks. Their parent
 * participant in the flat tree (§4.6) is the panel, so both are drawn exactly
 * on their oracle under its live scale. The outer scroller scrolls mid-run,
 * presented by frames; then a commit:
 * - (i) moves an unrelated participant: `J = 0` for every node, so path 1
 *   keeps every track, and run 1 ends on schedule (§5.7);
 * - (ii) also moves both children by less than `threshold`: `J ≠ 0` under
 *   the panel's live scale, so path 3 retargets both from their measured
 *   boxes and velocities, while the panel keeps its track (path 1).
 */
export function L_MEAS_10(): Promise<string> {
    return variants('L_MEAS_10', [
        ['open root (i), path 1', () => meas10('open', 0)],
        ['open root (ii), path 3', () => meas10('open', SUB_MOVE)],
        ['closed root (i), path 1', () => meas10('closed', 0)],
        ['closed root (ii), path 3', () => meas10('closed', SUB_MOVE)],
        [
            '(b) moved from the document into a closed root',
            () => meas10Moved('document'),
        ],
        [
            '(b) moved from one closed root into another',
            () => meas10Moved('closed root'),
        ],
    ])
}

/**
 * L-MEAS-10 (b): a registered panel (a participant holding a `<slot>`) moves
 * into a closed root between flushes, from the document or from another
 * closed root, and a light-DOM participant of that root's host is slotted
 * into it. From the next pass the panel's new root is tracked (§4.6): a
 * commit that runs the panel's size track from scale 2 draws the slotted
 * child exactly on its own oracle, counter-projected under the panel, and
 * no pass looks into the root the panel left.
 */
async function meas10Moved(from: 'document' | 'closed root'): Promise<string> {
    const row = `L_MEAS_10 (b) from ${from}`
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    try {
        const scroller = node(
            h.root,
            'left: 20px; top: 20px; width: 420px; height: 400px; overflow-y: auto;'
        )
        const content = document.createElement('div')
        content.style.cssText =
            'position: relative; width: 400px; height: 800px;'
        scroller.append(content)
        /** A host whose closed root has a frame with the default slot (the child's place until a panel takes it). */
        const closedHost = (top: number) => {
            const host = node(
                content,
                `left: 10px; top: ${top}px; width: 380px; height: 320px;`
            )
            const shadow = host.attachShadow({ mode: 'closed' })
            const frame = document.createElement('div')
            frame.style.cssText =
                'position: absolute; left: 0; top: 200px; width: 300px; height: 100px;'
            const fallback = document.createElement('slot')
            frame.append(fallback)
            shadow.append(frame)
            return { host, shadow, fallback }
        }
        const target = closedHost(60)
        const panel = document.createElement('div')
        panel.style.cssText =
            'position: absolute; left: 0; top: 0; width: 300px; height: 150px; box-sizing: border-box; transform-origin: 0 0;'
        panel.append(document.createElement('slot'))
        const slotted = document.createElement('div')
        slotted.style.cssText =
            'position: absolute; left: 10px; top: 60px; width: 60px; height: 30px; box-sizing: border-box; transform-origin: 0 0;'
        let left: { slot: HTMLSlotElement; calls: number } | null = null
        if (from === 'document') {
            content.append(panel)
            target.host.append(slotted)
        } else {
            const source = closedHost(420)
            source.shadow.prepend(panel)
            source.host.append(slotted)
            const slot = source.fallback
            const counter = { slot, calls: 0 }
            const assigned = slot.assignedNodes.bind(slot)
            slot.assignedNodes = (options?: AssignedNodesOptions) => {
                counter.calls++
                return assigned(options)
            }
            left = counter
        }
        addNamed(h, names, { panel, 'slotted child': slotted })
        await baseline(h, row)

        // between flushes: the panel moves into the target's closed root and
        // takes the slotted child (the first default slot in tree order)
        h.group.capture()
        target.shadow.prepend(panel)
        if (from === 'closed root') target.host.append(slotted)
        if (left) left.calls = 0
        const quiet = silenceWarnings()
        try {
            void h.group.flush()
            h.group.finish()
        } finally {
            quiet.restore()
        }
        snaps.length = 0
        await settleMicrotasks()
        await baseline(h, `${row} after the move`)

        const bPanel = viewBox(panel)
        const bKid = viewBox(slotted)
        h.group.capture()
        panel.style.width = '150px'
        panel.style.height = '75px'
        slotted.style.left = '70px'
        const authoredPanel = panel.style.cssText
        const authoredKid = slotted.style.cssText
        const aPanel = viewBox(panel)
        const aKid = viewBox(slotted)
        const run = report(h.group.flush())
        const sPanel = spec(bPanel, aPanel, { timing: ease })
        const sKid = spec(bKid, aKid, { timing: ease })
        let worst = 0
        const check = (label: string, f: number) => {
            const t = restAt(f)
            try {
                worst = Math.max(
                    worst,
                    expectAll(`${row} ${label} t=${t.toFixed(3)}`, [
                        [panel, expectedBox(sPanel, t), 'panel'],
                        [slotted, expectedBox(sKid, t), 'slotted child'],
                    ])
                )
            } catch (error) {
                // where it is drawn when planned without the panel as parent
                const p = expectedBox(sPanel, t)
                const o = expectedBox(sKid, t)
                const k = p.w / aPanel.w
                const unparented = {
                    x: p.x + (o.x - aPanel.x) * k,
                    y: p.y + (o.y - aPanel.y) * k,
                    w: o.w * k,
                    h: o.h * k,
                }
                if (
                    error instanceof Error &&
                    maxDiff(viewBox(slotted), unparented) <= 0.5
                ) {
                    error.message += `; it is drawn at ${JSON.stringify(unparented)}, its own track under the panel's pose: planned without the panel as its parent, so the panel's new root is not tracked (§4.6)`
                }
                throw error
            }
        }
        check('flush write', 0)
        await expectRunning(names, run, `${row} flush`)
        let f = 0
        while (run.value === null && f < 60) {
            f++
            await step(h.mc)
            check(`frame ${f}`, f)
        }
        expectReport(names, run.value!, 'ended', [], `${row} run`)
        expectSnapCalls(names, snaps, [], `${row} run`)
        expectRestored(panel, authoredPanel, `${row} panel`)
        expectRestored(slotted, authoredKid, `${row} slotted child`)
        if (left && left.calls !== 0) {
            throw new Error(
                `${row}: a pass called assignedNodes() ${left.calls} times on a slot of the closed root the panel left, which holds no participant: the old root was not dropped (§4.6)`
            )
        }
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `${f} frames, panel and slotted child on the oracle ≤ ${worst.toFixed(3)} px`
    } finally {
        h.dispose()
    }
}

async function meas10(mode: ShadowRootMode, move: number): Promise<string> {
    const path = move === 0 ? 1 : 3
    const row = `L_MEAS_10 ${mode} ${move === 0 ? '(i)' : '(ii)'}`
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(
        ease,
        move === 0 ? undefined : KEEP_THRESHOLD
    )
    /** Set once the slotted child exists: what `assignedSlot` returns for it. */
    let slotSeen: 'null' | 'the panel slot' | null = null
    try {
        const scroller = node(
            h.root,
            'left: 20px; top: 20px; width: 420px; height: 300px; overflow-y: auto;'
        )
        const content = document.createElement('div')
        content.style.cssText =
            'position: relative; width: 400px; height: 800px;'
        scroller.append(content)
        const host = node(
            content,
            'left: 10px; top: 60px; width: 380px; height: 320px;'
        )
        const shadow = host.attachShadow({ mode })
        const panel = document.createElement('div')
        panel.style.cssText =
            'position: absolute; left: 0; top: 0; width: 300px; height: 150px; box-sizing: border-box; transform-origin: 0 0;'
        shadow.append(panel)
        const inShadow = document.createElement('div')
        inShadow.style.cssText =
            'position: absolute; left: 10px; top: 10px; width: 60px; height: 30px; box-sizing: border-box; transform-origin: 0 0;'
        panel.append(inShadow)
        panel.append(document.createElement('slot'))
        const slotted = node(
            host,
            'left: 10px; top: 60px; width: 60px; height: 30px; transform-origin: 0 0;'
        )
        slotSeen = slotted.assignedSlot === null ? 'null' : 'the panel slot'
        const trigger = node(
            h.root,
            'left: 600px; top: 20px; width: 60px; height: 40px; transform-origin: 0 0;'
        )
        addNamed(h, names, {
            panel,
            'shadow child': inShadow,
            'slotted child': slotted,
            trigger,
        })
        await baseline(h, row)

        const kids = [inShadow, slotted] as const
        const bPanel = viewBox(panel)
        const bKids = kids.map(viewBox)
        h.group.capture()
        panel.style.width = '150px'
        panel.style.height = '75px'
        inShadow.style.left = '70px'
        slotted.style.left = '70px'
        const authoredPanel = panel.style.cssText
        const aPanel = viewBox(panel)
        const aKids = kids.map(viewBox)
        const run1 = report(h.group.flush())
        const sPanel = spec(bPanel, aPanel, { timing: ease })
        const sKids = kids.map((_, i) =>
            spec(bKids[i]!, aKids[i]!, { timing: ease })
        )
        let dy = 0
        // the outer scroll translates the whole host
        const panelAt = (t: number) => shiftBox(expectedBox(sPanel, t), 0, dy)
        const kidAt = (i: number, t: number) =>
            shiftBox(expectedBox(sKids[i]!, t), 0, dy)
        /**
         * Where a child is drawn when its track is planned without the panel
         * as its parent: the panel's pose (scale about its top-left corner)
         * applied on top of the child's own track.
         */
        const unparented = (i: number, t: number): OBox => {
            const p = panelAt(t)
            const o = kidAt(i, t)
            const k = p.w / aPanel.w
            const ox = aPanel.x
            const oy = aPanel.y + dy
            return {
                x: p.x + (o.x - ox) * k,
                y: p.y + (o.y - oy) * k,
                w: o.w * k,
                h: o.h * k,
            }
        }
        let f = 0
        const first = (label: string) => {
            const t = restAt(f)
            try {
                return expectAll(`${row} ${label} t=${t.toFixed(3)}`, [
                    [panel, panelAt(t), 'panel'],
                    ...kids.map(
                        (k, i) => [k, kidAt(i, t), nameOf(names, k)] as const
                    ),
                ])
            } catch (error) {
                const i = kids.findIndex(
                    (k, j) => maxDiff(viewBox(k), kidAt(j, t)) > 0.5
                )
                if (i >= 0 && error instanceof Error) {
                    const off = maxDiff(viewBox(kids[i]!), unparented(i, t))
                    if (off <= 0.5) {
                        error.message += `; it is drawn within ${off.toFixed(3)} px of ${JSON.stringify(unparented(i, t))}, its own track under the panel's pose: planned without the panel as its parent`
                    }
                }
                throw error
            }
        }
        let worst = first('flush 1 write')
        await expectRunning(names, run1, `${row} flush 1`)
        while (f < 6) {
            f++
            await step(h.mc)
            worst = Math.max(worst, first(`frame ${f}`))
        }
        scroller.scrollTop = 50
        if (scroller.scrollTop !== 50) {
            throw new Error(
                `${row} setup: the outer scroller scrolled to ${scroller.scrollTop}, not 50`
            )
        }
        dy = -50
        while (f < 9) {
            f++
            await step(h.mc)
            worst = Math.max(worst, first(`scrolled frame ${f}`))
        }

        const tk = restAt(f)
        const live = expectedBox(sPanel, tk).w / aPanel.w
        const measured = kids.map(viewBox)
        const velocity = kids.map((_, i) => velocityOf((t) => kidAt(i, t), tk))
        const targets = aKids.map((a) => shiftBox(a, move, -50))
        const bTrigger = viewBox(trigger)
        h.group.capture()
        trigger.style.left = '680px'
        if (move !== 0) {
            inShadow.style.left = `${70 + move}px`
            slotted.style.left = `${70 + move}px`
        }
        const authoredKids = kids.map(authorText)
        const jumps = kids.map((k, i) =>
            expectJump(
                `${row} ${nameOf(names, k)}`,
                k,
                measured[i]!,
                move === 0 ? 'zero' : 'visible'
            )
        )
        const aTrigger = viewBox(trigger)
        const run2 = report(h.group.flush())
        const sRetarget = kids.map((_, i) =>
            spec(measured[i]!, targets[i]!, {
                timing: ease,
                velocity: velocity[i]!,
            })
        )
        const sTrigger = spec(bTrigger, aTrigger, { timing: ease })
        /** A child's expected box and name `gi` frames after the commit, frame `fi` since flush 1. */
        const kidNow = (
            i: number,
            fi: number,
            gi: number
        ): readonly [OBox, string] =>
            path === 1
                ? [
                      kidAt(i, restAt(fi)),
                      `${nameOf(names, kids[i]!)} (path 1, its own timeline)`,
                  ]
                : [
                      expectedBox(sRetarget[i]!, movingAt(gi)),
                      `${nameOf(names, kids[i]!)} (path 3) t'=${movingAt(gi).toFixed(3)}`,
                  ]
        const jumpText = kids
            .map((k, i) => `${nameOf(names, k)} ${describeJump(jumps[i]!)}`)
            .join(', ')
        worst = Math.max(
            worst,
            expectAll(
                `${row} commit write (an outer scroll of 50 px presented since flush 1${move === 0 ? '' : `; the commit moved both children ${move} px`}; the panel's live scale ${live.toFixed(3)}; ${jumpText}: path ${path})`,
                [
                    [panel, panelAt(tk), 'panel'],
                    ...kids.flatMap((k, i) => [
                        [
                            k,
                            measured[i]!,
                            `${nameOf(names, k)} (measured B)`,
                        ] as const,
                        [k, ...kidNow(i, f, 0)] as const,
                    ]),
                    [trigger, bTrigger, 'trigger'],
                ]
            )
        )
        await settleMicrotasks()
        if (path === 1 && run1.value !== null) {
            throw new Error(
                `${row} commit: run 1 resolved at the commit (${describeReport(names, run1.value)}); J = 0, so path 1 keeps every track`
            )
        }
        if (path === 3 && run1.value?.status !== 'interrupted') {
            throw new Error(
                `${row} commit: run 1 is ${run1.value ? describeReport(names, run1.value) : 'still running'}; path 3 replaces the children's tracks, so it resolves 'interrupted'`
            )
        }
        await expectRunning(names, run2, `${row} commit`)
        let g = 0
        let endedAt: number | null = null
        while ((run1.value === null || run2.value === null) && f < 90) {
            f++
            g++
            await step(h.mc)
            worst = Math.max(
                worst,
                expectAll(`${row} frame ${f}`, [
                    [panel, panelAt(restAt(f)), 'panel'],
                    ...kids.map((k, i) => [k, ...kidNow(i, f, g)] as const),
                    [trigger, expectedBox(sTrigger, restAt(g)), 'trigger'],
                ])
            )
            if (endedAt === null && run1.value !== null) endedAt = f
        }
        if (path === 1) {
            expectEndedOnSchedule(endedAt, END_FRAME, `${row} run 1`)
            expectReport(names, run1.value!, 'ended', [], `${row} run 1`)
        }
        expectReport(names, run2.value!, 'ended', [], `${row} run 2`)
        expectSnapCalls(names, snaps, [], `${row} runs`)
        kids.forEach((k, i) =>
            expectViewAt(
                k,
                targets[i]!,
                `${row} final ${nameOf(names, k)}`,
                0.01
            )
        )
        expectViewAt(
            panel,
            shiftBox(aPanel, 0, -50),
            `${row} final panel`,
            0.01
        )
        expectRestored(panel, authoredPanel, `${row} panel`)
        kids.forEach((k, i) =>
            expectRestored(k, authoredKids[i]!, `${row} ${nameOf(names, k)}`)
        )
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `path ${path} under the panel's live scale ${live.toFixed(3)}${path === 1 ? `, ended at frame ${endedAt}` : ''}; shadow and slotted children exact ≤ ${worst.toFixed(3)} px`
    } catch (error) {
        // name the flat-tree ancestry the page itself reports, so a failure
        // caused by a parent lookup through `assignedSlot` shows it (§4.6)
        if (slotSeen === 'null' && error instanceof Error) {
            error.message += ` (the slotted child's assignedSlot is null in a ${mode} root although it is slotted into the panel, so a parent lookup through assignedSlot misses the panel)`
        }
        throw error
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── L-MEAS-11 ───────────────────────── */

/**
 * L-MEAS-11: the §4.4 table, for a capture-less flush and for an aged
 * capture (an asynchronous gap that lets a rendering opportunity pass, the
 * window `requestAnimationFrame` half of the frame marker). Nodes: undriven
 * moved, undriven unmoved, newly registered, driven with |δ| above and below
 * `threshold`, and an amplified driven node whose |δ| is 0.005 px (below
 * 0.01) under a screen amplification ρ ≈ 330 (the L-MEAS-4 construction), so
 * |δ|·max(1, ρ) ≈ 1.7 px reaches `threshold`. `status`, `report.snapped` and
 * the `onSnap` calls must be exactly the §4.4 set.
 */
export function L_MEAS_11(): Promise<string> {
    return variants('L_MEAS_11', [
        ['capture-less flush', () => meas11('capture-less')],
        ['aged capture', () => meas11('aged')],
    ])
}

async function meas11(mode: 'capture-less' | 'aged'): Promise<string> {
    const row = `L_MEAS_11 ${mode}`
    const linear = timing.linear()
    const { h, snaps, names } = harnessWithSnaps(linear)
    try {
        const box = (top: number) =>
            node(
                h.root,
                `left: 0; top: ${top}px; width: 80px; height: 30px; transform-origin: 0 0;`
            )
        const undrivenMoved = box(20)
        const undrivenUnmoved = box(60)
        const drivenAbove = box(100)
        const drivenBelow = box(140)
        const q0 = 0.05
        const anc = node(
            h.root,
            `left: 300px; top: 40px; width: 5000px; height: 5000px; transform: scale(${q0}); transform-origin: 0 0;`
        )
        const wrap = node(anc, 'left: 0; top: 0; width: 0; height: 0;')
        const amplified = node(
            wrap,
            'left: 0; top: 0; width: 800px; height: 800px; transform-origin: 0 0;'
        )
        addNamed(h, names, {
            'undriven moved': undrivenMoved,
            'undriven unmoved': undrivenUnmoved,
            'driven above': drivenAbove,
            'driven below': drivenBelow,
            ancestor: anc,
            amplified,
        })
        await baseline(h, row)

        // flush 1: four driven tracks
        const bAbove = viewBox(drivenAbove)
        const bBelow = viewBox(drivenBelow)
        const bAnc = viewBox(anc)
        const bAmp = viewBox(amplified)
        h.group.capture()
        drivenAbove.style.left = '160px'
        drivenBelow.style.left = '160px'
        anc.style.width = '200px'
        anc.style.height = '200px'
        amplified.style.width = '200px'
        amplified.style.height = '200px'
        const aAbove = viewBox(drivenAbove)
        const aBelow = viewBox(drivenBelow)
        const aAnc = viewBox(anc)
        const aAmp = viewBox(amplified)
        const run1 = report(h.group.flush())
        const sAbove = spec(bAbove, aAbove, { timing: linear })
        const sBelow = spec(bBelow, aBelow, { timing: linear })
        const sAnc = spec(bAnc, aAnc, { timing: linear })
        const sAmp = spec(bAmp, aAmp, { timing: linear })
        const origin = { x: aAnc.x, y: aAnc.y }
        const shift = 0.1
        let layer = 1
        let shifted = 0
        let dAbove = 0
        let dBelow = 0
        const pose = (t: number) => expectedBox(sAnc, t).w / aAnc.w
        const ancAt = (t: number) => {
            const v = expectedBox(sAnc, t)
            return { x: v.x, y: v.y, w: v.w * layer, h: v.h * layer }
        }
        const ampAt = (t: number) => {
            const v = expectedBox(sAmp, t)
            return {
                x: origin.x + layer * (v.x - origin.x) + shifted * pose(t),
                y: origin.y + layer * (v.y - origin.y),
                w: layer * v.w,
                h: layer * v.h,
            }
        }
        let f = 0
        /** `slack`: the amplified node may be off by its reported bound after the flush (§4.4). */
        let slack = 0
        const at = (label: string) => {
            const t = restAt(f)
            let worst = expectAll(`${row} ${label} t=${t.toFixed(3)}`, [
                [
                    drivenAbove,
                    shiftBox(expectedBox(sAbove, t), dAbove, 0),
                    'driven above',
                ],
                [
                    drivenBelow,
                    shiftBox(expectedBox(sBelow, t), dBelow, 0),
                    'driven below',
                ],
                [anc, ancAt(t), 'ancestor'],
            ])
            worst = Math.max(
                worst,
                expectViewAt(
                    amplified,
                    ampAt(t),
                    `${row} ${label} t=${t.toFixed(3)} amplified`,
                    0.5 + slack
                )
            )
            return worst
        }
        let worst = at('flush 1 write')
        await expectRunning(names, run1, `${row} flush 1`)
        while (f < 7) {
            f++
            await step(h.mc)
            worst = Math.max(worst, at(`frame ${f}`))
        }
        // the presence layer and the 0.1 CSS px shift, presented by a frame
        anc.style.transform = 'scale(1)'
        wrap.style.transform = `translateX(${shift}px)`
        layer = 1 / q0
        shifted = shift
        f++
        await step(h.mc)
        worst = Math.max(worst, at(`layered frame ${f}`))
        const tk = restAt(f)
        const rho = pose(tk) * layer
        const delta = shift * q0

        const quiet = silenceWarnings()
        const diagnostics: LayoutDiagnostic[] = []
        const stopDiagnostics = layoutRuntime.onDiagnostic((event) =>
            diagnostics.push(event)
        )
        let newcomer: HTMLElement
        let flushed: Holder
        try {
            if (mode === 'aged') {
                h.group.capture()
                // an asynchronous gap that lets a rendering opportunity pass
                await nextFrame()
            }
            newcomer = box(260)
            names.set(newcomer, 'newly registered')
            h.add(newcomer)
            undrivenMoved.style.left = '80px'
            drivenAbove.style.left = '200px'
            drivenBelow.style.left = '160.4px'
            flushed = report(h.group.flush())
        } finally {
            quiet.restore()
            stopDiagnostics()
        }
        dAbove = 40
        dBelow = 0.4
        slack = delta * Math.max(1, rho)
        worst = Math.max(
            worst,
            at(
                `§4.4 flush write (${mode === 'aged' ? 'an aged capture' : 'no capture'}: driven tracks kept, translated by δ)`
            )
        )
        const r = await expectNoRun(
            flushed,
            `${row} §4.4 flush`,
            'with no valid measurement no track starts; driven nodes keep theirs (§4.4)'
        )
        const stale: Snap[] = [
            undrivenMoved,
            newcomer,
            drivenAbove,
            amplified,
        ].map((element) => ({ element, reason: 'stale' as const }))
        expectReport(names, r, 'stale', stale, `${row} §4.4 flush`)
        expectSnapCalls(names, snaps, stale, `${row} §4.4 flush`)
        // §4.4, §7.2: the diagnostic count agrees exactly with the reported
        // nodes; one event per reported node, with the element and reason
        const code = mode === 'aged' ? 'capture-aged' : 'capture-less-flush'
        const events = diagnostics.filter(
            (event) => event.code === code && event.reason === 'stale'
        )
        expectEqual(events.length, stale.length, `${row} §4.4 diagnostic count`)
        expectEqual(
            events.map((event) => nameOf(names, event.element!)).sort(),
            stale.map((snap) => nameOf(names, snap.element)).sort(),
            `${row} §4.4 diagnostic elements`
        )
        expectEqual(
            events.every((event) => event.action === 'snap'),
            true,
            `${row} §4.4 diagnostic action`
        )
        for (const element of [undrivenMoved, undrivenUnmoved, newcomer]) {
            expectEqual(
                `${element.style.translate}|${element.style.scale}`,
                '|',
                `${row} ${nameOf(names, element)}: undriven, appears at A with no track`
            )
        }
        if (run1.value !== null) {
            throw new Error(
                `${row} §4.4 flush: run 1 resolved (${describeReport(names, run1.value)}); the kept tracks still run`
            )
        }
        let endedAt: number | null = null
        while (run1.value === null && f < 60) {
            f++
            await step(h.mc)
            worst = Math.max(worst, at(`frame ${f}`))
            if (run1.value !== null) endedAt = f
        }
        expectEndedOnSchedule(endedAt, END_FRAME, `${row} run 1`)
        expectReport(names, run1.value!, 'ended', [], `${row} run 1`)
        expectSnapCalls(names, snaps, [], `${row} run 1`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `ρ = ${rho.toFixed(1)}, |δ| = ${delta} px → |δ|·ρ = ${(delta * rho).toFixed(2)} px reported; snapped exactly [${snapList(names, stale).join(', ')}]`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── L-MEAS-12 ───────────────────────── */

/**
 * L-MEAS-12: author rotation. (a) A box-changing rotation added mid-run and
 * (b) one present at capture and removed by the commit: the support check
 * (§4.2) snaps the node and its participant subtree 'unsupported', at A with
 * styles restored. (c) A 180° rotation removed by the commit is not detected
 * and need not be: its bounding box is its box, so the box moves exactly.
 */
export function L_MEAS_12(): Promise<string> {
    return variants('L_MEAS_12', [
        ['(a) added mid-run', meas12Added],
        ['(b) present at capture, removed by the commit', meas12Removed],
        ['(c) 180° removed by the commit', meas12Half],
    ])
}

async function meas12Added(): Promise<string> {
    const row = 'L_MEAS_12 (a)'
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    try {
        const parent = node(
            h.root,
            'left: 20px; top: 20px; width: 160px; height: 60px; transform-origin: 0 0;'
        )
        const child = node(
            parent,
            'left: 10px; top: 10px; width: 60px; height: 30px; transform-origin: 0 0;'
        )
        addNamed(h, names, { parent, child })
        await baseline(h, row)
        const bParent = viewBox(parent)
        const bChild = viewBox(child)
        h.group.capture()
        parent.style.left = '140px'
        child.style.left = '50px'
        const aParent = viewBox(parent)
        const aChild = viewBox(child)
        const run1 = report(h.group.flush())
        const sParent = spec(bParent, aParent, { timing: ease })
        const sChild = spec(bChild, aChild, { timing: ease })
        let worst = 0
        await expectRunning(names, run1, `${row} flush 1`)
        for (let f = 1; f <= 4; f++) {
            await step(h.mc)
            const t = restAt(f)
            worst = Math.max(
                worst,
                expectAll(`${row} frame ${f} t=${t.toFixed(3)}`, [
                    [parent, expectedBox(sParent, t), 'parent'],
                    [child, expectedBox(sChild, t), 'child'],
                ])
            )
        }
        // the author adds a box-changing rotation; a frame presents it
        parent.style.transform = 'rotate(35deg)'
        await step(h.mc)
        const quiet = silenceWarnings()
        let commit: Holder
        let authored: string[]
        try {
            h.group.capture()
            parent.style.left = '240px'
            child.style.left = '80px'
            authored = [authorText(parent), authorText(child)]
            commit = report(h.group.flush())
        } finally {
            quiet.restore()
        }
        const r = await expectNoRun(
            commit,
            `${row} commit`,
            'the rotated subtree snaps unsupported (§4.2)'
        )
        const unsupported: Snap[] = [
            { element: parent, reason: 'unsupported' },
            { element: child, reason: 'unsupported' },
        ]
        expectReport(names, r, 'no-change', unsupported, `${row} commit`)
        expectSnapCalls(names, snaps, unsupported, `${row} commit`)
        expectRestored(parent, authored[0]!, `${row} parent at A`)
        expectRestored(child, authored[1]!, `${row} child at A`)
        if (run1.value === null) {
            throw new Error(
                `${row} commit: run 1 is still pending after its tracks snapped`
            )
        }
        const atA = [viewBox(parent), viewBox(child)]
        for (let f = 1; f <= 3; f++) {
            await step(h.mc)
            worst = Math.max(
                worst,
                expectAll(`${row} after the snap frame ${f}`, [
                    [parent, atA[0]!, 'parent'],
                    [child, atA[1]!, 'child'],
                ])
            )
        }
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `subtree snapped unsupported at A (run 1 ${run1.value.status}); ≤ ${worst.toFixed(3)} px before`
    } finally {
        h.dispose()
    }
}

async function meas12Removed(): Promise<string> {
    const row = 'L_MEAS_12 (b)'
    const { h, snaps, names } = harnessWithSnaps()
    try {
        const parent = node(
            h.root,
            'left: 20px; top: 20px; width: 200px; height: 60px; transform: rotate(45deg); transform-origin: 50% 50%;'
        )
        const child = node(
            parent,
            'left: 10px; top: 10px; width: 60px; height: 30px; transform-origin: 0 0;'
        )
        addNamed(h, names, { parent, child })
        await baseline(h, row)
        const quiet = silenceWarnings()
        let commit: Holder
        let authored: string[]
        let aParent: OBox
        let aChild: OBox
        try {
            h.group.capture()
            parent.style.transform = ''
            parent.style.left = '180px'
            child.style.left = '70px'
            authored = [parent.style.cssText, child.style.cssText]
            // nothing is driven, so the rects now are A (rest reads)
            aParent = viewBox(parent)
            aChild = viewBox(child)
            commit = report(h.group.flush())
        } finally {
            quiet.restore()
        }
        const root = viewBox(h.root)
        const derived = [
            { x: root.x + 180, y: root.y + 20, w: 200, h: 60 },
            { x: root.x + 250, y: root.y + 30, w: 60, h: 30 },
        ]
        ;[aParent, aChild].forEach((a, i) => {
            if (maxDiff(a, derived[i]!) > 0.01) {
                throw new Error(
                    `${row} setup: the rest read ${JSON.stringify(a)} is not the authored layout ${JSON.stringify(derived[i])}`
                )
            }
        })
        let worst = expectAll(
            `${row} commit write (B was presented under rotate(45deg); the commit removed it)`,
            [
                [parent, aParent, 'parent'],
                [child, aChild, 'child'],
            ]
        )
        const r = await expectNoRun(
            commit,
            `${row} commit`,
            'B was measured under a box-changing rotation, so the subtree snaps unsupported (§4.2)'
        )
        const unsupported: Snap[] = [
            { element: parent, reason: 'unsupported' },
            { element: child, reason: 'unsupported' },
        ]
        expectReport(names, r, 'no-change', unsupported, `${row} commit`)
        expectSnapCalls(names, snaps, unsupported, `${row} commit`)
        expectRestored(parent, authored[0]!, `${row} parent`)
        expectRestored(child, authored[1]!, `${row} child`)
        for (let f = 1; f <= 3; f++) {
            await step(h.mc)
            worst = Math.max(
                worst,
                expectAll(`${row} frame ${f}`, [
                    [parent, aParent, 'parent'],
                    [child, aChild, 'child'],
                ])
            )
        }
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `subtree snapped unsupported at A ≤ ${worst.toFixed(3)} px`
    } finally {
        h.dispose()
    }
}

async function meas12Half(): Promise<string> {
    const row = 'L_MEAS_12 (c)'
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    try {
        const card = node(
            h.root,
            'left: 20px; top: 20px; width: 140px; height: 50px; transform: rotate(180deg); transform-origin: 50% 50%;'
        )
        addNamed(h, names, { card })
        await baseline(h, row)
        const b = viewBox(card)
        h.group.capture()
        card.style.transform = ''
        card.style.left = '200px'
        const authored = card.style.cssText
        const a = viewBox(card)
        const run = report(h.group.flush())
        const s = spec(b, a, { timing: ease, fx: 0.5, fy: 0.5 })
        let worst = expectViewAt(card, b, `${row} flush write`)
        await expectRunning(names, run, `${row} flush`)
        let f = 0
        while (run.value === null && f < 60) {
            f++
            await step(h.mc)
            worst = Math.max(
                worst,
                expectViewAt(
                    card,
                    expectedBox(s, restAt(f)),
                    `${row} frame ${f} t=${restAt(f).toFixed(3)} card`
                )
            )
        }
        expectReport(names, run.value!, 'ended', [], `${row} run`)
        expectSnapCalls(names, snaps, [], `${row} run`)
        expectViewAt(card, a, `${row} final card`, 0.01)
        expectRestored(card, authored, `${row} card`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `box moves exactly, ${f} frames ≤ ${worst.toFixed(3)} px`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── L-MEAS-13 ───────────────────────── */

/**
 * L-MEAS-13: in one rendering update, an earlier `requestAnimationFrame`
 * callback moves an ancestor, and a later callback, the scope clock's own
 * frame (`clock.read`, so `clock.inFrame` is true), calls `update()`. The
 * capture is aged at once (§4.1): the card is undriven, so it appears at A
 * with no track and is reported 'stale' (§4.4); the intermediate box the
 * earlier callback produced, never presented, is never its B.
 */
export async function L_MEAS_13(): Promise<string> {
    const row = 'L_MEAS_13'
    const clock = createClock()
    const snaps: Snap[] = []
    const names: Names = new Map()
    const group = createLayoutGroup({
        clock,
        motion: { duration: D, timing: timing.easeOut() },
        onSnap(element, reason) {
            snaps.push({ element, reason })
        },
    })
    document.body.style.margin = '0'
    const root = document.createElement('div')
    root.style.cssText = 'position: relative; width: 900px; height: 700px;'
    document.body.append(root)
    try {
        const ancestor = node(
            root,
            'left: 0; top: 0; width: 400px; height: 200px;'
        )
        const card = node(
            ancestor,
            'left: 0; top: 20px; width: 100px; height: 40px; transform-origin: 0 0;'
        )
        names.set(card, 'card')
        group.add(card)
        group.capture()
        await expectNoRun(
            report(group.flush()),
            `${row} baseline`,
            'nothing changed'
        )
        await nextFrame()
        const presented = viewBox(card)
        const rootBox = viewBox(root)
        const wantA = { x: rootBox.x + 200, y: rootBox.y + 20, w: 100, h: 40 }

        const outcome = await new Promise<{
            inFrame: boolean
            intermediate: OBox
            drawn: OBox
            translate: string
            run: Holder
        }>((resolve) => {
            // registered first, so it runs first in the same rendering update
            requestAnimationFrame(() => {
                ancestor.style.left = '80px'
            })
            clock.read(() => {
                const inFrame = clock.inFrame
                const intermediate = viewBox(card)
                const quiet = silenceWarnings()
                try {
                    const run = report(
                        group.update(() => {
                            card.style.left = '120px'
                        })
                    )
                    resolve({
                        inFrame,
                        intermediate,
                        drawn: viewBox(card),
                        translate: card.style.translate,
                        run,
                    })
                } finally {
                    quiet.restore()
                }
            })
        })
        if (!outcome.inFrame) {
            throw new Error(
                `${row} setup: clock.inFrame was false in the clock's read callback`
            )
        }
        if (maxDiff(outcome.intermediate, shiftBox(presented, 80, 0)) > 0.01) {
            throw new Error(
                `${row} setup: the earlier callback did not move the card (it is at ${JSON.stringify(outcome.intermediate)})`
            )
        }
        const error = maxDiff(outcome.drawn, wantA)
        if (!(error <= 0.5)) {
            const fromIntermediate =
                maxDiff(outcome.drawn, outcome.intermediate) <= 0.5
            throw new Error(
                `${row} update in the clock's frame: drawn ${JSON.stringify(outcome.drawn)} differs from A ${JSON.stringify(wantA)} by ${error.toFixed(3)} px${fromIntermediate ? ' (the unpresented intermediate box was used as B)' : ''}`
            )
        }
        expectEqual(outcome.translate, '', `${row}: no pose written (no track)`)
        const r = await expectNoRun(
            outcome.run,
            `${row} update`,
            'a capture taken while the clock runs a frame is aged at once (§4.1)'
        )
        const stale: Snap[] = [{ element: card, reason: 'stale' }]
        expectReport(names, r, 'stale', stale, `${row} update`)
        expectSnapCalls(names, snaps, stale, `${row} update`)
        for (let i = 1; i <= 3; i++) {
            await nextFrame()
            expectViewAt(card, wantA, `${row} real frame ${i} card`)
        }
        expectEqual(clock.size, 0, `${row}: no clock subscription`)
        return `aged at once; card at A (${wantA.x}), never at the intermediate ${outcome.intermediate.x}`
    } finally {
        group.dispose()
        clock.dispose()
        root.remove()
    }
}

/* ───────────────────────── L-MEAS-14 ───────────────────────── */

/** Frames every L-MEAS-14 variant checks after its commit. */
const ANCHOR_FRAMES = 24

/**
 * L-MEAS-14: scroll anchoring during a run, in a scrolled column (§11.4 S2,
 * §12). (a) The L-MEAS-2 shape for 24 frames: no scroll offset moves by
 * layout's writes, and every frame is on the oracle. (b) A banner above the
 * visible cards grows mid-run, and (c) is deleted mid-run: with non-driven
 * content visible between the cards the browser's compensation holds (the
 * scroll offset absorbs the shift; there is none in WebKit, which has no CSS
 * anchoring); with only driven cards visible the shift is presented
 * uncompensated and the cards follow content. The fallback (`overflow-anchor:
 * none` on every driven card, scroll containers included; the WAAPI engine
 * carries it in both keyframes of each animation) applies only where the
 * probe says a transform moves the anchor: in Firefox, never in Chromium or
 * WebKit. (a) also runs with `overflow: hidden` cards (each a scroll
 * container) and with the WAAPI engine; `L_MEAS_14_CLASSIC` runs it in
 * Firefox with classic scrollbars.
 */
export function L_MEAS_14(): Promise<string> {
    return variants('L_MEAS_14', [
        ['(a) a commit that also scrolls', () => meas14Scroll()],
        [
            '(a) overflow: hidden cards',
            () => meas14Scroll({ overflow: 'hidden' }),
        ],
        ['(a) the WAAPI engine', () => meas14Scroll({ engine: 'waapi' })],
        [
            '(b) a banner grows, non-driven content visible',
            () => meas14Shift('grow', 'mixed'),
        ],
        [
            '(b) a banner grows, only driven cards visible',
            () => meas14Shift('grow', 'driven'),
        ],
        [
            '(c) a deletion above, non-driven content visible',
            () => meas14Shift('delete', 'mixed'),
        ],
        [
            '(c) a deletion above, only driven cards visible',
            () => meas14Shift('delete', 'driven'),
        ],
    ])
}

/**
 * L-MEAS-14 (a) in Firefox with classic scrollbars (`ui.useOverlayScrollbars`
 * 0, `pageOptions`): a scrollbar that takes space must not empty the probe's
 * 10 × 10 scrollport, or the probe reads no anchoring and the fallback is
 * never applied (§11.4 S2: the probe has no scrollbar). Elsewhere it runs as
 * (a).
 */
export async function L_MEAS_14_CLASSIC(): Promise<string> {
    let note = ''
    if (navigator.userAgent.includes('Firefox')) {
        const probe = document.createElement('div')
        probe.style.cssText =
            'position: absolute; width: 100px; height: 100px; overflow: scroll;'
        document.body.append(probe)
        const thickness = probe.offsetWidth - probe.clientWidth
        probe.remove()
        if (thickness <= 0) {
            throw new Error(
                'L_MEAS_14_CLASSIC setup: Firefox draws overlay scrollbars here (an overflow: scroll box keeps its whole width); the run needs classic scrollbars (ui.useOverlayScrollbars 0)'
            )
        }
        note = `classic scrollbars ${thickness} px; `
    }
    return note + (await meas14Scroll({ label: 'classic scrollbars' }))
}

/**
 * The S2 fallback on each driven card where a transform moves the scroll
 * anchor (Firefox, §11.4 S2), nothing elsewhere: with the `'raf'` engine an
 * owned `overflow-anchor: none !important`; with the WAAPI engine no inline
 * declaration, and `overflow-anchor: none` in both keyframes of the card's
 * animation (§6).
 */
function expectAnchorFallback(
    names: Names,
    driven: readonly HTMLElement[],
    label: string,
    engine: 'raf' | 'waapi' = 'raf'
): void {
    const fallback = navigator.userAgent.includes('Firefox')
    const why = fallback
        ? 'Firefox counts the anchor node’s transform'
        : 'this engine does not re-anchor on a transform'
    for (const card of driven) {
        const value = card.style.getPropertyValue('overflow-anchor')
        const priority = card.style.getPropertyPriority('overflow-anchor')
        const got = value === '' ? 'no declaration' : `${value} !${priority}`
        const want =
            fallback && engine === 'raf' ? 'none !important' : 'no declaration'
        if (got !== want) {
            throw new Error(
                `${label} ${nameOf(names, card)}: overflow-anchor is ${got}, expected ${want} (${why}, §11.4 S2)`
            )
        }
        if (engine !== 'waapi') continue
        const keyframes = card
            .getAnimations()
            .flatMap((a) => (a.effect as KeyframeEffect).getKeyframes())
        const carried = keyframes.map((k) => k.overflowAnchor ?? 'absent')
        const expected = keyframes.map(() => (fallback ? 'none' : 'absent'))
        if (
            keyframes.length !== 2 ||
            carried.join(',') !== expected.join(',')
        ) {
            throw new Error(
                `${label} ${nameOf(names, card)}: its animation's keyframes carry overflow-anchor [${carried.join(', ')}], expected [${expected.join(', ')}] (${why}, §6, §11.4 S2)`
            )
        }
    }
}

/**
 * (a): cards of two columns are driven from a commit that moves one card to
 * the other column and scrolls it (the L-MEAS-2 shape); `overflow: hidden`
 * makes every card a scroll container; the WAAPI engine draws the same
 * tracks, each animation paused and seeked to the frame's time (§10).
 */
async function meas14Scroll(
    variant: {
        readonly overflow?: 'hidden'
        readonly engine?: 'waapi'
        readonly label?: string
    } = {}
): Promise<string> {
    const engine = variant.engine ?? 'raf'
    const row = `L_MEAS_14 (a)${variant.overflow ? ` overflow: ${variant.overflow}` : ''}${engine === 'waapi' ? ' WAAPI' : ''}${variant.label ? ` ${variant.label}` : ''}`
    const ease = timing.easeOut()
    const snaps: Snap[] = []
    const names: Names = new Map()
    const h = harness({
        motion: { duration: D, timing: ease },
        ...(engine === 'waapi' ? { engine } : {}),
        onSnap(element, reason) {
            snaps.push({ element, reason })
        },
    })
    try {
        const column = (left: number) =>
            node(
                h.root,
                `left: ${left}px; top: 0; width: 160px; height: 220px; overflow-y: auto;`
            )
        const columnA = column(0)
        const columnB = column(200)
        const card = (col: HTMLElement, name: string) => {
            const element = document.createElement('div')
            element.style.cssText = `position: relative; width: 140px; height: 60px; margin-bottom: 10px; transform-origin: 0 0;${variant.overflow ? ` overflow: ${variant.overflow};` : ''}`
            col.append(element)
            names.set(element, name)
            h.add(
                element,
                engine === 'waapi' ? { layout: 'position' } : undefined
            )
            return element
        }
        const as = [0, 1, 2].map((i) => card(columnA, `a${i}`))
        const bs = [0, 1, 2, 3, 4].map((i) => card(columnB, `b${i}`))
        const cards = [...as, ...bs]
        await baseline(h, row)

        const authored = cards.map((c) => c.style.cssText)
        const b = cards.map(viewBox)
        h.group.capture()
        columnB.append(as[1]!)
        columnB.scrollTop = 120
        const scrolled = [columnA.scrollTop, columnB.scrollTop] as const
        if (scrolled[0] !== 0 || Math.abs(scrolled[1] - 120) > 0.5) {
            throw new Error(
                `${row} setup: the columns scrolled to ${scrolled.join(', ')}, not 0, 120`
            )
        }
        const a = cards.map(viewBox)
        const run = report(h.group.flush())
        const specs = cards.map((_, i) =>
            maxDiff(b[i]!, a[i]!) >= 1
                ? spec(b[i]!, a[i]!, { timing: ease })
                : null
        )
        const driven = cards.filter((_, i) => specs[i] !== null)
        // the WAAPI tracks are drawn at each frame's time (§10)
        const animations =
            engine === 'waapi' ? driven.flatMap((c) => c.getAnimations()) : []
        if (engine === 'waapi' && animations.length !== driven.length) {
            throw new Error(
                `${row}: ${animations.length} animations for ${driven.length} driven cards`
            )
        }
        for (const animation of animations) animation.pause()
        const check = (label: string, t: number) => {
            for (const animation of animations) {
                animation.currentTime = t * 1000
            }
            const offsets = [columnA.scrollTop, columnB.scrollTop]
            if (offsets[0] !== scrolled[0] || offsets[1] !== scrolled[1]) {
                throw new Error(
                    `${row} ${label}: the columns' scroll offsets are ${offsets.join(', ')}, not the ${scrolled.join(', ')} they held when A was read: layout's writes moved a scroll offset (§11.4 S2)`
                )
            }
            return expectAll(
                `${row} ${label} t=${t.toFixed(3)}`,
                cards.map(
                    (c, i) =>
                        [
                            c,
                            specs[i] ? expectedBox(specs[i]!, t) : a[i]!,
                            nameOf(names, c),
                        ] as const
                )
            )
        }
        let worst = check('flush write', 0)
        expectAnchorFallback(names, driven, `${row} flush write`, engine)
        await expectRunning(names, run, `${row} flush`)
        for (let f = 1; f <= ANCHOR_FRAMES; f++) {
            await step(h.mc)
            worst = Math.max(worst, check(`frame ${f}`, restAt(f)))
            if (run.value === null && engine === 'raf') {
                expectAnchorFallback(names, driven, `${row} frame ${f}`)
            }
            if (engine === 'waapi') {
                // the WAAPI engine writes no inline style (§10)
                cards.forEach((c, i) =>
                    expectEqual(
                        c.style.cssText,
                        authored[i]!,
                        `${row} frame ${f} ${nameOf(names, c)}: no inline write`
                    )
                )
            }
        }
        if (engine === 'waapi') {
            for (const animation of animations) {
                animation.play()
                animation.finish()
            }
            for (let i = 0; i < 3 && run.value === null; i++) {
                await new Promise((resolve) => setTimeout(resolve, 0))
                await settleMicrotasks()
            }
        }
        expectReport(names, run.value!, 'ended', [], `${row} run`)
        expectSnapCalls(names, snaps, [], `${row} run`)
        cards.forEach((c, i) =>
            expectRestored(c, authored[i]!, `${row} ${nameOf(names, c)}`)
        )
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `${driven.length} cards, ${ANCHOR_FRAMES} frames ≤ ${worst.toFixed(3)} px, scroll offsets held at ${scrolled.join(', ')}`
    } finally {
        h.dispose()
    }
}

/**
 * (b), (c): the cards of a scrolled column are driven by a commit that moves
 * each 30 px to the right; at frame 5 the banner above the visible area grows
 * by 40 px (`'grow'`) or is removed with its margin, 50 px (`'delete'`).
 * `'mixed'` puts a non-driven note before every card and scrolls so a note is
 * the first visible element; `'driven'` has cards only, so every visible
 * element is driven.
 */
async function meas14Shift(
    kind: 'grow' | 'delete',
    visible: 'mixed' | 'driven'
): Promise<string> {
    const row = `L_MEAS_14 ${kind === 'grow' ? '(b)' : '(c)'} ${visible}`
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    try {
        const column = node(
            h.root,
            'left: 0; top: 0; width: 220px; height: 240px; overflow-y: auto;'
        )
        const banner = document.createElement('div')
        banner.style.cssText = 'height: 40px; margin-bottom: 10px;'
        column.append(banner)
        const cards: HTMLElement[] = []
        const count = visible === 'mixed' ? 6 : 8
        for (let i = 0; i < count; i++) {
            if (visible === 'mixed') {
                const note = document.createElement('div')
                note.style.cssText = 'height: 30px; margin-bottom: 10px;'
                note.textContent = `note ${i}`
                column.append(note)
            }
            const card = document.createElement('div')
            card.style.cssText =
                'position: relative; left: 0; width: 160px; height: 50px; margin-bottom: 10px; transform-origin: 0 0;'
            column.append(card)
            names.set(card, `card${i}`)
            h.add(card)
            cards.push(card)
        }
        await baseline(h, row)
        // presented: the banner is above the visible area, and the first
        // visible element is a note (mixed) or a card (driven)
        column.scrollTop = visible === 'mixed' ? 150 : 170
        await nextFrame()
        await nextFrame()
        const s0 = column.scrollTop

        const b = cards.map(viewBox)
        h.group.capture()
        for (const card of cards) card.style.left = '30px'
        const authored = cards.map((c) => c.style.cssText)
        const a = cards.map(viewBox)
        const run = report(h.group.flush())
        const specs = cards.map((_, i) => spec(b[i]!, a[i]!, { timing: ease }))
        // the browser compensates only through a non-driven anchor (§12)
        const compensates =
            visible === 'mixed' && CSS.supports('overflow-anchor', 'auto')
        const shift = kind === 'grow' ? 40 : -50
        let dy = 0
        let expectedScroll = s0
        let worst = 0
        const check = (label: string, f: number) => {
            const t = restAt(f)
            if (Math.abs(column.scrollTop - expectedScroll) > 0.5) {
                throw new Error(
                    `${row} ${label}: the column's scroll offset is ${column.scrollTop}, expected ${expectedScroll} (${f >= 5 ? (compensates ? `the browser compensates the ${shift} px shift through the visible non-driven note` : `the ${shift} px shift is presented uncompensated: ${visible === 'driven' ? 'only driven cards are visible' : 'this engine has no CSS anchoring'}`) : 'before the shift'}, §12)`
                )
            }
            worst = Math.max(
                worst,
                expectAll(
                    `${row} ${label} t=${t.toFixed(3)}`,
                    cards.map(
                        (c, i) =>
                            [
                                c,
                                shiftBox(expectedBox(specs[i]!, t), 0, dy),
                                nameOf(names, c),
                            ] as const
                    )
                )
            )
        }
        check('flush write', 0)
        expectAnchorFallback(names, cards, `${row} flush write`)
        await expectRunning(names, run, `${row} flush`)
        for (let f = 1; f <= ANCHOR_FRAMES; f++) {
            if (f === 5) {
                if (kind === 'grow') banner.style.height = '80px'
                else banner.remove()
                if (compensates) expectedScroll = s0 + shift
                else dy = shift
            }
            await step(h.mc)
            check(`frame ${f}`, f)
            if (run.value === null) {
                expectAnchorFallback(names, cards, `${row} frame ${f}`)
            }
        }
        expectReport(names, run.value!, 'ended', [], `${row} run`)
        expectSnapCalls(names, snaps, [], `${row} run`)
        cards.forEach((c, i) =>
            expectRestored(c, authored[i]!, `${row} ${nameOf(names, c)}`)
        )
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `${cards.length} cards ≤ ${worst.toFixed(3)} px; the ${shift} px shift ${compensates ? `compensated (scroll ${s0} → ${expectedScroll})` : `presented uncompensated, cards followed content (scroll held at ${s0})`}`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── L-HAND-1 ───────────────────────── */

const presenceMotion = () =>
    ({
        present: { translateY: 0 },
        exit: ani({
            to: { translateY: 0 },
            duration: 0.1,
            timing: timing.linear(),
        }),
    }) as const

/**
 * L-HAND-1: a list item in a scrolled scroller hands its `layoutId` to a
 * fixed detail and back. Each handoff flies from the departing node's
 * presented box (view space, §5.8) to the new lead's A; both layers are drawn
 * at the lead's box, the opacities follow the crossfade law, and the pair's
 * source-over coverage is 1 at every frame.
 */
export async function L_HAND_1(): Promise<string> {
    const row = 'L_HAND_1'
    const linear = timing.linear()
    const { h, snaps, names } = harnessWithSnaps(linear)
    const presences: { dispose(): void }[] = []
    try {
        const scroller = node(
            h.root,
            'left: 20px; top: 20px; width: 260px; height: 220px; overflow-y: auto;'
        )
        const content = document.createElement('div')
        content.style.cssText =
            'position: relative; width: 240px; height: 600px;'
        scroller.append(content)
        // scrolled before the scope binds, and presented
        scroller.scrollTop = 100
        await nextFrame()
        await nextFrame()
        const listItem = () =>
            node(
                content,
                'left: 10px; top: 140px; width: 180px; height: 50px; transform-origin: 0 0;'
            )
        const item = listItem()
        names.set(item, 'item')
        const removeItem = h.group.add(item, { layoutId: 'hand' })
        const itemPresence = createPresence(item, presenceMotion(), {
            clock: h.mc.clock,
        })
        presences.push(itemPresence)
        await baseline(h, row)

        const flight = async (
            leg: string,
            follower: HTMLElement,
            followerPresence: { exit(): Promise<unknown> },
            mount: () => HTMLElement
        ) => {
            const b = viewBox(follower)
            h.group.capture()
            let exited: unknown = null
            void followerPresence.exit().then((result) => {
                exited = result
            })
            const lead = mount()
            const authored = lead.style.cssText
            const a = viewBox(lead)
            const run = report(h.group.flush())
            const s = spec(b, a, { timing: linear })
            let worst = 0
            let coverageError = 0
            let opacityError = 0
            const check = (label: string, t: number) => {
                const want = expectedBox(s, t)
                worst = Math.max(
                    worst,
                    expectAll(`${row} ${leg} ${label} t=${t.toFixed(3)}`, [
                        [lead, want, nameOf(names, lead)],
                        [
                            follower,
                            want,
                            `${nameOf(names, follower)} (follower)`,
                        ],
                    ])
                )
                const leadOpacity = Number(getComputedStyle(lead).opacity)
                const followerOpacity = Number(
                    getComputedStyle(follower).opacity
                )
                const fade = expectedCrossfade(linear, t / D)
                opacityError = Math.max(
                    opacityError,
                    Math.abs(leadOpacity - fade.lead),
                    Math.abs(followerOpacity - fade.follower)
                )
                const coverage = 1 - (1 - leadOpacity) * (1 - followerOpacity)
                coverageError = Math.max(coverageError, Math.abs(coverage - 1))
                if (coverageError > 1e-5 || opacityError > 1e-3) {
                    throw new Error(
                        `${row} ${leg} ${label}: opacities lead ${leadOpacity}, follower ${followerOpacity}; expected ${fade.lead.toFixed(4)}, ${fade.follower.toFixed(4)} (coverage ${coverage})`
                    )
                }
            }
            check('flush write', 0)
            await expectRunning(names, run, `${row} ${leg}`)
            let f = 0
            while ((run.value === null || exited === null) && f < 60) {
                f++
                await step(h.mc)
                check(`frame ${f}`, restAt(f))
            }
            expectReport(names, run.value!, 'ended', [], `${row} ${leg} run`)
            expectSnapCalls(names, snaps, [], `${row} ${leg} run`)
            expectEqual(exited, 'exited', `${row} ${leg}: follower exit`)
            expectViewAt(lead, a, `${row} ${leg} final lead`, 0.01)
            expectRestored(lead, authored, `${row} ${leg} lead`)
            return { worst, coverageError, frames: f }
        }

        // 1. item → fixed detail
        let detailPresence: {
            exit(): Promise<unknown>
            dispose(): void
        } | null = null
        let removeDetail: (() => void) | null = null
        const detailMount = () => {
            const detail = document.createElement('div')
            detail.style.cssText =
                'position: fixed; left: 360px; top: 40px; width: 280px; height: 200px; box-sizing: border-box; transform-origin: 0 0;'
            h.root.append(detail)
            names.set(detail, 'detail')
            removeDetail = h.group.add(detail, { layoutId: 'hand' })
            detailPresence = createPresence(detail, presenceMotion(), {
                clock: h.mc.clock,
            })
            presences.push(detailPresence)
            return detail
        }
        const forward = await flight('forward', item, itemPresence, detailMount)
        removeItem()
        item.remove()
        const detail = [...names.keys()].find(
            (k) => names.get(k) === 'detail'
        ) as HTMLElement

        // 2. detail → the list item again (a new element in the scroller)
        const back = await flight('back', detail, detailPresence!, () => {
            const again = listItem()
            names.set(again, 'item again')
            h.group.add(again, { layoutId: 'hand' })
            presences.push(
                createPresence(again, presenceMotion(), { clock: h.mc.clock })
            )
            return again
        })
        removeDetail!()
        detail.remove()
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `forward ${forward.frames} and back ${back.frames} frames; pair ≤ ${Math.max(forward.worst, back.worst).toFixed(3)} px, coverage within ${Math.max(forward.coverageError, back.coverageError).toExponential(1)}`
    } finally {
        for (const p of presences) p.dispose()
        h.dispose()
    }
}

/* ───────────────────────── L-HAND-2 ───────────────────────── */

/**
 * L-HAND-2: a handoff whose departing node is inside an active scroll
 * container (between its `scroll` and `scrollend` events) while the new lead
 * is outside it does not fly (§5.8): the new lead appears at A (with a
 * presence, it enters under its presence alone), and time does not clear the
 * state. After `scrollend` a handoff out of the same container is a normal
 * flight. Where the browser has no `scrollend` (§5.8), every handoff out of a
 * container that scrolled since the scope bound degrades the same way, so
 * the second leg is expected not to fly there. The source container is an
 * inner scroller; the document (with a viewport-fixed lead); a scroller
 * inside an open root that holds no participant, around the slot of the
 * items; a scroller in an outer root around the closed root that holds the
 * items. `scroll` and `scrollend` are not composed, so only listeners on
 * those roots see them (§4.6, §5.8). A reparent into a viewport-fixed sheet
 * while the document scrolls degrades the same way.
 */
export function L_HAND_2(): Promise<string> {
    return variants('L_HAND_2', [
        ['an inner scroller', () => hand2('scroller', false)],
        ['the document, a viewport-fixed lead', () => hand2('document', false)],
        [
            'a scroller in an open root that holds no participant, around a slot',
            () => hand2('open root', false),
        ],
        [
            'a scroller in an outer root, around the root that holds the items',
            () => hand2('outer root', false),
        ],
        [
            'an inner scroller, the new lead with a presence',
            () => hand2('scroller', true),
        ],
        [
            'a reparent into a viewport-fixed sheet while the document scrolls',
            hand2Reparent,
        ],
    ])
}

type Hand2Source = 'scroller' | 'document' | 'open root' | 'outer root'

/**
 * The source container of a L-HAND-2 variant: the element its items are
 * appended to, its scroll event target, and the real scroll that is presented
 * before it becomes active.
 */
function hand2Source(
    root: HTMLElement,
    source: Hand2Source
): {
    readonly parent: HTMLElement
    readonly target: EventTarget
    readonly scroller: HTMLElement | null
} {
    const scrollerCss =
        'left: 20px; top: 20px; width: 240px; height: 180px; overflow-y: auto;'
    const contentCss = 'position: relative; width: 220px; height: 600px;'
    if (source === 'document') {
        return { parent: root, target: document, scroller: null }
    }
    if (source === 'scroller') {
        const scroller = node(root, scrollerCss)
        const content = document.createElement('div')
        content.style.cssText = contentCss
        scroller.append(content)
        return { parent: content, target: scroller, scroller }
    }
    if (source === 'open root') {
        // the items are the host's light DOM, slotted into the root's content
        const host = node(
            root,
            'left: 20px; top: 20px; width: 240px; height: 180px;'
        )
        const shadow = host.attachShadow({ mode: 'open' })
        const scroller = document.createElement('div')
        scroller.style.cssText = `position: absolute; box-sizing: border-box; ${scrollerCss} left: 0; top: 0;`
        const content = document.createElement('div')
        content.style.cssText = contentCss
        content.append(document.createElement('slot'))
        scroller.append(content)
        shadow.append(scroller)
        return { parent: host, target: scroller, scroller }
    }
    // the items are in a closed root, inside a scroller of an outer root
    const outer = node(
        root,
        'left: 20px; top: 20px; width: 240px; height: 180px;'
    )
    const outerRoot = outer.attachShadow({ mode: 'closed' })
    const scroller = document.createElement('div')
    scroller.style.cssText = `position: absolute; box-sizing: border-box; ${scrollerCss} left: 0; top: 0;`
    const content = document.createElement('div')
    content.style.cssText = contentCss
    scroller.append(content)
    outerRoot.append(scroller)
    const inner = document.createElement('div')
    inner.style.cssText = 'position: absolute; inset: 0;'
    content.append(inner)
    const innerRoot = inner.attachShadow({ mode: 'closed' })
    const wrapper = document.createElement('div')
    wrapper.style.cssText = contentCss
    innerRoot.append(wrapper)
    return { parent: wrapper, target: scroller, scroller }
}

/** The presence `translate` of an element (its computed `transform`), px. */
function presenceShift(element: Element): readonly [number, number] {
    const transform = getComputedStyle(element).transform
    if (transform === 'none') return [0, 0]
    const m = new DOMMatrixReadOnly(transform)
    return [m.e, m.f]
}

async function hand2(
    source: Hand2Source,
    withPresence: boolean
): Promise<string> {
    const row = `L_HAND_2 ${source}${withPresence ? ', presence' : ''}`
    const linear = timing.linear()
    const { h, snaps, names } = harnessWithSnaps(linear)
    const presences: { dispose(): void }[] = []
    try {
        const hasScrollEnd = 'onscrollend' in window
        const { parent, target, scroller } = hand2Source(h.root, source)
        const item1 = node(
            parent,
            'left: 10px; top: 100px; width: 160px; height: 44px; transform-origin: 0 0;'
        )
        const item2 = node(
            parent,
            'left: 10px; top: 160px; width: 160px; height: 44px; transform-origin: 0 0;'
        )
        names.set(item1, 'item 1')
        names.set(item2, 'item 2')
        const remove1 = h.group.add(item1, { layoutId: 'first' })
        const remove2 = h.group.add(item2, { layoutId: 'second' })
        await baseline(h, row)

        if (scroller) {
            // a real scroll, presented and finished
            scroller.scrollTop = 60
            await nextFrame()
            await nextFrame()
            if (Math.abs(scroller.scrollTop - 60) > 0.5) {
                throw new Error(
                    `${row} setup: the source scroller scrolled to ${scroller.scrollTop}, not 60`
                )
            }
        }
        // then the container is active: a scroll event, no scrollend, and time passes
        target.dispatchEvent(new Event('scroll'))
        for (let i = 0; i < 10; i++) await step(h.mc)

        // outside the document scroller only when viewport-fixed (§5.8)
        const leadPosition = source === 'document' ? 'position: fixed; ' : ''
        const handoff = (
            departing: HTMLElement,
            remove: () => void,
            id: string,
            top: number,
            name: string,
            presence: boolean
        ) => {
            const b = viewBox(departing)
            h.group.capture()
            remove()
            departing.remove()
            const lead = node(
                h.root,
                `${leadPosition}left: 360px; top: ${top}px; width: 240px; height: 140px; transform-origin: 0 0;`
            )
            names.set(lead, name)
            h.group.add(lead, { layoutId: id })
            const authored = lead.style.cssText
            const a = viewBox(lead)
            let entered: Promise<unknown> | null = null
            if (presence) {
                const handle = createPresence(
                    lead,
                    {
                        initial: { translateY: 24 },
                        present: { translateY: 0 },
                        enter: ani({
                            to: { translateY: 0 },
                            duration: 0.1,
                            timing: timing.linear(),
                        }),
                        exit: ani({
                            to: { translateY: 24 },
                            duration: 0.1,
                            timing: timing.linear(),
                        }),
                    },
                    { clock: h.mc.clock }
                )
                presences.push(handle)
                entered = handle.enter()
            }
            const quiet = silenceWarnings()
            let run: Holder
            try {
                run = report(h.group.flush())
            } finally {
                quiet.restore()
            }
            return { b, a, lead, authored, run, entered }
        }
        /** Without a presence the lead is at A; with one, at A under its presence's translate. */
        const leadBox = (x: ReturnType<typeof handoff>): OBox => {
            if (!x.entered) return x.a
            const [tx, ty] = presenceShift(x.lead)
            return shiftBox(x.a, tx, ty)
        }
        /** The lead's inline style without the presence's `transform`: layout writes nothing. */
        const layoutText = (x: ReturnType<typeof handoff>): string => {
            if (!x.entered) return x.lead.style.cssText
            const probe = document.createElement('div')
            probe.style.cssText = x.lead.style.cssText
            probe.style.removeProperty('transform')
            return probe.style.cssText
        }
        const expectNoFlight = async (
            leg: string,
            x: ReturnType<typeof handoff>
        ) => {
            let worst: number
            try {
                worst = expectViewAt(
                    x.lead,
                    leadBox(x),
                    `${row} ${leg} flush write ${nameOf(names, x.lead)} (no flight)`
                )
            } catch (error) {
                if (
                    error instanceof Error &&
                    maxDiff(viewBox(x.lead), x.b) <= 0.5
                ) {
                    error.message += `; it is drawn at the departing node's box ${JSON.stringify(x.b)}: the handoff flew, but §5.8 says 'A handoff, or a reparent of a participant, whose departing node is inside an active container while the new lead is outside it, does not fly: the lead enters as a presence enter (or appears at A when it has no presence), with diagnostic handoff-scroll-active'`
                }
                throw error
            }
            const r = await expectNoRun(
                x.run,
                `${row} ${leg}`,
                'a handoff out of an active scroller does not fly (§5.8)'
            )
            expectReport(names, r, 'no-change', [], `${row} ${leg}`)
            expectSnapCalls(names, snaps, [], `${row} ${leg}`)
            expectEqual(layoutText(x), x.authored, `${row} ${leg}: no pose`)
            let entered: unknown = null
            void x.entered?.then((result) => {
                entered = result
            })
            const shifts = new Set<number>()
            for (let f = 1; f <= 3 || (x.entered && !entered && f <= 30); f++) {
                await step(h.mc)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        x.lead,
                        leadBox(x),
                        `${row} ${leg} frame ${f} lead${x.entered ? ' (A under its presence enter)' : ''}`
                    )
                )
                expectEqual(
                    layoutText(x),
                    x.authored,
                    `${row} ${leg} frame ${f}: no pose`
                )
                shifts.add(presenceShift(x.lead)[1])
            }
            if (x.entered) {
                expectEqual(entered, 'ended', `${row} ${leg}: presence enter`)
                if (shifts.size < 3 || !shifts.has(0)) {
                    throw new Error(
                        `${row} ${leg}: the presence enter drew translateY ${[...shifts].join(', ')}; expected it to animate to 0`
                    )
                }
            }
            return worst
        }

        // 1. while active: no flight
        let worst = await expectNoFlight(
            'active',
            handoff(item1, remove1, 'first', 40, 'detail 1', withPresence)
        )

        // 2. after scrollend: a normal flight
        target.dispatchEvent(new Event('scrollend'))
        const second = handoff(item2, remove2, 'second', 220, 'detail 2', false)
        if (!hasScrollEnd) {
            worst = Math.max(
                worst,
                await expectNoFlight('no scrollend', second)
            )
            expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
            return `active: no flight; no scrollend in this browser: the second handoff degrades too; ≤ ${worst.toFixed(3)} px`
        }
        const s = spec(second.b, second.a, { timing: linear })
        worst = Math.max(
            worst,
            expectViewAt(
                second.lead,
                second.b,
                `${row} after scrollend flush write lead`
            )
        )
        await expectRunning(names, second.run, `${row} after scrollend`)
        let f = 0
        while (second.run.value === null && f < 60) {
            f++
            await step(h.mc)
            worst = Math.max(
                worst,
                expectViewAt(
                    second.lead,
                    expectedBox(s, restAt(f)),
                    `${row} after scrollend frame ${f} t=${restAt(f).toFixed(3)} lead`
                )
            )
        }
        expectReport(
            names,
            second.run.value!,
            'ended',
            [],
            `${row} after scrollend`
        )
        expectSnapCalls(names, snaps, [], `${row} after scrollend`)
        expectViewAt(second.lead, second.a, `${row} final lead`, 0.01)
        expectRestored(second.lead, second.authored, `${row} lead`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `active: no flight; after scrollend: ${f} frames on the oracle ≤ ${worst.toFixed(3)} px`
    } finally {
        for (const p of presences) p.dispose()
        h.dispose()
    }
}

/**
 * L-HAND-2, a reparent: while the document scrolls, a card moves from the
 * page into a `position: fixed` sheet. The departing node is the card as
 * captured, inside the document scroller; the new lead is the same card at
 * the flush, viewport-fixed (its flat parent changed since the capture, so
 * the reparent rule counts the document, §5.8): it appears at A. After
 * `scrollend` the same move of another card is a normal flight.
 */
async function hand2Reparent(): Promise<string> {
    const row = 'L_HAND_2 reparent into a fixed sheet'
    const linear = timing.linear()
    const { h, snaps, names } = harnessWithSnaps(linear)
    try {
        const hasScrollEnd = 'onscrollend' in window
        // a shared participant arms the listeners (§5.8)
        const anchor = node(
            h.root,
            'left: 600px; top: 600px; width: 20px; height: 20px;'
        )
        names.set(anchor, 'shared')
        h.group.add(anchor, { layoutId: 'arm', radius: false })
        const card = (top: number, name: string) => {
            const element = node(
                h.root,
                `left: 10px; top: ${top}px; width: 160px; height: 44px; transform-origin: 0 0;`
            )
            names.set(element, name)
            h.group.add(element)
            return element
        }
        const card1 = card(100, 'card 1')
        const card2 = card(160, 'card 2')
        const sheet = node(
            h.root,
            'position: fixed; left: 360px; top: 40px; width: 300px; height: 320px;'
        )
        await baseline(h, row)
        document.dispatchEvent(new Event('scroll'))
        for (let i = 0; i < 10; i++) await step(h.mc)

        const reparent = (element: HTMLElement, top: number) => {
            const b = viewBox(element)
            h.group.capture()
            sheet.append(element)
            element.style.top = `${top}px`
            const authored = element.style.cssText
            const a = viewBox(element)
            const quiet = silenceWarnings()
            let run: Holder
            try {
                run = report(h.group.flush())
            } finally {
                quiet.restore()
            }
            return { b, a, authored, run, element }
        }
        const expectNoFlight = async (
            leg: string,
            x: ReturnType<typeof reparent>
        ) => {
            let worst = expectViewAt(
                x.element,
                x.a,
                `${row} ${leg} flush write ${nameOf(names, x.element)} (no flight)`
            )
            const r = await expectNoRun(
                x.run,
                `${row} ${leg}`,
                'a reparent out of an active container does not fly (§5.8)'
            )
            expectReport(names, r, 'no-change', [], `${row} ${leg}`)
            expectSnapCalls(names, snaps, [], `${row} ${leg}`)
            expectEqual(
                x.element.style.cssText,
                x.authored,
                `${row} ${leg}: no pose`
            )
            for (let f = 1; f <= 3; f++) {
                await step(h.mc)
                worst = Math.max(
                    worst,
                    expectViewAt(x.element, x.a, `${row} ${leg} frame ${f}`)
                )
            }
            return worst
        }

        // 1. while the document is active: no flight
        let worst = await expectNoFlight('active', reparent(card1, 20))

        // 2. after scrollend: a normal flight
        document.dispatchEvent(new Event('scrollend'))
        const second = reparent(card2, 120)
        if (!hasScrollEnd) {
            worst = Math.max(
                worst,
                await expectNoFlight('no scrollend', second)
            )
            expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
            return `active: no flight; no scrollend in this browser: the second reparent degrades too; ≤ ${worst.toFixed(3)} px`
        }
        const s = spec(second.b, second.a, { timing: linear })
        worst = Math.max(
            worst,
            expectViewAt(
                second.element,
                second.b,
                `${row} after scrollend flush write card 2`
            )
        )
        await expectRunning(names, second.run, `${row} after scrollend`)
        let f = 0
        while (second.run.value === null && f < 60) {
            f++
            await step(h.mc)
            worst = Math.max(
                worst,
                expectViewAt(
                    second.element,
                    expectedBox(s, restAt(f)),
                    `${row} after scrollend frame ${f} t=${restAt(f).toFixed(3)} card 2`
                )
            )
        }
        expectReport(
            names,
            second.run.value!,
            'ended',
            [],
            `${row} after scrollend`
        )
        expectSnapCalls(names, snaps, [], `${row} after scrollend`)
        expectViewAt(second.element, second.a, `${row} final card 2`, 0.01)
        expectRestored(second.element, second.authored, `${row} card 2`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `active: no flight; after scrollend: ${f} frames on the oracle ≤ ${worst.toFixed(3)} px`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── L-KEY-1 ───────────────────────── */

/**
 * L-KEY-1: a recycled node (a virtualizer row) whose `layoutKey` changes
 * under a scroll in the commit's task. The flush that sees the change plans
 * nothing for it (§4.7): at rest it appears at its new A with no motion;
 * mid-run its track ends, its styles are restored and its run resolves
 * 'disposed'. With the same key it animates normally from that baseline.
 */
export async function L_KEY_1(): Promise<string> {
    const row = 'L_KEY_1'
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    try {
        const scroller = node(
            h.root,
            'left: 20px; top: 20px; width: 260px; height: 180px; overflow-y: auto;'
        )
        const content = document.createElement('div')
        content.style.cssText =
            'position: relative; width: 240px; height: 800px;'
        scroller.append(content)
        const recycled = node(
            content,
            'left: 10px; top: 20px; width: 180px; height: 40px; transform-origin: 0 0;'
        )
        names.set(recycled, 'row')
        h.add(recycled, { layoutKey: 'item-0' })
        await baseline(h, row)
        let worst = 0

        // 1. at rest: recycled for item 8 while the list scrolls
        const b0 = viewBox(recycled)
        h.group.capture()
        scroller.scrollTop = 160
        recycled.style.top = '200px'
        recycled.style.width = '200px'
        h.group.set(recycled, { layoutKey: 'item-8' })
        const a1 = viewBox(recycled)
        if (!(maxDiff(a1, b0) >= 1)) {
            throw new Error(
                `${row} setup: the recycled row did not move in view space`
            )
        }
        const rest = report(h.group.flush())
        worst = Math.max(
            worst,
            expectViewAt(recycled, a1, `${row} recycle at rest flush write row`)
        )
        const r1 = await expectNoRun(
            rest,
            `${row} recycle at rest`,
            'a layoutKey change is a fresh baseline (§4.7)'
        )
        expectReport(names, r1, 'no-change', [], `${row} recycle at rest`)
        for (let f = 1; f <= 3; f++) {
            await step(h.mc)
            worst = Math.max(
                worst,
                expectViewAt(
                    recycled,
                    a1,
                    `${row} recycle at rest frame ${f} row`
                )
            )
        }
        expectEqual(
            h.mc.clock.size,
            0,
            `${row} recycle at rest: no clock subscription`
        )

        // 2. the same key: a normal track from the fresh baseline
        h.group.capture()
        recycled.style.left = '50px'
        const a2 = viewBox(recycled)
        const run2 = report(h.group.flush())
        const s2 = spec(a1, a2, { timing: ease })
        worst = Math.max(
            worst,
            expectViewAt(recycled, a1, `${row} same key flush write row`)
        )
        await expectRunning(names, run2, `${row} same key`)
        for (let f = 1; f <= 5; f++) {
            await step(h.mc)
            worst = Math.max(
                worst,
                expectViewAt(
                    recycled,
                    expectedBox(s2, restAt(f)),
                    `${row} same key frame ${f} t=${restAt(f).toFixed(3)} row`
                )
            )
        }

        // 3. mid-run: recycled for item 16 while the list scrolls
        const scrollerBox = viewBox(scroller)
        h.group.capture()
        scroller.scrollTop = 300
        recycled.style.left = '10px'
        recycled.style.top = '360px'
        recycled.style.width = '160px'
        const authored = authorText(recycled)
        h.group.set(recycled, { layoutKey: 'item-16' })
        const a3 = {
            x: scrollerBox.x + 10,
            y: scrollerBox.y + 60,
            w: 160,
            h: 40,
        }
        const mid = report(h.group.flush())
        worst = Math.max(
            worst,
            expectViewAt(recycled, a3, `${row} recycle mid-run flush write row`)
        )
        const r3 = await expectNoRun(
            mid,
            `${row} recycle mid-run`,
            'a layoutKey change ends the track and is a fresh baseline (§4.7)'
        )
        expectReport(names, r3, 'no-change', [], `${row} recycle mid-run`)
        if (run2.value === null) {
            throw new Error(
                `${row} recycle mid-run: the ended track's run is still pending`
            )
        }
        expectReport(names, run2.value, 'disposed', [], `${row} recycled run`)
        expectRestored(recycled, authored, `${row} recycle mid-run`)
        expectSnapCalls(names, snaps, [], `${row} recycles`)
        for (let f = 1; f <= 3; f++) {
            await step(h.mc)
            worst = Math.max(
                worst,
                expectViewAt(
                    recycled,
                    a3,
                    `${row} recycle mid-run frame ${f} row`
                )
            )
        }
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `fresh baselines at rest and mid-run, no interpolation; ≤ ${worst.toFixed(3)} px`
    } finally {
        h.dispose()
    }
}

/* ───────────────────────── L-DOC-1 ───────────────────────── */

/**
 * L-DOC-1 (vanilla parts, §4.6): `add` or `set` with an element of another
 * document (an iframe's) throws `ANI_INVALID_OPTIONS`; adopting a registered,
 * animating element into another document ends its track, restores its
 * styles byte for byte and unregisters it, so after coming back it does not
 * animate until it is added again.
 */
export async function L_DOC_1(): Promise<string> {
    const row = 'L_DOC_1'
    const ease = timing.easeOut()
    const { h, snaps, names } = harnessWithSnaps(ease)
    const iframe = document.createElement('iframe')
    iframe.style.cssText =
        'position: absolute; left: 600px; top: 0; width: 200px; height: 150px; border: 0;'
    h.root.append(iframe)
    try {
        const other = iframe.contentDocument
        if (!other) throw new Error(`${row} setup: the iframe has no document`)
        const card = node(
            h.root,
            'left: 20px; top: 20px; width: 100px; height: 40px; translate: 6px 0px; transform-origin: 0 0;'
        )
        names.set(card, 'card')
        h.group.add(card)
        await baseline(h, row)

        const foreign = other.createElement('div')
        other.body.append(foreign)
        const code = (fn: () => void) => {
            try {
                fn()
                return 'no error'
            } catch (error) {
                return isAniError(error) ? error.code : String(error)
            }
        }
        expectEqual(
            code(() => h.group.add(foreign)),
            'ANI_INVALID_OPTIONS',
            `${row}: add of another document's element`
        )
        expectEqual(
            code(() => h.group.set(foreign, {})),
            'ANI_INVALID_OPTIONS',
            `${row}: set of another document's element`
        )

        const b = viewBox(card)
        h.group.capture()
        card.style.left = '180px'
        const authored = card.style.cssText
        const a = viewBox(card)
        const run = report(h.group.flush())
        const s = spec(b, a, { timing: ease })
        let worst = expectViewAt(card, b, `${row} flush write card`)
        await expectRunning(names, run, `${row} flush`)
        for (let f = 1; f <= 3; f++) {
            await step(h.mc)
            worst = Math.max(
                worst,
                expectViewAt(
                    card,
                    expectedBox(s, restAt(f)),
                    `${row} frame ${f} card`
                )
            )
        }
        expectEqual(
            card.style.getPropertyPriority('translate'),
            'important',
            `${row}: the engine owns translate mid-run`
        )

        // adopted into the iframe's document mid-run
        other.body.append(other.adoptNode(card))
        const quiet = silenceWarnings()
        try {
            h.group.capture()
            await expectNoRun(
                report(h.group.flush()),
                `${row} flush after adoption`,
                'its only participant left the document'
            )
        } finally {
            quiet.restore()
        }
        if (run.value === null) {
            throw new Error(
                `${row} adoption: the adopted card's run is still pending`
            )
        }
        expectReport(names, run.value, 'disposed', [], `${row} adopted run`)
        expectRestored(card, authored, `${row} adopted card`)
        expectSnapCalls(names, snaps, [], `${row} adoption`)

        // back in this document it is no longer registered
        h.root.append(document.adoptNode(card))
        const back = viewBox(card)
        h.group.capture()
        card.style.left = '260px'
        const unregistered = report(h.group.flush())
        worst = Math.max(
            worst,
            expectViewAt(
                card,
                shiftBox(back, 80, 0),
                `${row} unregistered flush write card`
            )
        )
        const r = await expectNoRun(
            unregistered,
            `${row} unregistered flush`,
            'the adopted card was unregistered'
        )
        expectReport(names, r, 'no-change', [], `${row} unregistered flush`)
        expectEqual(
            card.style.getPropertyPriority('translate'),
            '',
            `${row}: no pose on the unregistered card`
        )

        // added again, it animates
        h.group.add(card)
        const b2 = viewBox(card)
        h.group.capture()
        card.style.left = '20px'
        const a2 = viewBox(card)
        const again = report(h.group.flush())
        const s2 = spec(b2, a2, { timing: ease })
        worst = Math.max(
            worst,
            expectViewAt(card, b2, `${row} re-added flush write card`)
        )
        await expectRunning(names, again, `${row} re-added`)
        let f = 0
        while (again.value === null && f < 60) {
            f++
            await step(h.mc)
            worst = Math.max(
                worst,
                expectViewAt(
                    card,
                    expectedBox(s2, restAt(f)),
                    `${row} re-added frame ${f} card`
                )
            )
        }
        expectReport(names, again.value!, 'ended', [], `${row} re-added run`)
        expectEqual(h.mc.clock.size, 0, `${row}: no clock subscription`)
        return `foreign add/set throw; adoption ends the run 'disposed' with styles restored; re-added card animates ≤ ${worst.toFixed(3)} px`
    } finally {
        iframe.remove()
        h.dispose()
    }
}
