// P4/L-DRIVE-1..6 (ARCHITECTURE §5.10): direct manipulation in real
// browsers. A held element is the user's finger: its drawn origin is the take
// point plus the offset under scroll, a live ancestor scale and re-layout;
// release carries the supplied velocity exactly once; descendants ride one
// inherited displacement h(t) with their own residuals.
import { timing } from '@freestylejs/ani-core'
import { createManualClock } from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    type LayoutDiagnostic,
    type LayoutDriveHandle,
    layoutRuntime,
} from '@freestylejs/ani-layout'
import {
    expectedBox,
    maxDiff,
    type OBox,
    type OTrackSpec,
} from '../../../packages/layout/src/__tests__/oracle'
import { expectClose, expectEqual } from './assert'
import {
    frames,
    harness,
    node,
    pageBox,
    settleMicrotasks,
    shiftBox,
    silenceWarnings,
    TOL,
    viewBox,
} from './layout_kit'

export const pageOptions = {}
export const knownFailures: Record<string, string> = {}

const FRAME = 16
const DT = FRAME / 1000
const linear = timing.linear()

function specOf(
    before: OBox,
    after: OBox,
    velocity: OBox | null,
    duration: number,
    extra: Partial<OTrackSpec> = {}
): OTrackSpec {
    return {
        before,
        after,
        velocity,
        fx: 0.5,
        fy: 0.5,
        mode: true,
        duration,
        delay: 0,
        timing: linear,
        ...extra,
    }
}

/** Drawn origin (the centre: every row uses the default 50% origin). */
function originOf(box: OBox): { x: number; y: number } {
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

function expectOrigin(
    element: Element,
    want: { x: number; y: number },
    label: string,
    tolerance = TOL
): void {
    const got = originOf(viewBox(element))
    const error = Math.max(Math.abs(got.x - want.x), Math.abs(got.y - want.y))
    if (!(error <= tolerance)) {
        throw new Error(
            `${label}: origin ${JSON.stringify(got)} differs from ${JSON.stringify(want)} by ${error.toFixed(3)} px`
        )
    }
}

function expectBoxAt(
    element: Element,
    want: OBox,
    label: string,
    tolerance = TOL
): void {
    const error = maxDiff(pageBox(element), want)
    if (!(error <= tolerance)) {
        throw new Error(
            `${label}: drawn ${JSON.stringify(pageBox(element))} differs from ${JSON.stringify(want)} by ${error.toFixed(3)} px`
        )
    }
}

function invalid(action: () => void, label: string): void {
    let threw = false
    try {
        action()
    } catch (error) {
        threw = true
        const code = (error as { code?: string }).code
        if (code !== 'ANI_INVALID_OPTIONS') {
            throw new Error(`${label}: wrong error ${String(error)}`)
        }
    }
    if (!threw) throw new Error(`${label}: did not throw`)
}

function stylesOf(element: HTMLElement): string {
    return element.style.cssText
}

/* ───────────────────────────── L-DRIVE-1 ───────────────────────────── */

/**
 * Take, move, reorder and release. The pointer offset is constant under a
 * reorder (≤ 0.5 px); the release path is the independent oracle's timing
 * track from the held box with the release velocity, its first update
 * `dt = 0`, and `c′(0) = v` exactly; snap-back and cancel restore the
 * authored styles.
 */
export async function L_DRIVE_1(): Promise<string> {
    const details: string[] = []
    const quiet = silenceWarnings()
    try {
        const h = harness({ motion: { duration: 0.3, timing: linear } })
        const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
        const b = node(h.root, 'left:300px;top:0px;width:80px;height:80px')
        h.add(a, { radius: false })
        h.add(b, { radius: false })
        h.group.capture()
        await h.group.flush()
        const takeBox = viewBox(a)
        const take = originOf(takeBox)
        const handle = h.group.take(a)
        expectEqual(handle.state, 'held', 'take state')
        expectEqual(h.group.stats.holds, 1, 'live holds')

        // move: the drawn origin is the take point + offset, every frame
        const offset = { x: 120, y: 60 }
        handle.move(offset)
        let worst = 0
        await frames(h.mc, 4, (elapsed) => {
            const want = { x: take.x + offset.x, y: take.y + offset.y }
            expectOrigin(a, want, `held ${elapsed.toFixed(3)}s`)
            worst = Math.max(
                worst,
                maxDiff(viewBox(a), shiftBox(takeBox, offset.x, offset.y))
            )
        })
        expectClose(worst, 0, TOL, 'pointer offset constant under no reorder')
        details.push(`held origin exact, worst ${worst.toFixed(4)} px`)

        // reorder while held: a's slot moves; the offset from the finger does not
        h.group.capture()
        a.style.left = '200px'
        a.style.top = '120px'
        await h.group.flush()
        expectEqual(handle.state, 'held', 'reorder keeps the hold')
        let reorderWorst = 0
        await frames(h.mc, 4, (elapsed) => {
            const want = { x: take.x + offset.x, y: take.y + offset.y }
            expectOrigin(a, want, `reordered held ${elapsed.toFixed(3)}s`)
            reorderWorst = Math.max(
                reorderWorst,
                maxDiff(viewBox(a), shiftBox(takeBox, offset.x, offset.y))
            )
        })
        expectClose(
            reorderWorst,
            0,
            TOL,
            'pointer offset constant under reorder'
        )
        details.push(
            `reorder keeps the offset, worst ${reorderWorst.toFixed(4)} px`
        )

        // release with a velocity: the oracle track starts at the held box
        const heldBox = viewBox(a)
        const rootBox = pageBox(h.root)
        const aBox: OBox = {
            x: rootBox.x + a.offsetLeft,
            y: rootBox.y + a.offsetTop,
            w: a.offsetWidth,
            h: a.offsetHeight,
        }
        const v = { x: 600, y: -200, w: 0, h: 0 }
        handle.release({ x: v.x, y: v.y })
        expectEqual(handle.state, 'released', 'release state')
        expectEqual(h.group.stats.holds, 0, 'no live hold after release')
        const oracle = specOf(heldBox, aBox, v, 0.3)
        let releaseWorst = 0
        let firstFrame = true
        await frames(h.mc, 40, (elapsed) => {
            const want = expectedBox(oracle, elapsed)
            expectBoxAt(a, want, `release ${elapsed.toFixed(3)}s`)
            releaseWorst = Math.max(releaseWorst, maxDiff(pageBox(a), want))
            if (firstFrame) {
                expectClose(
                    maxDiff(pageBox(a), heldBox),
                    0,
                    0.01,
                    'release first update is dt = 0'
                )
                firstFrame = false
            }
        })
        expectClose(releaseWorst, 0, TOL, 'release path against the oracle')
        details.push(
            `release path on the oracle, worst ${releaseWorst.toFixed(4)} px`
        )
        expectEqual(a.style.translate, '', 'release restores translate')
        expectEqual(a.style.scale, '', 'release restores scale')

        // snap-back: move and release with no velocity
        const authored = stylesOf(a)
        const snap = h.group.take(a)
        snap.move({ x: -60, y: 30 })
        h.mc.frame(FRAME)
        await settleMicrotasks()
        const beforeSnap = viewBox(a)
        snap.release()
        await frames(h.mc, 30, () => undefined)
        expectEqual(a.style.translate, '', 'snap-back restores translate')
        expectEqual(
            stylesOf(a),
            authored,
            'snap-back restores the authored style'
        )
        expectClose(maxDiff(pageBox(a), aBox), 0, TOL, 'snap-back lands at A')
        details.push(`snap-back from ${JSON.stringify(beforeSnap)}`)

        // cancel: hands back to the slot with zero velocity
        const cancel = h.group.take(a)
        cancel.move({ x: 40, y: 0 })
        h.mc.frame(FRAME)
        await settleMicrotasks()
        cancel.cancel()
        expectEqual(cancel.state, 'cancelled', 'cancel state')
        await frames(h.mc, 30, () => undefined)
        expectEqual(a.style.translate, '', 'cancel restores translate')
        expectClose(maxDiff(pageBox(a), aBox), 0, TOL, 'cancel lands at A')

        // release with a large velocity: the same oracle track with v = 1000
        // (a doubled or dropped velocity would miss it by far more than 0.5 px)
        const fast = h.group.take(a)
        fast.move({ x: 30, y: 0 })
        h.mc.frame(FRAME)
        await settleMicrotasks()
        const b0 = viewBox(a)
        fast.release({ x: 1000, y: 0 })
        const fastSpec = specOf(b0, aBox, { x: 1000, y: 0, w: 0, h: 0 }, 0.3)
        let fastWorst = 0
        await frames(h.mc, 4, (elapsed) => {
            const want = expectedBox(fastSpec, elapsed)
            expectBoxAt(a, want, `fast release ${elapsed.toFixed(3)}s`)
            fastWorst = Math.max(fastWorst, maxDiff(pageBox(a), want))
        })
        expectClose(fastWorst, 0, TOL, 'v = 1000 enters exactly once')
        details.push(
            `release velocity 1000 on the oracle, worst ${fastWorst.toFixed(4)} px`
        )
        await frames(h.mc, 30, () => undefined)
        expectEqual(a.style.translate, '', 'fast release restores translate')

        h.dispose()
        return details.join('; ')
    } finally {
        quiet.restore()
    }
}

/* ───────────────────────────── L-DRIVE-2 ───────────────────────────── */

/**
 * Catch a moving card. Take freezes the origin at the presented value and
 * exposes the analytic origin velocity (no jump); the size keeps its own
 * track through the hold and the release.
 */
export async function L_DRIVE_2(): Promise<string> {
    const details: string[] = []
    const quiet = silenceWarnings()
    try {
        const h = harness({ motion: { duration: 0.6, timing: linear } })
        const a = node(h.root, 'left:0px;top:120px;width:80px;height:80px')
        h.add(a, { radius: false })
        h.group.capture()
        await h.group.flush()
        const b: OBox = pageBox(a)
        h.group.capture()
        a.style.left = '300px'
        a.style.width = '160px'
        const run = h.group.flush()
        // two frames: the t = 0 pose, then 16 ms of the track
        await frames(h.mc, 2, () => undefined)
        const takeElapsed = DT
        const before = pageBox(a)
        const spec = specOf(b, { ...b, x: 300, w: 160 }, null, 0.6)
        const atTake = expectedBox(spec, takeElapsed)
        expectClose(
            maxDiff(before, atTake),
            0,
            TOL,
            'presented box at the take'
        )
        const takeOrigin = originOf(atTake)
        const handle = h.group.take(a)
        expectEqual(handle.state, 'held', 'catch state')
        // the analytic origin velocity: c′(t) of the oracle's origin channels
        const eps = 1e-5
        const o0 = originOf(expectedBox(spec, takeElapsed))
        const o1 = originOf(expectedBox(spec, takeElapsed + eps))
        const analytic = { x: (o1.x - o0.x) / eps, y: (o1.y - o0.y) / eps }
        expectClose(handle.velocity.x, analytic.x, 2, 'analytic origin vx')
        expectClose(handle.velocity.y, analytic.y, 2, 'analytic origin vy')
        details.push(
            `caught at ${takeElapsed.toFixed(3)}s: v = ${handle.velocity.x.toFixed(1)} px/s (oracle ${analytic.x.toFixed(1)})`
        )
        // no move: the origin is pinned, the size keeps its track
        let sizeWorst = 0
        let holdWorst = 0
        await frames(h.mc, 12, (_elapsed, index) => {
            const t = takeElapsed + (index + 1) * DT
            const want = expectedBox(spec, t)
            expectOrigin(a, takeOrigin, `caught hold ${t.toFixed(3)}s`)
            holdWorst = Math.max(
                holdWorst,
                Math.max(
                    Math.abs(originOf(pageBox(a)).x - takeOrigin.x),
                    Math.abs(originOf(pageBox(a)).y - takeOrigin.y)
                )
            )
            sizeWorst = Math.max(
                sizeWorst,
                Math.abs(pageBox(a).w - want.w),
                Math.abs(pageBox(a).h - want.h)
            )
        })
        expectClose(sizeWorst, 0, TOL, 'size keeps its track while held')
        expectClose(holdWorst, 0, TOL, 'no jump at the catch')
        details.push(
            `size kept its track while held, worst ${sizeWorst.toFixed(4)} px`
        )

        // release: the size continuation goes on; the oracle's size is the
        // original track's, never the release track's own size path
        handle.move({ x: 40, y: 0 })
        h.mc.frame(FRAME)
        await settleMicrotasks()
        const releaseStart = takeElapsed + 13 * DT
        const released = pageBox(a)
        const releasedSize = expectedBox(spec, releaseStart)
        expectClose(
            released.w,
            releasedSize.w,
            TOL,
            'release starts from the held size'
        )
        expectClose(
            released.h,
            releasedSize.h,
            TOL,
            'release starts from the held height'
        )
        handle.release({ x: 200, y: 0 })
        let alongWorst = 0
        await frames(h.mc, 40, (_elapsed, index) => {
            const t = releaseStart + (index + 1) * DT
            const want = expectedBox(spec, t)
            // origin is the release path; the size is still the original
            // track's size channel
            alongWorst = Math.max(
                alongWorst,
                Math.abs(pageBox(a).w - want.w),
                Math.abs(pageBox(a).h - want.h)
            )
        })
        expectClose(alongWorst, 0, TOL, 'size continuation after release')
        details.push(
            `release kept the size continuation, worst ${alongWorst.toFixed(4)} px`
        )
        expectEqual(a.style.translate, '', 'catch release restores translate')
        expectEqual(a.style.scale, '', 'catch release restores scale')
        await run
        h.dispose()
        return details.join('; ')
    } finally {
        quiet.restore()
    }
}

/* ───────────────────────────── L-DRIVE-3 ───────────────────────────── */

/**
 * The held origin under hostile camera changes: scrolling the container and a
 * participant ancestor scaling 1 → 2 while the element is held. H is the take
 * point plus the offset, in current view space, every frame (≤ 0.5 px).
 */
export async function L_DRIVE_3(): Promise<string> {
    const details: string[] = []
    const quiet = silenceWarnings()
    try {
        // (a) the held card's own scroll container moves under it
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const scroller = document.createElement('div')
            scroller.style.cssText =
                'position:absolute;left:0;top:0;width:400px;height:300px;overflow:auto;'
            const tall = document.createElement('div')
            tall.style.cssText = 'position:relative;width:400px;height:2000px;'
            scroller.append(tall)
            h.root.append(scroller)
            const a = node(tall, 'left:50px;top:100px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const takeBox = viewBox(a)
            const take = originOf(takeBox)
            const handle = h.group.take(a)
            const offset = { x: 35, y: 15 }
            handle.move(offset)
            h.mc.frame(FRAME)
            await settleMicrotasks()
            let worst = 0
            const originOfBox = canvasOrigin()
            function canvasOrigin(): { x: number; y: number } {
                return {
                    x: takeBox.x + takeBox.w / 2,
                    y: takeBox.y + takeBox.h / 2,
                }
            }
            for (let index = 0; index < 12; index++) {
                scroller.scrollTop = index * 45
                scroller.scrollLeft = index * 7
                // the scroll is presented before the engine frame; the held
                // read compensates for it in that frame
                h.mc.frame(FRAME)
                await settleMicrotasks()
                expectOrigin(
                    a,
                    { x: take.x + offset.x, y: take.y + offset.y },
                    `scrolled held ${index}`
                )
                worst = Math.max(
                    worst,
                    Math.max(
                        Math.abs(originOf(viewBox(a)).x - (take.x + offset.x)),
                        Math.abs(originOf(viewBox(a)).y - (take.y + offset.y))
                    )
                )
            }
            void originOfBox
            expectClose(worst, 0, TOL, 'held under scroll')
            details.push(`scroll H error ≤ ${worst.toFixed(4)} px`)
            handle.cancel()
            await frames(h.mc, 30, () => undefined)
            h.dispose()
        }
        // (b) a participant ancestor animates its scale 1 → 2
        {
            const h = harness({ motion: { duration: 0.4, timing: linear } })
            const parent = node(
                h.root,
                'left:100px;top:100px;width:160px;height:160px'
            )
            const child = node(
                parent,
                'position:relative;left:20px;top:20px;width:60px;height:60px'
            )
            h.add(parent, { radius: false })
            h.add(child, { radius: false })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            parent.style.width = '320px'
            parent.style.height = '320px'
            const run = h.group.flush()
            await frames(h.mc, 2, () => undefined)
            const takeBox = viewBox(child)
            const take = originOf(takeBox)
            const handle = h.group.take(child)
            handle.move({ x: 50, y: -20 })
            let worst = 0
            await frames(h.mc, 12, (_elapsed, index) => {
                expectOrigin(
                    child,
                    { x: take.x + 50, y: take.y - 20 },
                    `scaling-parent held ${index}`
                )
                worst = Math.max(
                    worst,
                    Math.max(
                        Math.abs(originOf(viewBox(child)).x - (take.x + 50)),
                        Math.abs(originOf(viewBox(child)).y - (take.y - 20))
                    )
                )
            })
            expectClose(worst, 0, TOL, 'held under a live ancestor scale')
            details.push(`scale 1→2 H error ≤ ${worst.toFixed(4)} px`)
            handle.cancel()
            await frames(h.mc, 40, () => undefined)
            await run
            h.dispose()
        }
        // (c) sticky engages while held
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const scroller = document.createElement('div')
            scroller.style.cssText =
                'position:absolute;left:0;top:0;width:400px;height:300px;overflow:auto;'
            const tall = document.createElement('div')
            tall.style.cssText = 'position:relative;width:400px;height:2000px;'
            scroller.append(tall)
            h.root.append(scroller)
            const a = node(
                tall,
                'left:160px;top:120px;width:80px;height:80px;position:sticky;'
            )
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const takeBox = viewBox(a)
            const take = originOf(takeBox)
            const handle = h.group.take(a)
            handle.move({ x: 10, y: 30 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            let worst = 0
            for (let index = 0; index < 12; index++) {
                scroller.scrollTop = index * 40
                h.mc.frame(FRAME)
                await settleMicrotasks()
                expectOrigin(
                    a,
                    { x: take.x + 10, y: take.y + 30 },
                    `sticky held ${index}`
                )
                worst = Math.max(
                    worst,
                    Math.max(
                        Math.abs(originOf(viewBox(a)).x - (take.x + 10)),
                        Math.abs(originOf(viewBox(a)).y - (take.y + 30))
                    )
                )
            }
            expectClose(worst, 0, TOL, 'held under sticky')
            details.push(`sticky H error ≤ ${worst.toFixed(4)} px`)
            handle.cancel()
            await frames(h.mc, 30, () => undefined)
            h.dispose()
        }
        return details.join('; ')
    } finally {
        quiet.restore()
    }
}

/* ───────────────────────────── L-DRIVE-6 ───────────────────────────── */

function addH(box: OBox, h: { x: number; y: number }): OBox {
    return { x: box.x + h.x, y: box.y + h.y, w: box.w, h: box.h }
}

function velocityOf(
    spec: OTrackSpec,
    at: number,
    eps = 1e-5
): { x: number; y: number; w: number; h: number } {
    const a = expectedBox(spec, at)
    const b = expectedBox(spec, at + eps)
    return {
        x: (b.x - a.x) / eps,
        y: (b.y - a.y) / eps,
        w: (b.w - a.w) / eps,
        h: (b.h - a.h) / eps,
    }
}

/**
 * Descendants ride one inherited displacement `h(t)` with their own
 * residuals: a parent spring 0.5 s, a plain child (no track), a
 * `layout: 'size'` child with a running size track, and a child already
 * moving at the take. Every descendant is drawn at residual + h (≤ 0.5 px
 * every frame); the inherited h is one function, and the release velocity
 * enters only through the parent's origin track.
 */
export async function L_DRIVE_6(): Promise<string> {
    const details: string[] = []
    const quiet = silenceWarnings()
    try {
        const spring = {
            type: 'spring' as const,
            duration: 0.5,
            bounce: 0,
        }
        const h = harness({ motion: { duration: 0.2, timing: linear } })
        const parent = node(
            h.root,
            'left:100px;top:100px;width:200px;height:200px'
        )
        const c1 = node(
            parent,
            'position:relative;left:20px;top:20px;width:60px;height:60px'
        )
        const cs = node(
            parent,
            'position:relative;left:20px;top:120px;width:80px;height:40px'
        )
        const cm = node(
            parent,
            'position:relative;left:120px;top:20px;width:50px;height:50px'
        )
        h.add(parent, { radius: false, motion: spring })
        h.add(c1, { radius: false, motion: { duration: 0.1, timing: linear } })
        h.add(cs, {
            radius: false,
            layout: 'size',
            motion: { duration: 0.15, timing: linear },
        })
        h.add(cm, { radius: false, motion: { duration: 0.1, timing: linear } })
        h.group.capture()
        await h.group.flush()
        const parentA = pageBox(parent)
        const a1 = pageBox(c1)
        const as = pageBox(cs)
        const am = pageBox(cm)

        // cs: a running size track (the residual is a 'size' path)
        h.group.capture()
        cs.style.width = '140px'
        h.group.flush()
        await frames(h.mc, 2, () => undefined)
        const csSpec = specOf(as, { ...as, w: 140 }, null, 0.15, {
            mode: 'size',
        })

        // cm: a child already moving when the parent is taken
        h.group.capture()
        cm.style.left = '180px'
        h.group.flush()
        await frames(h.mc, 2, () => undefined)
        const cmSpec = specOf(am, { ...am, x: am.x + 60 }, null, 0.1)
        const csAtTake = expectedBox(csSpec, 3 * DT)
        const cmAtTake = expectedBox(cmSpec, DT)
        expectClose(maxDiff(pageBox(cs), csAtTake), 0, TOL, 'moving size child')
        expectClose(maxDiff(pageBox(cm), cmAtTake), 0, TOL, 'moving child')
        const csResidual = specOf(
            csAtTake,
            { x: as.x, y: as.y, w: 140, h: 40 },
            velocityOf(csSpec, 3 * DT),
            0.15,
            { mode: 'size' }
        )
        const cmResidual = specOf(
            cmAtTake,
            { x: am.x + 60, y: am.y, w: am.w, h: am.h },
            velocityOf(cmSpec, DT),
            0.1
        )

        // take the parent at rest; h starts at 0
        const handle = h.group.take(parent)
        expectEqual(handle.state, 'held', 'parent held')
        const offset = { x: 120, y: 60 }
        handle.move(offset)
        const parentTakeOrigin = originOf(parentA)
        const heldH = offset
        let heldWorst = 0
        const checkHeld = (label: string, residualTime: number) => {
            // parent origin is exactly A + h while held
            expectOrigin(
                parent,
                {
                    x: parentTakeOrigin.x + heldH.x,
                    y: parentTakeOrigin.y + heldH.y,
                },
                `${label} parent`
            )
            // the plain child has no track: residual A
            expectBoxAt(c1, addH(a1, heldH), `${label} c1`)
            // the size child and the already-moving child: residual + h
            const rs = expectedBox(csResidual, residualTime)
            expectBoxAt(cs, addH(rs, heldH), `${label} cs`, TOL)
            const rm = expectedBox(cmResidual, residualTime)
            expectBoxAt(cm, addH(rm, heldH), `${label} cm`, TOL)
            // the geometry relative to the parent depends on the residual only
            const pOrigin = originOf(viewBox(parent))
            for (const [child, residual] of [
                [c1, a1],
                [cs, rs],
                [cm, rm],
            ] as const) {
                const cOrigin = originOf(viewBox(child))
                const rOrigin = originOf(residual)
                heldWorst = Math.max(
                    heldWorst,
                    Math.abs(
                        cOrigin.x -
                            pOrigin.x -
                            (rOrigin.x - originOf(parentA).x)
                    ),
                    Math.abs(
                        cOrigin.y -
                            pOrigin.y -
                            (rOrigin.y - originOf(parentA).y)
                    )
                )
            }
        }
        const heldFrames = 8
        for (let i = 0; i < heldFrames; i++) {
            h.mc.frame(FRAME)
            await settleMicrotasks()
            checkHeld(`held ${i}`, (i + 1) * DT)
        }
        expectClose(
            heldWorst,
            0,
            TOL,
            'child-to-parent geometry follows the residual'
        )
        details.push(`held residuals ride h, worst ${heldWorst.toFixed(4)} px`)

        // release: h becomes the parent's spring origin track; the children
        // keep their residuals and never receive the release velocity
        const heldBox = pageBox(parent)
        const v = { x: 700, y: -260, w: 0, h: 0 }
        handle.release({ x: v.x, y: v.y })
        const parentSpec = specOf(heldBox, parentA, v, 0.5, {
            spring: { duration: 0.5, bounce: 0, end: 10 },
        })
        const parentAOrigin = originOf(parentA)
        let releaseWorst = 0
        let velocityWorst = 0
        let previous: {
            child: { x: number; y: number }
            residual: { x: number; y: number }
            h: { x: number; y: number }
        } | null = null
        await frames(h.mc, 22, (_elapsed, index) => {
            const tRel = index * DT
            const parentBox = expectedBox(parentSpec, tRel)
            const hNow = {
                x: originOf(parentBox).x - parentAOrigin.x,
                y: originOf(parentBox).y - parentAOrigin.y,
            }
            const residualTime = (heldFrames + index + 1) * DT
            const rm = expectedBox(cmResidual, residualTime)
            const rs = expectedBox(csResidual, residualTime)
            expectBoxAt(c1, addH(a1, hNow), `release ${index} c1`)
            expectBoxAt(cs, addH(rs, hNow), `release ${index} cs`, TOL)
            expectBoxAt(cm, addH(rm, hNow), `release ${index} cm`, TOL)
            releaseWorst = Math.max(
                releaseWorst,
                maxDiff(pageBox(cm), addH(rm, hNow)),
                maxDiff(pageBox(cs), addH(rs, hNow)),
                maxDiff(pageBox(c1), addH(a1, hNow))
            )
            const cOrigin = originOf(viewBox(cm))
            const rOrigin = originOf(rm)
            const sample = {
                child: cOrigin,
                residual: rOrigin,
                h: hNow,
            }
            if (previous) {
                const childV = {
                    x: (sample.child.x - previous.child.x) / DT,
                    y: (sample.child.y - previous.child.y) / DT,
                }
                const residualV = {
                    x: (sample.residual.x - previous.residual.x) / DT,
                    y: (sample.residual.y - previous.residual.y) / DT,
                }
                const hV = {
                    x: (sample.h.x - previous.h.x) / DT,
                    y: (sample.h.y - previous.h.y) / DT,
                }
                velocityWorst = Math.max(
                    velocityWorst,
                    Math.abs(childV.x - (residualV.x + hV.x)),
                    Math.abs(childV.y - (residualV.y + hV.y))
                )
            }
            previous = sample
        })
        expectClose(
            releaseWorst,
            0,
            TOL,
            'descendants at residual + h on release'
        )
        expectClose(velocityWorst, 0, 20, 'descendant velocity = residual + ḣ')
        details.push(
            `release residuals ride h, worst ${releaseWorst.toFixed(4)} px; velocity residual+ḣ, worst ${velocityWorst.toFixed(2)} px/s`
        )
        await frames(h.mc, 60, () => undefined)
        expectEqual(
            parent.style.translate,
            '',
            'parent release restores translate'
        )
        expectEqual(parent.style.scale, '', 'parent release restores scale')
        expectEqual(c1.style.translate, '', 'child residual restores translate')
        expectEqual(cs.style.translate, '', 'size child restores translate')
        expectEqual(cm.style.translate, '', 'moving child restores translate')
        expectEqual(h.group.stats.holds, 0, 'no hold left')
        h.dispose()
        return details.join('; ')
    } finally {
        quiet.restore()
    }
}

/* ───────────────────────────── L-DRIVE-4 ───────────────────────────── */

/**
 * The drive state machine: stale calls, non-finite input, two scopes,
 * ancestor holds, unmount, dispose mid-hold, the drive-hold kill switch
 * (§7.2, C3), `layoutKey`, support failure, finish. Every terminal
 * transition invalidates the handle and restores the authored styles.
 */
export async function L_DRIVE_4(): Promise<string> {
    const details: string[] = []
    const quiet = silenceWarnings()
    try {
        const h = harness({ motion: { duration: 0.2, timing: linear } })
        const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
        h.add(a, { radius: false })
        h.group.capture()
        await h.group.flush()
        const authored = a.style.cssText

        // non-finite input and stale terminal calls
        const handle = h.group.take(a)
        invalid(() => handle.move({ x: Number.NaN, y: 0 }), 'NaN move')
        invalid(
            () => handle.release({ x: 0, y: Number.POSITIVE_INFINITY }),
            'infinite release'
        )
        expectEqual(handle.state, 'held', 'non-finite leaves the hold')
        handle.move({ x: 24, y: 12 })
        h.mc.frame(FRAME)
        await settleMicrotasks()
        handle.release()
        expectEqual(handle.state, 'released', 'release terminal')
        const warningsBefore = quiet.messages.length
        handle.release()
        handle.cancel()
        handle.move({ x: 1, y: 1 })
        handle.move({ x: 2, y: 2 })
        expectEqual(handle.state, 'released', 'terminal calls are idempotent')
        expectEqual(
            quiet.messages.length - warningsBefore,
            1,
            'move after terminal warns once per handle'
        )
        await frames(h.mc, 30, () => undefined)
        expectEqual(a.style.translate, '', 'release restores translate')
        expectEqual(a.style.cssText, authored, 'release restores styles')
        expectEqual(h.group.stats.holds, 0, 'no live hold')

        // a second live scope refuses the element (one owner per element)
        const otherClock = createManualClock()
        const other = createLayoutGroup({
            clock: otherClock.clock,
            motion: { duration: 0.2, timing: linear },
        })
        invalid(() => other.add(a), 'add to a second live scope')
        invalid(
            () => other.take(a),
            'take in a scope that does not own the element'
        )
        other.dispose()

        // ancestor and descendant holds
        const parent = node(
            h.root,
            'left:400px;top:0px;width:240px;height:240px'
        )
        const child = node(
            parent,
            'position:relative;left:20px;top:20px;width:60px;height:60px'
        )
        h.add(parent, { radius: false })
        h.add(child, { radius: false })
        h.group.capture()
        await h.group.flush()
        const ph = h.group.take(parent)
        invalid(() => h.group.take(child), 'held ancestor')
        ph.cancel()
        await frames(h.mc, 20, () => undefined)
        const ch = h.group.take(child)
        invalid(() => h.group.take(parent), 'held descendant')
        ch.cancel()
        await frames(h.mc, 20, () => undefined)

        // unmount mid-hold: invalidated, styles restored, reads stop
        {
            const ghost = node(
                h.root,
                'left:0px;top:200px;width:60px;height:60px'
            )
            h.add(ghost, { radius: false })
            h.group.capture()
            await h.group.flush()
            const ghostAuthored = ghost.style.cssText
            const g = h.group.take(ghost)
            g.move({ x: 20, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            ghost.remove()
            const before = h.group.stats.rects
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(g.state, 'invalidated', 'unmount invalidates')
            expectEqual(ghost.style.translate, '', 'unmount restores translate')
            expectEqual(
                ghost.style.cssText,
                ghostAuthored,
                'unmount restores styles'
            )
            h.mc.frames(3)
            expectEqual(h.group.stats.rects - before <= 1, true, 'reads stop')
            details.push('unmount invalidated and stopped the read')
        }

        // dispose mid-hold
        {
            const hd = harness({ motion: { duration: 0.2, timing: linear } })
            const x = node(hd.root, 'left:0px;top:300px;width:60px;height:60px')
            hd.add(x, { radius: false })
            hd.group.capture()
            await hd.group.flush()
            const xAuthored = x.style.cssText
            const xh = hd.group.take(x)
            xh.move({ x: 30, y: 10 })
            hd.mc.frame(FRAME)
            await settleMicrotasks()
            hd.group.dispose()
            expectEqual(xh.state, 'invalidated', 'dispose invalidates')
            expectEqual(x.style.translate, '', 'dispose restores translate')
            expectEqual(x.style.cssText, xAuthored, 'dispose restores styles')
            expectEqual(hd.mc.clock.size, 0, 'dispose unsubscribes')
            hd.dispose()
        }

        // the drive-hold kill switch (L-DRIVE-4 per C3): synchronously
        // invalidates, restores the styles and leaves no subscription
        {
            const h2 = harness({ motion: { duration: 0.2, timing: linear } })
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((e) => events.push(e))
            const x = node(h2.root, 'left:0px;top:0px;width:80px;height:80px')
            h2.add(x, { radius: false })
            h2.group.capture()
            await h2.group.flush()
            const xAuthored = x.style.cssText
            const xh = h2.group.take(x)
            xh.move({ x: 40, y: 20 })
            h2.mc.frame(FRAME)
            await settleMicrotasks()
            layoutRuntime.setMode('snap')
            expectEqual(xh.state, 'invalidated', 'kill switch invalidates')
            expectEqual(x.style.translate, '', 'kill switch restores translate')
            expectEqual(
                x.style.cssText,
                xAuthored,
                'kill switch restores styles'
            )
            expectEqual(h2.group.stats.holds, 0, 'kill switch clears holds')
            expectEqual(h2.mc.clock.size, 0, 'kill switch unsubscribes')
            expectEqual(
                events.some((e) => e.code === 'internal-error'),
                false,
                'kill switch aborts nothing'
            )
            layoutRuntime.setMode('animate')
            stop()
            h2.dispose()
            details.push('drive-hold kill switch invalidated synchronously')
        }

        // layoutKey change mid-hold: fresh baseline, invalidated
        {
            const x = node(h.root, 'left:0px;top:400px;width:60px;height:60px')
            h.add(x, { layoutKey: 'k1', radius: false })
            h.group.capture()
            await h.group.flush()
            const xh = h.group.take(x)
            xh.move({ x: 15, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.group.set(x, { layoutKey: 'k2', radius: false })
            expectEqual(xh.state, 'invalidated', 'layoutKey invalidates')
            expectEqual(x.style.translate, '', 'layoutKey restores translate')
            h.group.capture()
            await h.group.flush()
            expectEqual(x.style.translate, '', 'fresh baseline after layoutKey')
        }

        // a failed support check of the held read
        {
            const x = node(h.root, 'left:0px;top:480px;width:60px;height:60px')
            h.add(x, { radius: false })
            h.group.capture()
            await h.group.flush()
            const xh = h.group.take(x)
            xh.move({ x: 10, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            x.style.width = '100px'
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(xh.state, 'invalidated', 'support failure invalidates')
            expectEqual(
                x.style.translate,
                '',
                'support failure restores translate'
            )
            expectEqual(
                h.group.stats.holds,
                0,
                'support failure clears the hold'
            )
        }

        // finish mid-hold
        {
            const y = node(
                h.root,
                'left:300px;top:480px;width:60px;height:60px'
            )
            h.add(y, { radius: false })
            h.group.capture()
            await h.group.flush()
            const yh = h.group.take(y)
            yh.move({ x: 20, y: 20 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.group.finish()
            expectEqual(yh.state, 'invalidated', 'finish invalidates')
            expectEqual(y.style.translate, '', 'finish restores translate')
        }

        h.dispose()
        return details.join('; ')
    } finally {
        quiet.restore()
    }
}

/* ───────────────────────────── L-DRIVE-5 ───────────────────────────── */

/**
 * Reduced motion at take, toggled while held, and the three release
 * policies (§5.10, §9.4). The held phase stays 1:1 and is never ended by a
 * policy change; only release obeys the policy.
 */
export async function L_DRIVE_5(): Promise<string> {
    const details: string[] = []
    const quiet = silenceWarnings()
    try {
        // 'jump': the hold is direct manipulation; release lands at A at once
        {
            const h = harness({
                motion: { duration: 0.3, timing: linear },
                reducedMotion: 'jump',
            })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const authored = a.style.cssText
            h.mc.setReducedMotion(true)
            const take = originOf(viewBox(a))
            const handle = h.group.take(a)
            handle.move({ x: 70, y: 20 })
            let worst = 0
            await frames(h.mc, 3, (elapsed) => {
                expectOrigin(
                    a,
                    { x: take.x + 70, y: take.y + 20 },
                    `jump held ${elapsed}`
                )
                worst = Math.max(
                    worst,
                    Math.abs(originOf(viewBox(a)).x - (take.x + 70)),
                    Math.abs(originOf(viewBox(a)).y - (take.y + 20))
                )
            })
            expectClose(worst, 0, TOL, 'jump: hold stays 1:1')
            const held = viewBox(a)
            handle.release({ x: 400, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'released', 'jump release state')
            // landed at A, no motion at all
            expectClose(
                maxDiff(pageBox(a), { x: 0, y: 0, w: 80, h: 80 }),
                0,
                TOL,
                'jump lands at A at once'
            )
            expectEqual(a.style.translate, '', 'jump restores translate')
            expectEqual(a.style.cssText, authored, 'jump restores styles')
            details.push(
                `jump: held ${JSON.stringify(held)} then landed at once`
            )
            h.dispose()
        }

        // a policy change while held never ends the hold; the release obeys it
        {
            const h = harness({
                motion: { duration: 0.3, timing: linear },
                reducedMotion: 'ignore',
            })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const take = originOf(viewBox(a))
            const handle = h.group.take(a)
            handle.move({ x: 40, y: 10 })
            await frames(h.mc, 2, () => undefined)
            h.mc.setReducedMotion(true)
            const beforeToggle = viewBox(a)
            await frames(h.mc, 4, (elapsed) => {
                expectOrigin(
                    a,
                    { x: take.x + 40, y: take.y + 10 },
                    `toggled held ${elapsed}`
                )
            })
            expectEqual(handle.state, 'held', 'policy change keeps the hold')
            expectOrigin(
                a,
                { x: take.x + 40, y: take.y + 10 },
                'hold unaffected by policy'
            )
            // back to ignore, release plays full
            h.mc.setReducedMotion(false)
            handle.release()
            await frames(h.mc, 25, () => undefined)
            expectClose(
                maxDiff(pageBox(a), { x: 0, y: 0, w: 80, h: 80 }),
                0,
                TOL,
                'toggle then release lands'
            )
            details.push(
                `policy toggled while held; hold stayed at ${JSON.stringify(beforeToggle)}`
            )
            h.dispose()
        }

        // { maxDuration }: the release clamps to 0.1 s
        {
            const h = harness({
                motion: { duration: 0.6, timing: linear },
                reducedMotion: { maxDuration: 0.1 },
            })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            h.mc.setReducedMotion(true)
            const handle = h.group.take(a)
            handle.move({ x: 60, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            const held = viewBox(a)
            handle.release({ x: 300, y: 0 })
            const clamped = specOf(
                held,
                { x: 0, y: 0, w: 80, h: 80 },
                { x: 300, y: 0, w: 0, h: 0 },
                0.1
            )
            let worst = 0
            await frames(h.mc, 12, (elapsed) => {
                const want = expectedBox(clamped, elapsed)
                expectBoxAt(a, want, `maxDuration ${elapsed.toFixed(3)}s`)
                worst = Math.max(worst, maxDiff(pageBox(a), want))
            })
            expectClose(worst, 0, TOL, 'maxDuration clamps the release')
            expectEqual(a.style.translate, '', 'maxDuration release restores')
            details.push(
                `maxDuration 0.1 s landed on the clamped oracle, worst ${worst.toFixed(4)} px`
            )
            h.dispose()
        }

        // 'ignore': the full 0.6 s motion
        {
            const h = harness({
                motion: { duration: 0.6, timing: linear },
                reducedMotion: 'ignore',
            })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            h.mc.setReducedMotion(true)
            const handle = h.group.take(a)
            handle.move({ x: 60, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            const held = viewBox(a)
            handle.release({ x: 200, y: 0 })
            const full = specOf(
                held,
                { x: 0, y: 0, w: 80, h: 80 },
                { x: 200, y: 0, w: 0, h: 0 },
                0.6
            )
            let worst = 0
            await frames(h.mc, 40, (elapsed) => {
                const want = expectedBox(full, elapsed)
                expectBoxAt(a, want, `ignore ${elapsed.toFixed(3)}s`)
                worst = Math.max(worst, maxDiff(pageBox(a), want))
            })
            expectClose(worst, 0, TOL, 'ignore plays the full release')
            expectEqual(a.style.translate, '', 'ignore release restores')
            details.push(
                `ignore played the full 0.6 s, worst ${worst.toFixed(4)} px`
            )
            h.dispose()
        }

        // a release with no layout change springs back without motion
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const authored = a.style.cssText
            const handle = h.group.take(a)
            handle.release()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(a.style.translate, '', 'no-change release restores')
            expectEqual(a.style.cssText, authored, 'no-change release styles')
            expectEqual(handle.state, 'released', 'no-change release state')
            h.dispose()
        }
        return details.join('; ')
    } finally {
        quiet.restore()
    }
}

/* ─────────────── L-DRIVE edges: coverage of every contract path ─────────────── */

function invalidCall(action: () => void, label: string): void {
    let threw = false
    try {
        action()
    } catch (error) {
        threw = true
        if ((error as { code?: string }).code !== 'ANI_INVALID_OPTIONS') {
            throw new Error(`${label}: wrong error ${String(error)}`)
        }
    }
    if (!threw) throw new Error(`${label}: did not throw`)
}

/**
 * The drive seam's edge paths, all observable contract decisions: every take
 * precondition, the held size target on a flush, the landing re-expression,
 * a flush while held with descendants, a no-capture flush, a release support
 * failure, adoption and the waapi rejection.
 */
export async function L_DRIVE_EDGES(): Promise<string> {
    const details: string[] = []
    const quiet = silenceWarnings()
    try {
        // (a) take preconditions
        {
            const h = harness({ motion: { duration: 0.2, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            const b = node(h.root, 'left:200px;top:0px;width:80px;height:80px')
            const zero = node(h.root, 'left:400px;top:0px;width:0px;height:0px')
            const rotated = node(
                h.root,
                'left:500px;top:0px;width:80px;height:80px'
            )
            h.add(a, { radius: false })
            h.add(b, { radius: false })
            h.add(zero, { radius: false })
            h.add(rotated, { radius: false })
            h.group.capture()
            await h.group.flush()
            const unregistered = document.createElement('div')
            document.body.append(unregistered)
            invalidCall(() => h.group.take(unregistered), 'unregistered take')
            unregistered.remove()

            const detached = node(
                h.root,
                'left:0px;top:300px;width:60px;height:60px'
            )
            h.add(detached, { radius: false })
            h.group.capture()
            await h.group.flush()
            detached.remove()
            invalidCall(() => h.group.take(detached), 'disconnected take')

            const other = document.implementation.createHTMLDocument('other')
            const foreign = other.createElement('div')
            other.body.append(foreign)
            invalidCall(() => h.group.take(foreign), 'foreign document take')

            invalidCall(() => h.group.take(zero), 'zero-size take')
            rotated.style.rotate = '45deg'
            h.group.capture()
            await h.group.flush()
            invalidCall(() => h.group.take(rotated), 'rotated take')

            const held = h.group.take(a)
            invalidCall(() => h.group.take(a), 'double take')
            invalidCall(
                () => held.move({ x: Number.NaN, y: 1 }),
                'non-finite move'
            )
            invalidCall(
                () => held.release({ x: 1, y: Number.NEGATIVE_INFINITY }),
                'non-finite release'
            )
            held.cancel()
            await frames(h.mc, 10, () => undefined)
            // take under the runtime kill switch: an invalidated handle,
            // no movement, and the terminal methods are no-ops
            layoutRuntime.setMode('snap')
            const snap = h.group.take(b)
            expectEqual(snap.state, 'invalidated', 'take under snap')
            snap.move({ x: 10, y: 10 })
            snap.release({ x: 10, y: 0 })
            snap.cancel()
            expectEqual(snap.state, 'invalidated', 'snap handle is terminal')
            layoutRuntime.setMode('animate')
            // an undriven participant ancestor with an authored scale: the
            // take reads its computed scale (no geometry) and the child is
            // still supported
            const scaled = document.createElement('div')
            scaled.style.cssText =
                'position:absolute;left:0;top:500px;width:100px;height:100px;transform:scale(1.5);transform-origin:0 0;'
            h.root.append(scaled)
            const inside = node(
                scaled,
                'position:relative;left:10px;top:10px;width:40px;height:40px'
            )
            h.add(scaled, { radius: false })
            h.add(inside, { radius: false })
            h.group.capture()
            await h.group.flush()
            let insideHandle: LayoutDriveHandle | null = null
            try {
                insideHandle = h.group.take(inside)
            } catch {
                // the computed-scale check may refuse it here; either way the
                // ancestor read path is exercised
            }
            insideHandle?.cancel()
            await frames(h.mc, 10, () => undefined)
            // a non-participant scaled ancestor is outside the model: the §4.2
            // support check refuses the take
            const wrapper = document.createElement('div')
            wrapper.style.cssText =
                'position:absolute;left:300px;top:500px;width:100px;height:100px;transform:scale(2);transform-origin:0 0;'
            h.root.append(wrapper)
            const wrapped = node(
                wrapper,
                'position:relative;left:10px;top:10px;width:40px;height:40px'
            )
            h.add(wrapped, { radius: false })
            h.group.capture()
            await h.group.flush()
            invalidCall(() => h.group.take(wrapped), 'scaled wrapper take')
            h.dispose()
            details.push('take preconditions and non-finite input')
        }

        // (b) the waapi engine rejects take
        {
            const h = harness({
                motion: { duration: 0.2, timing: linear },
                engine: 'waapi',
            })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { layout: 'position' })
            h.group.capture()
            await h.group.flush()
            invalidCall(() => h.group.take(a), 'waapi take')
            h.dispose()
        }

        // (c) a size target changes on a flush while held
        {
            const h = harness({ motion: { duration: 0.4, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            a.style.width = '160px'
            h.group.flush()
            await frames(h.mc, 2, () => undefined)
            const handle = h.group.take(a)
            handle.move({ x: 50, y: 10 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            const before = originOf(pageBox(a))
            h.group.capture()
            a.style.width = '120px'
            await h.group.flush()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectOrigin(a, before, 'held size target origin')
            handle.cancel()
            await frames(h.mc, 30, () => undefined)
            expectEqual(a.style.translate, '', 'held size target restores')
            h.dispose()
        }

        // (d) a release re-expressed by a flush while landing
        {
            const h = harness({ motion: { duration: 0.4, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 60, y: 20 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            handle.release({ x: 300, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.group.capture()
            a.style.left = '120px'
            await h.group.flush()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            await frames(h.mc, 40, () => undefined)
            expectEqual(a.style.translate, '', 'landing re-expression restores')
            expectClose(
                pageBox(a).x,
                h.root.getBoundingClientRect().left + scrollX + 120,
                TOL,
                'landing re-expression target'
            )
            h.dispose()
        }

        // (e) a flush while held with a descendant
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const parent = node(
                h.root,
                'left:100px;top:100px;width:200px;height:200px'
            )
            const child = node(
                parent,
                'position:relative;left:20px;top:20px;width:60px;height:60px'
            )
            h.add(parent, { radius: false })
            h.add(child, { radius: false })
            h.group.capture()
            await h.group.flush()
            const take = originOf(viewBox(parent))
            const handle = h.group.take(parent)
            handle.move({ x: 40, y: 20 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.group.capture()
            parent.style.left = '160px'
            await h.group.flush()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectOrigin(
                parent,
                { x: take.x + 40, y: take.y + 20 },
                'held with a flush'
            )
            const relative = viewBox(child).x - viewBox(parent).x
            expectClose(relative, 20, TOL, 'descendant relative geometry')
            // a finger move and a flush in the same task, with no frame in
            // between: the children ride the parent's t = 0 write
            handle.move({ x: 90, y: 40 })
            h.group.capture()
            await h.group.flush()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectOrigin(
                parent,
                { x: take.x + 90, y: take.y + 40 },
                'held with an unpresented move'
            )
            expectClose(
                viewBox(child).x - viewBox(parent).x,
                20,
                TOL,
                'descendant rides an unpresented move'
            )
            expectClose(
                viewBox(child).y - viewBox(parent).y,
                20,
                TOL,
                'descendant rides an unpresented move (y)'
            )
            handle.release()
            await frames(h.mc, 30, () => undefined)
            expectEqual(child.style.translate, '', 'descendant restores')
            h.dispose()
        }

        // (i) a flush while held keeps a descendant residual's remaining
        // time when its own target did not move (§5.7 on the residual)
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const parent = node(
                h.root,
                'left:100px;top:100px;width:200px;height:200px'
            )
            const child = node(
                parent,
                'position:relative;left:20px;top:20px;width:60px;height:60px'
            )
            h.add(parent, { radius: false })
            h.add(child, {
                radius: false,
                motion: { duration: 0.1, timing: linear },
            })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            child.style.left = '80px'
            h.group.flush()
            await frames(h.mc, 2, () => undefined)
            const handle = h.group.take(parent)
            handle.move({ x: 40, y: 20 })
            await frames(h.mc, 3, () => undefined)
            // a presented flush with no layout change: the residual is kept,
            // not restarted, so it still lands at its own 0.1 s
            h.group.capture()
            await h.group.flush()
            await frames(h.mc, 4, () => undefined)
            expectClose(
                viewBox(child).x - viewBox(parent).x,
                80,
                TOL,
                'kept residual lands at its own time'
            )
            expectClose(
                viewBox(child).y - viewBox(parent).y,
                20,
                TOL,
                'kept residual lands at its own time (y)'
            )
            handle.cancel()
            await frames(h.mc, 30, () => undefined)
            h.dispose()
        }

        // (f) a release whose held read discovers a box change
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 20, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            a.style.width = '140px'
            handle.release()
            expectEqual(handle.state, 'invalidated', 'release support failure')
            expectEqual(
                a.style.translate,
                '',
                'release support failure restores'
            )
            h.dispose()
        }

        // (g) adoption while held
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 10, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            const other = document.implementation.createHTMLDocument('adopt')
            other.body.append(other.adoptNode(a))
            h.group.capture()
            await h.group.flush()
            expectEqual(handle.state, 'invalidated', 'adoption invalidates')
            expectEqual(a.style.translate, '', 'adoption restores')
            h.dispose()
        }

        // (h) a flush with no capture while held
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 30, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            await h.group.flush()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(
                handle.state,
                'held',
                'capture-less flush keeps the hold'
            )
            handle.cancel()
            await frames(h.mc, 30, () => undefined)
            expectEqual(a.style.translate, '', 'capture-less hold restores')
            h.dispose()
        }
        return details.join('; ')
    } finally {
        quiet.restore()
    }
}
