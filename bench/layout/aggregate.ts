/** Per-run gate aggregation: no threshold is recomputed from the median. */

import type { AggregateMetric } from './report.ts'
import type { MetricFinding } from './scoring.ts'
import { median } from './stats.ts'

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
        findings.forEach((run, index) => {
            const finding = run.find((candidate) => candidate.id === id)
            if (!finding) {
                missing = true
                perRun.push(Number.NaN)
                passPerRun.push(false)
                return
            }
            const deciding = finding.deciding !== false
            label = finding.label
            gate = finding.gate
            unit = finding.unit
            perRun.push(finding.value)
            passPerRun.push(deciding ? finding.pass : true)
            if (deciding && !Number.isFinite(finding.value)) missing = true
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
            median: finite.length === 0 ? Number.NaN : median(finite),
            blocked: findings
                .flatMap(
                    (run) => run.find((candidate) => candidate.id === id) ?? []
                )
                .some((finding) => finding.blocked === true),
            // The authority's five-run gate is the median per-run statistic.
            // Using the per-run gate outcomes (not a recomputed threshold)
            // means at least three of five measured runs must pass; a missing
            // or non-finite run still fails the aggregate.
            pass:
                !missing &&
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
