/**
 * S-PHOTO — Photos grid to aspect-fit detail (vanilla, P2; scene spec 2.2).
 *
 * 300 real grid cells at scrollTop = 1077 (1.5 viewports). The selected
 * square cell hands off to the 4:3 detail frame while the image inside is
 * counter-scaled; back returns to the same scrolled cell.
 */

import {
    createManualClock,
    type ManualClock,
} from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    type LayoutGroup,
    type LayoutReport,
    layoutRuntime,
} from '@freestylejs/ani-layout'
import type { Box } from '../../oracle.ts'
import type { RealTrace, SceneTrace } from '../../types.ts'
import {
    installRafSampler,
    isWebKitEngine,
    measureGranularityInfo,
    microtasks,
    nextFrame,
    TraceBuilder,
    waitMs,
} from '../harness.ts'
import {
    boxOf,
    EASE_IN,
    EASE_OUT,
    FONT,
    finalState,
    homeIndicator,
    participant,
    probeStage,
    recordCommit,
    reportTracker,
    SPRING,
    STATUS_CSS,
    statusBar,
    styleOnce,
} from './kit.ts'

const CELL = 128.66666666666666
const GAP = 2
const PITCH = CELL + GAP
const GRID_WIDTH = 390
const CONTENT_HEIGHT = 100 * CELL + 99 * GAP
const SCROLL_TOP = 1077
const SELECTED = 37
const ROW = Math.floor(SELECTED / 3)
const COL = SELECTED % 3
const FRAME_W = 390
const FRAME_H = 292.5
const FRAME_TOP = (844 - FRAME_H) / 2
const IMAGE_W = (CELL * 4) / 3
const IMAGE_LEFT = (CELL - IMAGE_W) / 2
const KEYS = [
    ...Array.from({ length: 300 }, (_, i) => `cell-${i}`),
    'cell-37-image',
    'detail-frame',
    'detail-image',
]
const STATIC_KEYS = Array.from({ length: 300 }, (_, i) => `cell-${i}`).filter(
    (key) => key !== 'cell-37'
)

let stylesInstalled = false

function installStyles(): void {
    if (stylesInstalled) return
    stylesInstalled = true
    styleOnce(
        's-photo',
        `
        ${STATUS_CSS}
        .photo-stage {
            position: fixed; inset: 0; width: 390px; height: 844px;
            overflow: hidden; background: #FFFFFF; color: #000;
            font-family: ${FONT}; -webkit-font-smoothing: antialiased;
            font-optical-sizing: auto; color-scheme: light;
        }
        .photo-stage.photo-light .ios-status { color: #FFFFFF; }
        .photo-stage.photo-light .ios-home { background: rgba(255,255,255,0.85); }
        .photo-nav {
            position: absolute; left: 0; top: 47px; width: 390px; height: 44px;
            background: #FFFFFF; border-bottom: 0.5px solid rgba(60,60,67,0.29);
            box-sizing: border-box; z-index: 3;
        }
        .photo-nav-title {
            position: absolute; left: 0; top: 11px; width: 390px; text-align: center;
            font: 600 17px/22px ${FONT}; letter-spacing: -0.41px;
        }
        .photo-select {
            position: absolute; right: 16px; top: 11px; border: 0; padding: 0;
            background: transparent; color: #007AFF; font: 400 17px/22px ${FONT};
            letter-spacing: -0.41px;
        }
        .photo-scroller {
            position: absolute; left: 0; top: 91px; width: 390px; height: 718px;
            overflow-y: auto; overflow-x: hidden; scrollbar-width: none;
            overscroll-behavior: contain; background: #FFFFFF; z-index: 1;
        }
        .photo-scroller::-webkit-scrollbar { display: none; }
        .photo-grid { position: relative; width: 390px; height: ${CONTENT_HEIGHT}px; }
        .photo-cell {
            position: absolute; width: ${CELL}px; height: ${CELL}px;
            border: 0; padding: 0; margin: 0; background: #E5E5EA;
            overflow: hidden; display: block;
        }
        .photo-cell-img {
            position: absolute; left: ${IMAGE_LEFT}px; top: 0;
            width: ${IMAGE_W}px; height: ${CELL}px; display: block;
        }
        .photo-placeholder {
            position: absolute; width: ${CELL}px; height: ${CELL}px;
            background: #E5E5EA;
        }
        .photo-detail { position: fixed; inset: 0; width: 390px; height: 844px; z-index: 5; visibility: hidden; }
        .photo-shade { position: absolute; inset: 0; background: #000000; opacity: 0; }
        .photo-frame {
            position: absolute; left: 0; top: ${FRAME_TOP}px;
            width: ${FRAME_W}px; height: ${FRAME_H}px;
            overflow: hidden; background: #000000; z-index: 10;
        }
        .photo-image {
            position: absolute; left: 0; top: 0; width: ${FRAME_W}px;
            height: ${FRAME_H}px; display: block;
        }
        .photo-back {
            position: absolute; left: 16px; top: 56px; width: 44px; height: 44px;
            border: 0; padding: 0; background: transparent; z-index: 20;
            color: #FFFFFF; display: flex; align-items: center; justify-content: center;
        }
        .photo-counter {
            position: absolute; left: 0; top: 62px; width: 390px; text-align: center;
            font: 400 13px/18px ${FONT}; letter-spacing: -0.08px;
            color: rgba(255,255,255,0.60); z-index: 20;
        }
        .photo-meta { position: absolute; left: 16px; top: 600px; z-index: 20; color: #FFFFFF; }
        .photo-meta-title { font: 600 17px/22px ${FONT}; letter-spacing: -0.41px; }
        .photo-meta-sub { margin-top: 4px; font: 400 13px/18px ${FONT}; letter-spacing: -0.08px; color: rgba(255,255,255,0.60); }
        .photo-toolbar {
            position: absolute; left: 0; bottom: 34px; width: 390px; height: 50px;
            display: flex; align-items: center; justify-content: center; gap: 44px;
            color: #FFFFFF; z-index: 20; font: 400 20px/24px ${FONT};
        }
        .photo-chrome { opacity: 0; }
    `
    )
}

function imageSource(variant = 0): string {
    const colors = [
        ['#FF2D55', '#AF52DE', '#007AFF'],
        ['#FF9500', '#FFCC00', '#FF2D55'],
        ['#34C759', '#5AC8FA', '#007AFF'],
        ['#AF52DE', '#FF2D55', '#FF9500'],
        ['#5AC8FA', '#34C759', '#FFCC00'],
        ['#007AFF', '#5AC8FA', '#AF52DE'],
        ['#FF3B30', '#FF9500', '#FFCC00'],
        ['#1C1C1E', '#5E5CE6', '#AF52DE'],
        ['#30D158', '#34C759', '#5AC8FA'],
        ['#FF9F0A', '#FF375F', '#BF5AF2'],
        ['#64D2FF', '#0A84FF', '#5E5CE6'],
        ['#FFD60A', '#FF9F0A', '#FF375F'],
    ]
    const [a, b, c] = colors[variant % colors.length]!
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${a}"/><stop offset="0.5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>
        </linearGradient>
        <radialGradient id="r" cx="0.28" cy="0.22" r="0.85">
            <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
        </radialGradient></defs>
        <rect width="1600" height="1200" fill="url(#g)"/>
        <rect width="1600" height="1200" fill="url(#r)"/>
        <circle cx="1180" cy="340" r="260" fill="#FFFFFF" fill-opacity="0.16"/>
        <circle cx="380" cy="880" r="330" fill="#000000" fill-opacity="0.18"/>
        <path d="M0 1000 L380 720 L760 980 L1160 600 L1600 880 L1600 1200 L0 1200 Z" fill="#0B0B0F" fill-opacity="0.35"/>
    </svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

interface PhotoLayer {
    readonly stage: HTMLDivElement
    readonly scroller: HTMLDivElement
    readonly grid: HTMLDivElement
    readonly detail: HTMLDivElement
    readonly shade: HTMLDivElement
    readonly chrome: HTMLDivElement
    readonly frame: HTMLDivElement
    readonly image: HTMLImageElement
    readonly back: HTMLButtonElement
    readonly cells: HTMLDivElement[]
    readonly cellImage: HTMLImageElement
    readonly cell37: HTMLButtonElement
    readonly decoded: HTMLImageElement
}

function makeCell(
    index: number,
    selected: boolean
): HTMLButtonElement | HTMLDivElement {
    const cell = document.createElement(selected ? 'button' : 'div') as
        | HTMLButtonElement
        | HTMLDivElement
    cell.className = 'photo-cell'
    cell.dataset.p = `cell-${index}`
    if (selected) {
        ;(cell as HTMLButtonElement).type = 'button'
        ;(cell as HTMLButtonElement).setAttribute(
            'aria-label',
            `Photo ${index + 1}`
        )
    }
    const row = Math.floor(index / 3)
    const col = index % 3
    cell.style.left = `${col * PITCH}px`
    cell.style.top = `${row * PITCH}px`
    return cell
}

function makeImage(): HTMLImageElement {
    const image = document.createElement('img')
    image.className = 'photo-cell-img'
    image.dataset.p = 'cell-37-image'
    image.src = imageSource(3)
    image.alt = ''
    return image
}

function buildLayer(): PhotoLayer {
    installStyles()
    const stage = document.createElement('div')
    stage.className = 'photo-stage'
    const nav = document.createElement('div')
    nav.className = 'photo-nav'
    const title = document.createElement('div')
    title.className = 'photo-nav-title'
    title.textContent = 'Library'
    const select = document.createElement('button')
    select.type = 'button'
    select.className = 'photo-select'
    select.textContent = 'Select'
    nav.append(title, select)
    const scroller = document.createElement('div')
    scroller.className = 'photo-scroller'
    scroller.setAttribute('data-scroller', '')
    const grid = document.createElement('div')
    grid.className = 'photo-grid'
    const cells: HTMLDivElement[] = []
    let cell37!: HTMLButtonElement
    let cellImage!: HTMLImageElement
    for (let i = 0; i < 300; i++) {
        const cell = makeCell(i, i === SELECTED)
        if (i === SELECTED) {
            const button = cell as HTMLButtonElement
            cell37 = button
            cellImage = makeImage()
            button.append(cellImage)
        }
        grid.append(cell)
        cells.push(cell as HTMLDivElement)
    }
    scroller.append(grid)
    scroller.scrollTop = SCROLL_TOP
    const detail = document.createElement('div')
    detail.className = 'photo-detail'
    const shade = document.createElement('div')
    shade.className = 'photo-shade'
    const frame = document.createElement('div')
    frame.className = 'photo-frame'
    frame.dataset.p = 'detail-frame'
    const image = document.createElement('img')
    image.className = 'photo-image'
    image.dataset.p = 'detail-image'
    image.src = imageSource(3)
    image.alt = ''
    frame.append(image)
    const chrome = document.createElement('div')
    chrome.className = 'photo-chrome'
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'photo-back'
    back.setAttribute('aria-label', 'Back to Library')
    back.innerHTML =
        '<svg width="14" height="24" viewBox="0 0 14 24" aria-hidden="true"><path d="M12 2 3 12l9 10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    const counter = document.createElement('div')
    counter.className = 'photo-counter'
    counter.textContent = '37 of 300'
    const meta = document.createElement('div')
    meta.className = 'photo-meta'
    meta.innerHTML =
        '<div class="photo-meta-title">Photo 37</div><div class="photo-meta-sub">Today 9:41</div>'
    const toolbar = document.createElement('div')
    toolbar.className = 'photo-toolbar'
    toolbar.innerHTML = '<span>􀈂</span><span>􀈎</span><span>􀈏</span>'
    chrome.append(back, counter, meta, toolbar)
    detail.append(shade, frame, chrome)
    stage.append(statusBar(), nav, scroller, detail, homeIndicator())
    document.body.append(stage)
    const decoded = new Image()
    decoded.src = imageSource(3)
    return {
        stage,
        scroller,
        grid,
        detail,
        shade,
        chrome,
        frame,
        image,
        back,
        cells,
        cellImage,
        cell37,
        decoded,
    }
}

/** Engine-free probe: the selected cell at scrollTop 1077 and the detail. */
function probeBoxes(): Record<string, Box> {
    installStyles()
    const stage = probeStage()
    const scroller = document.createElement('div')
    scroller.className = 'photo-scroller'
    const grid = document.createElement('div')
    grid.className = 'photo-grid'
    const cell = makeCell(SELECTED, true)
    const image = makeImage()
    cell.append(image)
    grid.append(cell)
    scroller.append(grid)
    stage.append(scroller)
    scroller.scrollTop = SCROLL_TOP
    const boxes: Record<string, Box> = {
        'cell-37@rest': boxOf(cell),
        'cell-37-image@rest': boxOf(image),
    }
    const frame = document.createElement('div')
    frame.className = 'photo-frame'
    const detailImage = document.createElement('img')
    detailImage.className = 'photo-image'
    frame.append(detailImage)
    stage.append(frame)
    boxes['detail-frame'] = boxOf(frame)
    boxes['detail-image'] = boxOf(detailImage)
    stage.remove()
    return boxes
}

function diagnosticsListener(
    onEvent: (code: string, action: string) => void
): () => void {
    return layoutRuntime.onDiagnostic((event) =>
        onEvent(event.code, event.action)
    )
}

class PhotoRuntime {
    readonly layer: PhotoLayer
    readonly group: LayoutGroup
    readonly mc: ManualClock | null
    readonly builder: TraceBuilder | null
    readonly elements: Map<string, HTMLElement | null>
    readonly removers = new Map<string, () => void>()
    readonly diagnostics: string[] = []
    readonly tracker: ReturnType<typeof reportTracker> | null
    frame = 0
    shadeMode: 'off' | 'opening' | 'open' | 'closing' = 'off'
    shadeSince = 0
    shadeFrom = 0
    shade = 0
    private readonly offDiagnostic: () => void
    private readonly control: string | undefined

    constructor(options: {
        mc: ManualClock | null
        builder: TraceBuilder | null
        elements?: Map<string, HTMLElement | null>
        control?: string | undefined
    }) {
        installStyles()
        this.layer = buildLayer()
        this.mc = options.mc
        this.builder = options.builder
        this.control = options.control
        this.elements = options.elements ?? new Map()
        this.tracker = options.builder ? reportTracker(options.builder) : null
        this.group = createLayoutGroup({
            ...(options.mc ? { clock: options.mc.clock } : {}),
            motion: SPRING.photo,
            reducedMotion: 'ignore',
            threshold: 1,
            maxNodes: 300,
            maxParticipants: 2000,
            retain: 1,
            onSnap: (element, reason) => {
                this.builder?.snap(
                    element.dataset.p ?? 'unknown',
                    reason,
                    this.frame
                )
            },
        })
        this.offDiagnostic = diagnosticsListener((code, action) => {
            this.diagnostics.push(code)
            this.builder?.diagnostic(code, action, this.frame, null)
        })
        const probes = probeBoxes()
        if (this.builder) {
            for (const [key, box] of Object.entries(probes))
                this.builder.aBox(key, box)
        }
        ;(window as unknown as { __scene?: unknown }).__scene = {
            scene: 's-photo',
            participants: KEYS,
            boxes: probes,
            scrollTop: SCROLL_TOP,
            motion: SPRING.photo,
        }
        for (const key of KEYS) this.elements.set(key, null)
        // The 300 real cells are participants; only cell 37 and its image move.
        this.layer.grid.childNodes.forEach((node, index) => {
            const element = node as HTMLElement
            const key = `cell-${index}`
            this.elements.set(key, element)
            if (this.builder) {
                participant(this.builder, key, element, false)
            }
            const remove = this.group.add(element, {
                layout: true,
                radius: false,
                ...(index === SELECTED
                    ? { layoutId: 'photo-37-frame', layoutCrossfade: false }
                    : {}),
            })
            this.removers.set(key, remove)
        })
        this.elements.set('cell-37-image', this.layer.cellImage)
        if (this.builder) {
            participant(
                this.builder,
                'cell-37-image',
                this.layer.cellImage,
                false
            )
        }
        this.removers.set(
            'cell-37-image',
            this.group.add(this.layer.cellImage, {
                layout: true,
                layoutId: 'photo-37-img',
                layoutCrossfade: false,
                radius: false,
            })
        )
        if (this.builder) {
            this.builder.mount('detail-frame', this.layer.frame)
            this.builder.mount('detail-image', this.layer.image)
        }
    }

    private detailRegistered = false

    open(): Promise<LayoutReport> | null {
        const layer = this.layer
        layer.cell37.focus()
        if (!this.builder) {
            return this.openReal()
        }
        const result = recordCommit({
            builder: this.builder,
            keys: KEYS,
            elements: this.elements,
            frame: this.frame,
            label: 'open',
            radiusKeys: new Set(),
            typedOM: isWebKitEngine(),
            stats: () => this.group.stats,
            stylesExpected: isWebKitEngine() ? 0 : 2,
            run: () =>
                this.group.update(() => {
                    const index = [...layer.grid.childNodes].indexOf(
                        layer.cell37
                    )
                    const placeholder = document.createElement('div')
                    placeholder.className = 'photo-placeholder'
                    placeholder.style.left = `${COL * PITCH}px`
                    placeholder.style.top = `${ROW * PITCH}px`
                    this.removers.get('cell-37')?.()
                    this.removers.get('cell-37-image')?.()
                    this.removers.delete('cell-37')
                    this.removers.delete('cell-37-image')
                    layer.cell37.remove()
                    layer.grid.insertBefore(
                        placeholder,
                        layer.grid.childNodes[index] ?? null
                    )
                    this.elements.set('cell-37', null)
                    this.elements.set('cell-37-image', null)
                    // A scroll-active handoff control: keep the scroller
                    // scrolling by not restoring scrollend.
                    layer.detail.style.visibility = 'visible'
                    this.elements.set('detail-frame', layer.frame)
                    this.elements.set('detail-image', layer.image)
                    this.removers.set(
                        'detail-frame',
                        this.group.add(layer.frame, {
                            layout: true,
                            layoutId: 'photo-37-frame',
                            layoutCrossfade: false,
                            radius: false,
                        })
                    )
                    if (this.control !== 'photo-no-counter-scale') {
                        this.removers.set(
                            'detail-image',
                            this.group.add(layer.image, {
                                layout: true,
                                layoutId: 'photo-37-img',
                                layoutCrossfade: false,
                                radius: false,
                            })
                        )
                    }
                    this.detailRegistered = true
                    this.shadeMode = 'opening'
                    this.shadeSince = this.mc ? this.mc.now : performance.now()
                    this.shadeFrom = this.shade
                    layer.stage.classList.add('photo-light')
                }),
        })
        this.builder.record('flush', this.frame, 'open')
        this.tracker!.track('open', result.promise, () => this.frame)
        layer.back.focus()
        return result.promise
    }

    private openReal(): Promise<LayoutReport> {
        const layer = this.layer
        return this.group.update(() => {
            layer.cell37.remove()
            this.elements.set('cell-37', null)
            this.elements.set('cell-37-image', null)
            layer.detail.style.visibility = 'visible'
            this.elements.set('detail-frame', layer.frame)
            this.elements.set('detail-image', layer.image)
            this.removers.set(
                'detail-frame',
                this.group.add(layer.frame, {
                    layout: true,
                    layoutId: 'photo-37-frame',
                    layoutCrossfade: false,
                    radius: false,
                })
            )
            this.removers.set(
                'detail-image',
                this.group.add(layer.image, {
                    layout: true,
                    layoutId: 'photo-37-img',
                    layoutCrossfade: false,
                    radius: false,
                })
            )
            this.detailRegistered = true
            layer.stage.classList.add('photo-light')
            layer.shade.style.transition =
                'opacity 250ms cubic-bezier(0,0,0.58,1)'
            layer.shade.style.opacity = '1'
            layer.chrome.style.transition =
                'opacity 250ms cubic-bezier(0,0,0.58,1)'
            layer.chrome.style.opacity = '1'
        })
    }

    back(): Promise<LayoutReport> | null {
        const layer = this.layer
        layer.back.focus()
        if (!this.builder) return this.backReal()
        const result = recordCommit({
            builder: this.builder,
            keys: KEYS,
            elements: this.elements,
            frame: this.frame,
            label: 'back',
            radiusKeys: new Set(),
            typedOM: isWebKitEngine(),
            stats: () => this.group.stats,
            stylesExpected: isWebKitEngine() ? 4 : 2,
            run: () =>
                this.group.update(() => {
                    const newCell = makeCell(
                        SELECTED,
                        true
                    ) as HTMLButtonElement
                    newCell.dataset.p = 'cell-37'
                    const newImage = this.layer.decoded.cloneNode(
                        false
                    ) as HTMLImageElement
                    newImage.className = 'photo-cell-img'
                    newImage.dataset.p = 'cell-37-image'
                    newImage.alt = ''
                    newCell.append(newImage)
                    newCell.style.left = `${COL * PITCH}px`
                    newCell.style.top = `${ROW * PITCH}px`
                    if (this.builder) {
                        this.builder.mount('cell-37', newCell)
                        this.builder.mount('cell-37-image', newImage)
                    }
                    const placeholder =
                        layer.grid.querySelector('.photo-placeholder')
                    placeholder?.remove()
                    layer.grid.insertBefore(
                        newCell,
                        layer.grid.childNodes[ROW * 3 + COL] ?? null
                    )
                    this.elements.set('cell-37', newCell)
                    this.elements.set('cell-37-image', newImage)
                    this.removers.get('detail-frame')?.()
                    this.removers.get('detail-image')?.()
                    this.removers.delete('detail-frame')
                    this.removers.delete('detail-image')
                    this.removers.set(
                        'cell-37',
                        this.group.add(newCell, {
                            layout: true,
                            layoutId: 'photo-37-frame',
                            layoutCrossfade: false,
                            radius: false,
                        })
                    )
                    this.removers.set(
                        'cell-37-image',
                        this.group.add(newImage, {
                            layout: true,
                            layoutId: 'photo-37-img',
                            layoutCrossfade: false,
                            radius: false,
                        })
                    )
                    newCell.focus()
                    for (const key of [
                        'detail-frame',
                        'detail-image',
                    ] as const) {
                        this.elements.set(key, null)
                    }
                    layer.frame.style.visibility = 'hidden'
                    layer.image.style.visibility = 'hidden'
                    this.detailRegistered = false
                    this.shadeMode = 'closing'
                    this.shadeSince = this.mc ? this.mc.now : performance.now()
                    this.shadeFrom = this.shade
                    layer.stage.classList.remove('photo-light')
                }),
        })
        this.builder.record('flush', this.frame, 'back')
        this.tracker!.track('back', result.promise, () => this.frame)
        return result.promise
    }

    private backReal(): Promise<LayoutReport> {
        return this.group.update(() => {
            const layer = this.layer
            const newCell = makeCell(SELECTED, true) as HTMLButtonElement
            const newImage = this.layer.decoded.cloneNode(
                false
            ) as HTMLImageElement
            newImage.className = 'photo-cell-img'
            newImage.alt = ''
            newCell.append(newImage)
            this.removers.get('detail-frame')?.()
            this.removers.get('detail-image')?.()
            this.removers.delete('detail-frame')
            this.removers.delete('detail-image')
            this.removers.set(
                'cell-37',
                this.group.add(newCell, {
                    layout: true,
                    layoutId: 'photo-37-frame',
                    layoutCrossfade: false,
                    radius: false,
                })
            )
            this.removers.set(
                'cell-37-image',
                this.group.add(newImage, {
                    layout: true,
                    layoutId: 'photo-37-img',
                    layoutCrossfade: false,
                    radius: false,
                })
            )
            layer.grid.querySelector('.photo-placeholder')?.remove()
            layer.grid.append(newCell)
            newCell.focus()
            layer.frame.style.visibility = 'hidden'
            layer.image.style.visibility = 'hidden'
            layer.stage.classList.remove('photo-light')
            layer.shade.style.transition =
                'opacity 200ms cubic-bezier(0.42,0,1,1)'
            layer.shade.style.opacity = '0'
            layer.chrome.style.transition =
                'opacity 200ms cubic-bezier(0.42,0,1,1)'
            layer.chrome.style.opacity = '0'
        })
    }

    updateShade(now: number): void {
        if (this.mc === null) return
        if (this.shadeMode === 'off') return
        const elapsed = (now - this.shadeSince) / 1000
        let target = this.shade
        if (this.shadeMode === 'opening') {
            target =
                this.shadeFrom +
                (1 - this.shadeFrom) * EASE_OUT(Math.min(1, elapsed / 0.25))
            if (elapsed >= 0.25) this.shadeMode = 'open'
        } else if (this.shadeMode === 'closing') {
            target = this.shadeFrom * (1 - EASE_IN(Math.min(1, elapsed / 0.2)))
            if (elapsed >= 0.2) {
                this.shadeMode = 'off'
                this.layer.detail.style.visibility = 'hidden'
                this.layer.chrome.style.opacity = '0'
            }
        }
        this.shade = Math.min(1, Math.max(0, target))
        this.layer.shade.style.opacity = String(this.shade)
        this.layer.chrome.style.opacity = String(this.shade)
    }

    dispose(): void {
        this.offDiagnostic()
        for (const remove of this.removers.values()) remove()
        this.removers.clear()
        this.group.dispose()
        this.layer.stage.remove()
    }
}

async function setScroll(scroller: HTMLElement, top: number): Promise<void> {
    scroller.scrollTop = top
    await new Promise<void>((resolve) => {
        let done = false
        const finish = (): void => {
            if (done) return
            done = true
            scroller.removeEventListener('scrollend', finish)
            resolve()
        }
        scroller.addEventListener('scrollend', finish, { once: true })
        window.setTimeout(finish, 250)
    })
    await nextFrame()
    if (Math.abs(scroller.scrollTop - top) > 0.01) {
        throw new Error(`s-photo: scrollTop ${scroller.scrollTop} != ${top}`)
    }
}

async function stepPhoto(
    mc: ManualClock,
    builder: TraceBuilder,
    runtime: PhotoRuntime
): Promise<void> {
    const stats = runtime.group.stats
    mc.frame(16)
    runtime.frame += 1
    const reads = runtime.group.stats.reads - stats.reads
    if (reads > 0) {
        builder.steadyFrameReads += reads
        builder.steadyFrameReadsAt ??= runtime.frame
    }
    await microtasks()
    runtime.updateShade(mc.now)
    builder.record('frame', runtime.frame)
}

export class PhotoScene {
    static async runManual(
        options: { control?: string | undefined } = {}
    ): Promise<SceneTrace> {
        const mc = createManualClock()
        const elements = new Map<string, HTMLElement | null>()
        const builder = new TraceBuilder({
            scene: 's-photo',
            stepMs: 16,
            keys: KEYS,
            elements,
            clock: mc,
        })
        const runtime = new PhotoRuntime({
            mc,
            builder,
            elements,
            control: options.control,
        })
        for (const key of KEYS)
            elements.set(key, runtime.elements.get(key) ?? null)
        await document.fonts.ready
        await Promise.all(
            [...document.images].map((image) =>
                image.decode().catch(() => undefined)
            )
        )
        await runtime.layer.decoded.decode().catch(() => undefined)
        await setScroll(runtime.layer.scroller, SCROLL_TOP)
        for (const key of KEYS) {
            const element = elements.get(key)
            if (element?.isConnected) builder.initial(key, element)
        }
        // Establish the selected cell's lead and presented box before the
        // first scripted commit (the handoff baseline).
        await runtime.group.update(() => undefined)
        try {
            builder.record('frame', 0)
            runtime.frame = 0
            runtime.open()
            let guard = 0
            while (guard++ < 400) {
                if (
                    runtime.tracker?.done.get('open') &&
                    runtime.group.stats.tracks === 0
                )
                    break
                await stepPhoto(mc, builder, runtime)
            }
            await stepPhoto(mc, builder, runtime)
            builder.settleFrames.push(runtime.frame)
            // settle + 0.5 s
            for (let i = 0; i < 31; i++) await stepPhoto(mc, builder, runtime)
            runtime.back()
            guard = 0
            while (guard++ < 400) {
                if (
                    runtime.tracker?.done.get('back') &&
                    runtime.group.stats.tracks === 0
                )
                    break
                await stepPhoto(mc, builder, runtime)
            }
            await microtasks()
            await stepPhoto(mc, builder, runtime)
            builder.settleFrames.push(runtime.frame)
            const connected = KEYS.filter(
                (key) => runtime.elements.get(key)?.isConnected
            )
            const final = finalState({
                tracks: runtime.group.stats.tracks,
                holds: runtime.group.stats.holds,
                clockPending: mc.pending,
                clockSize: mc.clock.size,
                connected,
                diagnostics: runtime.diagnostics,
            })
            builder.record('frame', runtime.frame)
            return builder.build(final)
        } finally {
            runtime.dispose()
        }
    }

    static async runReal(): Promise<RealTrace> {
        const granularityInfo = measureGranularityInfo()
        const g = granularityInfo.value
        const sampler = installRafSampler()
        const runtime = new PhotoRuntime({ mc: null, builder: null })
        await document.fonts.ready
        await Promise.all(
            [...document.images].map((image) =>
                image.decode().catch(() => undefined)
            )
        )
        await runtime.layer.decoded.decode().catch(() => undefined)
        await setScroll(runtime.layer.scroller, SCROLL_TOP)
        const commits: { label: string; at: number }[] = []
        try {
            await nextFrame()
            await nextFrame()
            await runtime.group.update(() => undefined)
            sampler.markCommit()
            const opened = runtime.open()!
            commits.push({ label: 'open', at: performance.now() })
            await opened
            await waitMs(500)
            sampler.markCommit()
            const backed = runtime.back()!
            commits.push({ label: 'back', at: performance.now() })
            await backed
            for (let i = 0; i < 4; i++) await nextFrame()
            const final = {
                tracks: runtime.group.stats.tracks,
                holds: runtime.group.stats.holds,
                connected: [...runtime.elements.values()].filter(
                    (element) => element?.isConnected
                ).length,
            }
            runtime.dispose()
            sampler.stop()
            const frames = [...sampler.frames]
            return {
                scene: 's-photo',
                mode: 'real',
                g,
                gSource: granularityInfo.source,
                frameCosts: frames,
                commits,
                diagnostics: [...runtime.diagnostics],
                final,
            }
        } catch (error) {
            runtime.dispose()
            sampler.stop()
            throw error
        }
    }

    static async demo(): Promise<void> {
        for (;;) {
            await PhotoScene.runReal()
            await waitMs(800)
        }
    }
}

export const PHOTO_KEYS = KEYS
export const PHOTO_STATIC_KEYS = STATIC_KEYS
