import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RunResult } from '~/ani/core'
import {
    a,
    createTimelineController,
    type RafAniTimeline,
    type RafTimelineConfig,
    rafTimeline,
} from '../../index'
import { createManualClock } from '../../testing'

type Values = { x: number }

const node = () =>
    a.ani({ to: { x: 100 }, duration: 2, timing: a.timing.linear() })

const FROM: Values = { x: 0 }

/** `drive` is not on the public types yet: reach it through one typed seam. */
interface Driver {
    drive(progress: () => number, config: RafTimelineConfig<Values>): () => void
}

function driver(timeline: unknown): Driver {
    return timeline as Driver
}

// Timelines report asynchronous errors via queueMicrotask(() => { throw e }).
let reported: unknown[]
const originalQueueMicrotask = globalThis.queueMicrotask
beforeEach(() => {
    reported = []
    globalThis.queueMicrotask = (task: () => void) => {
        try {
            task()
        } catch (error) {
            reported.push(error)
        }
    }
})
afterEach(() => {
    globalThis.queueMicrotask = originalQueueMicrotask
})

/** `{ style }` that records every write (assignment or `setProperty`). */
function fakeElement() {
    const current: Record<string, unknown> = {}
    const writes: string[] = []
    const record = (prop: string, value: unknown) => {
        writes.push(prop)
        current[prop] = value
    }
    const style = new Proxy({} as Record<string, unknown>, {
        set(_target, prop, value) {
            record(String(prop), value)
            return true
        },
        get(_target, prop) {
            if (prop === 'setProperty') return record
            return current[String(prop)]
        },
    })
    return {
        style: style as unknown as CSSStyleDeclaration,
        current,
        writes,
    }
}

const toCustomProperty = {
    x: (value: number) => ({ key: '--x', value }),
}

function setup(options: { reducedMotion: boolean } = { reducedMotion: false }) {
    const manual = createManualClock({
        lagThreshold: Infinity,
        reducedMotion: options.reducedMotion,
    })
    const timeline = rafTimeline(node(), manual.clock)
    const element = fakeElement()
    timeline.bind(element, { resolver: toCustomProperty })
    const notifications: { x: number; status: string }[] = []
    timeline.onUpdate(({ state, status }) => {
        notifications.push({ x: (state as Values).x, status })
    })
    let p = 0
    const progress = {
        calls: 0,
        get value() {
            return p
        },
        set value(next: number) {
            p = next
        },
        read: () => {
            progress.calls++
            return p
        },
    }
    return { manual, timeline, element, notifications, progress }
}

function x(timeline: RafAniTimeline<Values>): number {
    return (timeline.getCurrentValue() as Values).x
}

function track(promise: Promise<RunResult>) {
    const results: RunResult[] = []
    promise.then((result) => {
        results.push(result)
    })
    return results
}

async function flush() {
    for (let i = 0; i < 4; i++) await Promise.resolve()
}

describe('DRV: timeline.drive(progress, config)', () => {
    it('A1: the first value is computed synchronously with one notification', () => {
        const { timeline, element, notifications, progress } = setup()

        driver(timeline).drive(progress.read, { from: FROM })

        expect(progress.calls).toBe(1)
        expect(x(timeline)).toBe(0)
        expect(timeline.status).toBe('PLAYING')
        expect(notifications).toEqual([{ x: 0, status: 'PLAYING' }])
        expect(Number(element.current['--x'])).toBe(0)
        expect(reported).toEqual([])
    })

    it('A1: the first value honors a progress that is already advanced', () => {
        const { timeline, notifications, progress } = setup()
        progress.value = 0.5

        driver(timeline).drive(progress.read, { from: FROM })

        expect(x(timeline)).toBe(50)
        expect(notifications).toEqual([{ x: 50, status: 'PLAYING' }])
    })

    it('A1: time follows the progress, is clamped, and never ends by itself', () => {
        const { manual, timeline, element, notifications, progress } = setup()
        driver(timeline).drive(progress.read, { from: FROM })

        progress.value = 0.25
        manual.frame()
        expect(x(timeline)).toBe(25)
        expect(Number(element.current['--x'])).toBe(25)
        expect(notifications[notifications.length - 1]).toEqual({
            x: 25,
            status: 'PLAYING',
        })

        progress.value = 1
        manual.frame()
        expect(x(timeline)).toBe(100)
        expect(timeline.status).toBe('PLAYING')
        manual.frames(3)
        expect(timeline.status).toBe('PLAYING')
        expect(notifications.some((n) => n.status === 'ENDED')).toBe(false)

        progress.value = 2
        manual.frame()
        expect(x(timeline)).toBe(100)
        expect(timeline.status).toBe('PLAYING')

        progress.value = -1
        manual.frame()
        expect(x(timeline)).toBe(0)
        expect(timeline.status).toBe('PLAYING')

        // the progress can move back and forth freely
        progress.value = 0.75
        manual.frame()
        expect(x(timeline)).toBe(75)
        expect(reported).toEqual([])
    })

    it('A1: the progress is mapped onto the whole duration, not onto one frame delta', () => {
        const { manual, timeline, progress } = setup()
        driver(timeline).drive(progress.read, { from: FROM })

        progress.value = 0.5
        manual.frame(1)
        expect(x(timeline)).toBe(50)
        progress.value = 0.1
        manual.frame(5000)
        expect(x(timeline)).toBeCloseTo(10, 10)
    })

    it('A1: durations overrides are honored', () => {
        const { manual, timeline, progress } = setup()
        driver(timeline).drive(progress.read, {
            from: FROM,
            durations: [4],
        })
        expect(timeline.duration).toBe(4)

        progress.value = 0.5
        manual.frame()
        expect(x(timeline)).toBe(50)
        expect(timeline.getCurrentValue()).toEqual({ x: 50 })
    })

    it('A1: repeat and delay are ignored for a driven run', () => {
        const { manual, timeline, progress } = setup()
        driver(timeline).drive(progress.read, {
            from: FROM,
            repeat: 3,
            delay: 500,
        })

        progress.value = 0.5
        manual.frame(16)
        expect(x(timeline)).toBe(50)

        progress.value = 1
        manual.frame(16)
        expect(x(timeline)).toBe(100)
        manual.frames(5, 1000)
        expect(x(timeline)).toBe(100)
        expect(timeline.status).toBe('PLAYING')
    })

    it('A2: progress() is sampled in the read phase, once per frame', () => {
        const { manual, timeline } = setup()
        const log: string[] = []
        manual.clock.subscribe({
            update: () => {
                log.push('probe-update')
            },
        })
        let p = 0
        driver(timeline).drive(
            () => {
                log.push('progress')
                return p
            },
            { from: FROM }
        )
        log.length = 0

        p = 0.5
        manual.frame()
        expect(log).toEqual(['progress', 'probe-update'])

        log.length = 0
        manual.frames(3)
        expect(log).toEqual([
            'progress',
            'probe-update',
            'progress',
            'probe-update',
            'progress',
            'probe-update',
        ])
    })

    it('A2: a probe subscribed after the timeline also sees the sampled progress', () => {
        const { manual, timeline } = setup()
        const log: string[] = []
        let p = 0
        driver(timeline).drive(
            () => {
                log.push('progress')
                return p
            },
            { from: FROM }
        )
        manual.clock.subscribe({
            update: () => {
                log.push('probe-update')
            },
        })
        log.length = 0

        p = 0.5
        manual.frame()
        expect(log).toEqual(['progress', 'probe-update'])
    })

    it('A3: frames where the progress did not change write and notify nothing', () => {
        const { manual, timeline, element, notifications, progress } = setup()
        driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.25
        manual.frame()
        const writes = element.writes.length
        const seen = notifications.length
        expect(seen).toBeGreaterThanOrEqual(2)

        manual.frames(5)
        expect(element.writes.length).toBe(writes)
        expect(notifications.length).toBe(seen)
        expect(x(timeline)).toBe(25)

        progress.value = 0.5
        manual.frame()
        expect(notifications.length).toBe(seen + 1)
        expect(element.writes.length).toBeGreaterThan(writes)

        // clamped progress that stays at the same time changes nothing either
        progress.value = 1
        manual.frame()
        const clamped = notifications.length
        progress.value = 3
        manual.frame()
        progress.value = 10
        manual.frame()
        expect(notifications.length).toBe(clamped)
        expect(x(timeline)).toBe(100)
    })

    it('A3: the first frame without a progress change does not notify', () => {
        const { manual, timeline, notifications, progress } = setup()
        driver(timeline).drive(progress.read, { from: FROM })
        expect(notifications).toHaveLength(1)

        manual.frame()
        manual.frame()
        expect(notifications).toHaveLength(1)
    })

    it('A4: a non-finite progress keeps the previous value and reports one error asynchronously', () => {
        const { manual, timeline, notifications, progress } = setup()
        driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.25
        manual.frame()
        const seen = notifications.length

        progress.value = Number.NaN
        expect(() => manual.frame()).not.toThrow()
        expect(reported).toHaveLength(1)
        expect(x(timeline)).toBe(25)
        expect(timeline.status).toBe('PLAYING')
        expect(notifications).toHaveLength(seen)

        // normal values work again
        progress.value = 0.5
        manual.frame()
        expect(x(timeline)).toBe(50)
        expect(notifications).toHaveLength(seen + 1)
        expect(reported).toHaveLength(1)
    })

    it('A4: Infinity is non-finite too', () => {
        const { manual, timeline, progress } = setup()
        driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.5
        manual.frame()

        progress.value = Number.POSITIVE_INFINITY
        manual.frame()
        expect(reported).toHaveLength(1)
        expect(x(timeline)).toBe(50)

        progress.value = 0.75
        manual.frame()
        expect(x(timeline)).toBe(75)
    })

    it('A5: the stop function leaves the clock and pauses at the current value', () => {
        const { manual, timeline, notifications, progress } = setup()
        const stop = driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.25
        manual.frame()
        expect(manual.clock.size).toBe(1)

        stop()
        expect(manual.clock.size).toBe(0)
        expect(timeline.status).toBe('PAUSED')
        expect(x(timeline)).toBe(25)

        const calls = progress.calls
        const seen = notifications.length
        progress.value = 0.9
        manual.frames(3)
        expect(progress.calls).toBe(calls)
        expect(x(timeline)).toBe(25)
        expect(notifications).toHaveLength(seen)
        expect(timeline.status).toBe('PAUSED')
    })

    it('A5: resume() plays forward from there like a normal paused run and ends', () => {
        const { manual, timeline, notifications, progress } = setup()
        const stop = driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.5
        manual.frame()
        stop()
        expect(x(timeline)).toBe(50)

        timeline.resume()
        expect(timeline.status).toBe('PLAYING')
        const calls = progress.calls
        manual.frame(500)
        expect(x(timeline)).toBeCloseTo(75, 10)
        expect(timeline.status).toBe('PLAYING')

        manual.frame(500)
        expect(x(timeline)).toBe(100)
        expect(timeline.status).toBe('ENDED')
        expect(notifications[notifications.length - 1]).toEqual({
            x: 100,
            status: 'ENDED',
        })
        expect(manual.clock.size).toBe(0)
        expect(progress.calls).toBe(calls)
    })

    it('A5: calling stop twice is fine', () => {
        const { manual, timeline, progress } = setup()
        const stop = driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.25
        manual.frame()

        stop()
        expect(() => stop()).not.toThrow()
        expect(timeline.status).toBe('PAUSED')
        expect(x(timeline)).toBe(25)

        // a second stop does not undo a resume
        timeline.resume()
        stop()
        expect(timeline.status).toBe('PLAYING')
        expect(manual.clock.size).toBe(1)
        expect(reported).toEqual([])
    })

    it('A6: play() during a drive stops it and plays normally', async () => {
        const { manual, timeline, notifications, progress } = setup()
        const stop = driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.25
        manual.frame()

        const result = track(timeline.play({ from: FROM }))
        const calls = progress.calls
        progress.value = 1
        manual.frame(500)
        expect(progress.calls).toBe(calls)
        expect(x(timeline)).toBeCloseTo(25, 10)
        manual.frame(1500)
        expect(x(timeline)).toBe(100)
        expect(timeline.status).toBe('ENDED')
        expect(progress.calls).toBe(calls)
        await flush()
        expect(result).toEqual(['ended'])

        // the stale stop function is a no-op for the later run
        timeline.play({ from: FROM })
        stop()
        expect(timeline.status).toBe('PLAYING')
        expect(manual.clock.size).toBe(1)
        manual.frame(500)
        expect(x(timeline)).toBeCloseTo(25, 10)
        expect(notifications[notifications.length - 1]!.status).toBe('PLAYING')
    })

    it('A6: reset() stops the drive', () => {
        const { manual, timeline, progress } = setup()
        const stop = driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.25
        manual.frame()

        timeline.reset()
        expect(manual.clock.size).toBe(0)
        expect(timeline.status).toBe('IDLE')
        const calls = progress.calls
        progress.value = 0.9
        manual.frames(3)
        expect(progress.calls).toBe(calls)
        expect(timeline.getCurrentValue()).toBeNull()

        stop()
        expect(timeline.status).toBe('IDLE')
    })

    it('A6: dispose() stops the drive', () => {
        const { manual, timeline, progress } = setup()
        const stop = driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.25
        manual.frame()

        timeline.dispose()
        expect(manual.clock.size).toBe(0)
        const calls = progress.calls
        progress.value = 0.9
        manual.frames(3)
        expect(progress.calls).toBe(calls)

        expect(() => stop()).not.toThrow()
        expect(manual.clock.size).toBe(0)
        expect(reported).toEqual([])
    })

    it('A6: seek() stops the drive', () => {
        const { manual, timeline, progress } = setup()
        const stop = driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.25
        manual.frame()

        timeline.seek(1)
        expect(manual.clock.size).toBe(0)
        expect(timeline.status).toBe('PAUSED')
        expect(x(timeline)).toBe(50)
        const calls = progress.calls
        progress.value = 0.9
        manual.frames(3)
        expect(progress.calls).toBe(calls)
        expect(x(timeline)).toBe(50)

        stop()
        expect(timeline.status).toBe('PAUSED')
        expect(x(timeline)).toBe(50)
    })

    it('A7: drive replaces a pending play() run, which resolves interrupted', async () => {
        const { manual, timeline, progress } = setup()
        const first = track(timeline.play({ from: FROM }))
        manual.frame(500)
        await flush()
        expect(first).toEqual([])

        driver(timeline).drive(progress.read, { from: FROM })
        await flush()
        expect(first).toEqual(['interrupted'])

        // the driven run follows the progress from `from`
        expect(x(timeline)).toBe(0)
        progress.value = 0.5
        manual.frame()
        expect(x(timeline)).toBe(50)
        expect(timeline.status).toBe('PLAYING')
        await flush()
        expect(first).toEqual(['interrupted'])
    })

    it('A7: drive replaces a previous drive', () => {
        const { manual, timeline } = setup()
        const stopFirst = driver(timeline).drive(() => 0.25, { from: FROM })
        const stopSecond = driver(timeline).drive(() => 0.75, { from: FROM })
        manual.frame()
        expect(x(timeline)).toBe(75)
        expect(manual.clock.size).toBe(1)

        stopFirst()
        expect(timeline.status).toBe('PLAYING')
        manual.frame()
        expect(x(timeline)).toBe(75)

        stopSecond()
        expect(timeline.status).toBe('PAUSED')
        expect(manual.clock.size).toBe(0)
    })

    it('A8: reduced motion does not apply to driven runs', () => {
        const { manual, timeline, progress } = setup({ reducedMotion: true })
        manual.setReducedMotion(true)
        expect(manual.clock.reducedMotion).toBe(true)

        driver(timeline).drive(progress.read, { from: FROM })
        expect(timeline.status).toBe('PLAYING')
        expect(x(timeline)).toBe(0)

        progress.value = 0.25
        manual.frame()
        expect(x(timeline)).toBe(25)
        expect(timeline.status).toBe('PLAYING')

        progress.value = 0.5
        manual.frame()
        expect(x(timeline)).toBe(50)
        expect(timeline.status).toBe('PLAYING')
        expect(manual.clock.size).toBe(1)
    })

    it('A9: velocity is the time-derivative of the driven values per second', () => {
        const { manual, timeline, progress } = setup()
        driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.25
        manual.frame(100)
        expect(x(timeline)).toBe(25)

        progress.value = 0.5
        manual.frame(100)
        expect(x(timeline)).toBe(50)
        // (50 - 25) units over the 0.1 s frame
        const velocity = timeline.velocity as Values
        expect(velocity.x).toBeCloseTo(250, 6)

        manual.frame(100)
        expect(timeline.velocity).toEqual({ x: 0 })
        manual.frame(100)
        expect(timeline.velocity).toEqual({ x: 0 })
    })

    it('A9: velocity is negative when the progress goes back', () => {
        const { manual, timeline, progress } = setup()
        driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.5
        manual.frame(100)

        progress.value = 0.25
        manual.frame(100)
        expect((timeline.velocity as Values).x).toBeCloseTo(-250, 6)
    })

    it('A10: invalid config throws synchronously and leaves a running run untouched', async () => {
        const { manual, timeline, notifications } = setup()
        expect(typeof driver(timeline).drive).toBe('function')
        const config: RafTimelineConfig<Values> = { from: FROM }
        const result = track(timeline.play(config))
        manual.frame(500)
        const seen = notifications.length
        const before = x(timeline)

        const bad: RafTimelineConfig<Values>[] = [
            { from: { x: Number.NaN } },
            { from: 5 as unknown as Values },
            { from: null as unknown as Values },
            { from: FROM, delay: -1 },
        ]
        for (const invalid of bad) {
            expect(() => driver(timeline).drive(() => 0.5, invalid)).toThrow()
        }
        expect(() =>
            driver(timeline).drive(() => 0.5, {
                from: { x: Number.NaN },
            })
        ).toThrow(TypeError)

        expect(timeline.config).toBe(config)
        expect(notifications).toHaveLength(seen)
        expect(manual.clock.size).toBe(1)
        manual.frame(500)
        expect(x(timeline)).toBeGreaterThan(before)
        expect(x(timeline)).toBeCloseTo(50, 10)
        manual.frame(1000)
        expect(timeline.status).toBe('ENDED')
        await flush()
        expect(result).toEqual(['ended'])
        expect(reported).toEqual([])
    })

    it('A10: a non-function progress throws a TypeError and leaves a running run untouched', async () => {
        const { manual, timeline, notifications } = setup()
        expect(typeof driver(timeline).drive).toBe('function')
        const config: RafTimelineConfig<Values> = { from: FROM }
        const result = track(timeline.play(config))
        manual.frame(500)
        const seen = notifications.length

        for (const progress of [undefined, null, 0.5, '0.5', {}]) {
            expect(() =>
                driver(timeline).drive(
                    progress as unknown as () => number,
                    config
                )
            ).toThrow(TypeError)
        }

        expect(timeline.config).toBe(config)
        expect(notifications).toHaveLength(seen)
        manual.frame(500)
        expect(x(timeline)).toBeCloseTo(50, 10)
        manual.frame(1000)
        expect(timeline.status).toBe('ENDED')
        await flush()
        expect(result).toEqual(['ended'])
    })

    it('A10: an invalid drive leaves a running drive untouched', () => {
        const { manual, timeline, progress } = setup()
        driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.25
        manual.frame()

        expect(() =>
            driver(timeline).drive(() => 0.9, { from: { x: Number.NaN } })
        ).toThrow(TypeError)
        expect(() =>
            driver(timeline).drive(5 as unknown as () => number, {
                from: FROM,
            })
        ).toThrow(TypeError)

        progress.value = 0.5
        manual.frame()
        expect(x(timeline)).toBe(50)
        expect(timeline.status).toBe('PLAYING')
        expect(manual.clock.size).toBe(1)
    })

    it('A10: nothing throws inside a frame after a valid drive', () => {
        const { manual, timeline, progress } = setup()
        driver(timeline).drive(progress.read, { from: FROM })
        progress.value = 0.5
        expect(() => manual.frames(3)).not.toThrow()
        expect(reported).toEqual([])
    })

    it('S7: createTimelineController forwards drive', () => {
        const { manual, timeline, progress } = setup()
        const controller = createTimelineController(() => timeline)
        expect(typeof driver(controller).drive).toBe('function')

        const stop = driver(controller).drive(progress.read, { from: FROM })
        progress.value = 0.25
        manual.frame()
        expect(x(timeline)).toBe(25)
        expect(timeline.status).toBe('PLAYING')

        stop()
        expect(timeline.status).toBe('PAUSED')
        expect(manual.clock.size).toBe(0)
    })
})
