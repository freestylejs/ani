// @vitest-environment jsdom

import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import type { Box } from '../geometry'
import { createLayoutGroup } from '../scope'
import { createRectModel, type RectModel } from './rect_model'

/**
 * H18-C/D/E/F (§5.10): the held read adopts a layout move the flush already
 * compensated without re-applying its delta, a nested rider keeps one h, the
 * release starts at the presented origin, and a flush-covered reorder adds no
 * held-read support read.
 */

const motion = { duration: 0.4, timing: timing.linear() }
let model: RectModel

beforeEach(() => {
    model = createRectModel()
    window.requestAnimationFrame = () => 0
    window.cancelAnimationFrame = () => {
        // the frame marker's window half never runs in these scenes
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {
        // the assertions use boxes and reads
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function element(at: Box, parent: HTMLElement = document.body): HTMLElement {
    const e = document.createElement('div')
    parent.append(e)
    model.place(e, at)
    Object.defineProperty(e, 'offsetLeft', {
        configurable: true,
        get: () => model.layout(e).x,
    })
    Object.defineProperty(e, 'offsetTop', {
        configurable: true,
        get: () => model.layout(e).y,
    })
    return e
}

function y(element: HTMLElement): number {
    return model.rect(element).y
}

describe('held rebase and release origin (§5.10)', () => {
    it('H18-C: a move after a reorder changes A is not offset by the layout delta', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const el = element({ x: 0, y: 100, w: 100, h: 40 })
        group.add(el)
        group.capture()
        await group.flush()
        const handle = group.take(el)
        handle.move({ x: 0, y: 0 })
        mc.frame(16)
        expect(y(el)).toBeCloseTo(100, 6)

        // Reorder: the row's layout moves 60 px under the finger; the flush
        // adopts A and keeps the held origin at H.
        group.capture()
        model.place(el, { x: 0, y: 160, w: 100, h: 40 })
        void group.flush()
        expect(y(el)).toBeCloseTo(100, 6)

        // The first move after the reorder, before the next frame.
        handle.move({ x: 0, y: 30 })
        mc.frame(16)
        expect(y(el)).toBeCloseTo(130, 6)
        mc.frame(16)
        expect(y(el)).toBeCloseTo(130, 6)
        handle.cancel()
        mc.frames(60)
        group.dispose()
    })

    it('H18-D: a nested rider under a held parent keeps exactly one h', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const parent = element({ x: 0, y: 100, w: 200, h: 100 })
        const child = element({ x: 20, y: 110, w: 40, h: 40 }, parent)
        group.add(parent)
        group.add(child)
        // The scene takes before any flush: the parentage is not from a
        // previous flush.
        const handle = group.take(parent)
        handle.move({ x: 0, y: 30 })
        mc.frame(16)
        expect(y(parent)).toBeCloseTo(130, 6)
        expect(y(child)).toBeCloseTo(140, 6)

        // A reorder moves both layout boxes by 60; the relative position is
        // unchanged and the rider stays at the parent's drawn box + 10.
        group.capture()
        model.place(parent, { x: 0, y: 160, w: 200, h: 100 })
        model.place(child, { x: 20, y: 170, w: 40, h: 40 })
        void group.flush()
        mc.frame(16)
        expect(y(parent)).toBeCloseTo(130, 6)
        expect(y(child)).toBeCloseTo(140, 6)

        // A later move carries the rider with one h.
        handle.move({ x: 0, y: 50 })
        mc.frame(16)
        expect(y(parent)).toBeCloseTo(150, 6)
        expect(y(child)).toBeCloseTo(160, 6)
        handle.cancel()
        mc.frames(60)
        group.dispose()
    })

    it('H18-E: release starts at the presented origin, not at a pending finger target', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const el = element({ x: 0, y: 100, w: 100, h: 40 })
        group.add(el)
        group.capture()
        await group.flush()
        const handle = group.take(el)
        handle.move({ x: 0, y: 0 })
        mc.frame(16)
        const presented = y(el)
        expect(presented).toBeCloseTo(100, 6)
        // The finger moves 100 px and releases in the same task: the move is
        // not presented, so the release must not jump to it.
        handle.move({ x: 0, y: 100 })
        handle.release({ x: 0, y: 0 })
        mc.frame(16)
        expect(y(el)).toBeCloseTo(presented, 6)
        mc.frames(60)
        expect(y(el)).toBeCloseTo(100, 6)
        group.dispose()
    })

    it('H18-F: the held frame after a flush-covered reorder reads one rect and no support pair/style', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const el = element({ x: 0, y: 100, w: 100, h: 40 })
        group.add(el)
        group.capture()
        await group.flush()
        const handle = group.take(el)
        handle.move({ x: 0, y: 0 })
        mc.frame(16)

        group.capture()
        model.place(el, { x: 0, y: 160, w: 100, h: 40 })
        void group.flush()
        handle.move({ x: 0, y: 30 })
        model.reset()
        mc.frame(16)
        expect(model.reads.rects).toBe(1)
        expect(model.reads.offsets).toBe(0)
        expect(model.reads.styles).toBe(0)
        handle.cancel()
        mc.frames(60)
        group.dispose()
    })
})
