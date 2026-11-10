import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type TestContext, test } from 'node:test'
import {
    type Advisory,
    collectSourceIdentity,
    evaluateFingerprint,
    type Fingerprint,
} from './fingerprint.ts'
import {
    type AggregateMetric,
    type BenchReport,
    type CertificationReport,
    type EngineReport,
    formatReport,
    type SceneReport,
} from './report.ts'

async function sourceRepository(t: TestContext): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'ani-source-boundary-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    await mkdir(join(directory, 'packages/layout/src'), { recursive: true })
    await writeFile(
        join(directory, 'packages/layout/src/source.ts'),
        'export const value = 1\n'
    )
    await writeFile(
        join(directory, 'tsconfig.json'),
        '{"compilerOptions":{"strict":true}}\n'
    )
    execFileSync('git', ['init', '-q'], { cwd: directory })
    execFileSync('git', ['add', '.'], { cwd: directory })
    execFileSync(
        'git',
        [
            '-c',
            'user.email=fixture@example.test',
            '-c',
            'user.name=Fixture',
            'commit',
            '-qm',
            'fixture',
        ],
        { cwd: directory }
    )
    return directory
}

test('source identity includes the inherited root TypeScript configuration', async (t) => {
    const directory = await sourceRepository(t)
    const before = collectSourceIdentity(directory)
    assert.equal(typeof before, 'string')
    await writeFile(
        join(directory, 'tsconfig.json'),
        '{"compilerOptions":{"strict":false}}\n'
    )
    const after = collectSourceIdentity(directory)
    assert.equal(typeof after, 'string')
    assert.notEqual(after, before)
})

test('a source read failure other than absence makes exact provenance unavailable', async (t) => {
    const directory = await sourceRepository(t)
    const source = join(directory, 'packages/layout/src/source.ts')
    await rm(source)
    const deleted = collectSourceIdentity(directory)
    assert.equal(
        typeof deleted,
        'string',
        'a genuinely deleted tracked input is representable'
    )
    // A directory at a tracked file path exists but cannot be read as file bytes.
    // EISDIR is deterministic on supported hosts, unlike chmod under root.
    await mkdir(source)
    assert.equal(collectSourceIdentity(directory), undefined)
})

test('deleted source identity cannot collide with a present file containing its marker', async (t) => {
    const directory = await sourceRepository(t)
    const source = join(directory, 'packages/layout/src/source.ts')
    await writeFile(source, '<deleted>')
    const present = collectSourceIdentity(directory)
    assert.equal(typeof present, 'string')
    await rm(source)
    const deleted = collectSourceIdentity(directory)
    assert.equal(typeof deleted, 'string')
    assert.notEqual(deleted, present)
})

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
    certification: Partial<CertificationReport> = {},
    engines: readonly EngineReport[] = []
): BenchReport => ({
    schema: 'ani-layout-bench/v1',
    generatedAt: '2026-10-30T00:00:00.000Z',
    command: 'pnpm bench:layout',
    fingerprint: pinned({ load1: advisory.load1 }),
    advisory,
    engines,
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

const metric = (
    id: string,
    pass: boolean,
    blocked = false
): AggregateMetric => ({
    id,
    label: id,
    gate: 'fixture gate',
    unit: 'ms',
    median: pass ? 0 : 1,
    pass,
    blocked,
    deciding: true,
    perRun: [pass ? 0 : 1],
    passPerRun: [pass],
})

const scene = (entry: AggregateMetric): SceneReport => ({
    scene: 's-card',
    status: entry.blocked ? 'blocked' : entry.pass ? 'pass' : 'fail',
    pending: null,
    blockedReasons: entry.blocked ? [`${entry.id} blocked`] : [],
    pass: entry.pass && !entry.blocked,
    metrics: [entry],
    shape: [],
    runs: [],
    notes: [],
})

const engine = (
    name: EngineReport['engine'],
    entry: AggregateMetric
): EngineReport => ({
    engine: name,
    advisory: false,
    browserVersion: 'fixture-browser',
    build: 'fixture-build',
    launchError: null,
    scenes: [scene(entry)],
    variants: [],
    cost: null,
    notes: [],
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

test('benchmark certification text is explicitly geometry/script-only', () => {
    const advisory = evaluateFingerprint(pinned({ load1: 0.5 }))
    const text = formatReport(fixture(advisory))
    assert.match(
        text,
        /engine benchmark certification: (?:CERTIFIED|NOT CERTIFIED)/
    )
    assert.match(text, /not native-device certification/)
})

test('benchmark report emits native-grade dimensions and keeps physical evidence blocked', () => {
    const advisory = evaluateFingerprint(pinned({ load1: 0.5 }))
    const text = formatReport(fixture(advisory))

    assert.match(text, /native-grade qualification: (?:FAIL|BLOCK)/)
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
    assert.match(text, /^ {2}actual presentation: BLOCK /m)
    assert.match(text, /^ {2}physical input: BLOCK /m)
})

test('measured G1 failure is geometry FAIL while incomplete script evidence stays BLOCK', () => {
    const advisory = evaluateFingerprint(pinned({ load1: 0.5 }))
    const text = formatReport(
        fixture(advisory, { reasons: ['fixture certification incomplete'] }, [
            engine('chromium', metric('G1', false)),
        ])
    )

    assert.match(text, /^ {2}geometry: FAIL /m)
    assert.match(text, /^ {2}script: BLOCK /m)
    assert.match(text, /^ {2}actual presentation: BLOCK /m)
    assert.match(text, /^ {2}physical input: BLOCK /m)
})

test('measured Chromium G10 failure is script FAIL while incomplete geometry stays BLOCK', () => {
    const advisory = evaluateFingerprint(pinned({ load1: 0.5 }))
    const text = formatReport(
        fixture(advisory, { reasons: ['fixture certification incomplete'] }, [
            engine('chromium', metric('G10', false)),
        ])
    )

    assert.match(text, /^ {2}geometry: BLOCK /m)
    assert.match(text, /^ {2}script: FAIL /m)
})

test('blocked measured row remains BLOCK rather than FAIL', () => {
    const advisory = evaluateFingerprint(pinned({ load1: 0.5 }))
    const text = formatReport(
        fixture(advisory, { reasons: ['fixture certification incomplete'] }, [
            engine('chromium', metric('G1', false, true)),
        ])
    )

    assert.match(text, /^ {2}geometry: BLOCK /m)
    assert.doesNotMatch(text, /^ {2}geometry: FAIL /m)
})

test('selected one-run invocation cannot imply full certification', () => {
    const advisory = evaluateFingerprint(pinned({ load1: 0.5 }))
    const text = formatReport(
        fixture(advisory, {
            certified: false,
            reasons: ['runs 1 != 5'],
            requiredRuns: 5,
        })
    )

    assert.match(text, /engine benchmark certification: NOT CERTIFIED/)
    assert.match(text, /^ {2}geometry: BLOCK /m)
    assert.match(text, /^ {2}script: BLOCK /m)
})

test('source identity changes for tracked/untracked code but excludes protected iteration-13', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ani-source-identity-'))
    try {
        await mkdir(join(directory, 'packages/layout/src'), { recursive: true })
        await mkdir(join(directory, 'bench/layout/iteration-13'), {
            recursive: true,
        })
        await writeFile(
            join(directory, 'packages/layout/src/source.ts'),
            'export const value = 1\n'
        )
        execFileSync('git', ['init', '-q'], { cwd: directory })
        execFileSync('git', ['config', 'user.email', 'fixture@example.test'], {
            cwd: directory,
        })
        execFileSync('git', ['config', 'user.name', 'Fixture'], {
            cwd: directory,
        })
        execFileSync('git', ['add', '.'], { cwd: directory })
        execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: directory })

        const clean = collectSourceIdentity(directory)
        await writeFile(
            join(directory, 'packages/layout/src/source.ts'),
            'export const value = 2\n'
        )
        const trackedDirty = collectSourceIdentity(directory)
        assert.notEqual(trackedDirty, clean)

        await writeFile(
            join(directory, 'packages/layout/src/untracked.ts'),
            'export const untracked = true\n'
        )
        const untrackedDirty = collectSourceIdentity(directory)
        assert.notEqual(untrackedDirty, trackedDirty)

        await writeFile(
            join(directory, 'bench/layout/iteration-13/user-evidence.txt'),
            'protected user evidence A\n'
        )
        const protectedA = collectSourceIdentity(directory)
        await writeFile(
            join(directory, 'bench/layout/iteration-13/user-evidence.txt'),
            'protected user evidence B\n'
        )
        const protectedB = collectSourceIdentity(directory)
        assert.equal(protectedB, protectedA)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('source identity covers manifests/lock/untracked browser+release tests and excludes logs/results/.trace', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ani-source-provenance-'))
    try {
        await mkdir(join(directory, 'packages/core'), { recursive: true })
        await mkdir(join(directory, 'tests/browser'), { recursive: true })
        await mkdir(join(directory, 'tests/release'), { recursive: true })
        await mkdir(join(directory, 'bench/layout/results'), {
            recursive: true,
        })
        await mkdir(join(directory, '.trace'), { recursive: true })
        await writeFile(join(directory, 'package.json'), '{"private":true}\n')
        await writeFile(
            join(directory, 'packages/core/package.json'),
            '{"name":"fixture-core","version":"1.0.0"}\n'
        )
        await writeFile(
            join(directory, 'pnpm-lock.yaml'),
            'lockfileVersion: 9\n'
        )
        execFileSync('git', ['init', '-q'], { cwd: directory })
        execFileSync('git', ['config', 'user.email', 'fixture@example.test'], {
            cwd: directory,
        })
        execFileSync('git', ['config', 'user.name', 'Fixture'], {
            cwd: directory,
        })
        execFileSync('git', ['add', '.'], { cwd: directory })
        execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: directory })

        const clean = collectSourceIdentity(directory)
        await writeFile(join(directory, 'package.json'), '{"private":false}\n')
        const rootManifest = collectSourceIdentity(directory)
        assert.notEqual(rootManifest, clean)

        await writeFile(
            join(directory, 'packages/core/package.json'),
            '{"name":"fixture-core","version":"2.0.1"}\n'
        )
        const packageManifest = collectSourceIdentity(directory)
        assert.notEqual(packageManifest, rootManifest)

        await writeFile(
            join(directory, 'pnpm-lock.yaml'),
            'lockfileVersion: 9\na: b\n'
        )
        const lock = collectSourceIdentity(directory)
        assert.notEqual(lock, packageManifest)

        await writeFile(
            join(directory, 'tests/browser/release.test.ts'),
            'export const release = true\n'
        )
        const untrackedBrowserTest = collectSourceIdentity(directory)
        assert.notEqual(untrackedBrowserTest, lock)

        await writeFile(
            join(directory, 'tests/release/contract.test.ts'),
            'export const contract = true\n'
        )
        const untrackedReleaseTest = collectSourceIdentity(directory)
        assert.notEqual(untrackedReleaseTest, untrackedBrowserTest)

        await writeFile(
            join(directory, 'bench/layout/local-run.log'),
            'log A\n'
        )
        const logA = collectSourceIdentity(directory)
        await writeFile(
            join(directory, 'bench/layout/local-run.log'),
            'log B\n'
        )
        const logB = collectSourceIdentity(directory)
        assert.equal(logB, logA)

        await writeFile(
            join(directory, 'bench/layout/results/report.json'),
            '{"run":"A"}\n'
        )
        const resultA = collectSourceIdentity(directory)
        await writeFile(
            join(directory, 'bench/layout/results/report.json'),
            '{"run":"B"}\n'
        )
        const resultB = collectSourceIdentity(directory)
        assert.equal(resultB, resultA)

        await writeFile(join(directory, '.trace/phase.md'), 'trace A\n')
        const traceA = collectSourceIdentity(directory)
        await writeFile(join(directory, '.trace/phase.md'), 'trace B\n')
        const traceB = collectSourceIdentity(directory)
        assert.equal(traceB, traceA)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})
