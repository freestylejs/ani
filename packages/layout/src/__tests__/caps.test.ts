// @vitest-environment jsdom

// §4.1, §9.1 participants: maxParticipants reads nothing over the cap;
// maxNodes emits mover-cap; both options validate with ANI_INVALID_OPTIONS.
import { isAniError, timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { resolveLayoutStatus } from '../plan'
import { layoutRuntime } from '../runtime'
import { createLayoutGroup } from '../scope'
import type { LayoutDiagnostic } from '../types'
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

function errorCode(fn: () => void): string {
    try {
        fn()
    } catch (error) {
        return isAniError(error) ? error.code : String(error)
    }
    return 'no error'
}

describe('§4.1/§9.1 maxParticipants', () => {
    it('over the cap: capture and flush read nothing, the whole flush snaps capped, and stats prove it', async () => {
        const mc = createManualClock()
        const snaps: string[] = []
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxParticipants: 2,
            onSnap: (_element, reason) => snaps.push(reason),
        })
        const a = element(0)
        const b = element(60)
        const c = element(120)
        for (const e of [a, b, c]) group.add(e)
        model.reset()
        group.capture()
        expect(model.reads.rects).toBe(0)
        expect(model.reads.offsets).toBe(0)
        expect(model.reads.styles).toBe(0)
        const captures = group.stats.captures
        expect(captures).toBe(1)

        for (const e of [a, b, c]) model.place(e, box(e === a ? 40 : 160))
        model.reset()
        const rects = group.stats.rects
        const styles = group.stats.styles
        const r = await group.flush()
        expect(r.status).toBe('capped')
        expect(r.snapped.map((s) => [s.element, s.reason])).toEqual([
            [a, 'capped'],
            [b, 'capped'],
            [c, 'capped'],
        ])
        expect(group.stats.rects).toBe(rects)
        expect(group.stats.styles).toBe(styles)
        expect(model.reads.rects).toBe(0)
        expect(model.reads.offsets).toBe(0)
        expect(model.reads.styles).toBe(0)
        expect(mc.clock.size).toBe(0)
        expect(group.stats.tracks).toBe(0)
        expect(snaps).toEqual(['capped', 'capped', 'capped'])
        group.dispose()
    })

    it('counts only connected participants; under the cap the capture reads', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxParticipants: 2,
        })
        const a = element(0)
        const b = element(60)
        const c = element(120)
        for (const e of [a, b, c]) group.add(e)
        c.remove()
        model.reset()
        group.capture()
        expect(model.reads.rects).toBe(2)
        expect(model.reads.offsets).toBe(2)
        group.dispose()
    })

    it('a late mount over the cap is not read; the flush caps with zero reads', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxParticipants: 1,
        })
        const a = element(0)
        const b = element(100)
        group.add(a)
        group.capture()
        group.add(b)
        const captureAdded = (
            group as unknown as Record<symbol, (element: HTMLElement) => void>
        )[Symbol.for('ani-layout.capture-added')]!
        const rects = group.stats.rects
        model.reset()
        captureAdded(b)
        expect(model.reads.rects).toBe(0)
        expect(group.stats.rects).toBe(rects)

        const { events, stop } = collect()
        model.place(a, box(40))
        model.place(b, box(140))
        model.reset()
        const r = await group.flush()
        expect(r.status).toBe('capped')
        expect(r.snapped).toEqual([
            { element: a, reason: 'capped' },
            { element: b, reason: 'capped' },
        ])
        expect(model.reads.rects).toBe(0)
        expect(group.stats.rects).toBe(rects)
        const cap = events.find((event) => event.code === 'participant-cap')
        expect(cap?.metrics.rectReads).toBe(0)
        stop()
        group.dispose()
    })

    it('emits participant-cap once, with a stable scope id and a versioned payload', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxParticipants: 1,
        })
        const a = element(0)
        const b = element(60)
        group.add(a)
        group.add(b)
        const { events, stop } = collect()
        model.place(a, box(40))
        model.place(b, box(120))
        const r = await group.flush()
        expect(r.status).toBe('capped')
        const caps = events.filter((e) => e.code === 'participant-cap')
        expect(caps).toHaveLength(1)
        expect(caps[0]).toMatchObject({
            version: 1,
            action: 'snap',
            engine: 'raf',
        })
        expect(typeof caps[0]!.scope).toBe('number')
        expect(typeof caps[0]!.run).toBe('number')
        expect(caps[0]!.metrics).toEqual({
            participants: 2,
            rectReads: 0,
            styleReads: 0,
            springSettleMs: null,
        })
        stop()
        group.dispose()
    })

    it('over the cap with the kill switch on: disabled precedes capped (§9.3)', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxParticipants: 1,
        })
        const a = element(0)
        const b = element(60)
        group.add(a)
        group.add(b)
        const { events, stop } = collect()
        layoutRuntime.setMode('snap')
        model.place(a, box(40))
        model.place(b, box(120))
        model.reset()
        const r = await group.flush()
        expect(r.status).toBe('disabled')
        expect(r.snapped.map((s) => s.reason)).toEqual(['disabled', 'disabled'])
        expect(model.reads.rects).toBe(0)
        expect(model.reads.styles).toBe(0)
        expect(events.map((e) => e.code)).toEqual(['runtime-disabled'])
        expect(resolveLayoutStatus(['capped', 'disabled'])).toBe('disabled')
        stop()
        group.dispose()
    })
})

describe('§9.1 maxNodes', () => {
    it('the kill switch wins over the mover cap: only runtime-disabled', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxNodes: 0,
        })
        const a = element(0)
        group.add(a)
        group.capture()
        model.place(a, box(40))
        const { events, stop } = collect()
        layoutRuntime.setMode('snap')
        const r = await group.flush()
        expect(r.status).toBe('disabled')
        expect(r.snapped.map((s) => s.reason)).toEqual(['disabled'])
        expect(events.map((e) => e.code)).toEqual(['runtime-disabled'])
        expect(events[0]).toMatchObject({
            action: 'snap',
            element: a,
            reason: 'disabled',
        })
        stop()
        group.dispose()
    })

    it('a capped capture stays latched: a smaller flush still reads nothing and snaps capped', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxParticipants: 1,
        })
        const a = element(0)
        const b = element(100)
        group.add(a)
        group.add(b)
        group.capture()
        expect(model.reads.rects).toBe(0)
        b.remove()
        model.place(a, box(120))
        model.reset()
        const { events, stop } = collect()
        const rects = group.stats.rects
        const styles = group.stats.styles
        const r = await group.flush()
        expect(r.status).toBe('capped')
        expect(r.snapped).toEqual([{ element: a, reason: 'capped' }])
        expect(group.stats.rects).toBe(rects)
        expect(group.stats.styles).toBe(styles)
        expect(model.reads.rects).toBe(0)
        expect(events.map((e) => e.code)).toEqual(['participant-cap'])
        expect(events[0]!.element).toBeUndefined()
        expect(events[0]!.metrics.rectReads).toBe(0)
        stop()
        group.dispose()
    })

    it('emits mover-cap when visible movers exceed maxNodes', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxNodes: 1,
        })
        const a = element(0)
        const b = element(60)
        group.add(a)
        group.add(b)
        group.capture()
        model.place(a, box(40))
        model.place(b, box(160))
        const { events, stop } = collect()
        const r = await group.flush()
        expect(r.status).toBe('capped')
        expect(r.snapped.map((s) => s.reason)).toEqual(['capped', 'capped'])
        expect(events.filter((e) => e.code === 'mover-cap')).toHaveLength(1)
        expect(mc.clock.size).toBe(0)
        stop()
        group.dispose()
    })

    it('the kill switch takes precedence over the mover cap, without duplicate entries', async () => {
        const mc = createManualClock()
        const group = createLayoutGroup({
            clock: mc.clock,
            motion,
            maxNodes: 0,
        })
        const a = element(0)
        group.add(a)
        group.capture()
        model.place(a, box(40))
        const { events, stop } = collect()
        layoutRuntime.setMode('snap')
        const r = await group.flush()
        expect(r.status).toBe('disabled')
        expect(r.snapped.map((s) => [s.element, s.reason])).toEqual([
            [a, 'disabled'],
        ])
        const codes = events.map((e) => e.code)
        expect(codes.filter((c) => c === 'runtime-disabled')).toHaveLength(1)
        stop()
        group.dispose()
    })
})

describe('option validation', () => {
    it('maxParticipants throws ANI_INVALID_OPTIONS outside the integer range', () => {
        for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(
                errorCode(() => createLayoutGroup({ maxParticipants: value })),
                `maxParticipants ${String(value)}`
            ).toBe('ANI_INVALID_OPTIONS')
        }
        expect(
            errorCode(() =>
                createLayoutGroup({
                    maxParticipants: '2000' as unknown as number,
                })
            )
        ).toBe('ANI_INVALID_OPTIONS')
        createLayoutGroup({ maxParticipants: 0 }).dispose()
        createLayoutGroup({ maxParticipants: 2000 }).dispose()
    })
})
