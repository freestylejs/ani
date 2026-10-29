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
    /** G10 has valid 20-frame batch samples even with a coarse timer. */
    readonly steadyBatch?: boolean
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
            input.steadyBatch
                ? `timer g ${input.g.toFixed(4)} ms > 0.05 ms: G9/G11 are non-deciding; G10 uses 20-frame interval samples`
                : `timer g ${input.g.toFixed(4)} ms > 0.05 ms: G9/G10/G11 are non-deciding; a 1 ms-quantized ratio is not a measured result`
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

export const HELD_PENDING_REASON =
    'P4 (held shape G12; take/move/release not in the base tree)'

export interface CostOutcomeInput {
    readonly valid: boolean
    readonly heldPending: boolean
    readonly metricsPass: boolean
}

export interface CostOutcome {
    readonly status: 'pass' | 'fail' | 'pending' | 'blocked'
    readonly pass: boolean
    readonly pending: string | null
}

/**
 * N9: G12 is pending only while the cost trace says it is. Once the held shape
 * exists, an all-green valid run is `pass`, not a permanent `pending`.
 */
export function costOutcome(input: CostOutcomeInput): CostOutcome {
    const pending = input.heldPending ? HELD_PENDING_REASON : null
    if (!input.valid) {
        return { status: 'blocked', pass: false, pending }
    }
    if (input.heldPending) {
        return { status: 'pending', pass: false, pending }
    }
    return {
        status: input.metricsPass ? 'pass' : 'fail',
        pass: input.metricsPass,
        pending: null,
    }
}
