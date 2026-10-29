/**
 * Cost-run validity and status, kept pure so the cadence and post-P4 paths are
 * testable without a browser.
 */

/** The stated 60 Hz tolerance for G11's sustained cadence. */
export const COMMIT_HZ_MIN = 58.5
export const COMMIT_HZ_MAX = 61.5

export interface CostValidityInput {
    readonly g: number
    readonly commits: number
    readonly commitHz: number
}

export interface CostValidity {
    readonly valid: boolean
    readonly timerValid: boolean
    readonly cadenceValid: boolean
    readonly reasons: readonly string[]
}

export function costValidity(input: CostValidityInput): CostValidity {
    const timerValid = input.g <= 0.05
    const cadenceValid =
        input.commits === 300 &&
        input.commitHz >= COMMIT_HZ_MIN &&
        input.commitHz <= COMMIT_HZ_MAX
    const reasons: string[] = []
    if (!timerValid) {
        reasons.push(
            `timer g ${input.g.toFixed(4)} ms > 0.05 ms: G9/G10/G11 are non-deciding; a 1 ms-quantized ratio is not a measured result`
        )
    }
    if (!cadenceValid) {
        reasons.push(
            `sustained cadence ${input.commitHz.toFixed(2)} Hz over ${input.commits} commits is outside ${COMMIT_HZ_MIN}-${COMMIT_HZ_MAX} Hz or not 300 commits`
        )
    }
    return {
        valid: timerValid && cadenceValid,
        timerValid,
        cadenceValid,
        reasons,
    }
}

/**
 * Retained for a future gate that is genuinely blocked on a missing engine
 * surface; the P4 held shape is no longer pending (H16).
 */
export const HELD_PENDING_REASON = 'G12 held shape not measured in this trace'

export interface CostOutcomeInput {
    readonly valid: boolean
    readonly metricsPass: boolean
}

export interface CostOutcome {
    readonly status: 'pass' | 'fail' | 'pending' | 'blocked'
    readonly pass: boolean
    readonly pending: string | null
}

/**
 * An all-green valid run is `pass`. A timer/cadence failure is `blocked`, not
 * `pending`; G12 is a measured metric, not a permanent pending gate.
 */
export function costOutcome(input: CostOutcomeInput): CostOutcome {
    if (!input.valid) {
        return { status: 'blocked', pass: false, pending: null }
    }
    return {
        status: input.metricsPass ? 'pass' : 'fail',
        pass: input.metricsPass,
        pending: null,
    }
}
