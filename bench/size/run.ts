import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build, type Plugin } from 'esbuild'
import { SCENARIOS } from './scenarios.ts'

const BENCH_DIR = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(BENCH_DIR, '../..')
const BUDGET_FILE = resolve(BENCH_DIR, 'budget.json')

const CORE_DIST = resolve(REPO_ROOT, 'packages/core/dist/index.js')
const VALUES_DIST = resolve(REPO_ROOT, 'packages/core/dist/values.js')
const TESTING_DIST = resolve(REPO_ROOT, 'packages/core/dist/testing.js')

interface BudgetEntry {
    gzip: number
}

type BudgetMap = Record<string, BudgetEntry>

interface ScenarioResult {
    name: string
    minBytes: number
    gzipBytes: number
    budget: number | null
    status: 'PASS' | 'FAIL'
}

const sizePlugin: Plugin = {
    name: 'ani-size-bench',
    setup(buildContext) {
        buildContext.onResolve(
            { filter: /^(core|@freestylejs\/ani-core)$/ },
            () => ({ path: CORE_DIST })
        )
        buildContext.onResolve(
            { filter: /^(values|@freestylejs\/ani-core\/values)$/ },
            () => ({ path: VALUES_DIST })
        )
        buildContext.onResolve(
            { filter: /^(testing|@freestylejs\/ani-core\/testing)$/ },
            () => ({ path: TESTING_DIST })
        )
        buildContext.onLoad({ filter: /index\.js$/ }, (args) => {
            if (args.path === CORE_DIST) {
                let code = readFileSync(args.path, 'utf8')
                code +=
                    '\nexport { ani, sequence, parallel, stagger, webTimeline as waapiTimeline, T as timing };'
                return { contents: code, loader: 'js' }
            }
            return undefined
        })
    },
}

const BUDGET_HEADROOM = 1.1
const BUDGET_ROUNDING = 100

function computeBudget(gzipBytes: number): number {
    return (
        Math.ceil((gzipBytes * BUDGET_HEADROOM) / BUDGET_ROUNDING) *
        BUDGET_ROUNDING
    )
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

async function run(update: boolean): Promise<number> {
    if (!existsSync(CORE_DIST) || !existsSync(VALUES_DIST)) {
        process.stderr.write(
            'Built packages not found in packages/core/dist. Run `pnpm --filter @freestylejs/ani-core build` first.\n'
        )
        return 1
    }

    let budgetMap: BudgetMap = {}
    if (update) {
        budgetMap = {}
    } else {
        if (!existsSync(BUDGET_FILE)) {
            process.stderr.write(
                `Budget file not found: ${BUDGET_FILE}. Run with --update to create it.\n`
            )
            return 1
        }
        try {
            budgetMap = JSON.parse(
                readFileSync(BUDGET_FILE, 'utf8')
            ) as BudgetMap
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            process.stderr.write(`Failed to parse ${BUDGET_FILE}: ${message}\n`)
            return 1
        }
    }

    const results: ScenarioResult[] = []
    let hasFailure = false

    for (const scenario of SCENARIOS) {
        const buildResult = await build({
            stdin: {
                contents: scenario.entry,
                resolveDir: REPO_ROOT,
                sourcefile: `${scenario.name}-entry.js`,
            },
            bundle: true,
            minify: true,
            treeShaking: true,
            format: 'esm',
            platform: 'browser',
            write: false,
            plugins: [sizePlugin],
        })

        const output = buildResult.outputFiles[0]
        if (!output) {
            throw new Error(
                `esbuild did not produce any output for ${scenario.name}`
            )
        }

        const minBytes = output.contents.byteLength
        const gzipBytes = gzipSync(output.contents, { level: 9 }).byteLength

        if (update) {
            const budget = computeBudget(gzipBytes)
            budgetMap[scenario.name] = { gzip: budget }
            results.push({
                name: scenario.name,
                minBytes,
                gzipBytes,
                budget,
                status: 'PASS',
            })
        } else {
            const budgetEntry = budgetMap[scenario.name]
            const budget = budgetEntry ? budgetEntry.gzip : null
            const pass = budget !== null && gzipBytes <= budget
            if (!pass) {
                hasFailure = true
            }
            results.push({
                name: scenario.name,
                minBytes,
                gzipBytes,
                budget,
                status: pass ? 'PASS' : 'FAIL',
            })
        }
    }

    const HEADER = [
        'scenario',
        'min bytes',
        'gzip bytes',
        'budget',
        'status',
    ] as const
    const rows = results.map((r) => [
        r.name,
        String(r.minBytes),
        String(r.gzipBytes),
        r.budget === null ? '-' : String(r.budget),
        r.status,
    ])

    process.stdout.write(`\n${renderTable(HEADER, rows)}\n\n`)

    if (update) {
        writeFileSync(BUDGET_FILE, `${JSON.stringify(budgetMap, null, 4)}\n`)
        process.stdout.write(`Wrote updated budget to ${BUDGET_FILE}\n`)
        return 0
    }

    if (hasFailure) {
        process.stderr.write('Bundle size budget exceeded.\n')
        return 1
    }

    return 0
}

async function main(): Promise<void> {
    const update = process.argv.includes('--update')
    const exitCode = await run(update)
    process.exitCode = exitCode
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
})
