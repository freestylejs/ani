/**
 * Invocation `pass` is not certification. `pass` is scoped to the selected
 * engine/scene invocation; `certification` is the full gate (five measured
 * runs, both engines, every required scene, controls, self-tests, advisory and
 * pending gates).
 */
import type { CertificationReport, SceneReport } from './report.ts'
import { variantKey } from './variants.ts'

export interface CertificationScene {
    readonly scene: string
    readonly status: 'pass' | 'fail' | 'pending' | 'blocked'
    readonly blockedReasons?: readonly string[] | undefined
    /** Deciding, non-blocked metric misses with their medians. */
    readonly failedMetrics?: readonly string[] | undefined
    /**
     * D12: computed by the runner from the full scene/variant report. True
     * only for WebKit and only when every failure is a cost row (G8–G12).
     */
    readonly costOnly?: boolean | undefined
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
    /** H19 support variants scored with the same gates. */
    readonly variants?: readonly CertificationScene[] | undefined
    readonly cost: CertificationCost | null
}

export interface CertificationInput {
    readonly engines: readonly CertificationEngine[]
    readonly pending: readonly {
        readonly scene: string
        readonly reason: string
    }[]
    readonly advisory: {
        /** A hard hardware/software fingerprint mismatch (D13). */
        readonly cost: boolean
        readonly reasons?: readonly string[] | undefined
        readonly load1?: number | undefined
        readonly controlledLoad?: boolean | undefined
        readonly loadReason?: string | undefined
    }
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
    /** D12 WebKit cost-only rows; recorded, never an invocation failure. */
    readonly advisory: readonly string[]
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
const REQUIRED_VARIANTS = [
    ...(['s-card', 's-photo', 's-acc', 's-seg'] as const).flatMap((scene) =>
        (['dpr1', 'dpr3'] as const).map((id) => variantKey(scene, id))
    ),
    ...(
        ['s-card', 's-photo', 's-acc', 's-reorder', 's-sheet'] as const
    ).flatMap((scene) =>
        (['rm-jump', 'rm-max', 'rm-ignore'] as const).map((id) =>
            variantKey(scene, id)
        )
    ),
]

/**
 * D12 cost rows. G8 is a real-clock frame-cost row, so it belongs to the
 * Chromium-decided cost set together with G9/G10/G11/G12. G13 and every
 * G1–G7/shape/status/RUN failure stay deciding on WebKit.
 */
const COST_METRIC_ID = /^(?:G8|G9|G10|G11|G12)(?:[.-]|$)/

export function isCostMetricId(id: string): boolean {
    return COST_METRIC_ID.test(id)
}

function isCostReason(reason: string): boolean {
    const id = reason.trim().split(/[\s(]/, 1)[0] ?? ''
    return isCostMetricId(id)
}

function isCostFailure(failure: string): boolean {
    const id = failure.trim().split(/[\s(]/, 1)[0] ?? ''
    return isCostMetricId(id)
}

/**
 * Classifies a full WebKit scene/variant report as cost-only. Every measured
 * run must fail only on G8–G12: no page/real-twin problem, no leftover
 * track/hold/clock, and no failing G1–G7/G13/shape/status metric. `RUN` cannot
 * hide a non-cost failure: a run that fails without a cost signal keeps the
 * row blocking.
 */
export function classifyWebkitCostOnly(scene: SceneReport): boolean {
    if (scene.status === 'pass' || scene.status === 'pending') return false
    const blocked = scene.blockedReasons ?? []
    if (!blocked.every(isCostReason)) return false
    if (scene.status === 'blocked' && blocked.length === 0) return false
    const measured = scene.runs.filter((run) => !run.warmup)
    if (measured.length === 0) return false
    let anyCost = blocked.length > 0
    for (const run of measured) {
        if (run.problems.length > 0) return false
        const final = run.summary.final
        if (
            final.tracks !== 0 ||
            final.holds !== 0 ||
            final.clockPending !== 0 ||
            final.clockSize !== 0
        ) {
            return false
        }
        let runCost = false
        for (const metric of [...run.metrics, ...run.shape]) {
            if (metric.deciding === false || metric.blocked === true) continue
            if (metric.pass) continue
            if (!isCostMetricId(metric.id)) return false
            runCost = true
        }
        // G8's real-clock row is the `real` twin. Other real-twin problems are
        // already in `run.problems`.
        if (run.real.blocked === true || !run.real.pass) runCost = true
        if (!run.pass && !runCost) return false
        anyCost ||= runCost
    }
    for (const metric of [...scene.metrics, ...scene.shape]) {
        if (
            metric.id === 'RUN' ||
            metric.deciding === false ||
            metric.blocked === true ||
            metric.pass
        ) {
            continue
        }
        if (!isCostMetricId(metric.id)) return false
        anyCost = true
    }
    return anyCost
}

/**
 * The gate-facing classification. The runner's explicit `costOnly` is
 * authoritative. For callers that do not carry it, be conservative: every
 * blocked reason and every non-RUN failed metric must be a cost row.
 */
export function isWebkitCostOnly(
    engine: string,
    scene: CertificationScene
): boolean {
    if (engine !== 'webkit') return false
    if (scene.costOnly !== undefined) return scene.costOnly
    if (scene.status === 'pass' || scene.status === 'pending') return false
    const blocked = scene.blockedReasons ?? []
    if (!blocked.every(isCostReason)) return false
    const failures = scene.failedMetrics ?? []
    if (failures.length === 0) return blocked.length > 0
    return failures.every(isCostFailure)
}

function costOnlyNote(
    engine: string,
    scene: CertificationScene,
    label: 'scene' | 'variant'
): string {
    const detail = [
        ...(scene.failedMetrics ?? []),
        ...(scene.blockedReasons ?? []),
    ].join('; ')
    return `${engine} ${label} ${scene.scene} cost-only ${scene.status} (D12 advisory; G8–G12)${detail.length > 0 ? `: ${detail}` : ''}`
}

/**
 * The selected invocation. It deliberately ignores advisory, global P4
 * pending scenes and the certification-only controls/self-tests; those are
 * certification inputs. A selected scene that fails or is pending still fails
 * the invocation, as does a selected cost report that is not `pass`.
 */
export function evaluateInvocation(input: InvocationInput): InvocationResult {
    const reasons: string[] = []
    const advisory: string[] = []
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
            if (scene.status === 'pass') continue
            if (isWebkitCostOnly(engine.engine, scene)) {
                advisory.push(costOnlyNote(engine.engine, scene, 'scene'))
                continue
            }
            reasons.push(`${engine.engine} ${scene.scene} ${scene.status}`)
        }
        for (const variant of engine.variants ?? []) {
            if (variant.status === 'pass') continue
            if (isWebkitCostOnly(engine.engine, variant)) {
                advisory.push(costOnlyNote(engine.engine, variant, 'variant'))
                continue
            }
            reasons.push(`${engine.engine} ${variant.scene} ${variant.status}`)
        }
        if (
            engine.cost &&
            engine.cost.status !== 'pass' &&
            engine.engine !== 'webkit'
        ) {
            reasons.push(`${engine.engine} S-BULK ${engine.cost.status}`)
        }
    }
    return { pass: reasons.length === 0, reasons, advisory }
}

export function evaluateCertification(
    input: CertificationInput,
    options: CertificationOptions
): CertificationReport {
    const reasons: string[] = []
    const advisory: string[] = []
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
        const hardReasons = input.advisory.reasons ?? []
        reasons.push(
            `cost fingerprint is advisory${hardReasons.length > 0 ? `: ${hardReasons.join('; ')}` : ''}`
        )
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
        const webkit = engineName === 'webkit'
        for (const key of REQUIRED_VARIANTS) {
            const result = (engine.variants ?? []).find(
                (entry) => entry.scene === key
            )
            if (!result) {
                reasons.push(`${engineName} variant ${key} missing`)
                continue
            }
            const blocked = result.blockedReasons ?? []
            if (
                result.status !== 'pass' &&
                isWebkitCostOnly(engineName, result)
            ) {
                advisory.push(costOnlyNote(engineName, result, 'variant'))
                continue
            }
            if (result.status !== 'pass') {
                reasons.push(
                    `${engineName} variant ${key} ${result.status}${(result.failedMetrics ?? []).length > 0 ? ` (failed ${(result.failedMetrics ?? []).join(', ')})` : ''}${blocked.length > 0 ? ` (blocked ${blocked.join('; ')})` : ''}`
                )
            }
        }
        for (const scene of REQUIRED_SCENE_ROWS) {
            const result = engine.scenes.find((entry) => entry.scene === scene)
            if (!result) {
                reasons.push(`${engineName} scene ${scene} missing`)
                continue
            }
            const blocked = result.blockedReasons ?? []
            if (
                result.status !== 'pass' &&
                isWebkitCostOnly(engineName, result)
            ) {
                advisory.push(costOnlyNote(engineName, result, 'scene'))
                continue
            }
            if (result.status !== 'pass')
                reasons.push(
                    `${engineName} scene ${scene} ${result.status}${(result.failedMetrics ?? []).length > 0 ? ` (failed ${(result.failedMetrics ?? []).join(', ')})` : ''}${blocked.length > 0 ? ` (blocked ${blocked.join('; ')})` : ''}`
                )
        }
        if (!engine.cost) {
            if (webkit)
                advisory.push(
                    `${engineName} S-BULK cost missing (D12 advisory)`
                )
            else reasons.push(`${engineName} S-BULK cost missing`)
        } else if (engine.cost.status !== 'pass') {
            if (webkit)
                advisory.push(
                    `${engineName} S-BULK cost ${engine.cost.status} (D12 advisory)`
                )
            else reasons.push(`${engineName} S-BULK cost ${engine.cost.status}`)
        }
        if (engine.cost && !engine.cost.valid) {
            if (webkit)
                advisory.push(
                    `${engineName} S-BULK cost is not valid (D12 advisory)`
                )
            else reasons.push(`${engineName} S-BULK cost is not valid`)
        }
        for (const failure of engine.cost?.failedMetrics ?? []) {
            if (webkit)
                advisory.push(`${engineName} S-BULK ${failure} (D12 advisory)`)
            else reasons.push(`${engineName} S-BULK ${failure} failed`)
        }
    }
    return {
        certified: reasons.length === 0,
        reasons,
        advisory,
        // D13: recorded load evidence, not a certification reason.
        controlledLoad: input.advisory.controlledLoad === true,
        load1: input.advisory.load1 ?? Number.NaN,
        loadReason: input.advisory.loadReason ?? '1-minute load not recorded',
        requiredEngines: [...REQUIRED_ENGINES],
        requiredRuns: REQUIRED_RUNS,
        requiredScenes: [...REQUIRED_SCENES],
        requiredVariants: REQUIRED_VARIANTS,
    }
}
