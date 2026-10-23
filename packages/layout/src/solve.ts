/**
 * Per frame: tracks → drawn boxes → poses (and crossfade opacities, corner
 * radii), top-down. Pure: no DOM, no clock.
 */
import {
    aboutOrigin,
    type Box,
    compose,
    IDENTITY_MAP,
    invert,
    type Map2,
    mapBox,
    type Pose,
    poseFor,
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

const ZERO_VELOCITY: BoxVelocity = { x: 0, y: 0, w: 0, h: 0 }

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

/**
 * Drawn boxes of every node. A follower is drawn at its lead and an anchored
 * node relative to its parent, whatever their order in `nodes`.
 */
export function drawnBoxes(nodes: readonly SolveNode[]): Box[] {
    const drawn: (Box | undefined)[] = new Array(nodes.length)
    const at = (i: number): Box => {
        const known = drawn[i]
        if (known) return known
        const node = nodes[i]!
        const track = node.track
        let box: Box
        if (node.follow >= 0) {
            box = at(node.follow)
        } else if (track) {
            box = ownBox(track, node.elapsed)
            if (track.anchor && node.parent >= 0) {
                const parent = at(node.parent)
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
        drawn[i] = box
        return box
    }
    for (let i = 0; i < nodes.length; i++) at(i)
    return drawn as Box[]
}

/** Analytic velocity of every node's drawn box, in any order (see `drawnBoxes`). */
export function drawnVelocities(nodes: readonly SolveNode[]): BoxVelocity[] {
    const velocity: (BoxVelocity | undefined)[] = new Array(nodes.length)
    const at = (i: number): BoxVelocity => {
        const known = velocity[i]
        if (known) return known
        const node = nodes[i]!
        const track = node.track
        let v: BoxVelocity
        if (node.follow >= 0) {
            v = at(node.follow)
        } else if (track) {
            const holding = isHolding(track, node.elapsed)
            const tau = progress(track, node.elapsed)
            const w = holding ? 0 : channelVelocity(track, 2, tau)
            const h = holding ? 0 : channelVelocity(track, 3, tau)
            const rule = track.anchor
            if (rule && node.parent >= 0) {
                const parent = at(node.parent)
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
        velocity[i] = v
        return v
    }
    for (let i = 0; i < nodes.length; i++) at(i)
    return velocity as BoxVelocity[]
}

function fadeWeight(fade: Fade): number {
    if (fade.duration <= 0) return 1
    const w = fade.curve.value(fade.elapsed / fade.duration)
    return Math.min(1, Math.max(0, w))
}

/** Poses, opacities and radii of every node (parents first). */
export function solve(nodes: readonly SolveNode[]): Solved[] {
    const drawn = drawnBoxes(nodes)
    const out: Solved[] = []
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!
        const box = drawn[i]!
        const parentMap =
            node.parent >= 0 ? out[node.parent]!.map : IDENTITY_MAP
        const local = mapBox(invert(parentMap), box)
        const pose = poseFor(local, node.box, node.ox, node.oy)
        const map = compose(
            compose(parentMap, aboutOrigin(pose, node.ox, node.oy)),
            node.inner
        )
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
        out.push({ drawn: box, pose, map, opacity, radius })
    }
    return out
}
