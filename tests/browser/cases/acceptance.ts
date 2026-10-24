// Acceptance rows (ARCHITECTURE.md §11, plan T6.1): the showcase fixtures on a
// manual clock, every frame checked against the independent oracle or the
// row's own frame-level assertion, in Chromium, Firefox and WebKit.
import { createManualClock } from '@freestylejs/ani-core/testing'
import { createElement as h } from 'react'
import {
    expectedBox,
    type OBox,
} from '../../../packages/layout/src/__tests__/oracle'
import {
    AnchorFixture,
    CardFixture,
    CreateFixture,
    DURATION,
    E1,
    E2,
    E3,
    E4,
    E5,
    FolderFixture,
    folderTile,
    GALLERY,
    GalleryFixture,
    galleryTile,
    SPRING,
    ToastFixture,
} from '../../../packages/web/src/components/layout_fixtures'
import { expectClose, expectEqual } from './assert'
import {
    DT,
    expectAt,
    expectUnmoved,
    frames,
    framesUntilDone,
    mountRoot,
    offset,
    pageBox,
    picture,
    q,
    settled,
    spec,
    TOL,
} from './layout_frames'

export const pageOptions = {}

export const knownFailures: Record<string, string> = {}

const motion = { duration: DURATION, timing: SPRING }

function centre(box: OBox): [number, number] {
    return [box.x + box.w / 2, box.y + box.h / 2]
}

function opacity(element: Element): number {
    return Number(getComputedStyle(element).opacity)
}

const cornerRadiusProperties = [
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomRightRadius',
    'borderBottomLeftRadius',
] as const

/** A layer's four CSS corner radii after all ancestor/own scales are applied. */
function onScreenRadii(element: HTMLElement): number[] {
    const box = element.getBoundingClientRect()
    const sx = box.width / element.offsetWidth
    const sy = box.height / element.offsetHeight
    const style = getComputedStyle(element)
    const out: number[] = []
    for (const property of cornerRadiusProperties) {
        const [x, y = x] = style[property]
            .split(' ')
            .map((value) => Number.parseFloat(value))
        out.push(x! * sx, y! * sy)
    }
    return out
}

/** Allows at most 0.03 px outside the authored radius interval. */
function expectRadiusBetween(
    element: HTMLElement,
    lo: number,
    hi: number,
    label: string
): number {
    let worst = 0
    for (const radius of onScreenRadii(element)) {
        const outside = radius < lo ? lo - radius : Math.max(0, radius - hi)
        worst = Math.max(worst, outside)
        if (outside > 0.03) {
            throw new Error(
                `${label}: on-screen radius ${radius.toFixed(4)} px is outside [${lo}, ${hi}] by ${outside.toFixed(4)} px`
            )
        }
    }
    return worst
}

/** The computed text styles that set an element's glyph metrics. */
function fontOf(element: Element): string {
    const s = getComputedStyle(element)
    return [
        s.fontFamily,
        s.fontSize,
        s.fontWeight,
        s.fontStyle,
        s.fontStretch,
        s.lineHeight,
        s.letterSpacing,
        s.wordSpacing,
        s.textTransform,
    ].join(' | ')
}

/** The presence part of `transform`: [scaleX, translateY]. */
function presenceOf(element: Element): [number, number] {
    const value = getComputedStyle(element).transform
    if (value === 'none') return [1, 0]
    const m = /matrix\(([^)]*)\)/
        .exec(value)![1]!
        .split(',')
        .map((n) => Number.parseFloat(n))
    return [m[0]!, m[5]!]
}

/* ───────────────────────── E1 ───────────────────────── */

/** E1: child centre on the parent's centre every frame; its size waits 0.8 s. */
export async function E1Anchor(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    try {
        await view.render(
            h(AnchorFixture, { expanded: false, clock: mc.clock })
        )
        const parent = q(view.host, '[data-anchor-parent]')
        const child = q(view.host, '[data-anchor-child]')
        const cross = q(view.host, '[data-anchor-cross]')
        const stage = pageBox(q(view.host, '[data-fixture="anchor"]'))
        const before = pageBox(parent)
        await view.render(h(AnchorFixture, { expanded: true, clock: mc.clock }))
        const track = spec(
            before,
            offset(stage, { x: 0, y: 0, w: E1.large, h: E1.large }),
            motion
        )
        let worst = 0
        let centreError = 0
        let started = Number.NaN
        await framesUntilDone(
            mc,
            120,
            (t) => {
                worst = Math.max(
                    worst,
                    expectAt(parent, expectedBox(track, t), `parent t=${t}`)
                )
                const p = centre(pageBox(parent))
                const c = pageBox(child)
                const x = pageBox(cross)
                const cc = centre(c)
                const xc = centre(x)
                centreError = Math.max(
                    centreError,
                    Math.abs(cc[0] - p[0]),
                    Math.abs(cc[1] - p[1]),
                    Math.abs(xc[0] - cc[0]),
                    Math.abs(xc[1] - cc[1])
                )
                expectClose(x.w, E1.cross, TOL, `crosshair size t=${t}`)
                if (t < E1.delay - 1e-9) {
                    expectClose(
                        c.w,
                        E1.child[0],
                        TOL,
                        `child holds 70 px at ${t}`
                    )
                }
                if (
                    Number.isNaN(started) &&
                    Math.abs(c.w - E1.child[0]) > 0.05
                ) {
                    started = t
                }
            },
            () => settled(view.host) && mc.clock.size === 0
        )
        if (centreError > TOL)
            throw new Error(`centre off by ${centreError} px`)
        if (!(started >= E1.delay - 1e-9 && started <= E1.delay + DT + 1e-9)) {
            throw new Error(
                `the child's size started at ${started} s, not at 0.8 s ± one frame`
            )
        }
        expectClose(pageBox(child).w, E1.child[1], 0.01, 'child final')
        return `parent on the oracle (${worst.toFixed(4)} px); child and crosshair centred within ${centreError.toFixed(4)} px; child size starts at ${started.toFixed(3)} s`
    } finally {
        view.dispose()
    }
}

/* ───────────────────────── E2 ───────────────────────── */

/** E2: complementary opacities, constant glyph height, close/reopen at 100 ms and 500 ms. */
export async function E2Create(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    const app = (open: boolean) => h(CreateFixture, { open, clock: mc.clock })
    const ids = '[data-layout-id]'
    const key = (e: HTMLElement) =>
        `${e.closest('[data-create]')?.getAttribute('data-create')}/${e.dataset.layoutId}`
    let worstSum = 0
    let worstGlyph = 0
    let worstStep = 0
    let jumps = 0
    const last = new Map<Element, number>()
    const check = () => {
        for (const id of E2.ids) {
            const nodes = [
                ...view.host.querySelectorAll(`[data-layout-id="${id}"]`),
            ]
            if (nodes.length === 2) {
                worstSum = Math.max(
                    worstSum,
                    Math.abs(opacity(nodes[0]!) + opacity(nodes[1]!) - 1)
                )
            }
            for (const node of nodes) {
                const o = opacity(node)
                const previous = last.get(node)
                if (previous !== undefined) {
                    worstStep = Math.max(worstStep, Math.abs(o - previous))
                }
                last.set(node, o)
            }
        }
        for (const label of view.host.querySelectorAll(
            '[data-layout-id="create-label"]'
        )) {
            worstGlyph = Math.max(
                worstGlyph,
                Math.abs(pageBox(label).h - E2.label.height)
            )
        }
    }
    const toggle = async (open: boolean) => {
        const before = picture(view.host, ids, key)
        await view.render(app(open))
        jumps = Math.max(jumps, expectUnmoved(before, `toggle ${open}`))
        check()
    }
    try {
        await view.render(app(false))
        await toggle(true)
        await frames(mc, 6, check) // close at 100 ms
        await toggle(false)
        await frames(mc, 31, check) // reopen at 500 ms
        await toggle(true)
        await framesUntilDone(
            mc,
            90,
            check,
            () => settled(view.host) && mc.clock.size === 0
        )
        if (worstSum > 0.05) throw new Error(`opacity sum off by ${worstSum}`)
        if (worstGlyph > 1)
            throw new Error(`label glyph height off by ${worstGlyph} px`)
        if (worstStep > 0.25)
            throw new Error(`an opacity popped by ${worstStep} in one frame`)
        expectEqual(
            view.host.querySelectorAll('[data-create]').length,
            1,
            'one wrapper left'
        )
        const label = q(
            view.host,
            '[data-create="menu"] [data-layout-id="create-label"]'
        )
        expectEqual(label.style.opacity, '', 'label opacity given back')
        return `opacity sums within ${worstSum.toFixed(4)}; glyph height within ${worstGlyph.toFixed(3)} px; largest opacity step ${worstStep.toFixed(3)}; no jump at a toggle (${jumps.toFixed(4)} px)`
    } finally {
        view.dispose()
    }
}

/* ───────────────────────── E3 ───────────────────────── */

/**
 * E3: four shared tiles from the folder to the panel on the oracle; the
 * non-shared items enter from the measured folder origin at scale 0.2, each
 * on its own staggered enter path every frame, and every run settles; reopen
 * at 500 ms.
 */
export async function E3Folder(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    const app = (open: boolean) => h(FolderFixture, { open, clock: mc.clock })
    const tiles = (state: 'open' | 'closed') =>
        Array.from({ length: E3.shared }, (_, i) =>
            q(
                view.host,
                `[data-folder="${state}"] [data-layout-id="folder-tile-${i}"]`
            )
        )
    const key = (e: HTMLElement) =>
        `${e.closest('[data-folder]')?.getAttribute('data-folder')}/${e.dataset.layoutId}`
    const done = () => settled(view.host) && mc.clock.size === 0
    try {
        await view.render(app(false))
        const stage = pageBox(q(view.host, '[data-fixture="folder"]'))
        const fixture = q(view.host, '[data-fixture="folder"]')
        const surfaceLayoutBox = (element: HTMLElement): OBox => {
            if (element.offsetParent !== fixture) {
                throw new Error(
                    'folder surface offset parent is not the fixture'
                )
            }
            return offset(stage, {
                x: element.offsetLeft,
                y: element.offsetTop,
                w: element.offsetWidth,
                h: element.offsetHeight,
            })
        }
        const surfaceLayers = () => [
            ...view.host.querySelectorAll<HTMLElement>(
                '[data-layout-id="folder"]'
            ),
        ]
        let surfaceWorst = 0
        let radiusWorst = 0
        let aspectWorst = 0
        const sharedLayoutIds = new Set(
            Array.from({ length: E3.shared }, (_, i) => `folder-tile-${i}`)
        )
        const checkOcclusion = (label: string) => {
            for (let i = 0; i < E3.shared; i++) {
                const pair = [
                    ...view.host.querySelectorAll<HTMLElement>(
                        `[data-layout-id="folder-tile-${i}"]`
                    ),
                ]
                if (pair.length === 0)
                    throw new Error(`${label}: tile ${i} has no layer`)
                const probe = pair.reduce((best, element) =>
                    opacity(element) > opacity(best) ? element : best
                )
                const box = probe.getBoundingClientRect()
                const stack = document.elementsFromPoint(
                    box.left + box.width / 2,
                    box.top + box.height / 2
                )
                const indexes = pair
                    .map((element) => stack.indexOf(element))
                    .filter((index) => index >= 0)
                if (indexes.length === 0) {
                    throw new Error(
                        `${label}: tile ${i} is absent from elementsFromPoint`
                    )
                }
                const below = Math.max(...indexes)
                for (const element of stack.slice(0, below)) {
                    if (pair.includes(element as HTMLElement)) continue
                    if (element instanceof HTMLElement) {
                        const layoutId = element.dataset.layoutId
                        if (
                            layoutId === 'folder' ||
                            (layoutId !== undefined &&
                                sharedLayoutIds.has(layoutId))
                        )
                            continue
                    }
                    const identity =
                        element instanceof HTMLElement
                            ? [
                                  element.tagName,
                                  element.dataset.layoutId
                                      ? `layout=${element.dataset.layoutId}`
                                      : '',
                                  element.dataset.folder
                                      ? `folder=${element.dataset.folder}`
                                      : '',
                                  element.dataset.folderItem
                                      ? `item=${element.dataset.folderItem}`
                                      : '',
                                  element.dataset.lk
                                      ? `lk=${element.dataset.lk}`
                                      : '',
                              ]
                                  .filter(Boolean)
                                  .join(' ')
                            : element.nodeName
                    throw new Error(
                        `${label}: ${identity} at stack index ${stack.indexOf(element)} paints above folder-tile-${i}`
                    )
                }
            }
        }
        const checkFolderFrame = (label: string, expected?: OBox) => {
            checkOcclusion(label)
            const surfaces = surfaceLayers()
            if (surfaces.length === 0)
                throw new Error(`${label}: shared folder surface is absent`)
            for (const surface of surfaces) {
                if (expected) {
                    surfaceWorst = Math.max(
                        surfaceWorst,
                        expectAt(surface, expected, `${label}: surface`)
                    )
                }
                radiusWorst = Math.max(
                    radiusWorst,
                    expectRadiusBetween(surface, 20, 28, `${label}: surface`)
                )
                for (const child of surface.querySelectorAll<HTMLElement>(
                    '*'
                )) {
                    const participant =
                        child.dataset.layoutId !== undefined ||
                        child.dataset.lkMode !== undefined
                    if (
                        participant ||
                        child.offsetWidth === 0 ||
                        child.offsetHeight === 0
                    )
                        continue
                    const box = child.getBoundingClientRect()
                    const authored = child.offsetWidth / child.offsetHeight
                    const drawn = box.width / box.height
                    const error = Math.abs(drawn - authored)
                    aspectWorst = Math.max(aspectWorst, error)
                    if (error > 0.001) {
                        throw new Error(
                            `${label}: non-participating descendant aspect ratio changed by ${error}`
                        )
                    }
                }
            }
            for (let i = 0; i < E3.shared; i++) {
                for (const tile of view.host.querySelectorAll<HTMLElement>(
                    `[data-layout-id="folder-tile-${i}"]`
                )) {
                    radiusWorst = Math.max(
                        radiusWorst,
                        expectRadiusBetween(tile, 6, 16, `${label}: tile ${i}`)
                    )
                }
            }
        }
        const departure = (element: HTMLElement) => ({
            element,
            lastOpacity: opacity(element),
            gone: false,
        })
        const checkDeparture = (
            state: ReturnType<typeof departure>,
            label: string
        ) => {
            if (state.element.isConnected) {
                state.lastOpacity = opacity(state.element)
                return
            }
            if (state.gone) return
            const inline = Number.parseFloat(state.element.style.opacity)
            const beforeUnmount = Number.isFinite(inline)
                ? inline
                : state.lastOpacity
            expectClose(
                beforeUnmount,
                0,
                1e-6,
                `${label}: departing surface opacity before unmount`
            )
            state.gone = true
        }
        const expectDeparted = (
            state: ReturnType<typeof departure>,
            label: string
        ) => {
            checkDeparture(state, label)
            if (!state.gone)
                throw new Error(`${label}: departing surface never unmounted`)
        }
        const at = (i: number, open: boolean): OBox => {
            const t = folderTile(i, open)
            return offset(stage, { x: t.x, y: t.y, w: t.size, h: t.size })
        }
        // the point the items grow out of: the folder's measured centre
        const [ox, oy] = centre(pageBox(q(view.host, '[data-folder="closed"]')))
        // the enter path, derived here and not by the presence runtime: item
        // k holds scale 0.2 for k staggers, then follows the fixture's
        // spring (its own step function, from 0.2 to 1 over the enter
        // duration) about the folder origin. An enter's timeline starts at
        // the commit, so the harness frame at elapsed t (whose layout dt is
        // 0) is one frame into it: `p = t + DT`.
        const enterScale = (k: number, p: number) => {
            const local = p - k * E3.stagger
            if (local <= 0) return E3.enterScale
            const r = SPRING.step(local, {
                dt: 0,
                from: E3.enterScale,
                to: 1,
                duration: E3.enterDuration,
            })
            return r.endOfAnimation ? 1 : r.value
        }
        const enterBox = (k: number, scale: number): OBox => {
            const b = at(E3.shared + k, true)
            return {
                x: ox + scale * (b.x - ox),
                y: oy + scale * (b.y - oy),
                w: scale * b.w,
                h: scale * b.h,
            }
        }
        let enterFirst = 0
        let enterPath = 0
        let stagger = 0
        const allStarts: string[] = []
        /** Every frame of one opening: the items on their enter paths, then settled. */
        const enter = async (
            label: string,
            check: (t: number) => void = () => undefined
        ) => {
            const items = [
                ...view.host.querySelectorAll<HTMLElement>(
                    '[data-folder-item]'
                ),
            ]
            expectEqual(items.length, E3.others, `${label}: items mounted`)
            items.forEach((item, k) => {
                expectEqual(item.dataset.folderItem, String(k), 'item order')
                // the first frame: scale 0.2, on the folder origin
                expectClose(
                    pageBox(item).w / E3.open.tile,
                    E3.enterScale,
                    0.02,
                    `${label}: item ${k} enter scale`
                )
                enterFirst = Math.max(
                    enterFirst,
                    expectAt(
                        item,
                        enterBox(k, E3.enterScale),
                        `${label}: item ${k} first frame on the folder origin`
                    )
                )
            })
            const starts = items.map(() => Number.NaN)
            await framesUntilDone(
                mc,
                90,
                (t) => {
                    check(t)
                    items.forEach((item, k) => {
                        if (!item.isConnected) {
                            throw new Error(`${label}: item ${k} left`)
                        }
                        enterPath = Math.max(
                            enterPath,
                            expectAt(
                                item,
                                enterBox(k, enterScale(k, t + DT)),
                                `${label}: item ${k} enter t=${t}`
                            )
                        )
                        const scale = pageBox(item).w / E3.open.tile
                        if (
                            Number.isNaN(starts[k]!) &&
                            scale - E3.enterScale > 1e-3
                        ) {
                            starts[k] = t + DT
                        }
                    })
                },
                done,
                `${label}: the enter`
            )
            items.forEach((item, k) => {
                if (!Number.isFinite(starts[k]!)) {
                    throw new Error(
                        `${label}: item ${k} never started its enter`
                    )
                }
                // the first moving frame of its timeline is within one frame after
                // k staggers
                const late = starts[k]! - k * E3.stagger
                if (!(late > 0 && late <= DT + 1e-9)) {
                    throw new Error(
                        `${label}: item ${k} started at ${starts[k]} s, not within one frame after ${k * E3.stagger} s`
                    )
                }
                if (k > 0) {
                    stagger = Math.max(
                        stagger,
                        Math.abs(starts[k]! - starts[k - 1]! - E3.stagger)
                    )
                }
                expectAt(
                    item,
                    at(E3.shared + k, true),
                    `${label}: item ${k} final`,
                    0.01
                )
            })
            if (!(stagger <= DT + 1e-9)) {
                throw new Error(
                    `${label}: stagger off by ${stagger} s (starts ${starts.join(', ')})`
                )
            }
            allStarts.push(
                `${label} ${starts.map((s) => s.toFixed(3)).join('/')}`
            )
        }
        const closedSurface = q(view.host, '[data-folder="closed"]')
        const closedSurfaceBox = pageBox(closedSurface)
        expectClose(
            closedSurfaceBox.w,
            E3.closed.size,
            0.01,
            'closed surface width'
        )
        expectClose(
            closedSurfaceBox.h,
            E3.closed.size,
            0.01,
            'closed surface height'
        )
        const leavingClosed = departure(closedSurface)
        await view.render(app(true))
        const openSurface = q(view.host, '[data-folder="open"]')
        const firstFrameProblems: string[] = []
        try {
            checkOcclusion('open frame 0')
        } catch (error) {
            firstFrameProblems.push(
                `occlusion: ${error instanceof Error ? error.message : String(error)}`
            )
        }
        try {
            expectAt(openSurface, closedSurfaceBox, 'surface first frame')
        } catch (error) {
            firstFrameProblems.push(
                `surface morph: ${error instanceof Error ? error.message : String(error)}`
            )
        }
        if (firstFrameProblems.length > 0) {
            throw new Error(firstFrameProblems.join('; '))
        }
        const openingSurface = spec(
            closedSurfaceBox,
            surfaceLayoutBox(openSurface),
            motion
        )
        checkFolderFrame('open frame 0', closedSurfaceBox)
        checkDeparture(leavingClosed, 'open frame 0')
        // the first frame: the shared tiles are where the folder showed them
        let first = 0
        const shared = tiles('open')
        shared.forEach((tile, i) => {
            first = Math.max(
                first,
                expectAt(tile, at(i, false), `tile ${i} first frame`)
            )
        })
        // then on their tracks from the folder to the panel every frame
        const tracks = shared.map((_, i) =>
            spec(at(i, false), at(i, true), motion)
        )
        let worst = 0
        await enter('open', (t) => {
            checkFolderFrame(`open t=${t}`, expectedBox(openingSurface, t))
            checkDeparture(leavingClosed, 'open')
            shared.forEach((tile, i) => {
                worst = Math.max(
                    worst,
                    expectAt(
                        tile,
                        expectedBox(tracks[i]!, t),
                        `tile ${i} t=${t}`
                    )
                )
            })
        })
        expectDeparted(leavingClosed, 'open')
        let final = 0
        tiles('open').forEach((tile, i) => {
            final = Math.max(
                final,
                expectAt(tile, at(i, true), `tile ${i} final`, 0.01)
            )
        })

        // A complete close has the same shared surface handoff in reverse.
        let jumps = 0
        const openAtRest = q(view.host, '[data-folder="open"]')
        const openSurfaceBox = pageBox(openAtRest)
        const leavingOpen = departure(openAtRest)
        let before = picture(view.host, '[data-layout-id]', key)
        await view.render(app(false))
        jumps = Math.max(jumps, expectUnmoved(before, 'close'))
        const closedAfter = q(view.host, '[data-folder="closed"]')
        expectAt(closedAfter, openSurfaceBox, 'surface close first frame')
        const closingSurface = spec(
            openSurfaceBox,
            surfaceLayoutBox(closedAfter),
            motion
        )
        checkFolderFrame('close frame 0', openSurfaceBox)
        checkDeparture(leavingOpen, 'close frame 0')
        await framesUntilDone(
            mc,
            90,
            (t) => {
                checkFolderFrame(`close t=${t}`, expectedBox(closingSurface, t))
                checkDeparture(leavingOpen, 'close')
            },
            done,
            'close'
        )
        expectDeparted(leavingOpen, 'close')

        // Re-open from rest so the original item-enter acceptance still runs
        // in both directions before the interruption case below.
        const closedAtRest = q(view.host, '[data-folder="closed"]')
        const closedAgainBox = pageBox(closedAtRest)
        const leavingClosedAgain = departure(closedAtRest)
        await view.render(app(true))
        const openAgain = q(view.host, '[data-folder="open"]')
        expectAt(openAgain, closedAgainBox, 'surface reopen first frame')
        const reopeningSurface = spec(
            closedAgainBox,
            surfaceLayoutBox(openAgain),
            motion
        )
        checkFolderFrame('reopen frame 0', closedAgainBox)
        checkDeparture(leavingClosedAgain, 'reopen after close frame 0')
        await enter('reopen after close', (t) => {
            checkFolderFrame(
                `reopen after close t=${t}`,
                expectedBox(reopeningSurface, t)
            )
            checkDeparture(leavingClosedAgain, 'reopen after close')
        })
        expectDeparted(leavingClosedAgain, 'reopen after close')

        // Close, then reopen at 500 ms: nothing jumps at either commit, and
        // the shared layers are never hidden by a foreign element.
        const openBeforeMid = q(view.host, '[data-folder="open"]')
        const openBeforeMidBox = pageBox(openBeforeMid)
        const leavingOpenMid = departure(openBeforeMid)
        before = picture(view.host, '[data-layout-id]', key)
        await view.render(app(false))
        jumps = Math.max(jumps, expectUnmoved(before, 'close for reopen'))
        const closedMid = q(view.host, '[data-folder="closed"]')
        const midClosingSurface = spec(
            openBeforeMidBox,
            surfaceLayoutBox(closedMid),
            motion
        )
        checkFolderFrame('mid-close frame 0', openBeforeMidBox)
        checkDeparture(leavingOpenMid, 'mid-close frame 0')
        await frames(mc, 31, (t) => {
            checkFolderFrame(
                `mid-close t=${t}`,
                expectedBox(midClosingSurface, t)
            )
            checkDeparture(leavingOpenMid, 'mid-close')
        })
        const mid = picture(view.host, '[data-layout-id]', key)
        const leavingClosedMid = departure(closedMid)
        await view.render(app(true))
        jumps = Math.max(jumps, expectUnmoved(mid, 'reopen at 500 ms'))
        checkFolderFrame('reopen-mid-close frame 0')
        checkDeparture(leavingOpenMid, 'mid-close interrupted at 500 ms')
        checkDeparture(leavingClosedMid, 'reopen-mid-close frame 0')
        await enter('reopen', (t) => {
            checkFolderFrame(`reopen-mid-close t=${t}`)
            checkDeparture(leavingOpenMid, 'mid-close interrupted at 500 ms')
            checkDeparture(leavingClosedMid, 'reopen-mid-close')
        })
        checkDeparture(leavingOpenMid, 'mid-close interrupted at 500 ms')
        expectDeparted(leavingClosedMid, 'reopen-mid-close')
        tiles('open').forEach((tile, i) => {
            final = Math.max(
                final,
                expectAt(tile, at(i, true), `tile ${i} after reopen`, 0.01)
            )
        })
        return `tiles: first frame within ${first.toFixed(4)} px, on the oracle every frame (max ${worst.toFixed(4)} px), final within ${final.toFixed(4)} px; surface on the oracle within ${surfaceWorst.toFixed(4)} px, no foreign occluder, radius bounds within ${radiusWorst.toFixed(4)} px, descendant aspect ratio within ${aspectWorst.toFixed(6)}; items: first frame at scale 0.2 on the folder origin within ${enterFirst.toFixed(4)} px, on their enter paths every frame (max ${enterPath.toFixed(4)} px), starts ${allStarts.join('; ')} s, stagger within ${stagger.toFixed(3)} s; open and reopen settle; close/reopen without a jump (${jumps.toFixed(4)} px)`
    } finally {
        view.dispose()
    }
}

/* ───────────────────────── E4 ───────────────────────── */

/** E4: card, image and title as nested ids; the image covers the card every frame; the title keeps its size. */
export async function E4Card(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    const app = (open: number | null) =>
        h(CardFixture, { open, clock: mc.clock })
    const i = 1
    const surfaces = () => [
        ...view.host.querySelectorAll<HTMLElement>(
            `[data-layout-id="card-${i}"]`
        ),
    ]
    let coverage = 0
    let where = ''
    let phase = 'open'
    let tick = 0
    let pinned = 0
    let titleSize: OBox | null = null
    const check = () => {
        tick += 1
        for (const surface of surfaces()) {
            const s = pageBox(surface)
            const image = pageBox(
                q(surface, `[data-layout-id="card-${i}-image"]`)
            )
            const gap = Math.max(
                Math.abs(image.x - s.x),
                Math.abs(image.x + image.w - (s.x + s.w)),
                Math.abs(image.y - s.y)
            )
            if (gap > coverage) {
                coverage = gap
                where = `${phase} frame ${tick} ${surface.dataset.cardDetail === undefined ? 'card' : 'detail'} surface ${JSON.stringify(s)} image ${JSON.stringify(image)}`
            }
            const title = pageBox(
                q(surface, `[data-layout-id="card-${i}-title"]`)
            )
            if (titleSize) {
                pinned = Math.max(
                    pinned,
                    Math.abs(title.w - titleSize.w),
                    Math.abs(title.h - titleSize.h)
                )
            }
        }
    }
    try {
        await view.render(app(null))
        const stage = pageBox(q(view.host, '[data-fixture="card"]'))
        const card = q(view.host, `[data-card="${i}"]`)
        const cardBox = pageBox(card)
        const imageBox = pageBox(q(card, `[data-layout-id="card-${i}-image"]`))
        const titleBox = pageBox(q(card, `[data-layout-id="card-${i}-title"]`))
        const gridFont = fontOf(q(card, `[data-layout-id="card-${i}-title"]`))
        titleSize = titleBox
        await view.render(app(i))
        const detail = q(view.host, `[data-card-detail="${i}"]`)
        // J-033: the title's text styles do not depend on its container (a
        // button in the grid, a div in the detail), so its metrics match
        expectEqual(
            fontOf(q(detail, `[data-layout-id="card-${i}-title"]`)),
            gridFont,
            'title text styles, detail vs grid'
        )
        // the first frame: each nested id starts from the card's own box
        expectAt(detail, cardBox, 'surface first frame')
        expectAt(
            q(detail, `[data-layout-id="card-${i}-image"]`),
            imageBox,
            'image first frame'
        )
        const title = pageBox(q(detail, `[data-layout-id="card-${i}-title"]`))
        expectClose(title.x, titleBox.x, TOL, 'title first frame x')
        expectClose(title.y, titleBox.y, TOL, 'title first frame y')
        await framesUntilDone(
            mc,
            90,
            check,
            () => settled(view.host) && mc.clock.size === 0
        )
        const { x, y, width, height } = E4.detail
        expectAt(
            detail,
            offset(stage, { x, y, w: width, h: height }),
            'detail final',
            0.01
        )
        // the title measures the same at rest in the detail as in the grid
        const restTitle = pageBox(
            q(detail, `[data-layout-id="card-${i}-title"]`)
        )
        expectClose(restTitle.w, titleBox.w, TOL, 'title width, detail vs grid')
        expectClose(
            restTitle.h,
            titleBox.h,
            TOL,
            'title height, detail vs grid'
        )
        // close, and reopen while it closes
        let jumps = 0
        const key = (e: HTMLElement) =>
            `${e.dataset.layoutId}@${e.closest('[data-card-detail]') ? 'detail' : 'grid'}`
        let before = picture(view.host, '[data-layout-id]', key)
        phase = 'close'
        tick = 0
        await view.render(app(null))
        jumps = Math.max(jumps, expectUnmoved(before, 'close'))
        await frames(mc, 15, check)
        before = picture(view.host, '[data-layout-id]', key)
        phase = 'reopen'
        tick = 0
        await view.render(app(i))
        jumps = Math.max(jumps, expectUnmoved(before, 'reopen'))
        await framesUntilDone(
            mc,
            120,
            check,
            () => settled(view.host) && mc.clock.size === 0
        )
        phase = 'final close'
        tick = 0
        await view.render(app(null))
        await framesUntilDone(
            mc,
            120,
            check,
            () => settled(view.host) && mc.clock.size === 0
        )
        expectAt(
            q(view.host, `[data-card="${i}"]`),
            cardBox,
            'card final',
            0.01
        )
        if (coverage > TOL)
            throw new Error(`image coverage gap ${coverage} px at ${where}`)
        if (pinned > TOL) throw new Error(`title size moved by ${pinned} px`)
        return `nested ids from their own boxes; title ${titleBox.w.toFixed(3)} px wide in the grid, ${restTitle.w.toFixed(3)} px in the detail, same text styles; image coverage within ${coverage.toFixed(4)} px; title size pinned within ${pinned.toFixed(4)} px; close/reopen without a jump (${jumps.toFixed(4)} px)`
    } finally {
        view.dispose()
    }
}

/* ───────────────────────── E5 ───────────────────────── */

/** E5: five adds 80 ms apart; the enter's first frame; a popLayout exit with scaleX. */
export async function E5Toasts(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    const app = (toasts: readonly string[]) =>
        h(ToastFixture, { toasts, clock: mc.clock })
    const toast = (id: string) => q(view.host, `[data-toast="${id}"]`)
    const key = (e: HTMLElement) => e.dataset.toast!
    try {
        await view.render(app([]))
        const stage = pageBox(q(view.host, '[data-fixture="toasts"]'))
        const slot = (i: number) =>
            offset(stage, {
                x: 0,
                y: i * (E5.height + E5.gap),
                w: E5.width,
                h: E5.height,
            })
        const ids: string[] = []
        let jumps = 0
        let bottom = 0
        for (let n = 1; n <= 5; n++) {
            const before = picture(view.host, '[data-toast]', key)
            const id = `t${n}`
            ids.unshift(id)
            await view.render(app([...ids]))
            jumps = Math.max(jumps, expectUnmoved(before, `add ${n}`))
            // first frame equals the enter transform (origin centre-bottom)
            const [sx, ty] = presenceOf(toast(id))
            expectClose(sx, E5.enter.scaleX, 1e-3, `${id} enter scaleX`)
            expectClose(ty, E5.enter.translateY, 1e-3, `${id} enter translateY`)
            expectClose(opacity(toast(id)), 0, 1e-3, `${id} enter opacity`)
            // the new toast does not move by layout: its bottom edge is its
            // slot's plus the presence offset, whatever scaleX does
            await frames(mc, 5, () => {
                const box = pageBox(toast(id))
                const [scale, offsetY] = presenceOf(toast(id))
                const want = slot(0)
                bottom = Math.max(
                    bottom,
                    Math.abs(box.y + box.h - (want.y + want.h + offsetY))
                )
                expectClose(
                    box.w,
                    E5.width * scale,
                    1,
                    `${id} width under scaleX`
                )
            })
        }
        await framesUntilDone(
            mc,
            120,
            () => undefined,
            () => settled(view.host) && mc.clock.size === 0
        )
        ids.forEach((id, i) =>
            expectAt(toast(id), slot(i), `${id} settled`, 0.01)
        )
        // honesty: settled toasts never intersect
        for (let a = 0; a < ids.length; a++) {
            for (let b = a + 1; b < ids.length; b++) {
                const p = pageBox(toast(ids[a]!))
                const r = pageBox(toast(ids[b]!))
                if (p.y < r.y + r.h && r.y < p.y + p.h) {
                    throw new Error(
                        `settled toasts ${ids[a]} and ${ids[b]} intersect`
                    )
                }
            }
        }
        // remove the middle toast
        const leaving = ids[2]!
        const before = picture(view.host, '[data-toast]', key)
        const rest = ids.filter((id) => id !== leaving)
        await view.render(app(rest))
        const exiting = toast(leaving)
        expectEqual(exiting.style.position, 'absolute', 'popped out of flow')
        jumps = Math.max(jumps, expectUnmoved(before, 'remove'))
        const tracks = rest.map((id, i) => {
            // the layout box is final at t = 0 (offsets ignore transforms)
            expectClose(
                toast(id).offsetTop,
                i * (E5.height + E5.gap),
                0.5,
                `${id} layout final at t = 0`
            )
            return spec(before.get(id)!.box, slot(i), {
                ...motion,
                mode: 'position',
            })
        })
        const popped = before.get(leaving)!.box
        let worst = 0
        let removedAt = Number.NaN
        await framesUntilDone(
            mc,
            60,
            (t) => {
                rest.forEach((id, i) => {
                    worst = Math.max(
                        worst,
                        expectAt(
                            toast(id),
                            expectedBox(tracks[i]!, t),
                            `${id} t=${t}`
                        )
                    )
                })
                const element = view.host.querySelector(
                    `[data-toast="${leaving}"]`
                )
                if (!element) {
                    if (Number.isNaN(removedAt)) removedAt = t
                    return
                }
                const box = pageBox(element)
                const [scale, offsetY] = presenceOf(element)
                bottom = Math.max(
                    bottom,
                    Math.abs(box.y + box.h - (popped.y + popped.h + offsetY))
                )
                expectClose(
                    box.x + box.w / 2,
                    popped.x + popped.w / 2,
                    1,
                    'exit centre under scaleX'
                )
                expectClose(
                    box.w,
                    popped.w * scale,
                    1,
                    'exit width under scaleX'
                )
            },
            () =>
                !Number.isNaN(removedAt) &&
                settled(view.host) &&
                mc.clock.size === 0
        )
        if (bottom > 1) throw new Error(`bottom edge off by ${bottom} px`)
        if (
            !(
                removedAt >= E5.exit.duration - 1e-9 &&
                removedAt <= E5.exit.duration + 3 * DT
            )
        ) {
            throw new Error(`exit released at ${removedAt} s, expected ≈ 0.2 s`)
        }
        return `5 adds 80 ms apart: enter first frames exact, no jump (${jumps.toFixed(4)} px); bottom edge within ${bottom.toFixed(3)} px under scaleX; exit released at ${removedAt.toFixed(3)} s; siblings on the oracle within ${worst.toFixed(4)} px; settled toasts disjoint`
    } finally {
        view.dispose()
    }
}

/* ───────────────────────── Gallery ───────────────────────── */

/** Gallery: 16 tiles grid ↔ list on the oracle every frame; a detail view with a shared id. */
export async function Gallery(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    const app = (layout: 'grid' | 'list', detail: number | null = null) =>
        h(GalleryFixture, { view: layout, detail, clock: mc.clock })
    const tile = (i: number) => q(view.host, `[data-tile="${i}"]`)
    try {
        await view.render(app('grid'))
        const stage = pageBox(q(view.host, '[data-fixture="gallery"]'))
        const box = (i: number, layout: 'grid' | 'list') =>
            offset(stage, galleryTile(i, layout))
        let worst = 0
        let radiusWorst = 0
        for (const [from, to] of [
            ['grid', 'list'],
            ['list', 'grid'],
        ] as const) {
            await view.render(app(to))
            const tracks = Array.from({ length: GALLERY.count }, (_, i) =>
                spec(box(i, from), box(i, to), motion)
            )
            await framesUntilDone(
                mc,
                90,
                (t) => {
                    for (let i = 0; i < GALLERY.count; i++) {
                        worst = Math.max(
                            worst,
                            expectAt(
                                tile(i),
                                expectedBox(tracks[i]!, t),
                                `${from}→${to} tile ${i} t=${t}`
                            )
                        )
                    }
                },
                () => settled(view.host) && mc.clock.size === 0
            )
        }
        // the detail takes over tile 5's id, and gives it back: each leg on
        // the track from the measured box before the commit to the measured
        // layout box after it, every frame
        const fixture = q(view.host, '[data-fixture="gallery"]')
        const layoutBox = (element: HTMLElement): OBox => {
            expectEqual(element.offsetParent, fixture, 'offset parent')
            return offset(stage, {
                x: element.offsetLeft,
                y: element.offsetTop,
                w: element.offsetWidth,
                h: element.offsetHeight,
            })
        }
        const k = 5
        const checkGalleryRadius = (
            tileRadius: number,
            label: string
        ): void => {
            for (const layer of view.host.querySelectorAll<HTMLElement>(
                `[data-layout-id="gallery-${k}"]`
            )) {
                radiusWorst = Math.max(
                    radiusWorst,
                    expectRadiusBetween(
                        layer,
                        tileRadius,
                        20,
                        `${label}: gallery-${k}`
                    )
                )
            }
        }
        const from = pageBox(tile(k))
        await view.render(app('grid', k))
        const detail = q(view.host, `[data-gallery-detail="${k}"]`)
        expectAt(detail, from, 'detail first frame')
        checkGalleryRadius(12, 'grid detail first frame')
        const opening = spec(from, layoutBox(detail), motion)
        let detailWorst = 0
        await framesUntilDone(
            mc,
            90,
            (t) => {
                checkGalleryRadius(12, `grid detail opening t=${t}`)
                detailWorst = Math.max(
                    detailWorst,
                    expectAt(
                        detail,
                        expectedBox(opening, t),
                        `detail opening t=${t}`
                    )
                )
            },
            () => settled(view.host) && mc.clock.size === 0,
            'detail opening'
        )
        const size = GALLERY.detail.size
        expectAt(
            detail,
            offset(stage, { x: 0, y: 0, w: size, h: size }),
            'detail final',
            0.01
        )
        const open = pageBox(detail)
        await view.render(app('grid'))
        const back = tile(k)
        expectAt(back, open, 'tile return first frame')
        checkGalleryRadius(12, 'grid detail return first frame')
        const returning = spec(open, layoutBox(back), motion)
        await framesUntilDone(
            mc,
            120,
            (t) => {
                checkGalleryRadius(12, `grid detail return t=${t}`)
                detailWorst = Math.max(
                    detailWorst,
                    expectAt(
                        back,
                        expectedBox(returning, t),
                        `tile return t=${t}`
                    )
                )
            },
            () => settled(view.host) && mc.clock.size === 0,
            'detail return'
        )
        expectAt(tile(k), from, 'tile back', 0.01)

        // Repeat the shared handoff from the rectangular list tile so the
        // 8 px authored tile radius is covered as well as the grid's 12 px.
        await view.render(app('list'))
        await framesUntilDone(
            mc,
            90,
            () => undefined,
            () => settled(view.host) && mc.clock.size === 0,
            'grid to list before detail radius'
        )
        const listFrom = pageBox(tile(k))
        await view.render(app('list', k))
        const listDetail = q(view.host, `[data-gallery-detail="${k}"]`)
        expectAt(listDetail, listFrom, 'list detail first frame')
        checkGalleryRadius(8, 'list detail first frame')
        await framesUntilDone(
            mc,
            90,
            (t) => checkGalleryRadius(8, `list detail opening t=${t}`),
            () => settled(view.host) && mc.clock.size === 0,
            'list detail opening'
        )
        const listOpen = pageBox(listDetail)
        await view.render(app('list'))
        const listBack = tile(k)
        expectAt(listBack, listOpen, 'list tile return first frame')
        checkGalleryRadius(8, 'list detail return first frame')
        await framesUntilDone(
            mc,
            120,
            (t) => checkGalleryRadius(8, `list detail return t=${t}`),
            () => settled(view.host) && mc.clock.size === 0,
            'list detail return'
        )
        expectAt(listBack, listFrom, 'list tile back', 0.01)
        return `16 tiles grid ↔ list on the oracle every frame (max ${worst.toFixed(4)} px); detail from tile ${k} and back on the oracle every frame (max ${detailWorst.toFixed(4)} px); grid/list detail radius bounds within ${radiusWorst.toFixed(4)} px`
    } finally {
        view.dispose()
    }
}

/* ───────────────────────── showcase honesty ───────────────────────── */

/** The fixtures contain the shared tiles and nested ids their rows name. */
export async function Honest(): Promise<string> {
    const mc = createManualClock()
    const view = mountRoot()
    const nested = (
        container: Element,
        ids: readonly string[],
        label: string
    ) => {
        for (const id of ids) {
            const found = container.querySelector(`[data-layout-id="${id}"]`)
            if (!found) throw new Error(`${label} lacks ${id}`)
        }
    }
    try {
        for (const open of [false, true]) {
            await view.render(h(CreateFixture, { open, clock: mc.clock }))
            const wrapper = q(view.host, '[data-layout-id="create"]')
            nested(wrapper, E2.ids.slice(1), `E2 ${open ? 'menu' : 'button'}`)
            await framesUntilDone(
                mc,
                90,
                () => undefined,
                () => settled(view.host) && mc.clock.size === 0
            )
        }
        for (const open of [false, true]) {
            await view.render(h(FolderFixture, { open, clock: mc.clock }))
            const folder = q(
                view.host,
                `[data-folder="${open ? 'open' : 'closed'}"]`
            )
            nested(
                folder,
                Array.from({ length: E3.shared }, (_, i) => `folder-tile-${i}`),
                'E3'
            )
            await framesUntilDone(
                mc,
                90,
                () => undefined,
                () => settled(view.host) && mc.clock.size === 0
            )
        }
        for (const open of [null, 0]) {
            await view.render(h(CardFixture, { open, clock: mc.clock }))
            for (let i = 0; i < E4.cards.length; i++) {
                const surface =
                    open === i
                        ? q(view.host, `[data-card-detail="${i}"]`)
                        : q(view.host, `[data-card="${i}"]`)
                nested(
                    surface,
                    [`card-${i}-image`, `card-${i}-title`],
                    `E4 card ${i}`
                )
            }
            await framesUntilDone(
                mc,
                120,
                () => undefined,
                () => settled(view.host) && mc.clock.size === 0
            )
        }
        return 'E2: wrapper/icon/label in button and menu; E3: four shared tiles in folder and panel; E4: image and title nested in every card and in the detail'
    } finally {
        view.dispose()
    }
}
