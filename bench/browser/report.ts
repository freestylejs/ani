import type { DerivedMetrics } from './budget.ts'
import type { RunMetrics } from './stats.ts'

/** One scenario × N result, already reduced to the median of its repeats. */
export interface ResultRow {
    scenario: string
    n: number
    repeats: number
    metrics: RunMetrics
}

export interface BenchMeta {
    /** ISO timestamp of the run. */
    date: string
    /** Chromium version string. */
    chromium: string
    /** Node version string. */
    node: string
    /** CPU model and the number of visible cores. */
    cpu: string
    /** Commit the benchmark ran on (`unknown` outside a git checkout). */
    commit: string
}

export interface BenchReport {
    meta: BenchMeta
    results: ResultRow[]
    /** Metrics derived across scenarios, per element count. */
    derived?: DerivedMetrics[]
}

interface MetricColumn {
    label: string
    value: (metrics: RunMetrics) => number
    decimals: number
}

const COLUMNS: readonly MetricColumn[] = [
    { label: 'tick p50', value: (metrics) => metrics.tickP50, decimals: 3 },
    { label: 'tick p95', value: (metrics) => metrics.tickP95, decimals: 3 },
    { label: 'tick max', value: (metrics) => metrics.tickMax, decimals: 3 },
    { label: 'int p50', value: (metrics) => metrics.intervalP50, decimals: 3 },
    { label: 'int p95', value: (metrics) => metrics.intervalP95, decimals: 3 },
    {
        label: 'long/s',
        value: (metrics) => metrics.longFramesPerSecond,
        decimals: 2,
    },
    {
        label: 'lay/f',
        value: (metrics) => metrics.layoutsPerFrame,
        decimals: 2,
    },
    {
        label: 'sty/f',
        value: (metrics) => metrics.styleRecalcsPerFrame,
        decimals: 2,
    },
    {
        label: 'script ms/f',
        value: (metrics) => metrics.scriptMsPerFrame,
        decimals: 3,
    },
    {
        label: 'lay ms/f',
        value: (metrics) => metrics.layoutMsPerFrame,
        decimals: 3,
    },
    {
        label: 'sty ms/f',
        value: (metrics) => metrics.styleMsPerFrame,
        decimals: 3,
    },
    { label: 'setup ms', value: (metrics) => metrics.setupMs, decimals: 3 },
]

function formatNumber(
    value: number,
    decimals: number,
    signed: boolean
): string {
    if (!Number.isFinite(value)) return '-'
    const text = value.toFixed(decimals)
    return signed && value >= 0 ? `+${text}` : text
}

function renderTable(
    header: readonly string[],
    rows: readonly (readonly string[])[]
): string {
    const widths = header.map((cell, index) =>
        Math.max(cell.length, ...rows.map((row) => (row[index] ?? '').length))
    )
    const renderRow = (cells: readonly string[]): string =>
        cells
            .map((cell, index) =>
                index === 0
                    ? cell.padEnd(widths[index]!)
                    : cell.padStart(widths[index]!)
            )
            .join('  ')
    return [renderRow(header), ...rows.map(renderRow)].join('\n')
}

/** Fixed-width table of the derived metrics, `-` where a scenario was not run. */
export function formatDerived(derived: readonly DerivedMetrics[]): string {
    const body = derived.map((entry) => [
        String(entry.n),
        formatNumber(entry.groupGain, 2, false),
        formatNumber(entry.rafReadLayoutsPerFrame, 2, false),
        formatNumber(entry.rafThrashLayoutsPerFrame, 2, false),
    ])
    return renderTable(
        ['n', 'groupGain', 'raf-read lay/f', 'raf-thrash lay/f'],
        body
    )
}

function headerCells(): string[] {
    return ['scenario', 'n', ...COLUMNS.map((column) => column.label)]
}

/** Fixed-width table of the measured medians. */
export function formatResults(rows: readonly ResultRow[]): string {
    const body = rows.map((row) => [
        row.scenario,
        String(row.n),
        ...COLUMNS.map((column) =>
            formatNumber(column.value(row.metrics), column.decimals, false)
        ),
    ])
    return renderTable(headerCells(), body)
}

/**
 * Fixed-width table of per-metric deltas against a previous report. Rows are
 * matched by scenario name and element count.
 */
export function formatDeltaTable(
    rows: readonly ResultRow[],
    baseline: BenchReport
): string {
    const byKey = new Map(
        baseline.results.map((row) => [`${row.scenario}#${row.n}`, row])
    )
    const body = rows.map((row) => {
        const base = byKey.get(`${row.scenario}#${row.n}`)
        return [
            row.scenario,
            String(row.n),
            ...COLUMNS.map((column) =>
                base
                    ? formatNumber(
                          column.value(row.metrics) -
                              column.value(base.metrics),
                          column.decimals,
                          true
                      )
                    : '-'
            ),
        ]
    })
    return renderTable(headerCells(), body)
}

function isBenchReport(value: unknown): value is BenchReport {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as { meta?: unknown; results?: unknown }
    return (
        typeof candidate.meta === 'object' &&
        candidate.meta !== null &&
        Array.isArray(candidate.results)
    )
}

/** Parse a report written by a previous run. */
export function parseReport(text: string): BenchReport {
    const parsed: unknown = JSON.parse(text)
    if (!isBenchReport(parsed)) {
        throw new Error('invalid benchmark JSON: expected { meta, results }')
    }
    return parsed
}

/**
 * Serialize a report for `results/` (pretty-printed with the repo's 4-space
 * indentation, so a freshly written report passes `biome check` untouched).
 */
export function stringifyReport(report: BenchReport): string {
    return `${JSON.stringify(report, null, 4)}\n`
}
