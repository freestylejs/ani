/**
 * S-STACK — notification stack (vanilla, P2; scene spec 2.5).
 *
 * Six cards rest as a fan-backed stack through an authored translate/scale.
 * Expanding removes that authored map and the cards spring to the fan; the
 * count badges (nested position participants) travel with them and enter
 * under presence. Collapsing restores the authored stack map.
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
    type CountTimeline,
    expectedStyles,
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
    timelineValue,
} from './kit.ts'

const KEYS = Array.from({ length: 6 }, (_, i) => [
    `card-${i}`,
    `badge-${i}`,
]).flat()
const COUNT_LABELS = [6, 5, 4, 3, 2, 1]
const TITLES = [
    'Messages',
    'Calendar',
    'Reminders',
    'Mail',
    'Fitness',
    'Weather',
]
const BODIES = [
    'Jules: the build is green',
    'Standup in 10 minutes',
    'Buy oat milk',
    '2 new messages',
    'Move goal 78%',
    'Clear until 18:00',
]
const APPS = [
    'linear-gradient(180deg,#34C759,#28A745)',
    'linear-gradient(180deg,#FF3B30,#D70015)',
    'linear-gradient(180deg,#FF9500,#FF6B00)',
    'linear-gradient(180deg,#007AFF,#0051D5)',
    'linear-gradient(180deg,#FF2D55,#D70040)',
    'linear-gradient(180deg,#5AC8FA,#0A84FF)',
]

let stylesInstalled = false

function installStyles(): void {
    if (stylesInstalled) return
    stylesInstalled = true
    styleOnce(
        's-stack',
        `
        ${STATUS_CSS}
        .stack-stage {
            position: fixed; inset: 0; width: 390px; height: 844px;
            overflow: hidden; color: #fff; font-family: ${FONT};
            -webkit-font-smoothing: antialiased; font-optical-sizing: auto;
            color-scheme: dark;
            background: linear-gradient(160deg,#1A2340,#0B1020 60%,#05070C);
        }
        .stack-clock { position: absolute; left: 28px; top: 56px; font: 700 76px/80px ${FONT}; letter-spacing: -1px; }
        .stack-date { position: absolute; left: 28px; top: 142px; font: 400 17px/22px ${FONT}; letter-spacing: -0.41px; color: rgba(255,255,255,0.60); }
        .stack-area { position: absolute; left: 16px; top: 318px; width: 358px; height: 482px; }
        .stack-card {
            position: absolute; left: 0; top: calc(82px * var(--i));
            width: 358px; height: 72px; box-sizing: border-box;
            border-radius: 16px; background: rgba(255,255,255,0.96);
            box-shadow: 0 6px 20px rgba(0,0,0,0.12);
            color: #000; overflow: hidden; transform-origin: 50% 0%;
            padding: 16px;
        }
        .stack-card[data-stack="collapsed"] {
            transform: translateY(calc(420px - 90px * var(--i))) scale(var(--s));
        }
        .stack-app {
            position: absolute; left: 16px; top: 16px; width: 20px; height: 20px;
            border-radius: 5px;
        }
        .stack-title { position: absolute; left: 46px; top: 12px; width: 250px; font: 600 15px/20px ${FONT}; letter-spacing: -0.24px; color: #000; }
        .stack-body { position: absolute; left: 46px; top: 32px; width: 250px; font: 400 13px/18px ${FONT}; letter-spacing: -0.08px; color: rgba(60,60,67,0.60); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stack-badge {
            position: absolute; left: 322px; top: 12px; width: 22px; height: 22px;
            border-radius: 11px; color: #fff; transform-origin: 50% 50%;
        }
        .stack-disc {
            position: absolute; inset: 0; border-radius: 11px;
            background: #FF3B30; color: #fff; font: 700 11px/13px ${FONT};
            letter-spacing: 0.07px; display: flex; align-items: center;
            justify-content: center; transform-origin: 50% 50%;
        }
        .stack-front {
            position: absolute; left: 16px; top: 738px; width: 358px; height: 72px;
            border: 0; padding: 0; margin: 0; background: transparent;
            cursor: pointer; z-index: 90;
        }
    `
    )
}

interface CardLayer {
    readonly card: HTMLDivElement
    readonly badge: HTMLDivElement
    readonly disc: HTMLDivElement
    badgePresence: PresenceHandle | null
    count: CountTimeline | null
}

interface StackLayer {
    readonly stage: HTMLDivElement
    readonly focus: HTMLButtonElement
    readonly cards: CardLayer[]
}

function buildLayer(): StackLayer {
    installStyles()
    const stage = document.createElement('div')
    stage.className = 'stack-stage'
    const clock = document.createElement('div')
    clock.className = 'stack-clock'
    clock.textContent = '9:41'
    const date = document.createElement('div')
    date.className = 'stack-date'
    date.textContent = 'Monday, October 28'
    const area = document.createElement('div')
    area.className = 'stack-area'
    const cards: CardLayer[] = []
    for (let i = 0; i < 6; i++) {
        const card = document.createElement('div')
        card.className = 'stack-card'
        card.dataset.p = `card-${i}`
        card.dataset.stack = 'collapsed'
        card.style.setProperty('--i', String(i))
        card.style.setProperty('--s', String(0.96 ** i))
        card.style.zIndex = String(60 - i)
        const icon = document.createElement('div')
        icon.className = 'stack-app'
        icon.style.background = APPS[i]!
        const title = document.createElement('div')
        title.className = 'stack-title'
        title.textContent = TITLES[i]!
        const body = document.createElement('div')
        body.className = 'stack-body'
        body.textContent = BODIES[i]!
        const badge = document.createElement('div')
        badge.className = 'stack-badge'
        badge.dataset.p = `badge-${i}`
        const scale = 0.96 ** i
        badge.style.transform = `scale(${(1 / scale).toFixed(8)})`
        if (i > 0) badge.style.opacity = '0'
        const disc = document.createElement('div')
        disc.className = 'stack-disc'
        disc.textContent = String(COUNT_LABELS[i])
        if (i > 0) disc.style.transform = 'scale(0.8)'
        badge.append(disc)
        card.append(icon, title, body, badge)
        area.append(card)
        cards.push({ card, badge, disc, badgePresence: null, count: null })
    }
    const focus = document.createElement('button')
    focus.type = 'button'
    focus.className = 'stack-front'
    focus.setAttribute('aria-label', 'Open notifications')
    stage.append(statusBar(), clock, date, area, focus, homeIndicator())
    document.body.append(stage)
    return { stage, focus, cards }
}

function presenceMotion(): {
    present: { opacity: number }
    initial: { opacity: number }
    enter: ReturnType<typeof ani>
    exit: ReturnType<typeof ani>
} {
    return {
        present: { opacity: 1 },
        initial: { opacity: 0 },
        enter: ani({
            to: { opacity: 1 },
            duration: 0.25,
            timing: timing.easeOut(),
        }),
        exit: ani({
            to: { opacity: 0 },
            duration: 0.15,
            timing: timing.easeIn(),
        }),
    }
}

/** The engine-free probe for both rest states. */
function probeBoxes(): Record<string, Box> {
    installStyles()
    const stage = probeStage()
    const area = document.createElement('div')
    area.className = 'stack-area'
    stage.append(area)
    const boxes: Record<string, Box> = {}
    const build = (state: 'stack' | 'fan'): void => {
        area.innerHTML = ''
        for (let i = 0; i < 6; i++) {
            const card = document.createElement('div')
            card.className = 'stack-card'
            card.style.setProperty('--i', String(i))
            card.style.setProperty('--s', String(0.96 ** i))
            card.style.zIndex = String(60 - i)
            if (state === 'stack') card.dataset.stack = 'collapsed'
            const badge = document.createElement('div')
            badge.className = 'stack-badge'
            const scale = 0.96 ** i
            if (state === 'stack')
                badge.style.transform = `scale(${(1 / scale).toFixed(8)})`
            if (state === 'stack' && i > 0) badge.style.opacity = '0'
            const disc = document.createElement('div')
            disc.className = 'stack-disc'
            if (state === 'stack' && i > 0) disc.style.transform = 'scale(0.8)'
            badge.append(disc)
            card.append(badge)
            area.append(card)
            boxes[`card-${i}@${state}`] = boxOf(card)
            boxes[`badge-${i}@${state}`] = boxOf(badge)
        }
    }
    build('stack')
    build('fan')
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

function setExpanded(layer: StackLayer, expanded: boolean): void {
    for (const entry of layer.cards) {
        if (expanded) {
            delete entry.card.dataset.stack
            entry.badge.style.transform = ''
        } else {
            entry.card.dataset.stack = 'collapsed'
            const i = layer.cards.indexOf(entry)
            entry.badge.style.transform = `scale(${(1 / 0.96 ** i).toFixed(8)})`
        }
    }
}

class StackRuntime {
    readonly layer: StackLayer
    readonly group: LayoutGroup
    readonly mc: ManualClock | null
    readonly builder: TraceBuilder | null
    readonly elements = new Map<string, HTMLElement | null>()
    readonly samples: Map<string, HTMLElement | null>
    readonly diagnostics: string[] = []
    readonly tracker: ReturnType<typeof reportTracker> | null
    readonly radii = new Set(KEYS)
    readonly counts: CountTimeline[] = []
    frame = 0
    private readonly offDiagnostic: () => void
    private readonly control: string | undefined

    constructor(options: {
        mc: ManualClock | null
        builder: TraceBuilder | null
        samples?: Map<string, HTMLElement | null>
        control?: string | undefined
    }) {
        this.samples = options.samples ?? new Map()
        this.control = options.control
        installStyles()
        this.layer = buildLayer()
        this.mc = options.mc
        this.builder = options.builder
        this.tracker = options.builder ? reportTracker(options.builder) : null
        this.group = createLayoutGroup({
            ...(options.mc ? { clock: options.mc.clock } : {}),
            motion: SPRING.stack,
            reducedMotion: 'ignore',
            threshold: 1,
            maxNodes: 300,
            maxParticipants: 2000,
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
            scene: 's-stack',
            participants: KEYS,
            boxes: probes,
            motion: SPRING.stack,
        }
        this.layer.cards.forEach((entry, i) => {
            const cardKey = `card-${i}`
            const badgeKey = `badge-${i}`
            this.elements.set(cardKey, entry.card)
            this.elements.set(badgeKey, entry.badge)
            this.samples.set(`${badgeKey}-disc`, entry.disc)
            if (this.builder) {
                participant(this.builder, cardKey, entry.card, true)
                participant(this.builder, badgeKey, entry.badge, true)
            }
            this.group.add(entry.card, {
                layout: true,
                radius: true,
                motion: SPRING.stack,
            })
            if (options.control !== 'stack-badge-nonparticipant') {
                this.group.add(entry.badge, {
                    layout: 'position',
                    radius: true,
                    motion: SPRING.stack,
                })
            }
            if (i > 0) {
                entry.badgePresence = createPresence(
                    entry.badge,
                    presenceMotion(),
                    {
                        ...(options.mc ? { clock: options.mc.clock } : {}),
                    }
                )
            }
        })
    }

    private startCount(
        index: number,
        to: number,
        duration: number,
        curve: 'ease-out' | 'ease-in'
    ): void {
        if (this.control === 'stack-no-badge-scale') return
        const entry = this.layer.cards[index]!
        const from = Number.parseFloat(
            entry.disc.style.transform.match(/scale\(([\d.]+)\)/)?.[1] ?? '1'
        )
        entry.count = {
            from,
            to,
            start: this.mc ? this.mc.now : performance.now(),
            duration,
            curve,
        }
        this.counts.push(entry.count)
    }

    author(now: number): void {
        this.layer.cards.forEach((entry, index) => {
            if (index === 0 || !entry.count) return
            const value = timelineValue(entry.count, now)
            entry.disc.style.transform = `scale(${value.toFixed(6)})`
        })
    }

    expand(): Promise<LayoutReport> {
        this.layer.cards.forEach((entry, i) => {
            if (i > 0) void entry.badgePresence!.enter()
        })
        for (let i = 1; i < 6; i++) this.startCount(i, 1, 0.25, 'ease-out')
        if (!this.builder) {
            return this.group.update(() => {
                setExpanded(this.layer, true)
            })
        }
        const result = recordCommit({
            builder: this.builder!,
            keys: KEYS,
            elements: this.elements,
            frame: this.frame,
            label: 'expand',
            radiusKeys: this.radii,
            typedOM: isWebKitEngine(),
            stats: () => this.group.stats,
            stylesExpected: isWebKitEngine() ? 33 : 21,
            run: () => {
                const run = this.group.update(() => {
                    setExpanded(this.layer, true)
                })
                if (this.control === 'stack-extra-read') this.group.capture()
                return run
            },
        })
        return this.finishCommit('expand', result.promise)
    }

    private finishCommit(
        label: string,
        promise: Promise<LayoutReport>
    ): Promise<LayoutReport> {
        this.builder!.record('flush', this.frame, label)
        this.tracker!.track(label, promise, () => this.frame)
        return promise
    }

    collapse(): Promise<LayoutReport> {
        for (let i = 1; i < 6; i++) {
            void this.layer.cards[i]!.badgePresence!.exit()
            this.startCount(i, 0.8, 0.15, 'ease-in')
        }
        if (!this.builder) {
            return this.group.update(() => {
                setExpanded(this.layer, false)
            })
        }
        const result = recordCommit({
            builder: this.builder!,
            keys: KEYS,
            elements: this.elements,
            frame: this.frame,
            label: 'collapse',
            radiusKeys: this.radii,
            typedOM: isWebKitEngine(),
            stats: () => this.group.stats,
            stylesExpected: isWebKitEngine() ? 24 : 12,
            run: () =>
                this.group.update(() => {
                    setExpanded(this.layer, false)
                }),
        })
        return this.finishCommit('collapse', result.promise)
    }

    dispose(): void {
        this.offDiagnostic()
        for (const entry of this.layer.cards) entry.badgePresence?.dispose()
        this.group.dispose()
        this.layer.stage.remove()
    }
}

export class StackScene {
    static async runManual(
        options: { control?: string | undefined } = {}
    ): Promise<SceneTrace> {
        const mc = createManualClock()
        const elements = new Map<string, HTMLElement | null>()
        const samples = new Map<string, HTMLElement | null>()
        const builder = new TraceBuilder({
            scene: 's-stack',
            stepMs: 16,
            keys: KEYS,
            elements,
            radii: new Set(KEYS),
            samples,
            clock: mc,
        })
        const runtime = new StackRuntime({
            mc,
            builder,
            samples,
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
        try {
            builder.record('frame', 0)
            runtime.frame = 0
            runtime.expand()
            let guard = 0
            while (guard++ < 300) {
                if (
                    runtime.tracker?.done.get('expand') &&
                    runtime.group.stats.tracks === 0
                )
                    break
                await stepStack(mc, builder, runtime)
            }
            await stepStack(mc, builder, runtime)
            builder.settleFrames.push(runtime.frame)
            while (runtime.frame < 60) {
                await stepStack(mc, builder, runtime)
            }
            runtime.collapse()
            guard = 0
            while (guard++ < 300) {
                if (
                    runtime.tracker?.done.get('collapse') &&
                    runtime.group.stats.tracks === 0 &&
                    mc.clock.size === 0
                )
                    break
                await stepStack(mc, builder, runtime)
            }
            await microtasks()
            if (options.control === 'stack-leftover-pose') {
                runtime.elements
                    .get('card-0')
                    ?.style.setProperty('translate', '0.5px 0px', 'important')
            }
            await stepStack(mc, builder, runtime)
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
        const runtime = new StackRuntime({ mc: null, builder: null })
        await document.fonts.ready
        await Promise.all(
            [...document.images].map((image) =>
                image.decode().catch(() => undefined)
            )
        )
        const commits: { label: string; at: number }[] = []
        const expand = (): Promise<LayoutReport> => {
            sampler.markCommit()
            const promise = runtime.expand()
            commits.push({ label: 'expand', at: performance.now() })
            return promise
        }
        const collapse = (): Promise<LayoutReport> => {
            sampler.markCommit()
            const promise = runtime.collapse()
            commits.push({ label: 'collapse', at: performance.now() })
            return promise
        }
        try {
            await nextFrame()
            await nextFrame()
            const expanded = expand()
            await expanded
            await waitUntil(commits[0]!.at + 960)
            const collapsed = collapse()
            await collapsed
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
                scene: 's-stack',
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
            await StackScene.runReal()
            await waitMs(700)
        }
    }
}

async function stepStack(
    mc: ManualClock,
    builder: TraceBuilder,
    runtime: StackRuntime
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
    runtime.author(mc.now)
    builder.record('frame', runtime.frame)
}

export const STACK_EXPECTED_STYLES = {
    expand: (n: number, typedOM: boolean): number =>
        expectedStyles(n, n, typedOM),
    collapse: (n: number, typedOM: boolean): number =>
        expectedStyles(n, n, typedOM),
}
