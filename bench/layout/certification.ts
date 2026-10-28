/** Invocation `pass` is not certification. These are the H14-02 rules. */
import type { CertificationReport } from './report.ts'

export interface CertificationScene {
    readonly scene: string
    readonly status: 'pass' | 'fail' | 'pending'
}

export interface CertificationCost {
    readonly status: 'pass' | 'fail' | 'pending' | 'blocked'
    readonly valid: boolean
}

export interface CertificationEngine {
    readonly engine: string
    readonly launchError: string | null
    readonly scenes: readonly CertificationScene[]
    readonly cost: CertificationCost | null
}

export interface CertificationInput {
    readonly engines: readonly CertificationEngine[]
    readonly pending: readonly {
        readonly scene: string
        readonly reason: string
    }[]
    readonly advisory: { readonly cost: boolean }
}

export interface CertificationOptions {
    readonly engines: readonly string[]
    readonly scenes: readonly string[]
    readonly runs: number
}

const REQUIRED_ENGINES = ['chromium', 'webkit'] as const
const REQUIRED_SCENES = ['s-card', 's-seg', 'cost'] as const
const REQUIRED_RUNS = 5

export function evaluateCertification(
    input: CertificationInput,
    options: CertificationOptions
): CertificationReport {
    const reasons: string[] = []
    if (options.runs !== REQUIRED_RUNS) {
        reasons.push(`runs ${options.runs} != ${REQUIRED_RUNS}`)
    }
    for (const engine of REQUIRED_ENGINES) {
        if (!options.engines.includes(engine)) {
            reasons.push(`required engine ${engine} not selected`)
        }
    }
    for (const scene of REQUIRED_SCENES) {
        if (!options.scenes.includes(scene)) {
            reasons.push(`required scene ${scene} not selected`)
        }
    }
    if (input.advisory.cost) {
        reasons.push('cost fingerprint is advisory')
    }
    for (const pending of input.pending) {
        reasons.push(`pending ${pending.scene}: ${pending.reason}`)
    }
    for (const engineName of REQUIRED_ENGINES) {
        const engine = input.engines.find(
            (entry) => entry.engine === engineName
        )
        if (!engine) {
            reasons.push(`required engine ${engineName} has no report`)
            continue
        }
        if (engine.launchError !== null) {
            reasons.push(`${engineName} launch error: ${engine.launchError}`)
        }
        for (const scene of ['s-card', 's-seg']) {
            const result = engine.scenes.find((entry) => entry.scene === scene)
            if (!result) reasons.push(`${engineName} scene ${scene} missing`)
            else if (result.status !== 'pass')
                reasons.push(`${engineName} scene ${scene} ${result.status}`)
        }
        if (!engine.cost) reasons.push(`${engineName} S-BULK cost missing`)
        else if (engine.cost.status !== 'pass')
            reasons.push(`${engineName} S-BULK cost ${engine.cost.status}`)
        if (engine.cost && !engine.cost.valid)
            reasons.push(`${engineName} S-BULK cost is not valid`)
    }
    return {
        certified: reasons.length === 0,
        reasons,
        requiredEngines: [...REQUIRED_ENGINES],
        requiredRuns: REQUIRED_RUNS,
        requiredScenes: [...REQUIRED_SCENES],
    }
}
