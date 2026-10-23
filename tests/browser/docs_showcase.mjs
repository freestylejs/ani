// Smoke test of the built docs page /docs/showcase/layout (SHOWCASE_URL, a
// running `next start`): every demo animates from its controls and settles
// with no owned style left. Frame-level behaviour is the `acceptance` module.
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

const card = (id) => page.locator(`[data-showcase="${id}"]`)
const press = (id, name) =>
    card(id)
        .locator('[data-controls]')
        .getByRole('button', { name, exact: true })
        .click()
/** Elements of a demo the engine draws now (owned translate/scale, !important). */
const owned = (id) =>
    card(id).evaluate(
        (root) =>
            [...root.querySelectorAll('*')].filter(
                (e) =>
                    e.style.getPropertyPriority('translate') === 'important' ||
                    e.style.getPropertyPriority('scale') === 'important'
            ).length
    )
const box = (id, selector) => card(id).locator(selector).first().boundingBox()
const result = {}

/** Polls until the demo has no owned style left (the real clock may run slow). */
async function settled(id, within) {
    const end = Date.now() + within
    while ((await owned(id)) > 0) {
        assert.ok(
            Date.now() < end,
            `${id}: owned style left after ${within} ms`
        )
        await page.waitForTimeout(50)
    }
}

/** Clicks, sees the engine draw within two frames, waits until it lets go. */
async function run(id, name, settle) {
    await press(id, name)
    await page.waitForTimeout(40)
    const drawn = await owned(id)
    assert.ok(drawn > 0, `${id} "${name}": nothing animated`)
    await page.waitForTimeout(settle)
    await settled(id, 5000)
    return drawn
}

// E1: the parent grows; the anchored child grows after its delay
const parentBefore = await box('E1', '[data-anchor-parent]')
const childBefore = await box('E1', '[data-anchor-child]')
result.E1 = await run('E1', 'Expand', 1600)
const parentAfter = await box('E1', '[data-anchor-parent]')
const childAfter = await box('E1', '[data-anchor-child]')
assert.ok(parentAfter.width > parentBefore.width + 50, 'E1 parent grew')
assert.ok(childAfter.width > childBefore.width + 10, 'E1 child grew')

// E2: the button opens into the menu and closes again
const createBefore = await box('E2', '[data-fixture="create"] [data-layout-id]')
result.E2 = await run('E2', 'Open menu', 1200)
const createAfter = await box('E2', '[data-fixture="create"] [data-layout-id]')
assert.ok(createAfter.width > createBefore.width + 40, 'E2 surface grew')
await run('E2', 'Close menu', 1200)

// E3: the folder opens; every item lies inside it
result.E3 = await run('E3', 'Open folder', 1600)
const items = card('E3').locator('[data-folder-item]')
assert.ok((await items.count()) > 0, 'E3 items shown')
const folder = await box('E3', '[data-folder]')
const last = await items.last().boundingBox()
assert.ok(
    last.y + last.height <= folder.y + folder.height + 1,
    'E3 items fit inside the folder'
)

// E4: a card opens into its detail and back
result.E4 = await run('E4', 'Harbor', 1500)
assert.ok(await card('E4').locator('[data-card-detail]').isVisible())
await run('E4', 'Close', 1800)
assert.equal(await card('E4').locator('[data-card-detail]').count(), 0)

// E5: three toasts, then the middle one leaves
for (let i = 0; i < 3; i++) {
    await press('E5', 'Add')
    await page.waitForTimeout(120)
}
await page.waitForTimeout(900)
assert.equal(await card('E5').locator('[data-toast]').count(), 3)
await press('E5', 'Remove middle')
await page.waitForTimeout(1200)
assert.equal(await card('E5').locator('[data-toast]').count(), 2)
await settled('E5', 5000)

// Gallery: grid → list
const tiles = card('Gallery').locator('[data-tile]')
const gridA = await tiles.nth(0).boundingBox()
const gridB = await tiles.nth(1).boundingBox()
assert.ok(Math.abs(gridA.y - gridB.y) < 3, 'grid tiles share a row')
result.Gallery = await run('Gallery', 'Show as list', 1200)
const listA = await tiles.nth(0).boundingBox()
const listB = await tiles.nth(1).boundingBox()
assert.ok(listB.y > listA.y + 20, 'list tiles are stacked')

assert.deepEqual(errors, [])
if (browserName === 'chromium') {
    await page.screenshot({
        path: '.trace/ani_layout_final/layout_showcase.png',
        fullPage: true,
    })
}
console.log(
    JSON.stringify(
        { browser: browserName, drawnOnFirstFrames: result, errors },
        null,
        2
    )
)
await browser.close()
