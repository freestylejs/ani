// @vitest-environment jsdom

// §9.2 transactions: injected measure/write faults abort the flush or frame,
// restore styles byte-identically, end every listener and subscription and
// resolve every affected report failed; callbacks are isolated.
import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { clearLayoutFaults, injectLayoutFault } from '../fault'
import { layoutRuntime } from '../runtime'
import { createLayoutGroup } from '../scope'
import type { LayoutDiagnostic, LayoutReport } from '../types'
import { createRectModel, type RectModel } from './rect_model'

const motion = { duration: 0.2, timing: timing.linear() }

let model: RectModel
const stops: (() => void)[] = []

beforeEach(() => {
    model = createRectModel()
    layoutRuntime.setMode('animate')
    clearLayoutFaults()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    document.body.innerHTML = ''
})

afterEach(() => {
    for (const stop of stops.splice(0)) stop()
    clearLayoutFaults()
    layoutRuntime.setMode('animate')
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function box(x: number, y = 0, w = 40, h = 40) {
    return { x, y, w, h }
}

function element(x: number, y = 0): HTMLElement {
    const e = document.createElement('div')
    document.body.append(e)
    model.place(e, box(x, y))
    return e
}

function collect(): {
    readonly events: LayoutDiagnostic[]
    readonly stop: () => void
} {
    const events: LayoutDiagnostic[] = []
    const stop = layoutRuntime.onDiagnostic((event) => events.push(event))
    stops.push(stop)
    return { events, stop }
}

describe('§9.2 a failed flush', () => {
    it('an injected measure fault: failed, every affected node failed, byte-identical styles, no clock subscription, internal-error', async () => {
        const mc = createManualClock()
        const snaps: string[] = []
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            onSnap: (_element, reason) => snaps.push(reason),
        })
        const a = element(0)
        const authored = a.style.cssText
        group.add(a)
        group.capture()
        model.place(a, box(120))
        const { events, stop } = collect()
        const error = new Error('measure boom')
        injectLayoutFault('measure', error)
        const report = await group.flush()
        expect(report).toEqual({
            status: 'failed',
            snapped: [{ element: a, reason: 'failed' }],
        })
        expect(a.style.cssText).toBe(authored)
        expect(a.style.translate).toBe('')
        expect(group.stats.tracks).toBe(0)
        expect(mc.clock.size).toBe(0)
        expect(snaps).toEqual(['failed'])
        const failure = events.find((e) => e.code === 'internal-error')
        expect(failure).toMatchObject({
            version: 1,
            action: 'abort',
            engine: 'raf',
            error,
        })
        stop()
        group.dispose()
    })

    it('an injected write fault mid-flush: the same boundary, and the next flush works normally', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        const authored = a.style.cssText
        group.add(a)
        group.capture()
        model.place(a, box(120))
        const { events, stop } = collect()
        injectLayoutFault('write')
        const report = await group.flush()
        expect(report.status).toBe('failed')
        expect(report.snapped).toEqual([{ element: a, reason: 'failed' }])
        expect(a.style.cssText).toBe(authored)
        expect(mc.clock.size).toBe(0)
        expect(events.some((e) => e.code === 'internal-error')).toBe(true)

        // the engine remains usable
        group.capture()
        model.place(a, box(200))
        const run = group.flush()
        expect(mc.clock.size).toBe(1)
        group.finish()
        await expect(run).resolves.toMatchObject({ status: 'ended' })
        expect(a.style.cssText).toBe(authored)
        stop()
        group.dispose()
    })

    it('an injected write fault in a frame: the pending run resolves failed and the engine is idle', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        const authored = a.style.cssText
        group.add(a)
        group.capture()
        model.place(a, box(120))
        const running = group.flush()
        mc.frame(16)
        expect(group.stats.tracks).toBe(1)
        const { events, stop } = collect()
        const error = new Error('frame write boom')
        injectLayoutFault('write', error)
        mc.frame(16)
        await expect(running).resolves.toEqual({
            status: 'failed',
            snapped: [{ element: a, reason: 'failed' }],
        })
        expect(a.style.cssText).toBe(authored)
        expect(group.stats.tracks).toBe(0)
        expect(mc.clock.size).toBe(0)
        expect(events.find((e) => e.code === 'internal-error')).toMatchObject({
            action: 'abort',
            error,
        })
        stop()
        group.dispose()
    })

    it('OPS-01/OPS-02: a track that settles in the update is restored and reported failed when the commit throws', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        const authored = a.style.cssText
        group.add(a)
        group.capture()
        model.place(a, box(120))
        const run = group.flush()
        // 13 frames: elapsed 0.192 s; the next frame passes the 0.2 s end
        mc.frames(13)
        const { events, stop } = collect()
        const error = new Error('finish-frame write')
        injectLayoutFault('write', error)
        mc.frame(16)
        await expect(run).resolves.toEqual({
            status: 'failed',
            snapped: [{ element: a, reason: 'failed' }],
        })
        expect(a.style.cssText).toBe(authored)
        expect(mc.clock.size).toBe(0)
        const failure = events.find((e) => e.code === 'internal-error')
        expect(failure).toMatchObject({ action: 'abort', error })
        expect(typeof failure!.run).toBe('number')
        stop()
        group.dispose()
    })

    it('OPS-01/OPS-02: a participant-capped flush + write fault restores a settled drive and fails its run', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxParticipants: 1,
        })
        const a = element(0)
        const authored = a.style.cssText
        group.add(a)
        group.capture()
        model.place(a, box(80))
        const run = group.flush()
        mc.frames(2)
        const b = element(200)
        group.add(b)
        group.capture()
        model.place(a, box(120))
        const error = new Error('cap write')
        injectLayoutFault('write', error)
        const report = await group.flush()
        expect(report).toEqual({
            status: 'failed',
            snapped: [
                { element: a, reason: 'failed' },
                { element: b, reason: 'failed' },
            ],
        })
        expect(a.style.cssText).toBe(authored)
        await expect(run).resolves.toMatchObject({ status: 'failed' })
        expect(mc.clock.size).toBe(0)
        group.dispose()
    })

    it("OPS-02: kill switch + write fault resolves the pending run 'failed', not 'disabled'", async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        const authored = a.style.cssText
        group.add(a)
        group.capture()
        model.place(a, box(120))
        const run = group.flush()
        mc.frame(16)
        const { events, stop } = collect()
        const error = new Error('snap write')
        injectLayoutFault('write', error)
        expect(() => layoutRuntime.setMode('snap')).not.toThrow()
        await expect(run).resolves.toEqual({
            status: 'failed',
            snapped: [{ element: a, reason: 'failed' }],
        })
        expect(a.style.cssText).toBe(authored)
        expect(mc.clock.size).toBe(0)
        expect(events.find((e) => e.code === 'internal-error')).toMatchObject({
            action: 'abort',
            error,
        })
        layoutRuntime.setMode('animate')
        stop()
        group.dispose()
    })

    it('OPS-03: a throwing restore still disarms, stops the realizer and emits internal-error', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        group.add(a)
        group.capture()
        model.place(a, box(120))
        const run = group.flush()
        mc.frame(16)
        const style = a.style
        const setProperty = style.setProperty.bind(style)
        let calls = 0
        style.setProperty = ((
            property: string,
            value: string,
            priority?: string
        ) => {
            calls += 1
            if (calls === 1) throw new Error('restore boom')
            return setProperty(property, value, priority)
        }) as typeof style.setProperty
        const { events, stop } = collect()
        const error = new Error('abort trigger')
        injectLayoutFault('measure', error)
        const report = await group.flush()
        expect(report.status).toBe('failed')
        expect(mc.clock.size).toBe(0)
        expect(group.stats.tracks).toBe(0)
        expect(events.find((e) => e.code === 'internal-error')).toMatchObject({
            action: 'abort',
            error,
        })
        await expect(run).resolves.toMatchObject({ status: 'failed' })
        stop()
        group.dispose()
    })

    it('OPS-19: a participant-capped flush interrupts an existing run, not ends it', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxParticipants: 1,
        })
        const a = element(0)
        group.add(a)
        group.capture()
        model.place(a, box(80))
        const run = group.flush()
        mc.frame(16)
        const b = element(200)
        group.add(b)
        group.capture()
        model.place(a, box(160))
        const report = await group.flush()
        expect(report.status).toBe('capped')
        await expect(run).resolves.toMatchObject({ status: 'interrupted' })
        group.dispose()
    })

    it('OPS-11: an abort reports only the affected participants, not every connected one', async () => {
        const mc = createManualClock()
        const snaps: string[] = []
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            onSnap: (element, _reason) =>
                snaps.push(element === a ? 'a' : element === b ? 'b' : '?'),
        })
        const a = element(0)
        const b = element(80)
        group.add(a)
        group.add(b)
        group.capture()
        await group.flush()
        group.capture()
        model.place(a, box(160))
        injectLayoutFault('measure')
        const report = await group.flush()
        expect(report.status).toBe('failed')
        expect(report.snapped).toEqual([{ element: a, reason: 'failed' }])
        expect(snaps).toEqual(['a'])
        group.dispose()
    })

    it('OPS-04: finish() with a write fault does not throw and restores every settled drive', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        const authored = a.style.cssText
        group.add(a)
        group.capture()
        model.place(a, box(120))
        const run = group.flush()
        mc.frame(16)
        injectLayoutFault('write')
        expect(() => group.finish()).not.toThrow()
        expect(a.style.cssText).toBe(authored)
        await expect(run).resolves.toMatchObject({ status: 'failed' })
        expect(mc.clock.size).toBe(0)
        group.dispose()
    })

    it('OPS-04: dispose() with a write fault still cleans up and unregisters', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        const authored = a.style.cssText
        group.add(a)
        group.capture()
        model.place(a, box(120))
        const run = group.flush()
        mc.frame(16)
        injectLayoutFault('write')
        expect(() => group.dispose()).not.toThrow()
        expect(a.style.cssText).toBe(authored)
        await expect(run).resolves.toMatchObject({ status: 'failed' })
        expect(mc.clock.size).toBe(0)
        expect(group.stats.tracks).toBe(0)
        await expect(group.flush()).resolves.toEqual({
            status: 'disposed',
            snapped: [],
        })
    })

    it('OPS-04: remove() and set(layoutKey) with a write fault stay non-throwing and restore', async () => {
        for (const action of ['remove', 'key'] as const) {
            const mc = createManualClock()
            const group = createLayoutGroup({ clock: mc.clock, motion })
            const a = element(0)
            const authored = a.style.cssText
            const remove = group.add(a)
            group.capture()
            model.place(a, box(120))
            const run = group.flush()
            mc.frame(16)
            injectLayoutFault('write')
            if (action === 'remove') {
                expect(() => remove()).not.toThrow()
            } else {
                expect(() => group.set(a, { layoutKey: 'next' })).not.toThrow()
            }
            expect(a.style.cssText).toBe(authored)
            await expect(run).resolves.toMatchObject({ status: 'failed' })
            expect(mc.clock.size).toBe(0)
            group.dispose()
        }
    })

    it('OPS-04: capture() adoption with a write fault does not throw and restores the adopted drive', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        const authored = a.style.cssText
        group.add(a)
        group.capture()
        model.place(a, box(120))
        const run = group.flush()
        mc.frame(16)
        const other = document.implementation.createHTMLDocument('other')
        other.adoptNode(a)
        other.body.append(a)
        injectLayoutFault('write')
        expect(() => group.capture()).not.toThrow()
        expect(a.style.cssText).toBe(authored)
        await expect(run).resolves.toMatchObject({ status: 'failed' })
        expect(mc.clock.size).toBe(0)
        group.dispose()
    })

    it('OPS-19: a maxNodes-capped flush interrupts the displaced run, not ends it', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxNodes: 1,
        })
        const a = element(0)
        const b = element(80)
        group.add(a)
        group.add(b)
        group.capture()
        await group.flush()
        group.capture()
        model.place(a, box(80))
        const run = group.flush()
        mc.frame(16)
        group.capture()
        model.place(a, box(160))
        model.place(b, box(160))
        const report = await group.flush()
        expect(report.status).toBe('capped')
        await expect(run).resolves.toMatchObject({ status: 'interrupted' })
        group.dispose()
    })

    it('flush never rejects, whatever the fault', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        group.add(a)
        group.capture()
        model.place(a, box(90))
        injectLayoutFault('measure')
        const report: LayoutReport = await group.flush()
        expect(report.status).toBe('failed')
        group.dispose()
    })
})

describe('§9.2 callback isolation', () => {
    it('an injected diagnostic-listener fault is callback-error to the others only and is rethrown asynchronously in dev', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        a.style.rotate = '10deg'
        group.add(a)
        group.capture()
        model.place(a, box(90))
        const first: LayoutDiagnostic[] = []
        const second: LayoutDiagnostic[] = []
        const stopFirst = layoutRuntime.onDiagnostic((event) => {
            // the original event must not reach this listener's seam
            if (event.code === 'callback-error') first.push(event)
        })
        const stopSecond = layoutRuntime.onDiagnostic((event) =>
            second.push(event)
        )
        stops.push(stopFirst, stopSecond)
        const error = new Error('diagnostic boom')
        injectLayoutFault('diagnostic', error)
        const thrown: unknown[] = []
        const original = globalThis.queueMicrotask
        globalThis.queueMicrotask = (task: () => void) => {
            try {
                task()
            } catch (caught) {
                thrown.push(caught)
            }
        }
        let report!: LayoutReport
        try {
            report = await group.flush()
        } finally {
            globalThis.queueMicrotask = original
        }
        expect(report.status).toBe('no-change')
        expect(first).toEqual([])
        expect(second.map((e) => e.code)).toEqual([
            'unsupported-geometry',
            'callback-error',
        ])
        expect(second[1]).toMatchObject({ action: 'none', error })
        expect(thrown).toEqual([error])
        stopFirst()
        stopSecond()
        group.dispose()
    })
})
