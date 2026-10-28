/**
 * Per frame: tracks → drawn boxes → poses (and crossfade opacities, corner
 * radii), top-down. Pure: no DOM, no clock.
 */

import { physics, type Spring } from '@freestylejs/ani-core'
import {
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
    type Pose,
    poseFor,
    STILL_IDENTITY,
    still,
} from './geometry'
import type { Curve, LayoutMode, Motion } from './motion'

/** Origin point x, origin point y, width, height. */
export type Channels = readonly [number, number, number, number]

/**
 * `layoutAnchor`: an offset from the parent's anchor point, moving
 * `from → to` on the node's own timeline like a channel. `seedX`/`seedY` are
 * the law's velocity term (§5.6): the momentum `k` of a timing track, the
 * incoming relative velocity `v₀` of a spring track.
 */
export interface AnchorRule {
    readonly u: number
    readonly v: number
    readonly fromX: number
    readonly fromY: number
    readonly toX: number
    readonly toY: number
    readonly seedX: number
    readonly seedY: number
}

/** An anchor offset path before its law is known: the incoming relative velocity, or `null` at rest. */
export interface AnchorPath {
    readonly u: number
    readonly v: number
    readonly fromX: number
    readonly fromY: number
    readonly toX: number
    readonly toY: number
    readonly velocity: { readonly x: number; readonly y: number } | null
}

/**
 * How a track moves from B to A: a timing curve over `duration`, or a
 * physical spring of perceptual `duration` that ends at `settle` (§5.2,
 * §5.3).
 */
export type TrackLaw =
    | {
          readonly kind: 'timing'
          readonly duration: number
          readonly curve: Curve
      }
    | {
          readonly kind: 'spring'
          /** Perceptual duration: where crossfade, radius and presence release end. */
          readonly duration: number
          readonly spring: Spring
          /** Seconds after the delay at which every channel is settled. */
          readonly settle: number
      }

export interface Track {
    readonly b: Channels
    readonly a: Channels
    /**
     * Per channel, the law's velocity term: the momentum `k` of a timing
     * track (`c′(0) = v` through `k = v·D + (B − A)·e′(0)`), the incoming
     * velocity `v₀` of a spring track.
     */
    readonly seed: Channels
    /** Origin point as a fraction of the box. */
    readonly fx: number
    readonly fy: number
    readonly delay: number
    readonly law: TrackLaw
    readonly anchor: AnchorRule | null
    /**
     * Planned for a node moving at the flush (with its velocity): its time
     * continues from the last painted frame (§4.5).
     */
    readonly moving: boolean
}

/** A law that is over at once: a fade without a lead track ends immediately. */
export const INSTANT_LAW: TrackLaw = {
    kind: 'timing',
    duration: 0,
    curve: {
        value: (tau) => Math.min(1, Math.max(0, tau)),
        slope: () => 1,
        slope0: 1,
    },
}

/** A crossfade timeline, started with the lead's law at the handoff. */
export interface Fade {
    readonly role: 'lead' | 'follower'
    /** This layer's opacity at the start: lead 0/follower 1 for a new handoff, current opacity on reversal. */
    readonly from: number
    readonly elapsed: number
    /** The lead track's law: its progress drives the opacities (§5.8). */
    readonly law: TrackLaw
}

export interface RadiusBlend {
    /** Departing node's on-screen radii at the handoff. */
    readonly from: readonly number[]
    /** New lead's authored on-screen radii at A. */
    readonly to: readonly number[]
    /** The lead track whose progress drives the blend. */
    readonly track: Track
    readonly elapsed: number
}

export interface SolveNode {
    /** Index of the nearest participant ancestor, or -1. Parents come first. */
    readonly parent: number
    /** Visual box at rest (every pose identity): the track target, and where a node without a track is drawn. */
    readonly a: Box
    /** The CSS box through the node's own inner map, in its local frame: what its pose moves. */
    readonly box: Box
    /** Transform origin point in the local frame. */
    readonly ox: number
    readonly oy: number
    /** The node's own inner map (authored translate/scale, presence transform) about its origin, local frame, frozen at the flush. */
    readonly inner: Map2
    readonly track: Track | null
    /** Seconds since the track started. */
    readonly elapsed: number
    /** Index of the lead this node draws at (crossfade follower), or -1. */
    readonly follow: number
    readonly fade: Fade | null
    /** Corner radii at A: tl-x, tl-y, tr-x, tr-y, br-x, br-y, bl-x, bl-y. */
    readonly radius: readonly number[] | null
    /** Shared-handoff on-screen radius blend (§5.7). */
    readonly radiusBlend?: RadiusBlend | null
    /**
     * The ancestors (root first) whose presence matrix at the flush that
     * planned this node differs from the one frozen with their own geometry:
     * its track lives in that flush's visual space (§3.1).
     */
    readonly layers?: readonly Layer[] | null
    /**
     * A kept pose timeline (§5.7 path 1, §4.4): the node's own pose now, with
     * its rate, as a map of its local frame about its origin. The node is
     * drawn through its parent's map with this pose, whatever its parent
     * does; `track` is ignored.
     */
    readonly posed?: MovingMap | null
}

/**
 * Ancestor `at` as a node's flush saw it: `map` undoes the ancestor's own
 * inner map and applies the one of that flush, `Qₐ⁻¹ ∘ Qₐ′`.
 */
export interface Layer {
    readonly at: number
    readonly map: Map2
}

export interface Solved {
    readonly drawn: Box
    readonly pose: Pose
    /** Full view-space map of this node: parent's map ∘ pose ∘ inner map. */
    readonly map: Map2
    readonly opacity: number | null
    readonly radius: readonly number[] | null
}

/** Velocity of a drawn box, px per second for x, y, w, h. */
export type BoxVelocity = Box

export const ZERO_VELOCITY: BoxVelocity = { x: 0, y: 0, w: 0, h: 0 }

export function channelsOf(box: Box, fx: number, fy: number): Channels {
    return [box.x + fx * box.w, box.y + fy * box.h, box.w, box.h]
}

/** A spring track longer than this snaps `'unsupported'` (§5.3). */
export const SPRING_SETTLE_CAP = 10
/** Reduced motion `{ maxDuration }`: the factors tried for a spring (§9.4). */
const REDUCED_GRID = [1, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2, 0.1] as const

/** Why no track could be planned: reduced motion found no fit, or a spring is too long. */
export type TrackRefusal = 'reduced' | 'spring-timeout'

/**
 * An optional report of a refused spring's settle time, for the
 * `spring-timeout` diagnostic's `springSettleMs` metric: seconds, or `null`
 * when it was not computed.
 */
export interface TrackRefusalDetail {
    settle: number | null
}

/**
 * A track from visual box `b` to visual box `a`, interpolating the point at
 * fractions `(fx, fy)` of the box (its transform origin) and the size. A node
 * at rest (`velocity === null`) starts at rest; a moving node carries its
 * velocity exactly (`c′(0) = v`). An anchored node moves its offset from the
 * parent's anchor point instead of its origin point (`anchor`).
 */
export function createTrack(
    b: Box,
    a: Box,
    velocity: BoxVelocity | null,
    fx: number,
    fy: number,
    mode: LayoutMode,
    motion: Motion,
    anchor: AnchorPath | null,
    refusal?: TrackRefusalDetail
): Track | TrackRefusal {
    const from = channelsOf(b, fx, fy)
    const to = channelsOf(a, fx, fy)
    const v = velocity && channelsOf(velocity, fx, fy)
    const pinOrigin = mode === 'size' || anchor !== null
    const pinSize = mode === 'position'
    const start: number[] = []
    const incoming: number[] = []
    const free: boolean[] = []
    for (let i = 0; i < 4; i++) {
        const pinned = i < 2 ? pinOrigin : pinSize
        free.push(!pinned)
        start.push(pinned ? to[i]! : from[i]!)
        incoming.push(pinned || !v ? 0 : v[i]!)
    }
    const bc = start as unknown as Channels
    if (motion.kind === 'timing') {
        // k = v·D + (B − A)·e′(0) for a moving node; zero for a pinned channel
        // or a node at rest, whose path is exactly the curve
        const k = (x: number, target: number, w: number) =>
            w * motion.duration + (x - target) * motion.curve.slope0
        const seed = start.map((x, i) =>
            v && free[i] ? k(x, to[i]!, incoming[i]!) : 0
        ) as unknown as Channels
        return {
            b: bc,
            a: to,
            seed,
            fx,
            fy,
            delay: motion.delay,
            law: {
                kind: 'timing',
                duration: motion.duration,
                curve: motion.curve,
            },
            anchor: anchor && {
                u: anchor.u,
                v: anchor.v,
                fromX: anchor.fromX,
                fromY: anchor.fromY,
                toX: anchor.toX,
                toY: anchor.toY,
                seedX: anchor.velocity
                    ? k(anchor.fromX, anchor.toX, anchor.velocity.x)
                    : 0,
                seedY: anchor.velocity
                    ? k(anchor.fromY, anchor.toY, anchor.velocity.y)
                    : 0,
            },
            moving: velocity !== null,
        }
    }
    // the spring: displacements and incoming velocities of every channel
    // (the anchor offset replaces the origin channels)
    const x0 = start.map((x, i) => x - to[i]!)
    const ax0 = anchor
        ? [anchor.fromX - anchor.toX, anchor.fromY - anchor.toY]
        : []
    const av0 = anchor?.velocity
        ? [anchor.velocity.x, anchor.velocity.y]
        : [0, 0]
    const settleOf = (s: Spring, carry: boolean): number => {
        let t = 0
        for (let i = 0; i < 4; i++) {
            t = Math.max(t, s.settleTime(x0[i]!, carry ? incoming[i]! : 0))
        }
        for (let i = 0; i < ax0.length; i++) {
            t = Math.max(t, s.settleTime(ax0[i]!, carry ? av0[i]! : 0))
        }
        return t
    }
    const build = (
        duration: number,
        delay: number,
        carry: boolean,
        settle: number,
        s: Spring
    ): Track => ({
        b: bc,
        a: to,
        seed: (carry ? incoming : [0, 0, 0, 0]) as unknown as Channels,
        fx,
        fy,
        delay,
        law: { kind: 'spring', duration, spring: s, settle },
        anchor: anchor && {
            u: anchor.u,
            v: anchor.v,
            fromX: anchor.fromX,
            fromY: anchor.fromY,
            toX: anchor.toX,
            toY: anchor.toY,
            seedX: carry ? av0[0]! : 0,
            seedY: carry ? av0[1]! : 0,
        },
        // `moving` keeps its meaning (time continues from the last painted
        // frame) even when reduced motion drops the carried velocity
        moving: velocity !== null,
    })
    const max = motion.maxDuration
    if (max === null) {
        const s = physics.spring({
            duration: motion.duration,
            bounce: motion.bounce,
        })
        const settle = settleOf(s, true)
        if (!(settle <= SPRING_SETTLE_CAP)) {
            if (refusal) refusal.settle = settle
            return 'spring-timeout'
        }
        return build(motion.duration, motion.delay, true, settle, s)
    }
    // reduced motion: no overshoot, then the largest grid factor that fits,
    // first carrying the velocity, then from rest; otherwise a jump
    const bounce = Math.min(motion.bounce, 0)
    for (const carry of [true, false]) {
        for (const f of REDUCED_GRID) {
            const duration = motion.duration * f
            const s = physics.spring({ duration, bounce })
            const settle = settleOf(s, carry)
            if (motion.delay * f + settle <= max) {
                if (!(settle <= SPRING_SETTLE_CAP)) {
                    if (refusal) refusal.settle = settle
                    return 'spring-timeout'
                }
                return build(duration, motion.delay * f, carry, settle, s)
            }
        }
    }
    return 'reduced'
}

/** Seconds of the track's own time (after its delay) at `elapsed`. */
function localTime(track: Track, elapsed: number): number {
    return elapsed - track.delay
}

/** Track-local seconds at which the track reaches A. */
function lawEnd(law: TrackLaw): number {
    return law.kind === 'timing' ? law.duration : law.settle
}

/** `elapsed` at which the track reaches A (its delay included). */
export function trackEndTime(track: Track): number {
    return track.delay + lawEnd(track.law)
}

/** Whether the track has reached A. */
export function trackEnded(track: Track, elapsed: number): boolean {
    const t = localTime(track, elapsed)
    return t > 0 && t >= lawEnd(track.law)
}

/**
 * Progress 0–1 of a law at track-local time `t`: the clamped eased progress
 * of a timing curve, the perceptual timeline of a spring (§5.3). It drives
 * crossfade opacities, the radius blend and presence's release.
 */
export function lawProgress(law: TrackLaw, t: number): number {
    if (law.kind === 'spring') return physics.perceptual(t, law.duration)
    if (t <= 0) return 0
    if (law.duration <= 0) return 1
    return Math.min(
        1,
        Math.max(0, law.curve.value(Math.min(1, t / law.duration)))
    )
}

/** The progress that drives a shared fade and radius handoff from this track. */
export function trackProgress(track: Track, elapsed: number): number {
    return lawProgress(track.law, localTime(track, elapsed))
}

/** Timing progress τ in [0, 1]. */
function tauOf(law: { readonly duration: number }, t: number): number {
    if (t <= 0) return 0
    if (law.duration <= 0) return 1
    return Math.min(1, t / law.duration)
}

/** One scalar path `from → to` with its seed, under the track's law, at local time `t`. */
function pathAt(
    track: Track,
    from: number,
    to: number,
    seed: number,
    t: number
): number {
    if (t <= 0) return from
    const law = track.law
    if (law.kind === 'timing') {
        const tau = tauOf(law, t)
        if (tau >= 1) return to
        const e = law.curve.value(tau)
        return to + (from - to) * (1 - e) + seed * tau * (1 - tau) * (1 - tau)
    }
    if (t >= law.settle) return to
    return to + law.spring.at(t, from - to, seed)
}

function pathVelocity(
    track: Track,
    from: number,
    to: number,
    seed: number,
    t: number
): number {
    if (t < 0) return 0
    const law = track.law
    if (law.kind === 'timing') {
        if (law.duration <= 0) return 0
        const tau = tauOf(law, t)
        if (tau >= 1) return 0
        const d =
            -(from - to) * law.curve.slope(tau) +
            seed * (1 - tau) * (1 - 3 * tau)
        return d / law.duration
    }
    if (t >= law.settle) return 0
    return law.spring.velocity(t, from - to, seed)
}

function channelAt(track: Track, i: number, t: number): number {
    const b = track.b[i]!
    const a = track.a[i]!
    const c = pathAt(track, b, a, track.seed[i]!, t)
    // size floor: one pixel, or the smaller endpoint when that is below it
    return i < 2 ? c : Math.max(c, Math.min(1, a, b))
}

function channelVelocity(track: Track, i: number, t: number): number {
    const b = track.b[i]!
    const a = track.a[i]!
    if (i >= 2 && t > 0 && channelAt(track, i, t) <= Math.min(1, a, b)) {
        return 0
    }
    return pathVelocity(track, b, a, track.seed[i]!, t)
}

function isHolding(track: Track, elapsed: number): boolean {
    return elapsed - track.delay < 0
}

function ownBox(track: Track, elapsed: number): Box {
    const t = localTime(track, elapsed)
    const w = channelAt(track, 2, t)
    const h = channelAt(track, 3, t)
    return {
        x: channelAt(track, 0, t) - track.fx * w,
        y: channelAt(track, 1, t) - track.fy * h,
        w,
        h,
    }
}

function anchorOffset(rule: AnchorRule, track: Track, elapsed: number) {
    const t = localTime(track, elapsed)
    return {
        x: pathAt(track, rule.fromX, rule.toX, rule.seedX, t),
        y: pathAt(track, rule.fromY, rule.toY, rule.seedY, t),
    }
}

/** A node of the epoch recurrence: its parent and its layers. */
export type EpochNode = Pick<SolveNode, 'parent' | 'layers'>

/** Maps of one frame, plain or with their time derivative. */
interface Algebra<M> {
    readonly id: M
    compose(outer: M, inner: M): M
    invert(map: M): M
    lift(map: Map2): M
}

const PLAIN: Algebra<Map2> = {
    id: IDENTITY_MAP,
    compose,
    invert,
    lift: (map) => map,
}

const MOVING: Algebra<MovingMap> = {
    id: STILL_IDENTITY,
    compose: composeMoving,
    invert: invertMoving,
    lift: still,
}

/**
 * The map each node's parent is drawn with in the node's own epoch (§3.1),
 * from every node's full map `full(i)`, which carries its CSS box onto its
 * drawn box whatever epoch it was solved in. `Ωₐ`, the full map of `a` under
 * every ancestor's own inner map, is `corrₐ⁻¹ ∘ fullₐ`; a node sees its
 * parent through `corr ∘ Ω_parent` with `corr = Π (Ωₐ ∘ Γₐ ∘ Ωₐ⁻¹)` over its
 * layers, root first. One map per node and one per layer (§5.3).
 */
function epochs<M>(
    nodes: readonly EpochNode[],
    full: (i: number) => M,
    alg: Algebra<M>
) {
    const omegas: (M | undefined)[] = new Array(nodes.length)
    const corrs: (M | null | undefined)[] = new Array(nodes.length)
    /** The correction of a run of layers, root first: `Π (Ωₐ ∘ Γₐ ∘ Ωₐ⁻¹)`. */
    const through = (layers: readonly Layer[]): M | null => {
        let c: M | null = null
        for (const layer of layers) {
            const o = omega(layer.at)
            const step = alg.compose(
                alg.compose(o, alg.lift(layer.map)),
                alg.invert(o)
            )
            c = c === null ? step : alg.compose(c, step)
        }
        return c
    }
    const corr = (i: number): M | null => {
        let c = corrs[i]
        if (c === undefined) {
            c = through(nodes[i]!.layers ?? [])
            corrs[i] = c
        }
        return c
    }
    const omega = (i: number): M => {
        let o = omegas[i]
        if (o === undefined) {
            const c = corr(i)
            o = c === null ? full(i) : alg.compose(alg.invert(c), full(i))
            omegas[i] = o
        }
        return o
    }
    return {
        corr,
        through,
        parent(i: number): M {
            const parent = nodes[i]!.parent
            if (parent < 0) return alg.id
            const c = corr(i)
            return c === null ? omega(parent) : alg.compose(c, omega(parent))
        },
    }
}

/** Pre-order ranks at which each node's subtree is entered and left. */
function treeSpans(nodes: readonly EpochNode[]): {
    enter: number[]
    exit: number[]
} {
    const children: number[][] = nodes.map(() => [])
    const stack: number[] = []
    nodes.forEach((node, i) => {
        if (node.parent >= 0) children[node.parent]!.push(i)
        else stack.push(i)
    })
    const enter: number[] = new Array(nodes.length)
    const exit: number[] = new Array(nodes.length)
    let rank = 0
    while (stack.length > 0) {
        const k = stack.pop()!
        // `~k`: the subtree of `k` is done
        if (k < 0) {
            exit[~k] = rank++
            continue
        }
        enter[k] = rank++
        stack.push(~k, ...children[k]!)
    }
    return { enter, exit }
}

/** `epochs` over moving maps: carries a box with its velocity (§5.5). */
export function movingParents(
    nodes: readonly EpochNode[],
    full: (i: number) => MovingMap
): (i: number) => MovingMap {
    return epochs(nodes, full, MOVING).parent
}

/** The CSS box `L = Q⁻¹(X)`, local frame. */
function cssOf(node: SolveNode): Box {
    return mapBox(invert(node.inner), node.box)
}

/** The map carrying `css` onto `drawn`; identity on an empty axis. */
function onto(css: Box, drawn: Box): Map2 {
    const kx = css.w > 0 ? drawn.w / css.w : 1
    const ky = css.h > 0 ? drawn.h / css.h : 1
    return {
        x: { k: kx, b: drawn.x - kx * css.x },
        y: { k: ky, b: drawn.y - ky * css.y },
    }
}

/**
 * Drawn boxes of every node and, with `rates`, their analytic velocities. A
 * follower is drawn at its lead and an anchored node relative to its parent,
 * whatever their order in `nodes`, each as its own epoch draws the other
 * (§5.4, §5.6).
 */
function drawnMotion(
    nodes: readonly SolveNode[],
    rates: boolean
): {
    boxes: Box[]
    velocities: BoxVelocity[]
    pose: (i: number) => MovingMap
} {
    const boxes: (Box | undefined)[] = new Array(nodes.length)
    const velocities: (BoxVelocity | undefined)[] = new Array(nodes.length)
    const sources: ({ box: Box; velocity: Box } | undefined)[] = new Array(
        nodes.length
    )
    let maps: ReturnType<typeof epochs<MovingMap>> | null = null
    const full = (i: number): MovingMap => {
        const css = cssOf(nodes[i]!)
        const box = boxAt(i)
        const v = rates ? velocityAt(i) : ZERO_VELOCITY
        const kx = css.w > 0 ? box.w / css.w : 1
        const ky = css.h > 0 ? box.h / css.h : 1
        const rx = css.w > 0 ? v.w / css.w : 0
        const ry = css.h > 0 ? v.h / css.h : 0
        return {
            map: {
                x: { k: kx, b: box.x - kx * css.x },
                y: { k: ky, b: box.y - ky * css.y },
            },
            rate: {
                x: { k: rx, b: v.x - rx * css.x },
                y: { k: ry, b: v.y - ry * css.y },
            },
        }
    }
    let spans: ReturnType<typeof treeSpans> | null = null
    /** Whether `a` is `j` or one of its ancestors. */
    const encloses = (a: number, j: number): boolean => {
        spans ??= treeSpans(nodes)
        return (
            spans.enter[a]! <= spans.enter[j]! &&
            spans.exit[j]! <= spans.exit[a]!
        )
    }
    /** The correction of a non-empty root-first run of node `i`'s layers. */
    const shift = (i: number, layers: readonly Layer[]): MovingMap => {
        maps ??= epochs(nodes, full, MOVING)
        return (
            layers.length === nodes[i]!.layers!.length
                ? maps.corr(i)
                : maps.through(layers)
        )!
    }
    /**
     * The drawn box and velocity of `j` (an anchored node's parent, or a
     * follower's lead) as node `i`'s epoch draws them: every ancestor of `i`
     * as `i`'s flush saw it, every other presence as `j` was drawn with. Only
     * the layers at the ancestors of `i` that draw `j` (or at `j` itself)
     * convert: `corrᵢ ∘ corrⱼ⁻¹` over those (§5.4, §5.6).
     */
    const seenFrom = (i: number, j: number): { box: Box; velocity: Box } => {
        const known = sources[i]
        if (known) return known
        const box = boxAt(j)
        const velocity = rates ? velocityAt(j) : ZERO_VELOCITY
        let seen = { box, velocity }
        // both runs are the root-first part of each chain down to where the
        // two part: a deeper layer of `j` (at `i` itself too) is kept as is
        const own = nodes[i]!.layers?.filter((layer) => encloses(layer.at, j))
        const theirs = nodes[j]!.layers?.filter(
            (layer) => layer.at !== i && encloses(layer.at, i)
        )
        if (own?.length || theirs?.length) {
            let map = own?.length ? shift(i, own) : STILL_IDENTITY
            if (theirs?.length)
                map = composeMoving(map, invertMoving(shift(j, theirs)))
            seen = carry(map, box, velocity)
        }
        sources[i] = seen
        return seen
    }
    /** The parent map of `i` in `i`'s epoch, with its rate. */
    const parentOf = (i: number): MovingMap => {
        maps ??= epochs(nodes, full, MOVING)
        return maps.parent(i)
    }
    const boxAt = (i: number): Box => {
        const known = boxes[i]
        if (known) return known
        const node = nodes[i]!
        const track = node.track
        let box: Box
        if (node.follow >= 0) {
            box = seenFrom(i, node.follow).box
        } else if (node.posed) {
            box = mapBox(compose(parentOf(i).map, node.posed.map), node.box)
        } else if (track) {
            box = ownBox(track, node.elapsed)
            if (track.anchor && node.parent >= 0) {
                const parent = seenFrom(i, node.parent).box
                const off = anchorOffset(track.anchor, track, node.elapsed)
                const { u, v } = track.anchor
                box = {
                    x: parent.x + u * parent.w - u * box.w + off.x,
                    y: parent.y + v * parent.h - v * box.h + off.y,
                    w: box.w,
                    h: box.h,
                }
            }
        } else {
            box = node.a
        }
        boxes[i] = box
        return box
    }
    const velocityAt = (i: number): BoxVelocity => {
        const known = velocities[i]
        if (known) return known
        const node = nodes[i]!
        const track = node.track
        let v: BoxVelocity
        if (node.follow >= 0) {
            v = seenFrom(i, node.follow).velocity
        } else if (node.posed) {
            v = carry(
                composeMoving(parentOf(i), node.posed),
                node.box,
                ZERO_VELOCITY
            ).velocity
        } else if (track) {
            const holding = isHolding(track, node.elapsed)
            const t = localTime(track, node.elapsed)
            const w = holding ? 0 : channelVelocity(track, 2, t)
            const h = holding ? 0 : channelVelocity(track, 3, t)
            const rule = track.anchor
            if (rule && node.parent >= 0) {
                const parent = seenFrom(i, node.parent).velocity
                const ox = holding
                    ? 0
                    : pathVelocity(track, rule.fromX, rule.toX, rule.seedX, t)
                const oy = holding
                    ? 0
                    : pathVelocity(track, rule.fromY, rule.toY, rule.seedY, t)
                v = {
                    x: parent.x + rule.u * parent.w - rule.u * w + ox,
                    y: parent.y + rule.v * parent.h - rule.v * h + oy,
                    w,
                    h,
                }
            } else if (holding) {
                v = ZERO_VELOCITY
            } else {
                v = {
                    x: channelVelocity(track, 0, t) - track.fx * w,
                    y: channelVelocity(track, 1, t) - track.fy * h,
                    w,
                    h,
                }
            }
        } else {
            v = ZERO_VELOCITY
        }
        velocities[i] = v
        return v
    }
    for (let i = 0; i < nodes.length; i++) {
        boxAt(i)
        if (rates) velocityAt(i)
    }
    /** The own pose of `i` with its rate: `parent⁻¹ ∘ full ∘ inner⁻¹`. */
    const pose = (i: number): MovingMap =>
        composeMoving(
            composeMoving(invertMoving(parentOf(i)), full(i)),
            still(invert(nodes[i]!.inner))
        )
    return {
        boxes: boxes as Box[],
        velocities: velocities as BoxVelocity[],
        pose,
    }
}

/**
 * Each node's own pose with its rate, as a map of its local frame about its
 * origin: what its pose timeline is at this instant (§5.7).
 */
export function poseMotion(
    nodes: readonly SolveNode[]
): (i: number) => MovingMap {
    return drawnMotion(nodes, true).pose
}

/** Drawn boxes of every node (see `drawnMotion`). */
export function drawnBoxes(nodes: readonly SolveNode[]): Box[] {
    return drawnMotion(nodes, false).boxes
}

/** Analytic velocity of every node's drawn box (see `drawnMotion`). */
export function drawnVelocities(nodes: readonly SolveNode[]): BoxVelocity[] {
    return drawnMotion(nodes, true).velocities
}

/**
 * The analytic velocity of every drawn box, and the time derivative of every
 * node's own pose as written (`tx`, `ty` about its origin, `sx`, `sy`).
 */
export function drawnRates(nodes: readonly SolveNode[]): {
    velocities: BoxVelocity[]
    poses: Pose[]
} {
    const motion = drawnMotion(nodes, true)
    const poses = nodes.map((node, i) => {
        // x ↦ s·(x − o) + o + t: b = o − s·o + t, so t′ = b′ + s′·o
        const { rate } = motion.pose(i)
        return {
            tx: rate.x.b + rate.x.k * node.ox,
            ty: rate.y.b + rate.y.k * node.oy,
            sx: rate.x.k,
            sy: rate.y.k,
        }
    })
    return { velocities: motion.velocities, poses }
}

/** Whether a crossfade's timeline has ended (the lead's perceptual end for a spring). */
export function fadeEnded(fade: Fade): boolean {
    return fade.elapsed >= fade.law.duration
}

/** §5.8 coverage-preserving opacity of one crossfade layer. */
export function fadeOpacity(fade: Fade): number {
    const p = fade.law.duration <= 0 ? 1 : lawProgress(fade.law, fade.elapsed)
    if (fade.role === 'lead') {
        const x = Math.min(1, p / 0.5)
        const incoming = Math.sqrt(1 - (1 - x) ** 2)
        return fade.from + (1 - fade.from) * incoming
    }
    const outgoing = Math.min(1, Math.max(0, (p - 0.5) / 0.45))
    return fade.from * (1 - outgoing)
}

/** Poses, opacities and radii of every node (parents first). */
export function solve(nodes: readonly SolveNode[]): Solved[] {
    const drawn = drawnBoxes(nodes)
    const fulls = nodes.map((node, i) => onto(cssOf(node), drawn[i]!))
    const parentMap = epochs(nodes, (i) => fulls[i]!, PLAIN).parent
    return nodes.map((node, i) => {
        const box = drawn[i]!
        const local = mapBox(invert(parentMap(i)), box)
        const pose = poseFor(local, node.box, node.ox, node.oy)
        const opacity = node.fade ? fadeOpacity(node.fade) : null
        let radius: readonly number[] | null = null
        const onScreenRadius = node.radiusBlend
            ? (() => {
                  const p = trackProgress(
                      node.radiusBlend.track,
                      node.radiusBlend.elapsed
                  )
                  return node.radiusBlend.from.map(
                      (r, j) => r + (node.radiusBlend!.to[j]! - r) * p
                  )
              })()
            : node.radius
        if (onScreenRadius) {
            const kx = node.a.w / box.w
            const ky = node.a.h / box.h
            radius = onScreenRadius.map((r, j) => r * (j % 2 === 0 ? kx : ky))
        }
        return { drawn: box, pose, map: fulls[i]!, opacity, radius }
    })
}
