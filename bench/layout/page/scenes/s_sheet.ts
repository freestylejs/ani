/**
 * S-SHEET — bottom sheet detents (vanilla, P4; scene spec 2.10).
 *
 * A sheet is dragged from medium 1:1 through the drive seam, released with
 * −1200 px/s to the large detent, then dragged down and flicked +1600 px/s to
 * dismissal. The sheet is one position participant; the scrim is an author
 * layer. The final dismissal unmounts the sheet after a restoration snapshot.
 */

import {
    createManualClock,
    type ManualClock,
} from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    type LayoutDriveHandle,
    type LayoutGroup,
    layoutRuntime,
} from '@freestylejs/ani-layout'
import type { Box } from '../../oracle.ts'
import { percentile } from '../../stats.ts'
import type {
    HoldEvidence,
    HoldMoveEvidence,
    RealTrace,
    SceneTrace,
} from '../../types.ts'
import {
    installRafSampler,
    isWebKitEngine,
    measureGranularityInfo,
    microtasks,
    nextFrame,
    styleSnapshot,
    TraceBuilder,
    viewBox,
    waitMs,
} from '../harness.ts'
import {
    FONT,
    homeIndicator,
    recordCommit,
    reportTracker,
    STATUS_CSS,
    statusBar,
    styleOnce,
} from './kit.ts'

/**
 * Scene contribution (H16/F14): the manual clock uses one 16 ms step, so the
 * spec's second-hold 20 ms row is amended to 16 ms. The detent policy
 * (`projected = top + v·0.20`, nearest of {124, 422, 844}) and the ≥1 s second
 * take are implemented exactly as the scene spec states.
 */
const STEP = 16
const SHEET_SPRING = {
    type: 'spring',
    duration: 0.45,
    bounce: 0.08,
} as const
const DETENTS = [
    { name: 'large', top: 124 },
    { name: 'medium', top: 422 },
    { name: 'dismissed', top: 844 },
] as const

/**
 * Scene policy (A-10, not an engine rule): `projected = top + v·0.20 s`; the
 * nearest detent wins. Ties would go to the smaller |distance|; this script
 * has no tie.
 */
function chooseDetent(
    top: number,
    velocityY: number
): (typeof DETENTS)[number] & { projected: number } {
    const projected = top + velocityY * 0.2
    let best: (typeof DETENTS)[number] = DETENTS[0]!
    let distance = Math.abs(best.top - projected)
    for (const candidate of DETENTS.slice(1)) {
        const next = Math.abs(candidate.top - projected)
        if (next < distance) {
            best = candidate
            distance = next
        }
    }
    return { ...best, projected }
}

function installStyles(): void {
    styleOnce(
        's-sheet',
        `
        ${STATUS_CSS}
        .sheet-stage {
            position: fixed; inset: 0; width: 390px; height: 844px;
            overflow: hidden; background: #F2F2F7; color: #000;
            font-family: ${FONT}; -webkit-font-smoothing: antialiased;
            font-optical-sizing: auto;
        }
        .sheet-bg { position: absolute; inset: 0; background: #F2F2F7; }
        .sheet-map { position: absolute; left: 0; top: 0; width: 390px; height: 844px; background: linear-gradient(160deg,#E8F0E6,#DDE8E4 45%,#E9EEE9); }
        .sheet-map .road { position: absolute; background: rgba(255,255,255,0.72); border-radius: 4px; }
        .sheet-map .pin { position: absolute; width: 14px; height: 14px; border-radius: 7px; background: #FF3B30; box-shadow: 0 2px 8px rgba(0,0,0,0.20); }
        .sheet-scrim { position: absolute; inset: 0; background: #000000; opacity: 0.20; z-index: 5; }
        .sheet {
            position: absolute; left: 0; top: 422px; width: 390px; height: 720px;
            background: #FFFFFF; border-radius: 10px 10px 0 0; z-index: 10;
            box-shadow: 0 -8px 40px rgba(0,0,0,0.20); overflow: hidden;
            box-sizing: border-box;
        }
        .sheet-grabber { position: absolute; left: 177px; top: 10px; width: 36px; height: 5px; border-radius: 2.5px; background: #C7C7CC; }
        .sheet-title { position: absolute; left: 24px; top: 36px; font: 700 22px/28px ${FONT}; letter-spacing: 0.35px; }
        .sheet-row { position: absolute; left: 0; width: 390px; height: 44px; border-bottom: 0.5px solid rgba(60,60,67,0.29); box-sizing: border-box; }
        .sheet-row span { position: absolute; left: 24px; top: 11px; font: 400 17px/22px ${FONT}; letter-spacing: -0.41px; }
        .sheet-row i { position: absolute; right: 24px; top: 14px; width: 14px; height: 14px; border: 1.5px solid rgba(60,60,67,0.30); border-radius: 3px; box-sizing: border-box; }
        .sheet-row.on i { background: #007AFF; border-color: #007AFF; }
        .sheet-done { position: absolute; left: 16px; top: 656px; width: 358px; height: 50px; border-radius: 12px; background: #007AFF; color: #FFFFFF; font: 600 17px/50px ${FONT}; text-align: center; letter-spacing: -0.41px; }
    `
    )
}

interface SheetLayer {
    readonly stage: HTMLElement
    readonly scrim: HTMLElement
    readonly sheet: HTMLElement
}

function buildLayer(): SheetLayer {
    installStyles()
    const stage = document.createElement('div')
    stage.className = 'sheet-stage'
    const bg = document.createElement('div')
    bg.className = 'sheet-bg'
    const map = document.createElement('div')
    map.className = 'sheet-map'
    for (const [left, top, width, height] of [
        [20, 140, 350, 8],
        [70, 60, 8, 760],
        [220, 40, 6, 800],
        [0, 360, 390, 6],
        [0, 610, 390, 5],
    ] as const) {
        const road = document.createElement('div')
        road.className = 'road'
        road.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;`
        map.append(road)
    }
    for (const [left, top] of [
        [104, 236],
        [286, 418],
        [146, 520],
    ] as const) {
        const pin = document.createElement('div')
        pin.className = 'pin'
        pin.style.cssText = `left:${left}px;top:${top}px;`
        map.append(pin)
    }
    const scrim = document.createElement('div')
    scrim.className = 'sheet-scrim'
    const sheet = document.createElement('div')
    sheet.className = 'sheet'
    sheet.dataset.p = 'sheet'
    const grabber = document.createElement('div')
    grabber.className = 'sheet-grabber'
    const title = document.createElement('div')
    title.className = 'sheet-title'
    title.textContent = 'Filters'
    sheet.append(grabber, title)
    const labels = [
        'Free cancellation',
        'Breakfast included',
        'Pool',
        'Pet friendly',
        'Parking',
    ] as const
    labels.forEach((label, index) => {
        const row = document.createElement('div')
        row.className = `sheet-row${index < 2 ? ' on' : ''}`
        row.style.top = `${84 + 44 * index}px`
        const span = document.createElement('span')
        span.textContent = label
        const box = document.createElement('i')
        row.append(span, box)
        sheet.append(row)
    })
    const done = document.createElement('div')
    done.className = 'sheet-done'
    done.textContent = 'Show 128 stays'
    sheet.append(done)
    stage.append(bg, map, scrim, sheet, statusBar(), homeIndicator())
    return { stage, scrim, sheet }
}

function mount(): SheetLayer {
    const layer = buildLayer()
    document.body.append(layer.stage)
    return layer
}

function probeSheetTops(): Record<string, Box> {
    installStyles()
    const stage = document.createElement('div')
    stage.style.cssText =
        'position: fixed; inset: 0; width: 390px; height: 844px; visibility: hidden; pointer-events: none;'
    document.body.append(stage)
    const boxes: Record<string, Box> = {}
    for (const [key, top] of [
        ['large', 124],
        ['medium', 422],
        ['dismissed', 844],
    ] as const) {
        const sheet = document.createElement('div')
        sheet.className = 'sheet'
        sheet.style.top = `${top}px`
        stage.append(sheet)
        boxes[`sheet@${key}`] = viewBox(sheet)
    }
    stage.remove()
    return boxes
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

function waitUntilSettled(group: LayoutGroup): Promise<void> {
    return (async () => {
        for (let i = 0; i < 600; i++) {
            if (group.stats.tracks === 0 && group.stats.holds === 0) return
            await nextFrame()
        }
    })()
}

export interface SheetSceneOptions {
    readonly control?: string | undefined
}

export class SheetScene {
    static async runManual(
        options: SheetSceneOptions = {}
    ): Promise<SceneTrace> {
        const layer = mount()
        await document.fonts.ready
        const mc = createManualClock()
        const elements = new Map<string, HTMLElement | null>([
            ['sheet', layer.sheet],
        ])
        const builder = new TraceBuilder({
            scene: 's-sheet',
            stepMs: STEP,
            keys: ['sheet'],
            elements,
            radii: new Set(['sheet']),
            clock: mc,
        })
        builder.mount('sheet', layer.sheet)
        builder.initial('sheet', layer.sheet)
        const probe = probeSheetTops()
        for (const [key, box] of Object.entries(probe)) builder.aBox(key, box)
        ;(window as unknown as { __scene?: unknown }).__scene = {
            scene: 's-sheet',
            participants: ['sheet'],
            boxes: probe,
            detents: { large: 124, medium: 422, dismissed: 844 },
            motion: SHEET_SPRING,
        }
        const diagnostics: string[] = []
        const group = createLayoutGroup({
            clock: mc.clock,
            motion: SHEET_SPRING,
            reducedMotion: 'ignore',
            threshold: 1,
            maxNodes: 300,
            maxParticipants: 2000,
        })
        const offDiagnostic = layoutRuntime.onDiagnostic((event) => {
            diagnostics.push(event.code)
            builder.diagnostic(event.code, event.action, frame, null)
        })
        const remove = group.add(layer.sheet, {
            layout: 'position',
            radius: true,
        })
        const tracker = reportTracker(builder)
        const typedOM = isWebKitEngine()
        let frame = 0
        let handle: LayoutDriveHandle | null = null

        const record = (kind: 'frame' | 'flush', label?: string) => {
            builder.record(kind, frame, label)
        }
        const step = async () => {
            const before = group.stats
            if (options.control === 'sheet-extra-read' && frame === 4) {
                // a deliberate extra capture inside the measured held frame
                group.capture()
            }
            mc.frame(STEP)
            frame += 1
            const after = group.stats
            builder.frameRead({
                frame,
                rects: after.rects - before.rects,
                offsets: after.offsets - before.offsets,
                styles: after.styles - before.styles,
                // Only the held state performs the §5.10 held read; a
                // released landing is a live hold but a normal track.
                holds: handle?.state === 'held' ? 1 : 0,
            })
            await microtasks()
            record('frame')
        }
        const detent = (
            label: string,
            top: number,
            controls: { readonly wrongDetent?: boolean }
        ) => {
            const active = 1
            const result = recordCommit({
                builder,
                keys: ['sheet'],
                elements,
                frame,
                label,
                // no layoutId: §4.1 item 3 adds no radius read
                radiusKeys: new Set(),
                typedOM,
                run: () =>
                    group.update(() => {
                        const target = controls.wrongDetent ? 422 : top
                        layer.sheet.style.top = `${target}px`
                    }),
                stats: () => group.stats,
                stylesExpected: active * (typedOM ? 2 : 1),
                activeFlush: active,
            })
            void tracker.track(label, result.promise, () => frame)
            record('flush', label)
        }
        const release = (label: string, velocity: { x: number; y: number }) => {
            if (
                options.control === 'sheet-cancel-instead' &&
                label === 'release-2'
            ) {
                handle?.cancel()
            } else {
                handle?.release(velocity)
            }
            if (
                options.control === 'sheet-release-jump' &&
                label === 'release-1'
            ) {
                // the control's first release frame starts at A, not at the
                // presented held box (G2 must fail)
                layer.sheet.style.setProperty(
                    'translate',
                    '0px 0px',
                    'important'
                )
            }
            record('flush', label)
        }

        const firstMoves: HoldMoveEvidence[] = []
        const secondMoves: HoldMoveEvidence[] = []
        let release1Box: Box = { x: 0, y: 0, w: 0, h: 0 }
        let release2Box: Box = { x: 0, y: 0, w: 0, h: 0 }
        let take1State = 'released'
        let take2State = 'released'
        let take1Velocity = { x: 0, y: 0 }
        let take2Velocity = { x: 0, y: 0 }
        let holdsAtTake1 = 0
        let holdsAtTake2 = 0
        const take1Box = viewBox(layer.sheet)
        let take2Box: Box = { x: 0, y: 0, w: 0, h: 0 }
        let firstSettle = 0
        let release1State = 'released'
        let release2State = 'released'
        let holdsAtRelease1 = 0
        let holdsAtRelease2 = 0

        try {
            record('frame')
            handle = group.take(layer.sheet)
            take1State = handle.state
            take1Velocity = handle.velocity
            holdsAtTake1 = group.stats.holds
            record('flush')
            for (let k = 1; k <= 12; k++) {
                handle.move({ x: 0, y: -15 * k })
                await step()
                const last = builder.frameReads[builder.frameReads.length - 1]!
                firstMoves.push({
                    frame,
                    box: viewBox(layer.sheet),
                    rects: last.rects,
                    offsets: last.offsets,
                    styles: last.styles,
                    holds: last.holds,
                })
            }
            const release1Frame = frame
            const wrongDetent = options.control === 'sheet-medium-detent'
            const release1Top = viewBox(layer.sheet).y
            const firstChoice = chooseDetent(release1Top, -1200)
            const release1At = mc.now
            detent('detent-1', firstChoice.top, { wrongDetent })
            release('release-1', { x: 0, y: -1200 })
            release1Box = viewBox(layer.sheet)
            release1State = handle.state
            holdsAtRelease1 = group.stats.holds
            let guard = 0
            while (guard++ < 400) {
                await step()
                if (group.stats.tracks === 0 && group.stats.holds === 0) break
            }
            firstSettle = frame
            builder.settleFrames.push(firstSettle)
            // A-10 scene script: the second take is at least 1 s after the
            // first release (not only after its settle).
            while (mc.now - release1At < 1000) await step()
            layer.scrim.style.opacity = '0.35'
            // Second hold: medium-to-dismissed flick.
            const take2Frame = frame
            handle = group.take(layer.sheet)
            take2Box = viewBox(layer.sheet)
            take2State = handle.state
            take2Velocity = handle.velocity
            holdsAtTake2 = group.stats.holds
            builder.record('flush', frame)
            for (let k = 1; k <= 10; k++) {
                handle.move({ x: 0, y: 30 * k })
                await step()
                const last = builder.frameReads[builder.frameReads.length - 1]!
                secondMoves.push({
                    frame,
                    box: viewBox(layer.sheet),
                    rects: last.rects,
                    offsets: last.offsets,
                    styles: last.styles,
                    holds: last.holds,
                })
            }
            const release2Frame = frame
            const release2Top = viewBox(layer.sheet).y
            const secondChoice = chooseDetent(release2Top, 1600)
            detent('detent-2', secondChoice.top, {})
            release('release-2', { x: 0, y: 1600 })
            ;(
                window as unknown as {
                    __scene?: { policy?: unknown }
                }
            ).__scene!.policy = {
                projected: firstChoice.projected,
                chosen: firstChoice.name,
                top: firstChoice.top,
                secondProjected: secondChoice.projected,
                secondChosen: secondChoice.name,
                secondTop: secondChoice.top,
            }
            layer.scrim.style.opacity = '0'
            release2Box = viewBox(layer.sheet)
            release2State = handle.state
            holdsAtRelease2 = group.stats.holds
            guard = 0
            while (guard++ < 400) {
                await step()
                if (
                    tracker.statuses.size === 2 &&
                    group.stats.tracks === 0 &&
                    group.stats.holds === 0
                )
                    break
            }
            await microtasks()
            const secondSettle = frame
            // Final dismissal: unregister, snapshot the engine's restoration,
            // then remove the element. G6 must see byte-identical owned styles.
            const beforeRemoval =
                [...builder.observations]
                    .reverse()
                    .find((observation) =>
                        observation.connected.includes('sheet')
                    )?.style.sheet ?? styleSnapshot(layer.sheet)
            remove()
            const afterRemoval = styleSnapshot(layer.sheet)
            builder.restoration(
                'sheet',
                secondSettle,
                beforeRemoval,
                afterRemoval
            )
            layer.sheet.remove()
            elements.set('sheet', null)
            const hold1: HoldEvidence = {
                key: 'sheet',
                takeFrame: 0,
                takeState: take1State,
                takeVelocity: take1Velocity,
                takeBox: take1Box,
                holdsAtTake: holdsAtTake1,
                moves: firstMoves,
                releaseFrame: release1Frame,
                releaseState: release1State,
                releaseVelocity: { x: 0, y: -1200 },
                releaseBox: release1Box,
                holdsAtRelease: holdsAtRelease1,
                finalHolds: group.stats.holds,
                frames: firstMoves.length,
            }
            const hold2: HoldEvidence = {
                key: 'sheet',
                takeFrame: take2Frame,
                takeState: take2State,
                takeVelocity: take2Velocity,
                takeBox: take2Box,
                holdsAtTake: holdsAtTake2,
                moves: secondMoves,
                releaseFrame: release2Frame,
                releaseState: release2State,
                releaseVelocity: { x: 0, y: 1600 },
                releaseBox: release2Box,
                holdsAtRelease: holdsAtRelease2,
                finalHolds: group.stats.holds,
                frames: secondMoves.length,
            }
            builder.hold(hold1)
            builder.hold(hold2)
            const final = finalOf(group, mc, [], diagnostics)
            record('frame')
            return builder.build(final)
        } finally {
            offDiagnostic()
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
            scene: 's-sheet',
            participants: ['sheet'],
            boxes: probeSheetTops(),
            motion: SHEET_SPRING,
        }
        const group = createLayoutGroup({
            motion: SHEET_SPRING,
            reducedMotion: 'ignore',
        })
        const remove = group.add(layer.sheet, {
            layout: 'position',
            radius: true,
        })
        const diagnostics: string[] = []
        const offDiagnostic = layoutRuntime.onDiagnostic((event) =>
            diagnostics.push(event.code)
        )
        const commits: { label: string; at: number }[] = []
        try {
            await nextFrame()
            await nextFrame()
            const handle = group.take(layer.sheet)
            for (let k = 1; k <= 12; k++) {
                handle.move({ x: 0, y: -15 * k })
                await nextFrame()
            }
            const release1Top = viewBox(layer.sheet).y
            const firstChoice = chooseDetent(release1Top, -1200)
            const release1At = performance.now()
            sampler.markCommit()
            void group.update(() => {
                layer.sheet.style.top = `${firstChoice.top}px`
                handle.release({ x: 0, y: -1200 })
            })
            commits.push({ label: 'release-1', at: performance.now() })
            await waitUntilSettled(group)
            const remaining = 1000 - (performance.now() - release1At)
            if (remaining > 0) await waitMs(remaining)
            layer.scrim.style.opacity = '0.35'
            const second = group.take(layer.sheet)
            for (let k = 1; k <= 10; k++) {
                second.move({ x: 0, y: 30 * k })
                await nextFrame()
            }
            const release2Top = viewBox(layer.sheet).y
            const secondChoice = chooseDetent(release2Top, 1600)
            sampler.markCommit()
            void group.update(() => {
                layer.sheet.style.top = `${secondChoice.top}px`
                second.release({ x: 0, y: 1600 })
            })
            commits.push({ label: 'release-2', at: performance.now() })
            await waitUntilSettled(group)
            // D11 no-hold baseline: every normal frame of this scene before
            // the held window, at the same cadence and DOM.
            const heldStart = sampler.frames.length
            const baselineSamples = sampler.frames
                .slice(0, heldStart)
                .map((sample) => sample.ms)
            const baselineP95 = percentile(baselineSamples, 0.95)
            // G12 1-held shape on the dismissed sheet: 600 real-clock frames.
            const reads = {
                frames: 0,
                rects: 0,
                offsets: 0,
                styles: 0,
                holds: 0,
                mismatches: 0,
            }
            const held = group.take(layer.sheet)
            for (let i = 0; i < 600; i++) {
                held.move({ x: 0, y: (i % 20) - 10 })
                const before = group.stats
                await nextFrame()
                const after = group.stats
                reads.frames += 1
                reads.rects += after.rects - before.rects
                reads.offsets += after.offsets - before.offsets
                reads.styles += after.styles - before.styles
                reads.holds += before.holds
                if (
                    after.rects - before.rects !== before.holds ||
                    after.offsets - before.offsets !== 0 ||
                    after.styles - before.styles !== 0
                )
                    reads.mismatches += 1
            }
            held.release({ x: 0, y: 0 })
            await waitUntilSettled(group)
            const releaseClean =
                group.stats.tracks === 0 && group.stats.holds === 0
            offDiagnostic()
            remove()
            layer.sheet.remove()
            group.dispose()
            sampler.stop()
            const samples = sampler.frames
                .slice(heldStart, heldStart + 600)
                .map((sample) => sample.ms)
            layer.stage.remove()
            return {
                scene: 's-sheet',
                mode: 'real',
                g,
                gSource: granularityInfo.source,
                frameCosts: sampler.frames.slice(0, heldStart),
                commits,
                diagnostics,
                held: {
                    samples,
                    baselineSamples,
                    baselineP95,
                    g,
                    reads,
                    releaseClean,
                },
                allowEmptyFinal: true,
                final: { tracks: 0, holds: 0, connected: 0 },
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
                motion: SHEET_SPRING,
                reducedMotion: 'ignore',
            })
            group.add(layer.sheet, { layout: 'position', radius: true })
            await nextFrame()
            await nextFrame()
            const handle = group.take(layer.sheet)
            for (let k = 1; k <= 8; k++) {
                layer.sheet.style.top = `${422 - 20 * k}px`
                handle.move({ x: 0, y: -20 * k })
                await waitMs(60)
            }
            handle.release({ x: 0, y: -1200 })
            await waitMs(1200)
            group.dispose()
            layer.stage.remove()
            await waitMs(400)
        }
    }
}
