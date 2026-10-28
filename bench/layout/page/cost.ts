/**
 * S-BULK cost shapes of §11.5: the 1,000-participant commit ratio (with the
 * audited required-work floor), the 300-nested-mover steady frame and the
 * sustained 60 Hz commit window. The held shape is P4-only and is reported as
 * pending; this module never fabricates it.
 */

import { timing } from '@freestylejs/ani-core'
import { createLayoutGroup } from '@freestylejs/ani-layout'
import type { CostRun, CostTrace, FloorAuditTrace } from '../types.ts'
import {
    installRafSampler,
    measureGranularity,
    nextFrame,
    waitMs,
} from './harness.ts'

const BULK_MOTION = { type: 'spring', duration: 0.4, bounce: 0.1 } as const
const DARK = '#0B0B0F'
const TILE_COLORS = [
    '#FF2D55',
    '#AF52DE',
    '#007AFF',
    '#34C759',
    '#FF9500',
    '#5AC8FA',
    '#FFCC00',
]

interface BulkFixture {
    readonly root: HTMLElement
    readonly tiles: HTMLElement[]
    readonly movers: number[]
    readonly positions: Box[][]
    dispose(): void
}

interface Box {
    x: number
    y: number
}

function tileColor(index: number): string {
    return TILE_COLORS[index % TILE_COLORS.length]!
}

function buildBulk(scrolled: boolean): BulkFixture {
    const root = document.createElement('div')
    root.style.cssText = `position: fixed; inset: 0; width: 1280px; height: 720px; overflow: hidden; background: ${DARK};`
    const scroller = document.createElement('div')
    scroller.style.cssText =
        'position:absolute; inset:0; width:1280px; height:720px; overflow-y:auto; overflow-x:hidden; scrollbar-width:none; overscroll-behavior:contain;'
    const content = document.createElement('div')
    content.style.cssText = 'position:relative; width:1280px; height:2408px;'
    const tiles: HTMLElement[] = []
    const movers: number[] = []
    const moverRows = scrolled ? [9, 10, 11, 12, 13, 14] : [0, 1, 2, 3, 4, 5]
    for (let index = 0; index < 1000; index++) {
        const row = Math.floor(index / 50)
        const column = index % 50
        const tile = document.createElement('div')
        tile.dataset.p = `bulk-${index}`
        tile.style.cssText = `position:absolute; left:${8 + column * 24}px; top:${8 + row * 120}px; width:20px; height:20px; border-radius:4px; background:${tileColor(index)};`
        content.append(tile)
        tiles.push(tile)
        if (moverRows.includes(row)) movers.push(index)
    }
    scroller.append(content)
    root.append(scroller)
    document.body.append(root)
    const positions: Box[][] = []
    for (const index of movers) {
        const row = Math.floor(index / 50)
        const column = index % 50
        const x = 8 + column * 24
        const y = 8 + row * 120
        positions.push([
            { x, y },
            { x: x + 12, y: y + 12 },
        ])
    }
    if (scrolled) scroller.scrollTop = 1080
    return {
        root,
        tiles,
        movers,
        positions,
        dispose() {
            root.remove()
        },
    }
}

function mutateBulk(fixture: BulkFixture, toggle: boolean): void {
    fixture.movers.forEach((index, slot) => {
        const position = fixture.positions[slot]![toggle ? 1 : 0]!
        const tile = fixture.tiles[index]!
        tile.style.setProperty('left', `${position.x}px`)
        tile.style.setProperty('top', `${position.y}px`)
    })
}

interface Instrumentation {
    rects: number
    offsetReads: number
    poseWrites: number
}

function startInstrumentation(): { stop(): Instrumentation } {
    const counts: Instrumentation = { rects: 0, offsetReads: 0, poseWrites: 0 }
    const rect = Element.prototype.getBoundingClientRect
    const width = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'offsetWidth'
    )!
    const height = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'offsetHeight'
    )!
    const setProperty = CSSStyleDeclaration.prototype.setProperty
    Element.prototype.getBoundingClientRect = function (
        this: Element
    ): DOMRect {
        counts.rects += 1
        return rect.call(this)
    }
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        get() {
            counts.offsetReads += 1
            return width.get!.call(this) as number
        },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() {
            counts.offsetReads += 1
            return height.get!.call(this) as number
        },
    })
    CSSStyleDeclaration.prototype.setProperty = function (
        this: CSSStyleDeclaration,
        property: string,
        value: string | null,
        priority?: string
    ): void {
        if (property === 'translate' || property === 'scale') {
            counts.poseWrites += 1
        }
        setProperty.call(this, property, value, priority)
    }
    return {
        stop() {
            Element.prototype.getBoundingClientRect = rect
            Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width)
            Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height)
            CSSStyleDeclaration.prototype.setProperty = setProperty
            return counts
        },
    }
}

interface FloorCommitCounts {
    captureRects: number
    captureOffsets: number
    flushRects: number
    flushOffsets: number
    poseWrites: number
    extraReads: number
}

/**
 * The required-work floor: exactly §4.1 item 1 reads in the capture and the
 * flush, the same scene mutation, and one t = 0 pose per engine node. No
 * planner, solver, track, report or diagnostic state.
 */
function floorCommit(
    fixture: BulkFixture,
    toggle: boolean,
    extraReads = 0
): FloorCommitCounts {
    const tiles = fixture.tiles
    const captureRects = new Array<DOMRect>(tiles.length)
    const captureOffsets = new Array<readonly [number, number]>(tiles.length)
    for (let i = 0; i < tiles.length; i++) {
        captureRects[i] = tiles[i]!.getBoundingClientRect()
        captureOffsets[i] = [tiles[i]!.offsetWidth, tiles[i]!.offsetHeight]
    }
    for (let i = 0; i < extraReads; i++) tiles[0]!.getBoundingClientRect()
    mutateBulk(fixture, toggle)
    const flushRects = new Array<DOMRect>(tiles.length)
    const flushOffsets = new Array<readonly [number, number]>(tiles.length)
    for (let i = 0; i < tiles.length; i++) {
        flushRects[i] = tiles[i]!.getBoundingClientRect()
        flushOffsets[i] = [tiles[i]!.offsetWidth, tiles[i]!.offsetHeight]
    }
    fixture.movers.forEach((index) => {
        const before = captureRects[index]!
        const after = flushRects[index]!
        const tile = tiles[index]!
        tile.style.setProperty(
            'translate',
            `${before.left - after.left}px ${before.top - after.top}px`,
            'important'
        )
        tile.style.setProperty('scale', '1 1', 'important')
    })
    return {
        captureRects: captureRects.length,
        captureOffsets: captureOffsets.length,
        flushRects: flushRects.length,
        flushOffsets: flushOffsets.length,
        poseWrites: fixture.movers.length,
        extraReads,
    }
}

async function measureEngineBulk(scrolled: boolean): Promise<CostRun> {
    const fixture = buildBulk(scrolled)
    if (scrolled) {
        await nextFrame()
        await nextFrame()
    }
    const group = createLayoutGroup({
        motion: BULK_MOTION,
        reducedMotion: 'ignore',
        maxNodes: 300,
        maxParticipants: 2000,
    })
    for (const tile of fixture.tiles) {
        group.add(tile, { layout: true })
    }
    await group.update(() => undefined)
    for (let i = 0; i < 5; i++) {
        await nextFrame()
        group.update((() => mutateBulk(fixture, i % 2 === 0)) as () => void)
        // settle before the next sample, so every measured commit starts from
        // rest and writes the same t = 0 pose set as the floor
        group.finish()
    }
    const engine: number[] = []
    const samples: CostRun['engineSamples'][number][] = []
    let steadyFrameReads = 0
    for (let i = 0; i < 30; i++) {
        const beforeFrame = group.stats.reads
        await nextFrame()
        steadyFrameReads = Math.max(
            steadyFrameReads,
            group.stats.reads - beforeFrame
        )
        const before = group.stats
        const start = performance.now()
        group.update((() => mutateBulk(fixture, i % 2 === 0)) as () => void)
        const end = performance.now()
        const after = group.stats
        engine.push(end - start)
        samples.push({
            rects: after.rects - before.rects,
            offsets: after.offsets - before.offsets,
            styles: after.styles - before.styles,
            probes: after.probes - before.probes,
            parents: after.parents - before.parents,
            frameReads: 0,
        })
        group.finish()
    }
    const beforeAudit = group.stats
    group.finish()
    const instrumentation = startInstrumentation()
    group.update((() => mutateBulk(fixture, true)) as () => void)
    const counted = instrumentation.stop()
    const afterAudit = group.stats
    const engineAudit = {
        rects: counted.rects,
        offsets: counted.offsetReads / 2,
        styleReads: afterAudit.styles - beforeAudit.styles,
        poseWrites: counted.poseWrites / 2,
    }
    group.finish()
    group.dispose()
    fixture.dispose()
    const floor = await measureFloorBulk(scrolled)
    return {
        participants: fixture.tiles.length,
        poses: fixture.movers.length,
        engine,
        floor: floor.engine,
        engineSamples: samples,
        engineAudit,
        floorAudit: floor.floorAudit,
        steadyFrameReads,
    }
}

async function measureFloorBulk(
    scrolled: boolean
): Promise<{ engine: number[]; floorAudit: CostRun['floorAudit'] }> {
    const fixture = buildBulk(scrolled)
    if (scrolled) {
        await nextFrame()
        await nextFrame()
    }
    floorCommit(fixture, false)
    for (let i = 0; i < 5; i++) {
        await nextFrame()
        floorCommit(fixture, i % 2 === 0)
    }
    const floor: number[] = []
    for (let i = 0; i < 30; i++) {
        await nextFrame()
        const start = performance.now()
        floorCommit(fixture, i % 2 === 0)
        floor.push(performance.now() - start)
    }
    const instrumentation = startInstrumentation()
    const audit = floorCommit(fixture, true)
    const counted = instrumentation.stop()
    const totalRects = audit.captureRects + audit.flushRects
    const totalOffsets = audit.captureOffsets + audit.flushOffsets
    if (
        counted.rects !== totalRects + audit.extraReads ||
        counted.offsetReads !== totalOffsets * 2 ||
        counted.poseWrites !== audit.poseWrites * 2
    ) {
        fixture.dispose()
        throw new Error(
            `floor audit instrumentation mismatch: rects ${counted.rects}/${totalRects + audit.extraReads}, offsets ${counted.offsetReads}/${totalOffsets * 2}, pose declarations ${counted.poseWrites}/${audit.poseWrites * 2}`
        )
    }
    fixture.dispose()
    return { engine: floor, floorAudit: audit }
}

function buildNestedMovers(): {
    root: HTMLElement
    participants: HTMLElement[]
    mutate(toggle: boolean): void
    dispose(): void
} {
    const root = document.createElement('div')
    root.style.cssText = `position: fixed; inset: 0; width: 1280px; height: 720px; overflow: hidden; background: ${DARK};`
    const participants: HTMLElement[] = []
    for (let p = 0; p < 30; p++) {
        const parent = document.createElement('div')
        const x = 20 + (p % 6) * 200
        const y = 20 + Math.floor(p / 6) * 120
        parent.dataset.p = `parent-${p}`
        parent.style.cssText = `position:absolute; left:${x}px; top:${y}px; width:180px; height:100px; border-radius:8px; background:rgba(255,255,255,0.08);`
        root.append(parent)
        participants.push(parent)
        for (let c = 0; c < 9; c++) {
            const child = document.createElement('div')
            child.dataset.p = `child-${p}-${c}`
            child.style.cssText = `position:absolute; left:${8 + (c % 3) * 56}px; top:${8 + Math.floor(c / 3) * 30}px; width:20px; height:20px; border-radius:4px; background:${tileColor(p + c)};`
            parent.append(child)
            participants.push(child)
        }
    }
    document.body.append(root)
    return {
        root,
        participants,
        mutate(toggle) {
            for (let p = 0; p < 30; p++) {
                const parent = participants[p * 10]!
                const x = 20 + (p % 6) * 200 + (toggle ? 12 : 0)
                const y = 20 + Math.floor(p / 6) * 120 + (toggle ? 10 : 0)
                parent.style.setProperty('left', `${x}px`)
                parent.style.setProperty('top', `${y}px`)
                for (let c = 0; c < 9; c++) {
                    const child = participants[p * 10 + 1 + c]!
                    child.style.setProperty(
                        'left',
                        `${8 + (c % 3) * 56 + (toggle ? 8 : 0)}px`
                    )
                    child.style.setProperty(
                        'top',
                        `${8 + Math.floor(c / 3) * 30 + (toggle ? 6 : 0)}px`
                    )
                }
            }
        },
        dispose() {
            root.remove()
        },
    }
}

async function measureSteady(
    sampler: ReturnType<typeof installRafSampler>
): Promise<number[]> {
    const fixture = buildNestedMovers()
    const group = createLayoutGroup({
        motion: { type: 'timing', duration: 10, timing: timing.linear() },
        reducedMotion: 'ignore',
        maxNodes: 300,
        maxParticipants: 2000,
    })
    for (const participant of fixture.participants) {
        group.add(participant, { layout: true })
    }
    await group.update(() => undefined)
    await nextFrame()
    const start = sampler.frames.length
    sampler.markCommit()
    group.update((() => fixture.mutate(true)) as () => void)
    while (sampler.frames.length - start < 600) await nextFrame()
    const costs = sampler.frames
        .slice(start, start + 600)
        .map((frame) => frame.ms)
    group.finish()
    group.dispose()
    fixture.dispose()
    return costs
}

function buildSustained(): {
    root: HTMLElement
    tiles: HTMLElement[]
    mutate(toggle: boolean): void
    dispose(): void
} {
    const root = document.createElement('div')
    root.style.cssText = `position: fixed; inset: 0; width: 1280px; height: 720px; overflow: hidden; background: ${DARK};`
    const tiles: HTMLElement[] = []
    for (let index = 0; index < 300; index++) {
        const tile = document.createElement('div')
        const column = index % 25
        const row = Math.floor(index / 25)
        tile.dataset.p = `sustained-${index}`
        tile.style.cssText = `position:absolute; left:${20 + column * 48}px; top:${20 + row * 56}px; width:24px; height:24px; border-radius:4px; background:${tileColor(index)};`
        root.append(tile)
        tiles.push(tile)
    }
    document.body.append(root)
    return {
        root,
        tiles,
        mutate(toggle) {
            tiles.forEach((tile, index) => {
                const column = index % 25
                const row = Math.floor(index / 25)
                tile.style.setProperty(
                    'left',
                    `${20 + column * 48 + (toggle ? 10 : 0)}px`
                )
                tile.style.setProperty(
                    'top',
                    `${20 + row * 56 + (toggle ? 8 : 0)}px`
                )
            })
        },
        dispose() {
            root.remove()
        },
    }
}

async function measureSustained(
    sampler: ReturnType<typeof installRafSampler>
): Promise<{ costs: number[]; commits: number }> {
    const fixture = buildSustained()
    const group = createLayoutGroup({
        motion: BULK_MOTION,
        reducedMotion: 'ignore',
        maxNodes: 300,
        maxParticipants: 2000,
    })
    for (const tile of fixture.tiles) group.add(tile, { layout: true })
    await group.update(() => undefined)
    await nextFrame()
    const start = performance.now()
    const frameStart = sampler.frames.length
    let commits = 0
    let toggle = false
    // Commits are scheduled from the previous commit's timestamp at 60 Hz,
    // independently of the rAF rate (headless WebKit runs near 30 Hz). The
    // commit's script time is charged to the next frame sample, so the
    // sustained gate measures the whole main-thread frame cost.
    const commitLoop = (async () => {
        let next = start
        while (performance.now() < start + 5000) {
            const now = performance.now()
            if (now >= next) {
                sampler.markCommit()
                toggle = !toggle
                const before = performance.now()
                group.update((() => fixture.mutate(toggle)) as () => void)
                sampler.addScript(performance.now() - before)
                commits += 1
                next += 1000 / 60
                if (next < now) next = now + 1000 / 60
            }
            await waitMs(1)
        }
    })()
    while (performance.now() < start + 5000) await nextFrame()
    await commitLoop
    const costs = sampler.frames
        .slice(frameStart)
        .filter((frame) => frame.at >= start && frame.at <= start + 5000)
        .map((frame) => frame.ms)
    group.finish()
    group.dispose()
    fixture.dispose()
    return { costs, commits }
}

export async function runCostShapes(): Promise<CostTrace> {
    const g = measureGranularity()
    const sampler = installRafSampler()
    try {
        const unscrolled = await measureEngineBulk(false)
        const scrolled = await measureEngineBulk(true)
        const steady = await measureSteady(sampler)
        const sustained = await measureSustained(sampler)
        sampler.stop()
        return {
            mode: 'cost',
            g,
            unscrolled,
            scrolled,
            steady: { costs: steady, g },
            sustained: {
                costs: sustained.costs,
                g,
                commits: sustained.commits,
            },
            exactReads: unscrolled.engineSamples.map((sample, index) => ({
                label: `commit-${index + 1}`,
                rects: sample.rects,
                offsets: sample.offsets,
                nBefore: unscrolled.participants,
                nAfter: unscrolled.participants,
                frameReads: sample.frameReads,
                styles: sample.styles,
            })),
            held: { pending: 'P4' },
        }
    } finally {
        sampler.stop()
    }
}

/** Runs the audited floor alone; `extraRead` is the over-counting control. */
export async function runFloorAudit(
    extraRead = false
): Promise<FloorAuditTrace> {
    const fixture = buildBulk(false)
    try {
        floorCommit(fixture, false)
        const instrumentation = startInstrumentation()
        const audit = floorCommit(fixture, true, extraRead ? 1 : 0)
        const counted = instrumentation.stop()
        const totalRects = audit.captureRects + audit.flushRects
        if (counted.rects !== totalRects + audit.extraReads) {
            throw new Error(
                `floor control instrumented ${counted.rects} rects, local ${totalRects + audit.extraReads}`
            )
        }
        return {
            participants: fixture.tiles.length,
            poses: fixture.movers.length,
            ...audit,
        }
    } finally {
        fixture.dispose()
    }
}
