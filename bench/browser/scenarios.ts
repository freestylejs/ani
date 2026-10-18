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
    onUpdate(
        callback: (payload: { state: StyleState; status: string }) => void
    ): () => void
    play(config: { from: StyleState; repeat: number }): void
    dispose(): void
}

export interface WaapiTimelineHandle {
    play(target: Element, config: { from: StyleState; repeat: number }): unknown
    reset(): void
}

/** The subset of the ANI module namespace the scenarios use. */
export interface AniRuntime {
    a: {
        ani(props: {
            to: StyleState
            duration: number
            timing: AniTimingFunction
        }): AniNode
        sequence(children: readonly AniNode[]): AniNode
        rafTimeline(node: AniNode): RafTimelineHandle
        webTimeline(node: AniNode): WaapiTimelineHandle
        timing: { linear(): AniTimingFunction }
    }
    createStyleSheet(state: StyleState): Record<string, unknown>
    applyStyleSheet(element: HTMLElement, style: Record<string, unknown>): void
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
    const { a, createStyleSheet, applyStyleSheet } = window.__ani
    const elements = window.__bench.build(n)
    const node = a.ani({
        to: { translateX: 200, opacity: 1 },
        duration: 2,
        timing: a.timing.linear(),
    })
    const startedAt = performance.now()
    const timelines = elements.map((element) => {
        const timeline = a.rafTimeline(node)
        timeline.onUpdate(({ state }) => {
            applyStyleSheet(element, createStyleSheet(state))
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

/** One `rafTimeline` whose update writes every element (future group). */
export const rafShared: ScenarioSetup = ({ n }) => {
    const { a, createStyleSheet, applyStyleSheet } = window.__ani
    const elements = window.__bench.build(n)
    const node = a.ani({
        to: { translateX: 200, opacity: 1 },
        duration: 2,
        timing: a.timing.linear(),
    })
    const timeline = a.rafTimeline(node)
    const startedAt = performance.now()
    timeline.onUpdate(({ state }) => {
        const style = createStyleSheet(state)
        for (const element of elements) applyStyleSheet(element, style)
    })
    timeline.play({ from: { translateX: 0, opacity: 0.2 }, repeat: Infinity })
    const setupMs = performance.now() - startedAt
    window.__bench.stops.push(() => timeline.dispose())
    return { setupMs }
}

/** One timeline per element over a 20-segment sequence (same total motion). */
export const rafDeep: ScenarioSetup = ({ n }) => {
    const { a, createStyleSheet, applyStyleSheet } = window.__ani
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
        timeline.onUpdate(({ state }) => {
            applyStyleSheet(element, createStyleSheet(state))
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

/** One `webTimeline` per element, played natively through WAAPI. */
export const waapi: ScenarioSetup = ({ n }) => {
    const { a } = window.__ani
    const elements = window.__bench.build(n)
    const node = a.ani({
        to: { translateX: 200, opacity: 1 },
        duration: 2,
        timing: a.timing.linear(),
    })
    const config = { from: { translateX: 0, opacity: 0.2 }, repeat: Infinity }
    const startedAt = performance.now()
    const timelines = elements.map((element) => {
        const timeline = a.webTimeline(node)
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
    const { a, createStyleSheet, applyStyleSheet } = window.__ani
    const elements = window.__bench.build(n)
    const node = a.ani({
        to: { translateX: 200, opacity: 1 },
        duration: 2,
        timing: a.timing.linear(),
    })
    const startedAt = performance.now()
    const timelines = elements.map((element) => {
        const timeline = a.rafTimeline(node)
        timeline.onUpdate(({ state }) => {
            // Reading forces a layout the V2 commit phase must remove.
            void element.offsetWidth
            applyStyleSheet(element, createStyleSheet(state))
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
]
