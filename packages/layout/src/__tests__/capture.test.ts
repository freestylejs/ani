// @vitest-environment jsdom

import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { createLayoutGroup } from '../scope'
import { createRectModel, type RectModel } from './rect_model'

const motion = { duration: 0.2, timing: timing.linear() }

let model: RectModel
/** The window's animation frames, run by hand. */
let frames: Map<number, FrameRequestCallback>
let cancelled: number[]
let warnings: string[]

beforeEach(() => {
    model = createRectModel()
    frames = new Map()
    cancelled = []
    let id = 0
    window.requestAnimationFrame = (callback) => {
        id += 1
        frames.set(id, callback)
        return id
    }
    window.cancelAnimationFrame = (handle) => {
        cancelled.push(handle)
        frames.delete(handle)
    }
    warnings = []
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        warnings.push(String(args[0]))
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function runWindowFrames(): void {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(0)
}

function box(x: number, y = 0, w = 40, h = 40) {
    return { x, y, w, h }
}

function expectBox(
    actual: { x: number; y: number; w: number; h: number },
    expected: { x: number; y: number; w: number; h: number },
    tolerance = 1e-9
): void {
    for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(Math.abs(actual[k] - expected[k])).toBeLessThanOrEqual(tolerance)
    }
}

function element(x: number, y = 0): HTMLElement {
    const e = document.createElement('div')
    document.body.append(e)
    model.place(e, box(x, y))
    return e
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** A group with three resting participants, one of them started moving. */
async function scene() {
    const mc = createManualClock()
    const group = createLayoutGroup({ clock: mc.clock, motion })
    const a = element(0)
    const b = element(100)
    const c = element(200)
    for (const e of [a, b, c]) group.add(e)
    group.capture()
    await group.flush()
    group.capture()
    model.place(a, box(50))
    void group.flush()
    mc.frames(2)
    expect(group.stats.tracks).toBe(1)
    return { mc, group, a, b, c }
}

describe('capture (§4.1)', () => {
    it('C-1: reads every connected participant, driven ones included: one rect and one layout-size pair each, radii after every rect', async () => {
        const { group, a } = await scene()
        const shared = element(300)
        shared.style.borderRadius = '6px'
        group.add(shared, { layoutId: 'card', radius: true })
        await nextTask()
        model.reset()
        group.capture()
        // a (driven), b, c and the shared node: four rects and four sizes
        expect(model.reads.rects).toBe(4)
        expect(model.reads.offsets).toBe(4)
        const firstStyle = model.log.indexOf('style')
        const lastRect = model.log.lastIndexOf('rect')
        expect(firstStyle).toBeGreaterThan(lastRect)
        // one radius read: the shared participant (radius on)
        expect(model.log.filter((entry) => entry === 'style')).toEqual([
            'style',
        ])
        // the driven node is measured where it is drawn, not skipped
        expect(a.style.translate).not.toBe('')
        group.dispose()
    })

    it('C-2: a capture in the task that took one is reused; a capture in a later task reads again', async () => {
        const { group } = await scene()
        await nextTask()
        model.reset()
        const before = group.stats.captures
        group.capture()
        group.capture()
        expect(model.reads.rects).toBe(3)
        expect(group.stats.captures).toBe(before + 1)
        await nextTask()
        group.capture()
        expect(model.reads.rects).toBe(6)
        expect(group.stats.captures).toBe(before + 2)
        group.dispose()
    })

    it("C-3: the frame marker ages a capture through the clock's read or the window's frame, whichever runs first; the other half is cancelled", async () => {
        // the clock half first: the window's frame is cancelled
        {
            const { mc, group, b } = await scene()
            await nextTask()
            const armed = new Set(frames.keys())
            group.capture()
            const marker = [...frames.keys()].find((k) => !armed.has(k))!
            expect(marker).toBeDefined()
            mc.frame()
            expect(cancelled).toContain(marker)
            model.place(b, box(160))
            const r = await group.flush()
            // aged: no valid measurement, b appears at A and is reported
            expect(r.status).toBe('stale')
            expect(r.snapped).toEqual([{ element: b, reason: 'stale' }])
            expect(b.style.translate).toBe('')
            group.dispose()
        }
        // the window's frame first: the clock half is a no-op
        {
            const { mc, group, b, c } = await scene()
            await nextTask()
            group.capture()
            runWindowFrames()
            model.place(c, box(260))
            const r = await group.flush()
            expect(r.snapped).toEqual([{ element: c, reason: 'stale' }])
            // a fresh capture in a later task is valid until its own marker
            await nextTask()
            group.capture()
            model.place(b, box(140))
            mc.frame() // the first marker's clock half: already spent
            const aged = await group.flush()
            expect(aged.snapped).toEqual([{ element: b, reason: 'stale' }])
            group.dispose()
        }
        // a refresh re-arms; a flush disarms
        {
            const { group } = await scene()
            await nextTask()
            const armed = new Set(frames.keys())
            group.capture()
            const first = [...frames.keys()].find((k) => !armed.has(k))!
            await nextTask()
            group.capture()
            expect(cancelled).toContain(first)
            const second = [...frames.keys()].find(
                (k) => !armed.has(k) && k !== first
            )!
            expect(second).toBeDefined()
            await group.flush()
            expect(cancelled).toContain(second)
            group.dispose()
        }
    })

    it('C-3b: 1,000 captures while the clock is hidden queue one clock read for the scope, not one per capture; it ages only the capture still armed when it runs', async () => {
        const { mc, group, b } = await scene()
        mc.frames(20)
        await nextTask()
        const read = vi.spyOn(mc.clock, 'read')
        mc.setHidden(true)
        for (let k = 0; k < 1000; k++) {
            group.capture()
            await group.flush()
            await nextTask()
        }
        expect(read).toHaveBeenCalledTimes(1)
        // a capture replaced in a later task keeps the one registration
        group.capture()
        await nextTask()
        group.capture()
        expect(read).toHaveBeenCalledTimes(1)
        mc.setHidden(false)
        mc.frame()
        model.place(b, box(140))
        // the clock's read ran: the armed capture is aged
        const aged = await group.flush()
        expect(aged.snapped).toEqual([{ element: b, reason: 'stale' }])
        // once it ran, the next capture registers again
        await nextTask()
        group.capture()
        expect(read).toHaveBeenCalledTimes(2)
        group.dispose()
    })

    it('C-6b: computed values are reused within one check only: a hairline read at capture is read again, once, at its flush, and each count is exact', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const rule = element(0)
        const other = element(200)
        model.place(rule, box(0, 10, 100, 1), [100, 1])
        group.add(rule)
        group.add(other)
        group.capture()
        await group.flush()
        await nextTask()
        const spy = vi.mocked(window.getComputedStyle)
        const readsOf = (e: Element) =>
            spy.mock.calls.filter(([target]) => target === e).length
        spy.mockClear()
        model.reset()
        const before = group.stats.styles
        // the degenerate axis reads the exact size at capture
        group.capture()
        expect(readsOf(rule)).toBe(1)
        expect(readsOf(other)).toBe(0)
        const captured = group.stats.styles
        expect(captured - before).toBe(model.reads.styles)
        spy.mockClear()
        model.reset()
        // the commit moves it: the flush measures it (its computed values,
        // the support check's exact size and its q), reading it once anew
        model.place(rule, box(0, 30, 100, 1), [100, 1])
        void group.flush()
        expect(readsOf(rule)).toBe(1)
        expect(group.stats.styles - captured).toBe(model.reads.styles)
        expect(model.reads.styles).toBe(spy.mock.calls.length)
        group.dispose()
    })

    it('C-4: a capture taken while the clock runs a frame is aged at once, with a warning naming the fix', async () => {
        const { mc, group, b } = await scene()
        await nextTask()
        mc.clock.read(() => group.capture())
        mc.frame()
        expect(
            warnings.some(
                (w) =>
                    w.includes('requestAnimationFrame') &&
                    w.includes('ordinary task')
            )
        ).toBe(true)
        model.place(b, box(170))
        const r = await group.flush()
        expect(r.status).toBe('stale')
        expect(r.snapped).toEqual([{ element: b, reason: 'stale' }])
        expect(b.style.translate).toBe('')
        group.dispose()
    })

    it("C-5: an aged capture supplies no B: nothing starts, the running track is kept, and an undriven node's last known box is the aged capture's", async () => {
        const { mc, group, a, b } = await scene()
        await nextTask()
        // b moved and was presented before the capture: its last known box
        // is the aged capture's (160), not its A at the previous flush (100)
        model.place(b, box(160))
        group.capture()
        mc.frame()
        const drawn = model.rect(a)
        model.place(b, box(160.5))
        const r = await group.flush()
        expect(r).toEqual({ status: 'no-change', snapped: [] })
        expect(b.style.translate).toBe('')
        // the running track goes on from where it was drawn, unchanged
        expect(model.rect(a)).toEqual(drawn)
        expect(group.stats.tracks).toBe(1)
        group.dispose()
    })

    it('C-6: stats count every read exactly: rects, offset pairs and computed styles, reads their sum, holds 0', async () => {
        const { mc, group, b } = await scene()
        await nextTask()
        model.reset()
        const before = group.stats
        group.capture()
        const captured = group.stats
        expect(captured.captures - before.captures).toBe(1)
        expect(captured.rects - before.rects).toBe(model.reads.rects)
        expect(captured.offsets - before.offsets).toBe(model.reads.offsets)
        expect(captured.styles - before.styles).toBe(model.reads.styles)
        model.place(b, box(180))
        model.reset()
        void group.flush()
        const flushed = group.stats
        expect(model.reads.rects).toBe(3)
        expect(flushed.rects - captured.rects).toBe(model.reads.rects)
        expect(flushed.offsets - captured.offsets).toBe(model.reads.offsets)
        expect(flushed.styles - captured.styles).toBe(model.reads.styles)
        expect(flushed.reads).toBe(
            flushed.rects + flushed.offsets + flushed.styles
        )
        expect(flushed.holds).toBe(0)
        expect(flushed.tracks).toBe(2)
        // steady frames read nothing
        model.reset()
        mc.frames(3)
        expect(model.reads).toEqual({ rects: 0, offsets: 0, styles: 0 })
        group.dispose()
    })
})

describe('H17 cache regressions', () => {
    it('H17-01: a participant inside a detached wrapper is not read and is not stale', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const wrapper = document.createElement('div')
        document.body.append(wrapper)
        const item = document.createElement('div')
        wrapper.append(item)
        model.place(item, box(0))
        group.add(item)
        group.capture()
        await group.flush()
        await nextTask()

        wrapper.remove()
        model.reset()
        group.capture()
        expect(model.reads).toEqual({ rects: 0, offsets: 0, styles: 0 })
        model.reset()
        const report = await group.flush()
        expect(model.reads).toEqual({ rects: 0, offsets: 0, styles: 0 })
        expect(report).toEqual({ status: 'no-change', snapped: [] })
        group.dispose()
    })

    it('H17-03: attaching a shadow root on a non-participant ancestor invalidates the tree cache', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const host = document.createElement('div')
        const wrapper = document.createElement('div')
        const item = document.createElement('div')
        document.body.append(host)
        host.append(wrapper)
        wrapper.append(item)
        model.place(item, box(0))
        group.add(item, { layoutId: 'shared' })
        group.capture()
        await group.flush()
        await nextTask()

        const root = host.attachShadow({ mode: 'open' })
        root.append(document.createElement('slot'))
        const added = vi.spyOn(root, 'addEventListener')
        group.capture()
        expect(added.mock.calls.map((call) => call[0])).toContain('scroll')
        group.dispose()
    })
})

describe('S1-1 structural changes between capture and flush', () => {
    it('attaching a shadow root after capture invalidates the tree and arms the root', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const wrapper = document.createElement('div')
        const item = document.createElement('div')
        document.body.append(wrapper)
        wrapper.append(item)
        model.place(item, box(0))
        group.add(item, { layoutId: 'shared' })
        group.capture()
        await group.flush()
        await nextTask()

        // The capture above is the one this flush must invalidate. attachShadow
        // emits no child-list record, so only the ancestry check can see it.
        group.capture()
        const root = wrapper.attachShadow({ mode: 'open' })
        root.append(document.createElement('slot'))
        const added = vi.spyOn(root, 'addEventListener')
        await group.flush()
        expect(added.mock.calls.map((call) => call[0])).toContain('scroll')
        group.dispose()
    })

    it('reparenting a wrapper after capture refreshes the nearest participant parent', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const parent = element(0)
        const wrapper = document.createElement('div')
        parent.append(wrapper)
        const child = document.createElement('div')
        wrapper.append(child)
        model.place(child, box(10, 10, 10, 10))
        group.add(parent)
        group.add(child)
        group.capture()
        await group.flush()
        await nextTask()

        // Both start tracks; the parent's live pose scale is what a stale
        // child->parent edge would draw through.
        group.capture()
        model.place(parent, box(0, 0, 20, 20))
        model.place(child, box(30, 10, 10, 10))
        void group.flush()
        mc.frames(2)
        await nextTask()
        expect(Number.parseFloat(parent.style.scale)).toBeGreaterThan(1)

        // The child's immediate flat parent (wrapper) does not change; its
        // nearest participant parent goes from parent to none.
        group.capture()
        document.body.append(wrapper)
        const report = group.flush()
        mc.frames(80)
        await report
        expectBox(model.rect(child), model.layout(child))
        group.dispose()
    })
})

describe('S2-5 shadow ancestry', () => {
    it('a closed root that comes to contain the participant is tracked and armed', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const host = document.createElement('div')
        const outer = host.attachShadow({ mode: 'closed' })
        const wrapper = document.createElement('div')
        const item = document.createElement('div')
        document.body.append(host)
        outer.append(wrapper)
        wrapper.append(item)
        model.place(item, box(0))
        group.add(item, { layoutId: 'shared' })
        group.capture()
        await group.flush()
        await nextTask()

        group.capture()
        const inner = wrapper.attachShadow({ mode: 'closed' })
        inner.append(item)
        const added = vi.spyOn(inner, 'addEventListener')
        await group.flush()
        expect(added.mock.calls.map((call) => call[0])).toContain('scroll')
        group.dispose()
    })
})
