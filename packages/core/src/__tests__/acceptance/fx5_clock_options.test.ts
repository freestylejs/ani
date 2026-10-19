import { describe, expect, it } from 'vitest'
import * as a from '../../index'
import { createClock, rafTimeline } from '../../index'
import { createManualClock } from '../../testing'

const loose = (fn: unknown) => fn as (arg: unknown) => unknown

function caught(fn: () => unknown): (Error & { code?: string }) | undefined {
    try {
        fn()
    } catch (error) {
        return error as Error & { code?: string }
    }
    return undefined
}

describe('FX5: clock options are validated', () => {
    it('C1: non-object arguments to configure throw ANI_INVALID_OPTIONS', () => {
        const clock = createClock()
        for (const arg of [0.1, 'x', true, [], null, undefined]) {
            const error = caught(() => loose(clock.configure.bind(clock))(arg))
            expect(error, String(arg)).toBeInstanceOf(TypeError)
            expect(error?.code, String(arg)).toBe('ANI_INVALID_OPTIONS')
        }
        const error = caught(() => loose(clock.configure.bind(clock))(0.1))
        expect(error?.message).toMatch(/maxDeltaTime: 0\.1/)
    })

    it('C2: unknown keys throw, naming the key', () => {
        const clock = createClock()
        const error = caught(() =>
            loose(clock.configure.bind(clock))({ maxDelta: 0.1 })
        )
        expect(error).toBeInstanceOf(TypeError)
        expect(error?.code).toBe('ANI_INVALID_OPTIONS')
        expect(error?.message).toMatch(/maxDelta\b/)
    })

    it('C3: nothing changes when configure throws', () => {
        const m = createManualClock({ lagThreshold: Number.POSITIVE_INFINITY })
        m.clock.configure({ maxDeltaTime: 0.05 })
        caught(() =>
            loose(m.clock.configure.bind(m.clock))({
                maxDeltaTime: 1,
                bogus: 1,
            })
        )
        const line = rafTimeline(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() }),
            { clock: m.clock }
        )
        line.play({ from: { x: 0 } })
        m.frames(5, 200)
        expect(line.value?.x ?? 0).toBeLessThanOrEqual(25 + 1e-9)
        line.dispose()
    })

    it('C4: valid calls still work', () => {
        const clock = createClock()
        expect(() => clock.configure({})).not.toThrow()
        expect(() => clock.configure({ lagThreshold: 0.3 })).not.toThrow()
        expect(() =>
            clock.configure({ lagThreshold: 0.3, maxDeltaTime: 0.1 })
        ).not.toThrow()
    })

    it('C5: createClock rejects unknown keys and non-objects', () => {
        expect(() => createClock()).not.toThrow()
        expect(() => createClock(undefined)).not.toThrow()
        for (const arg of [{ bogus: 1 }, 5, 'x', []]) {
            const error = caught(() => loose(createClock)(arg))
            expect(error, JSON.stringify(arg)).toBeInstanceOf(TypeError)
            expect(error?.code).toBe('ANI_INVALID_OPTIONS')
        }
    })
})
