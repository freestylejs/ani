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
    /**
     * Planned for a node moving at the flush (with its velocity): its time
     * continues from the last painted frame (§4.3).
     */
    readonly moving: boolean
}

/** A crossfade timeline, started with the lead's motion at the handoff. */
export interface Fade {
    readonly role: 'lead' | 'follower'
    /** This layer's opacity at the start: lead 0/follower 1 for a new handoff, current opacity on reversal. */
    readonly from: number
    readonly elapsed: number
    readonly duration: number
    readonly curve: Curve
}

export interface RadiusBlend {
    /** Departing node's on-screen radii at the handoff. */
    readonly from: readonly number[]
    /** New lead's authored on-screen radii at A. */
    readonly to: readonly number[]
    /** The lead track whose eased progress drives the blend. */
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
        moving: velocity !== null,
    }
}

function progress(track: Track, elapsed: number): number {
    const t = elapsed - track.delay
    if (t <= 0) return 0
    if (track.duration <= 0) return 1
    return Math.min(1, t / track.duration)
}

/** The clamped eased progress used by shared fades and radius handoffs. */
export function trackEasedProgress(track: Track, elapsed: number): number {
    return Math.min(1, Math.max(0, track.curve.value(progress(track, elapsed))))
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

/** §5.6 coverage-preserving opacity of one crossfade layer. */
export function fadeOpacity(fade: Fade): number {
    if (fade.duration <= 0) return fade.role === 'lead' ? 1 : 0
    const p = Math.min(
        1,
        Math.max(0, fade.curve.value(fade.elapsed / fade.duration))
    )
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
                  const p = trackEasedProgress(
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
