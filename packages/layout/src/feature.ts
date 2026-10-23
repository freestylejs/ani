import type { ReducedMotionPolicy } from '@freestylejs/ani-core'

export function hasDOM(): boolean {
    return typeof document !== 'undefined' && typeof Element !== 'undefined'
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
