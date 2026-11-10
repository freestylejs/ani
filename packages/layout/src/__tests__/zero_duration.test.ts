// @vitest-environment jsdom

import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import type { Box } from '../geometry'
import { resolveMotion } from '../motion'
import { linkPresence } from '../presence_link'
import { createLayoutGroup } from '../scope'
import { trackEnded, trackOrigin, trackProgress } from '../solve'
import type { LayoutGroup, LayoutReport } from '../types'
import { trackOf } from './nodes'
import { createRectModel, type RectModel } from './rect_model'

let model: RectModel
const cleanup: Array<() => void> = []
const box = (x: number, w = 40): Box => ({ x, y: 0, w, h: 40 })

beforeEach(() => {
    model = createRectModel()
})

afterEach(() => {
    for (const stop of cleanup.splice(0).reverse()) stop()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

function element(at: Box, parent = document.body): HTMLElement {
    const el = document.createElement('div')
    parent.append(el)
    model.place(el, at)
    return el
}

function setup(mode: 'running' | 'frozen' | 'paused' = 'running') {
    const mc = createManualClock({ timeScale: mode === 'frozen' ? 0 : 1 })
    if (mode === 'paused') mc.clock.pause()
    const group = createLayoutGroup({
        clock: mc.clock,
        motion: { duration: 0 },
    })
    cleanup.push(
        () => mc.clock.dispose(),
        () => group.dispose()
    )
    return { mc, group }
}

async function expectEndedWithoutFrame(promise: Promise<LayoutReport>) {
    let report: LayoutReport | undefined
    void promise.then((value) => {
        report = value
    })
    await Promise.resolve()
    expect(report).toEqual({ status: 'ended', snapped: [] })
}

function expectRestored(group: LayoutGroup, el: HTMLElement, authored: string) {
    expect(el.style.cssText).toBe(authored)
    expect(group.stats.tracks).toBe(0)
    expect(group.stats.holds).toBe(0)
}

describe('zero-duration timing law', () => {
    it.each([
        0, 0.2,
    ])('jumps exactly at the delay boundary (%s seconds)', (delay) => {
        const track = trackOf(
            box(0),
            box(200),
            null,
            0,
            0,
            true,
            resolveMotion([{ duration: 0, delay }]),
            null
        )
        expect(trackOrigin(track, delay - 0.001).x).toBe(0)
        expect(trackEnded(track, delay - 0.001)).toBe(false)
        expect(trackProgress(track, delay - 0.001)).toBe(0)
        expect(trackOrigin(track, delay)).toEqual({
            x: 200,
            y: 0,
            vx: 0,
            vy: 0,
        })
        expect(trackEnded(track, delay)).toBe(true)
        expect(trackProgress(track, delay)).toBe(1)
    })
})

describe('synchronous zero-duration layout', () => {
    it.each([
        'running',
        'frozen',
        'paused',
    ] as const)('flush jumps and restores without a frame on a %s clock', async (mode) => {
        const { mc, group } = setup(mode)
        const el = element(box(0))
        el.style.opacity = '0.7'
        el.style.borderTopLeftRadius = '12px'
        const authored = el.style.cssText
        group.add(el, { radius: true })
        group.capture()
        model.place(el, box(200, 80))
        const result = group.flush()
        expect(model.rect(el)).toEqual(box(200, 80))
        expectRestored(group, el, authored)
        expect(mc.clock.size).toBe(0)
        await expectEndedWithoutFrame(result)
    })

    it('a drive release to zero lands synchronously even with frozen time', async () => {
        const { mc, group } = setup('frozen')
        const el = element(box(0))
        group.add(el)
        group.capture()
        await group.flush()
        const hold = group.take(el)
        hold.move({ x: 50, y: 0 })
        // Held moves are committed on the shared frame, independent of timeScale.
        mc.frame(0)
        expect(model.rect(el).x).toBe(50)
        hold.release({ x: 800, y: 0 })
        expect(model.rect(el).x).toBe(0)
        expectRestored(group, el, '')
        expect(mc.clock.size).toBe(0)
        expect(hold.state).toBe('released')
    })

    it.each([
        0, 0.05,
    ])('a %ss release preserves a longer descendant residual', async (duration) => {
        const { mc, group } = setup()
        const parent = element(box(0, 100))
        const child = element(box(20), parent)
        group.add(parent, { motion: { duration, timing: timing.linear() } })
        group.add(child, {
            layout: 'position',
            motion: { duration: 0.4, timing: timing.linear() },
        })
        group.capture()
        await group.flush()
        const hold = group.take(parent)
        hold.move({ x: 50, y: 0 })
        const run = group.update(() => model.place(child, box(80)))
        mc.frame(0)
        mc.frame(100)
        const residual = model.rect(child).x - model.rect(parent).x
        expect(residual).toBeGreaterThan(20)
        expect(residual).toBeLessThan(80)
        hold.release({ x: 0, y: 0 })
        if (duration > 0) {
            mc.frame(0)
            mc.frame(duration * 1000)
        }
        expect(model.rect(parent).x).toBeCloseTo(0)
        expect(model.rect(child).x).toBeLessThan(80)
        expect(model.rect(child).x).toBeGreaterThanOrEqual(residual)
        expect(mc.clock.size).toBe(1)
        mc.frames(30, 16)
        expect(model.rect(child).x).toBeCloseTo(80)
        expectRestored(group, child, '')
        expect(mc.clock.size).toBe(0)
        // The held residual has its own lifetime, not a new LayoutReport run.
        await expect(run).resolves.toEqual({ status: 'no-change', snapped: [] })
    })

    it('a WAAPI zero jump creates no native animation or pending run', async () => {
        vi.stubGlobal('CSS', { supports: () => true })
        const mc = createManualClock({ timeScale: 0 })
        const group = createLayoutGroup({
            clock: mc.clock,
            engine: 'waapi',
            motion: { duration: 0 },
        })
        cleanup.push(
            () => mc.clock.dispose(),
            () => group.dispose()
        )
        const el = element(box(0))
        const animate = vi.fn(() => ({
            pause: vi.fn(),
            play: vi.fn(),
            cancel: vi.fn(),
            playState: 'paused',
            currentTime: 0,
            finished: new Promise<void>(() => undefined),
        }))
        Object.defineProperty(el, 'animate', {
            value: animate,
            configurable: true,
        })
        group.add(el, { layout: 'position' })
        const run = group.update(() => model.place(el, box(200)))
        expect(animate).not.toHaveBeenCalled()
        expect(model.rect(el).x).toBe(200)
        expectRestored(group, el, '')
        expect(mc.clock.size).toBe(0)
        await expectEndedWithoutFrame(run)
    })

    it('a delayed zero-duration track holds before and ends at its boundary', async () => {
        const { mc, group } = setup()
        const el = element(box(0))
        group.add(el, { motion: { duration: 0, delay: 0.2 } })
        group.capture()
        model.place(el, box(200))
        const result = group.flush()
        expect(model.rect(el).x).toBe(0)
        mc.frame(0)
        mc.frame(100)
        expect(model.rect(el).x).toBe(0)
        mc.frame(100)
        expect(model.rect(el).x).toBe(200)
        expectRestored(group, el, '')
        expect(mc.clock.size).toBe(0)
        await expectEndedWithoutFrame(result)
    })

    it('a moving retarget to zero jumps without changing the clock policy', async () => {
        const { mc, group } = setup()
        const el = element(box(0))
        group.add(el, { motion: { duration: 0.4, timing: timing.linear() } })
        const first = group.update(() => model.place(el, box(200)))
        mc.frame(0)
        mc.frame(100)
        expect(model.rect(el).x).toBeCloseTo(50)
        group.capture()
        group.set(el, { motion: { duration: 0 } })
        model.place(el, box(300))
        const second = group.flush()
        expect(model.rect(el).x).toBe(300)
        expectRestored(group, el, '')
        expect(mc.clock.size).toBe(0)
        await expectEndedWithoutFrame(second)
        await expect(first).resolves.toMatchObject({ status: 'interrupted' })
    })

    it('does not prematurely finish a nonzero sibling track', async () => {
        const { mc, group } = setup()
        const instant = element(box(0))
        const moving = element(box(100))
        group.add(instant)
        group.add(moving, {
            motion: { duration: 0.4, timing: timing.linear() },
        })
        const run = group.update(() => {
            model.place(instant, box(200))
            model.place(moving, box(300))
        })
        expect(model.rect(instant).x).toBe(200)
        expect(instant.style.translate).toBe('')
        expect(model.rect(moving).x).toBe(100)
        expect(group.stats.tracks).toBe(1)
        mc.frame(0)
        mc.frame(400)
        expect(model.rect(moving).x).toBe(300)
        await expectEndedWithoutFrame(run)
    })

    it('keeps counter-projection under a live ancestor, then restores', async () => {
        const { mc, group } = setup()
        const parent = element(box(0, 100))
        const child = element(box(20), parent)
        group.add(parent, {
            motion: { duration: 0.4, timing: timing.linear() },
        })
        group.add(child, { layout: 'position' })
        const run = group.update(() => {
            model.place(parent, box(200, 200))
            model.place(child, box(240))
        })
        expect(model.rect(child).x).toBeCloseTo(240)
        expect(model.rect(child).w).toBeCloseTo(40)
        expect(child.style.translate).not.toBe('')
        mc.frame(0)
        mc.frame(100)
        expect(model.rect(child).x).toBeCloseTo(240)
        expect(model.rect(child).w).toBeCloseTo(40)
        mc.frame(300)
        expect(child.style.cssText).toBe('')
        expect(mc.clock.size).toBe(0)
        await expectEndedWithoutFrame(run)
    })

    it('finishes a shared fade and releases presence without a clock frame', async () => {
        const { mc, group } = setup('frozen')
        const old = element(box(0))
        old.style.borderTopLeftRadius = '12px'
        const authored = old.style.cssText
        let exiting = false
        const holds: Promise<void>[] = []
        cleanup.push(
            linkPresence(old, {
                get exiting() {
                    return exiting
                },
                opacity: false,
                hold(until) {
                    holds.push(until)
                },
            })
        )
        const removeOld = group.add(old, { layoutId: 'surface' })
        group.capture()
        await group.flush()
        group.capture()
        exiting = true
        const lead = element(box(200, 80))
        group.add(lead, { layoutId: 'surface' })
        const run = group.flush()
        expect(model.rect(lead)).toEqual(box(200, 80))
        expect(lead.style.translate).toBe('')
        expect(lead.style.opacity).toBe('')
        expect(old.style.opacity).toBe('0')
        expect(old.hasAttribute('inert')).toBe(true)
        expect(mc.clock.size).toBe(0)
        await expectEndedWithoutFrame(run)
        await Promise.all(holds)
        removeOld()
        expect(old.style.cssText).toBe(authored)
        expect(old.hasAttribute('inert')).toBe(false)
    })
})
