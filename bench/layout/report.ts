/** Report schema, aggregation labels and text output for the P5 bench. */
import type { Advisory, Fingerprint } from './fingerprint.ts'
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

export interface SceneReport {
    readonly scene: string
    readonly status: 'pass' | 'fail' | 'pending'
    readonly pending: string | null
    readonly pass: boolean
    readonly metrics: readonly AggregateMetric[]
    readonly shape: readonly AggregateMetric[]
    readonly runs: readonly RunSceneReport[]
    readonly notes: readonly string[]
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
    readonly sustainedP95: number
    readonly sustainedCommits: number
    readonly sustainedCommitHz: number
    readonly floorAuditPass: boolean
    readonly floorAuditDetail: string
    readonly exactReadsPass: boolean
    readonly exactReadsDetail: string
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
    readonly fingerprint: Fingerprint
    readonly advisory: Advisory
    readonly engines: readonly EngineReport[]
    readonly negativeControls: readonly NegativeControlResult[]
    readonly selfTests: {
        readonly pass: boolean
        readonly controls: readonly string[]
        readonly detail: string
    }
    readonly pending: readonly {
        readonly scene: string
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

export function formatReport(report: BenchReport): string {
    const lines: string[] = []
    lines.push(`P5 layout bench — ${report.generatedAt} (${report.command})`)
    lines.push(
        `fingerprint ${report.fingerprint.host} / ${report.fingerprint.os.productVersion} / ${report.fingerprint.cpu} / ${report.fingerprint.browsers.chromium} / ${report.fingerprint.browsers.webkit}`
    )
    lines.push(
        `1-minute load ${report.fingerprint.load1.toFixed(2)}; cost ${report.advisory.cost ? 'ADVISORY' : 'deciding'}${report.advisory.reasons.length > 0 ? ` (${report.advisory.reasons.join('; ')})` : ''}`
    )
    for (const engine of report.engines) {
        lines.push('')
        lines.push(
            `== ${engine.engine} ${engine.browserVersion ?? ''} [${engine.build}]${engine.launchError ? ` — ${engine.launchError}` : ''}`
        )
        for (const note of engine.notes) lines.push(`  note: ${note}`)
        for (const scene of engine.scenes) {
            lines.push(
                `${scene.status.toUpperCase()} ${scene.scene}${scene.pending ? ` (pending: ${scene.pending})` : ''}`
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
                    `  ${metric.blocked ? 'BLOCK' : metric.pass ? 'ok  ' : 'FAIL'} ${metric.id.padEnd(18)} ${formatValue(metric.median, metric.unit).padStart(12)}  ${metric.gate}${where}`
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
                    `  ${metric.blocked ? 'BLOCK' : metric.pass ? 'ok  ' : 'FAIL'} ${metric.id.padEnd(18)} ${formatValue(metric.median, metric.unit).padStart(12)}  ${metric.gate}${where}`
                )
            }
            for (const run of cost.runs) {
                lines.push(
                    `  run ${run.run}${run.warmup ? ' (warm-up)' : ''}: ratio ${run.ratioUnscrolled.toFixed(3)} unscrolled / ${run.ratioScrolled.toFixed(3)} scrolled; floor audit ${run.floorAuditPass ? 'ok' : 'FAIL'}; steady p95 ${run.steadyP95.toFixed(3)} ms; sustained p95 ${run.sustainedP95.toFixed(3)} ms; g ${run.g.toFixed(4)} ms`
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
        `self-tests ${report.selfTests.pass ? 'ok' : 'FAIL'}: ${report.selfTests.controls.length} controls`
    )
    if (report.pending.length > 0) {
        for (const pending of report.pending) {
            lines.push(`pending ${pending.scene}: ${pending.reason}`)
        }
    }
    lines.push('')
    lines.push(`invocation: ${report.pass ? 'PASS' : 'FAIL'}`)
    lines.push(
        `certification: ${report.certification.certified ? 'CERTIFIED' : 'NOT CERTIFIED'}`
    )
    for (const reason of report.certification.reasons) {
        lines.push(`  cert block: ${reason}`)
    }
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
    readonly requiredEngines: readonly string[]
    readonly requiredRuns: number
    readonly requiredScenes: readonly string[]
}
