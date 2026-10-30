import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    type Advisory,
    evaluateFingerprint,
    type Fingerprint,
} from './fingerprint.ts'
import {
    type BenchReport,
    type CertificationReport,
    formatReport,
} from './report.ts'

const pinned = (overrides: Partial<Fingerprint> = {}): Fingerprint => ({
    host: 'Mac14,9',
    os: { productVersion: '27.0.1', kernel: '27.0.0' },
    cpu: 'Apple M2 Pro',
    cores: 10,
    memoryBytes: 34359738368,
    node: 'v24.19.0',
    pnpm: '10.20.0',
    playwright: '1.55.0',
    browsers: {
        chromium: 'chromium_headless_shell-1187',
        chromiumHeadlessShell: 'chromium_headless_shell-1187',
        webkit: 'webkit-2203',
        firefox: 'firefox-1490',
    },
    load1: 0.5,
    ...overrides,
})

const fixture = (
    advisory: Advisory,
    certification: Partial<CertificationReport> = {}
): BenchReport => ({
    schema: 'ani-layout-bench/v1',
    generatedAt: '2026-10-30T00:00:00.000Z',
    command: 'pnpm bench:layout',
    fingerprint: pinned({ load1: advisory.load1 }),
    advisory,
    engines: [],
    negativeControls: [],
    selfTests: { pass: true, controls: [], files: [], detail: 'fixture' },
    pending: [],
    blocked: [],
    certification: {
        certified: false,
        reasons: [],
        advisory: [],
        controlledLoad: advisory.controlledLoad,
        load1: advisory.load1,
        loadReason: advisory.loadReason,
        requiredEngines: [],
        requiredRuns: 5,
        requiredScenes: [],
        requiredVariants: [],
        ...certification,
    },
    pass: false,
})

test('D13: a load above 1.0 is controlled-load evidence, not advisory', () => {
    const advisory = evaluateFingerprint(pinned({ load1: 8.64 }))
    assert.equal(advisory.cost, false)
    assert.deepEqual(advisory.reasons, [])
    assert.equal(advisory.load1, 8.64)
    assert.equal(advisory.controlledLoad, true)
    assert.match(advisory.loadReason, /controlled-load/)
    assert.match(advisory.loadReason, /retired D9/)
})

test('D13: a quiet load is not controlled load and is not advisory', () => {
    const advisory = evaluateFingerprint(pinned({ load1: 0.5 }))
    assert.equal(advisory.cost, false)
    assert.deepEqual(advisory.reasons, [])
    assert.equal(advisory.controlledLoad, false)
    assert.match(advisory.loadReason, /within the retired D9/)
})

test('D13: exactly 1.0 is not above the retired pin', () => {
    const advisory = evaluateFingerprint(pinned({ load1: 1 }))
    assert.equal(advisory.cost, false)
    assert.equal(advisory.controlledLoad, false)
})

test('D13: an unavailable load is recorded, not a hard mismatch', () => {
    const advisory = evaluateFingerprint(pinned({ load1: Number.NaN }))
    assert.equal(advisory.cost, false)
    assert.deepEqual(advisory.reasons, [])
    assert.equal(advisory.controlledLoad, false)
    assert.match(advisory.loadReason, /unavailable/)
})

test('D13: a host mismatch stays advisory under a controlled load', () => {
    const advisory = evaluateFingerprint(
        pinned({ load1: 8.64, host: 'Mac15,1' })
    )
    assert.equal(advisory.cost, true)
    assert.equal(advisory.controlledLoad, true)
    assert.match(advisory.reasons.join(';'), /host is Mac15,1/)
})

test('D13: a browser build mismatch stays advisory under a controlled load', () => {
    const fingerprint = pinned({ load1: 8.64 })
    const advisory = evaluateFingerprint({
        ...fingerprint,
        browsers: { ...fingerprint.browsers, chromium: 'chromium-9999' },
    })
    assert.equal(advisory.cost, true)
    assert.equal(advisory.controlledLoad, true)
    assert.match(advisory.reasons.join(';'), /browsers\.chromium/)
})

test('D13: report text names controlled load and keeps cost deciding', () => {
    const advisory = evaluateFingerprint(pinned({ load1: 8.64 }))
    const text = formatReport(fixture(advisory))
    assert.match(text, /1-minute load 8\.64:/)
    assert.match(text, /controlled load: YES/)
    assert.match(text, /cost gates: deciding/)
    assert.match(text, /cert controlled load: YES/)
    assert.doesNotMatch(text, /cost gates: ADVISORY/)
})

test('D13: report text names a hard mismatch and the controlled load', () => {
    const advisory = evaluateFingerprint(
        pinned({ load1: 8.64, host: 'Mac15,1' })
    )
    const text = formatReport(
        fixture(advisory, {
            reasons: [
                'cost fingerprint is advisory: host is Mac15,1, pinned Mac14,9',
            ],
        })
    )
    assert.match(text, /controlled load: YES/)
    assert.match(text, /cost gates: ADVISORY/)
    assert.match(text, /host is Mac15,1/)
    assert.match(text, /cert controlled load: YES/)
})
