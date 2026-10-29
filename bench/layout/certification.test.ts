import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateCertification, evaluateInvocation } from './certification.ts'

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
    assert.match(result.advisory.join('; '), /G12.*D12 advisory/)
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
