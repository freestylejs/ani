// @vitest-environment jsdom

import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { createLayoutGroup } from '../scope'
import { createRectModel, type RectModel } from './rect_model'

const motion = { duration: 0.2, timing: timing.linear() }

let model: RectModel
let frames: Map<number, FrameRequestCallback>

beforeEach(() => {
    model = createRectModel()
    frames = new Map()
    let id = 0
    window.requestAnimationFrame = (callback) => {
        id += 1
        frames.set(id, callback)
        return id
    }
    window.cancelAnimationFrame = (handle) => {
        frames.delete(handle)
    }
})

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function box(x: number, y = 0, w = 40, h = 40) {
    return { x, y, w, h }
}

function element(x: number, y = 0, parent?: HTMLElement): HTMLElement {
    const e = document.createElement('div')
    parent?.append(e)
    if (!parent) document.body.append(e)
    model.place(e, box(x, y))
    return e
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('capture and flush scratch buffers', () => {
    it('S-1: repeated moves keep every read count and report exact', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        const b = element(60)
        const c = element(120)
        for (const e of [a, b, c]) group.add(e)
        group.capture()
        await group.flush()
        await nextTask()

        for (let cycle = 0; cycle < 8; cycle++) {
            model.reset()
            const captureBefore = group.stats
            group.capture()
            expect(group.stats.rects - captureBefore.rects).toBe(
                model.reads.rects
            )
            expect(group.stats.offsets - captureBefore.offsets).toBe(
                model.reads.offsets
            )
            expect(group.stats.styles - captureBefore.styles).toBe(
                model.reads.styles
            )

            const captured = group.stats
            model.place(a, box(cycle * 7))
            model.place(b, box(60 + cycle * 5))
            model.place(c, box(120 - cycle * 3))
            model.reset()
            const pending = group.flush()
            mc.frames(20)
            const report = await pending
            expect(group.stats.rects - captured.rects).toBe(model.reads.rects)
            expect(group.stats.offsets - captured.offsets).toBe(
                model.reads.offsets
            )
            expect(group.stats.styles - captured.styles).toBe(
                model.reads.styles
            )
            expect(report.snapped).toEqual([])
            expect(group.stats.reads).toBe(
                group.stats.rects + group.stats.offsets + group.stats.styles
            )
            mc.frames(1)
            await nextTask()
        }
        group.dispose()
    })

    it('S-2: a clean capture is not reused by a later unsupported capture', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const wrapper = element(0, 0)
        model.place(wrapper, box(0, 0, 400, 400))
        const inside = element(0, 0, wrapper)
        const outside = element(0, 500)
        group.add(inside)
        group.add(outside)

        group.capture()
        await group.flush()
        await nextTask()

        // clean capture on the next buffer slot
        group.capture()
        model.place(inside, box(10))
        model.place(outside, box(10, 500))
        const clean = group.flush()
        mc.frames(20)
        expect((await clean).snapped).toEqual([])
        await nextTask()

        // the author adds an unowned scale in the commit: the support pass
        // must run again even though the previous pass was clean
        group.capture()
        wrapper.style.scale = '1.5'
        model.place(inside, box(20))
        model.place(outside, box(20, 500))
        const pending = group.flush()
        mc.frames(20)
        const report = await pending
        expect(report.snapped).toEqual([
            { element: inside, reason: 'unsupported' },
        ])

        group.dispose()
    })

    it('S-3: an aged capture does not corrupt the next fresh capture', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        group.add(a)
        group.capture()
        await group.flush()
        await nextTask()

        model.place(a, box(40))
        group.capture()
        mc.frame() // age the capture
        model.place(a, box(45))
        const stale = await group.flush()
        expect(stale.snapped).toEqual([{ element: a, reason: 'stale' }])

        await nextTask()
        group.capture()
        model.place(a, box(80))
        const pending = group.flush()
        mc.frames(20)
        const fresh = await pending
        expect(fresh.snapped).toEqual([])
        expect(fresh.status).not.toBe('stale')
        group.dispose()
    })

    it('S-5: the non-skipping shared path still reads lazy pose rates', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        const b = element(100)
        group.add(a, { layoutId: 'a' })
        group.add(b, { layoutId: 'b' })
        group.capture()
        await group.flush()
        await nextTask()

        group.capture()
        model.place(a, box(50))
        model.place(b, box(150))
        const pending = group.flush()
        mc.frames(3)
        expect(a.style.translate).not.toBe('')
        expect(b.style.translate).not.toBe('')
        mc.frames(20)
        const report = await pending
        expect(report.snapped).toEqual([])
        group.dispose()
    })

    it('S-4: flush buffers grow and shrink without stale entries', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const elements: HTMLElement[] = []
        const removers: (() => void)[] = []
        for (let i = 0; i < 2; i++) {
            const e = element(i * 50)
            elements.push(e)
            removers.push(group.add(e))
        }
        group.capture()
        await group.flush()
        await nextTask()

        for (let cycle = 0; cycle < 4; cycle++) {
            const target = cycle % 2 === 0 ? 6 : 2
            while (elements.length < target) {
                const e = element(elements.length * 50)
                elements.push(e)
                removers.push(group.add(e))
            }
            while (elements.length > target) {
                const e = elements.pop()!
                removers.pop()!()
                e.remove()
            }
            for (let i = 0; i < elements.length; i++) {
                model.place(elements[i]!, box(i * 40 + cycle))
            }
            group.capture()
            const pending = group.flush()
            mc.frames(20)
            const report = await pending
            expect(report.snapped).toEqual([])
            await nextTask()
        }
        group.dispose()
    })
})
