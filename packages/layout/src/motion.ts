/**
 * Layout options: types, validation, defaults, timing curves and the
 * reduced-motion clamp. Pure: no DOM, no clock.
 */
import {
    BezierTimingFunction,
    createAniError,
    DEV,
    LinearTimingFunction,
    type ReducedMotionPolicy,
    SpringTimingFunction,
    type TimingFunction,
    timing,
} from '@freestylejs/ani-core'

export interface LayoutMotion {
    /** Seconds. Default: 0.35. */
    readonly duration?: number
    /** Seconds, for a node at rest when the change happens. Default: 0. */
    readonly delay?: number
    /** A stateless core timing function. Default: `timing.easeOut()`. */
    readonly timing?: TimingFunction
}

/** `true` animates position and size; `'position'` pins the size; `'size'` pins the position. */
export type LayoutMode = true | 'position' | 'size'

/** A point of the box as fractions of its size, 0–1. */
export interface LayoutAnchor {
    readonly x: number
    readonly y: number
}

export interface LayoutOptions {
    /** Default: `true`. */
    readonly layout?: LayoutMode
    /** Shared identity within the scope. */
    readonly layoutId?: string
    /** Keeps this point of the box on the same point of the parent participant. */
    readonly layoutAnchor?: LayoutAnchor
    /** Crossfade with an exiting node of the same `layoutId`. Default: `true`. */
    readonly layoutCrossfade?: boolean
    /** When given and unchanged since the previous flush, the node is not animated. */
    readonly layoutDependency?: unknown
    /** Keep the corners' on-screen radius under scale. Default: `false`. */
    readonly radius?: boolean
    readonly motion?: LayoutMotion
}

/** A timing curve normalized to `e(0) = 0`, `e(1) = 1`. */
export interface Curve {
    value(tau: number): number
    slope(tau: number): number
    readonly slope0: number
}

export interface Motion {
    readonly duration: number
    readonly delay: number
    readonly curve: Curve
}

const DEFAULT_DURATION = 0.35
const SLOPE_STEP = 1e-6

export function invalidOptions(kind: 'type' | 'range', message: string): Error {
    return createAniError(
        kind === 'type' ? TypeError : RangeError,
        'ANI_INVALID_OPTIONS',
        DEV ? `[ani-layout] ${message}` : ''
    )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false
    }
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

export function assertKeys(
    value: Record<string, unknown>,
    allowed: readonly string[],
    label: string
): void {
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) {
            throw invalidOptions(
                'type',
                `${label} has an unknown option "${key}"; allowed: ${allowed.join(', ')}.`
            )
        }
    }
}

function assertSeconds(value: unknown, name: string): void {
    if (
        value !== undefined &&
        (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    ) {
        throw invalidOptions(
            'range',
            `motion.${name} must be a finite number of seconds >= 0, received ${String(value)}.`
        )
    }
}

const MOTION_KEYS = ['duration', 'delay', 'timing'] as const

export function validateMotion(value: unknown, label = 'motion'): void {
    if (value === undefined) return
    if (!isPlainObject(value)) {
        throw invalidOptions(
            'type',
            `${label} must be an object, received ${String(value)}.`
        )
    }
    assertKeys(value, MOTION_KEYS, label)
    assertSeconds(value.duration, 'duration')
    assertSeconds(value.delay, 'delay')
    const fn = value.timing
    if (fn === undefined) return
    if (
        typeof fn !== 'object' ||
        fn === null ||
        typeof (fn as { step?: unknown }).step !== 'function'
    ) {
        throw invalidOptions(
            'type',
            `${label}.timing must be a core timing function, received ${String(fn)}.`
        )
    }
    if ((fn as TimingFunction).stateful === true) {
        throw invalidOptions(
            'type',
            `${label}.timing must be stateless; a stateful timing such as timing.dynamicSpring cannot be evaluated at an arbitrary time. Use timing.spring.`
        )
    }
    if (!Number.isFinite(curveOf(fn as TimingFunction).slope0)) {
        throw invalidOptions(
            'range',
            `${label}.timing must start with a finite slope so a moving node keeps its velocity; a bezier with x1 = 0 and y1 ≠ 0 starts vertically.`
        )
    }
}

const OPTION_KEYS = [
    'layout',
    'layoutId',
    'layoutAnchor',
    'layoutCrossfade',
    'layoutDependency',
    'radius',
    'motion',
] as const

export function validateLayoutOptions(value: unknown): void {
    if (value === undefined) return
    if (!isPlainObject(value)) {
        throw invalidOptions(
            'type',
            `layout options must be an object, received ${String(value)}.`
        )
    }
    assertKeys(value, OPTION_KEYS, 'layout options')
    const mode = value.layout
    if (
        mode !== undefined &&
        mode !== true &&
        mode !== 'position' &&
        mode !== 'size'
    ) {
        throw invalidOptions(
            'type',
            `layout must be true, 'position' or 'size', received ${String(mode)}.`
        )
    }
    const id = value.layoutId
    if (id !== undefined && (typeof id !== 'string' || id.length === 0)) {
        throw invalidOptions(
            'type',
            `layoutId must be a non-empty string, received ${String(id)}.`
        )
    }
    const anchor = value.layoutAnchor
    if (anchor !== undefined) {
        if (!isPlainObject(anchor)) {
            throw invalidOptions(
                'type',
                `layoutAnchor must be an object { x, y }, received ${String(anchor)}.`
            )
        }
        assertKeys(anchor, ['x', 'y'], 'layoutAnchor')
        for (const axis of ['x', 'y'] as const) {
            const n = anchor[axis]
            if (typeof n !== 'number' || !(n >= 0 && n <= 1)) {
                throw invalidOptions(
                    'range',
                    `layoutAnchor.${axis} must be a number from 0 to 1, received ${String(n)}.`
                )
            }
        }
    }
    for (const flag of ['layoutCrossfade', 'radius'] as const) {
        const v = value[flag]
        if (v !== undefined && typeof v !== 'boolean') {
            throw invalidOptions(
                'type',
                `${flag} must be a boolean, received ${String(v)}.`
            )
        }
    }
    validateMotion(value.motion)
}

export function validateReducedMotion(policy: unknown): ReducedMotionPolicy {
    if (policy === undefined || policy === 'jump') return 'jump'
    if (policy === 'ignore') return 'ignore'
    if (isPlainObject(policy)) {
        assertKeys(policy, ['maxDuration'], 'reducedMotion')
        const max = policy.maxDuration
        if (typeof max === 'number' && Number.isFinite(max) && max > 0) {
            return { maxDuration: max }
        }
    }
    throw invalidOptions(
        'type',
        `reducedMotion must be 'jump', 'ignore' or { maxDuration: number > 0 }, received ${String(policy)}.`
    )
}

/**
 * `dy/dx` of a cubic bezier at x = 0. With `p2.x = 0` the first derivatives
 * vanish and the ratio of the second ones (or of the third) is the limit.
 */
function bezierSlope0(fn: BezierTimingFunction): number {
    const { p2, p3 } = fn.opt
    if (p2.x > 0) return p2.y / p2.x
    if (p2.y !== 0) return Number.POSITIVE_INFINITY
    if (p3.x > 0) return p3.y / p3.x
    return p3.y === 0 ? 1 : Number.POSITIVE_INFINITY
}

/** Exact `raw′(0)` for core timings; `null` for a custom timing. */
function rawSlope0(fn: TimingFunction): number | null {
    if (fn instanceof LinearTimingFunction) return 1
    // the mass-spring-damper starts at rest
    if (fn instanceof SpringTimingFunction) return 0
    if (fn instanceof BezierTimingFunction) return bezierSlope0(fn)
    return null
}

/**
 * `e′(0)` of a custom timing from forward differences; `Infinity` when they
 * do not converge (a vertical start).
 */
function convergedSlope0(value: (tau: number) => number): number {
    const secant = (h: number) => (value(h) - value(0)) / h
    const coarse = secant(1e-5)
    const fine = secant(1e-6)
    if (!Number.isFinite(fine)) return Number.POSITIVE_INFINITY
    return Math.abs(fine - coarse) <= 1e-2 * Math.max(1, Math.abs(fine))
        ? fine
        : Number.POSITIVE_INFINITY
}

const curves = new WeakMap<TimingFunction, Curve>()

/** Structural equality of plain data, independent of key order. */
function sameData(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true
    if (
        typeof a !== 'object' ||
        typeof b !== 'object' ||
        a === null ||
        b === null ||
        Array.isArray(a) !== Array.isArray(b)
    ) {
        return false
    }
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    if (ak.length !== bk.length) return false
    for (const key of ak) {
        if (!Object.hasOwn(b, key)) return false
        if (
            !sameData(
                (a as Record<string, unknown>)[key],
                (b as Record<string, unknown>)[key]
            )
        ) {
            return false
        }
    }
    return true
}

/**
 * Timings compared by value: the same class with equal `opt`, whatever its
 * key order, or, for a timing without `opt` (linear), equal own fields (a
 * timing written inline is a new object on every call).
 */
function sameTiming(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (
        typeof a !== 'object' ||
        typeof b !== 'object' ||
        a === null ||
        b === null ||
        a.constructor !== b.constructor
    ) {
        return false
    }
    return 'opt' in a || 'opt' in b
        ? 'opt' in a && 'opt' in b && sameData(a.opt, b.opt)
        : sameData(a, b)
}

interface MergedMotion {
    readonly duration: number
    readonly delay: number
    /** `undefined`: the default timing. */
    readonly timing: TimingFunction | undefined
}

/** Field-wise merge, later layers win, defaults filled in. */
function mergeMotion(
    layers: readonly (LayoutMotion | undefined)[]
): MergedMotion {
    let duration = DEFAULT_DURATION
    let delay = 0
    let fn: TimingFunction | undefined
    for (const layer of layers) {
        if (!layer) continue
        if (layer.duration !== undefined) duration = layer.duration
        if (layer.delay !== undefined) delay = layer.delay
        if (layer.timing !== undefined) fn = layer.timing
    }
    return { duration, delay, timing: fn }
}

/**
 * Whether two option sets draw the same track under the group's motion:
 * mode, anchor, effective motion and radius. A change of any of them
 * retargets a running track (§5.5); equal effective options keep it (§3.3
 * invariant 5), so `{}` and `{ motion: { delay: 0 } }` are the same track.
 * `layoutId`, `layoutCrossfade` and `layoutDependency` act at the flush and
 * never restart a track.
 */
export function sameTrackOptions(
    a: LayoutOptions,
    b: LayoutOptions,
    group?: LayoutMotion
): boolean {
    const am = mergeMotion([group, a.motion])
    const bm = mergeMotion([group, b.motion])
    return (
        (a.layout ?? true) === (b.layout ?? true) &&
        a.layoutAnchor?.x === b.layoutAnchor?.x &&
        a.layoutAnchor?.y === b.layoutAnchor?.y &&
        (a.radius ?? false) === (b.radius ?? false) &&
        am.duration === bm.duration &&
        am.delay === bm.delay &&
        sameTiming(am.timing, bm.timing)
    )
}

/** The normalized curve of a stateless timing (cached per instance). */
export function curveOf(fn: TimingFunction): Curve {
    const cached = curves.get(fn)
    if (cached) return cached
    const context = { dt: 0, from: 0, to: 1, duration: 1 }
    const raw = (tau: number): number => fn.step(tau, context).value
    const r0 = raw(0)
    const r1 = raw(1)
    const value = (tau: number): number => {
        if (tau <= 0) return 0
        if (tau >= 1) return 1
        return raw(tau) - r0 * (1 - tau) + (1 - r1) * tau
    }
    const numericSlope = (tau: number): number => {
        const lo = Math.max(0, tau - SLOPE_STEP)
        const hi = Math.min(1, tau + SLOPE_STEP)
        return (value(hi) - value(lo)) / (hi - lo)
    }
    const exact = rawSlope0(fn)
    const slope0 =
        exact === null ? convergedSlope0(value) : exact + r0 + (1 - r1)
    const slope = (tau: number): number => {
        if (tau < 0 || tau > 1) return 0
        return tau === 0 ? slope0 : numericSlope(tau)
    }
    const curve: Curve = { value, slope, slope0 }
    curves.set(fn, curve)
    return curve
}

let defaultTiming: TimingFunction | null = null

/** The merged motion of validated layers, later layers win. */
export function resolveMotion(
    layers: readonly (LayoutMotion | undefined)[]
): Motion {
    const { duration, delay, timing: fn } = mergeMotion(layers)
    defaultTiming ??= timing.easeOut()
    return { duration, delay, curve: curveOf(fn ?? defaultTiming) }
}

/** `{ maxDuration }`: delay + duration scaled down to fit; shorter runs untouched. */
export function clampMotion(motion: Motion, maxDuration: number): Motion {
    const total = motion.delay + motion.duration
    if (total <= maxDuration) return motion
    const factor = maxDuration / total
    return {
        duration: motion.duration * factor,
        delay: motion.delay * factor,
        curve: motion.curve,
    }
}
