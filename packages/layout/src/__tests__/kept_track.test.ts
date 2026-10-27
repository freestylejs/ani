// @vitest-environment jsdom

import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import type { Box } from '../geometry'
import { createLayoutGroup } from '../scope'
import { createRectModel, type RectModel } from './rect_model'

/**
 * §5.7 path 1 and path 2 re-express a kept track in this flush's geometry:
 * it writes exactly the poses it would have written, and every node planned
 * in the same flush composes with that geometry.
 */

const motion = { duration: 1, timing: timing.linear() }
const FRAMES = 70

let model: RectModel

beforeEach(() => {
    model = createRectModel()
    window.requestAnimationFrame = () => 0
    window.cancelAnimationFrame = () => {
        // the frame marker's window half never runs in these scenes
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {
        // the rows assert reports, not warnings
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function box(x: number, y: number, w = 40, h = 40): Box {
    return { x, y, w, h }
}

function element(at: Box, parent: HTMLElement = document.body): HTMLElement {
    const e = document.createElement('div')
    parent.append(e)
    model.place(e, at)
    return e
}

function moveBy(e: HTMLElement, dx: number, dy: number): void {
    const b = model.layout(e)
    model.place(e, { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h })
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** The engine's own pose of `e` as written: translate x, y and scale x, y. */
function pose(e: HTMLElement): number[] {
    const t = (e.style.translate || '0px 0px')
        .split(' ')
        .map((v) => Number.parseFloat(v))
    const s = (e.style.scale || '1 1').split(' ').map(Number)
    return [t[0]!, t[1] ?? 0, s[0]!, s[1] ?? s[0]!]
}

function expectClose(a: readonly number[], b: readonly number[], tol: number) {
    expect(a.length).toBe(b.length)
    a.forEach((v, i) => {
        expect(Math.abs(v - b[i]!)).toBeLessThanOrEqual(tol)
    })
}

function expectBox(actual: Box, expected: Box, tol: number): void {
    expectClose(
        [actual.x, actual.y, actual.w, actual.h],
        [expected.x, expected.y, expected.w, expected.h],
        tol
    )
}

type Variant = {
    /** Before the capture, presented: every box shifts (a page scroll). */
    readonly scroll: number
    /** In the commit: the parent and its child move by this (x). */
    readonly nudge: number
    /** In the commit: the child alone moves by this within the parent (x). */
    readonly childMove: number
    /** The child has its own running track before the commit. */
    readonly childTrack: boolean
    /** The parent's track changes its scale (200 → 400 px), or only moves. */
    readonly liveScale: boolean
    /** Presented before the capture: the child alone shifts in its parent (y). */
    readonly innerShift: number
}

/**
 * A parent participant animating (by default from 200 × 100 to 400 × 200 px
 * over 1 s, a live scale) with a child participant inside it, and an
 * unrelated participant. Five frames in, `second` decides whether a second
 * flush happens; the poses written on every later frame are returned.
 */
async function run(v: Variant, second: boolean) {
    const mc = createManualClock()
    const group = createLayoutGroup({ clock: mc.clock, motion })
    const parent = element(box(0, 200, 200, 100))
    const child = element(box(20, 220, 40, 40), parent)
    const other = element(box(600, 0))
    group.add(parent)
    group.add(child)
    group.add(other)
    group.capture()
    await group.flush()
    group.capture()
    if (v.liveScale) model.place(parent, box(0, 200, 400, 200))
    else model.place(parent, box(100, 200, 200, 100))
    if (!v.liveScale) moveBy(child, 100, 0)
    if (v.childTrack) moveBy(child, 60, 0)
    void group.flush()
    mc.frames(5)
    await nextTask()
    // presented before the capture
    if (v.scroll) for (const e of [parent, child, other]) moveBy(e, 0, v.scroll)
    if (v.innerShift) moveBy(child, 0, v.innerShift)
    let seen: Box | null = null
    let report: Promise<unknown> | null = null
    if (second) {
        group.capture()
        seen = model.rect(child)
        // the commit
        moveBy(other, 50, 0)
        if (v.nudge) {
            moveBy(parent, v.nudge, 0)
            moveBy(child, v.nudge, 0)
        }
        if (v.childMove) moveBy(child, v.childMove, 0)
        report = group.flush()
    } else {
        if (v.nudge) {
            moveBy(parent, v.nudge, 0)
            moveBy(child, v.nudge, 0)
        }
    }
    const written = model.rect(child)
    const poses: number[][] = []
    for (let f = 0; f < FRAMES; f++) {
        mc.frame()
        poses.push([...pose(parent), ...pose(child)])
    }
    const settled = { parent: model.rect(parent), child: model.rect(child) }
    group.dispose()
    document.body.innerHTML = ''
    return { seen, written, poses, settled, report }
}

const base: Variant = {
    scroll: 0,
    nudge: 0,
    childMove: 0,
    childTrack: false,
    liveScale: true,
    innerShift: 0,
}

describe('a kept track in this flush’s geometry (§5.7 paths 1 and 2)', () => {
    for (const liveScale of [true, false]) {
        const scale = liveScale ? 'under a live scale' : 'at scale 1'
        it(`path 1 (a presented page scroll, J = 0), parent ${scale}: a resting child planned now stays where it was seen and every pose is the one the untouched run writes`, async () => {
            const v = { ...base, scroll: -100, liveScale }
            const control = await run(v, false)
            const r = await run(v, true)
            expectBox(r.written, r.seen!, 1e-6)
            r.poses.forEach((p, f) => expectClose(p, control.poses[f]!, 1e-5))
            expect(await r.report).toEqual({ status: 'ended', snapped: [] })
            expectBox(r.settled.child, control.settled.child, 1e-6)
        })

        it(`path 1, parent ${scale}: a child given a new track in the same flush starts exactly at B`, async () => {
            const v = { ...base, scroll: -100, childMove: 30, liveScale }
            const r = await run(v, true)
            expectBox(r.written, r.seen!, 1e-6)
            expect(await r.report).toEqual({ status: 'ended', snapped: [] })
        })

        it(`path 2 (a 0.5 px commit move of the parent, translated by δ), parent ${scale}: a resting child planned now stays where it was seen and every pose is the untouched run's`, async () => {
            const v = { ...base, nudge: 0.5, liveScale }
            const control = await run(v, false)
            const r = await run(v, true)
            // the child moved with its parent's layout, by δ
            expectBox(r.written, { ...r.seen!, x: r.seen!.x + 0.5 }, 1e-6)
            r.poses.forEach((p, f) => expectClose(p, control.poses[f]!, 1e-5))
            expectBox(r.settled.child, control.settled.child, 1e-6)
        })

        it(`path 2, parent ${scale}: a child given a new track in the same flush starts exactly at B`, async () => {
            const v = { ...base, nudge: 0.5, childMove: 30, liveScale }
            const r = await run(v, true)
            expectBox(r.written, r.seen!, 1e-6)
        })
    }

    it('path 1 for a child with its own track under the live scale, after a presented shift inside its parent: its poses are the untouched run’s, so it follows its content', async () => {
        const v = { ...base, childTrack: true, innerShift: 10, scroll: -100 }
        const control = await run(v, false)
        const r = await run(v, true)
        expectBox(r.written, r.seen!, 1e-6)
        r.poses.forEach((p, f) => expectClose(p, control.poses[f]!, 1e-5))
        expect(await r.report).toEqual({ status: 'ended', snapped: [] })
        expectBox(r.settled.child, control.settled.child, 1e-6)
    })
})
