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
import type { SnapReason } from './plan'

/* ───────────────────────── Layout ───────────────────────── */

export type {
    LayoutAnchor,
    LayoutMode,
    LayoutMotion,
    LayoutOptions,
} from './motion'
export type { SnapReason } from './plan'

export interface LayoutGroupOptions {
    /** Default: `defaultClock`. Its `reducedMotion` is read at every flush. */
    readonly clock?: Clock
    /** Defaults for every participant's `motion`, merged field by field. */
    readonly motion?: LayoutMotion
    /** Default: `'jump'`. */
    readonly reducedMotion?: ReducedMotionPolicy
    /** Px a box must move to animate. Default: 1. */
    readonly threshold?: number
    /** Visible movers per flush; above it the whole flush snaps. Default: 300. */
    readonly maxNodes?: number
    /** Seconds a removed `layoutId` lead's box stays available for a handoff. Default: 1. */
    readonly retain?: number
    readonly onSnap?: (element: HTMLElement, reason: SnapReason) => void
}

export type LayoutStatus =
    | 'ended'
    | 'interrupted'
    | 'no-change'
    | 'reduced'
    | 'capped'
    | 'stale'
    | 'disposed'

export interface LayoutReport {
    readonly status: LayoutStatus
    readonly snapped: readonly {
        readonly element: HTMLElement
        readonly reason: SnapReason
    }[]
}

export interface LayoutGroup {
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
    /** Every track jumps to its end and settles. */
    finish(): void
    /** Cancels every track, restores every owned style, releases presence holds. */
    dispose(): void
    readonly stats: {
        readonly captures: number
        readonly reads: number
        readonly tracks: number
    }
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
