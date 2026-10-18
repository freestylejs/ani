// @vitest-environment jsdom

import {
    a,
    createClock,
    follow,
    rafGroup,
    rafTimeline,
} from '@freestylejs/ani-core'
import { createEffect, createRoot, createSignal } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import * as solid from '../../index'

interface Disposable {
    dispose(): void
}

const { createTimeline } = solid as unknown as {
    createTimeline<T extends Disposable>(factory: () => T): T
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

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

describe('FSOLID: createTimeline', () => {
    it('A1: returns what the factory returns, calling it once, synchronously', () => {
        const object = { dispose: vi.fn() }
        const factory = vi.fn(() => object)
        let result: Disposable | undefined
        const dispose = createRoot((d) => {
            result = createTimeline(factory)
            expect(factory).toHaveBeenCalledTimes(1)
            return d
        })
        expect(result).toBe(object)
        expect(factory).toHaveBeenCalledTimes(1)
        dispose()
    })

    it('A2: disposes the object exactly once, when the owner is cleaned up', () => {
        const object = { dispose: vi.fn() }
        const dispose = createRoot((d) => {
            createTimeline(() => object)
            return d
        })
        expect(object.dispose).not.toHaveBeenCalled()
        dispose()
        expect(object.dispose).toHaveBeenCalledTimes(1)
        dispose()
        expect(object.dispose).toHaveBeenCalledTimes(1)
    })

    it('A3: stops a playing rafTimeline with its owner', () => {
        const m = makeClock()
        const dispose = createRoot((d) => {
            const timeline = createTimeline(() =>
                rafTimeline(node(), { clock: m.clock })
            )
            void timeline.play({ from: { opacity: 0 }, repeat: Infinity })
            return d
        })
        m.frames(3)
        expect(m.clock.size).toBe(1)
        dispose()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('A4: works with every object that has dispose(): groups and followers', () => {
        const m = makeClock()
        const dispose = createRoot((d) => {
            const group = createTimeline(() =>
                rafGroup(node(), { clock: m.clock })
            )
            void group.play({
                from: { opacity: 0 },
                count: 2,
                repeat: Infinity,
            })
            const follower = createTimeline(() =>
                follow({ opacity: 0 }, { clock: m.clock })
            )
            void follower.set({ opacity: 1 })
            return d
        })
        m.frames(2, 16)
        expect(m.clock.size).toBe(2)
        dispose()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('A5: a re-running scope disposes the previous object before the next lives on', () => {
        const created: Array<{ dispose: ReturnType<typeof vi.fn> }> = []
        const [version, setVersion] = createSignal(0)
        const dispose = createRoot((d) => {
            createEffect(() => {
                version()
                createTimeline(() => {
                    const object = { dispose: vi.fn() }
                    created.push(object)
                    return object
                })
            })
            return d
        })
        expect(created).toHaveLength(1)
        setVersion(1)
        expect(created).toHaveLength(2)
        expect(created[0]?.dispose).toHaveBeenCalledTimes(1)
        expect(created[1]?.dispose).not.toHaveBeenCalled()
        dispose()
        expect(created[1]?.dispose).toHaveBeenCalledTimes(1)
        expect(created[0]?.dispose).toHaveBeenCalledTimes(1)
    })

    it('A6: a throwing factory throws synchronously', () => {
        createRoot((dispose) => {
            expect(() =>
                createTimeline(() => {
                    throw new Error('factory exploded')
                })
            ).toThrow('factory exploded')
            dispose()
        })
    })
})
