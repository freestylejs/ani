import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import {
    type Browser,
    type BrowserContext,
    type BrowserType,
    type CDPSession,
    chromium,
    firefox,
    type Page,
    type Route,
    webkit,
} from 'playwright'
import { type BrowserVariant, bundleForBrowser } from './bundle.ts'
import { EngineCoverage } from './coverage.ts'
import { renderToMarkup } from './ssr.ts'

declare global {
    interface Window {
        __ready?: boolean
        __loadError?: string
        __cases: Record<string, unknown>
    }
}

const ORIGIN = 'http://ani.test'
const MODULES = [
    'core',
    'react',
    'vue',
    'solid',
    'svelte',
    'layout',
    'layout_spring',
    'layout_meas',
    'layout_ops',
    'react_layout',
    'acceptance',
    'showcase',
    'regressions',
    'waapi',
    'react_layout_r18',
    'acceptance_r18',
    'acceptance_rc',
    'acceptance_r18c',
] as const
/**
 * Modules built against React 18.3 and/or with the React Compiler applied to
 * the showcase fixtures (the same cases, re-exported).
 */
const VARIANTS: Partial<Record<(typeof MODULES)[number], BrowserVariant>> = {
    react_layout_r18: { react18: true },
    acceptance_r18: { react18: true },
    acceptance_rc: { compiler: true },
    acceptance_r18c: { react18: true, compiler: true },
}
const CASE_TIMEOUT_MS = 10_000
const LOAD_TIMEOUT_MS = 10_000

const USAGE = `ANI real-browser binding tests

Usage:
  pnpm test:browser [options]

Options:
  --case <glob>   run matching cases only, repeatable (e.g. "react:*", "core:C1")
  --browser <name> chromium | firefox | webkit (default: chromium)
  --headed        show the browser window
  --coverage      report the layout engine's coverage; a full run gates it (Chromium)
  --list          print the case ids and exit

Modules: ${MODULES.join(', ')}
`

class UsageError extends Error {}

type ModuleName = (typeof MODULES)[number]

interface PageOptions {
    reducedMotion?: 'reduce' | 'no-preference'
    ssr?: boolean
    /**
     * Firefox only: the case runs in a browser of its own with classic (space-taking)
     * scrollbars, the user preference `ui.useOverlayScrollbars` set to 0. Headless
     * Firefox under Playwright hides every scrollbar (its agent sheet sets
     * `scrollbar-width: none !important`) and viewport emulation forces overlay
     * scrollbars, so that browser is headed, without a viewport, on the display
     * set in `DISPLAY` or on a virtual one (`Xvfb`). Other engines ignore it.
     */
    classicScrollbars?: boolean
}

interface CaseModule {
    name: ModuleName
    code: string
    cases: string[]
    pageOptions: Record<string, PageOptions>
    knownFailures: Record<string, string>
    /** Cases that measure through CDP: skipped, not run, in Firefox and WebKit. */
    chromiumOnly: string[]
    /** Cases that measure time: never instrumented for coverage. */
    timed: string[]
}

interface Pattern {
    module: RegExp
    name: RegExp
}

type BrowserName = 'chromium' | 'firefox' | 'webkit'

interface Options {
    patterns: Pattern[]
    filters: string[]
    browser: BrowserName
    headed: boolean
    list: boolean
    coverage: boolean
}

interface Outcome {
    status: 'PASS' | 'FAIL' | 'KNOWN'
    ms: number
    /** Failure messages, or the note of a known failure. */
    messages: string[]
    detail: string | null
}

function writeOut(message: string): void {
    process.stdout.write(`${message}\n`)
}

function writeStderr(message: string): void {
    process.stderr.write(`${message}\n`)
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

function globToRegExp(glob: string): RegExp {
    const source = glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
    return new RegExp(`^${source}$`)
}

/** `module:case`; a glob without a colon matches the case in any module. */
function parsePattern(glob: string): Pattern {
    const colon = glob.indexOf(':')
    const [module, name] =
        colon < 0 ? ['*', glob] : [glob.slice(0, colon), glob.slice(colon + 1)]
    return { module: globToRegExp(module), name: globToRegExp(name) }
}

function parseOptions(argv: readonly string[]): Options {
    const patterns: Pattern[] = []
    const filters: string[] = []
    let browser: BrowserName = 'chromium'
    let headed = false
    let list = false
    let coverage = false
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        switch (arg) {
            case '--case': {
                const value = argv[i + 1]
                if (value === undefined || value.startsWith('--')) {
                    throw new UsageError('--case requires a value')
                }
                filters.push(value)
                patterns.push(parsePattern(value))
                i += 1
                break
            }
            case '--browser': {
                const value = argv[i + 1]
                if (
                    value !== 'chromium' &&
                    value !== 'firefox' &&
                    value !== 'webkit'
                ) {
                    throw new UsageError(
                        '--browser must be chromium, firefox or webkit'
                    )
                }
                browser = value
                i += 1
                break
            }
            case '--headed':
                headed = true
                break
            case '--list':
                list = true
                break
            case '--coverage':
                coverage = true
                break
            case '--help':
            case '-h':
                throw new UsageError('')
            default:
                throw new UsageError(`unknown option "${arg}"`)
        }
    }
    if (coverage && browser !== 'chromium') {
        throw new UsageError('--coverage needs --browser chromium')
    }
    return { patterns, filters, browser, headed, list, coverage }
}

function pageHtml(markup: string): string {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="icon" href="data:,">
<title>ani browser case</title>
</head>
<body>
<div id="root">${markup}</div>
<script type="module">
import('/cases.js').then(
    (module) => { window.__cases = module; window.__ready = true },
    (error) => { window.__loadError = String((error && error.stack) || error); window.__ready = true }
)
</script>
</body>
</html>`
}

/** Opens `module` in a fresh page; everything is served from memory. */
async function openPage(
    context: BrowserContext,
    module: CaseModule,
    markup: string,
    problems: string[]
): Promise<{ page: Page; session: () => Promise<CDPSession> }> {
    const page = await context.newPage()
    page.on('console', (message) => {
        const type = message.type()
        if (type === 'error' || type === 'warning') {
            problems.push(
                `console.${type === 'warning' ? 'warn' : type}: ${message.text()}`
            )
        }
    })
    page.on('pageerror', (error) => {
        problems.push(`pageerror: ${error.message}`)
    })

    let cdp: CDPSession | null = null
    const session = async (): Promise<CDPSession> => {
        if (!cdp) {
            cdp = await context.newCDPSession(page)
            await cdp.send('Performance.enable')
        }
        return cdp
    }
    await page.exposeFunction('aniHeapUsed', async () => {
        const client = await session()
        await client.send('HeapProfiler.collectGarbage')
        await client.send('HeapProfiler.collectGarbage')
        const { usedSize } = await client.send('Runtime.getHeapUsage')
        return usedSize
    })
    await page.exposeFunction('aniLayoutCount', async () => {
        const client = await session()
        const { metrics } = await client.send('Performance.getMetrics')
        return (
            metrics.find((metric) => metric.name === 'LayoutCount')?.value ?? 0
        )
    })

    await page.route(`${ORIGIN}/**`, async (route: Route) => {
        const { pathname } = new URL(route.request().url())
        if (pathname === '/') {
            await route.fulfill({
                body: pageHtml(markup),
                contentType: 'text/html',
            })
        } else if (pathname === '/cases.js') {
            await route.fulfill({
                body: module.code,
                contentType: 'text/javascript',
            })
        } else {
            await route.fulfill({
                status: 404,
                contentType: 'text/plain',
                body: 'not found',
            })
        }
    })
    return { page, session }
}

async function load(page: Page, module: CaseModule): Promise<void> {
    await page.goto(`${ORIGIN}/`)
    await page.waitForFunction(() => window.__ready === true, undefined, {
        timeout: LOAD_TIMEOUT_MS,
    })
    const error = await page.evaluate(() => window.__loadError ?? null)
    if (error !== null) {
        throw new Error(
            `${module.name}: the cases module failed to load: ${error}`
        )
    }
}

/** Loads the module once to learn its cases and their metadata. */
async function inspect(
    browser: Browser,
    name: ModuleName,
    sourcemap: boolean
): Promise<CaseModule> {
    const code = await bundleForBrowser(
        fileURLToPath(new URL(`./cases/${name}.ts`, import.meta.url)),
        VARIANTS[name],
        sourcemap
    )
    const module: CaseModule = {
        name,
        code,
        cases: [],
        pageOptions: {},
        knownFailures: {},
        chromiumOnly: [],
        timed: [],
    }
    const context = await browser.newContext()
    try {
        const problems: string[] = []
        const { page } = await openPage(context, module, '', problems)
        await load(page, module)
        const meta = await page.evaluate(() => {
            const cases = window.__cases
            return {
                cases: Object.keys(cases).filter(
                    (key) => typeof cases[key] === 'function'
                ),
                pageOptions: (cases.pageOptions ?? {}) as Record<
                    string,
                    PageOptions
                >,
                knownFailures: (cases.knownFailures ?? {}) as Record<
                    string,
                    string
                >,
                chromiumOnly: (cases.chromiumOnly ?? []) as string[],
                timed: (cases.timed ?? []) as string[],
            }
        })
        if (problems.length > 0) {
            throw new Error(`${name}: loading logged ${problems.join(' | ')}`)
        }
        return { ...module, ...meta }
    } finally {
        await context.close()
    }
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`case timed out after ${ms} ms`)),
            ms
        )
    })
    work.catch(() => undefined)
    try {
        return await Promise.race([work, timeout])
    } finally {
        clearTimeout(timer)
    }
}

/**
 * An X display for a headed browser: `DISPLAY` when it is set, else a virtual
 * one that `Xvfb` opens on a free display number (stopped by `close`).
 */
async function xDisplay(): Promise<{ display: string; close(): void }> {
    const set = process.env.DISPLAY
    if (set) {
        return {
            display: set,
            close() {
                // the display is not ours to stop
            },
        }
    }
    const server = spawn(
        'Xvfb',
        ['-displayfd', '3', '-screen', '0', '1280x1024x24', '-nolisten', 'tcp'],
        { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] }
    )
    const display = await new Promise<string>((resolve, reject) => {
        let text = ''
        server.stdio[3]?.on('data', (chunk: Buffer) => {
            text += chunk.toString()
            if (text.includes('\n')) resolve(`:${text.trim()}`)
        })
        server.once('error', (error) =>
            reject(
                new Error(
                    `a classic-scrollbar run needs Xvfb: ${error.message}`
                )
            )
        )
        server.once('exit', (code) =>
            reject(
                new Error(
                    `Xvfb exited with code ${code} before it opened a display`
                )
            )
        )
    })
    return { display, close: () => server.kill() }
}

/** A Firefox of its own with classic scrollbars (`PageOptions.classicScrollbars`). */
async function classicFirefox(): Promise<{
    browser: Browser
    close(): Promise<void>
}> {
    const x = await xDisplay()
    try {
        const own = await firefox.launch({
            headless: false,
            firefoxUserPrefs: { 'ui.useOverlayScrollbars': 0 },
            env: { ...process.env, DISPLAY: x.display },
        })
        return {
            browser: own,
            async close() {
                await own.close().catch(() => undefined)
                x.close()
            },
        }
    } catch (error) {
        x.close()
        throw error
    }
}

async function runCase(
    shared: Browser,
    module: CaseModule,
    name: string,
    engine: EngineCoverage | null,
    browserName: BrowserName
): Promise<Outcome> {
    const coverage = engine?.wants(module.code, module.timed.includes(name))
        ? engine
        : null
    const started = performance.now()
    const problems: string[] = []
    const failures: string[] = []
    let detail: string | null = null
    const options = module.pageOptions[name] ?? {}
    let own: Awaited<ReturnType<typeof classicFirefox>> | null = null
    let context: BrowserContext | null = null
    try {
        if (options.classicScrollbars && browserName === 'firefox') {
            own = await classicFirefox()
        }
        // without viewport emulation, which would force overlay scrollbars
        context = await (own?.browser ?? shared).newContext(
            own ? { viewport: null } : {}
        )
        const markup = options.ssr
            ? await renderToMarkup(module.name as 'react' | 'vue')
            : ''
        const { page, session } = await openPage(
            context,
            module,
            markup,
            problems
        )
        if (coverage) await coverage.start(await session())
        if (options.reducedMotion) {
            await page.emulateMedia({ reducedMotion: options.reducedMotion })
        }
        await load(page, module)

        const result = await withTimeout(
            page.evaluate(async (caseName) => {
                const run = window.__cases[caseName] as () => Promise<unknown>
                try {
                    const value = await run()
                    return {
                        ok: true as const,
                        detail: typeof value === 'string' ? value : null,
                    }
                } catch (error) {
                    return {
                        ok: false as const,
                        message:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }
                }
            }, name),
            CASE_TIMEOUT_MS
        )
        if (result.ok) detail = result.detail
        else failures.push(result.message)

        // Let late warnings and errors (a leaked binding, a stray rAF) land.
        await page.evaluate(
            () =>
                new Promise<void>((resolve) =>
                    requestAnimationFrame(() =>
                        requestAnimationFrame(() => resolve())
                    )
                )
        )
        if (coverage) await coverage.take(await session(), module.code)
    } catch (error) {
        failures.push(describeError(error))
    } finally {
        await context?.close().catch(() => undefined)
        await own?.close()
    }

    failures.push(...problems)
    const ms = Math.round(performance.now() - started)
    const known = module.knownFailures[name]
    if (failures.length === 0) {
        const note =
            known === undefined ? [] : [`known failure now passes: ${known}`]
        return { status: 'PASS', ms, messages: note, detail }
    }
    if (known !== undefined) {
        return {
            status: 'KNOWN',
            ms,
            messages: [`known failure: ${known}`, ...failures],
            detail,
        }
    }
    return { status: 'FAIL', ms, messages: failures, detail }
}

function report(id: string, outcome: Outcome): void {
    writeOut(`${outcome.status} ${id} (${outcome.ms} ms)`)
    if (outcome.detail !== null) writeOut(`    ${outcome.detail}`)
    for (const message of outcome.messages) {
        for (const line of message.split('\n')) writeOut(`    ${line}`)
    }
}

async function findCases(name: ModuleName): Promise<string[]> {
    const result = await build({
        entryPoints: [
            fileURLToPath(new URL(`./cases/${name}.ts`, import.meta.url)),
        ],
        // bundled with packages external, so a variant's `export *` lists
        bundle: true,
        packages: 'external',
        format: 'esm',
        jsx: 'automatic',
        metafile: true,
        write: false,
        logLevel: 'silent',
    })
    const output = Object.values(result.metafile?.outputs ?? {})[0]
    return (output?.exports ?? []).filter(
        (key) =>
            key !== 'pageOptions' &&
            key !== 'knownFailures' &&
            key !== 'chromiumOnly' &&
            key !== 'timed'
    )
}

async function main(): Promise<number> {
    const options = parseOptions(process.argv.slice(2))
    const wanted = (moduleName: string, caseName: string) =>
        options.patterns.length === 0 ||
        options.patterns.some(
            (pattern) =>
                pattern.module.test(moduleName) && pattern.name.test(caseName)
        )

    const selectedCases: string[] = []
    for (const name of MODULES) {
        if (
            options.patterns.length > 0 &&
            !options.patterns.some((pattern) => pattern.module.test(name))
        ) {
            continue
        }
        const cases = await findCases(name)
        for (const caseName of cases) {
            if (wanted(name, caseName)) {
                selectedCases.push(`${name}:${caseName}`)
            }
        }
    }

    if (selectedCases.length === 0) {
        const filters =
            options.filters.length > 0
                ? options.filters.join(', ')
                : 'the filters'
        writeStderr(`no case matches ${filters}`)
        return 1
    }

    const launcher: BrowserType =
        options.browser === 'firefox'
            ? firefox
            : options.browser === 'webkit'
              ? webkit
              : chromium
    const browser = await launcher.launch({
        headless: !options.headed,
        ...(options.browser === 'chromium' && {
            args: [
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
            ],
        }),
    })
    const counts = { PASS: 0, FAIL: 0, KNOWN: 0, SKIP: 0 }
    const coverage =
        options.coverage && !options.list ? new EngineCoverage() : null
    const started = performance.now()
    try {
        for (const name of MODULES) {
            if (!selectedCases.some((id) => id.startsWith(`${name}:`))) {
                continue
            }

            let module: CaseModule
            try {
                module = await inspect(browser, name, coverage !== null)
            } catch (error) {
                counts.FAIL += 1
                report(`${name}:*`, {
                    status: 'FAIL',
                    ms: 0,
                    messages: [describeError(error)],
                    detail: null,
                })
                continue
            }
            for (const caseName of module.cases) {
                const id = `${name}:${caseName}`
                if (!wanted(name, caseName)) continue
                if (options.list) {
                    const known = module.knownFailures[caseName]
                    writeOut(known === undefined ? id : `${id} (known failure)`)
                    continue
                }
                if (
                    options.browser !== 'chromium' &&
                    module.chromiumOnly.includes(caseName)
                ) {
                    counts.SKIP += 1
                    writeOut(`SKIP ${id} (CDP: Chromium only)`)
                    continue
                }
                const outcome = await runCase(
                    browser,
                    module,
                    caseName,
                    coverage,
                    options.browser
                )
                counts[outcome.status] += 1
                report(id, outcome)
            }
        }
    } finally {
        await browser.close()
    }
    if (options.list) return 0
    // a filtered run reports without gating: the floors cover every module
    const uncovered =
        coverage?.report(writeOut, options.patterns.length === 0) ?? []
    for (const failure of uncovered) writeOut(`FAIL coverage: ${failure}`)

    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    writeOut(
        `\n${counts.PASS} passed, ${counts.FAIL} failed, ${counts.KNOWN} known failures, ${counts.SKIP} skipped (${seconds} s)`
    )
    return counts.FAIL === 0 && uncovered.length === 0 ? 0 : 1
}

main().then(
    (code) => {
        process.exitCode = code
    },
    (error: unknown) => {
        process.stderr.write(`${describeError(error)}\n`)
        if (error instanceof UsageError) process.stderr.write(`\n${USAGE}\n`)
        process.exitCode = 1
    }
)
