import type {
    AnimationClockInterface,
    AnimationNode,
    Clock,
    GroupableRecord,
    ReducedMotionPolicy,
    Resolver,
    RunResult,
    TimingFunction,
} from '@freestylejs/ani-core'

/* ───────────────────────── Layout ───────────────────────── */

export interface LayoutMotion {
    /** Segment duration in seconds. Default: 0.35. */
    readonly duration?: number
    /** Core timing function. Springs are sampled to CSS `linear()`. */
    readonly timing?: TimingFunction
}

export type LayoutMode = 'position' | 'box'

export interface LayoutParticipantOptions {
    /** Default: 'position'. 'box' adds scale + radius correction; surfaces only. */
    readonly layout?: LayoutMode
    /** Shared identity within the layout root. */
    readonly layoutId?: string
}

export interface LayoutGroupOptions {
    readonly motion?: LayoutMotion
    /** Read for a synchronous reduced-motion decision. */
    readonly clock?: Pick<Clock, 'reducedMotion'>
    /** Default: 'jump'. Evaluated at play time. */
    readonly reducedMotion?: ReducedMotionPolicy
    /** CSS px per axis below which a box counts as unchanged. Default: 1. */
    readonly threshold?: number
    /** Visible movers per change. Above this the whole change snaps. Default: 300. */
    readonly maxAnimated?: number
    /** `box` nodes per change. Extras fall back to `position`. Default: 16. */
    readonly maxBoxes?: number
    readonly onError?: (error: unknown, element: HTMLElement) => void
}

export type LayoutResult =
    | 'ended'
    | 'no-change'
    | 'interrupted'
    | 'finished'
    | 'disposed'
    | 'stale'
    | 'yielded'
    | 'capped'
    | 'reduced'
    | 'unsupported'

declare const layoutSnapshot: unique symbol

/** Opaque, single-use. Expires at the first microtask after capture. */
export interface LayoutSnapshot {
    readonly [layoutSnapshot]: true
}

export interface LayoutGroup {
    /** Register a target. Returns an idempotent remove that restores owned styles. */
    add(element: HTMLElement, options?: LayoutParticipantOptions): () => void
    /** Update a participant's mode/id without remove/add churn. */
    set(element: HTMLElement, options: LayoutParticipantOptions): void
    /** capture → mutate() → play. `mutate` must be synchronous. */
    update(mutate: () => void, motion?: LayoutMotion): Promise<LayoutResult>
    /** Adapter interface. Read-only. */
    capture(): LayoutSnapshot
    /** Adapter interface. After mutation, before paint. */
    play(snapshot: LayoutSnapshot, motion?: LayoutMotion): Promise<LayoutResult>
    /** Jump the active run to the final layout and restore owned styles. */
    finish(): void
    readonly active: boolean
    dispose(): void
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
