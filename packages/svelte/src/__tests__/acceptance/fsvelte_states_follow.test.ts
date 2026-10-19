// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import { follow } from '@freestylejs/ani-core'
import type { Action, ActionReturn } from 'svelte/action'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../../core/src/testing'
import { useAniStates, useFollow } from '../../index'

const scope = vi.hoisted(() => ({ destroyers: [] as Array<() => void> }))

vi.mock('svelte', async (importOriginal) => ({
    ...(await importOriginal<typeof import('svelte')>()),
    onDestroy: (callback: () => void) => {
        scope.destroyers.push(callback)
    },
}))

/** Ends the component scope: runs what was registered with `onDestroy`. */
const destroyScope = () => {
    for (const callback of scope.destroyers.splice(0)) callback()
}

const linear = a.timing.linear()
const makeStates = () => ({
    idle: a.ani({ to: { opacity: 0 }, duration: 1, timing: linear }),
    active: a.ani({ to: { opacity: 1 }, duration: 1, timing: linear }),
})
const clockOf = () => createManualClock({ lagThreshold: Infinity })
const makeEl = () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    return el
}
const mount = (action: Action<HTMLElement>, el: HTMLElement) => {
    const result = action(el) as ActionReturn | undefined
    return { destroy: () => result?.destroy?.() }
}
const opacityOf = (el: HTMLElement) => Number(el.style.opacity)
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

const opacityResolver = {
    opacity: (v: number) => ({ key: '--o', value: v }),
}

function useStates(
    m: ReturnType<typeof clockOf>,
    withResolver = false,
    opacity = 0
) {
    return useAniStates({
        initial: 'idle',
        initialValue: { opacity },
        states: makeStates(),
        clock: m.clock,
        ...(withResolver ? { resolver: opacityResolver } : {}),
    })
}

function setupStates() {
    const m = clockOf()
    return { m, result: useStates(m) }
}

describe('FSVELTE: useAniStates', () => {
    beforeEach(() => {
        scope.destroyers.length = 0
    })
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('S1: returns the object shape (the old tuple is gone)', () => {
        const { result } = setupStates()
        expect(Array.isArray(result)).toBe(false)
        expect(typeof result.action).toBe('function')
        expect(typeof result.transitionTo).toBe('function')
        expect(typeof result.state.subscribe).toBe('function')
        expect(typeof result.machine.transitionTo).toBe('function')
        expect(typeof result.machine.bind).toBe('function')
        expect(typeof result.machine.dispose).toBe('function')
        expect(typeof result.style).toBe('string')
    })

    it('S2: style is the CSS declaration string of initialValue', () => {
        const { result } = setupStates()
        expect(result.style).toBe('opacity: 0')
        const m = clockOf()
        const multi = useAniStates({
            initial: 'idle',
            initialValue: { translateX: 0, opacity: 0.5 },
            states: {
                idle: a.ani({
                    to: { translateX: 0, opacity: 0.5 },
                    duration: 1,
                    timing: linear,
                }),
            },
            clock: m.clock,
        })
        expect(declarations(multi.style)).toEqual({
            transform: 'translateX(0px)',
            opacity: '0.5',
        })
    })

    it('S3: the resolver shapes the style string', () => {
        const m = clockOf()
        const { style } = useStates(m, true, 0.25)
        expect(style).toBe('--o: 0.25')
    })

    it('S4: state is a store that mirrors the machine, also for a direct machine.transitionTo', async () => {
        const { m, result } = setupStates()
        expect(get(result.state)).toBe('idle')
        const run = result.transitionTo('active', { from: { opacity: 0 } })
        expect(get(result.state)).toBe('active')
        m.frames(15, 100)
        await expect(run).resolves.toBe('ended')
        result.machine.transitionTo('idle', { from: { opacity: 1 } })
        expect(get(result.state)).toBe('idle')
        expect(result.machine.state()).toBe('idle')
    })

    it('S5: the state store notifies its subscribers on every transition', () => {
        const { result } = setupStates()
        const seen: string[] = []
        const unsubscribe = result.state.subscribe((s) => seen.push(String(s)))
        result.transitionTo('active', { from: { opacity: 0 } })
        result.transitionTo('idle')
        result.machine.transitionTo('active')
        expect(seen).toEqual(['idle', 'active', 'idle', 'active'])
        unsubscribe()
    })

    it('S6: the action binds the machine: the element animates and follows timeline swaps', () => {
        const { m, result } = setupStates()
        const el = makeEl()
        const binding = mount(result.action, el)
        const first = result.machine.timeline()
        result.transitionTo('active', { from: { opacity: 0 } })
        expect(result.machine.timeline()).not.toBe(first)
        m.frames(5, 100)
        expect(opacityOf(el)).toBeCloseTo(0.5, 5)

        // interrupted by another state: the element continues from where it is
        result.transitionTo('idle')
        m.frame(100)
        expect(opacityOf(el)).toBeLessThanOrEqual(0.5)
        expect(opacityOf(el)).toBeGreaterThan(0.3)
        m.frames(30, 100)
        expect(opacityOf(el)).toBeCloseTo(0, 5)
        binding.destroy()
    })

    it('S7: a node mounted while a transition runs shows the current value at once', () => {
        const { m, result } = setupStates()
        result.transitionTo('active', { from: { opacity: 0 } })
        m.frames(4, 100)
        const el = makeEl()
        const binding = mount(result.action, el)
        expect(opacityOf(el)).toBeCloseTo(0.4, 5)
        binding.destroy()
    })

    it('S8: the resolver option decides what is written', () => {
        const m = clockOf()
        const result = useStates(m, true)
        const el = makeEl()
        const binding = mount(result.action, el)
        result.transitionTo('active', { from: { opacity: 0 } })
        m.frames(5, 100)
        expect(el.style.getPropertyValue('--o')).toBe('0.5')
        expect(el.style.opacity).toBe('')
        binding.destroy()
    })

    it('S9: transitions are atomic: an unknown state throws and changes nothing', () => {
        const { result } = setupStates()
        expect(() => result.transitionTo('nope' as never)).toThrow(RangeError)
        expect(get(result.state)).toBe('idle')
    })

    it('S10: a rejected non-interruptible transition keeps the state', async () => {
        const { m, result } = setupStates()
        result.transitionTo('active', { from: { opacity: 0 } })
        m.frame(100)
        const rejected = result.transitionTo('idle', { interrupt: false })
        await expect(rejected).resolves.toBe('skipped')
        expect(get(result.state)).toBe('active')
    })

    it('S11: destroy of the action unbinds only: no more writes, the machine stays usable', async () => {
        const { m, result } = setupStates()
        const el = makeEl()
        const binding = mount(result.action, el)
        result.transitionTo('active', { from: { opacity: 0 } })
        m.frames(3, 100)
        const kept = el.style.opacity
        binding.destroy()
        m.frames(3, 100)
        expect(el.style.opacity).toBe(kept)
        expect(result.machine.value).toEqual({ opacity: expect.any(Number) })

        // the machine is not disposed by it: a later node binds again
        const later = makeEl()
        const again = mount(result.action, later)
        expect(opacityOf(later)).toBeCloseTo(0.6, 5)
        m.frames(10, 100)
        expect(opacityOf(later)).toBeCloseTo(1, 5)
        const run = result.transitionTo('idle', { from: { opacity: 1 } })
        m.frames(15, 100)
        await expect(run).resolves.toBe('ended')
        again.destroy()
    })

    it('S12: the end of the component scope disposes the machine it created', async () => {
        const { m, result } = setupStates()
        const el = makeEl()
        const binding = mount(result.action, el)
        const run = result.transitionTo('active', {
            from: { opacity: 0 },
            repeat: Infinity,
        })
        m.frames(3, 100)
        expect(m.clock.size).toBe(1)
        expect(scope.destroyers.length).toBeGreaterThan(0)
        destroyScope()
        expect(m.clock.size).toBe(0)
        await expect(run).resolves.toBe('disposed')
        await expect(result.transitionTo('idle')).resolves.toBe('disposed')
        const kept = el.style.opacity
        m.frames(3, 100)
        expect(el.style.opacity).toBe(kept)
        binding.destroy()
    })

    it('S13: it is not disposed before the scope ends', async () => {
        const { m, result } = setupStates()
        const run = result.transitionTo('active', { from: { opacity: 0 } })
        m.frames(3, 100)
        expect(m.clock.size).toBe(1)
        m.frames(10, 100)
        await expect(run).resolves.toBe('ended')
    })

    it('S14: 300 mount / transition / destroy cycles leave no writes and no clock subscribers', () => {
        const { m, result } = setupStates()
        const els: HTMLElement[] = []
        for (let i = 0; i < 300; i++) {
            const el = document.createElement('div')
            els.push(el)
            const binding = mount(result.action, el)
            result.transitionTo(i % 2 === 0 ? 'active' : 'idle', {
                from: { opacity: 0 },
            })
            binding.destroy()
        }
        const kept = els.map((el) => el.style.opacity)
        m.frames(5, 100)
        expect(els.map((el) => el.style.opacity)).toEqual(kept)
        destroyScope()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })
})

describe('FSVELTE: useFollow', () => {
    beforeEach(() => {
        scope.destroyers.length = 0
    })
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('F1: returns { action, style, follower }', () => {
        const m = clockOf()
        const result = useFollow({ opacity: 0 }, { clock: m.clock })
        expect(Array.isArray(result)).toBe(false)
        expect(typeof result.action).toBe('function')
        expect(typeof result.follower.set).toBe('function')
        expect(typeof result.follower.jump).toBe('function')
        expect(result.follower.value).toEqual({ opacity: 0 })
        expect(result.follower.status).toBe('IDLE')
    })

    it('F2: style is the CSS declaration string of the initial value', () => {
        const m = clockOf()
        expect(useFollow({ opacity: 0.5 }, { clock: m.clock }).style).toBe(
            'opacity: 0.5'
        )
        const { style } = useFollow(
            { translateX: 0, opacity: 1 },
            { clock: m.clock }
        )
        expect(declarations(style)).toEqual({
            transform: 'translateX(0px)',
            opacity: '1',
        })
    })

    it('F3: the resolver shapes the style string', () => {
        const m = clockOf()
        const { style } = useFollow(
            { y: 7 },
            {
                clock: m.clock,
                resolver: {
                    y: (v: number) => ({ key: 'top', value: `${v}px` }),
                },
            }
        )
        expect(style).toBe('top: 7px')
    })

    it('F4: the action binds the follower: set moves the element, then it settles on the target', async () => {
        const m = clockOf()
        const { action, follower } = useFollow(
            { opacity: 0 },
            { clock: m.clock }
        )
        const el = makeEl()
        const binding = mount(action, el)
        const run = follower.set({ opacity: 1 })
        m.frames(2, 16)
        expect(opacityOf(el)).toBeGreaterThan(0)
        expect(opacityOf(el)).toBeLessThan(1)
        for (let i = 0; i < 2000 && follower.status === 'PLAYING'; i++) {
            m.frame(16)
        }
        await expect(run).resolves.toBe('ended')
        expect(opacityOf(el)).toBeCloseTo(1, 2)
        binding.destroy()
    })

    it('F5: jump writes the element synchronously', () => {
        const m = clockOf()
        const { action, follower } = useFollow(
            { opacity: 0 },
            { clock: m.clock }
        )
        const el = makeEl()
        const binding = mount(action, el)
        follower.jump({ opacity: 0.4 })
        expect(el.style.opacity).toBe('0.4')
        binding.destroy()
    })

    it('F6: mounting writes the current value at once', () => {
        const m = clockOf()
        const { action, follower } = useFollow(
            { opacity: 0 },
            { clock: m.clock }
        )
        follower.jump({ opacity: 0.7 })
        const el = makeEl()
        const binding = mount(action, el)
        expect(el.style.opacity).toBe('0.7')
        binding.destroy()
    })

    it('F7: the resolver option decides what is written', () => {
        const m = clockOf()
        const { action, follower } = useFollow(
            { y: 0 },
            {
                clock: m.clock,
                resolver: {
                    y: (v: number) => ({ key: 'top', value: `${v}px` }),
                },
            }
        )
        const el = makeEl()
        const binding = mount(action, el)
        follower.jump({ y: 50 })
        expect(el.style.top).toBe('50px')
        binding.destroy()
    })

    it('F8: spring and clock options reach the follower', () => {
        const spring = { m: 1, k: 400, c: 40 }
        const mine = clockOf()
        const reference = clockOf()
        const { follower } = useFollow(
            { opacity: 0 },
            { clock: mine.clock, spring }
        )
        const expected = follow(
            { opacity: 0 },
            { clock: reference.clock, spring }
        )
        follower.set({ opacity: 1 })
        expected.set({ opacity: 1 })
        mine.frames(5, 16)
        reference.frames(5, 16)
        expect(follower.value.opacity).toBe(expected.value.opacity)
        expect(follower.value.opacity).toBeGreaterThan(0)
        expected.dispose()
    })

    it('F9: destroy of the action unbinds only: no more writes, the follower keeps working', () => {
        const m = clockOf()
        const { action, follower } = useFollow(
            { opacity: 0 },
            { clock: m.clock }
        )
        const el = makeEl()
        const binding = mount(action, el)
        follower.jump({ opacity: 0.3 })
        binding.destroy()
        follower.jump({ opacity: 0.9 })
        expect(el.style.opacity).toBe('0.3')
        expect(follower.value).toEqual({ opacity: 0.9 })
        const later = makeEl()
        const again = mount(action, later)
        expect(later.style.opacity).toBe('0.9')
        again.destroy()
    })

    it('F10: the end of the component scope disposes the follower it created', async () => {
        const m = clockOf()
        const { action, follower } = useFollow(
            { opacity: 0 },
            { clock: m.clock }
        )
        const el = makeEl()
        const binding = mount(action, el)
        const run = follower.set({ opacity: 1 })
        m.frame(16)
        expect(m.clock.size).toBe(1)
        expect(scope.destroyers.length).toBeGreaterThan(0)
        destroyScope()
        expect(m.clock.size).toBe(0)
        await expect(run).resolves.toBe('disposed')
        const kept = el.style.opacity
        m.frames(3, 16)
        expect(el.style.opacity).toBe(kept)
        binding.destroy()
    })

    it('F11: it is not disposed before the scope ends', async () => {
        const m = clockOf()
        const { follower } = useFollow({ opacity: 0 }, { clock: m.clock })
        const run = follower.set({ opacity: 1 })
        for (let i = 0; i < 2000 && follower.status === 'PLAYING'; i++) {
            m.frame(16)
        }
        await expect(run).resolves.toBe('ended')
    })

    it('F12: 300 mount / destroy cycles leave no writes and no clock subscribers', () => {
        const m = clockOf()
        const { action, follower } = useFollow(
            { opacity: 0 },
            { clock: m.clock }
        )
        const els: HTMLElement[] = []
        for (let i = 0; i < 300; i++) {
            const el = document.createElement('div')
            els.push(el)
            mount(action, el).destroy()
        }
        const kept = els.map((el) => el.style.opacity)
        follower.jump({ opacity: 0.5 })
        expect(els.map((el) => el.style.opacity)).toEqual(kept)
        follower.set({ opacity: 1 })
        m.frames(3, 16)
        expect(els.map((el) => el.style.opacity)).toEqual(kept)
        destroyScope()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })
})
