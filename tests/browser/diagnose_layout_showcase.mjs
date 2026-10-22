import { chromium } from 'playwright'

const baseUrl = process.env.SHOWCASE_URL ?? 'http://127.0.0.1:3200'
const browser = await chromium.launch({ headless: true })

async function measure(page, selectors) {
    return page.evaluate((list) => {
        const out = {}
        for (const selector of list) {
            const element = document.querySelector(selector)
            if (!element) {
                out[selector] = null
                continue
            }
            const rect = element.getBoundingClientRect()
            out[selector] = {
                x: rect.x + window.scrollX,
                y: rect.y + window.scrollY,
                width: rect.width,
                height: rect.height,
            }
        }
        return out
    }, selectors)
}

async function pauseAnimations(page) {
    return page.evaluate(() => {
        const animations = document.getAnimations()
        for (const animation of animations) {
            animation.pause()
            animation.currentTime = 0
        }
        return animations.map((animation) => ({
            duration: animation.effect?.getTiming().duration,
        }))
    })
}

async function sampleAt(page, time, selectors) {
    await page.evaluate((value) => {
        for (const animation of document.getAnimations()) {
            animation.currentTime = value
        }
    }, time)
    return measure(page, selectors)
}

async function exercise(name, action, selectors) {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${baseUrl}/en/docs/showcase/layout`, {
        waitUntil: 'load',
        timeout: 60000,
    })
    await page.waitForSelector('[data-layout-showcase]')
    await page.waitForTimeout(400)
    const before = await measure(page, selectors)
    await page.locator(action).click()
    await page.waitForTimeout(24)
    const animations = await pauseAnimations(page)
    const maxDuration = Math.max(
        ...animations.map((animation) => Number(animation.duration) || 0),
        1
    )
    const first = await sampleAt(page, 0, selectors)
    const mid = await sampleAt(page, maxDuration / 2, selectors)
    const last = await sampleAt(page, maxDuration, selectors)
    const final = await measure(page, selectors)
    await page.evaluate(() => {
        for (const animation of document.getAnimations()) animation.finish()
    })
    const result = {
        name,
        action,
        before,
        first,
        mid,
        last,
        final,
        animations,
        maxDuration,
        errors,
    }
    await page.close()
    return result
}

const results = []
results.push(
    await exercise('E1 anchor', '[data-action="toggle-anchor"]', [
        '[data-anchor-parent]',
        '[data-anchor-child]',
    ])
)
results.push(
    await exercise('E2 create', '[data-action="toggle-create"]', [
        '[data-create-button]',
    ])
)
results.push(
    await exercise('E3 folder', '[data-action="toggle-folder"]', [
        '[data-folder]',
        '[data-folder-apps]',
    ])
)
results.push(
    await exercise('E4 store', '[data-action="toggle-store"]', [
        '[data-store-card]',
        '[data-store-detail]',
    ])
)
results.push(
    await exercise('E5 toast', '[data-action="remove-toast"]', ['[data-toast]'])
)
results.push(
    await exercise('Gallery', '[data-action="toggle-gallery"]', [
        '[data-gallery-tile]',
        '[data-gallery]',
    ])
)
console.log(JSON.stringify(results, null, 2))
await browser.close()
