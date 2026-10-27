// Regression rows (plan T6.2): late start on the real clock, unrelated
// re-renders above the scope, a crossfade under re-renders, velocity across a
// retarget under a janky clock, and seeded fuzz invariants of the engine's
// read/write discipline and ownership (ARCHITECTURE.md §4, §6, §11).
import { defaultClock, timing } from '@freestylejs/ani-core'
import {
    createManualClock,
    type ManualClock,
} from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    type LayoutOptions,
    type LayoutReport,
} from '@freestylejs/ani-layout'
import { LayoutGroup, useLayout } from '@freestylejs/ani-react/layout'
import { createElement as h, type ReactNode } from 'react'
import { type OBox, rng } from '../../../packages/layout/src/__tests__/oracle'
import {
    CardFixture,
    GalleryFixture,
} from '../../../packages/web/src/components/layout_fixtures'
import { expectClose, expectEqual } from './assert'
import {
    FRAME_MS,
    frames,
    mountRoot,
    pageBox,
    q,
    settled,
    sleep,
} from './layout_frames'

export const pageOptions = {}

export const knownFailures: Record<string, string> = {}

function block(ms: number): void {
    const end = performance.now() + ms
    while (performance.now() < end) {
        // deliberately busy
    }
}

const nextFrame = () =>
    new Promise<number>((resolve) => requestAnimationFrame(resolve))

/* ───────────────────────── late start ───────────────────────── */

/** React commit → flush in a microtask → 120 ms block → the first painted frame shows ≤ 6 % progress. */
export async function LateStart(): Promise<string> {
    const view = mountRoot()
    const linear = timing.linear()
    function Mover({ on }: { on: boolean }): ReactNode {
        const ref = useLayout<HTMLDivElement>({ layout: 'position' })
        return h('div', {
            ref,
            'data-mover': '',
            style: {
                width: 40,
                height: 40,
                marginLeft: on ? 300 : 0,
                background: '#335',
            },
        })
    }
    const app = (on: boolean) =>
        h(
            LayoutGroup,
            { motion: { duration: 0.4, timing: linear } },
            h(Mover, { on })
        )
    try {
        await view.render(app(false))
        await sleep(50)
        const mover = q(view.host, '[data-mover]')
        const start = pageBox(mover).x
        // the commit's flush runs in the render's microtasks
        await view.render(app(true))
        block(120)
        await nextFrame()
        const first = (pageBox(mover).x - start) / 300
        if (!(first <= 0.06)) {
            throw new Error(
                `first painted frame at ${(first * 100).toFixed(2)} %`
            )
        }
        await nextFrame()
        await nextFrame()
        const later = (pageBox(mover).x - start) / 300
        if (!(later > first)) throw new Error('the run did not advance')
        await sleep(700)
        expectEqual(settled(view.host), true, 'settled')
        expectEqual(defaultClock.size, 0, 'no subscriber left')
        return `first painted frame after a 120 ms block at ${(first * 100).toFixed(2)} % (then ${(later * 100).toFixed(2)} %)`
    } finally {
        view.dispose()
    }
}

/* ───────────────────────── unrelated re-renders ───────────────────────── */

/** A wrapper above the scope: not a participant; its own style changes, never its box. */
function Above({
    tick,
    children,
}: {
    tick: number
    children?: ReactNode
}): ReactNode {
    return h(
        'div',
        { 'data-tick': tick, style: { color: tick % 2 ? '#123' : '#321' } },
        children
    )
}

interface Sampled {
    readonly boxes: OBox[][]
    readonly opacities: number[][]
}

/**
 * Renders `tree` through `script`, then samples every element matching
 * `selector` every frame until rest; with `rerender`, the whole tree
 * re-renders from `Above` every third frame (no box changes).
 */
async function sample(
    tree: (mc: ManualClock) => ReactNode,
    script: (show: () => Promise<void>) => Promise<void>,
    selector: string,
    rerender: boolean,
    afterwards: (
        host: HTMLElement,
        show: () => Promise<void>,
        mc: ManualClock
    ) => Promise<void> = async () => undefined
): Promise<Sampled> {
    const mc = createManualClock()
    const view = mountRoot()
    let tick = 0
    const show = () => view.render(h(Above, { tick: ++tick }, tree(mc)))
    const boxes: OBox[][] = []
    const opacities: number[][] = []
    try {
        await script(show)
        await frames(
            mc,
            120,
            (elapsed) => {
                const elements = [...view.host.querySelectorAll(selector)]
                boxes.push(elements.map(pageBox))
                opacities.push(
                    elements.map((e) => Number(getComputedStyle(e).opacity))
                )
                if (
                    rerender &&
                    Math.round(elapsed / (FRAME_MS / 1000)) % 3 === 2
                )
                    void show()
            },
            () => settled(view.host) && mc.clock.size === 0
        )
        await afterwards(view.host, show, mc)
        return { boxes, opacities }
    } finally {
        view.dispose()
    }
}

/** Frame by frame, the largest difference of two samplings (they must have as many frames). */
function difference(
    control: readonly number[][],
    test: readonly number[][],
    label: string
): number {
    if (control.length !== test.length) {
        throw new Error(
            `${label}: ${test.length} frames against ${control.length}`
        )
    }
    let worst = 0
    control.forEach((frame, f) => {
        if (frame.length !== test[f]!.length)
            throw new Error(`${label}: frame ${f} has other elements`)
        frame.forEach((value, i) => {
            worst = Math.max(worst, Math.abs(value - test[f]![i]!))
        })
    })
    return worst
}

const flat = (boxes: readonly OBox[][]) =>
    boxes.map((frame) => frame.flatMap((b) => [b.x, b.y, b.w, b.h]))

/** Gallery grid → list; an ancestor of the LayoutGroup re-renders every third frame. */
export async function Unrelated(): Promise<string> {
    let layout: 'grid' | 'list' = 'grid'
    const tree = (mc: ManualClock) =>
        h(GalleryFixture, { view: layout, detail: null, clock: mc.clock })
    const script = async (show: () => Promise<void>) => {
        layout = 'grid'
        await show()
        layout = 'list'
        await show()
    }
    const control = await sample(tree, script, '[data-tile]', false)
    const test = await sample(tree, script, '[data-tile]', true)
    const worst = difference(flat(control.boxes), flat(test.boxes), 'gallery')
    if (!(worst <= 0.02)) throw new Error(`trajectories differ by ${worst} px`)
    return `16 tiles over ${control.boxes.length} frames, re-rendered from above every third frame: identical within ${worst.toFixed(4)} px`
}

/* ───────────────────────── crossfade ───────────────────────── */

/** E4 close (detail → card crossfade) with re-renders from above; after it ends, a re-render leaves opacity alone. */
export async function Crossfade(): Promise<string> {
    let open: number | null = 1
    const tree = (mc: ManualClock) => h(CardFixture, { open, clock: mc.clock })
    const script = async (show: () => Promise<void>) => {
        open = 1
        await show()
        await sleep(0)
        open = null
        await show()
    }
    const afterwards = async (
        host: HTMLElement,
        show: () => Promise<void>,
        mc: ManualClock
    ) => {
        // after the crossfade: a re-render with no box change
        await show()
        mc.frame(FRAME_MS)
        const card = q(host, '[data-card="1"]')
        expectEqual(card.style.opacity, '', 'no owned opacity after')
        expectClose(
            Number(getComputedStyle(card).opacity),
            1,
            1e-9,
            'card opacity after'
        )
    }
    const selector = '[data-layout-id="card-1"]'
    const control = await sample(tree, script, selector, false, afterwards)
    const test = await sample(tree, script, selector, true, afterwards)
    const worst = difference(flat(control.boxes), flat(test.boxes), 'boxes')
    const fade = difference(control.opacities, test.opacities, 'opacities')
    if (!(worst <= 0.02)) throw new Error(`boxes differ by ${worst} px`)
    if (!(fade <= 1e-6)) throw new Error(`opacities differ by ${fade}`)
    let pairs = 0
    test.opacities.forEach((frame, f) => {
        if (frame.length !== 2) return
        pairs += 1
        // the pair is complementary while both are drawn
        const coverage = 1 - (1 - frame[0]!) * (1 - frame[1]!)
        expectClose(coverage, 1, 1e-3, `opacity coverage frame ${f}`)
    })
    return `${control.boxes.length} frames (${pairs} crossfading) re-rendered from above every third frame: boxes within ${worst.toFixed(4)} px, opacities within ${fade.toExponential(1)}; opacity 1 and unowned after`
}

/* ───────────────────────── velocity under jank ───────────────────────── */

/** A retarget after janky frames keeps the drawn velocity (position and size) within 5 %. */
export async function Jank(): Promise<string> {
    const mc = createManualClock()
    const root = document.createElement('div')
    root.style.cssText = 'position: relative; width: 900px; height: 300px;'
    document.body.append(root)
    const group = createLayoutGroup({
        clock: mc.clock,
        motion: {
            duration: 0.6,
            timing: timing.spring({ m: 1, k: 120, c: 18 }),
        },
    })
    const e = document.createElement('div')
    e.style.cssText =
        'position: absolute; left: 0px; top: 0px; width: 40px; height: 40px; transform-origin: 0px 0px;'
    root.append(e)
    const remove = group.add(e)
    // the drawn box from the engine's own values (origin 0 0): rect reads
    // snap to 1/64 px, too coarse for a short difference
    const drawn = () => {
        const [tx = 0] = e.style.translate.split(' ').map(Number.parseFloat)
        const [sx = 1] = e.style.scale.split(' ').map(Number.parseFloat)
        return {
            x: Number.parseFloat(e.style.left) + tx,
            w: Number.parseFloat(e.style.width) * sx,
        }
    }
    // second order one-sided differences over two 1 ms steps: a retarget that
    // reverses accelerates hard at its start (−57,000 px/s² here), which a
    // plain 1 ms secant reads as 28 px/s
    const steps = () => {
        const a = drawn()
        mc.frame(1)
        const b = drawn()
        mc.frame(1)
        return [a, b, drawn()] as const
    }
    const ends = () => {
        const [a, b, c] = steps()
        return {
            x: 2 * (c.x - b.x) * 1000 - (c.x - a.x) * 500,
            w: 2 * (c.w - b.w) * 1000 - (c.w - a.w) * 500,
        }
    }
    const starts = () => {
        const [a, b, c] = steps()
        return {
            x: 2 * (b.x - a.x) * 1000 - (c.x - a.x) * 500,
            w: 2 * (b.w - a.w) * 1000 - (c.w - a.w) * 500,
        }
    }
    try {
        group.capture()
        e.style.left = '300px'
        e.style.width = '100px'
        void group.flush()
        mc.frame(0)
        for (const dt of [16, 50, 8, 120, 33, 16, 70, 4]) mc.frame(dt)
        const before = ends()
        group.capture()
        e.style.left = '120px'
        e.style.width = '60px'
        const done = group.flush()
        mc.frame(0)
        const after = starts()
        const error = Math.max(
            Math.abs(after.x - before.x) / Math.abs(before.x),
            Math.abs(after.w - before.w) / Math.abs(before.w)
        )
        if (!(error <= 0.05)) {
            throw new Error(
                `velocity ${JSON.stringify(before)} → ${JSON.stringify(after)} (${(error * 100).toFixed(2)} %)`
            )
        }
        let report: LayoutReport | null = null
        void done.then((r) => {
            report = r
        })
        for (let i = 0; i < 200 && report === null; i++) {
            mc.frame([16, 50, 8, 120][i % 4]!)
            await Promise.resolve()
        }
        await sleep(0)
        expectEqual(e.style.translate, '', 'restored')
        expectEqual(mc.clock.size, 0, 'no subscriber left')
        return `after janky frames: ${before.x.toFixed(1)} px/s, ${before.w.toFixed(1)} px/s → ${after.x.toFixed(1)}, ${after.w.toFixed(1)} across the retarget (${(error * 100).toFixed(3)} %)`
    } finally {
        remove()
        group.dispose()
        root.remove()
    }
}

/* ───────────────────────── seeded fuzz ───────────────────────── */

interface Event {
    readonly kind: 'read' | 'write'
    readonly style?: CSSStyleDeclaration
    readonly property?: string
    readonly value?: string
    readonly priority?: string
}

/** Records layout reads and inline style writes while `on`. */
function probeDom(): { log: Event[]; on: boolean; restore(): void } {
    const rect = Element.prototype.getBoundingClientRect
    const computed = window.getComputedStyle
    const set = CSSStyleDeclaration.prototype.setProperty
    const remove = CSSStyleDeclaration.prototype.removeProperty
    const probe = {
        log: [] as Event[],
        on: false,
        restore() {
            Element.prototype.getBoundingClientRect = rect
            window.getComputedStyle = computed
            CSSStyleDeclaration.prototype.setProperty = set
            CSSStyleDeclaration.prototype.removeProperty = remove
        },
    }
    Element.prototype.getBoundingClientRect = function (this: Element) {
        if (probe.on) probe.log.push({ kind: 'read' })
        return rect.call(this)
    }
    window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
        if (probe.on) probe.log.push({ kind: 'read' })
        return computed.call(window, element, pseudo)
    }) as typeof window.getComputedStyle
    CSSStyleDeclaration.prototype.setProperty = function (
        this: CSSStyleDeclaration,
        property: string,
        value: string | null,
        priority?: string
    ) {
        if (probe.on) {
            probe.log.push({
                kind: 'write',
                style: this,
                property,
                value: value ?? '',
                priority: priority ?? '',
            })
        }
        return set.call(this, property, value, priority)
    }
    CSSStyleDeclaration.prototype.removeProperty = function (
        this: CSSStyleDeclaration,
        property: string
    ) {
        if (probe.on)
            probe.log.push({ kind: 'write', style: this, property, value: '' })
        return remove.call(this, property)
    }
    return probe
}

const OWNED = new Set(['translate', 'scale'])

/**
 * One engine operation: no read after its first write; writes are finite;
 * translate/scale are written !important, or restored to the author's value.
 */
function checkOperation(
    log: readonly Event[],
    label: string,
    authoredOf: (style: CSSStyleDeclaration) => CSSStyleDeclaration | undefined
): void {
    let wrote = false
    for (const event of log) {
        if (event.kind === 'write') {
            wrote = true
            const value = event.value ?? ''
            if (/NaN|Infinity/.test(value)) {
                throw new Error(`${label}: ${event.property}: ${value}`)
            }
            if (event.property === 'transform') {
                throw new Error(`${label}: the engine wrote transform`)
            }
            if (
                OWNED.has(event.property!) &&
                value !== '' &&
                event.priority !== 'important' &&
                authoredOf(event.style!)?.getPropertyValue(event.property!) !==
                    value
            ) {
                throw new Error(
                    `${label}: ${event.property} written without !important`
                )
            }
        } else if (wrote) {
            throw new Error(`${label}: a read after a write`)
        }
    }
}

/**
 * The §4.4 development warning, printed once per scope: an author's inline
 * write of an owned property mid-run leaves that node without a valid B.
 */
const STALE_WARNING =
    '[ani-layout] no valid measurement of what was presented (capture-less or aged flush), so participants that moved appear at their new layout without motion. Call capture() (or update()) in the task that changes the DOM.'

/** Captures `console.warn` (the kit's `silenceWarnings` pattern). */
function captureWarnings(): { readonly messages: string[]; restore(): void } {
    // biome-ignore lint/suspicious/noConsole: capture the expected development warnings
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

/**
 * Seeded random trees, options, DOM changes, removals, reduced-motion toggles
 * and janky frames; every flush and frame keeps the read/write discipline
 * and ownership, and every element ends byte-identical to its authored style
 * with no subscription left. The only warning allowed is §4.4's, at most
 * once per scope; any other fails the row.
 */
export async function Fuzz(): Promise<string> {
    const probe = probeDom()
    const warnings = captureWarnings()
    const SEEDS = 24
    const STEPS = 60
    let operations = 0
    let staleScopes = 0
    try {
        for (let seed = 1; seed <= SEEDS; seed++) {
            warnings.messages.length = 0
            const random = rng(seed)
            const int = (n: number) => Math.floor(random() * n)
            const pick = <T>(values: readonly T[]): T =>
                values[int(values.length)]!
            const mc = createManualClock()
            const root = document.createElement('div')
            root.style.cssText =
                'position: relative; width: 900px; height: 700px; overflow: hidden;'
            document.body.append(root)
            const group = createLayoutGroup({
                clock: mc.clock,
                motion: { duration: pick([0.1, 0.3, 0.6]) },
                reducedMotion: pick([
                    'jump',
                    { maxDuration: 0.1 },
                    'ignore',
                ] as const),
            })
            // the authored style of every element, written to both
            const authored = new Map<HTMLElement, CSSStyleDeclaration>()
            const byStyle = new Map<CSSStyleDeclaration, CSSStyleDeclaration>()
            const author = (
                e: HTMLElement,
                property: string,
                value: string
            ) => {
                e.style.setProperty(property, value)
                authored.get(e)!.setProperty(property, value)
            }
            const removers = new Map<HTMLElement, () => void>()
            const options = (): LayoutOptions => ({
                layout: pick([true, true, 'position', 'size'] as const),
                ...(random() < 0.2 ? { radius: true } : {}),
                ...(random() < 0.3
                    ? {
                          motion: {
                              duration: pick([0.05, 0.2, 0.5]),
                              delay: pick([0, 0, 0.1]),
                              timing: pick([
                                  timing.linear(),
                                  timing.easeOut(),
                                  timing.spring({ m: 1, k: 170, c: 22 }),
                              ]),
                          },
                      }
                    : {}),
            })
            const make = (parent: HTMLElement) => {
                const e = document.createElement('div')
                const style = document.createElement('div').style
                authored.set(e, style)
                byStyle.set(e.style, style)
                author(e, 'position', 'absolute')
                author(e, 'left', `${int(300)}px`)
                author(e, 'top', `${int(300)}px`)
                author(e, 'width', `${20 + int(120)}px`)
                author(e, 'height', `${20 + int(120)}px`)
                if (random() < 0.2) author(e, 'border-radius', '6px')
                if (random() < 0.2) author(e, 'translate', '4px 2px')
                if (random() < 0.2) {
                    author(e, 'transform', 'scale(0.9)')
                    author(e, 'transform-origin', '0px 0px')
                }
                parent.append(e)
                removers.set(e, group.add(e, options()))
                return e
            }
            for (let i = 0; i < 3; i++) {
                const top = make(root)
                for (let j = int(4); j > 0; j--) {
                    const child = make(top)
                    for (let k = int(3); k > 0; k--) make(child)
                }
            }
            const live = () => [...removers.keys()].filter((e) => e.isConnected)
            const engine = (label: string, fn: () => void) => {
                probe.log.length = 0
                probe.on = true
                try {
                    fn()
                } finally {
                    probe.on = false
                }
                checkOperation(probe.log, `seed ${seed} ${label}`, (style) =>
                    byStyle.get(style)
                )
                operations += 1
            }
            const change = (label: string, mutate: () => void) => {
                engine(`${label} capture`, () => group.capture())
                mutate()
                engine(`${label} flush`, () => void group.flush())
            }
            engine('first flush', () => void group.flush())
            for (let step = 0; step < STEPS; step++) {
                const roll = random()
                const elements = live()
                if (roll < 0.35 && elements.length > 0) {
                    change(`step ${step} move`, () => {
                        for (let n = 1 + int(4); n > 0; n--) {
                            const e = pick(elements)
                            const property = pick([
                                'left',
                                'top',
                                'width',
                                'height',
                            ])
                            const base =
                                property === 'width' || property === 'height'
                                    ? 20
                                    : 0
                            author(e, property, `${base + int(300)}px`)
                        }
                    })
                } else if (roll < 0.65) {
                    for (let n = 1 + int(6); n > 0; n--) {
                        const dt = pick([0, 4, 16, 16, 33, 50, 120])
                        engine(`step ${step} frame`, () => mc.frame(dt))
                    }
                } else if (roll < 0.75 && elements.length > 0) {
                    const e = pick(elements)
                    group.set(e, options())
                    change(`step ${step} set`, () => undefined)
                } else if (roll < 0.83 && elements.length > 1) {
                    const e = pick(elements)
                    removers.get(e)!()
                    e.remove()
                    change(`step ${step} remove`, () => undefined)
                } else if (roll < 0.9) {
                    const parent =
                        elements.length > 0 && random() < 0.5
                            ? pick(elements)
                            : root
                    change(`step ${step} add`, () => make(parent))
                } else if (roll < 0.95) {
                    mc.setReducedMotion(!mc.clock.reducedMotion)
                    change(`step ${step} reduced`, () => undefined)
                } else if (elements.length > 0) {
                    // the author writes an owned property inline mid-run
                    const e = pick(elements)
                    change(`step ${step} author`, () =>
                        author(e, 'translate', `${int(9)}px 1px`)
                    )
                }
                await Promise.resolve()
            }
            // end: half finish at once, half run out on janky frames
            if (seed % 2 === 0) {
                engine('finish', () => group.finish())
            } else {
                for (let i = 0; i < 400 && mc.clock.size > 0; i++) {
                    engine('drain', () => mc.frame(pick([16, 50, 120])))
                }
            }
            await Promise.resolve()
            for (const [e, style] of authored) {
                if (e.style.cssText !== style.cssText) {
                    throw new Error(
                        `seed ${seed}: ${e.style.cssText} is not the authored ${style.cssText}`
                    )
                }
            }
            expectEqual(mc.clock.size, 0, `seed ${seed}: no subscriber left`)
            for (const remove of removers.values()) remove()
            group.dispose()
            root.remove()
            for (const message of warnings.messages) {
                if (message !== STALE_WARNING) {
                    throw new Error(
                        `seed ${seed}: an unexpected warning: ${message}`
                    )
                }
            }
            if (warnings.messages.length > 1) {
                throw new Error(
                    `seed ${seed}: the §4.4 warning printed ${warnings.messages.length} times; it is once per scope`
                )
            }
            staleScopes += warnings.messages.length
        }
        return `${SEEDS} seeds × ${STEPS} steps (${operations} engine operations): no read after a write, finite values, translate/scale only !important, transform never written; byte-identical styles and no subscription at the end; the §4.4 warning only, once in ${staleScopes} of ${SEEDS} scopes`
    } finally {
        warnings.restore()
        probe.restore()
    }
}
