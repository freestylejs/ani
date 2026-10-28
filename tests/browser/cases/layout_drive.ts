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
import {
    clearLayoutFaults,
    injectLayoutFault,
} from '../../../packages/layout/src/fault'
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
        // P4-C3: a released landing is still a live hold until it finishes
        expectEqual(h.group.stats.holds, 1, 'landing is a live hold')
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
        expectEqual(h.group.stats.holds, 0, 'landing finished, no live hold')

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
        const releaseOrigin = originOf(released)
        const releaseTarget = { x: 300, y: 120, w: 160, h: 80 }
        const releaseSpec = specOf(
            released,
            releaseTarget,
            { x: 200, y: 0, w: 0, h: 0 },
            0.6
        )
        const releaseOracle = (t: number) =>
            originOf(expectedBox(releaseSpec, t))
        handle.release({ x: 200, y: 0 })
        let alongWorst = 0
        let originWorst = 0
        let firstV = 0
        let previous = releaseOrigin
        await frames(h.mc, 40, (_elapsed, index) => {
            // H13-15R: the release origin follows its own independent oracle
            // for several frames; the caught take velocity (≈566 px/s) is not
            // added to the supplied 200 px/s
            if (index === 0) {
                expectOrigin(a, releaseOrigin, 'caught-card release origin')
            }
            const wantOrigin = releaseOracle(index * DT)
            if (index > 0 && index <= 5) {
                const now = originOf(pageBox(a))
                originWorst = Math.max(
                    originWorst,
                    Math.abs(now.x - wantOrigin.x),
                    Math.abs(now.y - wantOrigin.y)
                )
                firstV = (now.x - previous.x) / DT
                previous = now
            }
            if (index === 1) {
                expectClose(firstV, 200, 20, 'release velocity enters once')
                expectEqual(
                    firstV < 400,
                    true,
                    'take velocity is not added to the release origin'
                )
            }
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
        expectClose(originWorst, 0, TOL, 'release origin on the oracle')
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
            // P4-C10: the child is driven while the ancestor scale is live
            h.group.capture()
            child.style.width = '80px'
            h.group.flush()
            await frames(h.mc, 2, () => undefined)
            const takeBox = viewBox(child)
            const take = originOf(takeBox)
            const handle = h.group.take(child)
            expectEqual(handle.state, 'held', 'driven child under live scale')
            expectEqual(
                Math.abs(handle.velocity.x) > 0.01,
                true,
                'driven child take carries ancestor velocity'
            )
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
        // (d) P4-C11: a sticky ancestor, not only the held element itself
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const scroller = document.createElement('div')
            scroller.style.cssText =
                'position:absolute;left:0;top:0;width:400px;height:300px;overflow:auto;'
            const tall = document.createElement('div')
            tall.style.cssText = 'position:relative;width:400px;height:2000px;'
            scroller.append(tall)
            h.root.append(scroller)
            const sticky = document.createElement('div')
            sticky.style.cssText =
                'position:sticky;top:0;width:200px;height:100px;'
            tall.append(sticky)
            const a = node(
                sticky,
                'position:relative;left:40px;top:20px;width:80px;height:80px'
            )
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const takeBox = viewBox(a)
            const take = originOf(takeBox)
            const handle = h.group.take(a)
            handle.move({ x: 20, y: 10 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            let worst = 0
            for (let index = 0; index < 10; index++) {
                scroller.scrollTop = index * 50
                h.mc.frame(FRAME)
                await settleMicrotasks()
                worst = Math.max(
                    worst,
                    Math.abs(originOf(viewBox(a)).x - (take.x + 20)),
                    Math.abs(originOf(viewBox(a)).y - (take.y + 10))
                )
            }
            expectClose(worst, 0, TOL, 'held under a sticky ancestor')
            details.push(`sticky ancestor H error ≤ ${worst.toFixed(4)} px`)
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
            const snaps: { element: HTMLElement; reason: string }[] = []
            const h2 = harness({
                motion: { duration: 0.2, timing: linear },
                onSnap: (element, reason) => snaps.push({ element, reason }),
            })
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
                events.some(
                    (e) =>
                        e.code === 'runtime-disabled' &&
                        e.element === x &&
                        e.action === 'snap'
                ),
                true,
                'static hold kill switch reports runtime-disabled'
            )
            expectEqual(
                snaps.some(
                    (entry) =>
                        entry.element === x && entry.reason === 'disabled'
                ),
                true,
                'static hold kill switch calls onSnap'
            )
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
            // an unsupported map, not a supported layout resize: a rotation
            x.style.rotate = '45deg'
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

        // H13-25: a nonzero velocity with no layout change springs back
        {
            const h = harness({
                motion: { type: 'spring', duration: 0.3, bounce: 0 },
            })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.release({ x: 300, y: 0 })
            await frames(h.mc, 2, () => undefined)
            expectEqual(
                a.style.translate !== '',
                true,
                'no-offset release moves'
            )
            await frames(h.mc, 45, () => undefined)
            expectEqual(a.style.translate, '', 'no-offset spring-back restores')
            expectEqual(a.style.scale, '', 'no-offset spring-back scale')
            details.push('nonzero no-layout-change release sprang back')
            h.dispose()
        }
        // H13-13: an effective policy change while held applies at release
        {
            const h = harness({
                motion: { duration: 0.3, timing: linear },
                reducedMotion: 'jump',
            })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const take = originOf(viewBox(a))
            const handle = h.group.take(a)
            handle.move({ x: 40, y: 10 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.mc.setReducedMotion(true) // jump policy now effective
            await frames(h.mc, 3, () => {
                expectOrigin(
                    a,
                    { x: take.x + 40, y: take.y + 10 },
                    'changed policy hold'
                )
            })
            expectEqual(handle.state, 'held', 'effective policy keeps the hold')
            handle.release({ x: 200, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(
                handle.state,
                'released',
                'changed policy release state'
            )
            expectClose(
                maxDiff(pageBox(a), { x: 0, y: 0, w: 80, h: 80 }),
                0,
                TOL,
                'changed policy release jumps to A'
            )
            expectEqual(
                a.style.translate,
                '',
                'changed policy release restores'
            )
            details.push('effective jump policy applied at release')
            h.dispose()
        }

        // H13-10/P4-C8: a reduced no-fit release is a released jump, not
        // invalidation; a spring settle refusal emits spring-timeout and snaps
        {
            const h = harness({
                motion: { type: 'spring', duration: 0.5, bounce: 0 },
                reducedMotion: { maxDuration: 0.001 },
            })
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((e) => events.push(e))
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            h.mc.setReducedMotion(true)
            const handle = h.group.take(a)
            handle.move({ x: 40, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            handle.release({ x: 200, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'released', 'reduced no-fit is released')
            expectClose(
                maxDiff(pageBox(a), { x: 0, y: 0, w: 80, h: 80 }),
                0,
                TOL,
                'reduced no-fit jumps to A'
            )
            expectEqual(a.style.translate, '', 'reduced no-fit restores')
            expectEqual(
                events.some((e) => e.code === 'spring-timeout'),
                false,
                'reduced no-fit is not a spring timeout'
            )
            expectEqual(
                events.some(
                    (e) => e.code === 'reduced-no-fit' && e.element === a
                ),
                true,
                'reduced no-fit diagnostic'
            )
            stop()
            h.dispose()
            details.push('reduced no-fit mapped to released + jump')
        }
        {
            const h = harness({
                motion: { type: 'spring', duration: 10, bounce: 0.99 },
            })
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((e) => events.push(e))
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 30, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            handle.release({ x: 200, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'released', 'spring refusal released')
            expectEqual(
                events.some((e) => e.code === 'spring-timeout'),
                true,
                'spring refusal emits spring-timeout'
            )
            expectEqual(a.style.translate, '', 'spring refusal restores')
            stop()
            h.dispose()
            details.push('spring refusal emitted spring-timeout and snapped')
        }

        // H13-10R/P4-C8: under 'jump', a flush while held settles a stale
        // descendant residual at its A; the child keeps riding h and lands
        // with the parent
        {
            const h = harness({
                motion: { duration: 0.3, timing: linear },
            })
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
                motion: { duration: 0.2, timing: linear },
            })
            h.group.capture()
            await h.group.flush()
            // a live child residual before the take
            h.group.capture()
            child.style.left = '80px'
            h.group.flush()
            await frames(h.mc, 2, () => undefined)
            const handle = h.group.take(parent)
            handle.move({ x: 40, y: 20 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.mc.setReducedMotion(true) // effective jump while held
            h.group.capture()
            await h.group.flush()
            // the flush's t = 0 write is already at the child's A + h
            const rel = viewBox(child).x - viewBox(parent).x
            expectClose(rel, 80, 1, 'jump flush settles the residual at A')
            await frames(h.mc, 4, (elapsed) => {
                expectClose(
                    viewBox(child).x - viewBox(parent).x,
                    80,
                    1,
                    `jump held child stays at A + h (${elapsed.toFixed(3)}s)`
                )
            })
            handle.release({ x: 100, y: 0 })
            await frames(h.mc, 30, () => undefined)
            expectEqual(handle.state, 'released', 'jump descendant release')
            expectEqual(h.mc.pending, 0, 'jump descendant flush unsubscribes')
            expectEqual(h.group.stats.holds, 0, 'jump descendant hold finished')
            expectEqual(parent.style.translate, '', 'jump parent restores')
            expectEqual(child.style.translate, '', 'jump child restores')
            expectClose(
                viewBox(child).x - viewBox(parent).x,
                80,
                1,
                'jump landed child at its layout offset'
            )
            details.push('jump flush settled the descendant residual at A')
            h.dispose()
        }

        // H13-10: a policy change while landing applies at the next flush
        {
            const h = harness({
                motion: { duration: 0.5, timing: linear },
                reducedMotion: 'jump',
            })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 50, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.mc.setReducedMotion(false)
            handle.release({ x: 200, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.mc.setReducedMotion(true) // jump while landing
            h.group.capture()
            await h.group.flush()
            expectEqual(handle.state, 'released', 'landing policy change state')
            expectClose(
                maxDiff(pageBox(a), { x: 0, y: 0, w: 80, h: 80 }),
                0,
                TOL,
                'landing policy change lands at A'
            )
            expectEqual(a.style.translate, '', 'landing policy change restores')
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(h.mc.pending, 0, 'landing policy change unsubscribes')
            details.push('landing policy change finished at A')
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
            const insideHandle: LayoutDriveHandle = h.group.take(inside)
            expectEqual(
                insideHandle.state,
                'held',
                'supported undriven ancestor scale take'
            )
            insideHandle.cancel()
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
            a.style.rotate = '45deg'
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

        // H13-11: a running owned CSS animation in a held *descendant* is
        // caught by the animated-owned probe and invalidates the ancestor
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const style = document.createElement('style')
            style.textContent =
                '@keyframes held-desc { from { translate: 0 0 } to { translate: 10px 0 } }'
            document.head.append(style)
            const parent = node(
                h.root,
                'left:0px;top:0px;width:200px;height:200px'
            )
            const child = node(
                parent,
                'position:relative;left:20px;top:20px;width:60px;height:60px'
            )
            h.add(parent, { radius: false })
            h.add(child, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(parent)
            handle.move({ x: 20, y: 10 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'held', 'descendant probe starts held')
            child.style.animation = 'held-desc 1s linear infinite'
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(
                handle.state,
                'invalidated',
                'descendant animated probe invalidates'
            )
            expectEqual(h.group.stats.holds, 0, 'descendant probe clears holds')
            expectEqual(parent.style.translate, '', 'descendant probe restores')
            child.style.animation = ''
            style.remove()
            h.dispose()
            details.push('descendant animated-owned probe')
        }

        // H13-16: an injected write fault during a live hold aborts the
        // transaction, restores byte-identically and leaves nothing running
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((e) => events.push(e))
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const authored = a.style.cssText
            const handle = h.group.take(a)
            handle.move({ x: 40, y: 20 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            injectLayoutFault('write', new Error('held write fault'))
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'invalidated', 'write fault invalidates')
            expectEqual(
                a.style.cssText,
                authored,
                'write fault restores styles'
            )
            expectEqual(h.group.stats.holds, 0, 'write fault clears holds')
            expectEqual(
                events.some((e) => e.code === 'internal-error'),
                true,
                'write fault reports internal-error'
            )
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(h.mc.pending, 0, 'write fault unsubscribes')
            expectEqual(h.mc.clock.size, 0, 'write fault clock cleanup')
            expectEqual(h.mc.pending, 0, 'write fault marker cleanup')
            stop()
            h.dispose()
        }
        // a measure fault during the flush that owns the held read
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((e) => events.push(e))
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const authored = a.style.cssText
            const handle = h.group.take(a)
            handle.move({ x: 20, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            injectLayoutFault('measure', new Error('held measure fault'))
            h.group.capture()
            await h.group.flush()
            expectEqual(
                handle.state,
                'invalidated',
                'measure fault invalidates'
            )
            expectEqual(a.style.cssText, authored, 'measure fault restores')
            expectEqual(h.group.stats.holds, 0, 'measure fault clears holds')
            expectEqual(
                events.some((e) => e.code === 'internal-error'),
                true,
                'measure fault reports internal-error'
            )
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(h.mc.pending, 0, 'measure fault marker cleanup')
            expectEqual(h.mc.clock.size, 0, 'measure fault clock cleanup')
            // the scope is usable again: a fresh capture/flush does not abort
            h.group.capture()
            const afterFault = await h.group.flush()
            expectEqual(
                afterFault.status,
                'no-change',
                'measure fault recovers'
            )
            stop()
            clearLayoutFaults()
            h.dispose()
        }

        // H13-16: an abort disarms the scroll listeners and the clock, not
        // only the marker and the writes
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false, layoutId: 'fault-listener' })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 20, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            const originalRemove = document.removeEventListener
            let removed = 0
            document.removeEventListener = function (
                this: Document,
                ...args: Parameters<Document['removeEventListener']>
            ) {
                removed += 1
                return originalRemove.apply(this, args)
            }
            try {
                injectLayoutFault('measure', new Error('listener fault'))
                h.group.capture()
                await h.group.flush()
            } finally {
                document.removeEventListener = originalRemove
                clearLayoutFaults()
            }
            expectEqual(
                handle.state,
                'invalidated',
                'listener fault invalidates'
            )
            expectEqual(
                removed > 0,
                true,
                'listener fault disarms scroll listeners'
            )
            expectEqual(h.mc.clock.size, 0, 'listener fault clock cleanup')
            h.dispose()
            details.push('fault-related listener cleanup')
        }
        // coverage: a refused held size track snaps the size and keeps the
        // hold (spring-timeout), rather than leaving a stale continuation
        {
            const h = harness({
                motion: { type: 'spring', duration: 10, bounce: 0.99 },
            })
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((e) => events.push(e))
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 20, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.group.capture()
            a.style.width = '120px'
            await h.group.flush()
            expectEqual(handle.state, 'held', 'size refusal keeps the hold')
            expectEqual(
                events.some((e) => e.code === 'spring-timeout'),
                true,
                'size refusal reports spring-timeout'
            )
            handle.cancel()
            await frames(h.mc, 30, () => undefined)
            expectEqual(h.mc.clock.size, 0, 'size refusal unsubscribes')
            stop()
            h.dispose()
            details.push('refused size track snapped and kept the hold')
        }

        // H13-11/P4-C7: a running owned CSS animation is refused at take and
        // invalidates a live hold through the animated-owned probe
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const style = document.createElement('style')
            style.textContent =
                '@keyframes held-owned { from { scale: 1 } to { scale: 2 } }'
            document.head.append(style)
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            const b = node(h.root, 'left:200px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.add(b, { radius: false })
            h.group.capture()
            await h.group.flush()
            a.style.animation = 'held-owned 1s linear infinite'
            h.mc.frame(FRAME)
            await settleMicrotasks()
            invalidCall(() => h.group.take(a), 'animated take')
            const handle = h.group.take(b)
            h.mc.frame(FRAME)
            await settleMicrotasks()
            b.style.animation = 'held-owned 1s linear infinite'
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(
                handle.state,
                'invalidated',
                'animated hold invalidates'
            )
            expectEqual(
                h.group.stats.holds,
                0,
                'animated hold is no longer live'
            )
            expectEqual(b.style.translate, '', 'animated hold restores')
            b.style.animation = ''
            a.style.animation = ''
            style.remove()
            h.dispose()
            details.push('animated-owned take/hold refusal')
        }

        // coverage/edge: pinned size, no-B landing re-expression, re-take with
        // a descendant, and the take support error branches
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false, layout: 'position' })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 20, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.group.capture()
            a.style.width = '140px'
            await h.group.flush()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'held', 'pinned size keeps the hold')
            handle.release()
            await frames(h.mc, 30, () => undefined)
            expectEqual(h.mc.pending, 0, 'pinned size unsubscribes')
            h.dispose()
        }
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 40, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            handle.release({ x: 100, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            a.style.left = '160px' // unpresented A origin move
            await h.group.flush() // no capture: the no-B landing re-expression
            await frames(h.mc, 40, () => undefined)
            expectEqual(handle.state, 'released', 'no-B landing state')
            expectEqual(a.style.translate, '', 'no-B landing restores')
            expectEqual(h.mc.pending, 0, 'no-B landing unsubscribes')
            h.dispose()
        }
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
            const first = h.group.take(parent)
            first.move({ x: 40, y: 20 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            first.release({ x: 100, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            const second = h.group.take(parent)
            expectEqual(first.state, 'invalidated', 're-take with child old')
            expectEqual(second.state, 'held', 're-take with child new')
            second.cancel()
            await frames(h.mc, 30, () => undefined)
            h.dispose()
        }
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const parent = node(
                h.root,
                'left:0px;top:0px;width:200px;height:200px'
            )
            parent.style.rotate = '45deg'
            const child = node(
                parent,
                'position:relative;left:20px;top:20px;width:60px;height:60px'
            )
            h.add(parent, { radius: false })
            h.add(child, { radius: false })
            h.group.capture()
            await h.group.flush()
            invalidCall(() => h.group.take(child), 'rotated ancestor take')
            parent.style.rotate = ''
            child.style.scale = '0'
            invalidCall(() => h.group.take(child), 'zero-scale take')
            h.dispose()
        }

        // coverage: the support-check verification readers (inner scale and
        // exact degenerate size) on take and on the held read
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const wrapper = document.createElement('div')
            wrapper.style.cssText =
                'position:absolute;left:0;top:0;width:100px;height:100px;transform:scale(2);transform-origin:0 0;'
            const hairline = node(
                wrapper,
                'position:relative;left:0;top:0;width:1px;height:40px'
            )
            h.root.append(wrapper)
            h.add(hairline, { radius: false })
            h.group.capture()
            await h.group.flush()
            invalidCall(() => h.group.take(hairline), 'degenerate scaled take')
            h.dispose()
        }
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const wrapper = document.createElement('div')
            wrapper.style.cssText =
                'position:absolute;left:0;top:0;width:200px;height:200px;'
            const a = node(
                wrapper,
                'position:relative;left:20px;top:20px;width:80px;height:80px'
            )
            h.root.append(wrapper)
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'held', 'held before the wrapper scale')
            wrapper.style.transform = 'scale(2)'
            wrapper.style.transformOrigin = '0 0'
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'invalidated', 'scaled wrapper held read')
            h.dispose()
        }
        return details.join('; ')
    } finally {
        quiet.restore()
    }
}

/* ─────────────────── H13 fix rows (S1/S2) ─────────────────── */

/**
 * The corrective P4 rows: cancel keeps descendants riding, one hold size
 * tolerance, a landing + size flush, landing re-take, a supported
 * sub-threshold/supported re-layout, the mover cap with holds, and a
 * cross-scope nested hold.
 */
export async function L_DRIVE_FIX(): Promise<string> {
    const details: string[] = []
    const quiet = silenceWarnings()
    try {
        // H13-01: cancel keeps the shared h until it settles
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
            const handle = h.group.take(parent)
            handle.move({ x: 60, y: 30 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            const relative = {
                x: viewBox(child).x - viewBox(parent).x,
                y: viewBox(child).y - viewBox(parent).y,
            }
            handle.cancel()
            expectEqual(handle.state, 'cancelled', 'cancel terminal')
            let worst = 0
            await frames(h.mc, 4, () => {
                worst = Math.max(
                    worst,
                    Math.abs(viewBox(child).x - viewBox(parent).x - relative.x),
                    Math.abs(viewBox(child).y - viewBox(parent).y - relative.y)
                )
            })
            expectClose(worst, 0, TOL, 'cancel keeps descendants riding h')
            await frames(h.mc, 30, () => undefined)
            expectEqual(h.mc.pending, 0, 'cancel settles and unsubscribes')
            expectEqual(h.group.stats.holds, 0, 'cancel finished')
            expectEqual(parent.style.translate, '', 'cancel restores parent')
            details.push(`cancel child offset ≤ ${worst.toFixed(4)} px`)
            h.dispose()
        }

        // H13-02: one hold size tolerance for 0.4, 0.5 and 1.5 px
        for (const delta of [0.4, 0.5, 1.5]) {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 40, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            a.style.width = `${80 + delta}px`
            h.group.capture()
            await h.group.flush()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(
                handle.state,
                'held',
                `supported ${delta} px re-layout keeps the hold`
            )
            handle.release()
            let beforeFinish = 0
            await frames(h.mc, 24, (_elapsed, index) => {
                if (index === 17) beforeFinish = pageBox(a).w
            })
            expectEqual(
                handle.state,
                'released',
                `delta ${delta}: released, not invalidated`
            )
            // H13-02R: just before the landing finishes, the drawn width is
            // the re-laid-out A, not the old 80 px box
            expectClose(
                beforeFinish,
                80 + delta,
                0.2,
                `delta ${delta}: landing width on the new A`
            )
            expectEqual(h.mc.pending, 0, `delta ${delta}: clock unsubscribed`)
            expectEqual(h.group.stats.holds, 0, `delta ${delta}: hold finished`)
            expectEqual(
                a.style.translate,
                '',
                `delta ${delta}: translate restored`
            )
            expectEqual(a.style.scale, '', `delta ${delta}: scale restored`)
            // H13-02R: the release target was the re-laid-out A, so the
            // final box is the new layout box (size and position)
            expectClose(
                maxDiff(pageBox(a), { x: 0, y: 0, w: 80 + delta, h: 80 }),
                0,
                TOL,
                `delta ${delta}: final layout box`
            )
            h.dispose()
            details.push(`size ${delta} px tolerated and settled`)
        }

        // H13-03: a flush during the landing with a size change must not
        // replay the release origin or hang
        {
            const h = harness({ motion: { duration: 0.5, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 60, y: 20 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            const heldBox = pageBox(a)
            handle.release({ x: 240, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            // H13-15: the first release update is the held box (dt = 0)
            expectClose(
                maxDiff(pageBox(a), heldBox),
                0,
                0.01,
                'landing first frame = held box'
            )
            const before = pageBox(a)
            h.group.capture()
            a.style.width = '84px'
            await h.group.flush()
            // the flush's t = 0 write must not replay the release origin
            const after = pageBox(a)
            expectClose(after.x, before.x, TOL, 'landing size flush origin x')
            expectClose(after.y, before.y, TOL, 'landing size flush origin y')
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'released', 'landing size flush state')
            await frames(h.mc, 45, () => undefined)
            expectEqual(h.mc.pending, 0, 'landing + size flush unsubscribes')
            expectEqual(h.group.stats.holds, 0, 'landing + size flush finishes')
            expectEqual(a.style.translate, '', 'landing + size restores')
            details.push('landing + size flush kept the origin and finished')
            h.dispose()
        }

        // H13-05/P4-C1: re-take a landing at its current drawn box
        {
            const h = harness({ motion: { duration: 0.4, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const first = h.group.take(a)
            first.move({ x: 60, y: 20 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            first.release({ x: 300, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            const current = pageBox(a)
            const second = h.group.take(a)
            expectEqual(first.state, 'invalidated', 'old landing invalidated')
            expectEqual(second.state, 'held', 'new hold starts')
            expectEqual(h.group.stats.holds, 1, 'one live hold after re-take')
            // H13-05R2: the new hold's t = 0 pose is written in the same
            // task, so an immediate read is B (the drawn box at the take),
            // not the restored layout A
            expectClose(
                maxDiff(pageBox(a), current),
                0,
                TOL,
                're-take writes B in the same task'
            )
            const before = current
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectClose(pageBox(a).x, before.x, TOL, 're-take keeps x')
            expectClose(pageBox(a).y, before.y, TOL, 're-take keeps y')
            second.cancel()
            await frames(h.mc, 40, () => undefined)
            expectEqual(h.mc.pending, 0, 're-take release unsubscribes')
            expectEqual(a.style.translate, '', 're-take restores')
            details.push(
                `re-take from ${JSON.stringify(current)} at ${JSON.stringify(before)}`
            )
            h.dispose()
        }

        // H13-05R: a failing re-take must not destroy the old landing: every
        // precondition and the current take geometry are validated first
        {
            const h = harness({ motion: { duration: 0.4, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const first = h.group.take(a)
            first.move({ x: 60, y: 20 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            first.release({ x: 300, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            const translate = a.style.translate
            const scale = a.style.scale
            const before = originOf(pageBox(a))
            // an unsupported current geometry: a rotation the support check
            // cannot classify must fail the re-take before the old landing is
            // settled or invalidated
            a.style.rotate = '45deg'
            invalidCall(() => h.group.take(a), 'rotated landing re-take')
            expectEqual(first.state, 'released', 'failed re-take keeps landing')
            expectEqual(h.group.stats.holds, 1, 'failed re-take keeps one hold')
            expectEqual(a.style.translate, translate, 'failed re-take pose x')
            expectEqual(a.style.scale, scale, 'failed re-take pose scale')
            expectClose(
                Math.max(
                    Math.abs(originOf(pageBox(a)).x - before.x),
                    Math.abs(originOf(pageBox(a)).y - before.y)
                ),
                0,
                1,
                'failed re-take keeps the drawn origin'
            )
            a.style.rotate = ''
            // a landing reparented under a held ancestor is refused; the old
            // landing and the ancestor hold both stay live and unmutated
            const parent = node(
                h.root,
                'left:400px;top:100px;width:200px;height:200px'
            )
            h.add(parent, { radius: false })
            h.group.capture()
            await h.group.flush()
            const parentHandle = h.group.take(parent)
            expectEqual(parentHandle.state, 'held', 'ancestor take')
            parent.append(a)
            const moved = a.style.translate
            const movedOrigin = originOf(pageBox(a))
            invalidCall(() => h.group.take(a), 'held-ancestor landing re-take')
            expectEqual(
                first.state,
                'released',
                'reparent failure keeps landing'
            )
            expectEqual(
                h.group.stats.holds,
                2,
                'reparent failure keeps both live holds'
            )
            expectEqual(a.style.translate, moved, 'reparent failure pose x')
            expectEqual(
                parentHandle.state,
                'held',
                'reparent failure keeps the ancestor hold'
            )
            expectClose(
                Math.max(
                    Math.abs(originOf(pageBox(a)).x - movedOrigin.x),
                    Math.abs(originOf(pageBox(a)).y - movedOrigin.y)
                ),
                0,
                1,
                'reparent failure keeps the drawn origin'
            )
            first.cancel()
            await frames(h.mc, 40, () => undefined)
            parentHandle.cancel()
            await frames(h.mc, 40, () => undefined)
            h.dispose()
            details.push('failed re-takes leave the old landing intact')
        }

        // H13-02: a supported >0.5 px re-layout while held does not invalidate
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
            a.style.width = '86px'
            h.group.capture()
            await h.group.flush()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'held', 'supported re-layout holds')
            handle.release()
            let beforeFinish = 0
            await frames(h.mc, 24, (_elapsed, index) => {
                if (index === 17) beforeFinish = pageBox(a).w
            })
            expectClose(beforeFinish, 86, 0.3, 'supported 6 px landing width')
            expectEqual(h.mc.pending, 0, 'supported re-layout unsubscribes')
            expectEqual(a.style.translate, '', 'supported re-layout restores')
            expectClose(
                maxDiff(pageBox(a), { x: 0, y: 0, w: 86, h: 80 }),
                0,
                TOL,
                'supported 6 px final layout box'
            )
            details.push('supported 6 px held re-layout kept the hold')
            h.dispose()
        }

        // H13-02R: the take-read path (no capture/flush) also adopts the new
        // A, so release lands on the re-laid-out box
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(a)
            handle.move({ x: 40, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            a.style.width = '81.5px'
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'held', 'take-read 1.5 px keeps the hold')
            handle.release()
            let beforeFinish = 0
            await frames(h.mc, 24, (_elapsed, index) => {
                if (index === 17) beforeFinish = pageBox(a).w
            })
            expectClose(
                beforeFinish,
                81.5,
                0.2,
                'take-read 1.5 px lands on the new A'
            )
            expectClose(
                maxDiff(pageBox(a), { x: 0, y: 0, w: 81.5, h: 80 }),
                0,
                TOL,
                'take-read 1.5 px final layout box'
            )
            h.dispose()
            details.push('take-read size re-layout landed on A')
        }
        // H13-02R: a held child under a participant parent uses the parent
        // map when resolving the new A from its take read
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const parent = node(
                h.root,
                'left:100px;top:100px;width:200px;height:200px'
            )
            const child = node(
                parent,
                'position:relative;left:20px;top:20px;width:80px;height:60px'
            )
            h.add(parent, { radius: false })
            h.add(child, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(child)
            handle.move({ x: 20, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            child.style.width = '88px'
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'held', 'parented take-read keeps hold')
            handle.release()
            let beforeFinish = 0
            await frames(h.mc, 24, (_elapsed, index) => {
                if (index === 17) beforeFinish = pageBox(child).w
            })
            expectClose(
                beforeFinish,
                88,
                0.2,
                'parented take-read lands on the new A width'
            )
            expectClose(
                maxDiff(pageBox(child), { x: 120, y: 120, w: 88, h: 60 }),
                0,
                TOL,
                'parented take-read final layout box'
            )
            h.dispose()
            details.push('parented take-read size re-layout landed on A')
        }

        // H13-23/P4-C4: held nodes and riders count for maxNodes
        {
            const snaps: { element: HTMLElement; reason: string }[] = []
            const h = harness({
                motion: { duration: 0.2, timing: linear },
                maxNodes: 2,
                onSnap: (element, reason) => snaps.push({ element, reason }),
            })
            const parent = node(
                h.root,
                'left:100px;top:100px;width:200px;height:200px'
            )
            const child = node(
                parent,
                'position:relative;left:20px;top:20px;width:60px;height:60px'
            )
            const sibling = node(
                h.root,
                'left:500px;top:100px;width:60px;height:60px'
            )
            h.add(parent, { radius: false })
            h.add(child, { radius: false })
            h.add(sibling, { radius: false })
            h.group.capture()
            await h.group.flush()
            const handle = h.group.take(parent)
            handle.move({ x: 40, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.group.capture()
            sibling.style.left = '600px'
            const report = await h.group.flush()
            expectEqual(report.status, 'capped', 'cap with holds')
            expectEqual(handle.state, 'invalidated', 'cap invalidates hold')
            expectEqual(h.group.stats.holds, 0, 'cap clears holds')
            // the capture's frame marker is a queued read; one frame clears
            // it, and with no subscriber the clock does not re-arm
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(h.mc.pending, 0, 'cap unsubscribes')
            expectEqual(parent.style.translate, '', 'cap restores parent')
            expectEqual(child.style.translate, '', 'cap restores child')
            expectEqual(
                snaps.some(
                    (entry) =>
                        entry.element === parent && entry.reason === 'capped'
                ),
                true,
                'cap onSnap lists the held node'
            )
            expectEqual(
                snaps.some(
                    (entry) =>
                        entry.element === child && entry.reason === 'capped'
                ),
                true,
                'cap onSnap lists the rider'
            )
            details.push('mover cap counted the hold + rider and snapped')
            h.dispose()
        }

        // H13-09: a kept pose timeline child already includes the parent map;
        // it must not receive h twice
        {
            const h = harness({ motion: { duration: 0.4, timing: linear } })
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
                motion: { duration: 0.3, timing: linear },
            })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            parent.style.width = '320px'
            child.style.left = '80px'
            h.group.flush()
            await frames(h.mc, 2, () => undefined)
            // a kept-track flush under the live scale creates the child's
            // pose timeline (§5.7 path 1)
            h.group.capture()
            await h.group.flush()
            const relative0 = viewBox(child).x - viewBox(parent).x
            const handle = h.group.take(parent)
            handle.move({ x: 40, y: 20 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            const relative1 = viewBox(child).x - viewBox(parent).x
            expectClose(
                relative1,
                relative0,
                25,
                'kept-timeline child gets h once'
            )
            handle.cancel()
            await frames(h.mc, 30, () => undefined)
            expectEqual(
                child.style.translate,
                '',
                'kept-timeline child restores'
            )
            details.push(
                `kept-timeline child relative ${relative0.toFixed(2)} -> ${relative1.toFixed(2)}`
            )
            h.dispose()
        }

        // P4-C10: a static child under a moving ancestor still carries the
        // ancestor's drawn velocity into the handle
        {
            const h = harness({ motion: { duration: 0.5, timing: linear } })
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
            h.group.capture()
            parent.style.left = '300px'
            h.group.flush()
            await frames(h.mc, 2, () => undefined)
            const handle = h.group.take(child)
            expectClose(
                handle.velocity.x,
                400,
                2,
                'static child carries ancestor velocity'
            )
            handle.cancel()
            await frames(h.mc, 40, () => undefined)
            h.dispose()
            details.push('static child take carried ancestor velocity')
        }
        // H13-12R/P4-C10: a static child under a parent width track. The
        // width change reflows the child's A; the handle carries that
        // ancestor-induced drawn velocity (independent A delta / duration).
        {
            const h = harness({ motion: { duration: 0.4, timing: linear } })
            const parent = node(
                h.root,
                'left:100px;top:100px;width:400px;height:200px'
            )
            const child = node(
                parent,
                'position:relative;left:50%;top:20px;width:60px;height:60px'
            )
            h.add(parent, { radius: false })
            h.add(child, { radius: false })
            h.group.capture()
            await h.group.flush()
            const before = originOf(pageBox(child))
            h.group.capture()
            parent.style.width = '200px'
            h.group.flush()
            await frames(h.mc, 2, () => undefined)
            const after = originOf(pageBox(child))
            expectEqual(
                Math.abs(after.x - before.x) > 1,
                true,
                'the width reflow moved the child A'
            )
            const handle = h.group.take(child)
            expectEqual(handle.state, 'held', 'static child under width held')
            // the child's own layout track is the ancestor width reflow:
            // half of −200 px over 0.4 s
            expectClose(
                handle.velocity.x,
                -250,
                2,
                'static child ancestor-carried width velocity'
            )
            handle.cancel()
            await frames(h.mc, 40, () => undefined)
            h.dispose()
            details.push(
                `static child width take: v ${handle.velocity.x.toFixed(1)} px/s (oracle −250)`
            )
        }
        // H13-14: a driven child under the same ancestor width track; its
        // handle velocity is the child's whole A delta over its own motion
        // duration, with the ancestor component included once
        {
            const h = harness({ motion: { duration: 0.4, timing: linear } })
            const parent = node(
                h.root,
                'left:100px;top:100px;width:400px;height:200px'
            )
            const child = node(
                parent,
                'position:relative;left:50%;top:20px;width:60px;height:60px'
            )
            h.add(parent, { radius: false })
            h.add(child, {
                radius: false,
                motion: { duration: 0.2, timing: linear },
            })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            parent.style.width = '200px'
            child.style.top = '80px'
            h.group.flush()
            await frames(h.mc, 2, () => undefined)
            const handle = h.group.take(child)
            expectEqual(handle.state, 'held', 'driven child under width held')
            // x: the child's A moved −100 px from the parent width over its
            // own 0.2 s; y: its own +60 px over 0.2 s
            expectClose(
                handle.velocity.x,
                -500,
                2,
                'driven child ancestor-carried width velocity'
            )
            expectClose(handle.velocity.y, 300, 2, 'driven child own velocity')
            handle.cancel()
            await frames(h.mc, 40, () => undefined)
            h.dispose()
            details.push(
                `driven width take: v ${handle.velocity.x.toFixed(1)}, ${handle.velocity.y.toFixed(1)} px/s`
            )
        }
        // coverage: a refused residual re-plan jumps the child to its A and
        // reports the typed refusal; the parent hold continues
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const events: LayoutDiagnostic[] = []
            const stop = layoutRuntime.onDiagnostic((e) => events.push(e))
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
                motion: { duration: 0.2, timing: linear },
            })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            child.style.left = '80px'
            h.group.flush()
            await frames(h.mc, 2, () => undefined)
            const handle = h.group.take(parent)
            handle.move({ x: 30, y: 10 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.group.set(child, {
                radius: false,
                motion: { type: 'spring', duration: 10, bounce: 0.99 },
            })
            h.group.capture()
            child.style.left = '120px'
            await h.group.flush()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectEqual(handle.state, 'held', 'residual refusal keeps the hold')
            expectEqual(
                events.some(
                    (e) => e.code === 'spring-timeout' && e.element === child
                ),
                true,
                'residual refusal reports spring-timeout'
            )
            expectClose(
                viewBox(child).x - viewBox(parent).x,
                120,
                TOL,
                'residual refusal lands the child at A'
            )
            handle.cancel()
            await frames(h.mc, 40, () => undefined)
            expectEqual(h.mc.clock.size, 0, 'residual refusal unsubscribes')
            stop()
            h.dispose()
            details.push('refused residual re-plan jumped to A')
        }

        // P4-C9/H13-19: take after an unflushed layout uses take reads
        {
            const h = harness({ motion: { duration: 0.3, timing: linear } })
            const a = node(h.root, 'left:0px;top:0px;width:80px;height:80px')
            h.add(a, { radius: false })
            h.group.capture()
            await h.group.flush()
            a.style.left = '120px' // no capture/flush
            const take = originOf(viewBox(a))
            const handle = h.group.take(a)
            handle.move({ x: 20, y: 10 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            expectOrigin(
                a,
                { x: take.x + 20, y: take.y + 10 },
                'unflushed take'
            )
            handle.release({ x: 0, y: 0 })
            await frames(h.mc, 30, () => undefined)
            expectClose(
                pageBox(a).x,
                h.root.getBoundingClientRect().left + scrollX + 120,
                TOL,
                'unflushed take releases to the take-read A'
            )
            expectEqual(a.style.translate, '', 'unflushed take restores')
            details.push('take before a flush used take reads')
            h.dispose()
        }
        // H13-08: an anchored descendant keeps layoutAnchor in its residual
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
                layoutAnchor: { x: 0, y: 0 },
                motion: { duration: 0.2, timing: linear },
            })
            h.group.capture()
            await h.group.flush()
            h.group.capture()
            child.style.left = '80px'
            h.group.flush()
            await frames(h.mc, 2, () => undefined)
            const handle = h.group.take(parent)
            handle.move({ x: 40, y: 20 })
            let min = Infinity
            let max = -Infinity
            const sample = (label: string) => {
                const rel = viewBox(child).x - viewBox(parent).x
                // biome-ignore lint/suspicious/noConsole: debug
                console.log(
                    'anchor',
                    label,
                    rel,
                    'parent',
                    viewBox(parent),
                    'child',
                    viewBox(child)
                )
                min = Math.min(min, rel)
                max = Math.max(max, rel)
                return label
            }
            await frames(h.mc, 6, () => sample('held before reflow'))
            // H13-08R: the held parent's A, width/scale and track change in a
            // flush; the anchored child must stay on its anchor offset, not
            // fall back to the absolute residual frame
            h.group.capture()
            parent.style.left = '300px'
            parent.style.width = '320px'
            await h.group.flush()
            sample('immediately after reflow flush')
            await frames(h.mc, 14, () => sample('held after reflow'))
            expectEqual(min >= 19, true, 'anchored child does not jump left')
            expectEqual(
                max <= 81,
                true,
                'anchored child stays in its offset path'
            )
            // the residual ends at to = 80 relative to the *drawn* parent
            // anchor; an unanchored residual would sit near 60 here
            const finalRel = viewBox(child).x - viewBox(parent).x
            if (!(finalRel >= 75)) {
                throw new Error(
                    `anchored child stays on the drawn parent anchor: final rel ${finalRel.toFixed(2)}, range ${min.toFixed(2)}..${max.toFixed(2)}`
                )
            }
            handle.cancel()
            await frames(h.mc, 30, () => undefined)
            expectEqual(child.style.translate, '', 'anchored child restores')
            details.push(
                `anchored child relative ${min.toFixed(2)}..${max.toFixed(2)}`
            )
            h.dispose()
        }
        // H13-12R/P4-C10: take a moving parent with a moving child. The
        // descendants ride h; the child's residual is an independent oracle
        // track from its own B to A with v = child − parent, not a
        // self-referential subtraction.
        {
            const h = harness({ motion: { duration: 0.5, timing: linear } })
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
                motion: { duration: 0.2, timing: linear },
            })
            h.group.capture()
            await h.group.flush()
            const parentBefore = pageBox(parent)
            const childBefore = pageBox(child)
            h.group.capture()
            parent.style.left = '300px'
            child.style.left = '80px'
            h.group.flush()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            h.mc.frame(FRAME)
            await settleMicrotasks()
            // independent tracks: the child's own B→A includes the parent's
            // layout move, so its drawn rate is 260 px / 0.2 s
            const parentAfter = { ...parentBefore, x: parentBefore.x + 200 }
            const childAfter = { ...childBefore, x: childBefore.x + 260 }
            const parentSpec = specOf(parentBefore, parentAfter, null, 0.5)
            const childSpec = specOf(childBefore, childAfter, null, 0.2)
            const parentDrawn = expectedBox(parentSpec, DT)
            const childDrawn = expectedBox(childSpec, DT)
            expectBoxAt(parent, parentDrawn, 'moving parent at the take')
            expectBoxAt(child, childDrawn, 'moving child at the take')
            const parentV = velocityOf(parentSpec, DT)
            const childV = velocityOf(childSpec, DT)
            const handle = h.group.take(parent)
            expectEqual(handle.state, 'held', 'moving parent held')
            expectClose(
                handle.velocity.x,
                parentV.x,
                20,
                'ancestor-carried take velocity'
            )
            // h is measured from the *new* A (the layout already moved to
            // 300), not from the pre-flush box
            const hOffset = {
                x: originOf(parentDrawn).x - originOf(parentAfter).x,
                y: originOf(parentDrawn).y - originOf(parentAfter).y,
            }
            const residualSpec = specOf(
                shiftBox(childDrawn, -hOffset.x, -hOffset.y),
                childAfter,
                { x: childV.x - parentV.x, y: 0, w: 0, h: 0 },
                0.2
            )
            // P4-C10: the residual's analytic initial velocity is exactly
            // v − ḣ (900 px/s), independent of the handle's own reading
            expectClose(
                velocityOf(residualSpec, 0).x,
                childV.x - parentV.x,
                0.5,
                'residual oracle initial velocity'
            )
            let posWorst = 0
            let velWorst = 0
            let firstMeasured = 0
            let previous = shiftBox(childDrawn, -hOffset.x, -hOffset.y)
            for (let index = 0; index < 5; index++) {
                h.mc.frame(FRAME)
                await settleMicrotasks()
                const t = (index + 1) * DT
                const rel = shiftBox(pageBox(child), -hOffset.x, -hOffset.y)
                const want = expectedBox(residualSpec, t)
                posWorst = Math.max(posWorst, maxDiff(rel, want))
                const measuredV = {
                    x: (rel.x - previous.x) / DT,
                    y: (rel.y - previous.y) / DT,
                }
                const oracleV = {
                    x: (want.x - expectedBox(residualSpec, t - DT).x) / DT,
                    y: (want.y - expectedBox(residualSpec, t - DT).y) / DT,
                }
                if (index === 0) firstMeasured = measuredV.x
                velWorst = Math.max(
                    velWorst,
                    Math.abs(measuredV.x - oracleV.x),
                    Math.abs(measuredV.y - oracleV.y)
                )
                previous = rel
            }
            expectClose(posWorst, 0, TOL, 'child residual on the oracle')
            expectClose(
                velWorst,
                0,
                20,
                'child residual velocity on the oracle'
            )
            // controls: the residual is the child rate minus the ancestor
            // exactly once, not the raw child rate and not minus it twice
            const once = childV.x - parentV.x
            const raw = childV.x
            const twice = childV.x - 2 * parentV.x
            expectEqual(
                Math.abs(firstMeasured - once) < Math.abs(firstMeasured - raw),
                true,
                'residual is not the raw child velocity'
            )
            expectEqual(
                Math.abs(firstMeasured - once) <
                    Math.abs(firstMeasured - twice),
                true,
                'residual is not the double subtraction'
            )
            handle.move({ x: 40, y: 0 })
            h.mc.frame(FRAME)
            await settleMicrotasks()
            // the finger move changes h for both; the relative geometry is
            // the residual at the new time, still on the oracle
            expectClose(
                viewBox(child).x - viewBox(parent).x,
                expectedBox(residualSpec, 6 * DT).x - parentAfter.x,
                TOL,
                'moving-parent take keeps the child relative geometry'
            )
            handle.cancel()
            await frames(h.mc, 40, () => undefined)
            expectEqual(
                parent.style.translate,
                '',
                'moving-parent take restores'
            )
            expectEqual(
                child.style.translate,
                '',
                'moving-parent child restores'
            )
            details.push(
                `moving-parent take: v ${handle.velocity.x.toFixed(1)} px/s, residual position ${posWorst.toFixed(4)} px, velocity ${velWorst.toFixed(1)} px/s`
            )
            h.dispose()
        }

        // H13-29/P4-C6: a cross-scope nested hold is allowed (documented
        // limitation); the DOM child is carried by the parent's pose
        {
            const a = harness({ motion: { duration: 0.2, timing: linear } })
            const b = harness({ motion: { duration: 0.2, timing: linear } })
            const parent = node(
                a.root,
                'left:100px;top:100px;width:200px;height:200px'
            )
            const child = node(
                parent,
                'position:relative;left:20px;top:20px;width:60px;height:60px'
            )
            a.add(parent, { radius: false })
            b.add(child, { radius: false })
            a.group.capture()
            await a.group.flush()
            b.group.capture()
            await b.group.flush()
            const handle = a.group.take(parent)
            expectEqual(handle.state, 'held', 'cross-scope take allowed')
            handle.move({ x: 40, y: 20 })
            await frames(a.mc, 3, () => undefined)
            expectClose(
                viewBox(child).x - viewBox(parent).x,
                20,
                TOL,
                'cross-scope child is carried by the parent pose'
            )
            handle.cancel()
            await frames(a.mc, 30, () => undefined)
            a.dispose()
            b.dispose()
            details.push('cross-scope nested hold is an explicit limitation')
        }

        return details.join('; ')
    } finally {
        quiet.restore()
    }
}
