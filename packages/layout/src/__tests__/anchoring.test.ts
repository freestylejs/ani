// @vitest-environment jsdom

import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import type { Box } from '../geometry'
import { createLayoutGroup } from '../scope'

/**
 * Scroll anchoring under layout's writes (§11.4 S2, §6): the one-time probe
 * and the fallback that keeps a driven node from being the scroll anchor.
 * Each test binds to a document of its own: the probe runs once per document.
 */

const motion = {
    type: 'timing' as const,
    duration: 0.2,
    timing: timing.linear(),
}

/** Every DOM read and write the tests watch, in order. */
let log: string[] = []

function freshDocument(): Document {
    const doc = document.implementation.createHTMLDocument('anchoring')
    // the layout viewport, so nothing is culled
    Object.defineProperty(doc.documentElement, 'clientWidth', { value: 1000 })
    Object.defineProperty(doc.documentElement, 'clientHeight', { value: 800 })
    return doc
}

function place(element: HTMLElement, box: Box): void {
    element.getBoundingClientRect = () => {
        log.push('rect')
        return {
            x: box.x,
            y: box.y,
            left: box.x,
            top: box.y,
            right: box.x + box.w,
            bottom: box.y + box.h,
            width: box.w,
            height: box.h,
            toJSON: () => ({}),
        } as DOMRect
    }
    Object.defineProperty(element, 'offsetWidth', {
        configurable: true,
        value: Math.round(box.w),
    })
    Object.defineProperty(element, 'offsetHeight', {
        configurable: true,
        value: Math.round(box.h),
    })
}

/**
 * The engine's scroll anchoring, as the probe sees it: Firefox follows the
 * anchor's transform (the translate moves the child down 5 px, the scroll
 * offset follows), Chromium and WebKit do not.
 */
function anchoring(engine: 'firefox' | 'chromium'): void {
    vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(
        function (this: Element) {
            log.push('scrollTop')
            const child = this.firstElementChild as HTMLElement | null
            return engine === 'firefox' && child?.style.translate ? 15 : 10
        }
    )
}

beforeEach(() => {
    log = []
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
                if (prop === 'overflowX' || prop === 'overflowY') {
                    return html.style.overflow || 'visible'
                }
                const value = Reflect.get(target, prop, receiver)
                return typeof value === 'function' ? value.bind(target) : value
            },
        })
    })
})

afterEach(() => {
    vi.restoreAllMocks()
})

/** A scope on a fresh document with one participant at `from`, a baseline flush done. */
async function setup(
    engine: 'firefox' | 'chromium',
    style = '',
    options: { engine?: 'raf' | 'waapi' } = {}
) {
    anchoring(engine)
    const doc = freshDocument()
    const clock = createManualClock()
    const group = createLayoutGroup({ clock: clock.clock, motion, ...options })
    const element = doc.createElement('div')
    element.style.cssText = style
    doc.body.append(element)
    place(element, { x: 0, y: 0, w: 100, h: 40 })
    group.add(element, options.engine === 'waapi' ? { layout: 'position' } : {})
    return { doc, clock, group, element }
}

describe('§11.4 S2 the anchoring probe', () => {
    it('runs once per document, at the start of the first flush that may write a pose, before its first rect read', async () => {
        const { doc, clock, group, element } = await setup('firefox')
        const children = doc.documentElement.children.length

        // a capture-less flush with nothing running writes no pose
        await group.flush()
        expect(log).toEqual(['rect'])
        expect(group.stats.offsets).toBe(1)

        // a fresh capture may start a track: the probe runs first
        group.capture()
        log = []
        await group.flush()
        expect(log).toEqual(['scrollTop', 'rect'])
        // one read: the probe's scroll offset, with the participant's size
        expect(group.stats.offsets).toBe(3 + 1)
        // removed in the same task
        expect(doc.documentElement.children.length).toBe(children)

        // never again in this document, in this scope or another
        group.capture()
        log = []
        place(element, { x: 50, y: 0, w: 100, h: 40 })
        const run = group.flush()
        expect(log).toEqual(['rect'])
        const other = createLayoutGroup({ clock: clock.clock, motion })
        const second = doc.createElement('div')
        doc.body.append(second)
        place(second, { x: 0, y: 100, w: 100, h: 40 })
        other.add(second)
        other.capture()
        log = []
        await other.flush()
        expect(log).not.toContain('scrollTop')
        clock.frames(30)
        await run
        group.dispose()
        other.dispose()
    })

    it('does not run for the WAAPI engine, which writes no inline style', async () => {
        const { group, element } = await setup('firefox', '', {
            engine: 'waapi',
        })
        group.capture()
        place(element, { x: 50, y: 0, w: 100, h: 40 })
        log = []
        void group.flush()
        expect(log).not.toContain('scrollTop')
        expect(element.style.getPropertyValue('overflow-anchor')).toBe('')
        group.dispose()
    })
})

describe('§11.4 S2 the fallback where a transform moves the anchor', () => {
    it("writes overflow-anchor: none !important with the first pose write and restores the author's declaration byte for byte", async () => {
        const authored = 'overflow-anchor: auto; color: red;'
        const { clock, group, element } = await setup('firefox', authored)
        group.capture()
        place(element, { x: 50, y: 0, w: 100, h: 40 })
        const run = group.flush()
        // one commit: the t = 0 pose and the owned declaration
        expect(element.style.translate).toBe('-50px 0px')
        expect(element.style.getPropertyValue('overflow-anchor')).toBe('none')
        expect(element.style.getPropertyPriority('overflow-anchor')).toBe(
            'important'
        )
        clock.frames(5)
        expect(element.style.getPropertyValue('overflow-anchor')).toBe('none')
        clock.frames(30)
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        expect(element.style.cssText).toBe(authored)
        group.dispose()
    })

    it('removes the declaration at settle when the author had none', async () => {
        const { clock, group, element } = await setup('firefox')
        group.capture()
        place(element, { x: 50, y: 0, w: 100, h: 40 })
        const run = group.flush()
        expect(element.style.getPropertyValue('overflow-anchor')).toBe('none')
        clock.frames(30)
        await run
        expect(element.style.cssText).toBe('')
        group.dispose()
    })

    it('covers every driven node: a child counter-projected under a moving parent', async () => {
        const { doc, clock, group, element } = await setup('firefox')
        const child = doc.createElement('div')
        element.append(child)
        place(child, { x: 10, y: 10, w: 20, h: 20 })
        group.add(child)
        group.capture()
        await group.flush()
        group.capture()
        place(element, { x: 0, y: 0, w: 200, h: 40 })
        const run = group.flush()
        expect(child.style.scale).toBe('2 1')
        expect(child.style.getPropertyValue('overflow-anchor')).toBe('none')
        clock.frames(30)
        await run
        expect(child.style.cssText).toBe('')
        group.dispose()
    })

    it('leaves a driven scroll container alone', async () => {
        const { clock, group, element } = await setup(
            'firefox',
            'overflow: auto;'
        )
        group.capture()
        place(element, { x: 50, y: 0, w: 100, h: 40 })
        const run = group.flush()
        expect(element.style.translate).toBe('-50px 0px')
        expect(element.style.getPropertyValue('overflow-anchor')).toBe('')
        clock.frames(30)
        await run
        expect(element.style.cssText).toBe('overflow: auto;')
        group.dispose()
    })

    it('an author replacement of the declaration does not make the node unpresented', async () => {
        const { clock, group, element } = await setup('firefox')
        group.capture()
        place(element, { x: 50, y: 0, w: 100, h: 40 })
        const run1 = group.flush()
        clock.frames(3)
        element.style.setProperty('overflow-anchor', 'auto')
        // a retarget from the measured box, not a stale snap
        group.capture()
        place(element, { x: 80, y: 0, w: 100, h: 40 })
        const run2 = group.flush()
        expect((await run1).status).toBe('interrupted')
        expect(element.style.getPropertyValue('overflow-anchor')).toBe('none')
        clock.frames(30)
        expect(await run2).toEqual({ status: 'ended', snapped: [] })
        // the author's latest value is what the settle restores
        expect(element.style.cssText).toBe('overflow-anchor: auto;')
        group.dispose()
    })
})

describe('§11.4 S2 no fallback where a transform does not move the anchor', () => {
    it('writes no overflow-anchor', async () => {
        const { clock, group, element } = await setup('chromium')
        group.capture()
        place(element, { x: 50, y: 0, w: 100, h: 40 })
        const run = group.flush()
        expect(log).toContain('scrollTop')
        expect(element.style.translate).toBe('-50px 0px')
        expect(element.style.getPropertyValue('overflow-anchor')).toBe('')
        clock.frames(30)
        await run
        expect(element.style.cssText).toBe('')
        group.dispose()
    })
})
