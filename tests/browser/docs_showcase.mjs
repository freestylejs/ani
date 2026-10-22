import assert from 'node:assert/strict'
import { chromium, firefox, webkit } from 'playwright'

const browserName = process.env.BROWSER ?? 'chromium'
const browserType = { chromium, firefox, webkit }[browserName]
if (!browserType) throw new Error(`Unknown BROWSER=${browserName}`)
const baseUrl = process.env.SHOWCASE_URL ?? 'http://127.0.0.1:3100'
const browser = await browserType.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
    if (message.type() === 'error') {
        errors.push(`console: ${message.text()} ${message.location().url}`)
    }
})
await page.goto(`${baseUrl}/en/docs/showcase/layout`, {
    waitUntil: 'load',
    timeout: 60000,
})
await page.waitForSelector('[data-layout-showcase]')
await page.waitForTimeout(500)
assert.equal(await page.title(), 'Layout Showcase')
assert.equal(await page.locator('[data-showcase]').count(), 6)

const parent = page.locator('[data-anchor-parent]')
const beforeAnchor = await parent.boundingBox()
await page.locator('[data-action="toggle-anchor"]').click()
const anchorAnimations = await page.evaluate(
    () => document.getAnimations().length
)
assert.ok(anchorAnimations > 0, 'E1 created managed animations')
await page.waitForTimeout(650)
const afterAnchor = await parent.boundingBox()
assert.ok(
    afterAnchor.width > beforeAnchor.width + 50,
    `anchor width ${beforeAnchor.width} -> ${afterAnchor.width}`
)
assert.ok(await page.locator('[data-anchor-child]').isVisible())

const create = page.locator('[data-create-button]')
const beforeCreate = await create.boundingBox()
await page.locator('[data-action="toggle-create"]').click()
const createAnimations = await page.evaluate(
    () => document.getAnimations().length
)
assert.ok(createAnimations > 0, 'E2 created a layout animation')
await page.waitForTimeout(550)
const afterCreate = await create.boundingBox()
assert.ok(
    afterCreate.width > beforeCreate.width + 40,
    `create width ${beforeCreate.width} -> ${afterCreate.width}`
)

await page.locator('[data-action="toggle-folder"]').click()
const folderAnimations = await page.evaluate(
    () => document.getAnimations().length
)
assert.ok(folderAnimations > 0, 'E3 created a layout animation')
await page.waitForTimeout(550)
assert.ok(await page.locator('[data-folder-apps]').isVisible())
assert.equal(await page.locator('[data-folder-apps] > div').count(), 6)

await page.locator('[data-action="toggle-store"]').click()
const storeAnimations = await page.evaluate(
    () => document.getAnimations().length
)
assert.ok(storeAnimations > 0, 'E4 created a layout animation')
await page.waitForTimeout(550)
assert.ok(await page.locator('[data-store-detail]').isVisible())

const initialToasts = await page.locator('[data-toast]').count()
await page.locator('[data-action="add-toast"]').click()
await page.waitForTimeout(120)
assert.equal(await page.locator('[data-toast]').count(), initialToasts + 1)
await page.locator('[data-action="remove-toast"]').click()
await page.waitForTimeout(450)
assert.equal(await page.locator('[data-toast]').count(), initialToasts)

const tiles = page.locator('[data-gallery-tile]')
const gridA = await tiles.nth(0).boundingBox()
const gridB = await tiles.nth(1).boundingBox()
assert.ok(Math.abs(gridA.y - gridB.y) < 3, 'grid tiles share a row')
await page.locator('[data-action="toggle-gallery"]').click()
const galleryAnimations = await page.evaluate(
    () => document.getAnimations().length
)
assert.ok(galleryAnimations > 0, 'Gallery created layout animations')
await page.waitForTimeout(550)
const listA = await tiles.nth(0).boundingBox()
const listB = await tiles.nth(1).boundingBox()
assert.ok(listB.y > listA.y + 60, 'list tiles are stacked')

const showcaseErrors = errors.filter((error) => !error.endsWith('/en/blog'))
assert.deepEqual(showcaseErrors, [])
if (browserName === 'chromium') {
    await page.screenshot({
        path: '.trace/ani_layout_cpc_v1/layout_documentation_showcase.png',
        fullPage: true,
    })
}
console.log(
    JSON.stringify(
        {
            browser: browserName,
            title: await page.title(),
            sections: await page.locator('[data-showcase]').count(),
            anchor: [beforeAnchor.width, afterAnchor.width],
            create: [beforeCreate.width, afterCreate.width],
            toasts: initialToasts,
            animations: {
                anchor: anchorAnimations,
                create: createAnimations,
                folder: folderAnimations,
                store: storeAnimations,
                gallery: galleryAnimations,
            },
            gridY: [gridA.y, gridB.y],
            listY: [listA.y, listB.y],
            errors,
        },
        null,
        2
    )
)
await browser.close()
