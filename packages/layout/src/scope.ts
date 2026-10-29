/**
 * The layout scope: registry, capture epochs, flush, runs and lifecycle
 * (§4, §5.5, §5.6, §9). The public `LayoutGroup`.
 */
import { type Clock, DEV, defaultClock } from '@freestylejs/ani-core'
import {
    ANCHOR_PROPERTY,
    adoptAuthored,
    animatedOwned,
    borderSize,
    containsFlat,
    type FlatTree,
    flatParent,
    flatTree,
    isShadowRoot,
    type KnownRoots,
    type Len,
    type Measured,
    measure,
    OPACITY_PROPERTIES,
    OWNED_PRIORITY,
    ownedAnimationIn,
    POSE_PROPERTIES,
    put,
    RADIUS_PROPERTIES,
    readRadius,
    readTransform,
    replacedOwned,
    resolveLen,
    type Saved,
    type SavedInert,
    save,
    saveInert,
    viewportBox,
    viewportFixed,
    viewRect,
} from './dom'
import { layoutFault } from './fault'
import {
    hasDOM,
    knownTransformAnchoring,
    probeTransformAnchoring,
    snapsReferenceBox,
    supportsLinearEasing,
} from './feature'
import {
    aboutOrigin,
    type Box,
    carry,
    compose,
    composeMoving,
    IDENTITY_MAP,
    invert,
    invertMoving,
    type Map2,
    type MovingMap,
    mapBox,
    movingOnto,
    ownMap,
    type Pose,
    STILL_IDENTITY,
    still,
    unmapOwn,
    usedOrigin,
} from './geometry'
import {
    type AxisScale,
    type KeepAncestor,
    type KeepPath,
    keepPath,
    type PresentedNode,
    presentedLayoutBoxes,
    presentedVelocities,
    type ScreenBoundInput,
    type SupportNode,
    screenBound,
    staleReported,
    supportCheck,
    translationExact,
} from './measure'
import {
    assertKeys,
    clampMotion,
    invalidOptions,
    type LayoutMotion,
    type LayoutOptions,
    type Motion,
    ownsRadius,
    resolveMotion,
    sameTrackOptions,
    validateLayoutOptions,
    validateMotion,
    validateMotionLayers,
    validateReducedMotion,
} from './motion'
import {
    type Action,
    type IdHistory,
    type LayoutStatus,
    leadChanges,
    moved,
    type PlanNode,
    plan,
    resolveLayoutStatus,
    type SnapReason,
} from './plan'
import { exitingPresence, type PresenceLink, presenceOf } from './presence_link'
import { createRaf } from './realize/raf'
import { elapsedOf, play } from './realize/waapi'
import {
    emitDiagnostic,
    hasDiagnosticListeners,
    layoutRuntime,
    nextLayoutRunId,
    nextLayoutScopeId,
    noteDiagnosticBuilt,
    registerRuntimeScope,
    reportCallbackError,
} from './runtime'
import {
    type AnchorPath,
    type BoxVelocity,
    createTrack,
    drawnBoxes,
    drawnRates,
    type Fade,
    fadeOpacity,
    INSTANT_LAW,
    type Layer,
    movingParents,
    poseMotion,
    type RadiusBlend,
    type Solved,
    type SolveNode,
    solve,
    type Track,
    type TrackLaw,
    trackEnded,
    trackEndTime,
    trackOrigin,
    trackSize,
    ZERO_VELOCITY,
} from './solve'
import type {
    LayoutDiagnostic,
    LayoutDiagnosticAction,
    LayoutDiagnosticCode,
    LayoutDriveHandle,
    LayoutDriveState,
    LayoutDriveVector,
    LayoutGroup,
    LayoutGroupOptions,
    LayoutReport,
} from './types'

const DEFAULT_THRESHOLD = 1
const DEFAULT_MAX_NODES = 300
/** The owned declarations of a drive with no extra property. */
const POSE_ONLY: readonly string[] = POSE_PROPERTIES
const DEFAULT_MAX_PARTICIPANTS = 2000
const DEFAULT_RETAIN = 1
const MIN_SCALE = 1 / 50
const MAX_SCALE = 50
/** Why a node fails the support check (§4.2). */
const UNOWNED_MAP =
    'a map the engine does not own (a scaled, rotated or skewed ancestor that is not a participant, 3D, or CSS zoom)'
const IDENTITY_POSE: Pose = { tx: 0, ty: 0, sx: 1, sy: 1 }
/** One hold-specific size tolerance, in view-space px (§5.10, P4 corrective). */
const HOLD_SIZE_TOL = 0.5
/** The origin channels' landing/settle tolerance, in px. */
const HOLD_ORIGIN_TOL = 0.01
/** The live scope that owns each registered element (§5.10 concurrency). */
const elementScopes = new WeakMap<Element, object>()

interface Authored {
    readonly tx: number
    readonly ty: number
    readonly sx: number
    readonly sy: number
}

/** A participant's frame of reference, frozen at a flush (§3.1). */
interface Geometry {
    /** Visual box at rest. */
    readonly a: Box
    /** `X = Q(L)` in the local frame. */
    readonly box: Box
    /** Transform origin, local frame. */
    readonly ox: number
    readonly oy: number
    /** Inner map `Q`, local frame. */
    readonly inner: Map2
    /** View-space map at rest: the parent's rest map ∘ `Q` (`a = rest(L)`). */
    readonly rest: Map2
    /** Origin as fractions of the CSS box. */
    readonly fx: number
    readonly fy: number
    readonly authored: Authored
    /** Corner radii at A in px (x/y per corner), when `radius: true`. */
    readonly radius: readonly number[] | null
    /** Authored radius lengths whose percentages resolve against this flush's CSS box. */
    readonly radiusSource: readonly Len[] | null
    /** The presence part of the computed `transform` at this flush. */
    readonly matrix: Measured['matrix']
    readonly unsupported: string | null
}

interface DriveFade {
    readonly role: 'lead' | 'follower'
    /** This layer's opacity at the start (§5.6). */
    readonly from: number
    elapsed: number
    /** Its first clock update has happened (independent of the track's). */
    started: boolean
    /** The lead track's law (§5.8). */
    readonly law: TrackLaw
}

/**
 * The frame a kept pose timeline was drawn in (§5.7 path 1, §4.4): the nodes
 * its pose depends on, as they stood at the flush that kept it, each with its
 * own clock. It is solved for poses only and writes nothing.
 */
interface Ghost {
    /** Parents first; `elapsed` and `posed` are filled in when solved. */
    readonly nodes: readonly SolveNode[]
    /** Per node, the pose timeline it was itself drawn with, if any. */
    readonly timelines: readonly (Timeline | null)[]
    readonly elapsed: number[]
    readonly started: boolean[]
    /** The poses solved at `tick`. */
    solved: {
        readonly tick: number
        readonly pose: (i: number) => MovingMap
    } | null
}

/**
 * A kept pose timeline: the node's own pose as a function of time, with its
 * rate, read from the ghost of the frame it was drawn in (§5.7 path 1).
 */
interface Timeline {
    readonly ghost: Ghost
    readonly at: number
    /** The node's origin in the ghost's frame: the pose is about it. */
    readonly ox: number
    readonly oy: number
    /** The ghost nodes its pose depends on: itself, its ancestors, their leads. */
    readonly deps: readonly number[]
    /** `finish()`: the pose is identity. */
    done: boolean
}

interface Drive {
    kind: 'track' | 'static' | 'follow' | 'held'
    track: Track | null
    /**
     * Kept by §5.7 path 1 or §4.4 under a participant ancestor: the pose
     * timeline it writes, in place of `track` (which keeps its targets).
     */
    timeline: Timeline | null
    /** The A its track runs to. */
    target: Box | null
    elapsed: number
    /**
     * Its time runs: every clock update advances it. A track from rest
     * starts unstarted, so its first update has `dt = 0` (§4.3).
     */
    started: boolean
    fade: DriveFade | null
    /** On-screen radii mixed across a shared handoff (§5.7). */
    radiusBlend: Pick<RadiusBlend, 'from' | 'to'> | null
    lead: Participant | null
    readonly saved: Saved
    readonly authored: Authored
    /** Authored corner-radius lengths frozen while layout owns their declarations. */
    radius: readonly Len[] | null
    /** The reduced-motion mode its track was planned under. */
    mode: string
    run: Run | null
    release: (() => void) | null
    /** Last written value per owned property. */
    readonly written: Map<string, string>
    /** The authored `inert` attribute it owns (§6), or `null`. */
    inert: SavedInert | null
}

interface Participant {
    readonly element: HTMLElement
    options: LayoutOptions
    readonly order: number
    changed: boolean
    /** `layoutKey` changed since the previous flush (§4.7). */
    keyChanged: boolean
    /** `layoutDependency` at the previous flush, when given. */
    dependency: { readonly value: unknown } | null
    /** Visual box at rest at the previous flush. */
    lastBox: Box | null
    drive: Drive | null
    /** A live direct-manipulation hold on this element (§5.10). */
    hold: DriveHold | null
    /** The held ancestor whose inherited displacement this participant rides (§5.10). */
    ride: DriveHold | null
    /** Geometry from the last flush that measured it. */
    geometry: Geometry | null
    /** Nearest participant ancestor at the last flush. */
    parent: Participant | null
    removed: boolean
    /** Resolved motion for a reduced-motion mode, until its options change. */
    motion: { readonly mode: string; readonly value: Motion } | null
    /** Every shadow root containing it, innermost first (§4.6, §8). */
    roots: ShadowRoot[]
    /** The tree pass that last computed its depth (one pass, no maps). */
    treePass: number
    treeDepth: number
    treeParent: Participant | null
    treeFlat: HTMLElement | null
    /** Its index in the current frame, or -1 when it has no drive. */
    frameIndex: number
    /** Reusable frame node for this participant (one allocation per drive). */
    frameNode: FrameNode | null
    /** Reused plan input (one allocation per participant). */
    planNode: Mutable<PlanNode> | null
}

/**
 * One drive hold (§5.10). It is an orthogonal field on the node, not a new
 * motion kind: the drive keeps owning `translate`/`scale`; the hold replaces
 * the held node's origin channels while its size channels keep their track.
 */
interface DriveHold {
    handle: LayoutDriveHandle
    readonly owner: Participant
    state: LayoutDriveState
    /** H = take point + offset, view-space CSS px (§5.10). */
    hx: number
    hy: number
    /** The take point, view-space CSS px. */
    readonly takeX: number
    readonly takeY: number
    /** The drawn origin velocity at take (px/s), also `handle.velocity`. */
    readonly velocity: LayoutDriveVector
    /** The last measured screen shift (scroll, sticky, toolbars) for the held read. */
    shiftX: number
    shiftY: number
    /** The last solved drawn box, view space (the frame the shift is measured against). */
    lastDrawn: Box | null
    /** The element's layout offset at the last geometry read. */
    layoutLeft: number
    layoutTop: number
    /** The held node's size continuation: its own track, or `null` for a constant size. */
    sizeTrack: Track | null
    sizeElapsed: number
    sizeStarted: boolean
    /** Current size channels and their velocities, in view space. */
    sizeW: number
    sizeH: number
    sizeVW: number
    sizeVH: number
    /** A flush updated A's size while the node was held. */
    sizeTargetW: number
    sizeTargetH: number
    /** The release origin path; its size channels are unused (the size continuation is). */
    releaseTrack: Track | null
    /** The release origin's own clock, independent of the drive and the size. */
    releaseElapsed: number
    releaseStarted: boolean
    /** The A the release origin is aimed at (may move on a flush). */
    releaseTarget: Box | null
    /** The reduced-motion mode the release origin was planned under. */
    releaseMode: string
    /** `h` at the last flush, to re-express residual tracks in a new view space. */
    lastHX: number
    lastHY: number
    /** Every descendant participant riding this hold's h. */
    readonly rides: Set<Participant>
    /** Why a held read failed, when it did: a diagnostic, then invalidation. */
    invalidReason: 'unsupported' | null
    /** A development warning was printed for a `move` after a terminal state. */
    warnedMove: boolean
    /** Reused per-frame override object (one allocation per hold). */
    override: { box: Mutable<Box>; velocity: Mutable<Box> } | null
    /** Removes the held-frame animation watchers (P4-C7). */
    animationCleanup: (() => void) | null
}

/** A released/cancelled landing caught again by `take` (P4-C1). */
interface RetakeState {
    readonly takeX: number
    readonly takeY: number
    readonly velocity: LayoutDriveVector
    readonly sizeTrack: Track | null
    readonly sizeElapsed: number
    readonly sizeStarted: boolean
    readonly sizeW: number
    readonly sizeH: number
    readonly sizeVW: number
    readonly sizeVH: number
    readonly sizeTargetW: number
    readonly sizeTargetH: number
    readonly drawn: ReadonlyMap<Participant, Box>
    readonly rates: ReadonlyMap<Participant, BoxVelocity>
    readonly tracked: ReadonlySet<Participant>
}

/** A hold whose direct manipulation or landing is still live (§5.10). */
function isLiveHold(hold: DriveHold | null | undefined): hold is DriveHold {
    return (
        hold !== null &&
        hold !== undefined &&
        (hold.state === 'held' ||
            hold.state === 'released' ||
            hold.state === 'cancelled')
    )
}

interface Run {
    readonly id: number
    /** Nodes still animating in the run. */
    readonly nodes: Set<Participant>
    /** Every node that ever joined it (for a failed report). */
    readonly all: Set<Participant>
    readonly snapped: LayoutReport['snapped']
    readonly resolve: (report: LayoutReport) => void
    done: boolean
    resolved: boolean
    /** A terminal status waiting for the transaction's commit. */
    pending: {
        readonly status: LayoutStatus
        readonly snapped: LayoutReport['snapped']
    } | null
}

/** The engine's own state at an instant: what its last writes describe (§4.1). */
interface EngineState {
    /** Per frame node, the pose the engine last wrote (identity where it wrote none). */
    readonly poses: Map<Participant, Pose>
    /** Per frame node, its analytic drawn-box velocity. */
    readonly rates: Map<Participant, BoxVelocity>
    /** Per frame node, the time derivative of the pose it last wrote. */
    readonly poseRates: Map<Participant, Pose>
    /** Nodes whose own track is moving (running, past its delay). */
    readonly moving: Set<Participant>
}

/** One capture (§4.1): what was presented at `t_k`, read in one batch. */
interface Capture {
    /** The task stamp: reused while true, re-read in a later task. */
    live: boolean
    /** A rendering opportunity passed (or it began in a frame): it supplies no B. */
    aged: boolean
    /** Connected participants exceeded `maxParticipants`: it holds no reads (§9.1). */
    readonly capped: boolean
    /** Releases the frame marker, if it has not fired. */
    disarm: () => void
    /** B per connected participant: the raw rect, nothing divided out. */
    readonly rects: Map<Participant, Box>
    /** Registration order at capture; later mounts are in `added`. */
    readonly registeredThrough: number
    /** Participants registered after capture that were given a B by captureAdded. */
    readonly added: Set<Participant>
    /** Participants that failed the support check, with their subtrees. */
    readonly unsupported: Map<Participant, string>
    /** Shared `radius` participants' on-screen corner radii at B. */
    readonly radius: Map<Participant, readonly number[]>
    /** The engine's state at `t_k`. */
    readonly engine: EngineState
    /**
     * The inputs of a support pass that found no failure: the same participant
     * order, parents, rect sizes, layout sizes and poses. A flush that finds
     * every one byte-identical reuses the pass instead of recomputing it; any
     * change (or a capture that found a failure) runs the check again.
     */
    support: {
        readonly list: readonly Participant[]
        readonly parents: readonly number[]
        readonly rects: readonly Box[]
        readonly offsets: readonly (readonly [number, number])[]
        readonly poses: ReadonlyMap<Participant, Pose>
        /** The pass made no computed-style read (no verification, no exact size). */
        readonly readFree: boolean
    } | null
    /** Per participant, the actively scrolling containers it was inside (§5.8). */
    readonly scrolling: ReadonlyMap<Participant, readonly EventTarget[]>
    /** Per connected participant, its flat parent at capture (§5.8 reparents). */
    readonly flat: ReadonlyMap<Participant, HTMLElement | null>
    /** The participant-tree pass this capture walked, for the flush to reuse. */
    readonly tree: ParticipantTree | null
}

type Matrix = Geometry['matrix']
type Mutable<T> = { -readonly [K in keyof T]: T[K] }
const IDENTITY_MATRIX: Matrix = { a: 1, d: 1, e: 0, f: 0 }

/**
 * One check's computed styles (`styleReader`): `has` is true once read, and
 * `transform` classifies a node's computed transforms once per check.
 */
type StyleReader = ((i: number) => CSSStyleDeclaration) & {
    readonly has: (i: number) => boolean
    readonly transform: (i: number) => ReturnType<typeof readTransform>
}

interface FrameNode {
    readonly p: Participant
    parent: number
    geometry: Geometry
    /**
     * The presence matrices of its participant ancestors at the flush that
     * planned `geometry`: its track lives in that flush's visual space, so a
     * layer changed since then draws over it (§3.1, §11).
     */
    ancestry: ReadonlyMap<Participant, Matrix>
    /** Reused per-node solve input/output objects (one allocation per drive). */
    solveNode: SolveNode | null
    solved: Solved | null
}

/** One participant-tree pass (§4.6): the list, its parents and flat parents. */
interface ParticipantTree {
    readonly list: Participant[]
    readonly parents: number[]
    readonly index: Map<Participant, number>
    /** Each participant's flat parent, by its index in `list`. */
    readonly flat: (HTMLElement | null)[]
    readonly tree: FlatTree
}

const NO_ANCESTRY: ReadonlyMap<Participant, Matrix> = new Map()
const NO_FLAT: ReadonlyMap<Participant, HTMLElement | null> = new Map()

function sameMatrix(a: Matrix, b: Matrix): boolean {
    return a.a === b.a && a.d === b.d && a.e === b.e && a.f === b.f
}

function isIdentityMap(m: Map2): boolean {
    return (
        m === IDENTITY_MAP ||
        (m.x.k === 1 && m.x.b === 0 && m.y.k === 1 && m.y.b === 0)
    )
}

/** The inner map `Q` (§3.2) as a pose: authored translate/scale with a presence matrix. */
function innerPose(au: Authored, m: Matrix): Pose {
    return {
        tx: au.tx + au.sx * m.e,
        ty: au.ty + au.sy * m.f,
        sx: au.sx * m.a,
        sy: au.sy * m.d,
    }
}

/** The inner map `Q` (§3.2) about the origin. */
function innerOf(au: Authored, m: Matrix, ox: number, oy: number): Map2 {
    return aboutOrigin(innerPose(au, m), ox, oy)
}

/**
 * A kept track re-expressed by `δ` (§5.7 path 2): its B and A origin
 * channels move, its shape, timing, seeds, size channels and anchor offset
 * (relative to the parent's anchor point) stay.
 */
function translated(track: Track, dx: number, dy: number): Track {
    const [bx, by, bw, bh] = track.b
    const [ax, ay, aw, ah] = track.a
    return {
        ...track,
        b: [bx + dx, by + dy, bw, bh],
        a: [ax + dx, ay + dy, aw, ah],
    }
}

/**
 * A kept top-level track in a new flush's geometry (§5.7): the same pose
 * timeline about the new origin, so every pose it writes is the one it would
 * have written, and it lands on the new A.
 *
 * With the pose `x ↦ o + t + s·(x − o)` and `q` the box's point at the track's
 * fractions, a channel is `c = o + t + s·(q − o)` and a size `c_w = s·w`. In
 * the new geometry `c′ = c + Δo + c_w·Δ(q − o)/w` and `c′_w = c_w·w′/w`: a
 * linear map of the channels, which every law carries exactly (its path is
 * linear in the endpoints and the seed).
 */
function rebased(track: Track, was: Geometry, now: Geometry): Track {
    const axis = (
        o: number,
        q: number,
        w: number,
        o2: number,
        q2: number,
        w2: number
    ) => {
        if (!(w > 0)) return { shift: o2 - o, mix: 0, scale: 1 }
        return { shift: o2 - o, mix: (q2 - o2 - (q - o)) / w, scale: w2 / w }
    }
    const fx = track.fx
    const fy = track.fy
    const x = axis(
        was.ox,
        was.box.x + fx * was.box.w,
        was.box.w,
        now.ox,
        now.box.x + fx * now.box.w,
        now.box.w
    )
    const y = axis(
        was.oy,
        was.box.y + fy * was.box.h,
        was.box.h,
        now.oy,
        now.box.y + fy * now.box.h,
        now.box.h
    )
    const map = (c: Track['b'], shift: number): Track['b'] => [
        c[0] + x.shift * shift + x.mix * c[2],
        c[1] + y.shift * shift + y.mix * c[3],
        c[2] * x.scale,
        c[3] * y.scale,
    ]
    return {
        ...track,
        b: map(track.b, 1),
        a: map(track.a, 1),
        // the seed is the law's velocity term: no constant part
        seed: map(track.seed, 0),
    }
}

/**
 * A pose map about the origin `from` re-expressed about `to`: the same
 * translate and scale (`x ↦ o + t + s·(x − o)`), with its rate.
 */
function aboutNewOrigin(m: MovingMap, dx: number, dy: number): MovingMap {
    return {
        map: {
            x: { k: m.map.x.k, b: m.map.x.b + dx * (1 - m.map.x.k) },
            y: { k: m.map.y.k, b: m.map.y.b + dy * (1 - m.map.y.k) },
        },
        rate: {
            x: { k: m.rate.x.k, b: m.rate.x.b - dx * m.rate.x.k },
            y: { k: m.rate.y.k, b: m.rate.y.b - dy * m.rate.y.k },
        },
    }
}

/** The ghosts a timeline's pose is read from, its own and the ones they need. */
function collectGhosts(timeline: Timeline, into: Set<Ghost>): void {
    if (into.has(timeline.ghost)) return
    into.add(timeline.ghost)
    for (const t of timeline.ghost.timelines) if (t) collectGhosts(t, into)
}

/** The pose timeline has reached identity: every node it depends on is at rest. */
function timelineEnded(timeline: Timeline): boolean {
    if (timeline.done) return true
    const ghost = timeline.ghost
    return timeline.deps.every((j) => {
        const own = ghost.timelines[j]
        if (own) return timelineEnded(own)
        const track = ghost.nodes[j]!.track
        return track === null || trackEnded(track, ghost.elapsed[j]!)
    })
}

/** The pose a timeline writes at `tick`, about the node's origin `(ox, oy)` now. */
function timelinePose(
    timeline: Timeline,
    tick: number,
    ox: number,
    oy: number
): MovingMap {
    if (timelineEnded(timeline)) return STILL_IDENTITY
    const ghost = timeline.ghost
    if (ghost.solved?.tick !== tick) {
        const nodes = ghost.nodes.map((node, j) => {
            const own = ghost.timelines[j]
            return {
                ...node,
                elapsed: ghost.elapsed[j]!,
                track: own ? null : node.track,
                posed: own ? timelinePose(own, tick, node.ox, node.oy) : null,
            }
        })
        ghost.solved = { tick, pose: poseMotion(nodes) }
    }
    return aboutNewOrigin(
        ghost.solved.pose(timeline.at),
        ox - timeline.ox,
        oy - timeline.oy
    )
}

/** A drive whose own motion still runs: a track before its end, or a timeline. */
function runs(d: Drive | null): boolean {
    if (d?.kind !== 'track') return false
    if (d.timeline) return !timelineEnded(d.timeline)
    return d.track !== null && !trackEnded(d.track, d.elapsed)
}

/**
 * The second space-separated component of a declaration layout wrote, as
 * `split(' ')[1]` parses it, without the array; `undefined` when there is
 * none.
 */
function secondComponent(value: string): number | undefined {
    const space = value.indexOf(' ')
    if (space < 0) return undefined
    const next = value.indexOf(' ', space + 1)
    return Number.parseFloat(
        next < 0 ? value.slice(space + 1) : value.slice(space + 1, next)
    )
}

/** The pose last written to a node: its own declarations, read back exactly. */
function writtenPose(d: Drive | null): Pose {
    if (!d) return IDENTITY_POSE
    // what is applied: a declaration the author took back (adoptAuthored)
    // contributes nothing of layout's, the other one still does
    const translate = d.written.get('translate')
    const scale = d.written.get('scale')
    if (translate === undefined && scale === undefined) return IDENTITY_POSE
    const au = d.authored
    let px = 1
    let py = 1
    if (scale !== undefined) {
        const sx = Number.parseFloat(scale)
        const sy = secondComponent(scale)
        px = sx / au.sx
        py = (sy ?? sx) / au.sy
    }
    if (translate === undefined) return { tx: 0, ty: 0, sx: px, sy: py }
    const tx = Number.parseFloat(translate)
    const ty = secondComponent(translate)
    return {
        tx: tx - px * au.tx,
        ty: (ty ?? 0) - py * au.ty,
        sx: px,
        sy: py,
    }
}

/**
 * Per frame node, its ancestors (root first) whose presence matrix at the
 * flush that planned it differs from the one frozen with their own geometry
 * (§3.1), or `null` when there are none.
 */
function epochLayers(at: readonly FrameNode[]): (Layer[] | null)[] {
    return at.map((node) => {
        let layers: Layer[] | null = null
        for (let k = node.parent; k >= 0; k = at[k]!.parent) {
            const g = at[k]!.geometry
            const m = node.ancestry.get(at[k]!.p) ?? IDENTITY_MATRIX
            if (sameMatrix(m, g.matrix)) continue
            layers ??= []
            layers.unshift({
                at: k,
                map: compose(
                    invert(g.inner),
                    innerOf(g.authored, m, g.ox, g.oy)
                ),
            })
        }
        return layers
    })
}

/**
 * A kept track's geometry at a new flush: the CSS box and origin as they are
 * now, under the presence matrix frozen with the track (§3.1, §5.5), at rest
 * on `a`, its A in that space.
 */
function keptGeometry(was: Geometry, now: Geometry, a: Box): Geometry {
    const css = mapBox(invert(now.inner), now.box)
    const inner = innerOf(now.authored, was.matrix, now.ox, now.oy)
    return { ...now, a, box: mapBox(inner, css), inner, matrix: was.matrix }
}

/** A removed lead's last presented state, in view space as measured (§5.8). */
interface Retained {
    readonly box: Box
    readonly velocity: BoxVelocity | null
    /** The removed lead's on-screen radii, when it owned radius. */
    readonly radius: readonly number[] | null
    /** The actively scrolling containers it was inside when its box was measured (§5.8). */
    readonly scrolling: readonly EventTarget[]
    readonly until: number
}

interface Write {
    element: HTMLElement
    property: string
    /** `''` removes the declaration. */
    value: string
    priority: string
}

/** An attribute write queued with the commit phase (§9.2, §6). */
interface AttributeWrite {
    readonly element: HTMLElement
    readonly name: string
    /** `null` removes the attribute. */
    readonly value: string | null
}

const GROUP_KEYS = [
    'clock',
    'motion',
    'reducedMotion',
    'threshold',
    'maxNodes',
    'maxParticipants',
    'retain',
    'onSnap',
    'engine',
] as const

function validateGroupOptions(options: unknown): void {
    if (options === undefined) return
    if (typeof options !== 'object' || options === null) {
        throw invalidOptions(
            'type',
            `layout group options must be an object, received ${String(options)}.`
        )
    }
    const value = options as Record<string, unknown>
    assertKeys(value, GROUP_KEYS, 'layout group options')
    const clock = value.clock as Partial<Clock> | undefined
    if (
        clock !== undefined &&
        (typeof clock !== 'object' ||
            clock === null ||
            typeof clock.subscribe !== 'function' ||
            typeof clock.unsubscribe !== 'function')
    ) {
        throw invalidOptions('type', 'clock must be an Ani clock.')
    }
    validateMotion(value.motion)
    validateMotionLayers([value.motion as LayoutMotion | undefined])
    if (
        value.engine === 'waapi' &&
        resolveMotion([value.motion as LayoutMotion | undefined]).kind ===
            'spring'
    ) {
        throw invalidOptions(
            'type',
            "the 'waapi' engine realizes timing curves only; a spring motion needs the 'raf' engine."
        )
    }
    validateReducedMotion(value.reducedMotion)
    const threshold = value.threshold
    if (
        threshold !== undefined &&
        (typeof threshold !== 'number' ||
            !Number.isFinite(threshold) ||
            threshold < 0)
    ) {
        throw invalidOptions(
            'range',
            `threshold must be a finite number of px >= 0, received ${String(threshold)}.`
        )
    }
    const maxNodes = value.maxNodes
    if (
        maxNodes !== undefined &&
        (typeof maxNodes !== 'number' ||
            !Number.isInteger(maxNodes) ||
            maxNodes < 0)
    ) {
        throw invalidOptions(
            'range',
            `maxNodes must be an integer >= 0, received ${String(maxNodes)}.`
        )
    }
    const maxParticipants = value.maxParticipants
    if (
        maxParticipants !== undefined &&
        (typeof maxParticipants !== 'number' ||
            !Number.isInteger(maxParticipants) ||
            maxParticipants < 0)
    ) {
        throw invalidOptions(
            'range',
            `maxParticipants must be an integer >= 0, received ${String(maxParticipants)}.`
        )
    }
    const retain = value.retain
    if (
        retain !== undefined &&
        (typeof retain !== 'number' || Number.isNaN(retain) || retain < 0)
    ) {
        throw invalidOptions(
            'range',
            `retain must be a number of seconds >= 0, received ${String(retain)}.`
        )
    }
    if (value.onSnap !== undefined && typeof value.onSnap !== 'function') {
        throw invalidOptions('type', 'onSnap must be a function.')
    }
    const engine = value.engine
    if (engine !== undefined && engine !== 'raf' && engine !== 'waapi') {
        throw invalidOptions(
            'type',
            `engine must be 'raf' or 'waapi', received ${String(engine)}.`
        )
    }
}

/**
 * The WAAPI engine animates top-level `'position'` participants only (§10);
 * anything else throws when it is registered, never degrades.
 */
function validateWaapiOptions(
    options: LayoutOptions | undefined,
    group: LayoutMotion | undefined
): void {
    const reject = (what: string) =>
        invalidOptions(
            'type',
            `the 'waapi' engine animates layout: 'position' participants only; ${what} needs the 'raf' engine.`
        )
    if (options?.layout !== 'position')
        throw reject(`layout: ${JSON.stringify(options?.layout ?? true)}`)
    if (options.layoutAnchor !== undefined) throw reject('layoutAnchor')
    if (options.layoutId !== undefined) throw reject('layoutId')
    if (options.radius) throw reject('radius')
    if (resolveMotion([group, options.motion]).kind === 'spring')
        throw reject('a spring motion')
}

function format(n: number): string {
    // avoid exponent notation, which CSS lengths do not accept
    if (n === 0) return '0'
    // integer channels (the t = 0 translation of an integer layout delta, a
    // scale of 1) need no decimal formatting
    if (Number.isInteger(n)) return String(n)
    return String(Number(n.toFixed(6)))
}

function fadeEnded(fade: DriveFade): boolean {
    return fade.elapsed >= fade.law.duration
}

/** Current opacity of a running fade layer, sampled for reversal continuity. */
function currentFadeOpacity(fade: DriveFade): number {
    return fadeOpacity({
        role: fade.role,
        from: fade.from,
        elapsed: Math.max(0, fade.elapsed),
        law: fade.law,
    })
}

function noop(): void {
    // a removal after dispose has nothing to undo
}

function now(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function microtask(fn: () => void): void {
    if (typeof queueMicrotask === 'function') queueMicrotask(fn)
    else void Promise.resolve().then(fn)
}

export function createLayoutGroup(
    options: LayoutGroupOptions = {}
): LayoutGroup {
    validateGroupOptions(options)
    // the one write-then-read of the engine, outside every flush and frame
    if (hasDOM()) snapsReferenceBox(document)
    const clock: Clock = options.clock ?? defaultClock
    const policy = validateReducedMotion(options.reducedMotion)
    const threshold = options.threshold ?? DEFAULT_THRESHOLD
    const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES
    const maxParticipants = options.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS
    const retain = options.retain ?? DEFAULT_RETAIN
    const groupMotion: LayoutMotion | undefined = options.motion
    const waapi = options.engine === 'waapi'
    /** The running animation of each WAAPI track, with the track it draws. */
    const animations = new Map<
        Participant,
        { readonly animation: Animation; readonly track: Track }
    >()

    const registry = new Map<HTMLElement, Participant>()
    /** This scope's identity in `elementScopes`, so a second live scope refuses it. */
    const scopeToken = {}
    /**
     * The shadow roots that hold a participant, open or closed, by host,
     * with how many participants each holds: every flat-tree walk finds a
     * slot of a closed root through them (§4.6).
     */
    const roots = new Map<Element, ShadowRoot>()
    const rootUsers = new Map<ShadowRoot, number>()
    let scopeDocument: Document | null = null
    /** Child-list/slot changes since the last tree pass; empty means the shape is unchanged. */
    let structureObserver: MutationObserver | null = null
    /** A mutation callback ran since the last tree check (its records are already consumed). */
    let structureDirty = false
    let sequence = 0
    let treePass = 0
    let capture: Capture | null = null
    /** The last support pass whose inputs were clean, for the next capture. */
    let lastSupport: Capture['support'] = null
    /** The last participant-tree pass: a capture or flush reuses it when its inputs verify. */
    let lastTree: ParticipantTree | null = null
    let frame: FrameNode[] = []
    /** Last flush used the measured-jump shortcut; package-internal test seam. */
    let lastKeepShortcut = false
    /** Advances with every clock update: the instant ghost poses are solved for. */
    let tick = 0
    let pending: Write[] = []
    /** Applied write records, reused so a commit does not allocate 2M of them. */
    const writePool: Write[] = []
    let pendingAttributes: AttributeWrite[] = []
    let disposed = false
    /**
     * H18-G: participants with a live or just-invalidated hold. The held read
     * and the invalidation event run over this set, not the whole registry,
     * so a held frame's fixed work does not scale with the participant count.
     */
    const holds = new Set<Participant>()
    /** Previous lead per `layoutId`. */
    const leads = new Map<string, Participant>()
    /** Drawn boxes and velocities of leads removed within `retain` seconds. */
    const retained = new Map<string, Retained>()
    const warned = new Set<string>()
    /** Every read the engine makes, counted where it is made (§7.1). */
    const stats = {
        captures: 0,
        rects: 0,
        offsets: 0,
        styles: 0,
        /** `offsetLeft`/`offsetTop` layout reads (H18-F F4), counted, not hidden. */
        layoutOffsets: 0,
        probes: 0,
        parents: 0,
        tracks: 0,
    }

    /* ─────────────────── diagnostics (§7.2, §9.2) ─────────────────── */

    const scopeId = nextLayoutScopeId()
    /** The connected participants of the last pass. */
    let participants = 0
    /** Reads at the start of the current capture, flush or frame. */
    let readsAt = { rects: 0, styles: 0 }
    /** The id of the flush or frame being executed, for its diagnostics. */
    let runId: number | null = null
    /** Flush events wait here until the engine's state is consistent. */
    let buffered: LayoutDiagnostic[] | null = null
    let inTransaction = false
    let aborting = false
    /** A report waits for the enclosing transaction's writes. */
    let deferDepth = 0
    /** Every unresolved run, including one whose terminal status is pending. */
    const liveRuns = new Set<Run>()
    /** Participants this flush/frame touched, for a narrowed failed report. */
    let touched: Set<Participant> | null = null
    /** The snaps of the flush, delivered after its diagnostics (§9.2). */
    let flushSnaps: LayoutReport['snapped'] = []
    /** Saved declarations of drives settled inside an uncommitted transaction. */
    const resting = new Map<HTMLElement, Saved>()
    /** Authored `inert` records of followers released in an uncommitted transaction. */
    const restingInert = new Map<HTMLElement, SavedInert>()
    /** The run of the current frame's update, carried into its commit. */
    let frameRunId: number | null = null
    /** Elements whose flat-tree focus containment is true for this flush. */
    let focusAverted: ReadonlySet<Element> | null = null

    function metricsNow(springSettleMs: number | null = null) {
        return {
            participants,
            rectReads: stats.rects - readsAt.rects,
            styleReads: stats.styles - readsAt.styles,
            springSettleMs,
        }
    }

    /**
     * Emits one diagnostic, when anyone listens (§7.2 Cost). During a flush
     * it is buffered, so no user callback runs while the engine mutates; the
     * buffer is delivered once the state is consistent.
     */
    function diagnose(
        code: LayoutDiagnosticCode,
        action: LayoutDiagnosticAction,
        detail: {
            readonly element?: HTMLElement
            readonly reason?: SnapReason
            readonly error?: unknown
            readonly springSettleMs?: number | null
        } = {}
    ): void {
        if (!hasDiagnosticListeners()) return
        noteDiagnosticBuilt()
        const event: LayoutDiagnostic = {
            version: 1,
            code,
            scope: scopeId,
            run: runId,
            engine: waapi ? 'waapi' : 'raf',
            action,
            ...(detail.element !== undefined && { element: detail.element }),
            ...(detail.reason !== undefined && { reason: detail.reason }),
            metrics: metricsNow(detail.springSettleMs ?? null),
            ...('error' in detail && { error: detail.error }),
        }
        if (inTransaction) {
            ;(buffered ??= []).push(event)
            return
        }
        emitDiagnostic(event)
    }

    /** Delivers a flush's buffered diagnostics after its state is consistent. */
    function dispatchDiagnostics(): void {
        const events = buffered
        buffered = null
        inTransaction = false
        if (!events) return
        for (const event of events) emitDiagnostic(event)
    }

    /** A user callback's throw: `callback-error` to the listeners, async rethrow in dev. */
    function userCallbackError(error: unknown, element?: HTMLElement): void {
        reportCallbackError(error, {
            scope: scopeId,
            run: runId,
            engine: waapi ? 'waapi' : 'raf',
            metrics: metricsNow(),
            ...(element !== undefined && { element }),
        })
    }

    /** Records a participant the current transaction has read, written or ended. */
    function touch(p: Participant): void {
        touched?.add(p)
    }

    function connectedParticipants(): Participant[] {
        return [...registry.values()].filter((p) => p.element.isConnected)
    }

    /** Resolves a run now (no transaction is open). */
    function resolveNow(
        run: Run,
        status: LayoutStatus,
        snapped: LayoutReport['snapped']
    ): void {
        if (run.resolved) return
        run.resolved = true
        run.done = true
        run.pending = null
        liveRuns.delete(run)
        run.resolve({ status, snapped })
    }

    /**
     * A terminal report waits for the transaction's writes to succeed (§9.2,
     * OPS-02): until then a later fault can still turn it into `'failed'`.
     */
    function resolveRun(
        run: Run,
        status: LayoutStatus,
        snapped: LayoutReport['snapped']
    ): void {
        if (run.resolved) return
        if (run.pending) {
            const first = resolveLayoutStatus([run.pending.status, status])
            if (first === run.pending.status) return
            run.pending = { status, snapped }
            return
        }
        run.done = true
        if (deferDepth > 0) {
            run.pending = { status, snapped }
            return
        }
        resolveNow(run, status, snapped)
    }

    /** The transaction committed: its reports become observable. */
    function flushDeferred(): void {
        for (const run of [...liveRuns]) {
            const pending = run.pending
            if (!pending) continue
            resolveNow(run, pending.status, pending.snapped)
        }
    }

    /** The run an element belongs to now, or the newest unresolved run. */
    function activeRunId(): number | null {
        for (const node of frame) {
            const run = node.p.drive?.run
            if (run && !run.resolved) return run.id
        }
        for (const run of liveRuns) {
            if (!run.resolved) return run.id
        }
        return null
    }

    /** Queues a settled drive's saved declarations for an exact restore. */
    function queueSaved(element: HTMLElement, saved: Saved): void {
        for (const [property, [value, priority]] of saved) {
            queueWrite(element, property, value, priority)
        }
    }

    /**
     * `onSnap` calls, each isolated after the engine's state is consistent
     * (§7.2, §9.2): one throwing callback cannot change the engine and does
     * not stop the other calls.
     */
    function notifySnaps(
        snapped: readonly {
            readonly element: HTMLElement
            readonly reason: SnapReason
        }[]
    ): void {
        const seen = new Set<HTMLElement>()
        for (const { element, reason } of snapped) {
            if (disposed) return
            if (seen.has(element)) continue
            seen.add(element)
            try {
                layoutFault('onSnap')
                options.onSnap?.(element, reason)
            } catch (error) {
                userCallbackError(error, element)
            }
        }
    }

    const runtimeScope = {
        snap(): void {
            if (disposed) return
            snapToDisabled()
        },
        resume(): void {
            if (disposed) return
            syncListeners()
        },
    }
    const unregisterRuntimeScope = registerRuntimeScope(runtimeScope)

    function warn(kind: string, message: string): void {
        if (!DEV || warned.has(kind)) return
        warned.add(kind)
        // biome-ignore lint/suspicious/noConsole: development warning
        console.warn(`[ani-layout] ${message}`)
    }

    /**
     * Tracks every shadow root containing a participant's element (§4.6,
     * H12-05), not only the immediate one. Run at `add` and, for every
     * connected participant, at each capture and flush; a root the element
     * left is dropped, a new one tracked (`getRootNode()`, no layout read).
     */
    const MAX_SHADOW_DEPTH = 1000

    /** Every shadow root containing `element`, innermost first, cycle-guarded. */
    function rootChain(element: Element): ShadowRoot[] {
        const chain: ShadowRoot[] = []
        const seen = new Set<ShadowRoot>()
        let node: Node = element
        let root = node.getRootNode()
        for (
            let depth = 0;
            isShadowRoot(root) && !seen.has(root) && depth < MAX_SHADOW_DEPTH;
            depth++
        ) {
            seen.add(root)
            chain.push(root)
            node = root.host
            root = node.getRootNode()
        }
        return chain
    }

    function addRoot(root: ShadowRoot): void {
        rootUsers.set(root, (rootUsers.get(root) ?? 0) + 1)
        roots.set(root.host, root)
    }

    function removeRoot(root: ShadowRoot): void {
        const users = (rootUsers.get(root) ?? 1) - 1
        if (users > 0) {
            rootUsers.set(root, users)
            return
        }
        rootUsers.delete(root)
        if (roots.get(root.host) === root) roots.delete(root.host)
    }

    /**
     * Tracks every root containing a participant, not only its immediate one
     * (H12-05): a nested closed root must be walkable from its host. An
     * element not yet in a document tracks no root.
     */
    function trackRoot(p: Participant): void {
        // the common case: no shadow root at all, so no root chain to build
        if (!isShadowRoot(p.element.getRootNode())) {
            if (p.roots.length === 0) return
            for (const root of p.roots) removeRoot(root)
            p.roots = []
            syncListeners()
            return
        }
        const chain = rootChain(p.element)
        const same =
            chain.length === p.roots.length &&
            chain.every((root, i) => p.roots[i] === root)
        if (same) return
        for (const root of p.roots) {
            if (!chain.includes(root)) removeRoot(root)
        }
        for (const root of chain) {
            if (!p.roots.includes(root)) addRoot(root)
        }
        p.roots = chain
        syncListeners()
    }

    /** Drops every root a participant was tracked in. */
    function dropRoot(p: Participant): void {
        for (const root of p.roots) removeRoot(root)
        if (p.roots.length === 0) return
        p.roots = []
        // its listeners stay until the end of the task (§5.8)
        syncListeners()
    }

    /** The known roots with `element`'s chain, for a check before it is registered. */
    function rootsWith(element: HTMLElement): KnownRoots {
        const chain = rootChain(element)
        if (chain.every((root) => roots.get(root.host) === root)) return roots
        const next = new Map(roots)
        for (const root of chain) next.set(root.host, root)
        return next
    }

    /**
     * The focused element, walked down through shadow roots (§8, H12-05):
     * `document.activeElement` is retargeted to a shadow host, so the innermost
     * focused element is the open root's `activeElement`, or the one of a
     * closed root the scope knows because a participant lives in it. The walk
     * is cycle-guarded and bounded.
     */
    function focusedElement(doc: Document): Element | null {
        let active: Element | null = doc.activeElement
        const seen = new Set<Element>()
        for (
            let depth = 0;
            active !== null && depth < MAX_SHADOW_DEPTH && !seen.has(active);
            depth++
        ) {
            seen.add(active)
            const root: ShadowRoot | null =
                (active as HTMLElement).shadowRoot ?? roots.get(active) ?? null
            const next = root?.activeElement ?? null
            if (next === null || next === active) break
            active = next
        }
        return active
    }

    /** The flat-tree chain of the focused element, for containment by identity (§8). */
    function focusedChain(doc: Document, tree: FlatTree): Set<Element> {
        const chain = new Set<Element>()
        // a copy: the focus walk must not add roots to the pass's listeners
        const walk = tree.passed === null ? tree : { ...tree, passed: null }
        for (
            let node: Node | null = focusedElement(doc);
            node !== null;
            node = flatParent(node, walk)
        ) {
            if (node.nodeType === 1) chain.add(node as Element)
        }
        return chain
    }

    /* ─────────────── actively scrolling containers (§5.8) ─────────────── */

    /**
     * Scroll event targets (a scroll container, or the document) from their
     * first `scroll` event until their `scrollend`; where `scrollend` is
     * unavailable, every target that scrolled since the listeners were armed.
     * Time never clears it.
     */
    const active = new Set<EventTarget>()
    /** Registered participants with a `layoutId`: the listeners are armed while there is one. */
    let shared = 0
    /**
     * Per event root, its listeners' removal: the document, every shadow root
     * holding a participant, and every shadow root on a participant's
     * flat-ancestor chain as the last pass walked it.
     */
    let listening: Map<Document | ShadowRoot, () => void> | null = null
    let scrollEnds = false
    /** The shadow roots on the flat-ancestor chains of the last capture or flush (§5.8). */
    let chainRoots: ReadonlySet<ShadowRoot> = new Set()
    /** The end-of-task check is queued. */
    let checking = false
    const onScroll = (event: Event): void => {
        if (event.target) active.add(event.target)
    }
    const onScrollEnd = (event: Event): void => {
        if (event.target) active.delete(event.target)
    }
    const LISTENER = { capture: true, passive: true } as const

    /** One passive capture-phase `scroll` and `scrollend` pair on an event root, while armed. */
    function listen(root: Document | ShadowRoot): void {
        if (!listening || listening.has(root)) return
        root.addEventListener('scroll', onScroll, LISTENER)
        if (scrollEnds)
            root.addEventListener('scrollend', onScrollEnd, LISTENER)
        listening.set(root, () => {
            root.removeEventListener('scroll', onScroll, LISTENER)
            if (scrollEnds) {
                root.removeEventListener('scrollend', onScrollEnd, LISTENER)
            }
        })
    }

    function unlisten(root: Document | ShadowRoot): void {
        const remove = listening?.get(root)
        if (!remove) return
        remove()
        listening!.delete(root)
    }

    /**
     * Arms the listeners while the scope has a shared participant: on the
     * document, every shadow root holding a participant and every shadow
     * root on the chains the last pass walked. What they no longer cover is
     * disarmed once, at the end of the task (§5.8).
     */
    function syncListeners(): void {
        if (shared > 0 && scopeDocument) {
            if (!listening) {
                listening = new Map()
                const view = scopeDocument.defaultView
                scrollEnds = 'onscrollend' in (view ?? scopeDocument)
                listen(scopeDocument)
            }
            for (const root of rootUsers.keys()) listen(root)
            for (const root of chainRoots) listen(root)
        }
        if (listening && !checking) {
            checking = true
            microtask(endOfTask)
        }
    }

    /**
     * The end of the task (§5.8): with no shared participant left, a real
     * disarm, which clears the active state; otherwise a shadow root that no
     * participant's chain reaches any more stops listening. A lead removed
     * and re-added within the task keeps every listener and the state.
     */
    function endOfTask(): void {
        checking = false
        if (!listening) return
        if (shared === 0) {
            disarm()
            return
        }
        for (const root of [...listening.keys()]) {
            if (
                isShadowRoot(root) &&
                !rootUsers.has(root) &&
                !chainRoots.has(root)
            ) {
                unlisten(root)
            }
        }
    }

    /** Removes every listener and clears the active state (§3.3). */
    function disarm(): void {
        if (listening) for (const remove of listening.values()) remove()
        listening = null
        active.clear()
    }

    /** Counts a participant's `layoutId` in or out (`sign` 1 or -1). */
    function share(options: LayoutOptions, sign: 1 | -1): void {
        if (options.layoutId !== undefined) shared += sign
    }

    /**
     * Per connected participant, the active containers it was inside (a
     * proper flat-tree ancestor; the document for every node) when the
     * capture read its B (§5.8). One walk per DOM node, shared by siblings.
     */
    function scrollingAround(
        list: readonly Participant[],
        flat: readonly (HTMLElement | null)[],
        tree: FlatTree
    ): Map<Participant, readonly EventTarget[]> {
        const around = new Map<Participant, readonly EventTarget[]>()
        if (active.size === 0) return around
        // a removed container scrolls nothing a participant is drawn in
        for (const target of active) {
            if (target !== scopeDocument && !(target as Node).isConnected)
                active.delete(target)
        }
        const top: readonly EventTarget[] =
            scopeDocument && active.has(scopeDocument) ? [scopeDocument] : []
        const containersOf = ancestorsAmong(active, tree, top)
        list.forEach((p, i) => {
            const containers = containersOf(flat[i]!)
            if (containers.length > 0) around.set(p, containers)
        })
        return around
    }

    /**
     * The members of `candidates` at or above a node in the flat tree,
     * outermost first, after `top`: one walk per DOM node, shared by every
     * node below it (one pass, the DOM unchanged).
     */
    function ancestorsAmong(
        candidates: ReadonlySet<EventTarget>,
        tree: FlatTree,
        top: readonly EventTarget[] = []
    ): (node: Node | null) => readonly EventTarget[] {
        const memo = new Map<Node, readonly EventTarget[]>()
        const of = (node: Node | null): readonly EventTarget[] => {
            if (!node) return top
            const known = memo.get(node)
            if (known) return known
            const above = of(flatParent(node, tree))
            const value = candidates.has(node) ? [...above, node] : above
            memo.set(node, value)
            return value
        }
        return of
    }

    function assertDocument(element: HTMLElement): void {
        if (scopeDocument && element.ownerDocument !== scopeDocument) {
            const targetUrl = element.ownerDocument.URL || 'about:blank'
            const boundUrl = scopeDocument.URL || 'about:blank'
            throw invalidOptions(
                'type',
                `element belongs to another document (${targetUrl}); this layout scope is bound to ${boundUrl}.`
            )
        }
    }

    /* ───────────────────────── frame ───────────────────────── */

    let epochs: {
        at: readonly FrameNode[]
        layers: (Layer[] | null)[]
    } | null = null

    /** `epochLayers` of a frame, computed once per frame array. */
    function layersOf(at: readonly FrameNode[]): (Layer[] | null)[] {
        if (epochs?.at !== at) epochs = { at, layers: epochLayers(at) }
        return epochs.layers
    }

    /**
     * A held node's exact drawn box and velocity (§5.10): its origin channels
     * are the held point while held and its release origin path afterwards;
     * its size channels are the size continuation. The measured screen shift
     * is removed, so the box lives in the frame's pre-camera view space.
     */
    function heldOverride(
        hold: DriveHold,
        p: Participant
    ): { readonly box: Box; readonly velocity: BoxVelocity } | null {
        const g = p.geometry
        if (!g) return null
        const fx = g.fx
        const fy = g.fy
        let x: number
        let y: number
        let vx = 0
        let vy = 0
        if (hold.state === 'held') {
            x = hold.hx - hold.shiftX
            y = hold.hy - hold.shiftY
            vx = 0
            vy = 0
        } else if (
            (hold.state === 'released' || hold.state === 'cancelled') &&
            hold.releaseTrack
        ) {
            const origin = trackOrigin(hold.releaseTrack, hold.releaseElapsed)
            x = origin.x
            y = origin.y
            vx = origin.vx
            vy = origin.vy
        } else {
            return null
        }
        const override = (hold.override ??= {
            box: { x: 0, y: 0, w: 0, h: 0 },
            velocity: { x: 0, y: 0, w: 0, h: 0 },
        })
        override.box.x = x - fx * hold.sizeW
        override.box.y = y - fy * hold.sizeH
        override.box.w = hold.sizeW
        override.box.h = hold.sizeH
        override.velocity.x = vx - fx * hold.sizeVW
        override.velocity.y = vy - fy * hold.sizeVH
        override.velocity.w = hold.sizeVW
        override.velocity.h = hold.sizeVH
        return override
    }

    function solveNodes(at: FrameNode[]): SolveNode[] {
        const simple = at.every(
            (node) =>
                node.p.hold === null &&
                node.p.ride === null &&
                !(node.p.drive?.kind === 'follow' && node.p.drive.lead)
        )
        const index = simple ? null : new Map<Participant, number>()
        if (index) at.forEach((node, i) => index.set(node.p, i))
        const layers = layersOf(at)
        const out: SolveNode[] = []
        at.forEach((node, i) => {
            const d = node.p.drive
            const g = node.geometry
            const live = d !== null && d.kind !== 'held'
            const hold = node.p.hold
            const held = isLiveHold(hold)
            const ride = node.p.ride
            const fade: Fade | null =
                live && d.fade
                    ? {
                          role: d.fade.role,
                          from: d.fade.from,
                          elapsed: Math.max(0, d.fade.elapsed),
                          law: d.fade.law,
                      }
                    : null
            const s = (node.solveNode ??= {} as SolveNode) as Mutable<SolveNode>
            s.parent = node.parent
            s.a = g.a
            s.box = g.box
            s.ox = g.ox
            s.oy = g.oy
            s.fx = g.fx
            s.fy = g.fy
            s.inner = g.inner
            s.track = live && d.kind === 'track' && !d.timeline ? d.track : null
            s.elapsed = d?.elapsed ?? 0
            s.posed =
                live && d.kind === 'track' && d.timeline
                    ? timelinePose(d.timeline, tick, g.ox, g.oy)
                    : null
            s.follow =
                live && d.kind === 'follow' && d.lead
                    ? (index?.get(d.lead) ?? -1)
                    : -1
            s.fade = fade
            s.radius = live && ownsRadius(node.p.options) ? g.radius : null
            if (!live || !ownsRadius(node.p.options) || !d.radiusBlend) {
                s.radiusBlend = null
            } else {
                const leadDrive = d.kind === 'follow' ? d.lead?.drive : d
                const track = leadDrive?.track
                s.radiusBlend = track
                    ? {
                          ...d.radiusBlend,
                          track,
                          elapsed: leadDrive.elapsed,
                      }
                    : null
            }
            s.layers = layers[i] ?? null
            s.override = held ? heldOverride(hold, node.p) : null
            s.ride = isLiveHold(ride) ? (index?.get(ride.owner) ?? -1) : -1
            out.push(s)
        })
        return out
    }

    function writeValue(
        element: HTMLElement,
        d: Drive,
        property: string,
        value: string
    ): void {
        if (d.written.get(property) === value) return
        d.written.set(property, value)
        queueWrite(element, property, value, OWNED_PRIORITY)
    }

    /** Queues one inline declaration, reusing an applied record when possible. */
    function queueWrite(
        element: HTMLElement,
        property: string,
        value: string,
        priority: string
    ): void {
        const pooled = writePool.pop()
        if (pooled) {
            pooled.element = element
            pooled.property = property
            pooled.value = value
            pooled.priority = priority
            pending.push(pooled)
        } else {
            pending.push({ element, property, value, priority })
        }
    }

    /**
     * Queues the saved declarations of `d` (the author's latest, §6) for the
     * write phase: never between reads, never outside a commit (§4.2, §4.3).
     */
    function queueRestore(
        element: HTMLElement,
        d: Drive,
        properties?: readonly string[]
    ): void {
        adoptAuthored(element, d.saved, d.written)
        for (const [property, [value, priority]] of d.saved) {
            if (properties && !properties.includes(property)) continue
            queueWrite(element, property, value, priority)
        }
    }

    /** Queues one attribute write with the commit phase (§9.2). */
    function queueAttribute(
        element: HTMLElement,
        name: string,
        value: string | null
    ): void {
        // the batch has one outcome per attribute: its last write
        pendingAttributes = pendingAttributes.filter(
            (w) => w.element !== element || w.name !== name
        )
        pendingAttributes.push({ element, name, value })
    }

    /**
     * Takes ownership of the follower's `inert` (§6): the authored attribute
     * (present or absent, and its value) is saved, and the element is made
     * inert without rewriting an authored value.
     */
    /** Queues the authored `inert` outcome, whatever the DOM shows now. */
    function queueInertRestore(element: HTMLElement, saved: SavedInert): void {
        queueAttribute(element, 'inert', saved.present ? saved.value : null)
    }

    function ownInert(p: Participant, d: Drive): void {
        if (d.inert !== null || !p.element.isConnected) return
        // C5: a focus-skipped follower is not made inert
        if (focusAverted?.has(p.element)) return
        // a re-own in one transaction keeps the authored record of the first
        // ownership, not the layout write still on the DOM
        const saved = restingInert.get(p.element) ?? saveInert(p.element)
        d.inert = saved
        if (!p.element.hasAttribute('inert'))
            queueAttribute(
                p.element,
                'inert',
                saved.present ? (saved.value ?? '') : ''
            )
    }

    /**
     * Gives the authored `inert` back byte-identically (§6, §9.2). The restore
     * is queued **unconditionally**: a pending set from the same batch must be
     * replaced by it, not trusted as already applied (H12-01). The authored
     * record lives on `restingInert` until the commit lands, so an abort can
     * put it back after the drive is gone (H12-02).
     */
    function releaseInert(element: HTMLElement, d: Drive): void {
        const saved = d.inert
        if (!saved) return
        d.inert = null
        restingInert.set(element, saved)
        queueInertRestore(element, saved)
    }

    /**
     * The author removed an owned `inert` mid-run and focus is not inside:
     * layout owns it while the follower exits. With focus inside, release
     * instead; re-inerting would take the user's focus (H12-04, C5).
     */
    function assertInert(element: HTMLElement, d: Drive): void {
        if (d.inert === null) return
        if (focusAverted?.has(element)) {
            releaseInert(element, d)
            return
        }
        if (!element.hasAttribute('inert')) queueAttribute(element, 'inert', '')
    }

    /**
     * Ends a pair's crossfade without settling its pose: a pair whose handoff
     * was skipped for focus (§8) gives both opacities back at A, and a
     * follower that stays in the frame under a moving ancestor releases its
     * presence hold and its `inert` as it exits under presence alone.
     */
    function dropCrossfade(p: Participant): void {
        const d = p.drive
        if (!d?.fade) return
        const role = d.fade.role
        d.fade = null
        restoreOpacity(p.element, d)
        if (role === 'follower') {
            d.release?.()
            d.release = null
        }
        releaseInert(p.element, d)
    }

    function queuePose(node: FrameNode, solved: Solved): void {
        const d = node.p.drive!
        const { pose } = solved
        const a = d.authored
        const element = node.p.element
        // in the same mutation as its first pose write (§11.4 S2)
        if (d.saved.has(ANCHOR_PROPERTY)) {
            writeValue(element, d, ANCHOR_PROPERTY, 'none')
        }
        writeValue(
            element,
            d,
            'translate',
            `${format(pose.tx + pose.sx * a.tx)}px ${format(pose.ty + pose.sy * a.ty)}px`
        )
        writeValue(
            element,
            d,
            'scale',
            `${format(pose.sx * a.sx)} ${format(pose.sy * a.sy)}`
        )
        // only while it owns a fade: a lead gives its opacity back at the end
        if (solved.opacity !== null && d.fade !== null) {
            writeValue(element, d, 'opacity', format(solved.opacity))
        }
        if (solved.radius) {
            RADIUS_PROPERTIES.forEach((property, corner) => {
                writeValue(
                    element,
                    d,
                    property,
                    `${format(solved.radius![corner * 2]!)}px ${format(solved.radius![corner * 2 + 1]!)}px`
                )
            })
        }
    }

    function finishRunNode(p: Participant): void {
        const run = p.drive?.run
        if (!run) return
        run.nodes.delete(p)
        if (run.nodes.size === 0) {
            resolveRun(run, 'ended', run.snapped)
        }
    }

    /** A node leaves its run unfinished: unregistered or gone from the document (§9). */
    function cancelRunNode(p: Participant): void {
        const run = p.drive?.run
        if (!run) return
        run.nodes.delete(p)
        p.drive!.run = null
        if (run.nodes.size === 0) {
            resolveRun(run, 'disposed', run.snapped)
        }
    }

    /** Queues the restore of every owned declaration of `p` and drops its drive. */
    function settle(p: Participant, cancelled = false): void {
        if (p.ride) {
            p.ride.rides.delete(p)
            p.ride = null
        }
        if (p.hold) invalidateHold(p)
        const d = p.drive
        if (!d) return
        touch(p)
        stopAnimation(p)
        if (cancelled) cancelRunNode(p)
        else finishRunNode(p)
        d.release?.()
        p.drive = null
        if (p.geometry) p.lastBox = p.geometry.a
        // the transaction must restore this even if its commit later throws
        resting.set(p.element, d.saved)
        queueRestore(p.element, d)
        releaseInert(p.element, d)
    }

    /**
     * Starts or continues a drive (§4.3, §5.10). A held node needs a drive
     * even when it has no track; take creates one through this same path, so
     * its ownership and the byte-exact restore are identical.
     */
    function ensureDrive(
        p: Participant,
        kind: Drive['kind'],
        g: Geometry,
        properties: readonly string[],
        reduced: 'jump' | 'clamp' | 'none',
        anchor: boolean
    ): Drive {
        const existing = p.drive
        if (existing) {
            // an owned property it did not save yet (opacity for a new
            // crossfade, corners when `radius` was turned on mid-run)
            const wanted = [...properties]
            if (ownsRadius(p.options) && g.radius)
                wanted.push(...RADIUS_PROPERTIES)
            if (anchor) wanted.push(ANCHOR_PROPERTY)
            const missing = wanted.filter((prop) => !existing.saved.has(prop))
            for (const [k, v] of save(p.element, missing))
                existing.saved.set(k, v)
            // corners it no longer owns go back now
            if (
                !ownsRadius(p.options) &&
                existing.saved.has(RADIUS_PROPERTIES[0])
            ) {
                queueRestore(p.element, existing, RADIUS_PROPERTIES)
                for (const prop of RADIUS_PROPERTIES) {
                    existing.saved.delete(prop)
                    existing.written.delete(prop)
                }
                existing.radius = null
            } else if (ownsRadius(p.options)) {
                existing.radius = g.radiusSource
            }
            existing.kind = kind
            return existing
        }
        // the WAAPI engine writes no inline style
        const radius = !waapi && ownsRadius(p.options) && g.radius
        const extra = !waapi && (properties.length > 0 || radius || anchor)
        const all: string[] = waapi
            ? []
            : extra
              ? [...POSE_PROPERTIES, ...properties]
              : []
        if (radius) all.push(...RADIUS_PROPERTIES)
        if (anchor) all.push(ANCHOR_PROPERTY)
        const d: Drive = {
            kind,
            track: null,
            timeline: null,
            target: null,
            elapsed: 0,
            started: false,
            fade: null,
            radiusBlend: null,
            lead: null,
            inert: null,
            saved: save(p.element, waapi ? [] : extra ? all : POSE_ONLY),
            authored: g.authored,
            radius: g.radiusSource,
            mode: reduced,
            run: null,
            release: null,
            written: new Map(),
        }
        p.drive = d
        return d
    }

    /* ─────────────────────── drive (§5.10) ─────────────────────── */

    /**
     * Ends a live hold for a lifecycle event: the handle becomes
     * `invalidated` (a terminal state), reads stop, its riding descendants
     * stop riding, and the node follows the caller's event rule. A
     * `released`/`cancelled` landing is still live under P4-C3, so a
     * normative invalidation (kill switch, abort, cap, removal, support
     * failure) invalidates it too; only normal completion leaves the terminal
     * `released`/`cancelled` state (`finishHold` never calls this).
     */
    function invalidateHold(p: Participant): void {
        const hold = p.hold
        if (!hold) return
        stopHeldAnimationWatch(hold)
        if (hold.state !== 'invalidated') hold.state = 'invalidated'
        p.hold = null
        hold.releaseTrack = null
        for (const rider of hold.rides) {
            if (rider.ride === hold) rider.ride = null
            if (rider.drive) settle(rider)
        }
        hold.rides.clear()
    }

    /**
     * The held read's support check for a presented rect: a supported layout
     * resize passes (and is taken into the hold); a map the engine does not
     * own, an owned CSS animation, or a mismatched scale fails (P4-C7).
     */
    function heldRectSupported(p: Participant, rect: Box): Measured | null {
        const offset: readonly [number, number] = [
            p.element.offsetWidth,
            p.element.offsetHeight,
        ]
        stats.offsets += 1
        const style = getComputedStyle(p.element)
        stats.styles += 1
        const measured = measure(
            p.element,
            ownsRadius(p.options),
            () => animatedOwned(p.element.ownerDocument),
            snapsReferenceBox(p.element.ownerDocument),
            style,
            readTransform(style)
        )
        if (measured.unsupported !== null) return null
        const engine = engineState()
        let expectedX = 1
        let expectedY = 1
        for (const a of chainOf(p)) {
            const apose = engine.poses.get(a) ?? IDENTITY_POSE
            const ag = a.geometry
            if (ag) {
                expectedX *= apose.sx * ag.inner.x.k
                expectedY *= apose.sy * ag.inner.y.k
                continue
            }
            const astyle = getComputedStyle(a.element)
            stats.styles += 1
            const at = readTransform(astyle)
            if (typeof at === 'string') return null
            expectedX *= apose.sx * at.scale[0] * at.matrix.a
            expectedY *= apose.sy * at.scale[1] * at.matrix.d
        }
        const pose = engine.poses.get(p) ?? writtenPose(p.drive)
        const ownX = (measured.scale[0] * measured.matrix.a) / (pose.sx || 1)
        const ownY = (measured.scale[1] * measured.matrix.d) / (pose.sy || 1)
        if (!(ownX > 0) || !(ownY > 0)) return null
        const check = supportCheck(
            [
                {
                    parent: -1,
                    rect,
                    offset,
                    pose: {
                        sx: expectedX * pose.sx,
                        sy: expectedY * pose.sy,
                    },
                },
            ],
            () => ({ sx: ownX, sy: ownY }),
            () => {
                const exact = borderSize(style)
                return exact
                    ? { w: exact[0], h: exact[1] }
                    : { w: Number.NaN, h: Number.NaN }
            }
        )
        return check.supported[0] === true ? measured : null
    }

    /**
     * A held node's current A from one take read: resolve the CSS box with
     * the written pose and the current parent map divided out, exactly as
     * `take` does (P4-C9). Used when a supported re-layout changes A while
     * the node is held, so the release/landing target is the new box.
     */
    function heldTakeGeometry(
        p: Participant,
        rect: Box,
        measured: Measured
    ): Geometry {
        let parentFull: Map2 = IDENTITY_MAP
        let parentRest: Map2 = IDENTITY_MAP
        if (p.parent) {
            parentRest = p.parent.geometry?.rest ?? IDENTITY_MAP
            if (frame.length > 0) {
                const nodes = solveNodes(frame)
                const solved = solve(nodes)
                const i = frame.findIndex((node) => node.p === p.parent)
                parentFull =
                    i >= 0 ? (solved[i]!.map ?? parentRest) : parentRest
            } else {
                parentFull = parentRest
            }
        }
        const doc = p.element.ownerDocument
        const dpr = doc.defaultView?.devicePixelRatio ?? 1
        let takeRect = rect
        let takeMeasured = measured
        if (p.drive && p.geometry) {
            const written = writtenPose(p.drive)
            const was = p.geometry
            if (written.sx > 0 && written.sy > 0) {
                const local = mapBox(invert(parentFull), rect)
                const unposed = {
                    x: was.ox + (local.x - was.ox - written.tx) / written.sx,
                    y: was.oy + (local.y - was.oy - written.ty) / written.sy,
                    w: local.w / written.sx,
                    h: local.h / written.sy,
                }
                takeRect = mapBox(parentFull, unposed)
                const authored = p.drive.authored
                takeMeasured = {
                    ...measured,
                    translate: [
                        { px: authored.tx, pct: 0 },
                        { px: authored.ty, pct: 0 },
                    ],
                    scale: [authored.sx, authored.sy],
                }
            }
        }
        return resolveGeometry(
            p,
            takeRect,
            takeMeasured,
            parentFull,
            parentRest,
            dpr
        ).geometry
    }

    /** Adopts a held node's re-resolved geometry in its frame node too. */
    function adoptHeldGeometry(p: Participant, g: Geometry): void {
        p.geometry = g
        const i = frame.findIndex((node) => node.p === p)
        if (i < 0) return
        frame = frame.map((node, j) =>
            j === i ? { ...node, geometry: g } : node
        )
    }

    /** The two layout-offset reads a hold needs; counted in `stats`. */
    function readLayoutOffset(element: HTMLElement): [number, number] {
        stats.layoutOffsets += 2
        return [element.offsetLeft, element.offsetTop]
    }

    /**
     * P4-C7 without a per-frame `getAnimations` scan: a new CSS animation or
     * translate/scale transition on the held subtree invalidates the hold
     * when it starts. Existing animations are caught by the take support
     * check; this watcher covers animations that begin during the hold.
     */
    function watchHeldAnimations(p: Participant, hold: DriveHold): void {
        const check = (target: EventTarget | null): void => {
            if (!(target instanceof Element) || p.hold !== hold) return
            if (ownedAnimationIn(target, false)) {
                invalidateHold(p)
            }
        }
        const onAnimation: EventListener = (event) => check(event.target)
        const onTransition: EventListener = (event) => {
            const property = (event as TransitionEvent).propertyName
            if (
                property === 'translate' ||
                property === 'scale' ||
                property === 'all'
            ) {
                check(event.target)
            }
        }
        const roots: HTMLElement[] = [p.element]
        for (let a = p.parent; a; a = a.parent) roots.push(a.element)
        for (const root of roots) {
            root.addEventListener('animationstart', onAnimation)
            root.addEventListener('transitionrun', onTransition)
        }
        hold.animationCleanup = () => {
            for (const root of roots) {
                root.removeEventListener('animationstart', onAnimation)
                root.removeEventListener('transitionrun', onTransition)
            }
            hold.animationCleanup = null
        }
    }

    /** Removes a hold's animation watchers before its state becomes terminal. */
    function stopHeldAnimationWatch(hold: DriveHold): void {
        hold.animationCleanup?.()
    }

    /** The capture read phase's rect read for one held element (§5.10, §4.5). */
    function readHolds(): void {
        if (disposed || !hasDOM()) return
        for (const p of holds) {
            const hold = p.hold
            if (!hold || hold.state !== 'held') continue
            // removal, adoption or an invalid handle stops the read
            if (!p.element.isConnected) {
                hold.state = 'invalidated'
                hold.releaseTrack = null
                continue
            }
            if (scopeDocument && p.element.ownerDocument !== scopeDocument) {
                hold.state = 'invalidated'
                hold.releaseTrack = null
                continue
            }
            const rect = viewRect(p.element)
            stats.rects += 1
            const last = hold.lastDrawn
            if (!last) {
                hold.lastDrawn = rect
                hold.shiftX = 0
                hold.shiftY = 0
                continue
            }
            // H18-C: a pending `move` changes H, not the presented rect, so
            // the presented screen delta is the only thing that can have
            // changed. A layout offset is read only when the screen moved: a
            // flush has already recorded the offset it adopted, so a
            // flush-compensated move is not re-detected here (and adds no
            // held-frame read: H18-F).
            const deltaX = rect.x - last.x
            const deltaY = rect.y - last.y
            if (Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) {
                const [layoutLeft, layoutTop] = readLayoutOffset(p.element)
                if (
                    layoutLeft !== hold.layoutLeft ||
                    layoutTop !== hold.layoutTop
                ) {
                    const measured = heldRectSupported(p, rect)
                    if (measured !== null) {
                        const g = heldTakeGeometry(p, rect, measured)
                        adoptHeldGeometry(p, g)
                        const dx = layoutLeft - hold.layoutLeft
                        const dy = layoutTop - hold.layoutTop
                        hold.layoutLeft = layoutLeft
                        hold.layoutTop = layoutTop
                        // remove the layout move from the camera shift, so
                        // the drawn origin stays at H
                        hold.shiftX = deltaX - dx
                        hold.shiftY = deltaY - dy
                        hold.sizeTargetW = g.a.w
                        hold.sizeTargetH = g.a.h
                        continue
                    }
                }
            }
            const sizeError = Math.max(
                Math.abs(rect.w - hold.sizeW),
                Math.abs(rect.h - hold.sizeH)
            )
            if (sizeError > HOLD_SIZE_TOL) {
                const measured = heldRectSupported(p, rect)
                if (measured === null) {
                    hold.state = 'invalidated'
                    hold.invalidReason = 'unsupported'
                    hold.releaseTrack = null
                    continue
                }
                // H13-02R: adopt the new A too, not only the presented size;
                // a release must land at the re-laid-out box and restore it
                const g = heldTakeGeometry(p, rect, measured)
                adoptHeldGeometry(p, g)
                const [layoutLeft, layoutTop] = readLayoutOffset(p.element)
                hold.layoutLeft = layoutLeft
                hold.layoutTop = layoutTop
                hold.sizeTrack = null
                hold.sizeElapsed = 0
                hold.sizeStarted = false
                hold.sizeW = rect.w
                hold.sizeH = rect.h
                hold.sizeVW = 0
                hold.sizeVH = 0
                hold.sizeTargetW = g.a.w
                hold.sizeTargetH = g.a.h
            } else if (!hold.sizeTrack) {
                // one hold size tolerance: a sub-threshold presented size is
                // snapped into the state so release can finish
                hold.sizeW = rect.w
                hold.sizeH = rect.h
                hold.sizeVW = 0
                hold.sizeVH = 0
                hold.sizeTargetW = rect.w
                hold.sizeTargetH = rect.h
                const g = p.geometry
                if (
                    g &&
                    (Math.abs(g.a.w - rect.w) > 0.01 ||
                        Math.abs(g.a.h - rect.h) > 0.01)
                ) {
                    const measured = heldRectSupported(p, rect)
                    if (measured !== null) {
                        const next = heldTakeGeometry(p, rect, measured)
                        adoptHeldGeometry(p, next)
                        const [layoutLeft, layoutTop] = readLayoutOffset(
                            p.element
                        )
                        hold.layoutLeft = layoutLeft
                        hold.layoutTop = layoutTop
                        hold.sizeTargetW = next.a.w
                        hold.sizeTargetH = next.a.h
                    }
                }
            }
            hold.shiftX = rect.x - last.x
            hold.shiftY = rect.y - last.y
        }
    }

    /** The participant ancestors of `p` at the last flush, root first. */
    function chainOf(p: Participant): Participant[] {
        const chain: Participant[] = []
        for (let q = p.parent; q; q = q.parent) chain.unshift(q)
        return chain
    }

    /**
     * Adds `p` and its participant ancestors to the frame, so a hold can be
     * solved every frame even when nothing has a track. Existing nodes keep
     * the geometry they were planned with.
     */
    function ensureFrameFor(p: Participant): void {
        if (p.drive === null || p.geometry === null) return
        if (frame.some((node) => node.p === p)) return
        const wanted = new Set<Participant>([...frame.map((n) => n.p)])
        for (const q of [p, ...chainOf(p)]) {
            if (q.geometry !== null && !q.removed) wanted.add(q)
        }
        const depth = new Map<Participant, number>()
        const depthOf = (q: Participant): number => {
            const known = depth.get(q)
            if (known !== undefined) return known
            const value =
                q.parent && wanted.has(q.parent) ? depthOf(q.parent) + 1 : 0
            depth.set(q, value)
            return value
        }
        const nodes = [...wanted].map((q) => ({ q, depth: depthOf(q) }))
        nodes.sort((a, b) => a.depth - b.depth || a.q.order - b.q.order)
        const index = new Map<Participant, number>()
        nodes.forEach(({ q }, i) => index.set(q, i))
        const kept = new Map(frame.map((node) => [node.p, node]))
        frame = nodes.map(({ q }) => {
            const was = kept.get(q)
            if (was) {
                return {
                    p: q,
                    parent:
                        q.parent && index.has(q.parent)
                            ? index.get(q.parent)!
                            : -1,
                    geometry: was.geometry,
                    ancestry: was.ancestry,
                    solveNode: was.solveNode,
                    solved: was.solved,
                }
            }
            const ancestry = new Map<Participant, Matrix>()
            for (const a of chainOf(q)) {
                const g = a.geometry
                if (g) ancestry.set(a, g.matrix)
            }
            return {
                p: q,
                parent:
                    q.parent && index.has(q.parent) ? index.get(q.parent)! : -1,
                geometry: q.geometry!,
                ancestry: ancestry.size > 0 ? ancestry : NO_ANCESTRY,
                solveNode: null,
                solved: null,
            }
        })
    }

    /** A held node's current size channels, from its continuation or A. */
    function sizeOfHold(hold: DriveHold): void {
        if (!hold.sizeTrack) {
            hold.sizeVW = 0
            hold.sizeVH = 0
            return
        }
        const size = trackSize(hold.sizeTrack, hold.sizeElapsed)
        hold.sizeW = size.w
        hold.sizeH = size.h
        hold.sizeVW = size.vw
        hold.sizeVH = size.vh
    }

    /**
     * Re-plans one descendant's residual from its presented `(B − h, v − ḣ)`
     * toward its A (§5.10). `drawn` and `velocity` are the descendant's
     * absolute presented state; `h` and `dh` the held node's displacement
     * and its rate.
     */
    function planResidual(
        p: Participant,
        drawn: Box | null,
        velocity: BoxVelocity | null,
        h: { x: number; y: number },
        dh: { x: number; y: number },
        reduced: 'jump' | 'clamp' | 'none',
        anchorParent: Participant | null = null,
        parentVelocity: BoxVelocity | null = null,
        parentDrawn: { readonly w: number; readonly h: number } | null = null
    ): void {
        const d = p.drive
        const g = p.geometry
        if (!d || !g) return
        const a = g.a
        if (!drawn || !velocity) return
        const before: Box = {
            x: drawn.x - h.x,
            y: drawn.y - h.y,
            w: drawn.w,
            h: drawn.h,
        }
        if (reduced === 'jump') {
            // P4-C8/H13-10R: the jump policy settles a residual at its own A;
            // it stays a rider, so h still carries it with the parent
            d.track = null
            d.timeline = null
            d.target = a
            d.kind = 'static'
            d.elapsed = 0
            d.started = false
            d.mode = reduced
            return
        }
        const residual: BoxVelocity = {
            x: velocity.x - dh.x,
            y: velocity.y - dh.y,
            w: velocity.w,
            h: velocity.h,
        }
        const moving =
            Math.abs(residual.x) > 1e-6 ||
            Math.abs(residual.y) > 1e-6 ||
            Math.abs(residual.w) > 1e-6 ||
            Math.abs(residual.h) > 1e-6
        const motion = motionOf(p, reduced)
        // H13-08/P4-C10: preserve an anchored child's layoutAnchor in the
        // residual frame; the solve then rides the parent's drawn anchor
        const anchor = p.options.layoutAnchor
        const pg = anchor && anchorParent ? anchorParent.geometry : null
        let path: AnchorPath | null = null
        if (anchor && pg) {
            const parentResidualV = parentVelocity
                ? {
                      x: parentVelocity.x - dh.x,
                      y: parentVelocity.y - dh.y,
                      w: parentVelocity.w,
                      h: parentVelocity.h,
                  }
                : ZERO_VELOCITY
            const point = (box: Box) => ({
                x: box.x + anchor.x * box.w,
                y: box.y + anchor.y * box.h,
            })
            const from = point(before)
            const to = point(a)
            const parentPoint = point(pg.a)
            // H13-08R: `before` is displaced by the held origin h, but an
            // anchor offset is measured from the parent's drawn anchor, not
            // its origin. A parent size change under the hold contributes
            // (u − fx)·Δw at the anchor; without it the child jumps by that
            // amount when the parent reflows.
            const anchorDX = parentDrawn
                ? (anchor.x - pg.fx) * (parentDrawn.w - pg.a.w)
                : 0
            const anchorDY = parentDrawn
                ? (anchor.y - pg.fy) * (parentDrawn.h - pg.a.h)
                : 0
            path = {
                u: anchor.x,
                v: anchor.y,
                fromX: from.x - parentPoint.x - anchorDX,
                fromY: from.y - parentPoint.y - anchorDY,
                toX: to.x - parentPoint.x,
                toY: to.y - parentPoint.y,
                velocity: moving
                    ? {
                          x:
                              residual.x +
                              anchor.x * residual.w -
                              (parentResidualV.x +
                                  anchor.x * parentResidualV.w),
                          y:
                              residual.y +
                              anchor.y * residual.h -
                              (parentResidualV.y +
                                  anchor.y * parentResidualV.h),
                      }
                    : null,
            }
        }
        const refusal: { settle: number | null } = { settle: null }
        const track = createTrack(
            before,
            a,
            moving ? residual : null,
            g.fx,
            g.fy,
            p.options.layout ?? true,
            moving ? { ...motion, delay: 0 } : motion,
            path,
            refusal
        )
        if (typeof track === 'string') {
            // H13-30: a refused residual is not silently ignored. Keep the
            // child riding h at its own A (a residual jump) and report the
            // typed refusal; the hold itself continues.
            if (track === 'spring-timeout') {
                diagnose('spring-timeout', 'snap', {
                    element: p.element,
                    reason: 'unsupported',
                    springSettleMs:
                        refusal.settle === null ? null : refusal.settle * 1000,
                })
            } else {
                warn(
                    'reduced',
                    'reduced motion found no residual path that fits maxDuration; the descendant residual jumps to its layout.'
                )
                diagnose('reduced-no-fit', 'snap', {
                    element: p.element,
                    reason: 'reduced',
                })
            }
            d.track = null
            d.timeline = null
            d.target = a
            d.kind = 'static'
            d.elapsed = 0
            d.started = false
            d.mode = reduced
            return
        }
        const continues = d.started
        if (d.run) {
            const old = d.run
            old.nodes.delete(p)
            d.run = null
            interrupt(old)
        }
        d.kind = 'track'
        d.track = track
        d.timeline = null
        d.target = a
        d.elapsed = 0
        d.started = continues && moving
        d.mode = reduced
        d.lead = null
        d.fade = null
        d.radiusBlend = null
    }

    /** Every registered participant under `element` in the flat tree. */
    function descendantsOf(element: HTMLElement): Participant[] {
        const found: Participant[] = []
        for (const q of registry.values()) {
            if (q.removed || !q.element.isConnected || q.element === element)
                continue
            if (containsFlat(element, q.element)) found.push(q)
        }
        return found
    }

    /** Ends a hold at its end state: every handle terminal, every drive settled. */
    function finishHold(hold: DriveHold): void {
        const p = hold.owner
        stopHeldAnimationWatch(hold)
        holds.delete(p)
        if (p.hold === hold) p.hold = null
        hold.releaseTrack = null
        for (const rider of hold.rides) {
            if (rider.ride === hold) rider.ride = null
            if (rider.drive) settle(rider)
        }
        hold.rides.clear()
        if (p.drive) settle(p)
        frame = frame.filter((node) => node.p.drive !== null)
        stats.tracks = countTracks()
        if (
            !frame.some(
                (node) => node.p.drive !== null && node.p.drive.kind !== 'held'
            )
        ) {
            realizer.stop()
        }
        // a release that lands at once happens outside a flush/frame: its
        // byte-exact restores must reach the DOM now, not in a later commit
        if (deferDepth === 0) commitWrites()
    }

    /** A held element's take: validates, reads, freezes the origin channels and starts frames. */
    function takeDrive(element: HTMLElement): LayoutDriveHandle {
        const p = registry.get(element)
        if (!p || p.removed) {
            throw invalidOptions(
                'type',
                'take: the element is not registered in this layout group.'
            )
        }
        if (!element.isConnected) {
            throw invalidOptions('type', 'take: the element is not connected.')
        }
        assertDocument(element)
        if (disposed) {
            throw invalidOptions('type', 'take: the layout group is disposed.')
        }
        // P4-C1: a released/cancelled landing may be caught again, but only
        // after every precondition and the current take geometry validate.
        // Nothing below may mutate the old landing before the new hold is
        // certain to be created.
        const existingHold = p.hold
        if (existingHold !== null) {
            if (
                existingHold.state !== 'released' &&
                existingHold.state !== 'cancelled'
            ) {
                throw invalidOptions(
                    'type',
                    'take: the element is already held or landing.'
                )
            }
        }
        if (p.drive?.kind === 'follow' || p.drive?.kind === 'held') {
            // P4-C2: an exiting follower is inert and being removed; the
            // internal follower hold is not a drive hold
            warn(
                'drive-follower',
                'take refused an exiting crossfade follower: it is inert and being removed.'
            )
            diagnose('drive-rejected', 'none', { element })
            throw invalidOptions(
                'type',
                'take: an exiting crossfade follower is inert and cannot be taken.'
            )
        }
        // no held ancestor or descendant
        for (const q of registry.values()) {
            const other = q.hold
            if (!other || q === p) continue
            if (!isLiveHold(other)) continue
            if (
                containsFlat(q.element, element) ||
                containsFlat(element, q.element)
            ) {
                throw invalidOptions(
                    'type',
                    'take: a held element cannot have a held ancestor or descendant.'
                )
            }
        }
        if (layoutRuntime.mode === 'snap') {
            diagnose('runtime-disabled', 'snap', {
                element,
                reason: 'disabled',
            })
            return terminalHandle()
        }
        if (waapi) {
            throw invalidOptions(
                'type',
                "the 'waapi' engine cannot take a drive hold; use engine: 'raf'."
            )
        }
        // H18-D: take may run before the first flush (the scene starts at rest
        // and takes immediately). Resolve the current participant parentage
        // so a nested held node and its riders are solved under their real
        // parents, not as top-level nodes whose pose the browser composes
        // again under the parent (the nested held title's double h).
        const current = participantTree()
        current.list.forEach((q, i) => {
            const parent = current.parents[i]!
            q.parent = parent >= 0 ? current.list[parent]! : null
        })
        const doc = element.ownerDocument
        const snappedReference = snapsReferenceBox(doc)
        // the support check on the presented box (§4.2): one rect, one
        // layout-size pair and one computed style, all before any write
        const rect = viewRect(element)
        stats.rects += 1
        const offset: readonly [number, number] = [
            element.offsetWidth,
            element.offsetHeight,
        ]
        stats.offsets += 1
        const style = getComputedStyle(element)
        stats.styles += 1
        const measured = measure(
            element,
            ownsRadius(p.options),
            () => animatedOwned(doc),
            snappedReference,
            style,
            readTransform(style)
        )
        if (measured.unsupported) {
            throw invalidOptions(
                'type',
                `take: the element cannot be driven (${measured.unsupported}).`
            )
        }
        if (!(rect.w > 0) || !(rect.h > 0)) {
            throw invalidOptions('type', 'take: the element is zero-sized.')
        }
        // E = E_π · p · q: fold the participant ancestors' exact scales into
        // this node's pose and run the §4.2 comparison once for this element
        const engine = engineState()
        let expectedX = 1
        let expectedY = 1
        for (const a of chainOf(p)) {
            const apose = engine.poses.get(a) ?? writtenPose(a.drive)
            const ag = a.geometry
            if (ag) {
                expectedX *= apose.sx * ag.inner.x.k
                expectedY *= apose.sy * ag.inner.y.k
                continue
            }
            // an undriven participant ancestor has no geometry: its computed
            // scale is its inner map (the §4.2 check would read it too)
            const astyle = getComputedStyle(a.element)
            stats.styles += 1
            const at = readTransform(astyle)
            if (typeof at === 'string') {
                throw invalidOptions(
                    'type',
                    `take: a participant ancestor cannot be measured (${at}).`
                )
            }
            expectedX *= apose.sx * at.scale[0] * at.matrix.a
            expectedY *= apose.sy * at.scale[1] * at.matrix.d
        }
        const pose = engine.poses.get(p) ?? writtenPose(p.drive)
        // the computed scale holds the pose the engine wrote: q is divided out
        const ownX = (measured.scale[0] * measured.matrix.a) / (pose.sx || 1)
        const ownY = (measured.scale[1] * measured.matrix.d) / (pose.sy || 1)
        if (!(ownX > 0) || !(ownY > 0)) {
            throw invalidOptions(
                'type',
                'take: the element has a zero or negative scale.'
            )
        }
        const support = supportCheck(
            [
                {
                    parent: -1,
                    rect,
                    offset,
                    pose: {
                        sx: expectedX * pose.sx,
                        sy: expectedY * pose.sy,
                    },
                },
            ],
            () => ({ sx: ownX, sy: ownY }),
            () => {
                const exact = borderSize(style)
                return exact
                    ? { w: exact[0], h: exact[1] }
                    : { w: Number.NaN, h: Number.NaN }
            }
        )
        if (!support.supported[0]) {
            throw invalidOptions(
                'type',
                'take: the element geometry is not supported.'
            )
        }
        const frameNodes = frame.length > 0 ? solveNodes(frame) : []
        const frameSolved = frameNodes.length > 0 ? solve(frameNodes) : []
        const frameMaps = new Map<Participant, Map2>()
        const drawnMap = new Map<Participant, Box>()
        frame.forEach((node, i) => {
            frameMaps.set(node.p, frameSolved[i]!.map)
            drawnMap.set(node.p, frameSolved[i]!.drawn)
        })
        // a rest participant has no measured geometry; take measures it now,
        // through the same resolveGeometry the flush uses, so its A and
        // frame maps are exact without adding a read to any frame
        let parentFull: Map2 = IDENTITY_MAP
        let parentRest: Map2 = IDENTITY_MAP
        if (p.parent) {
            const parent = p.parent
            parentFull =
                frame.findIndex((node) => node.p === parent) >= 0
                    ? (frameMaps.get(parent) ?? IDENTITY_MAP)
                    : (parent.geometry?.rest ?? IDENTITY_MAP)
            parentRest = parent.geometry?.rest ?? IDENTITY_MAP
        }
        const dpr = doc.defaultView?.devicePixelRatio ?? 1
        // P4-C9: take reads, not the stale last-flush geometry. A driven
        // node's rect is under its last written pose; divide parent and pose
        // out before resolving the CSS box. A rest node's rect is its box.
        let takeRect = rect
        let takeMeasured = measured
        if (p.drive && p.geometry) {
            const written = writtenPose(p.drive)
            const was = p.geometry
            if (written.sx > 0 && written.sy > 0) {
                const local = mapBox(invert(parentFull), rect)
                const unposed = {
                    x: was.ox + (local.x - was.ox - written.tx) / written.sx,
                    y: was.oy + (local.y - was.oy - written.ty) / written.sy,
                    w: local.w / written.sx,
                    h: local.h / written.sy,
                }
                takeRect = mapBox(parentFull, unposed)
                // the measured computed translate/scale include the pose as
                // well: give resolveGeometry the authored map only
                const authored = p.drive.authored
                takeMeasured = {
                    ...measured,
                    translate: [
                        { px: authored.tx, pct: 0 },
                        { px: authored.ty, pct: 0 },
                    ],
                    scale: [authored.sx, authored.sy],
                }
            }
        }
        const g = resolveGeometry(
            p,
            takeRect,
            takeMeasured,
            parentFull,
            parentRest,
            dpr
        ).geometry

        // Everything validated: now the old landing may be settled. Its
        // presented state is captured first so the new hold starts exactly
        // where the finger caught it.
        let retake: RetakeState | null = null
        if (existingHold !== null) {
            const drawn0 = new Map<Participant, Box>()
            const rate0 = new Map<Participant, BoxVelocity>()
            const tracked0 = new Set<Participant>()
            const rates0 =
                frameNodes.length > 0 ? drawnRates(frameNodes).velocities : []
            frame.forEach((node, i) => {
                drawn0.set(node.p, frameSolved[i]!.drawn)
                rate0.set(node.p, rates0[i]!)
                if (
                    node.p !== p &&
                    node.p.drive?.kind === 'track' &&
                    runs(node.p.drive)
                ) {
                    tracked0.add(node.p)
                }
            })
            const pRate = rate0.get(p) ?? ZERO_VELOCITY
            retake = {
                takeX: rect.x + g.fx * rect.w,
                takeY: rect.y + g.fy * rect.h,
                velocity: {
                    x: pRate.x + g.fx * pRate.w,
                    y: pRate.y + g.fy * pRate.h,
                },
                sizeTrack: existingHold.sizeTrack,
                sizeElapsed: existingHold.sizeElapsed,
                sizeStarted: existingHold.sizeStarted,
                sizeW: existingHold.sizeW,
                sizeH: existingHold.sizeH,
                sizeVW: existingHold.sizeVW,
                sizeVH: existingHold.sizeVH,
                sizeTargetW: existingHold.sizeTargetW,
                sizeTargetH: existingHold.sizeTargetH,
                drawn: drawn0,
                rates: rate0,
                tracked: tracked0,
            }
            existingHold.state = 'invalidated'
            existingHold.releaseTrack = null
            invalidateHold(p)
            if (p.drive) settle(p)
            frame = frame.filter((node) => node.p.drive !== null)
            if (deferDepth === 0) {
                // a fault in these restores aborts the boundary cleanly and
                // leaves no new hold behind
                const ok = frameBoundary(
                    () => {
                        commitWrites()
                        return true
                    },
                    false,
                    null
                )
                if (!ok) return terminalHandle()
            }
            p.geometry = null
        }
        p.geometry = g
        const analytic = drawnMap.get(p) ?? g.a
        const takeX = retake ? retake.takeX : rect.x + g.fx * rect.w
        const takeY = retake ? retake.takeY : rect.y + g.fy * rect.h
        const drawnVelocity = engine.rates.get(p) ?? ZERO_VELOCITY
        // A trackless child under an animating participant ancestor is
        // counter-projected to its own A, so its own drawn rate is zero. The
        // handle must still carry the ancestor's drawn origin velocity
        // (P4-C10): the finger catches that motion.
        const ownTrack =
            p.drive?.kind === 'track' &&
            p.drive.track !== null &&
            p.drive.timeline === null &&
            !trackEnded(p.drive.track, p.drive.elapsed)
        let ancestorVX = 0
        let ancestorVY = 0
        if (!retake && !ownTrack && p.drive?.timeline === null) {
            const chain = chainOf(p)
            for (let i = chain.length - 1; i >= 0; i--) {
                const ancestor = chain[i]!
                const rate = engine.rates.get(ancestor)
                if (!rate) continue
                const fx = ancestor.geometry?.fx ?? 0.5
                const fy = ancestor.geometry?.fy ?? 0.5
                const vx = rate.x + fx * rate.w
                const vy = rate.y + fy * rate.h
                if (Math.hypot(vx, vy) > 1e-6) {
                    ancestorVX = vx
                    ancestorVY = vy
                    break
                }
            }
        }
        const velocity: LayoutDriveVector = retake
            ? retake.velocity
            : {
                  x: drawnVelocity.x + g.fx * drawnVelocity.w + ancestorVX,
                  y: drawnVelocity.y + g.fy * drawnVelocity.h + ancestorVY,
              }
        // a kept pose timeline has no single size channel to continue: freeze
        // the presented size instead (continuous at the take)
        const running =
            p.drive?.kind === 'track' &&
            p.drive.track !== null &&
            p.drive.timeline === null &&
            !trackEnded(p.drive.track, p.drive.elapsed)
        const sizeTrack = retake
            ? retake.sizeTrack
            : running
              ? p.drive!.track
              : null
        const size = retake
            ? {
                  w: retake.sizeW,
                  h: retake.sizeH,
                  vw: retake.sizeVW,
                  vh: retake.sizeVH,
              }
            : sizeTrack
              ? trackSize(sizeTrack, p.drive!.elapsed)
              : { w: rect.w, h: rect.h, vw: 0, vh: 0 }
        if (!p.drive) {
            ensureDrive(
                p,
                'static',
                g,
                [],
                reducedMode(),
                knownTransformAnchoring(doc) === true && !waapi
            )
        }
        const [holdLayoutLeft, holdLayoutTop] = readLayoutOffset(element)
        const hold: DriveHold = {
            handle: undefined as unknown as LayoutDriveHandle,
            owner: p,
            state: 'held',
            hx: takeX,
            hy: takeY,
            takeX,
            takeY,
            velocity,
            shiftX: retake ? 0 : rect.x - analytic.x,
            shiftY: retake ? 0 : rect.y - analytic.y,
            lastDrawn: retake ? rect : analytic,
            layoutLeft: holdLayoutLeft,
            layoutTop: holdLayoutTop,
            sizeTrack,
            sizeElapsed: retake ? retake.sizeElapsed : (p.drive?.elapsed ?? 0),
            sizeStarted: retake
                ? retake.sizeStarted
                : (p.drive?.started ?? false),
            sizeW: size.w,
            sizeH: size.h,
            sizeVW: size.vw,
            sizeVH: size.vh,
            sizeTargetW: g.a.w,
            sizeTargetH: g.a.h,
            releaseTrack: null,
            releaseElapsed: 0,
            releaseStarted: false,
            releaseTarget: null,
            releaseMode: reducedMode(),
            lastHX: 0,
            lastHY: 0,
            rides: new Set(),
            invalidReason: null,
            warnedMove: false,
            override: null,
            animationCleanup: null,
        }
        const handle = makeHandle(hold)
        hold.handle = handle
        p.hold = hold
        holds.add(p)
        watchHeldAnimations(p, hold)
        ensureFrameFor(p)
        // descendants ride one common displacement from the take (§5.10)
        const h = {
            x: takeX - (g.a.x + g.fx * g.a.w),
            y: takeY - (g.a.y + g.fy * g.a.h),
        }
        const anchorDrawnOf = (
            parent: Participant | null
        ): { w: number; h: number } | null => {
            if (!parent) return null
            if (parent === p) {
                return retake ? (retake.drawn.get(p) ?? rect) : rect
            }
            const b = retake ? retake.drawn.get(parent) : drawnMap.get(parent)
            if (b) return b
            if (parent.hold) {
                return { w: parent.hold.sizeW, h: parent.hold.sizeH }
            }
            return parent.geometry?.a ?? null
        }
        for (const q of descendantsOf(element)) {
            const qg = measureGeometry(q, frameMaps)
            if (!qg) continue
            if (!q.drive) {
                ensureDrive(
                    q,
                    'static',
                    qg,
                    [],
                    reducedMode(),
                    knownTransformAnchoring(doc) === true && !waapi
                )
            }
            q.ride = hold
            hold.rides.add(q)
            ensureFrameFor(q)
            if (retake) {
                const b = retake.drawn.get(q) ?? null
                const v = retake.rates.get(q) ?? null
                if (retake.tracked.has(q) && b && v) {
                    planResidual(
                        q,
                        b,
                        v,
                        h,
                        velocity,
                        reducedMode(),
                        q.parent,
                        q.parent
                            ? (retake.rates.get(q.parent) ?? ZERO_VELOCITY)
                            : null,
                        anchorDrawnOf(q.parent)
                    )
                }
            } else if (q.drive?.kind === 'track' && runs(q.drive)) {
                const b = drawnMap.get(q) ?? qg.a
                const v = engine.rates.get(q) ?? ZERO_VELOCITY
                planResidual(
                    q,
                    b,
                    v,
                    h,
                    velocity,
                    reducedMode(),
                    q.parent,
                    q.parent
                        ? (engine.rates.get(q.parent) ?? ZERO_VELOCITY)
                        : null,
                    anchorDrawnOf(q.parent)
                )
            }
        }
        hold.lastHX = h.x
        hold.lastHY = h.y
        realizer.start()
        // H13-05R2: the old landing's restores were committed in this task;
        // write the new hold's t = 0 pose before returning, so a synchronous
        // read after take is the drawn box B, not the restored layout A
        if (retake !== null && deferDepth === 0) {
            frameBoundary(
                () => {
                    step(null)
                    commitWrites()
                    return true
                },
                false,
                null
            )
        }
        return handle
    }

    /** The handle object shared by the live hold and the terminal snap result. */
    function makeHandle(hold: DriveHold): LayoutDriveHandle {
        return {
            get state() {
                return hold.state
            },
            velocity: hold.velocity,
            move(offset) {
                if (hold.state !== 'held') {
                    if (!hold.warnedMove && DEV) {
                        hold.warnedMove = true
                        // biome-ignore lint/suspicious/noConsole: development warning
                        console.warn(
                            '[ani-layout] move() on a terminal drive handle is a no-op.'
                        )
                    }
                    return
                }
                validateVector(offset, 'move offset')
                hold.hx = hold.takeX + offset.x
                hold.hy = hold.takeY + offset.y
            },
            release(velocity = { x: 0, y: 0 }) {
                if (hold.state !== 'held') return
                validateVector(velocity, 'release velocity')
                releaseHold(hold, velocity, 'released')
            },
            cancel() {
                if (hold.state !== 'held') return
                releaseHold(hold, { x: 0, y: 0 }, 'cancelled')
            },
        }
    }

    function terminalHandle(): LayoutDriveHandle {
        let warned = false
        return {
            state: 'invalidated',
            velocity: { x: 0, y: 0 },
            move() {
                if (warned || !DEV) return
                warned = true
                // biome-ignore lint/suspicious/noConsole: development warning
                console.warn(
                    '[ani-layout] move() on an invalidated drive handle is a no-op.'
                )
            },
            release() {
                return
            },
            cancel() {
                return
            },
        }
    }

    function validateVector(
        value: LayoutDriveVector | undefined,
        label: string
    ): void {
        if (
            !value ||
            typeof value !== 'object' ||
            typeof value.x !== 'number' ||
            typeof value.y !== 'number' ||
            !Number.isFinite(value.x) ||
            !Number.isFinite(value.y)
        ) {
            throw invalidOptions(
                'range',
                `${label} must be a finite { x, y } vector.`
            )
        }
    }

    /**
     * Release or cancel (§5.10): the held origin starts its own track toward
     * the current A with the supplied velocity exactly once; the release
     * velocity never enters a descendant's residual. `'jump'` lands at A with
     * no motion.
     */
    function releaseHold(
        hold: DriveHold,
        velocity: LayoutDriveVector,
        state: 'released' | 'cancelled'
    ): void {
        const p = hold.owner
        const d = p.drive
        let g = p.geometry
        if (!d || !g) {
            hold.state = 'invalidated'
            hold.releaseTrack = null
            return
        }
        // one last read before the release: the current screen shift, the
        // current A and a final support check (outside a frame, so no write
        // precedes it)
        let presented: Box | null = null
        if (p.element.isConnected) {
            const rect = viewRect(p.element)
            stats.rects += 1
            presented = rect
            const last = hold.lastDrawn
            const sizeDelta = last
                ? Math.max(
                      Math.abs(rect.w - hold.sizeW),
                      Math.abs(rect.h - hold.sizeH)
                  )
                : 0
            const layoutDelta = Math.max(
                Math.abs(rect.w - g.a.w),
                Math.abs(rect.h - g.a.h)
            )
            if (
                sizeDelta > HOLD_SIZE_TOL ||
                (!hold.sizeTrack && layoutDelta > 0.01)
            ) {
                const measured = heldRectSupported(p, rect)
                if (measured === null) {
                    hold.state = 'invalidated'
                    hold.invalidReason = 'unsupported'
                    hold.releaseTrack = null
                    warn(
                        'unsupported',
                        'a held element cannot be drawn exactly any more; the hold ends and the element snaps to its layout.'
                    )
                    diagnose('unsupported-geometry', 'snap', {
                        element: p.element,
                        reason: 'unsupported',
                    })
                    finishHold(hold)
                    return
                }
                // H13-02R: release/landing target from the take read
                g = heldTakeGeometry(p, rect, measured)
                adoptHeldGeometry(p, g)
                if (sizeDelta > HOLD_SIZE_TOL) {
                    hold.sizeTrack = null
                    hold.sizeElapsed = 0
                    hold.sizeStarted = false
                    hold.sizeW = rect.w
                    hold.sizeH = rect.h
                    hold.sizeVW = 0
                    hold.sizeVH = 0
                }
                hold.sizeTargetW = g.a.w
                hold.sizeTargetH = g.a.h
            }
            if (last) {
                hold.shiftX = rect.x - last.x
                hold.shiftY = rect.y - last.y
            }
        }
        hold.state = state
        const reduced = reducedMode()
        const target = g.a
        // H18-E: the release starts at the presented origin, not at the last
        // finger target H. A move that was not presented yet must not jump on
        // the first release frame; `H` is only the fallback when the element
        // could not be read.
        const originX = presented
            ? presented.x + g.fx * presented.w
            : hold.hx - hold.shiftX
        const originY = presented
            ? presented.y + g.fy * presented.h
            : hold.hy - hold.shiftY
        if (reduced === 'jump') {
            // jump: land at A with no motion; the size snaps too
            hold.sizeTrack = null
            hold.sizeW = target.w
            hold.sizeH = target.h
            hold.sizeVW = 0
            hold.sizeVH = 0
            hold.sizeTargetW = target.w
            hold.sizeTargetH = target.h
            hold.releaseTrack = null
            hold.releaseTarget = target
            finishHold(hold)
            return
        }
        // the size continuation is independent of the release origin: plan it
        // now if the presented size differs from A beyond the hold tolerance
        if (
            !hold.sizeTrack &&
            (Math.abs(hold.sizeW - target.w) > HOLD_SIZE_TOL ||
                Math.abs(hold.sizeH - target.h) > HOLD_SIZE_TOL)
        ) {
            const motion = motionOf(p, reduced)
            const sizeTrack = createTrack(
                { x: target.x, y: target.y, w: hold.sizeW, h: hold.sizeH },
                target,
                null,
                g.fx,
                g.fy,
                true,
                motion,
                null
            )
            if (typeof sizeTrack !== 'string') {
                hold.sizeTrack = sizeTrack
                hold.sizeElapsed = 0
                hold.sizeStarted = false
                hold.sizeTargetW = target.w
                hold.sizeTargetH = target.h
            }
        } else if (
            Math.abs(hold.sizeW - target.w) <= HOLD_SIZE_TOL &&
            Math.abs(hold.sizeH - target.h) <= HOLD_SIZE_TOL
        ) {
            hold.sizeTrack = null
            hold.sizeW = target.w
            hold.sizeH = target.h
            hold.sizeVW = 0
            hold.sizeVH = 0
            hold.sizeTargetW = target.w
            hold.sizeTargetH = target.h
        }
        const size = { w: hold.sizeW, h: hold.sizeH }
        const before: Box = {
            x: originX - g.fx * size.w,
            y: originY - g.fy * size.h,
            w: size.w,
            h: size.h,
        }
        const distance = Math.max(
            Math.abs(before.x + g.fx * before.w - (target.x + g.fx * target.w)),
            Math.abs(before.y + g.fy * before.h - (target.y + g.fy * target.h))
        )
        const sizeDistance = Math.max(
            Math.abs(before.w - target.w),
            Math.abs(before.h - target.h)
        )
        const speed = Math.hypot(velocity.x, velocity.y)
        if (
            speed < 1e-9 &&
            distance <= HOLD_ORIGIN_TOL &&
            sizeDistance <= HOLD_SIZE_TOL
        ) {
            hold.releaseTrack = null
            hold.releaseTarget = target
            finishHold(hold)
            return
        }
        const moving =
            speed > 1e-9 ||
            Math.abs(hold.sizeVW) > 1e-6 ||
            Math.abs(hold.sizeVH) > 1e-6
        const motion = motionOf(p, reduced)
        const refusal: { settle: number | null } = { settle: null }
        const track = createTrack(
            before,
            target,
            {
                x: velocity.x,
                y: velocity.y,
                w: 0,
                h: 0,
            },
            g.fx,
            g.fy,
            true,
            moving ? { ...motion, delay: 0 } : motion,
            null,
            refusal
        )
        if (typeof track === 'string') {
            // P4-C8: a reduced no-fit is a released jump, not invalidation;
            // a spring refusal is a typed snap
            if (track === 'spring-timeout') {
                diagnose('spring-timeout', 'snap', {
                    element: p.element,
                    reason: 'unsupported',
                    springSettleMs:
                        refusal.settle === null ? null : refusal.settle * 1000,
                })
            } else {
                warn(
                    'reduced',
                    'reduced motion found no release path that fits maxDuration; the element lands at its layout.'
                )
                diagnose('reduced-no-fit', 'snap', {
                    element: p.element,
                    reason: 'reduced',
                })
            }
            hold.releaseTrack = null
            hold.releaseTarget = target
            hold.sizeTrack = null
            hold.sizeW = target.w
            hold.sizeH = target.h
            hold.sizeVW = 0
            hold.sizeVH = 0
            hold.sizeTargetW = target.w
            hold.sizeTargetH = target.h
            finishHold(hold)
            return
        }
        hold.releaseTrack = track
        hold.releaseElapsed = 0
        hold.releaseStarted = false
        hold.releaseTarget = target
        hold.releaseMode = reduced
        d.kind = 'track'
        d.track = track
        d.timeline = null
        d.target = target
        d.elapsed = 0
        // §4.5: a release starts from rest timing-wise with its velocity
        d.started = false
        d.mode = reduced
        realizer.start()
    }

    /* ───────────────────────── WAAPI (§10) ───────────────────────── */

    function stopAnimation(p: Participant): void {
        const running = animations.get(p)
        if (!running) return
        animations.delete(p)
        running.animation.cancel()
    }

    /** Each WAAPI track's elapsed time is its animation's. */
    function syncAnimations(): void {
        for (const [p, { animation }] of animations) {
            if (p.drive) p.drive.elapsed = elapsedOf(animation)
        }
    }

    /**
     * One animation per track that does not have one: from the track's start
     * pose to the authored translate, keeping the running ones.
     */
    function playTracks(): void {
        for (const node of frame) {
            const p = node.p
            const d = p.drive
            if (d?.kind !== 'track' || !d.track) continue
            if (animations.get(p)?.track === d.track) continue
            stopAnimation(p)
            const track = d.track
            // the WAAPI engine rejects springs at validation (§10)
            const law = track.law as Extract<TrackLaw, { kind: 'timing' }>
            const start = drawnBoxes(solveNodes([{ ...node, parent: -1 }]))[0]!
            const a = node.geometry.a
            const au = d.authored
            const animation = play(
                p.element,
                {
                    from: [start.x - a.x + au.tx, start.y - a.y + au.ty],
                    to: [au.tx, au.ty],
                    duration: law.duration,
                    delay: track.delay,
                    curve: law.curve,
                    // §11.4 S2: where a transform moves the scroll anchor
                    noAnchor:
                        knownTransformAnchoring(p.element.ownerDocument) ===
                        true,
                },
                () => {
                    if (animations.get(p)?.animation !== animation) return
                    d.elapsed = trackEndTime(track)
                    settle(p)
                    commitWrites()
                    frame = frame.filter((n) => n.p.drive !== null)
                    stats.tracks = animations.size
                }
            )
            animations.set(p, { animation, track })
        }
        stats.tracks = animations.size
    }

    function restoreOpacity(element: HTMLElement, d: Drive): void {
        if (!d.saved.has('opacity')) return
        queueRestore(element, d, OPACITY_PROPERTIES)
        d.written.delete('opacity')
    }

    /** Ends a crossfade: the lead owns no opacity any more, a follower stays invisible. */
    function endFade(p: Participant): void {
        const d = p.drive!
        const fade = d.fade!
        d.fade = null
        if (fade.role === 'lead') {
            restoreOpacity(p.element, d)
            return
        }
        d.kind = 'held'
        writeValue(p.element, d, 'opacity', '0')
        d.release?.()
        d.release = null
    }

    /**
     * Solves the current frame; `dt === null` writes the current time without
     * advancing (the flush's t = 0 pose). Returns whether anything animates.
     */
    function step(dt: number | null): boolean {
        // a held read (or a lifecycle event) invalidated a hold: its event
        // rule runs now, after every read of this frame
        for (const p of holds) {
            const hold = p.hold
            if (!hold || hold.state !== 'invalidated') continue
            if (hold.invalidReason === 'unsupported') {
                warn(
                    'unsupported',
                    'a held element cannot be drawn exactly any more (a map the engine does not own or a box resize); the hold ends and the element snaps to its layout.'
                )
                diagnose('unsupported-geometry', 'snap', {
                    element: p.element,
                    reason: 'unsupported',
                })
            }
            invalidateHold(p)
            if (p.drive) settle(p)
            holds.delete(p)
        }
        if (dt !== null) {
            for (const node of frame) {
                const d = node.p.drive
                if (!d || d.kind === 'held') continue
                if (d.started) d.elapsed += dt
                else d.started = true
                // a fade kept across a retarget stays in step with its pair
                if (d.fade) {
                    if (d.fade.started) d.fade.elapsed += dt
                    else d.fade.started = true
                }
            }
            // a held node's size continuation has its own clock, because the
            // release replaces the drive's origin track while the size goes on
            for (const node of frame) {
                const hold = node.p.hold
                if (!hold) continue
                if (hold.sizeTrack) {
                    if (hold.sizeStarted) hold.sizeElapsed += dt
                    else hold.sizeStarted = true
                }
                if (hold.releaseTrack) {
                    if (hold.releaseStarted) hold.releaseElapsed += dt
                    else hold.releaseStarted = true
                }
            }
            // every ghost a kept pose timeline reads runs on the same clock,
            // each node by its own rule, as its frame would have
            const ghosts = new Set<Ghost>()
            for (const node of frame) {
                const t = node.p.drive?.timeline
                if (t) collectGhosts(t, ghosts)
            }
            for (const ghost of ghosts) {
                ghost.started.forEach((started, j) => {
                    if (started) ghost.elapsed[j] = ghost.elapsed[j]! + dt
                    else ghost.started[j] = true
                })
            }
            tick += 1
        }
        for (const node of frame) {
            const hold = node.p.hold
            if (hold) sizeOfHold(hold)
        }
        // a follower whose lead left the frame stays where it is
        for (const node of frame) {
            const d = node.p.drive
            if (d?.kind === 'follow' && (!d.lead?.drive || d.lead.removed)) {
                d.kind = 'held'
                d.release?.()
                d.release = null
            }
        }
        const solveInput = solveNodes(frame)
        const solved = solve(
            solveInput,
            frame.map((node) => node.solved)
        )
        frame.forEach((node, i) => {
            node.solved = solved[i]!
        })
        // the held read compares its next rect with the box this solve wrote
        frame.forEach((node, i) => {
            const hold = node.p.hold
            const g = node.geometry
            if (!hold || !g) return
            if (!isLiveHold(hold)) return
            hold.lastDrawn = solved[i]!.drawn
            hold.lastHX =
                solved[i]!.drawn.x +
                g.fx * solved[i]!.drawn.w -
                (g.a.x + g.fx * g.a.w)
            hold.lastHY =
                solved[i]!.drawn.y +
                g.fy * solved[i]!.drawn.h -
                (g.a.y + g.fy * g.a.h)
        })
        const animating: boolean[] = []
        let running = false
        for (const node of frame) {
            const d = node.p.drive
            const live = d !== null && d.kind !== 'held'
            const ownTrack = live && runs(d)
            const ownFade = live && d.fade !== null && !fadeEnded(d.fade)
            const hold = node.p.hold
            const held = isLiveHold(hold)
            const ride = node.p.ride
            const riding = isLiveHold(ride)
            animating.push(
                ownTrack ||
                    ownFade ||
                    held ||
                    riding ||
                    (node.parent >= 0 && animating[node.parent]!)
            )
        }
        frame.forEach((node, i) => {
            const p = node.p
            if (!p.drive || p.drive.kind === 'held') return
            // a lead gives its opacity back; a follower is drawn at the lead
            // one last time, then held invisible
            if (p.drive.fade && fadeEnded(p.drive.fade)) {
                if (p.drive.fade.role === 'follower') {
                    queuePose(node, solved[i]!)
                    endFade(p)
                    return
                }
                endFade(p)
            }
            const d = p.drive
            if (d.kind === 'held') return
            const hold = p.hold
            if (hold) {
                // direct manipulation owns the origin; it never settles from
                // the frame's own track because its size keeps going
                if (hold.state === 'held') {
                    // normalize a sub-threshold size so release can finish
                    const target = node.geometry.a
                    if (
                        Math.abs(hold.sizeW - target.w) <= HOLD_SIZE_TOL &&
                        Math.abs(hold.sizeH - target.h) <= HOLD_SIZE_TOL
                    ) {
                        hold.sizeTrack = null
                        hold.sizeElapsed = 0
                        hold.sizeStarted = false
                        hold.sizeW = target.w
                        hold.sizeH = target.h
                        hold.sizeVW = 0
                        hold.sizeVH = 0
                        hold.sizeTargetW = target.w
                        hold.sizeTargetH = target.h
                    }
                    queuePose(node, solved[i]!)
                    running = true
                    return
                }
                // released: h and the residuals have to settle, and no
                // ancestor may still animate (the pose is counter-projected)
                const g = node.geometry
                const target = g.a
                const releaseEnded =
                    !hold.releaseTrack ||
                    trackEnded(hold.releaseTrack, hold.releaseElapsed)
                // one hold size tolerance: snap a sub-threshold difference and
                // let the same value decide the finish, so the clock can stop
                const sizeClose =
                    Math.abs(hold.sizeW - target.w) <= HOLD_SIZE_TOL &&
                    Math.abs(hold.sizeH - target.h) <= HOLD_SIZE_TOL
                if (sizeClose) {
                    hold.sizeTrack = null
                    hold.sizeElapsed = 0
                    hold.sizeStarted = false
                    hold.sizeW = target.w
                    hold.sizeH = target.h
                    hold.sizeVW = 0
                    hold.sizeVH = 0
                    hold.sizeTargetW = target.w
                    hold.sizeTargetH = target.h
                }
                const sizeEnded =
                    !hold.sizeTrack ||
                    trackEnded(hold.sizeTrack, hold.sizeElapsed)
                const hx =
                    solved[i]!.drawn.x +
                    g.fx * solved[i]!.drawn.w -
                    (target.x + g.fx * target.w)
                const hy =
                    solved[i]!.drawn.y +
                    g.fy * solved[i]!.drawn.h -
                    (target.y + g.fy * target.h)
                const ancestor = node.parent >= 0 && animating[node.parent]!
                if (
                    releaseEnded &&
                    sizeEnded &&
                    Math.abs(hx) <= HOLD_ORIGIN_TOL &&
                    Math.abs(hy) <= HOLD_ORIGIN_TOL &&
                    Math.abs(hold.sizeW - target.w) <= HOLD_ORIGIN_TOL &&
                    Math.abs(hold.sizeH - target.h) <= HOLD_ORIGIN_TOL &&
                    !ancestor
                ) {
                    finishHold(hold)
                    return
                }
                queuePose(node, solved[i]!)
                running = true
                return
            }
            const ride = p.ride
            if (isLiveHold(ride)) {
                // a residual that ended first stays at A + h until h settles.
                // An anchored residual keeps its track so it stays on the
                // parent's drawn anchor while the parent is still resizing
                // (H13-08R); its own channels are at their end.
                if (
                    d.track &&
                    trackEnded(d.track, d.elapsed) &&
                    !d.track.anchor
                ) {
                    d.track = null
                    d.timeline = null
                    d.target = null
                    d.kind = 'static'
                }
                queuePose(node, solved[i]!)
                running = true
                return
            }
            if (!animating[i]) {
                settle(p)
                return
            }
            queuePose(node, solved[i]!)
            running = true
        })
        stats.tracks = countTracks()
        return running
    }

    const realizer = createRaf(clock, {
        read() {
            frameBoundary(readHolds, undefined, activeRunId())
        },
        update(dt) {
            deferDepth += 1
            const active = activeRunId()
            frameRunId = active
            return frameBoundary(() => step(dt), false, active)
        },
        commit: () => {
            try {
                frameBoundary(
                    () => {
                        commitWrites()
                        flushDeferred()
                    },
                    undefined,
                    frameRunId
                )
            } finally {
                frameRunId = null
                deferDepth -= 1
                if (deferDepth === 0) flushDeferred()
            }
        },
    })

    /* ───────────────────────── capture ───────────────────────── */

    /**
     * One pass's participant tree (a capture, a flush): the connected
     * participants, parents first, with their nearest participant ancestors
     * and their flat parents. Each participant's root is re-tracked first
     * (§4.6); the pass's flat tree is built after, and the shadow roots on the
     * chains its walks pass are the ones the listeners cover (§5.8).
     */
    /**
     * Whether a pass can be reused: the same registry order and connections,
     * no shadow-root membership, every participant's flat parent unchanged,
     * and every distinct flat parent still resolves to the same nearest
     * participant. The check is structural, not a heuristic: a reparented
     * ancestor container changes the nearest participant of the distinct flat
     * parent it contains and invalidates the pass.
     */
    /**
     * Whether a shadow root sits on an element's flat-ancestor chain (cache
     * invalidation). Results are memoized per validation pass: 1,000
     * participants walk the same container chains, and each node's answer is
     * independent of which participant reached it. A known shadow host
     * disables reuse for every participant below it.
     */
    function shadowInAncestry(
        first: Node | null,
        tree: FlatTree,
        memo: Map<Node, boolean>
    ): boolean {
        const chain: Node[] = []
        let node = first
        let found = false
        while (node) {
            const known = memo.get(node)
            if (known !== undefined) {
                found = known
                break
            }
            chain.push(node)
            const host = node as Element
            if (host.shadowRoot !== null || roots.has(host)) {
                found = true
                break
            }
            if (chain.length >= MAX_SHADOW_DEPTH) break
            node = flatParent(node, tree)
        }
        for (const visited of chain) memo.set(visited, found)
        return found
    }

    function sameParticipantTree(previous: ParticipantTree): boolean {
        if (roots.size !== 0 || chainRoots.size !== 0) return false
        if (registry.size !== previous.list.length) return false
        const shadowMemo = new Map<Node, boolean>()
        let i = 0
        for (const p of registry.values()) {
            if (
                p !== previous.list[i] ||
                !p.element.isConnected ||
                p.roots.length !== 0
            ) {
                return false
            }
            // H17-03: an ancestor that just gained a shadow root can slot this
            // element without a child-list record on the document; the flat
            // parent and the ancestry check both invalidate that cache.
            const first = flatParent(p.element, previous.tree)
            if (
                first !== previous.flat[i] ||
                shadowInAncestry(first, previous.tree, shadowMemo)
            ) {
                return false
            }
            i += 1
        }
        // No observed child-list or slot/name change since the pass: every
        // nearest participant ancestor is unchanged. `style` writes (the
        // engine's own poses, a scene's layout) are not structural.
        if (!structureChanged()) return true
        const above = new Map<Node, Participant | null>()
        const checked = new Set<HTMLElement>()
        for (let k = 0; k < previous.list.length; k++) {
            const p = previous.list[k]!
            const first = flatParent(p.element, previous.tree)
            if (first !== previous.flat[k]) return false
            if (first === null || checked.has(first)) continue
            checked.add(first)
            const parent = nearestParticipant(first, previous.tree, above)
            const expected =
                previous.parents[k]! >= 0
                    ? previous.list[previous.parents[k]!]!
                    : null
            if (parent !== expected) return false
        }
        return true
    }

    /** Whether the document's child list or a slot/name attribute changed since the last check. */
    function structureChanged(): boolean {
        if (typeof MutationObserver === 'undefined' || !scopeDocument) {
            return true
        }
        if (!structureObserver) return true
        if (structureDirty) {
            structureDirty = false
            return true
        }
        return structureObserver.takeRecords().length > 0
    }

    /** Starts observing the document's shape as of the tree pass that just ran. */
    function ensureStructureObserver(): void {
        if (
            structureObserver ||
            typeof MutationObserver === 'undefined' ||
            !scopeDocument
        ) {
            return
        }
        structureObserver = new MutationObserver(() => {
            // the callback consumes its records; the flag is the later check's
            // only evidence that a structural mutation happened
            structureDirty = true
        })
        structureObserver.observe(scopeDocument, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['slot', 'name'],
        })
    }

    function participantTree(
        previous?: ParticipantTree | null
    ): ParticipantTree {
        if (previous && sameParticipantTree(previous)) {
            lastTree = previous
            syncListeners()
            return previous
        }
        const list: Participant[] = []
        for (const p of registry.values()) {
            if (p.element.isConnected) list.push(p)
        }
        for (const p of list) trackRoot(p)
        const passed = new Set<ShadowRoot>()
        const tree = flatTree(roots, passed)
        const above = new Map<Node, Participant | null>()
        const pass = ++treePass
        const depthOf = (p: Participant): number => {
            if (p.treePass === pass) return p.treeDepth
            const first = flatParent(p.element, tree)
            const parent = nearestParticipant(first, tree, above)
            const d = parent ? depthOf(parent) + 1 : 0
            p.treePass = pass
            p.treeDepth = d
            p.treeParent = parent
            p.treeFlat = first
            return d
        }
        // registration order is usually already parent-first; only sort when
        // the observed depths are not non-decreasing (one pass either way)
        let ordered = true
        let lastDepth = 0
        for (const p of list) {
            const d = depthOf(p)
            if (d < lastDepth) ordered = false
            lastDepth = d
        }
        if (!ordered)
            list.sort((a, b) => a.treeDepth - b.treeDepth || a.order - b.order)
        const index = new Map<Participant, number>()
        list.forEach((p, i) => index.set(p, i))
        const parents = list.map((p) => {
            const parent = p.treeParent
            return parent ? index.get(parent)! : -1
        })
        // every chain was walked, from each participant up: with their own
        // roots, the shadow roots on them
        for (const p of list) for (const root of p.roots) passed.add(root)
        chainRoots = passed
        syncListeners()
        const result: ParticipantTree = {
            list,
            parents,
            index,
            flat: list.map((p) => p.treeFlat),
            tree,
        }
        lastTree = result
        ensureStructureObserver()
        return result
    }

    /**
     * The engine's own state now: the pose it last wrote to each frame node
     * and the analytic velocity of each drawn box, both at the instant its
     * last writes describe (§4.1). No DOM read.
     */
    function engineState(): EngineState {
        const poses = new Map<Participant, Pose>()
        const rates = new Map<Participant, BoxVelocity>()
        const poseRates = new Map<Participant, Pose>()
        const moving = new Set<Participant>()
        if (frame.length === 0) return { poses, rates, poseRates, moving }
        if (waapi) syncAnimations()
        const nodes = solveNodes(frame)
        const { velocities, poses: poseRate } = drawnRates(nodes)
        // a WAAPI track writes no declaration: its pose is its animation's value
        const solved = waapi ? solve(nodes) : null
        frame.forEach((node, i) => {
            const d = node.p.drive
            poses.set(node.p, solved ? solved[i]!.pose : writtenPose(d))
            rates.set(node.p, velocities[i]!)
            poseRates.set(node.p, poseRate[i]!)
            if (
                runs(d) &&
                (d!.timeline !== null || d!.elapsed >= d!.track!.delay)
            ) {
                moving.add(node.p)
            }
        })
        return { poses, rates, poseRates, moving }
    }

    /**
     * Whether a clean support pass still describes this batch: the same
     * participants, parents, rect sizes, layout sizes and poses. Positions are
     * not inputs of the check (§4.2 compares each axis's size interval), so a
     * layout move does not invalidate it.
     */
    function supportMatches(
        support: NonNullable<Capture['support']>,
        list: readonly Participant[],
        parents: readonly number[],
        rects: readonly Box[],
        offsets: readonly (readonly [number, number])[],
        poses: ReadonlyMap<Participant, Pose>
    ): boolean {
        if (support.list.length !== list.length) return false
        for (let i = 0; i < list.length; i++) {
            const a = rects[i]!
            const b = support.rects[i]!
            const oa = offsets[i]!
            const ob = support.offsets[i]!
            const pose = poses.get(list[i]!) ?? IDENTITY_POSE
            const was = support.poses.get(support.list[i]!) ?? IDENTITY_POSE
            if (
                list[i] !== support.list[i] ||
                parents[i] !== support.parents[i] ||
                a.w !== b.w ||
                a.h !== b.h ||
                oa[0] !== ob[0] ||
                oa[1] !== ob[1] ||
                pose.sx !== was.sx ||
                pose.sy !== was.sy
            ) {
                return false
            }
        }
        return true
    }

    /**
     * The support check (§4.2) over one batch of rects and layout sizes,
     * parents first: per node, why its box shows a map the engine does not
     * own (its own computed transform's cause when that is what failed, its
     * parent's for a subtree), or `null` when it passes. A node's computed
     * values are read at most once per batch (`styleOf`), and only when the
     * check needs them.
     */
    function supportOf(
        list: readonly Participant[],
        parents: readonly number[],
        rects: readonly Box[],
        offsets: readonly (readonly [number, number])[],
        poses: ReadonlyMap<Participant, Pose>,
        styleOf: StyleReader,
        wanted?: readonly boolean[]
    ): readonly (string | null)[] {
        const poseOf = (i: number) => poses.get(list[i]!) ?? IDENTITY_POSE
        if (wanted && !wanted.some(Boolean)) {
            return new Array<string | null>(list.length).fill(null)
        }
        const indices: number[] = []
        const slot = new Map<number, number>()
        list.forEach((_, i) => {
            if (wanted && !wanted[i]) return
            slot.set(i, indices.length)
            indices.push(i)
        })
        // A wanted node's participant parent is wanted too (the caller marks
        // the driven subtree's ancestors), so the remap is total.
        const nodes: SupportNode[] = indices.map((i) => ({
            parent: parents[i]! >= 0 ? (slot.get(parents[i]!) ?? -1) : -1,
            rect: rects[i]!,
            offset: offsets[i]!,
            pose: poseOf(i),
        }))
        const causes: (string | null)[] = list.map(() => null)
        const innerOf = (k: number): AxisScale | 'unsupported' => {
            const i = indices[k]!
            const transform = styleOf.transform(i)
            if (typeof transform === 'string') {
                causes[i] = transform
                return 'unsupported'
            }
            // the computed scale holds the pose the engine wrote
            const pose = poseOf(i)
            return {
                sx: (transform.scale[0] * transform.matrix.a) / pose.sx,
                sy: (transform.scale[1] * transform.matrix.d) / pose.sy,
            }
        }
        const { supported } = supportCheck(
            nodes,
            innerOf,
            (k) => {
                const i = indices[k]!
                const size = borderSize(styleOf(i))
                return size
                    ? { w: size[0], h: size[1] }
                    : { w: Number.NaN, h: Number.NaN }
            },
            // values already read in this check are q, not assumed (§4.2)
            (k) => (styleOf.has(indices[k]!) ? innerOf(k) : null)
        )
        const reasons: (string | null)[] = list.map(() => null)
        indices.forEach((i, k) => {
            const parent = parents[i]!
            const parentSlot = parent >= 0 ? (slot.get(parent) ?? -1) : -1
            reasons[i] = supported[k]
                ? null
                : parentSlot >= 0 && !supported[parentSlot]
                  ? reasons[parent]!
                  : (causes[i] ?? UNOWNED_MAP)
        })
        return reasons
    }

    /**
     * Computed styles of one batch (one check: a capture, or a flush), each
     * element read at most once and counted; never reused across batches.
     * Every read of a batch precedes its writes, so a value classified once
     * is the value of the whole batch.
     */
    function styleReader(list: readonly Participant[]): StyleReader {
        const styles: (CSSStyleDeclaration | undefined)[] = new Array(
            list.length
        )
        const transforms: (ReturnType<typeof readTransform> | undefined)[] =
            new Array(list.length)
        const read = (i: number): CSSStyleDeclaration => {
            let style = styles[i]
            if (!style) {
                style = getComputedStyle(list[i]!.element)
                styles[i] = style
                stats.styles += 1
            }
            return style
        }
        return Object.assign(read, {
            has: (i: number) => styles[i] !== undefined,
            transform: (i: number) => {
                let transform = transforms[i]
                if (transform === undefined) {
                    transform = readTransform(read(i))
                    transforms[i] = transform
                }
                return transform
            },
        })
    }

    /**
     * The capture the clock's read callback will age, if it is still armed:
     * at most one `clock.read` registration is pending per scope, and it
     * holds no capture once that capture is disarmed or replaced.
     */
    let markerTarget: Capture | null = null
    let markerPending = false
    const onMarkerRead = (): void => {
        markerPending = false
        const target = markerTarget
        markerTarget = null
        if (!target) return
        target.aged = true
        target.disarm()
    }

    /**
     * Arms the capture's frame marker (§4.1): the clock's read callback and
     * the owner window's animation frame, whichever runs first, ages it. The
     * marker reads and writes nothing; the other half is cancelled (the
     * clock's cannot be: the scope's one pending registration is pointed at
     * the newest armed capture, or at none).
     */
    function armMarker(current: Capture, view: Window | null): void {
        let request: number | null = null
        let armed = true
        current.disarm = () => {
            if (!armed) return
            armed = false
            if (request !== null) view?.cancelAnimationFrame(request)
            request = null
            if (markerTarget === current) markerTarget = null
        }
        markerTarget = current
        if (!markerPending) {
            markerPending = true
            clock.read(onMarkerRead)
        }
        if (typeof view?.requestAnimationFrame === 'function') {
            request = view.requestAnimationFrame(() => {
                request = null
                if (!armed) return
                current.aged = true
                current.disarm()
            })
        }
    }

    /**
     * Internal adapter hand-off: a participant registered after the render's
     * capture (a React mount) is given B = its current box, so it appears at
     * its layout without a false `'stale'`. The capture is still open and in
     * the same task. Used through the package-internal symbol below; not a
     * public export.
     */
    function captureAdded(element: HTMLElement): void {
        if (!capture?.live || capture.aged || capture.capped) return
        const p = registry.get(element)
        if (!p || !element.isConnected) return
        // an existing participant at the capture is never re-read here; a
        // presence enter owns the mount's first frame, and an author-replaced
        // declaration keeps its §4.4 path
        if (
            p.order <= capture.registeredThrough ||
            capture.added.has(p) ||
            presenceOf(element) !== undefined
        )
            return
        // §9.1: count connected participants before any read; over the cap the
        // mount takes no B and the flush snaps the whole scope (N2)
        if (connectedParticipants().length > maxParticipants) return
        capture.rects.set(p, viewRect(element))
        capture.added.add(p)
        capture.support = null
        stats.rects += 1
    }

    function takeCapture(arm = true): void {
        if (disposed || !hasDOM()) return
        readsAt = { rects: stats.rects, styles: stats.styles }
        evictAdopted()
        if (capture?.live) return
        capture?.disarm()
        // a capture that begins inside a rendering-update callback may follow
        // an unpresented change of the same frame: it is aged at once (§4.1)
        const inFrame = clock.inFrame
        const pass = participantTree(lastTree)
        const { list, parents, flat, tree } = pass
        participants = list.length
        // §4.1, §9.1: count connected participants before any read; over the
        // cap the capture reads nothing and the flush snaps the whole scope
        if (list.length > maxParticipants) {
            const capped: Capture = {
                live: true,
                aged: false,
                capped: true,
                disarm: noop,
                rects: new Map(),
                registeredThrough: sequence,
                added: new Set(),
                unsupported: new Map(),
                radius: new Map(),
                engine: {
                    poses: new Map(),
                    rates: new Map(),
                    poseRates: new Map(),
                    moving: new Set(),
                },
                scrolling: new Map(),
                flat: NO_FLAT,
                support: null,
                tree: null,
            }
            capture = capped
            stats.captures += 1
            microtask(() => {
                capped.live = false
            })
            return
        }
        const engine = engineState()
        // 1. one rect and one layout size per connected participant
        const rects: Box[] = []
        const offsets: (readonly [number, number])[] = []
        for (const p of list) {
            rects.push(viewRect(p.element))
            offsets.push([p.element.offsetWidth, p.element.offsetHeight])
        }
        stats.rects += list.length
        stats.offsets += list.length
        // The capture support verdict is needed for the driven subtree and
        // for degenerate/rounded boxes whose exact computed size is the only
        // support proof (C-6b); a plain static box is supported by its read.
        const captureWanted = list.map(
            (p, i) =>
                presenceOf(p.element) !== undefined ||
                offsets[i]![0] <= 1 ||
                offsets[i]![1] <= 1 ||
                (p.drive !== null &&
                    (p.lastBox === null ||
                        rects[i]!.w !== p.lastBox.w ||
                        rects[i]!.h !== p.lastBox.h))
        )
        for (let i = list.length - 1; i >= 0; i--) {
            if (captureWanted[i] && parents[i]! >= 0)
                captureWanted[parents[i]!] = true
        }
        // 2. the support check on what was presented
        const stylesBefore = stats.styles
        let styleOf: StyleReader | null = null
        const styles = (): StyleReader => (styleOf ??= styleReader(list))
        const reused =
            lastSupport !== null &&
            supportMatches(
                lastSupport,
                list,
                parents,
                rects,
                offsets,
                engine.poses
            )
        const unsupported = reused
            ? new Array<string | null>(list.length).fill(null)
            : supportOf(
                  list,
                  parents,
                  rects,
                  offsets,
                  engine.poses,
                  styles(),
                  captureWanted
              )
        const readFree = stats.styles === stylesBefore
        // 3. after every rect: shared corner radii at B, on screen (a driven
        // node's own declarations are drawn at its poses' scale)
        const radius = new Map<Participant, readonly number[]>()
        let hasRadius = false
        if (shared > 0)
            for (const p of list) {
                if (p.options.layoutId !== undefined && ownsRadius(p.options)) {
                    hasRadius = true
                    break
                }
            }
        if (hasRadius) {
            const kx: number[] = []
            const ky: number[] = []
            list.forEach((p, i) => {
                const pose = engine.poses.get(p) ?? IDENTITY_POSE
                const parent = parents[i]!
                kx.push((parent >= 0 ? kx[parent]! : 1) * pose.sx)
                ky.push((parent >= 0 ? ky[parent]! : 1) * pose.sy)
                if (p.options.layoutId === undefined || !ownsRadius(p.options))
                    return
                const value = readRadius(styles()(i))
                if (!value) return
                radius.set(
                    p,
                    value.map((r, j) => r * (j % 2 === 0 ? kx[i]! : ky[i]!))
                )
            })
        }
        // an owned declaration the author replaced inline since layout wrote
        // it is unpresented (the same task): that node and its subtree are
        // not drawn as presented, so they supply no B (§4.1, §6)
        const unpresented: boolean[] = []
        const presentedRects = new Map<Participant, Box>()
        const failing = new Map<Participant, string>()
        list.forEach((p, i) => {
            const parent = parents[i]!
            const un =
                (parent >= 0 && unpresented[parent]!) ||
                (p.drive !== null && replacedOwned(p.element, p.drive.written))
            unpresented.push(un)
            if (un) radius.delete(p)
            else presentedRects.set(p, rects[i]!)
            const reason = unsupported[i]
            if (reason) failing.set(p, reason)
        })
        const support =
            failing.size === 0
                ? {
                      list,
                      parents,
                      rects,
                      offsets,
                      poses: engine.poses,
                      readFree,
                  }
                : null
        // An exact pass (no failures) is reusable while its geometry inputs
        // stay byte-identical; a pass that had to read a degenerate/presence
        // support proof is re-read at each capture (C-6b).
        lastSupport = captureWanted.some(Boolean) ? null : support
        const scrolling = scrollingAround(list, flat, tree)
        const current: Capture = {
            live: true,
            aged: inFrame,
            capped: false,
            disarm: noop,
            rects: presentedRects,
            registeredThrough: sequence,
            added: new Set(),
            unsupported: failing,
            radius,
            engine,
            scrolling,
            support,
            tree: pass,
            // only a participant inside an active container can be degraded
            flat:
                scrolling.size > 0
                    ? new Map(list.map((p, i) => [p, flat[i]!]))
                    : NO_FLAT,
        }
        if (inFrame) {
            warn(
                'in-frame',
                'capture() or update() ran while the clock runs a frame (a requestAnimationFrame callback), so its capture is aged and the change does not animate. Call it from an ordinary task: an event handler, a timer or a promise callback.'
            )
        } else if (arm) {
            armMarker(
                current,
                (scopeDocument ?? list[0]?.element.ownerDocument ?? document)
                    .defaultView
            )
        }
        capture = current
        stats.captures += 1
        microtask(() => {
            current.live = false
        })
    }

    /* ───────────────────────── flush ───────────────────────── */

    function resolved(
        status: LayoutStatus,
        snapped: LayoutReport['snapped'] = []
    ): Promise<LayoutReport> {
        return Promise.resolve({ status, snapped })
    }

    function interrupt(run: Run | null): void {
        if (!run || run.resolved) return
        for (const p of run.nodes) if (p.drive?.run === run) p.drive.run = null
        run.nodes.clear()
        resolveRun(run, 'interrupted', run.snapped)
    }

    /**
     * The nearest live participant at or above `first` (an element's flat
     * parent) in the pass's flat tree. Every ancestor walked that is not one
     * remembers the answer in `above` (one tree build, the registry
     * unchanged), so siblings share the walk of their common ancestors.
     */
    function nearestParticipant(
        first: HTMLElement | null,
        tree: FlatTree,
        above: Map<Node, Participant | null>
    ): Participant | null {
        let found: Participant | null = null
        const walked: Node[] = []
        for (
            let node: HTMLElement | null = first;
            node;
            node = flatParent(node, tree)
        ) {
            const known = above.get(node)
            if (known !== undefined) {
                found = known
                break
            }
            const p = registry.get(node)
            if (p && !p.removed && node.isConnected) {
                found = p
                break
            }
            walked.push(node)
        }
        for (const node of walked) above.set(node, found)
        return found
    }

    function resolveGeometry(
        p: Participant,
        rect: Box,
        m: Measured,
        parentFull: Map2,
        parentRest: Map2,
        dpr: number
    ): { geometry: Geometry; full: Map2 } {
        const atTop = isIdentityMap(parentFull) && isIdentityMap(parentRest)
        const translated =
            !atTop &&
            parentFull.x.k === 1 &&
            parentFull.y.k === 1 &&
            parentRest.x.k === 1 &&
            parentRest.y.k === 1
        const local = atTop
            ? rect
            : translated
              ? {
                    x: rect.x - parentFull.x.b,
                    y: rect.y - parentFull.y.b,
                    w: rect.w,
                    h: rect.h,
                }
              : mapBox(invert(parentFull), rect)
        let unsupported = m.unsupported
        const kx = m.scale[0] * m.matrix.a
        const ky = m.scale[1] * m.matrix.d
        if (!(kx > 0) || !(ky > 0)) unsupported ??= 'a zero or negative scale'
        const sx = kx > 0 ? kx : 1
        const sy = ky > 0 ? ky : 1
        const w = local.w / sx
        const h = local.h / sy
        const [originX, originY] = usedOrigin(m.origin, m.originPct, w, h, dpr)
        const own = {
            kx: sx,
            ky: sy,
            tx: resolveLen(m.translate[0], w) + m.scale[0] * m.matrix.e,
            ty: resolveLen(m.translate[1], h) + m.scale[1] * m.matrix.f,
            ox: originX,
            oy: originY,
        }
        const css = unmapOwn(local, own)
        const ownMapped = ownMap(css, own)
        const full = atTop
            ? ownMapped
            : translated
              ? {
                    x: {
                        k: ownMapped.x.k,
                        b: ownMapped.x.b + parentFull.x.b,
                    },
                    y: {
                        k: ownMapped.y.k,
                        b: ownMapped.y.b + parentFull.y.b,
                    },
                }
              : compose(parentFull, ownMapped)
        const authored: Authored = p.drive?.authored ?? {
            tx: resolveLen(m.translate[0], css.w),
            ty: resolveLen(m.translate[1], css.h),
            sx: m.scale[0],
            sy: m.scale[1],
        }
        const ox = css.x + originX
        const oy = css.y + originY
        const inner = aboutOrigin(
            {
                tx: authored.tx + authored.sx * m.matrix.e,
                ty: authored.ty + authored.sy * m.matrix.f,
                sx: authored.sx * m.matrix.a,
                sy: authored.sy * m.matrix.d,
            },
            ox,
            oy
        )
        const box = mapBox(inner, css)
        const rest = atTop
            ? inner
            : translated
              ? {
                    x: { k: inner.x.k, b: inner.x.b + parentRest.x.b },
                    y: { k: inner.y.k, b: inner.y.b + parentRest.y.b },
                }
              : compose(parentRest, inner)
        let radius: number[] | null = null
        if (m.radius) {
            radius = m.radius.map((len: Len, i) =>
                resolveLen(len, i % 2 === 0 ? css.w : css.h)
            )
        }
        return {
            geometry: {
                a: atTop
                    ? box
                    : translated
                      ? {
                            x: box.x + parentRest.x.b,
                            y: box.y + parentRest.y.b,
                            w: box.w,
                            h: box.h,
                        }
                      : mapBox(parentRest, box),
                box,
                ox,
                oy,
                inner,
                rest,
                fx: css.w > 0 ? m.origin[0] / css.w : 0.5,
                fy: css.h > 0 ? m.origin[1] / css.h : 0.5,
                authored,
                radius,
                radiusSource: m.radius,
                matrix: m.matrix,
                unsupported,
            },
            full,
        }
    }

    /**
     * A participant's geometry from one take read, through the same
     * `resolveGeometry` a flush uses (§5.10). A rest descendant has no
     * geometry of its own; the hold needs one to draw it at `A + h`.
     */
    function measureGeometry(
        p: Participant,
        frameMaps?: ReadonlyMap<Participant, Map2>
    ): Geometry | null {
        if (p.geometry) return p.geometry
        const element = p.element
        const doc = element.ownerDocument
        const parent = p.parent
        let parentFull: Map2 = IDENTITY_MAP
        let parentRest: Map2 = IDENTITY_MAP
        if (parent) {
            const pg = measureGeometry(parent, frameMaps)
            const current = frameMaps?.get(parent)
            if (pg) {
                parentFull = current ?? pg.rest
                parentRest = pg.rest
            }
        }
        const rect = viewRect(element)
        stats.rects += 1
        const style = getComputedStyle(element)
        stats.styles += 1
        const measured = measure(
            element,
            ownsRadius(p.options),
            () => animatedOwned(doc),
            snapsReferenceBox(doc),
            style,
            readTransform(style)
        )
        if (measured.unsupported || !(rect.w > 0) || !(rect.h > 0)) return null
        const dpr = doc.defaultView?.devicePixelRatio ?? 1
        const g = resolveGeometry(
            p,
            rect,
            measured,
            parentFull,
            parentRest,
            dpr
        ).geometry
        p.geometry = g
        return g
    }

    function reducedMode(): 'jump' | 'clamp' | 'none' {
        if (policy === 'ignore' || !clock.reducedMotion) return 'none'
        return policy === 'jump' ? 'jump' : 'clamp'
    }

    function motionOf(
        p: Participant,
        reduced: 'jump' | 'clamp' | 'none'
    ): Motion {
        if (p.motion?.mode === reduced) return p.motion.value
        const motion = resolveMotion([groupMotion, p.options.motion])
        const value =
            reduced === 'clamp' && typeof policy === 'object'
                ? clampMotion(motion, policy.maxDuration)
                : motion
        p.motion = { mode: reduced, value }
        return value
    }

    /**
     * `v` of a driven node is its analytic velocity at `t_k` as the user sees
     * it: through the presence layers as they are at this flush, not as they
     * were frozen with its track (§5.7). B is measured through those layers;
     * the rate is carried to them here. Each pose is recovered with its rate
     * from the analytic drawn box and its velocity, then composed through the
     * current layers (maps with time derivatives compose exactly by the
     * product rule), so a parent's motion stays a translation of the child
     * whatever the child's own scale became.
     */
    function carryRates(
        index: ReadonlyMap<Participant, number>,
        geometry: readonly (Geometry | null)[],
        velocity: Map<Participant, BoxVelocity>
    ): void {
        if (frame.length === 0) return
        const current = new Map<Participant, Matrix>()
        for (const node of frame) {
            const i = index.get(node.p)
            const m = i === undefined ? null : geometry[i]?.matrix
            if (m) current.set(node.p, m)
        }
        // a layer changed since a node's flush: its own or an ancestor's
        const moved = (p: Participant, m: Matrix) => {
            const now = current.get(p)
            return now !== undefined && !sameMatrix(now, m)
        }
        const changed = frame.some((node) => {
            if (moved(node.p, node.geometry.matrix)) return true
            // an absent entry means identity (§3.1): compare every ancestor's
            // current matrix with the one the track was planned with
            for (let k = node.parent; k >= 0; k = frame[k]!.parent) {
                const a = frame[k]!.p
                const now = current.get(a)
                const was = node.ancestry.get(a) ?? IDENTITY_MATRIX
                if (now !== undefined && !sameMatrix(now, was)) return true
            }
            return false
        })
        if (!changed) return
        // each node's full map as solved, with its rate (taken before any is carried)
        const drawn = drawnBoxes(solveNodes(frame))
        const ontos = frame.map((node, k) => {
            const g = node.geometry
            return movingOnto(
                mapBox(invert(g.inner), g.box),
                drawn[k]!,
                velocity.get(node.p) ?? ZERO_VELOCITY
            )
        })
        /** The parent map a node was solved with: its ancestors at its flush's layers. */
        const parentWas = movingParents(
            layersOf(frame).map((layers, k) => ({
                parent: frame[k]!.parent,
                layers,
            })),
            (k) =>
                ontos[k] ??
                composeMoving(parentWas(k), still(frame[k]!.geometry.inner))
        )
        const after: MovingMap[] = []
        frame.forEach((node, k) => {
            const g = node.geometry
            const m = current.get(node.p) ?? g.matrix
            const au = node.p.drive?.authored ?? g.authored
            const inner = innerOf(au, m, g.ox, g.oy)
            const parentNow =
                node.parent >= 0 ? after[node.parent]! : STILL_IDENTITY
            const onto = ontos[k]
            if (!onto) {
                after.push(composeMoving(parentNow, still(inner)))
                return
            }
            // `onto` is the full map parent ∘ pose ∘ inner: the pose, with its rate
            const pose = composeMoving(
                invertMoving(parentWas(k)),
                composeMoving(onto, still(invert(g.inner)))
            )
            const next = composeMoving(
                composeMoving(parentNow, pose),
                still(inner)
            )
            after.push(next)
            if (!node.p.drive) return
            const seen = carry(
                next,
                mapBox(invert(g.inner), g.box),
                ZERO_VELOCITY
            )
            velocity.set(node.p, seen.velocity)
        })
    }

    /**
     * §9.2: one idempotent boundary around the whole flush. It never
     * rejects; an internal fault restores every owned declaration, ends
     * every listener and subscription, resolves every affected report
     * `'failed'` and reports `internal-error`.
     */
    function flush(): Promise<LayoutReport> {
        if (disposed) return resolved('disposed')
        const id = nextLayoutRunId()
        runId = id
        readsAt = { rects: stats.rects, styles: stats.styles }
        inTransaction = true
        buffered = []
        deferDepth += 1
        touched = new Set()
        if (frame.length > 0) {
            for (const p of registry.values()) {
                if (p.drive) touched.add(p)
            }
        }
        flushSnaps = []
        try {
            const report = flushBody(id)
            flushDeferred()
            const snaps = flushSnaps
            flushSnaps = []
            dispatchDiagnostics()
            // no user callback runs while the transaction is open (§9.2);
            // a reentrant flush/dispose/setMode here sees consistent state
            if (!disposed) notifySnaps(snaps)
            return report
        } catch (error) {
            const affected = [...(touched ?? [])]
            buffered = null
            inTransaction = false
            abort(error, id, affected)
            return resolved('failed', failedSnaps(affected))
        } finally {
            deferDepth -= 1
            if (deferDepth === 0) flushDeferred()
            touched = null
            inTransaction = false
            focusAverted = null
            runId = null
        }
    }

    function flushBody(id: number): Promise<LayoutReport> {
        if (disposed) return resolved('disposed')
        evictAdopted()
        const cap = capture
        capture = null
        cap?.disarm()
        if (!hasDOM()) return resolved('no-change')
        /**
         * Only a fresh capture is a valid measurement of what was presented
         * (§4.1); without one the flush degrades as §4.4 states, and an aged
         * capture is a node's last known box.
         */
        const fresh = cap !== null && !cap.aged && !cap.capped ? cap : null
        const measured = fresh !== null
        /**
         * The frame as it is drawn at t_k, before any drive changes: a nested
         * kept track reads its pose timeline from it (§5.7 path 1, §4.4).
         */
        const drawnFrame = frame
        // H18-B's ghost is needed only when a nested kept track actually reads
        // a pose timeline; solving the whole frame eagerly costs every flush.
        let drawnNodes: SolveNode[] | null = null
        const drawnState = frame.map((node) => {
            const d = node.p.drive
            return {
                started: d?.started ?? true,
                timeline: d?.kind === 'track' ? d.timeline : null,
            }
        })

        // drives of participants that left the document end here (their
        // restores are written with the others, after every read); the author's
        // inline changes to owned properties are taken in (§6)
        if (frame.length > 0)
            for (const p of registry.values()) {
                if (!p.drive) continue
                if (p.element.isConnected) {
                    adoptAuthored(p.element, p.drive.saved, p.drive.written)
                } else settle(p, true)
            }
        const { list, parents, index, flat, tree } = participantTree(cap?.tree)
        participants = list.length
        if (list.length === 0) {
            frame = []
            commitWrites()
            realizer.stop()
            stats.tracks = 0
            return resolved('no-change')
        }
        // §4.3 gate 1, §9.1: a capture that counted over the participant cap
        // latches, even if the scope shrank before the flush; read nothing
        // and snap the whole scope (N3)
        if (cap?.capped || list.length > maxParticipants) {
            if (touched) for (const p of list) touched.add(p)
            return cappedFlush(list)
        }
        /**
         * §8: the focused element's flat-ancestor chain, computed after the
         * cap gate (N2: no non-measurement DOM reads before a capped flush)
         * and before any inert re-assert (H12-04). Containment by identity
         * keeps a deep participant chain linear.
         */
        const doc = list[0]!.element.ownerDocument
        const focusChain = shared > 0 ? focusedChain(doc, tree) : null
        focusAverted = focusChain
        // layout owns the exiting follower's `inert` (§6, §8); an author
        // removal is re-asserted only when focus is not inside it
        if (frame.length > 0)
            for (const p of registry.values()) {
                if (!p.drive || p.drive.inert === null) continue
                assertInert(p.element, p.drive)
            }
        const hasChild = list.map(() => false)
        /** Some drive in the participant's own subtree: it may be drawn/counter-projected. */
        const subtreeDriven = list.map((p) => p.drive !== null)
        for (let i = list.length - 1; i >= 0; i--) {
            const parent = parents[i]!
            if (parent < 0) continue
            hasChild[parent] = true
            if (subtreeDriven[i]) subtreeDriven[parent] = true
        }
        /**
         * Per node, no valid B (§4.4): no fresh capture, or a fresh capture
         * without its B (it was disconnected at capture, or an owned
         * declaration was replaced by the author), and its participant
         * subtree. Such a node follows the §4.4 table; the rest of the flush
         * plans normally.
         */
        const unmeasured: boolean[] = []
        const beforeRects: (Box | null)[] = []
        let anyHold = false
        let anyRide = false
        let anyDrive = false
        list.forEach((p, i) => {
            if (isLiveHold(p.hold)) anyHold = true
            if (p.ride !== null) anyRide = true
            if (p.drive !== null) anyDrive = true
            const parent = parents[i]!
            const registered =
                fresh !== null &&
                (p.order <= fresh.registeredThrough || fresh.added.has(p))
            const b = fresh?.rects.get(p) ?? null
            // a participant that mounts under a presence enter is animated by
            // that enter; layout has no B and must not add a stale report
            const newPresence =
                fresh !== null &&
                !registered &&
                presenceOf(p.element) !== undefined
            const un =
                !fresh ||
                (parent >= 0 && unmeasured[parent]!) ||
                (!newPresence &&
                    (!fresh || !registered || (!p.keyChanged && b === null)))
            unmeasured.push(un)
            beforeRects.push(p.keyChanged || un ? null : b)
        })
        /** Each node's A at its previous flush, before this one replaces it. */
        const stale = unmeasured.some(Boolean)
        const lastBoxes = stale ? list.map((p) => p.lastBox) : null
        /** Each node's geometry and participant parent at its previous flush. */
        const lastGeometry = stale ? list.map((p) => p.geometry) : null
        const lastParent = stale ? list.map((p) => p.parent) : null

        // the engine's own state at t_k: the fresh capture's, or now when there
        // is none (its last writes describe the presented frame either way)
        const engine = fresh?.engine ?? engineState()
        /** Each frame node as its running track was planned. */
        const frozen = new Map<Participant, FrameNode>()
        if (frame.length > 0) for (const node of frame) frozen.set(node.p, node)

        // 1. reads: every rect and layout size, then computed styles of what
        // the support check and the plan need
        // `doc` and the focus chain were computed before the inert re-assert
        if (doc === null) return resolved('no-change')
        // probed when the scope was created; another document is probed here
        const snapsReference = snapsReferenceBox(doc)
        // §11.4 S2: the anchoring probe, once per document, at the start of
        // the first flush that may write a pose, with either engine (a fresh
        // capture can start a track, a running frame writes its poses) and
        // before its first rect read; counted in `stats.probes`
        if (
            knownTransformAnchoring(doc) === undefined &&
            reducedMode() !== 'jump' &&
            (fresh !== null || frame.length > 0)
        ) {
            probeTransformAnchoring(doc)
            stats.probes += 1
        }
        /**
         * A transform moves the scroll anchor here: every driven participant,
         * scroll containers included, is kept from being the anchor (§6).
         */
        const anchorFallback = knownTransformAnchoring(doc) === true
        const dpr = doc.defaultView?.devicePixelRatio ?? 1
        const rects: Box[] = []
        const offsets: (readonly [number, number])[] = []
        for (const p of list) {
            rects.push(viewRect(p.element))
            offsets.push([p.element.offsetWidth, p.element.offsetHeight])
        }
        stats.rects += list.length
        stats.offsets += list.length
        const viewport = viewportBox(doc)
        const styleOf = styleReader(list)

        const geometry: (Geometry | null)[] = list.map(() => null)
        const fulls: (Map2 | null)[] = list.map(() => null)
        let animated: Set<Element> | null = null
        const animatedNow = () => {
            animated ??= animatedOwned(doc)
            return animated
        }
        /** Measures the wanted nodes and their ancestors; returns the new ones. */
        const measureNodes = (wanted: boolean[]): number[] => {
            // ancestors of every wanted node are wanted
            for (let i = list.length - 1; i >= 0; i--) {
                if (wanted[i] && parents[i]! >= 0) wanted[parents[i]!] = true
            }
            const added: number[] = []
            for (let i = 0; i < list.length; i++) {
                if (!wanted[i] || geometry[i]) continue
                const p = list[i]!
                touch(p)
                let m = measure(
                    p.element,
                    ownsRadius(p.options),
                    animatedNow,
                    snapsReference,
                    styleOf(i),
                    styleOf.transform(i)
                )
                // the Typed OM origin, where the browser snaps the reference box
                if (
                    snapsReference &&
                    typeof p.element.computedStyleMap === 'function'
                ) {
                    stats.styles += 1
                }
                if (m.radius && p.drive?.radius) {
                    const radius = [...m.radius]
                    RADIUS_PROPERTIES.forEach((property, corner) => {
                        if (!p.drive!.written.has(property)) return
                        radius[corner * 2] = p.drive!.radius![corner * 2]!
                        radius[corner * 2 + 1] =
                            p.drive!.radius![corner * 2 + 1]!
                    })
                    m = { ...m, radius }
                }
                if (p.drive && ownsRadius(p.options)) p.drive.radius = m.radius
                const parent = parents[i]!
                const { geometry: g, full } = resolveGeometry(
                    p,
                    rects[i]!,
                    m,
                    parent >= 0 ? fulls[parent]! : IDENTITY_MAP,
                    parent >= 0 ? geometry[parent]!.rest : IDENTITY_MAP,
                    dpr
                )
                geometry[i] = g
                fulls[i] = full
                added.push(i)
            }
            return added
        }
        // every node with a driven node at or above it divides out poses
        const chained: boolean[] = []
        list.forEach((p, i) => {
            const parent = parents[i]!
            chained.push(p.drive !== null || (parent >= 0 && chained[parent]!))
        })
        if (anyDrive) measureNodes(chained)
        // the support check (§4.2) on this flush's reads, and on the fresh
        // capture's: a map the engine does not own snaps its subtree. Every
        // active node's computed values read in this flush are its q; the
        // check runs again when the plan measures more of them (no new read)
        let noFailures: (string | null)[] | null = null
        const reusableSupport = (): (string | null)[] | null => {
            const s = fresh?.support
            if (
                !s ||
                !s.readFree ||
                !supportMatches(s, list, parents, rects, offsets, engine.poses)
            ) {
                return null
            }
            // §4.2, §4.3: an active node's computed values are its q at this
            // flush. The capture's read-free pass assumed q = 1; it may be
            // reused only while every value this flush read is still 1 (the
            // only case in which the pass would have reached the same result).
            for (let i = 0; i < list.length; i++) {
                if (!styleOf.has(i)) continue
                const g = geometry[i]
                if (!g || g.inner.x.k !== 1 || g.inner.y.k !== 1) return null
            }
            return (noFailures ??= new Array<string | null>(list.length).fill(
                null
            ))
        }
        const supportNow = () => {
            const reused = reusableSupport()
            if (reused) return reused
            const flushed = supportOf(
                list,
                parents,
                rects,
                offsets,
                engine.poses,
                styleOf
            )
            return list.map(
                (p, i) => fresh?.unsupported.get(p) ?? flushed[i] ?? null
            )
        }
        let unowned = supportNow()

        // v: the analytic velocity at t_k, through this flush's layers
        const velocity = new Map(engine.rates)
        if (measured) carryRates(index, geometry, velocity)

        /**
         * A measured jump of at least `threshold` on every running track
         * proves the keep test fails: with no presence layer and no anchor, the
         * new A cannot equal the presented layout box. In that case the
         * presentation maps, `L_k` recovery and keep-path machinery are not
         * needed; every track retargets from its measured B. This is exact for
         * the same reason `keepPath` says 'retarget' for the measured jump.
         */
        let skipsKeeps = false
        if (fresh && frame.length > 0 && !stale) {
            // Scroll and retained-lead runs use the presented/scroll paths;
            // a shared id can hand a track over. None is a plain top-level
            // retarget, so the measured-jump shortcut stays off.
            skipsKeeps =
                fresh.scrolling.size === 0 &&
                retained.size === 0 &&
                shared === 0
            if (skipsKeeps) {
                for (const node of frame) {
                    const p = node.p
                    const i = index.get(p)
                    const d = p.drive
                    const b =
                        i === undefined ? null : (fresh.rects.get(p) ?? null)
                    if (
                        i === undefined ||
                        b === null ||
                        unmeasured[i] ||
                        unowned[i] !== null ||
                        p.keyChanged ||
                        node.ancestry.size !== 0 ||
                        p.hold !== null ||
                        p.ride !== null ||
                        d === null ||
                        d.kind !== 'track' ||
                        d.timeline !== null ||
                        d.fade !== null ||
                        d.radiusBlend !== null ||
                        d.lead !== null ||
                        d.track === null ||
                        d.track.anchor !== null
                    ) {
                        skipsKeeps = false
                        break
                    }
                    const r = rects[i]!
                    // A size change moves the transform origin relative to the
                    // layout box; keep the full path rather than assuming the
                    // jump is an exact translation.
                    if (
                        Math.abs(r.w - b.w) >= threshold ||
                        Math.abs(r.h - b.h) >= threshold
                    ) {
                        skipsKeeps = false
                        break
                    }
                    // A nested node may skip only when its participant parent
                    // is itself a plain running track. An undriven or held
                    // parent keeps the full path.
                    if (node.parent >= 0) {
                        const parent = frame[node.parent]!
                        const pd = parent.p.drive
                        if (
                            parent.ancestry.size !== 0 ||
                            parent.p.hold !== null ||
                            parent.p.ride !== null ||
                            pd === null ||
                            pd.kind !== 'track' ||
                            pd.timeline !== null ||
                            pd.fade !== null ||
                            pd.radiusBlend !== null ||
                            pd.lead !== null ||
                            pd.track === null ||
                            pd.track.anchor !== null
                        ) {
                            skipsKeeps = false
                            break
                        }
                    }
                    if (
                        Math.abs(r.x - b.x) < threshold &&
                        Math.abs(r.y - b.y) < threshold
                    ) {
                        skipsKeeps = false
                        break
                    }
                }
            }
        }

        lastKeepShortcut = skipsKeeps

        /**
         * `L_k` per node with a fresh B (§4.2): the capture's rect with the
         * poses the engine had written divided out top-down, through the
         * inner maps of what was presented (a fresh capture shares this
         * flush's presence matrices: no rendering opportunity lies between).
         * Each is kept as its CSS box with its origin offset, so the keep
         * test can draw it through the matrices its track was planned with
         * about its own origin (§5.7), not about A's.
         */
        const presented: ({
            css: Box
            origin: readonly [number, number]
        } | null)[] = list.map(() => null)
        if (fresh && frame.length > 0 && !skipsKeeps) {
            const nodes: PresentedNode[] = []
            const of: number[] = []
            const slot = new Map<number, number>()
            /** Each node's total scale at capture, top-down (origin-free). */
            const scales: { x: number; y: number }[] = []
            list.forEach((p, i) => {
                const g = geometry[i]
                const rect = fresh.rects.get(p)
                const parent = parents[i]!
                if (!g || !rect || (parent >= 0 && !slot.has(parent))) return
                const css = mapBox(invert(g.inner), g.box)
                const pose = engine.poses.get(p) ?? IDENTITY_POSE
                const inner = innerPose(g.authored, g.matrix)
                const above = parent >= 0 ? scales[slot.get(parent)!]! : null
                const kx = (above ? above.x : 1) * pose.sx * inner.sx
                const ky = (above ? above.y : 1) * pose.sy * inner.sy
                // the pose last written was applied about the origin of the
                // box presented at capture (§4.2): its fractions (a driven
                // node's as its pose was planned) of that box, not A's offset
                const f = frozen.get(p)?.geometry ?? g
                const w = rect.w / kx
                const h = rect.h / ky
                const origin: readonly [number, number] = [
                    Number.isFinite(w) ? f.fx * w : g.ox - css.x,
                    Number.isFinite(h) ? f.fy * h : g.oy - css.y,
                ]
                slot.set(i, nodes.length)
                of.push(i)
                scales.push({ x: kx, y: ky })
                nodes.push({
                    parent: parent >= 0 ? slot.get(parent)! : -1,
                    rect,
                    pose,
                    inner,
                    origin,
                })
            })
            // L_k = R_parent ∘ Q about L_k's origin: divide the inner maps
            // back out top-down to recover each L_k's CSS box
            const rests: Map2[] = []
            presentedLayoutBoxes(nodes).forEach((box, k) => {
                const node = nodes[k]!
                const parentRest =
                    node.parent >= 0 ? rests[node.parent]! : IDENTITY_MAP
                const [ox, oy] = node.origin
                const q = node.inner
                const css = unmapOwn(mapBox(invert(parentRest), box), {
                    kx: q.sx,
                    ky: q.sy,
                    tx: q.tx,
                    ty: q.ty,
                    ox,
                    oy,
                })
                rests.push(
                    compose(parentRest, aboutOrigin(q, css.x + ox, css.y + oy))
                )
                presented[of[k]!] = { css, origin: node.origin }
            })
            // v is the presented box's true velocity: the product rule
            // through every presented parent map, applied to the presented
            // CSS box (§4.2 Velocity), not the track's own box alone; each
            // map about the origin applied at capture, as for L_k
            presentedVelocities(
                nodes,
                of.map((i) => engine.poseRates.get(list[i]!) ?? null)
            ).forEach((v, k) => {
                velocity.set(list[of[k]!]!, v)
            })
        }

        const reduced = reducedMode()
        const ids = new Map<string, IdHistory>()
        const at = now()
        for (const [id, entry] of retained) {
            if (entry.until < at) retained.delete(id)
        }
        const idsOf = (): Map<string, IdHistory> => {
            ids.clear()
            if (shared === 0) return ids
            for (const p of list) {
                const id = p.options.layoutId
                if (id === undefined || ids.has(id)) continue
                const previous = leads.get(id)
                const lead =
                    previous && !previous.removed
                        ? index.get(previous)
                        : undefined
                const kept = lead === undefined ? retained.get(id) : undefined
                ids.set(id, {
                    lead: lead ?? null,
                    retained: kept?.box ?? null,
                    retainedVelocity: kept?.velocity ?? null,
                })
            }
            return ids
        }

        /**
         * Every running track's A and `L_k`, and its parent's, under the
         * presence matrices frozen with the track (§3.2): the keep test
         * compares them there (§5.7), so a presence layer changed since is
         * not a move. Parents first.
         */
        const plannedBoxes = (): ({
            own: Box
            parent: Box | null
            presented: Box | null
            parentPresented: Box | null
        } | null)[] => {
            const rests: (Map2 | null)[] = []
            const matrices: (Matrix | null)[] = []
            /** The rest map of `i`'s ancestors under the matrices of its own flush. */
            const epochRest = (
                i: number,
                ancestry: ReadonlyMap<Participant, Matrix>,
                fallback: Map2
            ): Map2 => {
                const chain: number[] = []
                for (let k = parents[i]!; k >= 0; k = parents[k]!)
                    chain.unshift(k)
                const differs = chain.some((k) => {
                    const m = ancestry.get(list[k]!) ?? IDENTITY_MATRIX
                    return matrices[k] && !sameMatrix(m, matrices[k]!)
                })
                if (!differs) return fallback
                let rest = IDENTITY_MAP
                for (const k of chain) {
                    const ga = geometry[k]
                    const m = ancestry.get(list[k]!) ?? IDENTITY_MATRIX
                    if (!ga || !m) return fallback
                    const au = list[k]!.drive?.authored ?? ga.authored
                    rest = compose(rest, innerOf(au, m, ga.ox, ga.oy))
                }
                return rest
            }
            /**
             * The rest map of `i`'s ancestors' `L_k` under the matrices of
             * its own flush, each about its `L_k`'s origin; null when one has
             * no `L_k`.
             */
            const presentedRest = (
                i: number,
                ancestry: ReadonlyMap<Participant, Matrix>
            ): Map2 | null => {
                const chain: number[] = []
                for (let k = parents[i]!; k >= 0; k = parents[k]!)
                    chain.unshift(k)
                let rest = IDENTITY_MAP
                for (const k of chain) {
                    const ga = geometry[k]
                    const lk = presented[k]
                    const m = ancestry.get(list[k]!) ?? IDENTITY_MATRIX
                    if (!ga || !lk || !m) return null
                    const au = list[k]!.drive?.authored ?? ga.authored
                    rest = compose(
                        rest,
                        innerOf(
                            au,
                            m,
                            lk.css.x + lk.origin[0],
                            lk.css.y + lk.origin[1]
                        )
                    )
                }
                return rest
            }
            return list.map((p, i) => {
                const g = geometry[i]
                const parent = parents[i]!
                const parentRest =
                    parent >= 0
                        ? (rests[parent] ??
                          geometry[parent]?.rest ??
                          IDENTITY_MAP)
                        : IDENTITY_MAP
                if (!g) {
                    rests.push(null)
                    matrices.push(null)
                    return null
                }
                const was = frozen.get(p)
                const m = (was?.geometry ?? g).matrix
                const au = p.drive?.authored ?? g.authored
                const inner = innerOf(au, m, g.ox, g.oy)
                rests.push(compose(parentRest, inner))
                matrices.push(m)
                if (!was) return null
                const css = mapBox(invert(g.inner), g.box)
                const base = epochRest(i, was.ancestry, parentRest)
                const gp = parent >= 0 ? geometry[parent] : null
                // L_k through the same matrices, each about L_k's own origin
                const lk = presented[i]
                const lkBase = lk ? presentedRest(i, was.ancestry) : null
                const lkParent = parent >= 0 ? presented[parent] : null
                return {
                    own: mapBox(base, mapBox(inner, css)),
                    // the parent's CSS box through the same ancestors
                    parent: gp
                        ? mapBox(base, mapBox(invert(gp.inner), gp.box))
                        : null,
                    presented:
                        lk && lkBase
                            ? mapBox(
                                  lkBase,
                                  mapBox(
                                      innerOf(
                                          au,
                                          m,
                                          lk.css.x + lk.origin[0],
                                          lk.css.y + lk.origin[1]
                                      ),
                                      lk.css
                                  )
                              )
                            : null,
                    parentPresented:
                        lkParent && lkBase
                            ? mapBox(lkBase, lkParent.css)
                            : null,
                }
            })
        }

        /** A frame node's participant ancestors when its track was planned, nearest first. */
        const frameChainOf = (node: FrameNode): Participant[] => {
            const chain: Participant[] = []
            for (let k = node.parent; k >= 0; k = frame[k]!.parent)
                chain.push(frame[k]!.p)
            return chain
        }
        const planned = frame.length === 0 || skipsKeeps ? [] : plannedBoxes()

        /**
         * Per running track, its re-expression (§5.7): `δ = A_new − A_old` of
         * its origin channels (both rest boxes, each in its own flush's view
         * space), whether translating by it is exact (path 2's condition),
         * and the path, decided by the measured jump `J = D − B`: `D` this
         * flush's rect, read before any write under the pose last written,
         * `B` the fresh capture's. Without a B there is no J and no path
         * (§4.4 decides). A track whose ancestors changed since it was
         * planned retargets.
         */
        const reexpress =
            frame.length === 0 || skipsKeeps
                ? []
                : list.map((p, i) => {
                      const d = p.drive
                      const was = frozen.get(p)
                      const own = planned[i]?.own
                      if (!runs(d) || !was || !own) return null
                      const track = d!.track!
                      const dx = own.x + track.fx * own.w - track.a[0]
                      const dy = own.y + track.fy * own.h - track.a[1]
                      const before = frameChainOf(was)
                      const ancestors: KeepAncestor[] = []
                      let same = true
                      let n = 0
                      for (let k = parents[i]!; k >= 0; k = parents[k]!, n++) {
                          const a = list[k]!
                          const ga = geometry[k]
                          const fa = frozen.get(a)
                          if (a !== before[n] || !ga || !fa) {
                              same = false
                              break
                          }
                          const pose = engine.poses.get(a) ?? IDENTITY_POSE
                          const innerNow = innerPose(ga.authored, ga.matrix)
                          const innerPlanned = innerPose(
                              fa.geometry.authored,
                              was.ancestry.get(a) ?? IDENTITY_MATRIX
                          )
                          ancestors.push({
                              pose: { sx: pose.sx, sy: pose.sy },
                              innerNow: { sx: innerNow.sx, sy: innerNow.sy },
                              innerPlanned: {
                                  sx: innerPlanned.sx,
                                  sy: innerPlanned.sy,
                              },
                          })
                      }
                      if (n !== before.length) same = false
                      const b = fresh?.rects.get(p)
                      const raw = rects[i]!
                      const path: KeepPath | null = b
                          ? same
                              ? keepPath({
                                    jump: {
                                        x: raw.x - b.x,
                                        y: raw.y - b.y,
                                        w: raw.w - b.w,
                                        h: raw.h - b.h,
                                    },
                                    ancestors,
                                })
                              : 'retarget'
                          : null
                      const exact = same && translationExact(ancestors)
                      return { dx, dy, exact, path }
                  })

        /** The last known box of an undriven node (§4.4). */
        const lastKnownOf = (i: number): Box | null =>
            (fresh ? null : cap?.rects.get(list[i]!)) ?? lastBoxes?.[i] ?? null
        /**
         * `β_π` (§4.4): how far the parent participant's local frame moved
         * on screen. A driven parent's own `β`; an undriven parent's box
         * displacement on any edge between its last known box and its A
         * (Infinity with none); 0 at the top level.
         */
        const frameOf = (i: number): number => {
            const k = parents[i]!
            if (k < 0) return 0
            if (runs(list[k]!.drive)) return boundOf(k)
            const from = lastKnownOf(k)
            if (!from) return Number.POSITIVE_INFINITY
            const to = geometry[k]?.a ?? rects[k]!
            return Math.max(
                Math.abs(to.x - from.x),
                Math.abs(to.y - from.y),
                Math.abs(to.x + to.w - from.x - from.w),
                Math.abs(to.y + to.h - from.y - from.h)
            )
        }
        const bounds: (number | undefined)[] = list.map(() => undefined)
        /**
         * `β` of a driven node (§4.4), top-down: `β_π` plus the bound from
         * the change of its layout box in its parent participant's local
         * frame since the previous flush, its own pose scale and origin, and
         * the parent's raw rect and layout sizes at this flush. Infinity when
         * an input is unknown (a new or reparented node, an unmeasured
         * parent).
         */
        const boundOf = (i: number): number => {
            const known = bounds[i]
            if (known !== undefined) return known
            const value = ownBound(i)
            bounds[i] = value
            return value
        }
        const ownBound = (i: number): number => {
            const p = list[i]!
            const parent = parents[i]!
            const was = lastGeometry?.[i]
            const g = geometry[i]
            const parentNow = parent >= 0 ? list[parent]! : null
            if (!g || !was || lastParent?.[i] !== parentNow) {
                return Number.POSITIVE_INFINITY
            }
            /** The node's CSS box relative to its parent's, in its parent's local frame. */
            const local = (own: Geometry, of: Geometry | null): Box => {
                const css = mapBox(invert(own.inner), own.box)
                if (!of) return css
                const base = mapBox(invert(of.inner), of.box)
                return {
                    x: css.x - base.x,
                    y: css.y - base.y,
                    w: css.w,
                    h: css.h,
                }
            }
            const gp = parent >= 0 ? geometry[parent] : null
            const wasParent = parent >= 0 ? lastGeometry![parent] : null
            if (parent >= 0 && (!gp || !wasParent)) {
                return Number.POSITIVE_INFINITY
            }
            const now = local(g, gp ?? null)
            const then = local(was, wasParent ?? null)
            const pose = engine.poses.get(p) ?? IDENTITY_POSE
            let parentInput: ScreenBoundInput['parent'] = null
            if (parent >= 0) {
                const [ow, oh] = offsets[parent]!
                const exact =
                    ow > 1 && oh > 1 ? null : borderSize(styleOf(parent))
                parentInput = {
                    rect: { w: rects[parent]!.w, h: rects[parent]!.h },
                    size: {
                        w: ow > 1 ? ow - 1 : (exact?.[0] ?? 0),
                        h: oh > 1 ? oh - 1 : (exact?.[1] ?? 0),
                    },
                }
            }
            return screenBound({
                change: {
                    x: now.x - then.x,
                    y: now.y - then.y,
                    w: now.w - then.w,
                    h: now.h - then.h,
                },
                pose: { sx: pose.sx, sy: pose.sy },
                origin: { fx: g.fx, fy: g.fy },
                parent: parentInput,
                frame: frameOf(i),
            })
        }

        /** Why each node cannot be animated exactly, for its warning. */
        const why: (string | null)[] = list.map(() => null)
        /** Each node's exiting presence, walked once for the whole plan. */
        const exitingMemo = new Map<Element, PresenceLink | null>()
        const exitingNow = (p: Participant): boolean =>
            exitingPresence(p.element, tree, exitingMemo) !== null
        const planNodes = (): (PlanNode | null)[] => {
            return list.map((p, i) => {
                const g = geometry[i]
                const a = g?.a ?? rects[i]!
                const d = p.drive
                // B is a measurement of what was presented, driven or not
                const before = beforeRects[i] ?? null
                /**
                 * A top-level participant with no drive anywhere in its
                 * subtree, no shared id (the scope has none), no hold, a valid
                 * measurement and a box that did not move cannot animate,
                 * snap or report: the plan's action for it is `none`. It is
                 * left out of the plan array entirely; every consumer uses
                 * the index-aligned list, so the shape is unchanged.
                 */
                if (
                    shared === 0 &&
                    d === null &&
                    parents[i]! < 0 &&
                    !hasChild[i] &&
                    !subtreeDriven[i] &&
                    !p.keyChanged &&
                    !unmeasured[i] &&
                    p.hold === null &&
                    !scrollActive[i] &&
                    unowned[i] === null &&
                    (g === null || g === undefined || g.unsupported === null) &&
                    before !== null &&
                    Math.abs(before.x - a.x) < threshold &&
                    Math.abs(before.y - a.y) < threshold &&
                    Math.abs(before.w - a.w) < threshold &&
                    Math.abs(before.h - a.h) < threshold
                ) {
                    why[i] = null
                    return null
                }
                const moving = runs(d)
                const holding =
                    moving && !d!.timeline && d!.elapsed < d!.track!.delay
                const options = p.options
                // the node's own classified cause names the failure first
                let unsupported = g?.unsupported ?? unowned[i] ?? null
                if (waapi && !unsupported) {
                    if (parents[i]! >= 0 || hasChild[i])
                        unsupported =
                            "a nested participant (the 'waapi' engine)"
                    else if (!supportsLinearEasing())
                        unsupported = 'no CSS linear() easing'
                }
                if (!unsupported && (a.w <= 0 || a.h <= 0))
                    unsupported = 'zero size'
                if (!unsupported && before) {
                    const rx = before.w / a.w
                    const ry = before.h / a.h
                    if (
                        before.w <= 0 ||
                        before.h <= 0 ||
                        rx < MIN_SCALE ||
                        rx > MAX_SCALE ||
                        ry < MIN_SCALE ||
                        ry > MAX_SCALE
                    ) {
                        unsupported = 'a size change beyond 50×'
                    }
                }
                const hasDependency = 'layoutDependency' in options
                const presence =
                    shared === 0 ? undefined : presenceOf(p.element)
                let underHold = p.hold !== null
                if (anyHold && !underHold) {
                    for (let a = p.parent; a && !underHold; a = a.parent) {
                        const h = a.hold
                        underHold = h !== null && isLiveHold(h)
                    }
                }
                why[i] = unsupported
                const node = (p.planNode ??=
                    {} as PlanNode) as Mutable<PlanNode>
                node.parent = parents[i]!
                node.order = p.order
                node.a = a
                node.fx = g?.fx ?? 0.5
                node.fy = g?.fy ?? 0.5
                node.before = before
                // the WAAPI engine has no velocity term (§10)
                node.velocity =
                    moving && !holding && !waapi
                        ? (velocity.get(p) ?? null)
                        : null
                node.moving = moving
                node.track = moving ? d!.track : null
                node.trackTarget = moving ? d!.target : null
                node.planned = moving ? (planned[i]?.own ?? null) : null
                node.parentPlanned = moving
                    ? (planned[i]?.parent ?? null)
                    : null
                node.presented = moving ? (planned[i]?.presented ?? null) : null
                node.parentPresented = moving
                    ? (planned[i]?.parentPresented ?? null)
                    : null
                node.path = moving
                    ? skipsKeeps
                        ? 'retarget'
                        : (reexpress[i]?.path ?? 'retarget')
                    : null
                node.mode = options.layout ?? true
                node.anchor = options.layoutAnchor ?? null
                node.motion = motionOf(p, reduced)
                node.layoutId = p.keyChanged ? null : (options.layoutId ?? null)
                node.crossfade = options.layoutCrossfade ?? true
                node.exiting = shared === 0 ? false : exitingNow(p)
                node.presenceOpacity = presence?.opacity ?? false
                node.focusInside = focusChain?.has(p.element) ?? false
                node.unsupported = unsupported !== null
                node.skip =
                    p.keyChanged ||
                    p.hold !== null ||
                    underHold ||
                    (hasDependency &&
                        p.dependency !== null &&
                        Object.is(p.dependency.value, options.layoutDependency))
                // a changed reduced-motion mode re-plans a running track
                node.optionsChanged =
                    p.changed || (moving && d!.mode !== reduced)
                node.following =
                    d?.kind === 'follow' && d.lead
                        ? (index.get(d.lead) ?? -1)
                        : -1
                node.measured = !unmeasured[i]
                node.lateRegistered = lateRegisteredNow[i]!
                node.scrollActive = scrollActive[i]!
                return node
            })
        }

        /**
         * §5.8: whether each node would fly from a box measured inside an
         * actively scrolling container that it is outside of now. A handoff
         * takes over the departing node's box (measured at this flush's
         * capture, or retained from the capture before its removal); a
         * reparent takes the node out of a container. Reads (the fixed test of
         * a lead against the document scroller) happen before any write.
         */
        /**
         * H18-A: a late registrant is measured for handoff purposes when its
         * parent is measured, or is itself a late registrant under the same
         * rule (walked parents first). The new detail frame and its nested
         * image mount in one commit; the frame takes the departing frame's
         * box, so the image's parent is measured in this plan. The same
         * eligibility decides the scroll-active handoff check below.
         */
        const lateRegisteredNow: boolean[] = []
        list.forEach((p, i) => {
            const parent = parents[i]!
            const registered =
                fresh !== null &&
                (p.order <= fresh.registeredThrough || fresh.added.has(p))
            lateRegisteredNow.push(
                fresh !== null &&
                    !p.keyChanged &&
                    !registered &&
                    (parent < 0 ||
                        !unmeasured[parent] ||
                        lateRegisteredNow[parent]!)
            )
        })
        const scrollActive = list.map(() => false)
        if (
            fresh &&
            (fresh.scrolling.size > 0 ||
                [...retained.values()].some((r) => r.scrolling.length > 0))
        ) {
            // every container a departing node was inside, but the document
            const departed = new Set<EventTarget>()
            for (const containers of fresh.scrolling.values()) {
                for (const c of containers) departed.add(c)
            }
            for (const r of retained.values()) {
                for (const c of r.scrolling) departed.add(c)
            }
            departed.delete(scopeDocument!)
            /** Each node's containers now: one walk per DOM node for the flush. */
            const around = ancestorsAmong(departed, tree)
            const now: (readonly EventTarget[] | undefined)[] = []
            const fixed: (boolean | undefined)[] = []
            /**
             * `containers` holds node `i` no longer: a container that is not a
             * proper flat-tree ancestor now, or the document scroller when the
             * node is viewport-fixed (an `offsetParent` walk, run once).
             */
            const outside = (
                containers: readonly EventTarget[] | undefined,
                i: number
            ) =>
                containers?.some((c) => {
                    if (c === scopeDocument) {
                        fixed[i] ??= viewportFixed(list[i]!.element, stats)
                        return fixed[i]!
                    }
                    now[i] ??= around(flat[i]!)
                    return !now[i]!.includes(c)
                }) ?? false
            const changes = leadChanges(
                list.map((p) => ({
                    layoutId: p.keyChanged
                        ? null
                        : (p.options.layoutId ?? null),
                    exiting: exitingNow(p),
                    order: p.order,
                })),
                idsOf()
            )
            for (const { id, index: i, from } of changes) {
                // without a valid B on either side nothing is handed over; a
                // node registered after the capture may still take the
                // departing lead's box (OPS-10)
                // the same late-registrant cascade as the plan (H18-A)
                const lateWithHandoff = lateRegisteredNow[i]!
                if (from === null || (unmeasured[i] && !lateWithHandoff)) {
                    continue
                }
                if (from !== 'retained' && unmeasured[from]) continue
                const departing =
                    from === 'retained'
                        ? retained.get(id)?.scrolling
                        : fresh.scrolling.get(list[from]!)
                if (outside(departing, i)) scrollActive[i] = true
            }
            // a reparent: the participant as captured departs, the same one
            // at this flush is the new lead; it can leave the document
            // scroller only by a change of its flat parent since the capture
            list.forEach((p, i) => {
                if (scrollActive[i] || unmeasured[i] || p.keyChanged) return
                const containers = fresh.scrolling.get(p)
                if (!containers) return
                const reparented = fresh.flat.get(p) !== flat[i]
                if (
                    outside(
                        reparented
                            ? containers
                            : containers.filter((c) => c !== scopeDocument),
                        i
                    )
                ) {
                    scrollActive[i] = true
                }
            })
        }

        // 2. plan; measure what it animates; plan again until nothing new
        let nodes = planNodes()
        let result = plan({
            nodes,
            ids: idsOf(),
            viewport,
            threshold,
            maxNodes,
            leadless: shared === 0,
        })
        for (;;) {
            const wanted = result.actions.map(
                (action) => action.kind !== 'none'
            )
            const added = measureNodes(wanted)
            let verdicts = false
            if (added.length > 0) {
                const now = supportNow()
                verdicts = now.some((r, i) => r !== unowned[i])
                unowned = now
            }
            // the plan assumed a centred origin and support for every node it
            // had not measured; it is redone only when that assumption failed
            const assumed =
                !verdicts &&
                added.every((i) => {
                    const g = geometry[i]!
                    return (
                        g.unsupported === null && g.fx === 0.5 && g.fy === 0.5
                    )
                })
            if (assumed) break
            nodes = planNodes()
            result = plan({
                nodes,
                ids: idsOf(),
                viewport,
                threshold,
                maxNodes,
                leadless: shared === 0,
            })
        }

        // bookkeeping that does not depend on the outcome
        list.forEach((p, i) => {
            p.parent = parents[i]! >= 0 ? list[parents[i]!]! : null
            if (geometry[i]) p.geometry = geometry[i]
            p.lastBox = geometry[i]?.a ?? rects[i]!
            p.changed = false
            p.keyChanged = false
            p.dependency =
                'layoutDependency' in p.options
                    ? { value: p.options.layoutDependency }
                    : null
        })
        for (const [id, lead] of result.leads) leads.set(id, list[lead]!)
        if (shared > 0)
            for (const p of list) {
                const id = p.options.layoutId
                if (id === undefined || result.leads.has(id) || exitingNow(p)) {
                    continue
                }
                const current = leads.get(id)
                if (!current || current.removed || p.order >= current.order) {
                    leads.set(id, p)
                }
            }
        for (const warning of result.warnings) {
            if (warning.kind === 'duplicate-id') {
                warn(
                    `duplicate:${warning.id}`,
                    `two live participants share layoutId "${warning.id}"; the newest leads and the other animates on its own.`
                )
            } else if (warning.kind === 'spring-timeout') {
                const m = list[warning.index]!.motion?.value
                warn(
                    'spring-timeout',
                    `a spring would take longer than 10 s to settle${m?.kind === 'spring' ? ` (duration ${m.duration} s, bounce ${m.bounce})` : ''}, so the node snaps 'unsupported'. Lower the bounce or the duration.`
                )
            } else {
                warn(
                    'presence-opacity',
                    'presence animates opacity on a layoutId participant, so it hands off without a crossfade. Animate opacity on a child instead.'
                )
            }
        }
        // §5.8 degradations are not snaps: `report.snapped` does not list
        // them; their reason names the diagnostic
        // §5.8 degradations are not snaps: `report.snapped` does not list
        // them; their diagnostic names the degradation (emitted at outcome)

        /**
         * P4-C4: a held node and its riding descendants are visible movers.
         * The plan does not count them (their origin is outside the track
         * plan), so fold them into the mover cap here; exceeding it caps the
         * whole flush and invalidates every hold.
         */
        const holdMoverIndices = new Set<number>()
        if (anyHold)
            for (let i = 0; i < list.length; i++) {
                const held = isLiveHold(list[i]!.hold)
                if (!held) continue
                holdMoverIndices.add(i)
                for (const q of descendantsOf(list[i]!.element)) {
                    const qi = index.get(q)
                    if (qi !== undefined) holdMoverIndices.add(qi)
                }
            }
        const actionMovers = result.actions.filter(
            (action) =>
                action.kind === 'track' ||
                action.kind === 'keep' ||
                action.kind === 'follow'
        ).length
        if (
            result.status !== 'capped' &&
            holdMoverIndices.size > 0 &&
            actionMovers + holdMoverIndices.size > maxNodes
        ) {
            const cappedSnaps = [...result.snapped]
            const seen = new Set(cappedSnaps.map((entry) => entry.index))
            for (let i = 0; i < result.actions.length; i++) {
                const kind = result.actions[i]!.kind
                if (
                    (kind === 'track' ||
                        kind === 'keep' ||
                        kind === 'follow') &&
                    !seen.has(i)
                ) {
                    seen.add(i)
                    cappedSnaps.push({ index: i, reason: 'capped' })
                }
            }
            for (const i of holdMoverIndices) {
                if (seen.has(i)) continue
                seen.add(i)
                cappedSnaps.push({ index: i, reason: 'capped' })
            }
            result = {
                ...result,
                status: 'capped',
                actions: list.map(() => ({ kind: 'none' as const })),
                snapped: cappedSnaps,
                degraded: [],
            }
        }

        // 3. outcome
        const snapped: { element: HTMLElement; reason: SnapReason }[] =
            result.snapped.map(({ index: i, reason }) => ({
                element: list[i]!.element,
                reason,
            }))
        let actions: readonly Action[] = result.actions
        /** §4.3 gate 1: mode `'snap'` disables every mover of this flush. */
        const disabledMovers: number[] = []
        if (layoutRuntime.mode === 'snap') {
            if (result.status === 'capped') {
                // the plan capped movers; `'disabled'` precedes `'capped'` (§9.3)
                for (const entry of result.snapped) {
                    if (entry.reason === 'capped')
                        disabledMovers.push(entry.index)
                }
            } else {
                result.actions.forEach((action, i) => {
                    if (
                        action.kind === 'track' ||
                        action.kind === 'keep' ||
                        action.kind === 'follow'
                    ) {
                        disabledMovers.push(i)
                    }
                })
            }
            if (disabledMovers.length > 0) {
                actions = result.actions.map(() => ({ kind: 'none' }) as const)
                for (const i of disabledMovers) {
                    const element = list[i]!.element
                    // the earlier status replaces the plan's `capped` entry
                    const was = snapped.findIndex(
                        (entry) =>
                            entry.element === element &&
                            entry.reason === 'capped'
                    )
                    if (was >= 0) snapped.splice(was, 1)
                    snapped.push({ element, reason: 'disabled' })
                }
            }
        }
        const disabled = disabledMovers.length > 0
        const capped = result.status === 'capped' && !disabled
        if (capped) {
            // the cap displaces the running tracks: their reports are
            // interrupted, not ended (§9.3, OPS-19)
            for (const p of registry.values()) {
                if (p.drive?.run) interrupt(p.drive.run)
            }
            // P4-C4: a capped flush invalidates every live hold and stops its
            // read; the held node/riders are reported as capped
            for (const p of list) {
                const hold = p.hold
                if (!isLiveHold(hold)) continue
                hold.state = 'invalidated'
                invalidateHold(p)
                if (p.drive) settle(p)
            }
            for (const p of list) {
                if (!p.ride) continue
                p.ride = null
                if (p.drive) settle(p)
            }
        } else if (disabled) {
            // a flush that meets the kill switch reports its movers disabled
            for (const run of [...liveRuns]) {
                if (run.resolved) continue
                const nodes = [...run.nodes]
                resolveRun(
                    run,
                    'disabled',
                    nodes.map((p) => ({
                        element: p.element,
                        reason: 'disabled' as const,
                    }))
                )
            }
        }
        // a late-registered lead that took a handoff has a valid B (the
        // departing box), whether or not it needs a track: it is measured
        // for the §4.4 report too (N1)
        if (fresh) {
            for (const i of result.handoffs.keys()) unmeasured[i] = false
            // a scroll-degraded handoff appears at A/its enter, reported
            // handoff-scroll-active, never stale
            for (const { index } of result.degraded) unmeasured[index] = false
        }
        /** §4.4: the nodes reported `'stale'`, with the flush's diagnostic code. */
        const staleReportedAt: number[] = []
        if (!capped && reduced === 'jump' && !disabled) {
            actions.forEach((action, i) => {
                if (
                    action.kind === 'track' ||
                    action.kind === 'follow' ||
                    action.kind === 'keep'
                ) {
                    snapped.push({
                        element: list[i]!.element,
                        reason: 'reduced',
                    })
                }
            })
            actions = actions.map(() => ({ kind: 'none' }) as const)
        }
        if (stale) {
            // §4.4: every node without a valid B that may have jumped is
            // reported, once
            const reported = list.map(() => false)
            const already = new Set(snapped.map((s) => s.element))
            result.actions.forEach((action, i) => {
                const p = list[i]!
                const node = nodes[i]!
                if (!unmeasured[i] || already.has(p.element) || node.skip)
                    return
                const r = reexpress[i]
                if (action.kind === 'keep') {
                    reported[i] = staleReported(
                        {
                            driven: true,
                            a: node.a,
                            lastKnown: null,
                            bound: r ? boundOf(i) : Number.POSITIVE_INFINITY,
                            translationExact: r?.exact ?? false,
                        },
                        threshold,
                        () => 0
                    )
                } else if (action.kind !== 'follow') {
                    reported[i] = staleReported(
                        {
                            driven: false,
                            a: node.a,
                            // the aged capture's box; with a fresh capture
                            // this node is judged as if it had none
                            lastKnown: lastKnownOf(i),
                            bound: 0,
                            translationExact: true,
                        },
                        threshold,
                        (from, to) =>
                            moved(from, to, {
                                mode: node.mode,
                                anchor: null,
                                fx: node.fx,
                                fy: node.fy,
                            })
                    )
                }
            })
            // a continuing crossfade follower is drawn at its lead
            result.actions.forEach((action, i) => {
                if (
                    action.kind === 'follow' &&
                    !already.has(list[i]!.element) &&
                    reported[action.lead]
                ) {
                    reported[i] = true
                }
            })
            list.forEach((p, i) => {
                if (!reported[i]) return
                staleReportedAt.push(i)
                snapped.push({ element: p.element, reason: 'stale' })
            })
        }
        for (const { element, reason } of snapped) {
            if (reason === 'unsupported') {
                const i = index.get(registry.get(element)!)!
                warn(
                    'unsupported',
                    `a participant cannot be animated exactly and snaps (${why[i] ?? 'unsupported'}).`
                )
            } else if (reason === 'capped') {
                warn(
                    'capped',
                    `more than ${maxNodes} visible participants moved at once; the change snaps. Raise maxNodes or narrow the scope.`
                )
            } else if (reason === 'stale') {
                warn(
                    'stale',
                    'no valid measurement of what was presented (capture-less or aged flush), so participants that moved appear at their new layout without motion. Call capture() (or update()) in the task that changes the DOM.'
                )
            }
        }

        // diagnostics: the same degradations, typed and versioned (§7.2)
        const springTimeouts = new Set<number>()
        for (const warning of result.warnings) {
            if (warning.kind !== 'spring-timeout') continue
            springTimeouts.add(warning.index)
            diagnose('spring-timeout', 'snap', {
                element: list[warning.index]!.element,
                reason: 'unsupported',
                springSettleMs: warning.settleMs,
            })
        }
        for (const { element, reason } of snapped) {
            if (reason !== 'unsupported') continue
            const i = index.get(registry.get(element)!)!
            if (springTimeouts.has(i)) continue
            diagnose('unsupported-geometry', 'snap', {
                element,
                reason,
            })
        }
        if (capped && result.status === 'capped') {
            diagnose('mover-cap', 'snap')
        }
        for (const i of disabledMovers) {
            diagnose('runtime-disabled', 'snap', {
                element: list[i]!.element,
                reason: 'disabled',
            })
        }
        for (const { index: i, reason } of result.degraded) {
            if (disabled) continue
            // §5.8, §8: a degradation, not a snap; focus in the exiting
            // follower skips the pair's crossfade, nothing is moved
            diagnose(
                reason,
                reason === 'focus-in-follower' ? 'none' : 'enter',
                {
                    element: list[i]!.element,
                }
            )
        }
        if (staleReportedAt.length > 0) {
            const code: LayoutDiagnosticCode | null =
                cap === null || cap.capped
                    ? 'capture-less-flush'
                    : cap.aged
                      ? 'capture-aged'
                      : 'capture-less-flush'
            for (const i of staleReportedAt) {
                diagnose(code, 'snap', {
                    element: list[i]!.element,
                    reason: 'stale',
                })
            }
        } else if (cap === null || cap.capped || cap.aged) {
            diagnose(
                cap === null || cap.capped
                    ? 'capture-less-flush'
                    : 'capture-aged',
                'snap'
            )
        }

        // 4. apply: every write happens after every read
        let run: Run | null = null
        let promise: Promise<LayoutReport> | null = null
        if (actions.some((a) => a.kind === 'track')) {
            promise = new Promise<LayoutReport>((resolve) => {
                const created: Run = {
                    id,
                    nodes: new Set(),
                    all: new Set(),
                    snapped,
                    resolve,
                    done: false,
                    resolved: false,
                    pending: null,
                }
                liveRuns.add(created)
                run = created
            })
        }
        const startDrive = (
            p: Participant,
            kind: Drive['kind'],
            g: Geometry,
            properties: readonly string[]
        ): Drive =>
            ensureDrive(
                p,
                kind,
                g,
                properties,
                reduced,
                anchorFallback && !waapi
            )

        // Radius handoff state comes from B's radii, measured by the fresh
        // capture, or from a retained removed lead (§4.1, §5.8, §5.9).
        const radiusBlendFrom = new Map<
            number,
            Pick<RadiusBlend, 'from' | 'to'>
        >()
        if (shared > 0)
            actions.forEach((action, i) => {
                if (action.kind !== 'track' || !ownsRadius(list[i]!.options))
                    return
                const target = geometry[i]?.radius
                if (!target) return
                let source: readonly number[] | null = null
                if (action.handoffFrom !== undefined) {
                    if (action.handoffFrom >= 0) {
                        const previous = list[action.handoffFrom]!
                        if (!ownsRadius(previous.options)) return
                        source = fresh?.radius.get(previous) ?? null
                    } else {
                        const id = list[i]!.options.layoutId
                        source =
                            id === undefined
                                ? null
                                : (retained.get(id)?.radius ?? null)
                    }
                } else if (list[i]!.drive?.radiusBlend) {
                    // A retarget of a running blend starts from what is painted.
                    source = fresh?.radius.get(list[i]!) ?? null
                }
                if (!source) return
                radiusBlendFrom.set(i, { from: source, to: target })
            })

        // A pair that reverses mid-crossfade swaps roles. Sample both
        // layers before any drive is mutated so neither opacity pops (§5.6).
        const fadeFrom = new Map<
            number,
            { readonly lead: number; readonly follower: number }
        >()
        if (shared > 0)
            actions.forEach((action, i) => {
                if (action.kind !== 'track' || !action.fadeLead) return
                const leadFade = list[i]!.drive?.fade
                if (leadFade?.role !== 'follower' || fadeEnded(leadFade)) return
                const followerIndex = actions.findIndex(
                    (candidate) =>
                        candidate.kind === 'follow' &&
                        candidate.start &&
                        candidate.lead === i
                )
                const followerFade =
                    followerIndex >= 0 ? list[followerIndex]!.drive?.fade : null
                fadeFrom.set(i, {
                    lead: currentFadeOpacity(leadFade),
                    follower:
                        followerFade?.role === 'lead' &&
                        !fadeEnded(followerFade)
                            ? currentFadeOpacity(followerFade)
                            : 1,
                })
            })

        /**
         * Kept tracks under a participant ancestor that keep their pose
         * timeline (§5.7 path 1; §4.4, whose pose stays relative to its
         * layout box): their poses are read from one ghost of the frame as
         * drawn at t_k, holding only the nodes those poses depend on.
         */
        const timelines = new Map<number, Timeline>()
        if (actions.some((action) => action.kind === 'keep')) {
            const drawnIndex = new Map<Participant, number>()
            drawnFrame.forEach((node, j) => drawnIndex.set(node.p, j))
            const wanted: [number, number][] = []
            actions.forEach((action, i) => {
                const d = list[i]!.drive
                if (
                    action.kind !== 'keep' ||
                    parents[i]! < 0 ||
                    !d ||
                    d.timeline ||
                    !runs(d) ||
                    (reexpress[i]?.path === 'translate' && !unmeasured[i])
                ) {
                    return
                }
                const j = drawnIndex.get(list[i]!)
                if (j !== undefined) wanted.push([i, j])
            })
            if (wanted.length > 0) {
                const ghostNodes = (drawnNodes ??= solveNodes(drawnFrame))
                const closure = (j: number, into: Set<number>): void => {
                    for (let k = j; k >= 0 && !into.has(k); ) {
                        into.add(k)
                        const lead = ghostNodes[k]!.follow
                        if (lead >= 0) closure(lead, into)
                        k = ghostNodes[k]!.parent
                    }
                }
                const all = new Set<number>()
                for (const [, j] of wanted) closure(j, all)
                const order = [...all].sort((a, b) => a - b)
                const slot = new Map<number, number>()
                order.forEach((j, k) => slot.set(j, k))
                const ghost: Ghost = {
                    nodes: order.map((j) => {
                        const n = ghostNodes[j]!
                        return {
                            ...n,
                            parent: n.parent >= 0 ? slot.get(n.parent)! : -1,
                            follow: n.follow >= 0 ? slot.get(n.follow)! : -1,
                            layers:
                                n.layers?.map((layer) => ({
                                    at: slot.get(layer.at)!,
                                    map: layer.map,
                                })) ?? null,
                            fade: null,
                            radius: null,
                            radiusBlend: null,
                            posed: null,
                        }
                    }),
                    timelines: order.map((j) => drawnState[j]!.timeline),
                    elapsed: order.map((j) => ghostNodes[j]!.elapsed),
                    started: order.map((j) => drawnState[j]!.started),
                    solved: null,
                }
                for (const [i, j] of wanted) {
                    const deps = new Set<number>()
                    closure(j, deps)
                    const g = drawnFrame[j]!.geometry
                    timelines.set(i, {
                        ghost,
                        at: slot.get(j)!,
                        ox: g.ox,
                        oy: g.oy,
                        deps: [...deps].map((k) => slot.get(k)!),
                        done: false,
                    })
                }
            }
        }

        // §8: a pair skipped for focus is not coupled, even when one of its
        // nodes is static under a moving ancestor and does not settle here.
        // A held old follower that is now the lead is settled, not left at
        // opacity 0 and the follower pose (H12-03).
        /**
         * H18-B: a nested kept track whose participant ancestor is re-planned
         * in this flush must keep its own visual track, not its relative pose
         * timeline: the ancestor's own pose changes going forward (a height
         * retarget), so the child is counter-projected through the new parent
         * map. `visualKeeps` marks those nodes.
         */
        const visualKeeps = new Set<number>()
        const replanned = list.map(() => false)
        list.forEach((_, i) => {
            const parent = parents[i]!
            replanned[i] =
                parent >= 0 &&
                (replanned[parent] === true ||
                    actions[parent]!.kind === 'track' ||
                    actions[parent]!.kind === 'follow')
        })
        const focusSettled = new Set<Participant>()
        const planFocus = new Set<number>()
        for (const degraded of result.degraded) {
            if (degraded.reason === 'focus-in-follower')
                planFocus.add(degraded.index)
        }
        /**
         * H12-04/C5: focus inside a **continuing** live or held follower.
         * Keeping the follower interactive while its fade runs — or after it
         * ends, invisible at opacity 0 — creates the duplicate target §8
         * forbids. End the pair here: restore both opacities, release the
         * presence hold and the authored `inert`, emit the diagnostic, and
         * let presence alone draw the follower. The follower's action is
         * skipped below; the lead's position track may continue to A.
         */
        for (const p of focusChain === null ? [] : list) {
            const d = p.drive
            const id = p.options.layoutId
            if (!d || id === undefined || !focusChain?.has(p.element)) continue
            if (planFocus.has(index.get(p)!)) continue
            const leadIndex = result.leads.get(id)
            if (leadIndex === undefined || !d.lead) continue
            if (index.get(d.lead) !== leadIndex) continue
            if (
                !(d.kind === 'follow' && d.fade?.role === 'follower') &&
                d.kind !== 'held'
            ) {
                continue
            }
            const leadDrive = d.lead.drive
            if (leadDrive?.fade?.role === 'lead') dropCrossfade(d.lead)
            diagnose('focus-in-follower', 'none', { element: p.element })
            focusSettled.add(p)
            settle(p)
        }

        const dropFocus = (p: Participant): void => {
            const d = p.drive
            if (d?.kind === 'held') {
                focusSettled.add(p)
                settle(p)
                return
            }
            dropCrossfade(p)
        }
        for (const degraded of result.degraded) {
            if (degraded.reason !== 'focus-in-follower') continue
            const follower = list[degraded.index]!
            dropFocus(follower)
            const id = follower.options.layoutId
            const lead = id === undefined ? undefined : result.leads.get(id)
            if (lead !== undefined && lead !== degraded.index)
                dropFocus(list[lead]!)
        }

        /**
         * §5.10: a held node and every descendant participant riding its
         * inherited displacement stay outside the normal plan. Their origin
         * channels are the hold's (or its release path); a flush updates A,
         * the size target and the options, never the held point.
         */
        const holdAncestor = (p: Participant): DriveHold | null => {
            for (let a = p.parent; a; a = a.parent) {
                const h = a.hold
                if (h !== null && isLiveHold(h)) {
                    return h
                }
            }
            return null
        }
        const liveHoldOf = (p: Participant): DriveHold | null => {
            const h = p.hold
            return isLiveHold(h) ? h : null
        }
        if (layoutRuntime.mode === 'snap') {
            for (const p of list) {
                if (!liveHoldOf(p)) continue
                diagnose('runtime-disabled', 'snap', {
                    element: p.element,
                    reason: 'disabled',
                })
                invalidateHold(p)
                if (p.drive) settle(p)
            }
        }
        // a new view space: the held point is screen space again, and a
        // released path is re-expressed by the fresh capture below
        if (anyHold)
            for (const p of list) {
                const hold = liveHoldOf(p)
                if (!hold) continue
                hold.shiftX = 0
                hold.shiftY = 0
                // H18-C/F: the flush's A read is the support proof and the
                // current layout offset. The next held read must not treat
                // this already-adopted move as a new layout move (which would
                // re-apply its delta and read an offset pair + style again).
                const [layoutLeft, layoutTop] = readLayoutOffset(p.element)
                hold.layoutLeft = layoutLeft
                hold.layoutTop = layoutTop
                hold.rides.clear()
                const g = geometry[index.get(p)!]
                if (!g || unowned[index.get(p)!] || g.unsupported) {
                    // the node follows the failed support check's rule; its
                    // diagnostic comes from the plan's snapped list, once
                    if (!snapped.some((entry) => entry.element === p.element)) {
                        snapped.push({
                            element: p.element,
                            reason: 'unsupported',
                        })
                    }
                    invalidateHold(p)
                    settle(p)
                    continue
                }
                const i = index.get(p)!
                const reducedNow = reducedMode()
                // a released landing follows a policy change at the next flush;
                // a held phase never does (§5.10, §9.4)
                if (hold.state === 'released' && reducedNow === 'jump') {
                    finishHold(hold)
                    continue
                }
                const planNode = nodes[i]!
                const sizeChanged =
                    Math.max(
                        Math.abs(g.a.w - hold.sizeTargetW),
                        Math.abs(g.a.h - hold.sizeTargetH)
                    ) > HOLD_SIZE_TOL
                if (sizeChanged || planNode.optionsChanged) {
                    const pinned =
                        (p.options.layout ?? true) === 'position' ||
                        reducedNow === 'jump'
                    if (pinned) {
                        hold.sizeTrack = null
                        hold.sizeElapsed = 0
                        hold.sizeStarted = false
                        hold.sizeW = g.a.w
                        hold.sizeH = g.a.h
                        hold.sizeVW = 0
                        hold.sizeVH = 0
                    } else {
                        const motion = motionOf(p, reducedNow)
                        const moving =
                            Math.abs(hold.sizeVW) > 1e-6 ||
                            Math.abs(hold.sizeVH) > 1e-6
                        const continues =
                            hold.sizeStarted && hold.sizeTrack !== null
                        const refusal: { settle: number | null } = {
                            settle: null,
                        }
                        const track = createTrack(
                            {
                                x: g.a.x,
                                y: g.a.y,
                                w: hold.sizeW,
                                h: hold.sizeH,
                            },
                            g.a,
                            moving
                                ? {
                                      x: 0,
                                      y: 0,
                                      w: hold.sizeVW,
                                      h: hold.sizeVH,
                                  }
                                : null,
                            g.fx,
                            g.fy,
                            true,
                            moving ? { ...motion, delay: 0 } : motion,
                            null,
                            refusal
                        )
                        if (typeof track === 'string') {
                            if (track === 'spring-timeout') {
                                diagnose('spring-timeout', 'snap', {
                                    element: p.element,
                                    reason: 'unsupported',
                                    springSettleMs:
                                        refusal.settle === null
                                            ? null
                                            : refusal.settle * 1000,
                                })
                            }
                            // a size refusal snaps the size channel to A; the
                            // hold itself continues (the policy never ends it)
                            hold.sizeTrack = null
                            hold.sizeElapsed = 0
                            hold.sizeStarted = false
                            hold.sizeW = g.a.w
                            hold.sizeH = g.a.h
                            hold.sizeVW = 0
                            hold.sizeVH = 0
                        } else {
                            hold.sizeTrack = track
                            hold.sizeElapsed = 0
                            hold.sizeStarted = continues
                        }
                    }
                    hold.sizeTargetW = g.a.w
                    hold.sizeTargetH = g.a.h
                } else if (
                    Math.abs(hold.sizeW - g.a.w) <= HOLD_SIZE_TOL &&
                    Math.abs(hold.sizeH - g.a.h) <= HOLD_SIZE_TOL &&
                    (hold.sizeTrack !== null ||
                        Math.abs(hold.sizeW - g.a.w) > 0 ||
                        Math.abs(hold.sizeH - g.a.h) > 0)
                ) {
                    // one size tolerance: normalize a sub-threshold difference so
                    // release can reach its finish and the clock can stop
                    hold.sizeW = g.a.w
                    hold.sizeH = g.a.h
                    hold.sizeVW = 0
                    hold.sizeVH = 0
                    hold.sizeTargetW = g.a.w
                    hold.sizeTargetH = g.a.h
                }
                if (hold.state === 'released') {
                    const target = hold.releaseTarget
                    const targetOrigin = target
                        ? {
                              x: target.x + g.fx * target.w,
                              y: target.y + g.fy * target.h,
                          }
                        : null
                    const nowOrigin = {
                        x: g.a.x + g.fx * g.a.w,
                        y: g.a.y + g.fy * g.a.h,
                    }
                    const originDelta = targetOrigin
                        ? Math.max(
                              Math.abs(nowOrigin.x - targetOrigin.x),
                              Math.abs(nowOrigin.y - targetOrigin.y)
                          )
                        : Number.POSITIVE_INFINITY
                    const modeChanged = hold.releaseMode !== reducedNow
                    if (
                        hold.releaseTrack &&
                        (originDelta >= HOLD_ORIGIN_TOL ||
                            planNode.optionsChanged ||
                            modeChanged)
                    ) {
                        const b = fresh?.rects.get(p) ?? null
                        const v = velocity.get(p) ?? null
                        const continues = hold.releaseStarted
                        if (b && v) {
                            const motion = motionOf(p, reducedNow)
                            const speed = Math.hypot(v.x, v.y)
                            const track = createTrack(
                                b,
                                g.a,
                                v,
                                g.fx,
                                g.fy,
                                true,
                                speed > 1e-9 ? { ...motion, delay: 0 } : motion,
                                null
                            )
                            if (typeof track !== 'string') {
                                hold.releaseTrack = track
                                hold.releaseElapsed = 0
                                hold.releaseStarted = continues
                                hold.releaseTarget = g.a
                                hold.releaseMode = reducedNow
                                const d = p.drive
                                if (d) {
                                    d.track = track
                                    d.target = g.a
                                    d.elapsed = 0
                                    d.started = continues
                                    d.mode = reducedNow
                                }
                            }
                        } else {
                            hold.releaseTrack = translated(
                                hold.releaseTrack,
                                g.a.x - (target?.x ?? g.a.x),
                                g.a.y - (target?.y ?? g.a.y)
                            )
                            hold.releaseTarget = g.a
                            hold.releaseMode = reducedNow
                            const d = p.drive
                            if (d) {
                                d.track = hold.releaseTrack
                                d.target = g.a
                                d.mode = reducedNow
                            }
                        }
                    }
                }
            }
        /**
         * `h`/`ḣ` of every live hold in this flush's view space. While held,
         * the *displayed* h reaches the finger target H, but a descendant's
         * residual is planned from the *presented* h measured by the capture:
         * an unpresented move then carries the descendants with the parent's
         * t = 0 write instead of being absorbed into their residuals.
         */
        const holdDisplacements = new Map<
            DriveHold,
            {
                readonly presented: {
                    readonly x: number
                    readonly y: number
                }
                readonly dh: { readonly x: number; readonly y: number }
            }
        >()
        if (anyHold)
            for (const p of list) {
                const hold = liveHoldOf(p)
                const g = geometry[index.get(p)!]
                if (!hold || !g) continue
                const originX = g.a.x + g.fx * g.a.w
                const originY = g.a.y + g.fy * g.a.h
                const drawn = fresh?.rects.get(p) ?? null
                const measured = drawn
                    ? {
                          x: drawn.x + g.fx * drawn.w - originX,
                          y: drawn.y + g.fy * drawn.h - originY,
                      }
                    : { x: hold.lastHX, y: hold.lastHY }
                const v = velocity.get(p) ?? ZERO_VELOCITY
                const dh =
                    hold.state === 'held'
                        ? { x: 0, y: 0 }
                        : { x: v.x + g.fx * v.w, y: v.y + g.fy * v.h }
                const display =
                    hold.state === 'held'
                        ? { x: hold.hx - originX, y: hold.hy - originY }
                        : measured
                holdDisplacements.set(hold, { presented: measured, dh })
                hold.lastHX = display.x
                hold.lastHY = display.y
            }
        if (anyHold || anyRide)
            for (const p of list) {
                const i = index.get(p)!
                const g = geometry[i]
                const hold = p.hold === null ? holdAncestor(p) : null
                if (!hold) {
                    if (p.ride) {
                        p.ride = null
                        if (p.drive) settle(p)
                    }
                    continue
                }
                if (!g) continue
                if (!p.drive) {
                    ensureDrive(
                        p,
                        'static',
                        g,
                        [],
                        reducedMode(),
                        knownTransformAnchoring(p.element.ownerDocument) ===
                            true && !waapi
                    )
                }
                if (p.drive?.kind === 'follow' || p.drive?.kind === 'held')
                    continue
                p.ride = hold
                hold.rides.add(p)
                const { presented: presentedH, dh } = holdDisplacements.get(
                    hold
                ) ?? {
                    presented: { x: 0, y: 0 },
                    dh: { x: 0, y: 0 },
                }
                const b = fresh?.rects.get(p) ?? null
                const v = velocity.get(p) ?? null
                if (!b || !v) {
                    // H13-10R/S3: under jump a capture-less flush has no B/v, but
                    // the stale residual must still settle at its own A
                    const d = p.drive
                    if (reduced === 'jump' && d) {
                        d.track = null
                        d.timeline = null
                        d.target = g.a
                        d.kind = 'static'
                        d.elapsed = 0
                        d.started = false
                        d.mode = reduced
                    }
                    continue
                }
                const residualBefore = {
                    x: b.x - presentedH.x,
                    y: b.y - presentedH.y,
                    w: b.w,
                    h: b.h,
                }
                const distance = moved(residualBefore, g.a, {
                    mode: p.options.layout ?? true,
                    anchor: null,
                    fx: g.fx,
                    fy: g.fy,
                })
                const running = p.drive?.kind === 'track' && runs(p.drive)
                // §5.7 on the residual: its own A is unchanged and options are
                // equal, so keep the residual's remaining time; the new h still
                // carries the child with the parent's t = 0 write
                const lk = nodes[i]!.presented
                const residualKeeps =
                    running &&
                    reduced !== 'jump' &&
                    !nodes[i]!.optionsChanged &&
                    (lk === null ||
                        moved(lk, g.a, {
                            mode: p.options.layout ?? true,
                            anchor: null,
                            fx: g.fx,
                            fy: g.fy,
                        }) < threshold)
                if (residualKeeps) {
                    // §5.7 path 2: a presented layout move translates the residual
                    const target = p.drive!.target
                    if (target && p.drive!.track) {
                        const dx = g.a.x - target.x
                        const dy = g.a.y - target.y
                        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
                            p.drive!.track = translated(p.drive!.track, dx, dy)
                            p.drive!.target = g.a
                        }
                    }
                    continue
                }
                if (
                    running ||
                    distance >= threshold ||
                    nodes[i]!.optionsChanged ||
                    reduced === 'jump'
                ) {
                    planResidual(
                        p,
                        b,
                        v,
                        presentedH,
                        dh,
                        reduced,
                        p.parent,
                        p.parent ? (velocity.get(p.parent) ?? null) : null,
                        p.parent
                            ? (fresh?.rects.get(p.parent) ??
                                  (p.parent.hold
                                      ? {
                                            w: p.parent.hold.sizeW,
                                            h: p.parent.hold.sizeH,
                                        }
                                      : (p.parent.geometry?.a ?? null)))
                            : null
                    )
                }
            }

        actions.forEach((action, i) => {
            const p = list[i]!
            const g = geometry[i]
            const d = p.drive
            // a quiescent node: no drive, no hold and no id (the plan left it
            // null); it can have no action, no report and no write
            if (
                nodes[i] === null &&
                action.kind === 'none' &&
                d === null &&
                p.hold === null &&
                p.ride === null
            ) {
                return
            }
            if (p.hold !== null) {
                // the hold owns this node's origin; its event rule already ran
                touch(p)
                return
            }
            if (p.ride !== null) {
                // a residual is drawn at its own box plus h; no normal action
                touch(p)
                return
            }
            if (focusSettled.has(p)) return
            if (action.kind !== 'none' || d) touch(p)
            switch (action.kind) {
                case 'none':
                    if (reduced === 'jump' && d?.fade) endFade(p)
                    // a crossfade follower stays invisible until presence removes it
                    if (d && (d.kind !== 'held' || !nodes[i]?.exiting))
                        settle(p)
                    return
                case 'keep': {
                    if (!d?.track || !d.target || !g) return
                    const r = reexpress[i]
                    const was = frozen.get(p)?.geometry
                    const landsAtA =
                        Math.abs(d.target.x - g.a.x) <= threshold &&
                        Math.abs(d.target.y - g.a.y) <= threshold &&
                        Math.abs(d.target.w - g.a.w) <= threshold &&
                        Math.abs(d.target.h - g.a.h) <= threshold
                    if (d.timeline) {
                        if (!(replanned[i] === true && landsAtA)) {
                            // its pose timeline goes on in this flush's geometry
                            d.target = g.a
                            return
                        }
                        // an ancestor re-planned under a prior timeline: fall
                        // through and keep the visual track (H18-B)
                        d.timeline = null
                        d.target = g.a
                        visualKeeps.add(i)
                    } else if (parents[i]! < 0 && was) {
                        // top level: the same poses about the new origin
                        // (§5.7 paths 1 and 2, §4.4)
                        d.track = rebased(d.track, was, g)
                        d.target = g.a
                    } else if (r?.path === 'translate' && !unmeasured[i]) {
                        // path 2: translated by δ, keeping the ancestor
                        // matrices it was planned with (§3.2)
                        d.track = translated(d.track, r.dx, r.dy)
                        d.target = {
                            ...d.target,
                            x: d.target.x + r.dx,
                            y: d.target.y + r.dy,
                        }
                    } else if (
                        // H18-B: an ancestor's own track is re-planned in this
                        // flush, so a relative pose timeline would draw the
                        // child through the ancestor's new pose (a height
                        // retarget would squash it). Its own visual track still
                        // lands on the same A: keep the track and let solve
                        // counter-project it through this flush's parent map.
                        replanned[i] === true &&
                        Math.abs(d.target.x - g.a.x) <= threshold &&
                        Math.abs(d.target.y - g.a.y) <= threshold &&
                        Math.abs(d.target.w - g.a.w) <= threshold &&
                        Math.abs(d.target.h - g.a.h) <= threshold
                    ) {
                        d.timeline = null
                        d.target = g.a
                        visualKeeps.add(i)
                    } else {
                        // path 1 or §4.4 under an ancestor: its pose timeline
                        const timeline = timelines.get(i)
                        if (!timeline) return
                        d.timeline = timeline
                        d.target = g.a
                    }
                    // the same animation draws it: the WAAPI pose is relative too
                    const playing = animations.get(p)
                    if (playing) {
                        animations.set(p, {
                            animation: playing.animation,
                            track: d.track,
                        })
                    }
                    return
                }
                case 'static': {
                    if (d?.kind === 'held') {
                        // a held follower that is no longer exiting was
                        // reversed into a lead: it belongs at A, not at 0
                        if (!nodes[i]?.exiting) settle(p)
                        return
                    }
                    if (d?.run) {
                        finishRunNode(p)
                        d.run = null
                    }
                    const drive = startDrive(p, 'static', g!, [])
                    drive.track = null
                    drive.timeline = null
                    drive.target = null
                    drive.radiusBlend = null
                    return
                }
                case 'track': {
                    if (d?.run) {
                        const old = d.run
                        old.nodes.delete(p)
                        d.run = null
                        interrupt(old)
                    }
                    const wasFollower =
                        d?.kind === 'follow' || d?.kind === 'held'
                    // a lead retargeted mid-crossfade keeps its fade: the pair
                    // stays on the same asymmetric timeline and release (§5.6)
                    const keptFade =
                        !action.fadeLead &&
                        d?.fade?.role === 'lead' &&
                        !fadeEnded(d.fade)
                            ? d.fade
                            : null
                    const drive = startDrive(
                        p,
                        'track',
                        g!,
                        action.fadeLead ? OPACITY_PROPERTIES : []
                    )
                    if (wasFollower) {
                        // a reversing follower keeps its current opacity as the
                        // new lead's from (§5.8), but is interactive again
                        if (!action.fadeLead) restoreOpacity(p.element, drive)
                        releaseInert(p.element, drive)
                    }
                    // a node painted moving continues from that frame's time:
                    // B and its velocity are the drawn box and velocity of the
                    // last painted frame, so a held first frame would stall it
                    // (§4.3); a drive no frame has drawn yet is still at rest
                    const continues =
                        action.track.moving && (d?.started ?? true)
                    drive.release?.()
                    drive.release = null
                    drive.track = action.track
                    drive.timeline = null
                    drive.target = nodes[i]!.a
                    drive.elapsed = 0
                    drive.started = continues
                    drive.mode = reduced
                    drive.lead = null
                    drive.radiusBlend = radiusBlendFrom.get(i) ?? null
                    drive.fade = action.fadeLead
                        ? {
                              role: 'lead',
                              from: fadeFrom.get(i)?.lead ?? 0,
                              elapsed: -action.track.delay,
                              started: continues,
                              law: action.track.law,
                          }
                        : keptFade
                    drive.run = run
                    const startedRun = run as Run | null
                    startedRun?.nodes.add(p)
                    startedRun?.all.add(p)
                    touch(p)
                    return
                }
                case 'follow': {
                    if (!action.start) {
                        const blend = radiusBlendFrom.get(action.lead)
                        if (blend && d) d.radiusBlend = blend
                        // the follower is inert for its whole exit (§6, §8)
                        if (d) {
                            ownInert(p, d)
                            assertInert(p.element, d)
                        }
                        return
                    }
                    if (d?.run) {
                        const old = d.run
                        old.nodes.delete(p)
                        d.run = null
                        interrupt(old)
                    }
                    const lead = list[action.lead]!
                    const leadAction = actions[action.lead]!
                    const track =
                        leadAction.kind === 'track' ? leadAction.track : null
                    // in step with the lead's fade: the lead's own rule, from
                    // its new drive or (not started yet) its previous one
                    const continues =
                        track !== null &&
                        track.moving &&
                        (lead.drive?.track === track
                            ? lead.drive.started
                            : (lead.drive?.started ?? true))
                    const drive = startDrive(
                        p,
                        'follow',
                        g!,
                        OPACITY_PROPERTIES
                    )
                    drive.track = null
                    drive.timeline = null
                    drive.target = null
                    drive.elapsed = 0
                    drive.started = false
                    drive.lead = lead
                    drive.radiusBlend = radiusBlendFrom.get(action.lead) ?? null
                    drive.fade = {
                        role: 'follower',
                        from: fadeFrom.get(action.lead)?.follower ?? 1,
                        elapsed: -(track?.delay ?? 0),
                        started: continues,
                        law: track?.law ?? INSTANT_LAW,
                    }
                    const presence = exitingPresence(p.element, tree)
                    if (presence) {
                        let release!: () => void
                        presence.hold(
                            new Promise<void>((done) => {
                                release = done
                            })
                        )
                        drive.release = release
                    }
                    // §5.8/§8: no duplicate interactive target while the pair fades
                    ownInert(p, drive)
                    return
                }
            }
        })

        // the frame: every driven node and its participant ancestors
        const inFrame: boolean[] = list.map((p) => p.drive !== null)
        for (let i = list.length - 1; i >= 0; i--) {
            if (inFrame[i] && parents[i]! >= 0) inFrame[parents[i]!] = true
        }
        const next: FrameNode[] = []
        list.forEach((p, i) => {
            if (!inFrame[i]) return
            p.frameIndex = next.length
            const parent = parents[i]!
            // a kept track (or a continuing follower) keeps the presence
            // matrices it was planned with, its own and its ancestors': a
            // presence transform changed since stays a visual layer over it
            // (§3.1); its CSS box is the current one. A new track starts in
            // this flush's space.
            const action = actions[i]!
            // a kept pose timeline, and a rebased top-level track, are in
            // this flush's geometry like every node (§5.7 path 1)
            const refreshed =
                action.kind === 'keep' &&
                (p.drive?.timeline != null || parent < 0 || visualKeeps.has(i))
            const continues =
                (action.kind === 'keep' && !refreshed) ||
                (action.kind === 'follow' && !action.start)
            const kept = continues ? frozen.get(p) : undefined
            let ancestry = kept?.ancestry
            if (!ancestry) {
                let now: Map<Participant, Matrix> | null = null
                for (let k = parent; k >= 0; k = parents[k]!) {
                    const m = geometry[k]!.matrix
                    // identity is the default an absent entry means; storing it
                    // would allocate a map per node for no information
                    if (m.a === 1 && m.d === 1 && m.e === 0 && m.f === 0) {
                        continue
                    }
                    ;(now ??= new Map()).set(list[k]!, m)
                }
                ancestry = now ?? NO_ANCESTRY
            }
            const frameGeometry = kept
                ? keptGeometry(
                      kept.geometry,
                      geometry[i]!,
                      nodes[i]?.planned ?? kept.geometry.a
                  )
                : geometry[i]!
            const reused = p.frameNode
            if (reused) {
                reused.parent = parent >= 0 ? list[parent]!.frameIndex : -1
                reused.geometry = frameGeometry
                reused.ancestry = ancestry
                next.push(reused)
            } else {
                const node: FrameNode = {
                    p,
                    parent: parent >= 0 ? list[parent]!.frameIndex : -1,
                    geometry: frameGeometry,
                    ancestry,
                    solveNode: null,
                    solved: null,
                }
                p.frameNode = node
                next.push(node)
            }
        })
        frame = next

        if (waapi) {
            commitWrites()
            playTracks()
        } else {
            // the pose at each node's current time (t = 0 for a new track)
            const running = frame.length > 0 && step(null)
            commitWrites()
            if (running) realizer.start()
            else realizer.stop()
        }

        flushSnaps = snapped

        const started = run as Run | null
        if (promise && started) {
            if (started.nodes.size === 0 && !started.done) {
                resolveRun(started, 'ended', snapped)
            }
            return promise
        }
        // no track ran (§9.3): the first status that applies, in order
        return resolved(
            resolveLayoutStatus([
                ...(disabled ? (['disabled'] as const) : []),
                ...(capped ? (['capped'] as const) : []),
                ...(snapped.some((s) => s.reason === 'reduced')
                    ? (['reduced'] as const)
                    : []),
                ...(snapped.some((s) => s.reason === 'stale')
                    ? (['stale'] as const)
                    : []),
            ]) ?? 'no-change',
            snapped
        )
    }

    /* ─────────────────── transactional boundary (§9.2) ─────────────────── */

    /** Applies the queued writes; the fault seam's `write` point throws before any. */
    function commitWrites(): void {
        layoutFault('write')
        drainWrites()
        // the restores of drives settled in this transaction were applied
        resting.clear()
        restingInert.clear()
    }

    function drainWrites(): void {
        const attributes = pendingAttributes
        pendingAttributes = []
        for (const w of attributes) {
            if (w.value === null) w.element.removeAttribute(w.name)
            else w.element.setAttribute(w.name, w.value)
        }
        const writes = pending
        pending = []
        for (const w of writes) {
            put(w.element, w.property, w.value, w.priority)
            if (writePool.length < 1024) {
                w.element = null!
                writePool.push(w)
            }
        }
    }

    /** Every affected node as `'failed'` (§9.2 step 4). */
    function failedSnaps(at: readonly Participant[]): LayoutReport['snapped'] {
        return at.map((p) => ({
            element: p.element,
            reason: 'failed' as const,
        }))
    }

    /**
     * §9.2, once: restore every owned declaration byte-identically (a drive
     * settled earlier in this transaction included), cancel WAAPI animations,
     * clear pending writes, invalidate holds, release presence holds, disarm
     * the marker and listeners, stop the realizer, resolve every affected
     * report `'failed'`, report `internal-error`. Every step is guarded: a
     * secondary cleanup failure never skips the remaining steps. Never throws.
     */
    function abort(
        error: unknown,
        id: number | null,
        affected?: readonly Participant[]
    ): void {
        if (aborting) return
        aborting = true
        const affectedSet = new Set(
            affected ?? touched ?? connectedParticipants()
        )
        const runReport = failedSnaps([...affectedSet])
        let callbacks = false
        try {
            try {
                capture?.disarm()
            } catch {
                // a marker failure must not stop the boundary
            }
            capture = null
            markerTarget = null
            // clear writes, then restore every owned declaration below
            pending = []
            pendingAttributes = []
            for (const p of registry.values()) {
                const d = p.drive
                if (!d) continue
                try {
                    stopAnimation(p)
                } catch {
                    // a browser animation that cannot cancel must not stop us
                }
                try {
                    d.release?.()
                } catch {
                    // presence's hold is already resolved at worst
                }
                d.release = null
                invalidateHold(p)
                p.drive = null
                if (p.geometry) p.lastBox = p.geometry.a
                try {
                    resting.set(p.element, d.saved)
                    queueRestore(p.element, d)
                } catch {
                    // the direct saved write below still runs
                }
                releaseInert(p.element, d)
            }
            // every drive that settled earlier in this transaction
            for (const [element, saved] of resting) {
                try {
                    queueSaved(element, saved)
                } catch {
                    // a failing element must not hide the others
                }
            }
            // an inert restore queued by a follower settled earlier must land
            // even though its drive is gone (H12-02)
            for (const [element, saved] of restingInert) {
                try {
                    queueInertRestore(element, saved)
                } catch {
                    // a failing element must not hide the others
                }
            }
            // best effort: one failing put still leaves the rest written and
            // every cleanup step below runs; attributes first, as one batch
            const attributes = pendingAttributes
            pendingAttributes = []
            for (const w of attributes) {
                try {
                    if (w.value === null) w.element.removeAttribute(w.name)
                    else w.element.setAttribute(w.name, w.value)
                } catch {
                    // handled as a cleanup failure; the first error is reported
                }
            }
            const writes = pending
            pending = []
            for (const w of writes) {
                try {
                    put(w.element, w.property, w.value, w.priority)
                } catch {
                    // handled as a cleanup failure; the first error is reported
                }
            }
            frame = []
            stats.tracks = 0
            try {
                disarm()
            } catch {
                // listeners are best effort too
            }
            try {
                realizer.stop()
            } catch {
                // no clock subscription can survive a failed stop anyway
            }
            // every affected report resolves `'failed'`; report only its
            // affected run nodes, never every connected participant (§9.2)
            const report = runReport
            for (const run of [...liveRuns]) {
                if (run.resolved) continue
                const nodes = [...run.all].filter((p) => affectedSet.has(p))
                const at = nodes.length > 0 ? nodes : [...run.all]
                resolveNow(run, 'failed', failedSnaps(at))
            }
            participants = connectedParticipants().length
            // state is consistent and this transaction's state is closed
            // before any user callback can re-enter the engine
            touched = null
            resting.clear()
            restingInert.clear()
            aborting = false
            callbacks = true
            const previous = runId
            runId = id
            try {
                diagnose('internal-error', 'abort', { error })
            } catch {
                // a listener failure is isolated by the stream
            }
            try {
                notifySnaps(report)
            } catch {
                // onSnap is isolated; this is only a last-resort guard
            }
            runId = previous
        } finally {
            if (!callbacks) {
                touched = null
                resting.clear()
                restingInert.clear()
                aborting = false
            }
        }
    }

    /** `flush()` and every frame callback: one idempotent boundary (§9.2). */
    function frameBoundary<T>(
        work: () => T,
        fallback: T,
        hint?: number | null
    ): T {
        readsAt = { rects: stats.rects, styles: stats.styles }
        const previous = runId
        const active = hint === undefined ? activeRunId() : hint
        if (hint === undefined) frameRunId = active
        runId = active
        try {
            return work()
        } catch (error) {
            abort(
                error,
                active ?? frameRunId,
                frame.map((node) => node.p)
            )
            return fallback
        } finally {
            runId = previous
        }
    }

    /**
     * A flush over `maxParticipants` (§4.1, §9.1): no reads, the whole scope
     * snaps. Restoring the owned declarations is exactly the snap to A.
     */
    function cappedFlush(list: readonly Participant[]): Promise<LayoutReport> {
        const disabled = layoutRuntime.mode === 'snap'
        const reason: SnapReason = disabled ? 'disabled' : 'capped'
        if (!disabled) {
            warn(
                'capped',
                `more than ${maxParticipants} connected participants; the change snaps without a read. Raise maxParticipants or narrow the scope.`
            )
        }
        const snapped = list.map((p) => ({
            element: p.element,
            reason,
        }))
        if (disabled) {
            // the winning condition is the kill switch: a pending report is
            // disabled, never a cap event for a superseded condition
            for (const run of [...liveRuns]) {
                if (run.resolved) continue
                const nodes = [...run.nodes]
                resolveRun(
                    run,
                    'disabled',
                    nodes.map((p) => ({
                        element: p.element,
                        reason: 'disabled' as const,
                    }))
                )
            }
        } else {
            // the cap displaces running tracks: their reports are interrupted
            for (const run of [...liveRuns]) interrupt(run)
        }
        for (const p of registry.values()) {
            const d = p.drive
            if (!d || d.kind === 'held') continue
            settle(p)
        }
        commitWrites()
        frame = frame.filter((node) => node.p.drive !== null)
        realizer.stop()
        stats.tracks = 0
        if (disabled) {
            diagnose('runtime-disabled', 'snap', { reason: 'disabled' })
        } else {
            diagnose('participant-cap', 'snap')
        }
        flushSnaps = snapped
        return resolved(disabled ? 'disabled' : 'capped', snapped)
    }

    /* ───────────────────────── lifecycle ───────────────────────── */

    function countTracks(): number {
        let tracks = 0
        for (const node of frame) {
            const d = node.p.drive
            if (runs(d)) tracks += 1
        }
        return tracks
    }

    function rebuildFrame(): void {
        const kept = frame.filter((node) => !node.p.removed)
        const position = new Map<Participant, number>()
        frame = kept.map((node, i) => {
            position.set(node.p, i)
            let parent = node.p.parent
            while (parent && (parent.removed || !position.has(parent)))
                parent = parent.parent
            return {
                p: node.p,
                parent: parent ? position.get(parent)! : -1,
                geometry: node.geometry,
                ancestry: node.ancestry,
                solveNode: node.solveNode,
                solved: node.solved,
            }
        })
    }

    function finishAll(status: 'ended' | 'disposed' | 'disabled'): void {
        const nested = deferDepth > 0
        if (!nested) deferDepth += 1
        try {
            // every unresolved run reports the cause before its nodes settle,
            // but the report is not observable until the writes below succeed
            for (const run of [...liveRuns]) {
                if (run.resolved) continue
                const merged = new Map(
                    run.snapped.map((entry) => [entry.element, entry.reason])
                )
                if (status === 'disabled') {
                    for (const p of run.nodes) {
                        merged.set(p.element, 'disabled')
                    }
                }
                resolveRun(
                    run,
                    status,
                    [...merged].map(([element, reason]) => ({
                        element,
                        reason,
                    }))
                )
            }
            if (status === 'disabled') {
                for (const node of frame) invalidateHold(node.p)
            }
            // every track jumps to A
            for (const node of frame) {
                const d = node.p.drive
                if (!d || d.kind === 'held') continue
                if (d.timeline) d.timeline.done = true
                if (d.track) d.elapsed = trackEndTime(d.track)
                if (d.fade) d.fade.elapsed = d.fade.law.duration
            }
            if (status === 'ended' && !waapi) {
                step(null)
                commitWrites()
            }
            if (status === 'disabled') {
                // a crossfade ends as a completed fade: the lead gets its
                // opacity back, the exiting follower is held at 0 until
                // presence removes it
                for (const node of frame) {
                    const d = node.p.drive
                    if (d?.fade) endFade(node.p)
                }
            }
            for (const node of frame) {
                const d = node.p.drive
                if (!d) continue
                if (status === 'disposed' || d.kind !== 'held') settle(node.p)
            }
            commitWrites()
            frame = frame.filter((node) => node.p.drive !== null)
            realizer.stop()
            stats.tracks = 0
            // §7.2: the kill switch also disarms the scroll listeners;
            // setMode('animate') re-arms them through resume()
            if (status === 'disabled') disarm()
            holds.clear()
            if (!nested) flushDeferred()
        } finally {
            if (!nested) deferDepth -= 1
        }
    }

    /**
     * `setMode('snap')` in this scope (§7.2): every live track finishes at
     * identity with styles restored, holds invalidate, pending reports
     * resolve `'disabled'`. Synchronous; never throws.
     */
    function snapToDisabled(): void {
        readsAt = { rects: stats.rects, styles: stats.styles }
        participants = connectedParticipants().length
        const previous = runId
        let affected: number | null = null
        const movers: {
            readonly participant: Participant
            readonly run: number | null
        }[] = []
        const finished: { element: HTMLElement; reason: SnapReason }[] = []
        for (const node of frame) {
            const d = node.p.drive
            if (!d || d.kind === 'held') continue
            const run = d.run
            if (run && !run.done) affected ??= run.id
            // a live drive hold is a mover too, even when its drive is static
            // (a hold taken at rest) or it is landing (P4-C3/P4-C4)
            if (
                d.kind === 'track' ||
                d.kind === 'follow' ||
                isLiveHold(node.p.hold)
            ) {
                movers.push({ participant: node.p, run: run?.id ?? null })
            }
            finished.push({ element: node.p.element, reason: 'disabled' })
        }
        runId = affected
        try {
            finishAll('disabled')
            for (const mover of movers) {
                const current = runId
                runId = mover.run ?? affected
                diagnose('runtime-disabled', 'snap', {
                    element: mover.participant.element,
                    reason: 'disabled',
                })
                runId = current
            }
            if (movers.length > 0) notifySnaps(finished)
        } catch (error) {
            abort(
                error,
                affected,
                frame.map((node) => node.p)
            )
        } finally {
            runId = previous
        }
    }

    /**
     * A lifecycle write path outside a flush/frame (§9.2, OPS-04): it either
     * commits its restores or aborts without throwing. Inside a transaction it
     * lets the enclosing boundary own the failure.
     */
    function writeLifecycle(
        work: () => void,
        affected: readonly Participant[]
    ): void {
        const nested = deferDepth > 0
        if (!nested) deferDepth += 1
        try {
            work()
            if (!nested) flushDeferred()
        } catch (error) {
            if (nested) throw error
            abort(error, activeRunId(), affected)
        } finally {
            if (!nested) deferDepth -= 1
        }
    }

    function stopParticipantDrive(p: Participant, cancelled: boolean): void {
        const d = p.drive
        if (!d) return
        writeLifecycle(() => {
            pending = pending.filter((w) => w.element !== p.element)
            pendingAttributes = pendingAttributes.filter(
                (w) => w.element !== p.element
            )
            settle(p, cancelled)
            commitWrites()
            rebuildFrame()
            stats.tracks = countTracks()
            if (
                !frame.some(
                    (node) =>
                        node.p.drive !== null && node.p.drive.kind !== 'held'
                )
            ) {
                realizer.stop()
            }
        }, [p])
    }

    /**
     * Unregisters a participant whose element was adopted into another
     * document (§4.6, §7.2 `document-mismatch`).
     */
    function documentMismatch(p: Participant): void {
        p.removed = true
        registry.delete(p.element)
        if (elementScopes.get(p.element) === scopeToken) {
            elementScopes.delete(p.element)
        }
        dropRoot(p)
        share(p.options, -1)
        syncListeners()
        invalidateHold(p)
        const id = p.options.layoutId
        if (id !== undefined && leads.get(id) === p) {
            leads.delete(id)
            retained.delete(id)
        }
        forgetCaptured(p)
        stopParticipantDrive(p, true)
        participants = connectedParticipants().length
        diagnose('document-mismatch', 'finish', { element: p.element })
    }

    function evictAdopted(): void {
        if (!scopeDocument) return
        for (const p of [...registry.values()]) {
            if (p.element.ownerDocument !== scopeDocument) {
                documentMismatch(p)
            }
        }
    }

    function resetLayoutKey(p: Participant): void {
        p.keyChanged = true
        p.changed = false
        invalidateHold(p)
        forgetCaptured(p)
        stopParticipantDrive(p, true)
        p.lastBox = null
        p.geometry = null
    }

    /** A participant whose identity ended has no B in the open capture. */
    function forgetCaptured(p: Participant): void {
        capture?.rects.delete(p)
        capture?.radius.delete(p)
        capture?.unsupported.delete(p)
    }

    function validateWaapiNesting(element: HTMLElement): void {
        // the new element's root counts before it is registered
        const known = flatTree(rootsWith(element))
        for (const other of registry.keys()) {
            if (
                other !== element &&
                (containsFlat(other, element, known) ||
                    containsFlat(element, other, known))
            ) {
                throw invalidOptions(
                    'type',
                    "the 'waapi' engine animates top-level participants only; a nested participant needs the 'raf' engine."
                )
            }
        }
    }

    const group: LayoutGroup = {
        add(element, layoutOptions) {
            validateLayoutOptions(layoutOptions)
            validateMotionLayers([groupMotion, layoutOptions?.motion])
            assertDocument(element)
            if (waapi) {
                validateWaapiOptions(layoutOptions, groupMotion)
                validateWaapiNesting(element)
            }
            if (disposed) return noop
            const owner = elementScopes.get(element)
            if (owner !== undefined && owner !== scopeToken) {
                throw invalidOptions(
                    'type',
                    'the element is already registered in another layout group; one element belongs to at most one live scope.'
                )
            }
            scopeDocument ??= element.ownerDocument
            const nextOptions = layoutOptions ?? {}
            let p = registry.get(element)
            if (p) {
                // only a change that draws another track retargets (§3.3 inv. 5)
                if (!Object.is(p.options.layoutKey, nextOptions.layoutKey)) {
                    resetLayoutKey(p)
                } else if (
                    !sameTrackOptions(p.options, nextOptions, groupMotion)
                ) {
                    p.changed = true
                }
                share(p.options, -1)
                share(nextOptions, 1)
                p.options = nextOptions
                p.motion = null
            } else {
                p = {
                    element,
                    options: nextOptions,
                    order: ++sequence,
                    changed: false,
                    keyChanged: false,
                    dependency: null,
                    lastBox: null,
                    drive: null,
                    hold: null,
                    ride: null,
                    geometry: null,
                    parent: null,
                    removed: false,
                    motion: null,
                    roots: [],
                    treePass: 0,
                    treeDepth: 0,
                    treeParent: null,
                    treeFlat: null,
                    frameIndex: -1,
                    frameNode: null,
                    planNode: null,
                }
                registry.set(element, p)
                elementScopes.set(element, scopeToken)
                trackRoot(p)
                share(nextOptions, 1)
            }
            syncListeners()
            const self = p
            return () => {
                if (self.removed || registry.get(element) !== self) return
                self.removed = true
                registry.delete(element)
                if (elementScopes.get(element) === scopeToken) {
                    elementScopes.delete(element)
                }
                dropRoot(self)
                share(self.options, -1)
                syncListeners()
                const id = self.options.layoutId
                if (id !== undefined && leads.get(id) === self) {
                    // its last presented box, radius and velocity, in view
                    // space as the fresh capture measured them (§5.8); with no
                    // valid measurement nothing is retained
                    const seen = capture && !capture.aged ? capture : null
                    const box = seen?.rects.get(self)
                    leads.delete(id)
                    if (
                        seen &&
                        box &&
                        retain > 0 &&
                        element.ownerDocument === scopeDocument
                    )
                        retained.set(id, {
                            box,
                            velocity: seen.engine.moving.has(self)
                                ? (seen.engine.rates.get(self) ?? null)
                                : null,
                            radius: ownsRadius(self.options)
                                ? (seen.radius.get(self) ?? null)
                                : null,
                            scrolling: seen.scrolling.get(self) ?? [],
                            until: now() + retain * 1000,
                        })
                }
                const d = self.drive
                if (d) {
                    // unmount cancels its track (§9): the run reports
                    // 'disposed' if nothing else of it is left
                    writeLifecycle(() => {
                        pending = pending.filter((w) => w.element !== element)
                        pendingAttributes = pendingAttributes.filter(
                            (w) => w.element !== element
                        )
                        settle(self, true)
                        holds.delete(self)
                        commitWrites()
                        rebuildFrame()
                        stats.tracks = countTracks()
                        // unsubscribe once this task's microtasks have run,
                        // unless a flush among them (a handoff) started a run
                        queueMicrotask(() => {
                            if (
                                !frame.some(
                                    (node) =>
                                        node.p.drive !== null &&
                                        node.p.drive.kind !== 'held'
                                )
                            ) {
                                realizer.stop()
                            }
                        })
                    }, [self])
                }
            }
        },

        set(element, layoutOptions) {
            validateLayoutOptions(layoutOptions)
            validateMotionLayers([groupMotion, layoutOptions?.motion])
            assertDocument(element)
            if (waapi) {
                validateWaapiOptions(layoutOptions, groupMotion)
                validateWaapiNesting(element)
            }
            const p = registry.get(element)
            if (!p) return
            if (!Object.is(p.options.layoutKey, layoutOptions.layoutKey)) {
                resetLayoutKey(p)
            } else if (!sameTrackOptions(p.options, layoutOptions, groupMotion))
                p.changed = true
            share(p.options, -1)
            share(layoutOptions, 1)
            p.options = layoutOptions
            p.motion = null
            syncListeners()
        },

        capture: () => takeCapture(true),

        flush,

        take: takeDrive,

        update(mutate) {
            takeCapture(false)
            try {
                mutate()
            } catch (error) {
                capture?.disarm()
                capture = null
                throw error
            }
            return flush()
        },

        finish() {
            if (disposed) return
            const affected = frame.map((node) => node.p)
            try {
                finishAll('ended')
            } catch (error) {
                abort(error, activeRunId(), affected)
            }
        },

        dispose() {
            if (disposed) return
            const affected = frame.map((node) => node.p)
            try {
                finishAll('disposed')
            } catch (error) {
                abort(error, activeRunId(), affected)
            } finally {
                disposed = true
                unregisterRuntimeScope()
                try {
                    capture?.disarm()
                } catch {
                    // disposal still completes
                }
                capture = null
                markerTarget = null
                for (const p of registry.values()) {
                    p.removed = true
                    if (elementScopes.get(p.element) === scopeToken) {
                        elementScopes.delete(p.element)
                    }
                    dropRoot(p)
                }
                registry.clear()
                shared = 0
                chainRoots = new Set()
                try {
                    structureObserver?.disconnect()
                } catch {
                    // disposal still completes
                }
                structureObserver = null
                try {
                    disarm()
                } catch {
                    // disposal still completes
                }
                frame = []
                leads.clear()
                retained.clear()
                resting.clear()
                touched = null
                stats.tracks = 0
            }
        },

        get stats() {
            return {
                captures: stats.captures,
                reads:
                    stats.rects +
                    stats.offsets +
                    stats.styles +
                    stats.layoutOffsets,
                rects: stats.rects,
                offsets: stats.offsets,
                styles: stats.styles,
                layoutOffsets: stats.layoutOffsets,
                probes: stats.probes,
                parents: stats.parents,
                tracks: stats.tracks,
                holds: [...registry.values()].filter((p) => isLiveHold(p.hold))
                    .length,
            }
        },
    }
    // the React adapter's package-internal mount hand-off: no public export
    Object.defineProperty(group, Symbol.for('ani-layout.capture-added'), {
        value: captureAdded,
        enumerable: false,
    })
    // test-only observation of the measured-jump shortcut; no public export
    Object.defineProperty(group, Symbol.for('ani-layout.keep-shortcut'), {
        value: () => lastKeepShortcut,
        enumerable: false,
    })
    return group
}
