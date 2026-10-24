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
assert.equal(await page.locator('[data-showcase]').count(), 15)

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

// Switch, Tabs, Accordion, Shuffle, Dialog, Stack: from their controls
result.Switch = await run('Switch', 'Flip all', 700)
result.Tabs = await run('Tabs', 'Next tab', 900)
assert.equal(
    await card('Tabs').locator('[role="tab"][aria-selected="true"]').count(),
    1,
    'Tabs: one selected tab'
)
result.Accordion = await run('Accordion', 'Open next', 900)
result.Shuffle = await run('Shuffle', 'Shuffle', 900)
result.Dialog = await run('Dialog', 'Next step', 1000)
result.Stack = await run('Stack', 'Expand', 900)
await run('Stack', 'Collapse', 900)

// Smooth tabs: a real pointer sweeping across the bar
{
    await card('Smooth tabs').scrollIntoViewIfNeeded()
    const items = card('Smooth tabs').locator('[data-nav]')
    const first = await items.first().boundingBox()
    const last = await items.last().boundingBox()
    const y = first.y + first.height / 2
    await page.mouse.move(first.x + 5, y)
    await page.waitForTimeout(300)
    await page.mouse.move(last.x + last.width - 5, y, { steps: 12 })
    await page.waitForTimeout(40)
    result['Smooth tabs'] = await owned('Smooth tabs')
    assert.ok(result['Smooth tabs'] > 0, 'Smooth tabs: the pill moved')
    await page.waitForTimeout(800)
    await settled('Smooth tabs', 5000)
    const pill = await card('Smooth tabs')
        .locator('[data-lk="nav-highlight"]')
        .boundingBox()
    assert.ok(
        Math.abs(pill.x - last.x) < 1 && Math.abs(pill.width - last.width) < 1,
        'Smooth tabs: the pill lands on the hovered item'
    )
    await page.mouse.move(0, 0)
    await page.waitForTimeout(800)
}

// Drag: a real mouse drag of the first row past the second
{
    await card('Drag').scrollIntoViewIfNeeded()
    const rows = card('Drag').locator('[data-drag-row]')
    const row = await rows.first().boundingBox()
    const start = { x: row.x + 30, y: row.y + row.height / 2 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x, start.y + 70, { steps: 8 })
    await page.waitForTimeout(40)
    result.Drag = await owned('Drag')
    assert.ok(result.Drag > 0, 'Drag: the other rows make room')
    await page.mouse.up()
    await page.waitForTimeout(900)
    await settled('Drag', 5000)
    assert.equal(
        await rows.nth(1).getAttribute('data-drag-row'),
        '0',
        'Drag: the row was moved down one slot'
    )
}

// To-do: add a task, tick it, remove it
{
    const todo = card('To-do')
    await todo.getByLabel('New task').fill('Ship the showcase')
    await press('To-do', 'Add')
    await page.waitForTimeout(900)
    assert.equal(await todo.locator('[data-todo]').count(), 4, 'To-do: added')
    await todo.getByRole('checkbox', { name: 'Ship the showcase' }).click()
    await page.waitForTimeout(40)
    result['To-do'] = await owned('To-do')
    assert.ok(result['To-do'] > 0, 'To-do: the ticked task moves down')
    await page.waitForTimeout(900)
    await settled('To-do', 5000)
    await todo.getByRole('button', { name: 'Remove Ship the showcase' }).click()
    await page.waitForTimeout(1000)
    assert.equal(await todo.locator('[data-todo]').count(), 3, 'To-do: removed')
    await settled('To-do', 5000)
}

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
