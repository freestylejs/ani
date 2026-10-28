import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateCertification } from './certification.ts'

const cleanEngine = (engine: string) => ({
    engine,
    launchError: null,
    scenes: [
        { scene: 's-card', status: 'pass' as const },
        { scene: 's-seg', status: 'pass' as const },
    ],
    cost: { status: 'pass' as const, valid: true },
})

const clean = {
    engines: [cleanEngine('chromium'), cleanEngine('webkit')],
    pending: [],
    advisory: { cost: false },
}
const full = {
    engines: ['chromium', 'webkit'],
    scenes: ['s-card', 's-seg', 'cost'],
    runs: 5,
}

test('a complete clean invocation certifies', () => {
    const result = evaluateCertification(clean, full)
    assert.equal(result.certified, true)
    assert.deepEqual(result.reasons, [])
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
