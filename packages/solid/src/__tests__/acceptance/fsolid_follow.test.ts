// @vitest-environment jsdom

import {
    createClock,
    type Follower,
    type FollowOptions,
    type ManagedClock,
    type Resolver,
} from '@freestylejs/ani-core'
import { type Accessor, createRoot, getOwner, runWithOwner } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as solid from '../../index'

type Values = { opacity: number; borderRadius: number }
type Style = Record<string, string | number> | undefined
interface Bound {
    ref: (element: HTMLElement) => void
    style: Accessor<Style>
    follower: Follower<Values>
}

const { createFollow } = solid as unknown as {
    createFollow(
        initial: Values,
        options?: FollowOptions & {
            resolver?: Resolver<Record<string, number>>
        }
    ): Bound
}

/** A real clock fed by an injected frame source: only `frames()` advances time. */
function makeClock() {
    let time = 1000
    let nextId = 1
    const queue = new Map<number, (timestamp: number) => void>()
    const clock: ManagedClock = createClock({
        lagThreshold: Infinity,
        requestFrame: (callback) => {
            const id = nextId++
            queue.set(id, callback)
            return id
        },
        cancelFrame: (id) => {
            queue.delete(id)
        },
        now: () => time,
        onError: () => undefined,
    })
    return {
        clock,
        frames(count: number, ms = 16) {
            for (let i = 0; i < count; i++) {
                time += ms
                const callbacks = [...queue.values()]
                queue.clear()
                for (const callback of callbacks) callback(time)
            }
        },
        get pending() {
            return queue.size
        },
    }
}

const start: Values = { opacity: 0, borderRadius: 0 }

describe('FSOLID: createFollow', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('A1: returns { ref, style, follower } and no tuple', () => {
        const m = makeClock()
        createRoot((dispose) => {
            const result = createFollow(start, { clock: m.clock })
            expect(Array.isArray(result)).toBe(false)
            expect(typeof result.ref).toBe('function')
            expect(typeof result.style).toBe('function')
            expect(typeof result.follower.set).toBe('function')
            expect(typeof result.follower.jump).toBe('function')
            expect(result.follower.value).toEqual(start)
            expect(result.follower.status).toBe('IDLE')
            dispose()
        })
    })

    it('A2: style() is the inline style of the initial value, with kebab-case keys', () => {
        const m = makeClock()
        createRoot((dispose) => {
            const { style } = createFollow(
                { opacity: 0.5, borderRadius: 4 },
                { clock: m.clock }
            )
            expect(style()).toEqual({ opacity: 0.5, 'border-radius': '4px' })
            dispose()
        })
    })

    it('A3: the element follows the spring frame by frame, through follower.bind', () => {
        const m = makeClock()
        const el = document.createElement('div')
        let follower!: Follower<Values>
        const dispose = createRoot((d) => {
            const result = createFollow(start, { clock: m.clock })
            follower = result.follower
            const bind = vi.spyOn(follower, 'bind')
            result.ref(el)
            expect(bind).toHaveBeenCalledTimes(1)
            expect(bind.mock.calls[0]?.[0]).toBe(el)
            return d
        })
        void follower.set({ opacity: 1, borderRadius: 10 })
        expect(follower.target).toEqual({ opacity: 1, borderRadius: 10 })
        let previous = 0
        for (let i = 0; i < 20; i++) {
            m.frames(1)
            expect(Number(el.style.opacity)).toBeCloseTo(
                follower.value.opacity,
                5
            )
            expect(el.style.borderRadius).toBe(
                `${follower.value.borderRadius}px`
            )
            expect(follower.value.opacity).toBeGreaterThan(previous)
            previous = follower.value.opacity
        }
        expect(previous).toBeLessThan(1.2)
        expect(m.clock.size).toBe(1)
        dispose()
    })

    it('A3: jump writes the element synchronously', () => {
        const m = makeClock()
        const el = document.createElement('div')
        let follower!: Follower<Values>
        const dispose = createRoot((d) => {
            const result = createFollow(start, { clock: m.clock })
            follower = result.follower
            result.ref(el)
            return d
        })
        follower.jump({ opacity: 0.3 })
        expect(el.style.opacity).toBe('0.3')
        expect(follower.status).toBe('IDLE')
        dispose()
    })

    it('A3: the spring option and the clock option reach the follower', () => {
        const stiff = makeClock()
        const soft = makeClock()
        const dispose = createRoot((d) => {
            const fast = createFollow(start, {
                clock: stiff.clock,
                spring: { m: 1, k: 2000, c: 90 },
            }).follower
            const slow = createFollow(start, {
                clock: soft.clock,
                spring: { m: 1, k: 10, c: 6 },
            }).follower
            void fast.set({ opacity: 1 })
            void slow.set({ opacity: 1 })
            stiff.frames(5)
            soft.frames(5)
            expect(fast.value.opacity).toBeGreaterThan(slow.value.opacity)
            expect(stiff.clock.size).toBe(1)
            expect(soft.clock.size).toBe(1)
            return d
        })
        dispose()
    })

    it('A4: the resolver option shapes style() and the bound writes', () => {
        const m = makeClock()
        const el = document.createElement('div')
        const resolver: Resolver<Record<string, number>> = {
            opacity: (v: number) => ({ key: '--o', value: `${v * 100}%` }),
        }
        let follower!: Follower<Values>
        const dispose = createRoot((d) => {
            const result = createFollow(
                { opacity: 0.25, borderRadius: 0 },
                { clock: m.clock, resolver }
            )
            follower = result.follower
            expect(result.style()).toEqual({
                '--o': '25%',
                'border-radius': '0px',
            })
            result.ref(el)
            return d
        })
        follower.jump({ opacity: 0.5 })
        expect(el.style.getPropertyValue('--o')).toBe('50%')
        expect(el.style.opacity).toBe('')
        dispose()
    })

    it('A5: a late ref is written with the current value at once', () => {
        const m = makeClock()
        let owner: ReturnType<typeof getOwner> = null
        let result!: Bound
        const dispose = createRoot((d) => {
            owner = getOwner()
            result = createFollow(start, { clock: m.clock })
            return d
        })
        result.follower.jump({ opacity: 0.3 })
        const el = document.createElement('div')
        expect(el.style.opacity).toBe('')
        runWithOwner(owner, () => result.ref(el))
        expect(el.style.opacity).toBe('0.3')
        dispose()
    })

    it('A6: cleaning up the owner disposes the follower and releases the element', async () => {
        const m = makeClock()
        const el = document.createElement('div')
        let follower!: Follower<Values>
        const dispose = createRoot((d) => {
            const result = createFollow(start, { clock: m.clock })
            follower = result.follower
            result.ref(el)
            return d
        })
        void follower.set({ opacity: 1 })
        m.frames(3)
        expect(m.clock.size).toBe(1)
        const before = el.style.opacity
        expect(before).not.toBe('')

        dispose()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
        m.frames(3)
        expect(el.style.opacity).toBe(before)
        expect(await follower.set({ opacity: 0 })).toBe('disposed')
    })

    it('A6: creates and disposes cleanly 200 times without leaving clock subscribers', () => {
        const m = makeClock()
        for (let i = 0; i < 200; i++) {
            const dispose = createRoot((d) => {
                const { ref, follower } = createFollow(start, {
                    clock: m.clock,
                })
                ref(document.createElement('div'))
                void follower.set({ opacity: 1 })
                return d
            })
            m.frames(1)
            dispose()
        }
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('A7: DOM events are not part of the primitive', () => {
        const m = makeClock()
        const el = document.createElement('div')
        const add = vi.spyOn(el, 'addEventListener')
        const dispose = createRoot((d) => {
            createFollow(start, { clock: m.clock }).ref(el)
            return d
        })
        expect(add).not.toHaveBeenCalled()
        dispose()
    })

    it('A8: an invalid initial value throws a TypeError synchronously', () => {
        const m = makeClock()
        createRoot((dispose) => {
            expect(() =>
                createFollow(null as never, { clock: m.clock })
            ).toThrow(/initial/)
            expect(() =>
                createFollow({ opacity: Number.NaN } as never, {
                    clock: m.clock,
                })
            ).toThrow(/finite number/)
            dispose()
        })
    })
})
