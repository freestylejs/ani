import type {
    AnimationClockInterface,
    AnimationNode,
    Clock,
    GroupableRecord,
    ReducedMotionPolicy,
    Resolver,
    RunResult,
} from '@freestylejs/ani-core'
import type { LayoutMotion, LayoutOptions } from './motion'
import type { LayoutStatus, SnapReason } from './plan'

/* ───────────────────────── Layout ───────────────────────── */

export type {
    LayoutAnchor,
    LayoutMode,
    LayoutMotion,
    LayoutOptions,
} from './motion'
export type { LayoutStatus, SnapReason } from './plan'

/* ───────────────────── Drive seam (§5.10) ───────────────────── */

/**
 * View-space CSS px (per second for a velocity). The gesture layer declares a
 * structurally identical port and imports no layout type.
 */
export interface LayoutDriveVector {
    readonly x: number
    readonly y: number
}

export type LayoutDriveState = 'held' | 'released' | 'cancelled' | 'invalidated'

/**
 * One held element. `velocity` is the drawn origin velocity at the take, in
 * px/s, so a caught moving element has no jump; `move` places the drawn
 * origin at the take point plus `offset`; `release` hands the element back
 * with that incoming velocity exactly once; `cancel` is `release` with zero
 * velocity. Terminal calls are idempotent.
 */
export interface LayoutDriveHandle {
    readonly state: LayoutDriveState
    readonly velocity: LayoutDriveVector
    move(offset: LayoutDriveVector): void
    release(velocity?: LayoutDriveVector): void
    cancel(): void
}

/** The layout side of direct manipulation. Precise gesture mechanics are the gesture layer's. */
export interface LayoutDrive {
    take(element: HTMLElement): LayoutDriveHandle
}

export interface LayoutGroupOptions {
    /** Default: `defaultClock`. Its `reducedMotion` is read at every flush. */
    readonly clock?: Clock
    /** Defaults for every participant's `motion`, merged by kind (§5.1). */
    readonly motion?: LayoutMotion
    /** Default: `'jump'`. */
    readonly reducedMotion?: ReducedMotionPolicy
    /** Px a box must move to animate. Default: 1. */
    readonly threshold?: number
    /** Visible movers per flush; above it the whole flush snaps. Default: 300. */
    readonly maxNodes?: number
    /** Connected participants; above it capture and flush read nothing. Default: 2000. */
    readonly maxParticipants?: number
    /** Seconds a removed `layoutId` lead's box stays available for a handoff. Default: 1. */
    readonly retain?: number
    readonly onSnap?: (element: HTMLElement, reason: SnapReason) => void
    /**
     * Default: `'raf'`, every track on the clock.
     *
     * `'waapi'` runs each track as one compositor `translate` animation, smooth
     * while the main thread is blocked. It never falls back silently:
     * - every participant must set `layout: 'position'` and must not set
     *   `layoutAnchor`, `layoutId` or `radius: true`, or `add`/`set` throws
     *   `ANI_INVALID_OPTIONS`;
     * - a participant inside another throws at `add`/`set`; a nesting that
     *   appears later in the DOM snaps as `'unsupported'`;
     * - without CSS `linear()` easing every element snaps as `'unsupported'`.
     *
     * Unlike `'raf'`: a retarget starts from the drawn box at rest (no
     * velocity); tracks run on the document timeline, so the clock's time
     * scale does not apply (its reduced motion still does); a retarget during
     * main-thread jank can step back by the frames the main thread missed; no
     * inline style is written.
     */
    readonly engine?: 'raf' | 'waapi'
}

export interface LayoutReport {
    readonly status: LayoutStatus
    readonly snapped: readonly {
        readonly element: HTMLElement
        readonly reason: SnapReason
    }[]
}

/** Every read the engine made, by kind, and what runs now (§7.1). */
export interface LayoutStats {
    readonly captures: number
    /** `rects + offsets + styles`. */
    readonly reads: number
    /** `getBoundingClientRect()` calls. */
    readonly rects: number
    /** `offsetWidth`/`offsetHeight` pairs. */
    readonly offsets: number
    /** Computed-style reads. */
    readonly styles: number
    /** Anchoring probes (§11.4 S2): one write, one reflow, one `scrollTop` read each. */
    readonly probes: number
    /** `offsetParent` reads of the viewport-fixed test (§5.8). */
    readonly parents: number
    /** Running tracks. */
    readonly tracks: number
    /** Live drive holds (§5.10). */
    readonly holds: number
}

export interface LayoutGroup extends LayoutDrive {
    /** Registers a participant. Returns an idempotent remove that restores its owned styles. */
    add(element: HTMLElement, options?: LayoutOptions): () => void
    /** Replaces a participant's options. */
    set(element: HTMLElement, options: LayoutOptions): void
    /** Reads the before-boxes; reused within the task, re-read in a later one. */
    capture(): void
    /** Reads the after-boxes, plans and starts the run. Never rejects. */
    flush(): Promise<LayoutReport>
    /** `capture()` → `mutate()` → `flush()`. A throwing `mutate` discards the capture and rethrows. */
    update(mutate: () => void): Promise<LayoutReport>
    /** Takes a participant as held direct manipulation (§5.10). */
    take(element: HTMLElement): LayoutDriveHandle
    /** Every track jumps to its end and settles. */
    finish(): void
    /** Cancels every track, restores every owned style, releases presence holds. */
    dispose(): void
    readonly stats: LayoutStats
}

/* ─────────────────── Runtime and diagnostics (§7.2) ─────────────────── */

export type LayoutDiagnosticCode =
    | 'capture-less-flush'
    | 'capture-aged'
    | 'measurement-unsupported'
    | 'unsupported-geometry'
    | 'handoff-scroll-active'
    | 'spring-timeout'
    | 'participant-cap'
    | 'mover-cap'
    | 'document-mismatch'
    | 'runtime-disabled'
    | 'focus-in-follower'
    | 'callback-error'
    | 'internal-error'
    // codes may be added; existing meanings are stable
    | (string & Record<never, never>)

export type LayoutDiagnosticAction =
    | 'none'
    | 'snap'
    | 'enter'
    | 'finish'
    | 'abort'

export interface LayoutDiagnosticMetrics {
    readonly participants: number
    readonly rectReads: number
    readonly styleReads: number
    readonly springSettleMs: number | null
}

export interface LayoutDiagnostic {
    readonly version: 1
    readonly code: LayoutDiagnosticCode
    /** Stable per scope for the page's lifetime. */
    readonly scope: number
    readonly run: number | null
    readonly engine: 'raf' | 'waapi'
    readonly action: LayoutDiagnosticAction
    readonly element?: HTMLElement
    readonly reason?: SnapReason
    readonly metrics: LayoutDiagnosticMetrics
    readonly error?: unknown
}

export interface LayoutRuntime {
    readonly mode: 'animate' | 'snap'
    /** Takes effect synchronously in every explicit and implicit scope. */
    setMode(mode: 'animate' | 'snap'): void
    onDiagnostic(listener: (event: LayoutDiagnostic) => void): () => void
}

/* ─────────────────────── Presence state ─────────────────────── */

export type PresenceKey = string | number

export interface PresenceEntry<T> {
    readonly key: PresenceKey
    readonly item: T
    readonly present: boolean
    readonly token: number
}

export interface PresenceMotion<G extends GroupableRecord> {
    /** Resting values. The exit `from` when no enter ran. Never written on mount. */
    readonly present: G
    /** Required exit animation. */
    readonly exit: AnimationNode<G>
    /** First-mount enter and re-entry. Default: a fast jump to `present`. */
    readonly enter?: AnimationNode<G>
    /** `from` of the first enter. Default: `present`. */
    readonly initial?: G
}

export interface PresenceOptions {
    readonly clock?: AnimationClockInterface
    readonly reducedMotion?: ReducedMotionPolicy
    readonly resolver?: Resolver<Record<string, number>>
    /** Wall-clock watchdog. Default: exit duration + 1s; 10s if endless. */
    readonly maxExitMs?: number
}

export type PresenceExitResult =
    | 'exited'
    | 'timeout'
    | 'interrupted'
    | 'disposed'

export interface PresenceHandle {
    readonly phase: 'present' | 'entering' | 'exiting' | 'exited'
    enter(): Promise<RunResult>
    exit(): Promise<PresenceExitResult>
    dispose(): void
}

/* ─────────────────── View Transitions ─────────────────── */

export interface ViewTransitionOptions {
    /** Layout ids to morph. Only these get names, only for this transition. */
    readonly share?: Iterable<string>
    /** Applied when ViewTransition.prototype.types exists. */
    readonly types?: readonly string[]
    /** Retimes UA group/old/new animations; clamped to [0.1, 0.5]s. */
    readonly motion?: LayoutMotion
    /** Default: 'jump'. */
    readonly reducedMotion?: ReducedMotionPolicy
    readonly clock?: Pick<Clock, 'reducedMotion'>
}

export type ViewTransitionResult =
    | 'finished'
    | 'skipped'
    | 'interrupted'
    | 'yielded'
    | 'unsupported'
    | 'reduced'
