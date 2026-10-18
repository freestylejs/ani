import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Browser, type CDPSession, chromium, type Route } from 'playwright'
import {
    type BenchMeta,
    type BenchReport,
    formatDeltaTable,
    formatResults,
    parseReport,
    type ResultRow,
    stringifyReport,
} from './report.ts'
import {
    installBench,
    readPerf,
    resetPerf,
    SCENARIOS,
    type ScenarioDefinition,
    stopAll,
} from './scenarios.ts'
import {
    computeMetrics,
    medianMetrics,
    type PerfDelta,
    type RunMetrics,
} from './stats.ts'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PAGE_URL = 'http://ani.bench/page.html'
const PAGE_ROUTE = 'http://ani.bench/**'
const DEFAULT_OUT = join(REPO_ROOT, 'bench/browser/results/latest.json')
const DEFAULT_NS = [1000, 5000]
const DEFAULT_REPEATS = 3
const DEFAULT_WARM_UP_MS = 1000
const DEFAULT_MEASURE_MS = 3000
const SMOKE_N = 50
const SMOKE_WARM_UP_MS = 200
const SMOKE_MEASURE_MS = 500

const USAGE = `ANI real-browser frame benchmark

Usage:
  pnpm bench:browser [options]

Options:
  --scenario <name>   scenario to run, repeatable (default: all)
  --n <count>         element count, repeatable (default: 1000, 5000)
  --repeats <k>       measured repeats per scenario (default: 3)
  --out <file>        JSON output path (default: bench/browser/results/latest.json)
  --compare <file>    print per-metric deltas against a previous JSON report
  --smoke             fast run: n=50, 0.2s warm-up, 0.5s measure, 1 repeat

Scenarios: ${SCENARIOS.map((scenario) => scenario.name).join(', ')}
`

class UsageError extends Error {}

interface Options {
    scenarios: readonly ScenarioDefinition[]
    ns: readonly number[]
    repeats: number
    warmUpMs: number
    measureMs: number
    out: string
    compare: string | null
}

interface RunOutcome {
    metrics: RunMetrics
    frames: number
    errors: readonly string[]
}

function writeStderr(message: string): void {
    process.stderr.write(`${message}\n`)
}

function findScenario(name: string): ScenarioDefinition {
    const scenario = SCENARIOS.find((candidate) => candidate.name === name)
    if (!scenario) {
        const valid = SCENARIOS.map((candidate) => candidate.name).join(', ')
        throw new UsageError(`unknown scenario "${name}" (valid: ${valid})`)
    }
    return scenario
}

function parseOptions(argv: readonly string[]): Options {
    const scenarioNames: string[] = []
    const ns: number[] = []
    let repeats: number | null = null
    let out: string | null = null
    let compare: string | null = null
    let smoke = false

    const nextValue = (index: number, flag: string): string => {
        const value = argv[index + 1]
        if (value === undefined || value.startsWith('--')) {
            throw new UsageError(`${flag} requires a value`)
        }
        return value
    }
    const nextCount = (index: number, flag: string): number => {
        const value = Number(nextValue(index, flag))
        if (!Number.isInteger(value) || value <= 0) {
            throw new UsageError(`${flag} requires a positive integer`)
        }
        return value
    }

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]!
        switch (arg) {
            case '--scenario':
                scenarioNames.push(nextValue(i, arg))
                i += 1
                break
            case '--n':
                ns.push(nextCount(i, arg))
                i += 1
                break
            case '--repeats':
                repeats = nextCount(i, arg)
                i += 1
                break
            case '--out':
                out = nextValue(i, arg)
                i += 1
                break
            case '--compare':
                compare = nextValue(i, arg)
                i += 1
                break
            case '--smoke':
                smoke = true
                break
            case '--help':
            case '-h':
                throw new UsageError('')
            default:
                throw new UsageError(`unknown option "${arg}"`)
        }
    }

    const scenarios =
        scenarioNames.length === 0
            ? SCENARIOS
            : [...new Set(scenarioNames)].map(findScenario)

    return {
        scenarios,
        ns:
            ns.length === 0
                ? smoke
                    ? [SMOKE_N]
                    : DEFAULT_NS
                : [...new Set(ns)],
        repeats: repeats ?? (smoke ? 1 : DEFAULT_REPEATS),
        warmUpMs: smoke ? SMOKE_WARM_UP_MS : DEFAULT_WARM_UP_MS,
        measureMs: smoke ? SMOKE_MEASURE_MS : DEFAULT_MEASURE_MS,
        out: out === null ? DEFAULT_OUT : resolve(out),
        compare: compare === null ? null : resolve(compare),
    }
}

async function serveRoute(route: Route): Promise<void> {
    const { pathname } = new URL(route.request().url())
    if (pathname === '/page.html') {
        await route.fulfill({
            path: join(REPO_ROOT, 'bench/browser/page.html'),
            contentType: 'text/html',
        })
        return
    }
    if (pathname === '/core/index.js') {
        await route.fulfill({
            path: join(REPO_ROOT, 'packages/core/dist/index.js'),
            contentType: 'text/javascript',
        })
        return
    }
    await route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'not found',
    })
}

async function cdpMetrics(session: CDPSession): Promise<PerfDelta> {
    const { metrics } = await session.send('Performance.getMetrics')
    const values = new Map(metrics.map((metric) => [metric.name, metric.value]))
    return {
        layoutCount: values.get('LayoutCount') ?? 0,
        recalcStyleCount: values.get('RecalcStyleCount') ?? 0,
        layoutDuration: values.get('LayoutDuration') ?? 0,
        recalcStyleDuration: values.get('RecalcStyleDuration') ?? 0,
        scriptDuration: values.get('ScriptDuration') ?? 0,
    }
}

function metricsDelta(before: PerfDelta, after: PerfDelta): PerfDelta {
    return {
        layoutCount: after.layoutCount - before.layoutCount,
        recalcStyleCount: after.recalcStyleCount - before.recalcStyleCount,
        layoutDuration: after.layoutDuration - before.layoutDuration,
        recalcStyleDuration:
            after.recalcStyleDuration - before.recalcStyleDuration,
        scriptDuration: after.scriptDuration - before.scriptDuration,
    }
}

function cpuLabel(): string {
    const list = cpus()
    const model = list[0]?.model.trim() ?? 'unknown'
    return list.length === 0 ? model : `${list.length}x ${model}`
}

function commitHash(): string {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
        }).trim()
    } catch {
        return 'unknown'
    }
}

function buildMeta(browser: Browser): BenchMeta {
    return {
        date: new Date().toISOString(),
        chromium: browser.version(),
        node: process.version,
        cpu: cpuLabel(),
        commit: commitHash(),
    }
}

async function runOnce(
    browser: Browser,
    scenario: ScenarioDefinition,
    n: number,
    options: Options
): Promise<RunOutcome> {
    const context = await browser.newContext()
    const errors: string[] = []
    try {
        const page = await context.newPage()
        page.on('pageerror', (error) => {
            errors.push(`pageerror: ${error.message}`)
            writeStderr(`pageerror: ${error.message}`)
        })
        page.on('console', (message) => {
            if (message.type() !== 'error') return
            errors.push(`console.error: ${message.text()}`)
            writeStderr(`console.error: ${message.text()}`)
        })
        await page.route(PAGE_ROUTE, serveRoute)
        await page.goto(PAGE_URL)
        await page.waitForFunction(() => Boolean(window.__aniReady))
        await page.evaluate(installBench)

        const session = await context.newCDPSession(page)
        await session.send('Performance.enable')
        const setup = await page.evaluate(scenario.setup, { n })

        await page.waitForTimeout(options.warmUpMs)
        await page.evaluate(resetPerf)
        const before = await cdpMetrics(session)
        await page.waitForTimeout(options.measureMs)
        const sample = await page.evaluate(readPerf)
        const after = await cdpMetrics(session)
        await page.evaluate(stopAll)

        return {
            metrics: computeMetrics(
                sample,
                metricsDelta(before, after),
                setup.setupMs,
                options.measureMs / 1000
            ),
            frames: sample.frames.length,
            errors,
        }
    } finally {
        await context.close()
    }
}

async function collect(
    browser: Browser,
    options: Options
): Promise<{ rows: ResultRow[]; errorCount: number }> {
    const rows: ResultRow[] = []
    let errorCount = 0
    for (const scenario of options.scenarios) {
        for (const n of options.ns) {
            const runs: RunMetrics[] = []
            for (let repeat = 1; repeat <= options.repeats; repeat++) {
                const outcome = await runOnce(browser, scenario, n, options)
                errorCount += outcome.errors.length
                runs.push(outcome.metrics)
                process.stdout.write(
                    `${scenario.name} n=${n} repeat ${repeat}/${options.repeats}:` +
                        ` ${outcome.frames} frames,` +
                        ` tick p50 ${outcome.metrics.tickP50.toFixed(3)} ms\n`
                )
            }
            rows.push({
                scenario: scenario.name,
                n,
                repeats: options.repeats,
                metrics: medianMetrics(runs),
            })
        }
    }
    return { rows, errorCount }
}

async function runBenchmark(): Promise<number> {
    const options = parseOptions(process.argv.slice(2))
    const baseline = options.compare
        ? parseReport(readFileSync(options.compare, 'utf8'))
        : null

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
        ],
    })
    try {
        const { rows, errorCount } = await collect(browser, options)
        const report: BenchReport = {
            meta: buildMeta(browser),
            results: rows,
        }
        mkdirSync(dirname(options.out), { recursive: true })
        writeFileSync(options.out, stringifyReport(report))
        process.stdout.write(`\n${formatResults(rows)}\n`)
        if (baseline) {
            process.stdout.write(
                `\ndelta vs ${options.compare}\n` +
                    `${formatDeltaTable(rows, baseline)}\n`
            )
        }
        process.stdout.write(
            `\nwrote ${options.out} (${errorCount} page errors)\n`
        )
        return errorCount === 0 ? 0 : 1
    } finally {
        await browser.close()
    }
}

async function main(): Promise<void> {
    try {
        process.exitCode = await runBenchmark()
    } catch (error) {
        writeStderr(error instanceof Error ? error.message : String(error))
        if (error instanceof UsageError) process.stderr.write(`\n${USAGE}\n`)
        process.exitCode = 1
    }
}

main().catch((error: unknown) => {
    writeStderr(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
