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
