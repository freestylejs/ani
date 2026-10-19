import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Animatable } from '../clock'
import { createClock } from '../clock'
import { createFrameDriver } from './frame_driver'

/**
 * `VisibilitySource` fake: `setHidden` records the state at event time, like
 * a real `visibilitychange` dispatch does.
 */
function createVisibilityProbe() {
    const listeners = new Set<() => void>()
    const source = {
        hidden: false,
        addEventListener: (_: 'visibilitychange', listener: () => void) => {
            listeners.add(listener)
        },
        removeEventListener: (_: 'visibilitychange', listener: () => void) => {
            listeners.delete(listener)
        },
    }
    return {
        listeners,
        source,
        setHidden(hidden: boolean): void {
            source.hidden = hidden
            for (const listener of [...listeners]) listener()
        },
    }
}

describe('clock visibility (M3)', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    const make = (options: Parameters<typeof createClock>[0] = {}) => {
        const driver = createFrameDriver()
        const clock = createClock({
            requestFrame: driver.requestFrame,
            cancelFrame: driver.cancelFrame,
            now: driver.now,
            ...options,
        })
        return { driver, clock }
    }

    it('a hidden event suspends the next frame; the one after applies real time', () => {
        const probe = createVisibilityProbe()
        const { driver, clock } = make({ visibility: probe.source })
        const dts: number[] = []
        clock.subscribe({ update: (dt) => dts.push(dt) })
        driver.frame(20)
        driver.frame(20)
        expect(probe.listeners.size).toBe(1)

        probe.setHidden(true)
        driver.setNow(driver.now() + 300)
        probe.setHidden(false)
        driver.frame(20)
        expect(dts[2]).toBeCloseTo(0.02)

        driver.frame(30)
        expect(dts[3]).toBeCloseTo(0.03)
    })

    it('the default `true` resolves globalThis.document lazily', () => {
        const probe = createVisibilityProbe()
        vi.stubGlobal('document', probe.source)
        const { driver, clock } = make()
        const animatable: Animatable = { update: () => undefined }
        expect(probe.listeners.size).toBe(0)

        clock.subscribe(animatable)
        expect(probe.listeners.size).toBe(1)
        probe.setHidden(true)
        driver.frame(10)
        clock.unsubscribe(animatable)
        expect(probe.listeners.size).toBe(0)
    })

    it('a document without addEventListener / removeEventListener is a no-op', () => {
        vi.stubGlobal('document', { hidden: true })
        const { driver, clock } = make()
        const dts: number[] = []
        clock.subscribe({ update: (dt) => dts.push(dt) })
        expect(() => driver.frame(300)).not.toThrow()
        expect(dts).toEqual([0.3])
    })

    it('a joiner of a suspended frame never advances more than its own elapsed time', () => {
        const probe = createVisibilityProbe()
        const { driver, clock } = make({ visibility: probe.source })
        clock.subscribe({ update: () => undefined })
        driver.frame(20) // ordinary frame: 0.02

        driver.setNow(driver.now() + 5)
        const late: number[] = []
        clock.subscribe({ update: (dt) => late.push(dt) })
        probe.setHidden(true)
        driver.frame(10) // suspended: own elapsed 10 ms < ordinary 20 ms

        expect(late[0]).toBeCloseTo(0.01)
    })

    it('an attach failure is reported once, never on every re-arm', () => {
        const failure = new Error('attach failed')
        const errors: unknown[] = []
        let calls = 0
        const { driver, clock } = make({
            visibility: {
                hidden: false,
                addEventListener: () => {
                    calls++
                    throw failure
                },
                removeEventListener: () => undefined,
            },
            onError: (error) => errors.push(error),
        })
        clock.subscribe({ update: () => undefined })
        driver.frame(16)
        driver.frame(16)
        driver.frame(16)
        expect(calls).toBe(1)
        expect(errors).toEqual([failure])
        expect(clock.size).toBe(1)
    })

    it('a detach failure is reported and never breaks dispose', () => {
        const failure = new Error('detach failed')
        const errors: unknown[] = []
        const { clock } = make({
            visibility: {
                hidden: false,
                addEventListener: () => undefined,
                removeEventListener: () => {
                    throw failure
                },
            },
            onError: (error) => errors.push(error),
        })
        clock.subscribe({ update: () => undefined })

        expect(() => clock.dispose()).not.toThrow()
        expect(errors).toEqual([failure])
        expect(clock.size).toBe(0)
    })

    it('a hidden event observed before dispose does not leak into the next run', () => {
        const probe = createVisibilityProbe()
        const { driver, clock } = make({ visibility: probe.source })
        clock.subscribe({ update: () => undefined })
        probe.setHidden(true)

        clock.dispose()
        const dts: number[] = []
        clock.subscribe({ update: (dt) => dts.push(dt) })
        driver.frame(40)
        expect(dts[0]).toBeCloseTo(0.04)
    })

    it('rejects every non-source, non-boolean value with a TypeError', () => {
        const invalid: unknown[] = [
            null,
            0,
            'visibility',
            { hidden: false },
            { hidden: false, addEventListener: () => undefined },
            {
                hidden: 1,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            },
        ]
        for (const value of invalid) {
            expect(
                () =>
                    createClock({
                        visibility: value,
                    } as Parameters<typeof createClock>[0]),
                `visibility: ${String(value)}`
            ).toThrowError(TypeError)
        }
    })
})
