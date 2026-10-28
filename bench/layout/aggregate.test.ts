import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aggregateFindings } from './aggregate.ts'
import type { MetricFinding } from './scoring.ts'

const finding = (value: number, pass = value <= 1): MetricFinding => ({
    id: 'G1',
    label: 'oracle',
    gate: '<= 1',
    unit: 'px',
    value,
    pass,
})

test('aggregation uses per-run gate outcomes, not a recomputed median', () => {
    const metrics = aggregateFindings(
        [
            [finding(0.1)],
            [finding(2, false)],
            [finding(0.1)],
            [finding(0.1)],
            [finding(0.1)],
        ],
        [1, 2, 3, 4, 5]
    )
    assert.equal(metrics[0]!.pass, true)
    assert.equal(metrics[0]!.median, 0.1)
    assert.deepEqual(metrics[0]!.passPerRun, [true, false, true, true, true])
    const failing = aggregateFindings(
        [
            [finding(2, false)],
            [finding(2, false)],
            [finding(2, false)],
            [finding(0.1)],
            [finding(0.1)],
        ],
        [1, 2, 3, 4, 5]
    )
    assert.equal(failing[0]!.pass, false)
})

test('missing and non-finite runs fail', () => {
    assert.equal(aggregateFindings([[finding(0.1)]], [1]).length, 1)
    const missing = aggregateFindings([[finding(0.1)], []], [1, 2])
    assert.equal(missing[0]!.pass, false)
    const nan = aggregateFindings([[finding(Number.NaN)]], [1])
    assert.equal(nan[0]!.pass, false)
})
