// @vitest-environment jsdom

import {
    a,
    type RafAniTimeline,
    rafGroup,
    rafTimeline,
} from '@freestylejs/ani-core'
import { get, writable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackSubscriptions } from '../../../../core/src/__tests__/integration/harness'
import { createManualClock } from '../../../../core/src/testing'
import { useAni, useTimeline } from '../../index'

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

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

describe('FSVELTE: useTimeline and useAni', () => {
    beforeEach(() => {
        scope.destroyers.length = 0
    })
    afterEach(() => {
        scope.destroyers.length = 0
    })

    it('A1: useTimeline returns what the factory made and calls it once', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const factory = vi.fn(() => rafTimeline(node(), { clock: m.clock }))
        const timeline = useTimeline(factory)
        expect(factory).toHaveBeenCalledTimes(1)
        expect(typeof timeline.play).toBe('function')
        expect(timeline.status).toBe('IDLE')
        expect(factory.mock.results[0]?.value).toBe(timeline)
    })

    it('A2: useTimeline disposes the object in onDestroy, not before, and only once', () => {
        const owned = { dispose: vi.fn() }
        const result = useTimeline(() => owned)
        expect(result).toBe(owned)
        expect(owned.dispose).not.toHaveBeenCalled()
        destroyScope()
        expect(owned.dispose).toHaveBeenCalledTimes(1)
        destroyScope()
        expect(owned.dispose).toHaveBeenCalledTimes(1)
    })

    it('A3: a disposed rafTimeline leaves the clock and settles its run as disposed', async () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const timeline = useTimeline(() =>
            rafTimeline(node(), { clock: m.clock })
        )
        const run = timeline.play({ from: { opacity: 0 } })
        m.frames(2, 100)
        expect(m.clock.size).toBe(1)
        destroyScope()
        expect(m.clock.size).toBe(0)
        await expect(run).resolves.toBe('disposed')
        await expect(timeline.play({ from: { opacity: 0 } })).resolves.toBe(
            'disposed'
        )
    })

    it('A4: useTimeline owns a rafGroup as well', async () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const group = useTimeline(() => rafGroup(node(), { clock: m.clock }))
        const run = group.play({ from: { opacity: 0 }, count: 2 })
        m.frame(100)
        destroyScope()
        expect(m.clock.size).toBe(0)
        await expect(run).resolves.toBe('disposed')
    })

    it('A5: two owners in one scope are both disposed', () => {
        const first = { dispose: vi.fn() }
        const second = { dispose: vi.fn() }
        useTimeline(() => first)
        useTimeline(() => second)
        destroyScope()
        expect(first.dispose).toHaveBeenCalledTimes(1)
        expect(second.dispose).toHaveBeenCalledTimes(1)
    })

    it('A6: misuse throws synchronously: a factory that is not a function, or an object without dispose', () => {
        expect(() => useTimeline(undefined as never)).toThrow()
        expect(() => useTimeline((() => ({})) as never)).toThrow()
        expect(() => useTimeline((() => null) as never)).toThrow()
    })

    it('A7: an error thrown by the factory propagates and leaves nothing to dispose', () => {
        const boom = new Error('factory failed')
        expect(() =>
            useTimeline(() => {
                throw boom
            })
        ).toThrow(boom)
        expect(() => destroyScope()).not.toThrow()
    })

    it('B1: useAni returns the store and the timeline itself, with the initial value', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const timeline = rafTimeline(node(), { clock: m.clock })
        const [store, returned] = useAni(timeline, { opacity: 0.1 })
        expect(returned).toBe(timeline)
        expect(get(store)).toEqual({ opacity: 0.1 })
    })

    it('B2: useAni store follows the frames of the timeline', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const timeline = rafTimeline(node(), { clock: m.clock })
        const [store] = useAni(timeline, { opacity: 0.1 })
        const seen: number[] = []
        const unsubscribe = store.subscribe((v) => seen.push(v.opacity))
        expect(seen[0]).toBe(0.1)
        timeline.play({ from: { opacity: 0 } })
        m.frames(5, 100)
        expect(seen.at(-1)).toBeCloseTo(0.5, 5)
        m.frames(5, 100)
        expect(seen.at(-1)).toBeCloseTo(1, 5)
        unsubscribe()
    })

    it('B3: useAni uses the current value of a timeline that already runs', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const timeline = rafTimeline(node(), { clock: m.clock })
        timeline.play({ from: { opacity: 0.6 } })
        const [store] = useAni(timeline, { opacity: 0.1 })
        expect(get(store).opacity).toBe(0.6)
    })

    it('B4: useAni follows a timeline store and detaches the replaced timeline', () => {
        const first = createManualClock({ lagThreshold: Infinity })
        const second = createManualClock({ lagThreshold: Infinity })
        const a1 = rafTimeline(node(), { clock: first.clock })
        const a2 = rafTimeline(node(), { clock: second.clock })
        a2.play({ from: { opacity: 0.8 } })
        const source = writable<RafAniTimeline<{ opacity: number }>>(a1)
        const [store] = useAni(source, { opacity: 0.1 })
        const seen: number[] = []
        const unsubscribe = store.subscribe((v) => seen.push(v.opacity))
        a1.play({ from: { opacity: 0 } })
        first.frames(5, 100)
        expect(seen.at(-1)).toBeCloseTo(0.5, 5)

        source.set(a2)
        expect(seen.at(-1)).toBe(0.8)
        const count = seen.length
        first.frames(2, 100)
        expect(seen).toHaveLength(count)
        second.frames(5, 100)
        expect(seen.at(-1)).toBeCloseTo(0.9, 5)
        unsubscribe()
    })

    it('B5: useAni retains no subscription without store subscribers and never disposes the timeline', async () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const timeline = rafTimeline(node(), { clock: m.clock })
        const subs = trackSubscriptions(timeline)
        const [store] = useAni(timeline, { opacity: 0 })
        expect(subs.live).toBe(0)
        const unsubscribe = store.subscribe(() => undefined)
        expect(subs.live).toBe(1)
        unsubscribe()
        expect(subs.live).toBe(0)
        for (let i = 0; i < 500; i++) store.subscribe(() => undefined)()
        expect(subs.live).toBe(0)
        destroyScope()
        const run = timeline.play({ from: { opacity: 0 } })
        m.frames(20, 100)
        await expect(run).resolves.toBe('ended')
    })
})
