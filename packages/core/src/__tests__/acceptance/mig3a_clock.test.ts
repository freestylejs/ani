import { afterEach, describe, expect, it } from 'vitest'
import * as a from '../../index'
import { defaultClock, rafTimeline } from '../../index'
import { createManualClock, resetDefaultClock } from '../../testing'

const move = () =>
    a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() })

afterEach(() => {
    resetDefaultClock()
})

describe('MIG3a: instance `clock.configure`', () => {
    it('C1: `configure({ maxDeltaTime })` caps each frame', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        m.clock.configure({ maxDeltaTime: 0.05 })
        const line = rafTimeline(move(), { clock: m.clock })
        line.play({ from: { x: 0 } })
        m.frames(5, 200)
        const x = line.value?.x ?? 0
        expect(x).toBeGreaterThan(0)
        expect(x).toBeLessThanOrEqual(25 + 1e-9)
        line.dispose()
    })

    it('C2: an invalid `configure` throws and changes nothing (atomic)', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        m.clock.configure({ maxDeltaTime: 0.05 })
        expect(() =>
            m.clock.configure({ maxDeltaTime: 1, lagThreshold: -1 })
        ).toThrow()
        expect(() => m.clock.configure({ maxDeltaTime: Number.NaN })).toThrow()

        const line = rafTimeline(move(), { clock: m.clock })
        line.play({ from: { x: 0 } })
        m.frames(5, 200)
        expect(line.value?.x ?? 0).toBeLessThanOrEqual(25 + 1e-9)
        line.dispose()
    })

    it('C3: `defaultClock.configure` accepts the same options', () => {
        expect(() =>
            defaultClock.configure({ maxDeltaTime: 0.1, lagThreshold: 0.3 })
        ).not.toThrow()
    })
})
