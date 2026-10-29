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

test('N2: one finite and four null non-deciding probe runs are NaN/BLOCK', () => {
    const probe = (value: number): MetricFinding => ({
        id: 'G9.probe',
        label: 'probe',
        gate: 'non-deciding',
        unit: 'ratio',
        value,
        pass: true,
        measured: Number.isFinite(value),
        deciding: false,
    })
    const metrics = aggregateFindings(
        [
            [probe(Number.NaN)],
            [probe(Number.NaN)],
            [probe(1)],
            [probe(Number.NaN)],
            [probe(Number.NaN)],
        ],
        [1, 2, 3, 4, 5]
    )
    assert.ok(Number.isNaN(metrics[0]!.median))
    assert.equal(metrics[0]!.pass, false)
    assert.equal(metrics[0]!.blocked, true)
    assert.equal(metrics[0]!.deciding, false)
    assert.deepEqual(metrics[0]!.perRun, [
        Number.NaN,
        Number.NaN,
        1,
        Number.NaN,
        Number.NaN,
    ])
})

test('N2: a deciding metric with any non-finite run fails and is NaN', () => {
    const metrics = aggregateFindings(
        [[finding(0.1)], [finding(Number.NaN)], [finding(0.1)]],
        [1, 2, 3]
    )
    assert.ok(Number.isNaN(metrics[0]!.median))
    assert.equal(metrics[0]!.pass, false)
    assert.equal(metrics[0]!.blocked, true)
})

test('S2-3: a median-aggregated ratio passes on the literal five-run median, not a majority', () => {
    const ratio = (value: number, pass = value <= 2): MetricFinding => ({
        id: 'G11',
        label: 'sustained',
        gate: 'median of 5 per-run ratios <= 2',
        unit: 'ratio',
        value,
        pass,
        aggregate: 'median',
        aggregateLimit: 2,
    })
    const metrics = aggregateFindings(
        [
            [ratio(3, false)],
            [ratio(3, false)],
            [ratio(1.9)],
            [ratio(1.9)],
            [ratio(1.9)],
        ],
        [1, 2, 3, 4, 5]
    )
    assert.equal(metrics[0]!.median, 1.9)
    assert.equal(metrics[0]!.pass, true)
    assert.deepEqual(metrics[0]!.passPerRun, [false, false, true, true, true])
})

test('S2-3: a blocked run fails a median-aggregated ratio even when its value passes', () => {
    const ratio = (value: number, blocked: boolean): MetricFinding => ({
        id: 'G11',
        label: 'sustained',
        gate: 'median of 5 per-run ratios <= 2',
        unit: 'ratio',
        value: blocked ? Number.NaN : value,
        pass: !blocked && value <= 2,
        blocked,
        deciding: !blocked,
        aggregate: 'median',
        aggregateLimit: 2,
    })
    const metrics = aggregateFindings(
        [
            [ratio(0.5, false)],
            [ratio(0.5, false)],
            [ratio(0.5, false)],
            [ratio(0.5, false)],
            [ratio(1.5, true)],
        ],
        [1, 2, 3, 4, 5]
    )
    assert.equal(metrics[0]!.pass, false)
    assert.equal(metrics[0]!.blocked, true)
    assert.ok(Number.isNaN(metrics[0]!.median))
    assert.deepEqual(metrics[0]!.passPerRun, [true, true, true, true, false])
})

test('a finite non-deciding probe stays reporting-only and does not fail a scene', () => {
    const probe = (value: number): MetricFinding => ({
        id: 'G9.probe',
        label: 'probe',
        gate: 'non-deciding',
        unit: 'ratio',
        value,
        pass: true,
        measured: true,
        deciding: false,
    })
    const metrics = aggregateFindings(
        [[probe(1.2)], [probe(1.3)], [probe(1.1)], [probe(1.2)], [probe(1.2)]],
        [1, 2, 3, 4, 5]
    )
    assert.equal(metrics[0]!.deciding, false)
    assert.equal(metrics[0]!.pass, true)
    assert.equal(metrics[0]!.blocked, false)
})
