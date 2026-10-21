import assert from 'node:assert'
import test from 'node:test'
import {
    checkBudget,
    createBudget,
    deriveMetrics,
    GROUP_P95_HARD_MS,
    MAX_READ_STYLE_RECALCS_PER_FRAME,
    MIN_GROUP_GAIN,
    parseBudget,
    stringifyBudget,
} from './budget.ts'
import { formatDerived, type ResultRow } from './report.ts'
import type { RunMetrics } from './stats.ts'

function mockMetrics(overrides: Partial<RunMetrics> = {}): RunMetrics {
    return {
        tickP50: 1,
        tickP95: 2,
        tickMax: 3,
        intervalP50: 16.7,
        intervalP95: 16.7,
        longFramesPerSecond: 0,
        layoutsPerFrame: 0,
        styleRecalcsPerFrame: 1,
        scriptMsPerFrame: 2,
        layoutMsPerFrame: 0,
        styleMsPerFrame: 1,
        setupMs: 10,
        ...overrides,
    }
}

function mockRow(
    scenario: string,
    n: number,
    overrides: Partial<RunMetrics> = {}
): ResultRow {
    return {
        scenario,
        n,
        repeats: 1,
        metrics: mockMetrics(overrides),
    }
}

test('parseBudget accepts valid budget with maxRafReadStyleRecalcsPerFrame', () => {
    const json = JSON.stringify({
        n: 5000,
        rafTimelinesP95Ms: 19.9,
        rafGroupP95Ms: 8.9,
        minGroupGain: 2.5,
        maxRafReadStyleRecalcsPerFrame: 1.05,
    })
    const budget = parseBudget(json)
    assert.strictEqual(budget.n, 5000)
    assert.strictEqual(budget.maxRafReadStyleRecalcsPerFrame, 1.05)
    assert.strictEqual(
        stringifyBudget(budget),
        `${JSON.stringify(JSON.parse(json), null, 4)}\n`
    )
})

test('parseBudget rejects legacy budget with maxRafReadLayoutsPerFrame', () => {
    const legacy = JSON.stringify({
        n: 5000,
        rafTimelinesP95Ms: 19.9,
        rafGroupP95Ms: 8.9,
        minGroupGain: 2.5,
        maxRafReadLayoutsPerFrame: 1.05,
    })
    assert.throws(() => parseBudget(legacy), /invalid budget JSON/)
})

test('createBudget initializes maxRafReadStyleRecalcsPerFrame to 1.05', () => {
    const rows: ResultRow[] = [
        mockRow('raf-timelines', 5000, { tickP95: 16 }),
        mockRow('raf-group', 5000, { tickP95: 7 }),
        mockRow('raf-read', 5000, { styleRecalcsPerFrame: 1.0 }),
    ]
    const budget = createBudget(rows, 5000)
    assert.strictEqual(
        budget.maxRafReadStyleRecalcsPerFrame,
        MAX_READ_STYLE_RECALCS_PER_FRAME
    )
    assert.strictEqual(MIN_GROUP_GAIN, 2.5)
    assert.strictEqual(GROUP_P95_HARD_MS, 4.5)
    assert.strictEqual(budget.minGroupGain, MIN_GROUP_GAIN)
    assert.strictEqual(budget.minGroupGain, 2.5)
    assert.strictEqual(budget.rafTimelinesP95Ms, 20)
    assert.strictEqual(budget.rafGroupP95Ms, 4.5)
})

test('createBudget clamps a 4.0 ms group measurement to the 4.5 ms hard budget', () => {
    const rows: ResultRow[] = [
        mockRow('raf-timelines', 5000, { tickP95: 16 }),
        mockRow('raf-group', 5000, { tickP95: 4.0 }),
        mockRow('raf-read', 5000, { styleRecalcsPerFrame: 1.0 }),
    ]
    const budget = createBudget(rows, 5000)
    assert.strictEqual(budget.rafGroupP95Ms, 4.5)
    assert.notStrictEqual(budget.rafGroupP95Ms, 5.0)
})

test('createBudget keeps measured headroom when it is below the group hard budget', () => {
    const rows: ResultRow[] = [
        mockRow('raf-timelines', 5000, { tickP95: 16 }),
        mockRow('raf-group', 5000, { tickP95: 3.0 }),
        mockRow('raf-read', 5000, { styleRecalcsPerFrame: 1.0 }),
    ]
    const budget = createBudget(rows, 5000)
    assert.strictEqual(budget.rafGroupP95Ms, 3.8)
})

test('deriveMetrics computes style recalcs for raf-read and raf-thrash and layout for raf-read', () => {
    const rows: ResultRow[] = [
        mockRow('raf-timelines', 5000, { tickP95: 18 }),
        mockRow('raf-group', 5000, { tickP95: 6 }),
        mockRow('raf-read', 5000, {
            styleRecalcsPerFrame: 1.01,
            layoutsPerFrame: 0.0,
        }),
        mockRow('raf-thrash', 5000, {
            styleRecalcsPerFrame: 5000.0,
            layoutsPerFrame: 0.0,
        }),
    ]
    const [derived] = deriveMetrics(rows)
    assert.ok(derived)
    assert.strictEqual(derived.groupGain, 3)
    assert.strictEqual(derived.rafReadStyleRecalcsPerFrame, 1.01)
    assert.strictEqual(derived.rafThrashStyleRecalcsPerFrame, 5000.0)
    assert.strictEqual(derived.rafReadLayoutsPerFrame, 0.0)
})

test('formatDerived renders the updated column headers', () => {
    const table = formatDerived([
        {
            n: 5000,
            groupGain: 3.0,
            rafReadStyleRecalcsPerFrame: 1.0,
            rafThrashStyleRecalcsPerFrame: 5000.0,
            rafReadLayoutsPerFrame: 0.0,
        },
    ])
    assert.ok(table.includes('raf-read sty/f'))
    assert.ok(table.includes('raf-thrash sty/f'))
    assert.ok(table.includes('raf-read lay/f'))
})

test('checkBudget validates raf-read style recalcs against budget', () => {
    const budget = {
        n: 5000,
        rafTimelinesP95Ms: 20,
        rafGroupP95Ms: 10,
        minGroupGain: 2.5,
        maxRafReadStyleRecalcsPerFrame: 1.05,
    }

    const passingRows: ResultRow[] = [
        mockRow('raf-timelines', 5000, { tickP95: 15 }),
        mockRow('raf-group', 5000, { tickP95: 5 }),
        mockRow('raf-read', 5000, { styleRecalcsPerFrame: 1.0 }),
    ]
    const passingChecks = checkBudget(passingRows, budget)
    assert.strictEqual(passingChecks.length, 4)
    assert.ok(passingChecks.every((check) => check.ok))
    const styleCheck = passingChecks.find(
        (check) => check.name === 'raf-read style recalcs per frame'
    )
    assert.ok(styleCheck)
    assert.ok(styleCheck.ok)

    const failingRows: ResultRow[] = [
        mockRow('raf-timelines', 5000, { tickP95: 15 }),
        mockRow('raf-group', 5000, { tickP95: 5 }),
        mockRow('raf-read', 5000, { styleRecalcsPerFrame: 1.5 }),
    ]
    const failingChecks = checkBudget(failingRows, budget)
    const failingStyleCheck = failingChecks.find(
        (check) => check.name === 'raf-read style recalcs per frame'
    )
    assert.ok(failingStyleCheck)
    assert.strictEqual(failingStyleCheck.ok, false)
})
