import { follow } from '@freestylejs/ani-core'
import { createManualClock } from '@freestylejs/ani-core/testing'
import { createElement as h, StrictMode, useState } from 'react'
import { flushSync } from 'react-dom'
import { IosAppFolder } from '../../../packages/web/src/components/ios/ios_app_folder'
import { IosAppStore } from '../../../packages/web/src/components/ios/ios_app_store'
import { IosExposureSlider } from '../../../packages/web/src/components/ios/ios_exposure_slider'
import { STORE_ITEMS } from '../../../packages/web/src/components/ios/store_shared'
import { macrotask, microtasks, mountRoot } from './layout_frames'

declare global {
    interface Window {
        __iosQualityFrames?: Record<string, unknown>
        aniPointerInput: (
            kind: 'move' | 'down' | 'up',
            x?: number,
            y?: number
        ) => Promise<void>
        /** Optional diagnostic capture; absent from normal regression runs. */
        __iosQualityCapture?: (time: number) => Promise<void>
    }
}
const DT = 1000 / 60
function box(element: Element | null) {
    if (!element) return null
    const r = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    let opacity = 1
    for (let node: Element | null = element; node; node = node.parentElement)
        opacity *= Number(getComputedStyle(node).opacity)
    return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        opacity,
        ownOpacity: (element as HTMLElement).style.opacity,
        translate: style.translate,
        scale: style.scale,
        transform: style.transform,
    }
}
function save(name: string, result: unknown) {
    ;(window.__iosQualityFrames ??= {})[name] = result
}
async function commit(action: () => void) {
    flushSync(action)
    await microtasks()
}
async function advance(
    clock: ReturnType<typeof createManualClock>,
    count: number,
    sample: (time: number) => void
) {
    sample(0)
    await window.__iosQualityCapture?.(0)
    for (let i = 0; i < count; i++) {
        clock.frame(DT)
        await microtasks()
        await macrotask()
        sample((i + 1) * DT)
        if ([5, 11, 23, 39, 79].includes(i))
            await window.__iosQualityCapture?.((i + 1) * DT)
    }
}
export async function Folder(): Promise<string> {
    const view = mountRoot()
    view.host.style.cssText = 'position:relative;width:100%;height:850px;'
    const mc = createManualClock()
    const rows: unknown[] = []
    try {
        await view.render(h(IosAppFolder, { clock: mc.clock }))
        const preview = box(view.host.querySelector('[data-folder-open]'))
        const pagesBefore = box(
            view.host.querySelector(
                '[data-folder-icon="pages"] .ani-ios-folder-icon-inner'
            )
        )
        const identity = view.host.querySelector('[data-folder-icon="pages"]')
        await window.__iosQualityCapture?.(-1)
        await commit(() =>
            view.host
                .querySelector<HTMLButtonElement>('[data-folder-open]')!
                .click()
        )
        await advance(mc, 90, (t) =>
            rows.push({
                phase: 'open',
                t,
                pages: box(
                    view.host.querySelector(
                        '[data-folder-icon="pages"] .ani-ios-folder-icon-inner'
                    )
                ),
                surface: box(
                    view.host.querySelector('.ani-ios-folder-expanded')
                ),
            })
        )
        await commit(() =>
            view.host
                .querySelector<HTMLElement>('[role="dialog"]')!
                .dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'Escape',
                        bubbles: true,
                    })
                )
        )
        const closing: Array<{ t: number; pages: ReturnType<typeof box> }> = []
        await advance(mc, 90, (t) => {
            const row = {
                t,
                pages: box(
                    view.host.querySelector(
                        '[data-folder-icon="pages"] .ani-ios-folder-icon-inner'
                    )
                ),
            }
            closing.push(row)
            rows.push({ phase: 'close', ...row })
        })
        save('folder', { preview, pagesBefore, rows, clock: mc.clock.size })
        const first = (
            rows[0] as { pages: NonNullable<ReturnType<typeof box>> }
        ).pages
        if (
            !pagesBefore ||
            !first ||
            Math.max(
                ...(['x', 'y', 'w', 'h'] as const).map((key) =>
                    Math.abs(first[key] - pagesBefore[key])
                )
            ) > 0.5
        )
            throw new Error(
                'Pages must start from its actual hidden mini-grid box, not the final expanded slot'
            )
        if (identity !== view.host.querySelector('[data-folder-icon="pages"]'))
            throw new Error('Pages identity was replaced during open/close')
        const at200 = closing.find((row) => row.t >= 200)!
        if (at200.pages && at200.pages.opacity > 0.05)
            throw new Error(
                `Pages still visible at ${at200.t.toFixed(1)}ms: opacity ${at200.pages.opacity}; must exit rather than wait for the shared surface's settle`
            )
        if (mc.clock.size !== 0) throw new Error('Folder leaked clock work')
        return 'Pages exit is finished by 200ms; shared surface may settle independently'
    } finally {
        view.dispose()
        mc.clock.dispose()
    }
}
export async function Store(): Promise<string> {
    const view = mountRoot()
    view.host.style.cssText = 'position:relative;width:100%;height:1200px;'
    const mc = createManualClock()
    const rows: unknown[] = []
    try {
        await view.render(h(IosAppStore, { clock: mc.clock }))
        await Promise.all(
            [...view.host.querySelectorAll('img')].map((image) =>
                image.decode().catch(() => undefined)
            )
        )
        const sourceBitmap = view.host.querySelector<HTMLImageElement>(
            '[data-store-card="a"] img'
        )!
        const before = {
            surface: box(view.host.querySelector('[data-store-card="a"]')),
            image: box(
                view.host.querySelector(
                    '[data-store-card="a"] [data-store-image]'
                )
            ),
            bitmap: box(sourceBitmap),
        }
        await window.__iosQualityCapture?.(-1)
        await commit(() =>
            view.host
                .querySelector<HTMLButtonElement>('[data-store-card="a"]')!
                .click()
        )
        // Decode-ready paint must survive the handoff. Correct rectangles alone
        // do not keep the old image's decoded pixels alive in a new <img>.
        if (!sourceBitmap.isConnected || box(sourceBitmap)!.opacity < 0.999)
            throw new Error(
                'Store discarded the presented bitmap before the shared handoff'
            )
        await advance(mc, 100, (t) =>
            rows.push({
                t,
                surface: box(
                    view.host.querySelector('[data-store-detail="a"]')
                ),
                image: box(
                    view.host.querySelector(
                        '[data-store-detail="a"] [data-store-image]'
                    )
                ),
                bitmap: box(
                    view.host.querySelector('[data-store-detail="a"] img')
                ),
                title: box(
                    view.host.querySelector(
                        '[data-store-detail="a"] [data-store-title]'
                    )
                ),
                scrim: box(view.host.querySelector('[data-store-scrim]')),
            })
        )
        save('store', { before, rows, clock: mc.clock.size })
        const first = rows[0] as {
            surface: NonNullable<ReturnType<typeof box>>
            image: NonNullable<ReturnType<typeof box>>
            bitmap: NonNullable<ReturnType<typeof box>>
        }
        const b = before.surface!
        const gap = Math.max(
            Math.abs(first.surface.x - b.x),
            Math.abs(first.surface.y - b.y),
            Math.abs(first.surface.w - b.w),
            Math.abs(first.surface.h - b.h)
        )
        if (gap > 0.5)
            throw new Error(
                `Store first frame discontinuity ${gap.toFixed(3)}px: before=${JSON.stringify(before.surface)} first=${JSON.stringify(first.surface)}`
            )
        const imageGap = Math.max(
            Math.abs(first.image.x - before.image!.x),
            Math.abs(first.image.y - before.image!.y),
            Math.abs(first.image.w - before.image!.w),
            Math.abs(first.image.h - before.image!.h)
        )
        if (imageGap > 0.5)
            throw new Error(
                `Store image first frame discontinuity ${imageGap.toFixed(3)}px despite surface continuity ${gap.toFixed(4)}px`
            )
        const bitmapGap = Math.max(
            ...(['x', 'y', 'w', 'h'] as const).map((key) =>
                Math.abs(first.bitmap[key] - before.bitmap![key])
            )
        )
        if (bitmapGap > 0.5)
            throw new Error(
                `Store bitmap first frame discontinuity ${bitmapGap.toFixed(3)}px; crop geometry alone is insufficient`
            )
        let edgeGap = 0
        for (const row of rows as (typeof first)[]) {
            edgeGap = Math.max(
                edgeGap,
                Math.abs(row.surface.x - row.image.x),
                Math.abs(row.surface.y - row.image.y),
                Math.abs(row.surface.w - row.image.w)
            )
            if (Math.abs(row.bitmap.h / row.bitmap.w - 1.6) > 0.001)
                throw new Error(
                    'Store bitmap distorts independently of its crop/surface'
                )
        }
        if (edgeGap > 0.5)
            throw new Error(
                `Store image/surface separation ${edgeGap.toFixed(3)}px`
            )
        if (sourceBitmap.isConnected)
            throw new Error(
                'Store retained a stale source bitmap after the handoff settled'
            )
        return `Store initial errors surface ${gap.toFixed(4)}px crop ${imageGap.toFixed(4)}px bitmap ${bitmapGap.toFixed(4)}px; every-frame aligned edges ${edgeGap.toFixed(4)}px`
    } finally {
        view.dispose()
        mc.clock.dispose()
    }
}
export async function Exposure(): Promise<string> {
    const view = mountRoot()
    view.host.style.cssText =
        'position:relative;width:100%;height:850px;display:grid;place-items:center;'
    const mc = createManualClock()
    try {
        await view.render(
            h(IosExposureSlider, {
                clock: mc.clock,
                imageSrc:
                    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="500" height="300"%3E%3Crect width="500" height="300" fill="%23334455"/%3E%3C/svg%3E',
            })
        )
        const track = view.host.querySelector<HTMLElement>('[role="slider"]')!
        const initial = [...view.host.querySelectorAll('[data-tick]')].map(
            (element) => ({
                value: element.getAttribute('data-tick'),
                ...box(element)!,
            })
        )
        await commit(() =>
            track.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'End',
                    bubbles: true,
                    cancelable: true,
                })
            )
        )
        const rows: unknown[] = []
        await advance(mc, 100, (t) =>
            rows.push({
                t,
                track: box(track),
                value: view.host.querySelector('[data-exposure-reset] span')
                    ?.textContent,
                ticks: [...view.host.querySelectorAll('[data-tick]')].map(
                    (element) => ({
                        value: element.getAttribute('data-tick'),
                        ...box(element)!,
                    })
                ),
            })
        )
        save('exposure', { initial, rows, clock: mc.clock.size })
        const end = rows.at(-1) as {
            ticks: Array<{ value: string; h: number; opacity: number }>
        }
        const middle = end.ticks.find((tick) => tick.value === '0')!
        if (Math.abs(initial.find((tick) => tick.value === '0')!.h - 40) > 0.5)
            throw new Error(
                'Exposure nominal zero notch must not inflate from 40px to 64px'
            )
        if (
            middle.opacity >= 0.8 ||
            end.ticks.some(
                (tick) => Number(tick.value) > 0 && tick.opacity > 0.001
            )
        )
            throw new Error(
                'Exposure must collapse the traversed half at the observed positive limit'
            )
        const arc = view.host.querySelector<SVGCircleElement>(
            '[data-exposure-arc]'
        )
        if (!arc || Math.abs(Number(arc.style.strokeDashoffset)) > 0.01)
            throw new Error(
                'Exposure progress arc must reach a full circle at 100'
            )
        if (mc.clock.size !== 0) throw new Error('Exposure leaked clock work')
        return '40px zero / signed notch collapse / progress arc / bounded value / no clock leak'
    } finally {
        view.dispose()
        mc.clock.dispose()
    }
}

export const pageOptions = {
    StoreNarrow: { viewport: { width: 390, height: 844 } },
    FolderNarrow: { viewport: { width: 390, height: 844 } },
}

type SampleBox = NonNullable<ReturnType<typeof box>>
function gap(
    a: SampleBox | null,
    b: SampleBox | null,
    label: string,
    keys: readonly ('x' | 'y' | 'w' | 'h')[] = ['x', 'y', 'w', 'h']
): number {
    if (!a || !b) throw new Error(`${label}: missing box`)
    const delta = Math.max(...keys.map((key) => Math.abs(a[key] - b[key])))
    if (delta > 0.5)
        throw new Error(
            `${label}: ${delta.toFixed(5)}px discontinuity; before=${JSON.stringify(a)} after=${JSON.stringify(b)}`
        )
    return delta
}
async function tick(
    mc: ReturnType<typeof createManualClock>,
    count: number,
    check: () => void = () => undefined
) {
    for (let i = 0; i < count; i++) {
        mc.frame(DT)
        await microtasks()
        await macrotask()
        check()
    }
}
function storePicture(root: ParentNode, selector: string) {
    const surface = root.querySelector(selector)
    return {
        surface: box(surface),
        crop: box(surface?.querySelector('[data-store-image]') ?? null),
        bitmap: box(surface?.querySelector('img') ?? null),
        title: box(surface?.querySelector('[data-store-title]') ?? null),
    }
}
function pictureGap(
    a: ReturnType<typeof storePicture>,
    b: ReturnType<typeof storePicture>,
    label: string
) {
    return Math.max(
        gap(a.surface, b.surface, `${label} surface`),
        gap(a.crop, b.crop, `${label} crop`),
        gap(a.bitmap, b.bitmap, `${label} bitmap`),
        gap(a.title, b.title, `${label} title`, ['x', 'y'])
    )
}

/** Deterministic artwork, real product components/crops, four distinct aspect ratios. */
function patternedItems() {
    return STORE_ITEMS.map((item) => ({
        ...item,
        imageSrc: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${item.imageWidth}" height="${item.imageHeight}"><defs><pattern id="p" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="#87b8d8"/><path d="M0 0H100V50H0Z" fill="#1a4357"/><path d="M50 0V100" stroke="#fff" stroke-width="4"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`)}`,
    }))
}

async function storeCycles(): Promise<string> {
    const view = mountRoot()
    view.host.style.cssText = 'position:relative;width:100%;min-height:1200px;'
    const mc = createManualClock()
    const items = patternedItems()
    const rows: unknown[] = []
    const show = (selectedId: string | null) =>
        view.render(h(IosAppStore, { clock: mc.clock, items, selectedId }))
    let continuity = 0,
        aligned = 0
    try {
        await show(null)
        await Promise.all(
            [...view.host.querySelectorAll('img')].map((image) =>
                image.decode().catch(() => undefined)
            )
        )
        for (const item of items) {
            const ratio = item.imageHeight! / item.imageWidth!
            const inspect = (selector: string, phase: string) => {
                const sample = storePicture(view.host, selector)
                if (!sample.bitmap || !sample.crop || !sample.surface)
                    throw new Error(`${phase}: missing product layer`)
                const aspectError = Math.abs(
                    sample.bitmap.h / sample.bitmap.w - ratio
                )
                if (aspectError > 0.001)
                    throw new Error(
                        `${item.id} ${phase}: bitmap aspect error ${aspectError.toFixed(5)}`
                    )
                aligned = Math.max(
                    aligned,
                    gap(
                        sample.surface,
                        sample.crop,
                        `${item.id} ${phase}: attached edges`,
                        ['x', 'y', 'w']
                    )
                )
                rows.push({ id: item.id, phase, ...sample, aspectError })
                return sample
            }
            const grid = `[data-store-card="${item.id}"]`
            const detail = `[data-store-detail="${item.id}"]`
            const before = inspect(grid, 'before')
            await show(item.id)
            continuity = Math.max(
                continuity,
                pictureGap(before, inspect(detail, 'open-0'), `${item.id} open`)
            )
            await tick(mc, 7, () => inspect(detail, 'opening'))
            const reversing = inspect(detail, 'reverse-before')
            await show(null)
            continuity = Math.max(
                continuity,
                pictureGap(
                    reversing,
                    inspect(grid, 'reverse-0'),
                    `${item.id} reverse`
                )
            )
            await tick(mc, 4, () => inspect(grid, 'closing'))
            const catching = inspect(grid, 'reopen-before')
            await show(item.id)
            continuity = Math.max(
                continuity,
                pictureGap(
                    catching,
                    inspect(detail, 'reopen-0'),
                    `${item.id} reopen`
                )
            )
            await tick(mc, 70, () => inspect(detail, 'reopened'))
            if (view.host.querySelectorAll('dialog').length !== 1)
                throw new Error('Reopen retained duplicate dialogs')
            const closedFrom = inspect(detail, 'close-before')
            await show(null)
            continuity = Math.max(
                continuity,
                pictureGap(
                    closedFrom,
                    inspect(grid, 'close-0'),
                    `${item.id} close`
                )
            )
            await tick(mc, 15, () => inspect(grid, 'close'))
            const scrim =
                view.host.querySelector<HTMLElement>('[data-store-scrim]')
            if (scrim && Number(getComputedStyle(scrim).opacity) > 0.05)
                throw new Error(
                    'Scrim stays opaque until the retained sheet unmounts'
                )
            await tick(mc, 70, () => inspect(grid, 'closed'))
            if (view.host.querySelector('dialog'))
                throw new Error('Retained modal after settle')
            if (mc.clock.size !== 0)
                throw new Error('Store retains clock work after close')
        }
        save(`store-cycles-${innerWidth}`, { rows, continuity, aligned })
        return `4 cards, open/close/reopen; ${rows.length} layer frames; worst continuity ${continuity.toFixed(4)}px, attached edges ${aligned.toFixed(4)}px, exact image aspects, modal/clock cleanup`
    } finally {
        view.dispose()
        mc.clock.dispose()
    }
}
export async function StoreReversal(): Promise<string> {
    return storeCycles()
}
export async function StoreNarrow(): Promise<string> {
    return storeCycles()
}

async function folderCycles(): Promise<string> {
    const view = mountRoot()
    view.host.style.cssText = 'position:relative;width:100%;height:750px;'
    const mc = createManualClock()
    let worst = 0
    try {
        for (const count of [1, 4, 5, 6, 8, 12]) {
            const items = Array.from({ length: count }, (_, i) => ({
                id: String(i),
                label: `App ${i}`,
            }))
            const show = (open: boolean) =>
                view.render(
                    h(IosAppFolder, {
                        key: count,
                        clock: mc.clock,
                        items,
                        open,
                    })
                )
            await show(false)
            const icons = [...view.host.querySelectorAll('[data-folder-icon]')]
            if (
                icons.length !== count ||
                new Set(
                    icons.map((icon) => icon.getAttribute('data-folder-icon'))
                ).size !== count
            )
                throw new Error(`Duplicate compact identity for ${count} apps`)
            const snapshot = () => icons.map((icon) => box(icon)!)
            for (const open of [true, false, true, false, true, false]) {
                const before = snapshot()
                await show(open)
                icons.forEach((icon, i) => {
                    if (!icon.isConnected)
                        throw new Error('Folder icon was replaced')
                    worst = Math.max(
                        worst,
                        gap(
                            before[i]!,
                            box(icon),
                            `${count} apps reverse ${open}`
                        )
                    )
                })
                await tick(mc, 5)
            }
            await tick(mc, 100)
            if (mc.clock.size !== 0)
                throw new Error('Folder retains clock after reversal')
            if (view.host.querySelector('[role="dialog"]'))
                throw new Error('Folder closed but retains dialog role')
        }
        return `1/4/5/6/8/12 apps, 36 rapid reversals, persistent unique identities, worst first-frame error ${worst.toFixed(4)}px, no clock leak`
    } finally {
        view.dispose()
        mc.clock.dispose()
    }
}
export async function FolderReversal(): Promise<string> {
    return folderCycles()
}
export async function FolderNarrow(): Promise<string> {
    return folderCycles()
}

export async function FolderInvariantLabels(): Promise<string> {
    const view = mountRoot()
    const mc = createManualClock()
    const items = Array.from({ length: 8 }, (_, i) => ({
        id: String(i),
        label: `Application ${i}`,
    }))
    const show = (open: boolean) =>
        view.render(h(IosAppFolder, { clock: mc.clock, items, open }))
    let worst = 0
    try {
        await show(true)
        await tick(mc, 100)
        const labels = [
            ...view.host.querySelectorAll('.ani-ios-folder-app-label'),
        ]
        const sizes = labels.map((label) => box(label)!)
        const check = () =>
            labels.forEach((label, i) => {
                worst = Math.max(
                    worst,
                    gap(sizes[i]!, box(label), 'invariant folder label', [
                        'w',
                        'h',
                    ])
                )
            })
        for (const open of [false, true, false, true, false]) {
            await show(open)
            check()
            await tick(mc, 7, check)
        }
        await tick(mc, 100, check)
        expectNoWork(mc, 'Folder label')
        return `All labels invariant during 5 reversals; worst size error ${worst.toFixed(5)}px`
    } finally {
        view.dispose()
        mc.clock.dispose()
    }
}
function expectNoWork(mc: ReturnType<typeof createManualClock>, label: string) {
    if (mc.clock.size !== 0) throw new Error(`${label} leaked clock work`)
}

export async function FolderModal(): Promise<string> {
    const view = mountRoot()
    const mc = createManualClock({ reducedMotion: true })
    const items = [{ id: 'one', label: 'One' }]
    let outsideClicks = 0
    const outsideCount = () => outsideClicks
    const clickOutside = async () => {
        await window.aniPointerInput('move', 10, 10)
        await window.aniPointerInput('down')
        await window.aniPointerInput('up')
    }
    const show = (open: boolean) =>
        view.render(
            h(
                'div',
                null,
                h(
                    'button',
                    {
                        'data-external': '',
                        onClick: () => outsideClicks++,
                        style: {
                            position: 'fixed',
                            left: 0,
                            top: 0,
                            zIndex: 10,
                        },
                    },
                    'External'
                ),
                h(IosAppFolder, { clock: mc.clock, items, open })
            )
        )
    try {
        await show(false)
        const external =
            view.host.querySelector<HTMLButtonElement>('[data-external]')!
        external.focus()
        if (document.activeElement !== external)
            throw new Error('External baseline focus missing')
        await clickOutside()
        if (outsideCount() !== 1)
            throw new Error('External trusted-pointer baseline missing')
        await show(true)
        external.focus()
        if (document.activeElement === external)
            throw new Error('Open Folder permits focus to leave its modal')
        if (document.elementFromPoint(10, 10) === external)
            throw new Error('Open Folder permits external hit target')
        const modal = view.host.querySelector('[role="dialog"]')!
        if (!modal.matches(':modal'))
            throw new Error('Folder must own a native modal session')
        await clickOutside()
        if (outsideCount() !== 1 || document.activeElement === external)
            throw new Error('Trusted pointer escaped the Folder modal')
        await show(false)
        external.focus()
        if (document.activeElement !== external)
            throw new Error('Close did not restore external focus eligibility')
        await clickOutside()
        if (outsideCount() !== 2)
            throw new Error('Closed Folder still blocks trusted host input')
        await show(true)
        await view.render(h('button', { 'data-external': '' }, 'After unmount'))
        const after = view.host.querySelector<HTMLButtonElement>('button')!
        after.focus()
        if (
            document.activeElement !== after ||
            document.querySelector(':modal')
        )
            throw new Error('Unmount leaked modal isolation')
        expectNoWork(mc, 'Folder modal')
        return 'Native modal blocks trusted external pointer/focus/hit targeting; close and unmount restore host interaction'
    } finally {
        view.dispose()
        mc.clock.dispose()
    }
}

export async function FolderStrictModeInstances(): Promise<string> {
    const view = mountRoot()
    const mc = createManualClock({ reducedMotion: true })
    const items = [{ id: 'shared-input-id', label: 'App' }]
    const show = (first: boolean, second: boolean) =>
        view.render(
            h(
                StrictMode,
                null,
                h(
                    'div',
                    null,
                    h(IosAppFolder, {
                        key: 'first',
                        title: 'First',
                        clock: mc.clock,
                        items,
                        open: first,
                    }),
                    h(IosAppFolder, {
                        key: 'second',
                        title: 'Second',
                        clock: mc.clock,
                        items,
                        open: second,
                    })
                )
            )
        )
    try {
        await show(false, false)
        const stages = [...view.host.querySelectorAll('[data-folder-instance]')]
        if (
            stages.length !== 2 ||
            stages[0]!.getAttribute('data-folder-instance') ===
                stages[1]!.getAttribute('data-folder-instance')
        )
            throw new Error('Folder instances share their namespace')
        const dialogs = stages.map((stage) => stage.querySelector('dialog')!)
        await show(true, false)
        if (!dialogs[0]!.matches(':modal') || dialogs[1]!.matches(':modal'))
            throw new Error('Opening one Folder changed the other modal state')
        await show(true, true)
        if (
            document.querySelectorAll(':modal').length !== 2 ||
            !dialogs[1]!.contains(document.activeElement)
        )
            throw new Error('The topmost Folder does not own modal focus')
        await show(true, false)
        if (!dialogs[0]!.matches(':modal') || dialogs[1]!.matches(':modal'))
            throw new Error('Closing one Folder disrupted its sibling modal')
        await view.render(h('button', null, 'Restored host'))
        const button = view.host.querySelector('button')!
        button.focus()
        if (
            document.querySelector(':modal') ||
            document.activeElement !== button
        )
            throw new Error(
                'StrictMode/multiple Folder teardown leaked modality'
            )
        expectNoWork(mc, 'StrictMode Folder instances')
        return 'StrictMode replay, distinct namespaces, stacked native modal focus, isolated close and complete host/clock restoration'
    } finally {
        view.dispose()
        mc.clock.dispose()
    }
}

/** Actual trusted pointer input, actual React batching, actual Ani follower. */
export async function ExposureControlledRelease(): Promise<string> {
    const view = mountRoot()
    view.host.style.cssText = 'width:500px;max-width:100%;margin:0 auto;'
    const mc = createManualClock()
    const records: unknown[] = []
    try {
        for (const mode of [
            'reject',
            'accept',
            'quantize',
            'disable',
            'uncontrolled',
        ] as const) {
            const commits: number[] = []
            let trustedUp = false
            const quantize = (value: number) =>
                Math.max(
                    -99.75,
                    Math.min(99.75, Math.round(value / 10) * 10 + 0.25)
                )
            function Owner() {
                const [value, setValue] = useState(25)
                const [disabled, setDisabled] = useState(false)
                return h(IosExposureSlider, {
                    clock: mc.clock,
                    disabled,
                    imageSrc:
                        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="500" height="300"/%3E',
                    defaultValue: 25,
                    ...(mode !== 'uncontrolled' && { value }),
                    onValueChange: (next) => {
                        if (mode === 'accept' || mode === 'disable')
                            setValue(next)
                        if (mode === 'quantize') setValue(quantize(next))
                        if (mode === 'disable' && next > 45) setDisabled(true)
                    },
                    onValueCommit: (value) => commits.push(value),
                })
            }
            await view.render(h(Owner, { key: mode }))
            const track =
                view.host.querySelector<HTMLElement>('[role="slider"]')!
            track.addEventListener(
                'pointerup',
                (event) => {
                    trustedUp = event.isTrusted
                },
                { once: true }
            )
            const rect = track.getBoundingClientRect()
            const x = rect.x + rect.width / 2,
                y = rect.y + rect.height / 2
            await window.aniPointerInput('move', x, y)
            await window.aniPointerInput('down')
            await new Promise((resolve) => setTimeout(resolve, 20))
            await window.aniPointerInput('move', x - 20, y)
            await new Promise((resolve) => setTimeout(resolve, 20))
            const moved = new Promise<void>((resolve) => {
                track.addEventListener('pointermove', () => resolve(), {
                    once: true,
                })
            })
            await window.aniPointerInput('move', x - 40, y)
            await moved
            await microtasks()
            const host = view.host.querySelector<HTMLElement>(
                '[data-ios-exposure]'
            )!
            const beforeRelease = Number(
                host.style.getPropertyValue('--ani-rail-value')
            )
            await window.aniPointerInput('up')
            await microtasks()
            if (!trustedUp || commits.length !== 1 || commits[0]! <= 45)
                throw new Error(
                    `${mode}: no actual nonzero-velocity trusted flick was exercised`
                )
            const expected =
                mode === 'reject'
                    ? 25
                    : mode === 'quantize'
                      ? quantize(commits[0]!)
                      : commits[0]!
            const zeroVelocity = mode === 'quantize' || mode === 'disable'
            const reference = follow(
                { value: beforeRelease },
                {
                    clock: mc.clock,
                    spring: { m: 1, k: 350, c: 35, tolerance: 0.001 },
                }
            )
            if (zeroVelocity)
                void reference.set(
                    { value: expected },
                    { velocity: { value: 0 } }
                )
            const values: number[] = []
            try {
                await tick(mc, 150, () => {
                    const value = Number(
                        host.style.getPropertyValue('--ani-rail-value')
                    )
                    values.push(value)
                    if (!Number.isFinite(value))
                        throw new Error(
                            'Exposure produced non-finite presentation'
                        )
                    if (
                        zeroVelocity &&
                        Math.abs(value - reference.value.value) > 1e-8
                    )
                        throw new Error(
                            `${mode}: a rejected/disabled release injected momentum`
                        )
                    if (mode === 'reject') {
                        const text = host.querySelector(
                            '[data-exposure-reset] span'
                        )!.textContent
                        if (
                            value !== 25 ||
                            text !== '25' ||
                            track.getAttribute('aria-valuenow') !== '25' ||
                            Number(
                                host.style.getPropertyValue('--ani-brightness')
                            ) !==
                                2 ** 0.25
                        )
                            throw new Error(
                                `Rejected controlled flick moved to ${value}, text ${text}`
                            )
                    }
                })
            } finally {
                reference.dispose()
            }
            if (Math.abs(values.at(-1)! - expected) > 0.001)
                throw new Error(
                    `${mode}: release did not settle at accepted value`
                )
            expectNoWork(mc, `Exposure ${mode}`)
            records.push({
                mode,
                trustedUp,
                commit: commits[0],
                minimum: Math.min(...values),
                maximum: Math.max(...values),
                final: values.at(-1),
                samples: values.length,
            })
            await view.render(null)
        }
        save('exposure-controlled-release', records)
        return JSON.stringify(records)
    } finally {
        view.dispose()
        mc.clock.dispose()
    }
}
