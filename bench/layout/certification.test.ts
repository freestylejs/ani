import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    classifyWebkitCostOnly,
    evaluateCertification,
    evaluateInvocation,
} from './certification.ts'
import type { AggregateMetric, RunSceneReport, SceneReport } from './report.ts'
import type { MetricFinding } from './scoring.ts'

const variantKeys = [
    ...['s-card', 's-photo', 's-acc', 's-seg'].flatMap((scene) =>
        ['dpr1', 'dpr3'].map((id) => `${scene}@${id}`)
    ),
    ...['s-card', 's-photo', 's-acc', 's-reorder', 's-sheet'].flatMap((scene) =>
        ['rm-jump', 'rm-max', 'rm-ignore'].map((id) => `${scene}@${id}`)
    ),
]

const cleanEngine = (engine: string) => ({
    engine,
    launchError: null,
    scenes: [
        { scene: 's-card', status: 'pass' as const },
        { scene: 's-seg', status: 'pass' as const },
        { scene: 's-photo', status: 'pass' as const },
        { scene: 's-stack', status: 'pass' as const },
        { scene: 's-island', status: 'pass' as const },
        { scene: 's-acc', status: 'pass' as const },
        { scene: 's-insert', status: 'pass' as const },
        { scene: 's-delete', status: 'pass' as const },
        { scene: 's-reorder', status: 'pass' as const },
        { scene: 's-sheet', status: 'pass' as const },
        { scene: 's-bulk', status: 'pass' as const },
    ],
    variants: variantKeys.map((scene) => ({
        scene,
        status: 'pass' as const,
    })),
    cost: { status: 'pass' as const, valid: true },
})

const clean = {
    engines: [cleanEngine('chromium'), cleanEngine('webkit')],
    pending: [],
    advisory: { cost: false },
    controlsPass: true,
    selfTestPass: true,
}
const full = {
    engines: ['chromium', 'webkit'],
    scenes: [
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
    ],
    runs: 5,
}

const metric = (
    id: string,
    overrides: Partial<MetricFinding> = {}
): MetricFinding => ({
    id,
    label: id,
    gate: 'gate',
    unit: 'ms',
    value: 1,
    pass: true,
    deciding: true,
    blocked: false,
    ...overrides,
})

const aggregateMetric = (
    id: string,
    overrides: Partial<AggregateMetric> = {}
): AggregateMetric => ({
    id,
    label: id,
    gate: 'gate',
    unit: 'ms',
    median: 1,
    pass: true,
    blocked: false,
    deciding: true,
    perRun: [1],
    passPerRun: [true],
    ...overrides,
})

const runReport = (
    overrides: Partial<RunSceneReport> = {}
): RunSceneReport => ({
    scene: 's-reorder',
    run: 0,
    warmup: false,
    pass: true,
    costProbe: {
        participants: 0,
        movers: 0,
        engineMedian: 0,
        floorMedian: 0,
        ratio: 0,
    },
    metrics: [],
    shape: [],
    real: {
        g: 1,
        gSource: 'reads',
        frames: 1,
        p95: 0.5,
        longFrames: 0,
        pass: true,
    },
    summary: {
        observations: 0,
        commits: [],
        reports: [],
        settleFrames: [],
        steadyFrameReads: 0,
        final: {
            tracks: 0,
            holds: 0,
            clockPending: 0,
            clockSize: 0,
            connected: [],
            diagnostics: [],
        },
    },
    problems: [],
    ...overrides,
})

const sceneReport = (overrides: Partial<SceneReport> = {}): SceneReport => ({
    scene: 's-reorder',
    status: 'pass',
    pending: null,
    blockedReasons: [],
    pass: true,
    metrics: [],
    shape: [],
    runs: [],
    notes: [],
    ...overrides,
})

test('a complete clean invocation certifies', () => {
    const result = evaluateCertification(clean, full)
    assert.equal(result.certified, true)
    assert.deepEqual(result.reasons, [])
})

test('F11: a blocked scene and top-level blocked row do not certify', () => {
    const blockedEngine = {
        ...cleanEngine('chromium'),
        scenes: cleanEngine('chromium').scenes.map((scene) =>
            scene.scene === 's-sheet'
                ? {
                      scene: 's-sheet',
                      status: 'blocked' as const,
                      blockedReasons: ['G12 timer BLOCK'],
                  }
                : scene
        ),
    }
    const result = evaluateCertification(
        {
            ...clean,
            engines: [blockedEngine, cleanEngine('webkit')],
            blocked: [{ item: 'DPR 1/3 sweep', reason: 'P5c BLOCK' }],
        },
        full
    )
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /chromium scene s-sheet blocked/)
    assert.match(result.reasons.join(';'), /DPR 1\/3 sweep/)
})

test('one measured run does not certify', () => {
    const result = evaluateCertification(clean, { ...full, runs: 1 })
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /runs 1/)
})

test('a single engine does not certify', () => {
    const result = evaluateCertification(clean, {
        ...full,
        engines: ['chromium'],
    })
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /webkit not selected/)
})

test('a single scene does not certify', () => {
    const result = evaluateCertification(clean, {
        ...full,
        scenes: ['s-card'],
    })
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /s-seg not selected/)
})

test('advisory cost, even when passing, does not certify', () => {
    const result = evaluateCertification(
        { ...clean, advisory: { cost: true } },
        full
    )
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /advisory/)
})

test('D13: controlled load alone certifies when every gate passes', () => {
    const result = evaluateCertification(
        {
            ...clean,
            advisory: {
                cost: false,
                reasons: [],
                load1: 8.64,
                controlledLoad: true,
                loadReason:
                    'above the retired D9 <1.0 pin; recorded as controlled-load evidence (D13), not an advisory reason',
            },
        },
        full
    )
    assert.equal(result.certified, true)
    assert.deepEqual(result.reasons, [])
    assert.equal(result.controlledLoad, true)
    assert.equal(result.load1, 8.64)
    assert.match(result.loadReason, /controlled-load/)
})

test('D13: a hard fingerprint mismatch cannot certify under controlled load', () => {
    const result = evaluateCertification(
        {
            ...clean,
            advisory: {
                cost: true,
                reasons: ['host is Mac15,1, pinned Mac14,9'],
                load1: 8.64,
                controlledLoad: true,
                loadReason:
                    'above the retired D9 <1.0 pin; recorded as controlled-load evidence (D13), not an advisory reason',
            },
        },
        full
    )
    assert.equal(result.certified, false)
    assert.match(
        result.reasons.join(';'),
        /cost fingerprint is advisory: host is Mac15,1/
    )
    assert.equal(result.controlledLoad, true)
})

test('N1: a conclusive control failure does not certify', () => {
    const result = evaluateCertification(
        { ...clean, controlsPass: false },
        full
    )
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /negative controls/)
})

test('N1/N8: a self-test failure does not certify', () => {
    const result = evaluateCertification(
        { ...clean, selfTestPass: false },
        full
    )
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /self-tests/)
})

test('N4: measured Chromium G9/G11 failures are certification reasons', () => {
    const result = evaluateCertification(
        {
            ...clean,
            engines: [
                {
                    ...cleanEngine('chromium'),
                    cost: {
                        status: 'pending',
                        valid: true,
                        failedMetrics: [
                            'G9-unscrolled 3.272',
                            'G9-scrolled 3.256',
                            'G11 11.705',
                        ],
                    },
                },
                cleanEngine('webkit'),
            ],
            pending: [{ scene: 'S-BULK', reason: 'P4' }],
        },
        full
    )
    const text = result.reasons.join(';')
    assert.equal(result.certified, false)
    assert.match(text, /chromium S-BULK G9-unscrolled 3.272 failed/)
    assert.match(text, /chromium S-BULK G11 11.705 failed/)
})

test('pending, launch error, or invalid cost blocks certification', () => {
    const result = evaluateCertification(
        {
            ...clean,
            pending: [{ scene: 'S-BULK', reason: 'P4' }],
            engines: [
                {
                    ...cleanEngine('chromium'),
                    launchError: 'boom',
                    cost: { status: 'blocked', valid: false },
                },
                cleanEngine('webkit'),
            ],
        },
        full
    )
    assert.equal(result.certified, false)
    const text = result.reasons.join(';')
    assert.match(text, /pending S-BULK/)
    assert.match(text, /launch error/)
    assert.match(text, /not valid/)
})

test('N7: invocation pass is scoped to the selected invocation', () => {
    const cleanInvocation = evaluateInvocation({ engines: clean.engines })
    assert.equal(cleanInvocation.pass, true)
    assert.deepEqual(cleanInvocation.reasons, [])

    const failedCost = evaluateInvocation({
        engines: [
            {
                ...cleanEngine('chromium'),
                cost: { status: 'pending', valid: true },
            },
        ],
    })
    assert.equal(failedCost.pass, false)
    assert.match(failedCost.reasons.join(';'), /S-BULK pending/)

    const failedScene = evaluateInvocation({
        engines: [
            {
                ...cleanEngine('chromium'),
                scenes: [{ scene: 's-card', status: 'fail' }],
            },
        ],
    })
    assert.equal(failedScene.pass, false)
    assert.match(failedScene.reasons.join(';'), /s-card fail/)

    const launchError = evaluateInvocation({
        engines: [{ ...cleanEngine('chromium'), launchError: 'boom' }],
    })
    assert.equal(launchError.pass, false)
    assert.match(launchError.reasons.join(';'), /launch error/)
})

test('N7: global P4 pending does not fail the invocation, only certification', () => {
    const invocation = evaluateInvocation({ engines: clean.engines })
    assert.equal(invocation.pass, true)
    const certification = evaluateCertification(
        { ...clean, pending: [{ scene: 'S-REORDER', reason: 'P4' }] },
        full
    )
    assert.equal(certification.certified, false)
    assert.match(certification.reasons.join(';'), /pending S-REORDER/)
})

test('H15-02: every required P5b scene status is a certification reason', () => {
    const failing = {
        ...cleanEngine('chromium'),
        scenes: cleanEngine('chromium').scenes.map((scene) =>
            scene.scene === 's-photo'
                ? { scene: 's-photo', status: 'fail' as const }
                : scene
        ),
    }
    const result = evaluateCertification(
        { ...clean, engines: [failing, cleanEngine('webkit')] },
        full
    )
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /chromium scene s-photo fail/)
})

test('H19: a failed or missing support variant does not certify', () => {
    const failing = {
        ...cleanEngine('chromium'),
        variants: cleanEngine('chromium').variants.map((variant) =>
            variant.scene === 's-card@dpr1'
                ? { scene: variant.scene, status: 'fail' as const }
                : variant
        ),
    }
    const missing = {
        ...cleanEngine('webkit'),
        variants: cleanEngine('webkit').variants.filter(
            (variant) => variant.scene !== 's-photo@rm-max'
        ),
    }
    const result = evaluateCertification(
        { ...clean, engines: [failing, missing] },
        full
    )
    assert.equal(result.certified, false)
    const text = result.reasons.join(';')
    assert.match(text, /chromium variant s-card@dpr1 fail/)
    assert.match(text, /webkit variant s-photo@rm-max missing/)
})

test('H19: a WebKit variant G12 BLOCK is advisory (D12)', () => {
    const webkit = cleanEngine('webkit')
    const result = evaluateCertification(
        {
            ...clean,
            engines: [
                cleanEngine('chromium'),
                {
                    ...webkit,
                    variants: webkit.variants.map((variant) =>
                        variant.scene === 's-sheet@rm-jump'
                            ? {
                                  scene: variant.scene,
                                  status: 'blocked' as const,
                                  blockedReasons: [
                                      'G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms)',
                                  ],
                              }
                            : variant
                    ),
                },
            ],
        },
        full
    )
    assert.equal(result.certified, true)
    assert.match(
        result.advisory.join('; '),
        /s-sheet@rm-jump cost-only blocked .*D12 advisory.*G12/
    )
})

test('H19: an invocation fails when a selected support variant fails', () => {
    const failing = {
        ...cleanEngine('chromium'),
        variants: cleanEngine('chromium').variants.map((variant) =>
            variant.scene === 's-photo@rm-jump'
                ? { scene: variant.scene, status: 'fail' as const }
                : variant
        ),
    }
    const result = evaluateInvocation({ engines: [failing] })
    assert.equal(result.pass, false)
    assert.match(result.reasons.join(';'), /s-photo@rm-jump fail/)
})

test('D12: a WebKit G8-only failure is classified cost-only', () => {
    const report = sceneReport({
        status: 'fail',
        pass: false,
        metrics: [aggregateMetric('G8', { pass: false, median: 3 })],
        runs: [
            runReport({
                pass: false,
                metrics: [metric('G8', { pass: false, value: 3 })],
                real: {
                    g: 1,
                    gSource: 'reads',
                    frames: 11,
                    p95: 3,
                    longFrames: 0,
                    pass: false,
                },
            }),
        ],
    })
    assert.equal(classifyWebkitCostOnly(report), true)
})

test('D12: a WebKit G8+G12 failure is classified cost-only', () => {
    const report = sceneReport({
        status: 'fail',
        pass: false,
        blockedReasons: ['G12 (D11 held cost)'],
        metrics: [aggregateMetric('G8', { pass: false, median: 3 })],
        runs: [
            runReport({
                pass: false,
                metrics: [metric('G8', { pass: false, value: 3 })],
                real: {
                    g: 1,
                    gSource: 'reads',
                    frames: 11,
                    p95: 3,
                    longFrames: 0,
                    pass: false,
                },
            }),
        ],
    })
    assert.equal(classifyWebkitCostOnly(report), true)
})

test('D12: a WebKit G1 failure is not cost-only', () => {
    const report = sceneReport({
        status: 'fail',
        pass: false,
        metrics: [aggregateMetric('G1', { pass: false, median: 3 })],
        runs: [
            runReport({
                pass: false,
                metrics: [metric('G1', { pass: false, value: 3 })],
            }),
        ],
    })
    assert.equal(classifyWebkitCostOnly(report), false)
})

test('D12: a WebKit non-cost problem is not cost-only', () => {
    const report = sceneReport({
        status: 'fail',
        pass: false,
        metrics: [aggregateMetric('G8', { pass: false, median: 3 })],
        runs: [
            runReport({
                pass: false,
                metrics: [metric('G8', { pass: false, value: 3 })],
                problems: ['real twin diagnostic: stale'],
            }),
        ],
    })
    assert.equal(classifyWebkitCostOnly(report), false)
})

test('D12: a WebKit RUN-only failure with no cost signal is not cost-only', () => {
    const report = sceneReport({
        status: 'fail',
        pass: false,
        runs: [runReport({ pass: false })],
    })
    assert.equal(classifyWebkitCostOnly(report), false)
})

test('D12: a per-run WebKit G8 failure is cost-only even when the aggregate passes', () => {
    const report = sceneReport({
        status: 'fail',
        pass: false,
        metrics: [aggregateMetric('G8', { pass: true, median: 1 })],
        runs: [
            runReport(),
            runReport({
                run: 1,
                pass: false,
                metrics: [metric('G8', { pass: false, value: 3 })],
                real: {
                    g: 1,
                    gSource: 'reads',
                    frames: 11,
                    p95: 3,
                    longFrames: 0,
                    pass: false,
                },
            }),
        ],
    })
    assert.equal(classifyWebkitCostOnly(report), true)
})

test('D12: a per-run WebKit G1 failure keeps the row blocking', () => {
    const report = sceneReport({
        status: 'fail',
        pass: false,
        metrics: [aggregateMetric('G1', { pass: true, median: 0.001 })],
        runs: [
            runReport(),
            runReport({
                run: 1,
                pass: false,
                metrics: [metric('G1', { pass: false, value: 3 })],
            }),
        ],
    })
    assert.equal(classifyWebkitCostOnly(report), false)
})

test('D12: a non-cost blocked reason keeps a WebKit row blocking', () => {
    const report = sceneReport({
        status: 'blocked',
        pass: false,
        blockedReasons: ['G12 (D11 held cost)', 'G7 status authority'],
        runs: [runReport()],
    })
    assert.equal(classifyWebkitCostOnly(report), false)
})

test('D12: a WebKit G8-only failure is advisory and certifies', () => {
    const webkit = cleanEngine('webkit')
    const result = evaluateCertification(
        {
            ...clean,
            engines: [
                cleanEngine('chromium'),
                {
                    ...webkit,
                    scenes: webkit.scenes.map((scene) =>
                        scene.scene === 's-reorder'
                            ? {
                                  scene: 's-reorder',
                                  status: 'fail' as const,
                                  failedMetrics: ['G8 3'],
                                  costOnly: true,
                              }
                            : scene
                    ),
                },
            ],
        },
        full
    )
    assert.equal(result.certified, true)
    assert.match(
        result.advisory.join('; '),
        /s-reorder cost-only fail.*D12 advisory.*G8 3/
    )
    assert.doesNotMatch(result.reasons.join('; '), /s-reorder/)
})

test('D12: a WebKit G8+G12 failure is advisory and certifies', () => {
    const webkit = cleanEngine('webkit')
    const result = evaluateCertification(
        {
            ...clean,
            engines: [
                cleanEngine('chromium'),
                {
                    ...webkit,
                    scenes: webkit.scenes.map((scene) =>
                        scene.scene === 's-reorder'
                            ? {
                                  scene: 's-reorder',
                                  status: 'fail' as const,
                                  failedMetrics: ['G8 3'],
                                  blockedReasons: ['G12 (D11 held cost)'],
                                  costOnly: true,
                              }
                            : scene
                    ),
                },
            ],
        },
        full
    )
    assert.equal(result.certified, true)
    assert.match(result.advisory.join('; '), /G8 3/)
    assert.match(result.advisory.join('; '), /G12/)
})

test('D12: a WebKit G1 failure still blocks certification', () => {
    const webkit = cleanEngine('webkit')
    const result = evaluateCertification(
        {
            ...clean,
            engines: [
                cleanEngine('chromium'),
                {
                    ...webkit,
                    scenes: webkit.scenes.map((scene) =>
                        scene.scene === 's-reorder'
                            ? {
                                  scene: 's-reorder',
                                  status: 'fail' as const,
                                  failedMetrics: ['G1 3'],
                                  costOnly: false,
                              }
                            : scene
                    ),
                },
            ],
        },
        full
    )
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /webkit scene s-reorder fail/)
})

test('D12: a Chromium G8 failure still blocks certification', () => {
    const chromium = cleanEngine('chromium')
    const result = evaluateCertification(
        {
            ...clean,
            engines: [
                {
                    ...chromium,
                    scenes: chromium.scenes.map((scene) =>
                        scene.scene === 's-reorder'
                            ? {
                                  scene: 's-reorder',
                                  status: 'fail' as const,
                                  failedMetrics: ['G8 3'],
                                  costOnly: true,
                              }
                            : scene
                    ),
                },
                cleanEngine('webkit'),
            ],
        },
        full
    )
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /chromium scene s-reorder fail/)
})

test('D12: a WebKit non-cost problem still blocks certification', () => {
    const webkit = cleanEngine('webkit')
    const result = evaluateCertification(
        {
            ...clean,
            engines: [
                cleanEngine('chromium'),
                {
                    ...webkit,
                    scenes: webkit.scenes.map((scene) =>
                        scene.scene === 's-reorder'
                            ? {
                                  scene: 's-reorder',
                                  status: 'fail' as const,
                                  failedMetrics: [
                                      'RUN real twin diagnostic: stale',
                                  ],
                                  costOnly: false,
                              }
                            : scene
                    ),
                },
            ],
        },
        full
    )
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /webkit scene s-reorder fail/)
})

test('D12: invocation ignores a WebKit G8-only failure and records it', () => {
    const webkit = cleanEngine('webkit')
    const result = evaluateInvocation({
        engines: [
            cleanEngine('chromium'),
            {
                ...webkit,
                scenes: webkit.scenes.map((scene) =>
                    scene.scene === 's-reorder'
                        ? {
                              scene: 's-reorder',
                              status: 'fail' as const,
                              failedMetrics: ['G8 3'],
                              costOnly: true,
                          }
                        : scene
                ),
            },
        ],
    })
    assert.equal(result.pass, true)
    assert.deepEqual(result.reasons, [])
    assert.match(result.advisory.join('; '), /s-reorder cost-only fail/)
})

test('D12: invocation still fails a Chromium G8 failure', () => {
    const chromium = cleanEngine('chromium')
    const result = evaluateInvocation({
        engines: [
            {
                ...chromium,
                scenes: chromium.scenes.map((scene) =>
                    scene.scene === 's-reorder'
                        ? {
                              scene: 's-reorder',
                              status: 'fail' as const,
                              failedMetrics: ['G8 3'],
                              costOnly: true,
                          }
                        : scene
                ),
            },
        ],
    })
    assert.equal(result.pass, false)
    assert.match(result.reasons.join(';'), /chromium s-reorder fail/)
})

test('D12: a WebKit cost BLOCK is advisory when every WebKit frame row passes', () => {
    const webkit = cleanEngine('webkit')
    const result = evaluateCertification(
        {
            ...clean,
            engines: [
                cleanEngine('chromium'),
                {
                    ...webkit,
                    scenes: webkit.scenes.map((scene) =>
                        scene.scene === 's-reorder'
                            ? {
                                  scene: 's-reorder',
                                  status: 'blocked' as const,
                                  blockedReasons: ['G12 (D11 held cost)'],
                              }
                            : scene
                    ),
                    cost: { status: 'blocked' as const, valid: false },
                },
            ],
        },
        full
    )
    assert.equal(result.certified, true)
    assert.deepEqual(result.reasons, [])
    assert.match(
        result.advisory.join('; '),
        /cost-only blocked .*D12 advisory.*G12/
    )
    assert.match(result.advisory.join('; '), /S-BULK cost blocked/)
})

test('D12: a WebKit frame failure still blocks certification', () => {
    const webkit = cleanEngine('webkit')
    const result = evaluateCertification(
        {
            ...clean,
            engines: [
                cleanEngine('chromium'),
                {
                    ...webkit,
                    scenes: webkit.scenes.map((scene) =>
                        scene.scene === 's-photo'
                            ? { scene: 's-photo', status: 'fail' as const }
                            : scene
                    ),
                    cost: { status: 'blocked' as const, valid: false },
                },
            ],
        },
        full
    )
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /webkit scene s-photo fail/)
})

test('D12: a WebKit scene blocked for a non-cost reason still blocks', () => {
    const webkit = cleanEngine('webkit')
    const result = evaluateCertification(
        {
            ...clean,
            engines: [
                cleanEngine('chromium'),
                {
                    ...webkit,
                    scenes: webkit.scenes.map((scene) =>
                        scene.scene === 's-reorder'
                            ? {
                                  scene: 's-reorder',
                                  status: 'blocked' as const,
                                  blockedReasons: ['G7 status authority'],
                              }
                            : scene
                    ),
                },
            ],
        },
        full
    )
    assert.equal(result.certified, false)
    assert.match(result.reasons.join(';'), /webkit scene s-reorder blocked/)
})

test('D12: invocation pass ignores a WebKit cost BLOCK', () => {
    const result = evaluateInvocation({
        engines: [
            cleanEngine('chromium'),
            {
                ...cleanEngine('webkit'),
                cost: { status: 'blocked' as const, valid: false },
            },
        ],
    })
    assert.equal(result.pass, true)
    assert.deepEqual(result.reasons, [])
})

test('D12: invocation ignores a WebKit G12 cost-only scene block', () => {
    const webkit = cleanEngine('webkit')
    const result = evaluateInvocation({
        engines: [
            cleanEngine('chromium'),
            {
                ...webkit,
                scenes: webkit.scenes.map((scene) =>
                    scene.scene === 's-sheet'
                        ? {
                              scene: 's-sheet',
                              status: 'blocked' as const,
                              blockedReasons: ['G12 (D11 held cost)'],
                          }
                        : scene
                ),
                cost: { status: 'blocked' as const, valid: false },
            },
        ],
    })
    assert.equal(result.pass, true)
    assert.deepEqual(result.reasons, [])
})

test('D12: a WebKit frame failure still fails the invocation', () => {
    const webkit = cleanEngine('webkit')
    const result = evaluateInvocation({
        engines: [
            cleanEngine('chromium'),
            {
                ...webkit,
                scenes: webkit.scenes.map((scene) =>
                    scene.scene === 's-sheet'
                        ? { scene: 's-sheet', status: 'fail' as const }
                        : scene
                ),
            },
        ],
    })
    assert.equal(result.pass, false)
    assert.match(result.reasons.join(';'), /webkit s-sheet fail/)
})
