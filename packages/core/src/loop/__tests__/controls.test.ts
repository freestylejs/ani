import { describe, expect, it } from 'vitest'
import { createClock } from '../clock'
import { createFrameDriver } from './frame_driver'

const noop = (): void => undefined

function setup(options: Parameters<typeof createClock>[0] = {}) {
    const driver = createFrameDriver()
    const errors: unknown[] = []
    const clock = createClock({
        requestFrame: driver.requestFrame,
        cancelFrame: driver.cancelFrame,
        now: driver.now,
        onError: (error) => errors.push(error),
        visibility: false,
        ...options,
    })
    return { driver, clock, errors }
}

describe('clock controls', () => {
    it('timeScale multiplies the delta after the maxDeltaTime cap', () => {
        const { driver, clock } = setup({ maxDeltaTime: 0.01, timeScale: 2 })
        const deltas: number[] = []
        clock.subscribe({ update: (dt) => deltas.push(dt) })
        driver.frame(16)
        expect(deltas[0]).toBeCloseTo(0.02, 6)
    })

    it('pause from inside an update stops the loop after that tick', () => {
        const { driver, clock } = setup()
        let calls = 0
        clock.subscribe({
            update: () => {
                calls++
                clock.pause()
            },
        })
        driver.frame()
        expect(calls).toBe(1)
        expect(clock.paused).toBe(true)
        expect(driver.pending).toBe(0)
        expect(clock.size).toBe(1)

        clock.resume()
        expect(driver.pending).toBe(1)
        driver.frame()
        expect(calls).toBe(2)
    })

    it('resume from inside the same tick keeps a single pending frame', () => {
        const { driver, clock } = setup()
        clock.subscribe({
            update: () => {
                clock.pause()
                clock.resume()
            },
        })
        driver.frame()
        expect(clock.paused).toBe(false)
        expect(driver.pending).toBe(1)
    })

    it('a subscriber added between pause and resume gets the time since resume', () => {
        const { driver, clock } = setup()
        const deltas: number[] = []
        clock.subscribe({ update: noop })
        driver.frame(16)
        driver.setNow(driver.now() + 1000)
        // joins while the loop is alive, then the clock pauses before it ran
        clock.subscribe({ update: (dt) => deltas.push(dt) })
        clock.pause()
        driver.setNow(driver.now() + 5000)
        clock.resume()
        driver.frame(10)
        expect(deltas).toHaveLength(1)
        expect(deltas[0]).toBeCloseTo(0.01, 6)
    })

    it('pause releases the visibility listener and resume re-attaches it', () => {
        const listeners = new Set<() => void>()
        const { driver, clock } = setup({
            visibility: {
                hidden: false,
                addEventListener: (_, listener) => listeners.add(listener),
                removeEventListener: (_, listener) =>
                    listeners.delete(listener),
            },
        })
        clock.subscribe({ update: noop })
        driver.frame()
        expect(listeners.size).toBe(1)
        clock.pause()
        expect(listeners.size).toBe(0)
        clock.resume()
        expect(listeners.size).toBe(1)
    })

    it('a subscriber that unsubscribes itself while failing is not quarantined', () => {
        const { driver, clock, errors } = setup()
        const sub = {
            update: () => {
                clock.unsubscribe(sub)
                throw new Error('boom')
            },
        }
        clock.subscribe(sub)
        driver.frame()
        expect(errors).toHaveLength(1)
        expect(clock.size).toBe(0)
    })

    it('dispose forgets failure counts', () => {
        const { driver, clock, errors } = setup()
        const boom = new Error('boom')
        const sub = {
            update: () => {
                throw boom
            },
        }
        clock.subscribe(sub)
        driver.frame()
        driver.frame()
        clock.dispose()
        clock.subscribe(sub)
        driver.frame()
        driver.frame()
        expect(clock.size).toBe(1)
        expect(errors).toEqual([boom, boom, boom, boom])
    })
})
