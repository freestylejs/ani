// @vitest-environment jsdom

import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import type { Box } from '../geometry'
import { createLayoutGroup } from '../scope'
import { createRectModel, type RectModel } from './rect_model'

const motion = { duration: 0.2, timing: timing.linear() }
/** Frames from the second flush to well past the end of every track. */
const FRAMES = 20

let model: RectModel
let warnings: string[]

beforeEach(() => {
    model = createRectModel()
    window.requestAnimationFrame = () => 0
    window.cancelAnimationFrame = () => {
        // the frame marker's window half never runs in these scenes
    }
    warnings = []
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        warnings.push(String(args[0]))
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function box(x: number, y = 0, w = 40, h = 40): Box {
    return { x, y, w, h }
}

function element(at: Box, parent: HTMLElement = document.body): HTMLElement {
    const e = document.createElement('div')
    parent.append(e)
    model.place(e, at)
    return e
}

function shifted(b: Box, dx: number, dy = 0): Box {
    return { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }
}

function expectBox(actual: Box, expected: Box, tolerance = 1e-9): void {
    for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(Math.abs(actual[k] - expected[k])).toBeLessThanOrEqual(tolerance)
    }
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

type Clock = ReturnType<typeof createManualClock>

/** The drawn box of `e` on each of `n` frames. */
function record(mc: Clock, e: HTMLElement, n = FRAMES): Box[] {
    const boxes: Box[] = []
    for (let i = 0; i < n; i++) {
        mc.frame()
        boxes.push(model.rect(e))
    }
    return boxes
}

/**
 * A top-level participant `a` moving 0 → 50 on a 40 px box, two frames into
 * its track, and a resting sibling `b`.
 */
async function moving() {
    const mc = createManualClock()
    const group = createLayoutGroup({ clock: mc.clock, motion })
    const a = element(box(0))
    const b = element(box(200))
    group.add(a)
    group.add(b)
    group.capture()
    await group.flush()
    group.capture()
    model.place(a, box(50))
    const first = group.flush()
    mc.frames(2)
    await nextTask()
    return { mc, group, a, b, first }
}

/** The frames of `a` with no second flush. */
async function control(): Promise<Box[]> {
    const { mc, group, a } = await moving()
    const boxes = record(mc, a)
    group.dispose()
    document.body.innerHTML = ''
    return boxes
}

/**
 * A parent participant shrinking 600 → 20 px (its pose scale live, about
 * 28 at the capture) under an authored inner `scale` of `inner`, and a child
 * participant with its own track, both two frames in.
 */
async function nested(inner: number) {
    const mc = createManualClock()
    const group = createLayoutGroup({ clock: mc.clock, motion })
    const parent = element(box(0, 0, 600, 600))
    if (inner !== 1) parent.style.scale = String(inner)
    const child = element(box(10, 10, 4, 4), parent)
    group.add(parent)
    group.add(child)
    group.capture()
    await group.flush()
    group.capture()
    model.place(parent, box(0, 0, 20, 20))
    model.place(child, box(2, 2, 4, 4))
    const first = group.flush()
    mc.frames(2)
    await nextTask()
    return { mc, group, parent, child, first }
}

describe('keep paths judged by the measured jump J = D − B (§5.7)', () => {
    it("path 1, a sibling's commit: J = 0, the running track is left untouched and ends on schedule", async () => {
        const expected = await control()
        const { mc, group, a, b, first } = await moving()
        group.capture()
        model.place(b, box(260))
        const second = group.flush()
        const boxes = record(mc, a)
        expect(await second).toEqual({ status: 'ended', snapped: [] })
        boxes.forEach((drawn, i) => expectBox(drawn, expected[i]!))
        expect(await first).toEqual({ status: 'ended', snapped: [] })
        expectBox(model.rect(a), box(50))
        group.dispose()
    })

    it('path 1, a layout shift presented before the capture: J = 0 although δ = 7 px, so the track draws the next frame where the user saw the node, moved with its layout', async () => {
        const expected = await control()
        const { mc, group, a, first } = await moving()
        // the shift is presented (the capture sees it), then the commit
        // changes nothing more: A_new − A_old = 7, J = 0
        model.place(a, box(50, 7))
        const seen = model.rect(a)
        group.capture()
        const report = group.flush()
        expectBox(model.rect(a), seen)
        expect(await report).toEqual({ status: 'no-change', snapped: [] })
        const boxes = record(mc, a)
        boxes.forEach((drawn, i) =>
            expectBox(drawn, shifted(expected[i]!, 0, 7))
        )
        expect(await first).toEqual({ status: 'ended', snapped: [] })
        expectBox(model.rect(a), box(50, 7))
        expect(a.style.translate).toBe('')
        group.dispose()
    })

    it('path 2, a 0.5 px commit move at the top level: |J| = 0.5 ≥ 0.01 and the translation is exact, so the track is translated by δ and lands on the new A', async () => {
        const expected = await control()
        const { mc, group, a, first } = await moving()
        group.capture()
        const seen = model.rect(a)
        model.place(a, box(50.5))
        const report = await group.flush()
        expect(report).toEqual({ status: 'no-change', snapped: [] })
        // the kept pose is relative to the layout box: it moves with it by δ
        expectBox(model.rect(a), shifted(seen, 0.5))
        const boxes = record(mc, a)
        boxes.forEach((drawn, i) =>
            expectBox(drawn, shifted(expected[i]!, 0.5))
        )
        expect(await first).toEqual({ status: 'ended', snapped: [] })
        expectBox(model.rect(a), box(50.5))
        group.dispose()
    })

    it("path 3 under a live parent scale: a 0.5 px commit move of the child is not an exact translation, so it retargets from (B, v): the first frame is B and the old run resolves 'interrupted'", async () => {
        const { mc, group, parent, child, first } = await nested(1)
        expect(Number.parseFloat(parent.style.scale)).toBeGreaterThan(20)
        group.capture()
        const seen = model.rect(child)
        model.place(child, box(2.5, 2, 4, 4))
        expect(Math.abs(model.rect(child).x - seen.x)).toBeGreaterThan(0.01)
        const second = group.flush()
        expectBox(model.rect(child), seen, 1e-6)
        record(mc, child)
        expect(await first).toEqual({ status: 'interrupted', snapped: [] })
        expect(await second).toEqual({ status: 'ended', snapped: [] })
        expectBox(model.rect(child), box(2.5, 2, 4, 4), 1e-9)
        group.dispose()
    })

    it("the amplified case: a 0.005 px move under a live total ancestor scale above 270 is a measured jump above 1 px, never 'unchanged'; with no move the same scene leaves the track alone", async () => {
        for (const shift of [0, 0.005]) {
            const { mc, group, parent, child, first } = await nested(10)
            group.capture()
            const seen = model.rect(child)
            // the drawn total scale of the parent: its pose times its inner map
            expect(
                model.rect(parent).w / model.layout(parent).w
            ).toBeGreaterThan(270)
            model.place(child, box(2 + shift, 2, 4, 4))
            const jump = model.rect(child).x - seen.x
            const second = group.flush()
            if (shift === 0) {
                expect(jump).toBe(0)
                expect(await second).toEqual({
                    status: 'no-change',
                    snapped: [],
                })
                record(mc, child)
                expect(await first).toEqual({ status: 'ended', snapped: [] })
            } else {
                // 0.005 px × 276.8 ≈ 1.38 px on screen
                expect(jump).toBeGreaterThan(1)
                expectBox(model.rect(child), seen, 1e-6)
                record(mc, child)
                expect(await first).toEqual({
                    status: 'interrupted',
                    snapped: [],
                })
                expect(await second).toEqual({ status: 'ended', snapped: [] })
            }
            expectBox(model.rect(child), box(20 + 10 * shift, 20, 40, 40), 1e-9)
            group.dispose()
            document.body.innerHTML = ''
        }
    })
})

describe('the capture-less flush report (§4.4)', () => {
    it("reports exactly the nodes that may have jumped: an undriven node that moved from its last known box, a node with none, and a driven node whose bound β reaches threshold; the run is 'stale'", async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const moved = element(box(0))
        const still = element(box(100))
        const nudged = element(box(300))
        const far = element(box(0, 100))
        const near = element(box(100, 100))
        for (const e of [moved, still, nudged, far, near]) group.add(e)
        group.capture()
        await group.flush()
        group.capture()
        model.place(far, box(60, 100))
        model.place(near, box(160, 100))
        void group.flush()
        mc.frames(2)
        await nextTask()
        expect(group.stats.tracks).toBe(2)
        const drawnNear = model.rect(near)
        // no capture: the commit runs straight into the flush
        const added = element(box(400))
        group.add(added)
        model.place(moved, box(5))
        model.place(nudged, box(300.5))
        model.place(far, box(62, 100)) // β = 2 px ≥ threshold
        model.place(near, box(160.2, 100)) // β = 0.2 px, exact translation
        const report = await group.flush()
        expect(report).toEqual({
            status: 'stale',
            snapped: [
                { element: moved, reason: 'stale' },
                { element: far, reason: 'stale' },
                { element: added, reason: 'stale' },
            ],
        })
        expect(
            warnings.filter((w) => w.includes('no valid measurement'))
        ).toHaveLength(1)
        // undriven nodes appear at A; driven ones keep their tracks, moved
        // with their layout
        for (const e of [moved, still, nudged, added]) {
            expect(e.style.translate).toBe('')
        }
        expect(group.stats.tracks).toBe(2)
        expectBox(model.rect(near), shifted(drawnNear, 0.2))
        mc.frames(FRAMES)
        expectBox(model.rect(near), box(160.2, 100))
        expectBox(model.rect(far), box(62, 100))
        group.dispose()
    })

    it('a half-adopted pose counts what is still applied: the author re-sets translate, layout’s scale stays written, and that scale bounds β (a 0.2 px width change at pose scale ≈ 3.5 is reported)', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const g = element(box(0, 200, 80, 80))
        const other = element(box(300))
        group.add(g)
        group.add(other)
        group.capture()
        await group.flush()
        group.capture()
        model.place(g, box(0, 200, 20, 20))
        void group.flush()
        mc.frames(2)
        await nextTask()
        const scale = Number.parseFloat(g.style.scale)
        expect(scale).toBeGreaterThan(3)
        // no capture: the author re-sets the owned translate plainly, and
        // the commit widens g by 0.2 px; layout's scale is still written
        g.style.setProperty('translate', '0px 0px')
        model.place(g, box(0, 200, 20.2, 20))
        const report = await group.flush()
        // β = (1 + 2s)·0.2 ≈ 1.6 px ≥ threshold; at s = 1 it would be 0.6
        expect(report).toEqual({
            status: 'stale',
            snapped: [{ element: g, reason: 'stale' }],
        })
        group.dispose()
    })

    it('a half-adopted parent’s written scale counts for the path-2 condition: its driven child, nudged 0.1 px, is reported (the translation is not exact under the scale)', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const p = element(box(0, 200, 100, 100))
        const c = element(box(10, 210), p)
        group.add(p)
        group.add(c)
        group.capture()
        await group.flush()
        group.capture()
        model.place(p, box(0, 200, 200, 200))
        model.place(c, box(110, 210))
        void group.flush()
        mc.frames(2)
        await nextTask()
        expect(Number.parseFloat(p.style.scale)).toBeLessThan(0.9)
        expect(group.stats.tracks).toBe(2)
        // no capture: the author re-sets p's translate plainly; the commit
        // nudges c by 0.1 px (β < threshold, but ≥ 0.01)
        p.style.setProperty('translate', '0px 0px')
        model.place(c, box(110.1, 210))
        const report = await group.flush()
        expect(report).toEqual({
            status: 'stale',
            snapped: [{ element: c, reason: 'stale' }],
        })
        group.dispose()
    })

    it("a driven node without a valid B in a fresh capture (its owned translate re-set plainly by the author) and its participant subtree follow the §4.4 table: reported 'stale', the rest of the flush plans normally", async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(box(0, 0, 100, 100))
        const inside = element(box(10, 10), a)
        const other = element(box(300))
        for (const e of [a, inside, other]) group.add(e)
        group.capture()
        await group.flush()
        group.capture()
        // `a` moves; `inside` stays where it is (undriven, counter-projected)
        model.place(a, box(100, 0, 100, 100))
        void group.flush()
        mc.frames(2)
        await nextTask()
        expect(group.stats.tracks).toBe(1)
        // the author re-sets the owned translate inline, plainly, then the
        // capture and the commit follow in the same task
        a.style.setProperty('translate', '0px 0px')
        group.capture()
        model.place(a, box(150, 0, 100, 100))
        model.place(inside, box(60, 10))
        model.place(other, box(340))
        const seenOther = model.rect(other)
        const report = group.flush()
        // the rest of the flush plans normally: `other` starts at its B
        expect(model.rect(other).x).toBeCloseTo(300, 9)
        expect(seenOther.x).toBe(340)
        mc.frames(FRAMES)
        expect(await report).toEqual({
            status: 'ended',
            snapped: [
                { element: a, reason: 'stale' },
                { element: inside, reason: 'stale' },
            ],
        })
        expect(
            warnings.filter((w) => w.includes('no valid measurement'))
        ).toHaveLength(1)
        group.dispose()
    })

    it('a driven node disconnected at the capture and back in the commit has no valid B: it is kept and reported by β, never translated silently', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(box(0))
        const other = element(box(300))
        group.add(a)
        group.add(other)
        group.capture()
        await group.flush()
        group.capture()
        model.place(a, box(100))
        void group.flush()
        mc.frames(2)
        await nextTask()
        a.remove()
        group.capture()
        document.body.append(a)
        model.place(a, box(150))
        const report = await group.flush()
        expect(report).toEqual({
            status: 'stale',
            snapped: [{ element: a, reason: 'stale' }],
        })
        expect(group.stats.tracks).toBe(1)
        group.dispose()
    })

    it("β includes the parent's frame: a driven child that moves 30 px with its undriven parent is reported, and so is the parent; a child whose parent did not move is not", async () => {
        for (const parentMoves of [true, false]) {
            const mc = createManualClock()
            const group = createLayoutGroup({ clock: mc.clock, motion })
            const parent = element(box(0, 0, 200, 200))
            const child = element(box(10, 10), parent)
            group.add(parent)
            group.add(child)
            group.capture()
            await group.flush()
            group.capture()
            model.place(child, box(60, 10))
            void group.flush()
            mc.frames(2)
            await nextTask()
            expect(group.stats.tracks).toBe(1)
            const drawn = model.rect(child)
            // no capture: the commit moves the parent, the child with it
            if (parentMoves) {
                model.place(parent, box(30, 0, 200, 200))
                model.place(child, box(90, 10))
            }
            const report = await group.flush()
            if (parentMoves) {
                // it jumped with its layout by 30 px
                expect(model.rect(child).x - drawn.x).toBeCloseTo(30, 9)
                expect(report).toEqual({
                    status: 'stale',
                    snapped: [
                        { element: parent, reason: 'stale' },
                        { element: child, reason: 'stale' },
                    ],
                })
            } else {
                expect(report).toEqual({ status: 'no-change', snapped: [] })
            }
            group.dispose()
            document.body.innerHTML = ''
        }
    })

    it("an undriven node is judged against the aged capture's box when there is one; nothing reported is 'no-change'", async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const e = element(box(0))
        group.add(e)
        group.capture()
        await group.flush()
        await nextTask()
        // presented at 30 and captured there; the capture ages
        model.place(e, box(30))
        group.capture()
        mc.frame()
        model.place(e, box(30.4))
        expect(await group.flush()).toEqual({
            status: 'no-change',
            snapped: [],
        })
        group.dispose()
    })

    for (const [live, dx, reported] of [
        [true, 0.05, true],
        [true, 0.005, false],
        [false, 0.05, false],
    ] as const) {
        it(`a driven child moved ${dx} px under a parent ${live ? 'whose pose scale is live (no exact translation)' : 'at rest (an exact translation)'} is ${reported ? '' : 'not '}reported`, async () => {
            const mc = createManualClock()
            const group = createLayoutGroup({ clock: mc.clock, motion })
            const parent = element(box(0, 0, 100, 100))
            const child = element(box(10, 10, 20, 20), parent)
            group.add(parent)
            group.add(child)
            group.capture()
            await group.flush()
            group.capture()
            if (live) model.place(parent, box(0, 0, 101, 101))
            model.place(child, box(40, 10, 20, 20))
            void group.flush()
            mc.frames(2)
            await nextTask()
            expect(group.stats.tracks).toBe(live ? 2 : 1)
            model.place(child, box(40 + dx, 10, 20, 20))
            const report = await group.flush()
            expect(report).toEqual(
                reported
                    ? {
                          status: 'stale',
                          snapped: [{ element: child, reason: 'stale' }],
                      }
                    : { status: 'no-change', snapped: [] }
            )
            expect(group.stats.tracks).toBe(live ? 2 : 1)
            group.dispose()
        })
    }
})

describe('the support check at flush (§4.2)', () => {
    for (const engine of ['chromium', 'firefox'] as const) {
        const precision =
            engine === 'chromium'
                ? 'computed sizes to six significant digits'
                : 'transformed rect edges on 1/60 px'
        it(`measurement error (${engine}: ${precision}): a 1.203125 px hairline passes, and under zoom: 2 it is still detected`, async () => {
            model.precision(
                engine === 'chromium'
                    ? { widths: 'chromium' }
                    : { rects: 'firefox' }
            )
            for (const zoomed of [false, true]) {
                const mc = createManualClock()
                const group = createLayoutGroup({ clock: mc.clock, motion })
                const wrapper = element(box(0, 0, 200, 100))
                const rule = element(box(0, 10.3, 100, 1.203125), wrapper)
                model.place(rule, box(0, 10.3, 100, 1.203125), [100, 1])
                group.add(rule)
                group.capture()
                await group.flush()
                await nextTask()
                group.capture()
                if (zoomed) wrapper.style.zoom = '2'
                model.place(rule, box(0, 30.3, 100, 1.203125), [100, 1])
                const report = group.flush()
                mc.frames(FRAMES)
                expect(await report).toEqual(
                    zoomed
                        ? {
                              status: 'no-change',
                              snapped: [
                                  { element: rule, reason: 'unsupported' },
                              ],
                          }
                        : { status: 'ended', snapped: [] }
                )
                group.dispose()
                document.body.innerHTML = ''
            }
        })

        it(`measurement error (${engine}: ${precision}): a 1 px hairline drawn at its track's pose scale 0.73 passes the capture right after its flush, and under zoom: 2 it is still detected`, async () => {
            model.precision(
                engine === 'chromium'
                    ? { widths: 'chromium' }
                    : { rects: 'firefox' }
            )
            for (const zoomed of [false, true]) {
                const mc = createManualClock()
                const group = createLayoutGroup({
                    clock: mc.clock,
                    motion: { duration: 1, timing: timing.linear() },
                })
                const wrapper = element(box(0, 0, 200, 100))
                const rule = element(box(0, 10.3, 100, 0.73), wrapper)
                model.place(rule, box(0, 10.3, 100, 0.73), [100, 1])
                const other = element(box(300, 0))
                group.add(rule)
                group.add(other)
                group.capture()
                await group.flush()
                await nextTask()
                group.capture()
                model.place(rule, box(0, 30.3, 100, 1), [100, 1])
                const run = group.flush()
                // the capture right after the flush sees the t = 0 pose
                group.capture()
                if (zoomed) wrapper.style.zoom = '2'
                model.place(other, box(340, 0))
                const report = group.flush()
                mc.frames(70)
                expect(await report).toEqual(
                    zoomed
                        ? {
                              status: 'ended',
                              snapped: [
                                  { element: rule, reason: 'unsupported' },
                              ],
                          }
                        : { status: 'ended', snapped: [] }
                )
                expect((await run).snapped).toEqual([])
                group.dispose()
                document.body.innerHTML = ''
            }
        })
    }

    for (const height of [1, 0.5]) {
        it(`a ${height} px hairline under an unowned vertical scale is detected through its exact computed size on the degenerate axis`, async () => {
            for (const scaled of [false, true]) {
                const mc = createManualClock()
                const group = createLayoutGroup({ clock: mc.clock, motion })
                const wrapper = element(box(0, 0, 100, 100))
                const rule = element(box(0, 10, 100, height), wrapper)
                model.place(rule, box(0, 10, 100, height), [100, 1])
                group.add(rule)
                group.capture()
                await group.flush()
                await nextTask()
                group.capture()
                if (scaled) wrapper.style.scale = '1 1.5'
                model.place(rule, box(0, 30, 100, height), [100, 1])
                const before = group.stats.styles
                model.reset()
                const report = group.flush()
                // the exact size read on the degenerate axis, counted
                expect(group.stats.styles - before).toBe(model.reads.styles)
                expect(model.reads.styles).toBeGreaterThan(0)
                mc.frames(FRAMES)
                expect(await report).toEqual(
                    scaled
                        ? {
                              status: 'no-change',
                              snapped: [
                                  { element: rule, reason: 'unsupported' },
                              ],
                          }
                        : { status: 'ended', snapped: [] }
                )
                group.dispose()
                document.body.innerHTML = ''
            }
        })
    }

    it("at flush an active node's computed values already read are its q: a 1.003 authored scale hiding in a 100 px parent's M exposes a 2000 px child under a non-participant 1/1.003 scale, which snaps 'unsupported'", async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const q = 1.003
        const p = element(box(0, 0, 100, 100))
        p.style.scale = String(q)
        const wrap = element(box(0, 0, 2000, 40), p)
        wrap.style.scale = String(1 / q)
        const j = element(box(0, 0, 2000, 40), wrap)
        group.add(p)
        group.add(j)
        group.capture()
        await group.flush()
        await nextTask()
        group.capture()
        // the commit moves p (and its content with it): p is active
        model.place(p, box(30, 0, 100, 100))
        model.place(wrap, box(30, 0, 2000, 40))
        model.place(j, box(30, 0, 2000, 40))
        const report = group.flush()
        mc.frames(FRAMES)
        expect(await report).toEqual({
            status: 'ended',
            snapped: [{ element: j, reason: 'unsupported' }],
        })
        group.dispose()
    })

    it("an unowned ancestor scale set in the commit snaps its participant 'unsupported'; the run resolves by its tracks and lists the snapped node (§9.3)", async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const wrapper = element(box(0, 0, 400, 400))
        const inside = element(box(0), wrapper)
        const outside = element(box(0, 500))
        group.add(inside)
        group.add(outside)
        group.capture()
        await group.flush()
        await nextTask()
        group.capture()
        wrapper.style.scale = '1.5'
        model.place(inside, box(20))
        model.place(outside, box(20, 500))
        const report = group.flush()
        expect(inside.style.translate).toBe('')
        expect(outside.style.translate).not.toBe('')
        mc.frames(FRAMES)
        expect(await report).toEqual({
            status: 'ended',
            snapped: [{ element: inside, reason: 'unsupported' }],
        })
        group.dispose()
    })
})

describe('the presented velocity v at t_k (§4.2 Velocity, §5.7)', () => {
    /**
     * A parent participant at a live scale (200 × 100 → 400 × 200 px, linear,
     * 1 s) with a child that has its own track (60 px right); five frames in,
     * the child's layout shifts 24 px up inside the parent (an inner scroll
     * offset σ, presented). Everything the analytic chain draws is linear in
     * t here, so a one-sided difference of the presented box is its exact
     * derivative; the retarget is a cubic in t, so four frames give its
     * exact start velocity. The engine writes poses to 1e-6, which bounds
     * what rects can show (a few 1e-3 px/s at 50 ms steps); the chain itself
     * is checked at 1e-9 in measure.test.ts (PV-1).
     */
    async function scene(commit: boolean) {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion: { duration: 1, timing: timing.linear() },
            threshold: 8,
        })
        const parent = element(box(0, 200, 200, 100))
        const child = element(box(20, 220, 40, 40), parent)
        group.add(parent)
        group.add(child)
        group.capture()
        await group.flush()
        group.capture()
        model.place(parent, box(0, 200, 400, 200))
        model.place(child, box(80, 220, 40, 40))
        void group.flush()
        mc.frames(5)
        await nextTask()
        // σ = 24 px, presented: the child's in-parent offset changes
        model.place(child, box(80, 196, 40, 40))
        const v = commit
            ? retargetVelocity(mc, group, child, () =>
                  // the commit moves the child 5 px (J = 5 < threshold):
                  // path 3 under the live scale, a retarget from (B, v)
                  model.place(child, box(85, 196, 40, 40))
              )
            : presentedVelocity(mc, child)
        group.dispose()
        document.body.innerHTML = ''
        return v
    }

    const STEP = 0.05

    /** The one-sided difference of `e`'s drawn box over one step. */
    function presentedVelocity(mc: Clock, e: HTMLElement): Box {
        const b0 = model.rect(e)
        mc.frame(STEP * 1000)
        const b1 = model.rect(e)
        return {
            x: (b1.x - b0.x) / STEP,
            y: (b1.y - b0.y) / STEP,
            w: (b1.w - b0.w) / STEP,
            h: (b1.h - b0.h) / STEP,
        }
    }

    /**
     * Captures, runs `commit`, flushes, and returns the start velocity of
     * `e`'s new track (a cubic: four frames give it exactly); its first frame
     * is the measured B.
     */
    function retargetVelocity(
        mc: Clock,
        group: ReturnType<typeof createLayoutGroup>,
        e: HTMLElement,
        commit: () => void
    ): Box {
        const b0 = model.rect(e)
        group.capture()
        commit()
        void group.flush()
        const c0 = model.rect(e)
        // the first frame is B, to the 1e-6 precision of the written pose
        expectBox(c0, b0, 1e-4)
        const c: Box[] = [c0]
        for (let k = 0; k < 3; k++) {
            mc.frame(STEP * 1000)
            c.push(model.rect(e))
        }
        const d = (key: keyof Box) =>
            (-11 * c[0]![key] +
                18 * c[1]![key] -
                9 * c[2]![key] +
                2 * c[3]![key]) /
            (6 * STEP)
        return { x: d('x'), y: d('y'), w: d('w'), h: d('h') }
    }

    it('under a live parent scale with a 24 px inner offset presented, the retarget starts at the presented box’s true velocity: the product-rule derivative (parent scale rate × in-parent offset, parent translation rate, own rate), to a finite difference of the presented box (within the 1e-6 write precision)', async () => {
        const expected = await scene(false)
        const actual = await scene(true)
        // the inner offset's own term is visible: −k′·σ = −12 px/s on y
        expect(Math.abs(expected.y + 12)).toBeLessThan(0.01)
        expectBox(actual, expected, 0.02)
    })

    it('a node at a live pose scale whose commit resizes it (a 50 % origin moves with A): v is taken about the origin its pose was planned with, on the presented box', async () => {
        const run = async (commit: boolean) => {
            const mc = createManualClock()
            const group = createLayoutGroup({
                clock: mc.clock,
                motion: { duration: 1, timing: timing.linear() },
            })
            const g = element(box(0, 0, 40, 40))
            g.style.transformOrigin = '50% 50%'
            group.add(g)
            group.capture()
            await group.flush()
            group.capture()
            model.place(g, box(100, 0, 200, 100))
            void group.flush()
            mc.frames(5)
            await nextTask()
            const v = commit
                ? retargetVelocity(mc, group, g, () =>
                      model.place(g, box(100, 0, 120, 60))
                  )
                : presentedVelocity(mc, g)
            group.dispose()
            document.body.innerHTML = ''
            return v
        }
        const expected = await run(false)
        const actual = await run(true)
        expect(expected.w).toBeGreaterThan(100)
        expectBox(actual, expected, 0.02)
    })
})
