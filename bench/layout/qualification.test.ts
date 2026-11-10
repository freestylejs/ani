import assert from 'node:assert/strict'
import test from 'node:test'

type QualificationResult = {
    status: 'pass' | 'fail' | 'block'
    nativeDeviceQualified: boolean
    dimensions: {
        geometry: { status: 'pass' | 'fail' | 'block' }
        script: { status: 'pass' | 'fail' | 'block' }
        browserProxy: { status: 'pass' | 'fail' | 'block' }
        actualPresentation: { status: 'pass' | 'fail' | 'block' }
        physicalInput: { status: 'pass' | 'fail' | 'block' }
        content: { status: 'pass' | 'fail' | 'block' }
    }
    reasons: readonly string[]
}

type QualificationModule = {
    qualifyNativeGrade(input: unknown): QualificationResult
    formatNativeGradeQualification(result: QualificationResult): string
}

async function qualification(): Promise<QualificationModule> {
    const loaded = await import('./qualification.ts').catch(() => null)
    assert.notEqual(loaded, null, 'qualification contract module must exist')
    assert.equal(
        typeof loaded?.qualifyNativeGrade,
        'function',
        'qualifyNativeGrade must be exported'
    )
    return loaded as QualificationModule
}

const build = {
    revision: 'rev+dirty-hash',
    artifact: 'tests/browser source bundle',
    mode: 'production',
} as const

const passDimension = { status: 'pass', detail: 'measured' } as const

const browserProxy = {
    build,
    browser: 'chromium 140.0.7339.16',
    os: 'darwin arm64',
    dpr: 1,
    rafSamples: 30,
    eventToDomSamples: 1,
    rafMedianMs: 16.7,
    rafP95Ms: 16.7,
    rafMaxMs: 16.8,
    eventToDomMs: 2.6,
    scene: 'SwitchFixture toggle',
    load1: 0.5,
} as const

const physical = {
    build,
    platform: 'ios-safari',
    deviceModel: 'fixture-ios-device-class',
    osVersion: 'fixture-ios-version',
    browserVersion: 'fixture-safari-version',
    presentation: {
        measured: true,
        accepted: true,
        outcome: 'pass',
        method: 'fixture presentation evidence',
        result: 'fixture cadence observation passed its documented criterion',
    },
    input: {
        measured: true,
        accepted: true,
        outcome: 'pass',
        method: 'fixture physical-input evidence',
        result: 'fixture input observation passed its documented criterion',
    },
} as const

function base() {
    return {
        build,
        geometry: passDimension,
        script: passDimension,
        browserProxy,
        physicalDevice: physical,
        content: passDimension,
    }
}

test('missing physical device evidence blocks presentation/input and native qualification', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade({ ...base(), physicalDevice: null })
    assert.equal(result.dimensions.geometry.status, 'pass')
    assert.equal(result.dimensions.script.status, 'pass')
    assert.equal(result.dimensions.browserProxy.status, 'pass')
    assert.equal(result.dimensions.content.status, 'pass')
    assert.equal(result.dimensions.actualPresentation.status, 'block')
    assert.equal(result.dimensions.physicalInput.status, 'block')
    assert.equal(result.status, 'block')
    assert.equal(result.nativeDeviceQualified, false)
})

test('mismatched browser proxy build fails closed', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade({
        ...base(),
        browserProxy: {
            ...browserProxy,
            build: { ...build, revision: 'other-revision' },
        },
    })
    assert.equal(result.dimensions.browserProxy.status, 'fail')
    assert.equal(result.status, 'fail')
    assert.equal(result.nativeDeviceQualified, false)
    assert.match(result.reasons.join('; '), /browser proxy build/)
})

test('desktop WebKit cannot satisfy physical iOS presentation or input', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade({
        ...base(),
        physicalDevice: {
            ...physical,
            platform: 'desktop-webkit',
        },
    })
    assert.equal(result.dimensions.actualPresentation.status, 'fail')
    assert.equal(result.dimensions.physicalInput.status, 'fail')
    assert.equal(result.status, 'fail')
    assert.equal(result.nativeDeviceQualified, false)
})

test('missing physical input measurement remains a block even with presentation evidence', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade({
        ...base(),
        physicalDevice: {
            ...physical,
            input: {
                measured: false,
                accepted: false,
                outcome: null,
                method: '',
                result: '',
            },
        },
    })
    assert.equal(result.dimensions.actualPresentation.status, 'pass')
    assert.equal(result.dimensions.physicalInput.status, 'block')
    assert.equal(result.status, 'block')
    assert.equal(result.nativeDeviceQualified, false)
})

test('measured physical presentation failure is a qualification FAIL', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade({
        ...base(),
        physicalDevice: {
            ...physical,
            presentation: {
                ...physical.presentation,
                accepted: false,
                outcome: 'fail',
                result: 'cadence missed the submitted acceptance criterion',
            },
        },
    })
    assert.equal(result.dimensions.actualPresentation.status, 'fail')
    assert.equal(result.status, 'fail')
    assert.equal(result.nativeDeviceQualified, false)
})

test('measured physical input failure is a qualification FAIL', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade({
        ...base(),
        physicalDevice: {
            ...physical,
            input: {
                ...physical.input,
                accepted: false,
                outcome: 'fail',
                result: 'input latency missed the submitted acceptance criterion',
            },
        },
    })
    assert.equal(result.dimensions.physicalInput.status, 'fail')
    assert.equal(result.status, 'fail')
    assert.equal(result.nativeDeviceQualified, false)
})

test('measured physical evidence without accepted outcome/result cannot pass', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade({
        ...base(),
        physicalDevice: {
            ...physical,
            presentation: {
                measured: true,
                accepted: false,
                outcome: null,
                method: 'trace capture',
                result: '',
            },
        },
    })
    assert.equal(result.dimensions.actualPresentation.status, 'fail')
    assert.equal(result.nativeDeviceQualified, false)
})

test('blank qualification build identity fails closed', async () => {
    const { qualifyNativeGrade } = await qualification()
    const blankBuild = {
        revision: '   ',
        artifact: '\t',
        mode: 'production',
    } as const
    const result = qualifyNativeGrade({
        ...base(),
        build: blankBuild,
        browserProxy: { ...browserProxy, build: blankBuild },
        physicalDevice: { ...physical, build: blankBuild },
    })
    assert.equal(result.dimensions.browserProxy.status, 'fail')
    assert.equal(result.dimensions.actualPresentation.status, 'fail')
    assert.equal(result.dimensions.physicalInput.status, 'fail')
    assert.equal(result.status, 'fail')
})

test('blank qualification build fails even when proxy/device evidence is absent', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade({
        ...base(),
        build: { revision: ' ', artifact: '\t', mode: 'production' },
        browserProxy: null,
        physicalDevice: null,
    })
    assert.equal(result.dimensions.browserProxy.status, 'fail')
    assert.equal(result.dimensions.actualPresentation.status, 'fail')
    assert.equal(result.dimensions.physicalInput.status, 'fail')
    assert.equal(result.status, 'fail')
})

test('historical missing source revision remains BLOCK rather than fabricated PASS/FAIL', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade({
        ...base(),
        build: {
            revision: null,
            artifact: 'historical bench artifact',
            mode: 'production',
        },
        browserProxy: null,
        physicalDevice: null,
    })
    assert.equal(result.dimensions.browserProxy.status, 'block')
    assert.equal(result.dimensions.actualPresentation.status, 'block')
    assert.equal(result.dimensions.physicalInput.status, 'block')
    assert.equal(result.status, 'block')
    assert.equal(result.nativeDeviceQualified, false)
})

test('blank browser environment and scene provenance fail closed', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade({
        ...base(),
        browserProxy: {
            ...browserProxy,
            browser: ' ',
            os: '\n',
            scene: '\t',
        },
    })
    assert.equal(result.dimensions.browserProxy.status, 'fail')
    assert.equal(result.status, 'fail')
})

test('identity fields must already be trimmed, not merely nonblank after trimming', async () => {
    const { qualifyNativeGrade } = await qualification()
    const paddedBuild = {
        ...build,
        revision: ` ${build.revision}`,
    }
    const result = qualifyNativeGrade({
        ...base(),
        build: paddedBuild,
        browserProxy: {
            ...browserProxy,
            build: paddedBuild,
            browser: `${browserProxy.browser} `,
        },
        physicalDevice: { ...physical, build: paddedBuild },
    })
    assert.equal(result.dimensions.browserProxy.status, 'fail')
    assert.equal(result.dimensions.actualPresentation.status, 'fail')
    assert.equal(result.status, 'fail')
})

for (const [label, patch] of [
    ['NaN samples', { rafSamples: Number.NaN }],
    ['infinite samples', { eventToDomSamples: Number.POSITIVE_INFINITY }],
    ['fractional samples', { rafSamples: 1.5 }],
    ['zero samples', { eventToDomSamples: 0 }],
    ['negative samples', { rafSamples: -1 }],
] as const) {
    test(`${label} cannot earn browser proxy PASS`, async () => {
        const { qualifyNativeGrade } = await qualification()
        const result = qualifyNativeGrade({
            ...base(),
            browserProxy: { ...browserProxy, ...patch },
        })
        assert.equal(result.dimensions.browserProxy.status, 'fail')
        assert.equal(result.nativeDeviceQualified, false)
    })
}

for (const [label, patch] of [
    ['NaN cadence', { rafP95Ms: Number.NaN }],
    ['infinite cadence', { rafMaxMs: Number.POSITIVE_INFINITY }],
    ['NaN event-to-DOM', { eventToDomMs: Number.NaN }],
    ['infinite load', { load1: Number.POSITIVE_INFINITY }],
] as const) {
    test(`${label} cannot earn browser proxy PASS`, async () => {
        const { qualifyNativeGrade } = await qualification()
        const result = qualifyNativeGrade({
            ...base(),
            browserProxy: { ...browserProxy, ...patch },
        })
        assert.equal(result.dimensions.browserProxy.status, 'fail')
        assert.equal(result.nativeDeviceQualified, false)
    })
}

test('whitespace physical identity/method/result fail closed', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade({
        ...base(),
        physicalDevice: {
            ...physical,
            deviceModel: ' ',
            osVersion: '\t',
            browserVersion: '\n',
            presentation: {
                ...physical.presentation,
                method: ' ',
                result: '\t',
            },
        },
    })
    assert.equal(result.dimensions.actualPresentation.status, 'fail')
    assert.equal(result.dimensions.physicalInput.status, 'fail')
    assert.equal(result.nativeDeviceQualified, false)
})

test('non-boolean physical measurement flags are malformed FAIL, not availability or acceptance', async () => {
    const { qualifyNativeGrade } = await qualification()
    for (const key of ['presentation', 'input'] as const) {
        for (const measured of ['false', 1, null, undefined, {}]) {
            const result = qualifyNativeGrade({
                ...base(),
                physicalDevice: {
                    ...physical,
                    [key]: { ...physical[key], measured },
                },
            })
            const dimension =
                key === 'presentation'
                    ? result.dimensions.actualPresentation
                    : result.dimensions.physicalInput
            assert.equal(
                dimension.status,
                'fail',
                `${key}: ${String(measured)}`
            )
            assert.equal(result.status, 'fail')
            assert.equal(result.nativeDeviceQualified, false)
        }
    }
})

test('unknown runtime dimension statuses cannot bypass FAIL/BLOCK aggregation', async () => {
    const { qualifyNativeGrade } = await qualification()
    for (const key of ['geometry', 'script', 'content'] as const) {
        for (const status of ['mystery', '', null, undefined, 1]) {
            const result = qualifyNativeGrade({
                ...base(),
                [key]: { status, detail: 'submitted runtime evidence' },
            })
            assert.equal(
                result.dimensions[key].status,
                'fail',
                `${key}: ${String(status)}`
            )
            assert.equal(result.status, 'fail')
            assert.equal(result.nativeDeviceQualified, false)
        }
    }
})

test('matching production build plus all six measured dimensions can qualify', async () => {
    const { qualifyNativeGrade } = await qualification()
    const result = qualifyNativeGrade(base())
    assert.equal(result.status, 'pass')
    assert.equal(result.nativeDeviceQualified, true)
    assert.deepEqual(
        Object.values(result.dimensions).map((dimension) => dimension.status),
        ['pass', 'pass', 'pass', 'pass', 'pass', 'pass']
    )
})

test('qualification text reports every dimension separately', async () => {
    const { formatNativeGradeQualification, qualifyNativeGrade } =
        await qualification()
    assert.equal(
        typeof formatNativeGradeQualification,
        'function',
        'qualification formatter must be exported'
    )
    const text = formatNativeGradeQualification(
        qualifyNativeGrade({ ...base(), physicalDevice: null })
    )
    assert.match(text, /native-grade qualification: BLOCK/)
    for (const label of [
        'geometry',
        'script',
        'browser proxy',
        'actual presentation',
        'physical input',
        'content',
    ]) {
        assert.match(text, new RegExp(`^  ${label}: `, 'm'))
    }
})
