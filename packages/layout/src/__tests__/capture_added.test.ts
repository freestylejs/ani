// @vitest-environment jsdom

import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { linkPresence } from '../presence_link'
import { layoutRuntime } from '../runtime'
import { createLayoutGroup } from '../scope'
import type { LayoutDiagnostic } from '../types'
import { createRectModel, type RectModel } from './rect_model'

let model: RectModel
const cleanup: Array<() => void> = []

beforeEach(() => {
    model = createRectModel()
})
afterEach(() => {
    for (const stop of cleanup.splice(0).reverse()) stop()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function element(x: number): HTMLElement {
    const el = document.createElement('div')
    document.body.append(el)
    model.place(el, { x, y: 0, w: 40, h: 40 })
    return el
}

function setup(maxParticipants = 2000) {
    const mc = createManualClock()
    const group = createLayoutGroup({
        clock: mc.clock,
        maxParticipants,
        motion: { duration: 0.2, timing: timing.linear() },
    })
    cleanup.push(
        () => mc.clock.dispose(),
        () => group.dispose()
    )
    const existing = element(0)
    group.add(existing)
    return { group, mc, existing }
}

describe('typed post-mount capture lifecycle', () => {
    it('has one public typed port and no symbol bridge', () => {
        const { group } = setup()
        expect(typeof group.captureAdded).toBe('function')
        expect(Object.getOwnPropertySymbols(group).map(String)).not.toContain(
            'Symbol(ani-layout.capture-added)'
        )
    })

    it('captures a late mount once without refreshing existing participants', async () => {
        const { group, mc, existing } = setup()
        group.capture()
        const reads = group.stats.rects
        const added = element(100)
        group.add(added)
        group.captureAdded(added)
        group.captureAdded(added)
        group.captureAdded(existing)
        expect(group.stats.rects).toBe(reads + 1)
        model.place(added, { x: 200, y: 0, w: 40, h: 40 })
        const run = group.flush()
        expect(model.rect(added).x).toBe(100)
        mc.frame(0)
        mc.frame(100)
        expect(model.rect(added).x).toBeCloseTo(150)
        mc.frame(100)
        await expect(run).resolves.toEqual({ status: 'ended', snapped: [] })
        expect(model.rect(added).x).toBe(200)
        expect(added.style.cssText).toBe('')
        expect(mc.clock.size).toBe(0)
    })

    it('never creates a capture when called without one', () => {
        const { group } = setup()
        const added = element(100)
        group.add(added)
        const before = group.stats
        group.captureAdded(added)
        expect(group.stats).toEqual(before)
    })

    it('does not refresh a capture from an earlier task', async () => {
        const { group } = setup()
        group.capture()
        await Promise.resolve()
        const added = element(100)
        group.add(added)
        const reads = group.stats.rects
        group.captureAdded(added)
        expect(group.stats.rects).toBe(reads)
    })

    it('does not un-age a capture after a rendering opportunity', () => {
        const { group, mc } = setup()
        group.capture()
        mc.frame(0)
        const added = element(100)
        group.add(added)
        const reads = group.stats.rects
        group.captureAdded(added)
        expect(group.stats.rects).toBe(reads)
    })

    it('reads nothing for unregistered or disconnected elements', () => {
        const { group } = setup()
        group.capture()
        const unknown = element(100)
        const disconnected = element(200)
        group.add(disconnected)
        disconnected.remove()
        const reads = group.stats.rects
        group.captureAdded(unknown)
        group.captureAdded(disconnected)
        expect(group.stats.rects).toBe(reads)
    })

    it('evicts an adopted late mount before any read and never captures it at flush', async () => {
        const { group } = setup()
        const diagnostics: LayoutDiagnostic[] = []
        cleanup.push(
            layoutRuntime.onDiagnostic((event) => diagnostics.push(event))
        )
        group.capture()
        const added = element(100)
        added.style.setProperty('translate', '3px 4px', 'important')
        const authored = added.style.cssText
        group.add(added)
        const read = vi.spyOn(added, 'getBoundingClientRect')
        const other = document.implementation.createHTMLDocument('other')
        other.body.append(other.adoptNode(added))
        expect(added.isConnected).toBe(true)
        const reads = group.stats.rects

        group.captureAdded(added)

        expect(read).not.toHaveBeenCalled()
        expect(group.stats.rects).toBe(reads)
        expect(added.style.cssText).toBe(authored)
        expect(
            diagnostics.filter((event) => event.code === 'document-mismatch')
        ).toEqual([
            expect.objectContaining({ element: added, action: 'finish' }),
        ])
        await group.flush()
        expect(read).not.toHaveBeenCalled()
        // Even after adoption back, the removed participant must be registered anew.
        document.body.append(document.adoptNode(added))
        expect(() => group.take(added)).toThrow()
        expect(read).not.toHaveBeenCalled()
    })

    it('leaves a presence-managed mount to its enter lifecycle', () => {
        const { group } = setup()
        group.capture()
        const added = element(100)
        cleanup.push(
            linkPresence(added, {
                exiting: false,
                opacity: false,
                hold: () => undefined,
            })
        )
        group.add(added)
        const reads = group.stats.rects
        group.captureAdded(added)
        expect(group.stats.rects).toBe(reads)
    })

    it('does not read past the participant cap after a mount', () => {
        const { group } = setup(1)
        group.capture()
        const added = element(100)
        group.add(added)
        const reads = group.stats.rects
        group.captureAdded(added)
        expect(group.stats.rects).toBe(reads)
    })

    it('is inert after disposal', () => {
        const { group } = setup()
        group.capture()
        const added = element(100)
        group.add(added)
        group.dispose()
        const before = group.stats
        group.captureAdded(added)
        expect(group.stats).toEqual(before)
    })
})
