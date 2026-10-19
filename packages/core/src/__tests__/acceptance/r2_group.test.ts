import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as a from '../../index'
import {
    createClock,
    type RafGroup,
    type RafGroupPlayConfig,
    type RunResult,
    rafGroup,
    rafTimeline,
    TimingFunction,
    type TimingFunctionContext,
} from '../../index'

const linear = a.timing.linear()
const node = (duration = 1) =>
    a.ani({
        to: { translateX: 100, opacity: 1 },
        duration,
        timing: linear,
    })

type Vec = { translateX: number; opacity: number }
const FROM: Vec = { translateX: 0, opacity: 0 }

// Groups report asynchronous errors via queueMicrotask(() => { throw e }).
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
        // long frames must apply in full (no lag smoothing)
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

function elements(count: number, log: string[] = []) {
    return Array.from({ length: count }, (_, i) => fakeElement(`el${i}`, log))
}

/** Values of one property over every target of the current run. */
function column(group: RafGroup<Vec>, key: keyof Vec): number[] {
    const out: number[] = []
    for (let i = 0; i < group.count; i++) out.push(group.valueAt(i)![key])
    return out
}

function expectClose(actual: readonly number[], expected: readonly number[]) {
    expect(actual).toHaveLength(expected.length)
    for (let i = 0; i < expected.length; i++) {
        expect(actual[i]).toBeCloseTo(expected[i]!, 6)
    }
}

/** Collects the result of a run promise; `results` holds every settlement. */
function track(promise: Promise<RunResult>) {
    const results: RunResult[] = []
    promise.then((result) => {
        results.push(result)
    })
    return results
}

async function flush() {
    for (let i = 0; i < 8; i++) await Promise.resolve()
}

describe('R2: rafGroup', () => {
    it('exports rafGroup and a.rafGroup', () => {
        expect(typeof rafGroup).toBe('function')
        expect(a.rafGroup).toBe(rafGroup)
    })

    it('A1: staggered targets evaluate the plan at groupTime - offset', () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.1 })
        expect(group.count).toBe(0)
        expect(group.valueAt(0)).toBeNull()

        group.play({ from: FROM, count: 3 })
        expect(group.status).toBe('PLAYING')
        expect(group.count).toBe(3)
        expect(group.duration).toBeCloseTo(1.2, 9)
        expectClose(column(group, 'translateX'), [0, 0, 0])

        for (let i = 0; i < 5; i++) frame(100)
        expectClose(column(group, 'translateX'), [50, 40, 30])
        expectClose(column(group, 'opacity'), [0.5, 0.4, 0.3])
    })

    it('A1: before its offset a target shows its from', () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.1 })
        group.play({ from: { translateX: 7, opacity: 0.25 }, count: 3 })

        frame(100)

        // 0.1 s: target 0 ran 0.1 s, target 1 starts now, target 2 has not
        expectClose(column(group, 'translateX'), [16.3, 7, 7])
        expectClose(column(group, 'opacity'), [0.325, 0.25, 0.25])
    })

    it('A1: the duration is the plan duration plus the largest offset', () => {
        const { clock } = setup()
        const none = rafGroup(node(2), { clock })
        none.play({ from: FROM, count: 4 })
        expect(none.duration).toBeCloseTo(2, 9)

        const fn = rafGroup(node(2), {
            clock,
            stagger: (index) => index * 0.5,
        })
        fn.play({ from: FROM, count: 4 })
        expect(fn.duration).toBeCloseTo(3.5, 9)
    })

    it('A2: the group is one clock subscriber whatever the target count', () => {
        const { clock, frame } = setup()
        expect(clock.size).toBe(0)
        const group = rafGroup(node(), { clock, stagger: 0.001 })
        expect(clock.size).toBe(0)

        group.bind(elements(1000))
        group.play({ from: FROM, count: 1000 })
        expect(group.count).toBe(1000)
        expect(clock.size).toBe(1)

        frame(100)
        expect(clock.size).toBe(1)

        const small = rafGroup(node(), { clock })
        small.play({ from: FROM, count: 3 })
        expect(clock.size).toBe(2)

        group.dispose()
        small.dispose()
        expect(clock.size).toBe(0)
    })

    it('A3: targets with the same offset and from share one evaluation', () => {
        class CountingLinear extends TimingFunction {
            public calls = 0
            public step(time: number, context: TimingFunctionContext) {
                this.calls++
                const progress =
                    context.duration === 0
                        ? 1
                        : Math.max(0, Math.min(time / context.duration, 1))
                return {
                    value:
                        context.from + (context.to - context.from) * progress,
                    endOfAnimation: time >= context.duration,
                }
            }
        }
        const timing = new CountingLinear()
        const tree = a.ani({
            to: { translateX: 100, opacity: 1 },
            duration: 1,
            timing,
        })
        const { clock, frame } = setup()
        const group = rafGroup(tree, { clock })
        group.bind(elements(100))
        group.play({ from: FROM, count: 100 })

        timing.calls = 0
        frame(100)

        expect(timing.calls).toBe(2)
        expect(column(group, 'translateX')).toEqual(new Array(100).fill(10))
    })

    it('A3: the evaluation cost is the number of distinct (offset, from) pairs', () => {
        class CountingLinear extends TimingFunction {
            public calls = 0
            public step(time: number, context: TimingFunctionContext) {
                this.calls++
                const progress = Math.max(0, Math.min(time, 1))
                return {
                    value:
                        context.from + (context.to - context.from) * progress,
                    endOfAnimation: time >= context.duration,
                }
            }
        }
        const timing = new CountingLinear()
        const tree = a.ani({
            to: { translateX: 100, opacity: 1 },
            duration: 1,
            timing,
        })
        const { clock, frame } = setup()

        // 4 distinct offsets, constant from
        const staggered = rafGroup(tree, { clock, stagger: 0.1 })
        staggered.play({ from: FROM, count: 4 })
        timing.calls = 0
        frame(500)
        expect(timing.calls).toBe(4 * 2)
        staggered.dispose()

        // one offset, 2 distinct froms among 50 targets
        const froms = rafGroup(tree, { clock })
        froms.play({
            from: (index) => ({ translateX: index % 2 ? 10 : 0, opacity: 0 }),
            count: 50,
        })
        timing.calls = 0
        frame(500)
        expect(timing.calls).toBe(2 * 2)
    })

    it('A4: the promise resolves ended after the last staggered target finished', async () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.1 })
        const statuses: string[] = []
        group.onUpdate(({ status }) => {
            statuses.push(status)
        })
        const results = track(group.play({ from: FROM, count: 3 }))

        frame(1100)
        await flush()
        // targets 0 and 1 are done, target 2 still runs
        expectClose(column(group, 'translateX'), [100, 100, 90])
        expect(group.status).toBe('PLAYING')
        expect(results).toEqual([])
        expect(statuses).not.toContain('ENDED')

        frame(100)
        await flush()
        expectClose(column(group, 'translateX'), [100, 100, 100])
        expectClose(column(group, 'opacity'), [1, 1, 1])
        expect(group.status).toBe('ENDED')
        expect(results).toEqual(['ended'])
        expect(statuses.filter((s) => s === 'ENDED')).toHaveLength(1)
        expect(statuses[statuses.length - 1]).toBe('ENDED')

        frame(100)
        frame(100)
        await flush()
        expect(statuses.filter((s) => s === 'ENDED')).toHaveLength(1)
        expect(results).toEqual(['ended'])
        expect(clock.size).toBe(0)
    })

    it('A4: ENDED is notified exactly once, in exactly one frame', () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.25 })
        let ended = 0
        let perFrame = 0
        group.onUpdate(({ status }) => {
            perFrame++
            if (status === 'ENDED') ended++
        })
        group.play({ from: FROM, count: 3 })

        const counts: number[] = []
        for (let i = 0; i < 8; i++) {
            perFrame = 0
            frame(400)
            counts.push(perFrame)
        }
        expect(ended).toBe(1)
        // 0.4 ... 1.6 (ends in the 4th frame); nothing afterwards
        expect(counts.slice(0, 4)).toEqual([1, 1, 1, 1])
        expect(counts.slice(4)).toEqual([0, 0, 0, 0])
    })

    it('A4: a new play interrupts the run, each promise settles once', async () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.1 })
        const first = track(group.play({ from: FROM, count: 3 }))
        frame(300)
        await flush()
        expect(first).toEqual([])

        const second = track(group.play({ from: FROM, count: 2 }))
        await flush()
        expect(first).toEqual(['interrupted'])
        expect(second).toEqual([])
        expect(group.status).toBe('PLAYING')
        expect(group.count).toBe(2)

        frame(2000)
        await flush()
        expect(second).toEqual(['ended'])
        expect(first).toEqual(['interrupted'])
    })

    it('A4: reset() resolves reset, also when paused', async () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.1 })
        const notified: string[] = []
        group.onUpdate(({ status }) => {
            notified.push(status)
        })
        const playing = track(group.play({ from: FROM, count: 3 }))
        frame(300)
        group.reset()
        await flush()
        expect(playing).toEqual(['reset'])
        expect(group.status).toBe('IDLE')
        expect(notified[notified.length - 1]).toBe('IDLE')
        expect(clock.size).toBe(0)

        const paused = track(group.play({ from: FROM, count: 3 }))
        frame(300)
        group.pause()
        expect(group.status).toBe('PAUSED')
        group.reset()
        await flush()
        expect(paused).toEqual(['reset'])
        expect(playing).toEqual(['reset'])

        // a finished run is not settled a second time
        const done = track(group.play({ from: FROM, count: 2 }))
        frame(5000)
        await flush()
        group.reset()
        await flush()
        expect(done).toEqual(['ended'])
    })

    it('A4: dispose() resolves disposed, leaves the clock, and is idempotent', async () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.1 })
        const results = track(group.play({ from: FROM, count: 3 }))
        frame(300)
        expect(clock.size).toBe(1)

        group.dispose()
        await flush()
        expect(results).toEqual(['disposed'])
        expect(clock.size).toBe(0)
        expect(() => group.dispose()).not.toThrow()
        expect(() => group.reset()).not.toThrow()
        expect(() => group.pause()).not.toThrow()
        expect(() => group.resume()).not.toThrow()
        frame(500)
        await flush()
        expect(results).toEqual(['disposed'])
        expect(clock.size).toBe(0)
    })

    it('A5: bind writes each element its own target in the commit phase', () => {
        const { clock, frame } = setup()
        const log: string[] = []
        const els = elements(3, log)
        const group = rafGroup(node(), { clock, stagger: 0.25 })
        group.bind(els)
        group.play({ from: FROM })
        expect(group.count).toBe(3)
        // a probe subscribed after the group: its update runs after the
        // group's update and before every commit
        clock.subscribe({
            update: () => {
                log.push('probe-update')
            },
            commit: () => {
                log.push('probe-commit')
            },
        })
        log.length = 0

        frame(500)

        expect(log[0]).toBe('probe-update')
        const firstWrite = log.findIndex((e) => e.startsWith('el'))
        expect(firstWrite).toBeGreaterThan(0)
        expect(els[0]!.current.transform).toBe('translateX(50px)')
        expect(els[0]!.current.opacity).toBe(0.5)
        expect(els[1]!.current.transform).toBe('translateX(25px)')
        expect(els[1]!.current.opacity).toBe(0.25)
        expect(els[2]!.current.transform).toBe('translateX(0px)')
        expect(els[2]!.current.opacity).toBe(0)
    })

    it('A5: writes happen after every update ran', () => {
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
        const els = elements(3, log)
        const group = rafGroup(node(), { clock, stagger: 0.25 })
        group.bind(els)
        group.play({ from: FROM })
        log.length = 0

        frame(500)

        expect(log.slice(0, 2)).toEqual(['probe-update', 'probe-commit'])
        expect(log.length).toBeGreaterThan(2)
        expect(log.slice(2).every((e) => e.startsWith('el'))).toBe(true)
    })

    it('A5: only declarations whose written value changed are written', () => {
        const { clock, frames } = setup()
        const els = elements(3)
        const group = rafGroup(node(), { clock, stagger: 0.25 })
        group.bind(els)
        group.play({ from: { translateX: 0, opacity: 1 } })

        frames(3, 100)

        // opacity never changes; element i starts to move at 0.25 * i
        expect(els.map((el) => el.count('opacity'))).toEqual([1, 1, 1])
        expect(els.map((el) => el.count('transform'))).toEqual([4, 2, 1])
    })

    it('A5: bind before play writes at play, not before', () => {
        const { clock } = setup()
        const els = elements(2)
        const group = rafGroup(node(), { clock })
        group.bind(els)
        expect(els[0]!.writes).toHaveLength(0)
        expect(els[1]!.writes).toHaveLength(0)

        group.play({ from: { translateX: 20, opacity: 0.5 } })

        expect(group.count).toBe(2)
        for (const el of els) {
            expect(el.current.transform).toBe('translateX(20px)')
            expect(el.current.opacity).toBe(0.5)
        }
    })

    it('A5: a late bind writes immediately', () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.25 })
        group.play({ from: FROM, count: 3 })
        frame(500)

        const late = elements(3)
        group.bind(late)

        expect(late[0]!.current.transform).toBe('translateX(50px)')
        expect(late[1]!.current.transform).toBe('translateX(25px)')
        expect(late[2]!.current.transform).toBe('translateX(0px)')
        expect(late[0]!.current.opacity).toBe(0.5)
        for (const el of late) expect(el.count('transform')).toBe(1)
    })

    it('A5: two bindings of one group each keep their own cache', () => {
        const { clock, frames } = setup()
        const first = elements(1)
        const group = rafGroup(node(), { clock })
        group.bind(first)
        group.play({ from: { translateX: 0, opacity: 1 }, count: 1 })
        frames(2)
        const second = elements(1)
        group.bind(second)
        expect(second[0]!.count('transform')).toBe(1)
        expect(second[0]!.count('opacity')).toBe(1)
        frames(2)
        expect(second[0]!.count('transform')).toBe(3)
        expect(second[0]!.count('opacity')).toBe(1)
        expect(first[0]!.count('transform')).toBe(5)
        expect(second[0]!.current.transform).toBe(first[0]!.current.transform)
    })

    it('A5: unbind stops the writes of its elements, keeps styles, is idempotent', () => {
        const { clock, frames } = setup()
        const kept = elements(2)
        const gone = elements(2)
        const group = rafGroup(node(), { clock })
        group.bind(kept)
        const unbind = group.bind(gone)
        group.play({ from: FROM })
        frames(2)
        const goneWrites = gone.map((el) => el.writes.length)
        const goneTransform = gone[0]!.current.transform
        expect(goneWrites[0]).toBeGreaterThan(0)

        unbind()
        unbind()
        const keptWrites = kept[0]!.writes.length
        frames(2)

        expect(gone.map((el) => el.writes.length)).toEqual(goneWrites)
        expect(gone[0]!.current.transform).toBe(goneTransform)
        expect(kept[0]!.writes.length).toBeGreaterThan(keptWrites)
    })

    it('A5: elements beyond count are left alone, missing ones are not written', () => {
        const { clock, frame } = setup()
        const extra = elements(4)
        const group = rafGroup(node(), { clock })
        group.bind(extra)
        group.play({ from: FROM, count: 2 })
        frame(100)
        expect(group.count).toBe(2)
        expect(extra[0]!.writes.length).toBeGreaterThan(0)
        expect(extra[1]!.writes.length).toBeGreaterThan(0)
        expect(extra[2]!.writes).toHaveLength(0)
        expect(extra[3]!.writes).toHaveLength(0)

        const few = elements(2)
        const group2 = rafGroup(node(), { clock })
        group2.bind(few)
        expect(() => group2.play({ from: FROM, count: 5 })).not.toThrow()
        expect(() => frame(100)).not.toThrow()
        expect(group2.count).toBe(5)
        expect(group2.valueAt(4)).not.toBeNull()
        expect(few[0]!.writes.length).toBeGreaterThan(0)
        expect(few[1]!.writes.length).toBeGreaterThan(0)
        expect(reported).toEqual([])
    })

    it('A5: dispose drops the bindings', () => {
        const { clock, frames } = setup()
        const els = elements(2)
        const group = rafGroup(node(), { clock })
        group.bind(els)
        group.play({ from: FROM })
        frames(2)
        const writes = els.map((el) => el.writes.length)

        group.dispose()
        frames(3)
        expect(els.map((el) => el.writes.length)).toEqual(writes)

        const late = elements(1)
        const unbind = group.bind(late)
        expect(typeof unbind).toBe('function')
        expect(() => unbind()).not.toThrow()
        frames(2)
        expect(late[0]!.writes).toHaveLength(0)
    })

    it('A5: a resolver passed to bind decides the written key', () => {
        const { clock, frames } = setup()
        const els = elements(2)
        const group = rafGroup(node(), { clock })
        group.bind(els, {
            resolver: {
                translateX: (v: number) => ({ key: 'left', value: `${v}px` }),
            },
        })
        group.play({ from: FROM })
        frames(2)

        for (const el of els) {
            expect(el.count('left')).toBe(3)
            expect(el.count('transform')).toBe(0)
            expect(el.count('opacity')).toBeGreaterThan(0)
            expect(el.current.left).toBe(`${group.valueAt(0)!.translateX}px`)
        }
    })

    it('A5: the style of a runtime is computed once per frame and shared', () => {
        const { clock, frame } = setup()
        let resolved = 0
        const resolver = {
            translateX: (v: number) => {
                resolved++
                return { key: 'left', value: `${v}px` }
            },
        }

        const shared = rafGroup(node(), { clock })
        shared.bind(elements(100), { resolver })
        shared.play({ from: FROM, count: 100 })
        resolved = 0
        frame(100)
        expect(resolved).toBe(1)
        shared.dispose()

        const two = rafGroup(node(), { clock })
        two.bind(elements(100), { resolver })
        two.play({
            from: (index) => ({ translateX: index % 2 ? 10 : 0, opacity: 0 }),
            count: 100,
        })
        resolved = 0
        frame(100)
        expect(resolved).toBe(2)
    })

    it('A5: array-shaped values report one TypeError asynchronously and drop the binding', () => {
        const { clock, frames } = setup()
        const arrayNode = a.ani({ to: [0, 100], duration: 1, timing: linear })
        const bad = rafGroup(arrayNode, { clock })
        const good = rafGroup(node(), { clock })
        const badEl = elements(1)
        const goodEl = elements(1)

        expect(() => bad.bind(badEl)).not.toThrow()
        good.bind(goodEl)
        expect(() => bad.play({ from: [0, 0], count: 1 })).not.toThrow()
        good.play({ from: FROM, count: 1 })
        expect(() => frames(3)).not.toThrow()

        expect(reported).toHaveLength(1)
        expect(reported[0]).toBeInstanceOf(TypeError)
        expect(badEl[0]!.writes).toHaveLength(0)
        expect(goodEl[0]!.count('transform')).toBe(4)
        expect(bad.status).toBe('PLAYING')
    })

    it('A5: binding an array-shaped group that has a value reports instead of throwing', () => {
        const { clock, frames } = setup()
        const arrayNode = a.ani({ to: [0, 100], duration: 1, timing: linear })
        const group = rafGroup(arrayNode, { clock })
        group.play({ from: [0, 0], count: 1 })
        const el = elements(1)

        expect(() => group.bind(el)).not.toThrow()
        frames(3)

        expect(reported).toHaveLength(1)
        expect(reported[0]).toBeInstanceOf(TypeError)
        expect(el[0]!.writes).toHaveLength(0)
    })

    it('A5: a failing write is isolated per element and reported asynchronously', () => {
        const { clock, frames } = setup()
        const log: string[] = []
        const bad = fakeElement('bad', log, { throwOn: 'transform' })
        const good = fakeElement('good', log)
        const group = rafGroup(node(), { clock })
        const other = rafGroup(node(), { clock })
        const otherEl = fakeElement('other', log)
        group.bind([bad, good])
        other.bind([otherEl])
        let notified = 0
        group.onUpdate(() => {
            notified++
        })
        group.play({ from: FROM, count: 2 })
        other.play({ from: FROM, count: 1 })

        expect(() => frames(2)).not.toThrow()

        expect(reported.length).toBeGreaterThan(0)
        expect(reported[0]).toBeInstanceOf(Error)
        expect(good.count('transform')).toBe(3)
        expect(otherEl.count('transform')).toBe(3)
        expect(notified).toBe(3)
    })

    it('A6: function from and function stagger give per-target values', () => {
        const { clock, frames } = setup()
        const indices: number[] = []
        const counts = new Set<number>()
        const group = rafGroup(node(), {
            clock,
            stagger: (index, count) => {
                indices.push(index)
                counts.add(count)
                return (count - 1 - index) * 0.25
            },
        })
        const froms: number[] = []
        group.play({
            from: (index) => {
                froms.push(index)
                return { translateX: index * 10, opacity: 0 }
            },
            count: 3,
        })

        expect([...new Set(indices)].sort()).toEqual([0, 1, 2])
        expect([...counts]).toEqual([3])
        expect([...new Set(froms)].sort()).toEqual([0, 1, 2])
        expect(group.duration).toBeCloseTo(1.5, 9)
        expectClose(column(group, 'translateX'), [0, 10, 20])

        frames(3, 250)

        // offsets 0.5, 0.25, 0 at group time 0.75: local 0.25, 0.5, 0.75
        expectClose(column(group, 'translateX'), [25, 55, 80])
        expectClose(column(group, 'opacity'), [0.25, 0.5, 0.75])
    })

    it('A6: a function from is bound to the right element', () => {
        const { clock, frame } = setup()
        const els = elements(3)
        const group = rafGroup(node(), { clock })
        group.bind(els)
        group.play({
            from: (index) => ({ translateX: index * 40, opacity: 0 }),
        })
        expect(els.map((el) => el.current.transform)).toEqual([
            'translateX(0px)',
            'translateX(40px)',
            'translateX(80px)',
        ])
        frame(500)
        expect(els.map((el) => el.current.transform)).toEqual([
            'translateX(50px)',
            'translateX(70px)',
            'translateX(90px)',
        ])
    })

    it('A6: the stagger defaults to 0', () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock })
        group.play({ from: FROM, count: 3 })
        expect(group.duration).toBeCloseTo(1, 9)
        frame(250)
        expectClose(column(group, 'translateX'), [25, 25, 25])
    })

    describe('A7: invalid input throws synchronously before anything changes', () => {
        type Case = {
            name: string
            config: unknown
            tree?: unknown
            error?: ErrorConstructor | typeof TypeError | typeof RangeError
            /** Stagger once armed; the group is valid until the bad play. */
            stagger?: (index: number) => number
        }
        const arrayTree = () =>
            a.ani({ to: [0, 100], duration: 1, timing: linear })
        const cases: Case[] = [
            { name: 'no targets and no count', config: { from: FROM } },
            { name: 'count 0', config: { from: FROM, count: 0 } },
            { name: 'negative count', config: { from: FROM, count: -2 } },
            { name: 'fractional count', config: { from: FROM, count: 1.5 } },
            { name: 'NaN count', config: { from: FROM, count: Number.NaN } },
            {
                name: 'negative delay',
                config: { from: FROM, count: 3, delay: -1 },
            },
            {
                name: 'NaN delay',
                config: { from: FROM, count: 3, delay: Number.NaN },
            },
            {
                name: 'infinite delay',
                config: {
                    from: FROM,
                    count: 3,
                    delay: Number.POSITIVE_INFINITY,
                },
            },
            {
                name: 'NaN offset from the stagger function',
                config: { from: FROM, count: 3 },
                stagger: () => Number.NaN,
            },
            {
                name: 'NaN offset for one index only',
                config: { from: FROM, count: 3 },
                stagger: (index) => (index === 2 ? Number.NaN : 0.1),
            },
            {
                name: 'negative offset from the stagger function',
                config: { from: FROM, count: 3 },
                stagger: (index) => (index === 1 ? -0.1 : 0),
            },
            {
                name: 'infinite offset from the stagger function',
                config: { from: FROM, count: 3 },
                stagger: () => Number.POSITIVE_INFINITY,
            },
            {
                name: 'array from for a record tree',
                config: { from: [0, 0], count: 3 },
                error: TypeError,
            },
            {
                name: 'record from for an array tree',
                tree: arrayTree(),
                config: { from: { translateX: 0 }, count: 3 },
                error: TypeError,
            },
            {
                name: 'function from returning an array for one index',
                config: {
                    from: (index: number) =>
                        index === 2 ? [0, 0] : { translateX: 0, opacity: 0 },
                    count: 3,
                },
                error: TypeError,
            },
            {
                name: 'non-finite from value',
                config: {
                    from: { translateX: Number.NaN, opacity: 0 },
                    count: 3,
                },
                error: TypeError,
            },
            {
                name: 'non-finite from value for one index only',
                config: {
                    from: (index: number) => ({
                        translateX: index === 1 ? Number.NaN : 0,
                        opacity: 0,
                    }),
                    count: 3,
                },
                error: TypeError,
            },
            {
                name: 'missing from',
                config: { count: 3 },
                error: TypeError,
            },
            {
                name: 'keyframes of the wrong length',
                config: {
                    from: FROM,
                    count: 3,
                    keyframes: [FROM, FROM, FROM],
                },
            },
        ]

        for (const entry of cases) {
            it(`A7: ${entry.name}`, async () => {
                const { clock, frame } = setup()
                const armed = { on: false }
                const tree = (entry.tree ?? node()) as ReturnType<typeof node>
                const group = rafGroup(tree, {
                    clock,
                    stagger: (index) =>
                        armed.on && entry.stagger
                            ? entry.stagger(index)
                            : index * 0.1,
                }) as unknown as RafGroup<Vec>
                const isArray = entry.tree !== undefined
                const validFrom = (isArray ? [0, 0] : FROM) as Vec
                const settled = track(group.play({ from: validFrom, count: 3 }))
                frame(200)
                const before = isArray
                    ? [0, 1, 2].map((i) => group.valueAt(i))
                    : [column(group, 'translateX'), column(group, 'opacity')]
                const notifications: string[] = []
                group.onUpdate(({ status }) => {
                    notifications.push(status)
                })
                const duration = group.duration
                armed.on = true

                const bad = () =>
                    group.play(entry.config as RafGroupPlayConfig<Vec>)
                if (entry.error) expect(bad).toThrow(entry.error)
                else expect(bad).toThrow()

                // nothing changed: same run, same values, no notification
                expect(group.status).toBe('PLAYING')
                expect(group.count).toBe(3)
                expect(group.duration).toBe(duration)
                expect(clock.size).toBe(1)
                expect(notifications).toEqual([])
                await flush()
                expect(settled).toEqual([])
                const after = isArray
                    ? [0, 1, 2].map((i) => group.valueAt(i))
                    : [column(group, 'translateX'), column(group, 'opacity')]
                expect(after).toEqual(before)
                expect(reported).toEqual([])

                // the original run continues and completes
                frame(5000)
                await flush()
                expect(settled).toEqual(['ended'])
            })
        }

        it('A7: a group that never played stays idle after a rejected play', () => {
            const { clock } = setup()
            const group = rafGroup(node(), { clock })
            const els = elements(2)
            expect(() => group.play({ from: FROM })).toThrow()
            expect(() => group.play({ from: FROM, count: 0 })).toThrow()
            expect(() => group.play({ from: FROM, delay: -1 })).toThrow()
            group.dispose()
            expect(els[0]!.writes).toHaveLength(0)

            const idle = rafGroup(node(), { clock })
            idle.bind(els)
            expect(() => idle.play({ from: FROM, delay: Number.NaN })).toThrow()
            expect(idle.status).toBe('IDLE')
            expect(idle.count).toBe(0)
            expect(idle.valueAt(0)).toBeNull()
            expect(els[0]!.writes).toHaveLength(0)
            expect(clock.size).toBe(0)
        })

        it('A7: with elements bound the count defaults and need not be given', () => {
            const { clock } = setup()
            const group = rafGroup(node(), { clock })
            group.bind(elements(3))
            expect(() => group.play({ from: FROM })).not.toThrow()
            expect(group.count).toBe(3)
        })
    })

    it('A8: seek pauses, notifies once with all target states, resume continues', async () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.1 })
        const seen: { count: number; status: string; xs: number[] }[] = []
        group.onUpdate(({ states, status }) => {
            seen.push({
                count: states.length,
                status,
                xs: states.map((s) => s.translateX),
            })
        })
        const results = track(group.play({ from: FROM, count: 3 }))
        frame(100)
        seen.length = 0

        group.seek(0.6)

        expect(group.status).toBe('PAUSED')
        expect(seen).toHaveLength(1)
        expect(seen[0]!.status).toBe('PAUSED')
        expect(seen[0]!.count).toBe(3)
        expectClose(seen[0]!.xs, [60, 50, 40])
        expectClose(column(group, 'translateX'), [60, 50, 40])

        frame(100)
        frame(100)
        expect(seen).toHaveLength(1)
        expectClose(column(group, 'translateX'), [60, 50, 40])

        group.resume()
        expect(group.status).toBe('PLAYING')
        frame(100)
        expectClose(column(group, 'translateX'), [70, 60, 50])
        expect(seen[seen.length - 1]!.status).toBe('PLAYING')

        await flush()
        expect(results).toEqual([])
        frame(2000)
        await flush()
        expect(results).toEqual(['ended'])
    })

    it('A8: seek clamps to [0, duration] and writes the bound targets', () => {
        const { clock } = setup()
        const els = elements(3)
        const group = rafGroup(node(), { clock, stagger: 0.25 })
        group.bind(els)
        group.play({ from: FROM })

        group.seek(-5)
        expectClose(column(group, 'translateX'), [0, 0, 0])
        expect(group.status).toBe('PAUSED')

        group.seek(0.75)
        expect(els.map((el) => el.current.transform)).toEqual([
            'translateX(75px)',
            'translateX(50px)',
            'translateX(25px)',
        ])

        group.seek(99)
        expectClose(column(group, 'translateX'), [100, 100, 100])
        expect(els.map((el) => el.current.transform)).toEqual([
            'translateX(100px)',
            'translateX(100px)',
            'translateX(100px)',
        ])
        expect(group.status).toBe('PAUSED')
    })

    it('A8: seek before the first play is a no-op', () => {
        const { clock } = setup()
        const group = rafGroup(node(), { clock })
        let notified = 0
        group.onUpdate(() => {
            notified++
        })
        expect(() => group.seek(0.5)).not.toThrow()
        expect(notified).toBe(0)
        expect(group.status).toBe('IDLE')
    })

    it('A8: pause freezes the run and resume continues from there', () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.1 })
        group.play({ from: FROM, count: 3 })
        frame(500)
        group.pause()
        expect(group.status).toBe('PAUSED')
        frame(300)
        expectClose(column(group, 'translateX'), [50, 40, 30])

        group.resume()
        expect(group.status).toBe('PLAYING')
        frame(100)
        expectClose(column(group, 'translateX'), [60, 50, 40])
    })

    it('A9: repeat runs the whole staggered group again and ends once', async () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.25 })
        const statuses: string[] = []
        group.onUpdate(({ status }) => {
            statuses.push(status)
        })
        const results = track(group.play({ from: FROM, count: 3, repeat: 1 }))
        // one run lasts 1 + 0.5 = 1.5 s
        expect(group.duration).toBeCloseTo(1.5, 9)

        frame(1400)
        expectClose(column(group, 'translateX'), [100, 100, 90])

        // 0.1 s into the second run: only target 0 has started
        frame(200)
        expect(group.status).toBe('PLAYING')
        expectClose(column(group, 'translateX'), [10, 0, 0])
        expect(statuses).not.toContain('ENDED')

        // 2.9 s in: second run at 1.4 s
        frame(1300)
        await flush()
        expect(group.status).toBe('PLAYING')
        expectClose(column(group, 'translateX'), [100, 100, 90])
        expect(results).toEqual([])
        expect(statuses).not.toContain('ENDED')

        // 3.1 s in: past 2 * 1.5 s
        frame(200)
        await flush()
        expect(group.status).toBe('ENDED')
        expectClose(column(group, 'translateX'), [100, 100, 100])
        expect(results).toEqual(['ended'])
        expect(statuses.filter((s) => s === 'ENDED')).toHaveLength(1)

        frame(1000)
        await flush()
        expect(statuses.filter((s) => s === 'ENDED')).toHaveLength(1)
        expect(results).toEqual(['ended'])
    })

    it('A9: with stagger 0.1 the repeated group lasts 2.4 s', async () => {
        const { clock, frame } = setup()
        const group = rafGroup(node(), { clock, stagger: 0.1 })
        let ended = 0
        group.onUpdate(({ status }) => {
            if (status === 'ENDED') ended++
        })
        const results = track(group.play({ from: FROM, count: 3, repeat: 1 }))
        expect(group.duration).toBeCloseTo(1.2, 9)

        let endedFrame = -1
        for (let i = 1; i <= 40 && endedFrame < 0; i++) {
            frame(100)
            if (group.status === 'ENDED') endedFrame = i
        }
        // 24 frames of 0.1 s (23 would be 2.3 s: not yet; 25 only on float drift)
        expect(endedFrame).toBeGreaterThanOrEqual(24)
        expect(endedFrame).toBeLessThanOrEqual(25)
        await flush()
        expect(results).toEqual(['ended'])
        expect(ended).toBe(1)
        frame(100)
        frame(100)
        expect(ended).toBe(1)
    })

    describe('A10: interruption keeps each target velocity', () => {
        const spring = a.timing.dynamicSpring({ m: 1, k: 100, c: 10 })
        const springNode = () =>
            a.ani({ to: { x: 800 }, duration: 2, timing: spring })

        function xs(group: RafGroup<{ x: number }>) {
            const out: number[] = []
            for (let i = 0; i < group.count; i++) out.push(group.valueAt(i)!.x)
            return out
        }

        function interruptAgainstControl(velocity?: { x: number }) {
            const { clock, frames } = setup()
            const group = rafGroup(springNode(), { clock })
            const control = rafGroup(springNode(), { clock })
            const from = (index: number) => ({ x: index * 100 })
            group.play({ from, count: 3 })
            control.play({ from, count: 3 })

            frames(4)
            const before = xs(group)
            expect(before).toEqual(xs(control))
            // every target moves at its own speed (target 1 starts closer to
            // the spring target, so it has moved less)
            expect(before[1]! - 100).toBeLessThan(before[0]!)
            expect(before[0]).toBeGreaterThan(1)
            group.play({
                from: (index) => ({ x: before[index]! }),
                count: 3,
                ...(velocity ? { velocity } : {}),
            })

            let worst = 0
            for (let i = 0; i < 30; i++) {
                frames(1)
                const mine = xs(group)
                const reference = xs(control)
                for (let t = 0; t < 3; t++) {
                    worst = Math.max(worst, Math.abs(mine[t]! - reference[t]!))
                }
            }
            return worst
        }

        it('A10: an interrupted group continues like an uninterrupted control', () => {
            expect(interruptAgainstControl()).toBeLessThanOrEqual(1e-3)
        })

        it('A10: the test can see a velocity drop', () => {
            expect(interruptAgainstControl({ x: 0 })).toBeGreaterThan(1)
        })

        it('A10: velocity seeds every target like rafTimeline', () => {
            const { clock, frames } = setup()
            const group = rafGroup(springNode(), { clock })
            const plain = rafGroup(springNode(), { clock })
            const line = rafTimeline(springNode(), { clock })
            group.play({ from: { x: 0 }, count: 2, velocity: { x: 5000 } })
            plain.play({ from: { x: 0 }, count: 2 })
            line.play({ from: { x: 0 }, velocity: { x: 5000 } })

            frames(3)

            const expected = line.value!.x
            expect(xs(group)[0]).toBeCloseTo(expected, 6)
            expect(xs(group)[1]).toBeCloseTo(expected, 6)
            expect(Math.abs(xs(plain)[0]! - expected)).toBeGreaterThan(1)
        })
    })

    describe('onUpdate', () => {
        it('S6: play, seek and reset notify synchronously with frozen states', () => {
            const { clock } = setup()
            const group = rafGroup(node(), { clock, stagger: 0.1 })
            const seen: {
                status: string
                count: number
                frozen: boolean
                xs: number[]
            }[] = []
            group.onUpdate(({ states, status }) => {
                seen.push({
                    status,
                    count: states.length,
                    frozen: states.every((s) => Object.isFrozen(s)),
                    xs: states.map((s) => s.translateX),
                })
            })

            group.play({ from: { translateX: 5, opacity: 0 }, count: 3 })
            expect(seen).toHaveLength(1)
            expect(seen[0]).toEqual({
                status: 'PLAYING',
                count: 3,
                frozen: true,
                xs: [5, 5, 5],
            })

            group.seek(0.5)
            expect(seen).toHaveLength(2)
            expect(seen[1]!.status).toBe('PAUSED')
            expect(seen[1]!.count).toBe(3)
            expect(seen[1]!.frozen).toBe(true)
            expectClose(seen[1]!.xs, [52.5, 43, 33.5])

            group.reset()
            expect(seen).toHaveLength(3)
            expect(seen[2]!.status).toBe('IDLE')
            expect(reported).toEqual([])
        })

        it('S6: one notification per frame, after the writes, sharing one states array', () => {
            const { clock, frame } = setup()
            const log: string[] = []
            const els = elements(2, log)
            const group = rafGroup(node(), { clock })
            group.bind(els)
            const arrays: unknown[] = []
            group.onUpdate(({ states }) => {
                log.push('listener-1')
                arrays.push(states)
            })
            group.onUpdate(({ states }) => {
                log.push('listener-2')
                arrays.push(states)
            })
            group.play({ from: FROM })
            log.length = 0
            arrays.length = 0

            frame(100)

            expect(log.filter((e) => e.startsWith('listener'))).toEqual([
                'listener-1',
                'listener-2',
            ])
            expect(log.slice(-2)).toEqual(['listener-1', 'listener-2'])
            expect(log.slice(0, -2).length).toBeGreaterThan(0)
            expect(arrays[0]).toBe(arrays[1])
            expect(els[0]!.current.transform).toBe('translateX(10px)')
        })

        it('S6: the unsubscribe function stops notifications', () => {
            const { clock, frame } = setup()
            const group = rafGroup(node(), { clock })
            let notified = 0
            const off = group.onUpdate(() => {
                notified++
            })
            group.play({ from: FROM, count: 2 })
            frame(100)
            const n = notified
            off()
            off()
            frame(100)
            expect(notified).toBe(n)
        })

        it('S6: valueAt is a frozen snapshot, null out of range and before play', () => {
            const { clock, frame } = setup()
            const group = rafGroup(node(), { clock })
            expect(group.valueAt(0)).toBeNull()

            group.play({ from: FROM, count: 3 })
            const first = group.valueAt(0)!
            expect(Object.isFrozen(first)).toBe(true)
            expect(first.translateX).toBe(0)
            expect(group.valueAt(3)).toBeNull()
            expect(group.valueAt(-1)).toBeNull()
            expect(group.valueAt(1.5)).toBeNull()

            frame(100)
            expect(first.translateX).toBe(0)
            expect(group.valueAt(0)!.translateX).toBeCloseTo(10, 9)
        })

        it('S6: a listener that resets the group stops the rest of that frame', () => {
            const { clock, frames } = setup()
            const els = elements(2)
            const group = rafGroup(node(), { clock })
            group.bind(els)
            const second: string[] = []
            let armed = false
            group.onUpdate(() => {
                if (armed) group.reset()
            })
            group.onUpdate(({ status }) => {
                second.push(status)
            })
            group.play({ from: FROM, count: 2 })
            second.length = 0
            armed = true

            frames(1)
            const writes = els[0]!.writes.length
            expect(second.every((status) => status === 'IDLE')).toBe(true)
            expect(second.length).toBeLessThanOrEqual(1)
            expect(group.status).toBe('IDLE')

            frames(3)
            expect(els[0]!.writes).toHaveLength(writes)
            expect(second.every((status) => status === 'IDLE')).toBe(true)
            expect(reported).toEqual([])
        })

        it('S6: a listener that replays the group stops the stale frame', () => {
            const { clock, frame } = setup()
            const group = rafGroup(node(), { clock })
            const second: { status: string; x: number }[] = []
            let armed = false
            group.onUpdate(() => {
                if (!armed) return
                armed = false
                group.play({ from: FROM, count: 2 })
            })
            group.onUpdate(({ states, status }) => {
                second.push({ status, x: states[0]!.translateX })
            })
            group.play({ from: FROM, count: 2 })
            second.length = 0
            armed = true

            frame(500)

            // the stale 0.5 s frame is never delivered to the second listener
            expect(second.every((entry) => entry.x === 0)).toBe(true)
            expect(second.length).toBeLessThanOrEqual(1)
            expect(group.status).toBe('PLAYING')
            expect(reported).toEqual([])
        })

        it('S6: a failing listener is isolated and rethrown asynchronously', () => {
            const { clock, frames } = setup()
            const els = elements(2)
            const group = rafGroup(node(), { clock })
            group.bind(els)
            const boom = new Error('listener boom')
            let after = 0
            group.onUpdate(() => {
                throw boom
            })
            group.onUpdate(() => {
                after++
            })
            expect(() => group.play({ from: FROM, count: 2 })).not.toThrow()
            expect(() => frames(2)).not.toThrow()

            expect(after).toBe(3)
            expect(reported).toEqual([boom, boom, boom])
            expect(els[0]!.count('transform')).toBe(3)
            expect(group.status).toBe('PLAYING')
        })

        it('S6: a group disposed between its update and its commit neither writes nor notifies', () => {
            const { clock, frame } = setup()
            const els = elements(2)
            const group = rafGroup(node(), { clock })
            group.bind(els)
            let notified = 0
            group.onUpdate(() => {
                notified++
            })
            group.play({ from: FROM, count: 2 })
            // subscribed after the group: updates after it, before every commit
            clock.subscribe({ update: () => group.dispose() })
            const writes = els[0]!.writes.length
            const n = notified

            frame(100)

            expect(els[0]!.writes).toHaveLength(writes)
            expect(notified).toBe(n)
        })

        it('S6: dispose drops every listener', () => {
            const { clock, frames } = setup()
            const group = rafGroup(node(), { clock })
            let notified = 0
            group.onUpdate(() => {
                notified++
            })
            group.play({ from: FROM, count: 2 })
            frames(2)
            const n = notified
            group.dispose()
            frames(3)
            expect(notified).toBe(n)
        })
    })
})
