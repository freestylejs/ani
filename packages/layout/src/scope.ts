/**
 * The layout scope: registry, capture epochs, flush, runs and lifecycle
 * (§4, §5.5, §5.6, §9). The public `LayoutGroup`.
 */
import { type Clock, DEV, defaultClock } from '@freestylejs/ani-core'
import {
    adoptAuthored,
    animatedOwned,
    borderSize,
    type Len,
    type Measured,
    measure,
    OPACITY_PROPERTIES,
    OWNED_PRIORITY,
    POSE_PROPERTIES,
    pageRect,
    pageScroll,
    put,
    RADIUS_PROPERTIES,
    readRadius,
    resolveLen,
    type Saved,
    save,
    scrolledSince,
    scrollOffsets,
    viewportBox,
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
    STILL_IDENTITY,
    still,
    unmapOwn,
    usedOrigin,
} from './geometry'
import {
    assertKeys,
    type Curve,
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
    validateReducedMotion,
} from './motion'
import {
    type Action,
    type IdHistory,
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
    type Layer,
    movingParents,
    type RadiusBlend,
    type Solved,
    type SolveNode,
    solve,
    type Track,
    trackEnded,
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
/** Border-box size check for a non-participant ancestor's scale (px, relative). */
const SIZE_TOLERANCE_PX = 0.1
const SIZE_TOLERANCE_REL = 1e-3

function within(measured: number, exact: number, slack: number): boolean {
    return (
        Math.abs(measured - exact) <=
        slack + SIZE_TOLERANCE_PX + SIZE_TOLERANCE_REL * exact
    )
}

/**
 * Whether the CSS box recovered from the rect has the element's real size:
 * otherwise an ancestor that is not a participant scales, rotates or skews.
 * The rounded offset size decides when it can; the exact computed size only
 * when it cannot.
 */
function sizeMatches(
    element: HTMLElement,
    css: Box,
    rounded: readonly [number, number]
): boolean {
    if (within(css.w, rounded[0], 0.5) && within(css.h, rounded[1], 0.5)) {
        // rounding hides at most half a pixel: only a near-1 scale on a tiny box escapes
        return true
    }
    const exact = borderSize(element)
    if (!exact) return true
    return within(css.w, exact[0], 0) && within(css.h, exact[1], 0)
}

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
    /** Page map at rest: the parent's rest map ∘ `Q`. */
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
    readonly duration: number
    readonly curve: Curve
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

interface Capture {
    live: boolean
    readonly rects: Map<Participant, Box>
    /** Resting shared radius:true participants' resolved radii at B. */
    readonly radius: Map<Participant, readonly number[]>
    /** Participants driven at capture time (not read: B is their drawn box). */
    readonly driven: Set<Participant>
    readonly scroll: ReadonlyMap<Element, readonly [number, number]>
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

/** The inner map `Q` (§3.1): authored translate/scale with a presence matrix, about the origin. */
function innerOf(au: Authored, m: Matrix, ox: number, oy: number): Map2 {
    return aboutOrigin(
        {
            tx: au.tx + au.sx * m.e,
            ty: au.ty + au.sy * m.f,
            sx: au.sx * m.a,
            sy: au.sy * m.d,
        },
        ox,
        oy
    )
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

interface Retained {
    readonly box: Box
    readonly velocity: BoxVelocity | null
    /** The removed lead's on-screen radii, when it owned radius. */
    readonly radius: readonly number[] | null
    readonly until: number
    /**
     * The participant the lead was drawn under, until the next flush carries
     * the box through its current presence layers (§5.6).
     */
    readonly parent: Participant | null
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
function validateWaapiOptions(options: LayoutOptions | undefined): void {
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
}

function format(n: number): string {
    // avoid exponent notation, which CSS lengths do not accept
    return Math.abs(n) < 1e-9 ? '0' : String(Number(n.toFixed(6)))
}

function fadeEnded(fade: DriveFade): boolean {
    return fade.elapsed >= fade.duration
}

/** Current opacity of a running fade layer, sampled for reversal continuity. */
function currentFadeOpacity(fade: DriveFade): number {
    return fadeOpacity({
        role: fade.role,
        from: fade.from,
        elapsed: Math.max(0, fade.elapsed),
        duration: fade.duration,
        curve: fade.curve,
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
    const stats = { captures: 0, reads: 0, tracks: 0 }

    function warn(kind: string, message: string): void {
        if (!DEV || warned.has(kind)) return
        warned.add(kind)
        // biome-ignore lint/suspicious/noConsole: development warning
        console.warn(`[ani-layout] ${message}`)
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
                          duration: d.fade.duration,
                          curve: d.fade.curve,
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
            const start = drawnBoxes(solveNodes([{ ...node, parent: -1 }]))[0]!
            const a = node.geometry.a
            const au = d.authored
            const animation = play(
                p.element,
                {
                    from: [start.x - a.x + au.tx, start.y - a.y + au.ty],
                    to: [au.tx, au.ty],
                    duration: track.duration,
                    delay: track.delay,
                    curve: track.curve,
                },
                () => {
                    if (animations.get(p)?.animation !== animation) return
                    d.elapsed = track.delay + track.duration
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

    function takeCapture(): void {
        if (disposed || !hasDOM()) return
        if (capture?.live) return
        const rects = new Map<Participant, Box>()
        const radius = new Map<Participant, readonly number[]>()
        const driven = new Set<Participant>()
        const elements: HTMLElement[] = []
        const radiusParticipants: Participant[] = []
        let scroll: readonly [number, number] | null = null
        for (const p of registry.values()) {
            if (!p.element.isConnected) continue
            elements.push(p.element)
            if (p.drive) {
                driven.add(p)
                continue
            }
            scroll ??= pageScroll(p.element.ownerDocument)
            rects.set(p, pageRect(p.element, scroll))
            stats.reads += 1
            if (p.options.layoutId !== undefined && ownsRadius(p.options)) {
                radiusParticipants.push(p)
            }
        }
        for (const p of radiusParticipants) {
            const value = readRadius(p.element)
            stats.reads += 1
            if (value) radius.set(p, value)
        }
        const current: Capture = {
            live: true,
            rects,
            radius,
            driven,
            scroll: scrollOffsets(elements),
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
        for (
            let node = element.parentElement;
            node;
            node = node.parentElement
        ) {
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
        if (!unsupported && !sizeMatches(p.element, css, m.size)) {
            unsupported =
                'a scaled, rotated or skewed ancestor that is not a participant'
        }
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
     * B of a driven node is its drawn box as the user sees it now: through the
     * presence layers as they are at this flush, not as they were frozen at the
     * last one (§3.1). Only the presence matrices can differ (they are not
     * React's, so the commit did not change them); the poses are the engine's
     * own. Each pose is recovered with its rate from the drawn box and its
     * velocity, then composed through the current layers, so a velocity is
     * carried exactly (§5.5): a parent's motion stays a translation whatever
     * the child's own scale. A lead removed since the last flush is carried
     * through its parent's current layers the same way (§5.6).
     */
    function reconcileLayers(
        index: ReadonlyMap<Participant, number>,
        geometry: readonly (Geometry | null)[],
        drawn: Map<Participant, Box>,
        velocity: Map<Participant, BoxVelocity>
    ): void {
        const pending = [...retained].filter(([, entry]) => entry.parent)
        for (const [id, entry] of pending) {
            retained.set(id, { ...entry, parent: null })
        }
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
        // each node's full map as solved, with its rate (read before any is carried)
        const ontos = frame.map((node) => {
            const g = node.geometry
            return movingOnto(
                mapBox(invert(g.inner), g.box),
                drawn.get(node.p) ?? g.a,
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
        const before: MovingMap[] = []
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
                before.push(composeMoving(parentWas(k), still(g.inner)))
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
            before.push(onto)
            after.push(next)
            if (!node.p.drive) return
            const seen = carry(
                next,
                mapBox(invert(g.inner), g.box),
                ZERO_VELOCITY
            )
            drawn.set(node.p, seen.box)
            velocity.set(node.p, seen.velocity)
        })
        for (const [id, entry] of pending) {
            const k = frame.findIndex((node) => node.p === entry.parent)
            if (k < 0 || entry.parent?.removed) continue
            const shift = composeMoving(after[k]!, invertMoving(before[k]!))
            const moved = carry(
                shift,
                entry.box,
                entry.velocity ?? ZERO_VELOCITY
            )
            retained.set(id, {
                box: moved.box,
                velocity: entry.velocity ? moved.velocity : null,
                radius: entry.radius,
                until: entry.until,
                parent: null,
            })
        }
    }

    function flush(): Promise<LayoutReport> {
        if (disposed) return resolved('disposed')
        const cap = capture
        capture = null
        if (!hasDOM()) return resolved('no-change')

        // drives of participants that left the document end here (their
        // restores are written with the others, after every read); the author's
        // inline changes to owned properties are taken in (§6)
        for (const p of registry.values()) {
            if (!p.drive) continue
            if (p.element.isConnected)
                adoptAuthored(p.element, p.drive.saved, p.drive.written)
            else settle(p, true)
        }
        const list = [...registry.values()].filter((p) => p.element.isConnected)
        if (list.length === 0) {
            frame = []
            commitWrites()
            realizer.stop()
            stats.tracks = 0
            return resolved('no-change')
        }

        // tree, parents first
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
        const hasChild = list.map(() => false)
        for (const parent of parents) if (parent >= 0) hasChild[parent] = true

        // the engine's own state before this flush
        if (waapi) syncAnimations()
        /** Each frame node as its running track was planned. */
        const frozen = new Map<Participant, FrameNode>()
        for (const node of frame) frozen.set(node.p, node)
        const nowSolve = solveNodes(frame)
        const drawn = new Map<Participant, Box>()
        const velocity = new Map<Participant, BoxVelocity>()
        const drawnRadius = new Map<Participant, readonly number[]>()
        if (frame.length > 0) {
            const solved = solve(nowSolve)
            const velocities = drawnVelocities(nowSolve)
            frame.forEach((node, i) => {
                const value = solved[i]!
                const input = nowSolve[i]!
                drawn.set(node.p, value.drawn)
                velocity.set(node.p, velocities[i]!)
                if (value.radius) {
                    drawnRadius.set(
                        node.p,
                        value.radius.map(
                            (r, j) =>
                                r *
                                (j % 2 === 0
                                    ? value.drawn.w / input.a.w
                                    : value.drawn.h / input.a.h)
                        )
                    )
                }
            })
        }

        // 1. reads: every rect, then computed styles of what the plan needs
        const doc = list[0]!.element.ownerDocument
        // probed when the scope was created; another document is probed here
        const snapsReference = snapsReferenceBox(doc)
        const dpr = doc.defaultView?.devicePixelRatio ?? 1
        const scroll = pageScroll(doc)
        const rects = list.map((p) => pageRect(p.element, scroll))
        stats.reads += list.length
        const stale = cap ? scrolledSince(cap.scroll) : false
        const viewport = viewportBox(doc)

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
                    snapsReference
                )
                stats.reads += 1
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
        // every node with a driven node at or above it divides out poses; the
        // parent of a lead removed since the last flush carries its box
        const carriers = new Set<Participant | null>()
        for (const entry of retained.values()) carriers.add(entry.parent)
        const chained: boolean[] = []
        list.forEach((p, i) => {
            const parent = parents[i]!
            chained.push(
                p.drive !== null ||
                    carriers.has(p) ||
                    (parent >= 0 && chained[parent]!)
            )
        })
        measureNodes(chained)
        reconcileLayers(index, geometry, drawn, velocity)

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
         * Every running track's A, and its parent's, under the presence
         * matrices frozen with the track (§3.1): what A is if only the layout
         * changed. Parents first.
         */
        const plannedBoxes = (): ({
            own: Box
            parent: Box | null
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
                return {
                    own: mapBox(base, mapBox(inner, css)),
                    // the parent's CSS box through the same ancestors
                    parent: gp
                        ? mapBox(base, mapBox(invert(gp.inner), gp.box))
                        : null,
                }
            })
        }

        const planNodes = (): PlanNode[] => {
            const planned = plannedBoxes()
            return list.map((p, i) => {
                const g = geometry[i]
                const a = g?.a ?? rects[i]!
                const d = p.drive
                let before: Box | null = null
                if (d) before = drawn.get(p) ?? p.lastBox
                else if (cap) {
                    before =
                        cap.rects.get(p) ??
                        (cap.driven.has(p) ? p.lastBox : null)
                }
                const moving =
                    d?.kind === 'track' &&
                    d.track !== null &&
                    !trackEnded(d.track, d.elapsed)
                const holding = moving && d!.elapsed < d!.track!.delay
                const options = p.options
                let unsupported = g?.unsupported ?? null
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
                    mode: options.layout ?? true,
                    anchor: options.layoutAnchor ?? null,
                    motion: motionOf(p, reduced),
                    layoutId: options.layoutId ?? null,
                    crossfade: options.layoutCrossfade ?? true,
                    exiting: exitingPresence(p.element) !== null,
                    presenceOpacity: presence?.opacity ?? false,
                    unsupported: unsupported !== null,
                    skip:
                        hasDependency &&
                        p.dependency !== null &&
                        Object.is(p.dependency.value, options.layoutDependency),
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
            stale,
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
                stale,
            })
        }

        // bookkeeping that does not depend on the outcome
        list.forEach((p, i) => {
            p.parent = parents[i]! >= 0 ? list[parents[i]!]! : null
            if (geometry[i]) p.geometry = geometry[i]
            p.lastBox = geometry[i]?.a ?? rects[i]!
            p.changed = false
            p.dependency =
                'layoutDependency' in p.options
                    ? { value: p.options.layoutDependency }
                    : null
        })
        for (const [id, lead] of result.leads) leads.set(id, list[lead]!)

        for (const warning of result.warnings) {
            if (warning.kind === 'duplicate-id') {
                warn(
                    `duplicate:${warning.id}`,
                    `two live participants share layoutId "${warning.id}"; the newest leads and the other animates on its own.`
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
        if (result.status !== 'run') {
            status = result.status
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
        for (const { element, reason } of snapped) {
            if (reason === 'unsupported') {
                const p = registry.get(element)!
                const g = p.geometry
                warn(
                    'unsupported',
                    `a participant cannot be animated exactly and snaps (${g?.unsupported ?? 'unsupported'}).`
                )
            } else if (reason === 'capped') {
                warn(
                    'capped',
                    `more than ${maxNodes} visible participants moved at once; the change snaps. Raise maxNodes or narrow the scope.`
                )
            } else if (reason === 'stale') {
                warn(
                    'stale',
                    'a scroll container scrolled between capture and flush; the change snaps.'
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

        // Radius handoff state is derived entirely from the pre-flush frame,
        // the current flush's measurements, or a retained removed lead (§5.7).
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
                    source =
                        drawnRadius.get(previous) ??
                        cap?.radius.get(previous) ??
                        previous.geometry?.radius ??
                        null
                } else {
                    const id = list[i]!.options.layoutId
                    source =
                        id === undefined
                            ? null
                            : (retained.get(id)?.radius ?? null)
                }
            } else if (list[i]!.drive?.radiusBlend) {
                // A retarget of a running blend starts from what is painted.
                source = drawnRadius.get(list[i]!) ?? null
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
                case 'keep':
                    return
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
                              duration: action.track.duration,
                              curve: action.track.curve,
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
                        duration: track?.duration ?? 0,
                        curve: track?.curve ?? nodes[i]!.motion.curve,
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
        return resolved(status ?? 'no-change', snapped)
    }

    /* ───────────────────────── lifecycle ───────────────────────── */

    /** The drawn state of a driven node now, derived without a DOM read. */
    function currentMotion(p: Participant): {
        box: Box
        velocity: BoxVelocity | null
        radius: readonly number[] | null
    } | null {
        const d = p.drive
        if (!d) return null
        const at = frame.findIndex((node) => node.p === p)
        if (at < 0) return null
        if (waapi) syncAnimations()
        const nodes = solveNodes(frame)
        const value = solve(nodes)[at]
        if (!value) return null
        const input = nodes[at]!
        const moving =
            d.kind === 'track' &&
            d.track !== null &&
            !trackEnded(d.track, d.elapsed) &&
            d.elapsed >= d.track.delay
        return {
            box: value.drawn,
            velocity: moving ? (drawnVelocities(nodes)[at] ?? null) : null,
            radius: value.radius
                ? value.radius.map(
                      (r, j) =>
                          r *
                          (j % 2 === 0
                              ? value.drawn.w / input.a.w
                              : value.drawn.h / input.a.h)
                  )
                : null,
        }
    }

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
            if (d.track) d.elapsed = d.track.delay + d.track.duration
            if (d.fade) d.fade.elapsed = d.fade.duration
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

    const group: LayoutGroup = {
        add(element, layoutOptions) {
            validateLayoutOptions(layoutOptions)
            if (waapi) {
                validateWaapiOptions(layoutOptions)
                for (const other of registry.keys()) {
                    if (
                        other !== element &&
                        (other.contains(element) || element.contains(other))
                    ) {
                        throw invalidOptions(
                            'type',
                            "the 'waapi' engine animates top-level participants only; a nested participant needs the 'raf' engine."
                        )
                    }
                }
            }
            if (disposed) return noop
            let p = registry.get(element)
            if (p) {
                // only a change that draws another track retargets (§3.3 inv. 5)
                if (
                    !sameTrackOptions(
                        p.options,
                        layoutOptions ?? {},
                        groupMotion
                    )
                )
                    p.changed = true
                p.options = layoutOptions ?? {}
                p.motion = null
            } else {
                p = {
                    element,
                    options: layoutOptions ?? {},
                    order: ++sequence,
                    changed: false,
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
                    // the box and the velocity it left with (§5.6)
                    const motion = currentMotion(self)
                    const box =
                        motion?.box ?? capture?.rects.get(self) ?? self.lastBox
                    leads.delete(id)
                    if (box && retain > 0)
                        retained.set(id, {
                            box,
                            velocity: motion?.velocity ?? null,
                            radius: ownsRadius(self.options)
                                ? (motion?.radius ??
                                  capture?.radius.get(self) ??
                                  self.geometry?.radius ??
                                  null)
                                : null,
                            until: now() + retain * 1000,
                            parent: motion ? self.parent : null,
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
            if (waapi) validateWaapiOptions(layoutOptions)
            const p = registry.get(element)
            if (!p) return
            if (!sameTrackOptions(p.options, layoutOptions, groupMotion))
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
                reads: stats.reads,
                tracks: stats.tracks,
            }
        },
    }
    return group
}
