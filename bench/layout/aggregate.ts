/** Per-run gate aggregation: no threshold is recomputed from the median. */

import type { AggregateMetric, RunSceneReport, SceneReport } from './report.ts'
import type { MetricFinding } from './scoring.ts'
import { median } from './stats.ts'
import type { RealTrace } from './types.ts'

/**
 * A metric uses the per-run findings' own gate decisions. The five-run gate is
 * the median outcome (at least three of five measured runs); the value is still
 * reported as the median per-run statistic. Missing or non-finite runs fail the
 * aggregate. No threshold is recomputed from the median.
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
        let deciding = false
        findings.forEach((run, index) => {
            const finding = run.find((candidate) => candidate.id === id)
            if (!finding) {
                missing = true
                perRun.push(Number.NaN)
                passPerRun.push(false)
                return
            }
            const runDeciding = finding.deciding !== false
            if (runDeciding) deciding = true
            label = finding.label
            gate = finding.gate
            unit = finding.unit
            perRun.push(finding.value)
            passPerRun.push(runDeciding ? finding.pass : true)
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
        return {
            id,
            label,
            gate,
            unit,
            median:
                nonFinite || finite.length === 0 ? Number.NaN : median(finite),
            blocked:
                nonFinite ||
                findings
                    .flatMap(
                        (run) =>
                            run.find((candidate) => candidate.id === id) ?? []
                    )
                    .some((finding) => finding.blocked === true),
            deciding,
            // The authority's five-run gate is the median per-run statistic.
            // Using the per-run gate outcomes (not a recomputed threshold)
            // means at least three of five measured runs must pass; a missing
            // or non-finite run still fails the aggregate.
            pass:
                !missing &&
                !nonFinite &&
                perRun.length === runNumbers.length &&
                passPerRun.length > 0 &&
                passPerRun.filter(Boolean).length >=
                    Math.ceil(runNumbers.length / 2),
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
                          .filter(
                              (metric) =>
                                  !metric.pass && metric.deciding !== false
                          )
                          .map(
                              (metric) =>
                                  `${metric.id} ${metric.value}${metric.worst?.participant ? ` (${metric.worst.participant}${metric.worst.frame === undefined ? '' : ` frame ${metric.worst.frame}`})` : ''}`
                          ),
                      ...failing.problems,
                      failing.real.pass
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
    const pass =
        pending === null &&
        runMetric.pass &&
        allMetrics
            .filter((metric) => metric.deciding)
            .every((metric) => metric.pass) &&
        shapeMetrics.every((metric) => metric.pass)
    return {
        scene: args.scene,
        status: pending === null ? (pass ? 'pass' : 'fail') : 'pending',
        pending,
        pass,
        metrics: allMetrics,
        shape: shapeMetrics,
        runs: args.runs,
        notes: args.notes ?? [],
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
