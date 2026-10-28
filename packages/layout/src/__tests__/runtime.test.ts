// @vitest-environment jsdom

// §7.2 runtime, kill switch and diagnostics; §9.2 callback isolation.
import { isAniError, timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import {
    hasDiagnosticListeners,
    type LayoutDiagnosticListener,
    layoutRuntime,
} from '../runtime'
import { createLayoutGroup } from '../scope'
import type { LayoutDiagnostic, LayoutReport } from '../types'
import { createRectModel, type RectModel } from './rect_model'

const motion = { duration: 0.2, timing: timing.linear() }

let model: RectModel
const stops: (() => void)[] = []

beforeEach(() => {
    model = createRectModel()
    layoutRuntime.setMode('animate')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
    for (const stop of stops.splice(0)) stop()
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

/** Runs the queued microtasks now and records what they throw. */
function captureAsyncThrows<T>(work: () => T): { value: T; thrown: unknown[] } {
    const thrown: unknown[] = []
    const original = globalThis.queueMicrotask
    globalThis.queueMicrotask = (task: () => void) => {
        try {
            task()
        } catch (error) {
            thrown.push(error)
        }
    }
    try {
        return { value: work(), thrown }
    } finally {
        globalThis.queueMicrotask = original
    }
}

async function startRun(
    group: ReturnType<typeof createLayoutGroup>,
    mc: ReturnType<typeof createManualClock>,
    a: HTMLElement
): Promise<{ value: LayoutReport | null }> {
    group.capture()
    model.place(a, box(120))
    const run = group.flush()
    const holder: { value: LayoutReport | null } = {
        value: null,
    }
    void run.then((r) => {
        holder.value = r
    })
    mc.frames(2)
    expect(group.stats.tracks).toBe(1)
    return holder
}

describe('§7.2 layoutRuntime', () => {
    it('starts in animate mode; setMode validates and toggles synchronously', () => {
        expect(layoutRuntime.mode).toBe('animate')
        layoutRuntime.setMode('snap')
        expect(layoutRuntime.mode).toBe('snap')
        layoutRuntime.setMode('animate')
        expect(layoutRuntime.mode).toBe('animate')
        expect(() => layoutRuntime.setMode('pause' as never)).toThrowError(
            /ANI_INVALID_OPTIONS|setMode/
        )
        try {
            layoutRuntime.setMode('pause' as never)
        } catch (error) {
            expect(isAniError(error)).toBe(true)
        }
        expect(layoutRuntime.mode).toBe('animate')
    })

    it('mid-run: live tracks finish at identity, styles restore byte-identically, the report resolves disabled and the clock empties', async () => {
        const snapped: string[] = []
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            onSnap: (_element, reason) => snapped.push(reason),
        })
        const a = element(0)
        const b = element(100)
        group.add(a)
        group.add(b)
        const authored = a.style.cssText
        group.capture()
        await group.flush()
        const run = await startRun(group, mc, a)
        const { events, stop } = collect()
        expect(a.style.translate).not.toBe('')
        layoutRuntime.setMode('snap')
        // every effect is synchronous
        expect(a.style.cssText).toBe(authored)
        expect(group.stats.tracks).toBe(0)
        expect(mc.clock.size).toBe(0)
        expect(snapped).toEqual(['disabled'])
        await Promise.resolve()
        expect(run.value).toEqual({
            status: 'disabled',
            snapped: [{ element: a, reason: 'disabled' }],
        })
        const disabled = events.filter((e) => e.code === 'runtime-disabled')
        expect(disabled).toHaveLength(1)
        expect(disabled[0]).toMatchObject({
            version: 1,
            action: 'snap',
            reason: 'disabled',
            engine: 'raf',
        })
        expect(typeof disabled[0]!.scope).toBe('number')
        expect(typeof disabled[0]!.run).toBe('number')
        stop()
        group.dispose()
    })

    it("later movers under 'snap' report runtime-disabled and 'disabled'; setMode('animate') plans again from the next flush", async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        group.add(a)
        const authored = a.style.cssText
        group.capture()
        await group.flush()
        const { events, stop } = collect()
        layoutRuntime.setMode('snap')
        group.capture()
        model.place(a, box(140))
        const off = await group.flush()
        expect(off.status).toBe('disabled')
        expect(off.snapped).toEqual([{ element: a, reason: 'disabled' }])
        expect(a.style.cssText).toBe(authored)
        expect(group.stats.tracks).toBe(0)
        expect(mc.clock.size).toBe(0)
        expect(events.map((e) => e.code)).toContain('runtime-disabled')

        layoutRuntime.setMode('animate')
        group.capture()
        model.place(a, box(220))
        const on = group.flush()
        expect(group.stats.tracks).toBe(1)
        expect(mc.clock.size).toBe(1)
        group.finish()
        await expect(on).resolves.toMatchObject({ status: 'ended' })
        stop()
        group.dispose()
    })

    it('onDiagnostic unsubscribes; no payload is built without a listener', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        group.add(a)
        group.capture()
        await group.flush()
        expect(hasDiagnosticListeners()).toBe(false)
        const { events, stop } = collect()
        expect(hasDiagnosticListeners()).toBe(true)
        group.capture()
        model.place(a, box(80))
        const run = group.flush()
        group.finish()
        await run
        expect(events).toHaveLength(0)
        stop()
        expect(hasDiagnosticListeners()).toBe(false)
        model.place(a, box(160))
        await group.flush()
        group.dispose()
    })

    it('a throwing listener is reported callback-error to the others only, never recursively, and rethrown asynchronously in dev', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        a.style.rotate = '10deg'
        group.add(a)
        group.capture()
        model.place(a, box(90))
        const error = new Error('listener boom')
        const first: LayoutDiagnostic[] = []
        const second: LayoutDiagnostic[] = []
        const stopFirst = layoutRuntime.onDiagnostic((event) => {
            first.push(event)
            if (event.code === 'unsupported-geometry') throw error
        })
        const stopSecond: LayoutDiagnosticListener = (event) =>
            second.push(event)
        const stopSecondHandle = layoutRuntime.onDiagnostic(stopSecond)
        stops.push(stopFirst, stopSecondHandle)
        const { value: run, thrown } = captureAsyncThrows(() => group.flush())
        const report = await run
        expect(report.snapped).toEqual([{ element: a, reason: 'unsupported' }])
        expect(first.map((e) => e.code)).toEqual(['unsupported-geometry'])
        expect(second.map((e) => e.code)).toEqual([
            'unsupported-geometry',
            'callback-error',
        ])
        expect(second[1]).toMatchObject({
            action: 'none',
            element: a,
            error,
        })
        expect(thrown).toEqual([error])
        stopFirst()
        stopSecondHandle()
        group.dispose()
    })

    it('a listener that throws on callback-error is only rethrown asynchronously, never recursively', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        a.style.rotate = '10deg'
        group.add(a)
        group.capture()
        model.place(a, box(90))
        const first = new Error('first boom')
        const nested = new Error('callback-error boom')
        const seen: string[] = []
        const stopFirst = layoutRuntime.onDiagnostic((event) => {
            if (event.code === 'unsupported-geometry') throw first
        })
        const stopSecond = layoutRuntime.onDiagnostic((event) => {
            seen.push(event.code)
            if (event.code === 'callback-error') throw nested
        })
        stops.push(stopFirst, stopSecond)
        const { value: run, thrown } = captureAsyncThrows(() => group.flush())
        await run
        expect(seen).toEqual(['unsupported-geometry', 'callback-error'])
        expect(thrown).toEqual([nested, first])
    })

    it('a throwing onSnap still calls the other snaps and never changes the run', async () => {
        const mc = createManualClock()
        let calls = 0
        const error = new Error('snap boom')
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            onSnap: () => {
                calls += 1
                if (calls === 1) throw error
            },
        })
        const a = element(0)
        const b = element(80)
        a.style.rotate = '10deg'
        b.style.rotate = '10deg'
        group.add(a)
        group.add(b)
        group.capture()
        model.place(a, box(60))
        model.place(b, box(140))
        const { events, stop } = collect()
        const { value: run, thrown } = captureAsyncThrows(() => group.flush())
        const report = await run
        expect(report.status).toBe('no-change')
        expect(report.snapped.map((s) => s.reason)).toEqual([
            'unsupported',
            'unsupported',
        ])
        expect(calls).toBe(2)
        expect(a.style.translate).toBe('')
        expect(b.style.translate).toBe('')
        expect(events.map((e) => e.code)).toContain('callback-error')
        expect(events.find((e) => e.code === 'callback-error')).toMatchObject({
            element: a,
            error,
        })
        expect(thrown).toEqual([error])
        stop()
        group.dispose()
    })
})
