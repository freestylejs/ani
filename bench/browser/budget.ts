import type { ResultRow } from './report.ts'

/** Release budgets for one element count, stored in `budget.json`. */
export interface Budget {
    /** Element count the budget applies to. */
    n: number
    /** Maximum script p95 per frame of `raf-timelines` (ms). */
    rafTimelinesP95Ms: number
    /** Maximum script p95 per frame of `raf-group` (ms). */
    rafGroupP95Ms: number
    /** Minimum `groupGain`: `raf-timelines` p95 over `raf-group` p95. */
    minGroupGain: number
    /** Maximum style recalcs per frame of `raf-read`. */
    maxRafReadStyleRecalcsPerFrame: number
}

/** Metrics derived from several scenarios at one element count. */
export interface DerivedMetrics {
    n: number
    /** Median script p95 of `raf-timelines` over that of `raf-group`. */
    groupGain: number
    /** CDP style recalculations per frame of `raf-read`. */
    rafReadStyleRecalcsPerFrame: number
    /** CDP style recalculations per frame of `raf-thrash`. */
    rafThrashStyleRecalcsPerFrame: number
    /** CDP layouts per frame of `raf-read`. */
    rafReadLayoutsPerFrame: number
}

export interface BudgetCheck {
    name: string
    ok: boolean
    message: string
}

/** Scenarios the budget needs, in run order. */
export const BUDGET_SCENARIOS: readonly string[] = [
    'raf-timelines',
    'raf-group',
    'raf-read',
]

/** Element count the release budgets are measured at. */
export const BUDGET_N = 5000
/** The amended group guard: `rafGroup` at least this much faster. */
export const MIN_GROUP_GAIN = 2.5
/** One recalc per frame is the browser's own; the 5% is measurement slack. */
export const MAX_READ_STYLE_RECALCS_PER_FRAME = 1.05
/** Headroom applied to a measured p95 when a budget is written. */
export const BUDGET_HEADROOM = 1.25

function find(
    rows: readonly ResultRow[],
    scenario: string,
    n: number
): ResultRow | undefined {
    return rows.find((row) => row.scenario === scenario && row.n === n)
}

/**
 * Derived metrics per element count, in row order. A value is `NaN` when the
 * scenarios it needs were not run at that count.
 */
export function deriveMetrics(rows: readonly ResultRow[]): DerivedMetrics[] {
    const ns = [...new Set(rows.map((row) => row.n))]
    return ns.map((n) => {
        const timelines = find(rows, 'raf-timelines', n)
        const group = find(rows, 'raf-group', n)
        return {
            n,
            groupGain:
                timelines && group
                    ? timelines.metrics.tickP95 / group.metrics.tickP95
                    : Number.NaN,
            rafReadStyleRecalcsPerFrame:
                find(rows, 'raf-read', n)?.metrics.styleRecalcsPerFrame ??
                Number.NaN,
            rafThrashStyleRecalcsPerFrame:
                find(rows, 'raf-thrash', n)?.metrics.styleRecalcsPerFrame ??
                Number.NaN,
            rafReadLayoutsPerFrame:
                find(rows, 'raf-read', n)?.metrics.layoutsPerFrame ??
                Number.NaN,
        }
    })
}

/** Rounds up to 0.1, ignoring floating point noise below 1e-6. */
function ceilTenth(value: number): number {
    return Math.ceil(Number((value * 10).toFixed(6))) / 10
}

function measured(rows: readonly ResultRow[], scenario: string, n: number) {
    const row = find(rows, scenario, n)
    if (!row) throw new Error(`budget needs ${scenario} at n=${n}`)
    return row
}

/** Budget written by `--update-budget` from a fresh run at `n`. */
export function createBudget(rows: readonly ResultRow[], n: number): Budget {
    return {
        n,
        rafTimelinesP95Ms: ceilTenth(
            measured(rows, 'raf-timelines', n).metrics.tickP95 * BUDGET_HEADROOM
        ),
        rafGroupP95Ms: ceilTenth(
            measured(rows, 'raf-group', n).metrics.tickP95 * BUDGET_HEADROOM
        ),
        minGroupGain: MIN_GROUP_GAIN,
        maxRafReadStyleRecalcsPerFrame: MAX_READ_STYLE_RECALCS_PER_FRAME,
    }
}

function isBudget(value: unknown): value is Budget {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Record<keyof Budget, unknown>
    return (
        Number.isInteger(candidate.n) &&
        typeof candidate.rafTimelinesP95Ms === 'number' &&
        typeof candidate.rafGroupP95Ms === 'number' &&
        typeof candidate.minGroupGain === 'number' &&
        typeof candidate.maxRafReadStyleRecalcsPerFrame === 'number'
    )
}

/** Parse the text of `budget.json`. */
export function parseBudget(text: string): Budget {
    const parsed: unknown = JSON.parse(text)
    if (!isBudget(parsed)) {
        throw new Error(
            'invalid budget JSON: expected { n, rafTimelinesP95Ms, rafGroupP95Ms, minGroupGain, maxRafReadStyleRecalcsPerFrame }'
        )
    }
    return parsed
}

/** Serialize a budget with the repo's 4-space indentation. */
export function stringifyBudget(budget: Budget): string {
    return `${JSON.stringify(budget, null, 4)}\n`
}

function limit(
    name: string,
    value: number,
    bound: number,
    kind: 'max' | 'min',
    unit: string
): BudgetCheck {
    const ok = kind === 'max' ? value <= bound : value >= bound
    const shown = `${value.toFixed(3)}${unit}`
    const relation = kind === 'max' ? '<=' : '>='
    return {
        name,
        ok,
        message: `${ok ? 'ok  ' : 'FAIL'} ${name}: ${shown} (${relation} ${bound}${unit})`,
    }
}

/** Compares a run against the budget. A missing or `NaN` value fails. */
export function checkBudget(
    rows: readonly ResultRow[],
    budget: Budget
): BudgetCheck[] {
    const { n } = budget
    const derived = deriveMetrics(rows).find((entry) => entry.n === n)
    return [
        limit(
            'raf-timelines script p95',
            find(rows, 'raf-timelines', n)?.metrics.tickP95 ?? Number.NaN,
            budget.rafTimelinesP95Ms,
            'max',
            ' ms'
        ),
        limit(
            'raf-group script p95',
            find(rows, 'raf-group', n)?.metrics.tickP95 ?? Number.NaN,
            budget.rafGroupP95Ms,
            'max',
            ' ms'
        ),
        limit(
            'groupGain',
            derived?.groupGain ?? Number.NaN,
            budget.minGroupGain,
            'min',
            'x'
        ),
        limit(
            'raf-read style recalcs per frame',
            derived?.rafReadStyleRecalcsPerFrame ?? Number.NaN,
            budget.maxRafReadStyleRecalcsPerFrame,
            'max',
            ''
        ),
    ]
}
