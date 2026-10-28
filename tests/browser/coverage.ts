// Coverage of the layout DOM engine where its tests run: V8 precise coverage
// of every Chromium case page, mapped through the bundle's inline source map
// to `packages/layout/src` (the converter vitest's v8 provider uses), merged
// over all cases and gated by `ENGINE_FLOORS`. jsdom has no layout, so these
// files are excluded from the vitest coverage (vitest.config.ts).
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'acorn'
import convert from 'ast-v8-to-istanbul'
import libCoverage from 'istanbul-lib-coverage'
import type { CDPSession } from 'playwright'

const SCRIPT = /\/cases\.js$/
const BUNDLE_URL = pathToFileURL(resolve('tests/browser/cases.js')).href
const INLINE_MAP =
    /\n\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\s*$/

/** The layout files only real layout can run (sources relative to the repo). */
const ENGINE_FILES = [
    'packages/layout/src/scope.ts',
    'packages/layout/src/dom.ts',
    'packages/layout/src/runtime.ts',
    'packages/layout/src/realize/raf.ts',
    'packages/layout/src/realize/waapi.ts',
]

/**
 * Floors a few points below the measured values (2026-10-23, all Chromium
 * modules: 92.6 / 83.4 / 97.9 / 95.4), as in vitest.config.ts.
 */
const ENGINE_FLOORS = {
    statements: 90,
    branches: 80,
    functions: 95,
    lines: 92,
} as const

type Metric = keyof typeof ENGINE_FLOORS

interface Bundle {
    readonly code: string
    readonly map: {
        version: number
        sources: string[]
        names: string[]
        mappings: string
    }
    /** Parsed on the first case that runs it. */
    ast: ReturnType<typeof parse> | null
    readonly covers: boolean
}

export class EngineCoverage {
    private readonly map = libCoverage.createCoverageMap({})
    private readonly bundles = new Map<string, Bundle>()
    private readonly files = new Set(ENGINE_FILES.map((file) => resolve(file)))

    /**
     * Whether a case page is instrumented: its bundle contains engine
     * sources and the case measures no time (instrumentation slows the code).
     */
    wants(code: string, timed: boolean): boolean {
        return !timed && this.bundle(code).covers
    }

    /** Before the page loads its module. */
    async start(session: CDPSession): Promise<void> {
        await session.send('Profiler.enable')
        await session.send('Profiler.startPreciseCoverage', {
            callCount: true,
            detailed: true,
        })
    }

    /** After the case: adds what the page's module ran. */
    async take(session: CDPSession, code: string): Promise<void> {
        const { result } = await session.send('Profiler.takePreciseCoverage')
        await session.send('Profiler.stopPreciseCoverage')
        const script = result.find((entry) => SCRIPT.test(entry.url))
        if (!script) return
        const bundle = this.bundle(code)
        bundle.ast ??= parse(code, {
            ecmaVersion: 'latest',
            sourceType: 'module',
        })
        const data = await convert({
            code: bundle.code,
            sourceMap: bundle.map,
            ast: bundle.ast as never,
            // the page's URL is not a file; the map names the sources
            coverage: { url: BUNDLE_URL, functions: script.functions },
        })
        for (const [file, coverage] of Object.entries(data)) {
            if (this.files.has(file)) this.map.addFileCoverage(coverage)
        }
    }

    /** Per-file table; with `gate` (a full run), returns what misses a floor. */
    report(write: (line: string) => void, gate: boolean): string[] {
        const total = libCoverage.createCoverageSummary()
        const rows: string[] = []
        for (const file of ENGINE_FILES) {
            const path = resolve(file)
            if (!this.map.files().includes(path)) {
                rows.push(`  ${file}: not loaded`)
                continue
            }
            const coverage = this.map.fileCoverageFor(path)
            const summary = coverage.toSummary()
            total.merge(summary)
            const uncovered = coverage.getUncoveredLines()
            rows.push(
                `  ${file}: ${format(summary)}${uncovered.length > 0 ? `; uncovered lines ${uncovered.join(',')}` : ''}`
            )
        }
        write('\nlayout engine coverage (Chromium):')
        for (const row of rows) write(row)
        write(`  all: ${format(total)}`)
        const failures: string[] = []
        if (!gate) return failures
        if (rows.some((row) => row.endsWith('not loaded'))) {
            failures.push('an engine file was never loaded')
        }
        for (const metric of Object.keys(ENGINE_FLOORS) as Metric[]) {
            const pct = total[metric].pct
            if (pct < ENGINE_FLOORS[metric]) {
                failures.push(
                    `engine ${metric} ${pct}% is below the floor ${ENGINE_FLOORS[metric]}%`
                )
            }
        }
        return failures
    }

    private bundle(code: string): Bundle {
        const known = this.bundles.get(code)
        if (known) return known
        const match = INLINE_MAP.exec(code)
        if (!match) throw new Error('coverage: the bundle has no inline map')
        const map = JSON.parse(Buffer.from(match[1]!, 'base64').toString())
        // esbuild writes sources relative to the working directory
        map.sources = map.sources.map((source: string) => resolve(source))
        const covers = map.sources.some((source: string) =>
            this.files.has(source)
        )
        const bundle = { code, map, ast: null, covers }
        this.bundles.set(code, bundle)
        return bundle
    }
}

function format(summary: libCoverage.CoverageSummary): string {
    return (Object.keys(ENGINE_FLOORS) as Metric[])
        .map((metric) => `${metric} ${summary[metric].pct}%`)
        .join(', ')
}
