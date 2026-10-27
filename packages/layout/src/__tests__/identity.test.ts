// @vitest-environment jsdom

import { isAniError, timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { containsFlat, flatParent, flatTree } from '../dom'
import type { Box } from '../geometry'
import { validateLayoutOptions } from '../motion'
import { exitingPresence, linkPresence } from '../presence_link'
import { createLayoutGroup } from '../scope'

/** `offset` is the layout size when the rect is drawn through a scale. */
function place(
    element: HTMLElement,
    box: Box,
    offset: readonly [number, number] = [Math.round(box.w), Math.round(box.h)]
): void {
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
        value: offset[0],
    })
    Object.defineProperty(element, 'offsetHeight', {
        configurable: true,
        value: offset[1],
    })
}

const noop = (): void => undefined

const linearMotion = {
    type: 'timing' as const,
    duration: 0.2,
    timing: timing.linear(),
}

beforeEach(() => {
    const realGetComputedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((elt: Element) => {
        const raw = realGetComputedStyle(elt)
        const html = elt as HTMLElement
        const w = html.offsetWidth || 100
        const h = html.offsetHeight || 40
        return new Proxy(raw, {
            get(target, prop, receiver) {
                if (prop === 'translate') return html.style.translate || 'none'
                if (prop === 'scale') return html.style.scale || 'none'
                if (prop === 'rotate') return html.style.rotate || 'none'
                if (prop === 'transform') return html.style.transform || 'none'
                if (prop === 'transformOrigin') {
                    return html.style.transformOrigin || `${w / 2}px ${h / 2}px`
                }
                if (prop === 'transitionDuration') {
                    return html.style.transitionDuration || '0s'
                }
                if (prop === 'transitionDelay') {
                    return html.style.transitionDelay || '0s'
                }
                if (prop === 'transitionProperty') {
                    return html.style.transitionProperty || 'none'
                }
                const value = Reflect.get(target, prop, receiver)
                return typeof value === 'function' ? value.bind(target) : value
            },
        })
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('I-1: flat-tree ancestry (§4.6)', () => {
    it('flatParent and containsFlat cross light DOM, open and closed ShadowRoots, and slots', () => {
        const outerHost = document.createElement('div')
        document.body.append(outerHost)

        // Closed shadow root on outerHost -> closedRoot.host is outerHost
        const closedRoot = outerHost.attachShadow({ mode: 'closed' })
        const shadowWrapper = document.createElement('div')
        const innerHost = document.createElement('div')
        closedRoot.append(shadowWrapper)
        shadowWrapper.append(innerHost)

        // Open shadow root on innerHost with <slot> -> assignedSlot is slot
        const openRoot = innerHost.attachShadow({ mode: 'open' })
        const openFrame = document.createElement('section')
        const slot = document.createElement('slot')
        openFrame.append(slot)
        openRoot.append(openFrame)

        const slottedChild = document.createElement('span')
        const deepLight = document.createElement('em')
        slottedChild.append(deepLight)
        innerHost.append(slottedChild)

        expect(slottedChild.assignedSlot).toBe(slot)
        expect(flatParent(deepLight)).toBe(slottedChild)
        expect(flatParent(slottedChild)).toBe(slot)
        expect(flatParent(slot)).toBe(openFrame)
        expect(flatParent(openFrame)).toBe(innerHost)
        expect(flatParent(innerHost)).toBe(shadowWrapper)
        expect(flatParent(shadowWrapper)).toBe(outerHost)
        expect(flatParent(outerHost)).toBe(document.body)

        expect(containsFlat(outerHost, outerHost)).toBe(true)
        expect(containsFlat(outerHost, shadowWrapper)).toBe(true)
        expect(containsFlat(outerHost, innerHost)).toBe(true)
        expect(containsFlat(outerHost, openFrame)).toBe(true)
        expect(containsFlat(outerHost, slot)).toBe(true)
        expect(containsFlat(outerHost, slottedChild)).toBe(true)
        expect(containsFlat(outerHost, deepLight)).toBe(true)
        expect(containsFlat(openFrame, deepLight)).toBe(true)
        expect(containsFlat(slot, deepLight)).toBe(true)

        const outsider = document.createElement('div')
        document.body.append(outsider)
        expect(containsFlat(outerHost, outsider)).toBe(false)
        expect(containsFlat(deepLight, outerHost)).toBe(false)
        expect(containsFlat(outerHost, null)).toBe(false)
        expect(containsFlat(outerHost, undefined)).toBe(false)
    })

    it('nearestParticipant in scope.ts walks across open/closed ShadowRoots and slots', async () => {
        for (const mode of ['open', 'closed'] as const) {
            const clock = createManualClock()
            const group = createLayoutGroup({
                clock: clock.clock,
                motion: linearMotion,
            })

            const host = document.createElement('div')
            document.body.append(host)
            const shadow = host.attachShadow({ mode })
            const shadowBox = document.createElement('div')
            shadow.append(shadowBox)

            let child: HTMLElement
            if (mode === 'open') {
                const slot = document.createElement('slot')
                shadowBox.append(slot)
                child = document.createElement('div')
                host.append(child)
            } else {
                child = document.createElement('div')
                shadowBox.append(child)
            }

            place(host, { x: 0, y: 0, w: 100, h: 100 })
            place(child, { x: 10, y: 10, w: 40, h: 40 })

            group.add(host, { layout: true })
            group.add(child, {
                layout: true,
                layoutAnchor: { x: 0, y: 0 },
            })
            await group.flush()

            // Parent moves by +50px along x and scales 2x in width; child
            // moves with parent's top-left anchor so its offset from (0,0) is unchanged,
            // but because its parent scales 2x in x, the child must be counter-projected
            // in the frame (which only happens when nearestParticipant finds `host`).
            group.capture()
            place(host, { x: 50, y: 0, w: 200, h: 100 })
            place(child, { x: 60, y: 10, w: 40, h: 40 })
            const run = group.flush()

            expect(host.style.translate).not.toBe('')
            // Child is counter-projected against parent's x-scale (0.5x at t=0 -> 2x inverse)
            expect(child.style.scale).not.toBe('')

            clock.frames(20)
            const report = await run
            expect(report.status).toBe('ended')
            group.dispose()
        }
    })

    it('validateWaapiNesting in scope.ts rejects participants nested across open/closed ShadowRoots and slots', () => {
        for (const mode of ['open', 'closed'] as const) {
            const group = createLayoutGroup({
                engine: 'waapi',
                motion: linearMotion,
            })
            const host = document.createElement('div')
            document.body.append(host)
            const shadow = host.attachShadow({ mode })
            let nested: HTMLElement
            if (mode === 'open') {
                const slot = document.createElement('slot')
                shadow.append(slot)
                nested = document.createElement('div')
                host.append(nested)
            } else {
                nested = document.createElement('div')
                shadow.append(nested)
            }

            group.add(host, { layout: 'position' })
            expect(() => group.add(nested, { layout: 'position' })).toThrow(
                TypeError
            )
            try {
                group.add(nested, { layout: 'position' })
            } catch (err) {
                expect(isAniError(err)).toBe(true)
                expect((err as { code: string }).code).toBe(
                    'ANI_INVALID_OPTIONS'
                )
            }
            group.dispose()
        }
    })

    it('a scroll inside open/closed ShadowRoots and slots between capture and flush is part of the change, never stale (§3.2, §4.4)', async () => {
        for (const mode of ['open', 'closed'] as const) {
            const scroller = document.createElement('div')
            scroller.scrollLeft = 12
            scroller.scrollTop = 34
            document.body.append(scroller)

            const host = document.createElement('div')
            scroller.append(host)
            const shadow = host.attachShadow({ mode })
            const shadowScroller = document.createElement('div')
            shadowScroller.scrollLeft = 5
            shadowScroller.scrollTop = 15
            shadow.append(shadowScroller)

            let leaf: HTMLElement
            if (mode === 'open') {
                const slot = document.createElement('slot')
                shadowScroller.append(slot)
                leaf = document.createElement('div')
                host.append(leaf)
            } else {
                leaf = document.createElement('div')
                shadowScroller.append(leaf)
            }

            const clock = createManualClock()
            const group = createLayoutGroup({
                clock: clock.clock,
                motion: linearMotion,
            })
            place(leaf, { x: 0, y: 0, w: 80, h: 40 })
            group.add(leaf, { layout: true })
            group.capture()
            await group.flush()

            // an unpresented scroll in the commit's own task: the leaf starts
            // where it was seen, in view space (D3)
            group.capture()
            shadowScroller.scrollTop = 90
            place(leaf, { x: 0, y: 40, w: 80, h: 40 })
            const run = group.flush()
            expect(group.stats.tracks).toBe(1)
            expect(leaf.style.translate).toBe('0px -40px')
            group.finish()
            expect(await run).toEqual({ status: 'ended', snapped: [] })
            group.dispose()
        }
    })

    it('exitingPresence in presence_link.ts walks across open/closed ShadowRoots and slots', () => {
        for (const mode of ['open', 'closed'] as const) {
            const presenceHost = document.createElement('div')
            document.body.append(presenceHost)
            const shadow = presenceHost.attachShadow({ mode })
            const inner = document.createElement('div')
            shadow.append(inner)

            let deep: HTMLElement
            if (mode === 'open') {
                const slot = document.createElement('slot')
                inner.append(slot)
                const slotted = document.createElement('div')
                deep = document.createElement('span')
                slotted.append(deep)
                presenceHost.append(slotted)
            } else {
                deep = document.createElement('span')
                inner.append(deep)
            }

            const link = {
                exiting: true,
                opacity: false,
                hold: vi.fn(),
            }
            const unlink = linkPresence(presenceHost, link)
            expect(exitingPresence(deep)).toBe(link)
            expect(exitingPresence(inner)).toBe(link)
            unlink()
            expect(exitingPresence(deep)).toBeNull()
        }
    })
})

describe('I-2: document-affine scopes — cross-document add/set (§4.6)', () => {
    it('binds to the first participant document and throws ANI_INVALID_OPTIONS on cross-document add or set with no state change', async () => {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })

        const mainEl = document.createElement('div')
        document.body.append(mainEl)
        place(mainEl, { x: 0, y: 0, w: 100, h: 40 })

        const htmlDoc = document.implementation.createHTMLDocument('second')
        const htmlDocEl = htmlDoc.createElement('div')
        htmlDoc.body.append(htmlDocEl)

        const iframe = document.createElement('iframe')
        document.body.append(iframe)
        const iframeDoc = iframe.contentDocument!
        const iframeEl = iframeDoc.createElement('div')
        iframeDoc.body.append(iframeEl)

        // Invalid options on the first add must not bind the scope document
        expect(() =>
            group.add(htmlDocEl, { layout: 'bad' as unknown as true })
        ).toThrow(TypeError)

        // First valid add binds the scope to `document`
        const removeMain = group.add(mainEl, { layout: true })
        await group.flush()

        for (const foreign of [htmlDocEl, iframeEl]) {
            expect(() => group.add(foreign, { layout: true })).toThrowError(
                expect.objectContaining({
                    code: 'ANI_INVALID_OPTIONS',
                    message: expect.stringContaining('another document'),
                })
            )
            expect(() =>
                group.set(foreign, { layout: 'position' })
            ).toThrowError(
                expect.objectContaining({
                    code: 'ANI_INVALID_OPTIONS',
                    message: expect.stringContaining('another document'),
                })
            )
        }

        // Scope remains bound to `document` even after all participants are removed
        removeMain()
        expect(() => group.add(htmlDocEl, { layout: true })).toThrowError(
            expect.objectContaining({
                code: 'ANI_INVALID_OPTIONS',
            })
        )

        // And mainEl can still be added and animated without corruption
        group.add(mainEl, { layout: true })
        await group.flush()
        group.capture()
        place(mainEl, { x: 40, y: 0, w: 100, h: 40 })
        const run = group.flush()
        expect(group.stats.tracks).toBe(1)
        clock.frames(20)
        expect((await run).status).toBe('ended')
        group.dispose()
    })
})

describe('I-3: adoption into another document (§4.6, §7.2)', () => {
    it('detects adoption at capture() before any read, ends track, restores styles byte-identically, resolves run as disposed, warns once, and unregisters', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(noop)
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })

        const el1 = document.createElement('div')
        const el2 = document.createElement('div')
        document.body.append(el1, el2)
        el1.style.setProperty('color', 'rgb(12, 34, 56)')
        el1.style.setProperty('translate', '4px 6px')
        const initialCssText = el1.style.cssText

        place(el1, { x: 0, y: 0, w: 100, h: 40 })
        place(el2, { x: 0, y: 60, w: 100, h: 40 })

        group.add(el1, { layout: true })
        group.add(el2, { layout: true })
        // the baseline flush is measured: a capture-less one reports both
        // newly registered nodes 'stale' (§4.4)
        group.capture()
        await group.flush()

        // Start a track on el1
        group.capture()
        place(el1, { x: 80, y: 0, w: 100, h: 40 })
        const run = group.flush()
        clock.frames(2)
        expect(group.stats.tracks).toBe(1)
        expect(el1.style.getPropertyPriority('translate')).toBe('important')

        // Adopt both into another document (el1 via adoptNode, el2 via otherDoc.body.append)
        const otherDoc = document.implementation.createHTMLDocument('adopted')
        otherDoc.adoptNode(el1)
        otherDoc.body.append(el1)
        otherDoc.body.append(el2)

        const readSpy1 = vi.spyOn(el1, 'getBoundingClientRect')
        const readSpy2 = vi.spyOn(el2, 'getBoundingClientRect')
        const readsBefore = group.stats.reads

        group.capture()

        // Zero reads of adopted elements
        expect(readSpy1).not.toHaveBeenCalled()
        expect(readSpy2).not.toHaveBeenCalled()
        expect(group.stats.reads).toBe(readsBefore)

        // Track ended and owned styles restored byte-identically
        expect(group.stats.tracks).toBe(0)
        expect(el1.style.cssText).toBe(initialCssText)
        expect(el1.style.getPropertyValue('translate')).toBe('4px 6px')
        expect(el1.style.getPropertyPriority('translate')).toBe('')

        // Run resolved as 'disposed'
        expect(await run).toEqual({ status: 'disposed', snapped: [] })

        // Dev warning emitted once per scope despite two adopted participants
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0]![0]).toContain(
            'adopted into another document'
        )

        // Unregistered: re-adding in otherDoc throws ANI_INVALID_OPTIONS;
        // even if adopted back into `document`, set() is a no-op
        expect(() => group.add(el1, { layout: true })).toThrowError(
            expect.objectContaining({ code: 'ANI_INVALID_OPTIONS' })
        )
        document.adoptNode(el1)
        document.body.append(el1)
        group.set(el1, { layout: 'position' })
        await group.flush()
        expect(group.stats.reads).toBe(readsBefore)

        group.dispose()
    })

    it('detects adoption at flush() before any read when no capture() preceded it', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(noop)
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })

        const el = document.createElement('div')
        document.body.append(el)
        el.setAttribute('style', 'opacity: 0.75; scale: 1.25 1.25;')
        const beforeStyle = el.getAttribute('style')

        // the rect is drawn through the authored 1.25 scale (§4.2: at flush
        // the active node's computed scale is its q)
        place(el, { x: 0, y: 0, w: 100, h: 40 }, [80, 32])
        group.add(el, { layout: true })
        // a measured baseline (a capture-less one reports the new node, §4.4)
        group.capture()
        await group.flush()

        group.capture()
        place(el, { x: 60, y: 20, w: 150, h: 80 }, [120, 64])
        const run = group.flush()
        clock.frames(1)
        expect(group.stats.tracks).toBe(1)

        // Adopt via iframe contentDocument
        const iframe = document.createElement('iframe')
        document.body.append(iframe)
        const iframeDoc = iframe.contentDocument!
        iframeDoc.body.append(el)

        const rectSpy = vi.spyOn(el, 'getBoundingClientRect')
        const readsBefore = group.stats.reads

        const flushReport = await group.flush()
        expect(flushReport).toEqual({ status: 'no-change', snapped: [] })
        expect(rectSpy).not.toHaveBeenCalled()
        expect(group.stats.reads).toBe(readsBefore)
        expect(group.stats.tracks).toBe(0)
        expect(el.getAttribute('style')).toBe(beforeStyle)
        expect(await run).toEqual({ status: 'disposed', snapped: [] })
        expect(warn).toHaveBeenCalledTimes(1)

        group.dispose()
    })

    it('never hands off layoutId across documents or from an adopted participant', async () => {
        vi.spyOn(console, 'warn').mockImplementation(noop)
        const clock = createManualClock()
        const mainGroup = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })
        const otherDoc = document.implementation.createHTMLDocument('other')
        Object.defineProperty(otherDoc.documentElement, 'clientWidth', {
            configurable: true,
            value: 1024,
        })
        Object.defineProperty(otherDoc.documentElement, 'clientHeight', {
            configurable: true,
            value: 768,
        })
        const otherGroup = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })

        const a = document.createElement('div')
        document.body.append(a)
        place(a, { x: 10, y: 10, w: 100, h: 40 })
        const removeA = mainGroup.add(a, { layoutId: 'hero' })
        mainGroup.capture()
        await mainGroup.flush()

        // Cross-scope in another document with same layoutId does not hand off
        // from `a`; every flush below is measured, so a handoff could fly
        const b = otherDoc.createElement('div')
        otherDoc.body.append(b)
        place(b, { x: 200, y: 100, w: 100, h: 40 })
        otherGroup.add(b, { layoutId: 'hero' })
        otherGroup.capture()
        const otherReport = await otherGroup.flush()
        expect(otherReport.status).toBe('no-change')
        expect(otherGroup.stats.tracks).toBe(0)

        // Adopting `a` into otherDoc and removing/evicting it must not leave a retained
        // box in `mainGroup` for a subsequent `layoutId: 'hero'` participant in `document`
        mainGroup.capture()
        otherDoc.adoptNode(a)
        removeA()

        const c = document.createElement('div')
        document.body.append(c)
        place(c, { x: 300, y: 200, w: 100, h: 40 })
        mainGroup.add(c, { layoutId: 'hero' })
        const mainReport = await mainGroup.flush()
        expect(mainReport.status).toBe('no-change')
        expect(mainGroup.stats.tracks).toBe(0)

        mainGroup.dispose()
        otherGroup.dispose()
    })
})

describe('I-4: layoutKey (§4.7, §7.1)', () => {
    it('accepts any layoutKey value in validateLayoutOptions', () => {
        for (const key of [
            undefined,
            null,
            0,
            -0,
            Number.NaN,
            'step-1',
            Symbol('k'),
            { page: 1 },
        ]) {
            expect(() =>
                validateLayoutOptions({ layoutKey: key })
            ).not.toThrow()
        }
    })

    it('ends a running track at identity, restores owned styles, skips planning and stale on the reset flush, and establishes a fresh baseline', async () => {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })

        const scroller = document.createElement('div')
        scroller.scrollTop = 0
        document.body.append(scroller)

        const el = document.createElement('div')
        el.style.setProperty('color', 'rgb(1, 2, 3)')
        const authoredStyle = el.style.cssText
        scroller.append(el)

        place(el, { x: 0, y: 0, w: 100, h: 40 })
        group.add(el, { layout: true, layoutKey: 'k1' })
        await group.flush()

        // Start a running track from x=0 to x=100
        group.capture()
        place(el, { x: 100, y: 0, w: 100, h: 40 })
        const firstRun = group.flush()
        clock.frames(2)
        expect(group.stats.tracks).toBe(1)
        expect(el.style.translate).not.toBe('')

        // Capture, scroll the ancestor scroller, move el to x=250, and change layoutKey
        group.capture()
        scroller.scrollTop = 40
        place(el, { x: 250, y: 50, w: 120, h: 50 })
        group.set(el, { layout: true, layoutKey: 'k2' })

        // Immediately upon set(): track ended at identity and owned styles restored
        expect(group.stats.tracks).toBe(0)
        expect(el.style.cssText).toBe(authoredStyle)
        // §9.1: the run resolves 'disposed' when only such nodes were in it
        expect((await firstRun).status).toBe('disposed')

        // Flush observing the change plans no track, keeps no track, snaps nothing,
        // and does not report 'stale' even though scroller.scrollTop changed
        const resetReport = await group.flush()
        expect(resetReport).toEqual({ status: 'no-change', snapped: [] })
        expect(group.stats.tracks).toBe(0)
        expect(el.style.cssText).toBe(authoredStyle)

        // Subsequent layout change with the same layoutKey ('k2') animates normally
        // from the new baseline { x: 250, y: 50, w: 120, h: 50 }
        group.capture()
        place(el, { x: 350, y: 50, w: 120, h: 50 })
        const nextRun = group.flush()
        expect(group.stats.tracks).toBe(1)
        // At t=0 the pose translates back by -100px toward x=250 (not toward x=100 or x=0)
        expect(el.style.translate).toBe('-100px 0px')
        clock.frames(20)
        expect(await nextRun).toEqual({ status: 'ended', snapped: [] })
        expect(el.style.cssText).toBe(authoredStyle)

        group.dispose()
    })

    it('uses Object.is semantics: NaN to NaN keeps a running track; +0 to -0 resets', async () => {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })

        const el = document.createElement('div')
        document.body.append(el)
        place(el, { x: 0, y: 0, w: 100, h: 40 })
        group.add(el, { layout: true, layoutKey: Number.NaN })
        await group.flush()

        // Start a track from x=0 to x=100
        group.capture()
        place(el, { x: 100, y: 0, w: 100, h: 40 })
        void group.flush()
        clock.frames(3)
        expect(group.stats.tracks).toBe(1)
        const translateMid = el.style.translate

        // Setting NaN -> NaN must NOT reset or mark optionsChanged; flush keeps the track
        group.set(el, { layout: true, layoutKey: Number.NaN })
        expect(group.stats.tracks).toBe(1)
        expect(el.style.translate).toBe(translateMid)
        void group.flush()
        expect(group.stats.tracks).toBe(1)

        // Setting NaN -> +0 resets
        group.set(el, { layout: true, layoutKey: +0 })
        expect(group.stats.tracks).toBe(0)
        expect(el.style.translate).toBe('')
        await group.flush()

        // Start a track with layoutKey: +0
        group.capture()
        place(el, { x: 180, y: 0, w: 100, h: 40 })
        void group.flush()
        clock.frames(2)
        expect(group.stats.tracks).toBe(1)

        // Setting +0 -> -0 must reset under Object.is(+0, -0) === false
        place(el, { x: 240, y: 0, w: 100, h: 40 })
        group.set(el, { layout: true, layoutKey: -0 })
        expect(group.stats.tracks).toBe(0)
        expect(el.style.translate).toBe('')
        const report = await group.flush()
        expect(report).toEqual({ status: 'no-change', snapped: [] })
        expect(group.stats.tracks).toBe(0)

        group.dispose()
    })

    it("a layoutKey change mid-run resolves the run 'disposed' when only such nodes were in it, and leaves a mixed run to end (§9.1)", async () => {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })
        const a = document.createElement('div')
        const b = document.createElement('div')
        document.body.append(a, b)
        place(a, { x: 0, y: 0, w: 100, h: 40 })
        place(b, { x: 0, y: 100, w: 100, h: 40 })
        group.add(a, { layoutKey: 1 })
        group.add(b)
        group.capture()
        await group.flush()

        // only the reset node in the run: 'disposed', at once
        group.capture()
        place(a, { x: 80, y: 0, w: 100, h: 40 })
        const sole = group.flush()
        clock.frames(2)
        expect(group.stats.tracks).toBe(1)
        group.set(a, { layoutKey: 2 })
        expect(group.stats.tracks).toBe(0)
        expect(a.style.translate).toBe('')
        expect(await sole).toEqual({ status: 'disposed', snapped: [] })

        // a run with another node: the rest goes on and ends
        group.capture()
        await group.flush()
        group.capture()
        place(a, { x: 160, y: 0, w: 100, h: 40 })
        place(b, { x: 80, y: 100, w: 100, h: 40 })
        const mixed = group.flush()
        let outcome: string | null = null
        void mixed.then((r) => {
            outcome = r.status
        })
        clock.frames(2)
        expect(group.stats.tracks).toBe(2)
        group.set(a, { layoutKey: 3 })
        expect(group.stats.tracks).toBe(1)
        await Promise.resolve()
        expect(outcome).toBeNull()
        clock.frames(20)
        expect(await mixed).toEqual({ status: 'ended', snapped: [] })
        expect(b.style.translate).toBe('')

        group.dispose()
    })

    it('also resets when add() is called again on an existing element with a new layoutKey', async () => {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })

        const el = document.createElement('div')
        document.body.append(el)
        place(el, { x: 0, y: 0, w: 100, h: 40 })
        group.add(el, { layout: true, layoutKey: 1 })
        await group.flush()

        group.capture()
        place(el, { x: 80, y: 0, w: 100, h: 40 })
        void group.flush()
        clock.frames(2)
        expect(group.stats.tracks).toBe(1)

        place(el, { x: 160, y: 0, w: 100, h: 40 })
        group.add(el, { layout: true, layoutKey: 2 })
        expect(group.stats.tracks).toBe(0)
        expect(el.style.translate).toBe('')
        const report = await group.flush()
        expect(report).toEqual({ status: 'no-change', snapped: [] })

        group.dispose()
    })
})

describe('I-5: closed-root flat ancestry through the known roots (§4.6)', () => {
    /** A host whose shadow root holds `frame`, with a slot (named `slotName` if given) inside it. */
    function slotted(mode: ShadowRootMode, slotName?: string) {
        const host = document.createElement('div')
        document.body.append(host)
        const root = host.attachShadow({ mode })
        const frame = document.createElement('section')
        const slot = document.createElement('slot')
        if (slotName !== undefined) slot.name = slotName
        frame.append(slot)
        root.append(frame)
        const child = document.createElement('div')
        host.append(child)
        return { host, root, frame, slot, child }
    }

    it('finds the slot of a node slotted into a known closed root through assignedNodes()', () => {
        const { host, root, frame, slot, child } = slotted('closed')
        // the platform hides the slot of a closed root
        expect(child.assignedSlot).toBeNull()
        expect(slot.assignedNodes()).toContain(child)
        const roots = new Map<Element, ShadowRoot>([[host, root]])
        expect(flatParent(child, flatTree(roots))).toBe(slot)
        expect(flatParent(slot, flatTree(roots))).toBe(frame)
        expect(flatParent(frame, flatTree(roots))).toBe(host)
        expect(containsFlat(frame, child, flatTree(roots))).toBe(true)
        expect(containsFlat(slot, child, flatTree(roots))).toBe(true)
    })

    it('passes from a node slotted into an unknown closed root straight to its host', () => {
        const { host, frame, child } = slotted('closed')
        expect(flatParent(child)).toBe(host)
        expect(flatParent(child, flatTree(new Map()))).toBe(host)
        expect(containsFlat(frame, child, flatTree(new Map()))).toBe(false)
        expect(containsFlat(host, child, flatTree(new Map()))).toBe(true)
    })

    it('uses assignedSlot for an open root, known or not', () => {
        const { host, root, slot, child } = slotted('open')
        expect(flatParent(child)).toBe(slot)
        expect(flatParent(child, flatTree(new Map([[host, root]])))).toBe(slot)
    })

    it('falls back to the parent element for a child of a known host that no slot holds', () => {
        const { host, root } = slotted('closed', 'named')
        const loose = document.createElement('div')
        host.append(loose)
        expect(flatParent(loose, flatTree(new Map([[host, root]])))).toBe(host)
    })

    it('crosses nested known closed roots', () => {
        const outer = slotted('closed')
        // inside the outer root, a host with its own closed root and slot
        const innerHost = document.createElement('div')
        outer.frame.append(innerHost)
        const innerRoot = innerHost.attachShadow({ mode: 'closed' })
        const panel = document.createElement('div')
        const innerSlot = document.createElement('slot')
        panel.append(innerSlot)
        innerRoot.append(panel)
        const node = document.createElement('span')
        innerHost.append(node)

        const roots = new Map<Element, ShadowRoot>([
            [outer.host, outer.root],
            [innerHost, innerRoot],
        ])
        expect(flatParent(node, flatTree(roots))).toBe(innerSlot)
        expect(flatParent(innerSlot, flatTree(roots))).toBe(panel)
        expect(flatParent(panel, flatTree(roots))).toBe(innerHost)
        expect(flatParent(innerHost, flatTree(roots))).toBe(outer.frame)
        expect(containsFlat(panel, node, flatTree(roots))).toBe(true)
        expect(containsFlat(outer.host, node, flatTree(roots))).toBe(true)
        // with only the outer root known, the walk passes over the inner one
        const outerOnly = new Map<Element, ShadowRoot>([
            [outer.host, outer.root],
        ])
        expect(flatParent(node, flatTree(outerOnly))).toBe(innerHost)
        expect(containsFlat(panel, node, flatTree(outerOnly))).toBe(false)
    })

    it('follows a slot reassignment between walks', () => {
        const { host, root, slot, child } = slotted('closed', 'a')
        const other = document.createElement('slot')
        other.name = 'b'
        root.append(other)
        const roots = new Map<Element, ShadowRoot>([[host, root]])
        child.slot = 'a'
        expect(flatParent(child, flatTree(roots))).toBe(slot)
        child.slot = 'b'
        expect(flatParent(child, flatTree(roots))).toBe(other)
        child.slot = 'c'
        expect(flatParent(child, flatTree(roots))).toBe(host)
    })

    /** A panel participant in a closed root, with a slotted light-DOM participant under it. */
    function closedPanel(slotName?: string) {
        const host = document.createElement('div')
        document.body.append(host)
        const root = host.attachShadow({ mode: 'closed' })
        const panel = document.createElement('div')
        const slot = document.createElement('slot')
        if (slotName !== undefined) slot.name = slotName
        panel.append(slot)
        root.append(panel)
        const child = document.createElement('div')
        host.append(child)
        return { host, root, panel, slot, child }
    }

    it('plans a participant slotted into a closed root under its flat-tree parent', async () => {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })
        const { panel, child } = closedPanel()
        place(panel, { x: 0, y: 0, w: 100, h: 100 })
        place(child, { x: 10, y: 10, w: 40, h: 40 })
        group.add(panel)
        group.add(child)
        group.capture()
        await group.flush()

        // the panel doubles its width; the child's box does not move, so it
        // is counter-projected under its parent's pose
        group.capture()
        place(panel, { x: 0, y: 0, w: 200, h: 100 })
        const run = group.flush()
        expect(panel.style.scale).toBe('0.5 1')
        expect(child.style.scale).toBe('2 1')
        clock.frames(20)
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        expect(child.style.cssText).toBe('')
        group.dispose()
    })

    it('re-reads the slot at every flush: a reassignment out of the panel unparents the child', async () => {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })
        const { root, panel, child } = closedPanel('in')
        const outside = document.createElement('slot')
        outside.name = 'out'
        root.append(outside)
        child.slot = 'in'
        place(panel, { x: 0, y: 0, w: 100, h: 100 })
        place(child, { x: 10, y: 10, w: 40, h: 40 })
        group.add(panel)
        group.add(child)
        group.capture()
        await group.flush()

        group.capture()
        child.slot = 'out'
        place(panel, { x: 0, y: 0, w: 200, h: 100 })
        const run = group.flush()
        expect(panel.style.scale).toBe('0.5 1')
        // no longer under the panel: nothing moved it, so nothing is written
        expect(child.style.cssText).toBe('')
        clock.frames(20)
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        group.dispose()
    })

    it("the 'waapi' nesting check sees a participant slotted into a closed root, in either order", () => {
        for (const order of ['panel first', 'child first'] as const) {
            const group = createLayoutGroup({
                engine: 'waapi',
                motion: linearMotion,
            })
            const { panel, child } = closedPanel()
            const [first, second] =
                order === 'panel first' ? [panel, child] : [child, panel]
            group.add(first, { layout: 'position' })
            let error: unknown = null
            try {
                group.add(second, { layout: 'position' })
            } catch (caught) {
                error = caught
            }
            expect(isAniError(error), order).toBe(true)
            expect((error as { code: string }).code).toBe('ANI_INVALID_OPTIONS')
            group.dispose()
        }
    })

    it('exitingPresence walks into a known closed root', () => {
        const { host, root, panel, child } = closedPanel()
        const link = { exiting: true, opacity: false, hold: vi.fn() }
        const unlink = linkPresence(panel, link)
        expect(exitingPresence(child)).toBeNull()
        expect(exitingPresence(child, flatTree(new Map([[host, root]])))).toBe(
            link
        )
        unlink()
    })
})

describe('I-6: one walk per ancestor (§4.6)', () => {
    it('flatParent reads parentElement once', () => {
        const parent = document.createElement('div')
        const child = document.createElement('span')
        parent.append(child)
        document.body.append(parent)
        let reads = 0
        Object.defineProperty(child, 'parentElement', {
            configurable: true,
            get() {
                reads++
                return parent
            },
        })
        expect(flatParent(child)).toBe(parent)
        expect(reads).toBe(1)
        parent.remove()
    })

    it("exitingPresence with a pass's memo walks each ancestor once and answers every node below it", () => {
        const outer = document.createElement('div')
        const mid = document.createElement('div')
        const a = document.createElement('span')
        const b = document.createElement('span')
        mid.append(a, b)
        outer.append(mid)
        document.body.append(outer)
        const link = { exiting: true, opacity: false, hold: vi.fn() }
        const unlink = linkPresence(outer, link)
        const memo = new Map()
        expect(exitingPresence(a, undefined, memo)).toBe(link)
        // the walk stopped at the exiting link; every node on it is answered
        expect([...memo.keys()]).toEqual([a, mid, outer])
        expect(memo.get(mid)).toBe(link)
        // the sibling's walk ends at its parent's answer, never above it
        unlink()
        expect(exitingPresence(b, undefined, memo)).toBe(link)
        expect(memo.get(b)).toBe(link)
        // a lookup without the pass's memo walks the tree as it is now
        expect(exitingPresence(b)).toBeNull()

        // no exiting link: the walk to the root answers null for each node
        const fresh = new Map()
        expect(exitingPresence(a, undefined, fresh)).toBeNull()
        expect(fresh.get(mid)).toBeNull()
        expect(fresh.get(document.documentElement)).toBeNull()
        outer.remove()
    })
})

describe('I-7: roots re-tracked at every pass (§4.6, L-MEAS-10 (b))', () => {
    /** A host whose closed root holds nothing yet, with a light-DOM child. */
    function closedHost() {
        const host = document.createElement('div')
        document.body.append(host)
        const root = host.attachShadow({ mode: 'closed' })
        const child = document.createElement('div')
        host.append(child)
        return { host, root, child }
    }

    /** The panel doubles its width while the child stays put: the child is counter-projected under it. */
    async function expectPlannedUnder(
        group: ReturnType<typeof createLayoutGroup>,
        clock: ReturnType<typeof createManualClock>,
        panel: HTMLElement,
        child: HTMLElement,
        label: string
    ) {
        group.capture()
        place(panel, { x: 0, y: 0, w: 200, h: 100 })
        const run = group.flush()
        expect(panel.style.scale, label).toBe('0.5 1')
        expect(child.style.scale, label).toBe('2 1')
        clock.frames(20)
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        place(panel, { x: 0, y: 0, w: 100, h: 100 })
        group.capture()
        await group.flush()
    }

    it('a participant registered in the document and moved into a closed root is tracked from the next pass', async () => {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })
        const { root, child } = closedHost()
        const panel = document.createElement('div')
        panel.append(document.createElement('slot'))
        // registered in the document first
        document.body.append(panel)
        place(panel, { x: 0, y: 0, w: 100, h: 100 })
        place(child, { x: 10, y: 10, w: 40, h: 40 })
        group.add(panel)
        group.add(child)
        group.capture()
        await group.flush()
        // moved into the closed root between flushes (a component upgrade)
        root.append(panel)
        group.capture()
        await group.flush()
        await expectPlannedUnder(group, clock, panel, child, 'moved in')
        group.dispose()
    })

    it('a participant moved from one closed root into another is tracked under the new one, and the old one is dropped', async () => {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })
        const first = closedHost()
        const second = closedHost()
        const panel = document.createElement('div')
        panel.append(document.createElement('slot'))
        first.root.append(panel)
        const child = first.child
        place(panel, { x: 0, y: 0, w: 100, h: 100 })
        place(child, { x: 10, y: 10, w: 40, h: 40 })
        group.add(panel)
        group.add(child)
        group.capture()
        await group.flush()
        await expectPlannedUnder(group, clock, panel, child, 'first root')

        // the panel moves into the second root, and the child with it
        second.root.append(panel)
        second.host.append(child)
        // a slot left in the first root: a pass that still knew the root
        // would build its map
        const left = document.createElement('slot')
        first.root.append(left)
        const leftCalls = vi.spyOn(left, 'assignedNodes')
        group.capture()
        await group.flush()
        await expectPlannedUnder(group, clock, panel, child, 'second root')
        expect(leftCalls).not.toHaveBeenCalled()
        group.dispose()
    })
})

describe('I-8: one node-to-slot map per known closed root per pass (§4.6)', () => {
    it('a capture and a flush each call assignedNodes() once per slot, however many participants are slotted', async () => {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion: linearMotion,
        })
        const host = document.createElement('div')
        document.body.append(host)
        const root = host.attachShadow({ mode: 'closed' })
        const panel = document.createElement('div')
        root.append(panel)
        place(panel, { x: 0, y: 0, w: 1000, h: 1000 })
        group.add(panel)
        const SLOTS = 24
        const children: HTMLElement[] = []
        for (let i = 0; i < SLOTS; i++) {
            const slot = document.createElement('slot')
            slot.name = `s${i}`
            panel.append(slot)
            const child = document.createElement('div')
            child.slot = `s${i}`
            host.append(child)
            place(child, { x: 10, y: i * 40, w: 40, h: 30 })
            group.add(child)
            children.push(child)
        }
        group.capture()
        await group.flush()
        const calls = vi.spyOn(HTMLSlotElement.prototype, 'assignedNodes')
        group.capture()
        expect(calls).toHaveBeenCalledTimes(SLOTS)
        calls.mockClear()
        place(panel, { x: 0, y: 0, w: 2000, h: 1000 })
        const run = group.flush()
        expect(calls).toHaveBeenCalledTimes(SLOTS)
        // every child is planned under the panel
        for (const child of children) expect(child.style.scale).toBe('2 1')
        clock.frames(20)
        expect(await run).toEqual({ status: 'ended', snapped: [] })
        group.dispose()
    })
})
