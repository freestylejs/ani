/**
 * Every DOM read of the layout engine, every owned-style write and the
 * byte-exact restore (§4, §6). No decisions: callers interpret the values.
 */
import type { Box } from './geometry'

/** A CSS length as `px + pct · basis`. */
export interface Len {
    readonly px: number
    readonly pct: number
}

export function resolveLen(len: Len, basis: number): number {
    return len.px + len.pct * basis
}

/** A participant's computed transform inputs, read once per flush when active. */
export interface Measured {
    /** Why layout cannot drive this element, or `null`. */
    readonly unsupported: string | null
    readonly translate: readonly [Len, Len]
    readonly scale: readonly [number, number]
    /** The 2D scale/translate part of the computed `transform` (presence). */
    readonly matrix: {
        readonly a: number
        readonly d: number
        readonly e: number
        readonly f: number
    }
    /** `transform-origin`, px from the border box's top-left. */
    readonly origin: readonly [number, number]
    /**
     * The percentage part of each origin axis, read only where the browser
     * snaps the reference box (`snapsReferenceBox`); `null` elsewhere.
     */
    readonly originPct: readonly [number, number] | null
    /** Border-box size in CSS px before any transform, rounded (`offsetWidth`/`offsetHeight`). */
    readonly size: readonly [number, number]
    /** Corner radii (tl, tr, br, bl as x/y pairs), when asked for. */
    readonly radius: readonly Len[] | null
}

const IDENTITY_MATRIX = { a: 1, d: 1, e: 0, f: 0 }
const ZERO: Len = { px: 0, pct: 0 }
const RADIUS_PROPERTIES = [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
] as const

function parseLen(token: string): Len | null {
    const value = Number.parseFloat(token)
    if (!Number.isFinite(value)) return null
    if (token.endsWith('%')) return { px: 0, pct: value / 100 }
    if (token.endsWith('px') || value === 0) return { px: value, pct: 0 }
    return null
}

function cssComponents(value: string): string[] {
    const parts: string[] = []
    let depth = 0
    let current = ''
    for (const ch of value) {
        if (ch === '(') depth += 1
        if (ch === ')') depth -= 1
        if (ch === ' ' && depth === 0) {
            if (current) parts.push(current)
            current = ''
        } else {
            current += ch
        }
    }
    if (current) parts.push(current)
    return parts
}

/** A computed radius length, including linear calc(px ± %). */
function parseRadiusLen(token: string): Len | null {
    const direct = parseLen(token)
    if (direct) return direct
    if (!token.startsWith('calc(') || !token.endsWith(')')) return null

    let sign = 1
    let px = 0
    let pct = 0
    for (const part of token.slice(5, -1).trim().split(/\s+/)) {
        if (part === '+' || part === '-') {
            sign = part === '+' ? 1 : -1
            continue
        }
        const value = Number.parseFloat(part)
        if (!Number.isFinite(value)) return null
        if (part.endsWith('%')) pct += (sign * value) / 100
        else if (part.endsWith('px') || value === 0) px += sign * value
        else return null
        sign = 1
    }
    return { px, pct }
}

function parseTranslate(value: string): readonly [Len, Len] | null {
    if (value === 'none') return [ZERO, ZERO]
    const parts = value.split(' ')
    if (parts.length > 3) return null
    const x = parseLen(parts[0]!)
    const y = parts[1] === undefined ? ZERO : parseLen(parts[1])
    const z = parts[2] === undefined ? ZERO : parseLen(parts[2])
    if (!x || !y || !z || z.px !== 0 || z.pct !== 0) return null
    return [x, y]
}

function parseScale(value: string): readonly [number, number] | null {
    if (value === 'none') return [1, 1]
    const parts = value
        .split(' ')
        .map((part) =>
            part.endsWith('%')
                ? Number.parseFloat(part) / 100
                : Number.parseFloat(part)
        )
    if (parts.length > 3 || parts.some((n) => !Number.isFinite(n))) return null
    const x = parts[0]!
    const y = parts[1] ?? x
    if ((parts[2] ?? 1) !== 1) return null
    return [x, y]
}

function isZeroAngle(value: string): boolean {
    return value === 'none' || /^0(deg|rad|turn|grad)?$/.test(value)
}

function parseMatrix(value: string): Measured['matrix'] | null {
    if (value === 'none') return IDENTITY_MATRIX
    const match = /^matrix\(([^)]*)\)$/.exec(value)
    if (!match) return null
    const n = match[1]!.split(',').map((part) => Number.parseFloat(part))
    if (n.length !== 6 || n.some((x) => !Number.isFinite(x))) return null
    // rotation or skew
    if (Math.abs(n[1]!) > 1e-9 || Math.abs(n[2]!) > 1e-9) return null
    return { a: n[0]!, d: n[3]!, e: n[4]!, f: n[5]! }
}

function px(value: string): number {
    return Number.parseFloat(value)
}

/** The exact border-box size from computed values; `null` when not computable. */
export function borderSize(
    element: HTMLElement
): readonly [number, number] | null {
    return borderSizeFromStyle(getComputedStyle(element))
}

function borderSizeFromStyle(
    style: CSSStyleDeclaration
): readonly [number, number] | null {
    const w = px(style.width)
    const h = px(style.height)
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null
    if (style.boxSizing === 'border-box') return [w, h]
    return [
        w +
            px(style.paddingLeft) +
            px(style.paddingRight) +
            px(style.borderLeftWidth) +
            px(style.borderRightWidth),
        h +
            px(style.paddingTop) +
            px(style.paddingBottom) +
            px(style.borderTopWidth) +
            px(style.borderBottomWidth),
    ]
}

function radiiFromStyle(style: CSSStyleDeclaration): Len[] {
    const radii: Len[] = []
    for (const property of RADIUS_PROPERTIES) {
        const parts = cssComponents(style.getPropertyValue(property))
        const x = parseRadiusLen(parts[0]!) ?? ZERO
        const y =
            parts[1] === undefined ? x : (parseRadiusLen(parts[1]) ?? ZERO)
        radii.push(x, y)
    }
    return radii
}

/** Resolved authored corner radii from one computed-style read. */
export function readRadius(element: HTMLElement): readonly number[] | null {
    const style = getComputedStyle(element)
    const size = borderSizeFromStyle(style)
    if (!size) return null
    return radiiFromStyle(style).map((len, i) =>
        resolveLen(len, i % 2 === 0 ? size[0] : size[1])
    )
}

/** Whether a transition (configured or running) or a CSS animation drives `translate` or `scale`. */
const NO_TIME = /^(0s,\s*)*0s$/

/** A transition configured on `translate`/`scale` (or `all`) would animate layout's own writes. */
function transitionsConfigured(style: CSSStyleDeclaration): boolean {
    if (
        NO_TIME.test(style.transitionDuration) &&
        NO_TIME.test(style.transitionDelay)
    ) {
        return false
    }
    return transitionsOwned(style)
}

function transitionsOwned(style: CSSStyleDeclaration): boolean {
    const properties = style.transitionProperty.split(',').map((p) => p.trim())
    const durations = style.transitionDuration.split(',').map((d) => px(d))
    const delays = style.transitionDelay.split(',').map((d) => px(d))
    for (let i = 0; i < properties.length; i++) {
        const property = properties[i]!
        if (
            property !== 'all' &&
            property !== 'translate' &&
            property !== 'scale'
        ) {
            continue
        }
        const duration = durations[i % durations.length] ?? 0
        const delay = delays[i % delays.length] ?? 0
        if (duration + Math.max(0, delay) > 0) return true
    }
    return false
}

/**
 * Elements a CSS transition or CSS animation of `translate`/`scale` is
 * running on: one scan of the document per flush, not one per element.
 */
export function animatedOwned(doc: Document): Set<Element> {
    const animated = new Set<Element>()
    if (typeof doc.getAnimations !== 'function') return animated
    for (const animation of doc.getAnimations()) {
        const css = animation as Animation & {
            transitionProperty?: string
            animationName?: string
        }
        const effect = animation.effect as KeyframeEffect | null
        const target = effect?.target
        if (!target) continue
        if (
            css.transitionProperty === 'translate' ||
            css.transitionProperty === 'scale'
        ) {
            animated.add(target)
        } else if (css.animationName !== undefined) {
            for (const frame of effect.getKeyframes()) {
                if ('translate' in frame || 'scale' in frame) {
                    animated.add(target)
                    break
                }
            }
        }
    }
    return animated
}

/** Page scroll of a document, read once per batch of rects. */
export function pageScroll(doc: Document): readonly [number, number] {
    const view = doc.defaultView
    return [view?.scrollX ?? 0, view?.scrollY ?? 0]
}

/** Page box: viewport rect plus page scroll. */
export function pageRect(
    element: Element,
    scroll: readonly [number, number]
): Box {
    const r = element.getBoundingClientRect()
    return {
        x: r.left + scroll[0],
        y: r.top + scroll[1],
        w: r.width,
        h: r.height,
    }
}

/** The viewport as a page box. */
export function viewportBox(doc: Document): Box {
    const view = doc.defaultView
    return {
        x: view?.scrollX ?? 0,
        y: view?.scrollY ?? 0,
        w: view?.innerWidth ?? doc.documentElement.clientWidth,
        h: view?.innerHeight ?? doc.documentElement.clientHeight,
    }
}

/** A computed `transform-origin` component's percentage (`calc()` included). */
function percentOf(token: string): number | null {
    if (!token.startsWith('calc(')) {
        const value = Number.parseFloat(token)
        if (!Number.isFinite(value)) return null
        return token.endsWith('%') ? value / 100 : 0
    }
    let sign = 1
    let pct = 0
    for (const part of token.slice(5, -1).trim().split(/\s+/)) {
        if (part === '+' || part === '-') {
            sign = part === '+' ? 1 : -1
            continue
        }
        const value = Number.parseFloat(part)
        if (!Number.isFinite(value)) return null
        if (part.endsWith('%')) pct += (sign * value) / 100
        sign = 1
    }
    return pct
}

/**
 * The percentage part of each origin axis from the computed value: the
 * resolved `transformOrigin` is px only, the Typed OM keeps percentages.
 */
function originPercents(
    element: HTMLElement
): readonly [number, number] | null {
    if (typeof element.computedStyleMap !== 'function') return null
    const value = String(
        element.computedStyleMap().get('transform-origin') ?? ''
    )
    // components split on spaces outside parentheses
    const tokens: string[] = []
    let depth = 0
    let current = ''
    for (const ch of value) {
        if (ch === '(') depth += 1
        if (ch === ')') depth -= 1
        if (ch === ' ' && depth === 0) {
            if (current) tokens.push(current)
            current = ''
        } else {
            current += ch
        }
    }
    if (current) tokens.push(current)
    const x = tokens[0] === undefined ? null : percentOf(tokens[0])
    const y = tokens[1] === undefined ? null : percentOf(tokens[1])
    return x === null || y === null ? null : [x, y]
}

export function measure(
    element: HTMLElement,
    radius: boolean,
    animated: () => ReadonlySet<Element>,
    snapsReference: boolean
): Measured {
    const style = getComputedStyle(element)
    const translate = parseTranslate(style.translate)
    const scale = parseScale(style.scale)
    const matrix = parseMatrix(style.transform)
    const origin = style.transformOrigin.split(' ').map(px)
    let unsupported: string | null = null
    if (style.display === 'contents' || style.display === 'none') {
        unsupported = `display: ${style.display}`
    } else if (style.display === 'inline') {
        unsupported = 'display: inline (transforms do not apply)'
    } else if (!translate) {
        unsupported = `unparseable translate "${style.translate}"`
    } else if (!scale) {
        unsupported = `unparseable scale "${style.scale}"`
    } else if (!matrix) {
        unsupported = `rotation, skew or unparseable transform "${style.transform}"`
    } else if (!isZeroAngle(style.rotate)) {
        unsupported = `rotate "${style.rotate}"`
    } else if (!Number.isFinite(origin[0]) || !Number.isFinite(origin[1])) {
        unsupported = `unparseable transform-origin "${style.transformOrigin}"`
    } else if (transitionsConfigured(style) || animated().has(element)) {
        unsupported =
            'a CSS transition or animation on translate/scale (use a transition-property without translate, scale or all)'
    }
    let radii: Len[] | null = null
    if (radius && !unsupported) {
        radii = radiiFromStyle(style)
    }
    return {
        unsupported,
        translate: translate ?? [ZERO, ZERO],
        scale: scale ?? [1, 1],
        matrix: matrix ?? IDENTITY_MATRIX,
        origin: [origin[0] ?? 0, origin[1] ?? 0],
        originPct: snapsReference ? originPercents(element) : null,
        size: [element.offsetWidth, element.offsetHeight],
        radius: radii,
    }
}

/**
 * Scroll offsets of every ancestor of `elements` (each ancestor read once),
 * except the document scroller: page boxes already include page scroll.
 */
export function scrollOffsets(
    elements: Iterable<Element>
): Map<Element, readonly [number, number]> {
    const offsets = new Map<Element, readonly [number, number]>()
    for (const element of elements) {
        const scroller = element.ownerDocument.scrollingElement
        for (
            let node = element.parentElement;
            node && !offsets.has(node);
            node = node.parentElement
        ) {
            if (node === scroller) break
            offsets.set(node, [node.scrollLeft, node.scrollTop])
        }
    }
    return offsets
}

/** Whether any recorded ancestor that is still connected scrolled since. */
export function scrolledSince(
    offsets: ReadonlyMap<Element, readonly [number, number]>
): boolean {
    for (const [node, [left, top]] of offsets) {
        if (!node.isConnected) continue
        if (node.scrollLeft !== left || node.scrollTop !== top) return true
    }
    return false
}

/* ───────────────────────── owned styles ───────────────────────── */

export const POSE_PROPERTIES = ['translate', 'scale'] as const
export const OPACITY_PROPERTIES = ['opacity'] as const
export { RADIUS_PROPERTIES }

/** Inline declarations as they were before layout owned them (or as the author last set them). */
export type Saved = Map<string, readonly [value: string, priority: string]>

export function save(
    element: HTMLElement,
    properties: readonly string[]
): Saved {
    const saved = new Map<string, readonly [string, string]>()
    for (const property of properties) {
        saved.set(property, [
            element.style.getPropertyValue(property),
            element.style.getPropertyPriority(property),
        ])
    }
    return saved
}

/**
 * Puts every saved declaration back: an existing one is replaced in place, a
 * missing one removed, so the inline style serializes exactly as before.
 */
export function restore(element: HTMLElement, saved: Saved): void {
    for (const [property, [value, priority]] of saved) {
        put(element, property, value, priority)
    }
}

/** Sets one inline declaration; an empty value removes it. */
export function put(
    element: HTMLElement,
    property: string,
    value: string,
    priority: string
): void {
    if (value === '') element.style.removeProperty(property)
    else element.style.setProperty(property, value, priority)
}

/** Owned declarations are important, so stylesheet rules cannot override them mid-run. */
export const OWNED_PRIORITY = 'important'

/**
 * Takes in what the author set inline on an owned property since layout
 * last wrote it (an inline write replaces the important declaration), so the
 * settle restores the author's latest value (§6). Returns whether it did.
 */
export function adoptAuthored(
    element: HTMLElement,
    saved: Saved,
    written: Map<string, string>
): boolean {
    let adopted = false
    for (const [property, [value, priority]] of saved) {
        const now = element.style.getPropertyValue(property)
        const nowPriority = element.style.getPropertyPriority(property)
        // an important declaration is layout's own (written, or written and
        // queued for restore); an author's inline write replaces it plainly
        const replaced =
            nowPriority !== OWNED_PRIORITY &&
            (written.has(property) || now !== value || nowPriority !== priority)
        if (!replaced) continue
        saved.set(property, [now, nowPriority])
        written.delete(property)
        adopted = true
    }
    return adopted
}
