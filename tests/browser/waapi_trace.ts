// Gate (3) of the WAAPI engine (ARCHITECTURE.md §10): a Chromium trace shows
// compositor frames ticking the animation while the main thread is blocked.
// Run: `pnpm test:waapi-trace`.
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { bundleForBrowser } from './bundle.ts'

interface TraceEvent {
    readonly name: string
    readonly cat?: string
    readonly ph?: string
    readonly ts: number
    readonly dur?: number
    readonly tid: number
    readonly args?: { readonly data?: { readonly compositeFailed?: number } }
}

const code = await bundleForBrowser(
    fileURLToPath(new URL('./waapi_trace_page.ts', import.meta.url))
)
const browser = await chromium.launch({ headless: true })
try {
    const page = await browser.newPage({
        viewport: { width: 800, height: 400 },
    })
    await page.setContent('<!doctype html><body></body>')
    await page.addScriptTag({
        type: 'module',
        content: `${code}\nwindow.__run = run`,
    })
    await page.waitForFunction(() => 'run' in window || '__run' in window)
    const client = await page.context().newCDPSession(page)
    /** Traces one run; counts compositor work while the main thread is blocked. */
    const trace = async (engine: 'waapi' | 'raf') => {
        const events: TraceEvent[] = []
        const collect = (e: { value: object[] }) =>
            events.push(...(e.value as TraceEvent[]))
        client.on('Tracing.dataCollected', collect)
        const complete = new Promise((resolve) =>
            client.once('Tracing.tracingComplete', resolve)
        )
        await client.send('Tracing.start', {
            traceConfig: {
                includedCategories: [
                    'devtools.timeline',
                    'disabled-by-default-devtools.timeline.frame',
                    'blink.animations',
                    'cc',
                    'viz',
                    'toplevel',
                ],
            },
            transferMode: 'ReportEvents',
        })
        const result = await page.evaluate(
            (name) =>
                (
                    window as unknown as {
                        __run: (
                            engine: string
                        ) => Promise<{ state: string; blockMs: number }>
                    }
                ).__run(name),
            engine
        )
        await page.waitForTimeout(200)
        await client.send('Tracing.end')
        await complete
        client.off('Tracing.dataCollected', collect)
        // the block: the shortest complete event spanning it
        const block = events
            .filter(
                (e) =>
                    e.ph === 'X' &&
                    (e.dur ?? 0) > 110_000 &&
                    (e.dur ?? 0) < 400_000
            )
            .sort((a, b) => (a.dur ?? 0) - (b.dur ?? 0))[0]
        if (!block) throw new Error(`${engine}: no 120 ms task in the trace`)
        const inside = (e: TraceEvent) =>
            e.tid !== block.tid &&
            e.ts > block.ts + 5_000 &&
            e.ts < block.ts + (block.dur ?? 0) - 5_000
        const count = (name: string) =>
            events.filter((e) => e.name === name && inside(e)).length
        return {
            state: result.state,
            blockMs: (block.dur ?? 0) / 1000,
            ticks: count('AnimationHost::TickAnimations'),
            draws: count('DrawFrame'),
            swaps: count('Display::DrawAndSwap'),
            compositeFailed: events
                .map((e) => e.args?.data?.compositeFailed)
                .filter((v): v is number => v !== undefined && v !== 0),
        }
    }
    const waapi = await trace('waapi')
    // control: the main-thread engine draws nothing while it is blocked
    const raf = await trace('raf')
    const line = JSON.stringify({ waapi, raf })
    // ≥ 4 frames in the ~110 ms window: the compositor kept animating
    if (
        waapi.state !== 'running' ||
        waapi.compositeFailed.length > 0 ||
        waapi.ticks < 4 ||
        waapi.draws < 4 ||
        waapi.swaps < 4 ||
        raf.state !== 'running' ||
        raf.draws > 1
    ) {
        throw new Error(`WAAPI trace gate failed: ${line}`)
    }
    console.log(`WAAPI trace gate passed: ${line}`)
} finally {
    await browser.close()
}
