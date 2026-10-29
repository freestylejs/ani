/**
 * Shared page-side helpers for the P5b scenes: design tokens, author
 * timelines, read auditing and the commit/report recorder. The kit uses only
 * the public layout/core API and the harness recorder; it contains no solver.
 */

import type {
    LayoutGroup,
    LayoutReport,
    LayoutStats,
} from '@freestylejs/ani-layout'
import type { Box } from '../../oracle.ts'
import type { SceneTrace } from '../../types.ts'
import { type TraceBuilder, viewBox } from '../harness.ts'

export const FONT =
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif'

export const IOS_VIEWPORT = { width: 390, height: 844 } as const
export const SAFE_TOP = 47
export const SAFE_BOTTOM = 34

/** §1.3 spring tokens. */
export const SPRING = {
    card: { type: 'spring', duration: 0.55, bounce: 0.05 },
    photo: { type: 'spring', duration: 0.45, bounce: 0.0 },
    seg: { type: 'spring', duration: 0.35, bounce: 0.12 },
    acc: { type: 'spring', duration: 0.5, bounce: 0.06 },
    stack: { type: 'spring', duration: 0.55, bounce: 0.08 },
    island: { type: 'spring', duration: 0.5, bounce: 0.1 },
    insert: { type: 'spring', duration: 0.5, bounce: 0.05 },
    delete: { type: 'spring', duration: 0.45, bounce: 0.08 },
} as const

/** Author-layer timing curves (§1.3 exact coefficients). */
function cubic(
    x1: number,
    y1: number,
    x2: number,
    y2: number
): (x: number) => number {
    const at = (a: number, b: number, s: number): number => {
        const inv = 1 - s
        return 3 * inv * inv * s * a + 3 * inv * s * s * b + s * s * s
    }
    const derivative = (a: number, b: number, s: number): number => {
        const inv = 1 - s
        return 3 * inv * inv * a + 6 * inv * s * (b - a) + 3 * s * s * (1 - b)
    }
    return (x: number): number => {
        if (x <= 0) return 0
        if (x >= 1) return 1
        let low = 0
        let high = 1
        for (let i = 0; i < 32; i++) {
            const mid = (low + high) / 2
            if (at(x1, x2, mid) < x) low = mid
            else high = mid
        }
        let t = (low + high) / 2
        for (let i = 0; i < 4; i++) {
            const slope = derivative(x1, x2, t)
            if (Math.abs(slope) < 1e-9) break
            t -= (at(x1, x2, t) - x) / slope
            t = Math.min(1, Math.max(0, t))
        }
        return at(y1, y2, t)
    }
}

export const EASE_OUT = cubic(0, 0, 0.58, 1)
export const EASE_IN = cubic(0.42, 0, 1, 1)
export const LINEAR = (x: number): number => Math.min(1, Math.max(0, x))

export function ease(
    kind: 'linear' | 'ease-out' | 'ease-in'
): (x: number) => number {
    return kind === 'linear' ? LINEAR : kind === 'ease-in' ? EASE_IN : EASE_OUT
}

/** §5.3 perceptual progress `p(t) = s(t)/s(D)` for a spring lead. */
export function perceptual(duration: number, elapsed: number): number {
    if (elapsed <= 0) return 0
    if (elapsed >= duration) return 1
    const w = (2 * Math.PI) / duration
    const s = (t: number): number => 1 - (1 + w * t) * Math.exp(-w * t)
    return Math.min(1, Math.max(0, s(elapsed) / s(duration)))
}

/** Appends one stylesheet once; each scene owns a unique id. */
const installedStyles = new Set<string>()
export function styleOnce(id: string, css: string): void {
    if (installedStyles.has(id)) return
    installedStyles.add(id)
    const style = document.createElement('style')
    style.dataset.sceneStyle = id
    style.textContent = css
    document.head.append(style)
}

/** A fixed, hidden probe stage; the caller removes it after measuring. */
export function probeStage(css?: string): HTMLDivElement {
    const stage = document.createElement('div')
    stage.style.cssText = `position: fixed; inset: 0; width: 390px; height: 844px; overflow: hidden; visibility: hidden; pointer-events: none; ${css ?? ''}`
    document.body.append(stage)
    return stage
}

export function boxOf(element: Element): Box {
    return viewBox(element)
}

/**
 * The badge/disc animation used by S-STACK: the count plate scales about its
 * centre while the count text stays crisp at the authored size.
 */
export interface CountTimeline {
    from: number
    to: number
    start: number
    duration: number
    curve: 'linear' | 'ease-out' | 'ease-in'
}

export function timelineValue(track: CountTimeline, now: number): number {
    if (now <= track.start) return track.from
    if (track.duration <= 0) return track.to
    const p = (now - track.start) / (track.duration * 1000)
    return track.from + (track.to - track.from) * ease(track.curve)(p)
}

/** Rest-state style snapshots and boxes for a scene participant. */
export interface Participant {
    readonly key: string
    readonly element: HTMLElement
    readonly radius: boolean
    /** Captured before the engine writes anything. */
    readonly mount: SceneTrace['mounts'][string]
    readonly initial: Box
}

export function participant(
    builder: TraceBuilder,
    key: string,
    element: HTMLElement,
    radius: boolean,
    initial = true
): Participant {
    builder.mount(key, element)
    if (initial) builder.initial(key, element)
    return {
        key,
        element,
        radius,
        mount: builder.mounts[key]!,
        initial: builder.initialBoxes[key] ?? viewBox(element),
    }
}

export function connectedCount(
    keys: readonly string[],
    elements: ReadonlyMap<string, HTMLElement | null>
): number {
    let count = 0
    for (const key of keys) {
        const element = elements.get(key)
        if (element?.isConnected) count += 1
    }
    return count
}

export function radiusCaptureCount(
    keys: readonly string[],
    elements: ReadonlyMap<string, HTMLElement | null>,
    radiusKeys: ReadonlySet<string>
): number {
    let count = 0
    for (const key of keys) {
        if (!radiusKeys.has(key)) continue
        if (elements.get(key)?.isConnected) count += 1
    }
    return count
}

/**
 * The §4.3/§4.1 computed-read set of the engine for one flush:
 *   capture: one radius computed read per connected radius-on participant;
 *   flush: one style batch read per connected participant, plus WebKit's
 *   Typed OM `transform-origin` read where the reference box snaps.
 * Scenes whose surface pair needs an extra read declare it explicitly.
 */
export function expectedStyles(
    radiusCapture: number,
    nAfter: number,
    typedOM: boolean,
    extra = 0
): number {
    return radiusCapture + nAfter + (typedOM ? nAfter : 0) + extra
}

export interface ReadCounts {
    readonly rects: number
    readonly offsets: number
    readonly styles: number
    readonly typedOM: number
    /** Reads made by React's popLayout presence probe (not the layout engine). */
    readonly presenceRects: number
    readonly presenceStyles: number
}

/**
 * Instrumented DOM read audit. React's public adapter exposes no
 * `group.stats`, so React scenes count the engine's reads with the same DOM
 * primitives `stats` counts. Regions are explicit: the harness's own
 * observations are never counted.
 */
export class ReadAudit {
    private active = false
    private rects = 0
    private widths = 0
    private heights = 0
    private styles = 0
    private typedOM = 0
    private presenceRects = 0
    private presenceStyles = 0
    private installed = false
    private restore: (() => void)[] = []

    install(): void {
        if (this.installed) return
        this.installed = true
        const rect = Element.prototype.getBoundingClientRect
        Element.prototype.getBoundingClientRect = function (
            this: Element
        ): DOMRect {
            if (auditRef.active) {
                if (auditRef.inPresenceProbe()) auditRef.presenceRects += 1
                else auditRef.rects += 1
            }
            return rect.call(this)
        }
        for (const property of ['offsetWidth', 'offsetHeight'] as const) {
            const descriptor = Object.getOwnPropertyDescriptor(
                HTMLElement.prototype,
                property
            )
            if (!descriptor?.get) continue
            const get = descriptor.get
            Object.defineProperty(HTMLElement.prototype, property, {
                configurable: true,
                get(this: HTMLElement) {
                    if (auditRef.active) {
                        if (property === 'offsetWidth') auditRef.widths += 1
                        else auditRef.heights += 1
                    }
                    return get.call(this)
                },
            })
            this.restore.push(() =>
                Object.defineProperty(
                    HTMLElement.prototype,
                    property,
                    descriptor
                )
            )
        }
        const realGetComputedStyle = window.getComputedStyle.bind(window)
        window.getComputedStyle = ((
            element: Element,
            pseudo?: string | null
        ): CSSStyleDeclaration => {
            if (auditRef.active) {
                if (auditRef.inPresenceProbe()) auditRef.presenceStyles += 1
                else auditRef.styles += 1
            }
            return realGetComputedStyle(element, pseudo ?? undefined)
        }) as typeof window.getComputedStyle
        this.restore.push(() => {
            window.getComputedStyle = realGetComputedStyle
        })
        const map = Element.prototype.computedStyleMap
        if (typeof map === 'function') {
            Element.prototype.computedStyleMap = function (
                this: Element
            ): StylePropertyMapReadOnly {
                if (auditRef.active) auditRef.typedOM += 1
                return map.call(this)
            }
            this.restore.push(() => {
                Element.prototype.computedStyleMap = map
            })
        }
        this.restore.push(() => {
            Element.prototype.getBoundingClientRect = rect
        })
        auditRef = this
    }

    begin(): void {
        this.install()
        this.rects = 0
        this.widths = 0
        this.heights = 0
        this.styles = 0
        this.typedOM = 0
        this.presenceRects = 0
        this.presenceStyles = 0
        this.active = true
    }

    end(): ReadCounts {
        this.active = false
        return {
            rects: this.rects,
            offsets: Math.min(this.widths, this.heights),
            styles: this.styles,
            typedOM: this.typedOM,
            presenceRects: this.presenceRects,
            presenceStyles: this.presenceStyles,
        }
    }

    /**
     * Whether the read comes from React's `popBox`/`containsAbsolute`/`ownMap`
     * presence probe. Those functions are in the bundled presence module; the
     * layout engine never calls them. The classification is audited by the
     * presence counters recorded on every commit.
     */
    inPresenceProbe(): boolean {
        const stack = new Error().stack
        if (!stack) return false
        return (
            stack.includes('popBox') ||
            stack.includes('containsAbsolute') ||
            stack.includes('ownMap')
        )
    }

    dispose(): void {
        this.active = false
        for (const restore of this.restore.reverse()) restore()
        this.restore = []
        this.installed = false
    }
}

let auditRef = new ReadAudit()

export function installReadAudit(): ReadAudit {
    const audit = new ReadAudit()
    audit.install()
    return audit
}

export interface CommitOptions {
    readonly builder: TraceBuilder
    readonly keys: readonly string[]
    readonly elements: ReadonlyMap<string, HTMLElement | null>
    readonly frame: number
    readonly label: string
    readonly radiusKeys: ReadonlySet<string>
    readonly typedOM: boolean
    /** The engine commit itself. Called between the before/after counters. */
    readonly run: () => Promise<LayoutReport>
    /** Vanilla: the live `group.stats` getter, read on both sides of `run`. */
    readonly stats?: (() => LayoutStats) | undefined
    /** React: the audited read counts, begun and ended around `run`. */
    readonly audit?: ReadAudit | undefined
    /** Exact computed reads for this commit, when the default formula is not it. */
    readonly stylesExpected?: number | undefined
    /** The exact number of participants measured in the flush. */
    readonly activeFlush?: number | undefined
}

export interface CommitResult {
    readonly promise: Promise<LayoutReport>
    readonly radiusCapture: number
    readonly nBefore: number
    readonly nAfter: number
}

/**
 * Runs one commit, records the engine reads and the `t = 0` flush
 * observation. The caller has already positioned the script at the commit
 * frame and performs no clock frame between `run()` and the flush record.
 */
export function recordCommit(options: CommitOptions): CommitResult {
    const { builder, keys, elements, frame, label, radiusKeys, typedOM, run } =
        options
    const nBefore = connectedCount(keys, elements)
    const radiusCapture = radiusCaptureCount(keys, elements, radiusKeys)
    const diagBefore = builder.diagnostics.length
    const statsBefore = options.stats?.()
    const audit = options.audit
    audit?.begin()
    const promise = run()
    const auditCounts = audit?.end()
    const nAfter = connectedCount(keys, elements)
    let rects: number
    let offsets: number
    let styles: number
    let layoutOffsets = 0
    if (auditCounts) {
        rects = Math.max(0, auditCounts.rects - auditCounts.presenceRects)
        offsets = auditCounts.offsets
        styles = Math.max(
            0,
            auditCounts.styles +
                auditCounts.typedOM -
                auditCounts.presenceStyles
        )
    } else if (statsBefore && options.stats) {
        const statsAfter = options.stats()
        rects = statsAfter.rects - statsBefore.rects
        offsets = statsAfter.offsets - statsBefore.offsets
        styles = statsAfter.styles - statsBefore.styles
        layoutOffsets = statsAfter.layoutOffsets - statsBefore.layoutOffsets
    } else {
        throw new Error('recordCommit needs stats or an audit')
    }
    builder.commit({
        label,
        frame,
        nBefore,
        nAfter,
        rects,
        offsets,
        styles,
        layoutOffsets,
        probes:
            statsBefore && options.stats
                ? options.stats().probes - statsBefore.probes
                : 0,
        parents:
            statsBefore && options.stats
                ? options.stats().parents - statsBefore.parents
                : 0,
        frameReads: 0,
        frameReadsAt: null,
        diagnostics: [],
        onSnap: [],
        aged: builder.diagnostics
            .slice(diagBefore)
            .some((event) => event.code === 'capture-aged'),
        agedKeys: builder.diagnostics
            .slice(diagBefore)
            .filter((event) => event.code === 'capture-aged')
            .flatMap((event) => (event.key ? [event.key] : [])),
        stylesExpected:
            options.stylesExpected ??
            expectedStyles(radiusCapture, nAfter, typedOM),
        styleRadiusCapture: radiusCapture,
        styleActiveFlush: options.activeFlush ?? nAfter,
        ...(auditCounts
            ? {
                  presenceRects: auditCounts.presenceRects,
                  presenceStyles: auditCounts.presenceStyles,
              }
            : {}),
    })
    return { promise, radiusCapture, nBefore, nAfter }
}

export interface ReportTracker {
    readonly statuses: Map<string, string>
    readonly done: Map<string, boolean>
    track(
        label: string,
        promise: Promise<LayoutReport>,
        frame: () => number
    ): Promise<LayoutReport>
}

export function reportTracker(builder: TraceBuilder): ReportTracker {
    const statuses = new Map<string, string>()
    const done = new Map<string, boolean>()
    return {
        statuses,
        done,
        track(label, promise, frame) {
            void promise.then((report) => {
                statuses.set(label, report.status)
                done.set(label, true)
                builder.report({
                    label,
                    status: report.status,
                    snapped: report.snapped.map((snap) => ({
                        key: snap.element.dataset.p ?? 'unknown',
                        reason: snap.reason,
                    })),
                    settledFrame: frame(),
                })
            })
            return promise
        },
    }
}

export interface FrameOptions {
    readonly builder: TraceBuilder
    readonly group?: LayoutGroup | undefined
    readonly audit?: ReadAudit | undefined
    readonly clock: { readonly now: number }
    readonly stepMs: number
    /** Advances one manual frame. */
    readonly advance: () => void
    /** Author-layer update for the new clock time. */
    readonly author: (now: number) => void
}

export interface FrameCounter {
    frame: number
    step(): Promise<void>
}

/** One recorded manual frame, with steady-frame reads accounted. */
export function frameRunner(options: FrameOptions): FrameCounter {
    let frame = 0
    return {
        get frame() {
            return frame
        },
        set frame(value: number) {
            frame = value
        },
        async step() {
            const before = options.group?.stats
            if (options.audit) options.audit.begin()
            options.advance()
            const reads = options.audit
                ? options.audit.end()
                : before && options.group
                  ? {
                        rects: options.group.stats.rects - before.rects,
                        offsets: options.group.stats.offsets - before.offsets,
                        styles: options.group.stats.styles - before.styles,
                        typedOM: 0,
                    }
                  : null
            frame += 1
            if (reads) {
                const total = reads.rects + reads.offsets + reads.styles
                if (total > 0) {
                    options.builder.steadyFrameReads += total
                    options.builder.steadyFrameReadsAt ??= frame
                }
            }
            await Promise.resolve()
            options.author(options.clock.now)
            options.builder.record('frame', frame)
        },
    }
}

export function finalState(options: {
    readonly tracks: number
    readonly holds: number
    readonly clockPending: number
    readonly clockSize: number
    readonly connected: readonly string[]
    readonly diagnostics: readonly string[]
}): SceneTrace['final'] {
    return {
        tracks: options.tracks,
        holds: options.holds,
        clockPending: options.clockPending,
        clockSize: options.clockSize,
        connected: [...options.connected],
        diagnostics: [...options.diagnostics],
    }
}

/** The standard iOS status bar and home indicator (non-participants). */
export function statusBar(time = '9:41'): HTMLElement {
    const bar = document.createElement('div')
    bar.className = 'ios-status'
    bar.innerHTML = `<span class="ios-status-time">${time}</span><span class="ios-status-right"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="7" width="3" height="5" rx="0.7" fill="currentColor"/><rect x="4.5" y="5" width="3" height="7" rx="0.7" fill="currentColor"/><rect x="9" y="2.5" width="3" height="9.5" rx="0.7" fill="currentColor"/><rect x="13.5" y="0" width="3" height="12" rx="0.7" fill="currentColor"/></svg><svg width="25" height="12" viewBox="0 0 25 12" aria-hidden="true"><rect x="0.5" y="1" width="21" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-opacity="0.4"/><rect x="2" y="2.5" width="15" height="7" rx="1.3" fill="currentColor"/><path d="M23 4v4a2 2 0 0 0 0-4Z" fill="currentColor" fill-opacity="0.4"/></svg></span>`
    return bar
}

export function homeIndicator(): HTMLElement {
    const indicator = document.createElement('div')
    indicator.className = 'ios-home'
    return indicator
}

export const STATUS_CSS = `
    .ios-status {
        position: absolute; left: 0; top: 0; width: 390px; height: 47px;
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 28px; box-sizing: border-box; color: #000;
        font: 600 15px/20px ${FONT}; letter-spacing: -0.24px;
        z-index: 40; pointer-events: none;
    }
    .ios-status-right { display: flex; align-items: center; gap: 6px; }
    .ios-home {
        position: absolute; left: 128px; bottom: 8px; width: 134px; height: 5px;
        border-radius: 2.5px; background: rgba(0,0,0,0.85); z-index: 50;
        pointer-events: none;
    }
`
