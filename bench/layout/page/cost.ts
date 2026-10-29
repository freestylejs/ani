/**
 * S-BULK cost shapes of §11.5/A-19: 1,000 participants = 850 tiles + 150
 * nested labels; 300 movers = 150 moving tiles + their 150 labels. The floor
 * includes §4.3 step 2 computed reads for the active nodes, and both fixtures
 * are reset to rest between samples. WebKit's 1 ms timer makes G9/G11
 * non-deciding; G10 uses real-clock 20-frame batches. The report returns
 * BLOCK for G9/G11, not a fabricated ratio.
 */

import { createClock, timing } from '@freestylejs/ani-core'
import { createLayoutGroup, type LayoutGroup } from '@freestylejs/ani-layout'
import { median } from '../stats.ts'
import type { CostRun, CostTrace, FloorAuditTrace } from '../types.ts'
import {
    installRafSampler,
    isWebKitEngine,
    measureGranularityInfo,
    nextFrame,
    waitMs,
} from './harness.ts'

const BULK_MOTION = { type: 'spring', duration: 0.4, bounce: 0.1 } as const
const DARK = '#0B0B0F'
const TILE_COLORS = [
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

interface Slot {
    readonly x: number
    readonly y: number
}

interface BulkFixture {
    readonly root: HTMLElement
    readonly scroller: HTMLElement
    readonly content: HTMLElement
    readonly tiles: readonly HTMLElement[]
    readonly labels: readonly HTMLElement[]
    /** 150 moving tiles + their 150 labels. */
    readonly movers: readonly HTMLElement[]
    readonly movingTiles: readonly number[]
    readonly movingSlots: readonly Slot[]
    readonly baseSlots: ReadonlyMap<number, Slot>
    readonly targetSlots: ReadonlyMap<number, Slot>
    readonly participants: readonly HTMLElement[]
    dispose(): void
}

function tileColor(index: number): string {
    return TILE_COLORS[index % TILE_COLORS.length]!
}

function buildBulk(scrolled: boolean, costGrid: boolean): BulkFixture {
    const root = document.createElement('div')
    root.style.cssText = `position: fixed; inset: 0; width: 1280px; height: 720px; overflow: hidden; background: ${DARK};`
    const scroller = document.createElement('div')
    scroller.style.cssText = `position:absolute; inset:0; width:1280px; height:720px; overflow-y:auto; overflow-x:hidden; scrollbar-width:none; overscroll-behavior:contain;`
    const content = document.createElement('div')
    const columns = costGrid ? 16 : 32
    const rows = costGrid ? 54 : 27
    const tileWidth = costGrid ? 60 : 36
    const tileHeight = costGrid ? 32 : 18
    const pitchX = costGrid ? 64 : 39
    const pitchY = costGrid ? 36 : 21
    const contentHeight = costGrid ? 1944 : rows * pitchY + 25.5
    content.style.cssText = `position:relative; width:${columns * pitchX + 17.5}px; height:${contentHeight}px;`
    const slotList: Slot[] = []
    for (let index = 0; index < columns * rows; index++) {
        const column = index % columns
        const row = Math.floor(index / columns)
        slotList.push({
            x: 17.5 + column * pitchX,
            y: 25.5 + row * pitchY,
        })
    }
    const baseSlots = new Map<number, Slot>()
    const targetSlots = new Map<number, Slot>()
    const movingTiles: number[] = []
    const movingSlots: Slot[] = []
    const movingStartRow = costGrid && scrolled ? 30 : 0
    const movingStart = movingStartRow * columns
    for (let i = 0; i < 150; i++) {
        const tileIndex = movingStart + i
        movingTiles.push(tileIndex)
        movingSlots.push(slotList[tileIndex]!)
        baseSlots.set(tileIndex, slotList[tileIndex]!)
        targetSlots.set(tileIndex, slotList[movingStart + ((i + 1) % 150)]!)
    }
    const tiles: HTMLElement[] = []
    const labels: HTMLElement[] = []
    for (let index = 0; index < 850; index++) {
        const slot = slotList[index]!
        const tile = document.createElement('div')
        tile.dataset.p = `tile-${index}`
        tile.style.cssText = `position:absolute; left:${slot.x}px; top:${slot.y}px; width:${tileWidth}px; height:${tileHeight}px; border-radius:4px; background:${tileColor(index)}; box-sizing:border-box; border:1px solid rgba(255,255,255,0.08);`
        content.append(tile)
        tiles.push(tile)
        if (movingTiles.includes(index)) {
            const label = document.createElement('div')
            label.dataset.p = `label-${index}`
            label.style.cssText =
                'position:absolute; left:1px; top:1px; width:34px; height:16px; border-radius:2px; background:rgba(255,255,255,0.12); color:#fff; font:600 8px/16px -apple-system, sans-serif; text-align:center;'
            label.textContent = String(index % 100).padStart(2, '0')
            tile.append(label)
            labels.push(label)
        }
    }
    if (tiles.length !== 850 || labels.length !== 150) {
        throw new Error(
            `A-19 shape: ${tiles.length} tiles + ${labels.length} labels != 850+150`
        )
    }
    scroller.append(content)
    root.append(scroller)
    document.body.append(root)
    if (scrolled) scroller.scrollTop = 1080
    return {
        root,
        scroller,
        content,
        tiles,
        labels,
        movers: [...movingTiles.map((index) => tiles[index]!), ...labels],
        movingTiles,
        movingSlots,
        baseSlots,
        targetSlots,
        participants: [...tiles, ...labels],
        dispose() {
            root.remove()
        },
    }
}

function mutateBulk(fixture: BulkFixture, target: boolean): void {
    for (const index of fixture.movingTiles) {
        const slot = target
            ? fixture.targetSlots.get(index)!
            : fixture.baseSlots.get(index)!
        const tile = fixture.tiles[index]!
        tile.style.setProperty('left', `${slot.x}px`)
        tile.style.setProperty('top', `${slot.y}px`)
    }
}

function resetEnginePoses(group: LayoutGroup): void {
    group.finish()
}

function resetFloorPoses(fixture: BulkFixture): void {
    for (const mover of fixture.movers) {
        mover.style.removeProperty('translate')
        mover.style.removeProperty('scale')
    }
}

/** §4.3 step 2 computed reads for one active node. */
function readActiveStyles(element: HTMLElement, typedOM: boolean): void {
    const style = getComputedStyle(element)
    void style.transform
    void style.translate
    void style.scale
    void style.rotate
    void style.transformOrigin
    if (typedOM && typeof element.computedStyleMap === 'function') {
        void element.computedStyleMap().get('transform-origin')
    }
}

interface Instrumentation {
    rects: number
    offsetReads: number
    styleReads: number
    poseWrites: number
}

function startInstrumentation(): { stop(): Instrumentation } {
    const counts: Instrumentation = {
        rects: 0,
        offsetReads: 0,
        styleReads: 0,
        poseWrites: 0,
    }
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
    const computed = window.getComputedStyle.bind(window)
    const computedStyleMap = Element.prototype.computedStyleMap
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
    window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
        counts.styleReads += 1
        return computed(element, pseudo ?? undefined)
    }) as typeof window.getComputedStyle
    Element.prototype.computedStyleMap = function (
        this: Element
    ): StylePropertyMapReadOnly {
        counts.styleReads += 1
        return computedStyleMap.call(this)
    }
    return {
        stop() {
            Element.prototype.getBoundingClientRect = rect
            Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width)
            Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height)
            CSSStyleDeclaration.prototype.setProperty = setProperty
            window.getComputedStyle = computed
            Element.prototype.computedStyleMap = computedStyleMap
            return counts
        },
    }
}

interface FloorCommitCounts {
    captureRects: number
    captureOffsets: number
    flushRects: number
    flushOffsets: number
    styleReads: number
    poseWrites: number
    extraReads: number
}

/**
 * The required-work floor: §4.1 item 1 capture reads, §4.3 step 2 rect/offset
 * and active-node computed reads, §4.3 step 4 t=0 poses. No planner, solver,
 * track, report or diagnostic state.
 */
function floorCommit(
    fixture: BulkFixture,
    target: boolean,
    typedOM: boolean,
    extraReads = 0
): FloorCommitCounts {
    const participants = fixture.participants
    const captureRects = new Array<DOMRect>(participants.length)
    const captureOffsets = new Array<readonly [number, number]>(
        participants.length
    )
    for (let i = 0; i < participants.length; i++) {
        captureRects[i] = participants[i]!.getBoundingClientRect()
        captureOffsets[i] = [
            participants[i]!.offsetWidth,
            participants[i]!.offsetHeight,
        ]
    }
    for (let i = 0; i < extraReads; i++) {
        participants[0]!.getBoundingClientRect()
    }
    mutateBulk(fixture, target)
    const flushRects = new Array<DOMRect>(participants.length)
    const flushOffsets = new Array<readonly [number, number]>(
        participants.length
    )
    for (let i = 0; i < participants.length; i++) {
        flushRects[i] = participants[i]!.getBoundingClientRect()
        flushOffsets[i] = [
            participants[i]!.offsetWidth,
            participants[i]!.offsetHeight,
        ]
    }
    for (const mover of fixture.movers) readActiveStyles(mover, typedOM)
    const beforeByElement = new Map<Element, DOMRect>()
    const afterByElement = new Map<Element, DOMRect>()
    participants.forEach((element, index) => {
        beforeByElement.set(element, captureRects[index]!)
        afterByElement.set(element, flushRects[index]!)
    })
    for (const mover of fixture.movers) {
        const before = beforeByElement.get(mover)!
        const after = afterByElement.get(mover)!
        mover.style.setProperty(
            'translate',
            `${before.left - after.left}px ${before.top - after.top}px`,
            'important'
        )
        mover.style.setProperty('scale', '1 1', 'important')
    }
    return {
        captureRects: captureRects.length,
        captureOffsets: captureOffsets.length,
        flushRects: flushRects.length,
        flushOffsets: flushOffsets.length,
        styleReads: fixture.movers.length * (typedOM ? 2 : 1),
        poseWrites: fixture.movers.length,
        extraReads,
    }
}

function engineAdd(group: LayoutGroup, fixture: BulkFixture): void {
    for (const tile of fixture.tiles) group.add(tile, { layout: true })
    for (const label of fixture.labels) {
        group.add(label, { layout: 'position' })
    }
}

async function measureEngineBulk(
    scrolled: boolean,
    costGrid: boolean,
    typedOM: boolean
): Promise<CostRun> {
    const fixture = buildBulk(scrolled, costGrid)
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
    engineAdd(group, fixture)
    const engine: number[] = []
    const samples: CostRun['engineSamples'][number][] = []
    let steadyFrameReads = 0
    for (let i = 0; i < 5; i++) {
        await nextFrame()
        group.update((() => mutateBulk(fixture, i % 2 === 0)) as () => void)
        resetEnginePoses(group)
    }
    for (let i = 0; i < 30; i++) {
        const beforeFrame = group.stats.reads
        await nextFrame()
        steadyFrameReads = Math.max(
            steadyFrameReads,
            group.stats.reads - beforeFrame
        )
        const before = group.stats
        const start = performance.now()
        group.update((() => mutateBulk(fixture, i % 2 === 1)) as () => void)
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
        resetEnginePoses(group)
    }
    resetEnginePoses(group)
    const instrumentation = startInstrumentation()
    group.update((() => mutateBulk(fixture, false)) as () => void)
    const counted = instrumentation.stop()
    const engineAudit = {
        rects: counted.rects,
        offsets: counted.offsetReads / 2,
        styleReads: counted.styleReads,
        poseWrites: counted.poseWrites / 2,
    }
    group.finish()
    group.dispose()
    fixture.dispose()
    const floorResult = await measureFloorBulk(scrolled, costGrid, typedOM)
    return {
        participants: fixture.participants.length,
        poses: fixture.movers.length,
        typedOM,
        heldPending: true,
        engine,
        floor: floorResult.engine,
        engineSamples: samples,
        engineAudit,
        floorAudit: floorResult.floorAudit,
        steadyFrameReads,
    }
}

async function measureFloorBulk(
    scrolled: boolean,
    costGrid: boolean,
    typedOM: boolean
): Promise<{ engine: number[]; floorAudit: CostRun['floorAudit'] }> {
    const fixture = buildBulk(scrolled, costGrid)
    if (scrolled) {
        await nextFrame()
        await nextFrame()
    }
    for (let i = 0; i < 5; i++) {
        await nextFrame()
        floorCommit(fixture, i % 2 === 0, typedOM)
        resetFloorPoses(fixture)
    }
    const times: number[] = []
    for (let i = 0; i < 30; i++) {
        await nextFrame()
        const start = performance.now()
        floorCommit(fixture, i % 2 === 1, typedOM)
        times.push(performance.now() - start)
        resetFloorPoses(fixture)
    }
    resetFloorPoses(fixture)
    const instrumentation = startInstrumentation()
    const audit = floorCommit(fixture, false, typedOM)
    const counted = instrumentation.stop()
    const totalRects = audit.captureRects + audit.flushRects
    const totalOffsets = audit.captureOffsets + audit.flushOffsets
    if (
        counted.rects !== totalRects + audit.extraReads ||
        counted.offsetReads !== totalOffsets * 2 ||
        counted.styleReads !== audit.styleReads ||
        counted.poseWrites !== audit.poseWrites * 2
    ) {
        fixture.dispose()
        throw new Error(
            `floor audit instrumentation mismatch: rects ${counted.rects}/${totalRects + audit.extraReads}, offsets ${counted.offsetReads}/${totalOffsets * 2}, styles ${counted.styleReads}/${audit.styleReads}, pose declarations ${counted.poseWrites}/${audit.poseWrites * 2}`
        )
    }
    fixture.dispose()
    return { engine: times, floorAudit: audit }
}

function refreshRate(frames: readonly { at: number }[]): number {
    if (frames.length < 2) return Number.NaN
    const deltas: number[] = []
    for (let i = 1; i < frames.length; i++) {
        const delta = frames[i]!.at - frames[i - 1]!.at
        if (delta > 0) deltas.push(delta)
    }
    return deltas.length === 0 ? Number.NaN : 1000 / median(deltas)
}

async function measureSteady(
    sampler: ReturnType<typeof installRafSampler>,
    g: number
): Promise<{
    costs: number[]
    refreshHz: number
    sampleMode: 'frame' | 'batch20'
    errorBound: number
}> {
    if (g > 0.05) return measureSteadyBatch(g)
    const fixture = buildBulk(false, false)
    // A-19 nesting: 150 tiles + 150 labels. A 10 s linear track keeps all 600
    // samples active; the motion duration is a scene contribution, the shape
    // is the authority's.
    const group = createLayoutGroup({
        motion: { type: 'timing', duration: 10, timing: timing.linear() },
        reducedMotion: 'ignore',
        maxNodes: 300,
        maxParticipants: 2000,
    })
    engineAdd(group, fixture)
    await nextFrame()
    const start = sampler.frames.length
    sampler.markCommit()
    group.update((() => mutateBulk(fixture, true)) as () => void)
    while (sampler.frames.length - start < 600) await nextFrame()
    const window = sampler.frames.slice(start, start + 600)
    const costs = window.map((frame) => frame.ms)
    group.finish()
    group.dispose()
    fixture.dispose()
    return {
        costs,
        refreshHz: refreshRate(window),
        sampleMode: 'frame',
        errorBound: g / 2,
    }
}

/**
 * §11.5 coarse-timer protocol: one sample is the mean of 20 consecutive
 * frames timed as one `performance.now()` interval. A real rAF tick starts
 * each batch; the 20 engine frame callbacks then run back-to-back on the real
 * clock, so the interval contains their script work and no display idle.
 * 30 samples cover 600 frames. This is a frame-sample protocol only; it cannot
 * be used for a 60 Hz commit cadence.
 */
async function measureSteadyBatch(g: number): Promise<{
    costs: number[]
    refreshHz: number
    sampleMode: 'batch20'
    errorBound: number
}> {
    const fixture = buildBulk(false, false)
    const batch = createRealClockBatcher()
    const group = createLayoutGroup({
        clock: batch.clock,
        motion: { type: 'timing', duration: 10, timing: timing.linear() },
        reducedMotion: 'ignore',
        maxNodes: 300,
        maxParticipants: 2000,
    })
    engineAdd(group, fixture)
    group.update((() => mutateBulk(fixture, true)) as () => void)
    const costs: number[] = []
    for (let i = 0; i < 30; i++) {
        await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => {
                const before = performance.now()
                batch.frames(20)
                costs.push((performance.now() - before) / 20)
                resolve()
            })
        })
    }
    group.finish()
    group.dispose()
    batch.clock.dispose()
    fixture.dispose()
    return {
        costs,
        // A batch spans 20 engine frame callbacks, not 20 display frames.
        refreshHz: 0,
        sampleMode: 'batch20',
        errorBound: g / 20,
    }
}

/**
 * A real clock whose frame callbacks are queued instead of being handed to
 * the browser. `frames(n)` runs n callbacks back-to-back, which is the
 * unquantized 20-frame interval the coarse-timer protocol times.
 */
function createRealClockBatcher(): {
    readonly clock: ReturnType<typeof createClock>
    frames(count: number): void
} {
    let nextId = 1
    const queue = new Map<number, (timestamp: number) => void>()
    const clock = createClock({
        reducedMotion: false,
        visibility: false,
        now: () => performance.now(),
        requestFrame: (callback) => {
            const id = nextId
            nextId += 1
            queue.set(id, callback)
            return id
        },
        cancelFrame: (id) => {
            queue.delete(id)
        },
    })
    return {
        clock,
        frames(count: number) {
            for (let i = 0; i < count; i++) {
                const callbacks = [...queue.values()]
                queue.clear()
                const timestamp = performance.now()
                for (const callback of callbacks) callback(timestamp)
            }
        },
    }
}

function buildSustainedFixture(): BulkFixture {
    return buildBulk(false, false)
}

async function measureSustained(
    sampler: ReturnType<typeof installRafSampler>,
    g: number
): Promise<{
    commitCosts: number[]
    floorCosts: number[]
    frameCosts: number[]
    commits: number
    refreshHz: number
    durationMs: number
    commitHz: number
    sampleMode: 'commit' | 'quantized'
    errorBound: number
    engineAudit: CostRun['engineAudit']
    floorAudit: CostRun['floorAudit']
}> {
    const fixture = buildSustainedFixture()
    const participants = fixture.participants.length
    const group = createLayoutGroup({
        motion: BULK_MOTION,
        reducedMotion: 'ignore',
        maxNodes: 300,
        maxParticipants: 2000,
    })
    engineAdd(group, fixture)
    await nextFrame()
    // Five discarded sustained commits, as the G9 fixtures and the floor
    // replica use; they warm the commit path but are not in the window.
    let warmToggle = false
    for (let i = 0; i < 5; i++) {
        await nextFrame()
        warmToggle = !warmToggle
        group.update((() => mutateBulk(fixture, warmToggle)) as () => void)
    }
    const start = performance.now()
    const frameStart = sampler.frames.length
    const commitCosts: number[] = []
    let commits = 0
    let toggle = warmToggle
    // 60 Hz commits. One performance.now() pair per commit: this is the
    // commit script cost, not a 30 Hz rAF frame made of two commits.
    const commitLoop = (async () => {
        let next = start
        while (commits < 300 && performance.now() < start + 7000) {
            const now = performance.now()
            if (now >= next) {
                toggle = !toggle
                const before = performance.now()
                group.update((() => mutateBulk(fixture, toggle)) as () => void)
                commitCosts.push(performance.now() - before)
                commits += 1
                next += 1000 / 60
                if (next < now) next = now + 1000 / 60
            }
            await waitMs(1)
        }
    })()
    while (performance.now() < start + 7000 && commits < 300) await nextFrame()
    await commitLoop
    const durationMs = performance.now() - start
    const frames = sampler.frames
        .slice(frameStart)
        .filter((frame) => frame.at >= start && frame.at <= start + 5000)
    // One instrumented sustained engine commit audits the exact read/write
    // counts of the 1,000-participant shape, as G9 does. Finish the running
    // tracks first so the audited commit starts all 300 movers again; a
    // sustained retarget after 5 s has some tracks already settled.
    group.finish()
    const engineInstrumentation = startInstrumentation()
    group.update((() => mutateBulk(fixture, !toggle)) as () => void)
    const engineCounted = engineInstrumentation.stop()
    const engineAudit = {
        rects: engineCounted.rects,
        offsets: engineCounted.offsetReads / 2,
        styleReads: engineCounted.styleReads,
        poseWrites: engineCounted.poseWrites / 2,
    }
    group.finish()
    group.dispose()
    fixture.dispose()

    // The floor replica runs the same 1,000-participant DOM, the same
    // mutation and exactly the required reads/writes at the same 60 Hz
    // cadence. It is measured after the engine in the same process, with the
    // same warm-up and sample count.
    const floorFixture = buildSustainedFixture()
    await nextFrame()
    const typedOM = isWebKitEngine()
    let floorToggle = false
    for (let i = 0; i < 5; i++) {
        await nextFrame()
        floorCommit(floorFixture, floorToggle, typedOM)
        floorToggle = !floorToggle
        resetFloorPoses(floorFixture)
    }
    const floorCosts: number[] = []
    const floorStart = performance.now()
    let floorNext = floorStart
    for (let i = 0; i < 300; i++) {
        while (performance.now() < floorNext) await waitMs(1)
        floorToggle = !floorToggle
        const before = performance.now()
        floorCommit(floorFixture, floorToggle, typedOM)
        floorCosts.push(performance.now() - before)
        resetFloorPoses(floorFixture)
        floorNext += 1000 / 60
        const now = performance.now()
        if (floorNext < now) floorNext = now + 1000 / 60
    }
    const floorInstrumentation = startInstrumentation()
    const floorAudit = floorCommit(floorFixture, false, typedOM)
    const floorCounted = floorInstrumentation.stop()
    resetFloorPoses(floorFixture)
    floorFixture.dispose()
    const totalRects = floorAudit.captureRects + floorAudit.flushRects
    const totalOffsets = floorAudit.captureOffsets + floorAudit.flushOffsets
    if (
        floorCounted.rects !== totalRects + floorAudit.extraReads ||
        floorCounted.offsetReads !== totalOffsets * 2 ||
        floorCounted.styleReads !== floorAudit.styleReads ||
        floorCounted.poseWrites !== floorAudit.poseWrites * 2
    ) {
        throw new Error(
            `sustained floor audit instrumentation mismatch: rects ${floorCounted.rects}/${totalRects + floorAudit.extraReads}, offsets ${floorCounted.offsetReads}/${totalOffsets * 2}, styles ${floorCounted.styleReads}/${floorAudit.styleReads}, pose declarations ${floorCounted.poseWrites}/${floorAudit.poseWrites * 2}`
        )
    }
    return {
        participants,
        commitCosts,
        floorCosts,
        frameCosts: frames.map((frame) => frame.ms),
        commits,
        refreshHz: refreshRate(frames),
        durationMs,
        commitHz: commits / (durationMs / 1000),
        sampleMode: g <= 0.05 ? 'commit' : 'quantized',
        errorBound: g <= 0.05 ? g / 2 : g / 2,
        engineAudit,
        floorAudit,
    }
}

export async function runCostShapes(): Promise<CostTrace> {
    const granularityInfo = measureGranularityInfo()
    const g = granularityInfo.value
    const typedOM = isWebKitEngine()
    const sampler = installRafSampler()
    try {
        // The sustained shape is measured first, on the least disturbed heap;
        // the G9 shapes and the steady probe follow in the same fresh process.
        const sustained = await measureSustained(sampler, g)
        const unscrolled = await measureEngineBulk(false, false, typedOM)
        const scrolled = await measureEngineBulk(true, true, typedOM)
        const steady = await measureSteady(sampler, g)
        sampler.stop()
        return {
            mode: 'cost',
            g,
            gSource: granularityInfo.source,
            typedOM,
            heldPending: true,
            unscrolled,
            scrolled,
            steady: {
                costs: steady.costs,
                g,
                refreshHz: steady.refreshHz,
                sampleMode: steady.sampleMode,
                errorBound: steady.errorBound,
            },
            sustained: {
                commitCosts: sustained.commitCosts,
                floorCosts: sustained.floorCosts,
                frameCosts: sustained.frameCosts,
                g,
                sampleMode: sustained.sampleMode,
                errorBound: sustained.errorBound,
                commits: sustained.commits,
                refreshHz: sustained.refreshHz,
                durationMs: sustained.durationMs,
                commitHz: sustained.commitHz,
                engineAudit: sustained.engineAudit,
                floorAudit: sustained.floorAudit,
            },
            exactReads: [
                ...unscrolled.engineSamples.map((sample, index) => ({
                    label: `unscrolled-${index + 1}`,
                    rects: sample.rects,
                    offsets: sample.offsets,
                    nBefore: unscrolled.participants,
                    nAfter: unscrolled.participants,
                    frameReads: sample.frameReads,
                    styles: sample.styles,
                })),
                ...scrolled.engineSamples.map((sample, index) => ({
                    label: `scrolled-${index + 1}`,
                    rects: sample.rects,
                    offsets: sample.offsets,
                    nBefore: scrolled.participants,
                    nAfter: scrolled.participants,
                    frameReads: sample.frameReads,
                    styles: sample.styles,
                })),
            ],
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
    const fixture = buildBulk(false, false)
    const typedOM = isWebKitEngine()
    try {
        for (let i = 0; i < 5; i++) {
            floorCommit(fixture, i % 2 === 0, typedOM)
            resetFloorPoses(fixture)
        }
        resetFloorPoses(fixture)
        const instrumentation = startInstrumentation()
        const audit = floorCommit(fixture, true, typedOM, extraRead ? 1 : 0)
        const counted = instrumentation.stop()
        const totalRects = audit.captureRects + audit.flushRects
        if (
            counted.rects !== totalRects + audit.extraReads ||
            counted.styleReads !== audit.styleReads
        ) {
            throw new Error(
                `floor control instrumented ${counted.rects} rects/${counted.styleReads} styles, local ${totalRects + audit.extraReads}/${audit.styleReads}`
            )
        }
        return {
            participants: fixture.participants.length,
            poses: fixture.movers.length,
            typedOM,
            ...audit,
        }
    } finally {
        fixture.dispose()
    }
}

export interface SceneCostProbe {
    readonly scene: string
    readonly participants: number
    readonly movers: number
    readonly engine: readonly number[]
    readonly floor: readonly number[]
    readonly ratio: number
}

/**
 * A small non-deciding engine/floor probe at a scene's own N. It is a cost
 * probe, not the scene's scored DOM (A-12 says the named G9 gate is S-BULK).
 */
export async function runSceneCostProbe(
    scene: string,
    participants: number,
    movers: number,
    motion: { type: 'spring'; duration: number; bounce: number }
): Promise<SceneCostProbe> {
    const root = document.createElement('div')
    root.style.cssText =
        'position:fixed; inset:0; width:390px; height:844px; overflow:hidden; background:#F2F2F7;'
    const elements: HTMLElement[] = []
    for (let i = 0; i < participants; i++) {
        const element = document.createElement('div')
        element.dataset.p = `probe-${i}`
        element.style.cssText = `position:absolute; left:${16 + (i % 8) * 44}px; top:${100 + Math.floor(i / 8) * 44}px; width:40px; height:40px; border-radius:8px; background:#007AFF;`
        root.append(element)
        elements.push(element)
    }
    document.body.append(root)
    const group = createLayoutGroup({
        motion,
        reducedMotion: 'ignore',
        maxNodes: 300,
        maxParticipants: 2000,
    })
    for (const element of elements) group.add(element, { layout: true })
    const move = (target: boolean) => {
        for (let i = 0; i < movers; i++) {
            elements[i]!.style.setProperty(
                'left',
                `${16 + (i % 8) * 44 + (target ? 8 : 0)}px`
            )
        }
    }
    const engine: number[] = []
    const floor: number[] = []
    const floorCommitSmall = () => {
        const before = elements.map((element) =>
            element.getBoundingClientRect()
        )
        move(true)
        const after = elements.map((element) => element.getBoundingClientRect())
        for (let i = 0; i < movers; i++) {
            readActiveStyles(elements[i]!, isWebKitEngine())
            elements[i]!.style.setProperty(
                'translate',
                `${before[i]!.left - after[i]!.left}px ${before[i]!.top - after[i]!.top}px`,
                'important'
            )
            elements[i]!.style.setProperty('scale', '1 1', 'important')
        }
        for (let i = 0; i < movers; i++) {
            elements[i]!.style.removeProperty('translate')
            elements[i]!.style.removeProperty('scale')
            elements[i]!.style.setProperty('left', '16px')
        }
        for (let i = 0; i < participants; i++) {
            elements[i]!.style.setProperty('left', `${16 + (i % 8) * 44}px`)
        }
    }
    for (let i = 0; i < 5; i++) {
        await nextFrame()
        group.update((() => move(i % 2 === 0)) as () => void)
        group.finish()
        floorCommitSmall()
    }
    for (let i = 0; i < 30; i++) {
        await nextFrame()
        const t0 = performance.now()
        group.update((() => move(i % 2 === 0)) as () => void)
        engine.push(performance.now() - t0)
        group.finish()
        floorCommitSmall()
        const f0 = performance.now()
        floorCommitSmall()
        floor.push(performance.now() - f0)
    }
    group.dispose()
    root.remove()
    return {
        scene,
        participants,
        movers,
        engine,
        floor,
        ratio: median(engine) / median(floor),
    }
}
