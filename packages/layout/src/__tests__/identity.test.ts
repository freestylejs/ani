// @vitest-environment jsdom

import { isAniError, timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { containsFlat, flatParent } from '../dom'
import type { Box } from '../geometry'
import { validateLayoutOptions } from '../motion'
import { exitingPresence, linkPresence } from '../presence_link'
import { createLayoutGroup } from '../scope'

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

        place(el, { x: 0, y: 0, w: 100, h: 40 })
        group.add(el, { layout: true })
        // a measured baseline (a capture-less one reports the new node, §4.4)
        group.capture()
        await group.flush()

        group.capture()
        place(el, { x: 60, y: 20, w: 150, h: 80 })
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
        expect((await firstRun).status).toBe('ended')

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
