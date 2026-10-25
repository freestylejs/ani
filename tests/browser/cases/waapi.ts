// The WAAPI engine (ARCHITECTURE.md §10, plan T7.2): the differential against
// the RAF engine per frame, a retarget against the oracle without velocity,
// the 120 ms block, validation and lifecycle. Its compositor trace is
// `tests/browser/waapi_trace.mjs` (Chromium).
import { isAniError, type TimingFunction, timing } from '@freestylejs/ani-core'
import { createManualClock } from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    type LayoutGroup,
    type LayoutReport,
} from '@freestylejs/ani-layout'
import {
    expectedBox,
    maxDiff,
    type OBox,
} from '../../../packages/layout/src/__tests__/oracle'
import { expectEqual } from './assert'
import { DT, FRAME_MS, pageBox, sleep, spec } from './layout_frames'

export const pageOptions = {}

export const knownFailures: Record<string, string> = {}

function stage(): HTMLElement {
    document.body.style.margin = '0'
    const root = document.createElement('div')
    root.style.cssText = 'position: relative; width: 900px; height: 160px;'
    document.body.append(root)
    return root
}

function box(root: HTMLElement, css: string): HTMLElement {
    const element = document.createElement('div')
    element.style.cssText = `position: absolute; width: 40px; height: 40px; ${css}`
    root.append(element)
    return element
}

/** A box relative to its stage. */
function within(root: HTMLElement, element: HTMLElement): OBox {
    const r = pageBox(root)
    const b = pageBox(element)
    return { x: b.x - r.x, y: b.y - r.y, w: b.w, h: b.h }
}

function only(element: HTMLElement): Animation {
    const list = element.getAnimations()
    if (list.length !== 1) {
        throw new Error(`${list.length} animations on the element, not 1`)
    }
    return list[0]!
}

function report(promise: Promise<LayoutReport>): {
    value: LayoutReport | null
} {
    const out = { value: null as LayoutReport | null }
    void promise.then((r) => {
        out.value = r
    })
    return out
}

const TIMINGS: [string, TimingFunction][] = [
    ['linear', timing.linear()],
    ['ease-out', timing.easeOut()],
    ['spring', timing.spring({ m: 1, k: 170, c: 22 })],
]

/** Same move on both engines; the WAAPI animation is paused and seeked to each frame's time. */
export async function W1(): Promise<string> {
    const lines: string[] = []
    let worst = 0
    for (const [name, fn] of TIMINGS) {
        for (const delay of [0, 0.1]) {
            const mc = createManualClock()
            const motion = { duration: 0.5, delay, timing: fn }
            const rafRoot = stage()
            const waapiRoot = stage()
            const raf = createLayoutGroup({ clock: mc.clock, motion })
            const waapi = createLayoutGroup({ engine: 'waapi', motion })
            const css =
                'left: 0; top: 20px; translate: 6px 2px; transform-origin: 0 0;'
            const r = box(rafRoot, css)
            const w = box(waapiRoot, css)
            raf.add(r, { layout: 'position' })
            waapi.add(w, { layout: 'position' })
            try {
                for (const [group, element] of [
                    [raf, r],
                    [waapi, w],
                ] as [LayoutGroup, HTMLElement][]) {
                    group.capture()
                    element.style.left = '300px'
                    element.style.top = '60px'
                    void group.flush()
                }
                // the author's style after the change: the engine adds nothing
                const style = w.style.cssText
                const animation = only(w)
                animation.pause()
                let error = 0
                for (let k = 0; k * DT <= delay + 0.5 + DT; k++) {
                    mc.frame(FRAME_MS)
                    animation.currentTime = k * DT * 1000
                    error = Math.max(
                        error,
                        maxDiff(within(waapiRoot, w), within(rafRoot, r))
                    )
                }
                if (!(error <= 0.5)) {
                    throw new Error(
                        `${name} delay ${delay}: differs by ${error} px`
                    )
                }
                expectEqual(w.style.cssText, style, `${name}: no inline write`)
                worst = Math.max(worst, error)
                lines.push(
                    `${name}${delay ? ' +delay' : ''} ${error.toFixed(4)}`
                )
            } finally {
                raf.dispose()
                waapi.dispose()
                rafRoot.remove()
                waapiRoot.remove()
            }
        }
    }
    return `RAF vs WAAPI every frame: max ${worst.toFixed(4)} px (${lines.join(', ')}); no inline style written`
}

/** A retarget starts from the drawn box, without a velocity term (§10), on the oracle. */
export async function W2(): Promise<string> {
    const root = stage()
    const fn = timing.spring({ m: 1, k: 170, c: 22 })
    const group = createLayoutGroup({
        engine: 'waapi',
        motion: { duration: 0.5, timing: fn },
    })
    const element = box(root, 'left: 0; top: 20px; transform-origin: 0 0;')
    group.add(element, { layout: 'position' })
    try {
        group.capture()
        element.style.left = '300px'
        const first = report(group.flush())
        const old = only(element)
        old.pause()
        old.currentTime = 160
        const drawn = within(root, element)
        group.capture()
        element.style.left = '100px'
        const second = report(group.flush())
        await Promise.resolve()
        expectEqual(first.value?.status, 'interrupted', 'first run')
        expectEqual(old.playState, 'idle', 'the old animation is cancelled')
        const animation = only(element)
        animation.pause()
        const track = spec(
            drawn,
            { x: 100, y: 20, w: 40, h: 40 },
            {
                duration: 0.5,
                timing: fn,
                fx: 0,
                fy: 0,
            }
        )
        let worst = 0
        for (let k = 0; k * DT <= 0.5 + DT; k++) {
            animation.currentTime = k * DT * 1000
            const error = maxDiff(
                within(root, element),
                expectedBox(track, k * DT)
            )
            if (!(error <= 0.5)) {
                throw new Error(`t=${k * DT}: differs by ${error} px`)
            }
            worst = Math.max(worst, error)
        }
        animation.play()
        animation.finish()
        await sleep(0)
        expectEqual(second.value?.status, 'ended', 'second run')
        expectEqual(element.getAnimations().length, 0, 'no animation left')
        return `retarget from (${drawn.x.toFixed(2)}, ${drawn.y}) at 0.16 s: on the oracle within ${worst.toFixed(4)} px; ended, nothing left`
    } finally {
        group.dispose()
        root.remove()
    }
}

/** Created in the flush, no startTime: the first painted frame after a 120 ms block is ≤ 6 %. */
export async function W3(): Promise<string> {
    const root = stage()
    const group = createLayoutGroup({
        engine: 'waapi',
        motion: { duration: 0.4, timing: timing.linear() },
    })
    const element = box(root, 'left: 0; top: 20px;')
    group.add(element, { layout: 'position' })
    try {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        group.capture()
        element.style.left = '300px'
        const done = report(group.flush())
        const end = performance.now() + 120
        while (performance.now() < end) {
            // the main thread is blocked
        }
        await new Promise((resolve) => requestAnimationFrame(resolve))
        const first = within(root, element).x / 300
        if (!(first <= 0.06)) {
            throw new Error(`first frame at ${(first * 100).toFixed(2)} %`)
        }
        await sleep(600)
        expectEqual(done.value?.status, 'ended', 'run')
        expectEqual(element.getAnimations().length, 0, 'no animation left')
        return `first painted frame after a 120 ms block at ${(first * 100).toFixed(2)} %`
    } finally {
        group.dispose()
        root.remove()
    }
}

function code(fn: () => void): string {
    try {
        fn()
    } catch (error) {
        return isAniError(error) ? error.code : String(error)
    }
    return 'no error'
}

/** Anything but a top-level 'position' participant throws at add/set. */
export async function W4(): Promise<string> {
    const root = stage()
    const group = createLayoutGroup({ engine: 'waapi' })
    const parent = box(root, 'left: 0; top: 0;')
    const child = box(parent, 'left: 0; top: 0;')
    try {
        const cases: [string, () => void][] = [
            ['default layout', () => group.add(parent)],
            ['layout true', () => group.add(parent, { layout: true })],
            ['size', () => group.add(parent, { layout: 'size' })],
            [
                'layoutId',
                () => group.add(parent, { layout: 'position', layoutId: 'x' }),
            ],
            [
                'layoutAnchor',
                () =>
                    group.add(parent, {
                        layout: 'position',
                        layoutAnchor: { x: 0.5, y: 0.5 },
                    }),
            ],
            [
                'radius',
                () => group.add(parent, { layout: 'position', radius: true }),
            ],
            [
                'engine',
                () =>
                    createLayoutGroup({
                        engine: 'webgl' as 'waapi',
                    }),
            ],
        ]
        for (const [name, fn] of cases) {
            expectEqual(code(fn), 'ANI_INVALID_OPTIONS', name)
        }
        group.add(parent, { layout: 'position' })
        expectEqual(
            code(() => group.add(child, { layout: 'position' })),
            'ANI_INVALID_OPTIONS',
            'nested add'
        )
        expectEqual(
            code(() => group.set(parent, {})),
            'ANI_INVALID_OPTIONS',
            'set options'
        )

        const late = box(root, 'left: 60px; top: 0;')
        group.add(late, { layout: 'position' })
        group.capture()
        parent.append(late)
        expectEqual(
            code(() => group.set(late, { layout: 'position' })),
            'ANI_INVALID_OPTIONS',
            'nested set'
        )
        late.style.left = '20px'
        // biome-ignore lint/suspicious/noConsole: capture the expected development warning
        const originalWarn = console.warn
        const warnings: string[] = []
        console.warn = (...args: unknown[]) => {
            warnings.push(args.map(String).join(' '))
        }
        let nested: LayoutReport
        try {
            nested = await group.flush()
        } finally {
            console.warn = originalWarn
        }
        expectEqual(
            nested.snapped.some(
                ({ element, reason }) =>
                    element === late && reason === 'unsupported'
            ),
            true,
            'later nesting snaps unsupported'
        )
        expectEqual(warnings.length, 1, 'later nesting warns once')

        root.append(late)
        group.capture()
        parent.style.left = '20px'
        const supports = CSS.supports
        let noLinear: LayoutReport
        try {
            CSS.supports = () => false
            noLinear = await group.flush()
        } finally {
            CSS.supports = supports
        }
        expectEqual(
            noLinear.snapped.some(
                ({ element, reason }) =>
                    element === parent && reason === 'unsupported'
            ),
            true,
            'missing CSS linear() snaps unsupported'
        )
        return `${cases.length + 3} invalid shapes throw ANI_INVALID_OPTIONS; later nesting and missing CSS linear() snap unsupported`
    } finally {
        group.dispose()
        root.remove()
    }
}

/** The document timeline advances even when the Ani clock's time scale is zero. */
export async function W6(): Promise<string> {
    const mc = createManualClock({ timeScale: 0 })
    const root = stage()
    const group = createLayoutGroup({
        clock: mc.clock,
        engine: 'waapi',
        motion: { duration: 0.4, timing: timing.linear() },
    })
    const element = box(root, 'left: 0; top: 20px;')
    group.add(element, { layout: 'position' })
    try {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        group.capture()
        element.style.left = '300px'
        void group.flush()
        await new Promise((resolve) => requestAnimationFrame(resolve))
        await sleep(120)
        const x = within(root, element).x
        if (!(x > 20 && x < 300)) {
            throw new Error(
                `document timeline did not advance with clock timeScale 0: x=${x}`
            )
        }
        group.finish()
        await sleep(0)
        return `clock timeScale 0; document timeline advanced to x = ${x.toFixed(2)} px; reduced motion is covered by W5`
    } finally {
        group.dispose()
        root.remove()
    }
}

/** finish(), removal, reduced motion and dispose: animations cancelled, reports exact, inline style untouched. */
export async function W5(): Promise<string> {
    const mc = createManualClock()
    const root = stage()
    const group = createLayoutGroup({
        clock: mc.clock,
        engine: 'waapi',
        motion: { duration: 0.5 },
    })
    const a = box(root, 'left: 0; top: 0;')
    const b = box(root, 'left: 0; top: 60px;')
    const styles = [a.style.cssText, b.style.cssText]
    group.add(a, { layout: 'position' })
    const removeB = group.add(b, { layout: 'position' })
    const move = (left: string) => {
        group.capture()
        a.style.left = left
        b.style.left = left
        styles[0] = a.style.cssText
        styles[1] = b.style.cssText
        return report(group.flush())
    }
    try {
        // finish
        let run = move('200px')
        expectEqual(group.stats.tracks, 2, 'two animations')
        group.finish()
        await sleep(0)
        expectEqual(run.value?.status, 'ended', 'finish')
        expectEqual(
            a.getAnimations().length + b.getAnimations().length,
            0,
            'finish cancels'
        )
        // removal: the run goes on for the other node, then ends
        run = move('0px')
        removeB()
        expectEqual(b.getAnimations().length, 0, 'removal cancels')
        expectEqual(b.style.cssText, styles[1], 'removed: untouched')
        only(a).finish()
        await sleep(0)
        expectEqual(run.value?.status, 'ended', 'the rest of the run')
        // reduced motion: a jump, no animation
        mc.setReducedMotion(true)
        run = move('100px')
        await sleep(0)
        expectEqual(run.value?.status, 'reduced', 'reduced')
        expectEqual(a.getAnimations().length, 0, 'reduced: none')
        mc.setReducedMotion(false)
        // dispose mid-run
        run = move('300px')
        group.dispose()
        await sleep(0)
        expectEqual(run.value?.status, 'disposed', 'dispose')
        expectEqual(a.getAnimations().length, 0, 'dispose cancels')
        expectEqual(a.style.cssText, styles[0], 'untouched inline style')
        return 'finish, removal, reduced motion and dispose cancel their animations with exact reports; no inline style written'
    } finally {
        group.dispose()
        root.remove()
    }
}
