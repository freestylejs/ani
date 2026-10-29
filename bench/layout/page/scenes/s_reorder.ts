/**
 * S-REORDER — Reminders drag reorder (vanilla, P4; scene spec 2.9).
 *
 * A row is taken through the drive seam, the list reorders under the finger,
 * and the row is released with the flick's 900 px/s. The held row and its
 * nested title are the only direct-manipulation participants; the siblings
 * spring to their new slots. The drive-hold kill switch is exercised after the
 * scripted run (L-DRIVE-4).
 */

import { createClock } from '@freestylejs/ani-core'
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
    KillSwitchEvidence,
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
import {
    prefersReduced,
    type ReducedSceneOptions,
    reducedPolicyFor,
} from './reduced.ts'

const STEP = 20
const KEYS = Array.from({ length: 7 }, (_, i) => [
    `row-${i}`,
    `title-${i}`,
]).flat()
const ROW_KEYS = KEYS.filter((key) => key.startsWith('row-'))
const RADIUS_KEYS = new Set(ROW_KEYS)
const REORDER_SPRING = {
    type: 'spring',
    duration: 0.45,
    bounce: 0.1,
} as const
const SLOTS = 7

function installStyles(): void {
    styleOnce(
        's-reorder',
        `
        ${STATUS_CSS}
        .reorder-stage {
            position: fixed; inset: 0; width: 390px; height: 844px;
            overflow: hidden; background: #F2F2F7; color: #000;
            font-family: ${FONT}; -webkit-font-smoothing: antialiased;
            font-optical-sizing: auto;
        }
        .reorder-nav { position: absolute; left: 16px; top: 100px; font: 700 34px/41px ${FONT}; letter-spacing: 0.4px; }
        .reorder-tools { position: absolute; left: 0; top: 47px; width: 390px; height: 44px; }
        .reorder-tools .add { position: absolute; right: 18px; top: 10px; width: 24px; height: 24px; border-radius: 12px; background: rgba(118,118,128,0.12); color: #007AFF; font: 400 20px/24px ${FONT}; text-align: center; }
        .reorder-row {
            position: absolute; left: 16px; width: 358px; height: 52px;
            border-radius: 10px; background: #FFFFFF; z-index: 1;
            box-shadow: 0 1px 2px rgba(0,0,0,0.04);
            box-sizing: border-box;
        }
        .reorder-row.dragging {
            z-index: 10; box-shadow: 0 12px 28px rgba(0,0,0,0.18);
        }
        .reorder-check {
            position: absolute; left: 16px; top: 15px; width: 22px; height: 22px;
            border-radius: 50%; border: 1.5px solid rgba(60,60,67,0.30);
            box-sizing: border-box; color: #007AFF;
        }
        .reorder-title {
            position: absolute; left: 66px; top: 10px; width: 270px; height: 22px;
            font: 400 17px/22px ${FONT}; letter-spacing: -0.41px;
            color: #000000; white-space: nowrap; overflow: hidden;
        }
        .reorder-due {
            position: absolute; right: 16px; top: 17px; font: 400 13px/18px ${FONT};
            letter-spacing: -0.08px; color: rgba(60,60,67,0.60);
        }
        .reorder-foot { position: absolute; left: 16px; top: 640px; font: 400 13px/18px ${FONT}; color: rgba(60,60,67,0.60); }
    `
    )
}

interface ReorderLayer {
    readonly stage: HTMLElement
    readonly list: HTMLElement
    readonly rows: HTMLElement[]
    readonly titles: HTMLElement[]
}

function buildLayer(): ReorderLayer {
    installStyles()
    const stage = document.createElement('div')
    stage.className = 'reorder-stage'
    const nav = document.createElement('div')
    nav.className = 'reorder-nav'
    nav.textContent = 'Reminders'
    const tools = document.createElement('div')
    tools.className = 'reorder-tools'
    const add = document.createElement('div')
    add.className = 'add'
    add.textContent = '+'
    tools.append(add)
    const list = document.createElement('div')
    list.dataset.list = ''
    list.style.cssText =
        'position:absolute;left:0;top:0;width:390px;height:844px;'
    const rows: HTMLElement[] = []
    const titles: HTMLElement[] = []
    const names = [
        'Buy oat milk',
        'Call the dentist',
        'Ship the layout bench',
        'Read the H16 brief',
        'Review drive seam',
        'Water the plants',
        'Book train tickets',
    ] as const
    const due = ['Today', 'Tomorrow', 'Fri', '', 'Mon', '', 'Sun'] as const
    for (let i = 0; i < SLOTS; i++) {
        const row = document.createElement('div')
        row.className = 'reorder-row'
        row.dataset.p = `row-${i}`
        row.style.top = `${190 + 60 * i}px`
        const check = document.createElement('div')
        check.className = 'reorder-check'
        const title = document.createElement('div')
        title.className = 'reorder-title'
        title.dataset.p = `title-${i}`
        title.textContent = names[i]!
        const when = document.createElement('div')
        when.className = 'reorder-due'
        when.textContent = due[i]!
        row.append(check, title, when)
        list.append(row)
        rows.push(row)
        titles.push(title)
    }
    const foot = document.createElement('div')
    foot.className = 'reorder-foot'
    foot.textContent = '7 reminders'
    stage.append(statusBar(), nav, tools, list, foot, homeIndicator())
    return { stage, list, rows, titles }
}

function mount(): ReorderLayer {
    const layer = buildLayer()
    document.body.append(layer.stage)
    return layer
}

/**
 * Engine-free slot probe: one row at every slot (and its nested title), so
 * each commit's A is measured without a layout group.
 */
function probeSlots(): Record<string, Box> {
    installStyles()
    const stage = document.createElement('div')
    stage.style.cssText =
        'position: fixed; inset: 0; width: 390px; height: 844px; visibility: hidden; pointer-events: none;'
    const list = document.createElement('div')
    list.style.cssText =
        'position:absolute;left:0;top:0;width:390px;height:844px;'
    stage.append(list)
    document.body.append(stage)
    const boxes: Record<string, Box> = {}
    for (let slot = 0; slot < SLOTS; slot++) {
        const row = document.createElement('div')
        row.className = 'reorder-row'
        row.style.top = `${190 + 60 * slot}px`
        const title = document.createElement('div')
        title.className = 'reorder-title'
        title.textContent = 'Probe'
        row.append(title)
        list.append(row)
        boxes[`row-${slot}@slot-${slot}`] = viewBox(row)
        boxes[`title-${slot}@slot-${slot}`] = viewBox(title)
        const rowBox = boxes[`row-${slot}@slot-${slot}`]!
        // the same row geometry is reused for every row index
        for (let i = 0; i < SLOTS; i++) {
            boxes[`row-${i}@slot-${slot}`] = { ...rowBox }
        }
        const titleBox = boxes[`title-${slot}@slot-${slot}`]!
        for (let i = 0; i < SLOTS; i++) {
            boxes[`title-${i}@slot-${slot}`] = { ...titleBox }
        }
    }
    stage.remove()
    return boxes
}

function sameOwned(
    a: ReturnType<typeof styleSnapshot>,
    b: ReturnType<typeof styleSnapshot>
): boolean {
    return (
        a.translate === b.translate &&
        a.translatePriority === b.translatePriority &&
        a.scale === b.scale &&
        a.scalePriority === b.scalePriority &&
        a.radius === b.radius &&
        a.radiusPriority === b.radiusPriority &&
        a.overflowAnchor === b.overflowAnchor &&
        a.overflowAnchorPriority === b.overflowAnchorPriority &&
        a.inert === b.inert &&
        a.inline === b.inline
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

export type ReorderSceneOptions = ReducedSceneOptions

export class ReorderScene {
    static async runManual(
        options: ReorderSceneOptions = {}
    ): Promise<SceneTrace> {
        const layer = mount()
        await document.fonts.ready
        const mc = createManualClock({
            reducedMotion: prefersReduced(options),
        })
        const elements = new Map<string, HTMLElement | null>()
        for (let i = 0; i < SLOTS; i++) {
            elements.set(`row-${i}`, layer.rows[i]!)
            elements.set(`title-${i}`, layer.titles[i]!)
        }
        const builder = new TraceBuilder({
            scene: 's-reorder',
            stepMs: STEP,
            keys: KEYS,
            elements,
            radii: RADIUS_KEYS,
            clock: mc,
        })
        for (let i = 0; i < SLOTS; i++) {
            builder.mount(`row-${i}`, layer.rows[i]!)
            builder.mount(`title-${i}`, layer.titles[i]!)
            builder.initial(`row-${i}`, layer.rows[i]!)
            builder.initial(`title-${i}`, layer.titles[i]!)
        }
        const probe = probeSlots()
        for (const [key, box] of Object.entries(probe)) builder.aBox(key, box)
        ;(window as unknown as { __scene?: unknown }).__scene = {
            scene: 's-reorder',
            participants: KEYS,
            boxes: probe,
            slots: 'row i at 190 + 60·slot',
            motion: REORDER_SPRING,
        }
        const diagnostics: string[] = []
        const killDiagnostics: string[] = []
        const killSnaps: string[] = []
        let killPhase = false
        const group = createLayoutGroup({
            clock: mc.clock,
            motion: REORDER_SPRING,
            reducedMotion: reducedPolicyFor(options),
            threshold: 1,
            maxNodes: 300,
            maxParticipants: 2000,
            onSnap: (element, reason) => {
                if (killPhase) {
                    killSnaps.push(reason)
                    return
                }
                builder.snap(element.dataset.p ?? 'unknown', reason, frame)
            },
        })
        const offDiagnostic = layoutRuntime.onDiagnostic((event) => {
            if (killPhase) {
                killDiagnostics.push(event.code)
                return
            }
            diagnostics.push(event.code)
            builder.diagnostic(event.code, event.action, frame, null)
        })
        const removers: (() => void)[] = []
        for (let i = 0; i < SLOTS; i++) {
            removers.push(
                group.add(layer.rows[i]!, { layout: 'position', radius: true })
            )
            removers.push(group.add(layer.titles[i]!, { layout: 'position' }))
        }
        const tracker = reportTracker(builder)
        let frame = 0
        const typedOM = isWebKitEngine()
        const statuses = tracker.statuses

        const record = (kind: 'frame' | 'flush', label?: string) => {
            builder.record(kind, frame, label)
        }
        const step = async () => {
            const before = group.stats
            // F9: the control's extra capture must be inside the measured
            // frame, after the before snapshot, or its reads are invisible.
            if (controls.extraRead && frame === 3) group.capture()
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
        // The exact §4.3 computed set: the held row, its nested title, and the
        // displaced row/title pair of every reorder so far (the previous
        // pairs are still moving). Radius capture is zero: no row has a
        // layoutId (§4.1 item 3).
        let movedRows = 0
        const runCommit = (
            label: string,
            newMovers: number,
            mutate: () => void
        ) => {
            movedRows += newMovers > 0 ? 1 : 0
            const active = 2 * movedRows + 2
            const result = recordCommit({
                builder,
                keys: KEYS,
                elements,
                frame,
                label,
                // no row has a layoutId: §4.1 item 3 adds no radius read
                radiusKeys: new Set(),
                typedOM,
                run: () => group.update(mutate),
                stats: () => group.stats,
                stylesExpected: active * (typedOM ? 2 : 1),
                activeFlush: active,
            })
            void tracker.track(label, result.promise, () => frame)
            record('flush', label)
        }

        // The scene's own slot order. Each reorder moves the dragged row one
        // slot down and the displaced row one slot up (spec 2.9). The order
        // and the layout are mutated inside the commit.
        const order = [0, 1, 2, 3, 4, 5, 6]
        const nextOrder = (draggedSlot: number): number[] => {
            const rest = order.filter((i) => i !== 1)
            return [
                ...rest.slice(0, draggedSlot),
                1,
                ...rest.slice(draggedSlot),
            ]
        }

        let handle: LayoutDriveHandle | null = null
        const moves: HoldMoveEvidence[] = []
        let releaseBox: Box = { x: 0, y: 0, w: 0, h: 0 }
        let controls: {
            readonly skipKillSwitch?: boolean
            readonly extraRead?: boolean
            readonly wrongOffset?: boolean
            readonly noTake?: boolean
        } = {}
        if (options.control === 'reorder-kill-switch-skip')
            controls = { skipKillSwitch: true }
        if (options.control === 'reorder-extra-read')
            controls = { extraRead: true }
        if (options.control === 'reorder-no-rebase')
            controls = { wrongOffset: true }
        if (options.control === 'reorder-no-take') controls = { noTake: true }
        const cancelInstead = options.control === 'reorder-cancel-instead'

        try {
            record('frame')
            const takeBox = viewBox(layer.rows[1]!)
            handle = controls.noTake ? null : group.take(layer.rows[1]!)
            const takeState = handle?.state ?? 'released'
            if (handle) handle.move({ x: 0, y: 0 })
            const holdsAtTake = group.stats.holds
            layer.rows[1]!.classList.add('dragging')
            record('flush')

            const reorderAt = new Map([
                [2, 2],
                [5, 3],
                [9, 4],
            ])
            for (let k = 1; k <= 10; k++) {
                // The negative control supplies a stale offset after each
                // reorder: the held point does not stay under the finger.
                const stale =
                    controls.wrongOffset && (k === 3 || k === 6 || k === 10)
                        ? 60
                        : 0
                handle?.move({ x: 0, y: 18 * k + stale })
                await step()
                const last = builder.frameReads[builder.frameReads.length - 1]!
                moves.push({
                    frame,
                    box: viewBox(layer.rows[1]!),
                    rects: last.rects,
                    offsets: last.offsets,
                    styles: last.styles,
                    holds: last.holds,
                })
                const slot = reorderAt.get(k)
                if (slot !== undefined) {
                    const next = nextOrder(slot)
                    runCommit(`reorder-${k}`, 2, () => {
                        for (let i = 0; i < SLOTS; i++) {
                            const at = next.indexOf(i)
                            layer.rows[i]!.style.top = `${190 + 60 * at}px`
                        }
                        for (const i of next) layer.list.append(layer.rows[i]!)
                    })
                    for (let i = 0; i < order.length; i++) order[i] = next[i]!
                    await microtasks()
                }
            }
            // The release is not an engine commit (§5.10/§7.1): hand the
            // origin back with the exact 900 px/s vector, then record the
            // t = 0 held box. The first update is dt = 0.
            const releaseFrame = frame
            if (cancelInstead) handle?.cancel()
            else handle?.release({ x: 0, y: 900 })
            releaseBox = viewBox(layer.rows[1]!)
            const holdsAtRelease = group.stats.holds
            const releaseState = handle?.state ?? 'released'
            record('flush', 'release')
            // Wait for every reorder report and for h to settle.
            let guard = 0
            while (guard++ < 400) {
                await step()
                if (
                    statuses.size === 3 &&
                    group.stats.tracks === 0 &&
                    group.stats.holds === 0
                )
                    break
            }
            await microtasks()
            builder.settleFrames.push(frame)
            layer.rows[1]!.classList.remove('dragging')
            const finalHolds = group.stats.holds
            // L-DRIVE-4: the drive-hold kill switch, after the scored run.
            let killSwitch: KillSwitchEvidence | undefined
            if (!controls.skipKillSwitch) {
                killPhase = true
                killDiagnostics.length = 0
                killSnaps.length = 0
                const victim = layer.rows[5]!
                const authored = styleSnapshot(victim)
                const killHandle = group.take(victim)
                killHandle.move({ x: 0, y: 12 })
                mc.frame(STEP)
                await microtasks()
                layoutRuntime.setMode('snap')
                const state = killHandle.state
                const holds = group.stats.holds
                const clockSize = mc.clock.size
                const clockPending = mc.pending
                const after = styleSnapshot(victim)
                layoutRuntime.setMode('animate')
                killPhase = false
                killSwitch = {
                    state,
                    holds,
                    clockSize,
                    clockPending,
                    restored: sameOwned(authored, after),
                    diagnostics: [...killDiagnostics],
                    snaps: [...killSnaps],
                }
            }
            const evidence: HoldEvidence = {
                key: 'row-1',
                takeFrame: 0,
                takeState,
                takeVelocity: handle?.velocity ?? { x: 0, y: 0 },
                takeBox,
                holdsAtTake,
                moves,
                releaseFrame,
                releaseState,
                releaseVelocity: { x: 0, y: 900 },
                releaseBox,
                holdsAtRelease,
                finalHolds,
                frames: moves.length,
                killSwitch,
            }
            builder.hold(evidence)
            const connected = KEYS.filter(
                (key) => elements.get(key)?.isConnected
            )
            const final = finalOf(group, mc, connected, diagnostics)
            record('frame')
            return builder.build(final)
        } finally {
            offDiagnostic()
            for (const remover of removers.reverse()) remover()
            group.dispose()
            layer.stage.remove()
        }
    }

    static async runReal(
        options: ReorderSceneOptions = {}
    ): Promise<RealTrace> {
        const granularityInfo = measureGranularityInfo()
        const g = granularityInfo.value
        const sampler = installRafSampler()
        const layer = mount()
        await document.fonts.ready
        const clock = prefersReduced(options)
            ? createClock({ reducedMotion: true })
            : null
        ;(window as unknown as { __scene?: unknown }).__scene = {
            scene: 's-reorder',
            participants: KEYS,
            boxes: probeSlots(),
            motion: REORDER_SPRING,
            variant: options.variant?.id ?? null,
        }
        const group = createLayoutGroup({
            ...(clock ? { clock } : {}),
            motion: REORDER_SPRING,
            reducedMotion: reducedPolicyFor(options),
        })
        const removers: (() => void)[] = []
        for (let i = 0; i < SLOTS; i++) {
            removers.push(
                group.add(layer.rows[i]!, { layout: 'position', radius: true })
            )
            removers.push(group.add(layer.titles[i]!, { layout: 'position' }))
        }
        const diagnostics: string[] = []
        const offDiagnostic = layoutRuntime.onDiagnostic((event) =>
            diagnostics.push(event.code)
        )
        const commits: { label: string; at: number }[] = []
        try {
            await nextFrame()
            await nextFrame()
            const handle = group.take(layer.rows[1]!)
            for (let k = 1; k <= 10; k++) {
                handle.move({ x: 0, y: 18 * k })
                await nextFrame()
                if (k === 2 || k === 5 || k === 9) {
                    const slot = k === 2 ? 2 : k === 5 ? 3 : 4
                    const rest = [0, 1, 2, 3, 4, 5, 6].filter((i) => i !== 1)
                    const order = [
                        ...rest.slice(0, slot),
                        1,
                        ...rest.slice(slot),
                    ]
                    sampler.markCommit()
                    void group.update(() => {
                        for (let i = 0; i < SLOTS; i++) {
                            const at = order.indexOf(i)
                            layer.rows[i]!.style.top = `${190 + 60 * at}px`
                        }
                    })
                    commits.push({
                        label: `reorder-${k}`,
                        at: performance.now(),
                    })
                }
            }
            sampler.markCommit()
            void group.update(() => {
                handle.release({ x: 0, y: 900 })
            })
            commits.push({ label: 'release', at: performance.now() })
            await waitUntilSettled(group)
            // D11 no-hold baseline: every normal frame of this scene before
            // the held window, at the same cadence and DOM.
            const heldStart = sampler.frames.length
            const baselineSamples = sampler.frames
                .slice(0, heldStart)
                .map((sample) => sample.ms)
            const baselineP95 = percentile(baselineSamples, 0.95)
            // G12 1-held shape: 600 real-clock frames with the same row.
            const reads = {
                frames: 0,
                rects: 0,
                offsets: 0,
                styles: 0,
                holds: 0,
                mismatches: 0,
            }
            const held = group.take(layer.rows[1]!)
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
            const final = {
                tracks: group.stats.tracks,
                holds: group.stats.holds,
                connected: KEYS.filter((key) => elementsOf(layer, key)).length,
            }
            offDiagnostic()
            for (const remover of removers.reverse()) remover()
            group.dispose()
            clock?.dispose()
            sampler.stop()
            const samples = sampler.frames
                .slice(heldStart, heldStart + 600)
                .map((sample) => sample.ms)
            layer.stage.remove()
            return {
                scene: 's-reorder',
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
                final,
            }
        } catch (error) {
            offDiagnostic()
            sampler.stop()
            group.dispose()
            clock?.dispose()
            layer.stage.remove()
            throw error
        }
    }

    static async demo(): Promise<void> {
        for (;;) {
            const layer = mount()
            const group = createLayoutGroup({
                motion: REORDER_SPRING,
                reducedMotion: 'ignore',
            })
            const removers: (() => void)[] = []
            for (let i = 0; i < SLOTS; i++) {
                removers.push(
                    group.add(layer.rows[i]!, {
                        layout: 'position',
                        radius: true,
                    })
                )
                removers.push(
                    group.add(layer.titles[i]!, { layout: 'position' })
                )
            }
            await group.update(() => undefined)
            const handle = group.take(layer.rows[1]!)
            for (let k = 1; k <= 6; k++) {
                handle.move({ x: 0, y: 12 * k })
                await waitMs(60)
            }
            handle.release({ x: 0, y: 900 })
            await waitMs(1000)
            for (const remover of removers.reverse()) remover()
            group.dispose()
            layer.stage.remove()
            await waitMs(400)
        }
    }
}

function elementsOf(layer: ReorderLayer, key: string): boolean {
    const index = Number(key.split('-')[1])
    return key.startsWith('row-')
        ? layer.rows[index]!.isConnected
        : layer.titles[index]!.isConnected
}

/** Waits for no running track and no live hold on the real clock. */
async function waitUntilSettled(group: LayoutGroup): Promise<void> {
    for (let i = 0; i < 600; i++) {
        if (group.stats.tracks === 0 && group.stats.holds === 0) return
        await nextFrame()
    }
}
