/** Per-run gate aggregation: no threshold is recomputed from the median. */

import type { AggregateMetric } from './report.ts'
import type { MetricFinding } from './scoring.ts'
import { median } from './stats.ts'

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
