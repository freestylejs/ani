/**
 * Boxes and per-axis affine maps. Pure: no DOM, no clock.
 *
 * Every box is a page box (CSS px, viewport rect plus page scroll). Layout
 * never projects rotation or skew, so each axis is independent and every map
 * is `x ↦ k·x + b` per axis with `k > 0`.
 */

export interface Box {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
}

export interface Affine {
    readonly k: number
    readonly b: number
}

export interface Map2 {
    readonly x: Affine
    readonly y: Affine
}

/** A transform about an origin point: `x ↦ O + t + s·(x − O)`, per axis. */
export interface Pose {
    readonly tx: number
    readonly ty: number
    readonly sx: number
    readonly sy: number
}

export const IDENTITY_MAP: Map2 = { x: { k: 1, b: 0 }, y: { k: 1, b: 0 } }

/** `outer ∘ inner`: apply `inner` first. */
export function compose(outer: Map2, inner: Map2): Map2 {
    return {
        x: { k: outer.x.k * inner.x.k, b: outer.x.k * inner.x.b + outer.x.b },
        y: { k: outer.y.k * inner.y.k, b: outer.y.k * inner.y.b + outer.y.b },
    }
}

export function invert(map: Map2): Map2 {
    return {
        x: { k: 1 / map.x.k, b: -map.x.b / map.x.k },
        y: { k: 1 / map.y.k, b: -map.y.b / map.y.k },
    }
}

export function mapBox(map: Map2, box: Box): Box {
    return {
        x: map.x.k * box.x + map.x.b,
        y: map.y.k * box.y + map.y.b,
        w: map.x.k * box.w,
        h: map.y.k * box.h,
    }
}

/** The page-space map of `pose` about the origin point `(ox, oy)`. */
export function aboutOrigin(pose: Pose, ox: number, oy: number): Map2 {
    return {
        x: { k: pose.sx, b: ox + pose.tx - pose.sx * ox },
        y: { k: pose.sy, b: oy + pose.ty - pose.sy * oy },
    }
}

/**
 * The pose about the origin point `(ox, oy)` that draws `box` at `v` (both in
 * the same frame).
 */
export function poseFor(v: Box, box: Box, ox: number, oy: number): Pose {
    const sx = v.w / box.w
    const sy = v.h / box.h
    return {
        tx: v.x - ox - sx * (box.x - ox),
        ty: v.y - oy - sy * (box.y - oy),
        sx,
        sy,
    }
}

/**
 * An element's own transform, fully resolved: total scale `k`, total
 * translation `t` (px) and origin offset `o` (px from the box's top-left).
 */
export interface OwnTransform {
    readonly kx: number
    readonly ky: number
    readonly tx: number
    readonly ty: number
    readonly ox: number
    readonly oy: number
}

/** The page-space map of an own transform applied to `box`. */
export function ownMap(box: Box, own: OwnTransform): Map2 {
    return aboutOrigin(
        { tx: own.tx, ty: own.ty, sx: own.kx, sy: own.ky },
        box.x + own.ox,
        box.y + own.oy
    )
}

/** The box `L` such that `ownMap(L, own)` draws it at `rect`. */
export function unmapOwn(rect: Box, own: OwnTransform): Box {
    return {
        x: rect.x - own.tx - own.ox * (1 - own.kx),
        y: rect.y - own.ty - own.oy * (1 - own.ky),
        w: rect.w / own.kx,
        h: rect.h / own.ky,
    }
}

/**
 * A map and its time derivative: `rate` holds `dk/dt` and `db/dt` per axis.
 * Composing these is exact, so a box's velocity survives a change of the
 * layers it is drawn through.
 */
export interface MovingMap {
    readonly map: Map2
    readonly rate: Map2
}

const ZERO_RATE: Map2 = { x: { k: 0, b: 0 }, y: { k: 0, b: 0 } }

export const STILL_IDENTITY: MovingMap = { map: IDENTITY_MAP, rate: ZERO_RATE }

export function still(map: Map2): MovingMap {
    return { map, rate: ZERO_RATE }
}

/** `outer ∘ inner` and its derivative (product rule). */
export function composeMoving(outer: MovingMap, inner: MovingMap): MovingMap {
    const rate = (o: Affine, ro: Affine, i: Affine, ri: Affine): Affine => ({
        k: ro.k * i.k + o.k * ri.k,
        b: ro.k * i.b + o.k * ri.b + ro.b,
    })
    return {
        map: compose(outer.map, inner.map),
        rate: {
            x: rate(outer.map.x, outer.rate.x, inner.map.x, inner.rate.x),
            y: rate(outer.map.y, outer.rate.y, inner.map.y, inner.rate.y),
        },
    }
}

export function invertMoving(m: MovingMap): MovingMap {
    // d(1/k) = −k′/k², d(−b/k) = (b·k′ − b′·k)/k²
    const rate = (a: Affine, r: Affine): Affine => ({
        k: -r.k / (a.k * a.k),
        b: (a.b * r.k - r.b * a.k) / (a.k * a.k),
    })
    return {
        map: invert(m.map),
        rate: { x: rate(m.map.x, m.rate.x), y: rate(m.map.y, m.rate.y) },
    }
}

/**
 * The moving map that carries the fixed `box` onto `drawn`, which moves at
 * `velocity`; `null` for an empty box.
 */
export function movingOnto(
    box: Box,
    drawn: Box,
    velocity: Box
): MovingMap | null {
    if (!(box.w > 0) || !(box.h > 0)) return null
    const kx = drawn.w / box.w
    const ky = drawn.h / box.h
    const rx = velocity.w / box.w
    const ry = velocity.h / box.h
    return {
        map: {
            x: { k: kx, b: drawn.x - kx * box.x },
            y: { k: ky, b: drawn.y - ky * box.y },
        },
        rate: {
            x: { k: rx, b: velocity.x - rx * box.x },
            y: { k: ry, b: velocity.y - ry * box.y },
        },
    }
}

/** `m` applied to a box moving at `velocity`: the drawn box and its velocity. */
export function carry(
    m: MovingMap,
    box: Box,
    velocity: Box
): { box: Box; velocity: Box } {
    const { map, rate } = m
    return {
        box: mapBox(map, box),
        velocity: {
            x: rate.x.k * box.x + rate.x.b + map.x.k * velocity.x,
            y: rate.y.k * box.y + rate.y.b + map.y.k * velocity.y,
            w: rate.x.k * box.w + map.x.k * velocity.w,
            h: rate.y.k * box.h + map.y.k * velocity.h,
        },
    }
}
