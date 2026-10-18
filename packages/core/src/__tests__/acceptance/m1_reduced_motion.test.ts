import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunResult } from '~/ani/core'
import {
    AnimationClock,
    a,
    createClock,
    defaultClock,
    RafAniTimeline,
    type RafTimelineOptions,
    rafTimeline,
} from '../../index'
import { createManualClock } from '../../testing'

type Values = { translateX: number; opacity: number }

const linear = a.timing.linear()
const node = (duration = 1) =>
    a.ani({
        to: { translateX: 100, opacity: 1 },
        duration,
        timing: linear,
    })

const FROM: Values = { translateX: 0, opacity: 0 }
const END: Values = { translateX: 100, opacity: 1 }

// reducedMotion is not part of the pre-M1 option types; keep the typing in one place
type PolicyOptions = RafTimelineOptions & {
    reducedMotion?: 'jump' | 'ignore' | { maxDuration: number }
}

afterEach(() => {
    vi.unstubAllGlobals()
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

/** Manual clock with long frames applied in full, preference set up front. */
function setup(reducedMotion: boolean) {
    return createManualClock({ reducedMotion, lagThreshold: Infinity })
}

function track(promise: Promise<RunResult>) {
    const results: RunResult[] = []
    promise.then((result) => {
        results.push(result)
    })
    return results
}

const x = (t: { getCurrentValue(): { translateX: number } | null }) =>
    t.getCurrentValue()!.translateX

describe('M1: reduced motion (clock preference)', () => {
    it('A1: boolean values force the preference', () => {
        expect(createClock({ reducedMotion: true }).reducedMotion).toBe(true)
        expect(createClock({ reducedMotion: false }).reducedMotion).toBe(false)

        vi.stubGlobal(
            'matchMedia',
            vi.fn(() => ({ matches: true }))
        )
        expect(createClock({ reducedMotion: false }).reducedMotion).toBe(false)
    })

    it('A1: an injected { matches } source is read live', () => {
        const source = { matches: false }
        const clock = createClock({ reducedMotion: source })
        expect(clock.reducedMotion).toBe(false)
        source.matches = true
        expect(clock.reducedMotion).toBe(true)
        source.matches = false
        expect(clock.reducedMotion).toBe(false)
    })

    it('A1: "system" reflects a stubbed matchMedia, created lazily and once', () => {
        const mql = { matches: false }
        const matchMedia = vi.fn((_query: string) => mql)
        vi.stubGlobal('matchMedia', matchMedia)

        const clock = createClock({ reducedMotion: 'system' })
        expect(matchMedia).not.toHaveBeenCalled()

        expect(clock.reducedMotion).toBe(false)
        expect(matchMedia).toHaveBeenCalledTimes(1)
        expect(matchMedia).toHaveBeenCalledWith(
            '(prefers-reduced-motion: reduce)'
        )

        mql.matches = true
        expect(clock.reducedMotion).toBe(true)
        mql.matches = false
        expect(clock.reducedMotion).toBe(false)
        expect(matchMedia).toHaveBeenCalledTimes(1)
    })

    it('A1: "system" is the default and is false without matchMedia', () => {
        vi.stubGlobal('matchMedia', undefined)
        expect(createClock({ reducedMotion: 'system' }).reducedMotion).toBe(
            false
        )
        expect(createClock().reducedMotion).toBe(false)

        const mql = { matches: true }
        vi.stubGlobal(
            'matchMedia',
            vi.fn(() => mql)
        )
        expect(createClock().reducedMotion).toBe(true)
    })

    it('A1: the default clock uses "system" and reset() keeps the source', () => {
        const mql = { matches: true }
        vi.stubGlobal(
            'matchMedia',
            vi.fn(() => mql)
        )
        expect(defaultClock.reducedMotion).toBe(true)

        AnimationClock.reset()
        expect(defaultClock.reducedMotion).toBe(true)
        mql.matches = false
        expect(defaultClock.reducedMotion).toBe(false)
    })

    it('A1: invalid values throw a TypeError mentioning reducedMotion', () => {
        for (const bad of ['always', 'reduce', 1, 0]) {
            const make = () => createClock({ reducedMotion: bad as never })
            expect(make).toThrow(TypeError)
            expect(make).toThrow(/reducedMotion/)
        }
    })

    it('A2: setReducedMotion flips clock.reducedMotion', () => {
        const m = createManualClock()
        expect(m.clock.reducedMotion).toBe(false)
        m.setReducedMotion(true)
        expect(m.clock.reducedMotion).toBe(true)
        m.setReducedMotion(false)
        expect(m.clock.reducedMotion).toBe(false)

        const on = createManualClock({ reducedMotion: true })
        expect(on.clock.reducedMotion).toBe(true)
    })
})

describe('M1: reduced motion (RAF policy)', () => {
    it('A3: by default a play jumps to the end state at once', async () => {
        const m = setup(true)
        const t = rafTimeline<Values>(node(), m.clock)
        const el = fakeElement()
        t.bind(el)
        const statuses: string[] = []
        t.onUpdate(({ status }) => {
            statuses.push(status)
        })

        const run = t.play({ from: FROM })

        expect(t.status).toBe('ENDED')
        expect(t.getCurrentValue()).toEqual(END)
        expect(statuses).toEqual(['ENDED'])
        expect(el.current.transform).toBe('translateX(100px)')
        expect(el.current.opacity).toBe(1)
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)

        await expect(run).resolves.toBe('ended')
        expect(statuses).toEqual(['ENDED'])
        expect(m.clock.size).toBe(0)
    })

    it('A3: "jump" given explicitly behaves like the default, via the constructor too', async () => {
        const m = setup(true)
        const options: PolicyOptions = {
            clock: m.clock,
            reducedMotion: 'jump',
        }
        const t = new RafAniTimeline<Values>(node(), options)
        const statuses: string[] = []
        t.onUpdate(({ status }) => {
            statuses.push(status)
        })

        await expect(t.play({ from: FROM })).resolves.toBe('ended')
        expect(t.status).toBe('ENDED')
        expect(t.getCurrentValue()).toEqual(END)
        expect(statuses).toEqual(['ENDED'])
        expect(m.clock.size).toBe(0)
    })

    it('A3: play() still validates before jumping', () => {
        const m = setup(true)
        const t = rafTimeline<Values>(node(), m.clock)

        expect(() =>
            t.play({ from: { translateX: Number.NaN, opacity: 0 } })
        ).toThrow(TypeError)
        expect(t.status).toBe('IDLE')
        expect(t.getCurrentValue()).toBeNull()
    })

    it('A3: without the preference nothing changes', () => {
        const m = setup(false)
        const t = rafTimeline<Values>(node(), m.clock)
        const run = track(t.play({ from: FROM }))

        expect(t.status).toBe('PLAYING')
        expect(t.getCurrentValue()).toEqual(FROM)
        expect(m.clock.size).toBe(1)

        m.frame(500)
        expect(x(t)).toBeCloseTo(50, 5)
        expect(t.status).toBe('PLAYING')
        expect(run).toEqual([])
    })

    it('A4: "jump" with repeat: 2 ends at the end state', async () => {
        const m = setup(true)
        const t = rafTimeline<Values>(node(), m.clock)

        await expect(t.play({ from: FROM, repeat: 2 })).resolves.toBe('ended')

        expect(t.status).toBe('ENDED')
        expect(t.getCurrentValue()).toEqual(END)
        expect(m.clock.size).toBe(0)
    })

    it('A4: "jump" with repeat: Infinity ends at the end of one run', async () => {
        const m = setup(true)
        const t = rafTimeline<Values>(node(), m.clock)

        await expect(t.play({ from: FROM, repeat: Infinity })).resolves.toBe(
            'ended'
        )

        expect(t.status).toBe('ENDED')
        expect(t.getCurrentValue()).toEqual(END)
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('A4: "jump" evaluates the plan at its duration', async () => {
        const m = setup(true)
        const sequenced = a.sequence([
            a.ani({
                to: { translateX: 100, opacity: 1 },
                duration: 1,
                timing: linear,
            }),
            a.ani({
                to: { translateX: 40, opacity: 0.5 },
                duration: 2,
                timing: linear,
            }),
        ])
        const t = rafTimeline<Values>(sequenced, m.clock)

        await expect(t.play({ from: FROM })).resolves.toBe('ended')

        expect(t.getCurrentValue()).toEqual({ translateX: 40, opacity: 0.5 })
        expect(t.duration).toBe(3)
    })

    it('A5: { maxDuration } speeds a long run up so it ends after maxDuration', async () => {
        const m = setup(true)
        const t = rafTimeline<Values>(node(1), {
            clock: m.clock,
            reducedMotion: { maxDuration: 0.25 },
        } as PolicyOptions)
        const run = t.play({ from: FROM })

        expect(t.status).toBe('PLAYING')
        expect(t.duration).toBe(1)
        expect(m.clock.size).toBe(1)

        m.frame(125)
        expect(t.status).toBe('PLAYING')
        expect(x(t)).toBeCloseTo(50, 5)
        expect(t.duration).toBe(1)

        m.frame(125)
        expect(t.status).toBe('ENDED')
        expect(t.getCurrentValue()).toEqual(END)
        expect(t.duration).toBe(1)
        expect(m.clock.size).toBe(0)
        await expect(run).resolves.toBe('ended')
    })

    it('A5: runs not longer than maxDuration are untouched', () => {
        const m = setup(true)
        const options: PolicyOptions = {
            clock: m.clock,
            reducedMotion: { maxDuration: 0.25 },
        }

        const shorter = rafTimeline<Values>(node(0.2), options)
        shorter.play({ from: FROM })
        m.frame(100)
        expect(shorter.status).toBe('PLAYING')
        expect(x(shorter)).toBeCloseTo(50, 5)
        expect(shorter.duration).toBe(0.2)
        m.frame(100)
        expect(shorter.status).toBe('ENDED')
        expect(x(shorter)).toBe(100)

        const equal = rafTimeline<Values>(node(0.25), options)
        equal.play({ from: FROM })
        m.frame(125)
        expect(equal.status).toBe('PLAYING')
        expect(x(equal)).toBeCloseTo(50, 5)
        m.frame(125)
        expect(equal.status).toBe('ENDED')
    })

    it('A5: every repeated run is accelerated', () => {
        const m = setup(true)
        const t = rafTimeline<Values>(node(1), {
            clock: m.clock,
            reducedMotion: { maxDuration: 0.25 },
        } as PolicyOptions)
        t.play({ from: FROM, repeat: 1 })

        m.frame(250)
        expect(t.status).toBe('PLAYING')

        m.frame(250)
        expect(t.status).toBe('ENDED')
        expect(t.getCurrentValue()).toEqual(END)
    })

    it('A5: { maxDuration } without the preference is untouched', () => {
        const m = setup(false)
        const t = rafTimeline<Values>(node(1), {
            clock: m.clock,
            reducedMotion: { maxDuration: 0.25 },
        } as PolicyOptions)
        t.play({ from: FROM })

        m.frame(250)
        expect(t.status).toBe('PLAYING')
        expect(x(t)).toBeCloseTo(25, 5)
    })

    it('A6: "ignore" animates normally with the preference on', async () => {
        const m = setup(true)
        const t = rafTimeline<Values>(node(), {
            clock: m.clock,
            reducedMotion: 'ignore',
        } as PolicyOptions)
        const run = t.play({ from: FROM })

        expect(t.status).toBe('PLAYING')
        expect(t.getCurrentValue()).toEqual(FROM)
        expect(m.clock.size).toBe(1)

        m.frame(500)
        expect(t.status).toBe('PLAYING')
        expect(x(t)).toBeCloseTo(50, 5)

        m.frame(500)
        expect(t.status).toBe('ENDED')
        expect(x(t)).toBe(100)
        await expect(run).resolves.toBe('ended')
    })

    it('A7: the preference is read at play time, not during a run', async () => {
        const m = setup(false)
        const t = rafTimeline<Values>(node(), m.clock)
        const first = t.play({ from: FROM })

        m.frame(250)
        m.setReducedMotion(true)
        expect(t.status).toBe('PLAYING')

        m.frame(250)
        expect(t.status).toBe('PLAYING')
        expect(x(t)).toBeCloseTo(50, 5)
        expect(m.clock.size).toBe(1)

        m.frame(500)
        expect(t.status).toBe('ENDED')
        await expect(first).resolves.toBe('ended')

        const second = t.play({ from: FROM })
        expect(t.status).toBe('ENDED')
        expect(t.getCurrentValue()).toEqual(END)
        expect(m.clock.size).toBe(0)
        await expect(second).resolves.toBe('ended')
    })

    it('A7: turning the preference off mid-run keeps an accelerated run as started', () => {
        const m = setup(true)
        const t = rafTimeline<Values>(node(1), {
            clock: m.clock,
            reducedMotion: { maxDuration: 0.25 },
        } as PolicyOptions)
        t.play({ from: FROM })

        m.frame(125)
        m.setReducedMotion(false)
        expect(x(t)).toBeCloseTo(50, 5)

        m.frame(125)
        expect(t.status).toBe('ENDED')
        expect(t.getCurrentValue()).toEqual(END)

        t.play({ from: FROM })
        expect(t.status).toBe('PLAYING')
        m.frame(250)
        expect(x(t)).toBeCloseTo(25, 5)
    })

    it('A7: a jump interrupts a running run', async () => {
        const m = setup(false)
        const t = rafTimeline<Values>(node(), m.clock)
        const first = t.play({ from: FROM })
        m.frame(250)

        m.setReducedMotion(true)
        const second = t.play({ from: FROM })

        await expect(first).resolves.toBe('interrupted')
        await expect(second).resolves.toBe('ended')
        expect(t.status).toBe('ENDED')
        expect(t.getCurrentValue()).toEqual(END)
        expect(m.clock.size).toBe(0)
    })

    it('A9: an invalid maxDuration throws a RangeError at construction', () => {
        const m = setup(true)
        for (const bad of [0, -1, Number.NaN, Infinity, -Infinity]) {
            const options: PolicyOptions = {
                clock: m.clock,
                reducedMotion: { maxDuration: bad },
            }
            expect(() => rafTimeline<Values>(node(), options)).toThrow(
                RangeError
            )
            expect(() => new RafAniTimeline<Values>(node(), options)).toThrow(
                RangeError
            )
        }
        expect(m.clock.size).toBe(0)
    })

    it('A9: a valid maxDuration does not throw', () => {
        const m = setup(false)
        const options: PolicyOptions = {
            clock: m.clock,
            reducedMotion: { maxDuration: 0.001 },
        }
        expect(() => rafTimeline<Values>(node(), options)).not.toThrow()
    })
})
