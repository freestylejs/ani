/**
 * Pure measurement functions: the support check, presented layout box
 * recovery, kept-track re-expression path, and stale flush reporting
 * (ARCHITECTURE §4.2, §4.4, §5.7). Pure: no DOM, no clock.
 */
import {
    aboutOrigin,
    type Box,
    compose,
    IDENTITY_MAP,
    invert,
    type Map2,
    mapBox,
    type OwnTransform,
    ownMap,
    type Pose,
    unmapOwn,
} from './geometry'

/** A closed interval of a total scale on one axis; `hi` may be Infinity. */
interface AxisInterval {
    readonly lo: number
    readonly hi: number
}

/** A scale per axis. */
export interface AxisScale {
    readonly sx: number
    readonly sy: number
}

/** One participant, parents before children (§4.2). */
export interface SupportNode {
    /** Index of the parent participant in the same array, -1 at the top level. */
    readonly parent: number
    /** getBoundingClientRect() width and height. */
    readonly rect: { readonly w: number; readonly h: number }
    /** offsetWidth and offsetHeight (integers). */
    readonly offset: readonly [number, number]
    /** The scale of the pose the engine last wrote (1, 1 when it wrote none). */
    readonly pose: AxisScale
}

/**
 * Reads node `index`'s computed values (item 2 of §4.1) and returns its
 * inner-map scale (authored `scale` times the presence matrix scale), or
 * 'unsupported' when the classifier finds a rotation, skew or 3D component.
 * Called at most once per node, only on a failing chain.
 */
export type InnerScaleReader = (index: number) => AxisScale | 'unsupported'

/**
 * Reads node `index`'s true CSS width and height (`getComputedStyle`), called
 * at most once per node and only when `offset[0] <= 1` or `offset[1] <= 1`.
 */
export type ExactSizeReader = (index: number) => {
    readonly w: number
    readonly h: number
}

export interface SupportResult {
    /** false: the node fails, or sits under a node that failed (its subtree snaps). */
    readonly supported: readonly boolean[]
    /** The expected total scale `E` per node, with every scale read; null where unsupported. */
    readonly scales: readonly (AxisScale | null)[]
    /** Indices passed to the inner-scale reader, in call order. */
    readonly reads: readonly number[]
}

/** Some engines compute rects in single precision (§4.2). */
const ROUNDING_SLACK = 1e-6
const SCALE_TOLERANCE = 1e-12
const UNCHANGED_PX = 0.01

function validPositive(n: number): boolean {
    return Number.isFinite(n) && n > 0
}

/** The measured interval `M` of one axis (§4.2). */
function measuredAxis(r: number, o: number, exact: number): AxisInterval {
    if (!(o > 1)) {
        if (!validPositive(exact)) {
            return { lo: 0, hi: Number.POSITIVE_INFINITY }
        }
        const scale = r / exact
        return {
            lo: scale * (1 - ROUNDING_SLACK),
            hi: scale * (1 + ROUNDING_SLACK),
        }
    }
    return {
        lo: (r / (o + 1)) * (1 - ROUNDING_SLACK),
        hi: (r / (o - 1)) * (1 + ROUNDING_SLACK),
    }
}

function within(e: number, m: AxisInterval): boolean {
    return e >= m.lo && e <= m.hi
}

/**
 * §4.2, §9.1: the support check per participant and axis, top-down. Each
 * node's measured interval `M` is compared with the exact model of its total
 * scale, `E = E_π · p · q`, never with a scale derived from a measurement. An
 * inner scale `q` is assumed 1 until read; when `E ∉ M`, the node and every
 * participant ancestor whose `q` is still assumed are read top-down, the
 * classifier runs on each read (a rotation, skew or 3D component snaps that
 * node with its subtree), `E` is recomputed with the scales read, and the
 * node fails only when `E ∉ M` still. A read ancestor whose own model then
 * leaves its own `M` fails too, with its subtree.
 */
export function supportCheck(
    nodes: readonly SupportNode[],
    readInner: InnerScaleReader,
    readExactSize: ExactSizeReader
): SupportResult {
    const n = nodes.length
    const failed: boolean[] = new Array(n).fill(false)
    const known: (AxisScale | null)[] = new Array(n).fill(null)
    const expected: { x: number; y: number }[] = []
    const measured: { x: AxisInterval; y: AxisInterval }[] = []
    const reads: number[] = []

    const inherited = (i: number): boolean => {
        for (let k = nodes[i]!.parent; k >= 0; k = nodes[k]!.parent) {
            if (failed[k]) return true
        }
        return false
    }
    /** E of node `i` from its parent's E and its own p and q (1 when assumed). */
    const model = (i: number): { x: number; y: number } => {
        const node = nodes[i]!
        const parent = node.parent >= 0 ? expected[node.parent]! : null
        const q = known[i]
        return {
            x: (parent ? parent.x : 1) * node.pose.sx * (q ? q.sx : 1),
            y: (parent ? parent.y : 1) * node.pose.sy * (q ? q.sy : 1),
        }
    }
    const passes = (i: number): boolean =>
        within(expected[i]!.x, measured[i]!.x) &&
        within(expected[i]!.y, measured[i]!.y)

    for (let i = 0; i < n; i++) {
        const node = nodes[i]!
        const ox = node.offset[0]
        const oy = node.offset[1]
        if (
            !validPositive(node.pose.sx) ||
            !validPositive(node.pose.sy) ||
            !(node.rect.w >= 0) ||
            !(node.rect.h >= 0)
        ) {
            failed[i] = true
        }
        const exact =
            !failed[i] && (!(ox > 1) || !(oy > 1))
                ? readExactSize(i)
                : { w: 0, h: 0 }
        measured.push({
            x: measuredAxis(node.rect.w, ox, exact.w),
            y: measuredAxis(node.rect.h, oy, exact.h),
        })
        expected.push(model(i))
        if (failed[i] || inherited(i) || passes(i)) continue

        // verification: this node and its ancestors with an assumed q
        const chain: number[] = []
        for (let k = i; k >= 0; k = nodes[k]!.parent) {
            if (known[k] === null) chain.unshift(k)
        }
        for (const k of chain) {
            reads.push(k)
            const inner = readInner(k)
            if (
                inner === 'unsupported' ||
                !validPositive(inner.sx) ||
                !validPositive(inner.sy)
            ) {
                failed[k] = true
                break
            }
            known[k] = inner
        }
        // every model below a read scale is recomputed, parents first
        for (let k = 0; k <= i; k++) expected[k] = model(k)
        for (const k of chain) {
            if (!failed[k] && !inherited(k) && !passes(k)) failed[k] = true
        }
    }

    const supported: boolean[] = []
    const scales: (AxisScale | null)[] = []
    for (let i = 0; i < n; i++) {
        const ok = !failed[i] && !inherited(i)
        supported.push(ok)
        scales.push(ok ? { sx: expected[i]!.x, sy: expected[i]!.y } : null)
    }
    return { supported, scales, reads }
}

/** One participant at capture, parents before children (§4.2 presented layout box). */
export interface PresentedNode {
    readonly parent: number
    /** The measured rect B, view space. */
    readonly rect: Box
    /** The engine's pose as last written, local frame, about the origin (identity when none). */
    readonly pose: Pose
    /** The inner map Q (authored translate/scale composed with the presence matrix it is judged under). */
    readonly inner: Pose
    /** The transform origin, px from the CSS box's top-left. */
    readonly origin: readonly [number, number]
}

/**
 * §3.2, §4.2: L_k per node — the rest visual box in view space with every
 * engine pose divided out top-down while keeping inner maps Q.
 */
export function presentedLayoutBoxes(nodes: readonly PresentedNode[]): Box[] {
    const fullMaps: Map2[] = []
    const restMaps: Map2[] = []
    const boxes: Box[] = []

    for (const node of nodes) {
        const parentFull =
            node.parent >= 0 ? fullMaps[node.parent]! : IDENTITY_MAP
        const parentRest =
            node.parent >= 0 ? restMaps[node.parent]! : IDENTITY_MAP

        const local = mapBox(invert(parentFull), node.rect)
        const [ox, oy] = node.origin
        const own: OwnTransform = {
            kx: node.pose.sx * node.inner.sx,
            ky: node.pose.sy * node.inner.sy,
            tx: node.pose.tx + node.pose.sx * node.inner.tx,
            ty: node.pose.ty + node.pose.sy * node.inner.ty,
            ox,
            oy,
        }
        const css = unmapOwn(local, own)
        const full = compose(parentFull, ownMap(css, own))
        const innerMap = aboutOrigin(node.inner, css.x + ox, css.y + oy)
        const rest = compose(parentRest, innerMap)

        fullMaps.push(full)
        restMaps.push(rest)
        boxes.push(mapBox(rest, css))
    }

    return boxes
}

export type KeepPath = 'unchanged' | 'translate' | 'retarget'

/** The scales of one participant ancestor of a kept track (§5.7 path 2). */
export interface KeepAncestor {
    /** Its pose scale at `t_k`. */
    readonly pose: AxisScale
    /** Its inner-map scale now. */
    readonly innerNow: AxisScale
    /** Its inner-map scale when the track was planned. */
    readonly innerPlanned: AxisScale
}

/** Per edge of a box: both origins and both sizes. */
export interface Edges {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
}

export interface KeepPathInput {
    /**
     * The measured jump `J = D − B` on every edge: `D` the node's raw rect
     * read at the flush before any write, under its pose as last written;
     * `B` the fresh capture's rect.
     */
    readonly jump: Edges
    /** Every participant ancestor, any order. */
    readonly ancestors: readonly KeepAncestor[]
}

function unitScale(s: number): boolean {
    return Math.abs(s - 1) <= SCALE_TOLERANCE
}

function sameRelativeScale(a: number, b: number): boolean {
    if (a === b) return true
    const ref = Math.max(Math.abs(a), Math.abs(b))
    if (!validPositive(ref)) return false
    return Math.abs(a - b) <= SCALE_TOLERANCE * ref
}

/**
 * §5.7 path 2's condition: translating a kept track by `δ` is exact when, at
 * `t_k`, every participant ancestor's pose has scale 1 and its inner-map
 * scale is the one the track was planned with.
 */
export function translationExact(ancestors: readonly KeepAncestor[]): boolean {
    return ancestors.every(
        (anc) =>
            unitScale(anc.pose.sx) &&
            unitScale(anc.pose.sy) &&
            sameRelativeScale(anc.innerNow.sx, anc.innerPlanned.sx) &&
            sameRelativeScale(anc.innerNow.sy, anc.innerPlanned.sy)
    )
}

/**
 * §5.7: the re-expression path of a kept track, judged by what the user
 * sees: 'unchanged' when the measured jump is below 0.01 px on every edge,
 * 'translate' when the translation is exact, else 'retarget'.
 */
export function keepPath(input: KeepPathInput): KeepPath {
    const { jump } = input
    if (
        Math.abs(jump.x) < UNCHANGED_PX &&
        Math.abs(jump.y) < UNCHANGED_PX &&
        Math.abs(jump.w) < UNCHANGED_PX &&
        Math.abs(jump.h) < UNCHANGED_PX
    ) {
        return 'unchanged'
    }
    return translationExact(input.ancestors) ? 'translate' : 'retarget'
}

/** The inputs of the screen displacement bound `β` of a driven node (§4.4). */
export interface ScreenBoundInput {
    /**
     * `d`: the change of the node's layout box in its parent participant's
     * local frame (CSS px) between the previous flush and this one.
     */
    readonly change: Edges
    /** Its own pose scale `s` per axis, held. */
    readonly pose: AxisScale
    /** Its transform-origin fraction `f` per axis. */
    readonly origin: { readonly fx: number; readonly fy: number }
    /**
     * The parent participant's raw rect size `R` at this flush, and its layout
     * sizes `w`, `h` (the rounded sizes less one, or the exact sizes on a
     * degenerate axis); null at the top level.
     */
    readonly parent: {
        readonly rect: { readonly w: number; readonly h: number }
        readonly size: { readonly w: number; readonly h: number }
    } | null
    /**
     * `β_π`: how far the parent's local frame moved on screen, one vector for
     * every point of it (its layout moved and its pose stays relative to its
     * layout box). A driven parent's own `β`; an undriven parent's box
     * displacement between its last known box and its A (Infinity with no
     * last known box); 0 at the top level.
     */
    readonly frame: number
}

/**
 * §4.4: `β`, a bound on the screen displacement of every corner (so every
 * edge) of a driven node's drawn box that holds for any affine map above it,
 * supported or not: `β = β_π + (R_axis / min(w, h))·max(e_x, e_y)`. A corner
 * moves in the parent's frame by at most `e = |Δx| + (1 + 2·s)·max(1, |f|)·|Δw|`
 * per axis, and that frame itself by at most `β_π`; a linear map taking a
 * `w × h` box to a bounding box `R` has row sums at most `R_axis / min(w, h)`.
 */
export function screenBound(input: ScreenBoundInput): number {
    const { change, pose, origin, parent, frame } = input
    if (!(frame >= 0)) return Number.POSITIVE_INFINITY
    const ex =
        Math.abs(change.x) +
        (1 + 2 * Math.abs(pose.sx)) *
            Math.max(1, Math.abs(origin.fx)) *
            Math.abs(change.w)
    const ey =
        Math.abs(change.y) +
        (1 + 2 * Math.abs(pose.sy)) *
            Math.max(1, Math.abs(origin.fy)) *
            Math.abs(change.h)
    const e = Math.max(ex, ey)
    if (!parent) return frame + e
    const side = Math.min(parent.size.w, parent.size.h)
    if (!validPositive(side)) return Number.POSITIVE_INFINITY
    const row = Math.max(parent.rect.w, parent.rect.h) / side
    return frame + row * e
}

export interface StaleNode {
    readonly driven: boolean
    /** A at this flush. */
    readonly a: Box
    /** Undriven: the aged capture's box, else A at its previous flush, else null (never known). */
    readonly lastKnown: Box | null
    /** Driven: the screen displacement bound `β` (`screenBound`), Infinity when it has no inputs. */
    readonly bound: number
    /** Driven: whether path 2's condition holds (`translationExact`). */
    readonly translationExact: boolean
}

/**
 * §4.4: Whether a node of a capture-less or aged flush is reported 'stale'.
 */
export function staleReported(
    node: StaleNode,
    threshold: number,
    difference: (from: Box, to: Box) => number
): boolean {
    if (!node.driven) {
        return (
            node.lastKnown === null ||
            difference(node.lastKnown, node.a) >= threshold
        )
    }
    return (
        !(node.bound < threshold) ||
        (node.bound >= UNCHANGED_PX && !node.translationExact)
    )
}
