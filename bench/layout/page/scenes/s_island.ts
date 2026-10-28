/**
 * S-ISLAND — live-activity pill to card (vanilla, P2; scene spec 2.6).
 *
 * A 126x37 black pill morphs into a 358x158 card, radius 18.5 -> 40, with a
 * content crossfade. A tap at 30 % of the expansion reverses the pair from its
 * presented box and velocity; the radius continues from the current value.
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
    waitMs,
    waitUntil,
} from '../harness.ts'
import {
    boxOf,
    EASE_OUT,
    FONT,
    finalState,
    homeIndicator,
    participant,
    perceptual,
    probeStage,
    recordCommit,
    reportTracker,
    SPRING,
    STATUS_CSS,
    statusBar,
    styleOnce,
} from './kit.ts'

const KEYS = ['pill', 'card', 'pill-content', 'card-content'] as const
const STEP = 10
const EXPAND_D = 0.5

let stylesInstalled = false

function installStyles(): void {
    if (stylesInstalled) return
    stylesInstalled = true
    styleOnce(
        's-island',
        `
        ${STATUS_CSS}
        .island-stage {
            position: fixed; inset: 0; width: 390px; height: 844px;
            overflow: hidden; color: #fff; font-family: ${FONT};
            -webkit-font-smoothing: antialiased; font-optical-sizing: auto;
            color-scheme: dark;
            background: linear-gradient(160deg,#0A1224,#101B33 45%,#05070C);
        }
        .island-stage .ios-status { color: #FFFFFF; }
        .island-stage .ios-home { background: rgba(255,255,255,0.85); }
        .island-pill {
            position: absolute; left: 132px; top: 11px; width: 126px; height: 37px;
            border-radius: 18.5px; background: #000000;
            box-shadow: 0 10px 30px rgba(0,0,0,0.35);
            transform-origin: 50% 0%; overflow: hidden; z-index: 10;
        }
        .island-card {
            position: absolute; left: 16px; top: 11px; width: 358px; height: 158px;
            border-radius: 40px; background: #000000;
            box-shadow: 0 10px 30px rgba(0,0,0,0.35);
            transform-origin: 50% 0%; overflow: hidden; z-index: 10;
            visibility: hidden;
        }
        .island-pill-content {
            position: absolute; left: 0; top: 0; width: 126px; height: 37px;
            transform-origin: 50% 0%;
        }
        .island-card-content {
            position: absolute; left: 0; top: 0; width: 358px; height: 158px;
            transform-origin: 50% 0%; opacity: 0;
        }
        .island-card[data-collapsed="true"] {
            left: 132px; top: 11px; width: 126px; height: 37px;
        }
        .island-card[data-collapsed="true"] .island-card-content {
            width: 126px; height: 37px;
        }
        .island-art { position: absolute; border-radius: 4px; background: linear-gradient(160deg,#0A84FF,#5E5CE6); }
        .island-pill-art { left: 12px; top: 8px; width: 20px; height: 20px; }
        .island-pill-time { position: absolute; left: 38px; top: 9px; font: 600 12px/16px ${FONT}; letter-spacing: 0; }
        .island-wave { position: absolute; left: 84px; top: 12px; display: flex; align-items: center; gap: 2px; }
        .island-wave i { display: block; width: 2px; border-radius: 1px; background: #34C759; }
        .island-card-art { left: 16px; top: 16px; width: 64px; height: 64px; border-radius: 8px; background: linear-gradient(160deg,#FF9500,#FF2D55); }
        .island-title { position: absolute; left: 96px; top: 17px; font: 600 15px/20px ${FONT}; letter-spacing: -0.24px; }
        .island-sub { position: absolute; left: 96px; top: 39px; font: 400 13px/18px ${FONT}; letter-spacing: -0.08px; color: rgba(255,255,255,0.60); }
        .island-progress { position: absolute; left: 96px; top: 63px; width: 214px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.18); }
        .island-progress i { display: block; width: 40%; height: 4px; border-radius: 2px; background: #30D158; }
        .island-times { position: absolute; left: 96px; top: 73px; width: 214px; display: flex; justify-content: space-between; font: 400 11px/13px ${FONT}; letter-spacing: 0.07px; color: rgba(255,255,255,0.60); }
        .island-transport { position: absolute; right: 18px; bottom: 14px; display: flex; gap: 20px; color: rgba(255,255,255,0.92); font: 400 18px/20px ${FONT}; }
        .island-focus { position: absolute; left: 0; top: 0; width: 2px; height: 2px; opacity: 0; border: 0; background: transparent; }
        .island-demo { position: absolute; left: 16px; top: 60px; width: 2px; height: 2px; opacity: 0; border: 0; background: transparent; }
    `
    )
}

// FONT is imported through the template above; keep the module-local binding
// explicit for the style string interpolation.
interface IslandLayer {
    readonly stage: HTMLDivElement
    readonly focus: HTMLButtonElement
    readonly pill: HTMLDivElement
    readonly card: HTMLDivElement
    readonly pillContent: HTMLDivElement
    readonly cardContent: HTMLDivElement
}

function buildLayer(): IslandLayer {
    installStyles()
    const stage = document.createElement('div')
    stage.className = 'island-stage'
    const pill = document.createElement('div')
    pill.className = 'island-pill'
    pill.dataset.p = 'pill'
    const pillContent = document.createElement('div')
    pillContent.className = 'island-pill-content'
    pillContent.dataset.p = 'pill-content'
    const pillArt = document.createElement('div')
    pillArt.className = 'island-art island-pill-art'
    const pillTime = document.createElement('div')
    pillTime.className = 'island-pill-time'
    pillTime.textContent = '2:14'
    const wave = document.createElement('div')
    wave.className = 'island-wave'
    for (const height of [6, 12, 8, 14, 5]) {
        const bar = document.createElement('i')
        bar.style.height = `${height}px`
        wave.append(bar)
    }
    pillContent.append(pillArt, pillTime, wave)
    pill.append(pillContent)

    const card = document.createElement('div')
    card.className = 'island-card'
    card.dataset.p = 'card'
    const cardContent = document.createElement('div')
    cardContent.className = 'island-card-content'
    cardContent.dataset.p = 'card-content'
    const art = document.createElement('div')
    art.className = 'island-art island-card-art'
    const title = document.createElement('div')
    title.className = 'island-title'
    title.textContent = 'Now Playing'
    const sub = document.createElement('div')
    sub.className = 'island-sub'
    sub.textContent = 'Ambient · 12 tracks'
    const progress = document.createElement('div')
    progress.className = 'island-progress'
    const fill = document.createElement('i')
    progress.append(fill)
    const times = document.createElement('div')
    times.className = 'island-times'
    times.innerHTML = '<span>1:03</span><span>2:14</span>'
    const transport = document.createElement('div')
    transport.className = 'island-transport'
    transport.innerHTML = '<span>⏮</span><span>⏸</span><span>⏭</span>'
    cardContent.append(art, title, sub, progress, times, transport)
    card.append(cardContent)

    const focus = document.createElement('button')
    focus.type = 'button'
    focus.className = 'island-focus'
    focus.setAttribute('aria-label', 'Live activity')
    stage.append(statusBar(), pill, card, focus, homeIndicator())
    document.body.append(stage)
    return { stage, focus, pill, card, pillContent, cardContent }
}

/** The engine-free rest boxes. */
function probeBoxes(): Record<string, Box> {
    installStyles()
    const stage = probeStage()
    const pill = document.createElement('div')
    pill.className = 'island-pill'
    const pillContent = document.createElement('div')
    pillContent.className = 'island-pill-content'
    pill.append(pillContent)
    const card = document.createElement('div')
    card.className = 'island-card'
    card.style.visibility = 'visible'
    const cardContent = document.createElement('div')
    cardContent.className = 'island-card-content'
    card.append(cardContent)
    stage.append(pill, card)
    const boxes = {
        pill: boxOf(pill),
        card: boxOf(card),
        'pill-content': boxOf(pillContent),
        'card-content': boxOf(cardContent),
    }
    stage.remove()
    return boxes
}

function holdMotion(): {
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

function diagnosticsListener(
    onEvent: (code: string, action: string) => void
): () => void {
    return layoutRuntime.onDiagnostic((event) =>
        onEvent(event.code, event.action)
    )
}

class IslandRuntime {
    readonly layer: IslandLayer
    readonly group: LayoutGroup
    readonly mc: ManualClock | null
    readonly builder: TraceBuilder | null
    readonly elements: Map<string, HTMLElement | null>
    readonly diagnostics: string[] = []
    readonly tracker: ReturnType<typeof reportTracker> | null
    readonly removers = new Map<string, () => void>()
    pillPresence: PresenceHandle
    cardPresence: PresenceHandle | null = null
    frame = 0
    cardExitPromise: Promise<unknown> | null = null
    cardExited = false
    pillFade: {
        from: number
        to: number
        start: number
        duration: number
        curve: 'ease-out' | 'ease-in'
    } | null = null
    cardFade: {
        from: number
        to: number
        start: number
        duration: number
        curve: 'ease-out' | 'ease-in'
    } | null = null
    pillOpacity = 1
    cardOpacity = 0
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
        this.elements = options.elements ?? new Map()
        this.control = options.control
        this.tracker = options.builder ? reportTracker(options.builder) : null
        this.group = createLayoutGroup({
            ...(options.mc ? { clock: options.mc.clock } : {}),
            motion: SPRING.island,
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
            scene: 's-island',
            participants: KEYS,
            boxes: probes,
            motion: SPRING.island,
        }
        for (const key of KEYS) this.elements.set(key, null)
        this.elements.set('pill', this.layer.pill)
        this.elements.set('pill-content', this.layer.pillContent)
        this.elements.set('card-content', this.layer.cardContent)
        if (this.builder) {
            participant(this.builder, 'pill', this.layer.pill, true)
            participant(
                this.builder,
                'pill-content',
                this.layer.pillContent,
                false
            )
            participant(
                this.builder,
                'card-content',
                this.layer.cardContent,
                false
            )
            this.builder.mount('card', this.layer.card)
        }
        this.removers.set(
            'pill',
            this.group.add(this.layer.pill, {
                layout: true,
                layoutId: 'island',
                radius: true,
            })
        )
        this.removers.set(
            'pill-content',
            this.group.add(this.layer.pillContent, {
                layout: 'position',
                radius: false,
            })
        )
        this.removers.set(
            'card-content',
            this.group.add(this.layer.cardContent, {
                layout: true,
                radius: false,
                // The exiting content shrinks with the card on a shorter
                // spring so it settles with the crossfade and is removed with
                // an identity pose (scene contribution).
                motion: { type: 'spring', duration: 0.28, bounce: 0 },
            })
        )
        this.pillPresence = createPresence(this.layer.pill, holdMotion(), {
            ...(options.mc ? { clock: options.mc.clock } : {}),
        })
    }

    private now(): number {
        return this.mc ? this.mc.now : performance.now()
    }

    expand(): Promise<LayoutReport> {
        const layer = this.layer
        layer.focus.focus()
        if (!this.builder) return this.expandReal()
        void this.pillPresence.exit()
        this.pillFade = {
            from: 1,
            to: 0,
            start: this.now(),
            duration: 0.12,
            curve: 'ease-out',
        }
        this.cardOpacity = 0
        layer.cardContent.style.opacity = '0'
        const result = recordCommit({
            builder: this.builder,
            keys: KEYS,
            elements: this.elements,
            frame: this.frame,
            label: 'expand',
            radiusKeys: new Set(['pill', 'card']),
            typedOM: isWebKitEngine(),
            stats: () => this.group.stats,
            run: () =>
                this.group.update(() => {
                    layer.card.style.visibility = 'visible'
                    delete layer.card.dataset.collapsed
                    this.elements.set('card', layer.card)
                    this.removers.set(
                        'card',
                        this.group.add(layer.card, {
                            layout: true,
                            layoutId: 'island',
                            radius: true,
                        })
                    )
                    this.cardPresence = createPresence(
                        layer.card,
                        holdMotion(),
                        {
                            ...(this.mc ? { clock: this.mc.clock } : {}),
                        }
                    )
                }),
        })
        this.builder.record('flush', this.frame, 'expand')
        this.tracker!.track('expand', result.promise, () => this.frame)
        return result.promise
    }

    private expandReal(): Promise<LayoutReport> {
        void this.pillPresence.exit()
        this.pillFade = {
            from: 1,
            to: 0,
            start: performance.now(),
            duration: 0.12,
            curve: 'ease-out',
        }
        this.cardFade = null
        this.layer.cardContent.style.transition =
            'opacity 180ms cubic-bezier(0,0,0.58,1)'
        this.layer.cardContent.style.transitionDelay = '92ms'
        this.layer.cardContent.style.opacity = '1'
        this.layer.pillContent.style.transition =
            'opacity 120ms cubic-bezier(0,0,0.58,1)'
        this.layer.pillContent.style.opacity = '0'
        return this.group.update(() => {
            this.layer.card.style.visibility = 'visible'
            delete this.layer.card.dataset.collapsed
            this.removers.set(
                'card',
                this.group.add(this.layer.card, {
                    layout: true,
                    layoutId: 'island',
                    radius: true,
                })
            )
            this.cardPresence = createPresence(this.layer.card, holdMotion())
        })
    }

    reverse(): Promise<LayoutReport> {
        const layer = this.layer
        layer.focus.focus()
        if (!this.builder) return this.reverseReal()
        const cardExit = this.cardPresence?.exit()
        void this.pillPresence.enter()
        this.pillFade = {
            from: this.pillOpacity,
            to: 1,
            start: this.now(),
            duration: 0.12,
            curve: 'ease-out',
        }
        this.cardFade = {
            from: this.cardOpacity,
            to: 0,
            start: this.now(),
            duration: 0.12,
            curve: 'ease-out',
        }
        // The exiting card collapses to the pill's layout so its nested
        // content settles with an identity pose instead of leaving a
        // counter-projected pose behind (its text is fading out).
        const result = recordCommit({
            builder: this.builder,
            keys: KEYS,
            elements: this.elements,
            frame: this.frame,
            label: 'reverse',
            radiusKeys: new Set(['pill', 'card']),
            typedOM: isWebKitEngine(),
            stats: () => this.group.stats,
            run: () => {
                const run = this.group.update(() => {
                    layer.card.dataset.collapsed = 'true'
                })
                if (this.control === 'island-snap-reverse') {
                    layer.pill.style.setProperty(
                        'translate',
                        '0px 0px',
                        'important'
                    )
                    layer.pill.style.setProperty('scale', '1 1', 'important')
                }
                return run
            },
        })
        this.builder.record('flush', this.frame, 'reverse')
        this.tracker!.track('reverse', result.promise, () => this.frame)
        this.cardExitPromise = cardExit ?? null
        void cardExit?.then((exit) => {
            if (exit !== 'exited' && exit !== 'timeout') return
            this.cardExited = true
            this.removeExitedCard()
        })
        return result.promise
    }

    private reverseReal(): Promise<LayoutReport> {
        void this.cardPresence?.exit()
        void this.pillPresence.enter()
        this.layer.pillContent.style.transition =
            'opacity 120ms cubic-bezier(0,0,0.58,1)'
        this.layer.pillContent.style.opacity = '1'
        this.layer.cardContent.style.transition =
            'opacity 120ms cubic-bezier(0,0,0.58,1)'
        this.layer.cardContent.style.transitionDelay = '0ms'
        this.layer.cardContent.style.opacity = '0'
        const card = this.layer.card
        void this.cardPresence?.exit().then((result) => {
            if (result === 'exited' || result === 'timeout') {
                if (this.elements.get('card') === card) {
                    this.removers.get('card-content')?.()
                    this.removers.delete('card-content')
                    this.elements.set('card-content', null)
                    this.removers.get('card')?.()
                    this.removers.delete('card')
                    this.elements.set('card', null)
                    card.remove()
                }
            }
        })
        this.layer.card.dataset.collapsed = 'true'
        return this.group.update(() => {
            this.layer.card.dataset.collapsed = 'true'
        })
    }

    author(now: number): void {
        if (this.mc === null) return
        if (this.pillFade) {
            const p =
                (now - this.pillFade.start) / (this.pillFade.duration * 1000)
            this.pillOpacity =
                this.pillFade.from +
                (this.pillFade.to - this.pillFade.from) *
                    EASE_OUT(Math.min(1, Math.max(0, p)))
            this.layer.pillContent.style.opacity = String(this.pillOpacity)
            if (p >= 1) this.pillFade = null
        }
        if (this.cardFade) {
            const p =
                (now - this.cardFade.start) / (this.cardFade.duration * 1000)
            this.cardOpacity =
                this.cardFade.from +
                (this.cardFade.to - this.cardFade.from) *
                    EASE_OUT(Math.min(1, Math.max(0, p)))
            this.layer.cardContent.style.opacity = String(this.cardOpacity)
            if (p >= 1) this.cardFade = null
        } else if (this.expandStart !== null && this.cardFadeStart === null) {
            // The from-rest lead's first clock frame carries dt = 0 (§4.5).
            const elapsed = (now - this.expandStart - STEP) / 1000
            const p = perceptual(EXPAND_D, elapsed)
            if (p >= 0.5) {
                this.cardFadeStart = now
                this.cardFade = {
                    from: this.cardOpacity,
                    to: 1,
                    start: now,
                    duration: 0.18,
                    curve: 'ease-out',
                }
            }
        }
    }

    expandStart: number | null = null
    cardFadeStart: number | null = null

    markExpandStart(): void {
        this.expandStart = this.now()
        this.cardFadeStart = null
        this.cardFade = null
    }

    /** Remove the exited card and its nested content once every track settled. */
    removeExitedCard(): void {
        const card = this.layer.card
        if (this.elements.get('card') !== card) return
        this.removers.get('card-content')?.()
        this.removers.delete('card-content')
        this.elements.set('card-content', null)
        this.removers.get('card')?.()
        this.removers.delete('card')
        this.elements.set('card', null)
        card.remove()
    }

    dispose(): void {
        this.offDiagnostic()
        this.pillPresence.dispose()
        this.cardPresence?.dispose()
        for (const remove of this.removers.values()) remove()
        this.removers.clear()
        this.group.dispose()
        this.layer.stage.remove()
    }
}

async function stepIsland(
    mc: ManualClock,
    builder: TraceBuilder,
    runtime: IslandRuntime
): Promise<void> {
    const stats = runtime.group.stats
    mc.frame(STEP)
    runtime.frame += 1
    const reads = runtime.group.stats.reads - stats.reads
    if (reads > 0) {
        builder.steadyFrameReads += reads
        builder.steadyFrameReadsAt ??= runtime.frame
    }
    await microtasks()
    runtime.author(mc.now)
    builder.record('frame', runtime.frame)
}

export class IslandScene {
    static async runManual(
        options: { control?: string | undefined } = {}
    ): Promise<SceneTrace> {
        const mc = createManualClock()
        const elements = new Map<string, HTMLElement | null>()
        const builder = new TraceBuilder({
            scene: 's-island',
            stepMs: STEP,
            keys: KEYS,
            elements,
            radii: new Set(['pill', 'card']),
            clock: mc,
        })
        const runtime = new IslandRuntime({
            mc,
            builder,
            elements,
            control: options.control,
        })
        await document.fonts.ready
        await Promise.all(
            [...document.images].map((image) =>
                image.decode().catch(() => undefined)
            )
        )
        await runtime.group.update(() => undefined)
        try {
            builder.record('frame', 0)
            runtime.frame = 0
            runtime.markExpandStart()
            runtime.expand()
            for (let i = 0; i < 16; i++) await stepIsland(mc, builder, runtime)
            runtime.reverse()
            let guard = 0
            while (guard++ < 300) {
                if (
                    runtime.tracker?.done.get('expand') &&
                    runtime.tracker?.done.get('reverse') &&
                    runtime.group.stats.tracks === 0 &&
                    (runtime.cardExitPromise === null || runtime.cardExited)
                )
                    break
                await stepIsland(mc, builder, runtime)
            }
            runtime.removeExitedCard()
            await microtasks()
            await stepIsland(mc, builder, runtime)
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
        const runtime = new IslandRuntime({ mc: null, builder: null })
        await document.fonts.ready
        const commits: { label: string; at: number }[] = []
        try {
            await nextFrame()
            await nextFrame()
            await runtime.group.update(() => undefined)
            runtime.markExpandStart()
            sampler.markCommit()
            const expandAt = performance.now()
            const expanded = runtime.expand()!
            commits.push({ label: 'expand', at: expandAt })
            void expanded
            // 30 % of the expansion, from the expand commit
            await waitUntil(expandAt + 150)
            sampler.markCommit()
            const reversed = runtime.reverse()!
            commits.push({ label: 'reverse', at: performance.now() })
            await reversed
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
                scene: 's-island',
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
            await IslandScene.runReal()
            await waitMs(700)
        }
    }
}

export const ISLAND_KEYS = KEYS
