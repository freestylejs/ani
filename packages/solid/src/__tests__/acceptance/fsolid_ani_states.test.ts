// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import {
    type Clock,
    createClock,
    type Resolver,
    type RunResult,
} from '@freestylejs/ani-core'
import {
    type Accessor,
    createEffect,
    createRoot,
    getOwner,
    runWithOwner,
} from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as solid from '../../index'

type Values = { opacity: number }
type StateName = 'idle' | 'active'
type Style = Record<string, string | number> | undefined
interface Machine {
    state(): StateName
    readonly value: Values
    transitionTo(
        state: string,
        config?: { interrupt?: boolean; from?: Values }
    ): Promise<RunResult>
    timeline(): { readonly value: Values | null; readonly status: string }
    dispose(): void
}
interface Bound {
    ref: (element: HTMLElement) => void
    style: Accessor<Style>
    state: Accessor<StateName>
    transitionTo: Machine['transitionTo']
    machine: Machine
}
type Config = {
    initial: StateName
    initialValue: Values
    states: Record<StateName, ReturnType<typeof a.ani>>
    clock: Clock
    resolver?: Resolver<Record<string, number>>
}

const { createAniStates } = solid as unknown as {
    createAniStates(config: Config): Bound
}

/** A real clock fed by an injected frame source: only `frames()` advances time. */
function makeClock() {
    let time = 1000
    let nextId = 1
    const queue = new Map<number, (timestamp: number) => void>()
    const clock = createClock({
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
        frames(count: number, ms = 100) {
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

const linear = a.timing.linear()
const makeStates = () => ({
    idle: a.ani({ to: { opacity: 0 }, duration: 1, timing: linear }),
    active: a.ani({ to: { opacity: 1 }, duration: 1, timing: linear }),
})

function setup(extra: Partial<Config> = {}) {
    const m = makeClock()
    const el = document.createElement('div')
    document.body.appendChild(el)
    let api!: Bound
    let owner: ReturnType<typeof getOwner> = null
    const dispose = createRoot((d) => {
        owner = getOwner()
        api = createAniStates({
            initial: 'idle',
            initialValue: { opacity: 0 },
            states: makeStates(),
            clock: m.clock,
            ...extra,
        })
        api.ref(el)
        return d
    })
    return { m, el, api, dispose, owner }
}

describe('FSOLID: createAniStates', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('A1: returns { ref, style, state, transitionTo, machine } and no tuple', () => {
        const { api, dispose } = setup()
        expect(Array.isArray(api)).toBe(false)
        expect(typeof api.ref).toBe('function')
        expect(typeof api.style).toBe('function')
        expect(typeof api.state).toBe('function')
        expect(typeof api.transitionTo).toBe('function')
        expect(typeof api.machine.transitionTo).toBe('function')
        expect(typeof api.machine.dispose).toBe('function')
        expect(api.state()).toBe('idle')
        expect(api.machine.state()).toBe('idle')
        dispose()
    })

    it('A2: ref follows idle -> active -> idle across the timeline swaps', async () => {
        const { m, el, api, dispose } = setup()
        const toActive = api.transitionTo('active')
        m.frames(5)
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)

        // interrupted mid-flight: continues from the current value
        const toIdle = api.transitionTo('idle')
        m.frames(1)
        expect(await toActive).toBe('interrupted')
        const afterOne = Number(el.style.opacity)
        expect(afterOne).toBeGreaterThan(0.3)
        expect(afterOne).toBeLessThan(0.5)
        expect(afterOne).toBeCloseTo(api.machine.value.opacity, 5)

        m.frames(10)
        expect(await toIdle).toBe('ended')
        expect(Number(el.style.opacity)).toBeCloseTo(0, 5)
        dispose()
    })

    it('A2: the element is bound through the machine, not a single timeline', () => {
        const { m, el, api, dispose } = setup()
        void api.transitionTo('active')
        m.frames(2)
        const first = api.machine.timeline()
        void api.transitionTo('idle')
        expect(api.machine.timeline()).not.toBe(first)
        m.frames(1)
        expect(Number(el.style.opacity)).toBeCloseTo(
            api.machine.timeline().value?.opacity ?? Number.NaN,
            5
        )
        // the replaced timeline can not move the element any more
        expect(Number(el.style.opacity)).toBeLessThan(0.2)
        dispose()
    })

    it('A3: state() is reactive and mirrors the machine', async () => {
        const { m, api, dispose } = setup()
        const seen: StateName[] = []
        const stopWatching = createRoot((d) => {
            createEffect(() => {
                seen.push(api.state())
            })
            return d
        })
        expect(seen).toEqual(['idle'])

        const run = api.transitionTo('active')
        expect(api.state()).toBe('active')
        expect(seen).toEqual(['idle', 'active'])
        m.frames(11)
        expect(await run).toBe('ended')

        // the machine escape hatch is mirrored too
        void api.machine.transitionTo('idle')
        expect(api.state()).toBe('idle')
        expect(seen).toEqual(['idle', 'active', 'idle'])
        stopWatching()
        dispose()
    })

    it('A3: a skipped transition leaves state() alone', async () => {
        const { m, api, dispose } = setup()
        void api.transitionTo('active')
        m.frames(2)
        const skipped = api.transitionTo('idle', { interrupt: false })
        expect(await skipped).toBe('skipped')
        expect(api.state()).toBe('active')
        dispose()
    })

    it('A4: an unknown state throws a RangeError synchronously and changes nothing', () => {
        const { api, dispose } = setup()
        expect(() => api.transitionTo('nope')).toThrow(RangeError)
        expect(api.state()).toBe('idle')
        dispose()
    })

    it('A5: style() is the initial inline style of initialValue, with kebab-case keys', () => {
        const { api, dispose } = setup({ initialValue: { opacity: 0.25 } })
        expect(api.style()).toEqual({ opacity: 0.25 })
        dispose()
    })

    it('A5: the resolver option shapes style() and the bound writes', () => {
        const { m, el, api, dispose } = setup({
            initialValue: { opacity: 0.25 },
            resolver: {
                opacity: (v: number) => ({ key: '--o', value: `${v * 100}%` }),
            },
        })
        expect(api.style()).toEqual({ '--o': '25%' })
        void api.transitionTo('active')
        m.frames(5)
        expect(el.style.getPropertyValue('--o')).toBe('62.5%')
        expect(el.style.opacity).toBe('')
        dispose()
    })

    it('A6: a late ref is written with the current value at once', () => {
        const { m, api, dispose, owner } = setup()
        void api.transitionTo('active')
        m.frames(5)
        const late = document.createElement('div')
        runWithOwner(owner, () => api.ref(late))
        expect(Number(late.style.opacity)).toBeCloseTo(0.5, 5)
        m.frames(1)
        expect(Number(late.style.opacity)).toBeCloseTo(0.6, 5)
        dispose()
    })

    it('A7: cleaning up the owner disposes the machine and releases the element', async () => {
        const { m, el, api, dispose } = setup()
        void api.transitionTo('active')
        m.frames(2)
        expect(m.clock.size).toBe(1)
        const before = el.style.opacity

        dispose()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
        m.frames(2)
        expect(el.style.opacity).toBe(before)
        expect(await api.transitionTo('active')).toBe('disposed')
        expect(await api.machine.transitionTo('active')).toBe('disposed')
    })

    it('A7: creates and disposes cleanly 200 times without leaving clock subscribers', () => {
        const m = makeClock()
        for (let i = 0; i < 200; i++) {
            const el = document.createElement('div')
            const dispose = createRoot((d) => {
                const api = createAniStates({
                    initial: 'idle',
                    initialValue: { opacity: 0 },
                    states: makeStates(),
                    clock: m.clock,
                })
                api.ref(el)
                void api.transitionTo('active')
                return d
            })
            m.frames(1)
            dispose()
        }
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('A8: DOM events are not part of the primitive', () => {
        const m = makeClock()
        const el = document.createElement('div')
        const add = vi.spyOn(el, 'addEventListener')
        const dispose = createRoot((d) => {
            createAniStates({
                initial: 'idle',
                initialValue: { opacity: 0 },
                states: makeStates(),
                clock: m.clock,
            }).ref(el)
            return d
        })
        expect(add).not.toHaveBeenCalled()
        dispose()
    })
})
