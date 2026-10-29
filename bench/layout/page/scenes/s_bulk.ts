/**
 * S-BULK — 1,000-participant large-list shuffle (vanilla, P2 + P4 held shape;
 * scene spec 2.11). 850 tiles + 150 nested labels = 1,000 participants; the
 * first 150 tiles and their labels are the 300 movers. The frame-scored run
 * is one shuffle; the §11.5 cost shapes live in `cost.ts`.
 */

import {
    createManualClock,
    type ManualClock,
} from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    type LayoutGroup,
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
import { FONT, recordCommit, reportTracker, styleOnce } from './kit.ts'

const STEP = 16
const COLUMNS = 32
const TILE_W = 36
const TILE_H = 18
const PITCH_X = 39
const PITCH_Y = 21
const ORIGIN_X = 17.5
const ORIGIN_Y = 25.5
const TILES = 850
const LABELS = 150
const KEYS = [
    ...Array.from({ length: TILES }, (_, i) => `tile-${i}`),
    ...Array.from({ length: LABELS }, (_, i) => `label-${i}`),
]
const BULK_SPRING = {
    type: 'spring',
    duration: 0.4,
    bounce: 0.1,
} as const
const COLORS = [
    '#5B5BD6',
    '#E5484D',
    '#30A46C',
    '#F76B15',
    '#0090FF',
    '#D6409F',
    '#FFC53D',
    '#12A594',
    '#FF9500',
    '#AF52DE',
    '#FF2D55',
    '#5AC8FA',
] as const

function installStyles(): void {
    styleOnce(
        's-bulk',
        `
        .bulk-stage {
            position: fixed; inset: 0; width: 1280px; height: 720px;
            overflow: hidden; background: #0B0B0F; color: #fff;
            color-scheme: dark; font-family: ${FONT};
            -webkit-font-smoothing: antialiased;
        }
        .bulk-grid { position: absolute; inset: 0; width: 1280px; height: 720px; }
        .bulk-tile {
            position: absolute; width: ${TILE_W}px; height: ${TILE_H}px;
            border-radius: 4px; box-sizing: border-box;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .bulk-label {
            position: absolute; left: 1px; top: 1px; width: 34px; height: 16px;
            border-radius: 2px; background: rgba(255,255,255,0.12);
            color: #fff; font: 600 8px/16px ${FONT}; text-align: center;
            letter-spacing: 0;
        }
        .bulk-title { position: absolute; left: 16px; top: 4px; font: 600 10px/13px ${FONT}; letter-spacing: 0.07px; color: rgba(255,255,255,0.72); }
    `
    )
}

interface BulkLayer {
    readonly stage: HTMLElement
    readonly tiles: HTMLElement[]
    readonly labels: HTMLElement[]
}

function slot(index: number): { x: number; y: number } {
    return {
        x: ORIGIN_X + (index % COLUMNS) * PITCH_X,
        y: ORIGIN_Y + Math.floor(index / COLUMNS) * PITCH_Y,
    }
}

function buildLayer(): BulkLayer {
    installStyles()
    const stage = document.createElement('div')
    stage.className = 'bulk-stage'
    const grid = document.createElement('div')
    grid.className = 'bulk-grid'
    grid.dataset.grid = ''
    const title = document.createElement('div')
    title.className = 'bulk-title'
    title.textContent = '850 items · 150 moving'
    stage.append(title)
    const tiles: HTMLElement[] = []
    const labels: HTMLElement[] = []
    for (let index = 0; index < TILES; index++) {
        const at = slot(index)
        const tile = document.createElement('div')
        tile.className = 'bulk-tile'
        tile.dataset.p = `tile-${index}`
        tile.style.cssText = `left:${at.x}px;top:${at.y}px;background:${COLORS[index % COLORS.length]};`
        tile.textContent =
            index < LABELS ? '' : String(index % 100).padStart(2, '0')
        if (index >= LABELS) {
            tile.style.font = `600 8px/16px ${FONT}`
            tile.style.textAlign = 'center'
            tile.style.color = 'rgba(255,255,255,0.72)'
        }
        grid.append(tile)
        tiles.push(tile)
        if (index < LABELS) {
            const label = document.createElement('div')
            label.className = 'bulk-label'
            label.dataset.p = `label-${index}`
            label.textContent = String(index % 100).padStart(2, '0')
            tile.append(label)
            labels.push(label)
        }
    }
    stage.append(grid)
    return { stage, tiles, labels }
}

function mount(): BulkLayer {
    const layer = buildLayer()
    document.body.append(layer.stage)
    return layer
}

/** The shuffled A of the 150 moving tiles and their labels (engine-free). */
function probeShuffle(): Record<string, Box> {
    installStyles()
    const stage = document.createElement('div')
    stage.style.cssText =
        'position: fixed; inset: 0; width: 1280px; height: 720px; visibility: hidden; pointer-events: none;'
    const grid = document.createElement('div')
    grid.className = 'bulk-grid'
    stage.append(grid)
    document.body.append(stage)
    const boxes: Record<string, Box> = {}
    for (let i = 0; i < LABELS; i++) {
        const at = slot((i + 1) % LABELS)
        const tile = document.createElement('div')
        tile.className = 'bulk-tile'
        tile.style.cssText = `left:${at.x}px;top:${at.y}px;`
        const label = document.createElement('div')
        label.className = 'bulk-label'
        label.textContent = '00'
        tile.append(label)
        grid.append(tile)
        boxes[`tile-${i}@shuffle`] = viewBox(tile)
        boxes[`label-${i}@shuffle`] = viewBox(label)
    }
    stage.remove()
    return boxes
}

function shuffle(layer: BulkLayer, targetOffset = 0): void {
    for (let i = 0; i < LABELS; i++) {
        const at = slot((i + 1) % LABELS)
        const dx = targetOffset !== 0 && i === 0 ? targetOffset : 0
        layer.tiles[i]!.style.left = `${at.x + dx}px`
        layer.tiles[i]!.style.top = `${at.y}px`
    }
}

export interface BulkSceneOptions {
    readonly control?: string | undefined
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

export class BulkScene {
    static async runManual(
        options: BulkSceneOptions = {}
    ): Promise<SceneTrace> {
        const layer = mount()
        await document.fonts.ready
        const mc = createManualClock()
        const elements = new Map<string, HTMLElement | null>()
        for (let i = 0; i < TILES; i++)
            elements.set(`tile-${i}`, layer.tiles[i]!)
        for (let i = 0; i < LABELS; i++)
            elements.set(`label-${i}`, layer.labels[i]!)
        const builder = new TraceBuilder({
            scene: 's-bulk',
            stepMs: STEP,
            keys: KEYS,
            elements,
            clock: mc,
        })
        for (let i = 0; i < TILES; i++) {
            builder.mount(`tile-${i}`, layer.tiles[i]!)
            builder.initial(`tile-${i}`, layer.tiles[i]!)
        }
        for (let i = 0; i < LABELS; i++) {
            builder.mount(`label-${i}`, layer.labels[i]!)
            builder.initial(`label-${i}`, layer.labels[i]!)
        }
        const probe = probeShuffle()
        for (const [key, box] of Object.entries(probe)) builder.aBox(key, box)
        ;(window as unknown as { __scene?: unknown }).__scene = {
            scene: 's-bulk',
            participants: KEYS,
            movers: 300,
            boxes: probe,
            motion: BULK_SPRING,
        }
        const diagnostics: string[] = []
        const group = createLayoutGroup({
            clock: mc.clock,
            motion: BULK_SPRING,
            reducedMotion: 'ignore',
            threshold: 1,
            maxNodes: 300,
            maxParticipants: 2000,
        })
        const offDiagnostic = layoutRuntime.onDiagnostic((event) => {
            diagnostics.push(event.code)
            builder.diagnostic(event.code, event.action, frame, null)
        })
        const removers: (() => void)[] = []
        for (const tile of layer.tiles)
            removers.push(group.add(tile, { layout: true }))
        for (const label of layer.labels)
            removers.push(group.add(label, { layout: 'position' }))
        const tracker = reportTracker(builder)
        let frame = 0
        const typedOM = isWebKitEngine()
        const record = (kind: 'frame' | 'flush', label?: string) => {
            builder.record(kind, frame, label)
        }
        const step = async () => {
            const before = group.stats
            mc.frame(STEP)
            frame += 1
            const after = group.stats
            builder.frameRead({
                frame,
                rects: after.rects - before.rects,
                offsets: after.offsets - before.offsets,
                styles: after.styles - before.styles,
                holds: before.holds,
            })
            await microtasks()
            record('frame')
        }
        try {
            record('frame')
            const active = LABELS * 2
            const result = recordCommit({
                builder,
                keys: KEYS,
                elements,
                frame,
                label: 'shuffle',
                radiusKeys: new Set(),
                typedOM,
                run: () => {
                    const promise = group.update(() => {
                        shuffle(
                            layer,
                            options.control === 'bulk-target-offset' ? 1 : 0
                        )
                    })
                    if (options.control === 'bulk-extra-read') {
                        // a deliberate extra capture after the consumed one:
                        // its 1,000 rect/pair reads are inside the commit delta
                        group.capture()
                    }
                    return promise
                },
                stats: () => group.stats,
                stylesExpected: active * (typedOM ? 2 : 1),
                activeFlush: active,
            })
            void tracker.track('shuffle', result.promise, () => frame)
            record('flush', 'shuffle')
            let guard = 0
            while (guard++ < 200) {
                await step()
                if (tracker.statuses.size === 1 && group.stats.tracks === 0)
                    break
            }
            await microtasks()
            builder.settleFrames.push(frame)
            if (options.control === 'bulk-leftover-pose') {
                layer.tiles[0]!.style.setProperty(
                    'translate',
                    '0.5px 0px',
                    'important'
                )
            }
            record('frame')
            const connected = KEYS.filter(
                (key) => elements.get(key)?.isConnected
            )
            const final = finalOf(group, mc, connected, diagnostics)
            return builder.build(final)
        } finally {
            offDiagnostic()
            for (const remover of removers.reverse()) remover()
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
            scene: 's-bulk',
            participants: KEYS,
            movers: 300,
            boxes: probeShuffle(),
            motion: BULK_SPRING,
        }
        const group = createLayoutGroup({
            motion: BULK_SPRING,
            reducedMotion: 'ignore',
            maxNodes: 300,
            maxParticipants: 2000,
        })
        const removers: (() => void)[] = []
        for (const tile of layer.tiles)
            removers.push(group.add(tile, { layout: true }))
        for (const label of layer.labels)
            removers.push(group.add(label, { layout: 'position' }))
        const diagnostics: string[] = []
        const offDiagnostic = layoutRuntime.onDiagnostic((event) =>
            diagnostics.push(event.code)
        )
        const commits: { label: string; at: number }[] = []
        try {
            await nextFrame()
            await nextFrame()
            sampler.markCommit()
            void group.update(() => {
                shuffle(layer)
            })
            commits.push({ label: 'shuffle', at: performance.now() })
            for (let i = 0; i < 600; i++) {
                if (group.stats.tracks === 0) break
                await nextFrame()
            }
            const final = {
                tracks: group.stats.tracks,
                holds: group.stats.holds,
                connected: KEYS.filter((key) => elementsOf(layer, key)).length,
            }
            offDiagnostic()
            for (const remover of removers.reverse()) remover()
            group.dispose()
            sampler.stop()
            const frames = [...sampler.frames]
            layer.stage.remove()
            return {
                scene: 's-bulk',
                mode: 'real',
                g,
                gSource: granularityInfo.source,
                frameCosts: frames,
                commits,
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
                motion: BULK_SPRING,
                reducedMotion: 'ignore',
                maxNodes: 300,
                maxParticipants: 2000,
            })
            const removers: (() => void)[] = []
            for (const tile of layer.tiles)
                removers.push(group.add(tile, { layout: true }))
            for (const label of layer.labels)
                removers.push(group.add(label, { layout: 'position' }))
            await waitMs(300)
            await group.update(() => shuffle(layer))
            await waitMs(1500)
            for (const remover of removers.reverse()) remover()
            group.dispose()
            layer.stage.remove()
            await waitMs(300)
        }
    }
}

function elementsOf(layer: BulkLayer, key: string): boolean {
    if (key.startsWith('tile-'))
        return layer.tiles[Number(key.slice(5))]!.isConnected
    return layer.labels[Number(key.slice(6))]!.isConnected
}
