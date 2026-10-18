import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { a, createClock, rafTimeline } from '../../index'

const linear = a.timing.linear()
const node = (duration = 1) =>
    a.ani({
        to: { translateX: 100, opacity: 1 },
        duration,
        timing: linear,
    })

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
    }
}

type Write = { prop: string; value: unknown }

/**
 * `{ style }` whose every write (assignment or `setProperty`) is logged, in
 * order, into the shared `log` as `name:prop` and into `writes`.
 */
function fakeElement(
    name: string,
    log: string[] = [],
    options: { throwOn?: string } = {}
) {
    const writes: Write[] = []
    const current: Record<string, unknown> = {}
    const record = (prop: string, value: unknown) => {
        if (options.throwOn === prop) throw new Error(`boom ${name}:${prop}`)
        writes.push({ prop, value })
        current[prop] = value
        log.push(`${name}:${prop}`)
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
        writes,
        current,
        count(prop: string) {
            return writes.filter((w) => w.prop === prop).length
        },
    }
}

const FROM = { translateX: 0, opacity: 0 }

describe('R1T: RAF timeline computes in update, writes and notifies in commit', () => {
    it('A1: no style write happens before every update ran', () => {
        const { clock, frame } = setup()
        const log: string[] = []
        clock.subscribe({
            update: () => {
                log.push('probe-update')
            },
            commit: () => {
                log.push('probe-commit')
            },
        })
        const el1 = fakeElement('el1', log)
        const el2 = fakeElement('el2', log)
        const t1 = rafTimeline(node(), clock)
        const t2 = rafTimeline(node(), clock)
        t1.bind(el1)
        t2.bind(el2)
        t1.play({ from: FROM })
        t2.play({ from: FROM })
        log.length = 0

        frame()

        expect(log.slice(0, 2)).toEqual(['probe-update', 'probe-commit'])
        const writes = log.slice(2)
        expect(writes.length).toBeGreaterThanOrEqual(2)
        const firstEl2 = writes.findIndex((entry) => entry.startsWith('el2:'))
        expect(firstEl2).toBeGreaterThan(0)
        expect(
            writes.slice(0, firstEl2).every((e) => e.startsWith('el1:'))
        ).toBe(true)
        expect(writes.slice(firstEl2).every((e) => e.startsWith('el2:'))).toBe(
            true
        )
        expect(new Set(writes.slice(0, firstEl2))).toEqual(
            new Set(['el1:transform', 'el1:opacity'])
        )
        expect(new Set(writes.slice(firstEl2))).toEqual(
            new Set(['el2:transform', 'el2:opacity'])
        )
    })

    it('A2: onUpdate runs once per frame, after the bound writes, with the frame state', () => {
        const { clock, frame } = setup()
        const log: string[] = []
        const el = fakeElement('el', log)
        const t = rafTimeline(node(), clock)
        t.bind(el)
        const states: unknown[] = []
        t.onUpdate(({ state, status }) => {
            log.push('listener')
            states.push({ state, status })
        })
        t.play({ from: FROM })
        log.length = 0
        states.length = 0

        frame()

        expect(log.filter((e) => e === 'listener')).toHaveLength(1)
        expect(log[log.length - 1]).toBe('listener')
        expect(log.slice(0, -1).length).toBeGreaterThan(0)
        expect(states).toHaveLength(1)
        const { state, status } = states[0] as {
            state: Record<string, number>
            status: string
        }
        expect(status).toBe('PLAYING')
        expect(state).toEqual(t.getCurrentValue())
        expect(state.translateX).toBeGreaterThan(0)
        expect(el.current.transform).toBe(`translateX(${state.translateX}px)`)
    })

    it('A3: the final frame of a run notifies exactly once with ENDED and the final value', () => {
        const { clock, frame } = setup()
        const el = fakeElement('el')
        const t = rafTimeline(node(), clock)
        t.bind(el)
        const seen: { status: string; state: Record<string, number> }[] = []
        t.onUpdate(({ state, status }) => {
            seen.push({ status, state: { ...(state as object) } as never })
        })
        t.play({ from: FROM })

        let endedFrame = -1
        let notificationsInEndedFrame = 0
        for (let i = 0; i < 30 && endedFrame < 0; i++) {
            const before = seen.length
            frame(100)
            if (t.status === 'ENDED') {
                endedFrame = i
                notificationsInEndedFrame = seen.length - before
            }
        }
        expect(endedFrame).toBeGreaterThan(0)
        expect(notificationsInEndedFrame).toBe(1)
        const last = seen[seen.length - 1]!
        expect(last.status).toBe('ENDED')
        expect(last.state).toEqual({ translateX: 100, opacity: 1 })
        expect(seen.filter((s) => s.status === 'ENDED')).toHaveLength(1)
        expect(el.current.transform).toBe('translateX(100px)')
        expect(el.current.opacity).toBe(1)

        frame(100)
        frame(100)
        expect(seen.filter((s) => s.status === 'ENDED')).toHaveLength(1)
    })

    it('A4: the frame that wraps a repeat notifies exactly once, post-wrap', () => {
        const { clock, frame } = setup()
        const t = rafTimeline(node(), clock)
        const seen: { status: string; x: number }[] = []
        t.onUpdate(({ state, status }) => {
            seen.push({
                status,
                x: (state as Record<string, number>).translateX!,
            })
        })
        t.play({ from: FROM, repeat: 1 })
        seen.length = 0

        const perFrame: number[] = []
        for (let i = 0; i < 3; i++) {
            const before = seen.length
            frame(400)
            perFrame.push(seen.length - before)
        }
        // 0.4s, 0.8s, 1.2s -> the third frame wraps
        expect(perFrame).toEqual([1, 1, 1])
        const wrap = seen[2]!
        expect(wrap.status).toBe('PLAYING')
        expect(wrap.x).toBeCloseTo(20, 5)
        expect(t.status).toBe('PLAYING')

        const rest: number[] = []
        for (let i = 0; i < 3; i++) {
            const before = seen.length
            frame(400)
            rest.push(seen.length - before)
        }
        expect(rest).toEqual([1, 1, 0])
        expect(seen.filter((s) => s.status === 'ENDED')).toHaveLength(1)
    })

    it('A5: play(), seek() and reset() notify and write synchronously', () => {
        const { clock } = setup()
        const log: string[] = []
        const el = fakeElement('el', log)
        const t = rafTimeline(node(), clock)
        t.bind(el)
        const states: { status: string; x: number | undefined }[] = []
        t.onUpdate(({ state, status }) => {
            log.push(`listener:${status}`)
            states.push({
                status,
                x: (state as Record<string, number>).translateX,
            })
        })

        t.play({ from: FROM })
        expect(states.map((s) => s.status)).toEqual(['PLAYING'])
        expect(states[0]!.x).toBe(0)
        expect(el.current.transform).toBe('translateX(0px)')
        expect(el.current.opacity).toBe(0)
        // writes first, then the listener
        expect(log.indexOf('el:transform')).toBeLessThan(
            log.indexOf('listener:PLAYING')
        )
        expect(log.indexOf('el:opacity')).toBeLessThan(
            log.indexOf('listener:PLAYING')
        )

        log.length = 0
        t.seek(0.5)
        expect(states).toHaveLength(2)
        expect(states[1]!.status).toBe('PAUSED')
        expect(states[1]!.x).toBeCloseTo(50, 5)
        expect(el.current.transform).toBe('translateX(50px)')
        expect(el.current.opacity).toBe(0.5)
        expect(log[log.length - 1]).toBe('listener:PAUSED')
        expect(log.indexOf('el:transform')).toBeLessThan(
            log.indexOf('listener:PAUSED')
        )

        t.reset()
        expect(states).toHaveLength(3)
        expect(states[2]!.status).toBe('IDLE')
        expect(reported).toEqual([])
    })

    it('A5: a binding survives reset() and writes again on the next play()', () => {
        const { clock } = setup()
        const el = fakeElement('el')
        const t = rafTimeline(node(), clock)
        t.bind(el)
        t.play({ from: FROM })
        t.seek(0.5)
        t.reset()
        const before = el.writes.length
        t.play({ from: { translateX: 10, opacity: 0 } })
        expect(el.writes.length).toBeGreaterThan(before)
        expect(el.current.transform).toBe('translateX(10px)')
        expect(reported).toEqual([])
    })

    it('A6: only declarations whose written value changed are written', () => {
        const { clock, frames } = setup()
        const el = fakeElement('el')
        const t = rafTimeline(node(), clock)
        t.bind(el)
        t.play({ from: { translateX: 0, opacity: 1 } })
        frames(5)

        expect(el.count('opacity')).toBe(1)
        expect(el.count('transform')).toBe(6)
    })

    it('A6: two bindings of one timeline each keep their own cache', () => {
        const { clock, frames } = setup()
        const first = fakeElement('first')
        const t = rafTimeline(node(), clock)
        t.bind(first)
        t.play({ from: { translateX: 0, opacity: 1 } })
        frames(2)
        const second = fakeElement('second')
        t.bind(second)
        // a late binding starts with a full write
        expect(second.count('transform')).toBe(1)
        expect(second.count('opacity')).toBe(1)
        frames(2)
        expect(second.count('opacity')).toBe(1)
        expect(second.count('transform')).toBe(3)
        expect(first.count('transform')).toBe(5)
        expect(first.count('opacity')).toBe(1)
        expect(second.current.transform).toBe(first.current.transform)
    })

    it('A7: bind after a value exists writes immediately', () => {
        const { clock } = setup()
        const t = rafTimeline(node(), clock)
        t.play({ from: { translateX: 20, opacity: 0.5 } })
        const el = fakeElement('el')
        t.bind(el)
        expect(el.current.transform).toBe('translateX(20px)')
        expect(el.current.opacity).toBe(0.5)
    })

    it('A7: bind before play writes at play, not before', () => {
        const { clock } = setup()
        const t = rafTimeline(node(), clock)
        const el = fakeElement('el')
        t.bind(el)
        expect(el.writes).toHaveLength(0)
        t.play({ from: { translateX: 20, opacity: 0.5 } })
        expect(el.current.transform).toBe('translateX(20px)')
        expect(el.current.opacity).toBe(0.5)
    })

    it('A8: the unbind function stops writes, is idempotent and keeps styles', () => {
        const { clock, frames } = setup()
        const kept = fakeElement('kept')
        const gone = fakeElement('gone')
        const t = rafTimeline(node(), clock)
        t.bind(kept)
        const unbind = t.bind(gone)
        t.play({ from: FROM })
        frames(2)
        const goneWrites = gone.writes.length
        const goneTransform = gone.current.transform
        expect(goneWrites).toBeGreaterThan(0)

        unbind()
        unbind()
        expect(gone.writes).toHaveLength(goneWrites)
        const keptWrites = kept.writes.length
        frames(2)
        expect(gone.writes).toHaveLength(goneWrites)
        expect(gone.current.transform).toBe(goneTransform)
        expect(kept.writes.length).toBeGreaterThan(keptWrites)
    })

    it('A8: dispose() stops all writes and listeners', () => {
        const { clock, frames } = setup()
        const el1 = fakeElement('el1')
        const el2 = fakeElement('el2')
        const t = rafTimeline(node(), clock)
        t.bind(el1)
        t.bind(el2)
        let notified = 0
        t.onUpdate(() => {
            notified++
        })
        t.play({ from: FROM })
        frames(2)
        const w1 = el1.writes.length
        const w2 = el2.writes.length
        const n = notified

        t.dispose()
        t.play({ from: FROM })
        t.seek(0.5)
        frames(3)
        expect(el1.writes).toHaveLength(w1)
        expect(el2.writes).toHaveLength(w2)
        expect(notified).toBe(n)

        const late = fakeElement('late')
        const unbind = t.bind(late)
        expect(typeof unbind).toBe('function')
        expect(() => unbind()).not.toThrow()
        frames(2)
        expect(late.writes).toHaveLength(0)
    })

    it('A8: a timeline disposed between its update and its commit neither writes nor notifies', () => {
        const { clock, frame } = setup()
        const el = fakeElement('el')
        const t = rafTimeline(node(), clock)
        let notified = 0
        t.bind(el)
        t.onUpdate(() => {
            notified++
        })
        t.play({ from: FROM })
        // subscribed after `t`: updates after it, before every commit
        clock.subscribe({ update: () => t.dispose() })
        const writes = el.writes.length
        const n = notified

        frame()

        expect(el.writes).toHaveLength(writes)
        expect(notified).toBe(n)
    })

    it('A9: a listener that calls play() on ENDED chains a second run that completes later', () => {
        const { clock, frame } = setup()
        const el = fakeElement('el')
        const t = rafTimeline(node(0.25), clock)
        t.bind(el)
        let frameNo = 0
        const endedAt: number[] = []
        t.onUpdate(({ status }) => {
            if (status !== 'ENDED') return
            endedAt.push(frameNo)
            if (endedAt.length < 2) t.play({ from: FROM })
        })
        t.play({ from: FROM })
        for (frameNo = 1; frameNo <= 30; frameNo++) frame(100)

        expect(endedAt).toHaveLength(2)
        expect(endedAt[1]!).toBeGreaterThan(endedAt[0]!)
        expect(t.status).toBe('ENDED')
        expect(el.current.transform).toBe('translateX(100px)')
        expect(el.current.opacity).toBe(1)
    })

    it('A10: a resolver passed to bind decides the written key', () => {
        const { clock, frames } = setup()
        const el = fakeElement('el')
        const t = rafTimeline(node(), clock)
        t.bind(el, {
            resolver: {
                translateX: (v: number) => ({ key: 'left', value: `${v}px` }),
            },
        })
        t.play({ from: FROM })
        frames(2)

        expect(el.count('left')).toBe(3)
        expect(el.count('transform')).toBe(0)
        expect(el.count('opacity')).toBeGreaterThan(0)
        expect(el.current.left).toBe(`${t.getCurrentValue()!.translateX}px`)
    })

    it('A10: the default resolver is the run propertyResolver', () => {
        const { clock } = setup()
        const el = fakeElement('el')
        const t = rafTimeline(node(), clock)
        t.bind(el)
        t.play({
            from: { translateX: 5, opacity: 0 },
            propertyResolver: {
                translateX: (v: number) => ({ key: 'left', value: `${v}px` }),
            },
        })
        expect(el.current.left).toBe('5px')
        expect(el.count('transform')).toBe(0)
    })

    it('A10: custom properties and hyphenated keys go through setProperty', () => {
        const { clock } = setup()
        const calls: [string, string][] = []
        const style = {
            setProperty: (name: string, value: string) => {
                calls.push([name, value])
            },
        } as unknown as CSSStyleDeclaration
        const t = rafTimeline(node(), clock)
        t.bind(
            { style },
            {
                resolver: {
                    translateX: (v: number) => ({
                        key: '--shift',
                        value: `${v}px`,
                    }),
                },
            }
        )
        t.play({ from: { translateX: 7, opacity: 0 } })
        expect(calls).toContainEqual(['--shift', '7px'])
    })

    it('A11: binding an array-shaped timeline reports one TypeError asynchronously', () => {
        const { clock, frames } = setup()
        const arrayNode = a.ani({ to: [0, 100], duration: 1, timing: linear })
        const bad = rafTimeline(arrayNode, clock)
        const good = rafTimeline(node(), clock)
        const badEl = fakeElement('bad')
        const goodEl = fakeElement('good')

        expect(() => bad.bind(badEl)).not.toThrow()
        good.bind(goodEl)
        expect(() => bad.play({ from: [0, 0] })).not.toThrow()
        good.play({ from: FROM })
        expect(() => frames(3)).not.toThrow()

        expect(reported).toHaveLength(1)
        expect(reported[0]).toBeInstanceOf(TypeError)
        expect(badEl.writes).toHaveLength(0)
        expect(goodEl.count('transform')).toBe(4)
        expect(bad.status).toBe('PLAYING')
    })

    it('A11: binding an array-shaped timeline that already has a value reports instead of throwing', () => {
        const { clock, frames } = setup()
        const arrayNode = a.ani({ to: [0, 100], duration: 1, timing: linear })
        const t = rafTimeline(arrayNode, clock)
        t.play({ from: [0, 0] })
        const el = fakeElement('el')

        expect(() => t.bind(el)).not.toThrow()
        frames(3)

        expect(reported).toHaveLength(1)
        expect(reported[0]).toBeInstanceOf(TypeError)
        expect(el.writes).toHaveLength(0)
    })

    it('A12: a listener that resets the timeline stops the remaining notifications of that frame', () => {
        const { clock, frames } = setup()
        const el = fakeElement('el')
        const t = rafTimeline(node(), clock)
        t.bind(el)
        const second: string[] = []
        let armed = false
        t.onUpdate(() => {
            if (armed) t.reset(false)
        })
        t.onUpdate(({ status }) => {
            second.push(status)
        })
        t.play({ from: FROM })
        second.length = 0
        armed = true

        frames(1)
        const writes = el.writes.length
        expect(second).toEqual([])
        expect(t.status).toBe('IDLE')

        frames(3)
        expect(el.writes).toHaveLength(writes)
        expect(second).toEqual([])
        expect(reported).toEqual([])
    })

    it('A12: with a notifying reset, the other listener never sees the stale frame', () => {
        const { clock, frames } = setup()
        const el = fakeElement('el')
        const t = rafTimeline(node(), clock)
        t.bind(el)
        const second: string[] = []
        let armed = false
        t.onUpdate(() => {
            if (armed) t.reset()
        })
        t.onUpdate(({ status }) => {
            second.push(status)
        })
        t.play({ from: FROM })
        second.length = 0
        armed = true

        frames(1)
        const writes = el.writes.length
        expect(second.every((status) => status === 'IDLE')).toBe(true)
        expect(second.length).toBeLessThanOrEqual(1)

        frames(3)
        expect(el.writes).toHaveLength(writes)
        expect(second.every((status) => status === 'IDLE')).toBe(true)
    })

    it('E1: a failing write is isolated per binding and reported asynchronously', () => {
        const { clock, frames } = setup()
        const log: string[] = []
        const bad = fakeElement('bad', log, { throwOn: 'transform' })
        const good = fakeElement('good', log)
        const t = rafTimeline(node(), clock)
        const other = rafTimeline(node(), clock)
        const otherEl = fakeElement('other', log)
        t.bind(bad)
        t.bind(good)
        other.bind(otherEl)
        let notified = 0
        t.onUpdate(() => {
            notified++
        })
        t.play({ from: FROM })
        other.play({ from: FROM })
        expect(() => frames(2)).not.toThrow()

        expect(reported.length).toBeGreaterThan(0)
        expect(reported[0]).toBeInstanceOf(Error)
        expect(good.count('transform')).toBe(3)
        expect(otherEl.count('transform')).toBe(3)
        expect(notified).toBe(3)
    })

    it('E2: a timeline with several bindings still notifies once per frame', () => {
        const { clock, frame } = setup()
        const t = rafTimeline(node(), clock)
        t.bind(fakeElement('a'))
        t.bind(fakeElement('b'))
        t.bind(fakeElement('c'))
        let notified = 0
        t.onUpdate(() => {
            notified++
        })
        t.play({ from: FROM })
        notified = 0
        frame()
        frame()
        expect(notified).toBe(2)
    })

    it('E3: nothing is written or notified from inside update()', () => {
        const { clock, frame } = setup()
        const log: string[] = []
        const el = fakeElement('el', log)
        const t = rafTimeline(node(), clock)
        t.bind(el)
        t.onUpdate(() => {
            log.push('listener')
        })
        t.play({ from: FROM })
        log.length = 0
        // a probe subscribed after `t` logs when its own update runs
        clock.subscribe({
            update: () => {
                log.push('late-update')
            },
        })

        frame()

        expect(log[0]).toBe('late-update')
        expect(log.length).toBeGreaterThan(1)
    })
})
