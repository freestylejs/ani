import type { ReducedMotionPolicy } from '@freestylejs/ani-core'

export function hasDOM(): boolean {
    return typeof document !== 'undefined' && typeof Element !== 'undefined'
}

const referenceBoxes = new WeakMap<Document, boolean>()

/**
 * Whether the browser applies a percentage `transform-origin` to the border
 * box snapped to device pixels, `round(w · dpr) / dpr` (WebKit), instead of
 * the box itself (§3.1). Probed once per document: an unscaled marker and a
 * scaled probe, one write and one read; without layout there is no snapping.
 */
export function snapsReferenceBox(doc: Document): boolean {
    const known = referenceBoxes.get(doc)
    if (known !== undefined) return known
    let snaps = false
    const parent = doc.body ?? doc.documentElement
    if (parent) {
        const style =
            'position:fixed;left:0;top:0;width:10.3px;height:1px;visibility:hidden;pointer-events:none;transform-origin:50% 0;'
        const marker = doc.createElement('div')
        const probe = doc.createElement('div')
        marker.style.cssText = style
        probe.style.cssText = `${style}scale:5`
        parent.append(marker, probe)
        const plain = marker.getBoundingClientRect()
        const scaled = probe.getBoundingClientRect()
        marker.remove()
        probe.remove()
        if (plain.width > 0) {
            // x ↦ O + 5(x − O): the left edge moves by −4·O
            const used = (plain.left - scaled.left) / 4
            snaps = Math.abs(used - plain.width / 2) > 0.004
        }
    }
    referenceBoxes.set(doc, snaps)
    return snaps
}

const transformAnchors = new WeakMap<Document, boolean>()

/** The anchoring probe's result for `doc`, if it has run (§11.4 S2). */
export function knownTransformAnchoring(doc: Document): boolean | undefined {
    return transformAnchors.get(doc)
}

/**
 * Whether a transform of a scroll container's anchor node moves its scroll
 * offset (Firefox counts the anchor's transform; Chromium suppresses on it;
 * WebKit has no CSS anchoring), §11.4 S2. Run once per document: a fixed,
 * hidden 10 × 10 scroll container at `scrollTop` 10 with one child, one
 * `translate` write on the child, a 1 px reflow of the container (a reflow
 * of the anchor itself would suppress the adjustment), one `scrollTop` read.
 * The container is removed in the same task. The translate moves the anchor
 * down, so a scroll offset past 10 is the browser following it; without
 * layout the offset stays where it was set, or at 0.
 */
export function probeTransformAnchoring(doc: Document): boolean {
    const known = transformAnchors.get(doc)
    if (known !== undefined) return known
    let moves = false
    const parent = doc.documentElement
    if (parent) {
        const box = doc.createElement('div')
        box.style.cssText =
            'position:fixed;left:0;top:0;width:10px;height:10px;margin:0;padding:0;border:0;overflow:scroll;overflow-anchor:auto;visibility:hidden;pointer-events:none;'
        const child = doc.createElement('div')
        child.style.cssText =
            'display:block;height:40px;margin:0;padding:0;border:0;overflow-anchor:auto;'
        box.append(child)
        parent.append(box)
        box.scrollTop = 10
        child.style.translate = '0px 5px'
        box.style.height = '11px'
        moves = box.scrollTop > 10.5
        box.remove()
    }
    transformAnchors.set(doc, moves)
    return moves
}

export function supportsLinearEasing(): boolean {
    return (
        typeof CSS !== 'undefined' &&
        typeof CSS.supports === 'function' &&
        CSS.supports('animation-timing-function', 'linear(0, 1)')
    )
}

export function supportsViewTransition(): boolean {
    return (
        hasDOM() &&
        typeof (
            document as Document & {
                startViewTransition?: unknown
            }
        ).startViewTransition === 'function'
    )
}

export function isActiveViewTransition(): boolean {
    if (!hasDOM()) return false
    const active = (
        document as Document & {
            activeViewTransition?: unknown
        }
    ).activeViewTransition
    if (active) return true
    try {
        return document.documentElement.matches(':active-view-transition')
    } catch {
        return false
    }
}

export type ReducedLayoutMotion = 'none' | 'clamp' | 'skip'

export function reducedLayoutMotion(
    clock: { readonly reducedMotion?: boolean } | undefined,
    policy: ReducedMotionPolicy | undefined
): ReducedLayoutMotion {
    if (policy === 'ignore') return 'none'
    const reduced =
        clock?.reducedMotion === true ||
        (typeof matchMedia === 'function' &&
            matchMedia('(prefers-reduced-motion: reduce)').matches)
    if (!reduced) return 'none'
    return typeof policy === 'object' ? 'clamp' : 'skip'
}
