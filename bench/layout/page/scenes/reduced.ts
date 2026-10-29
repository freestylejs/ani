/**
 * The reduced-motion support variants' group policy. This is scene data, not
 * an engine rule: the primary run uses `'ignore'`, and the H19 variants select
 * the §9.4 policy from the requested variant. A negative control may override
 * the policy deliberately so the variant's oracle can be shown to fail.
 */
import type { VariantRunOptions } from '../../types.ts'

export type ReducedMotionPolicy =
    | 'jump'
    | 'ignore'
    | { readonly maxDuration: number }

export interface ReducedSceneOptions {
    readonly control?: string | undefined
    readonly variant?: VariantRunOptions | undefined
}

export const MAX_DURATION = 0.2

export function reducedPolicyFor(
    options: ReducedSceneOptions
): ReducedMotionPolicy {
    const policy = options.variant?.policy ?? null
    if (policy === null) return 'ignore'
    if (options.control === 'rm-policy-ignored') return 'ignore'
    if (options.control === 'rm-policy-unclamped') return { maxDuration: 10 }
    if (options.control === 'rm-policy-jump') return 'jump'
    return policy === 'maxDuration' ? { maxDuration: MAX_DURATION } : policy
}

export function prefersReduced(options: ReducedSceneOptions): boolean {
    return options.variant?.reducedPreference ?? false
}

export function isJumpPolicy(options: ReducedSceneOptions): boolean {
    return reducedPolicyFor(options) === 'jump'
}
