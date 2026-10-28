/**
 * Every DOM read of the layout engine, every owned-style write and the
 * byte-exact restore (§4, §6). No decisions: callers interpret the values.
 */

import { layoutFault } from './fault'
import type { Box } from './geometry'

/** A CSS length as `px + pct · basis`. */
export interface Len {
    readonly px: number
    readonly pct: number
}

export function resolveLen(len: Len, basis: number): number {
    return len.px + len.pct * basis
}

/** A participant's computed transform inputs, read once per flush when active (§4.3). */
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

/** Corner radii from an element's computed style, resolved against its CSS border box. */
export function readRadius(
    style: CSSStyleDeclaration
): readonly number[] | null {
    const size = borderSize(style)
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

/** The raw rect: a box in the view space of the read, nothing added (§3.2). */
export function viewRect(element: Element): Box {
    const r = element.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
}

/** The layout viewport in view space (§3.2), the reference of culling (§9.1). */
export function viewportBox(doc: Document): Box {
    const view = doc.defaultView
    return {
        x: 0,
        y: 0,
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

/** An element's own computed 2D translate and scale, and the scale/translate part of its `transform`. */
export interface Transform {
    readonly translate: readonly [Len, Len]
    readonly scale: readonly [number, number]
    readonly matrix: Measured['matrix']
}

/**
 * The classifier of an element's own computed transforms: its translate,
 * scale and presence matrix, or why they are not a 2D translate and scale (a
 * rotation, skew or 3D component, or an unparseable value). `measure()` and
 * the support check's inner-scale read (§4.2) share it.
 */
export function readTransform(style: CSSStyleDeclaration): Transform | string {
    const translate = parseTranslate(style.translate)
    if (!translate) return `unparseable translate "${style.translate}"`
    const scale = parseScale(style.scale)
    if (!scale) return `unparseable scale "${style.scale}"`
    const matrix = parseMatrix(style.transform)
    if (!matrix) {
        return `rotation, skew or unparseable transform "${style.transform}"`
    }
    if (!isZeroAngle(style.rotate)) return `rotate "${style.rotate}"`
    return { translate, scale, matrix }
}

/**
 * The computed values of an active node (§4.3). `style` is its computed
 * style when the caller already holds it, so an element is read once, and
 * `transform` its `readTransform` when the caller already classified it in
 * the same check.
 */
export function measure(
    element: HTMLElement,
    radius: boolean,
    animated: () => ReadonlySet<Element>,
    snapsReference: boolean,
    style: CSSStyleDeclaration = getComputedStyle(element),
    transform: Transform | string = readTransform(style)
): Measured {
    layoutFault('measure')
    const origin = style.transformOrigin.split(' ').map(px)
    const display = style.display
    let unsupported: string | null = null
    if (display === 'contents' || display === 'none') {
        unsupported = `display: ${display}`
    } else if (display === 'inline') {
        unsupported = 'display: inline (transforms do not apply)'
    } else if (typeof transform === 'string') {
        unsupported = transform
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
    const parsed = typeof transform === 'string' ? null : transform
    return {
        unsupported,
        translate: parsed?.translate ?? [ZERO, ZERO],
        scale: parsed?.scale ?? [1, 1],
        matrix: parsed?.matrix ?? IDENTITY_MATRIX,
        origin: [origin[0] ?? 0, origin[1] ?? 0],
        originPct: snapsReference ? originPercents(element) : null,
        radius: radii,
    }
}

/**
 * The shadow roots a scope knows hold a participant, open or closed, keyed by
 * host (§4.6).
 */
export type KnownRoots = ReadonlyMap<Element, ShadowRoot>

/** `node` is a `ShadowRoot` (a fragment with a host), in any realm. */
export function isShadowRoot(node: Node): node is ShadowRoot {
    return node.nodeType === 11 && 'host' in node
}

/**
 * One pass's view of the flat tree (§4.6): the known roots, and the
 * node-to-slot map of every known closed root, built once when the pass
 * starts (`assignedSlot` is null for a node slotted into a closed root; an
 * open root needs no map). The DOM does not change while it is used.
 */
export interface FlatTree {
    readonly roots: KnownRoots
    /** Per node slotted into a known closed root, its slot. */
    readonly slots: ReadonlyMap<Node, HTMLSlotElement>
    /**
     * When collected, the shadow root each step of a walk enters (an
     * assigned slot's root, a host's root): with the root of each walk's
     * first node, every shadow root on the chains walked (§5.8).
     */
    readonly passed: Set<ShadowRoot> | null
}

/** The flat tree of one pass over `roots`; `passed` collects the shadow roots its walks enter. */
export function flatTree(
    roots: KnownRoots,
    passed: Set<ShadowRoot> | null = null
): FlatTree {
    const slots = new Map<Node, HTMLSlotElement>()
    for (const root of roots.values()) {
        if (root.mode === 'open') continue
        const list = root.querySelectorAll('slot')
        for (let i = 0; i < list.length; i++) {
            const slot = list[i]!
            for (const node of slot.assignedNodes()) slots.set(node, slot)
        }
    }
    return { roots, slots, passed }
}

/**
 * Flat-tree parent of `node` (§4.6): its assigned slot (`assignedSlot`, or
 * for a node slotted into a known closed root, its slot in the pass's map),
 * else `parentElement`, else the `host` of `node`'s `ShadowRoot` parent (open
 * or closed). A closed root the scope does not know holds no participant, so
 * the walk passes from a node slotted into it straight to its host.
 */
export function flatParent(node: Node, tree?: FlatTree): HTMLElement | null {
    const element = node.parentElement
    const slot =
        (node as Partial<Slottable>).assignedSlot ?? tree?.slots.get(node)
    if (slot) {
        // a slot lives in a shadow root: the step enters it
        tree?.passed?.add(slot.getRootNode() as ShadowRoot)
        return slot
    }
    if (element) return element
    const parent = node.parentNode
    if (parent && isShadowRoot(parent) && parent.host) {
        const host = parent.host as HTMLElement
        if (tree?.passed) {
            const root = host.getRootNode()
            if (isShadowRoot(root)) tree.passed.add(root)
        }
        return host
    }
    return null
}

/**
 * Whether `ancestor` contains `node` in the flat tree (`ancestor === node`
 * included), crossing open and closed shadow roots and slots (§4.6).
 */
export function containsFlat(
    ancestor: Node,
    node: Node | null | undefined,
    tree?: FlatTree
): boolean {
    for (
        let current: Node | null = node ?? null;
        current;
        current = flatParent(current, tree)
    ) {
        if (current === ancestor) return true
    }
    return false
}

/**
 * Whether `element` is viewport-fixed: its `offsetParent` walk ends at a fixed
 * element (§5.8). A fixed element has no offset parent, so the walk ends at
 * it; Gecko gives it the body instead, so the walk's elements are read from
 * its end back until one is fixed. Each `offsetParent` read is counted in
 * `count.parents`, each computed-style read in `count.styles`.
 */
export function viewportFixed(
    element: HTMLElement,
    count: { parents: number; styles: number }
): boolean {
    const walk: Element[] = [element]
    for (;;) {
        count.parents += 1
        const next = (walk[walk.length - 1] as HTMLElement).offsetParent
        if (!next) break
        walk.push(next)
    }
    for (let i = walk.length - 1; i >= 0; i--) {
        count.styles += 1
        if (getComputedStyle(walk[i]!).position === 'fixed') return true
    }
    return false
}

/* ───────────────────────── owned styles ───────────────────────── */

export const POSE_PROPERTIES = ['translate', 'scale'] as const
export const OPACITY_PROPERTIES = ['opacity'] as const
/** Owned only under the scroll-anchoring fallback (§6, §11.4 S2). */
export const ANCHOR_PROPERTY = 'overflow-anchor'
export { RADIUS_PROPERTIES }

/** Inline declarations as they were before layout owned them (or as the author last set them). */
export type Saved = Map<string, readonly [value: string, priority: string]>

/**
 * The authored `inert` attribute of a crossfade follower (§6): present or
 * absent, and its exact value. Restoring puts it back byte for byte.
 */
export interface SavedInert {
    readonly present: boolean
    readonly value: string | null
}

export function saveInert(element: Element): SavedInert {
    const value = element.getAttribute('inert')
    return { present: value !== null, value }
}

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
 * Whether the author replaced an owned declaration inline since layout last
 * wrote it, read without taking it in: such an element is not drawn as
 * layout last wrote it.
 */
export function replacedOwned(
    element: HTMLElement,
    written: ReadonlyMap<string, string>
): boolean {
    for (const property of written.keys()) {
        // anchor selection draws nothing: the box is drawn as written
        if (property === ANCHOR_PROPERTY) continue
        if (element.style.getPropertyPriority(property) !== OWNED_PRIORITY)
            return true
    }
    return false
}

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
        const nowPriority = element.style.getPropertyPriority(property)
        // an important declaration is layout's own (written, or written and
        // queued for restore); an author's inline write replaces it plainly
        if (nowPriority === OWNED_PRIORITY) continue
        const now = element.style.getPropertyValue(property)
        const replaced =
            written.has(property) || now !== value || nowPriority !== priority
        if (!replaced) continue
        saved.set(property, [now, nowPriority])
        written.delete(property)
        adopted = true
    }
    return adopted
}
