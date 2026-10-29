/**
 * S-CARD — the App Store Today card calibration scene (§11.6, scene spec 2.1).
 * Vanilla public API only: `createLayoutGroup`, `group.add`/`update`,
 * `createPresence`, core `ani`/`timing`.
 */

import { ani, timing } from '@freestylejs/ani-core'
import {
    createManualClock,
    type ManualClock,
} from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    createPresence,
    type LayoutGroup,
    type LayoutReport,
    layoutRuntime,
    type PresenceHandle,
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
    viewBox,
    waitMs,
    waitUntil,
} from '../harness.ts'
import {
    EASE_IN,
    EASE_OUT,
    homeIndicator,
    perceptual,
    STATUS_CSS,
    statusBar,
} from './kit.ts'

const FONT =
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif'
const KEYS = [
    'card',
    'card-image',
    'card-title',
    'sheet',
    'sheet-image',
    'sheet-title',
    'sheet-content',
] as const

let stylesInstalled = false

function imageSource(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
        <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#FF2D55"/>
                <stop offset="0.45" stop-color="#AF52DE"/>
                <stop offset="1" stop-color="#007AFF"/>
            </linearGradient>
            <radialGradient id="r" cx="0.3" cy="0.25" r="0.8">
                <stop offset="0" stop-color="#FFCC00" stop-opacity="0.9"/>
                <stop offset="1" stop-color="#FF9500" stop-opacity="0"/>
            </radialGradient>
        </defs>
        <rect width="1600" height="1200" fill="url(#g)"/>
        <rect width="1600" height="1200" fill="url(#r)"/>
        <circle cx="1220" cy="300" r="210" fill="#FFFFFF" fill-opacity="0.22"/>
        <circle cx="360" cy="900" r="320" fill="#000000" fill-opacity="0.18"/>
        <path d="M0 980 L420 720 L760 980 L1180 620 L1600 900 L1600 1200 L0 1200 Z" fill="#0B0B0F" fill-opacity="0.45"/>
        <text x="80" y="200" font-family="Helvetica" font-size="70" font-weight="700" fill="#FFFFFF" fill-opacity="0.85">THE NEW WAVE</text>
    </svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function installStyles(): void {
    if (stylesInstalled) return
    stylesInstalled = true
    const style = document.createElement('style')
    style.textContent = `
        ${STATUS_CSS}
        .card-stage {
            position: fixed; inset: 0; width: 390px; height: 844px;
            overflow: hidden; background: #F2F2F7; color: #000;
            font-family: ${FONT}; -webkit-font-smoothing: antialiased;
            font-optical-sizing: auto; color-scheme: light;
        }
        .card-status { position: absolute; left: 0; top: 0; width: 390px; height: 47px; z-index: 20; pointer-events: none; }
        .card-status-time { position: absolute; left: 28px; top: 14px; font: 600 15px/20px ${FONT}; letter-spacing: -0.24px; }
        .card-date { position: absolute; left: 16px; top: 99px; font: 600 13px/18px ${FONT}; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(60,60,67,0.60); }
        .card-header { position: absolute; left: 16px; top: 117px; font: 700 34px/41px ${FONT}; letter-spacing: 0.4px; }
        .card-header-button { position: absolute; left: 16px; top: 104px; width: 220px; height: 54px; opacity: 0; border: 0; background: transparent; font: inherit; padding: 0; }
        .card-feed-card {
            position: absolute; left: 16px; width: 358px; height: 180px;
            border-radius: 20px; background: #FFFFFF;
            box-shadow: 0 8px 30px rgba(0,0,0,0.12); overflow: hidden;
        }
        .card-feed-label { position: absolute; left: 16px; top: 14px; font: 700 17px/22px ${FONT}; letter-spacing: -0.41px; }
        .card-feed-sub { position: absolute; left: 16px; top: 40px; font: 400 15px/20px ${FONT}; letter-spacing: -0.24px; color: rgba(60,60,67,0.60); }
        .card-hero {
            position: absolute; left: 16px; top: 176px; width: 358px; height: 440px;
            border: 0; padding: 0; margin: 0; background: #FFFFFF; text-align: left;
            border-radius: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            overflow: hidden; transform-origin: 50% 50%; z-index: 10;
            font: inherit; letter-spacing: inherit; word-spacing: inherit;
            text-transform: inherit; cursor: pointer; display: block;
        }
        .card-hero-image {
            position: absolute; left: 0; top: 0; width: 358px; height: 300px;
            object-fit: cover; object-position: 50% 40%; display: block;
            transform-origin: 50% 50%;
        }
        .card-hero-title {
            position: absolute; left: 20px; top: 316px; width: 300px; height: 56px;
            font: 700 22px/28px ${FONT}; letter-spacing: 0.35px; color: #000000;
            transform-origin: 50% 50%; overflow: hidden;
        }
        .card-hero-tag {
            position: absolute; left: 20px; top: 380px; width: 300px; height: 22px;
            font: 600 15px/20px ${FONT}; letter-spacing: -0.24px; color: rgba(60,60,67,0.60);
        }
        .card-sheet {
            position: absolute; left: 0; top: 0; width: 390px; height: 844px;
            background: #FFFFFF; border-radius: 0; overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.25); transform-origin: 50% 50%;
            z-index: 10;
        }
        .card-sheet-image {
            position: absolute; left: 0; top: 0; width: 390px; height: 500px;
            object-fit: cover; object-position: 50% 35%; display: block;
            transform-origin: 50% 50%;
        }
        .card-sheet-title {
            position: absolute; left: 20px; top: 528px; width: 300px; height: 56px;
            font: 700 22px/28px ${FONT}; letter-spacing: 0.35px; color: #000000;
            transform-origin: 50% 50%;
        }
        .card-sheet-content {
            position: absolute; left: 0; top: 0; width: 390px; height: 844px;
            transform-origin: 50% 50%; pointer-events: none;
        }
        .card-sheet-subtitle { position: absolute; left: 20px; top: 596px; width: 350px; height: 44px; font: 400 15px/20px ${FONT}; letter-spacing: -0.24px; color: rgba(60,60,67,0.60); }
        .card-sheet-body { position: absolute; left: 20px; top: 652px; width: 350px; height: 96px; font: 400 15px/20px ${FONT}; letter-spacing: -0.24px; color: rgba(60,60,67,0.60); overflow: hidden; }
        .card-read-more { position: absolute; left: 20px; top: 768px; width: 160px; height: 44px; border: 0; padding: 0; background: transparent; font: 600 17px/22px ${FONT}; letter-spacing: -0.41px; color: #007AFF; text-align: left; }
        .card-close {
            position: absolute; left: 342px; top: 56px; width: 32px; height: 32px;
            border: 0; border-radius: 16px; padding: 0; background: rgba(118,118,128,0.16);
            color: #3C3C43; cursor: pointer; z-index: 12;
            display: flex; align-items: center; justify-content: center;
        }
    `
    document.head.append(style)
}

interface CardLayer {
    readonly root: HTMLButtonElement
    readonly image: HTMLImageElement
    readonly title: HTMLDivElement
    presence: PresenceHandle
    imagePresence: PresenceHandle
    titlePresence: PresenceHandle
    readonly removers: (() => void)[]
}

interface SheetLayer {
    readonly root: HTMLDivElement
    readonly image: HTMLImageElement
    readonly title: HTMLDivElement
    readonly content: HTMLDivElement
    readonly close: HTMLButtonElement
    presence: PresenceHandle
    imagePresence: PresenceHandle
    titlePresence: PresenceHandle
    readonly removers: (() => void)[]
}

function presenceMotion(): {
    present: { translateY: number }
    exit: ReturnType<typeof ani>
} {
    return {
        present: { translateY: 0 },
        exit: ani({
            to: { translateY: 0 },
            duration: 0.01,
            timing: timing.linear(),
        }),
    }
}

function buildStage(): {
    stage: HTMLDivElement
    header: HTMLButtonElement
    card: CardLayer
} {
    installStyles()
    const stage = document.createElement('div')
    stage.className = 'card-stage'
    const date = document.createElement('div')
    date.className = 'card-date'
    date.textContent = 'Monday, October 28'
    const header = document.createElement('div')
    header.className = 'card-header'
    header.textContent = 'Today'
    const headerButton = document.createElement('button')
    headerButton.type = 'button'
    headerButton.className = 'card-header-button'
    headerButton.setAttribute('aria-label', 'Today')
    headerButton.textContent = 'Today'
    const feed1 = document.createElement('div')
    feed1.className = 'card-feed-card'
    feed1.style.top = '632px'
    feed1.innerHTML =
        '<div class="card-feed-label">Editors’ picks</div><div class="card-feed-sub">Stories for the weekend</div>'
    const feed2 = document.createElement('div')
    feed2.className = 'card-feed-card'
    feed2.style.top = '828px'
    feed2.innerHTML =
        '<div class="card-feed-label">The daily edit</div><div class="card-feed-sub">A quiet read</div>'

    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'card-hero'
    card.dataset.p = 'card'
    const cardImage = document.createElement('img')
    cardImage.className = 'card-hero-image'
    cardImage.dataset.p = 'card-image'
    cardImage.src = imageSource()
    cardImage.alt = ''
    const cardTitle = document.createElement('div')
    cardTitle.className = 'card-hero-title'
    cardTitle.dataset.p = 'card-title'
    cardTitle.textContent = 'The new wave of indie games'
    const tag = document.createElement('div')
    tag.className = 'card-hero-tag'
    tag.textContent = 'Eight studios to watch'
    card.append(cardImage, cardTitle, tag)
    stage.append(
        statusBar(),
        date,
        header,
        headerButton,
        feed1,
        feed2,
        card,
        homeIndicator()
    )
    document.body.append(stage)
    return {
        stage,
        header: headerButton,
        card: {
            root: card,
            image: cardImage,
            title: cardTitle,
            presence: null as unknown as PresenceHandle,
            imagePresence: null as unknown as PresenceHandle,
            titlePresence: null as unknown as PresenceHandle,
            removers: [],
        },
    }
}

function buildSheet(): {
    sheet: HTMLDivElement
    image: HTMLImageElement
    title: HTMLDivElement
    content: HTMLDivElement
    close: HTMLButtonElement
} {
    const sheet = document.createElement('div')
    sheet.className = 'card-sheet'
    sheet.dataset.p = 'sheet'
    const image = document.createElement('img')
    image.className = 'card-sheet-image'
    image.dataset.p = 'sheet-image'
    image.src = imageSource()
    image.alt = ''
    const title = document.createElement('div')
    title.className = 'card-sheet-title'
    title.dataset.p = 'sheet-title'
    title.textContent = 'The new wave of indie games'
    const content = document.createElement('div')
    content.className = 'card-sheet-content'
    content.dataset.p = 'sheet-content'
    content.style.opacity = '0'
    content.style.visibility = 'hidden'
    content.style.pointerEvents = 'none'
    const subtitle = document.createElement('div')
    subtitle.className = 'card-sheet-subtitle'
    subtitle.textContent = 'The studios turning small ideas into big worlds.'
    const body = document.createElement('div')
    body.className = 'card-sheet-body'
    body.textContent =
        'A new generation of independent teams is building games that feel handmade: short, strange and full of intent. We visited eight of them.'
    const read = document.createElement('button')
    read.type = 'button'
    read.className = 'card-read-more'
    read.textContent = 'Read more'
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'card-close'
    close.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    close.setAttribute('aria-label', 'Close story')
    close.tabIndex = -1
    content.append(subtitle, body, read, close)
    sheet.append(image, title, content)
    return { sheet, image, title, content, close }
}

/** Engine-free layout probe for every rest slot. */
function probeBoxes(): Record<string, Box> {
    installStyles()
    const stage = document.createElement('div')
    stage.className = 'card-stage'
    stage.style.visibility = 'hidden'
    const card = document.createElement('div')
    card.className = 'card-hero'
    card.style.position = 'absolute'
    const cardImage = document.createElement('div')
    cardImage.className = 'card-hero-image'
    const cardTitle = document.createElement('div')
    cardTitle.className = 'card-hero-title'
    card.append(cardImage, cardTitle)
    const sheet = document.createElement('div')
    sheet.className = 'card-sheet'
    const sheetImage = document.createElement('div')
    sheetImage.className = 'card-sheet-image'
    const sheetTitle = document.createElement('div')
    sheetTitle.className = 'card-sheet-title'
    const content = document.createElement('div')
    content.className = 'card-sheet-content'
    sheet.append(sheetImage, sheetTitle, content)
    stage.append(card, sheet)
    document.body.append(stage)
    const boxes = {
        card: viewBox(card),
        'card-image': viewBox(cardImage),
        'card-title': viewBox(cardTitle),
        sheet: viewBox(sheet),
        'sheet-image': viewBox(sheetImage),
        'sheet-title': viewBox(sheetTitle),
        'sheet-content': viewBox(content),
    }
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

function contentDelay(): number {
    let low = 0
    let high = 0.55
    for (let i = 0; i < 40; i++) {
        const mid = (low + high) / 2
        if (perceptual(0.55, mid) < 0.5) low = mid
        else high = mid
    }
    return high
}

class CardRuntime {
    readonly stage: HTMLDivElement
    readonly header: HTMLButtonElement
    readonly group: LayoutGroup
    readonly mc: ManualClock | null
    readonly builder: TraceBuilder | null
    readonly elements: Map<string, HTMLElement | null>
    readonly diagnostics: string[] = []
    pendingReads = 0
    pendingReadsAt: number | null = null
    readonly statuses = new Map<string, string>()
    card: CardLayer | null = null
    sheet: SheetLayer | null = null
    frame = 0
    openReport: Promise<LayoutReport> | null = null
    closeReport: Promise<LayoutReport> | null = null
    reverseReport: Promise<LayoutReport> | null = null
    openDone = false
    closeDone = false
    reverseDone = false
    contentOpacity = 0
    cardTemplate: {
        root: HTMLButtonElement
        image: HTMLImageElement
        title: HTMLDivElement
    } | null = null
    contentMode: 'off' | 'opening' | 'open' | 'closing' | 'reversing' = 'off'
    contentSince = 0
    contentFrom = 0
    private readonly offDiagnostic: () => void
    private readonly control: string | undefined
    private readonly clockNow: () => number

    constructor(options: {
        mc: ManualClock | null
        builder: TraceBuilder | null
        elements: Map<string, HTMLElement | null>
        control?: string | undefined
        clockNow: () => number
    }) {
        installStyles()
        const built = buildStage()
        this.stage = built.stage
        this.header = built.header
        this.mc = options.mc
        this.builder = options.builder
        this.elements = options.elements
        this.control = options.control
        this.clockNow = options.clockNow
        this.group = createLayoutGroup({
            ...(options.mc ? { clock: options.mc.clock } : {}),
            motion: { type: 'spring', duration: 0.55, bounce: 0.05 },
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
        const card = built.card
        const probes = probeBoxes()
        ;(window as unknown as { __scene?: unknown }).__scene = {
            scene: 's-card',
            participants: [...KEYS],
            boxes: probes,
            motion: { type: 'spring', duration: 0.55, bounce: 0.05 },
        }
        this.card = card
        for (const key of KEYS) this.elements.set(key, null)
        this.elements.set('card', card.root)
        this.elements.set('card-image', card.image)
        this.elements.set('card-title', card.title)
        // Snapshot before registration: no engine write may precede the mount
        // baseline.
        if (this.builder) {
            this.builder.mount('card', card.root)
            this.builder.mount('card-image', card.image)
            this.builder.mount('card-title', card.title)
            this.builder.initial('card', card.root)
            this.builder.initial('card-image', card.image)
            this.builder.initial('card-title', card.title)
            for (const [key, box] of Object.entries(probes))
                this.builder.aBox(key, box)
        }
        this.mountCard(card)
        this.mountSheetAtRest()
    }

    /**
     * The sheet content is a participant from the rest state, inside a hidden
     * non-participant sheet, so the open capture has a valid B for it. The
     * sheet/image/title join the group at the open commit and hand off from
     * the card pair.
     */
    private mountSheetAtRest(): void {
        const built = buildSheet()
        built.sheet.style.visibility = 'hidden'
        built.sheet.style.opacity = '1'
        this.stage.append(built.sheet)
        const layer: SheetLayer = {
            root: built.sheet,
            image: built.image,
            title: built.title,
            content: built.content,
            close: built.close,
            presence: null as unknown as PresenceHandle,
            imagePresence: null as unknown as PresenceHandle,
            titlePresence: null as unknown as PresenceHandle,
            removers: [],
        }
        this.sheet = layer
        if (this.builder) {
            this.builder.mount('sheet', layer.root)
            this.builder.mount('sheet-image', layer.image)
            this.builder.mount('sheet-title', layer.title)
            this.builder.mount('sheet-content', layer.content)
            this.builder.initial('sheet-content', layer.content)
        }
        layer.removers.push(
            this.group.add(layer.content, {
                layout: 'position',
                radius: false,
            })
        )
        this.elements.set('sheet-content', layer.content)
    }

    private mountCard(card: CardLayer): void {
        const motion = presenceMotion()
        card.removers.push(
            this.group.add(card.root, {
                layout: true,
                layoutId: 'today-card',
                radius: true,
            }),
            this.group.add(card.image, {
                layout: true,
                layoutId: 'today-image',
                radius: false,
            }),
            this.group.add(card.title, {
                layout: 'position',
                layoutId: 'today-title',
                radius: false,
            })
        )
        card.presence = createPresence(card.root, motion, {
            ...(this.mc ? { clock: this.mc.clock } : {}),
        })
        card.imagePresence = createPresence(card.image, motion, {
            ...(this.mc ? { clock: this.mc.clock } : {}),
        })
        card.titlePresence = createPresence(card.title, motion, {
            ...(this.mc ? { clock: this.mc.clock } : {}),
        })
    }

    private mountSheet(): SheetLayer {
        const layer = this.sheet!
        const motion = presenceMotion()
        layer.root.style.visibility = 'visible'
        layer.root.style.opacity = '1'
        // The content was registered at rest; the surface/image/title join now
        // with the card pair as their handoff source.
        layer.removers.push(
            this.group.add(layer.root, {
                layout: true,
                layoutId: 'today-card',
                radius: true,
            }),
            this.group.add(
                layer.image,
                this.control === 'card-no-image-id'
                    ? { layout: true, radius: false }
                    : { layout: true, layoutId: 'today-image', radius: false }
            ),
            this.group.add(
                layer.title,
                this.control === 'card-no-title-id'
                    ? { layout: 'position', radius: false }
                    : {
                          layout: 'position',
                          layoutId: 'today-title',
                          radius: false,
                      }
            )
        )
        layer.presence = createPresence(layer.root, motion, {
            ...(this.mc ? { clock: this.mc.clock } : {}),
        })
        layer.imagePresence = createPresence(layer.image, motion, {
            ...(this.mc ? { clock: this.mc.clock } : {}),
        })
        layer.titlePresence = createPresence(layer.title, motion, {
            ...(this.mc ? { clock: this.mc.clock } : {}),
        })
        for (const [key, element] of [
            ['sheet', layer.root],
            ['sheet-image', layer.image],
            ['sheet-title', layer.title],
            ['sheet-content', layer.content],
        ] as const) {
            this.elements.set(key, element)
        }
        layer.root.style.zIndex = '11'
        if (this.card) this.card.root.style.zIndex = '10'
        return layer
    }

    private removeCard(): void {
        const card = this.card
        if (!card) return
        for (const remove of card.removers) remove()
        card.presence.dispose()
        card.imagePresence.dispose()
        card.titlePresence.dispose()
        card.root.remove()
        this.cardTemplate = {
            root: card.root,
            image: card.image,
            title: card.title,
        }
        this.card = null
        this.elements.set('card', null)
        this.elements.set('card-image', null)
        this.elements.set('card-title', null)
    }

    private removeSheet(): void {
        const sheet = this.sheet
        if (!sheet) return
        for (const remove of sheet.removers) remove()
        sheet.presence.dispose()
        sheet.imagePresence.dispose()
        sheet.titlePresence.dispose()
        sheet.root.remove()
        this.sheet = null
        for (const key of [
            'sheet',
            'sheet-image',
            'sheet-title',
            'sheet-content',
        ]) {
            this.elements.set(key, null)
        }
    }

    private track(
        label: string,
        promise: Promise<LayoutReport>,
        done: (value: boolean) => void
    ): void {
        void promise.then((report) => {
            this.statuses.set(label, report.status)
            this.builder?.report({
                label,
                status: report.status,
                snapped: report.snapped.map((snap) => ({
                    key: snap.element.dataset.p ?? 'unknown',
                    reason: snap.reason,
                })),
                settledFrame: this.frame,
            })
            done(true)
        })
    }

    private captureCommit(
        label: string,
        mutate: () => void
    ): Promise<LayoutReport> {
        const stats = this.group.stats
        const diagnosticsBefore = this.builder?.diagnostics.length ?? 0
        const nBefore = [...this.elements.values()].filter(
            (element) => element?.isConnected
        ).length
        const styleRadiusCapture =
            (this.elements.get('card')?.isConnected ? 1 : 0) +
            (this.elements.get('sheet')?.isConnected ? 1 : 0)
        const promise = this.group.update(mutate)
        const after = this.group.stats
        const nAfter = [...this.elements.values()].filter(
            (element) => element?.isConnected
        ).length
        const frameReads = this.pendingReads
        const frameReadsAt = this.pendingReadsAt
        this.pendingReads = 0
        this.pendingReadsAt = null
        this.builder?.commit({
            label,
            frame: this.frame,
            nBefore,
            nAfter,
            rects: after.rects - stats.rects,
            offsets: after.offsets - stats.offsets,
            styles: after.styles - stats.styles,
            layoutOffsets: after.layoutOffsets - stats.layoutOffsets,
            probes: after.probes - stats.probes,
            parents: after.parents - stats.parents,
            frameReads,
            frameReadsAt,
            diagnostics: [],
            onSnap: [],
            aged:
                this.builder?.diagnostics
                    .slice(diagnosticsBefore)
                    .some((event) => event.code === 'capture-aged') ?? false,
            agedKeys:
                this.builder?.diagnostics
                    .slice(diagnosticsBefore)
                    .filter((event) => event.code === 'capture-aged')
                    .flatMap((event) => (event.key ? [event.key] : [])) ?? [],
            stylesExpected:
                styleRadiusCapture + nAfter + (isWebKitEngine() ? nAfter : 0),
            styleRadiusCapture,
            styleActiveFlush: nAfter,
        })
        return promise
    }

    commitOpen(): void {
        this.header.focus()
        const card = this.card!
        const exits = [
            card.presence.exit(),
            card.imagePresence.exit(),
            card.titlePresence.exit(),
        ]
        this.openReport = this.captureCommit('open', () => {
            this.sheet = this.mountSheet()
            this.contentMode = 'opening'
            this.contentSince = this.clockNow()
            this.contentFrom = 0
            this.animateContent()
        })
        this.track('open', this.openReport, (done) => {
            this.openDone = done
        })
        void Promise.all(exits).then(() => {
            if (this.card === card) this.removeCard()
        })
        if (this.control === 'card-no-inert') {
            card.root.removeAttribute('inert')
        }
        if (this.control === 'card-image-offset') {
            const image = this.sheet?.image
            if (image)
                image.style.setProperty('translate', '0.1px 0px', 'important')
        }
        if (this.control === 'card-focus-follower') {
            // The control must prove the metric, not depend on whether the
            // browser can focus an inert follower: drop the inert attribute
            // for this control and focus the follower directly.
            card.root.removeAttribute('inert')
            card.root.tabIndex = -1
            card.root.focus()
        }
        if (this.builder) this.builder.record('flush', this.frame, 'open')
    }

    commitClose(): void {
        this.header.focus()
        const sheet = this.sheet!
        const exits = [
            sheet.presence.exit(),
            sheet.imagePresence.exit(),
            sheet.titlePresence.exit(),
        ]
        this.closeReport = this.captureCommit('close', () => {
            const template = this.cardTemplate
            const card: CardLayer = template
                ? {
                      root: template.root,
                      image: template.image,
                      title: template.title,
                      presence: null as unknown as PresenceHandle,
                      imagePresence: null as unknown as PresenceHandle,
                      titlePresence: null as unknown as PresenceHandle,
                      removers: [],
                  }
                : (() => {
                      const built = buildStage()
                      const layer: CardLayer = {
                          root: built.card.root,
                          image: built.card.image,
                          title: built.card.title,
                          presence: null as unknown as PresenceHandle,
                          imagePresence: null as unknown as PresenceHandle,
                          titlePresence: null as unknown as PresenceHandle,
                          removers: [],
                      }
                      built.stage.remove()
                      return layer
                  })()
            if (this.card) this.removeCard()
            this.stage.append(card.root)
            card.root.style.zIndex = '11'
            sheet.root.style.zIndex = '10'
            this.card = card
            for (const [key, element] of [
                ['card', card.root],
                ['card-image', card.image],
                ['card-title', card.title],
            ] as const) {
                this.elements.set(key, element)
            }
            if (this.builder) {
                this.builder.mount('card', card.root)
                this.builder.mount('card-image', card.image)
                this.builder.mount('card-title', card.title)
            }
            this.mountCard(card)
            this.contentMode = 'closing'
            this.contentSince = this.clockNow()
            this.contentFrom = this.contentOpacity
            this.animateContent()
        })
        this.track('close', this.closeReport, (done) => {
            this.closeDone = done
        })
        void Promise.all(exits).then((results) => {
            if (
                this.sheet === sheet &&
                results.every((result) => result === 'exited')
            ) {
                this.removeSheet()
            }
        })
        if (this.builder) this.builder.record('flush', this.frame, 'close')
    }

    commitReverse(): void {
        this.header.focus()
        const card = this.card!
        const sheet = this.sheet!
        const exits = [
            card.presence.exit(),
            card.imagePresence.exit(),
            card.titlePresence.exit(),
        ]
        this.reverseReport = this.captureCommit('reverse', () => {
            void sheet.presence.enter()
            void sheet.imagePresence.enter()
            void sheet.titlePresence.enter()
            card.root.style.zIndex = '10'
            sheet.root.style.zIndex = '11'
            this.contentMode = 'reversing'
            this.contentSince = this.clockNow()
            this.contentFrom = this.contentOpacity
            this.animateContent()
        })
        this.track('reverse', this.reverseReport, (done) => {
            this.reverseDone = done
        })
        void Promise.all(exits).then(() => {
            if (this.card === card) this.removeCard()
        })
        if (this.builder) this.builder.record('flush', this.frame, 'reverse')
    }

    private animateContent(): void {
        if (this.mc !== null) return
        const sheet = this.sheet
        if (!sheet) return
        const content = sheet.content
        if (this.contentMode === 'opening') {
            content.style.transition = `opacity 150ms cubic-bezier(0,0,0.58,1) ${(contentDelay() * 1000).toFixed(1)}ms`
            content.style.opacity = '1'
            content.style.visibility = 'visible'
            content.style.pointerEvents = 'auto'
            sheet.close.tabIndex = 0
        } else if (this.contentMode === 'closing') {
            content.style.transition = 'opacity 200ms cubic-bezier(0.42,0,1,1)'
            content.style.opacity = '0'
            content.style.visibility = 'hidden'
            content.style.pointerEvents = 'none'
            sheet.close.tabIndex = -1
        } else if (this.contentMode === 'reversing') {
            content.style.transition = 'opacity 150ms cubic-bezier(0,0,0.58,1)'
            content.style.opacity = '1'
            content.style.visibility = 'visible'
            content.style.pointerEvents = 'auto'
            sheet.close.tabIndex = 0
        }
    }

    updateContent(): void {
        const sheet = this.sheet
        if (!sheet) return
        const content = sheet.content
        if (this.contentMode === 'off') return
        const elapsed = (this.clockNow() - this.contentSince) / 1000
        const delay = contentDelay()
        let target = this.contentOpacity
        if (this.contentMode === 'opening') {
            // The from-rest lead's first clock frame carries dt = 0 (§4.5).
            const lead = Math.max(0, elapsed - 0.016)
            const p = perceptual(0.55, lead)
            target =
                p < 0.5
                    ? this.contentFrom
                    : this.contentFrom +
                      (1 - this.contentFrom) * EASE_OUT((lead - delay) / 0.15)
            if (p >= 1) this.contentMode = 'open'
        } else if (this.contentMode === 'closing') {
            target = this.contentFrom * (1 - EASE_IN(elapsed / 0.2))
            if (elapsed >= 0.2) this.contentMode = 'off'
        } else if (this.contentMode === 'reversing') {
            target =
                this.contentFrom +
                (1 - this.contentFrom) * EASE_OUT(elapsed / 0.15)
            if (elapsed >= 0.15) this.contentMode = 'open'
        }
        this.contentOpacity = Math.min(1, Math.max(0, target))
        content.style.opacity = String(this.contentOpacity)
        const visible = this.contentOpacity > 0.001
        content.style.visibility = visible ? 'visible' : 'hidden'
        content.style.pointerEvents = visible ? 'auto' : 'none'
        sheet.close.tabIndex = visible ? 0 : -1
    }

    dispose(): void {
        this.offDiagnostic()
        this.card?.presence.dispose()
        this.card?.imagePresence.dispose()
        this.card?.titlePresence.dispose()
        this.sheet?.presence.dispose()
        this.sheet?.imagePresence.dispose()
        this.sheet?.titlePresence.dispose()
        this.group.dispose()
        this.stage.remove()
    }
}

export interface CardSceneOptions {
    readonly control?: string | undefined
}

export class CardScene {
    static async runManual(
        options: CardSceneOptions = {}
    ): Promise<SceneTrace> {
        const mc = createManualClock()
        const elements = new Map<string, HTMLElement | null>()
        const builder = new TraceBuilder({
            scene: 's-card',
            stepMs: 16,
            keys: KEYS,
            elements,
            radii: new Set(['card', 'sheet']),
            font: new Set(['card-title', 'sheet-title']),
            clock: mc,
        })
        const runtime = new CardRuntime({
            mc,
            builder,
            elements,
            control: options.control,
            clockNow: () => mc.now,
        })
        await document.fonts.ready
        await Promise.all(
            [...document.images].map((image) =>
                image.decode().catch(() => undefined)
            )
        )
        let frame = 0
        const step = async () => {
            const stats = runtime.group.stats
            mc.frame(16)
            frame += 1
            runtime.frame = frame
            const reads = runtime.group.stats.reads - stats.reads
            if (reads > 0) {
                runtime.pendingReads += reads
                runtime.pendingReadsAt ??= frame
                builder.steadyFrameReads += reads
                builder.steadyFrameReadsAt ??= frame
            }
            await microtasks()
            runtime.updateContent()
            builder.record('frame', frame)
        }
        try {
            // Establish the feed card as the lead and its presented box before
            // the first commit (the rest state the scene starts from).
            await runtime.group.update(() => undefined)
            builder.record('frame', 0)
            runtime.frame = 0
            runtime.commitOpen()
            let guard = 0
            while (guard++ < 300) {
                if (runtime.openDone && runtime.group.stats.tracks === 0) break
                await step()
            }
            // one settled frame without a commit, so the settle observation is
            // unambiguous and the follower is already unmounted
            await step()
            builder.settleFrames.push(frame)
            await step()
            runtime.commitClose()
            for (let i = 0; i < 15; i++) await step()
            runtime.commitReverse()
            guard = 0
            while (guard++ < 300) {
                if (runtime.reverseDone && runtime.group.stats.tracks === 0)
                    break
                await step()
            }
            await microtasks()
            await step()
            builder.settleFrames.push(frame)
            const final: SceneTrace['final'] = {
                tracks: runtime.group.stats.tracks,
                holds: runtime.group.stats.holds,
                clockPending: mc.pending,
                clockSize: mc.clock.size,
                connected: [...runtime.elements]
                    .filter(([, element]) => element?.isConnected)
                    .map(([key]) => key),
                diagnostics: [...runtime.diagnostics],
            }
            builder.record('frame', frame)
            return builder.build(final)
        } finally {
            runtime.dispose()
        }
    }

    static async runReal(): Promise<RealTrace> {
        const granularityInfo = measureGranularityInfo()
        const g = granularityInfo.value
        const sampler = installRafSampler()
        const runtime = new CardRuntime({
            mc: null,
            builder: null,
            elements: new Map(),
            clockNow: () => performance.now(),
        })
        await document.fonts.ready
        await Promise.all(
            [...document.images].map((image) =>
                image.decode().catch(() => undefined)
            )
        )
        const commits: { label: string; at: number }[] = []
        const open = () => {
            sampler.markCommit()
            runtime.commitOpen()
            commits.push({ label: 'open', at: performance.now() })
            return runtime.openReport!
        }
        const close = () => {
            sampler.markCommit()
            runtime.commitClose()
            commits.push({ label: 'close', at: performance.now() })
            return runtime.closeReport!
        }
        const reverse = () => {
            sampler.markCommit()
            runtime.commitReverse()
            commits.push({ label: 'reverse', at: performance.now() })
            return runtime.reverseReport!
        }
        // The real twin uses CSS opacity transitions for the author layer.
        try {
            await nextFrame()
            await nextFrame()
            await runtime.group.update(() => undefined)
            const opening = open()
            await opening
            void close()
            await waitUntil(commits[1]!.at + 224)
            const reversing = reverse()
            await reversing
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
                scene: 's-card',
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
            await CardScene.runReal()
            await waitMs(700)
        }
    }
}
