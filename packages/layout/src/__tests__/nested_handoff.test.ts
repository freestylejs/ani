// @vitest-environment jsdom

import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import type { Box } from '../geometry'
import { layoutRuntime } from '../runtime'
import { createLayoutGroup } from '../scope'
import { createRectModel, type RectModel } from './rect_model'

/**
 * H18-A (§5.8, §4.4): a nested late lead whose new participant parent is not
 * measured in the same plan still takes its retained handoff. The detail
 * frame and its image mount in one commit; both must draw at the departing
 * presented boxes on the first frame, and the image must not be reported
 * 'stale'.
 */

const motion = { duration: 3, timing: timing.linear() }
let model: RectModel

beforeEach(() => {
    model = createRectModel()
    window.requestAnimationFrame = () => 0
    window.cancelAnimationFrame = () => {
        // the frame marker's window half never runs in these scenes
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {
        // the assertions use the report, not warnings
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
    return e
}

function expectBox(actual: Box, expected: Box, tolerance = 0.01): void {
    for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(Math.abs(actual[k] - expected[k]), k).toBeLessThanOrEqual(
            tolerance
        )
    }
}

describe('H18-A: nested late-lead handoff', () => {
    it('a late parent and its late child both take their retained boxes; the child is never stale', async () => {
        const clock = createManualClock()
        const diagnostics: string[] = []
        const stop = layoutRuntime.onDiagnostic((event) => {
            diagnostics.push(event.code)
        })
        const group = createLayoutGroup({
            clock: clock.clock,
            motion,
            reducedMotion: 'ignore',
        })
        // The grid cell (frame) with its image; both have a shared id.
        const oldFrame = element({ x: 100, y: 500, w: 120, h: 120 })
        const oldImage = element({ x: 80, y: 500, w: 160, h: 120 }, oldFrame)
        const removeOldFrame = group.add(oldFrame, {
            layoutId: 'frame',
            radius: false,
        })
        const removeOldImage = group.add(oldImage, {
            layoutId: 'image',
            radius: false,
        })
        group.capture()
        expect(await group.flush()).toEqual({
            status: 'no-change',
            snapped: [],
        })

        // Open: the grid cell disappears and the detail frame/image mount.
        group.capture()
        const detail = element({ x: 0, y: 300, w: 390, h: 292.5 })
        const removeDetail = group.add(detail, {
            layoutId: 'frame',
            radius: false,
        })
        const detailImage = element({ x: 0, y: 300, w: 390, h: 292.5 }, detail)
        const removeImage = group.add(detailImage, {
            layoutId: 'image',
            radius: false,
        })
        removeOldFrame()
        removeOldImage()
        oldFrame.remove()
        const report = group.flush()

        // The first frame draws the departing boxes, not the new layout.
        expectBox(model.rect(detail), { x: 100, y: 500, w: 120, h: 120 })
        expectBox(model.rect(detailImage), {
            x: 80,
            y: 500,
            w: 160,
            h: 120,
        })
        expect(
            diagnostics.filter(
                (code) =>
                    code === 'capture-less-flush' || code === 'capture-aged'
            )
        ).toEqual([])

        // Both settle exactly on the new layout.
        clock.frames(300)
        expect(await report).toEqual({ status: 'ended', snapped: [] })
        expectBox(model.rect(detail), { x: 0, y: 300, w: 390, h: 292.5 })
        expectBox(model.rect(detailImage), {
            x: 0,
            y: 300,
            w: 390,
            h: 292.5,
        })
        removeDetail()
        removeImage()
        group.dispose()
        stop()
    })
})
