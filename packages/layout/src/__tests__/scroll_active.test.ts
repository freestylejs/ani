// @vitest-environment jsdom

import { ani, timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import type { Box } from '../geometry'
import { createPresence } from '../presence'
import { linkPresence } from '../presence_link'
import { createLayoutGroup } from '../scope'

/**
 * The actively scrolling source rule (§5.8): a handoff, or a reparent, out of
 * a container between its `scroll` and `scrollend` events does not fly.
 */

function place(element: HTMLElement, box: Box): void {
    element.getBoundingClientRect = () =>
        ({
            x: box.x,
            y: box.y,
            left: box.x,
            top: box.y,
            right: box.x + box.w,
            bottom: box.y + box.h,
            width: box.w,
            height: box.h,
            toJSON: () => ({}),
        }) as DOMRect
    Object.defineProperty(element, 'offsetWidth', {
        configurable: true,
        value: Math.round(box.w),
    })
    Object.defineProperty(element, 'offsetHeight', {
        configurable: true,
        value: Math.round(box.h),
    })
}

const motion = {
    type: 'timing' as const,
    duration: 0.2,
    timing: timing.linear(),
}
const ITEM: Box = { x: 10, y: 100, w: 160, h: 44 }
const DETAIL: Box = { x: 360, y: 40, w: 240, h: 140 }

let warnings: string[] = []

/** Whether the browser has `scrollend`: the scope feature-tests `onscrollend` when it arms. */
function scrollEnd(supported: boolean): void {
    if (supported) {
        Object.defineProperty(window, 'onscrollend', {
            configurable: true,
            writable: true,
            value: null,
        })
    } else {
        Reflect.deleteProperty(window, 'onscrollend')
    }
}

beforeEach(() => {
    warnings = []
    vi.spyOn(console, 'warn').mockImplementation((message: string) => {
        warnings.push(message)
    })
    const realGetComputedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((elt: Element) => {
        const raw = realGetComputedStyle(elt)
        const html = elt as HTMLElement
        return new Proxy(raw, {
            get(target, prop, receiver) {
                if (prop === 'translate') return html.style.translate || 'none'
                if (prop === 'scale') return html.style.scale || 'none'
                if (prop === 'rotate') return html.style.rotate || 'none'
                if (prop === 'transform') return html.style.transform || 'none'
                if (prop === 'transformOrigin') return '0px 0px'
                if (prop === 'transitionDuration') return '0s'
                if (prop === 'transitionDelay') return '0s'
                if (prop === 'transitionProperty') return 'none'
                const value = Reflect.get(target, prop, receiver)
                return typeof value === 'function' ? value.bind(target) : value
            },
        })
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'onscrollend')
    document.body.innerHTML = ''
})

/** A scroller with one shared item in it, a scope, and a baseline flush. */
async function setup(options: { scrollEnd: boolean }) {
    scrollEnd(options.scrollEnd)
    const clock = createManualClock()
    const group = createLayoutGroup({ clock: clock.clock, motion })
    const scroller = document.createElement('div')
    document.body.append(scroller)
    const item = document.createElement('div')
    scroller.append(item)
    place(item, ITEM)
    const removeItem = group.add(item, { layoutId: 'card', radius: false })
    group.capture()
    await group.flush()
    return { clock, group, scroller, item, removeItem }
}

/** Unmounts `departing` and mounts a new lead for its id in `parent`. */
function handoff(
    group: ReturnType<typeof createLayoutGroup>,
    departing: HTMLElement,
    remove: () => void,
    parent: HTMLElement,
    style = '',
    id = 'card'
) {
    group.capture()
    remove()
    departing.remove()
    const lead = document.createElement('div')
    lead.style.cssText = style
    parent.append(lead)
    place(lead, DETAIL)
    group.add(lead, { layoutId: id, radius: false })
    const authored = lead.style.cssText
    return { lead, authored, run: group.flush() }
}

const NO_FLIGHT = { status: 'no-change', snapped: [] }

describe('§5.8 listeners', () => {
    it('arms one passive capture-phase scroll and scrollend pair per event root while a shared participant exists', async () => {
        scrollEnd(true)
        const added = vi.spyOn(document, 'addEventListener')
        const removed = vi.spyOn(document, 'removeEventListener')
        const group = createLayoutGroup({ motion })
        const plain = document.createElement('div')
        document.body.append(plain)
        const removePlain = group.add(plain)
        expect(added).not.toHaveBeenCalled()

        const shared = document.createElement('div')
        document.body.append(shared)
        const removeShared = group.add(shared, { layoutId: 'x' })
        const options = { capture: true, passive: true }
        expect(added.mock.calls).toEqual([
            ['scroll', expect.any(Function), options],
            ['scrollend', expect.any(Function), options],
        ])
        // a second shared participant arms nothing more
        const other = document.createElement('div')
        document.body.append(other)
        const removeOther = group.add(other, { layoutId: 'y' })
        expect(added).toHaveBeenCalledTimes(2)

        removeShared()
        await Promise.resolve()
        expect(removed).not.toHaveBeenCalled()
        // dropping the last layoutId disarms at the end of the task (§5.8),
        // adding one back re-arms
        group.set(other, {})
        expect(removed).not.toHaveBeenCalled()
        await Promise.resolve()
        expect(removed.mock.calls).toEqual([
            ['scroll', added.mock.calls[0]![1], options],
            ['scrollend', added.mock.calls[1]![1], options],
        ])
        group.set(other, { layoutId: 'y' })
        expect(added).toHaveBeenCalledTimes(4)
        removeOther()
        removePlain()
        await Promise.resolve()
        expect(removed).toHaveBeenCalledTimes(4)
        group.dispose()
    })

    it('without scrollend, arms only the scroll listener', () => {
        scrollEnd(false)
        const added = vi.spyOn(document, 'addEventListener')
        const group = createLayoutGroup({ motion })
        const shared = document.createElement('div')
        document.body.append(shared)
        group.add(shared, { layoutId: 'x' })
        expect(added.mock.calls.map((call) => call[0])).toEqual(['scroll'])
        group.dispose()
    })

    it('listens on every shadow root holding a participant, and drops it with the last one; dispose disarms everything', async () => {
        scrollEnd(true)
        const host = document.createElement('div')
        document.body.append(host)
        const root = host.attachShadow({ mode: 'closed' })
        const added = vi.spyOn(root, 'addEventListener')
        const removed = vi.spyOn(root, 'removeEventListener')
        const documentRemoved = vi.spyOn(document, 'removeEventListener')
        const group = createLayoutGroup({ motion })
        const a = document.createElement('div')
        const b = document.createElement('div')
        root.append(a, b)
        const removeA = group.add(a, { layoutId: 'a' })
        group.add(b)
        expect(added.mock.calls.map((call) => call[0])).toEqual([
            'scroll',
            'scrollend',
        ])
        removeA()
        // disarmed at the end of the task: no shared participant left
        await Promise.resolve()
        expect(removed).toHaveBeenCalledTimes(2)
        const c = document.createElement('div')
        root.append(c)
        group.add(c, { layoutId: 'c' })
        expect(added).toHaveBeenCalledTimes(4)
        group.dispose()
        expect(removed).toHaveBeenCalledTimes(4)
        expect(documentRemoved).toHaveBeenCalledTimes(4)
    })
})

describe('§5.8 the degraded handoff', () => {
    it('a handoff out of an active container appears at A, warns once, and stays degraded however much time passes', async () => {
        const { clock, group, scroller, item, removeItem } = await setup({
            scrollEnd: true,
        })
        // a synthetic scroll event does not bubble: the capture phase sees it
        scroller.dispatchEvent(new Event('scroll'))
        clock.frames(120)
        const first = handoff(group, item, removeItem, document.body)
        expect(first.lead.style.cssText).toBe(first.authored)
        expect(await first.run).toEqual(NO_FLIGHT)
        expect(warnings).toHaveLength(1)
        expect(warnings[0]).toContain('still scrolling')

        // still active: time never clears it
        clock.frames(600)
        const again = document.createElement('div')
        scroller.append(again)
        place(again, ITEM)
        const removeAgain = group.add(again, {
            layoutId: 'other',
            radius: false,
        })
        group.capture()
        await group.flush()
        const second = handoff(
            group,
            again,
            removeAgain,
            document.body,
            '',
            'other'
        )
        expect(second.lead.style.cssText).toBe(second.authored)
        expect(await second.run).toEqual(NO_FLIGHT)
        // once per scope
        expect(warnings).toHaveLength(1)
        group.dispose()
    })

    it('after scrollend the handoff flies', async () => {
        const { clock, group, scroller, item, removeItem } = await setup({
            scrollEnd: true,
        })
        scroller.dispatchEvent(new Event('scroll'))
        scroller.dispatchEvent(new Event('scrollend'))
        const { lead, run } = handoff(group, item, removeItem, document.body)
        // t = 0 draws the departing node's box
        expect(lead.style.translate).toBe('-350px 60px')
        clock.frames(30)
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        expect(warnings).toEqual([])
        group.dispose()
    })

    it('without scrollend, a container that has scrolled since the listeners were armed degrades every handoff out of it', async () => {
        const { group, scroller, item, removeItem } = await setup({
            scrollEnd: false,
        })
        scroller.dispatchEvent(new Event('scroll'))
        // not listened to where the browser has none
        scroller.dispatchEvent(new Event('scrollend'))
        const { lead, authored, run } = handoff(
            group,
            item,
            removeItem,
            document.body
        )
        expect(lead.style.cssText).toBe(authored)
        expect(await run).toEqual(NO_FLIGHT)
        expect(warnings[0]).toContain('no scrollend')
        group.dispose()
    })

    it('a scroll before the scope has a shared participant is not seen', async () => {
        scrollEnd(false)
        const clock = createManualClock()
        const group = createLayoutGroup({ clock: clock.clock, motion })
        const scroller = document.createElement('div')
        document.body.append(scroller)
        scroller.dispatchEvent(new Event('scroll'))
        const item = document.createElement('div')
        scroller.append(item)
        place(item, ITEM)
        const removeItem = group.add(item, { layoutId: 'card', radius: false })
        group.capture()
        await group.flush()
        const { lead, run } = handoff(group, item, removeItem, document.body)
        expect(lead.style.translate).toBe('-350px 60px')
        group.finish()
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        group.dispose()
    })

    it('inside to inside: a new lead in the same active container flies', async () => {
        const { clock, group, scroller, item, removeItem } = await setup({
            scrollEnd: true,
        })
        scroller.dispatchEvent(new Event('scroll'))
        const { lead, run } = handoff(group, item, removeItem, scroller)
        expect(lead.style.translate).toBe('-350px 60px')
        clock.frames(30)
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        group.dispose()
    })

    it('a handoff from a live exiting node out of an active container neither flies nor crossfades', async () => {
        const { group, scroller, item } = await setup({ scrollEnd: true })
        const release = vi.fn()
        const unlink = linkPresence(item, {
            exiting: true,
            opacity: false,
            hold: release,
        })
        scroller.dispatchEvent(new Event('scroll'))
        group.capture()
        const lead = document.createElement('div')
        document.body.append(lead)
        place(lead, DETAIL)
        group.add(lead, { layoutId: 'card', radius: false })
        const run = group.flush()
        expect(lead.style.cssText).toBe('')
        // the follower exits under presence alone: no opacity, no inert, no hold
        expect(item.style.cssText).toBe('')
        expect(item.hasAttribute('inert')).toBe(false)
        expect(release).not.toHaveBeenCalled()
        expect(await run).toEqual(NO_FLIGHT)
        unlink()
        group.dispose()
    })
})

describe('§5.8 the document scroller and the viewport-fixed lead', () => {
    it('a handoff while the document scrolls degrades only for a viewport-fixed lead', async () => {
        for (const position of ['fixed', 'absolute'] as const) {
            const { clock, group, item, removeItem } = await setup({
                scrollEnd: true,
            })
            document.dispatchEvent(new Event('scroll'))
            const { lead, authored, run } = handoff(
                group,
                item,
                removeItem,
                document.body,
                `position: ${position};`
            )
            if (position === 'fixed') {
                expect(lead.style.cssText).toBe(authored)
                expect(await run).toEqual(NO_FLIGHT)
            } else {
                expect(lead.style.translate).toBe('-350px 60px')
                clock.frames(30)
                expect(await run).toEqual({ status: 'ended', snapped: [] })
            }
            group.dispose()
            document.body.innerHTML = ''
        }
    })

    it('a lead inside a fixed container is viewport-fixed', async () => {
        const { group, item, removeItem } = await setup({ scrollEnd: true })
        const sheet = document.createElement('div')
        sheet.style.position = 'fixed'
        document.body.append(sheet)
        // the offsetParent walk ends at the fixed sheet
        const offsetParent = vi
            .spyOn(HTMLElement.prototype, 'offsetParent', 'get')
            .mockImplementation(function (this: HTMLElement) {
                return this.parentElement === sheet ? sheet : null
            })
        document.dispatchEvent(new Event('scroll'))
        const { lead, authored, run } = handoff(group, item, removeItem, sheet)
        expect(offsetParent).toHaveBeenCalled()
        expect(lead.style.cssText).toBe(authored)
        expect(await run).toEqual(NO_FLIGHT)
        group.dispose()
    })

    it('a fixed lead whose offsetParent walk passes the fixed element on to the body (Gecko) is viewport-fixed', async () => {
        for (const nested of [false, true]) {
            const { group, item, removeItem } = await setup({
                scrollEnd: true,
            })
            const sheet = document.createElement('div')
            sheet.style.position = 'fixed'
            document.body.append(sheet)
            // Gecko gives a fixed element the body as its offset parent
            vi.spyOn(
                HTMLElement.prototype,
                'offsetParent',
                'get'
            ).mockImplementation(function (this: HTMLElement) {
                if (this.style.position === 'fixed') return document.body
                if (this.parentElement === sheet) return sheet
                return null
            })
            document.dispatchEvent(new Event('scroll'))
            const { lead, authored, run } = handoff(
                group,
                item,
                removeItem,
                nested ? sheet : document.body,
                nested ? '' : 'position: fixed;'
            )
            expect(lead.style.cssText).toBe(authored)
            expect(await run).toEqual(NO_FLIGHT)
            group.dispose()
            document.body.innerHTML = ''
        }
    })
})

describe('§5.8 a reparent out of an active container', () => {
    it('a participant moved out of an active container appears at A, a running track ends', async () => {
        const { clock, group, scroller, item } = await setup({
            scrollEnd: true,
        })
        const card = document.createElement('div')
        scroller.append(card)
        place(card, { x: 10, y: 200, w: 100, h: 40 })
        group.add(card)
        group.capture()
        await group.flush()
        // a running track
        group.capture()
        place(card, { x: 60, y: 200, w: 100, h: 40 })
        const run1 = group.flush()
        clock.frames(3)
        expect(card.style.translate).not.toBe('')

        scroller.dispatchEvent(new Event('scroll'))
        group.capture()
        document.body.append(card)
        place(card, { x: 400, y: 20, w: 100, h: 40 })
        const run2 = group.flush()
        expect(card.style.cssText).toBe('')
        expect((await run1).status).toBe('ended')
        expect(await run2).toEqual(NO_FLIGHT)
        expect(warnings).toHaveLength(1)
        // the item never left: it is not degraded
        expect(item.style.cssText).toBe('')
        group.dispose()
    })

    it('a participant moved within the active container still animates', async () => {
        const { clock, group, scroller } = await setup({ scrollEnd: true })
        const inner = document.createElement('div')
        scroller.append(inner)
        const card = document.createElement('div')
        scroller.append(card)
        place(card, { x: 10, y: 200, w: 100, h: 40 })
        group.add(card)
        group.capture()
        await group.flush()
        scroller.dispatchEvent(new Event('scroll'))
        group.capture()
        inner.append(card)
        place(card, { x: 60, y: 200, w: 100, h: 40 })
        const run = group.flush()
        expect(card.style.translate).toBe('-50px 0px')
        clock.frames(30)
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        expect(warnings).toEqual([])
        group.dispose()
    })
})

describe('§5.8 listeners on every shadow root of the flat-ancestor chain', () => {
    it('a scroller inside an open root that holds no participant, around the slot of a shared item: the handoff out of it does not fly', async () => {
        scrollEnd(true)
        const clock = createManualClock()
        const group = createLayoutGroup({ clock: clock.clock, motion })
        const host = document.createElement('div')
        document.body.append(host)
        const root = host.attachShadow({ mode: 'open' })
        const scroller = document.createElement('div')
        scroller.append(document.createElement('slot'))
        root.append(scroller)
        const item = document.createElement('div')
        host.append(item)
        expect(item.assignedSlot).not.toBeNull()
        place(item, ITEM)
        const removeItem = group.add(item, { layoutId: 'card', radius: false })
        group.capture()
        await group.flush()
        // the platform's scroll event is not composed: only the root sees it
        scroller.dispatchEvent(new Event('scroll'))
        const { lead, authored, run } = handoff(
            group,
            item,
            removeItem,
            document.body
        )
        expect(lead.style.cssText).toBe(authored)
        expect(await run).toEqual(NO_FLIGHT)
        expect(warnings).toHaveLength(1)
        group.dispose()
    })

    it('a scroller in an outer root around the root that holds the shared item: the handoff out of it does not fly', async () => {
        for (const mode of ['open', 'closed'] as const) {
            scrollEnd(true)
            warnings = []
            const clock = createManualClock()
            const group = createLayoutGroup({ clock: clock.clock, motion })
            const outer = document.createElement('div')
            document.body.append(outer)
            const outerRoot = outer.attachShadow({ mode })
            const scroller = document.createElement('div')
            outerRoot.append(scroller)
            const inner = document.createElement('div')
            scroller.append(inner)
            const innerRoot = inner.attachShadow({ mode: 'closed' })
            const item = document.createElement('div')
            innerRoot.append(item)
            place(item, ITEM)
            const removeItem = group.add(item, {
                layoutId: 'card',
                radius: false,
            })
            group.capture()
            await group.flush()
            scroller.dispatchEvent(new Event('scroll'))
            const { lead, authored, run } = handoff(
                group,
                item,
                removeItem,
                document.body
            )
            expect(lead.style.cssText, mode).toBe(authored)
            expect(await run, mode).toEqual(NO_FLIGHT)
            group.dispose()
            document.body.innerHTML = ''
        }
    })

    it('arms a root on the chain at the pass that walks it, and disarms it at the end of the task in which no chain reaches it', async () => {
        scrollEnd(true)
        const clock = createManualClock()
        const group = createLayoutGroup({ clock: clock.clock, motion })
        const host = document.createElement('div')
        document.body.append(host)
        const root = host.attachShadow({ mode: 'open' })
        const added = vi.spyOn(root, 'addEventListener')
        const removed = vi.spyOn(root, 'removeEventListener')
        const scroller = document.createElement('div')
        scroller.append(document.createElement('slot'))
        root.append(scroller)
        const item = document.createElement('div')
        host.append(item)
        place(item, ITEM)
        group.add(item, { layoutId: 'card', radius: false })
        expect(added).not.toHaveBeenCalled()
        group.capture()
        expect(added.mock.calls.map((call) => call[0])).toEqual([
            'scroll',
            'scrollend',
        ])
        await group.flush()
        expect(added).toHaveBeenCalledTimes(2)
        expect(removed).not.toHaveBeenCalled()
        // the item leaves the slot: the next pass does not reach the root
        document.body.append(item)
        group.capture()
        await group.flush()
        expect(removed.mock.calls.map((call) => call[0])).toEqual([
            'scroll',
            'scrollend',
        ])
        // back under the slot: armed again
        host.append(item)
        group.capture()
        expect(added).toHaveBeenCalledTimes(4)
        group.dispose()
        expect(removed).toHaveBeenCalledTimes(4)
    })
})

describe('§5.8 the viewport-fixed test covers reparents', () => {
    /** A shared participant arms the listeners; `card` is a plain participant in the document. */
    async function cardSetup() {
        scrollEnd(true)
        const clock = createManualClock()
        const group = createLayoutGroup({ clock: clock.clock, motion })
        const shared = document.createElement('div')
        document.body.append(shared)
        place(shared, { x: 0, y: 500, w: 10, h: 10 })
        group.add(shared, { layoutId: 'arm', radius: false })
        const card = document.createElement('div')
        document.body.append(card)
        place(card, { x: 10, y: 200, w: 100, h: 40 })
        group.add(card)
        group.capture()
        await group.flush()
        const sheet = document.createElement('div')
        sheet.style.position = 'fixed'
        document.body.append(sheet)
        // the offsetParent walk ends at the fixed sheet
        vi.spyOn(
            HTMLElement.prototype,
            'offsetParent',
            'get'
        ).mockImplementation(function (this: HTMLElement) {
            return this.parentElement === sheet ? sheet : null
        })
        return { clock, group, card, sheet }
    }

    it('a card reparented into a fixed sheet while the document scrolls appears at A; each offsetParent read is counted', async () => {
        const { group, card, sheet } = await cardSetup()
        document.dispatchEvent(new Event('scroll'))
        group.capture()
        sheet.append(card)
        place(card, { x: 400, y: 20, w: 100, h: 40 })
        const before = group.stats
        const run = group.flush()
        expect(card.style.cssText).toBe('')
        expect(await run).toEqual(NO_FLIGHT)
        expect(warnings).toHaveLength(1)
        // card → sheet → null: two reads, and the computed style of the sheet
        expect(group.stats.parents - before.parents).toBe(2)
        group.dispose()
    })

    it('a card reparented into a plain parent while the document scrolls still flies', async () => {
        const { clock, group, card } = await cardSetup()
        const plain = document.createElement('div')
        document.body.append(plain)
        document.dispatchEvent(new Event('scroll'))
        group.capture()
        plain.append(card)
        place(card, { x: 400, y: 20, w: 100, h: 40 })
        const before = group.stats
        const run = group.flush()
        expect(card.style.translate).toBe('-390px 180px')
        expect(group.stats.parents - before.parents).toBe(1)
        clock.frames(30)
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        group.dispose()
    })

    it('a card whose flat parent did not change runs no offsetParent walk', async () => {
        const { clock, group, card } = await cardSetup()
        document.dispatchEvent(new Event('scroll'))
        group.capture()
        place(card, { x: 60, y: 200, w: 100, h: 40 })
        const before = group.stats
        const run = group.flush()
        expect(card.style.translate).toBe('-50px 0px')
        expect(group.stats.parents).toBe(before.parents)
        clock.frames(30)
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        group.dispose()
    })
})

describe('§5.8 a degraded lead with a presence', () => {
    it('enters under its presence, with no flight', async () => {
        const { clock, group, scroller, item, removeItem } = await setup({
            scrollEnd: true,
        })
        scroller.dispatchEvent(new Event('scroll'))
        group.capture()
        removeItem()
        item.remove()
        const lead = document.createElement('div')
        document.body.append(lead)
        place(lead, DETAIL)
        group.add(lead, { layoutId: 'card', radius: false })
        const presence = createPresence(
            lead,
            {
                initial: { translateY: 24 },
                present: { translateY: 0 },
                enter: ani({
                    to: { translateY: 0 },
                    duration: 0.1,
                    timing: timing.linear(),
                }),
                exit: ani({
                    to: { translateY: 24 },
                    duration: 0.1,
                    timing: timing.linear(),
                }),
            },
            { clock: clock.clock }
        )
        const entered = presence.enter()
        const run = group.flush()
        expect(await run).toEqual(NO_FLIGHT)
        expect(warnings).toHaveLength(1)
        const seen: string[] = []
        for (let f = 0; f < 12; f++) {
            clock.frames(1)
            // the presence draws the enter; layout writes no pose
            seen.push(lead.style.transform)
            expect(lead.style.translate).toBe('')
            expect(lead.style.scale).toBe('')
        }
        expect(await entered).toBe('ended')
        expect(new Set(seen).size).toBeGreaterThan(2)
        presence.dispose()
        group.dispose()
    })
})

describe('§5.8 disarm at the end of the task', () => {
    it('a lead removed and re-added in one task keeps the listeners and the active state', async () => {
        const { group, scroller, item, removeItem } = await setup({
            scrollEnd: true,
        })
        const removed = vi.spyOn(document, 'removeEventListener')
        scroller.dispatchEvent(new Event('scroll'))
        // one task: the lead unmounts and a new one mounts in its place
        removeItem()
        item.remove()
        const again = document.createElement('div')
        scroller.append(again)
        place(again, ITEM)
        const removeAgain = group.add(again, {
            layoutId: 'card',
            radius: false,
        })
        await Promise.resolve()
        await Promise.resolve()
        expect(removed).not.toHaveBeenCalled()
        group.capture()
        await group.flush()
        // the scroller is still active: a handoff out of it does not fly
        const { lead, authored, run } = handoff(
            group,
            again,
            removeAgain,
            document.body
        )
        expect(lead.style.cssText).toBe(authored)
        expect(await run).toEqual(NO_FLIGHT)
        group.dispose()
    })

    it('a real disarm clears the active state', async () => {
        const { clock, group, scroller, item, removeItem } = await setup({
            scrollEnd: true,
        })
        const removed = vi.spyOn(document, 'removeEventListener')
        scroller.dispatchEvent(new Event('scroll'))
        removeItem()
        await Promise.resolve()
        expect(removed).toHaveBeenCalledTimes(2)
        // a later task: a shared participant in the same scroller again
        const again = document.createElement('div')
        scroller.append(again)
        place(again, ITEM)
        const removeAgain = group.add(again, {
            layoutId: 'card',
            radius: false,
        })
        group.capture()
        await group.flush()
        item.remove()
        const { lead, run } = handoff(group, again, removeAgain, document.body)
        // nothing scrolled since the listeners were armed again: it flies
        expect(lead.style.translate).toBe('-350px 60px')
        clock.frames(30)
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        group.dispose()
    })
})
