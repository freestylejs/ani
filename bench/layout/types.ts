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
    /** Non-participant sample elements (e.g. an inner presence disc). */
    readonly samples: Readonly<Record<string, string>>
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
    /** Non-layout React presence reads excluded from the layout read gate. */
    readonly presenceRects?: number | undefined
    readonly presenceStyles?: number | undefined
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

export interface FrameReadDetail {
    readonly frame: number
    readonly rects: number
    readonly offsets: number
    readonly styles: number
    /** Live holds during this frame: the §5.10 allowed rect read count. */
    readonly holds: number
}

/** One held frame's presented box and engine reads (§5.10, G13). */
export interface HoldMoveEvidence {
    readonly frame: number
    readonly box: Box
    readonly rects: number
    readonly offsets: number
    readonly styles: number
    readonly holds: number
}

/** The drive-hold kill switch row (L-DRIVE-4 / §7.2). */
export interface KillSwitchEvidence {
    readonly state: string
    readonly holds: number
    readonly clockSize: number
    readonly clockPending: number
    readonly restored: boolean
    readonly diagnostics: readonly string[]
    readonly snaps: readonly string[]
}

/** One scripted hold's state-machine and held-read evidence. */
export interface HoldEvidence {
    readonly key: string
    readonly takeFrame: number
    readonly takeState: string
    readonly takeVelocity: { readonly x: number; readonly y: number }
    readonly takeBox: Box
    readonly holdsAtTake: number
    readonly moves: readonly HoldMoveEvidence[]
    readonly releaseFrame: number
    readonly releaseState: string
    readonly releaseVelocity: { readonly x: number; readonly y: number }
    /** The drawn box at the release flush: the first update is dt = 0. */
    readonly releaseBox: Box
    readonly holdsAtRelease: number
    readonly finalHolds: number
    readonly frames: number
    readonly killSwitch?: KillSwitchEvidence | undefined
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
    /** Per-frame read detail for held scenes (G13's held allowance). */
    readonly frameReads?: readonly FrameReadDetail[] | undefined
    /** Scripted drive holds and their state machine. */
    readonly holds?: readonly HoldEvidence[] | undefined
    /** Authored inline declarations captured before registration, per key. */
    readonly mounts: Readonly<Record<string, StyleSnapshot>>
    /** Boxes at rest before the first commit. */
    readonly initialBoxes: Readonly<Record<string, Box>>
    /** Engine-free layout-probe boxes for every post-commit rest state. */
    readonly aBoxes: Readonly<Record<string, Box>>
    /** Post-removal snapshots: before and after the engine remove. */
    readonly restorations?: readonly {
        readonly key: string
        readonly frame: number
        readonly before: StyleSnapshot
        readonly after: StyleSnapshot
    }[]
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

export interface HeldFrameProbe {
    readonly samples: readonly number[]
    readonly g: number
    /** The §5.10 held read: one rect per live hold, zero offsets/styles. */
    readonly reads: {
        readonly frames: number
        readonly rects: number
        readonly offsets: number
        readonly styles: number
        readonly holds: number
        readonly mismatches: number
    }
    readonly releaseClean: boolean
}

export interface RealTrace {
    readonly scene: string
    readonly mode: 'real'
    readonly g: number
    readonly gSource: 'reads' | 'tick-fallback'
    readonly frameCosts: readonly FrameCost[]
    readonly commits: readonly { readonly label: string; readonly at: number }[]
    readonly diagnostics: readonly string[]
    /** 600 real-clock held frames for the scene's own G12 row. */
    readonly held?: HeldFrameProbe | undefined
    readonly allowEmptyFinal?: boolean | undefined
    readonly final: {
        readonly tracks: number
        readonly holds: number
        readonly connected: number
    }
}

/* ───────────────────────── oracle plans ───────────────────────── */

export interface HoldPoint {
    readonly frame: number
    /** The held element's drawn top-left box at this frame. */
    readonly x: number
    readonly y: number
}

export interface HoldRider {
    readonly key: string
    readonly dx: number
    readonly dy: number
}

/**
 * A scripted direct-manipulation phase (§5.10). The held element and its
 * riders are expected at the finger position, not on a layout track; the
 * release commit's segments carry the spring from the last held box.
 */
export interface HoldPlan {
    readonly key: string
    readonly riders: readonly HoldRider[]
    readonly takeFrame: number
    /** The take box when it differs from the scene's initial box (a retake). */
    readonly takeBox?: Box | undefined
    readonly points: readonly HoldPoint[]
    readonly releaseFrame: number
    readonly releaseVelocity: { readonly x: number; readonly y: number }
}

export interface SegmentPlan {
    readonly key: string
    readonly kind: 'spring' | 'timing' | 'none'
    /** The post-commit rest box A (from the engine-free layout probe). */
    readonly to: Box
    /** G3 before-velocity override for a release from direct manipulation. */
    readonly velocityBefore?: Box | undefined
    /**
     * A release from a hold: the incoming velocity is carried, but the first
     * update is `dt = 0` (§5.10/§1.4), so the from-rest elapsed rule applies.
     */
    readonly holdRelease?: boolean | undefined
    /** The departing layer this new lead takes B and velocity from. */
    readonly handoffFrom?: string | undefined
    readonly motion?: Motion | undefined
    /**
     * Negative controls only: replaces the analytic incoming velocity, so G3
     * can be shown to fail on a deliberate velocity jump.
     */
    readonly velocityOverride?: Box | null | undefined
    /**
     * Author timeline starting at the commit (presence enter/exit or a
     * gesture layer): its first frame advances by dt instead of the
     * from-rest dt = 0 rule.
     */
    readonly startMoving?: boolean | undefined
    /**
     * A presence exit target relative to the presented box B: the entrance
     * starts at the lifted box and slides by this offset.
     */
    readonly toFromB?: { readonly dx: number; readonly dy: number } | undefined
    /** A presence exit is not a layout retarget; exclude it from G3. */
    readonly presenceExit?: boolean | undefined
}

export interface CommitPlan {
    readonly frame: number
    readonly label: string
    readonly segments: readonly SegmentPlan[]
    readonly expectedStatus: LayoutStatus
    readonly expectedSnapped?: readonly string[] | undefined
    /**
     * A release from a hold is a planned event with a flush observation but no
     * engine commit and no observable report (§5.10/§7.1). Default `commit`.
     */
    readonly kind?: 'commit' | 'release' | undefined
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

export interface PresenceOpacityTrack {
    readonly key: string
    readonly startFrame: number
    readonly from: number
    readonly to: number
    readonly durationMs: number
    readonly easing: 'linear' | 'ease-out' | 'ease-in'
}

/** An authored translate (a gesture layer), linear in frame time. */
export interface PresenceScaleTrack {
    readonly key: string
    readonly startFrame: number
    readonly from: number
    readonly to: number
    readonly durationMs: number
    readonly easing: 'linear' | 'ease-out' | 'ease-in'
}

/** An authored translate (a gesture layer), linear in frame time. */
export interface AuthoredTranslateTrack {
    readonly key: string
    readonly startFrame: number
    readonly endFrame: number
    readonly from: { readonly x: number; readonly y: number }
    readonly to: { readonly x: number; readonly y: number }
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
    readonly staticRadii?:
        | Readonly<Record<string, number | readonly number[]>>
        | undefined
    /** Participants whose author-owned inline style changes during the run. */
    readonly authorStyleKeys?: readonly string[] | undefined
    readonly expectedDiagnostics?: readonly string[] | undefined
    readonly expectedOnSnap?: readonly string[] | undefined
    /**
     * A participant removed together with a crossfade follower (its DOM
     * parent). The follower's removal proof covers the subtree; the harness
     * checks the follower's inert and does not read the descendant's
     * mid-exit pose as a restoration failure.
     */
    readonly removedWith?: Readonly<Record<string, string>> | undefined
    /** Removed keys whose post-removal restitution must be proven. */
    readonly requiredRestorations?: readonly string[] | undefined
    /** Inner presence scale samples (computed transform). */
    readonly presenceScale?: readonly PresenceScaleTrack[] | undefined
    /** Author opacity layers declared by the scene (presence/exit fades). */
    readonly presenceOpacity?: readonly PresenceOpacityTrack[] | undefined
    /** Authored gesture translations composed over the layout track. */
    readonly authoredTranslate?: readonly AuthoredTranslateTrack[] | undefined
    /** Drive holds; the held boxes replace the layout track while held. */
    readonly holds?: readonly HoldPlan[] | undefined
    /** The drive-hold kill switch row must be present and correct. */
    readonly expectedKillSwitch?: boolean | undefined
    /**
     * A scene whose script unmounts its only participant at the end. The
     * removal is proven by a post-removal restoration snapshot instead of a
     * final connected participant (S-SHEET).
     */
    readonly allowEmptyFinal?: boolean | undefined
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

export interface HeldShapeRun {
    readonly held: number
    /** Raw per-frame samples (600 frames). */
    readonly samples: readonly number[]
    readonly p95: number
    readonly perHeld: number
    readonly g: number
    /** G13: one rect per held element per frame, zero offsets/styles. */
    readonly reads: {
        readonly frames: number
        readonly rects: number
        readonly offsets: number
        readonly styles: number
        readonly holds: number
        readonly mismatches: number
    }
    /** Holds and tracks are zero after the release. */
    readonly releaseClean: boolean
}

export interface HeldShapes {
    readonly one: HeldShapeRun
    readonly ten: HeldShapeRun
}

export interface CostRun {
    readonly participants: number
    readonly poses: number
    readonly typedOM: boolean
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
    readonly held: HeldShapes
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
