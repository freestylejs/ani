// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import {
    type RafAniTimeline,
    type RafGroup,
    rafGroup,
    rafTimeline,
} from '@freestylejs/ani-core'
import type { Action, ActionReturn } from 'svelte/action'
import { writable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackListeners } from '../../../../core/src/__tests__/integration/harness'
import { createManualClock } from '../../../../core/src/testing'
import { useAniGroup, useAniRef } from '../../index'

const scope = vi.hoisted(() => ({ destroyers: [] as Array<() => void> }))
const bypass = vi.hoisted(() => ({
    applyStyleSheet: vi.fn(),
    createTimelineController: vi.fn(),
    EventManager: vi.fn(),
}))

vi.mock('svelte', async (importOriginal) => ({
    ...(await importOriginal<typeof import('svelte')>()),
    onDestroy: (callback: () => void) => {
        scope.destroyers.push(callback)
    },
}))

// Pass-through spies: the binding must style through `bind` / `bindAt` only.
vi.mock('@freestylejs/ani-core', async (importOriginal) => {
    const original =
        await importOriginal<typeof import('@freestylejs/ani-core')>()
    return {
        ...original,
        applyStyleSheet: (
            ...args: Parameters<typeof original.applyStyleSheet>
        ) => {
            bypass.applyStyleSheet()
            return original.applyStyleSheet(...args)
        },
        createTimelineController: (
            ...args: Parameters<typeof original.createTimelineController>
        ) => {
            bypass.createTimelineController()
            return original.createTimelineController(...args)
        },
        EventManager: new Proxy(original.EventManager, {
            construct(target, args, newTarget) {
                bypass.EventManager()
                return Reflect.construct(target, args, newTarget)
            },
        }),
    }
})

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })
const clockOf = () => createManualClock({ lagThreshold: Infinity })
const makeEl = () => {
    const el = document.createElement('div')
    el.setAttribute('data-ani', '')
    document.body.appendChild(el)
    return el
}
const tracked = (el: EventTarget) =>
    el instanceof HTMLElement && el.hasAttribute('data-ani')

const mount = (action: Action<HTMLElement>, el: HTMLElement) => {
    const result = action(el) as ActionReturn | undefined
    return { destroy: () => result?.destroy?.() }
}
const mountAt = (
    action: Action<HTMLElement, number>,
    el: HTMLElement,
    index: number
) => {
    const result = action(el, index) as ActionReturn<number> | undefined
    return {
        update: (next: number) => result?.update?.(next),
        destroy: () => result?.destroy?.(),
    }
}

/** `"a: 1; b: 2"` as a record, whatever the order. */
const declarations = (style: string | undefined) =>
    Object.fromEntries(
        (style ?? '')
            .split(';')
            .map((part) => part.trim())
            .filter((part) => part !== '')
            .map((part) => {
                const at = part.indexOf(':')
                return [part.slice(0, at).trim(), part.slice(at + 1).trim()]
            })
    )

const opacityOf = (el: HTMLElement) => Number(el.style.opacity)

describe('FSVELTE: useAniRef', () => {
    beforeEach(() => {
        scope.destroyers.length = 0
        bypass.applyStyleSheet.mockClear()
        bypass.createTimelineController.mockClear()
        bypass.EventManager.mockClear()
    })
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('R1: returns { action, style } (the legacy tuple is gone)', () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const result = useAniRef(timeline)
        expect(Array.isArray(result)).toBe(false)
        expect(typeof result.action).toBe('function')
        expect(result.style).toBeUndefined()
        expect('style' in result).toBe(true)
    })

    it('R2: style is a CSS declaration string made from initialValue', () => {
        const m = clockOf()
        const timeline = rafTimeline(
            a.ani({
                to: { translateX: 100, opacity: 1 },
                duration: 1,
                timing: a.timing.linear(),
            }),
            { clock: m.clock }
        )
        const { style } = useAniRef(timeline, {
            initialValue: { translateX: 0, opacity: 0 },
        })
        expect(typeof style).toBe('string')
        expect(declarations(style)).toEqual({
            transform: 'translateX(0px)',
            opacity: '0',
        })
        expect(String(style)).toContain('transform: translateX(0px)')
        expect(String(style)).toContain('opacity: 0')
        expect(String(style)).not.toContain('{')
    })

    it('R3: a single declaration is exactly "name: value"', () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        expect(
            useAniRef(timeline, { initialValue: { opacity: 0.25 } }).style
        ).toBe('opacity: 0.25')
    })

    it('R4: camelCase properties are written as CSS property names', () => {
        const m = clockOf()
        const timeline = rafTimeline(
            a.ani({
                to: { marginTop: 10, borderRadius: 8 },
                duration: 1,
                timing: a.timing.linear(),
            }),
            { clock: m.clock }
        )
        const { style } = useAniRef(timeline, {
            initialValue: { marginTop: 4, borderRadius: 2 },
        })
        expect(declarations(style)).toEqual({
            'margin-top': '4px',
            'border-radius': '2px',
        })
    })

    it('R5: the resolver shapes the style string (custom properties included)', () => {
        const m = clockOf()
        const timeline = rafTimeline(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() }),
            { clock: m.clock }
        )
        const { style } = useAniRef(timeline, {
            initialValue: { x: 5 },
            resolver: { x: (v: number) => ({ key: '--x', value: `${v}px` }) },
        })
        expect(declarations(style)).toEqual({ '--x': '5px' })
    })

    it('R6: the action binds on mount and the element follows the frames', () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const { action } = useAniRef(timeline, { initialValue: { opacity: 0 } })
        const el = makeEl()
        const binding = mount(action, el)
        timeline.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(opacityOf(el)).toBeCloseTo(0.5, 5)
        m.frames(5, 100)
        expect(opacityOf(el)).toBeCloseTo(1, 5)
        binding.destroy()
    })

    it('R7: mounting on a timeline that already has a value writes it at once', () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        timeline.play({ from: { opacity: 0.6 } })
        const { action } = useAniRef(timeline, { initialValue: { opacity: 0 } })
        const el = makeEl()
        const binding = mount(action, el)
        expect(el.style.opacity).toBe('0.6')
        binding.destroy()
    })

    it('R8: the resolver option decides what is written to the element', () => {
        const m = clockOf()
        const timeline = rafTimeline(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() }),
            { clock: m.clock }
        )
        const { action } = useAniRef(timeline, {
            resolver: { x: (v: number) => ({ key: '--x', value: `${v}px` }) },
        })
        const el = makeEl()
        const binding = mount(action, el)
        timeline.play({ from: { x: 0 } })
        m.frames(5, 100)
        expect(el.style.getPropertyValue('--x')).toBe('50px')
        binding.destroy()
    })

    it('R9: destroy unbinds: no more writes, styles are kept, the timeline is not disposed', async () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const { action } = useAniRef(timeline)
        const el = makeEl()
        const binding = mount(action, el)
        timeline.play({ from: { opacity: 0 } })
        m.frames(3, 100)
        const kept = el.style.opacity
        expect(Number(kept)).toBeCloseTo(0.3, 5)
        binding.destroy()
        m.frames(3, 100)
        expect(el.style.opacity).toBe(kept)
        // the timeline is still the user's: it keeps running and can finish
        expect(timeline.status).toBe('PLAYING')
        m.frames(10, 100)
        expect(timeline.status).toBe('ENDED')
        const run = timeline.play({ from: { opacity: 0 } })
        m.frames(10, 100)
        await expect(run).resolves.toBe('ended')
    })

    it('R10: the end of the component scope never disposes the timeline it was given', async () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const { action } = useAniRef(timeline)
        const binding = mount(action, makeEl())
        binding.destroy()
        for (const callback of scope.destroyers.splice(0)) callback()
        const run = timeline.play({ from: { opacity: 0 } })
        m.frames(10, 100)
        await expect(run).resolves.toBe('ended')
    })

    it('R11: one action on several nodes keeps independent bindings', () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const { action } = useAniRef(timeline)
        const n1 = makeEl()
        const n2 = makeEl()
        const b1 = mount(action, n1)
        const b2 = mount(action, n2)
        timeline.play({ from: { opacity: 0 } })
        m.frames(2, 100)
        expect(opacityOf(n1)).toBeCloseTo(0.2, 5)
        expect(opacityOf(n2)).toBeCloseTo(0.2, 5)
        b1.destroy()
        m.frames(3, 100)
        expect(opacityOf(n1)).toBeCloseTo(0.2, 5)
        expect(opacityOf(n2)).toBeCloseTo(0.5, 5)
        b2.destroy()
    })

    it('R12: a timeline store is followed: swapping rebinds every mounted node', () => {
        const first = clockOf()
        const second = clockOf()
        const t1 = rafTimeline(node(), { clock: first.clock })
        const t2 = rafTimeline(node(), { clock: second.clock })
        t2.play({ from: { opacity: 0.6 } })
        const store = writable<RafAniTimeline<{ opacity: number }>>(t1)
        const { action } = useAniRef(store, { initialValue: { opacity: 0 } })
        const n1 = makeEl()
        const n2 = makeEl()
        const b1 = mount(action, n1)
        const b2 = mount(action, n2)
        t1.play({ from: { opacity: 0 } })
        first.frames(5, 100)
        expect(opacityOf(n1)).toBeCloseTo(0.5, 5)
        expect(opacityOf(n2)).toBeCloseTo(0.5, 5)

        store.set(t2)
        expect(n1.style.opacity).toBe('0.6')
        expect(n2.style.opacity).toBe('0.6')
        // the replaced timeline writes nothing any more
        first.frames(2, 100)
        expect(n1.style.opacity).toBe('0.6')
        second.frames(2, 100)
        expect(opacityOf(n1)).toBeCloseTo(0.68, 5)
        expect(opacityOf(n2)).toBeCloseTo(0.68, 5)
        b1.destroy()
        b2.destroy()
    })

    it('R13: destroy releases the timeline store and the bindings of the current timeline', () => {
        const m = clockOf()
        const t1 = rafTimeline(node(), { clock: m.clock })
        const t2 = rafTimeline(node(), { clock: m.clock })
        const store = writable<RafAniTimeline<{ opacity: number }>>(t1)
        let live = 0
        const watched = {
            subscribe: (run: Parameters<typeof store.subscribe>[0]) => {
                live++
                const stop = store.subscribe(run)
                return () => {
                    live--
                    stop()
                }
            },
        }
        const { action } = useAniRef(watched)
        const el = makeEl()
        const binding = mount(action, el)
        expect(live).toBe(1)
        binding.destroy()
        expect(live).toBe(0)
        store.set(t2)
        t2.play({ from: { opacity: 0.9 } })
        m.frames(2, 100)
        expect(el.style.opacity).toBe('')
    })

    it('R14: 1000 mount / destroy cycles leave nothing bound', () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const { action } = useAniRef(timeline)
        const els: HTMLElement[] = []
        for (let i = 0; i < 1000; i++) {
            const el = document.createElement('div')
            els.push(el)
            mount(action, el).destroy()
        }
        timeline.play({ from: { opacity: 0 } })
        m.frames(3, 100)
        expect(els.filter((el) => el.style.opacity !== '')).toHaveLength(0)
        // and the timeline is still healthy for a new node
        const live = makeEl()
        mount(action, live)
        m.frame(100)
        expect(opacityOf(live)).toBeCloseTo(0.4, 5)
    })

    it('R15: the removed events option does nothing: no listener is added', () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const listeners = trackListeners(tracked)
        const onClick = vi.fn()
        const { action } = useAniRef(timeline, {
            initialValue: { opacity: 0 },
            events: { onClick },
            cleanupEvents: true,
        } as never)
        const el = makeEl()
        const binding = mount(action, el)
        el.click()
        expect(listeners.adds).toBe(0)
        expect(onClick).not.toHaveBeenCalled()
        binding.destroy()
        listeners.restore()
    })

    it('R16: writes go through core only (no applyStyleSheet, controller or event manager)', () => {
        const m = clockOf()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const { action } = useAniRef(timeline, {
            initialValue: { opacity: 0 },
            events: { onClick: () => undefined },
        } as never)
        const el = makeEl()
        const binding = mount(action, el)
        timeline.play({ from: { opacity: 0 } })
        m.frames(3, 100)
        expect(opacityOf(el)).toBeCloseTo(0.3, 5)
        binding.destroy()

        const group = rafGroup(node(), { clock: m.clock })
        const grouped = useAniGroup(group, { initialValue: { opacity: 0 } })
        const gel = makeEl()
        const gbinding = mountAt(grouped.action, gel, 0)
        group.play({ from: { opacity: 0 }, count: 1 })
        m.frames(3, 100)
        gbinding.destroy()

        expect(bypass.applyStyleSheet).not.toHaveBeenCalled()
        expect(bypass.createTimelineController).not.toHaveBeenCalled()
        expect(bypass.EventManager).not.toHaveBeenCalled()
    })
})

describe('FSVELTE: useAniGroup', () => {
    beforeEach(() => {
        scope.destroyers.length = 0
    })
    afterEach(() => {
        document.body.innerHTML = ''
    })

    const makeGroup = (stagger = 0.25) => {
        const m = clockOf()
        const group = rafGroup(node(), { clock: m.clock, stagger })
        return { m, group }
    }

    it('G1: returns { action, style } and renders the style string from initialValue', () => {
        const { group } = makeGroup()
        const result = useAniGroup(group, {
            initialValue: { opacity: 0.5 },
        })
        expect(Array.isArray(result)).toBe(false)
        expect(typeof result.action).toBe('function')
        expect(result.style).toBe('opacity: 0.5')
        expect(useAniGroup(group).style).toBeUndefined()
    })

    it('G2: the resolver shapes the style string', () => {
        const m = clockOf()
        const group = rafGroup(
            a.ani({ to: { x: 10 }, duration: 1, timing: a.timing.linear() }),
            { clock: m.clock }
        )
        const { style } = useAniGroup(group, {
            initialValue: { x: 3 },
            resolver: { x: (v: number) => ({ key: '--x', value: `${v}px` }) },
        })
        expect(style).toBe('--x: 3px')
    })

    it('G3: use:action={index} binds each element to its own target', () => {
        const { m, group } = makeGroup()
        const { action } = useAniGroup(group)
        const els = [makeEl(), makeEl(), makeEl()]
        const bindings = els.map((el, i) => mountAt(action, el, i))
        group.play({ from: { opacity: 0 }, count: 3 })
        m.frame(500)
        expect(opacityOf(els[0]!)).toBeCloseTo(0.5, 5)
        expect(opacityOf(els[1]!)).toBeCloseTo(0.25, 5)
        expect(opacityOf(els[2]!)).toBeCloseTo(0, 5)
        for (const binding of bindings) binding.destroy()
    })

    it('G4: the resolver option decides what is written', () => {
        const { m, group } = makeGroup(0)
        const { action } = useAniGroup(group, {
            resolver: { opacity: (v: number) => ({ key: '--o', value: v }) },
        })
        const el = makeEl()
        const binding = mountAt(action, el, 0)
        group.play({ from: { opacity: 0 }, count: 1 })
        m.frame(500)
        expect(el.style.getPropertyValue('--o')).toBe('0.5')
        expect(el.style.opacity).toBe('')
        binding.destroy()
    })

    it('G5: update(index) rebinds the element to the new index', () => {
        const { m, group } = makeGroup()
        const { action } = useAniGroup(group)
        const el = makeEl()
        const other = makeEl()
        const binding = mountAt(action, el, 0)
        const otherBinding = mountAt(action, other, 1)
        group.play({ from: { opacity: 0 }, count: 3 })
        m.frame(500)
        expect(opacityOf(el)).toBeCloseTo(0.5, 5)

        binding.update(1)
        // a late bind writes the value of the new index at once
        expect(opacityOf(el)).toBeCloseTo(0.25, 5)
        m.frame(100)
        expect(opacityOf(el)).toBeCloseTo(0.35, 5)
        expect(opacityOf(other)).toBeCloseTo(0.35, 5)

        binding.update(0)
        expect(opacityOf(el)).toBeCloseTo(0.6, 5)
        m.frame(100)
        expect(opacityOf(el)).toBeCloseTo(0.7, 5)
        expect(opacityOf(other)).toBeCloseTo(0.45, 5)
        binding.destroy()
        otherBinding.destroy()
    })

    it('G6: update leaves no binding at the old index', () => {
        const { m, group } = makeGroup()
        const { action } = useAniGroup(group)
        const el = makeEl()
        const binding = mountAt(action, el, 0)
        binding.update(2)
        group.play({ from: { opacity: 0 }, count: 3 })
        m.frame(500)
        // index 2 of 3 with stagger .25 has not started yet
        expect(opacityOf(el)).toBeCloseTo(0, 5)
        m.frame(500)
        expect(opacityOf(el)).toBeCloseTo(0.5, 5)
        binding.destroy()
    })

    it('G7: destroy unbinds: no more writes, styles are kept, the group is not disposed', async () => {
        const { m, group } = makeGroup(0)
        const { action } = useAniGroup(group)
        const el = makeEl()
        const binding = mountAt(action, el, 0)
        group.play({ from: { opacity: 0 }, count: 1 })
        m.frames(3, 100)
        const kept = el.style.opacity
        binding.destroy()
        m.frames(3, 100)
        expect(el.style.opacity).toBe(kept)
        for (const callback of scope.destroyers.splice(0)) callback()
        const run = group.play({ from: { opacity: 0 }, count: 1 })
        m.frames(20, 100)
        await expect(run).resolves.toBe('ended')
    })

    it('G8: a group store is followed: swapping rebinds every mounted node at its index', () => {
        const first = clockOf()
        const second = clockOf()
        const g1 = rafGroup(node(), { clock: first.clock })
        const g2 = rafGroup(node(), { clock: second.clock })
        g2.play({ from: (i) => ({ opacity: 0.2 + i / 10 }), count: 2 })
        const store = writable<RafGroup<{ opacity: number }>>(g1)
        const { action } = useAniGroup(store)
        const n0 = makeEl()
        const n1 = makeEl()
        const b0 = mountAt(action, n0, 0)
        const b1 = mountAt(action, n1, 1)
        g1.play({ from: { opacity: 0 }, count: 2 })
        first.frames(5, 100)
        expect(opacityOf(n0)).toBeCloseTo(0.5, 5)

        store.set(g2)
        expect(opacityOf(n0)).toBeCloseTo(0.2, 5)
        expect(opacityOf(n1)).toBeCloseTo(0.3, 5)
        // the replaced group writes nothing any more
        first.frames(2, 100)
        expect(opacityOf(n0)).toBeCloseTo(0.2, 5)
        second.frames(2, 100)
        expect(opacityOf(n0)).toBeCloseTo(0.36, 5)
        expect(opacityOf(n1)).toBeCloseTo(0.44, 5)
        b0.destroy()
        b1.destroy()
    })

    it('G9: update on a group store rebinds in the current group', () => {
        const first = clockOf()
        const second = clockOf()
        const g1 = rafGroup(node(), { clock: first.clock })
        const g2 = rafGroup(node(), { clock: second.clock })
        g2.play({ from: (i) => ({ opacity: i / 10 }), count: 4 })
        const store = writable<RafGroup<{ opacity: number }>>(g1)
        const { action } = useAniGroup(store)
        const el = makeEl()
        const binding = mountAt(action, el, 0)
        store.set(g2)
        expect(opacityOf(el)).toBeCloseTo(0, 5)
        binding.update(3)
        expect(opacityOf(el)).toBeCloseTo(0.3, 5)
        binding.destroy()
    })

    it('G10: destroy releases the group store', () => {
        const { group } = makeGroup()
        const store = writable<RafGroup<{ opacity: number }>>(group)
        let live = 0
        const watched = {
            subscribe: (run: Parameters<typeof store.subscribe>[0]) => {
                live++
                const stop = store.subscribe(run)
                return () => {
                    live--
                    stop()
                }
            },
        }
        const { action } = useAniGroup(watched)
        const binding = mountAt(action, makeEl(), 0)
        expect(live).toBe(1)
        binding.destroy()
        expect(live).toBe(0)
    })

    it('G11: 1000 mount / update / destroy cycles leave nothing bound', () => {
        const { m, group } = makeGroup(0)
        const { action } = useAniGroup(group)
        const els: HTMLElement[] = []
        for (let i = 0; i < 1000; i++) {
            const el = document.createElement('div')
            els.push(el)
            const binding = mountAt(action, el, 0)
            binding.update(1)
            binding.destroy()
        }
        group.play({ from: { opacity: 0 }, count: 2 })
        m.frames(3, 100)
        expect(els.filter((el) => el.style.opacity !== '')).toHaveLength(0)
    })
})
