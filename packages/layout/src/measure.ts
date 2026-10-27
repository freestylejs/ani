/**
 * Pure measurement functions: interval support check, presented layout box
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
export interface AxisInterval {
    readonly lo: number
    readonly hi: number
}

export interface ScaleInterval {
    readonly x: AxisInterval
    readonly y: AxisInterval
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
    readonly pose: { readonly sx: number; readonly sy: number }
    /** Whether any participant has this node as its parent. */
    readonly hasChildren: boolean
}

/**
 * Reads node `index`'s computed inner-map scale (authored `scale` times the presence
 * matrix scale), or 'unsupported' when its computed values hold a rotation, skew or 3D
 * component. Called at most once per node.
 */
export type InnerScaleReader = (
    index: number
) => { readonly sx: number; readonly sy: number } | 'unsupported'

export interface SupportResult {
    /** false: the node fails, or sits under a node that failed (its subtree snaps). */
    readonly supported: readonly boolean[]
    /** The propagated interval I per node; null where unsupported. */
    readonly intervals: readonly (ScaleInterval | null)[]
    /** Indices passed to the reader, in call order. */
    readonly reads: readonly number[]
}

const ROUNDING_SLACK = 1e-9
const WIDE_RELATIVE_LIMIT = 0.005
const SCALE_TOLERANCE = 1e-12
const UNCHANGED_DELTA_PX = 0.01

const TOP_INTERVAL: ScaleInterval = {
    x: { lo: 1, hi: 1 },
    y: { lo: 1, hi: 1 },
}

function measuredAxis(r: number, o: number): AxisInterval {
    if (!(o > 1)) return { lo: 0, hi: Number.POSITIVE_INFINITY }
    return {
        lo: (r / (o + 1)) * (1 - ROUNDING_SLACK),
        hi: (r / (o - 1)) * (1 + ROUNDING_SLACK),
    }
}

function expectedAxis(
    parent: AxisInterval,
    p: number,
    q: number
): AxisInterval {
    return { lo: parent.lo * p * q, hi: parent.hi * p * q }
}

function intersectAxis(a: AxisInterval, b: AxisInterval): AxisInterval | null {
    const lo = Math.max(a.lo, b.lo)
    const hi = Math.min(a.hi, b.hi)
    return lo <= hi ? { lo, hi } : null
}

function isWideAxis(axis: AxisInterval): boolean {
    if (!Number.isFinite(axis.lo) || !Number.isFinite(axis.hi)) return true
    const sum = axis.hi + axis.lo
    if (sum <= 0) return false
    return (axis.hi - axis.lo) / sum > WIDE_RELATIVE_LIMIT
}

function validPositive(n: number): boolean {
    return Number.isFinite(n) && n > 0
}

/**
 * §4.2, §9.1: Top-down interval support check per participant and axis.
 * Propagates a scale interval containing the true total scale without false
 * positives from integer `offsetWidth`/`offsetHeight` rounding, reading the
 * inner scale at most once per node on mismatch or when a parent interval
 * exceeds ±0.5% relative width.
 */
export function supportCheck(
    nodes: readonly SupportNode[],
    readInner: InnerScaleReader
): SupportResult {
    const supported: boolean[] = []
    const intervals: (ScaleInterval | null)[] = []
    const reads: number[] = []

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!
        const parentIdx = node.parent
        if (parentIdx >= 0 && !supported[parentIdx]) {
            supported.push(false)
            intervals.push(null)
            continue
        }
        const parentInterval =
            parentIdx >= 0 ? intervals[parentIdx]! : TOP_INTERVAL
        const px = node.pose.sx
        const py = node.pose.sy
        if (
            !validPositive(px) ||
            !validPositive(py) ||
            !(node.rect.w >= 0) ||
            !(node.rect.h >= 0)
        ) {
            supported.push(false)
            intervals.push(null)
            continue
        }

        const mx = measuredAxis(node.rect.w, node.offset[0])
        const my = measuredAxis(node.rect.h, node.offset[1])

        let ex = expectedAxis(parentInterval.x, px, 1)
        let ey = expectedAxis(parentInterval.y, py, 1)
        let ix = intersectAxis(mx, ex)
        let iy = intersectAxis(my, ey)
        let wasRead = false

        if (ix === null || iy === null) {
            reads.push(i)
            wasRead = true
            const inner = readInner(i)
            if (
                inner === 'unsupported' ||
                !validPositive(inner.sx) ||
                !validPositive(inner.sy)
            ) {
                supported.push(false)
                intervals.push(null)
                continue
            }
            ex = expectedAxis(parentInterval.x, px, inner.sx)
            ey = expectedAxis(parentInterval.y, py, inner.sy)
            ix = intersectAxis(mx, ex)
            iy = intersectAxis(my, ey)
            if (ix === null || iy === null) {
                supported.push(false)
                intervals.push(null)
                continue
            }
        }

        let propX = wasRead ? ix : mx
        let propY = wasRead ? iy : my

        if (
            !wasRead &&
            node.hasChildren &&
            (isWideAxis(propX) || isWideAxis(propY))
        ) {
            reads.push(i)
            const inner = readInner(i)
            if (
                inner === 'unsupported' ||
                !validPositive(inner.sx) ||
                !validPositive(inner.sy)
            ) {
                supported.push(false)
                intervals.push(null)
                continue
            }
            ex = expectedAxis(parentInterval.x, px, inner.sx)
            ey = expectedAxis(parentInterval.y, py, inner.sy)
            ix = intersectAxis(mx, ex)
            iy = intersectAxis(my, ey)
            if (ix === null || iy === null) {
                supported.push(false)
                intervals.push(null)
                continue
            }
            propX = ix
            propY = iy
        }

        supported.push(true)
        intervals.push({ x: propX, y: propY })
    }

    return { supported, intervals, reads }
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

export interface KeepPathInput {
    /** δ = A_new − A_old of the node's origin channels, px. */
    readonly delta: { readonly x: number; readonly y: number }
    /** For every participant ancestor (any order): its pose scale at t_k, its inner-map scale now, and the one the track was planned with. */
    readonly ancestors: readonly {
        readonly pose: { readonly sx: number; readonly sy: number }
        readonly innerNow: { readonly sx: number; readonly sy: number }
        readonly innerPlanned: { readonly sx: number; readonly sy: number }
    }[]
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
 * §5.7: The re-expression path of a kept track ('unchanged', 'translate', or
 * 'retarget' when an ancestor has a live pose scale or changed inner scale).
 */
export function keepPath(input: KeepPathInput): KeepPath {
    if (
        Math.abs(input.delta.x) < UNCHANGED_DELTA_PX &&
        Math.abs(input.delta.y) < UNCHANGED_DELTA_PX
    ) {
        return 'unchanged'
    }
    for (const anc of input.ancestors) {
        if (!unitScale(anc.pose.sx) || !unitScale(anc.pose.sy)) {
            return 'retarget'
        }
        if (
            !sameRelativeScale(anc.innerNow.sx, anc.innerPlanned.sx) ||
            !sameRelativeScale(anc.innerNow.sy, anc.innerPlanned.sy)
        ) {
            return 'retarget'
        }
    }
    return 'translate'
}

export interface StaleNode {
    readonly driven: boolean
    /** A at this flush. */
    readonly a: Box
    /** Undriven: the aged capture's box, else A at its previous flush, else null (never known). */
    readonly lastKnown: Box | null
    /** Driven: δ = A_new − A_old of its origin channels. */
    readonly delta: { readonly x: number; readonly y: number }
    /** Driven: whether keepPath(...) would be 'unchanged' or 'translate' (translation exact). */
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
    const maxDelta = Math.max(Math.abs(node.delta.x), Math.abs(node.delta.y))
    return (
        maxDelta >= threshold ||
        (maxDelta >= UNCHANGED_DELTA_PX && !node.translationExact)
    )
}
