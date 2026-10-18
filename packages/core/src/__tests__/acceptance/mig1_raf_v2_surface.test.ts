import { describe, expect, it, vi } from 'vitest'
import type { RunResult } from '~/ani/core'
import {
    a,
    createClock,
    createTimelineController,
    isRafTimeline,
    RafAniTimeline,
    type RafTimeline,
    type RafTimelineConfig,
    rafTimeline,
} from '../../index'

type Values = { x: number }

const node = () =>
    a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() })

const config = (): RafTimelineConfig<Values> => ({ from: { x: 0 } })

/**
 * Clock fed by an injected frame source: only `frame()` advances time, so the
 * tests never touch a real timer.
 */
function setup() {
    let time = 1000
    let nextId = 1
    const pending = new Map<number, (timestamp: number) => void>()
    const clock = createClock({
        requestFrame: (callback) => {
            const id = nextId++
            pending.set(id, callback)
            return id
        },
        cancelFrame: (id) => {
            pending.delete(id)
        },
        now: () => time,
        onError: () => undefined,
        // 1 s frames must apply in full (no lag smoothing)
        lagThreshold: Infinity,
    })
    const frame = (ms = 16) => {
        time += ms
        const callbacks = [...pending.values()]
        pending.clear()
        for (const callback of callbacks) callback(time)
    }
    return {
        clock,
        frame,
        frames(count: number, ms = 16) {
            for (let i = 0; i < count; i++) frame(ms)
        },
        /** Frames of one second each until the timeline is no longer playing. */
        finish(timeline: { status: string }) {
            for (let i = 0; i < 10 && timeline.status === 'PLAYING'; i++) {
                frame(1000)
            }
        },
    }
}

async function flush(): Promise<void> {
    for (let i = 0; i < 8; i++) await Promise.resolve()
}

/** Records how a run promise settles. */
function track(promise: Promise<RunResult>) {
    const results: RunResult[] = []
    const onRejected = vi.fn()
    promise.then((result) => {
        results.push(result)
    }, onRejected)
    return { results, onRejected }
}

/** Resolves `'pending'` unless `promise` is already settled. */
function peek(promise: Promise<RunResult>): Promise<RunResult | 'pending'> {
    return Promise.race([promise, Promise.resolve('pending' as const)])
}

describe('MIG1: RafAniTimeline V2 surface', () => {
    it('A1: rafTimeline(node, { clock }) plays on that clock; rafTimeline(node, clock) still works', () => {
        const optionsEnv = setup()
        const withOptions = rafTimeline(node(), { clock: optionsEnv.clock })
        withOptions.play(config())
        expect(withOptions.status).toBe('PLAYING')
        optionsEnv.frames(3, 100)
        const moved = withOptions.value as Values
        expect(moved.x).toBeGreaterThan(0)
        expect(moved.x).toBeLessThan(100)
        optionsEnv.finish(withOptions)
        expect(withOptions.status).toBe('ENDED')
        expect(withOptions.value).toEqual({ x: 100 })

        const legacyEnv = setup()
        const withClock = rafTimeline(node(), legacyEnv.clock)
        withClock.play(config())
        legacyEnv.finish(withClock)
        expect(withClock.status).toBe('ENDED')
        expect(withClock.getCurrentValue()).toEqual({ x: 100 })

        const constructedEnv = setup()
        const constructed = new RafAniTimeline(node(), {
            clock: constructedEnv.clock,
        })
        constructed.play(config())
        constructedEnv.finish(constructed)
        expect(constructed.status).toBe('ENDED')
        expect(constructed.value).toEqual({ x: 100 })
    })

    it('A1: a timeline given an options object only advances with its own clock', () => {
        const own = setup()
        const other = setup()
        const t = rafTimeline(node(), { clock: own.clock })
        t.play(config())
        other.finish(t)
        other.frames(5, 100)
        expect(t.status).toBe('PLAYING')
        own.finish(t)
        expect(t.status).toBe('ENDED')
    })

    it('A2: value / velocity / config are null before play', () => {
        const { clock } = setup()
        const t = rafTimeline(node(), { clock })
        expect(t.value).toBeNull()
        expect(t.velocity).toBeNull()
        expect(t.config).toBeNull()
    })

    it('A2: value / velocity / config equal the 1.x methods', () => {
        const { clock, frames } = setup()
        const t = rafTimeline(node(), { clock })
        const cfg = config()
        t.play(cfg)
        expect(t.config).toBe(cfg)
        expect(t.config).toBe(t.currentConfig)
        expect(t.value).toEqual(t.getCurrentValue())

        frames(3, 100)
        expect(t.value).not.toBeNull()
        expect(t.value).toBe(t.getCurrentValue())
        expect(Object.isFrozen(t.value)).toBe(true)
        expect(t.velocity).not.toBeNull()
        expect(t.velocity).toEqual(t.getCurrentVelocity())
        expect(t.config).toBe(t.currentConfig)

        frames(1, 100)
        expect(t.value).toBe(t.getCurrentValue())
        expect(t.velocity).toEqual(t.getCurrentVelocity())
    })

    it('A2: value / velocity / config are null again after reset', () => {
        const { clock, frames } = setup()
        const t = rafTimeline(node(), { clock })
        t.play(config())
        frames(3, 100)
        t.reset()
        expect(t.value).toBeNull()
        expect(t.velocity).toBeNull()
        expect(t.config).toBeNull()
    })

    it('A3: play() resolves "ended" after the run finished, ENDED notified once', async () => {
        const { clock, frame, finish } = setup()
        const t = rafTimeline(node(), { clock })
        const statuses: string[] = []
        t.onUpdate(({ status }) => {
            statuses.push(status)
        })
        const run = t.play(config())
        expect(run).toBeInstanceOf(Promise)
        const probe = track(run)
        frame(100)
        await flush()
        expect(probe.results).toEqual([])

        finish(t)
        expect(t.status).toBe('ENDED')
        await expect(run).resolves.toBe('ended')
        await flush()
        expect(probe.results).toEqual(['ended'])
        expect(probe.onRejected).not.toHaveBeenCalled()
        expect(statuses.filter((status) => status === 'ENDED')).toHaveLength(1)
    })

    it('A3: with repeats the promise resolves only after the last repeat', async () => {
        const { clock, frame } = setup()
        const t = rafTimeline(node(), { clock })
        const ended = vi.fn()
        t.onUpdate(({ status }) => {
            if (status === 'ENDED') ended()
        })
        const run = t.play({ ...config(), repeat: 2 })
        const probe = track(run)

        for (let i = 0; i < 5; i++) {
            frame(1000)
            await flush()
            if (t.status === 'ENDED') break
            expect(probe.results).toEqual([])
        }
        expect(t.status).toBe('ENDED')
        await flush()
        expect(probe.results).toEqual(['ended'])
        expect(ended).toHaveBeenCalledTimes(1)
    })

    it('A4: a second play while playing resolves the first promise "interrupted"', async () => {
        const { clock, frames, finish } = setup()
        const t = rafTimeline(node(), { clock })
        const first = t.play(config())
        const firstProbe = track(first)
        frames(2, 100)
        const second = t.play({ from: { x: 50 } })
        const secondProbe = track(second)
        expect(second).not.toBe(first)
        await flush()
        expect(firstProbe.results).toEqual(['interrupted'])
        expect(secondProbe.results).toEqual([])

        finish(t)
        await flush()
        expect(secondProbe.results).toEqual(['ended'])
        expect(firstProbe.results).toEqual(['interrupted'])
    })

    it('A4: reset() resolves "reset"', async () => {
        const { clock, frames } = setup()
        const t = rafTimeline(node(), { clock })
        const probe = track(t.play(config()))
        frames(2, 100)
        t.reset()
        await flush()
        expect(probe.results).toEqual(['reset'])
    })

    it('A4: reset() without notifying also resolves "reset"', async () => {
        const { clock, frames } = setup()
        const t = rafTimeline(node(), { clock })
        const probe = track(t.play(config()))
        frames(2, 100)
        t.reset(false)
        await flush()
        expect(probe.results).toEqual(['reset'])
    })

    it('A4: dispose() resolves "disposed"; play after dispose resolves "disposed"', async () => {
        const { clock, frames } = setup()
        const t = rafTimeline(node(), { clock })
        const probe = track(t.play(config()))
        frames(2, 100)
        t.dispose()
        await flush()
        expect(probe.results).toEqual(['disposed'])

        const after = t.play(config())
        await expect(after).resolves.toBe('disposed')
        expect(t.status).toBe('IDLE')
    })

    it('A4: a paused run is resolved by reset() and dispose() too', async () => {
        const { clock, frames } = setup()
        const resetting = rafTimeline(node(), { clock })
        const resetProbe = track(resetting.play(config()))
        frames(2, 100)
        resetting.pause()
        await flush()
        expect(resetProbe.results).toEqual([])
        resetting.reset()
        await flush()
        expect(resetProbe.results).toEqual(['reset'])

        const disposing = rafTimeline(node(), { clock })
        const disposeProbe = track(disposing.play(config()))
        frames(2, 100)
        disposing.pause()
        disposing.dispose()
        await flush()
        expect(disposeProbe.results).toEqual(['disposed'])
    })

    it('A5: interrupt: false while PLAYING resolves "skipped" and leaves the run untouched', async () => {
        const { clock, frames, finish } = setup()
        const t = rafTimeline(node(), { clock })
        const cfg = config()
        const firstProbe = track(t.play(cfg))
        frames(3, 100)
        const before = t.value

        const skipped = t.play({ from: { x: 50 }, interrupt: false })
        await expect(skipped).resolves.toBe('skipped')
        expect(t.status).toBe('PLAYING')
        expect(t.config).toBe(cfg)
        expect(t.value).toBe(before)
        await flush()
        expect(firstProbe.results).toEqual([])

        finish(t)
        await flush()
        expect(firstProbe.results).toEqual(['ended'])
        expect(t.value).toEqual({ x: 100 })
    })

    it('A5: interrupt: false plays normally while ENDED or IDLE', async () => {
        const { clock, finish } = setup()
        const t = rafTimeline(node(), { clock })

        const idleRun = t.play({ ...config(), interrupt: false })
        expect(t.status).toBe('PLAYING')
        finish(t)
        await expect(idleRun).resolves.toBe('ended')
        expect(t.status).toBe('ENDED')

        const endedRun = t.play({ ...config(), interrupt: false })
        expect(t.status).toBe('PLAYING')
        finish(t)
        await expect(endedRun).resolves.toBe('ended')
        expect(t.status).toBe('ENDED')
    })

    it('A5: the legacy play(cfg, false) behaves the same', async () => {
        const { clock, frames, finish } = setup()
        const t = rafTimeline(node(), { clock })

        const idleRun = t.play(config(), false)
        expect(t.status).toBe('PLAYING')
        frames(3, 100)

        const cfg = config()
        const skipped = t.play(cfg, false)
        await expect(skipped).resolves.toBe('skipped')
        expect(t.status).toBe('PLAYING')
        expect(t.config).not.toBe(cfg)

        finish(t)
        await expect(idleRun).resolves.toBe('ended')

        const endedRun = t.play(config(), false)
        expect(t.status).toBe('PLAYING')
        finish(t)
        await expect(endedRun).resolves.toBe('ended')
    })

    it('A5: interrupt wins over the legacy argument', async () => {
        const { clock, frames, finish } = setup()
        const t = rafTimeline(node(), { clock })

        const first = t.play(config())
        frames(3, 100)
        const second = t.play({ from: { x: 50 }, interrupt: true }, false)
        await expect(first).resolves.toBe('interrupted')
        expect(t.status).toBe('PLAYING')

        frames(1, 100)
        const third = t.play({ from: { x: 20 }, interrupt: false }, true)
        await expect(third).resolves.toBe('skipped')
        expect(await peek(second)).toBe('pending')

        finish(t)
        await expect(second).resolves.toBe('ended')
    })

    it('A6: an invalid config throws synchronously; the running promise stays pending', async () => {
        const { clock, frames, finish } = setup()
        const t = rafTimeline(node(), { clock })
        const cfg = config()
        const probe = track(t.play(cfg))
        frames(2, 100)

        expect(() => t.play({ from: { x: Number.NaN } })).toThrow(TypeError)
        expect(() => t.play({ ...config(), delay: -1 })).toThrow(RangeError)
        await flush()
        expect(probe.results).toEqual([])
        expect(t.status).toBe('PLAYING')
        expect(t.config).toBe(cfg)

        finish(t)
        await flush()
        expect(probe.results).toEqual(['ended'])
        expect(probe.onRejected).not.toHaveBeenCalled()
    })

    it('A6: an invalid config on an idle timeline throws instead of returning a promise', () => {
        const { clock } = setup()
        const t = rafTimeline(node(), { clock })
        let returned: unknown = 'untouched'
        expect(() => {
            returned = t.play({ from: { x: Number.NaN } })
        }).toThrow(TypeError)
        expect(returned).toBe('untouched')
        expect(t.status).toBe('IDLE')
        expect(t.config).toBeNull()
    })

    it('A7: each promise settles exactly once across interrupt, reset and dispose', async () => {
        const { clock, frames, finish } = setup()
        const t = rafTimeline(node(), { clock })
        const probes: Array<{
            expected: RunResult
            probe: ReturnType<typeof track>
        }> = []
        const watch = (promise: Promise<RunResult>, expected: RunResult) => {
            probes.push({ expected, probe: track(promise) })
        }

        watch(t.play(config()), 'interrupted')
        frames(2, 100)
        watch(t.play({ from: { x: 10 } }), 'ended')
        finish(t)
        t.reset(false)
        t.pause()
        t.resume()
        watch(t.play(config()), 'reset')
        frames(2, 100)
        t.reset()
        t.reset()
        watch(t.play(config()), 'interrupted')
        watch(t.play({ from: { x: 30 } }), 'interrupted')
        watch(t.play({ from: { x: 40 } }), 'disposed')
        frames(2, 100)
        t.dispose()
        t.dispose()
        watch(t.play(config()), 'disposed')
        watch(t.play(config()), 'disposed')
        frames(3, 100)

        await flush()
        expect(probes).toHaveLength(8)
        for (const { expected, probe } of probes) {
            expect(probe.results).toEqual([expected])
            expect(probe.onRejected).not.toHaveBeenCalled()
        }
    })

    it('A8: isRafTimeline recognizes timelines and controller facades only', () => {
        const { clock } = setup()
        const t = rafTimeline(node(), { clock })
        expect(isRafTimeline(t)).toBe(true)
        expect(isRafTimeline(new RafAniTimeline(node(), clock))).toBe(true)
        expect(isRafTimeline(createTimelineController(() => t))).toBe(true)

        expect(isRafTimeline({})).toBe(false)
        expect(isRafTimeline(null)).toBe(false)
        expect(isRafTimeline(undefined)).toBe(false)
        expect(isRafTimeline(42)).toBe(false)
        expect(isRafTimeline('timeline')).toBe(false)
        expect(isRafTimeline(a.waapiTimeline(node()))).toBe(false)
    })

    it('A8: the RafTimeline type is satisfied by RafAniTimeline', () => {
        const { clock } = setup()
        const t: RafTimeline<Values> = rafTimeline(node(), { clock })
        const facade: RafTimeline<Values> = createTimelineController(() => t)
        expect(typeof t.play).toBe('function')
        expect(typeof facade.play).toBe('function')
    })

    it('A5: the controller forwards the new members and the play promise', async () => {
        const { clock, frames, finish } = setup()
        const t = rafTimeline(node(), { clock })
        const controller = createTimelineController(() => t)
        expect(controller.value).toBeNull()
        expect(controller.velocity).toBeNull()
        expect(controller.config).toBeNull()

        const cfg = config()
        const run = controller.play(cfg)
        expect(run).toBeInstanceOf(Promise)
        frames(3, 100)
        expect(controller.config).toBe(cfg)
        expect(controller.value).toBe(t.value)
        expect(controller.velocity).toEqual(t.velocity)

        const skipped = controller.play({ from: { x: 5 }, interrupt: false })
        await expect(skipped).resolves.toBe('skipped')

        finish(t)
        await expect(run).resolves.toBe('ended')
    })

    it('A9: a listener chaining play() from ENDED gets a new promise; the first already resolved "ended"', async () => {
        const { clock, frame, finish } = setup()
        const t = rafTimeline(node(), { clock })
        let first: Promise<RunResult> | undefined
        let second: Promise<RunResult> | undefined
        let seenAtEnd: RunResult | 'pending' | undefined
        let chained = false
        t.onUpdate(({ status }) => {
            if (status !== 'ENDED' || chained) return
            chained = true
            seenAtEnd = undefined
            const settled = peek(first as Promise<RunResult>)
            settled.then((result) => {
                seenAtEnd = result
            })
            second = t.play(config())
        })

        first = t.play(config())
        // stop at the chaining frame: `finish` would also run the chained run
        for (let i = 0; i < 10 && !chained; i++) frame(1000)
        expect(chained).toBe(true)
        expect(second).toBeDefined()
        expect(second).not.toBe(first)
        await flush()
        expect(seenAtEnd).toBe('ended')
        await expect(first).resolves.toBe('ended')
        expect(t.status).toBe('PLAYING')
        expect(await peek(second as Promise<RunResult>)).toBe('pending')

        finish(t)
        await expect(second).resolves.toBe('ended')
        expect(t.status).toBe('ENDED')
    })
})
