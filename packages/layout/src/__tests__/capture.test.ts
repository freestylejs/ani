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
