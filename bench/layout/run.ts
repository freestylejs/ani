/**
 * P5 layout bench runner.
 *
 * Node runs this file directly (native type stripping). Playwright serves every
 * page by request interception under `http://localhost/`; there is no server
 * and no port. COOP `same-origin` and COEP `require-corp` make the page
 * cross-origin isolated, so `performance.now()` has the §11.5 resolution.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    type Browser,
    type BrowserContext,
    type BrowserServer,
    chromium,
    firefox,
    type Page,
    type Route,
    webkit,
} from 'playwright'
import {
    aggregateFindings,
    aggregateSceneReport,
    realTwinProblems,
} from './aggregate.ts'
import { bundlePage, pageHtml } from './bundle.ts'
import { evaluateCertification, evaluateInvocation } from './certification.ts'
import {
    costOutcome,
    costValidity,
    HELD_PENDING_REASON,
} from './cost_validity.ts'
import {
    collectFingerprint,
    evaluateFingerprint,
    PINNED_FINGERPRINT,
} from './fingerprint.ts'
import {
    auditFloor,
    floorAuditGate,
    heldIncrementalGate,
    realClockGate,
    steadyFrameGate,
    sustainedRatioGate,
} from './gates.ts'
import {
    type AggregateMetric,
    type BenchReport,
    type CostReport,
    type CostRunReport,
    compareReports,
    type EngineReport,
    formatReport,
    type NegativeControlResult,
    parseReport,
    type RunSceneReport,
    type SceneReport,
    stringifyReport,
} from './report.ts'
import {
    accPlan,
    bulkPlan,
    cardPlan,
    deletePlan,
    insertPlan,
    islandPlan,
    photoPlan,
    reorderPlan,
    segPlan,
    sheetPlan,
    stackPlan,
} from './scene_plans.ts'
import { type MetricFinding, scoreScene } from './scoring.ts'
import { median, percentile } from './stats.ts'
import { withTimeout } from './timeout.ts'
import type {
    CostTrace,
    FloorAuditTrace,
    RealTrace,
    SceneTrace,
    VariantId,
    VariantRunOptions,
} from './types.ts'
import {
    applyVariantPlan,
    selectedVariants,
    type VariantSpec,
    variantKey,
    variantSpec,
} from './variants.ts'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const ORIGIN = 'http://localhost'
const PAGE_URL = `${ORIGIN}/`
const ROUTE = `${ORIGIN}/**`
const DEFAULT_OUT = join(REPO_ROOT, 'bench/layout/results/latest.json')
const PAGES_DIR = join(REPO_ROOT, 'bench/layout/results/pages')
const SCENES = [
    's-card',
    's-seg',
    's-photo',
    's-stack',
    's-island',
    's-acc',
    's-insert',
    's-delete',
    's-reorder',
    's-sheet',
    's-bulk',
] as const
const SCENE_NAMES = [...SCENES, 'cost'] as const
const IOS_VIEWPORT = { width: 390, height: 844 } as const
const COST_VIEWPORT = { width: 1280, height: 720 } as const
const VARIANT_IDS = [
    'dpr1',
    'dpr3',
    'rm-jump',
    'rm-max',
    'rm-ignore',
] as const satisfies readonly VariantId[]
type EngineName = 'chromium' | 'webkit' | 'firefox'

const USAGE = `P5 layout bench (iOS Native Grade calibration)

Usage:
  pnpm bench:layout [options]

Options:
  --engine <name>    chromium | webkit | firefox, repeatable
                     (default: chromium, webkit; Firefox advisory)
  --scene <glob>     s-card | s-seg | cost | *, repeatable (default: all)
  --variant <id>     dpr1 | dpr3 | rm-jump | rm-max | rm-ignore, repeatable
                     (default: all support variants for the selected scenes)
  --runs <count>     measured fresh-process runs (default 5; one warm-up is
                     always discarded first)
  --out <file>       report JSON (default: bench/layout/results/latest.json)
  --compare <file>   print per-metric deltas against a previous report
  --check            also run the oracle/scoring self-tests and the browser
                     negative controls; exit 1 if a control does not fail
  --help             show this message

Every gate miss exits 1 after the report is written. Cost gates are advisory
when the §11.5 fingerprint differs; the frame gates still decide.
`

class UsageError extends Error {}

interface Options {
    readonly engines: readonly EngineName[]
    readonly scenes: readonly string[]
    readonly variants: readonly VariantId[]
    readonly runs: number
    readonly out: string
    readonly compare: string | null
    readonly check: boolean
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

function parseOptions(argv: readonly string[]): Options {
    const engines: EngineName[] = []
    const scenes: string[] = []
    const variants: VariantId[] = []
    let runs = 5
    let out: string | null = null
    let compare: string | null = null
    let check = false
    const next = (index: number, flag: string): string => {
        const value = argv[index + 1]
        if (value === undefined || value.startsWith('--')) {
            throw new UsageError(`${flag} requires a value`)
        }
        return value
    }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]!
        switch (arg) {
            case '--engine': {
                const value = next(i, arg)
                if (
                    value !== 'chromium' &&
                    value !== 'webkit' &&
                    value !== 'firefox'
                ) {
                    throw new UsageError(
                        '--engine must be chromium, webkit or firefox'
                    )
                }
                engines.push(value)
                i += 1
                break
            }
            case '--scene':
                scenes.push(next(i, arg))
                i += 1
                break
            case '--variant': {
                const value = next(i, arg)
                if (!(VARIANT_IDS as readonly string[]).includes(value)) {
                    throw new UsageError(
                        `--variant must be one of ${VARIANT_IDS.join(', ')}`
                    )
                }
                variants.push(value as VariantId)
                i += 1
                break
            }
            case '--runs': {
                const value = Number(next(i, arg))
                if (!Number.isInteger(value) || value <= 0) {
                    throw new UsageError('--runs requires a positive integer')
                }
                runs = value
                i += 1
                break
            }
            case '--out':
                out = resolve(next(i, arg))
                i += 1
                break
            case '--compare':
                compare = resolve(next(i, arg))
                i += 1
                break
            case '--check':
                check = true
                break
            case '--help':
            case '-h':
                throw new UsageError('')
            default:
                throw new UsageError(`unknown option "${arg}"`)
        }
    }
    const wanted = scenes.length === 0 ? ['*'] : [...new Set(scenes)]
    const patterns = wanted.map(globToRegExp)
    const selected = SCENE_NAMES.filter((name) =>
        patterns.some((pattern) => pattern.test(name))
    )
    if (selected.length === 0) {
        throw new UsageError(
            `no scene matches ${wanted.join(', ')} (valid: ${SCENE_NAMES.join(', ')})`
        )
    }
    return {
        engines:
            engines.length === 0
                ? ['chromium', 'webkit']
                : [...new Set(engines)],
        scenes: selected,
        variants:
            variants.length === 0 ? [...VARIANT_IDS] : [...new Set(variants)],
        runs,
        out: out ?? DEFAULT_OUT,
        compare,
        check,
    }
}

/* ───────────────────────── deadlines and progress ───────────────────────── */

/**
 * Deadlines are chosen to fail long before a bench run becomes unusable while
 * leaving room for the pinned instrument under load:
 * - launch 60 s: a cold pinned browser normally starts in < 3 s; 60 s is a
 *   20x allowance and still bounds a stuck driver.
 * - page 60 s: the page is served by request interception from localhost and
 *   boots in well under 1 s; 60 s covers a heavily loaded renderer.
 * - close 30 s: a graceful context/browser close is normally < 1 s; 30 s
 *   before the harness declares the process leaked and kills the server.
 * - scene/probe/cost 300 s: the slowest measured call (S-PHOTO/S-BULK real
 *   twin, 600 held frames) is tens of seconds under load; 300 s is a 10x
 *   ceiling that keeps a single hung operation from stalling five runs.
 */
const LAUNCH_TIMEOUT_MS = 60_000
const PAGE_TIMEOUT_MS = 60_000
const CLOSE_TIMEOUT_MS = 30_000
const SCENE_TIMEOUT_MS = 300_000

const BENCH_STARTED_AT = performance.now()

/**
 * Unbuffered stage progress, so a hang is visible in a piped log. `writeSync`
 * matters: a long synchronous scoring phase blocks the event loop, and a
 * queued `process.stdout.write` would stay invisible until that phase ended.
 */
function progress(stage: string): void {
    const now = new Date()
    const clock = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((part) => String(part).padStart(2, '0'))
        .join(':')
    const elapsed = ((performance.now() - BENCH_STARTED_AT) / 1000).toFixed(1)
    writeSync(1, `[${clock} +${elapsed}s] ${stage}\n`)
}

/* ───────────────────────── browsers and pages ───────────────────────── */

function processAlive(server: BrowserServer): boolean {
    try {
        return server.process().exitCode === null
    } catch {
        return false
    }
}

async function killServer(server: BrowserServer, stage: string): Promise<void> {
    if (!processAlive(server)) return
    try {
        await withTimeout(server.kill(), CLOSE_TIMEOUT_MS, `${stage}: kill`)
        progress(`${stage}: kill ok`)
    } catch (error) {
        progress(`${stage}: kill failed: ${describeError(error)}`)
    }
}

/**
 * A launched browser plus the server process that owns it. `close` never
 * waits unbounded: if the browser does not close within the deadline, the
 * server process is killed so a timed-out scene cannot leak a browser.
 */
class BenchBrowser {
    readonly browser: Browser
    readonly engine: EngineName
    readonly version: string
    readonly problems: string[] = []
    private readonly server: BrowserServer
    private closed = false

    private constructor(
        engine: EngineName,
        server: BrowserServer,
        browser: Browser
    ) {
        this.engine = engine
        this.server = server
        this.browser = browser
        this.version = browser.version()
    }

    static async launch(
        engine: EngineName,
        stage: string
    ): Promise<BenchBrowser> {
        const options = {
            headless: true,
            timeout: LAUNCH_TIMEOUT_MS,
            ...(engine === 'chromium'
                ? {
                      args: [
                          '--disable-background-timer-throttling',
                          '--disable-backgrounding-occluded-windows',
                          '--disable-renderer-backgrounding',
                      ],
                  }
                : {}),
        }
        const type =
            engine === 'webkit'
                ? webkit
                : engine === 'firefox'
                  ? firefox
                  : chromium
        progress(`${stage}: launch ${engine}`)
        const launching = type.launchServer(options)
        let server: BrowserServer
        try {
            server = await withTimeout(
                launching,
                LAUNCH_TIMEOUT_MS,
                `${stage}: launch ${engine}`
            )
        } catch (error) {
            // The driver may still spawn the server after the deadline; make
            // sure a late launch cannot leak a browser process.
            void launching
                .then((late) =>
                    killServer(late, `${stage}: ${engine} late launch cleanup`)
                )
                .catch(() => undefined)
            throw error
        }
        try {
            const browser = await withTimeout(
                type.connect(server.wsEndpoint()),
                LAUNCH_TIMEOUT_MS,
                `${stage}: connect ${engine}`
            )
            browser.on('disconnected', () =>
                progress(`${engine}: browser disconnected`)
            )
            progress(`${stage}: launch ${engine} ok (${browser.version()})`)
            return new BenchBrowser(engine, server, browser)
        } catch (error) {
            await killServer(server, `${stage}: ${engine} launch cleanup`)
            throw error
        }
    }

    async close(stage: string): Promise<void> {
        if (this.closed) return
        this.closed = true
        progress(`${stage}: close ${this.engine}`)
        try {
            await withTimeout(
                this.browser.close(),
                CLOSE_TIMEOUT_MS,
                `${stage}: close ${this.engine}`
            )
            progress(`${stage}: close ${this.engine} ok`)
        } catch (error) {
            const problem = `${stage}: close ${this.engine} failed: ${describeError(error)}`
            this.problems.push(problem)
            progress(problem)
        }
        if (!processAlive(this.server)) {
            progress(`${stage}: ${this.engine} process exited`)
            return
        }
        try {
            await withTimeout(
                this.server.close(),
                CLOSE_TIMEOUT_MS,
                `${stage}: server close ${this.engine}`
            )
            progress(`${stage}: server close ${this.engine} ok`)
        } catch (error) {
            const problem = `${stage}: server close ${this.engine} failed: ${describeError(error)}`
            this.problems.push(problem)
            progress(problem)
            await killServer(this.server, `${stage}: ${this.engine} leaked`)
        }
    }
}

async function closeContext(
    context: BrowserContext,
    stage: string
): Promise<void> {
    progress(`${stage}: context close`)
    try {
        await withTimeout(
            context.close(),
            CLOSE_TIMEOUT_MS,
            `${stage}: context close`
        )
        progress(`${stage}: context close ok`)
    } catch (error) {
        progress(`${stage}: context close failed: ${describeError(error)}`)
        throw error
    }
}

interface OpenedPage {
    readonly context: BrowserContext
    readonly page: Page
    readonly problems: string[]
}

function engineFor(browser: Browser): EngineName {
    const name = browser.browserType().name()
    return name === 'webkit'
        ? 'webkit'
        : name === 'firefox'
          ? 'firefox'
          : 'chromium'
}

async function openPage(
    browser: Browser,
    bundle: string,
    viewport: { readonly width: number; readonly height: number },
    dpr: number,
    engine: EngineName,
    stage: string
): Promise<OpenedPage> {
    progress(`${stage}: open page ${viewport.width}x${viewport.height}@${dpr}`)
    const context = await withTimeout(
        browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: dpr,
        }),
        PAGE_TIMEOUT_MS,
        `${stage}: new context`
    )
    try {
        const page = await withTimeout(
            context.newPage(),
            PAGE_TIMEOUT_MS,
            `${stage}: new page`
        )
        const problems: string[] = []
        page.on('pageerror', (error) =>
            problems.push(`pageerror: ${error.message}`)
        )
        page.on('console', (message) => {
            const type = message.type()
            if (type === 'error' || type === 'warning') {
                problems.push(`console.${type}: ${message.text()}`)
            }
        })
        await withTimeout(
            page.route(ROUTE, async (route: Route) => {
                const headers = {
                    'Cross-Origin-Opener-Policy': 'same-origin',
                    'Cross-Origin-Embedder-Policy': 'require-corp',
                    'Cross-Origin-Resource-Policy': 'same-origin',
                    'Cache-Control': 'no-store',
                }
                const { pathname } = new URL(route.request().url())
                if (pathname === '/') {
                    await route.fulfill({
                        body: pageHtml(bundle),
                        contentType: 'text/html',
                        headers,
                    })
                    return
                }
                await route.fulfill({
                    status: 404,
                    contentType: 'text/plain',
                    body: 'not found',
                    headers,
                })
            }),
            PAGE_TIMEOUT_MS,
            `${stage}: route`
        )
        await withTimeout(
            page.goto(PAGE_URL),
            PAGE_TIMEOUT_MS,
            `${stage}: page load`
        )
        await withTimeout(
            page.waitForFunction(() => Boolean(window.__bench?.ready)),
            PAGE_TIMEOUT_MS,
            `${stage}: wait for ready`
        )
        const isolated = await withTimeout(
            page.evaluate(() => globalThis.crossOriginIsolated),
            PAGE_TIMEOUT_MS,
            `${stage}: isolation probe`
        )
        if (!isolated) {
            // Playwright's WebKit does not expose cross-origin isolation even
            // with the COOP/COEP headers (the headers are present). Its
            // performance.now tick is 1 ms, which measureGranularity observes
            // and the §11.5 20-frame sampler applies. Chromium is deciding and
            // must be isolated.
            if (engine === 'chromium') {
                problems.push(
                    'the page is not cross-origin isolated (COOP/COEP)'
                )
            }
        }
        progress(`${stage}: page ready`)
        return { context, page, problems }
    } catch (error) {
        progress(`${stage}: open failed: ${describeError(error)}`)
        await closeContext(context, `${stage}: open cleanup`).catch(() => {
            // the caller reports the open failure; the cleanup is best effort
        })
        throw error
    }
}

function sceneViewport(scene: string): {
    readonly viewport: { readonly width: number; readonly height: number }
    readonly dpr: number
} {
    // S-BULK is the 1,000-participant 1280x720@1 shape (spec 1.2/2.11).
    return scene === 's-bulk'
        ? { viewport: COST_VIEWPORT, dpr: 1 }
        : { viewport: IOS_VIEWPORT, dpr: 2 }
}

async function runWithContext<T>(
    opened: OpenedPage,
    stage: string,
    operation: () => Promise<T>
): Promise<T> {
    let outcome!: T
    let failed = false
    let failure: unknown
    try {
        outcome = await operation()
    } catch (error) {
        failed = true
        failure = error
    }
    try {
        await closeContext(opened.context, stage)
    } catch (error) {
        if (!failed) throw error
        progress(
            `${stage}: cleanup failed after error: ${describeError(error)}`
        )
    }
    if (failed) throw failure
    return outcome
}

function sceneLabel(
    scene: string,
    variant?: VariantRunOptions | undefined
): string {
    return variant ? `${scene}@${variant.id}` : scene
}

async function runManual(
    browser: Browser,
    bundle: string,
    scene: string,
    stage: string,
    options: {
        control?: string | undefined
        variant?: VariantRunOptions | undefined
    } = {}
): Promise<{ trace: SceneTrace; problems: readonly string[] }> {
    const { viewport } = sceneViewport(scene)
    const dpr = options.variant?.dpr ?? sceneViewport(scene).dpr
    const label = sceneLabel(scene, options.variant)
    const opened = await openPage(
        browser,
        bundle,
        viewport,
        dpr,
        engineFor(browser),
        `${stage} ${label}`
    )
    return runWithContext(opened, `${stage} ${label}`, async () => {
        progress(`${stage}: evaluate manual ${label}`)
        const trace = (await withTimeout(
            opened.page.evaluate(
                async ({ scene, control, variant }) => {
                    const bench = (
                        window as unknown as {
                            __bench: {
                                scenes: Record<
                                    string,
                                    {
                                        runManual(options: {
                                            control?: string | undefined
                                            variant?: unknown
                                        }): Promise<unknown>
                                    }
                                >
                            }
                        }
                    ).__bench
                    return bench.scenes[scene]!.runManual({ control, variant })
                },
                {
                    scene,
                    control: options.control,
                    variant: options.variant,
                }
            ),
            SCENE_TIMEOUT_MS,
            `${stage} ${label}`
        )) as SceneTrace
        progress(`${stage}: manual ${label} ok`)
        const variant = options.variant
        return {
            trace: variant ? { ...trace, variant: variant.id } : trace,
            problems: opened.problems,
        }
    })
}

async function runReal(
    browser: Browser,
    bundle: string,
    scene: string,
    stage: string,
    variant?: VariantRunOptions | undefined
): Promise<{ trace: RealTrace; problems: readonly string[] }> {
    const { viewport } = sceneViewport(scene)
    const dpr = variant?.dpr ?? sceneViewport(scene).dpr
    const label = sceneLabel(scene, variant)
    const opened = await openPage(
        browser,
        bundle,
        viewport,
        dpr,
        engineFor(browser),
        `${stage} ${label}`
    )
    return runWithContext(opened, `${stage} ${label}`, async () => {
        progress(`${stage}: evaluate real ${label}`)
        const trace = (await withTimeout(
            opened.page.evaluate(
                async ({ scene, variant }) => {
                    const bench = (
                        window as unknown as {
                            __bench: {
                                scenes: Record<
                                    string,
                                    {
                                        runReal(options: {
                                            variant?: unknown
                                        }): Promise<unknown>
                                    }
                                >
                            }
                        }
                    ).__bench
                    return bench.scenes[scene]!.runReal({ variant })
                },
                { scene, variant }
            ),
            SCENE_TIMEOUT_MS,
            `${stage} ${label}`
        )) as RealTrace
        progress(`${stage}: real ${label} ok`)
        return { trace, problems: opened.problems }
    })
}

interface SceneCostProbeResult {
    readonly scene: string
    readonly participants: number
    readonly movers: number
    readonly engine: readonly number[]
    readonly floor: readonly number[]
    readonly ratio: number
}

async function runSceneCostProbe(
    browser: Browser,
    bundle: string,
    scene: string,
    stage: string
): Promise<SceneCostProbeResult> {
    const opened = await openPage(
        browser,
        bundle,
        IOS_VIEWPORT,
        2,
        engineFor(browser),
        `${stage} ${scene}`
    )
    return runWithContext(opened, `${stage} ${scene}`, async () => {
        progress(`${stage}: evaluate probe ${scene}`)
        const result = (await withTimeout(
            opened.page.evaluate(async (scene) => {
                const bench = (
                    window as unknown as {
                        __bench: {
                            runSceneCostProbe(scene: string): Promise<unknown>
                        }
                    }
                ).__bench
                return bench.runSceneCostProbe(scene)
            }, scene),
            SCENE_TIMEOUT_MS,
            `${stage} ${scene}`
        )) as SceneCostProbeResult
        progress(`${stage}: probe ${scene} ok`)
        return result
    })
}

async function runCost(
    browser: Browser,
    bundle: string,
    stage: string
): Promise<{ trace: CostTrace; problems: readonly string[] }> {
    const opened = await openPage(
        browser,
        bundle,
        COST_VIEWPORT,
        1,
        engineFor(browser),
        stage
    )
    return runWithContext(opened, stage, async () => {
        progress(`${stage}: evaluate cost`)
        const trace = (await withTimeout(
            opened.page.evaluate(async () => {
                const bench = (
                    window as unknown as {
                        __bench: { runCost(): Promise<unknown> }
                    }
                ).__bench
                return bench.runCost()
            }),
            SCENE_TIMEOUT_MS,
            stage
        )) as CostTrace
        progress(`${stage}: evaluate cost ok`)
        return { trace, problems: opened.problems }
    })
}

async function runHeldAudit(
    browser: Browser,
    bundle: string,
    extraRead: boolean,
    stage: string
): Promise<{
    frames: number
    rects: number
    offsets: number
    styles: number
    holds: number
    mismatches: number
}> {
    const opened = await openPage(
        browser,
        bundle,
        COST_VIEWPORT,
        1,
        engineFor(browser),
        stage
    )
    return runWithContext(opened, stage, async () => {
        progress(`${stage}: evaluate held audit`)
        const result = (await withTimeout(
            opened.page.evaluate(async (extraRead) => {
                const bench = (
                    window as unknown as {
                        __bench: {
                            runHeldAudit(extraRead: boolean): Promise<unknown>
                        }
                    }
                ).__bench
                return bench.runHeldAudit(extraRead)
            }, extraRead),
            SCENE_TIMEOUT_MS,
            stage
        )) as {
            frames: number
            rects: number
            offsets: number
            styles: number
            holds: number
            mismatches: number
        }
        progress(`${stage}: held audit ok`)
        return result
    })
}

async function runFloorAudit(
    browser: Browser,
    bundle: string,
    extraRead: boolean,
    stage: string
): Promise<FloorAuditTrace> {
    const opened = await openPage(
        browser,
        bundle,
        COST_VIEWPORT,
        1,
        engineFor(browser),
        stage
    )
    return runWithContext(opened, stage, async () => {
        progress(`${stage}: evaluate floor audit`)
        const trace = (await withTimeout(
            opened.page.evaluate(async (extraRead) => {
                const bench = (
                    window as unknown as {
                        __bench: {
                            runFloorAudit(extraRead: boolean): Promise<unknown>
                        }
                    }
                ).__bench
                return bench.runFloorAudit(extraRead)
            }, extraRead),
            SCENE_TIMEOUT_MS,
            stage
        )) as FloorAuditTrace
        progress(`${stage}: floor audit ok`)
        return trace
    })
}

/* ───────────────────────── aggregation ───────────────────────── */

function aggregate(
    findings: readonly (readonly MetricFinding[])[],
    runNumbers?: readonly number[]
): AggregateMetric[] {
    return aggregateFindings(
        findings,
        runNumbers ?? findings.map((_, index) => index)
    )
}

function aggregateScene(
    scene: string,
    runs: readonly RunSceneReport[],
    findings: readonly (readonly MetricFinding[])[],
    shape: readonly (readonly MetricFinding[])[],
    pending: string | null = null,
    notes: readonly string[] = [],
    variant?: VariantSpec | undefined
): SceneReport {
    return aggregateSceneReport({
        scene,
        runs,
        findings,
        shape,
        pending,
        notes,
        ...(variant === undefined
            ? {}
            : {
                  variant: {
                      id: variant.id,
                      scene: variant.scene,
                      kind: variant.kind,
                      dpr: variant.dpr,
                      reducedMotion: variant.policy,
                      label: variant.label,
                  },
              }),
    })
}

function evaluateCost(
    trace: CostTrace,
    extraProblems: readonly string[]
): {
    findings: MetricFinding[]
    report: CostRunReport
    problems: string[]
    valid: boolean
    blockedReasons: readonly string[]
} {
    const problems: string[] = [...extraProblems]
    const findings: MetricFinding[] = []
    const unscrolledRatio =
        median(trace.unscrolled.engine) / median(trace.unscrolled.floor)
    const scrolledRatio =
        median(trace.scrolled.engine) / median(trace.scrolled.floor)
    const validity = costValidity({
        g: trace.g,
        commits: trace.sustained.commits,
        commitHz: trace.sustained.commitHz,
        steadyBatch: trace.steady.sampleMode === 'batch20',
    })
    const validCost = validity.valid
    const blockedByTimer = !validity.timerValid
    findings.push({
        id: 'G9-unscrolled',
        label: 'Commit over the required-work floor, unscrolled',
        gate: 'median of 5 per-run ratios <= 2',
        unit: 'ratio',
        value: blockedByTimer ? Number.NaN : unscrolledRatio,
        pass: !blockedByTimer && unscrolledRatio <= 2,
        blocked: blockedByTimer,
        deciding: !blockedByTimer,
        aggregate: 'median',
        aggregateLimit: 2,
        detail: blockedByTimer
            ? `BLOCK: timer g ${trace.g.toFixed(4)} ms; the quantized ratio is diagnostic, not a gate value`
            : `${median(trace.unscrolled.engine).toFixed(3)} ms / ${median(trace.unscrolled.floor).toFixed(3)} ms`,
    })
    findings.push({
        id: 'G9-scrolled',
        label: 'Commit over the required-work floor, scrolled 1.5 viewports',
        gate: 'median of 5 per-run ratios <= 2',
        unit: 'ratio',
        value: blockedByTimer ? Number.NaN : scrolledRatio,
        pass: !blockedByTimer && scrolledRatio <= 2,
        blocked: blockedByTimer,
        deciding: !blockedByTimer,
        aggregate: 'median',
        aggregateLimit: 2,
        detail: blockedByTimer
            ? `BLOCK: timer g ${trace.g.toFixed(4)} ms; the quantized ratio is diagnostic, not a gate value`
            : `${median(trace.scrolled.engine).toFixed(3)} ms / ${median(trace.scrolled.floor).toFixed(3)} ms`,
    })
    for (const [name, run] of [
        ['unscrolled', trace.unscrolled],
        ['scrolled', trace.scrolled],
    ] as const) {
        const audit = auditFloor({
            participants: run.participants,
            poses: run.poses,
            typedOM: run.typedOM,
            captureRects: run.floorAudit.captureRects,
            captureOffsets: run.floorAudit.captureOffsets,
            flushRects: run.floorAudit.flushRects,
            flushOffsets: run.floorAudit.flushOffsets,
            styleReads: run.floorAudit.styleReads,
            poseWrites: run.floorAudit.poseWrites,
            extraReads: run.floorAudit.extraReads,
        })
        const gate = floorAuditGate(audit)
        findings.push({
            ...gate,
            id: `G9.floor-${name}`,
            label: `Required-work floor audit (${name})`,
            value: audit.pass ? 0 : audit.mismatches.length,
            detail: audit.summary,
        })
        const required = run.participants * 2
        const requiredStyles = run.poses * (run.typedOM ? 2 : 1)
        if (
            run.engineAudit.rects !== required ||
            run.engineAudit.offsets !== required ||
            run.engineAudit.styleReads !== requiredStyles ||
            run.engineAudit.poseWrites !== run.poses
        ) {
            problems.push(
                `${name}: engine audit ${run.engineAudit.rects} rects / ${run.engineAudit.offsets} pairs / ${run.engineAudit.styleReads} styles / ${run.engineAudit.poseWrites} poses, required ${required}/${required}/${requiredStyles}/${run.poses}`
            )
        }
        if (run.steadyFrameReads !== 0) {
            problems.push(
                `${name}: ${run.steadyFrameReads} reads in steady frames`
            )
        }
    }
    const steady = steadyFrameGate(
        trace.steady.costs,
        trace.steady.g,
        'Steady frame at 300 nested movers (A-19 150+150)',
        trace.steady.sampleMode,
        trace.steady.errorBound
    )
    const commitP95 = percentile(trace.sustained.commitCosts, 0.95)
    const floorP95 = percentile(trace.sustained.floorCosts, 0.95)
    const steadyP95 = steady.value
    const sustainedP95 = commitP95
    const sustainedRatio = commitP95 / floorP95
    const steadyBlocked =
        (trace.steady.sampleMode !== 'batch20' && !validity.timerValid) ||
        steady.blocked === true
    findings.push({
        ...steady,
        id: 'G10',
        label: 'Steady frame at 300 nested movers (A-19 150+150)',
        value: steadyBlocked ? Number.NaN : steady.value,
        pass: !steadyBlocked && steady.pass,
        blocked: steadyBlocked,
        deciding: !steadyBlocked,
        detail: `${steady.detail ?? ''}; ${
            trace.steady.sampleMode === 'batch20'
                ? 'real-clock 20-frame batch samples'
                : `refresh ${trace.steady.refreshHz.toFixed(1)} Hz`
        }`,
    })
    const sustainedGate = sustainedRatioGate(
        trace.sustained.commitCosts,
        trace.sustained.floorCosts,
        validity.cadenceValid,
        trace.sustained.errorBound
    )
    findings.push({
        ...sustainedGate,
        value: blockedByTimer ? Number.NaN : sustainedGate.value,
        pass: !blockedByTimer && sustainedGate.pass,
        blocked: blockedByTimer,
        deciding: !blockedByTimer,
        aggregate: 'median',
        aggregateLimit: 2,
        measured:
            trace.sustained.commitCosts.length > 0 &&
            trace.sustained.floorCosts.length > 0,
        detail: `${blockedByTimer ? 'BLOCK: timer too coarse; the quantized ratio is diagnostic, not a gate value. ' : ''}${sustainedGate.detail ?? ''}; ${trace.sustained.commits} commits, ${trace.sustained.commitHz.toFixed(2)} commits/s over ${trace.sustained.durationMs.toFixed(0)} ms; refresh ${trace.sustained.refreshHz.toFixed(1)} Hz (frame samples are diagnostic, not a 60 Hz frame); ${trace.sustained.frameCosts.length} frame samples; g ${trace.g.toFixed(4)} ms; sample ${trace.sustained.sampleMode}${trace.sustained.errorBound > 0 ? ` ±${trace.sustained.errorBound.toFixed(4)} ms` : ''}`,
    })
    const sustainedAudit = auditFloor({
        participants: trace.unscrolled.participants,
        poses: trace.unscrolled.poses,
        typedOM: trace.typedOM,
        captureRects: trace.sustained.floorAudit.captureRects,
        captureOffsets: trace.sustained.floorAudit.captureOffsets,
        flushRects: trace.sustained.floorAudit.flushRects,
        flushOffsets: trace.sustained.floorAudit.flushOffsets,
        styleReads: trace.sustained.floorAudit.styleReads,
        poseWrites: trace.sustained.floorAudit.poseWrites,
        extraReads: trace.sustained.floorAudit.extraReads,
    })
    findings.push({
        ...floorAuditGate(sustainedAudit),
        id: 'G11.floor',
        label: 'Sustained required-work floor audit',
        value: sustainedAudit.pass ? 0 : sustainedAudit.mismatches.length,
        detail: sustainedAudit.summary,
    })
    const sustainedRequired = trace.unscrolled.participants * 2
    const sustainedStyles = trace.unscrolled.poses * (trace.typedOM ? 2 : 1)
    if (
        trace.sustained.engineAudit.rects !== sustainedRequired ||
        trace.sustained.engineAudit.offsets !== sustainedRequired ||
        trace.sustained.engineAudit.styleReads !== sustainedStyles ||
        trace.sustained.engineAudit.poseWrites !== trace.unscrolled.poses
    ) {
        problems.push(
            `sustained: engine audit ${trace.sustained.engineAudit.rects} rects / ${trace.sustained.engineAudit.offsets} pairs / ${trace.sustained.engineAudit.styleReads} styles / ${trace.sustained.engineAudit.poseWrites} poses, required ${sustainedRequired}/${sustainedRequired}/${sustainedStyles}/${trace.unscrolled.poses}`
        )
    }
    let exactPass = true
    let exactDetail = ''
    const requiredStyles = trace.unscrolled.poses * (trace.typedOM ? 2 : 1)
    for (const entry of trace.exactReads) {
        const required = entry.nBefore + entry.nAfter
        if (
            entry.rects !== required ||
            entry.offsets !== required ||
            entry.styles !== requiredStyles ||
            entry.frameReads !== 0
        ) {
            exactPass = false
            exactDetail = `${entry.label}: ${entry.rects}/${entry.offsets} rects/pairs, ${entry.styles}/${requiredStyles} computed reads, ${entry.frameReads} frame reads; required ${required}/${required}/${requiredStyles}/0`
            break
        }
    }
    if (
        trace.unscrolled.steadyFrameReads !== 0 ||
        trace.scrolled.steadyFrameReads !== 0
    ) {
        exactPass = false
        exactDetail ||= `steady frame reads ${trace.unscrolled.steadyFrameReads}/${trace.scrolled.steadyFrameReads}`
    }
    if (
        trace.sustained.engineAudit.rects !== sustainedRequired ||
        trace.sustained.engineAudit.offsets !== sustainedRequired ||
        trace.sustained.engineAudit.styleReads !== sustainedStyles ||
        trace.sustained.engineAudit.poseWrites !== trace.unscrolled.poses
    ) {
        exactPass = false
        exactDetail ||= `sustained engine audit ${trace.sustained.engineAudit.rects}/${trace.sustained.engineAudit.offsets}/${trace.sustained.engineAudit.styleReads}/${trace.sustained.engineAudit.poseWrites}`
    }
    if (exactPass) {
        exactDetail = `every commit ${trace.unscrolled.participants * 2} rect/pair reads, ${requiredStyles} computed reads (${trace.typedOM ? 'incl. Typed OM' : 'Chromium set'}), ${trace.unscrolled.poses} poses; steady frames read zero`
    }
    findings.push({
        id: 'G13',
        label: 'Exact read counts per commit and zero steady-frame reads',
        gate: '<= 2N rects and 2N layout-size pairs, exactly the computed reads; steady frames read zero',
        unit: 'excess reads',
        value: exactPass ? 0 : 1,
        pass: exactPass,
        measured: trace.exactReads.length > 0,
        detail: exactDetail,
    })
    // G12: the held shape at 1 and 10 held elements. A held frame reads one
    // rect per held element before any write; p95 / held is the gate value.
    let heldReadsPass = true
    const heldReadsDetail: string[] = []
    for (const [label, shape] of [
        ['1', trace.held.one],
        ['10', trace.held.ten],
    ] as const) {
        const gate = heldIncrementalGate(
            shape.samples,
            shape.baselineSamples,
            shape.held,
            trace.g
        )
        const samplesComplete =
            shape.samples.length === 600 && shape.baselineSamples.length === 600
        const readPass =
            shape.reads.mismatches === 0 &&
            shape.reads.frames === 600 &&
            shape.reads.rects === shape.reads.holds &&
            shape.reads.offsets === 0 &&
            shape.reads.styles === 0
        if (!readPass) heldReadsPass = false
        heldReadsDetail.push(
            `${shape.held} held: ${shape.reads.rects} rects / ${shape.reads.holds} hold-frames, ${shape.reads.offsets} pairs, ${shape.reads.styles} styles, ${shape.reads.mismatches} mismatched frames`
        )
        findings.push({
            ...gate,
            id: `G12-${label}`,
            label: `Held frame at ${shape.held} held element${shape.held === 1 ? '' : 's'}`,
            value: validity.timerValid ? gate.value : Number.NaN,
            blocked: !validity.timerValid,
            deciding: validity.timerValid,
            measured: samplesComplete,
            pass:
                samplesComplete && shape.releaseClean && readPass && gate.pass,
            detail: `${gate.detail ?? ''}; ${shape.samples.length} held / ${shape.baselineSamples.length} baseline samples; incremental ${shape.incrementalPerHeld.toFixed(4)} ms/held; held reads exactly one rect per element; release ${shape.releaseClean ? 'clean' : 'left a hold/track'}`,
        })
    }
    findings.push({
        id: 'G13-held',
        label: 'Held frame reads exactly one rect per held element',
        gate: 'one rect per live hold per frame, zero offset/style reads, 600 frames',
        unit: 'excess reads',
        value: heldReadsPass ? 0 : 1,
        pass: heldReadsPass,
        measured: true,
        detail: heldReadsDetail.join('; '),
    })
    const floorPass = findings
        .filter(
            (finding) =>
                finding.id.startsWith('G9.floor') || finding.id === 'G11.floor'
        )
        .every((finding) => finding.pass)
    return {
        findings,
        valid: validCost,
        blockedReasons: validity.reasons,
        problems,
        report: {
            run: 0,
            warmup: false,
            valid: validCost,
            blockedReasons: validity.reasons,
            engineAudit: trace.unscrolled.engineAudit,
            floorAudit: {
                ...trace.unscrolled.floorAudit,
            },
            engineAuditScrolled: trace.scrolled.engineAudit,
            floorAuditScrolled: {
                ...trace.scrolled.floorAudit,
            },
            ratioUnscrolled: unscrolledRatio,
            ratioScrolled: scrolledRatio,
            engineMedianUnscrolled: median(trace.unscrolled.engine),
            floorMedianUnscrolled: median(trace.unscrolled.floor),
            engineMedianScrolled: median(trace.scrolled.engine),
            floorMedianScrolled: median(trace.scrolled.floor),
            steadyP95,
            steadySampleMode: trace.steady.sampleMode,
            sustainedP95,
            sustainedFloorP95: floorP95,
            sustainedRatio,
            sustainedCommits: trace.sustained.commits,
            sustainedCommitHz: trace.sustained.commitHz,
            sustainedSampleMode: trace.sustained.sampleMode,
            sustainedErrorBound: trace.sustained.errorBound,
            sustainedEngineAudit: trace.sustained.engineAudit,
            sustainedFloorAudit: trace.sustained.floorAudit,
            sustainedFloorAuditPass: sustainedAudit.pass,
            floorAuditPass: floorPass && problems.length === 0,
            floorAuditDetail: [
                ...findings
                    .filter(
                        (finding) =>
                            finding.id.startsWith('G9.floor') ||
                            finding.id === 'G11.floor'
                    )
                    .map((finding) => finding.detail ?? ''),
                ...problems,
            ]
                .filter(Boolean)
                .join('; '),
            exactReadsPass: exactPass,
            exactReadsDetail: exactDetail,
            heldBaselineP95: trace.held.one.baselineP95,
            heldTenBaselineP95: trace.held.ten.baselineP95,
            heldOneP95: trace.held.one.p95,
            heldTenP95: trace.held.ten.p95,
            heldOnePerHeld: trace.held.one.incrementalPerHeld,
            heldTenPerHeld: trace.held.ten.incrementalPerHeld,
            heldReadsPass,
            heldReadsDetail: heldReadsDetail.join('; '),
            g: trace.g,
            gSource: trace.gSource,
        },
    }
}

function aggregateCost(
    runs: readonly CostRunReport[],
    findings: readonly (readonly MetricFinding[])[],
    expectedRuns: number
): CostReport {
    const measured = runs.filter((run) => !run.warmup)
    const measuredFindings = findings.filter((_, index) => !runs[index]!.warmup)
    const metrics = aggregate(
        measuredFindings,
        measured.map((run) => run.run)
    )
    const valid =
        measured.length === expectedRuns && measured.every((run) => run.valid)
    const blockedReasons = [
        ...new Set(measured.flatMap((run) => run.blockedReasons)),
    ]
    const metricsPass = metrics.every((metric) => metric.pass)
    const outcome = costOutcome({ valid, metricsPass })
    return {
        scene: 'S-BULK',
        status: outcome.status,
        pending: outcome.pending,
        pass: outcome.pass,
        valid,
        blockedReasons,
        metrics,
        runs,
        notes: [
            'G9/G10/G11/G12/G13 are measured; G12 is the 1- and 10-held shape on the real clock.',
            'G12 and G13-held pass only when every held frame reads exactly one rect per held element and the release leaves no hold or track.',
            'S-BULK frame scoring (G1–G8, manual clock) is the separate s-bulk scene.',
        ],
        measuredRuns: measured.length,
    }
}

const SCENE_CONTROLS: readonly {
    readonly name: string
    readonly scene: string
    readonly control: string
    readonly target: string
    readonly variant?: VariantId | undefined
}[] = [
    {
        name: 'card-no-image-id',
        scene: 's-card',
        control: 'card-no-image-id',
        target: 'G1',
    },
    {
        name: 'card-no-inert',
        scene: 's-card',
        control: 'card-no-inert',
        target: 'shape.inert',
    },
    {
        name: 'card-image-offset',
        scene: 's-card',
        control: 'card-image-offset',
        target: 'G1',
    },
    {
        name: 'card-focus-follower',
        scene: 's-card',
        control: 'card-focus-follower',
        target: 'shape.focus',
    },
    {
        name: 'seg-rest-retarget',
        scene: 's-seg',
        control: 'rest-retarget',
        target: 'G1',
    },
    {
        name: 'seg-jump-from-A',
        scene: 's-seg',
        control: 'jump-from-A',
        target: 'G2',
    },
    {
        name: 'seg-leftover-pose',
        scene: 's-seg',
        control: 'leftover-pose',
        target: 'G6',
    },
    {
        name: 'photo-no-counter-scale',
        scene: 's-photo',
        control: 'photo-no-counter-scale',
        target: 'G1',
    },
    {
        name: 'acc-separator-1px',
        scene: 's-acc',
        control: 'acc-separator-1px',
        target: 'G1',
    },
    {
        name: 'stack-badge-nonparticipant',
        scene: 's-stack',
        control: 'stack-badge-nonparticipant',
        target: 'G1',
    },
    {
        name: 'island-snap-reverse',
        scene: 's-island',
        control: 'island-snap-reverse',
        target: 'G2',
    },
    {
        name: 'insert-no-presence',
        scene: 's-insert',
        control: 'insert-no-presence',
        target: 'shape.presence-opacity',
    },
    {
        name: 'delete-no-lift',
        scene: 's-delete',
        control: 'delete-no-lift',
        target: 'G1',
    },
    {
        name: 'photo-leftover-pose',
        scene: 's-photo',
        control: 'photo-leftover-pose',
        target: 'G6',
    },
    {
        name: 'photo-extra-read',
        scene: 's-photo',
        control: 'photo-extra-read',
        target: 'G13',
    },
    {
        name: 'acc-leftover-pose',
        scene: 's-acc',
        control: 'acc-leftover-pose',
        target: 'G6',
    },
    {
        name: 'acc-extra-read',
        scene: 's-acc',
        control: 'acc-extra-read',
        target: 'G13',
    },
    {
        name: 'insert-leftover-pose',
        scene: 's-insert',
        control: 'insert-leftover-pose',
        target: 'G6',
    },
    {
        name: 'insert-extra-read',
        scene: 's-insert',
        control: 'insert-extra-read',
        target: 'G13',
    },
    {
        name: 'stack-extra-read',
        scene: 's-stack',
        control: 'stack-extra-read',
        target: 'G13',
    },
    {
        name: 'stack-leftover-pose',
        scene: 's-stack',
        control: 'stack-leftover-pose',
        target: 'G6',
    },
    {
        name: 'stack-no-badge-scale',
        scene: 's-stack',
        control: 'stack-no-badge-scale',
        target: 'shape.badge-scale',
    },
    {
        name: 'island-extra-read',
        scene: 's-island',
        control: 'island-extra-read',
        target: 'G13',
    },
    {
        name: 'delete-extra-read',
        scene: 's-delete',
        control: 'delete-extra-read',
        target: 'G13',
    },
    {
        name: 'reorder-kill-switch-skip',
        scene: 's-reorder',
        control: 'reorder-kill-switch-skip',
        target: 'shape.kill-switch',
    },
    {
        name: 'reorder-extra-read',
        scene: 's-reorder',
        control: 'reorder-extra-read',
        target: 'G13',
    },
    {
        name: 'reorder-no-rebase',
        scene: 's-reorder',
        control: 'reorder-no-rebase',
        target: 'G1',
    },
    {
        name: 'reorder-cancel-instead',
        scene: 's-reorder',
        control: 'reorder-cancel-instead',
        target: 'shape.hold',
    },
    {
        name: 'sheet-medium-detent',
        scene: 's-sheet',
        control: 'sheet-medium-detent',
        target: 'G5',
    },
    {
        name: 'sheet-release-jump',
        scene: 's-sheet',
        control: 'sheet-release-jump',
        target: 'G2',
    },
    {
        name: 'sheet-extra-read',
        scene: 's-sheet',
        control: 'sheet-extra-read',
        target: 'G13',
    },
    {
        name: 'sheet-cancel-instead',
        scene: 's-sheet',
        control: 'sheet-cancel-instead',
        target: 'shape.hold',
    },
    {
        name: 'bulk-target-offset',
        scene: 's-bulk',
        control: 'bulk-target-offset',
        target: 'G1',
    },
    {
        name: 'bulk-extra-read',
        scene: 's-bulk',
        control: 'bulk-extra-read',
        target: 'G13',
    },
    {
        name: 'bulk-leftover-pose',
        scene: 's-bulk',
        control: 'bulk-leftover-pose',
        target: 'G6',
    },
    // H19 support-variant controls: each variant family must be able to fail
    // its target without changing a gate value.
    {
        name: 'dpr1-card-no-image-id',
        scene: 's-card',
        control: 'card-no-image-id',
        target: 'G1',
        variant: 'dpr1',
    },
    {
        name: 'dpr3-photo-no-counter-scale',
        scene: 's-photo',
        control: 'photo-no-counter-scale',
        target: 'G1',
        variant: 'dpr3',
    },
    {
        name: 'dpr1-acc-separator-1px',
        scene: 's-acc',
        control: 'acc-separator-1px',
        target: 'G1',
        variant: 'dpr1',
    },
    {
        name: 'dpr3-seg-leftover-pose',
        scene: 's-seg',
        control: 'leftover-pose',
        target: 'G6',
        variant: 'dpr3',
    },
    {
        name: 'rm-jump-card-policy-ignored',
        scene: 's-card',
        control: 'rm-policy-ignored',
        target: 'G1',
        variant: 'rm-jump',
    },
    {
        name: 'rm-jump-photo-policy-ignored',
        scene: 's-photo',
        control: 'rm-policy-ignored',
        target: 'G1',
        variant: 'rm-jump',
    },
    {
        name: 'rm-max-acc-unclamped',
        scene: 's-acc',
        control: 'rm-policy-unclamped',
        target: 'G1',
        variant: 'rm-max',
    },
    {
        name: 'rm-jump-reorder-policy-ignored',
        scene: 's-reorder',
        control: 'rm-policy-ignored',
        target: 'G1',
        variant: 'rm-jump',
    },
    {
        name: 'rm-max-sheet-unclamped',
        scene: 's-sheet',
        control: 'rm-policy-unclamped',
        target: 'G1',
        variant: 'rm-max',
    },
    {
        name: 'rm-ignore-photo-jump',
        scene: 's-photo',
        control: 'rm-policy-jump',
        target: 'G1',
        variant: 'rm-ignore',
    },
]

async function browserControls(
    engine: EngineName,
    bundle: string,
    scenes: readonly string[]
): Promise<NegativeControlResult[]> {
    const results: NegativeControlResult[] = []
    let browser: BenchBrowser | null = null
    try {
        browser = await BenchBrowser.launch(engine, `${engine} controls`)
        let primaryCardInert: boolean | null = null
        const primaryScores = new Map<string, ReturnType<typeof scoreScene>>()
        const controls = SCENE_CONTROLS.filter((entry) =>
            scenes.includes(entry.scene)
        )
        const controlKeys = new Set(
            controls.map(
                (entry) => `${entry.scene}|${entry.variant ?? 'primary'}`
            )
        )
        for (const key of controlKeys) {
            const [scene, id] = key.split('|') as [string, string]
            const spec =
                id === 'primary'
                    ? undefined
                    : variantSpec(scene, id as VariantId)
            try {
                const primary = await runManual(
                    browser.browser,
                    bundle,
                    scene,
                    `${engine} controls primary`,
                    {
                        ...(spec ? { variant: spec } : {}),
                    }
                )
                progress(`${engine} controls: score primary ${key}`)
                primaryScores.set(
                    key,
                    scoreScene(
                        planFor(scene, primary.trace, spec),
                        primary.trace
                    )
                )
            } catch (error) {
                results.push({
                    name: `${key} primary`,
                    target: 'baseline',
                    expected: 'fail',
                    observed: 'error',
                    conclusive: true,
                    ok: false,
                    detail: describeError(error),
                })
            }
        }
        const primaryScore = primaryScores.get('s-card|primary')
        primaryCardInert =
            primaryScore?.shape.find((entry) => entry.id === 'shape.inert')
                ?.pass ?? null
        for (const control of controls) {
            const key = `${control.scene}|${control.variant ?? 'primary'}`
            const spec =
                control.variant === undefined
                    ? undefined
                    : variantSpec(control.scene, control.variant)
            try {
                const run = await runManual(
                    browser.browser,
                    bundle,
                    control.scene,
                    `${engine} controls`,
                    {
                        control: control.control,
                        ...(spec ? { variant: spec } : {}),
                    }
                )
                const plan = planFor(run.trace.scene, run.trace, spec)
                progress(`${engine} controls: score ${control.name}`)
                const score = scoreScene(plan, run.trace)
                const finding = [...score.metrics, ...score.shape].find(
                    (entry) => entry.id === control.target
                )
                const primaryFinding = [
                    ...(primaryScores.get(key)?.metrics ?? []),
                    ...(primaryScores.get(key)?.shape ?? []),
                ].find((entry) => entry.id === control.target)
                const observed = finding
                    ? finding.pass
                        ? 'pass'
                        : 'fail'
                    : 'error'
                const primaryTargetFails =
                    primaryFinding !== undefined && !primaryFinding.pass
                // F9: the primary S-REORDER G13 is already red (held support
                // reads). The extra-read control is still conclusive when it
                // strictly grows the same measured excess.
                const isolatedDelta =
                    control.name === 'reorder-extra-read' &&
                    primaryFinding !== undefined &&
                    finding !== undefined &&
                    finding.value > primaryFinding.value
                const inconclusive =
                    (primaryTargetFails && !isolatedDelta) ||
                    (control.name === 'card-no-inert' &&
                        primaryCardInert === false) ||
                    (control.name === 'card-focus-follower' &&
                        observed === 'pass')
                results.push({
                    name: control.name,
                    target: control.target,
                    expected: 'fail',
                    observed: inconclusive ? 'inconclusive' : observed,
                    conclusive: !inconclusive,
                    ok: inconclusive ? true : observed === 'fail',
                    detail: finding
                        ? `${control.target} = ${finding.value}${
                              finding.worst?.frame === undefined
                                  ? ''
                                  : ` at frame ${finding.worst.frame}`
                          }${isolatedDelta ? `; isolated delta ${finding.value} > primary ${primaryFinding?.value}` : ''}${inconclusive ? (primaryTargetFails ? '; inconclusive: the primary scene already fails this target' : '; focus did not remain in the follower, so the control cannot isolate a delta') : ''}${run.problems.length > 0 ? `; ${run.problems.join('; ')}` : ''}`
                        : 'target metric missing',
                })
            } catch (error) {
                results.push({
                    name: control.name,
                    target: control.target,
                    expected: 'fail',
                    observed: 'error',
                    conclusive: true,
                    ok: false,
                    detail: describeError(error),
                })
            }
        }
        try {
            const heldAudit = await runHeldAudit(
                browser.browser,
                bundle,
                true,
                `${engine} controls held-extra-read`
            )
            results.push({
                name: 'held-extra-read',
                target: 'G13-held',
                expected: 'fail',
                observed: heldAudit.mismatches > 0 ? 'fail' : 'pass',
                conclusive: true,
                ok: heldAudit.mismatches > 0,
                detail: `${heldAudit.rects} rects / ${heldAudit.holds} holds at one audited frame; ${heldAudit.offsets} pairs, ${heldAudit.styles} styles`,
            })
        } catch (error) {
            results.push({
                name: 'held-extra-read',
                target: 'G13-held',
                expected: 'fail',
                observed: 'error',
                conclusive: true,
                ok: false,
                detail: describeError(error),
            })
        }
        try {
            const auditTrace = await runFloorAudit(
                browser.browser,
                bundle,
                true,
                `${engine} controls floor-extra-read`
            )
            const audit = auditFloor({
                participants: auditTrace.participants,
                poses: auditTrace.poses,
                typedOM: auditTrace.typedOM,
                captureRects: auditTrace.captureRects,
                captureOffsets: auditTrace.captureOffsets,
                flushRects: auditTrace.flushRects,
                flushOffsets: auditTrace.flushOffsets,
                styleReads: auditTrace.styleReads,
                poseWrites: auditTrace.poseWrites,
                extraReads: auditTrace.extraReads,
            })
            results.push({
                name: 'floor-extra-read',
                target: 'G9.floor',
                expected: 'fail',
                observed: audit.pass ? 'pass' : 'fail',
                conclusive: true,
                ok: !audit.pass,
                detail: audit.mismatches.join('; ') || audit.summary,
            })
        } catch (error) {
            results.push({
                name: 'floor-extra-read',
                target: 'G9.floor',
                expected: 'fail',
                observed: 'error',
                conclusive: true,
                ok: false,
                detail: describeError(error),
            })
        }
    } catch (error) {
        results.push({
            name: `${engine}-controls`,
            target: 'all',
            expected: 'fail',
            observed: 'error',
            conclusive: true,
            ok: false,
            detail: describeError(error),
        })
    } finally {
        await browser?.close(`${engine} controls teardown`)
    }
    return results
}

/* ───────────────────────── self-tests ───────────────────────── */

const SELF_TEST_FILES = [
    'bench/layout/oracle.test.ts',
    'bench/layout/scoring.test.ts',
    'bench/layout/stats.test.ts',
    'bench/layout/frame_sampler.test.ts',
    'bench/layout/aggregate.test.ts',
    'bench/layout/certification.test.ts',
    'bench/layout/cost_validity.test.ts',
    'bench/layout/variants.test.ts',
    'bench/layout/timeout.test.ts',
] as const

function selfTests(): {
    pass: boolean
    controls: string[]
    files: readonly string[]
    detail: string
} {
    const result = spawnSync(process.execPath, ['--test', ...SELF_TEST_FILES], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 180000,
    })
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const controls = output
        .split('\n')
        .map((line) => line.trim())
        .filter(
            (line) =>
                line.startsWith('✔ negative control') ||
                line.startsWith('✔ shape negative controls')
        )
        .map((line) => line.replace(/^✔ /, ''))
    return {
        pass: result.status === 0 && controls.length >= 14,
        controls,
        files: [...SELF_TEST_FILES],
        detail:
            result.status === 0
                ? `${controls.length} negative controls failed as required across ${SELF_TEST_FILES.length} test files`
                : output.split('\n').slice(-20).join(' ').trim() ||
                  `node --test exited ${String(result.status)}`,
    }
}

/* ───────────────────────── orchestration ───────────────────────── */

interface RunSceneOutcome {
    readonly report: RunSceneReport
    readonly findings: readonly MetricFinding[]
    readonly shape: readonly MetricFinding[]
}

function planFor(
    scene: string,
    trace: SceneTrace,
    variant?: VariantSpec | undefined
): ReturnType<typeof cardPlan> {
    const base = (() => {
        if (scene === 's-card') return cardPlan(trace)
        if (scene === 's-seg') return segPlan(trace)
        if (scene === 's-acc') return accPlan(trace)
        if (scene === 's-insert') return insertPlan(trace)
        if (scene === 's-delete') return deletePlan(trace)
        if (scene === 's-island') return islandPlan(trace)
        if (scene === 's-photo') return photoPlan(trace)
        if (scene === 's-stack') return stackPlan(trace)
        if (scene === 's-reorder') return reorderPlan(trace)
        if (scene === 's-sheet') return sheetPlan(trace)
        if (scene === 's-bulk') return bulkPlan(trace)
        throw new Error(`no scene plan for "${scene}"`)
    })()
    return variant ? applyVariantPlan(base, trace, variant) : base
}

function sceneOutcome(
    run: number,
    warmup: boolean,
    manual: SceneTrace,
    real: RealTrace,
    probe: SceneCostProbeResult | null,
    problems: readonly string[],
    variant?: VariantSpec | undefined
): RunSceneOutcome {
    const plan = planFor(manual.scene, manual, variant)
    const score = scoreScene(plan, manual)
    const allProblems = [...problems, ...realTwinProblems(real)]
    const g8Raw = realClockGate(real.frameCosts, real.g)
    // S-BULK WebKit's p95 2.000 ms is exactly one 1 ms timer tick: it is not
    // a measured G8 pass. The §11.5 single-interval 20-frame mean is not
    // available in this protocol, so the row is BLOCK/limitation.
    const g8Blocked = manual.scene === 's-bulk' && real.g > 0.05
    const g8: MetricFinding = g8Blocked
        ? {
              ...g8Raw,
              blocked: true,
              deciding: true,
              pass: false,
              detail: `${g8Raw.detail ?? ''}; WebKit g ${real.g.toFixed(4)} ms: 1 ms-quantized raw samples; the §11.5 20-frame mean is not claimed; G8 is BLOCK/limitation, not a measured pass`,
          }
        : g8Raw
    const longFrames = real.frameCosts.filter(
        (frame) => !frame.commit && frame.ms > 8
    ).length
    const metrics: MetricFinding[] = [...score.metrics, g8]
    if (real.held) {
        const gate = heldIncrementalGate(
            real.held.samples,
            real.held.baselineSamples,
            1,
            real.g
        )
        const readsPass =
            real.held.reads.mismatches === 0 &&
            real.held.reads.frames === 600 &&
            real.held.reads.rects === real.held.reads.holds &&
            real.held.reads.offsets === 0 &&
            real.held.reads.styles === 0
        metrics.push({
            ...gate,
            id: 'G12',
            label: 'Held frame at 1 held element (scene shape)',
            value: real.g <= 0.05 ? gate.value : Number.NaN,
            blocked: real.g > 0.05,
            deciding: real.g <= 0.05,
            measured:
                real.held.samples.length === 600 &&
                real.held.baselineSamples.length > 0,
            pass:
                real.held.samples.length === 600 &&
                real.held.baselineSamples.length > 0 &&
                real.held.releaseClean &&
                readsPass &&
                gate.pass,
            detail: `${gate.detail ?? ''}; scene held shape, 1 held; ${real.held.samples.length} held / ${real.held.baselineSamples.length} baseline samples; incremental ${gate.value.toFixed(4)} ms/held; reads ${real.held.reads.rects}/${real.held.reads.holds} rects/hold-frames; ${real.held.reads.mismatches} mismatched frames; release ${real.held.releaseClean ? 'clean' : 'left a hold/track'}`,
        })
        metrics.push({
            id: 'G13-held',
            label: 'Held frame reads exactly one rect per held element (scene)',
            gate: 'one rect per live hold per frame, zero offset/style reads, 600 frames',
            unit: 'excess reads',
            value: readsPass ? 0 : 1,
            pass: readsPass,
            measured: true,
            detail: `scene held shape: ${real.held.reads.rects} rects / ${real.held.reads.holds} hold-frames, ${real.held.reads.offsets} pairs, ${real.held.reads.styles} styles, ${real.held.reads.mismatches} mismatched frames`,
        })
    }
    if (probe) {
        metrics.push({
            id: 'G9.probe',
            label: `Engine/floor commit ratio at scene N=${probe.participants} (non-deciding)`,
            gate: 'non-deciding; the named G9 gate is S-BULK at 1,000 participants',
            unit: 'ratio',
            value: probe.ratio,
            pass: true,
            measured: true,
            deciding: false,
            detail: `${probe.participants} participants, ${probe.movers} movers; engine ${median(probe.engine).toFixed(3)} ms / floor ${median(probe.floor).toFixed(3)} ms`,
        })
    } else {
        metrics.push({
            id: 'G9.probe',
            label: `Engine/floor commit ratio at scene N (non-deciding)`,
            gate: 'non-deciding; probe must be reported',
            unit: 'ratio',
            value: Number.NaN,
            pass: false,
            measured: false,
            deciding: false,
            detail: 'scene cost probe missing',
        })
    }
    // The scene's per-run pass includes every deciding metric added after the
    // plan score (G8, the scene G12 and G13-held); a metric that is BLOCK on a
    // coarse timer is non-deciding.
    const addedPass = metrics
        .filter(
            (metric) => metric.deciding !== false && metric.blocked !== true
        )
        .every((metric) => metric.pass)
    // A BLOCK G8 does not fail the run on its quantized raw value; it blocks
    // the scene through blockedReasons instead.
    const g8PassForRun = g8Blocked ? true : g8Raw.pass
    const pass =
        score.pass &&
        g8PassForRun &&
        addedPass &&
        allProblems.length === 0 &&
        manual.final.tracks === 0 &&
        manual.final.holds === 0 &&
        manual.final.clockPending === 0 &&
        manual.final.clockSize === 0
    return {
        report: {
            scene:
                variant === undefined
                    ? manual.scene
                    : variantKey(manual.scene, variant.id),
            run,
            warmup,
            pass,
            costProbe: probe
                ? {
                      participants: probe.participants,
                      movers: probe.movers,
                      engineMedian: median(probe.engine),
                      floorMedian: median(probe.floor),
                      ratio: probe.ratio,
                  }
                : {
                      participants: 0,
                      movers: 0,
                      engineMedian: Number.NaN,
                      floorMedian: Number.NaN,
                      ratio: Number.NaN,
                  },
            metrics,
            shape: score.shape,
            real: {
                g: real.g,
                gSource: real.gSource,
                frames: real.frameCosts.length,
                p95: g8.value,
                longFrames,
                pass: g8Raw.pass && !g8Blocked,
                blocked: g8Blocked,
            },
            summary: {
                observations: manual.observations.length,
                commits: manual.commits.map((commit) => ({
                    label: commit.label,
                    frame: commit.frame,
                    rects: commit.rects,
                    offsets: commit.offsets,
                    styles: commit.styles,
                    frameReads: commit.frameReads,
                    ...(commit.presenceRects !== undefined ||
                    commit.presenceStyles !== undefined
                        ? {
                              presenceRects: commit.presenceRects,
                              presenceStyles: commit.presenceStyles,
                          }
                        : {}),
                })),
                reports: manual.reports.map((entry) => ({
                    label: entry.label,
                    status: entry.status,
                    snapped: entry.snapped.map((snap) => snap.key),
                    settledFrame: entry.settledFrame,
                })),
                settleFrames: manual.settleFrames,
                steadyFrameReads: manual.steadyFrameReads,
                final: manual.final,
            },
            problems: allProblems,
        },
        findings: metrics,
        shape: score.shape,
    }
}

interface MeasuredRun {
    readonly scenes: readonly RunSceneOutcome[]
    readonly variants: readonly RunSceneOutcome[]
    readonly cost: CostRunReport | null
    readonly costFindings: readonly MetricFinding[] | null
    /** A cost stage that timed out or failed; the run is not silently absent. */
    readonly costError: string | null
    readonly browserVersion: string
}

interface SceneFailure {
    readonly scene: string
    readonly variant?: VariantSpec | undefined
    readonly stage: string
    readonly error: unknown
}

function failedSceneOutcome(
    scene: string,
    run: number,
    warmup: boolean,
    variant: VariantSpec | undefined,
    failure: SceneFailure
): RunSceneOutcome {
    const key = variant ? variantKey(scene, variant.id) : scene
    const problem = `${failure.stage} failed: ${describeError(failure.error)}`
    return {
        report: {
            scene: key,
            run,
            warmup,
            pass: false,
            costProbe: {
                participants: 0,
                movers: 0,
                engineMedian: Number.NaN,
                floorMedian: Number.NaN,
                ratio: Number.NaN,
            },
            metrics: [],
            shape: [],
            real: {
                g: Number.NaN,
                gSource: 'reads',
                frames: 0,
                p95: Number.NaN,
                longFrames: 0,
                pass: false,
                blocked: false,
            },
            summary: {
                observations: 0,
                commits: [],
                reports: [],
                settleFrames: [],
                steadyFrameReads: 0,
                final: {
                    tracks: 0,
                    holds: 0,
                    clockPending: 0,
                    clockSize: 0,
                    connected: [],
                    diagnostics: [],
                },
            },
            problems: [problem],
        },
        findings: [],
        shape: [],
    }
}

/** A failed real twin keeps the manual evidence and fails G8/RUN honestly. */
function failedRealTrace(scene: string): RealTrace {
    return {
        scene,
        mode: 'real',
        g: Number.NaN,
        gSource: 'reads',
        frameCosts: [],
        commits: [],
        diagnostics: [],
        allowEmptyFinal: true,
        final: { tracks: 0, holds: 0, connected: 0 },
    }
}

async function measureRun(
    engine: EngineName,
    bundle: string,
    options: Options,
    run: number,
    warmup: boolean
): Promise<MeasuredRun> {
    // The manual-clock scoring run and the real-clock twin each get a fresh
    // browser process; the cost shapes get a third with its own 1280x720 page.
    const runStage = `${engine} run ${run}/${options.runs}${warmup ? ' (warm-up)' : ''}`
    const variantSpecs = selectedVariants(
        options.scenes.filter((scene) => scene !== 'cost'),
        options.variants
    )
    const manualTraces: {
        scene: string
        trace: SceneTrace
        problems: string[]
        variant?: VariantSpec
    }[] = []
    const failures: SceneFailure[] = []
    const probes = new Map<string, SceneCostProbeResult>()
    const probeProblems = new Map<string, string>()
    const runProblems: string[] = []
    let manualBrowser = await BenchBrowser.launch(engine, `${runStage} manual`)
    const version = manualBrowser.version
    try {
        for (const scene of options.scenes) {
            if (scene === 'cost') continue
            const stage = `${runStage} manual`
            try {
                const manual = await runManual(
                    manualBrowser.browser,
                    bundle,
                    scene,
                    stage
                )
                manualTraces.push({
                    scene,
                    trace: manual.trace,
                    problems: [...manual.problems],
                })
            } catch (error) {
                failures.push({ scene, stage: `${stage} ${scene}`, error })
                progress(
                    `${stage} ${scene}: failed, restarting the manual browser`
                )
                await manualBrowser.close(`${stage} ${scene} after failure`)
                manualBrowser = await BenchBrowser.launch(
                    engine,
                    `${runStage} manual relaunch`
                )
            }
        }
        for (const variant of variantSpecs) {
            const stage = `${runStage} manual`
            const label = sceneLabel(variant.scene, variant)
            try {
                const manual = await runManual(
                    manualBrowser.browser,
                    bundle,
                    variant.scene,
                    stage,
                    { variant }
                )
                manualTraces.push({
                    scene: variant.scene,
                    trace: manual.trace,
                    problems: [...manual.problems],
                    variant,
                })
            } catch (error) {
                failures.push({
                    scene: variant.scene,
                    variant,
                    stage: `${stage} ${label}`,
                    error,
                })
                progress(
                    `${stage} ${label}: failed, restarting the manual browser`
                )
                await manualBrowser.close(`${stage} ${label} after failure`)
                manualBrowser = await BenchBrowser.launch(
                    engine,
                    `${runStage} manual relaunch`
                )
            }
        }
        for (const manual of manualTraces) {
            if (manual.variant) continue
            try {
                probes.set(
                    manual.scene,
                    await runSceneCostProbe(
                        manualBrowser.browser,
                        bundle,
                        manual.scene,
                        `${runStage} probe`
                    )
                )
            } catch (error) {
                const problem = `${runStage} probe ${manual.scene} failed: ${describeError(error)}`
                probeProblems.set(manual.scene, problem)
                progress(`${problem}; restarting the manual browser`)
                await manualBrowser.close(
                    `${runStage} probe ${manual.scene} after failure`
                )
                manualBrowser = await BenchBrowser.launch(
                    engine,
                    `${runStage} manual relaunch`
                )
            }
        }
    } finally {
        await manualBrowser.close(`${runStage} manual teardown`)
        runProblems.push(...manualBrowser.problems)
    }
    let realBrowser = await BenchBrowser.launch(engine, `${runStage} real`)
    const realTraces = new Map<
        string,
        { trace: RealTrace; problems: readonly string[] }
    >()
    const realFailures = new Map<string, string>()
    try {
        for (const manual of manualTraces) {
            const key = manual.variant
                ? variantKey(manual.scene, manual.variant.id)
                : manual.scene
            const stage = `${runStage} real`
            try {
                realTraces.set(
                    key,
                    await runReal(
                        realBrowser.browser,
                        bundle,
                        manual.scene,
                        stage,
                        manual.variant
                    )
                )
            } catch (error) {
                const problem = `${stage} ${key} failed: ${describeError(error)}`
                realFailures.set(key, problem)
                progress(`${problem}; restarting the real browser`)
                await realBrowser.close(`${stage} ${key} after failure`)
                realBrowser = await BenchBrowser.launch(
                    engine,
                    `${runStage} real relaunch`
                )
            }
        }
    } finally {
        await realBrowser.close(`${runStage} real teardown`)
        runProblems.push(...realBrowser.problems)
    }
    let cost: CostRunReport | null = null
    let costFindings: MetricFinding[] | null = null
    let costError: string | null = null
    if (options.scenes.includes('cost')) {
        let costBrowser: BenchBrowser | null = null
        try {
            costBrowser = await BenchBrowser.launch(engine, `${runStage} cost`)
            const measured = await runCost(
                costBrowser.browser,
                bundle,
                `${runStage} cost`
            )
            const evaluated = evaluateCost(measured.trace, measured.problems)
            cost = {
                ...evaluated.report,
                run,
                warmup,
            }
            costFindings = evaluated.findings.map((finding) => ({
                ...finding,
                pass: finding.pass && evaluated.problems.length === 0,
            }))
        } catch (error) {
            costError = `${runStage} cost failed: ${describeError(error)}`
            progress(costError)
        } finally {
            await costBrowser?.close(`${runStage} cost teardown`)
            runProblems.push(...(costBrowser?.problems ?? []))
        }
    }
    const primaryScenes = options.scenes.filter((scene) => scene !== 'cost')
    const scenes = primaryScenes.map((scene) => {
        progress(`${runStage}: score primary ${scene}`)
        const failure = failures.find(
            (entry) => entry.variant === undefined && entry.scene === scene
        )
        if (failure) {
            return failedSceneOutcome(scene, run, warmup, undefined, failure)
        }
        const manual = manualTraces.find(
            (entry) => entry.variant === undefined && entry.scene === scene
        )
        if (!manual) {
            return failedSceneOutcome(scene, run, warmup, undefined, {
                scene,
                stage: `${runStage} manual ${scene}`,
                error: new Error('no manual trace was produced'),
            })
        }
        const extraProblems = [
            ...manual.problems,
            ...(probeProblems.get(scene) === undefined
                ? []
                : [probeProblems.get(scene)!]),
            ...(realFailures.get(scene) === undefined
                ? []
                : [realFailures.get(scene)!]),
            ...runProblems,
        ]
        const real = realTraces.get(scene)
        return sceneOutcome(
            run,
            warmup,
            manual.trace,
            real?.trace ?? failedRealTrace(scene),
            probes.get(scene) ?? null,
            [...extraProblems, ...(real?.problems ?? [])]
        )
    })
    const variants = variantSpecs.map((variant) => {
        const key = variantKey(variant.scene, variant.id)
        progress(`${runStage}: score variant ${key}`)
        const failure = failures.find(
            (entry) =>
                entry.variant !== undefined &&
                entry.scene === variant.scene &&
                entry.variant.id === variant.id
        )
        if (failure) {
            return failedSceneOutcome(
                variant.scene,
                run,
                warmup,
                variant,
                failure
            )
        }
        const manual = manualTraces.find(
            (entry) =>
                entry.variant !== undefined &&
                entry.scene === variant.scene &&
                entry.variant.id === variant.id
        )
        if (!manual) {
            return failedSceneOutcome(variant.scene, run, warmup, variant, {
                scene: variant.scene,
                stage: `${runStage} manual ${key}`,
                error: new Error('no manual trace was produced'),
            })
        }
        const real = realTraces.get(key)
        return sceneOutcome(
            run,
            warmup,
            manual.trace,
            real?.trace ?? failedRealTrace(key),
            null,
            [
                ...manual.problems,
                ...(realFailures.get(key) === undefined
                    ? []
                    : [realFailures.get(key)!]),
                ...runProblems,
                ...(real?.problems ?? []),
            ],
            variant
        )
    })
    return {
        scenes,
        variants,
        cost,
        costFindings,
        costError,
        browserVersion: version,
    }
}

function pendingEntries(
    options: Options,
    engines: readonly EngineReport[]
): { scene: string; reason: string }[] {
    const entries: { scene: string; reason: string }[] = []
    const costPending = engines.some(
        (engine) => engine.cost?.pending !== null && engine.cost !== null
    )
    if (options.scenes.includes('cost') && costPending) {
        entries.push({
            scene: 'S-BULK',
            reason: HELD_PENDING_REASON,
        })
    }
    return entries
}

function variantBlockedEntries(
    engines: readonly EngineReport[],
    scenes: readonly string[],
    ids: readonly VariantId[]
): { item: string; reason: string }[] {
    const specs = selectedVariants(scenes, ids)
    const entries: { item: string; reason: string }[] = []
    for (const engine of engines) {
        if (engine.launchError !== null) continue
        for (const spec of specs) {
            const key = variantKey(spec.scene, spec.id)
            const report = engine.variants.find(
                (candidate) => candidate.scene === key
            )
            if (!report) {
                entries.push({
                    item: `${engine.engine} variant ${key}`,
                    reason: 'missing from the report',
                })
            } else if (!report.pass) {
                const costOnly =
                    engine.engine === 'webkit' &&
                    report.status === 'blocked' &&
                    report.blockedReasons.length > 0 &&
                    report.blockedReasons.every((reason) =>
                        reason.startsWith('G12')
                    )
                if (costOnly) continue
                entries.push({
                    item: `${engine.engine} variant ${key}`,
                    reason:
                        report.blockedReasons.join('; ') ||
                        report.metrics
                            .filter(
                                (metric) =>
                                    metric.deciding &&
                                    !metric.blocked &&
                                    !metric.pass
                            )
                            .map(
                                (metric) =>
                                    `${metric.id} ${Number.isFinite(metric.median) ? metric.median.toFixed(3) : 'n/a'}`
                            )
                            .join('; ') ||
                        report.status,
                })
            }
        }
    }
    return entries
}

function failedCostReport(
    errors: readonly string[],
    expectedRuns: number
): CostReport {
    return {
        scene: 'S-BULK',
        status: 'fail',
        pending: null,
        pass: false,
        valid: false,
        blockedReasons: [],
        metrics: [
            {
                id: 'G9-unscrolled',
                label: 'S-BULK cost shapes (the cost stage did not complete)',
                gate: 'the cost shapes must run and pass; a timed-out cost stage is a failure',
                unit: 'ratio',
                median: Number.NaN,
                pass: false,
                blocked: false,
                deciding: true,
                perRun: [],
                passPerRun: [],
                worst: { detail: errors.join('; ') },
            },
        ],
        runs: [],
        notes: [
            ...errors,
            `0 of ${expectedRuns} measured cost runs produced evidence`,
        ],
        measuredRuns: 0,
    }
}

async function main(): Promise<number> {
    const options = parseOptions(process.argv.slice(2))
    const fingerprint = collectFingerprint()
    const advisory = evaluateFingerprint(fingerprint)
    const bundle = await bundlePage()
    emitPages(bundle)
    const tests = selfTests()
    const engineReports: EngineReport[] = []
    const controls: NegativeControlResult[] = []
    for (const engine of options.engines) {
        const runs: {
            run: number
            warmup: boolean
            measured: MeasuredRun
        }[] = []
        let browserVersion: string | null = null
        let launchError: string | null = null
        try {
            if (options.check) {
                progress(`${engine}: negative controls start`)
                controls.push(
                    ...(await browserControls(engine, bundle, options.scenes))
                )
                progress(`${engine}: negative controls done`)
            }
            progress(`${engine}: measured runs start`)
            for (let index = 0; index <= options.runs; index++) {
                const warmup = index === 0
                progress(
                    `${engine} run ${index}/${options.runs}${warmup ? ' (warm-up)' : ''}: start`
                )
                const measured = await measureRun(
                    engine,
                    bundle,
                    options,
                    index,
                    warmup
                )
                browserVersion = measured.browserVersion
                runs.push({ run: index, warmup, measured })
                const parts = measured.scenes.map(
                    (scene) =>
                        `${scene.report.scene} ${scene.report.pass ? 'ok' : 'FAIL'}`
                )
                if (measured.cost) {
                    parts.push(
                        `cost ${measured.cost.floorAuditPass ? 'audit ok' : 'FAIL'}`
                    )
                } else if (measured.costError !== null) {
                    parts.push('cost FAIL')
                }
                writeOut(
                    `${engine} run ${index}/${options.runs}${warmup ? ' (warm-up)' : ''}: ${parts.join(', ') || 'no scenes'}`
                )
                progress(
                    `${engine} run ${index}/${options.runs}${warmup ? ' (warm-up)' : ''}: done`
                )
            }
        } catch (error) {
            launchError = describeError(error)
            writeStderr(`${engine}: ${launchError}`)
            progress(`${engine}: aborted: ${launchError}`)
        }
        const sceneReports: SceneReport[] = []
        for (const scene of options.scenes) {
            if (scene === 'cost') continue
            const sceneRuns: RunSceneReport[] = []
            const findings: MetricFinding[][] = []
            const shape: MetricFinding[][] = []
            for (const run of runs) {
                const outcome = run.measured.scenes.find(
                    (entry) => entry.report.scene === scene
                )
                if (!outcome) continue
                sceneRuns.push(outcome.report)
                findings.push([...outcome.findings])
                shape.push([...outcome.shape])
            }
            sceneReports.push(aggregateScene(scene, sceneRuns, findings, shape))
        }
        const variantReports: SceneReport[] = []
        const variantSpecs = selectedVariants(
            options.scenes.filter((scene) => scene !== 'cost'),
            options.variants
        )
        for (const spec of variantSpecs) {
            const key = variantKey(spec.scene, spec.id)
            const sceneRuns: RunSceneReport[] = []
            const findings: MetricFinding[][] = []
            const shape: MetricFinding[][] = []
            for (const run of runs) {
                const outcome = run.measured.variants.find(
                    (entry) => entry.report.scene === key
                )
                if (!outcome) continue
                sceneRuns.push(outcome.report)
                findings.push([...outcome.findings])
                shape.push([...outcome.shape])
            }
            variantReports.push(
                aggregateScene(key, sceneRuns, findings, shape, null, [], spec)
            )
        }
        const costRuns = runs
            .map((run) => run.measured.cost)
            .filter((entry): entry is CostRunReport => entry !== null)
        const costFindings = runs
            .map((run) => run.measured.costFindings)
            .filter((entry): entry is MetricFinding[] => entry !== null)
        const measuredCostRuns = costRuns.filter((run) => !run.warmup).length
        const costErrors = runs
            .map((run) => run.measured.costError)
            .filter((entry): entry is string => entry !== null)
        let cost =
            options.scenes.includes('cost') && costRuns.length > 0
                ? aggregateCost(costRuns, costFindings, options.runs)
                : null
        if (options.scenes.includes('cost') && costErrors.length > 0) {
            cost = failedCostReport(costErrors, options.runs)
        }
        if (
            cost !== null &&
            measuredCostRuns < options.runs &&
            launchError === null
        ) {
            cost = {
                ...cost,
                status: 'fail',
                pass: false,
                notes: [
                    ...cost.notes,
                    `only ${measuredCostRuns} of ${options.runs} measured cost runs`,
                ],
            }
        }
        engineReports.push({
            engine,
            advisory: engine === 'firefox' || advisory.cost,
            browserVersion,
            build: fingerprint.browsers[engine] ?? 'unknown',
            launchError,
            scenes: launchError === null ? sceneReports : [],
            variants: launchError === null ? variantReports : [],
            cost: launchError === null ? cost : null,
            notes:
                engine === 'webkit'
                    ? [
                          'Playwright WebKit does not expose crossOriginIsolated even with the COOP/COEP headers present; performance.now ticks at 1 ms, so g = 1 ms and the §11.5 20-frame sampler applies.',
                      ]
                    : engine === 'firefox'
                      ? [
                            'Firefox is advisory: the pinned firefox-1490 build times out on launch on this instrument (D9 exception).',
                        ]
                      : [],
        })
    }
    const deciding = engineReports.filter(
        (engine) => engine.engine !== 'firefox'
    )
    const required = deciding.length > 0 ? deciding : engineReports
    const launchErrors = required.filter(
        (engine) => engine.launchError !== null
    )
    const scenePass = required.every((engine) =>
        engine.scenes.every(
            (scene) =>
                scene.status === 'pass' ||
                (engine.engine === 'webkit' &&
                    scene.status === 'blocked' &&
                    scene.blockedReasons.length > 0 &&
                    scene.blockedReasons.every((reason) =>
                        reason.startsWith('G12')
                    ))
        )
    )
    const costPass = required.every(
        (engine) =>
            engine.engine === 'webkit' ||
            engine.cost === null ||
            engine.cost.status === 'pass'
    )
    const variantPass = required.every((engine) =>
        engine.variants.every(
            (variant) =>
                variant.status === 'pass' ||
                (engine.engine === 'webkit' &&
                    variant.status === 'blocked' &&
                    variant.blockedReasons.length > 0 &&
                    variant.blockedReasons.every((reason) =>
                        reason.startsWith('G12')
                    ))
        )
    )
    const controlsPass =
        options.check &&
        controls.length > 0 &&
        controls.every((control) => control.ok)
    const selfTestPass = tests.pass
    const pending = pendingEntries(options, engineReports)
    const blockedEntries: { item: string; reason: string }[] = []
    for (const engine of engineReports) {
        for (const scene of engine.scenes) {
            if (scene.status !== 'blocked') continue
            const costOnly =
                engine.engine === 'webkit' &&
                scene.blockedReasons.length > 0 &&
                scene.blockedReasons.every((reason) => reason.startsWith('G12'))
            if (costOnly) continue
            blockedEntries.push({
                item: `${engine.engine} scene ${scene.scene}`,
                reason: scene.blockedReasons.join('; ') || 'blocked',
            })
        }
        if (engine.cost?.status === 'blocked' && engine.engine !== 'webkit') {
            blockedEntries.push({
                item: `${engine.engine} S-BULK cost`,
                reason:
                    engine.cost.blockedReasons.join('; ') ||
                    engine.cost.notes.join('; '),
            })
        }
    }
    // The DPR sweep and the reduced-motion variants are scored as support
    // variants in `engine.variants`; a missing or failed variant is a
    // certification reason, not a silent BLOCK placeholder.
    blockedEntries.push(
        ...variantBlockedEntries(
            engineReports,
            options.scenes.filter((scene) => scene !== 'cost'),
            options.variants
        )
    )
    const certificationEngines = engineReports.map((engine) => ({
        engine: engine.engine,
        launchError: engine.launchError,
        scenes: engine.scenes.map((scene) => {
            const failedMetrics = [...scene.metrics, ...scene.shape]
                .filter(
                    (metric) =>
                        metric.id !== 'RUN' &&
                        metric.deciding &&
                        !metric.blocked &&
                        !metric.pass
                )
                .map(
                    (metric) =>
                        `${metric.id} ${Number.isFinite(metric.median) ? metric.median.toFixed(3) : 'n/a'}`
                )
            const runMetric = scene.metrics.find(
                (metric) => metric.id === 'RUN'
            )
            if (runMetric && !runMetric.pass) {
                failedMetrics.push(`RUN ${runMetric.worst?.detail ?? 'failed'}`)
            }
            return {
                scene: scene.scene,
                status: scene.status,
                blockedReasons: scene.blockedReasons,
                failedMetrics,
            }
        }),
        variants: engine.variants.map((variant) => {
            const failedMetrics = [...variant.metrics, ...variant.shape]
                .filter(
                    (metric) =>
                        metric.id !== 'RUN' &&
                        metric.deciding &&
                        !metric.blocked &&
                        !metric.pass
                )
                .map(
                    (metric) =>
                        `${metric.id} ${Number.isFinite(metric.median) ? metric.median.toFixed(3) : 'n/a'}`
                )
            const runMetric = variant.metrics.find(
                (metric) => metric.id === 'RUN'
            )
            if (runMetric && !runMetric.pass) {
                failedMetrics.push(`RUN ${runMetric.worst?.detail ?? 'failed'}`)
            }
            return {
                scene: variant.scene,
                status: variant.status,
                blockedReasons: variant.blockedReasons,
                failedMetrics,
            }
        }),
        cost: engine.cost
            ? {
                  status: engine.cost.status,
                  valid: engine.cost.valid,
                  failedMetrics: engine.cost.metrics
                      .filter(
                          (metric) =>
                              metric.deciding && !metric.blocked && !metric.pass
                      )
                      .map(
                          (metric) =>
                              `${metric.id} ${Number.isFinite(metric.median) ? metric.median.toFixed(3) : 'n/a'}`
                      ),
              }
            : null,
    }))
    const certification = evaluateCertification(
        {
            engines: certificationEngines,
            pending,
            advisory,
            controlsPass,
            selfTestPass,
            blocked: blockedEntries,
        },
        {
            engines: options.engines,
            scenes: options.scenes,
            runs: options.runs,
        }
    )
    const invocation = evaluateInvocation({
        engines: certificationEngines.filter((engine) =>
            required.some((entry) => entry.engine === engine.engine)
        ),
    })
    const pass =
        invocation.pass &&
        required.length > 0 &&
        launchErrors.length === 0 &&
        scenePass &&
        variantPass &&
        costPass
    const sourceRevision = (() => {
        const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
        })
        return revision.status === 0 ? revision.stdout.trim() : undefined
    })()
    const report: BenchReport = {
        schema: 'ani-layout-bench/v1',
        generatedAt: new Date().toISOString(),
        command: `pnpm bench:layout ${process.argv.slice(2).join(' ')}`.trim(),
        ...(sourceRevision ? { sourceRevision } : {}),
        fingerprint,
        advisory,
        engines: engineReports,
        negativeControls: controls,
        selfTests: tests,
        pending,
        blocked: blockedEntries,
        certification,
        pass,
    }
    mkdirSync(dirname(options.out), { recursive: true })
    writeFileSync(options.out, stringifyReport(report))
    writeOut(`\n${formatReport(report)}`)
    writeOut(`\nwrote ${options.out}`)
    if (options.compare) {
        const previous = parseReport(readFileSync(options.compare, 'utf8'))
        writeOut(`\ndelta vs ${options.compare}`)
        for (const line of compareReports(report, previous)) {
            writeOut(`  ${line}`)
        }
    }
    if (advisory.cost) {
        writeOut(
            `\ncost gates are ADVISORY: ${advisory.reasons.join('; ')} (pinned ${PINNED_FINGERPRINT.host} / ${PINNED_FINGERPRINT.productVersion} / ${PINNED_FINGERPRINT.cpu})`
        )
    }
    return pass ? 0 : 1
}

function emitPages(bundle: string): void {
    mkdirSync(PAGES_DIR, { recursive: true })
    for (const scene of SCENES) {
        writeFileSync(join(PAGES_DIR, `${scene}.html`), pageHtml(bundle, scene))
    }
}

main().then(
    (code) => {
        process.exitCode = code
    },
    (error: unknown) => {
        writeStderr(describeError(error))
        if (error instanceof UsageError) process.stderr.write(`\n${USAGE}\n`)
        process.exitCode = 1
    }
)
