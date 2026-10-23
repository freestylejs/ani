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
        await frames(
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
        await frames(
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

/** E3: four shared tiles from the folder to the panel; items at scale 0.2 with a stagger; reopen at 500 ms. */
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
    try {
        await view.render(app(false))
        const stage = pageBox(q(view.host, '[data-fixture="folder"]'))
        const at = (i: number, open: boolean): OBox => {
            const t = folderTile(i, open)
            return offset(stage, { x: t.x, y: t.y, w: t.size, h: t.size })
        }
        await view.render(app(true))
        // the first frame: the shared tiles are where the folder showed them
        let first = 0
        tiles('open').forEach((tile, i) => {
            first = Math.max(
                first,
                expectAt(tile, at(i, false), `tile ${i} first frame`)
            )
        })
        const starts: number[] = []
        const full = E3.open.tile
        for (const item of view.host.querySelectorAll('[data-folder-item]')) {
            expectClose(
                pageBox(item).w / full,
                E3.enterScale,
                0.02,
                'item enter scale'
            )
        }
        await frames(
            mc,
            90,
            (t) => {
                for (const item of view.host.querySelectorAll<HTMLElement>(
                    '[data-folder-item]'
                )) {
                    const k = Number(item.dataset.folderItem)
                    if (
                        starts[k] === undefined &&
                        pageBox(item).w > full * E3.enterScale * 1.02
                    ) {
                        starts[k] = t
                    }
                }
            },
            () => settled(view.host) && mc.clock.size === 0
        )
        let final = 0
        tiles('open').forEach((tile, i) => {
            final = Math.max(
                final,
                expectAt(tile, at(i, true), `tile ${i} final`, 0.01)
            )
        })
        let stagger = 0
        for (let k = 1; k < E3.others; k++) {
            stagger = Math.max(
                stagger,
                Math.abs(starts[k]! - starts[0]! - k * E3.stagger)
            )
        }
        if (stagger > DT + 1e-9) {
            throw new Error(
                `stagger off by ${stagger} s (starts ${starts.join(', ')})`
            )
        }
        // close, then reopen at 500 ms: nothing jumps at either commit
        let jumps = 0
        const before = picture(view.host, '[data-layout-id]', key)
        await view.render(app(false))
        jumps = Math.max(jumps, expectUnmoved(before, 'close'))
        await frames(mc, 31, () => undefined)
        const mid = picture(view.host, '[data-layout-id]', key)
        await view.render(app(true))
        jumps = Math.max(jumps, expectUnmoved(mid, 'reopen at 500 ms'))
        await frames(
            mc,
            120,
            () => undefined,
            () => settled(view.host) && mc.clock.size === 0
        )
        tiles('open').forEach((tile, i) => {
            final = Math.max(
                final,
                expectAt(tile, at(i, true), `tile ${i} after reopen`, 0.01)
            )
        })
        return `tiles: first frame within ${first.toFixed(4)} px, final within ${final.toFixed(4)} px; items at scale 0.2; stagger within ${stagger.toFixed(3)} s; close/reopen without a jump (${jumps.toFixed(4)} px)`
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
        await frames(
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
        await frames(
            mc,
            120,
            check,
            () => settled(view.host) && mc.clock.size === 0
        )
        phase = 'final close'
        tick = 0
        await view.render(app(null))
        await frames(
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
        await frames(
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
        await frames(
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
        for (const [from, to] of [
            ['grid', 'list'],
            ['list', 'grid'],
        ] as const) {
            await view.render(app(to))
            const tracks = Array.from({ length: GALLERY.count }, (_, i) =>
                spec(box(i, from), box(i, to), motion)
            )
            await frames(
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
        // the detail takes over tile 5's id
        const k = 5
        const from = pageBox(tile(k))
        await view.render(app('grid', k))
        const detail = q(view.host, `[data-gallery-detail="${k}"]`)
        expectAt(detail, from, 'detail first frame')
        await frames(
            mc,
            90,
            () => undefined,
            () => settled(view.host) && mc.clock.size === 0
        )
        const size = GALLERY.detail.size
        expectAt(
            detail,
            offset(stage, { x: 0, y: 0, w: size, h: size }),
            'detail final',
            0.01
        )
        await view.render(app('grid'))
        await frames(
            mc,
            120,
            () => undefined,
            () => settled(view.host) && mc.clock.size === 0
        )
        expectAt(tile(k), from, 'tile back', 0.01)
        return `16 tiles grid ↔ list on the oracle every frame (max ${worst.toFixed(4)} px); detail from tile ${k} and back`
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
            await frames(
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
            await frames(
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
            await frames(
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
