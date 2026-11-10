/** Report schema, aggregation labels and text output for the P5 bench. */
import type { Advisory, Fingerprint } from './fingerprint.ts'
import {
    formatNativeGradeQualification,
    type QualificationDimensionInput,
    qualifyNativeGrade,
} from './qualification.ts'
import type { MetricFinding } from './scoring.ts'
import type { SceneTrace } from './types.ts'

export interface AggregateMetric {
    readonly id: string
    readonly label: string
    readonly gate: string
    readonly unit: string
    readonly median: number
    readonly pass: boolean
    readonly blocked: boolean
    readonly deciding: boolean
    readonly perRun: readonly number[]
    readonly passPerRun: readonly boolean[]
    readonly worst?:
        | (MetricFinding['worst'] & { readonly run?: number | undefined })
        | undefined
}

export interface RunSceneReport {
    readonly scene: string
    readonly run: number
    readonly warmup: boolean
    readonly pass: boolean
    readonly costProbe: {
        readonly participants: number
        readonly movers: number
        readonly engineMedian: number
        readonly floorMedian: number
        readonly ratio: number
    }
    readonly metrics: readonly MetricFinding[]
    readonly shape: readonly MetricFinding[]
    readonly real: {
        readonly g: number
        readonly gSource: 'reads' | 'tick-fallback'
        readonly frames: number
        readonly p95: number
        readonly longFrames: number
        readonly pass: boolean
        /** A 1 ms-quantized WebKit S-BULK G8 is BLOCK, not a measured pass. */
        readonly blocked?: boolean | undefined
    }
    readonly summary: {
        readonly observations: number
        readonly commits: readonly {
            readonly label: string
            readonly frame: number
            readonly rects: number
            readonly offsets: number
            readonly styles: number
            readonly frameReads: number
            readonly presenceRects?: number | undefined
            readonly presenceStyles?: number | undefined
        }[]
        readonly reports: readonly {
            readonly label: string
            readonly status: string
            readonly snapped: readonly string[]
            readonly settledFrame: number | null
        }[]
        readonly settleFrames: readonly number[]
        readonly steadyFrameReads: number
        readonly final: SceneTrace['final']
    }
    readonly problems: readonly string[]
}

export interface VariantMeta {
    readonly id: string
    readonly scene: string
    readonly kind: 'dpr' | 'reduced'
    readonly dpr: number
    readonly reducedMotion: 'jump' | 'maxDuration' | 'ignore' | null
    readonly label: string
}

export interface SceneReport {
    readonly scene: string
    readonly status: 'pass' | 'fail' | 'pending' | 'blocked'
    readonly pending: string | null
    /** A required metric could not be decided (timer/authority); not a pass. */
    readonly blockedReasons: readonly string[]
    readonly pass: boolean
    readonly metrics: readonly AggregateMetric[]
    readonly shape: readonly AggregateMetric[]
    readonly runs: readonly RunSceneReport[]
    readonly notes: readonly string[]
    readonly variant?: VariantMeta | undefined
}

export interface CostRunReport {
    readonly run: number
    readonly warmup: boolean
    readonly valid: boolean
    readonly blockedReasons: readonly string[]
    readonly engineAudit: {
        readonly rects: number
        readonly offsets: number
        readonly styleReads: number
        readonly poseWrites: number
    }
    readonly floorAudit: {
        readonly captureRects: number
        readonly captureOffsets: number
        readonly flushRects: number
        readonly flushOffsets: number
        readonly styleReads: number
        readonly poseWrites: number
        readonly extraReads: number
    }
    readonly engineAuditScrolled: {
        readonly rects: number
        readonly offsets: number
        readonly styleReads: number
        readonly poseWrites: number
    }
    readonly floorAuditScrolled: {
        readonly captureRects: number
        readonly captureOffsets: number
        readonly flushRects: number
        readonly flushOffsets: number
        readonly styleReads: number
        readonly poseWrites: number
        readonly extraReads: number
    }
    readonly ratioUnscrolled: number
    readonly ratioScrolled: number
    readonly engineMedianUnscrolled: number
    readonly floorMedianUnscrolled: number
    readonly engineMedianScrolled: number
    readonly floorMedianScrolled: number
    readonly steadyP95: number
    readonly steadySampleMode: 'frame' | 'batch20'
    readonly sustainedP95: number
    readonly sustainedFloorP95: number
    readonly sustainedRatio: number
    readonly sustainedCommits: number
    readonly sustainedCommitHz: number
    readonly sustainedSampleMode: 'commit' | 'quantized'
    readonly sustainedErrorBound: number
    readonly sustainedEngineAudit: {
        readonly rects: number
        readonly offsets: number
        readonly styleReads: number
        readonly poseWrites: number
    }
    readonly sustainedFloorAudit: {
        readonly captureRects: number
        readonly captureOffsets: number
        readonly flushRects: number
        readonly flushOffsets: number
        readonly styleReads: number
        readonly poseWrites: number
        readonly extraReads: number
    }
    readonly sustainedFloorAuditPass: boolean
    readonly floorAuditPass: boolean
    readonly floorAuditDetail: string
    readonly exactReadsPass: boolean
    readonly exactReadsDetail: string
    readonly heldBaselineP95: number
    readonly heldTenBaselineP95: number
    readonly heldOneP95: number
    readonly heldTenP95: number
    readonly heldOnePerHeld: number
    readonly heldTenPerHeld: number
    readonly heldReadsPass: boolean
    readonly heldReadsDetail: string
    readonly g: number
    readonly gSource: 'reads' | 'tick-fallback'
}

export interface CostReport {
    readonly scene: 'S-BULK'
    readonly status: 'pass' | 'fail' | 'pending' | 'blocked'
    readonly pending: string | null
    readonly pass: boolean
    readonly valid: boolean
    readonly blockedReasons: readonly string[]
    readonly metrics: readonly AggregateMetric[]
    readonly runs: readonly CostRunReport[]
    readonly notes: readonly string[]
    readonly measuredRuns?: number
}

export interface EngineReport {
    readonly engine: 'chromium' | 'webkit' | 'firefox'
    readonly advisory: boolean
    readonly browserVersion: string | null
    readonly build: string
    readonly launchError: string | null
    readonly scenes: readonly SceneReport[]
    /** H19 support variants; scored with the same gates as the primary run. */
    readonly variants: readonly SceneReport[]
    readonly cost: CostReport | null
    readonly notes: readonly string[]
}

export interface NegativeControlResult {
    readonly name: string
    readonly target: string
    readonly expected: 'fail'
    readonly observed: 'fail' | 'pass' | 'error' | 'inconclusive'
    readonly conclusive: boolean
    readonly ok: boolean
    readonly detail: string
}

export interface BenchReport {
    readonly schema: 'ani-layout-bench/v1'
    readonly generatedAt: string
    readonly command: string
    /** Exact HEAD + working-tree source identity that produced the bundle. */
    readonly sourceRevision?: string
    readonly fingerprint: Fingerprint
    readonly advisory: Advisory
    readonly engines: readonly EngineReport[]
    readonly negativeControls: readonly NegativeControlResult[]
    readonly selfTests: {
        readonly pass: boolean
        readonly controls: readonly string[]
        readonly files?: readonly string[]
        readonly detail: string
    }
    readonly pending: readonly {
        readonly scene: string
        readonly reason: string
    }[]
    /** Required rows/evidence that are BLOCK, not pass and not pending. */
    readonly blocked: readonly {
        readonly item: string
        readonly reason: string
    }[]
    readonly certification: CertificationReport
    readonly pass: boolean
}

export function stringifyReport(report: BenchReport): string {
    return `${JSON.stringify(report, null, 2)}\n`
}

export function parseReport(text: string): BenchReport {
    const parsed = JSON.parse(text) as BenchReport
    if (parsed.schema !== 'ani-layout-bench/v1') {
        throw new Error(`unknown report schema "${String(parsed.schema)}"`)
    }
    return parsed
}

function formatValue(value: number, unit: string): string {
    if (!Number.isFinite(value)) return 'n/a'
    if (unit === 'ratio') return value.toFixed(3)
    if (unit === 'opacity' || unit === 'coverage') return value.toExponential(2)
    if (unit === 'ms' || unit === 'ms/held') return `${value.toFixed(3)} ms`
    if (
        unit === 'declarations' ||
        unit === 'violations' ||
        unit === 'mismatches' ||
        unit === 'excess reads' ||
        unit === 'leftovers'
    ) {
        return String(value)
    }
    return `${value.toFixed(4)} ${unit}`
}

const SCRIPT_METRIC_ID = /^(?:G8|G9|G10|G11|G12)(?:[.-]|$)/

function benchmarkQualificationDimensions(report: BenchReport): {
    geometry: QualificationDimensionInput
    script: QualificationDimensionInput
} {
    if (report.certification.certified) {
        const passed = {
            status: 'pass',
            detail: 'existing full five-run Chromium/WebKit certification passed',
        } as const
        return {
            geometry: {
                ...passed,
                detail: `geometry/lifetime: ${passed.detail}`,
            },
            script: {
                ...passed,
                detail: `script cost: ${passed.detail}`,
            },
        }
    }

    const geometryFailures: string[] = []
    const scriptFailures: string[] = []
    const geometryBlocks: string[] = []
    const scriptBlocks: string[] = []
    const addMetric = (
        engine: EngineReport,
        scope: string,
        metric: AggregateMetric | MetricFinding
    ): void => {
        if (metric.id === 'RUN' || metric.deciding === false) return
        const script = SCRIPT_METRIC_ID.test(metric.id)
        if ('measured' in metric && metric.measured === false) {
            if (script) {
                if (engine.engine === 'chromium') {
                    scriptBlocks.push(
                        `${engine.engine} ${scope} ${metric.id} unmeasured`
                    )
                }
            } else {
                geometryBlocks.push(
                    `${engine.engine} ${scope} ${metric.id} unmeasured`
                )
            }
            return
        }
        if (metric.blocked === true) {
            if (script) {
                if (engine.engine === 'chromium') {
                    scriptBlocks.push(`${engine.engine} ${scope} ${metric.id}`)
                }
            } else {
                geometryBlocks.push(`${engine.engine} ${scope} ${metric.id}`)
            }
            return
        }
        if (metric.pass) return
        if (script) {
            // D12 keeps WebKit G8-G12 advisory; Chromium is the deciding
            // script/cost engine for a measured miss.
            if (engine.engine === 'chromium') {
                scriptFailures.push(
                    `${engine.engine} ${scope} ${metric.id} failed`
                )
            }
        } else {
            geometryFailures.push(
                `${engine.engine} ${scope} ${metric.id} failed`
            )
        }
    }
    const addScene = (engine: EngineReport, scene: SceneReport): void => {
        const scope = scene.variant?.id ?? scene.scene
        for (const metric of [...scene.metrics, ...scene.shape]) {
            addMetric(engine, scope, metric)
        }
        for (const run of scene.runs) {
            if (run.warmup) continue
            for (const metric of [...run.metrics, ...run.shape]) {
                addMetric(engine, `${scope} run ${run.run}`, metric)
            }
            if (run.problems.length > 0) {
                geometryFailures.push(
                    `${engine.engine} ${scope} run ${run.run} reported ${run.problems.length} runtime problem(s)`
                )
            }
            if (
                run.summary.final.tracks !== 0 ||
                run.summary.final.holds !== 0 ||
                run.summary.final.clockPending !== 0 ||
                run.summary.final.clockSize !== 0
            ) {
                geometryFailures.push(
                    `${engine.engine} ${scope} run ${run.run} failed lifetime cleanup`
                )
            }
            if (engine.engine === 'chromium') {
                if (run.real.blocked === true) {
                    scriptBlocks.push(
                        `${engine.engine} ${scope} run ${run.run} G8`
                    )
                } else if (!run.real.pass) {
                    scriptFailures.push(
                        `${engine.engine} ${scope} run ${run.run} G8 failed`
                    )
                }
            }
        }
        if (scene.status === 'blocked' || scene.status === 'pending') {
            geometryBlocks.push(`${engine.engine} ${scope} ${scene.status}`)
            if (engine.engine === 'chromium') {
                scriptBlocks.push(`${engine.engine} ${scope} ${scene.status}`)
            }
        }
    }

    for (const engine of report.engines) {
        if (engine.launchError !== null) {
            geometryBlocks.push(`${engine.engine} launch unavailable`)
            if (engine.engine === 'chromium') {
                scriptBlocks.push(`${engine.engine} launch unavailable`)
            }
        }
        for (const scene of engine.scenes) addScene(engine, scene)
        for (const variant of engine.variants) addScene(engine, variant)
        if (engine.engine !== 'chromium' || engine.cost === null) continue
        for (const metric of engine.cost.metrics) {
            addMetric(engine, 'S-BULK cost', metric)
        }
        if (engine.cost.status === 'fail' && engine.cost.valid) {
            if (
                !engine.cost.metrics.some(
                    (metric) =>
                        metric.deciding &&
                        !metric.blocked &&
                        !metric.pass &&
                        SCRIPT_METRIC_ID.test(metric.id)
                )
            ) {
                scriptBlocks.push(
                    'chromium S-BULK cost failed without a classified deciding G8-G12 metric'
                )
            }
        } else if (
            engine.cost.status === 'blocked' ||
            engine.cost.status === 'pending' ||
            !engine.cost.valid
        ) {
            scriptBlocks.push(`chromium S-BULK cost ${engine.cost.status}`)
        }
    }

    const incomplete =
        report.certification.reasons.length > 0
            ? report.certification.reasons.join('; ')
            : 'full five-run Chromium/WebKit certification has not been established by this report'
    const geometry: QualificationDimensionInput =
        geometryFailures.length > 0
            ? {
                  status: 'fail',
                  detail: `geometry/lifetime measured failure: ${geometryFailures.join('; ')}`,
              }
            : {
                  status: 'block',
                  detail: `geometry/lifetime evidence incomplete: ${[
                      ...geometryBlocks,
                      incomplete,
                  ].join('; ')}`,
              }
    const script: QualificationDimensionInput =
        scriptFailures.length > 0
            ? {
                  status: 'fail',
                  detail: `script cost measured failure: ${scriptFailures.join('; ')}`,
              }
            : {
                  status: 'block',
                  detail: `script cost evidence incomplete: ${[
                      ...scriptBlocks,
                      incomplete,
                  ].join('; ')}`,
              }
    return { geometry, script }
}

export function formatReport(report: BenchReport): string {
    const lines: string[] = []
    lines.push(`P5 layout bench — ${report.generatedAt} (${report.command})`)
    lines.push(`source identity: ${report.sourceRevision ?? 'unavailable'}`)
    lines.push(
        `fingerprint ${report.fingerprint.host} / ${report.fingerprint.os.productVersion} / ${report.fingerprint.cpu} / ${report.fingerprint.browsers.chromium} / ${report.fingerprint.browsers.webkit}`
    )
    const load = Number.isFinite(report.fingerprint.load1)
        ? report.fingerprint.load1.toFixed(2)
        : 'unavailable'
    lines.push(
        `1-minute load ${load}: ${report.advisory.loadReason ?? 'not recorded'}`
    )
    lines.push(
        `controlled load: ${report.advisory.controlledLoad ? 'YES (D13; cost gates remain deciding)' : 'no'}`
    )
    lines.push(
        `cost gates: ${report.advisory.cost ? 'ADVISORY' : 'deciding'}${report.advisory.reasons.length > 0 ? ` (${report.advisory.reasons.join('; ')})` : ''}`
    )
    for (const engine of report.engines) {
        lines.push('')
        lines.push(
            `== ${engine.engine} ${engine.browserVersion ?? ''} [${engine.build}]${engine.launchError ? ` — ${engine.launchError}` : ''}`
        )
        for (const note of engine.notes) lines.push(`  note: ${note}`)
        for (const scene of engine.scenes) {
            lines.push(
                `${scene.status.toUpperCase()} ${scene.scene}${scene.pending ? ` (pending: ${scene.pending})` : ''}${scene.blockedReasons.length > 0 ? ` (BLOCK: ${scene.blockedReasons.join('; ')})` : ''}`
            )
            for (const metric of [...scene.metrics, ...scene.shape]) {
                const worst = metric.worst
                const where =
                    worst === undefined
                        ? ''
                        : ` worst ${[
                              worst.run === undefined ? '' : `run ${worst.run}`,
                              worst.frame === undefined
                                  ? ''
                                  : `frame ${worst.frame}`,
                              worst.participant ?? '',
                              worst.edge === undefined
                                  ? ''
                                  : `edge ${worst.edge}`,
                              worst.label ?? '',
                              worst.detail ?? '',
                          ]
                              .filter(Boolean)
                              .join(' ')}`
                lines.push(
                    `  ${metric.blocked ? 'BLOCK' : metric.deciding ? (metric.pass ? 'ok  ' : 'FAIL') : 'n/a  '} ${metric.id.padEnd(18)} ${formatValue(metric.median, metric.unit).padStart(12)}  ${metric.gate}${where}`
                )
            }
        }
        for (const variant of engine.variants) {
            const meta = variant.variant!
            lines.push(
                `${variant.status.toUpperCase()} ${variant.scene} [${meta.label}]${variant.blockedReasons.length > 0 ? ` (BLOCK: ${variant.blockedReasons.join('; ')})` : ''}`
            )
            for (const metric of [...variant.metrics, ...variant.shape]) {
                const worst = metric.worst
                const where =
                    worst === undefined
                        ? ''
                        : ` worst ${[
                              worst.run === undefined ? '' : `run ${worst.run}`,
                              worst.frame === undefined
                                  ? ''
                                  : `frame ${worst.frame}`,
                              worst.participant ?? '',
                              worst.edge === undefined
                                  ? ''
                                  : `edge ${worst.edge}`,
                              worst.label ?? '',
                              worst.detail ?? '',
                          ]
                              .filter(Boolean)
                              .join(' ')}`
                lines.push(
                    `  ${metric.blocked ? 'BLOCK' : metric.deciding ? (metric.pass ? 'ok  ' : 'FAIL') : 'n/a  '} ${metric.id.padEnd(18)} ${formatValue(metric.median, metric.unit).padStart(12)}  ${metric.gate}${where}`
                )
            }
        }
        if (engine.cost) {
            const cost = engine.cost
            lines.push(
                `${cost.status.toUpperCase()} S-BULK cost shapes${cost.pending ? ` (pending: ${cost.pending})` : ''}`
            )
            for (const metric of cost.metrics) {
                const where =
                    metric.worst?.detail === undefined
                        ? ''
                        : ` worst ${metric.worst.detail}`
                lines.push(
                    `  ${metric.blocked ? 'BLOCK' : metric.deciding ? (metric.pass ? 'ok  ' : 'FAIL') : 'n/a  '} ${metric.id.padEnd(18)} ${formatValue(metric.median, metric.unit).padStart(12)}  ${metric.gate}${where}`
                )
            }
            for (const run of cost.runs) {
                if (run.sustainedSampleMode === 'quantized') {
                    lines.push(
                        `  run ${run.run}${run.warmup ? ' (warm-up)' : ''}: BLOCK (quantized timer; G9/G11 samples non-deciding); floor audit ${run.floorAuditPass ? 'ok' : 'FAIL'}; steady p95 ${run.steadyP95.toFixed(3)} ms${run.steadySampleMode === 'batch20' ? ' (20-frame real-clock batch)' : ''}; g ${run.g.toFixed(4)} ms`
                    )
                    continue
                }
                lines.push(
                    `  run ${run.run}${run.warmup ? ' (warm-up)' : ''}: ratio ${run.ratioUnscrolled.toFixed(3)} unscrolled / ${run.ratioScrolled.toFixed(3)} scrolled; floor audit ${run.floorAuditPass ? 'ok' : 'FAIL'}; steady p95 ${run.steadyP95.toFixed(3)} ms${run.steadySampleMode === 'batch20' ? ' (20-frame real-clock batch)' : ''}; sustained p95 ${run.sustainedP95.toFixed(3)} ms / floor p95 ${run.sustainedFloorP95.toFixed(3)} ms = ${run.sustainedRatio.toFixed(3)}× (${run.sustainedSampleMode}); held 1 ${run.heldOneP95.toFixed(3)}-${run.heldBaselineP95.toFixed(3)}=${run.heldOnePerHeld.toFixed(4)} ms/held; 10 ${run.heldTenP95.toFixed(3)}-${run.heldTenBaselineP95.toFixed(3)}=${run.heldTenPerHeld.toFixed(4)} ms/held; held reads ${run.heldReadsPass ? 'ok' : 'FAIL'}; g ${run.g.toFixed(4)} ms`
                )
            }
        }
    }
    lines.push('')
    lines.push('negative controls (expected to fail their target gate)')
    for (const control of report.negativeControls) {
        lines.push(
            `  ${control.ok ? 'ok  ' : 'FAIL'} ${control.name} -> ${control.target}: ${control.observed}${control.conclusive ? '' : ' (inconclusive)'} (${control.detail})`
        )
    }
    lines.push(
        `self-tests ${report.selfTests.pass ? 'ok' : 'FAIL'}: ${report.selfTests.controls.length} controls across ${report.selfTests.files?.length ?? '?'} files`
    )
    if (report.pending.length > 0) {
        for (const pending of report.pending) {
            lines.push(`pending ${pending.scene}: ${pending.reason}`)
        }
    }
    if (report.blocked.length > 0) {
        lines.push('blocked (required evidence that is not deciding/pass)')
        for (const entry of report.blocked) {
            lines.push(`  BLOCK ${entry.item}: ${entry.reason}`)
        }
    }
    lines.push('')
    lines.push(`invocation: ${report.pass ? 'PASS' : 'FAIL'}`)
    lines.push(
        `engine benchmark certification: ${report.certification.certified ? 'CERTIFIED' : 'NOT CERTIFIED'} (geometry/script only; not native-device certification)`
    )
    for (const reason of report.certification.reasons) {
        lines.push(`  cert block: ${reason}`)
    }
    lines.push(
        `  cert controlled load: ${report.certification.controlledLoad ? 'YES' : 'no'}${report.certification.controlledLoad ? ` — ${report.certification.loadReason ?? 'not recorded'}` : ''}`
    )
    for (const reason of report.certification.advisory) {
        lines.push(`  cert advisory: ${reason}`)
    }
    const benchmark = benchmarkQualificationDimensions(report)
    const nativeGrade = qualifyNativeGrade({
        build: {
            revision: report.sourceRevision ?? null,
            artifact: 'bench/layout source bundle',
            mode: 'development',
        },
        geometry: benchmark.geometry,
        script: benchmark.script,
        browserProxy: null,
        physicalDevice: null,
        content: {
            status: 'block',
            detail: 'product content/accessibility evidence is outside this benchmark report and must come from bounded browser/showcase observations',
        },
    })
    lines.push('')
    lines.push(formatNativeGradeQualification(nativeGrade))
    return lines.join('\n')
}

export function compareReports(
    current: BenchReport,
    previous: BenchReport
): string[] {
    const lines: string[] = []
    for (const engine of current.engines) {
        const before = previous.engines.find(
            (candidate) => candidate.engine === engine.engine
        )
        if (!before) {
            lines.push(
                `${engine.engine}: new engine (missing in previous report)`
            )
            continue
        }
        for (const scene of engine.scenes) {
            const oldScene = before.scenes.find(
                (candidate) => candidate.scene === scene.scene
            )
            if (!oldScene) {
                lines.push(`${engine.engine} ${scene.scene}: new scene`)
                continue
            }
            for (const metric of [...scene.metrics, ...scene.shape]) {
                const oldMetric = [...oldScene.metrics, ...oldScene.shape].find(
                    (candidate) => candidate.id === metric.id
                )
                if (!oldMetric) {
                    lines.push(
                        `${engine.engine} ${scene.scene} ${metric.id}: new metric`
                    )
                    continue
                }
                const delta = metric.median - oldMetric.median
                lines.push(
                    `${engine.engine} ${scene.scene} ${metric.id}: ${oldMetric.median} -> ${metric.median} (${delta >= 0 ? '+' : ''}${delta})`
                )
            }
            for (const oldMetric of [...oldScene.metrics, ...oldScene.shape]) {
                if (
                    ![...scene.metrics, ...scene.shape].some(
                        (metric) => metric.id === oldMetric.id
                    )
                ) {
                    lines.push(
                        `${engine.engine} ${scene.scene} ${oldMetric.id}: missing in current report`
                    )
                }
            }
        }
        for (const oldScene of before.scenes) {
            if (
                !engine.scenes.some((scene) => scene.scene === oldScene.scene)
            ) {
                lines.push(
                    `${engine.engine} ${oldScene.scene}: missing in current report`
                )
            }
        }
        for (const variant of engine.variants) {
            const oldVariant = (before.variants ?? []).find(
                (candidate) => candidate.scene === variant.scene
            )
            if (!oldVariant) {
                lines.push(`${engine.engine} ${variant.scene}: new variant`)
                continue
            }
            for (const metric of [...variant.metrics, ...variant.shape]) {
                const oldMetric = [
                    ...oldVariant.metrics,
                    ...oldVariant.shape,
                ].find((candidate) => candidate.id === metric.id)
                if (!oldMetric) continue
                const delta = metric.median - oldMetric.median
                lines.push(
                    `${engine.engine} ${variant.scene} ${metric.id}: ${oldMetric.median} -> ${metric.median} (${delta >= 0 ? '+' : ''}${delta})`
                )
            }
        }
        if (engine.cost && before.cost) {
            for (const metric of engine.cost.metrics) {
                const oldMetric = before.cost.metrics.find(
                    (candidate) => candidate.id === metric.id
                )
                if (!oldMetric) {
                    lines.push(
                        `${engine.engine} S-BULK ${metric.id}: new metric`
                    )
                    continue
                }
                const delta = metric.median - oldMetric.median
                lines.push(
                    `${engine.engine} S-BULK ${metric.id}: ${oldMetric.median} -> ${metric.median} (${delta >= 0 ? '+' : ''}${delta})`
                )
            }
            for (const oldMetric of before.cost.metrics) {
                if (
                    !engine.cost.metrics.some(
                        (metric) => metric.id === oldMetric.id
                    )
                ) {
                    lines.push(
                        `${engine.engine} S-BULK ${oldMetric.id}: missing in current report`
                    )
                }
            }
        } else if (engine.cost || before.cost) {
            lines.push(
                `${engine.engine} S-BULK: missing in ${engine.cost ? 'previous' : 'current'} report`
            )
        }
    }
    return lines
}

export interface CertificationReport {
    readonly certified: boolean
    readonly reasons: readonly string[]
    /** WebKit cost BLOCK/advisory rows (D12); they do not block P5. */
    readonly advisory: readonly string[]
    /** D13: recorded load above the retired D9 pin; never a certification reason. */
    readonly controlledLoad: boolean
    readonly load1: number
    readonly loadReason: string
    readonly requiredEngines: readonly string[]
    readonly requiredRuns: number
    readonly requiredScenes: readonly string[]
    /** H19 DPR and reduced-motion support variants. */
    readonly requiredVariants: readonly string[]
}
