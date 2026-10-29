import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    aggregateFindings,
    aggregateSceneReport,
    realTwinProblems,
} from './aggregate.ts'
import type { RunSceneReport } from './report.ts'
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

function runReport(pass: boolean, problems: readonly string[]): RunSceneReport {
    return {
        scene: 's-test',
        run: 1,
        warmup: false,
        pass,
        costProbe: {
            participants: 1,
            movers: 1,
            engineMedian: 1,
            floorMedian: 1,
            ratio: 1,
        },
        metrics: [finding(0)],
        shape: [],
        real: {
            g: 0.005,
            gSource: 'reads',
            frames: 1,
            p95: 0.1,
            longFrames: 0,
            pass: true,
        },
        summary: {
            observations: 1,
            commits: [],
            reports: [],
            settleFrames: [],
            steadyFrameReads: 0,
            final: {
                tracks: 0,
                holds: 0,
                clockPending: 0,
                clockSize: 0,
                connected: ['p'],
                diagnostics: [],
            },
        },
        problems,
    }
}

test('H15-01: a metric-clean run with a problem fails the scene', () => {
    const clean = aggregateSceneReport({
        scene: 's-test',
        runs: [runReport(true, [])],
        findings: [[finding(0)]],
        shape: [[]],
    })
    assert.equal(clean.pass, true)
    assert.equal(clean.status, 'pass')
    const dirty = aggregateSceneReport({
        scene: 's-test',
        runs: [
            runReport(false, [
                'real twin has no connected participants at the end',
            ]),
        ],
        findings: [[finding(0)]],
        shape: [[]],
    })
    assert.equal(dirty.pass, false)
    assert.equal(dirty.status, 'fail')
    const run = dirty.metrics.find((metric) => metric.id === 'RUN')
    assert.equal(run?.pass, false)
    assert.match(run?.worst?.detail ?? '', /no connected participants/)
})

test('F11: a blocked deciding metric makes the scene blocked, not pass', () => {
    const blocked: MetricFinding = {
        ...finding(0, false),
        id: 'G12',
        label: 'held',
        gate: 'p95 / held <= 0.1 ms',
        blocked: true,
        deciding: true,
    }
    const report = aggregateSceneReport({
        scene: 's-test',
        runs: [runReport(true, [])],
        findings: [[blocked]],
        shape: [[]],
    })
    assert.equal(report.status, 'blocked')
    assert.equal(report.pass, false)
    assert.match(report.blockedReasons.join(';'), /G12/)
})

test('H15-03: a real twin with no connected participants fails teardown', () => {
    const real = {
        scene: 's-test',
        mode: 'real' as const,
        g: 0.005,
        gSource: 'reads' as const,
        frameCosts: [],
        commits: [],
        diagnostics: ['capture-less-flush'],
        final: { tracks: 1, holds: 1, connected: 0 },
    }
    const problems = realTwinProblems(real)
    assert.match(problems.join(';'), /connected participants/)
    assert.match(problems.join(';'), /capture-less-flush/)
    assert.match(problems.join(';'), /tracks 1/)
    assert.match(problems.join(';'), /holds 1/)
})
