// Focused frame export for the real iOS regression cases. Uses the existing
// bundler/cases; this is not another animation implementation or benchmark.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { arch, loadavg, platform } from 'node:os'
import { resolve } from 'node:path'
import { chromium, webkit } from 'playwright'
import { collectSourceIdentity } from '../../bench/layout/fingerprint.ts'
import { bundleForBrowser } from './bundle.ts'

const engine = process.argv[2] ?? 'chromium'
if (engine !== 'chromium' && engine !== 'webkit')
    throw new Error('Expected chromium or webkit')
const directory = resolve(
    process.argv[3] ?? '.trace/ani_ios_quality_repair/frames',
    engine
)
await mkdir(directory, { recursive: true })
const source = collectSourceIdentity(process.cwd())
const code = await bundleForBrowser(
    resolve('tests/browser/cases/ios_quality.ts'),
    { mode: 'production' }
)
const browser = await (engine === 'chromium' ? chromium : webkit).launch({
    headless: true,
})
const summaries: unknown[] = []
try {
    for (const name of ['Folder', 'Store', 'Exposure']) {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
            deviceScaleFactor: 1,
        })
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        const frames: Array<{ time: number; file: string; png: string }> = []
        const region: {
            current: {
                x: number
                y: number
                width: number
                height: number
            } | null
        } = { current: null }
        await page.route('http://ani-quality.test/**', async (route) => {
            if (route.request().url().endsWith('/case.js'))
                await route.fulfill({
                    contentType: 'text/javascript',
                    body: code,
                })
            else
                await route.fulfill({
                    contentType: 'text/html',
                    body: `<!doctype html><html><head><style>body{margin:0;background:${name === 'Exposure' ? '#09120f' : '#f8fafb'}}</style></head><body><script type="module">import * as cases from '/case.js';window.__cases=cases;window.__ready=true</script></body></html>`,
                })
        })
        await page.exposeFunction(
            '__iosQualityCapture',
            async (time: number) => {
                if (name === 'Folder' && time === -1) {
                    // The before picture must contain the real artwork, not a
                    // network-loading placeholder. No Ani clock time is advanced.
                    await page.evaluate(async () => {
                        await Promise.all(
                            [...document.querySelectorAll('img')].map((image) =>
                                image.decode()
                            )
                        )
                        await Promise.all(
                            [
                                ...document.querySelectorAll<SVGImageElement>(
                                    'svg image'
                                ),
                            ].map(async (image) => {
                                const decoded = new Image()
                                decoded.src = image.href.baseVal
                                await decoded.decode()
                            })
                        )
                        await new Promise<void>((done) =>
                            requestAnimationFrame(() => done())
                        )
                    })
                }
                if (name === 'Store' && time === -1) {
                    region.current = await page.evaluate(() => {
                        const card = document.querySelector(
                            '[data-store-card="a"]'
                        )!
                        const image = card.querySelector('img')!
                        if (!image.complete || image.naturalWidth === 0)
                            throw new Error(
                                'Reference artwork did not decode; pixels are unavailable'
                            )
                        const r = card.getBoundingClientRect()
                        return {
                            x: Math.ceil(r.x + 32),
                            y: Math.ceil(r.y + 120),
                            width: Math.floor(r.width - 64),
                            height: Math.floor(r.height - 160),
                        }
                    })
                }
                const buffer = await page.screenshot({
                    animations: 'allow',
                    caret: 'hide',
                })
                const file = `${name.toLowerCase()}-${String(frames.length).padStart(2, '0')}-${Math.round(time)}ms.png`
                await writeFile(resolve(directory, file), buffer)
                frames.push({ time, file, png: buffer.toString('base64') })
            }
        )
        await page.goto('http://ani-quality.test/')
        await page.waitForFunction(() => window.__ready === true)
        const result = await page.evaluate(async (caseName) => {
            const run = window.__cases[caseName] as () => Promise<string>
            const detail = await run()
            return { detail, frames: window.__iosQualityFrames }
        }, name)
        assert.deepEqual(errors, [])
        await writeFile(
            resolve(directory, `${name.toLowerCase()}-frames.json`),
            JSON.stringify(result, null, 2)
        )
        let pixels: unknown = null
        const roi = region.current
        if (name === 'Store' && roi) {
            pixels = await page.evaluate(
                async ({ before, after, roi }) => {
                    const image = async (data: string) => {
                        const bitmap = new Image()
                        bitmap.src = `data:image/png;base64,${data}`
                        await bitmap.decode()
                        return bitmap
                    }
                    const canvas = document.createElement('canvas')
                    canvas.width = roi.width
                    canvas.height = roi.height
                    const context = canvas.getContext('2d', {
                        willReadFrequently: true,
                    })!
                    const read = async (data: string) => {
                        context.clearRect(0, 0, roi.width, roi.height)
                        context.drawImage(await image(data), -roi.x, -roi.y)
                        return context.getImageData(0, 0, roi.width, roi.height)
                            .data
                    }
                    const a = await read(before),
                        b = await read(after)
                    let total = 0,
                        changed = 0,
                        maximum = 0
                    for (let i = 0; i < a.length; i += 4) {
                        let local = 0
                        for (let c = 0; c < 3; c++) {
                            const error = Math.abs(a[i + c]! - b[i + c]!)
                            total += error
                            local = Math.max(local, error)
                        }
                        maximum = Math.max(maximum, local)
                        if (local > 12) changed++
                    }
                    const count = roi.width * roi.height
                    return {
                        roi,
                        meanAbsoluteRgbError: total / (count * 3),
                        changedAbove12Percent: (changed / count) * 100,
                        maximumChannelError: maximum,
                    }
                },
                { before: frames[0]!.png, after: frames[1]!.png, roi }
            )
            const metric = pixels as {
                meanAbsoluteRgbError: number
                changedAbove12Percent: number
            }
            assert.ok(
                metric.meanAbsoluteRgbError <= 1,
                `Store first-frame photo RGB error: ${JSON.stringify(pixels)}`
            )
            assert.ok(
                metric.changedAbove12Percent <= 1,
                `Store first-frame photo changed pixels: ${JSON.stringify(pixels)}`
            )
        }
        // Actual captured frames, cropped for a readable chronological contact sheet.
        await page.evaluate(
            async ({ frames, name }) => {
                const canvas = document.createElement('canvas')
                canvas.width = 1280
                canvas.height = Math.ceil(frames.length / 4) * 300
                const context = canvas.getContext('2d')!
                context.fillStyle = '#e9edf0'
                context.fillRect(0, 0, canvas.width, canvas.height)
                for (let i = 0; i < frames.length; i++) {
                    const image = new Image()
                    image.src = `data:image/png;base64,${frames[i]!.png}`
                    await image.decode()
                    const x = (i % 4) * 320,
                        y = Math.floor(i / 4) * 300
                    if (name === 'Folder')
                        context.drawImage(
                            image,
                            440,
                            190,
                            560,
                            470,
                            x,
                            y,
                            320,
                            268
                        )
                    else if (name === 'Exposure')
                        context.drawImage(
                            image,
                            420,
                            130,
                            600,
                            580,
                            x,
                            y,
                            320,
                            268
                        )
                    else
                        context.drawImage(
                            image,
                            140,
                            0,
                            1160,
                            900,
                            x,
                            y,
                            320,
                            268
                        )
                    context.fillStyle = '#14202d'
                    context.font = '15px sans-serif'
                    context.fillText(
                        `${i}: ${frames[i]!.time < 0 ? 'before' : `${frames[i]!.time.toFixed(1)} ms`}`,
                        x + 10,
                        y + 290
                    )
                }
                document.body.replaceChildren(canvas)
            },
            { frames, name }
        )
        await page.locator('canvas').screenshot({
            path: resolve(directory, `${name.toLowerCase()}-contact.png`),
        })
        summaries.push({
            name,
            detail: result.detail,
            capturedFrames: frames.map(({ time, file }) => ({ time, file })),
            pixels,
        })
        await page.close()
    }
    assert.equal(
        collectSourceIdentity(process.cwd()),
        source,
        'Source changed during frame capture'
    )
    const report = {
        source,
        browser: `${engine} ${browser.version()}`,
        mode: 'production',
        os: `${platform()} ${arch()}`,
        viewport: { width: 1440, height: 900, dpr: 1 },
        manualFrameMs: 1000 / 60,
        load1: loadavg()[0],
        evidence:
            'DOM/manual-clock frames and screenshot pixels; not physical iOS presentation',
        cases: summaries,
    }
    await writeFile(
        resolve(directory, 'report.json'),
        JSON.stringify(report, null, 2)
    )
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
    await browser.close()
}
