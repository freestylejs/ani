// @vitest-environment jsdom

import { isAniError, timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { clearLayoutFaults, injectLayoutFault } from '../fault'
import type { Box } from '../geometry'
import { type Motion, resolveMotion } from '../motion'
import { layoutRuntime } from '../runtime'
import { createLayoutGroup } from '../scope'
import { createTrack, trackOrigin } from '../solve'
import type { LayoutDiagnostic } from '../types'

const TOL = 0.5

function place(
    element: HTMLElement,
    box: Box,
    offset: readonly [number, number] = [Math.round(box.w), Math.round(box.h)]
): void {
    const state = { box }
    element.getBoundingClientRect = () => {
        const translate = element.style.translate
            .split(' ')
            .map((part) => Number.parseFloat(part) || 0)
        const scale = (element.style.scale || '1 1')
            .split(' ')
            .map((part) => Number.parseFloat(part) || 1)
        const tx = translate[0] ?? 0
        const ty = translate[1] ?? 0
        const sx = scale[0] ?? 1
        const sy = scale[1] ?? sx
        const ox = state.box.x + state.box.w / 2
        const oy = state.box.y + state.box.h / 2
        const x = ox + tx + sx * (state.box.x - ox)
        const y = oy + ty + sy * (state.box.y - oy)
        return {
            x,
            y,
            left: x,
            top: y,
            right: x + sx * state.box.w,
            bottom: y + sy * state.box.h,
            width: sx * state.box.w,
            height: sy * state.box.h,
            toJSON: () => ({}),
        } as DOMRect
    }
    Object.defineProperty(element, 'offsetWidth', {
        configurable: true,
        value: offset[0],
    })
    Object.defineProperty(element, 'offsetHeight', {
        configurable: true,
        value: offset[1],
    })
}

function node(parent: HTMLElement, box: Box): HTMLElement {
    const element = document.createElement('div')
    element.style.cssText = `position:absolute;box-sizing:border-box;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px`
    parent.append(element)
    place(element, box)
    return element
}

const linear = {
    type: 'timing' as const,
    duration: 0.2,
    timing: timing.linear(),
}

beforeEach(() => {
    document.body.style.margin = '0'
    const real = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((elt: Element) => {
        const raw = real(elt)
        const html = elt as HTMLElement
        const w = html.offsetWidth || 100
        const h = html.offsetHeight || 40
        return new Proxy(raw, {
            get(target, prop, receiver) {
                if (prop === 'translate') return html.style.translate || 'none'
                if (prop === 'scale') return html.style.scale || 'none'
                if (prop === 'rotate') return html.style.rotate || 'none'
                if (prop === 'transform') return html.style.transform || 'none'
                if (prop === 'transformOrigin') {
                    return html.style.transformOrigin || `${w / 2}px ${h / 2}px`
                }
                if (prop === 'transitionDuration') {
                    return html.style.transitionDuration || '0s'
                }
                if (prop === 'transitionDelay') {
                    return html.style.transitionDelay || '0s'
                }
                if (prop === 'transitionProperty') {
                    return html.style.transitionProperty || 'none'
                }
                const value = Reflect.get(target, prop, receiver)
                return typeof value === 'function' ? value.bind(target) : value
            },
        })
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    clearLayoutFaults()
    layoutRuntime.setMode('animate')
    document.body.innerHTML = ''
})

function harness(options: Parameters<typeof createLayoutGroup>[0] = {}) {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:800px;height:600px;'
    document.body.append(root)
    const mc = createManualClock()
    const group = createLayoutGroup({ ...options, clock: mc.clock })
    const removes: (() => void)[] = []
    return {
        root,
        mc,
        group,
        add(element: HTMLElement, layoutOptions = {}) {
            removes.push(group.add(element, layoutOptions))
        },
        dispose() {
            for (const remove of removes) remove()
            group.dispose()
            root.remove()
        },
    }
}

function invalid(action: () => void, label: string): void {
    try {
        action()
    } catch (error) {
        expect(isAniError(error), label).toBe(true)
        expect((error as { code?: string }).code, label).toBe(
            'ANI_INVALID_OPTIONS'
        )
        return
    }
    throw new Error(`${label}: did not throw ANI_INVALID_OPTIONS`)
}

describe('D1: public drive surface and take preconditions (§5.10)', () => {
    it('take on an unregistered element throws without state change', async () => {
        const h = harness({ motion: linear })
        const outside = document.createElement('div')
        document.body.append(outside)
        place(outside, { x: 0, y: 0, w: 20, h: 20 })
        invalid(() => h.group.take(outside), 'unregistered')
        expect(h.group.stats.holds).toBe(0)
        expect(outside.style.cssText).toBe('')
        h.dispose()
        outside.remove()
    })

    it('take on a disconnected registered element throws', async () => {
        const h = harness({ motion: linear })
        const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
        h.add(a)
        h.group.capture()
        await h.group.flush()
        a.remove()
        invalid(() => h.group.take(a), 'disconnected')
        h.dispose()
    })

    it('take on a registered element adopted into another document throws', async () => {
        const h = harness({ motion: linear })
        const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
        h.add(a)
        h.group.capture()
        await h.group.flush()
        const other = document.implementation.createHTMLDocument('adopt')
        other.body.append(other.adoptNode(a))
        invalid(() => h.group.take(a), 'adopted document')
        h.dispose()
    })

    it('take in a second document throws', async () => {
        const h = harness({ motion: linear })
        const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
        h.add(a)
        h.group.capture()
        await h.group.flush()
        const other = document.implementation.createHTMLDocument('other')
        const foreign = other.createElement('div')
        other.body.append(foreign)
        invalid(() => h.group.take(foreign), 'foreign document')
        h.dispose()
    })

    it('take on the waapi engine throws', async () => {
        const h = harness({ motion: linear, engine: 'waapi' })
        const a = node(h.root, {
            x: 0,
            y: 0,
            w: 80,
            h: 80,
        })
        h.add(a, { layout: 'position' })
        h.group.capture()
        await h.group.flush()
        invalid(() => h.group.take(a), 'waapi')
        h.dispose()
    })

    it('P4-C5: take under runtime snap on a WAAPI group returns an invalidated handle', async () => {
        const h = harness({ motion: linear, engine: 'waapi' })
        const events: LayoutDiagnostic[] = []
        const stop = layoutRuntime.onDiagnostic((e) => events.push(e))
        const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
        h.add(a, { layout: 'position' })
        h.group.capture()
        await h.group.flush()
        layoutRuntime.setMode('snap')
        const handle = h.group.take(a)
        expect(handle.state).toBe('invalidated')
        expect(
            events.some((e) => e.code === 'runtime-disabled' && e.element === a)
        ).toBe(true)
        layoutRuntime.setMode('animate')
        stop()
        h.dispose()
    })

    it('take under runtime snap returns an invalidated handle and emits runtime-disabled', async () => {
        const h = harness({ motion: linear })
        const events: LayoutDiagnostic[] = []
        const stop = layoutRuntime.onDiagnostic((e) => events.push(e))
        const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
        h.add(a)
        h.group.capture()
        await h.group.flush()
        layoutRuntime.setMode('snap')
        const handle = h.group.take(a)
        expect(handle.state).toBe('invalidated')
        expect(h.group.stats.holds).toBe(0)
        expect(a.style.translate).toBe('')
        expect(
            events.some(
                (e) => e.code === 'runtime-disabled' && e.action === 'snap'
            )
        ).toBe(true)
        handle.move({ x: 10, y: 10 })
        handle.release()
        handle.cancel()
        expect(handle.state).toBe('invalidated')
        stop()
        layoutRuntime.setMode('animate')
        h.dispose()
    })

    it('take twice, held ancestor and held descendant throw; siblings may be held at once', async () => {
        const h = harness({ motion: linear })
        const parent = node(h.root, { x: 0, y: 0, w: 300, h: 300 })
        const child = node(h.root, { x: 10, y: 10, w: 80, h: 80 })
        const other = node(h.root, { x: 400, y: 0, w: 80, h: 80 })
        parent.append(child)
        place(parent, { x: 0, y: 0, w: 300, h: 300 })
        place(child, { x: 10, y: 10, w: 80, h: 80 })
        h.add(parent)
        h.add(child)
        h.add(other)
        h.group.capture()
        await h.group.flush()
        const first = h.group.take(parent)
        expect(first.state).toBe('held')
        expect(h.group.stats.holds).toBe(1)
        invalid(() => h.group.take(parent), 'already held')
        invalid(() => h.group.take(child), 'held ancestor')
        const sibling = h.group.take(other)
        expect(sibling.state).toBe('held')
        expect(h.group.stats.holds).toBe(2)
        first.cancel()
        sibling.cancel()
        expect(h.group.stats.holds).toBe(0)
        h.dispose()
    })

    it('non-finite move and release throw before any state change; terminal calls are idempotent', async () => {
        const h = harness({ motion: linear })
        const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
        h.add(a)
        h.group.capture()
        await h.group.flush()
        const handle = h.group.take(a)
        expect(handle.velocity).toEqual({ x: 0, y: 0 })
        invalid(() => handle.move({ x: Number.NaN, y: 0 }), 'NaN move')
        invalid(
            () => handle.release({ x: 0, y: Number.POSITIVE_INFINITY }),
            'infinite release'
        )
        expect(handle.state).toBe('held')
        handle.move({ x: 10, y: 20 })
        handle.release({ x: 0, y: 0 })
        expect(handle.state).toBe('released')
        handle.release()
        handle.cancel()
        expect(handle.state).toBe('released')
        handle.move({ x: 1, y: 1 })
        h.mc.frames(3)
        h.dispose()
    })

    it('a held read counts one rect per frame and stops after invalidation on removal', async () => {
        const h = harness({ motion: linear })
        const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
        h.add(a)
        h.group.capture()
        await h.group.flush()
        const before = h.group.stats.rects
        const handle = h.group.take(a)
        const readsAtTake = h.group.stats.rects - before
        expect(readsAtTake).toBe(1)
        expect(h.group.stats.holds).toBe(1)
        const frameReads = h.group.stats.rects
        h.mc.frames(4)
        const reads = h.group.stats.rects - frameReads
        expect(reads).toBe(4)
        a.remove()
        const detachedReads = h.group.stats.rects
        h.mc.frames(3)
        // the read sees the disconnection, invalidates, and stops reading
        expect(handle.state).toBe('invalidated')
        expect(h.group.stats.rects - detachedReads).toBeLessThanOrEqual(1)
        expect(h.group.stats.holds).toBe(0)
        h.dispose()
    })

    it('dispose, finish, layoutKey and the kill switch invalidate a hold and restore its styles', async () => {
        for (const path of ['dispose', 'finish', 'key', 'snap'] as const) {
            const h = harness({ motion: linear })
            const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
            h.add(a, { layoutKey: 'a' })
            h.group.capture()
            await h.group.flush()
            const authored = a.style.cssText
            const handle = h.group.take(a)
            h.mc.frames(2)
            handle.move({ x: 20, y: 10 })
            h.mc.frame(16)
            if (path === 'dispose') h.group.dispose()
            else if (path === 'finish') h.group.finish()
            else if (path === 'key') {
                h.group.set(a, { layoutKey: 'b' })
                h.group.capture()
                await h.group.flush()
            } else {
                layoutRuntime.setMode('snap')
                layoutRuntime.setMode('animate')
            }
            expect(handle.state, path).toBe('invalidated')
            expect(h.group.stats.holds, path).toBe(0)
            expect(a.style.translate, path).toBe('')
            expect(a.style.scale, path).toBe('')
            expect(a.style.cssText, path).toBe(authored)
            h.dispose()
        }
    })

    it('J-001: released/cancelled landings are invalidated by snap and abort', async () => {
        for (const landing of ['released', 'cancelled'] as const) {
            for (const cause of ['snap', 'abort'] as const) {
                const h = harness({
                    motion: { ...linear, duration: 0.3 },
                })
                const events: LayoutDiagnostic[] = []
                const stop = layoutRuntime.onDiagnostic((e) => events.push(e))
                const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
                h.add(a, {
                    radius: false,
                    layoutId: `j001-unit-${landing}-${cause}`,
                })
                h.group.capture()
                await h.group.flush()
                const authored = a.style.cssText
                const handle = h.group.take(a)
                handle.move({ x: 40, y: 20 })
                h.mc.frame(16)
                await Promise.resolve()
                if (landing === 'released') handle.release({ x: 100, y: 0 })
                else handle.cancel()
                h.mc.frame(16)
                await Promise.resolve()
                expect(handle.state, `${landing}/${cause}: live`).toBe(landing)
                expect(
                    h.group.stats.holds,
                    `${landing}/${cause}: live hold`
                ).toBe(1)

                if (cause === 'snap') {
                    layoutRuntime.setMode('snap')
                } else {
                    injectLayoutFault(
                        'write',
                        new Error(`${landing}/${cause}: unit abort`)
                    )
                    h.mc.frame(16)
                    await Promise.resolve()
                }

                expect(handle.state, `${landing}/${cause}: invalidated`).toBe(
                    'invalidated'
                )
                expect(h.group.stats.holds, `${landing}/${cause}: holds`).toBe(
                    0
                )
                expect(a.style.cssText, `${landing}/${cause}: restored`).toBe(
                    authored
                )
                expect(h.mc.clock.size, `${landing}/${cause}: clock`).toBe(0)
                expect(
                    events.some(
                        (e) =>
                            e.code ===
                            (cause === 'snap'
                                ? 'runtime-disabled'
                                : 'internal-error')
                    ),
                    `${landing}/${cause}: diagnostic`
                ).toBe(true)
                clearLayoutFaults()
                layoutRuntime.setMode('animate')
                stop()
                h.dispose()
            }
        }
    })
})

describe('D2: take point, velocity and the first release frame (§5.10, §4.5)', () => {
    it('a caught moving card exposes its analytic origin velocity and has no jump', async () => {
        const h = harness({ motion: { ...linear, duration: 0.5 } })
        const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
        h.add(a)
        h.group.capture()
        await h.group.flush()
        h.group.capture()
        place(a, { x: 200, y: 0, w: 80, h: 80 })
        a.style.left = '200px'
        const run = h.group.flush()
        h.mc.frame(16)
        h.mc.frame(16)
        const handle = h.group.take(a)
        // linear 200 px over 0.5 s: 400 px/s, moving in +x
        expect(handle.velocity.x).toBeGreaterThan(300)
        expect(handle.velocity.x).toBeLessThan(500)
        expect(Math.abs(handle.velocity.y)).toBeLessThan(TOL)
        handle.cancel()
        h.mc.frames(60)
        await run
        expect(h.group.stats.holds).toBe(0)
        expect(a.style.translate).toBe('')
        h.dispose()
    })

    it('release starts from rest timing-wise and advances on the second frame', async () => {
        const h = harness({ motion: { ...linear, duration: 0.2 } })
        const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
        h.add(a)
        h.group.capture()
        await h.group.flush()
        const handle = h.group.take(a)
        handle.move({ x: 40, y: 0 })
        h.mc.frame(16)
        const held = a.style.translate
        handle.release({ x: 0, y: 0 })
        h.mc.frame(16)
        expect(a.style.translate).toBe(held)
        h.mc.frame(16)
        expect(a.style.translate).not.toBe(held)
        h.mc.frames(30)
        expect(a.style.translate).toBe('')
        expect(a.style.scale).toBe('')
        h.dispose()
    })
})

describe('D3: release velocity is the track seed, exactly once (§5.2, §5.3, §5.10)', () => {
    function derivative(track: ReturnType<typeof createTrack>): {
        x: number
        y: number
    } {
        if (typeof track === 'string') throw new Error(track)
        const eps = 1e-6
        const a = trackOrigin(track, 0)
        const b = trackOrigin(track, eps)
        return { x: (b.x - a.x) / eps, y: (b.y - a.y) / eps }
    }

    it('a timing release has c′(0) = v and starts at the held origin', () => {
        const motion: Motion = resolveMotion([
            { type: 'timing', duration: 0.3, timing: timing.linear() },
        ])
        const before = { x: 40, y: 120, w: 80, h: 80 }
        const after = { x: 0, y: 120, w: 80, h: 80 }
        const track = createTrack(
            before,
            after,
            { x: 1000, y: -200, w: 0, h: 0 },
            0.5,
            0.5,
            true,
            motion,
            null
        )
        expect(typeof track).not.toBe('string')
        const start = trackOrigin(track as never, 0)
        expect(Math.abs(start.x - 80)).toBeLessThan(1e-9)
        expect(Math.abs(start.y - 160)).toBeLessThan(1e-9)
        const v = derivative(track)
        expect(Math.abs(v.x - 1000)).toBeLessThan(0.1)
        expect(Math.abs(v.y + 200)).toBeLessThan(0.1)
    })

    it('a spring release has d′(0) = v0 and the same start', () => {
        const motion: Motion = resolveMotion([
            { type: 'spring', duration: 0.5, bounce: 0 },
        ])
        const before = { x: 40, y: 120, w: 80, h: 80 }
        const after = { x: 0, y: 120, w: 80, h: 80 }
        const track = createTrack(
            before,
            after,
            { x: 600, y: 0, w: 0, h: 0 },
            0.5,
            0.5,
            true,
            motion,
            null
        )
        if (typeof track === 'string') throw new Error(track)
        const v = derivative(track)
        expect(Math.abs(v.x - 600)).toBeLessThan(0.1)
        expect(Math.abs(v.y)).toBeLessThan(0.1)
    })
})

describe('D4: adoption invalidates a hold (§4.6, §5.10)', () => {
    it('an adopted held element is invalidated and its styles restored', async () => {
        const h = harness({ motion: linear })
        const a = node(h.root, { x: 0, y: 0, w: 80, h: 80 })
        h.add(a)
        h.group.capture()
        await h.group.flush()
        const handle = h.group.take(a)
        handle.move({ x: 20, y: 10 })
        h.mc.frame(16)
        const other = document.implementation.createHTMLDocument('other')
        other.body.append(other.adoptNode(a))
        h.group.capture()
        await h.group.flush()
        expect(handle.state).toBe('invalidated')
        expect(a.style.translate).toBe('')
        expect(a.style.scale).toBe('')
        expect(h.group.stats.holds).toBe(0)
        h.dispose()
    })
})
