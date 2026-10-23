/**
 * Per frame: tracks → drawn boxes → poses (and crossfade opacities, corner
 * radii), top-down. Pure: no DOM, no clock.
 */
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
 * `from → to` on the node's own timeline like a channel, with the momentum
 * term `k` carrying the incoming relative velocity of a moving node.
 */
export interface AnchorRule {
    readonly u: number
    readonly v: number
    readonly fromX: number
    readonly fromY: number
    readonly toX: number
    readonly toY: number
    readonly kx: number
    readonly ky: number
}

export interface Track {
    readonly b: Channels
    readonly a: Channels
    readonly k: Channels
    /** Origin point as a fraction of the box. */
    readonly fx: number
    readonly fy: number
    readonly delay: number
    readonly duration: number
    readonly curve: Curve
    readonly anchor: AnchorRule | null
}

/** A crossfade timeline, started with the lead's motion at the handoff. */
export interface Fade {
    readonly role: 'lead' | 'follower'
    /** The lead's weight at the start: 0 for a new handoff, its current opacity for a reversal. */
    readonly from: number
    readonly elapsed: number
    readonly duration: number
    readonly curve: Curve
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
    /**
     * The ancestors (root first) whose presence matrix at the flush that
     * planned this node differs from the one frozen with their own geometry:
     * its track lives in that flush's visual space (§3.1).
     */
    readonly layers?: readonly Layer[] | null
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
    /** Full page map of this node: parent's map ∘ pose ∘ inner map. */
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

/**
 * A track from visual box `b` to visual box `a`, interpolating the point at
 * fractions `(fx, fy)` of the box (its transform origin) and the size. A node
 * at rest (`velocity === null`) follows the timing curve exactly (`k = 0`); a
 * moving node carries its velocity: `k = v·D + (B − A)·e′(0)` gives
 * `c′(0) = v`.
 */
export function createTrack(
    b: Box,
    a: Box,
    velocity: BoxVelocity | null,
    fx: number,
    fy: number,
    mode: LayoutMode,
    motion: Motion,
    anchor: AnchorRule | null
): Track {
    const from = channelsOf(b, fx, fy)
    const to = channelsOf(a, fx, fy)
    const v = velocity && channelsOf(velocity, fx, fy)
    const pinOrigin = mode === 'size' || anchor !== null
    const pinSize = mode === 'position'
    const bc: number[] = []
    const kc: number[] = []
    for (let i = 0; i < 4; i++) {
        const pinned = i < 2 ? pinOrigin : pinSize
        const start = pinned ? to[i]! : from[i]!
        bc.push(start)
        kc.push(
            pinned || !v
                ? 0
                : v[i]! * motion.duration +
                      (start - to[i]!) * motion.curve.slope0
        )
    }
    return {
        b: bc as unknown as Channels,
        a: to,
        k: kc as unknown as Channels,
        fx,
        fy,
        delay: motion.delay,
        duration: motion.duration,
        curve: motion.curve,
        anchor,
    }
}

function progress(track: Track, elapsed: number): number {
    const t = elapsed - track.delay
    if (t <= 0) return 0
    if (track.duration <= 0) return 1
    return Math.min(1, t / track.duration)
}

/** Whether the track has reached A. */
export function trackEnded(track: Track, elapsed: number): boolean {
    return progress(track, elapsed) >= 1
}

function channelAt(track: Track, i: number, tau: number): number {
    const b = track.b[i]!
    const a = track.a[i]!
    if (tau <= 0) return b
    if (tau >= 1) return a
    const e = track.curve.value(tau)
    const c = a + (b - a) * (1 - e) + track.k[i]! * tau * (1 - tau) * (1 - tau)
    // size floor: one pixel, or the smaller endpoint when that is below it
    return i < 2 ? c : Math.max(c, Math.min(1, a, b))
}

function channelVelocity(track: Track, i: number, tau: number): number {
    if (track.duration <= 0) return 0
    const t = tau
    if (t < 0 || t >= 1) return 0
    const b = track.b[i]!
    const a = track.a[i]!
    if (i >= 2 && channelAt(track, i, t) <= Math.min(1, a, b) && t > 0) {
        return 0
    }
    const d =
        -(b - a) * track.curve.slope(t) + track.k[i]! * (1 - t) * (1 - 3 * t)
    return d / track.duration
}

function isHolding(track: Track, elapsed: number): boolean {
    return elapsed - track.delay < 0
}

function ownBox(track: Track, elapsed: number): Box {
    const tau = progress(track, elapsed)
    const w = channelAt(track, 2, tau)
    const h = channelAt(track, 3, tau)
    return {
        x: channelAt(track, 0, tau) - track.fx * w,
        y: channelAt(track, 1, tau) - track.fy * h,
        w,
        h,
    }
}

function offsetAt(
    from: number,
    to: number,
    k: number,
    curve: Curve,
    tau: number
): number {
    if (tau <= 0) return from
    if (tau >= 1) return to
    return to + (from - to) * (1 - curve.value(tau)) + k * tau * (1 - tau) ** 2
}

function anchorOffset(rule: AnchorRule, track: Track, elapsed: number) {
    const tau = progress(track, elapsed)
    return {
        x: offsetAt(rule.fromX, rule.toX, rule.kx, track.curve, tau),
        y: offsetAt(rule.fromY, rule.toY, rule.ky, track.curve, tau),
    }
}

function offsetVelocity(
    from: number,
    to: number,
    k: number,
    track: Track,
    tau: number
): number {
    if (track.duration <= 0 || tau < 0 || tau >= 1) return 0
    const d =
        -(from - to) * track.curve.slope(tau) + k * (1 - tau) * (1 - 3 * tau)
    return d / track.duration
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
    const corr = (i: number): M | null => {
        let c = corrs[i]
        if (c === undefined) {
            c = null
            for (const layer of nodes[i]!.layers ?? []) {
                const o = omega(layer.at)
                const step = alg.compose(
                    alg.compose(o, alg.lift(layer.map)),
                    alg.invert(o)
                )
                c = c === null ? step : alg.compose(c, step)
            }
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
        parent(i: number): M {
            const parent = nodes[i]!.parent
            if (parent < 0) return alg.id
            const c = corr(i)
            return c === null ? omega(parent) : alg.compose(c, omega(parent))
        },
    }
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
): { boxes: Box[]; velocities: BoxVelocity[] } {
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
    /**
     * The drawn box and velocity of `j` (an anchored node's parent, or a
     * follower's lead) as node `i`'s epoch draws them: `corrᵢ ∘ corrⱼ⁻¹`.
     */
    const seenFrom = (i: number, j: number): { box: Box; velocity: Box } => {
        const known = sources[i]
        if (known) return known
        const box = boxAt(j)
        const velocity = rates ? velocityAt(j) : ZERO_VELOCITY
        let seen = { box, velocity }
        // a layer of `j` at `i` itself would need `i`'s own box: drawn as is
        const layered =
            (nodes[i]!.layers || nodes[j]!.layers) &&
            !nodes[j]!.layers?.some((layer) => layer.at === i)
        if (layered) {
            maps ??= epochs(nodes, full, MOVING)
            const own = maps.corr(i)
            const theirs = maps.corr(j)
            let shift = own ?? STILL_IDENTITY
            if (theirs) shift = composeMoving(shift, invertMoving(theirs))
            seen = carry(shift, box, velocity)
        }
        sources[i] = seen
        return seen
    }
    const boxAt = (i: number): Box => {
        const known = boxes[i]
        if (known) return known
        const node = nodes[i]!
        const track = node.track
        let box: Box
        if (node.follow >= 0) {
            box = seenFrom(i, node.follow).box
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
        } else if (track) {
            const holding = isHolding(track, node.elapsed)
            const tau = progress(track, node.elapsed)
            const w = holding ? 0 : channelVelocity(track, 2, tau)
            const h = holding ? 0 : channelVelocity(track, 3, tau)
            const rule = track.anchor
            if (rule && node.parent >= 0) {
                const parent = seenFrom(i, node.parent).velocity
                const ox = holding
                    ? 0
                    : offsetVelocity(rule.fromX, rule.toX, rule.kx, track, tau)
                const oy = holding
                    ? 0
                    : offsetVelocity(rule.fromY, rule.toY, rule.ky, track, tau)
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
                    x: channelVelocity(track, 0, tau) - track.fx * w,
                    y: channelVelocity(track, 1, tau) - track.fy * h,
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
    return { boxes: boxes as Box[], velocities: velocities as BoxVelocity[] }
}

/** Drawn boxes of every node (see `drawnMotion`). */
export function drawnBoxes(nodes: readonly SolveNode[]): Box[] {
    return drawnMotion(nodes, false).boxes
}

/** Analytic velocity of every node's drawn box (see `drawnMotion`). */
export function drawnVelocities(nodes: readonly SolveNode[]): BoxVelocity[] {
    return drawnMotion(nodes, true).velocities
}

/** The lead's weight `from + (1 − from)·clamp(e(τ))`; the follower's is its complement. */
function fadeWeight(fade: Fade): number {
    if (fade.duration <= 0) return 1
    const w = fade.curve.value(fade.elapsed / fade.duration)
    return fade.from + (1 - fade.from) * Math.min(1, Math.max(0, w))
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
        let opacity: number | null = null
        if (node.fade) {
            const w = fadeWeight(node.fade)
            opacity = node.fade.role === 'lead' ? w : 1 - w
        }
        let radius: readonly number[] | null = null
        if (node.radius) {
            const kx = node.a.w / box.w
            const ky = node.a.h / box.h
            radius = node.radius.map((r, j) => r * (j % 2 === 0 ? kx : ky))
        }
        return { drawn: box, pose, map: fulls[i]!, opacity, radius }
    })
}
