/** Shared data types of the P5 layout bench (page-side traces, Node-side plan). */
import type { Box, Motion } from './oracle.ts'

export type LayoutStatus =
    | 'failed'
    | 'disposed'
    | 'disabled'
    | 'capped'
    | 'interrupted'
    | 'ended'
    | 'reduced'
    | 'stale'
    | 'no-change'

export interface StyleSnapshot {
    /** Inline `translate` value (empty when absent). */
    readonly translate: string
    readonly translatePriority: string
    /** Inline `scale` value. */
    readonly scale: string
    readonly scalePriority: string
    /** Inline `border-radius` longhand as serialized by the browser. */
    readonly radius: string
    readonly radiusPriority: string
    /** Inline `overflow-anchor`. */
    readonly overflowAnchor: string
    readonly overflowAnchorPriority: string
    /** `inert` attribute value, or null when absent. */
    readonly inert: string | null
    /** The full inline style attribute, for evidence. */
    readonly inline: string
}

export interface Observation {
    readonly kind: 'frame' | 'flush'
    readonly frame: number
    /** Manual clock time in ms. */
    readonly now: number
    /** Label of the commit whose flush produced this observation. */
    readonly commitLabel?: string | undefined
    readonly connected: readonly string[]
    readonly boxes: Readonly<Record<string, Box | null>>
    readonly opacity: Readonly<Record<string, number>>
    readonly radii: Readonly<Record<string, readonly number[] | null>>
    readonly style: Readonly<Record<string, StyleSnapshot>>
    readonly font: Readonly<Record<string, string>>
    /** Participant key containing document.activeElement, or null. */
    readonly activeElementKey: string | null
}

export interface CommitObservation {
    readonly label: string
    readonly frame: number
    /** Connected participants before and after the mutation. */
    readonly nBefore: number
    readonly nAfter: number
    /** `group.stats` deltas around update(): capture + flush. */
    readonly rects: number
    readonly offsets: number
    readonly styles: number
    readonly probes: number
    readonly parents: number
    /** Largest `stats.reads` delta observed after any frame since the last commit. */
    readonly frameReads: number
    readonly frameReadsAt: number | null
    readonly diagnostics: readonly {
        readonly code: string
        readonly action: string
        readonly key: string | null
    }[]
    readonly onSnap: readonly {
        readonly key: string
        readonly reason: string
    }[]
    /** A `capture-aged` diagnostic was emitted by this commit. */
    readonly aged: boolean
    /** Participants named by the aged diagnostic (empty = element-less). */
    readonly agedKeys: readonly string[]
    /** Exact §4.1 radius capture + §4.3 active-node computed reads, plus the
     * Typed OM transform-origin read where the engine's probe requires it. */
    readonly stylesExpected: number
    readonly styleRadiusCapture: number
    readonly styleActiveFlush: number
}

export interface ReportObservation {
    readonly label: string
    readonly status: LayoutStatus
    readonly snapped: readonly {
        readonly key: string
        readonly reason: string
    }[]
    /** The manual-clock frame at which the report resolved, if known. */
    readonly settledFrame: number | null
}

export interface SceneTrace {
    readonly scene: string
    readonly mode: 'manual'
    readonly stepMs: number
    readonly observations: readonly Observation[]
    readonly commits: readonly CommitObservation[]
    readonly reports: readonly ReportObservation[]
    readonly diagnostics: readonly {
        readonly code: string
        readonly action: string
        readonly frame: number
        readonly key: string | null
    }[]
    readonly onSnap: readonly {
        readonly key: string
        readonly reason: string
        readonly frame: number
    }[]
    readonly settleFrames: readonly number[]
    /** Engine reads made by frames outside commits (§11.5 G13). */
    readonly steadyFrameReads: number
    readonly steadyFrameReadsAt: number | null
    /** Authored inline declarations captured before registration, per key. */
    readonly mounts: Readonly<Record<string, StyleSnapshot>>
    /** Boxes at rest before the first commit. */
    readonly initialBoxes: Readonly<Record<string, Box>>
    /** Engine-free layout-probe boxes for every post-commit rest state. */
    readonly aBoxes: Readonly<Record<string, Box>>
    readonly final: {
        readonly tracks: number
        readonly holds: number
        readonly clockPending: number
        readonly clockSize: number
        readonly connected: readonly string[]
        readonly diagnostics: readonly string[]
    }
}

export interface FrameCost {
    /** Animation-frame timestamp (ms). */
    readonly at: number
    /** Total script time of every rAF callback in this frame (ms). */
    readonly ms: number
    /** Whether a commit ran in this frame. */
    readonly commit: boolean
}

export interface RealTrace {
    readonly scene: string
    readonly mode: 'real'
    readonly g: number
    readonly gSource: 'reads' | 'tick-fallback'
    readonly frameCosts: readonly FrameCost[]
    readonly commits: readonly { readonly label: string; readonly at: number }[]
    readonly diagnostics: readonly string[]
    readonly final: {
        readonly tracks: number
        readonly holds: number
        readonly connected: number
    }
}

/* ───────────────────────── oracle plans ───────────────────────── */

export interface SegmentPlan {
    readonly key: string
    readonly kind: 'spring' | 'timing' | 'none'
    /** The post-commit rest box A (from the engine-free layout probe). */
    readonly to: Box
    /** The departing layer this new lead takes B and velocity from. */
    readonly handoffFrom?: string | undefined
    readonly motion?: Motion | undefined
    /**
     * Negative controls only: replaces the analytic incoming velocity, so G3
     * can be shown to fail on a deliberate velocity jump.
     */
    readonly velocityOverride?: Box | null | undefined
}

export interface CommitPlan {
    readonly frame: number
    readonly label: string
    readonly segments: readonly SegmentPlan[]
    readonly expectedStatus: LayoutStatus
    readonly expectedSnapped?: readonly string[] | undefined
}

export interface PairPlan {
    readonly id: string
    readonly startFrame: number
    readonly lead: string
    readonly follower: string
    readonly radiusFrom?: number | undefined
    readonly radiusTo?: number | undefined
    readonly reversal?: boolean | undefined
}

export interface RestorationCheck {
    readonly key: string
    readonly frame: number
    readonly label: string
    /** Declarations to compare; all owned declarations when omitted. */
    readonly declarations?:
        | readonly (
              | 'translate'
              | 'scale'
              | 'border-radius'
              | 'overflow-anchor'
              | 'inert'
          )[]
        | undefined
}

export interface SceneCompleteness {
    readonly requiredObservations: number
    readonly requiredCommits: number
    readonly requiredReports: number
    readonly requiredSettleFrames: number
    readonly requiredKeys: readonly string[]
    readonly requiredPairs: number
    readonly requiredStaticRadii: readonly string[]
    readonly requiredMetrics: readonly string[]
    readonly requiredShape: readonly string[]
    readonly requiredOpacityKeys: readonly string[]
    readonly requiredRadiiKeys: readonly string[]
    readonly requiredFontKeys: readonly string[]
}

export interface AuthorStyleKeys {
    readonly keys: readonly string[]
}

export interface ScenePlan {
    readonly scene: string
    readonly stepMs: number
    readonly completeness: SceneCompleteness
    readonly initial: Readonly<Record<string, Box>>
    readonly mounts: Readonly<Record<string, StyleSnapshot>>
    readonly commits: readonly CommitPlan[]
    readonly settleFrames: readonly number[]
    readonly restorationChecks: readonly RestorationCheck[]
    readonly pairs: readonly PairPlan[]
    readonly staticRadii?: Readonly<Record<string, number>> | undefined
    /** Participants whose author-owned inline style changes during the run. */
    readonly authorStyleKeys?: readonly string[] | undefined
    readonly expectedDiagnostics?: readonly string[] | undefined
    readonly expectedOnSnap?: readonly string[] | undefined
}

/* ───────────────────────── cost shapes ───────────────────────── */

export interface CostCommitSample {
    readonly rects: number
    readonly offsets: number
    readonly styles: number
    readonly probes: number
    readonly parents: number
    readonly frameReads: number
}

export interface CostRun {
    readonly participants: number
    readonly poses: number
    readonly typedOM: boolean
    readonly heldPending: boolean
    readonly engine: readonly number[]
    readonly floor: readonly number[]
    readonly engineSamples: readonly CostCommitSample[]
    readonly engineAudit: {
        readonly rects: number
        readonly offsets: number
        readonly styleReads: number
        readonly poseWrites: number
    }
    readonly floorAudit: {
        readonly captureRects: number
        readonly captureOffsets: number
        readonly flushRects: number
        readonly flushOffsets: number
        readonly styleReads: number
        readonly poseWrites: number
        readonly extraReads: number
    }
    readonly steadyFrameReads: number
}

export interface CostTrace {
    readonly mode: 'cost'
    readonly g: number
    readonly gSource: 'reads' | 'tick-fallback'
    readonly typedOM: boolean
    readonly heldPending: boolean
    readonly unscrolled: CostRun
    readonly scrolled: CostRun
    readonly steady: {
        readonly costs: readonly number[]
        readonly g: number
        readonly refreshHz: number
    }
    readonly sustained: {
        /** One performance.now() pair around each 60 Hz commit. */
        readonly commitCosts: readonly number[]
        /** rAF frame costs; diagnostic only when the refresh is below 60 Hz. */
        readonly frameCosts: readonly number[]
        readonly g: number
        readonly commits: number
        readonly refreshHz: number
        readonly durationMs: number
        readonly commitHz: number
    }
    readonly exactReads: readonly {
        readonly label: string
        readonly rects: number
        readonly offsets: number
        readonly nBefore: number
        readonly nAfter: number
        readonly frameReads: number
        readonly styles: number
    }[]
    readonly held: { readonly pending: 'P4' }
}

export interface FloorAuditTrace {
    readonly participants: number
    readonly poses: number
    readonly typedOM: boolean
    readonly captureRects: number
    readonly captureOffsets: number
    readonly flushRects: number
    readonly flushOffsets: number
    readonly styleReads: number
    readonly poseWrites: number
    readonly extraReads: number
}
