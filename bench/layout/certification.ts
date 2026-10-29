/**
 * Invocation `pass` is not certification. `pass` is scoped to the selected
 * engine/scene invocation; `certification` is the full gate (five measured
 * runs, both engines, every required scene, controls, self-tests, advisory and
 * pending gates).
 */
import type { CertificationReport } from './report.ts'

export interface CertificationScene {
    readonly scene: string
    readonly status: 'pass' | 'fail' | 'pending' | 'blocked'
    readonly blockedReasons?: readonly string[] | undefined
    /** Deciding, non-blocked metric misses with their medians. */
    readonly failedMetrics?: readonly string[] | undefined
}

export interface CertificationCost {
    readonly status: 'pass' | 'fail' | 'pending' | 'blocked'
    readonly valid: boolean
    /** Measured, deciding metric failures (not BLOCK/non-deciding values). */
    readonly failedMetrics?: readonly string[]
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
    readonly controlsPass: boolean
    readonly selfTestPass: boolean
    readonly blocked?: readonly {
        readonly item: string
        readonly reason: string
    }[]
}

export interface CertificationOptions {
    readonly engines: readonly string[]
    readonly scenes: readonly string[]
    readonly runs: number
}

export interface InvocationInput {
    readonly engines: readonly CertificationEngine[]
}

export interface InvocationResult {
    readonly pass: boolean
    readonly reasons: readonly string[]
}

const REQUIRED_ENGINES = ['chromium', 'webkit'] as const
const REQUIRED_SCENES = [
    's-card',
    's-seg',
    's-photo',
    's-stack',
    's-island',
    's-acc',
    's-insert',
    's-delete',
    's-reorder',
    's-sheet',
    's-bulk',
    'cost',
] as const
const REQUIRED_SCENE_ROWS = REQUIRED_SCENES.filter((scene) => scene !== 'cost')
const REQUIRED_RUNS = 5

/**
 * The selected invocation. It deliberately ignores advisory, global P4
 * pending scenes and the certification-only controls/self-tests; those are
 * certification inputs. A selected scene that fails or is pending still fails
 * the invocation, as does a selected cost report that is not `pass`.
 */
export function evaluateInvocation(input: InvocationInput): InvocationResult {
    const reasons: string[] = []
    const deciding = input.engines.filter(
        (engine) => engine.engine !== 'firefox'
    )
    const required = deciding.length > 0 ? deciding : input.engines
    if (required.length === 0) reasons.push('no engine report')
    for (const engine of required) {
        if (engine.launchError !== null) {
            reasons.push(`${engine.engine} launch error: ${engine.launchError}`)
        }
        for (const scene of engine.scenes) {
            if (scene.status !== 'pass') {
                reasons.push(`${engine.engine} ${scene.scene} ${scene.status}`)
            }
        }
        if (engine.cost && engine.cost.status !== 'pass') {
            reasons.push(`${engine.engine} S-BULK ${engine.cost.status}`)
        }
    }
    return { pass: reasons.length === 0, reasons }
}

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
    if (!input.controlsPass) {
        reasons.push('negative controls failed or were not run')
    }
    if (!input.selfTestPass) {
        reasons.push('self-tests failed')
    }
    for (const pending of input.pending) {
        reasons.push(`pending ${pending.scene}: ${pending.reason}`)
    }
    for (const blocked of input.blocked ?? []) {
        reasons.push(`blocked ${blocked.item}: ${blocked.reason}`)
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
        for (const scene of REQUIRED_SCENE_ROWS) {
            const result = engine.scenes.find((entry) => entry.scene === scene)
            if (!result) reasons.push(`${engineName} scene ${scene} missing`)
            else if (result.status !== 'pass')
                reasons.push(
                    `${engineName} scene ${scene} ${result.status}${(result.failedMetrics ?? []).length > 0 ? ` (failed ${(result.failedMetrics ?? []).join(', ')})` : ''}${(result.blockedReasons ?? []).length > 0 ? ` (blocked ${(result.blockedReasons ?? []).join('; ')})` : ''}`
                )
        }
        if (!engine.cost) reasons.push(`${engineName} S-BULK cost missing`)
        else if (engine.cost.status !== 'pass')
            reasons.push(`${engineName} S-BULK cost ${engine.cost.status}`)
        if (engine.cost && !engine.cost.valid)
            reasons.push(`${engineName} S-BULK cost is not valid`)
        for (const failure of engine.cost?.failedMetrics ?? []) {
            reasons.push(`${engineName} S-BULK ${failure} failed`)
        }
    }
    return {
        certified: reasons.length === 0,
        reasons,
        requiredEngines: [...REQUIRED_ENGINES],
        requiredRuns: REQUIRED_RUNS,
        requiredScenes: [...REQUIRED_SCENES],
    }
}
