// @vitest-environment jsdom

// §7.2 the diagnostics stream: one payload per table row, versioned, with
// the scope, run, engine, action, element, reason and metrics.
import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { layoutRuntime } from '../runtime'
import { createLayoutGroup } from '../scope'
import type { LayoutDiagnostic, LayoutDiagnosticCode } from '../types'
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

function payload(event: LayoutDiagnostic): Record<string, unknown> {
    return {
        version: event.version,
        code: event.code,
        scope: event.scope,
        run: event.run,
        engine: event.engine,
        action: event.action,
        element: event.element,
        reason: event.reason,
        metrics: event.metrics,
    }
}

describe('§7.2 diagnostics payloads', () => {
    it('capture-less-flush: one event per reported node, with the stale reason and the run', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        group.add(a)
        group.capture()
        await group.flush()
        model.place(a, box(120))
        const { events, stop } = collect()
        const report = await group.flush()
        expect(report.status).toBe('stale')
        const event = events.find((e) => e.code === 'capture-less-flush')
        expect(event).toBeDefined()
        expect(payload(event!)).toMatchObject({
            version: 1,
            code: 'capture-less-flush',
            engine: 'raf',
            action: 'snap',
            element: a,
            reason: 'stale',
        })
        expect(typeof event!.scope).toBe('number')
        expect(typeof event!.run).toBe('number')
        expect(event!.metrics).toEqual({
            participants: 1,
            rectReads: expect.any(Number),
            styleReads: expect.any(Number),
            springSettleMs: null,
        })
        expect(event!.metrics.rectReads).toBeGreaterThanOrEqual(1)
        stop()
        group.dispose()
    })

    it('capture-aged: emitted when the marker ages a capture, and per reported node at the flush', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        group.add(a)
        group.capture()
        await group.flush()
        group.capture()
        // a rendering opportunity passes before the flush
        mc.frame()
        model.place(a, box(120))
        const { events, stop } = collect()
        const report = await group.flush()
        expect(report.status).toBe('stale')
        const aged = events.filter((e) => e.code === 'capture-aged')
        expect(aged.some((e) => e.element === a)).toBe(true)
        expect(aged.find((e) => e.element === a)!.reason).toBe('stale')
        stop()
        group.dispose()
    })

    it('a capture that begins inside a clock frame is aged with capture-aged at once', () => {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock, motion })
        const a = element(0)
        group.add(a)
        const { events, stop } = collect()
        mc.clock.read(() => group.capture())
        mc.frame()
        const event = events.find((e) => e.code === 'capture-aged')
        expect(event).toBeDefined()
        expect(event).toMatchObject({
            action: 'snap',
            run: null,
            engine: 'raf',
        })
        expect(event!.element).toBeUndefined()
        stop()
        group.dispose()
    })

    it('spring-timeout: reason unsupported and the refused settle in ms', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion: { type: 'spring', duration: 1000, bounce: 0.999 },
        })
        const a = element(0)
        group.add(a)
        group.capture()
        await group.flush()
        group.capture()
        model.place(a, box(120))
        const { events, stop } = collect()
        const report = await group.flush()
        expect(report.snapped).toEqual([{ element: a, reason: 'unsupported' }])
        const event = events.find((e) => e.code === 'spring-timeout')
        expect(event).toBeDefined()
        expect(event).toMatchObject({
            action: 'snap',
            element: a,
            reason: 'unsupported',
        })
        expect(event!.metrics.springSettleMs).toBeGreaterThan(10_000)
        stop()
        group.dispose()
    })

    it('keeps focus-in-follower in the code type without emitting it (P3b)', () => {
        const code: LayoutDiagnosticCode = 'focus-in-follower'
        expect(code).toBe('focus-in-follower')
    })
})
