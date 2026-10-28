/** Page-side recording and timing helpers for the P5 layout bench. */

import type { Box } from '../oracle.ts'
import { granularity } from '../stats.ts'
import type {
    FrameCost,
    Observation,
    SceneTrace,
    StyleSnapshot,
} from '../types.ts'

export async function microtasks(turns = 5): Promise<void> {
    for (let i = 0; i < turns; i++) await Promise.resolve()
}

export function viewBox(element: Element): Box {
    const rect = element.getBoundingClientRect()
    return {
        x: rect.left,
        y: rect.top,
        w: rect.width,
        h: rect.height,
    }
}

export function styleSnapshot(element: HTMLElement): StyleSnapshot {
    return {
        translate: element.style.getPropertyValue('translate'),
        scale: element.style.getPropertyValue('scale'),
        radius: [
            element.style.getPropertyValue('border-top-left-radius'),
            element.style.getPropertyValue('border-top-right-radius'),
            element.style.getPropertyValue('border-bottom-right-radius'),
            element.style.getPropertyValue('border-bottom-left-radius'),
        ].join(' '),
        overflowAnchor: element.style.getPropertyValue('overflow-anchor'),
        inert: element.hasAttribute('inert')
            ? (element.getAttribute('inert') ?? '')
            : null,
        inline: element.getAttribute('style') ?? '',
    }
}

/** On-screen corner radii (x, y per corner) after the element's own scale. */
export function screenRadii(element: HTMLElement): number[] | null {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const width = Number.parseFloat(style.width)
    const height = Number.parseFloat(style.height)
    const layoutWidth =
        Number.isFinite(width) && width > 0 ? width : element.offsetWidth
    const layoutHeight =
        Number.isFinite(height) && height > 0 ? height : element.offsetHeight
    if (layoutWidth === 0 || layoutHeight === 0) return null
    const sx = rect.width / layoutWidth
    const sy = rect.height / layoutHeight
    return [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
    ].flatMap((value) => {
        const parts = value.split(' ')
        const resolve = (part: string, size: number) =>
            Number.parseFloat(part) * (part.includes('%') ? size / 100 : 1)
        const x = resolve(parts[0]!, layoutWidth)
        const y = resolve(parts[1] ?? parts[0]!, layoutHeight)
        return [x * sx, y * sy]
    })
}

export interface RecordOptions {
    readonly keys: readonly string[]
    readonly elements: ReadonlyMap<string, HTMLElement | null>
    readonly radii?: ReadonlySet<string> | undefined
    readonly font?: ReadonlySet<string> | undefined
    readonly activeKey?: string | null | undefined
}

export function observe(
    kind: 'frame' | 'flush',
    frame: number,
    now: number,
    options: RecordOptions,
    commitLabel?: string
): Observation {
    const connected: string[] = []
    const boxes: Record<string, Box | null> = {}
    const opacity: Record<string, number> = {}
    const radii: Record<string, readonly number[] | null> = {}
    const style: Record<string, StyleSnapshot> = {}
    const font: Record<string, string> = {}
    for (const key of options.keys) {
        const element = options.elements.get(key) ?? null
        if (!element || !element.isConnected) {
            boxes[key] = null
            continue
        }
        connected.push(key)
        boxes[key] = viewBox(element)
        const computed = getComputedStyle(element)
        opacity[key] = Number(computed.opacity)
        style[key] = styleSnapshot(element)
        if (options.radii?.has(key)) radii[key] = screenRadii(element)
        if (options.font?.has(key)) font[key] = computed.font
    }
    return {
        kind,
        frame,
        now,
        commitLabel,
        connected,
        boxes,
        opacity,
        radii,
        style,
        font,
        activeElementKey: options.activeKey ?? null,
    }
}

export function activeKey(
    elements: ReadonlyMap<string, HTMLElement | null>
): string | null {
    const active = document.activeElement
    if (!(active instanceof Node)) return null
    for (const [key, element] of elements) {
        if (element && element.isConnected && element.contains(active))
            return key
    }
    return null
}

/** §11.5 `g`: the smallest non-zero difference over 1,000 consecutive reads. */
export function measureGranularity(): number {
    const readings: number[] = []
    for (let i = 0; i < 1000; i++) readings.push(performance.now())
    const measured = granularity(readings)
    if (measured > 0) return measured
    // WebKit's performance.now ticks at 1 ms and 1,000 reads can finish inside
    // one tick. Observe the next tick directly; the §11.5 sampler must see the
    // real resolution, not an optimistic zero.
    const start = performance.now()
    let now = start
    while (now === start) now = performance.now()
    return Math.max(now - start, 0.001)
}

export interface RafSampler {
    readonly frames: FrameCost[]
    markCommit(): void
    /** Script work done between frames is charged to the next frame sample. */
    addScript(ms: number): void
    stop(): void
}

/**
 * Aggregates the duration of every rAF callback into one sample per animation
 * frame (same rAF timestamp). A commit that happens in a task between frames
 * marks the next frame; a commit inside a callback marks that callback's frame.
 */
export function installRafSampler(): RafSampler {
    const original = window.requestAnimationFrame.bind(window)
    const frames: FrameCost[] = []
    let batchTimestamp: number | null = null
    let batchMs = 0
    let batchCommit = false
    let pendingCommit = false
    let pendingScript = 0
    let stopped = false

    const flushBatch = () => {
        if (batchTimestamp === null) return
        frames.push({
            at: batchTimestamp,
            ms: batchMs + pendingScript,
            commit: batchCommit || pendingCommit,
        })
        pendingCommit = false
        pendingScript = 0
        batchTimestamp = null
        batchMs = 0
        batchCommit = false
    }

    const wrapped = (callback: FrameRequestCallback): number =>
        original((timestamp) => {
            if (stopped) return
            if (batchTimestamp !== null && timestamp !== batchTimestamp)
                flushBatch()
            batchTimestamp = timestamp
            const start = performance.now()
            try {
                callback(timestamp)
            } finally {
                batchMs += performance.now() - start
            }
        })

    window.requestAnimationFrame = wrapped
    return {
        frames,
        markCommit() {
            batchCommit = true
            pendingCommit = true
        },
        addScript(ms: number) {
            pendingScript += ms
        },
        stop() {
            flushBatch()
            stopped = true
            window.requestAnimationFrame = original
        },
    }
}

export function nextFrame(): Promise<number> {
    return new Promise((resolve) => {
        window.requestAnimationFrame((timestamp) => resolve(timestamp))
    })
}

export async function waitUntil(target: number): Promise<void> {
    for (;;) {
        const now = performance.now()
        if (now >= target) return
        await new Promise<void>((resolve) =>
            window.setTimeout(resolve, Math.min(8, Math.max(1, target - now)))
        )
    }
}

export async function waitMs(ms: number): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export interface TraceBuilderOptions {
    readonly scene: string
    readonly stepMs: number
    readonly keys: readonly string[]
    readonly elements: ReadonlyMap<string, HTMLElement | null>
    readonly radii?: ReadonlySet<string>
    readonly font?: ReadonlySet<string>
    readonly clock: { readonly now: number }
}

export class TraceBuilder {
    readonly observations: Observation[] = []
    readonly commits: SceneTrace['commits'][number][] = []
    readonly reports: SceneTrace['reports'][number][] = []
    readonly diagnostics: SceneTrace['diagnostics'][number][] = []
    readonly onSnap: SceneTrace['onSnap'][number][] = []
    readonly settleFrames: number[] = []
    steadyFrameReads = 0
    steadyFrameReadsAt: number | null = null
    readonly mounts: Record<string, StyleSnapshot> = {}
    readonly initialBoxes: Record<string, Box> = {}
    readonly aBoxes: Record<string, Box> = {}
    private readonly options: TraceBuilderOptions

    constructor(options: TraceBuilderOptions) {
        this.options = options
    }

    mount(key: string, element: HTMLElement): void {
        this.mounts[key] = styleSnapshot(element)
    }

    initial(key: string, element: Element): void {
        this.initialBoxes[key] = viewBox(element)
    }

    aBox(key: string, box: Box): void {
        this.aBoxes[key] = box
    }

    record(
        kind: 'frame' | 'flush',
        frame: number,
        commitLabel?: string
    ): Observation {
        const observation = observe(
            kind,
            frame,
            this.options.clock.now,
            {
                keys: this.options.keys,
                elements: this.options.elements,
                radii: this.options.radii,
                font: this.options.font,
                activeKey: activeKey(this.options.elements),
            },
            commitLabel
        )
        this.observations.push(observation)
        return observation
    }

    commit(entry: SceneTrace['commits'][number]): void {
        this.commits.push(entry)
    }

    report(entry: SceneTrace['reports'][number]): void {
        this.reports.push(entry)
    }

    diagnostic(
        code: string,
        action: string,
        frame: number,
        key: string | null
    ): void {
        this.diagnostics.push({ code, action, frame, key })
    }

    snap(key: string, reason: string, frame: number): void {
        this.onSnap.push({ key, reason, frame })
    }

    build(final: SceneTrace['final']): SceneTrace {
        return {
            scene: this.options.scene,
            mode: 'manual',
            stepMs: this.options.stepMs,
            observations: this.observations,
            commits: this.commits,
            reports: this.reports,
            diagnostics: this.diagnostics,
            onSnap: this.onSnap,
            settleFrames: this.settleFrames,
            steadyFrameReads: this.steadyFrameReads,
            steadyFrameReadsAt: this.steadyFrameReadsAt,
            mounts: this.mounts,
            initialBoxes: this.initialBoxes,
            aBoxes: this.aBoxes,
            final,
        }
    }
}
