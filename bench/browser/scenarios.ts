import type { FrameSample } from './stats.ts'

/**
 * Browser-side benchmark harness and scenarios.
 *
 * These functions never run in Node: `run.ts` serializes them with
 * `page.evaluate`, so each function is self-contained and its body is kept to
 * plain JavaScript (only the exported binding carries types).
 */

/** Shape of the animated state used by every scenario. */
export interface StyleState {
    translateX: number
    opacity: number
}

interface AniNode {
    readonly type?: string
}

interface AniTimingFunction {
    readonly stateful?: boolean
}

export interface RafTimelineHandle {
    bind(target: HTMLElement): () => void
    onUpdate(
        callback: (payload: { state: StyleState; status: string }) => void
    ): () => void
    play(config: { from: StyleState; repeat: number }): void
    dispose(): void
}

export interface RafGroupHandle {
    bindAt(index: number, target: HTMLElement): () => void
    play(config: { from: StyleState; count: number; repeat: number }): unknown
    dispose(): void
}

export interface WaapiTimelineHandle {
    play(target: Element, config: { from: StyleState; repeat: number }): unknown
    reset(): void
}

/** The subset of the ANI module namespace the scenarios use. */
export interface AniRuntime {
    ani(props: {
        to: StyleState
        duration: number
        timing: AniTimingFunction
    }): AniNode
    sequence(children: readonly AniNode[]): AniNode
    rafTimeline(node: AniNode): RafTimelineHandle
    rafGroup(node: AniNode): RafGroupHandle
    waapiTimeline(node: AniNode): WaapiTimelineHandle
    timing: { linear(): AniTimingFunction }
    defaultClock: { read(fn: () => void): void }
}

/** State shared inside the page between scenario setup and teardown. */
export interface BenchHarness {
    stops: Array<() => void>
    build(n: number): HTMLDivElement[]
}

declare global {
    interface Window {
        __ani: AniRuntime
        __bench: BenchHarness
        __perf: { reset(): void; snapshot(): FrameSample }
        __aniReady?: boolean
    }
}

export interface ScenarioArgs {
    n: number
}

export interface ScenarioResult {
    setupMs: number
}

export type ScenarioSetup = (args: ScenarioArgs) => ScenarioResult

export type ScenarioName =
    | 'raf-timelines'
    | 'raf-shared'
    | 'raf-deep'
    | 'waapi'
    | 'raf-thrash'
    | 'raf-group'
    | 'raf-read'

export interface ScenarioDefinition {
    name: ScenarioName
    setup: ScenarioSetup
}

/** Installs the in-page harness (`__bench`) before a scenario runs. */
export const installBench: () => void = () => {
    const build = (n) => {
        const fragment = document.createDocumentFragment()
        const elements = []
        for (let i = 0; i < n; i++) {
            const element = document.createElement('div')
            element.style.position = 'absolute'
            element.style.width = '10px'
            element.style.height = '10px'
            element.style.left = '0'
            element.style.top = `${(i % 64) * 12}px`
            fragment.appendChild(element)
            elements.push(element)
        }
        document.body.appendChild(fragment)
        return elements
    }
    window.__bench = { stops: [], build }
}

/** Clears the recorded warm-up samples before the measured window. */
export const resetPerf: () => void = () => {
    window.__perf.reset()
}

/** Returns the samples recorded since the last {@link resetPerf}. */
export const readPerf: () => FrameSample = () => window.__perf.snapshot()

/** Disposes every timeline created by the last scenario setup. */
export const stopAll: () => void = () => {
    const stops = window.__bench.stops
    window.__bench.stops = []
    for (const stop of stops) stop()
}

/** One `rafTimeline` per element (today's pattern). */
export const rafTimelines: ScenarioSetup = ({ n }) => {
    const a = window.__ani
    const elements = window.__bench.build(n)
    const node = a.ani({
        to: { translateX: 200, opacity: 1 },
        duration: 2,
        timing: a.timing.linear(),
    })
    const startedAt = performance.now()
    const timelines = elements.map((element) => {
        const timeline = a.rafTimeline(node)
        timeline.bind(element)
        timeline.play({
            from: { translateX: 0, opacity: 0.2 },
            repeat: Infinity,
        })
        return timeline
    })
    const setupMs = performance.now() - startedAt
    window.__bench.stops.push(() => {
        for (const timeline of timelines) timeline.dispose()
    })
    return { setupMs }
}

/** One `rafTimeline` whose update writes every element (future group). */
export const rafShared: ScenarioSetup = ({ n }) => {
    const a = window.__ani
    const elements = window.__bench.build(n)
    const node = a.ani({
        to: { translateX: 200, opacity: 1 },
        duration: 2,
        timing: a.timing.linear(),
    })
    const timeline = a.rafTimeline(node)
    const startedAt = performance.now()
    for (const element of elements) timeline.bind(element)
    timeline.play({ from: { translateX: 0, opacity: 0.2 }, repeat: Infinity })
    const setupMs = performance.now() - startedAt
    window.__bench.stops.push(() => timeline.dispose())
    return { setupMs }
}

/** One timeline per element over a 20-segment sequence (same total motion). */
export const rafDeep: ScenarioSetup = ({ n }) => {
    const a = window.__ani
    const elements = window.__bench.build(n)
    const segmentCount = 20
    const segments = []
    for (let i = 1; i <= segmentCount; i++) {
        segments.push(
            a.ani({
                to: {
                    translateX: (200 * i) / segmentCount,
                    opacity: 0.2 + (0.8 * i) / segmentCount,
                },
                duration: 2 / segmentCount,
                timing: a.timing.linear(),
            })
        )
    }
    const node = a.sequence(segments)
    const startedAt = performance.now()
    const timelines = elements.map((element) => {
        const timeline = a.rafTimeline(node)
        timeline.bind(element)
        timeline.play({
            from: { translateX: 0, opacity: 0.2 },
            repeat: Infinity,
        })
        return timeline
    })
    const setupMs = performance.now() - startedAt
    window.__bench.stops.push(() => {
        for (const timeline of timelines) timeline.dispose()
    })
    return { setupMs }
}

/** One `waapiTimeline` per element, played natively through WAAPI. */
export const waapi: ScenarioSetup = ({ n }) => {
    const a = window.__ani
    const elements = window.__bench.build(n)
    const node = a.ani({
        to: { translateX: 200, opacity: 1 },
        duration: 2,
        timing: a.timing.linear(),
    })
    const config = { from: { translateX: 0, opacity: 0.2 }, repeat: Infinity }
    const startedAt = performance.now()
    const timelines = elements.map((element) => {
        const timeline = a.waapiTimeline(node)
        timeline.play(element, config)
        return timeline
    })
    const setupMs = performance.now() - startedAt
    window.__bench.stops.push(() => {
        for (const timeline of timelines) timeline.reset()
    })
    return { setupMs }
}

/** Like `raf-timelines`, but every update forces a synchronous layout. */
export const rafThrash: ScenarioSetup = ({ n }) => {
    const a = window.__ani
    const elements = window.__bench.build(n)
    const node = a.ani({
        to: { translateX: 200, opacity: 1 },
        duration: 2,
        timing: a.timing.linear(),
    })
    const startedAt = performance.now()
    const timelines = elements.map((element) => {
        const timeline = a.rafTimeline(node)
        timeline.bind(element)
        timeline.onUpdate(() => {
            // The bound write is already pending: reading forces a layout
            // the V2 commit phase must remove.
            void element.offsetWidth
        })
        timeline.play({
            from: { translateX: 0, opacity: 0.2 },
            repeat: Infinity,
        })
        return timeline
    })
    const setupMs = performance.now() - startedAt
    window.__bench.stops.push(() => {
        for (const timeline of timelines) timeline.dispose()
    })
    return { setupMs }
}

/** One `rafGroup` drives all N elements, each bound with `bindAt(i, el)`. */
export const rafGroup: ScenarioSetup = ({ n }) => {
    const a = window.__ani
    const elements = window.__bench.build(n)
    const node = a.ani({
        to: { translateX: 200, opacity: 1 },
        duration: 2,
        timing: a.timing.linear(),
    })
    const startedAt = performance.now()
    const group = a.rafGroup(node)
    elements.forEach((element, index) => {
        group.bindAt(index, element)
    })
    group.play({
        from: { translateX: 0, opacity: 0.2 },
        count: n,
        repeat: Infinity,
    })
    const setupMs = performance.now() - startedAt
    window.__bench.stops.push(() => group.dispose())
    return { setupMs }
}

/** Like `raf-timelines`, but every update reads layout in the read phase. */
export const rafRead: ScenarioSetup = ({ n }) => {
    const a = window.__ani
    const clock = a.defaultClock
    const elements = window.__bench.build(n)
    const node = a.ani({
        to: { translateX: 200, opacity: 1 },
        duration: 2,
        timing: a.timing.linear(),
    })
    const startedAt = performance.now()
    const timelines = elements.map((element) => {
        const timeline = a.rafTimeline(node)
        timeline.bind(element)
        timeline.onUpdate(() => {
            // Queued for the read phase of the next frame, before any write.
            clock.read(() => {
                void element.offsetWidth
            })
        })
        timeline.play({
            from: { translateX: 0, opacity: 0.2 },
            repeat: Infinity,
        })
        return timeline
    })
    const setupMs = performance.now() - startedAt
    window.__bench.stops.push(() => {
        for (const timeline of timelines) timeline.dispose()
    })
    return { setupMs }
}

/** Every scenario, in report order. */
export const SCENARIOS: readonly ScenarioDefinition[] = [
    { name: 'raf-timelines', setup: rafTimelines },
    { name: 'raf-shared', setup: rafShared },
    { name: 'raf-deep', setup: rafDeep },
    { name: 'waapi', setup: waapi },
    { name: 'raf-thrash', setup: rafThrash },
    { name: 'raf-group', setup: rafGroup },
    { name: 'raf-read', setup: rafRead },
]
