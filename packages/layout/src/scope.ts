/**
 * The layout scope: registry, capture epochs, flush, runs and lifecycle
 * (§4, §5.5, §5.6, §9). The public `LayoutGroup`.
 */
import { type Clock, DEV, defaultClock } from '@freestylejs/ani-core'
import {
    adoptAuthored,
    animatedOwned,
    borderSize,
    containsFlat,
    flatParent,
    type Len,
    type Measured,
    measure,
    OPACITY_PROPERTIES,
    OWNED_PRIORITY,
    POSE_PROPERTIES,
    put,
    RADIUS_PROPERTIES,
    readRadius,
    readTransform,
    replacedOwned,
    resolveLen,
    type Saved,
    save,
    viewportBox,
    viewRect,
} from './dom'
import { hasDOM, snapsReferenceBox, supportsLinearEasing } from './feature'
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
    type KeepPath,
    type KeepPathInput,
    keepPath,
    type PresentedNode,
    presentedLayoutBoxes,
    type SupportNode,
    staleReported,
    supportCheck,
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
    moved,
    type PlanNode,
    plan,
    type SnapReason,
} from './plan'
import { exitingPresence, presenceOf } from './presence_link'
import { createRaf } from './realize/raf'
import { elapsedOf, play } from './realize/waapi'
import {
    type BoxVelocity,
    drawnBoxes,
    drawnVelocities,
    type Fade,
    fadeOpacity,
    INSTANT_LAW,
    type Layer,
    movingParents,
    type RadiusBlend,
    type Solved,
    type SolveNode,
    solve,
    type Track,
    type TrackLaw,
    trackEnded,
    trackEndTime,
    ZERO_VELOCITY,
} from './solve'
import type {
    LayoutGroup,
    LayoutGroupOptions,
    LayoutReport,
    LayoutStatus,
} from './types'

const DEFAULT_THRESHOLD = 1
const DEFAULT_MAX_NODES = 300
const DEFAULT_RETAIN = 1
const MIN_SCALE = 1 / 50
const MAX_SCALE = 50
/** Why a node fails the support check (§4.2). */
const UNOWNED_MAP =
    'a map the engine does not own (a scaled, rotated or skewed ancestor that is not a participant, 3D, or CSS zoom)'
const IDENTITY_POSE: Pose = { tx: 0, ty: 0, sx: 1, sy: 1 }

type KeepAncestor = KeepPathInput['ancestors'][number]

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

interface Drive {
    kind: 'track' | 'static' | 'follow' | 'held'
    track: Track | null
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
    /** Geometry from the last flush that measured it. */
    geometry: Geometry | null
    /** Nearest participant ancestor at the last flush. */
    parent: Participant | null
    removed: boolean
    /** Resolved motion for a reduced-motion mode, until its options change. */
    motion: { readonly mode: string; readonly value: Motion } | null
}

interface Run {
    readonly nodes: Set<Participant>
    readonly snapped: LayoutReport['snapped']
    readonly resolve: (report: LayoutReport) => void
    done: boolean
}

/** The engine's own state at an instant: what its last writes describe (§4.1). */
interface EngineState {
    /** Per frame node, the pose the engine last wrote (identity where it wrote none). */
    readonly poses: Map<Participant, Pose>
    /** Per frame node, its analytic drawn-box velocity. */
    readonly rates: Map<Participant, BoxVelocity>
    /** Nodes whose own track is moving (running, past its delay). */
    readonly moving: Set<Participant>
}

/** One capture (§4.1): what was presented at `t_k`, read in one batch. */
interface Capture {
    /** The task stamp: reused while true, re-read in a later task. */
    live: boolean
    /** A rendering opportunity passed (or it began in a frame): it supplies no B. */
    aged: boolean
    /** Releases the frame marker, if it has not fired. */
    disarm: () => void
    /** B per connected participant: the raw rect, nothing divided out. */
    readonly rects: Map<Participant, Box>
    /** Per participant, `offsetWidth`/`offsetHeight`. */
    readonly offsets: Map<Participant, readonly [number, number]>
    /** Participants that failed the support check, with their subtrees. */
    readonly unsupported: Map<Participant, string>
    /** Shared `radius` participants' on-screen corner radii at B. */
    readonly radius: Map<Participant, readonly number[]>
    /** The engine's state at `t_k`. */
    readonly engine: EngineState
}

type Matrix = Geometry['matrix']

interface FrameNode {
    readonly p: Participant
    readonly parent: number
    readonly geometry: Geometry
    /**
     * The presence matrices of its participant ancestors at the flush that
     * planned `geometry`: its track lives in that flush's visual space, so a
     * layer changed since then draws over it (§3.1, §11).
     */
    readonly ancestry: ReadonlyMap<Participant, Matrix>
}

const NO_ANCESTRY: ReadonlyMap<Participant, Matrix> = new Map()

function sameMatrix(a: Matrix, b: Matrix): boolean {
    return a.a === b.a && a.d === b.d && a.e === b.e && a.f === b.f
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

/** The pose last written to a node: its own declarations, read back exactly. */
function writtenPose(d: Drive | null): Pose {
    const translate = d?.written.get('translate')
    const scale = d?.written.get('scale')
    if (translate === undefined || scale === undefined) return IDENTITY_POSE
    const [tx, ty] = translate.split(' ').map((v) => Number.parseFloat(v))
    const [sx, sy] = scale.split(' ').map((v) => Number.parseFloat(v))
    const au = d!.authored
    const px = sx! / au.sx
    const py = sy! / au.sy
    return { tx: tx! - px * au.tx, ty: ty! - py * au.ty, sx: px, sy: py }
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
            const m = node.ancestry.get(at[k]!.p)
            if (!m || sameMatrix(m, g.matrix)) continue
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
    readonly until: number
}

interface Write {
    readonly element: HTMLElement
    readonly property: string
    /** `''` removes the declaration. */
    readonly value: string
    readonly priority: string
}

const GROUP_KEYS = [
    'clock',
    'motion',
    'reducedMotion',
    'threshold',
    'maxNodes',
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
    return Math.abs(n) < 1e-9 ? '0' : String(Number(n.toFixed(6)))
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
    const retain = options.retain ?? DEFAULT_RETAIN
    const groupMotion: LayoutMotion | undefined = options.motion
    const waapi = options.engine === 'waapi'
    /** The running animation of each WAAPI track, with the track it draws. */
    const animations = new Map<
        Participant,
        { readonly animation: Animation; readonly track: Track }
    >()

    const registry = new Map<HTMLElement, Participant>()
    let scopeDocument: Document | null = null
    let sequence = 0
    let capture: Capture | null = null
    let frame: FrameNode[] = []
    let pending: Write[] = []
    let disposed = false
    /** Previous lead per `layoutId`. */
    const leads = new Map<string, Participant>()
    /** Drawn boxes and velocities of leads removed within `retain` seconds. */
    const retained = new Map<string, Retained>()
    const warned = new Set<string>()
    /** Every read the engine makes, counted where it is made (§7.1). */
    const stats = { captures: 0, rects: 0, offsets: 0, styles: 0, tracks: 0 }

    function warn(kind: string, message: string): void {
        if (!DEV || warned.has(kind)) return
        warned.add(kind)
        // biome-ignore lint/suspicious/noConsole: development warning
        console.warn(`[ani-layout] ${message}`)
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

    function solveNodes(at: FrameNode[]): SolveNode[] {
        const index = new Map<Participant, number>()
        at.forEach((node, i) => index.set(node.p, i))
        const layers = layersOf(at)
        return at.map((node, i) => {
            const d = node.p.drive
            const g = node.geometry
            const live = d !== null && d.kind !== 'held'
            const fade: Fade | null =
                live && d.fade
                    ? {
                          role: d.fade.role,
                          from: d.fade.from,
                          elapsed: Math.max(0, d.fade.elapsed),
                          law: d.fade.law,
                      }
                    : null
            return {
                parent: node.parent,
                a: g.a,
                box: g.box,
                ox: g.ox,
                oy: g.oy,
                inner: g.inner,
                track: live && d.kind === 'track' ? d.track : null,
                elapsed: d?.elapsed ?? 0,
                follow:
                    live && d.kind === 'follow' && d.lead
                        ? (index.get(d.lead) ?? -1)
                        : -1,
                fade,
                radius: live && ownsRadius(node.p.options) ? g.radius : null,
                radiusBlend: (() => {
                    if (!live || !ownsRadius(node.p.options) || !d.radiusBlend)
                        return null
                    const leadDrive = d.kind === 'follow' ? d.lead?.drive : d
                    const track = leadDrive?.track
                    if (!track) return null
                    return {
                        ...d.radiusBlend,
                        track,
                        elapsed: leadDrive.elapsed,
                    }
                })(),
                layers: layers[i] ?? null,
            }
        })
    }

    function writeValue(
        element: HTMLElement,
        d: Drive,
        property: string,
        value: string
    ): void {
        if (d.written.get(property) === value) return
        d.written.set(property, value)
        pending.push({ element, property, value, priority: OWNED_PRIORITY })
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
            pending.push({ element, property, value, priority })
        }
    }

    function queuePose(node: FrameNode, solved: Solved): void {
        const d = node.p.drive!
        const { pose } = solved
        const a = d.authored
        const element = node.p.element
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
        if (run.nodes.size === 0 && !run.done) {
            run.done = true
            run.resolve({ status: 'ended', snapped: run.snapped })
        }
    }

    /** A node leaves its run unfinished: unregistered or gone from the document (§9). */
    function cancelRunNode(p: Participant): void {
        const run = p.drive?.run
        if (!run) return
        run.nodes.delete(p)
        p.drive!.run = null
        if (run.nodes.size === 0 && !run.done) {
            run.done = true
            run.resolve({ status: 'disposed', snapped: run.snapped })
        }
    }

    /** Queues the restore of every owned declaration of `p` and drops its drive. */
    function settle(p: Participant, cancelled = false): void {
        const d = p.drive
        if (!d) return
        stopAnimation(p)
        if (cancelled) cancelRunNode(p)
        else finishRunNode(p)
        d.release?.()
        p.drive = null
        if (p.geometry) p.lastBox = p.geometry.a
        queueRestore(p.element, d)
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
        const solved = solve(solveNodes(frame))
        const animating: boolean[] = []
        let running = false
        let tracks = 0
        for (const node of frame) {
            const d = node.p.drive
            const live = d !== null && d.kind !== 'held'
            const ownTrack =
                live &&
                d.kind === 'track' &&
                d.track !== null &&
                !trackEnded(d.track, d.elapsed)
            const ownFade = live && d.fade !== null && !fadeEnded(d.fade)
            if (ownTrack) tracks += 1
            animating.push(
                ownTrack ||
                    ownFade ||
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
            if (!animating[i]) {
                settle(p)
                return
            }
            queuePose(node, solved[i]!)
            running = true
        })
        stats.tracks = tracks
        return running
    }

    function commitWrites(): void {
        const writes = pending
        pending = []
        for (const w of writes) put(w.element, w.property, w.value, w.priority)
    }

    const realizer = createRaf(clock, {
        update(dt) {
            return step(dt)
        },
        commit: commitWrites,
    })

    /* ───────────────────────── capture ───────────────────────── */

    /** Connected participants, parents first, with their nearest participant ancestors. */
    function participantTree(): {
        list: Participant[]
        parents: number[]
        index: Map<Participant, number>
    } {
        const list = [...registry.values()].filter((p) => p.element.isConnected)
        const parentOf = new Map<Participant, Participant | null>()
        const depth = new Map<Participant, number>()
        const depthOf = (p: Participant): number => {
            const known = depth.get(p)
            if (known !== undefined) return known
            const parent = nearestParticipant(p.element)
            parentOf.set(p, parent)
            const d = parent ? depthOf(parent) + 1 : 0
            depth.set(p, d)
            return d
        }
        for (const p of list) depthOf(p)
        list.sort((a, b) => depth.get(a)! - depth.get(b)! || a.order - b.order)
        const index = new Map<Participant, number>()
        list.forEach((p, i) => index.set(p, i))
        const parents = list.map((p) => {
            const parent = parentOf.get(p)
            return parent ? index.get(parent)! : -1
        })
        return { list, parents, index }
    }

    /**
     * The engine's own state now: the pose it last wrote to each frame node
     * and the analytic velocity of each drawn box, both at the instant its
     * last writes describe (§4.1). No DOM read.
     */
    function engineState(): EngineState {
        const poses = new Map<Participant, Pose>()
        const rates = new Map<Participant, BoxVelocity>()
        const moving = new Set<Participant>()
        if (frame.length === 0) return { poses, rates, moving }
        if (waapi) syncAnimations()
        const nodes = solveNodes(frame)
        const velocities = drawnVelocities(nodes)
        // a WAAPI track writes no declaration: its pose is its animation's value
        const solved = waapi ? solve(nodes) : null
        frame.forEach((node, i) => {
            const d = node.p.drive
            poses.set(node.p, solved ? solved[i]!.pose : writtenPose(d))
            rates.set(node.p, velocities[i]!)
            if (
                d?.kind === 'track' &&
                d.track !== null &&
                !trackEnded(d.track, d.elapsed) &&
                d.elapsed >= d.track.delay
            ) {
                moving.add(node.p)
            }
        })
        return { poses, rates, moving }
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
        styleOf: (i: number) => CSSStyleDeclaration
    ): readonly (string | null)[] {
        const hasChildren = list.map(() => false)
        for (const parent of parents)
            if (parent >= 0) hasChildren[parent] = true
        const poseOf = (i: number) => poses.get(list[i]!) ?? IDENTITY_POSE
        const nodes: SupportNode[] = list.map((_, i) => {
            const pose = poseOf(i)
            return {
                parent: parents[i]!,
                rect: rects[i]!,
                offset: offsets[i]!,
                pose: { sx: pose.sx, sy: pose.sy },
                hasChildren: hasChildren[i]!,
            }
        })
        const causes: (string | null)[] = list.map(() => null)
        const { supported } = supportCheck(
            nodes,
            (i) => {
                const transform = readTransform(styleOf(i))
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
            },
            (i) => {
                const size = borderSize(styleOf(i))
                return size
                    ? { w: size[0], h: size[1] }
                    : { w: Number.NaN, h: Number.NaN }
            }
        )
        const reasons: (string | null)[] = []
        list.forEach((_, i) => {
            const parent = parents[i]!
            reasons.push(
                supported[i]
                    ? null
                    : parent >= 0 && !supported[parent]
                      ? reasons[parent]!
                      : (causes[i] ?? UNOWNED_MAP)
            )
        })
        return reasons
    }

    /** Computed styles of one batch, each element read at most once and counted. */
    function styleReader(
        list: readonly Participant[]
    ): (i: number) => CSSStyleDeclaration {
        const styles: (CSSStyleDeclaration | undefined)[] = new Array(
            list.length
        )
        return (i) => {
            let style = styles[i]
            if (!style) {
                style = getComputedStyle(list[i]!.element)
                styles[i] = style
                stats.styles += 1
            }
            return style
        }
    }

    /**
     * Arms the capture's frame marker (§4.1): the clock's read callback and
     * the owner window's animation frame, whichever runs first, ages it. The
     * marker reads and writes nothing; the other half is cancelled (the
     * clock's cannot be, so the token makes it a no-op).
     */
    function armMarker(current: Capture, view: Window | null): void {
        const token = { armed: true }
        let request: number | null = null
        const cancelFrame = () => {
            if (request !== null) view?.cancelAnimationFrame(request)
            request = null
        }
        current.disarm = () => {
            if (!token.armed) return
            token.armed = false
            cancelFrame()
        }
        clock.read(() => {
            if (!token.armed) return
            token.armed = false
            current.aged = true
            cancelFrame()
        })
        if (typeof view?.requestAnimationFrame === 'function') {
            request = view.requestAnimationFrame(() => {
                request = null
                if (!token.armed) return
                token.armed = false
                current.aged = true
            })
        }
    }

    function takeCapture(): void {
        if (disposed || !hasDOM()) return
        evictAdopted()
        if (capture?.live) return
        capture?.disarm()
        // a capture that begins inside a rendering-update callback may follow
        // an unpresented change of the same frame: it is aged at once (§4.1)
        const inFrame = clock.inFrame
        const { list, parents } = participantTree()
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
        // 2. the support check on what was presented
        const styleOf = styleReader(list)
        const unsupported = supportOf(
            list,
            parents,
            rects,
            offsets,
            engine.poses,
            styleOf
        )
        // 3. after every rect: shared corner radii at B, on screen (a driven
        // node's own declarations are drawn at its poses' scale)
        const radius = new Map<Participant, readonly number[]>()
        const kx: number[] = []
        const ky: number[] = []
        list.forEach((p, i) => {
            const pose = engine.poses.get(p) ?? IDENTITY_POSE
            const parent = parents[i]!
            kx.push((parent >= 0 ? kx[parent]! : 1) * pose.sx)
            ky.push((parent >= 0 ? ky[parent]! : 1) * pose.sy)
            if (p.options.layoutId === undefined || !ownsRadius(p.options))
                return
            const value = readRadius(styleOf(i))
            if (!value) return
            radius.set(
                p,
                value.map((r, j) => r * (j % 2 === 0 ? kx[i]! : ky[i]!))
            )
        })
        // an owned declaration the author replaced inline since layout wrote
        // it is unpresented (the same task): that node and its subtree are
        // not drawn as presented, so they supply no B (§4.1, §6)
        const unpresented: boolean[] = []
        list.forEach((p, i) => {
            const parent = parents[i]!
            unpresented.push(
                (parent >= 0 && unpresented[parent]!) ||
                    (p.drive !== null &&
                        replacedOwned(p.element, p.drive.written))
            )
        })
        const presentedRects = new Map<Participant, Box>()
        list.forEach((p, i) => {
            if (unpresented[i]) radius.delete(p)
            else presentedRects.set(p, rects[i]!)
        })
        const current: Capture = {
            live: true,
            aged: inFrame,
            disarm: noop,
            rects: presentedRects,
            offsets: new Map(list.map((p, i) => [p, offsets[i]!])),
            unsupported: new Map(
                list.flatMap((p, i) => {
                    const reason = unsupported[i]
                    return reason ? [[p, reason] as const] : []
                })
            ),
            radius,
            engine,
        }
        if (inFrame) {
            warn(
                'in-frame',
                'capture() or update() ran while the clock runs a frame (a requestAnimationFrame callback), so its capture is aged and the change does not animate. Call it from an ordinary task: an event handler, a timer or a promise callback.'
            )
        } else {
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
        if (!run || run.done) return
        run.done = true
        for (const p of run.nodes) if (p.drive?.run === run) p.drive.run = null
        run.nodes.clear()
        run.resolve({ status: 'interrupted', snapped: run.snapped })
    }

    function nearestParticipant(element: HTMLElement): Participant | null {
        for (let node = flatParent(element); node; node = flatParent(node)) {
            const p = registry.get(node)
            if (p && !p.removed && node.isConnected) return p
        }
        return null
    }

    function resolveGeometry(
        p: Participant,
        rect: Box,
        m: Measured,
        parentFull: Map2,
        parentRest: Map2,
        dpr: number
    ): { geometry: Geometry; full: Map2 } {
        const local = mapBox(invert(parentFull), rect)
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
        const full = compose(parentFull, ownMap(css, own))
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
        const rest = compose(parentRest, inner)
        let radius: number[] | null = null
        if (m.radius) {
            radius = m.radius.map((len: Len, i) =>
                resolveLen(len, i % 2 === 0 ? css.w : css.h)
            )
        }
        return {
            geometry: {
                a: mapBox(parentRest, box),
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
            for (const [a, m] of node.ancestry) if (moved(a, m)) return true
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

    function flush(): Promise<LayoutReport> {
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
        const fresh = cap !== null && !cap.aged ? cap : null
        const measured = fresh !== null

        // drives of participants that left the document end here (their
        // restores are written with the others, after every read); the author's
        // inline changes to owned properties are taken in (§6)
        for (const p of registry.values()) {
            if (!p.drive) continue
            if (p.element.isConnected)
                adoptAuthored(p.element, p.drive.saved, p.drive.written)
            else settle(p, true)
        }
        const { list, parents, index } = participantTree()
        if (list.length === 0) {
            frame = []
            commitWrites()
            realizer.stop()
            stats.tracks = 0
            return resolved('no-change')
        }
        const hasChild = list.map(() => false)
        for (const parent of parents) if (parent >= 0) hasChild[parent] = true
        /** Each node's A at its previous flush, before this one replaces it. */
        const lastBoxes = list.map((p) => p.lastBox)

        // the engine's own state at t_k: the fresh capture's, or now when there
        // is none (its last writes describe the presented frame either way)
        const engine = fresh?.engine ?? engineState()
        /** Each frame node as its running track was planned. */
        const frozen = new Map<Participant, FrameNode>()
        for (const node of frame) frozen.set(node.p, node)

        // 1. reads: every rect and layout size, then computed styles of what
        // the support check and the plan need
        const doc = list[0]!.element.ownerDocument
        // probed when the scope was created; another document is probed here
        const snapsReference = snapsReferenceBox(doc)
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
                let m = measure(
                    p.element,
                    ownsRadius(p.options),
                    animatedNow,
                    snapsReference,
                    styleOf(i)
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
        measureNodes(chained)

        // the support check (§4.2) on this flush's reads, and on the fresh
        // capture's: a map the engine does not own snaps its subtree
        const flushed = supportOf(
            list,
            parents,
            rects,
            offsets,
            engine.poses,
            styleOf
        )
        const unowned = list.map(
            (p, i) => fresh?.unsupported.get(p) ?? flushed[i] ?? null
        )

        // v: the analytic velocity at t_k, through this flush's layers
        const velocity = new Map(engine.rates)
        if (measured) carryRates(index, geometry, velocity)

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
        if (fresh) {
            const nodes: PresentedNode[] = []
            const of: number[] = []
            const slot = new Map<number, number>()
            list.forEach((p, i) => {
                const g = geometry[i]
                const rect = fresh.rects.get(p)
                const parent = parents[i]!
                if (!g || !rect || (parent >= 0 && !slot.has(parent))) return
                const css = mapBox(invert(g.inner), g.box)
                slot.set(i, nodes.length)
                of.push(i)
                nodes.push({
                    parent: parent >= 0 ? slot.get(parent)! : -1,
                    rect,
                    pose: engine.poses.get(p) ?? IDENTITY_POSE,
                    inner: innerPose(g.authored, g.matrix),
                    origin: [g.ox - css.x, g.oy - css.y],
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
        }

        const reduced = reducedMode()
        const ids = new Map<string, IdHistory>()
        const at = now()
        for (const [id, entry] of retained) {
            if (entry.until < at) retained.delete(id)
        }
        const idsOf = (): Map<string, IdHistory> => {
            ids.clear()
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
                    const m = ancestry.get(list[k]!)
                    return m && matrices[k] && !sameMatrix(m, matrices[k]!)
                })
                if (!differs) return fallback
                let rest = IDENTITY_MAP
                for (const k of chain) {
                    const ga = geometry[k]
                    const m = ancestry.get(list[k]!) ?? matrices[k]
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
                    const m = ancestry.get(list[k]!) ?? matrices[k]
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
        const planned = plannedBoxes()

        /**
         * Per running track, its re-expression (§5.7): `δ = A_new − A_old` of
         * its origin channels (both rest boxes, each in its own flush's view
         * space), `ρ` per axis over its participant ancestors, and the path.
         * A track whose ancestors changed since it was planned retargets.
         */
        const reexpress = list.map((p, i) => {
            const d = p.drive
            const was = frozen.get(p)
            const own = planned[i]?.own
            if (
                d?.kind !== 'track' ||
                d.track === null ||
                trackEnded(d.track, d.elapsed) ||
                !was ||
                !own
            ) {
                return null
            }
            const track = d.track
            const dx = own.x + track.fx * own.w - track.a[0]
            const dy = own.y + track.fy * own.h - track.a[1]
            const before = frameChainOf(was)
            const ancestors: KeepAncestor[] = []
            let rhoX = 1
            let rhoY = 1
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
                    was.ancestry.get(a) ?? fa.geometry.matrix
                )
                rhoX *= (pose.sx * innerNow.sx) / innerPlanned.sx
                rhoY *= (pose.sy * innerNow.sy) / innerPlanned.sy
                ancestors.push({
                    pose: { sx: pose.sx, sy: pose.sy },
                    innerNow: { sx: innerNow.sx, sy: innerNow.sy },
                    innerPlanned: { sx: innerPlanned.sx, sy: innerPlanned.sy },
                })
            }
            if (n !== before.length) same = false
            const path: KeepPath = same
                ? keepPath({ delta: { x: dx, y: dy }, ancestors })
                : 'retarget'
            return { dx, dy, rho: { x: rhoX, y: rhoY }, path }
        })

        /** Why each node cannot be animated exactly, for its warning. */
        const why: (string | null)[] = list.map(() => null)
        const planNodes = (): PlanNode[] => {
            return list.map((p, i) => {
                const g = geometry[i]
                const a = g?.a ?? rects[i]!
                const d = p.drive
                // B is a measurement of what was presented, driven or not
                const before =
                    p.keyChanged || !fresh ? null : (fresh.rects.get(p) ?? null)
                const moving =
                    d?.kind === 'track' &&
                    d.track !== null &&
                    !trackEnded(d.track, d.elapsed)
                const holding = moving && d!.elapsed < d!.track!.delay
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
                const presence = presenceOf(p.element)
                why[i] = unsupported
                return {
                    parent: parents[i]!,
                    order: p.order,
                    a,
                    fx: g?.fx ?? 0.5,
                    fy: g?.fy ?? 0.5,
                    before,
                    // the WAAPI engine has no velocity term (§10)
                    velocity:
                        moving && !holding && !waapi
                            ? (velocity.get(p) ?? null)
                            : null,
                    moving,
                    track: moving ? d!.track : null,
                    trackTarget: moving ? d!.target : null,
                    planned: moving ? (planned[i]?.own ?? null) : null,
                    parentPlanned: moving ? (planned[i]?.parent ?? null) : null,
                    presented: moving ? (planned[i]?.presented ?? null) : null,
                    parentPresented: moving
                        ? (planned[i]?.parentPresented ?? null)
                        : null,
                    path: moving ? (reexpress[i]?.path ?? 'retarget') : null,
                    mode: options.layout ?? true,
                    anchor: options.layoutAnchor ?? null,
                    motion: motionOf(p, reduced),
                    layoutId: p.keyChanged ? null : (options.layoutId ?? null),
                    crossfade: options.layoutCrossfade ?? true,
                    exiting: exitingPresence(p.element) !== null,
                    presenceOpacity: presence?.opacity ?? false,
                    unsupported: unsupported !== null,
                    skip:
                        p.keyChanged ||
                        (hasDependency &&
                            p.dependency !== null &&
                            Object.is(
                                p.dependency.value,
                                options.layoutDependency
                            )),
                    // a changed reduced-motion mode re-plans a running track
                    optionsChanged:
                        p.changed || (moving && d!.mode !== reduced),
                    following:
                        d?.kind === 'follow' && d.lead
                            ? (index.get(d.lead) ?? -1)
                            : -1,
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
            measured,
        })
        for (;;) {
            const wanted = result.actions.map(
                (action) => action.kind !== 'none'
            )
            const added = measureNodes(wanted)
            // the plan assumed a centred origin and support for every node it
            // had not measured; it is redone only when that assumption failed
            const assumed = added.every((i) => {
                const g = geometry[i]!
                return g.unsupported === null && g.fx === 0.5 && g.fy === 0.5
            })
            if (assumed) break
            nodes = planNodes()
            result = plan({
                nodes,
                ids: idsOf(),
                viewport,
                threshold,
                maxNodes,
                measured,
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
        for (const p of list) {
            const id = p.options.layoutId
            if (
                id === undefined ||
                result.leads.has(id) ||
                exitingPresence(p.element) !== null
            ) {
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

        // 3. outcome
        const snapped: { element: HTMLElement; reason: SnapReason }[] =
            result.snapped.map(({ index: i, reason }) => ({
                element: list[i]!.element,
                reason,
            }))
        let actions: readonly Action[] = result.actions
        let status: LayoutStatus | null = null
        if (result.status === 'capped') {
            status = 'capped'
        } else if (reduced === 'jump') {
            const moves = actions.some(
                (a) => a.kind === 'track' || a.kind === 'follow'
            )
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
            status = moves ? 'reduced' : null
        }
        if (!measured) {
            // §4.4: every node that may have jumped is reported, once
            const reported = list.map(() => false)
            const already = new Set(snapped.map((s) => s.element))
            result.actions.forEach((action, i) => {
                const p = list[i]!
                const node = nodes[i]!
                if (already.has(p.element) || node.skip) return
                const r = reexpress[i]
                if (action.kind === 'keep' && r) {
                    reported[i] = staleReported(
                        {
                            driven: true,
                            a: node.a,
                            lastKnown: null,
                            delta: { x: r.dx, y: r.dy },
                            rho: r.rho,
                            translationExact: r.path !== 'retarget',
                        },
                        threshold,
                        () => 0
                    )
                } else if (action.kind !== 'follow') {
                    reported[i] = staleReported(
                        {
                            driven: false,
                            a: node.a,
                            lastKnown:
                                cap?.rects.get(p) ?? lastBoxes[i] ?? null,
                            delta: { x: 0, y: 0 },
                            rho: { x: 1, y: 1 },
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
                if (reported[i])
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

        // 4. apply: every write happens after every read
        let run: Run | null = null
        let promise: Promise<LayoutReport> | null = null
        if (actions.some((a) => a.kind === 'track')) {
            promise = new Promise<LayoutReport>((resolve) => {
                run = { nodes: new Set(), snapped, resolve, done: false }
            })
        }
        const startDrive = (
            p: Participant,
            kind: Drive['kind'],
            g: Geometry,
            properties: readonly string[]
        ): Drive => {
            const existing = p.drive
            if (existing) {
                // an owned property it did not save yet (opacity for a new
                // crossfade, corners when `radius` was turned on mid-run)
                const wanted = [...properties]
                if (ownsRadius(p.options) && g.radius)
                    wanted.push(...RADIUS_PROPERTIES)
                const missing = wanted.filter(
                    (prop) => !existing.saved.has(prop)
                )
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
            const all = waapi ? [] : [...POSE_PROPERTIES, ...properties]
            if (!waapi && ownsRadius(p.options) && g.radius)
                all.push(...RADIUS_PROPERTIES)
            const d: Drive = {
                kind,
                track: null,
                target: null,
                elapsed: 0,
                started: false,
                fade: null,
                radiusBlend: null,
                lead: null,
                saved: save(p.element, all),
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

        // Radius handoff state comes from B's radii, measured by the fresh
        // capture, or from a retained removed lead (§4.1, §5.8, §5.9).
        const radiusBlendFrom = new Map<
            number,
            Pick<RadiusBlend, 'from' | 'to'>
        >()
        actions.forEach((action, i) => {
            if (action.kind !== 'track' || !ownsRadius(list[i]!.options)) return
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
                    followerFade?.role === 'lead' && !fadeEnded(followerFade)
                        ? currentFadeOpacity(followerFade)
                        : 1,
            })
        })

        actions.forEach((action, i) => {
            const p = list[i]!
            const g = geometry[i]
            const d = p.drive
            switch (action.kind) {
                case 'none':
                    if (reduced === 'jump' && d?.fade) endFade(p)
                    // a crossfade follower stays invisible until presence removes it
                    if (d && (d.kind !== 'held' || !nodes[i]!.exiting))
                        settle(p)
                    return
                case 'keep': {
                    // re-expressed in this flush's view space by δ (§5.7
                    // path 2; §4.4 whatever the path, with no B to retarget
                    // from): its pose relative to its layout box is unchanged
                    const r = reexpress[i]
                    if (!r || r.path === 'unchanged' || !d?.track || !d.target)
                        return
                    d.track = translated(d.track, r.dx, r.dy)
                    d.target = {
                        ...d.target,
                        x: d.target.x + r.dx,
                        y: d.target.y + r.dy,
                    }
                    // the same animation draws it: the WAAPI pose is relative too
                    const running = animations.get(p)
                    if (running) {
                        animations.set(p, {
                            animation: running.animation,
                            track: d.track,
                        })
                    }
                    return
                }
                case 'static': {
                    if (d?.kind === 'held') return
                    if (d?.run) {
                        finishRunNode(p)
                        d.run = null
                    }
                    const drive = startDrive(p, 'static', g!, [])
                    drive.track = null
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
                    if (wasFollower && !action.fadeLead)
                        restoreOpacity(p.element, drive)
                    // a node painted moving continues from that frame's time:
                    // B and its velocity are the drawn box and velocity of the
                    // last painted frame, so a held first frame would stall it
                    // (§4.3); a drive no frame has drawn yet is still at rest
                    const continues =
                        action.track.moving && (d?.started ?? true)
                    drive.release?.()
                    drive.release = null
                    drive.track = action.track
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
                    ;(run as Run | null)?.nodes.add(p)
                    return
                }
                case 'follow': {
                    if (!action.start) {
                        const blend = radiusBlendFrom.get(action.lead)
                        if (blend && d) d.radiusBlend = blend
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
                    const presence = exitingPresence(p.element)
                    if (presence) {
                        let release!: () => void
                        presence.hold(
                            new Promise<void>((done) => {
                                release = done
                            })
                        )
                        drive.release = release
                    }
                    return
                }
            }
        })

        // the frame: every driven node and its participant ancestors
        const inFrame: boolean[] = list.map((p) => p.drive !== null)
        for (let i = list.length - 1; i >= 0; i--) {
            if (inFrame[i] && parents[i]! >= 0) inFrame[parents[i]!] = true
        }
        const frameIndex = new Map<number, number>()
        const next: FrameNode[] = []
        list.forEach((p, i) => {
            if (!inFrame[i]) return
            frameIndex.set(i, next.length)
            const parent = parents[i]!
            // a kept track (or a continuing follower) keeps the presence
            // matrices it was planned with, its own and its ancestors': a
            // presence transform changed since stays a visual layer over it
            // (§3.1); its CSS box is the current one. A new track starts in
            // this flush's space.
            const action = actions[i]!
            const continues =
                action.kind === 'keep' ||
                (action.kind === 'follow' && !action.start)
            const kept = continues ? frozen.get(p) : undefined
            let ancestry = kept?.ancestry
            if (!ancestry) {
                const now = new Map<Participant, Matrix>()
                for (let k = parent; k >= 0; k = parents[k]!) {
                    if (inFrame[k]) now.set(list[k]!, geometry[k]!.matrix)
                }
                ancestry = now.size > 0 ? now : NO_ANCESTRY
            }
            next.push({
                p,
                parent: parent >= 0 ? frameIndex.get(parent)! : -1,
                geometry: kept
                    ? keptGeometry(
                          kept.geometry,
                          geometry[i]!,
                          nodes[i]!.planned ?? kept.geometry.a
                      )
                    : geometry[i]!,
                ancestry,
            })
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

        for (const { element, reason } of snapped)
            options.onSnap?.(element, reason)

        const started = run as Run | null
        if (promise && started) {
            if (started.nodes.size === 0 && !started.done) {
                started.done = true
                started.resolve({ status: 'ended', snapped })
            }
            return promise
        }
        // no track ran (§9.3): 'reduced', then 'stale', then 'no-change'
        return resolved(
            status ??
                (snapped.some((s) => s.reason === 'reduced')
                    ? 'reduced'
                    : snapped.some((s) => s.reason === 'stale')
                      ? 'stale'
                      : 'no-change'),
            snapped
        )
    }

    /* ───────────────────────── lifecycle ───────────────────────── */

    function countTracks(): number {
        let tracks = 0
        for (const node of frame) {
            const d = node.p.drive
            if (
                d?.kind === 'track' &&
                d.track &&
                !trackEnded(d.track, d.elapsed)
            ) {
                tracks += 1
            }
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
            }
        })
    }

    function finishAll(status: 'ended' | 'disposed'): void {
        // every run reports the cause before its nodes settle
        const runs = new Set<Run>()
        for (const node of frame)
            if (node.p.drive?.run) runs.add(node.p.drive.run)
        for (const r of runs) {
            if (r.done) continue
            r.done = true
            r.resolve({ status, snapped: r.snapped })
        }
        // every track jumps to A
        for (const node of frame) {
            const d = node.p.drive
            if (!d || d.kind === 'held') continue
            if (d.track) d.elapsed = trackEndTime(d.track)
            if (d.fade) d.fade.elapsed = d.fade.law.duration
        }
        if (status === 'ended' && !waapi) {
            step(null)
            commitWrites()
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
    }

    function invalidateHold(_p: Participant): void {
        // P4 drive seam: invalidate any live hold on `_p`
    }

    function stopParticipantDrive(p: Participant, cancelled: boolean): void {
        const d = p.drive
        if (!d) return
        pending = pending.filter((w) => w.element !== p.element)
        settle(p, cancelled)
        commitWrites()
        rebuildFrame()
        stats.tracks = countTracks()
        if (
            !frame.some(
                (node) => node.p.drive !== null && node.p.drive.kind !== 'held'
            )
        ) {
            realizer.stop()
        }
    }

    /**
     * Unregisters a participant whose element was adopted into another
     * document (§4.6, §7.2 `document-mismatch`).
     */
    function documentMismatch(p: Participant): void {
        p.removed = true
        registry.delete(p.element)
        invalidateHold(p)
        const id = p.options.layoutId
        if (id !== undefined && leads.get(id) === p) {
            leads.delete(id)
            retained.delete(id)
        }
        forgetCaptured(p)
        stopParticipantDrive(p, true)
        warn(
            'document-mismatch',
            'a participant was adopted into another document; its track was ended and it was unregistered.'
        )
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
        capture?.offsets.delete(p)
        capture?.radius.delete(p)
        capture?.unsupported.delete(p)
    }

    function validateWaapiNesting(element: HTMLElement): void {
        for (const other of registry.keys()) {
            if (
                other !== element &&
                (containsFlat(other, element) || containsFlat(element, other))
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
                    geometry: null,
                    parent: null,
                    removed: false,
                    motion: null,
                }
                registry.set(element, p)
            }
            const self = p
            return () => {
                if (self.removed || registry.get(element) !== self) return
                self.removed = true
                registry.delete(element)
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
                            until: now() + retain * 1000,
                        })
                }
                const d = self.drive
                if (d) {
                    // unmount cancels its track (§9): the run reports
                    // 'disposed' if nothing else of it is left
                    cancelRunNode(self)
                    stopAnimation(self)
                    d.release?.()
                    self.drive = null
                    pending = pending.filter((w) => w.element !== element)
                    queueRestore(element, d)
                    commitWrites()
                    rebuildFrame()
                    stats.tracks = countTracks()
                    // unsubscribe once this task's microtasks have run, unless
                    // a flush among them (a handoff) started a run: stopping
                    // now would make that flush re-subscribe, and the clock
                    // gives a joining subscriber only the time since it
                    // joined, a held or short first frame (§4.3)
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
            p.options = layoutOptions
            p.motion = null
        },

        capture: takeCapture,

        flush,

        update(mutate) {
            takeCapture()
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
            finishAll('ended')
        },

        dispose() {
            if (disposed) return
            finishAll('disposed')
            disposed = true
            capture?.disarm()
            capture = null
            for (const p of registry.values()) p.removed = true
            registry.clear()
            frame = []
            leads.clear()
            retained.clear()
        },

        get stats() {
            return {
                captures: stats.captures,
                reads: stats.rects + stats.offsets + stats.styles,
                rects: stats.rects,
                offsets: stats.offsets,
                styles: stats.styles,
                tracks: stats.tracks,
                // live holds: the drive seam has none yet (§5.10)
                holds: 0,
            }
        },
    }
    return group
}
