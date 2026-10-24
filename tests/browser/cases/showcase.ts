// The Motion-parity examples (`layout_examples.tsx`) on a manual clock, in
// Chromium, Firefox and WebKit. One harness checks every example the same way:
//
// - a change made at rest: every marked element (`data-lk`, or a fixture's
//   `data-layout-id`) present before and after is on the independent oracle at
//   every frame, from the box it was drawn at to the box it lands in, with the
//   example's own motion;
// - a change made mid-flight: nothing moves at the commit, and the frame step
//   right after it continues the step right before it;
// - always: no snap, crossfading pairs sum to opacity 1, and at rest every
//   marked element's inline style is byte-identical to a fresh render.
import type { ManualClock } from '@freestylejs/ani-core/testing'
import { createManualClock } from '@freestylejs/ani-core/testing'
import { createElement as h, type ReactNode, useState } from 'react'
import {
    expectedBox,
    maxDiff,
    type OBox,
    type OTrackSpec,
} from '../../../packages/layout/src/__tests__/oracle'
import {
    ACCORDION,
    AccordionFixture,
    DIALOG,
    DialogFixture,
    DRAG,
    DragFixture,
    type ExampleProps,
    MOTION,
    NavFixture,
    SHUFFLE,
    ShuffleFixture,
    STACK,
    StackFixture,
    SWITCH,
    SwitchFixture,
    shuffled,
    sortTodos,
    TabsFixture,
    TODO,
    type Todo,
    TodoFixture,
} from '../../../packages/web/src/components/layout_examples'
import {
    FolderFixture,
    GalleryFixture,
} from '../../../packages/web/src/components/layout_fixtures'
import { expectClose, expectEqual } from './assert'
import {
    DT,
    expectAt,
    frames,
    type Mounted,
    macrotask,
    microtasks,
    mountRoot,
    pageBox,
    q,
    settled,
    spec,
    TOL,
} from './layout_frames'

export const pageOptions = {}

export const knownFailures: Record<string, string> = {}

type Motion = { duration: number; timing: typeof MOTION.timing }

interface Entry {
    readonly element: HTMLElement
    readonly box: OBox
    readonly opacity: number
    /** A non-identity `transform` on the element or an ancestor (presence, a drag). */
    readonly transformed: boolean
}

type Snapshot = Map<string, Entry[]>

const MARKED = '[data-lk], [data-layout-id]'

function markedKey(element: HTMLElement): string {
    return element.dataset.lk ?? element.dataset.layoutId!
}

function identity(transform: string): boolean {
    if (transform === 'none') return true
    const m = /matrix\(([^)]*)\)/.exec(transform)
    if (!m) return false
    const [a, b, c, d, e, f] = m[1]!.split(',').map(Number.parseFloat)
    return (
        Math.abs(a! - 1) < 1e-6 &&
        Math.abs(b!) < 1e-6 &&
        Math.abs(c!) < 1e-6 &&
        Math.abs(d! - 1) < 1e-6 &&
        Math.abs(e!) < 1e-6 &&
        Math.abs(f!) < 1e-6
    )
}

function transformed(element: HTMLElement, host: HTMLElement): boolean {
    for (let e: HTMLElement | null = element; e && e !== host; ) {
        if (!identity(getComputedStyle(e).transform)) return true
        e = e.parentElement
    }
    return false
}

function snapshot(host: HTMLElement): Snapshot {
    const out: Snapshot = new Map()
    for (const element of host.querySelectorAll<HTMLElement>(MARKED)) {
        const key = markedKey(element)
        const list = out.get(key) ?? []
        list.push({
            element,
            box: pageBox(element),
            opacity: Number(getComputedStyle(element).opacity),
            transformed: transformed(element, host),
        })
        out.set(key, list)
    }
    return out
}

/** The element's transform-origin as fractions of its border box. */
function origin(element: HTMLElement): [number, number] {
    const [x, y] = getComputedStyle(element)
        .transformOrigin.split(' ')
        .map(Number.parseFloat)
    // the border box as laid out (offsetWidth rounds to whole pixels); only
    // called on elements drawn without a transform
    const box = element.getBoundingClientRect()
    return [x! / box.width, y! / box.height]
}

const DIALOG_RADIUS_PROPERTIES = [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
] as const

function dialogRadiusError(element: HTMLElement, expected: number): number {
    const drawn = pageBox(element)
    const style = getComputedStyle(element)
    let worst = 0
    for (const property of DIALOG_RADIUS_PROPERTIES) {
        const parts = style.getPropertyValue(property).split(' ')
        const x = Number.parseFloat(parts[0]!)
        const y = Number.parseFloat(parts[1] ?? parts[0]!)
        worst = Math.max(
            worst,
            Math.abs((x * drawn.w) / element.offsetWidth - expected),
            Math.abs((y * drawn.h) / element.offsetHeight - expected)
        )
    }
    return worst
}

interface Context {
    readonly view: Mounted
    readonly mc: ManualClock
    readonly snaps: string[]
    readonly props: Required<Pick<ExampleProps, 'clock' | 'onSnap'>>
}

function context(): Context {
    const mc = createManualClock()
    const snaps: string[] = []
    return {
        view: mountRoot(),
        mc,
        snaps,
        props: {
            clock: mc.clock,
            onSnap: (element, reason) =>
                snaps.push(
                    `${element.dataset.lk ?? element.dataset.layoutId ?? element.tagName}: ${reason}`
                ),
        },
    }
}

function idle(ctx: Context): boolean {
    return settled(ctx.view.host) && ctx.mc.clock.size === 0
}

/** A frame check that asserts nothing: the frames only advance time. */
function noCheck(): void {
    // nothing to assert
}

/** Runs frames until nothing animates (layout and presence). */
async function rest(ctx: Context, label: string): Promise<number> {
    const count = await frames(ctx.mc, 200, noCheck, () => idle(ctx))
    if (!idle(ctx)) throw new Error(`${label}: did not come to rest`)
    return count
}

/** `size`'s box placed with `point`'s origin point. */
function pinned(point: OBox, size: OBox, [fx, fy]: [number, number]): OBox {
    return {
        x: point.x + fx * point.w - fx * size.w,
        y: point.y + fy * point.h - fy * size.h,
        w: size.w,
        h: size.h,
    }
}

/** §3.3 invariant 1: what was drawn before the commit is drawn after it. */
function expectNoJump(
    before: Snapshot,
    host: HTMLElement,
    label: string,
    moving: readonly string[] = []
): number {
    let worst = 0
    const now = snapshot(host)
    for (const [key, list] of before) {
        if (moving.includes(key) || list.length === 0) continue
        const was = list[0]!.box
        if (list.length > 1) {
            for (const entry of list.slice(1)) {
                const error = maxDiff(entry.box, was)
                if (!(error <= TOL)) {
                    throw new Error(
                        `${label}: ${key} crossfade layers differ before the commit by ${error.toFixed(3)} px`
                    )
                }
            }
        }
        for (const entry of now.get(key) ?? []) {
            // A shared-id handoff can have two layers for one key. They share
            // one drawn box, so both must stay on the pre-commit box.
            const sameElement = list.find(
                (candidate) => candidate.element === entry.element
            )
            const beforeBox = sameElement?.box ?? was
            // a 'position' node's size is pinned to its new box (§5.2):
            // only its origin point must not move
            const want =
                entry.element.dataset.lkMode === 'position'
                    ? pinned(beforeBox, entry.box, origin(entry.element))
                    : beforeBox
            worst = Math.max(
                worst,
                expectAt(entry.element, want, `${label}: ${key}`)
            )
        }
    }
    return worst
}

function expectOpacities(shot: Snapshot, label: string): number {
    let worst = 0
    for (const [key, list] of shot) {
        if (list.length !== 2) continue
        const sum = list[0]!.opacity + list[1]!.opacity
        worst = Math.max(worst, Math.abs(sum - 1))
        if (worst > 0.05) {
            throw new Error(`${label}: ${key} opacities sum to ${sum}`)
        }
    }
    return worst
}

interface RunStats {
    frames: number
    keys: number
    worst: number
    /** The key the worst error was drawn at. */
    at: string
}

/**
 * A change made at rest: every key with one element before and one after
 * follows the oracle from its before-box to its final box at every frame it
 * is drawn without a transform.
 */
async function oracleRun(
    ctx: Context,
    act: () => Promise<void>,
    label: string,
    {
        motion = MOTION,
        moving = [],
    }: {
        motion?: Motion
        /** Keys the change itself moves (a dragged row following the pointer). */
        moving?: readonly string[]
    } = {}
): Promise<RunStats> {
    if (!idle(ctx)) throw new Error(`${label}: not at rest`)
    const host = ctx.view.host
    const before = snapshot(host)
    await act()
    expectNoJump(before, host, label, moving)
    const shots: [number, Snapshot][] = []
    const count = await frames(
        ctx.mc,
        200,
        (t) => {
            const shot = snapshot(host)
            expectOpacities(shot, `${label} t=${t}`)
            shots.push([t, shot])
        },
        () => idle(ctx)
    )
    if (!idle(ctx)) throw new Error(`${label}: did not come to rest`)
    const after = snapshot(host)
    let keys = 0
    let worst = 0
    let at = ''
    for (const [key, list] of after) {
        const from = before.get(key)
        if (list.length !== 1 || from?.length !== 1) continue
        const end = list[0]!
        if (end.transformed) continue
        const [fx, fy] = origin(end.element)
        const mode =
            end.element.dataset.lkMode === 'position' ? 'position' : true
        const track = spec(from[0]!.box, end.box, { ...motion, fx, fy, mode })
        let checked = false
        for (const [t, shot] of shots) {
            for (const entry of shot.get(key) ?? []) {
                if (entry.transformed) continue
                const want = expectedBox(track, t)
                const error = maxDiff(entry.box, want)
                if (!(error <= TOL)) {
                    throw new Error(
                        `${label}: ${key} at t=${t.toFixed(3)} drawn ${JSON.stringify(entry.box)}, oracle ${JSON.stringify(want)} (${error.toFixed(3)} px)`
                    )
                }
                if (error > worst) {
                    worst = error
                    at = key
                }
                checked = true
            }
        }
        if (checked) keys += 1
    }
    return { frames: count, keys, worst, at }
}

interface Step {
    /** Frames to run after the change (the last step runs until rest). */
    readonly frames: number
    readonly act: () => Promise<void>
    /** The state the change renders, for its layout at rest (`layoutOf`). */
    readonly state: () => ReactNode
    readonly moving?: readonly string[]
}

interface Target {
    readonly box: OBox
    readonly fx: number
    readonly fy: number
    readonly mode: true | 'position'
}

/**
 * Where every marked element lands in `state`: a fresh render at rest, in
 * the live host's page coordinates.
 */
async function layoutOf(
    state: ReactNode,
    host: HTMLElement
): Promise<Map<string, Target>> {
    const fresh = mountRoot()
    try {
        await fresh.render(state)
        const from = pageBox(fresh.host)
        const to = pageBox(host)
        const out = new Map<string, Target>()
        for (const [key, list] of snapshot(fresh.host)) {
            if (list.length !== 1 || list[0]!.transformed) continue
            const { element, box } = list[0]!
            const [fx, fy] = origin(element)
            out.set(key, {
                box: {
                    ...box,
                    x: box.x - from.x + to.x,
                    y: box.y - from.y + to.y,
                },
                fx,
                fy,
                mode: element.dataset.lkMode === 'position' ? 'position' : true,
            })
        }
        return out
    } finally {
        fresh.dispose()
    }
}

/** The oracle's box velocity (px/s per edge) at `t`, by a central difference. */
function velocityAt(track: OTrackSpec, t: number): OBox {
    const h2 = 1e-5
    const a = expectedBox(track, t - h2)
    const b = expectedBox(track, t + h2)
    const d = (u: number, v: number) => (v - u) / (2 * h2)
    return { x: d(a.x, b.x), y: d(a.y, b.y), w: d(a.w, b.w), h: d(a.h, b.h) }
}

/**
 * Changes made mid-flight, checked against a chain of oracle tracks. At each
 * change a key whose target moved by at least the threshold (1 px) starts a
 * new track from the oracle's own drawn box with the oracle's own velocity
 * (§5.1, §5.5); a moving key whose target did not move keeps its track; a
 * key at rest starts from rest. The target is a fresh render's layout of the
 * new state, so nothing in the chain comes from the engine. Every frame of
 * every chained key is checked, through every change, until rest.
 */
async function chainRun(
    ctx: Context,
    steps: readonly Step[],
    label: string,
    motion: Motion = MOTION
): Promise<RunStats & { changes: number; kept: number }> {
    if (!idle(ctx)) throw new Error(`${label}: not at rest`)
    const host = ctx.view.host
    const live = new Map<string, { track: OTrackSpec; start: number }>()
    let frame = 0
    let worst = 0
    let at = ''
    let kept = 0
    const checked = new Set<string>()
    const elapsed = (start: number) => (frame - start) * DT
    const check = () => {
        const shot = snapshot(host)
        expectOpacities(shot, `${label} frame ${frame}`)
        for (const [key, { track, start }] of live) {
            for (const entry of shot.get(key) ?? []) {
                if (entry.transformed) continue
                const t = elapsed(start)
                const want = expectedBox(track, t)
                const error = maxDiff(entry.box, want)
                if (!(error <= TOL)) {
                    throw new Error(
                        `${label} frame ${frame}: ${key} at t=${t.toFixed(3)} drawn ${JSON.stringify(entry.box)}, oracle ${JSON.stringify(want)} (${error.toFixed(3)} px)`
                    )
                }
                if (error > worst) {
                    worst = error
                    at = key
                }
                checked.add(key)
            }
        }
    }
    for (const [n, step] of steps.entries()) {
        const target = await layoutOf(step.state(), host)
        const now = snapshot(host)
        for (const [key, to] of target) {
            const list = now.get(key)
            const current = live.get(key)
            if (
                !list ||
                list.length === 0 ||
                list.some((entry) => entry.transformed) ||
                (list.length !== 1 && current === undefined)
            ) {
                live.delete(key)
                continue
            }
            const t = current ? elapsed(current.start) : 0
            const moving =
                current !== undefined &&
                t < current.track.delay + current.track.duration
            // During a shared-id crossfade there are two live elements for
            // one key. A running oracle track already defines their common
            // drawn box, so keep/retarget that track instead of dropping it.
            const drawn = current ? expectedBox(current.track, t) : list[0]!.box
            if (moving && maxDiff(to.box, current.track.after) < 1) {
                kept += 1
                continue
            }
            if (!moving && maxDiff(to.box, drawn) < 1) continue
            live.set(key, {
                track: {
                    ...spec(drawn, to.box, {
                        ...motion,
                        fx: to.fx,
                        fy: to.fy,
                        mode: to.mode,
                    }),
                    velocity: moving ? velocityAt(current.track, t) : null,
                },
                // §4.3: from rest, the first frame after the flush shows
                // elapsed 0; a moving key continues the last painted frame
                start: moving ? frame : frame + 1,
            })
        }
        const before = snapshot(host)
        await step.act()
        expectNoJump(before, host, `${label} #${n}`, step.moving)
        const last = n === steps.length - 1
        await frames(
            ctx.mc,
            last ? 200 : step.frames,
            () => {
                frame += 1
                check()
            },
            last ? () => idle(ctx) : undefined
        )
    }
    if (!idle(ctx)) throw new Error(`${label}: did not come to rest`)
    return {
        frames: frame,
        keys: checked.size,
        worst,
        at,
        changes: steps.length,
        kept,
    }
}

/**
 * An element's inline style without what presence leaves at rest (an identity
 * `transform`, `opacity: 1`): presence owns those, layout owns everything else.
 */
function layoutStyle(element: HTMLElement): string {
    const style = element.style
    const parts: string[] = []
    for (let i = 0; i < style.length; i++) {
        const name = style.item(i)
        const value = style.getPropertyValue(name)
        if (
            name === 'transform' &&
            identity(getComputedStyle(element).transform)
        )
            continue
        if (name === 'opacity' && Number(value) === 1) continue
        const priority = style.getPropertyPriority(name)
        parts.push(`${name}: ${value}${priority ? ` !${priority}` : ''}`)
    }
    return parts.join('; ')
}

/**
 * At rest, every marked element's inline style equals a fresh render's
 * (modulo presence's resting declarations, `layoutStyle`).
 */
async function expectFresh(ctx: Context, node: ReactNode, label: string) {
    if (!idle(ctx)) throw new Error(`${label}: not at rest`)
    const fresh = mountRoot()
    try {
        await fresh.render(node)
        const want = new Map<string, string>()
        for (const e of fresh.host.querySelectorAll<HTMLElement>(MARKED)) {
            want.set(markedKey(e), layoutStyle(e))
        }
        let count = 0
        for (const e of ctx.view.host.querySelectorAll<HTMLElement>(MARKED)) {
            const key = markedKey(e)
            expectEqual(
                layoutStyle(e),
                want.get(key),
                `${label}: ${key} inline style at rest`
            )
            count += 1
        }
        expectEqual(count, want.size, `${label}: marked elements at rest`)
    } finally {
        fresh.dispose()
    }
}

function expectNoSnap(ctx: Context) {
    if (ctx.snaps.length > 0)
        throw new Error(`snapped: ${ctx.snaps.join(', ')}`)
}

function summary(name: string, runs: RunStats[], extra = ''): string {
    const keys = runs.reduce((n, r) => n + r.keys, 0)
    const count = runs.reduce((n, r) => n + r.frames, 0)
    const worst = runs.reduce((a, b) => (b.worst > a.worst ? b : a))
    return `${name}: ${runs.length} runs, ${keys} element tracks over ${count} frames on the oracle (worst ${worst.worst.toFixed(4)} px at ${worst.at || '-'})${extra}`
}

function chainText(c: RunStats & { changes: number; kept: number }): string {
    return `; ${c.changes} mid-flight changes: ${c.keys} element chains over ${c.frames} frames on the oracle, velocity carried (worst ${c.worst.toFixed(4)} px at ${c.at || '-'}, ${c.kept} tracks kept)`
}

/* ───────────────────────── iOS Folder fixture ───────────────────────── */

export async function Folder(): Promise<string> {
    const ctx = context()
    const app = (open: boolean) => h(FolderFixture, { open, ...ctx.props })
    const render = (open: boolean) => () => ctx.view.render(app(open))
    const to = (open: boolean, frames: number): Step => ({
        frames,
        act: render(open),
        state: () => app(open),
    })
    try {
        await ctx.view.render(app(false))
        const runs = [
            await oracleRun(ctx, render(true), 'folder open'),
            await oracleRun(ctx, render(false), 'folder close'),
        ]
        const c = await chainRun(
            ctx,
            [to(true, 6), to(false, 5), to(true, 4)],
            'folder reopen'
        )
        runs.push(await oracleRun(ctx, render(false), 'folder final close'))
        await expectFresh(ctx, app(false), 'folder')
        expectNoSnap(ctx)
        return summary('iOS folder', runs, chainText(c))
    } finally {
        ctx.view.dispose()
    }
}

/* ───────────────────────── Gallery fixture ───────────────────────── */

export async function Gallery(): Promise<string> {
    const ctx = context()
    const app = (view: 'grid' | 'list', detail: number | null = null) =>
        h(GalleryFixture, { view, detail, ...ctx.props })
    const render = (view: 'grid' | 'list', detail: number | null = null) => () =>
        ctx.view.render(app(view, detail))
    const to = (
        view: 'grid' | 'list',
        detail: number | null,
        frames: number
    ): Step => ({
        frames,
        act: render(view, detail),
        state: () => app(view, detail),
    })
    try {
        await ctx.view.render(app('grid'))
        const runs = [
            await oracleRun(ctx, render('list'), 'gallery grid→list'),
            await oracleRun(ctx, render('grid'), 'gallery list→grid'),
            await oracleRun(ctx, render('grid', 5), 'gallery detail open'),
            await oracleRun(ctx, render('grid'), 'gallery detail close'),
        ]
        const c = await chainRun(
            ctx,
            [
                to('list', null, 5),
                to('grid', null, 4),
                to('grid', 5, 5),
                to('grid', null, 4),
            ],
            'gallery chain'
        )
        await expectFresh(ctx, app('grid'), 'gallery')
        expectNoSnap(ctx)
        return summary('gallery', runs, chainText(c))
    } finally {
        ctx.view.dispose()
    }
}

/* ───────────────────────── Switch ───────────────────────── */

export async function Switch(): Promise<string> {
    const ctx = context()
    const app = (on: boolean[]) => h(SwitchFixture, { on, ...ctx.props })
    const render = (on: boolean[]) => () => ctx.view.render(app(on))
    const to = (on: boolean[], frames: number): Step => ({
        frames,
        act: render(on),
        state: () => app(on),
    })
    try {
        await ctx.view.render(app([false, true, false]))
        const runs = [
            await oracleRun(ctx, render([true, true, false]), 'on', {
                motion: SWITCH.motion,
            }),
            await oracleRun(ctx, render([true, false, true]), 'two', {
                motion: SWITCH.motion,
            }),
        ]
        const knob = q(ctx.view.host, '[data-lk="switch-0"]')
        const track = q(ctx.view.host, '[data-switch="0"]')
        expectClose(
            pageBox(knob).x + pageBox(knob).w,
            pageBox(track).x + SWITCH.width - SWITCH.pad,
            0.01,
            'knob at the end'
        )
        const c = await chainRun(
            ctx,
            [
                to([false, false, true], 5),
                to([true, false, true], 4),
                to([false, false, true], 3),
            ],
            'flick',
            SWITCH.motion
        )
        await expectFresh(ctx, app([false, false, true]), 'switch')
        expectNoSnap(ctx)
        return summary('switch', runs, chainText(c))
    } finally {
        ctx.view.dispose()
    }
}

/* ───────────────────────── Tabs ───────────────────────── */

export async function Tabs(): Promise<string> {
    const ctx = context()
    const app = (selected: number) => h(TabsFixture, { selected, ...ctx.props })
    const render = (selected: number) => () => ctx.view.render(app(selected))
    const to = (selected: number, frames: number): Step => ({
        frames,
        act: render(selected),
        state: () => app(selected),
    })
    try {
        await ctx.view.render(app(0))
        const runs = [
            await oracleRun(ctx, render(2), '0→2'),
            await oracleRun(ctx, render(1), '2→1'),
        ]
        const under = q(ctx.view.host, '[data-lk="tab-underline"]')
        const tab = q(ctx.view.host, '[data-tab="1"]')
        expectClose(
            pageBox(under).x,
            pageBox(tab).x + 12,
            0.01,
            'underline under tab 1'
        )
        const c = await chainRun(ctx, [to(0, 6), to(2, 5), to(1, 4)], 'clicks')
        await expectFresh(ctx, app(1), 'tabs')
        expectNoSnap(ctx)
        return summary('tabs', runs, chainText(c))
    } finally {
        ctx.view.dispose()
    }
}

/* ───────────────────────── Smooth tabs ───────────────────────── */

export async function Nav(): Promise<string> {
    const ctx = context()
    const app = (highlight: number) =>
        h(NavFixture, { highlight, selected: 0, ...ctx.props })
    const render = (i: number) => () => ctx.view.render(app(i))
    const to = (i: number, frames: number): Step => ({
        frames,
        act: render(i),
        state: () => app(i),
    })
    try {
        await ctx.view.render(app(0))
        const runs = [
            await oracleRun(ctx, render(3), '0→3'),
            await oracleRun(ctx, render(1), '3→1'),
        ]
        const pill = q(ctx.view.host, '[data-lk="nav-highlight"]')
        const item = q(ctx.view.host, '[data-nav="1"]')
        expectAt(pill, pageBox(item), 'highlight on item 1', 0.01)
        // a pointer sweeping across every item, three frames each
        const c = await chainRun(
            ctx,
            [2, 3, 4, 3, 2, 1, 0].map((i) => to(i, 3)),
            'sweep'
        )
        await expectFresh(ctx, app(0), 'nav')
        expectNoSnap(ctx)
        return summary('smooth tabs', runs, chainText(c))
    } finally {
        ctx.view.dispose()
    }
}

/* ───────────────────────── Accordion ───────────────────────── */

export async function Accordion(): Promise<string> {
    const ctx = context()
    const app = (open: number | null) =>
        h(AccordionFixture, { open, ...ctx.props })
    const render = (open: number | null) => () => ctx.view.render(app(open))
    const to = (open: number | null, frames: number): Step => ({
        frames,
        act: render(open),
        state: () => app(open),
    })
    try {
        await ctx.view.render(app(null))
        const closed = pageBox(q(ctx.view.host, '[data-accordion="0"]'))
        expectClose(closed.h, ACCORDION.header, 0.01, 'closed height')
        const runs = [
            await oracleRun(ctx, render(0), 'open 0'),
            await oracleRun(ctx, render(1), '0→1'),
            await oracleRun(ctx, render(null), 'close'),
        ]
        const c = await chainRun(
            ctx,
            [to(2, 6), to(0, 8), to(null, 5)],
            'rapid'
        )
        await expectFresh(ctx, app(null), 'accordion')
        expectNoSnap(ctx)
        return summary('accordion', runs, chainText(c))
    } finally {
        ctx.view.dispose()
    }
}

/* ───────────────────────── Shuffle ───────────────────────── */

export async function Shuffle(): Promise<string> {
    const ctx = context()
    const start = Array.from({ length: SHUFFLE.count }, (_, i) => i)
    const app = (order: readonly number[]) =>
        h(ShuffleFixture, { order, ...ctx.props })
    const render = (order: readonly number[]) => () =>
        ctx.view.render(app(order))
    const to = (order: readonly number[], frames: number): Step => ({
        frames,
        act: render(order),
        state: () => app(order),
    })
    try {
        await ctx.view.render(app(start))
        const a = shuffled(start, 1)
        const b = shuffled(a, 2)
        const runs = [
            await oracleRun(ctx, render(a), 'shuffle'),
            await oracleRun(ctx, render(start), 'sort'),
        ]
        const c = await chainRun(
            ctx,
            [to(b, 8), to(shuffled(b, 3), 6), to(start, 4)],
            'reshuffle'
        )
        await expectFresh(ctx, app(start), 'shuffle')
        expectNoSnap(ctx)
        return summary('shuffle', runs, chainText(c))
    } finally {
        ctx.view.dispose()
    }
}

/* ───────────────────────── Drag to reorder ───────────────────────── */

function pointer(type: string, y: number, target: EventTarget = window) {
    target.dispatchEvent(
        new PointerEvent(type, {
            bubbles: true,
            clientX: 20,
            clientY: y,
            button: 0,
            pointerId: 1,
            isPrimary: true,
        })
    )
}

/**
 * A React update from a native listener commits in a scheduler task: waits
 * (at most 50 tasks) until `done()`, then lets the flush run.
 */
async function settleReact(done: () => boolean = () => true) {
    for (let i = 0; i < 50 && !done(); i++) {
        await microtasks()
        await macrotask()
    }
    if (!done()) throw new Error('React did not commit')
    await microtasks()
    await macrotask()
}

export async function DragReorder(): Promise<string> {
    const ctx = context()
    let order: number[] = []
    function Harness() {
        const [state, setState] = useState([0, 1, 2, 3])
        order = state
        return h(DragFixture, {
            order: state,
            onReorder: setState,
            ...ctx.props,
        })
    }
    const slot = DRAG.height + DRAG.gap
    try {
        await ctx.view.render(h(Harness))
        const row = q(ctx.view.host, '[data-drag-row="0"]')
        const home = pageBox(row)
        const y0 = home.y - scrollY + 10
        pointer('pointerdown', y0, row)
        await settleReact()
        // the row follows the pointer exactly, with no commit
        for (const dy of [6, 12, 18, 24]) {
            pointer('pointermove', y0 + dy)
            expectAt(row, { ...home, y: home.y + dy }, `drag ${dy}`, 0.01)
        }
        expectEqual(order.join(), '0,1,2,3', 'no reorder before the middle')
        const runs: RunStats[] = []
        // crossing the middle of the next slot reorders; the row stays put
        runs.push(
            await oracleRun(
                ctx,
                async () => {
                    pointer('pointermove', y0 + 30)
                    // under the pointer before the reorder commits
                    expectAt(
                        row,
                        { ...home, y: home.y + 30 },
                        'row under the pointer, reorder pending',
                        0.01
                    )
                    await settleReact(() => order.join() === '1,0,2,3')
                },
                'cross 1',
                { moving: ['drag-0'] }
            )
        )
        expectEqual(order.join(), '1,0,2,3', 'reordered')
        expectAt(
            row,
            { ...home, y: home.y + 30 },
            'row under the pointer',
            0.01
        )
        // two slots at once, mid-flight
        const c = await chainRun(
            ctx,
            [
                {
                    frames: 6,
                    act: async () => {
                        pointer('pointermove', y0 + 2 * slot + 4)
                        await settleReact(() => order.join() === '1,2,0,3')
                    },
                    moving: ['drag-0'],
                    state: () =>
                        h(DragFixture, { order: [1, 2, 0, 3], ...ctx.props }),
                },
            ],
            'cross 2'
        )
        expectEqual(order.join(), '1,2,0,3', 'reordered twice')
        expectAt(
            row,
            { ...home, y: home.y + 2 * slot + 4 },
            'row under the pointer',
            0.01
        )
        // the release draws the row into its slot
        runs.push(
            await oracleRun(
                ctx,
                async () => {
                    pointer('pointerup', y0 + 2 * slot + 4)
                    await settleReact()
                },
                'release'
            )
        )
        expectAt(row, { ...home, y: home.y + 2 * slot }, 'row in slot 2', 0.01)
        await expectFresh(
            ctx,
            h(DragFixture, { order: [1, 2, 0, 3], ...ctx.props }),
            'drag'
        )
        expectNoSnap(ctx)
        return summary('drag to reorder', runs, chainText(c))
    } finally {
        ctx.view.dispose()
    }
}

/* ───────────────────────── To-do list ───────────────────────── */

export async function TodoList(): Promise<string> {
    const ctx = context()
    let todos: Todo[] = [
        { id: 'a', text: 'Buy oat milk', done: false },
        { id: 'b', text: 'Book the dentist', done: false },
        { id: 'c', text: 'Water the plants', done: true },
    ]
    const app = () => h(TodoFixture, { todos, ...ctx.props })
    const change = (next: Todo[]) => () => {
        todos = next
        return ctx.view.render(app())
    }
    const flip = (list: Todo[], id: string) =>
        list.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    const toggle = (id: string) => () => change(flip(todos, id))()
    const tick = (id: string, frames: number): Step => ({
        frames,
        act: toggle(id),
        state: () => h(TodoFixture, { todos: flip(todos, id), ...ctx.props }),
    })
    try {
        await ctx.view.render(app())
        const runs = [
            await oracleRun(
                ctx,
                change([
                    { id: 'd', text: 'Call Robin', done: false },
                    ...todos,
                ]),
                'add'
            ),
            await oracleRun(ctx, toggle('a'), 'done → bottom'),
            await oracleRun(
                ctx,
                change(todos.filter((t) => t.id !== 'd')),
                'remove'
            ),
        ]
        await rest(ctx, 'exit')
        expectEqual(
            [...ctx.view.host.querySelectorAll<HTMLElement>('[data-todo]')]
                .map((e) => e.dataset.todo)
                .join(),
            sortTodos(todos)
                .map((t) => t.id)
                .join(),
            'rows at rest'
        )
        const rows = ctx.view.host.querySelectorAll('[data-todo]')
        expectClose(
            pageBox(rows[1]!).y - pageBox(rows[0]!).y,
            TODO.height + TODO.gap,
            0.01,
            'rows closed the gap'
        )
        const c = await chainRun(
            ctx,
            [tick('b', 5), tick('a', 5), tick('b', 4)],
            'ticks'
        )
        await expectFresh(ctx, app(), 'todo')
        expectNoSnap(ctx)
        return summary('to-do list', runs, chainText(c))
    } finally {
        ctx.view.dispose()
    }
}

/* ───────────────────────── Family-style dialog ───────────────────────── */

export async function Dialog(): Promise<string> {
    const ctx = context()
    const app = (step: number) => h(DialogFixture, { step, ...ctx.props })
    const render = (step: number) => () => ctx.view.render(app(step))
    const to = (step: number, frames: number): Step => ({
        frames,
        act: render(step),
        state: () => app(step),
    })
    try {
        await ctx.view.render(app(0))

        await ctx.view.render(app(1))
        const radiusTolerance = navigator.userAgent.includes('Firefox')
            ? 0.03
            : 0.01
        let radiusWorst = 0
        const checkRadii = (label: string) => {
            const sheet = q(ctx.view.host, '[data-dialog]')
            const action = q(ctx.view.host, '[data-dialog-action]')
            radiusWorst = Math.max(
                radiusWorst,
                dialogRadiusError(sheet, 28),
                dialogRadiusError(action, 22)
            )
            if (radiusWorst > radiusTolerance) {
                throw new Error(
                    `${label}: dialog radius off by ${radiusWorst.toFixed(4)} px`
                )
            }
        }
        checkRadii('next-step flush')
        const radiusFrames = await frames(
            ctx.mc,
            200,
            (t) => checkRadii(`next-step t=${t.toFixed(3)}`),
            () => idle(ctx)
        )
        if (!idle(ctx)) throw new Error('next-step radius run did not settle')

        await ctx.view.render(app(0))
        await rest(ctx, 'dialog radius reset')
        const runs = [
            await oracleRun(ctx, render(1), '0→1'),
            await oracleRun(ctx, render(2), '1→2'),
            await oracleRun(ctx, render(0), '2→0'),
        ]
        const dialog = pageBox(q(ctx.view.host, '[data-dialog]'))
        const stage = pageBox(q(ctx.view.host, '[data-fixture="dialog"]'))
        expectClose(dialog.y + dialog.h, stage.y + stage.h, 0.01, 'bottom kept')
        expectClose(dialog.w, DIALOG.width, 0.01, 'width kept')
        const c = await chainRun(ctx, [to(1, 6), to(2, 6), to(1, 5)], 'steps')
        await rest(ctx, 'steps')
        await expectFresh(ctx, app(1), 'dialog')
        expectNoSnap(ctx)
        return `${summary('family dialog', runs, chainText(c))}; next-step sheet/button radii over ${radiusFrames} frames within ${radiusWorst.toFixed(4)} px`
    } finally {
        ctx.view.dispose()
    }
}

/* ───────────────────────── Stacked notifications ───────────────────────── */

export async function Stack(): Promise<string> {
    const ctx = context()
    let toasts = ['3', '2', '1']
    let expanded = false
    const app = () => h(StackFixture, { toasts, expanded, ...ctx.props })
    const change = (next: { toasts?: string[]; expanded?: boolean }) => () => {
        toasts = next.toasts ?? toasts
        expanded = next.expanded ?? expanded
        return ctx.view.render(app())
    }
    const hover = (open: boolean, frames: number): Step => ({
        frames,
        act: change({ expanded: open }),
        state: () => h(StackFixture, { toasts, expanded: open, ...ctx.props }),
    })
    try {
        await ctx.view.render(app())
        const runs = [
            await oracleRun(ctx, change({ toasts: ['4', ...toasts] }), 'add'),
            await oracleRun(ctx, change({ expanded: true }), 'expand'),
            await oracleRun(
                ctx,
                change({ toasts: ['5', ...toasts] }),
                'add open'
            ),
            await oracleRun(
                ctx,
                change({ toasts: toasts.filter((t) => t !== '3') }),
                'remove'
            ),
            await oracleRun(ctx, change({ expanded: false }), 'collapse'),
        ]
        await rest(ctx, 'stack')
        const front = pageBox(q(ctx.view.host, '[data-lk="stack-5"]'))
        expectClose(front.w, STACK.width, 0.01, 'front toast width')
        const back = pageBox(q(ctx.view.host, '[data-lk="stack-4"]'))
        expectClose(
            back.w,
            STACK.width - STACK.shrink,
            0.01,
            'second toast width'
        )
        const c = await chainRun(
            ctx,
            [hover(true, 6), hover(false, 5), hover(true, 4)],
            'hover'
        )
        await expectFresh(ctx, app(), 'stack')
        expectNoSnap(ctx)
        return summary('stacked notifications', runs, chainText(c))
    } finally {
        ctx.view.dispose()
    }
}
