/** S-SEG — the iOS segmented control calibration scene (§11.6, scene spec 2.3). */

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
    viewBox,
    waitMs,
} from '../harness.ts'
import { homeIndicator, STATUS_CSS, statusBar } from './kit.ts'

const PILL_W = 86.5
const PILL_H = 26
const STEP = 88.5
const SEGMENTS = [0, 1, 2, 3] as const
const KEYS = ['pill'] as const
const FONT =
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif'

let stylesInstalled = false

function installStyles(): void {
    if (stylesInstalled) return
    stylesInstalled = true
    const style = document.createElement('style')
    style.textContent = `
        ${STATUS_CSS}
        .seg-stage {
            position: fixed; inset: 0; width: 390px; height: 844px;
            overflow: hidden; background: #F2F2F7; color: #000;
            font-family: ${FONT}; -webkit-font-smoothing: antialiased;
            font-optical-sizing: auto;
        }
        .seg-nav { position: absolute; left: 16px; top: 100px; font: 700 34px/41px ${FONT}; letter-spacing: 0.4px; }
        .seg-control {
            position: absolute; left: 16px; top: 160px; width: 358px; height: 32px;
            border-radius: 9px; background: rgba(118,118,128,0.12);
            padding: 2px; box-sizing: border-box;
        }
        .seg-pill {
            position: absolute; top: 3px;
            width: ${PILL_W}px; height: ${PILL_H}px; border-radius: 7px;
            background: #FFFFFF; z-index: 1; box-sizing: border-box;
            box-shadow: 0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04);
            transform-origin: 50% 50%;
        }
        .seg-label {
            position: absolute; top: 2px; width: ${STEP}px; height: 28px;
            border: 0; padding: 0; margin: 0; background: transparent;
            font: 600 13px/18px ${FONT}; letter-spacing: -0.08px;
            color: rgba(60,60,67,0.60); z-index: 2; cursor: pointer;
            touch-action: manipulation; display: flex; align-items: center;
            justify-content: center;
        }
        .seg-label[data-selected="true"] { color: #000000; }
    `
    document.head.append(style)
}

interface SegLayer {
    readonly stage: HTMLElement
    readonly pill: HTMLElement
    readonly labels: HTMLElement[]
}

function buildLayer(): SegLayer {
    installStyles()
    const stage = document.createElement('div')
    stage.className = 'seg-stage'
    const nav = document.createElement('div')
    nav.className = 'seg-nav'
    nav.textContent = 'Controls'
    const control = document.createElement('div')
    control.className = 'seg-control'
    control.setAttribute('role', 'tablist')
    const pill = document.createElement('div')
    pill.className = 'seg-pill'
    pill.dataset.p = 'pill'
    pill.style.left = '3px'
    control.append(pill)
    const labels: HTMLElement[] = []
    for (const index of SEGMENTS) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'seg-label'
        button.setAttribute('role', 'tab')
        button.style.left = `${2 + index * STEP}px`
        button.textContent = ['Day', 'Week', 'Month', 'Year'][index]!
        button.dataset.segment = String(index)
        control.append(button)
        labels.push(button)
    }
    stage.append(statusBar(), nav, control, homeIndicator())
    return { stage, pill, labels }
}

function setSelected(layer: SegLayer, segment: number): void {
    layer.labels.forEach((label, index) => {
        label.dataset.selected = index === segment ? 'true' : 'false'
    })
}

function mount(): SegLayer {
    const layer = buildLayer()
    document.body.append(layer.stage)
    setSelected(layer, 0)
    return layer
}

/** Engine-free layout probe: the four pill slots, measured without a group. */
function probePillBoxes(): Box[] {
    installStyles()
    const stage = document.createElement('div')
    stage.style.cssText =
        'position: fixed; inset: 0; width: 390px; height: 844px; visibility: hidden;'
    const control = document.createElement('div')
    control.className = 'seg-control'
    stage.append(control)
    document.body.append(stage)
    const boxes: Box[] = []
    for (const index of SEGMENTS) {
        const pill = document.createElement('div')
        pill.className = 'seg-pill'
        pill.style.left = `${3 + index * STEP}px`
        control.append(pill)
        boxes.push(viewBox(pill))
    }
    const measured = boxes.map((box) => ({ ...box }))
    stage.remove()
    return measured
}

function diagnosticsListener(
    onEvent: (code: string, action: string) => void
): () => void {
    return layoutRuntime.onDiagnostic((event) =>
        onEvent(event.code, event.action)
    )
}

function finalOf(
    group: LayoutGroup,
    mc: ManualClock,
    connected: readonly string[],
    diagnostics: readonly string[]
): SceneTrace['final'] {
    return {
        tracks: group.stats.tracks,
        holds: group.stats.holds,
        clockPending: mc.pending,
        clockSize: mc.clock.size,
        connected: [...connected],
        diagnostics: [...diagnostics],
    }
}

export interface SegSceneOptions {
    readonly control?: string | undefined
}

export class SegScene {
    static async runManual(options: SegSceneOptions = {}): Promise<SceneTrace> {
        const layer = mount()
        await document.fonts.ready
        const mc = createManualClock()
        const elements = new Map<string, HTMLElement | null>([
            ['pill', layer.pill],
        ])
        const builder = new TraceBuilder({
            scene: 's-seg',
            stepMs: 16,
            keys: KEYS,
            elements,
            radii: new Set(['pill']),
            clock: mc,
        })
        builder.mount('pill', layer.pill)
        builder.initial('pill', layer.pill)
        const probes = probePillBoxes()
        probes.forEach((box, index) => builder.aBox(`pill-${index}`, box))
        ;(window as unknown as { __scene?: unknown }).__scene = {
            scene: 's-seg',
            participants: ['pill'],
            boxes: { pill: probes },
            motion: { type: 'spring', duration: 0.35, bounce: 0.12 },
        }
        const diagnostics: string[] = []
        const group = createLayoutGroup({
            clock: mc.clock,
            motion: { type: 'spring', duration: 0.35, bounce: 0.12 },
            reducedMotion: 'ignore',
            threshold: 1,
            maxNodes: 300,
            maxParticipants: 2000,
            onSnap: (element, reason) => {
                builder.snap(element.dataset.p ?? 'unknown', reason, frame)
            },
        })
        const offDiagnostic = diagnosticsListener((code, action) => {
            diagnostics.push(code)
            builder.diagnostic(code, action, frame, null)
        })
        const remove = group.add(layer.pill, {
            layout: true,
            layoutId: 'seg-pill',
            radius: true,
        })
        let frame = 0
        let pendingReads = 0
        let pendingReadsAt: number | null = null
        const statuses = new Map<string, string>()
        let lastTranslate = layer.pill.style.getPropertyValue('translate')
        let restOverride = false

        const record = (kind: 'frame' | 'flush', label?: string) => {
            builder.record(kind, frame, label)
        }
        const commit = (label: string, segment: number) => {
            const stats = group.stats
            const diagnosticsBefore = builder.diagnostics.length
            const promise = group.update(() => {
                layer.pill.style.left = `${3 + segment * STEP}px`
                setSelected(layer, segment)
            })
            const after = group.stats
            builder.commit({
                label,
                frame,
                nBefore: 1,
                nAfter: 1,
                rects: after.rects - stats.rects,
                offsets: after.offsets - stats.offsets,
                styles: after.styles - stats.styles,
                probes: after.probes - stats.probes,
                parents: after.parents - stats.parents,
                frameReads: pendingReads,
                frameReadsAt: pendingReadsAt,
                diagnostics: [],
                onSnap: [],
                aged: builder.diagnostics
                    .slice(diagnosticsBefore)
                    .some((event) => event.code === 'capture-aged'),
                agedKeys: builder.diagnostics
                    .slice(diagnosticsBefore)
                    .filter((event) => event.code === 'capture-aged')
                    .flatMap((event) => (event.key ? [event.key] : [])),
                stylesExpected: isWebKitEngine() ? 3 : 2,
                styleRadiusCapture: 1,
                styleActiveFlush: 1,
            })
            pendingReads = 0
            pendingReadsAt = null
            void promise.then((report: LayoutReport) => {
                statuses.set(label, report.status)
                builder.report({
                    label,
                    status: report.status,
                    snapped: report.snapped.map((snap) => ({
                        key: snap.element.dataset.p ?? 'unknown',
                        reason: snap.reason,
                    })),
                    settledFrame: frame,
                })
            })
            if (options.control === 'rest-retarget' && label === 'tap-2') {
                restOverride = true
            }
            if (options.control === 'jump-from-A' && label === 'tap-2') {
                // the first frame starts at A instead of the presented box
                layer.pill.style.setProperty(
                    'translate',
                    '0px 0px',
                    'important'
                )
            }
            record('flush', label)
        }
        const step = async () => {
            const stats = group.stats
            const priorTranslate = lastTranslate
            mc.frame(16)
            frame += 1
            if (restOverride && frame === 6) {
                // the first frame after the retarget is forced to the flush
                // pose: a restart from rest that G1 must catch
                layer.pill.style.setProperty(
                    'translate',
                    priorTranslate,
                    'important'
                )
                restOverride = false
            }
            const reads = group.stats.reads - stats.reads
            if (reads > 0) {
                pendingReads += reads
                pendingReadsAt ??= frame
                builder.steadyFrameReads += reads
                builder.steadyFrameReadsAt ??= frame
            }
            await microtasks()
            if (options.control === 'leftover-pose' && statuses.has('tap-4')) {
                layer.pill.style.setProperty(
                    'translate',
                    '0.5px 0px',
                    'important'
                )
            }
            record('frame')
            lastTranslate = layer.pill.style.getPropertyValue('translate')
        }

        try {
            record('frame')
            commit('tap-1', 1)
            for (let i = 0; i < 5; i++) await step()
            commit('tap-2', 2)
            for (let i = 0; i < 5; i++) await step()
            commit('tap-3', 3)
            for (let i = 0; i < 5; i++) await step()
            commit('tap-4', 0)
            let guard = 0
            while (guard++ < 200) {
                if (statuses.has('tap-4') && group.stats.tracks === 0) break
                await step()
            }
            await microtasks()
            await step()
            builder.settleFrames.push(frame)
            const final = finalOf(group, mc, ['pill'], diagnostics)
            record('frame')
            return builder.build(final)
        } finally {
            offDiagnostic()
            remove()
            group.dispose()
            layer.stage.remove()
        }
    }

    static async runReal(): Promise<RealTrace> {
        const granularityInfo = measureGranularityInfo()
        const g = granularityInfo.value
        const sampler = installRafSampler()
        const layer = mount()
        await document.fonts.ready
        ;(window as unknown as { __scene?: unknown }).__scene = {
            scene: 's-seg',
            participants: ['pill'],
            boxes: { pill: probePillBoxes() },
            motion: { type: 'spring', duration: 0.35, bounce: 0.12 },
        }
        const group = createLayoutGroup({
            motion: { type: 'spring', duration: 0.35, bounce: 0.12 },
            reducedMotion: 'ignore',
        })
        const remove = group.add(layer.pill, {
            layout: true,
            layoutId: 'seg-pill',
            radius: true,
        })
        const diagnostics: string[] = []
        const offDiagnostic = diagnosticsListener((code) =>
            diagnostics.push(code)
        )
        const commitTimes: { label: string; at: number }[] = []
        const tap = (label: string, segment: number): Promise<LayoutReport> => {
            sampler.markCommit()
            const promise = group.update(() => {
                layer.pill.style.left = `${3 + segment * STEP}px`
                setSelected(layer, segment)
            })
            commitTimes.push({ label, at: performance.now() })
            return promise
        }
        try {
            await nextFrame()
            await nextFrame()
            void tap('tap-1', 1)
            await waitMs(80)
            void tap('tap-2', 2)
            await waitMs(80)
            void tap('tap-3', 3)
            await waitMs(80)
            const last = tap('tap-4', 0)
            await last
            for (let i = 0; i < 4; i++) await nextFrame()
            const final = {
                tracks: group.stats.tracks,
                holds: group.stats.holds,
                connected: layer.pill.isConnected ? 1 : 0,
            }
            offDiagnostic()
            remove()
            group.dispose()
            sampler.stop()
            const frames = [...sampler.frames]
            layer.stage.remove()
            return {
                scene: 's-seg',
                mode: 'real',
                g,
                gSource: granularityInfo.source,
                frameCosts: frames,
                commits: commitTimes,
                diagnostics,
                final,
            }
        } catch (error) {
            offDiagnostic()
            sampler.stop()
            group.dispose()
            layer.stage.remove()
            throw error
        }
    }

    static async demo(): Promise<void> {
        for (;;) {
            const layer = mount()
            const group = createLayoutGroup({
                motion: { type: 'spring', duration: 0.35, bounce: 0.12 },
                reducedMotion: 'ignore',
            })
            group.add(layer.pill, {
                layout: true,
                layoutId: 'seg-pill',
                radius: true,
            })
            let segment = 0
            for (let i = 0; i < 8; i++) {
                segment = (segment + 1) % 4
                group.update(() => {
                    layer.pill.style.left = `${3 + segment * STEP}px`
                    setSelected(layer, segment)
                })
                await waitMs(700)
            }
            group.dispose()
            layer.stage.remove()
            await waitMs(400)
        }
    }
}
