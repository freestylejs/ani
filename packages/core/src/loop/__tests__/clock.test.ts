import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rafTimeline } from '~/ani/raf/timeline'
import { ani } from '~/nodes'
import { timing } from '~/timing'
import type { Animatable } from '../clock'
import { createClock, defaultClock, resetDefaultClock } from '../clock'
import { createFrameDriver } from './frame_driver'

describe('defaultClock', () => {
    beforeEach(() => {
        resetDefaultClock()
    })

    afterEach(() => {
        resetDefaultClock()
        vi.unstubAllGlobals()
    })

    it('should update maxDeltaTime via configure()', () => {
        let rafCallback: ((ts: number) => void) | undefined
        const requestAnimationFrame = vi.fn().mockImplementation((cb) => {
            rafCallback = cb
            return 1
        })
        const cancelAnimationFrame = vi.fn()
        const updates: number[] = []

        vi.stubGlobal('window', {
            requestAnimationFrame,
            cancelAnimationFrame,
        })
        vi.stubGlobal('performance', {
            now: () => 0,
        })

        defaultClock.configure({ maxDeltaTime: 0.01 })

        defaultClock.subscribe({
            update: (dt) => updates.push(dt),
        })

        rafCallback?.(1_000)
        expect(updates[0]).toBe(0.01)
    })

    it('should start one RAF loop for multiple subscribers', () => {
        const requestAnimationFrame = vi.fn().mockReturnValue(1)
        const cancelAnimationFrame = vi.fn()

        vi.stubGlobal('window', {
            requestAnimationFrame,
            cancelAnimationFrame,
        })
        vi.stubGlobal('performance', {
            now: () => 0,
        })

        const clock = defaultClock
        const first: Animatable = { update: vi.fn() }
        const second: Animatable = { update: vi.fn() }

        clock.subscribe(first)
        clock.subscribe(second)
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

        clock.unsubscribe(first)
        expect(cancelAnimationFrame).toHaveBeenCalledTimes(0)

        clock.unsubscribe(second)
        expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    })

    it('[configure] configuring again applies the latest value', () => {
        const driver = createFrameDriver()
        vi.stubGlobal('window', {
            requestAnimationFrame: driver.requestFrame,
            cancelAnimationFrame: driver.cancelFrame,
        })
        vi.stubGlobal('performance', { now: driver.now })
        const dts: number[] = []

        defaultClock.configure({ maxDeltaTime: 0.1 })
        defaultClock.configure({ maxDeltaTime: 0.2 })
        defaultClock.subscribe({ update: (dt) => dts.push(dt) })
        driver.frame(300)

        expect(dts).toEqual([0.2])
    })

    it('[configure] accepts timing options and applies them atomically', () => {
        const driver = createFrameDriver()
        vi.stubGlobal('window', {
            requestAnimationFrame: driver.requestFrame,
            cancelAnimationFrame: driver.cancelFrame,
        })
        vi.stubGlobal('performance', { now: driver.now })
        const dts: number[] = []

        defaultClock.configure({ lagThreshold: 2 })
        expect(() =>
            defaultClock.configure({ lagThreshold: 0.25, maxDeltaTime: -1 })
        ).toThrow(RangeError)
        defaultClock.subscribe({ update: (dt) => dts.push(dt) })
        driver.frame(1500)

        // lagThreshold stayed 2 (the rejected call changed nothing)
        expect(dts).toEqual([1.5])
    })

    it('[configure] rejects non-positive / NaN maxDeltaTime', () => {
        expect(() => createClock({ maxDeltaTime: 0 })).toThrow(RangeError)
        expect(() => createClock({ maxDeltaTime: Number.NaN })).toThrow(
            RangeError
        )
        expect(() => defaultClock.configure({ maxDeltaTime: -1 })).toThrow(
            RangeError
        )
        expect(() => createClock({ lagThreshold: 0 })).toThrow(RangeError)
        expect(() => createClock({ lagThreshold: Number.NaN })).toThrow(
            RangeError
        )
    })

    it('[configure] validates options loudly and atomically', () => {
        const loose = (fn: unknown) => fn as (arg: unknown) => unknown
        for (const arg of [0.05, 'bad', true, [], null, undefined]) {
            expect(() =>
                loose(defaultClock.configure.bind(defaultClock))(arg)
            ).toThrow(TypeError)
        }
        try {
            loose(defaultClock.configure.bind(defaultClock))(0.05)
        } catch (error) {
            expect((error as Error).message).toMatch(/maxDeltaTime: 0\.05/)
        }

        defaultClock.configure({ maxDeltaTime: 0.05 })
        expect(() =>
            loose(defaultClock.configure.bind(defaultClock))({
                maxDeltaTime: 0.1,
                unknownKey: true,
            })
        ).toThrow(/unknownKey/)

        // Atomic: maxDeltaTime remains 0.05
        const driver = createFrameDriver()
        vi.stubGlobal('window', {
            requestAnimationFrame: driver.requestFrame,
            cancelAnimationFrame: driver.cancelFrame,
        })
        vi.stubGlobal('performance', { now: driver.now })
        const dts: number[] = []
        defaultClock.subscribe({ update: (dt) => dts.push(dt) })
        driver.frame(200)
        expect(dts).toEqual([0.05])
    })
})

describe('createClock', () => {
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

    it('creates independent clocks with their own loops', () => {
        const a = make()
        const b = make()
        const updatesA = vi.fn()
        const updatesB = vi.fn()
        a.clock.subscribe({ update: updatesA })
        b.clock.subscribe({ update: updatesB })

        a.driver.frame()

        expect(updatesA).toHaveBeenCalledTimes(1)
        expect(updatesB).not.toHaveBeenCalled()
        expect(a.clock).not.toBe(defaultClock)
    })

    it('reports its size', () => {
        const { clock } = make()
        const one: Animatable = { update: vi.fn() }
        const two: Animatable = { update: vi.fn() }
        clock.subscribe(one)
        clock.subscribe(two)
        clock.subscribe(two)
        expect(clock.size).toBe(2)
        clock.unsubscribe(one)
        expect(clock.size).toBe(1)
    })

    describe('configure', () => {
        const record = () => {
            const { driver, clock } = make({ lagThreshold: Infinity })
            const dts: number[] = []
            clock.subscribe({ update: (dt) => dts.push(dt) })
            return { driver, clock, dts }
        }

        it('applies maxDeltaTime and lagThreshold from the next frame', () => {
            const { driver, clock, dts } = record()
            driver.frame(16)
            clock.configure({ maxDeltaTime: 0.05 })
            driver.frame(200)
            clock.configure({ lagThreshold: 0.1 })
            driver.frame(2000)
            expect(dts[1]).toBeCloseTo(0.05)
            // a gap above the threshold advances by one ordinary frame
            expect(dts[2]).toBeCloseTo(0.016)
        })

        it('is atomic: an invalid field changes nothing', () => {
            const { driver, clock, dts } = record()
            clock.configure({ maxDeltaTime: 0.05 })
            expect(() =>
                clock.configure({ lagThreshold: 0.2, maxDeltaTime: -1 })
            ).toThrow()
            expect(() =>
                clock.configure({ lagThreshold: Number.NaN })
            ).toThrow()
            driver.frame(16)
            driver.frame(1000)
            expect(dts[1]).toBeCloseTo(0.05)
        })
    })

    describe('lag smoothing (frame gap -> animation time)', () => {
        const record = (options: Parameters<typeof createClock>[0] = {}) => {
            const { driver, clock } = make(options)
            const dts: number[] = []
            clock.subscribe({ update: (dt) => dts.push(dt) })
            return { driver, clock, dts }
        }

        it('applies jank frames up to the threshold in full (no time dilation)', () => {
            const { driver, dts } = record()
            driver.frame(16)
            driver.frame(250)
            driver.frame(500)
            expect(dts[0]).toBeCloseTo(0.016)
            expect(dts[1]).toBeCloseTo(0.25)
            expect(dts[2]).toBeCloseTo(0.5)
        })

        it('advances a suspension (gap above the threshold) by the last ordinary frame', () => {
            const { driver, dts } = record()
            driver.frame(8)
            driver.frame(10_000)
            driver.frame(12)
            expect(dts[1]).toBeCloseTo(0.008)
            expect(dts[2]).toBeCloseTo(0.012)
        })

        it('a jank frame never becomes the suspension step', () => {
            const { driver, dts } = record()
            driver.frame(16)
            driver.frame(400)
            driver.frame(10_000)
            expect(dts[2]).toBeCloseTo(0.016)
        })

        it('uses 1/60 s for a suspension before any ordinary frame was seen', () => {
            const { driver, dts } = record()
            driver.frame(3000)
            expect(dts[0]).toBeCloseTo(1 / 60)
        })

        it('never passes negative or NaN deltas', () => {
            const { driver, dts } = record()
            driver.frame(-5)
            driver.frame(16)
            expect(dts[0]).toBe(0)
            expect(dts[1]).toBeCloseTo(0.016)
        })

        it('lagThreshold is configurable; Infinity gives pure wall-clock time', () => {
            const custom = record({ lagThreshold: 2 })
            custom.driver.frame(1500)
            custom.driver.frame(2500)
            expect(custom.dts[0]).toBeCloseTo(1.5)
            expect(custom.dts[1]).toBeCloseTo(1 / 60)

            const wall = record({ lagThreshold: Number.POSITIVE_INFINITY })
            wall.driver.frame(2500)
            expect(wall.dts).toEqual([2.5])
        })

        it('an explicit maxDeltaTime still caps every delta', () => {
            const { driver, dts } = record({ maxDeltaTime: 0.05 })
            driver.frame(250)
            driver.frame(16)
            expect(dts[0]).toBe(0.05)
            expect(dts[1]).toBeCloseTo(0.016)
        })

        it('the first update after joining a running loop follows the same rule', () => {
            const { driver, clock } = make()
            clock.subscribe({ update: vi.fn() })
            driver.frame(16)
            const late: number[] = []
            clock.subscribe({ update: (dt) => late.push(dt) })
            // joined, then the page was suspended for 8 s
            driver.frame(8000)
            expect(late[0]).toBeCloseTo(0.016)
        })
    })

    it('[C1-a] keeps a single pending frame while subscribers churn', () => {
        const { driver, clock } = make()
        const first: Animatable = { update: vi.fn() }
        const second: Animatable = { update: vi.fn() }
        clock.subscribe(first)
        clock.subscribe(second)
        clock.unsubscribe(first)
        clock.subscribe(first)
        expect(driver.pending).toBe(1)
        driver.frame()
        expect(driver.pending).toBe(1)
    })

    it('[S3] ending the last subscriber and subscribing another in the same tick keeps ONE loop', () => {
        const { driver, clock } = make()
        const next: Animatable & { calls: number } = {
            calls: 0,
            update() {
                this.calls++
            },
        }
        const last: Animatable = {
            update: () => {
                clock.unsubscribe(last)
                clock.subscribe(next)
            },
        }
        clock.subscribe(last)

        driver.frame()
        expect(driver.pending).toBe(1)
        expect(next.calls).toBe(0)

        driver.frame()
        driver.frame()
        expect(next.calls).toBe(2)
        expect(driver.pending).toBe(1)
    })

    it('[S3] chained rafTimelines (play next from ENDED handler) never multiply update calls', () => {
        const { driver, clock } = make()
        const updatesPerFrame: number[] = []
        let calls = 0
        const link = (i: number) => {
            const line = rafTimeline(
                ani({ to: { x: 1 }, duration: 0.05, timing: timing.linear() }),
                { clock }
            )
            line.onUpdate(({ status }) => {
                calls++
                if (status === 'ENDED' && i < 5) link(i + 1)
            })
            line.play({ from: { x: 0 } })
        }
        link(0)

        for (let f = 0; f < 40; f++) {
            calls = 0
            driver.frame()
            updatesPerFrame.push(calls)
            expect(driver.pending).toBeLessThanOrEqual(1)
        }
        // exactly one timeline runs at a time -> at most 2 notifications
        // (progress + ENDED) per frame, never one per accumulated loop
        expect(Math.max(...updatesPerFrame)).toBeLessThanOrEqual(3)
        expect(driver.pending).toBe(0)
    })

    describe('first update after joining (R2-2)', () => {
        const ms = (value: number) => value / 1000

        it('joining an idle clock advances by the frame delta (unchanged)', () => {
            const { driver, clock } = make()
            const dts: number[] = []
            clock.subscribe({ update: (dt) => dts.push(dt) })
            driver.frame(16)
            driver.frame(16)
            expect(dts[0]).toBeCloseTo(ms(16))
            expect(dts[1]).toBeCloseTo(ms(16))
        })

        it('joining between frames advances only by the time since subscribing', () => {
            const { driver, clock } = make()
            const early: number[] = []
            const late: number[] = []
            clock.subscribe({ update: (dt) => early.push(dt) })
            driver.frame(16)
            driver.setNow(driver.now() + 9) // 9 ms into the next frame interval
            clock.subscribe({ update: (dt) => late.push(dt) })
            driver.frame(7) // frame lands 16 ms after the previous one

            expect(early[1]).toBeCloseTo(ms(16))
            expect(late).toHaveLength(1)
            expect(late[0]).toBeCloseTo(ms(7))
            driver.frame(16)
            expect(late[1]).toBeCloseTo(ms(16))
        })

        it('joining inside a tick after simulated work advances from the join time', () => {
            const { driver, clock } = make()
            const joiner: number[] = []
            const joined: Animatable = { update: (dt) => joiner.push(dt) }
            let spawned = false
            const spawner: Animatable = {
                update: () => {
                    if (spawned) return
                    spawned = true
                    driver.setNow(driver.now() + 20) // 20 ms of main-thread work
                    clock.subscribe(joined)
                },
            }
            clock.subscribe(spawner)
            driver.frame(16)
            expect(joiner).toEqual([]) // first update is on the NEXT tick (M4)

            driver.frame(14) // next frame, 14 ms after the join
            expect(joiner).toHaveLength(1)
            expect(joiner[0]).toBeCloseTo(ms(14))
            driver.frame(16)
            expect(joiner[1]).toBeCloseTo(ms(16))
        })

        it('a join time in the future of the frame clamps to 0', () => {
            const { driver, clock } = make()
            clock.subscribe({ update: vi.fn() })
            driver.frame(16)
            const dts: number[] = []
            driver.setNow(driver.now() + 50)
            clock.subscribe({ update: (dt) => dts.push(dt) })
            driver.frame(-40)
            expect(dts).toEqual([0])
        })

        it('re-subscribing after unsubscribe starts from the new subscribe time', () => {
            const { driver, clock } = make()
            clock.subscribe({ update: vi.fn() })
            driver.frame(16)
            const dts: number[] = []
            const animatable: Animatable = { update: (dt) => dts.push(dt) }
            driver.setNow(driver.now() + 4)
            clock.subscribe(animatable)
            driver.setNow(driver.now() + 6)
            clock.unsubscribe(animatable)
            driver.setNow(driver.now() + 2)
            clock.subscribe(animatable)
            driver.frame(4)
            expect(dts).toHaveLength(1)
            expect(dts[0]).toBeCloseTo(ms(4))
        })

        it('maxDeltaTime still caps the first update', () => {
            const { driver, clock } = make({ maxDeltaTime: 0.01 })
            clock.subscribe({ update: vi.fn() })
            driver.frame(16)
            const dts: number[] = []
            clock.subscribe({ update: (dt) => dts.push(dt) })
            driver.frame(500)
            expect(dts).toEqual([0.01])
        })
    })

    it('[M4] a subscriber added during a tick is first updated on the next tick', () => {
        const { driver, clock } = make()
        const late: Animatable = { update: vi.fn() }
        const starter: Animatable = {
            update: () => {
                clock.subscribe(late)
                clock.unsubscribe(starter)
            },
        }
        clock.subscribe(starter)
        const other: Animatable = { update: vi.fn() }
        clock.subscribe(other)

        driver.frame()
        expect(late.update).not.toHaveBeenCalled()
        driver.frame()
        expect(late.update).toHaveBeenCalledTimes(1)
    })

    it('a subscriber removed by an earlier subscriber is skipped within the same tick', () => {
        const { driver, clock } = make()
        const victim: Animatable = { update: vi.fn() }
        const killer: Animatable = { update: () => clock.unsubscribe(victim) }
        clock.subscribe(killer)
        clock.subscribe(victim)
        driver.frame()
        expect(victim.update).not.toHaveBeenCalled()
    })

    it('[S1] a throwing subscriber does not stop others or the next frame (onError)', () => {
        const onError = vi.fn()
        const { driver, clock } = make({ onError })
        const boom = new Error('boom')
        const bad: Animatable = {
            update: () => {
                throw boom
            },
        }
        const good: Animatable = { update: vi.fn() }
        clock.subscribe(bad)
        clock.subscribe(good)

        driver.frame()
        driver.frame()

        expect(good.update).toHaveBeenCalledTimes(2)
        expect(onError).toHaveBeenCalledTimes(2)
        expect(onError).toHaveBeenCalledWith(boom)
        expect(driver.pending).toBe(1)
        expect(clock.size).toBe(2)
    })

    it('[S1] without onError, errors are rethrown asynchronously and the clock survives', () => {
        const rethrown: Array<() => void> = []
        vi.stubGlobal('queueMicrotask', (fn: () => void) => rethrown.push(fn))
        const { driver, clock } = make()
        const bad: Animatable = {
            update: () => {
                throw new Error('async-boom')
            },
        }
        const good: Animatable = { update: vi.fn() }
        clock.subscribe(bad)
        clock.subscribe(good)

        expect(() => driver.frame()).not.toThrow()
        expect(good.update).toHaveBeenCalledTimes(1)
        expect(rethrown).toHaveLength(1)
        expect(() => rethrown[0]!()).toThrow('async-boom')
        expect(driver.pending).toBe(1)
    })

    it('[S1] a throwing onUpdate callback of one timeline does not stall other timelines', () => {
        // timelines report callback errors asynchronously
        vi.stubGlobal('queueMicrotask', () => undefined)
        const { driver, clock } = make({ onError: () => undefined })
        const bad = rafTimeline(
            ani({ to: { x: 1 }, duration: 1, timing: timing.linear() }),
            { clock }
        )
        bad.onUpdate(() => {
            throw new Error('ui bug')
        })
        const good = rafTimeline(
            ani({ to: { x: 100 }, duration: 1, timing: timing.linear() }),
            { clock }
        )
        good.play({ from: { x: 0 } })
        try {
            bad.play({ from: { x: 0 } })
        } catch {
            // play() notifies synchronously; the callback error may surface here
        }

        for (let i = 0; i < 5; i++) driver.frame(100)

        expect((good.value as { x: number }).x).toBeCloseTo(50)
    })

    it('[V1] recovers when the environment dropped the pending frame', () => {
        const { driver, clock } = make()
        const first: Animatable = { update: vi.fn() }
        clock.subscribe(first)
        driver.drop() // pending frame lost, clock still believes one is queued

        // other subscribers arriving much later must restart the loop
        driver.setNow(driver.now() + 5000)
        const second: Animatable = { update: vi.fn() }
        clock.subscribe(second)
        driver.frame()

        expect(first.update).toHaveBeenCalledTimes(1)
        expect(second.update).toHaveBeenCalledTimes(1)
        expect(driver.pending).toBe(1)
    })

    it('[V1] default clock restarts after the window / rAF stub is replaced', () => {
        resetDefaultClock()
        const stubWindow = () => {
            const driver = createFrameDriver()
            vi.stubGlobal('window', {
                requestAnimationFrame: driver.requestFrame,
                cancelAnimationFrame: driver.cancelFrame,
            })
            vi.stubGlobal('performance', { now: driver.now })
            return driver
        }
        const clock = defaultClock
        const stale: Animatable = { update: vi.fn() }
        const first = stubWindow()
        clock.subscribe(stale)
        expect(first.pending).toBe(1)

        // test-runner style reinstall: new rAF, old queue gone
        const second = stubWindow()
        const fresh: Animatable = { update: vi.fn() }
        clock.subscribe(fresh)
        second.frame()

        expect(fresh.update).toHaveBeenCalledTimes(1)
        expect(stale.update).toHaveBeenCalledTimes(1)
        resetDefaultClock()
    })

    it('[H3] without a frame source subscribe neither throws nor retains', () => {
        vi.stubGlobal('window', undefined)
        vi.stubGlobal('requestAnimationFrame', undefined)
        const clock = createClock()
        const animatable: Animatable = { update: vi.fn() }

        expect(() => clock.subscribe(animatable)).not.toThrow()
        expect(clock.size).toBe(0)
        expect(() => clock.unsubscribe(animatable)).not.toThrow()
    })

    it('[H3] timeline.play() is safe without a frame source', () => {
        vi.stubGlobal('window', undefined)
        vi.stubGlobal('requestAnimationFrame', undefined)
        resetDefaultClock()
        const line = rafTimeline(
            ani({ to: { x: 1 }, duration: 1, timing: timing.linear() })
        )
        expect(() => line.play({ from: { x: 0 } })).not.toThrow()
        expect(defaultClock.size).toBe(0)
    })

    it('[H3] uses globalThis.requestAnimationFrame when there is no window (worker)', () => {
        const driver = createFrameDriver()
        vi.stubGlobal('window', undefined)
        vi.stubGlobal('requestAnimationFrame', driver.requestFrame)
        vi.stubGlobal('cancelAnimationFrame', driver.cancelFrame)
        vi.stubGlobal('performance', { now: driver.now })
        const clock = createClock()
        const animatable: Animatable = { update: vi.fn() }
        clock.subscribe(animatable)
        driver.frame()
        expect(animatable.update).toHaveBeenCalledTimes(1)
    })

    it('dispose() stops the loop and drops subscribers', () => {
        const { driver, clock } = make()
        const animatable: Animatable = { update: vi.fn() }
        clock.subscribe(animatable)
        clock.dispose()
        expect(driver.pending).toBe(0)
        expect(clock.size).toBe(0)
        driver.frame()
        expect(animatable.update).not.toHaveBeenCalled()
    })

    it('resetDefaultClock() keeps the default clock instance and restores its defaults', () => {
        const first = defaultClock
        first.configure({ maxDeltaTime: 0.01 })
        first.timeScale = 2
        first.subscribe({ update: vi.fn() })
        resetDefaultClock()
        expect(defaultClock).toBe(first)
        expect(first.size).toBe(0)
        expect(first.timeScale).toBe(1)
        resetDefaultClock()
    })

    it('rejects unknown keys and non-objects loudly', () => {
        const loose = (fn: unknown) => fn as (arg: unknown) => unknown
        expect(() => createClock()).not.toThrow()
        expect(() => createClock(undefined)).not.toThrow()
        expect(() => createClock({})).not.toThrow()
        for (const arg of ['string', 123, true, [], null]) {
            expect(() => loose(createClock)(arg)).toThrow(TypeError)
        }
        expect(() => loose(createClock)({ unknownOpt: 1 })).toThrow(
            /unknownOpt/
        )
    })
})

describe('clock.inFrame', () => {
    it('is true in every phase of a frame and false outside, also after a throw', () => {
        const driver = createFrameDriver()
        const errors: unknown[] = []
        const clock = createClock({
            requestFrame: driver.requestFrame,
            cancelFrame: driver.cancelFrame,
            now: driver.now,
            onError: (error) => errors.push(error),
        })
        const seen: boolean[] = []
        expect(clock.inFrame).toBe(false)
        clock.read(() => seen.push(clock.inFrame))
        const animatable: Animatable = {
            read: () => seen.push(clock.inFrame),
            update: () => seen.push(clock.inFrame),
            commit: () => seen.push(clock.inFrame),
        }
        clock.subscribe(animatable)
        driver.frame()
        driver.frame()
        expect(seen.length).toBeGreaterThanOrEqual(4)
        expect(seen.every(Boolean)).toBe(true)
        expect(clock.inFrame).toBe(false)
        clock.unsubscribe(animatable)
        clock.subscribe({
            update: () => {
                throw new Error('boom')
            },
        })
        driver.frame()
        expect(errors).toHaveLength(1)
        expect(clock.inFrame).toBe(false)
        clock.dispose()
    })
})
