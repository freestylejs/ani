/** Per-run gate aggregation: no threshold is recomputed from the median. */

import type { AggregateMetric, RunSceneReport, SceneReport } from './report.ts'
import type { MetricFinding } from './scoring.ts'
import { median } from './stats.ts'
import type { RealTrace } from './types.ts'

/**
 * A metric uses the per-run findings' own gate decisions. The five-run gate is
 * the median outcome (at least three of five measured runs); the value is still
 * reported as the median per-run statistic. Missing or non-finite runs fail the
 * aggregate. A blocked run fails the aggregate; it is never counted as a pass.
 * A metric that sets `aggregate: 'median'` instead uses the literal median of
 * its per-run values against `aggregateLimit` (D10's ratio gate), with the same
 * blocked/missing/non-finite failures. No threshold is recomputed from a
 * majority.
 */
export function aggregateFindings(
    findings: readonly (readonly MetricFinding[])[],
    runNumbers: readonly number[]
): AggregateMetric[] {
    const ids: string[] = []
    for (const run of findings) {
        for (const finding of run) {
            if (!ids.includes(finding.id)) ids.push(finding.id)
        }
    }
    return ids.map((id) => {
        const perRun: number[] = []
        const passPerRun: boolean[] = []
        let worst: AggregateMetric['worst']
        let worstValue = Number.NEGATIVE_INFINITY
        let label = id
        let gate = ''
        let unit = ''
        let missing = false
        let nonFinite = false
        let blocked = false
        let deciding = false
        let aggregate: MetricFinding['aggregate']
        let aggregateLimit: number | undefined
        findings.forEach((run, index) => {
            const finding = run.find((candidate) => candidate.id === id)
            if (!finding) {
                missing = true
                perRun.push(Number.NaN)
                passPerRun.push(false)
                return
            }
            const runDeciding =
                finding.deciding !== false && finding.blocked !== true
            if (runDeciding) deciding = true
            if (finding.blocked === true) blocked = true
            aggregate ??= finding.aggregate
            aggregateLimit ??= finding.aggregateLimit
            label = finding.label
            gate = finding.gate
            unit = finding.unit
            perRun.push(finding.value)
            passPerRun.push(runDeciding && finding.pass)
            if (!Number.isFinite(finding.value)) nonFinite = true
            if (runDeciding && !Number.isFinite(finding.value)) missing = true
            if (finding.value > worstValue) {
                worstValue = finding.value
                worst = {
                    ...finding.worst,
                    run: runNumbers[index] ?? index,
                }
            }
        })
        const finite = perRun.filter((value) => Number.isFinite(value))
        const value =
            blocked || nonFinite || finite.length === 0
                ? Number.NaN
                : median(finite)
        const majority =
            !missing &&
            !nonFinite &&
            perRun.length === runNumbers.length &&
            passPerRun.length > 0 &&
            passPerRun.filter(Boolean).length >=
                Math.ceil(runNumbers.length / 2)
        const medianPass =
            aggregate === 'median' &&
            aggregateLimit !== undefined &&
            Number.isFinite(value) &&
            value <= aggregateLimit
        const reportingOnlyPass =
            !deciding &&
            !blocked &&
            !missing &&
            !nonFinite &&
            perRun.length === runNumbers.length &&
            findings.every((run) => {
                const finding = run.find((candidate) => candidate.id === id)
                return (
                    finding !== undefined &&
                    finding.deciding === false &&
                    finding.blocked !== true &&
                    finding.pass &&
                    Number.isFinite(finding.value)
                )
            })
        return {
            id,
            label,
            gate,
            unit,
            median: value,
            blocked: blocked || nonFinite,
            deciding,
            // An unmeasured, non-finite or blocked metric cannot pass, even if
            // its other runs would form a majority. D10 ratio metrics use the
            // literal median of the five per-run values. A reporting-only
            // metric (every run explicitly non-deciding) passes only when every
            // run is finite and reports pass.
            pass:
                !missing &&
                !nonFinite &&
                !blocked &&
                perRun.length === runNumbers.length &&
                (reportingOnlyPass ||
                    (aggregate === 'median' ? medianPass : majority)),
            perRun,
            passPerRun,
            worst,
        }
    })
}

/**
 * The scene aggregate. Individual metrics use their five-run decision, but a
 * whole-run failure (problems, the real twin, teardown, G8) fails the scene:
 * the report must never show a false pass for a run that was not clean.
 */
export function aggregateSceneReport(args: {
    readonly scene: string
    readonly runs: readonly RunSceneReport[]
    readonly findings: readonly (readonly MetricFinding[])[]
    readonly shape: readonly (readonly MetricFinding[])[]
    readonly pending?: string | null
    readonly notes?: readonly string[]
    readonly variant?: SceneReport['variant'] | undefined
}): SceneReport {
    const measuredRuns = args.runs.filter((run) => !run.warmup)
    const measuredFindings = args.findings.filter(
        (_, index) => !args.runs[index]?.warmup
    )
    const measuredShape = args.shape.filter(
        (_, index) => !args.runs[index]?.warmup
    )
    const metrics = aggregateFindings(
        measuredFindings,
        measuredRuns.map((run) => run.run)
    )
    const shapeMetrics = aggregateFindings(
        measuredShape,
        measuredRuns.map((run) => run.run)
    )
    const failing = measuredRuns.find((run) => !run.pass)
    const runMetric: AggregateMetric = {
        id: 'RUN',
        label: 'Whole run: metrics, G8, problems, real twin and teardown',
        gate: 'every measured run passes',
        unit: 'failed runs',
        median: measuredRuns.filter((run) => !run.pass).length,
        pass: failing === undefined,
        blocked: false,
        deciding: true,
        perRun: measuredRuns.map((run) => (run.pass ? 0 : 1)),
        passPerRun: measuredRuns.map((run) => run.pass),
        worst: {
            run: failing?.run,
            detail: failing
                ? [
                      ...failing.metrics
                          .filter((metric) => metric.blocked === true)
                          .map((metric) => `BLOCK ${metric.id}`),
                      ...failing.metrics
                          .filter(
                              (metric) =>
                                  !metric.pass &&
                                  metric.blocked !== true &&
                                  metric.deciding !== false
                          )
                          .map(
                              (metric) =>
                                  `${metric.id} ${metric.value}${metric.worst?.participant ? ` (${metric.worst.participant}${metric.worst.frame === undefined ? '' : ` frame ${metric.worst.frame}`})` : ''}`
                          ),
                      ...failing.problems,
                      failing.real.blocked
                          ? `BLOCK G8 p95 ${failing.real.p95} ms (1 ms-quantized WebKit; 20-frame mean not claimed)`
                          : failing.real.pass
                            ? ''
                            : `G8 p95 ${failing.real.p95} ms, ${failing.real.longFrames} long frames`,
                      `manual final tracks ${failing.summary.final.tracks}, holds ${failing.summary.final.holds}, clock pending ${failing.summary.final.clockPending}, clock size ${failing.summary.final.clockSize}`,
                  ]
                      .filter(Boolean)
                      .join('; ')
                : 'all measured runs pass',
        },
    }
    const allMetrics = [runMetric, ...metrics]
    const pending = args.pending ?? null
    const blockedReasons = [...allMetrics, ...shapeMetrics]
        .filter(
            (metric) =>
                metric.blocked === true &&
                // A non-deciding probe is not a required row; G12 is a
                // required timer-limited shape even when it is non-deciding.
                (metric.deciding !== false || metric.id.startsWith('G12'))
        )
        .map(
            (metric) =>
                `${metric.id} (${metric.gate})${metric.worst?.detail ? `: ${metric.worst.detail}` : ''}`
        )
    const blocked = blockedReasons.length > 0
    const metricFail =
        allMetrics.some(
            (metric) => metric.deciding && !metric.blocked && !metric.pass
        ) ||
        shapeMetrics.some(
            (metric) => metric.deciding && !metric.blocked && !metric.pass
        )
    const failed = !runMetric.pass || metricFail
    const pass = pending === null && !failed && !blocked
    return {
        scene: args.scene,
        status:
            pending === null
                ? failed
                    ? 'fail'
                    : blocked
                      ? 'blocked'
                      : 'pass'
                : 'pending',
        pending,
        blockedReasons,
        pass,
        metrics: allMetrics,
        shape: shapeMetrics,
        runs: args.runs,
        notes: args.notes ?? [],
        ...(args.variant === undefined ? {} : { variant: args.variant }),
    }
}

/** Every real-twin problem that must fail the run (diagnostics, teardown). */
export function realTwinProblems(real: RealTrace): string[] {
    const problems: string[] = []
    for (const code of real.diagnostics)
        problems.push(`real twin diagnostic: ${code}`)
    if (real.final.tracks !== 0)
        problems.push(`real twin final tracks ${real.final.tracks}`)
    if (real.final.holds !== 0)
        problems.push(`real twin final holds ${real.final.holds}`)
    if (real.final.connected <= 0 && real.allowEmptyFinal !== true)
        problems.push('real twin has no connected participants at the end')
    return problems
}
