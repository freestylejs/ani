import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RunResult } from '~/ani/core'
import { a, createClock, createStates } from '../../index'

type Values = { translateX: number }
type StateName = 'idle' | 'active'
type Frame = { state: Values; status: string }
interface Timeline {
    status: string
    value: Values | null
    getCurrentValue(): Values | null
    reset(): void
    bind(target: { style: CSSStyleDeclaration }): () => void
    onUpdate(callback: (frame: Frame) => void): () => void
}

/** The V2 surface of the state machine, typed locally for the oracle. */
interface Machine {
    timeline(): Timeline
    state(): StateName
    readonly value: Values
    transitionTo(
        state: string,
        config?: { interrupt?: boolean; from?: Values },
        canBeIntercepted?: boolean
    ): Promise<RunResult>
    bind(
        target: { style: CSSStyleDeclaration },
        options?: {
            resolver?: Record<
                string,
                (v: number) => { key: string; value: string | number }
            >
        }
    ): () => void
    onUpdate(callback: (frame: Frame) => void): () => void
    onTransition(
        listener: (state: StateName, timeline: Timeline) => void
    ): () => void
    onTimelineChange(listener: (timeline: Timeline) => void): () => void
    dispose(): void
}

// Errors of listeners are reported via queueMicrotask(() => { throw e }).
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
        /** Frames of one second each, enough to end any run. */
        finish() {
            frame(1000)
            frame(1000)
        },
    }
}

type Write = { prop: string; value: unknown }

/** `{ style }` whose every write (assignment or `setProperty`) is logged. */
function fakeElement() {
    const writes: Write[] = []
    const current: Record<string, unknown> = {}
    const record = (prop: string, value: unknown) => {
        writes.push({ prop, value })
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
        writes,
        current,
        count(prop: string) {
            return writes.filter((w) => w.prop === prop).length
        },
    }
}

const linear = a.timing.linear()
const states = () => ({
    idle: a.ani({ to: { translateX: 0 }, duration: 1, timing: linear }),
    active: a.ani({ to: { translateX: 100 }, duration: 1, timing: linear }),
})

function make(
    clock: ReturnType<typeof setup>['clock'],
    props: Record<string, unknown> = { initialValue: { translateX: 0 } }
): Machine {
    return createStates({
        initial: 'idle',
        states: states(),
        clock,
        ...props,
    } as unknown as Parameters<typeof createStates>[0]) as unknown as Machine
}

describe('ST: createStates V2 surface', () => {
    it('A1: initialValue works like initialFrom', () => {
        const viaValue = setup()
        const viaFrom = setup()
        const m1 = make(viaValue.clock, { initialValue: { translateX: 20 } })
        const m2 = make(viaFrom.clock, { initialFrom: { translateX: 20 } })

        void m1.transitionTo('active')
        void m2.transitionTo('active')
        viaValue.frame(500)
        viaFrom.frame(500)

        expect(m1.timeline().value).toEqual({ translateX: 60 })
        expect(m2.timeline().value).toEqual({ translateX: 60 })
        expect(m1.value).toEqual(m2.value)
    })

    it('A1: both initialValue and initialFrom throw a TypeError', () => {
        const { clock } = setup()
        expect(() =>
            make(clock, {
                initialValue: { translateX: 0 },
                initialFrom: { translateX: 0 },
            })
        ).toThrow(TypeError)
    })

    it('A1: neither initialValue nor initialFrom throws a TypeError', () => {
        const { clock } = setup()
        expect(() => make(clock, {})).toThrow(TypeError)
    })

    it('A2: transitionTo resolves "ended" after the run', async () => {
        const { clock, frame, finish } = setup()
        const machine = make(clock)

        const run = machine.transitionTo('active')
        frame(500)
        expect(machine.timeline().status).toBe('PLAYING')
        finish()

        expect(await run).toBe('ended')
        expect(machine.state()).toBe('active')
        expect(machine.value).toEqual({ translateX: 100 })
    })

    it('A2: a transition during a run resolves the first as "interrupted"', async () => {
        const { clock, frame, finish } = setup()
        const machine = make(clock)

        const first = machine.transitionTo('active')
        frame(500)
        const second = machine.transitionTo('idle')

        expect(await first).toBe('interrupted')
        finish()
        expect(await second).toBe('ended')
        expect(machine.state()).toBe('idle')
    })

    it('A2: interrupt: false while playing resolves "skipped" and changes nothing', async () => {
        const { clock, frame, finish } = setup()
        const machine = make(clock)

        const first = machine.transitionTo('active')
        frame(500)
        const timeline = machine.timeline()
        const skipped = machine.transitionTo('idle', { interrupt: false })

        expect(await skipped).toBe('skipped')
        expect(machine.state()).toBe('active')
        expect(machine.timeline()).toBe(timeline)
        expect(timeline.status).toBe('PLAYING')
        finish()
        expect(await first).toBe('ended')
    })

    it('A2: the legacy third argument false while playing resolves "skipped"', async () => {
        const { clock, frame, finish } = setup()
        const machine = make(clock)

        const first = machine.transitionTo('active')
        frame(500)
        const timeline = machine.timeline()
        const skipped = machine.transitionTo('idle', undefined, false)

        expect(await skipped).toBe('skipped')
        expect(machine.state()).toBe('active')
        expect(machine.timeline()).toBe(timeline)
        finish()
        expect(await first).toBe('ended')
    })

    it('A2: config.interrupt wins over the legacy third argument', async () => {
        const { clock, frame, finish } = setup()
        const machine = make(clock)

        const first = machine.transitionTo('active')
        frame(500)
        // interrupt: true beats legacy false
        const second = machine.transitionTo('idle', { interrupt: true }, false)
        expect(await first).toBe('interrupted')
        expect(machine.state()).toBe('idle')

        frame(100)
        // interrupt: false beats legacy true
        const third = machine.transitionTo('active', { interrupt: false }, true)
        expect(await third).toBe('skipped')
        expect(machine.state()).toBe('idle')
        finish()
        expect(await second).toBe('ended')
    })

    it('A2: interrupt: false does not reject a transition while not playing', async () => {
        const { clock, finish } = setup()
        const machine = make(clock)

        const run = machine.transitionTo('active', { interrupt: false })
        finish()

        expect(await run).toBe('ended')
        expect(machine.state()).toBe('active')
    })

    it('A2: after dispose() transitionTo resolves "disposed"', async () => {
        const { clock } = setup()
        const machine = make(clock)

        machine.dispose()

        expect(await machine.transitionTo('active')).toBe('disposed')
    })

    it('A2: an unknown state throws a RangeError synchronously', () => {
        const { clock } = setup()
        const machine = make(clock)

        expect(() => machine.transitionTo('nope')).toThrow(RangeError)
        expect(machine.state()).toBe('idle')
    })

    it('A3: value before any transition is the frozen initial value', () => {
        const { clock } = setup()
        const machine = make(clock, { initialValue: { translateX: 20 } })

        expect(machine.value).toEqual({ translateX: 20 })
        expect(Object.isFrozen(machine.value)).toBe(true)
    })

    it('A3: value during a run equals timeline().value', () => {
        const { clock, frame } = setup()
        const machine = make(clock, { initialValue: { translateX: 20 } })

        void machine.transitionTo('active')
        frame(500)

        expect(machine.timeline().value).toEqual({ translateX: 60 })
        expect(machine.value).toEqual(machine.timeline().value)
        frame(250)
        expect(machine.value).toEqual({ translateX: 80 })
        expect(machine.value).toEqual(machine.timeline().value)
    })

    it('A3: value after timeline().reset() is the last shown value', () => {
        const { clock, frame } = setup()
        const machine = make(clock, { initialValue: { translateX: 20 } })

        void machine.transitionTo('active')
        frame(500)
        machine.timeline().reset()

        expect(machine.timeline().value).toBeNull()
        expect(machine.value).toEqual({ translateX: 60 })
    })

    it('A4: machine.bind(el) follows idle -> active -> idle frame by frame', async () => {
        const { clock, frame, finish } = setup()
        const machine = make(clock)
        const el = fakeElement()
        const reference = fakeElement()
        machine.bind(el)

        // idle -> active
        const toActive = machine.transitionTo('active')
        machine.timeline().bind(reference)
        let start = el.writes.length
        let refStart = reference.writes.length
        let before = el.count('transform')
        for (let i = 0; i < 4; i++) {
            frame(100)
            expect(el.count('transform')).toBe(before + 1)
            before = el.count('transform')
        }
        expect(el.writes.length).toBeGreaterThan(start)
        expect(el.writes.slice(start)).toEqual(reference.writes.slice(refStart))
        const midway = el.current.transform

        // active -> idle, mid-flight: the new timeline writes to the same element
        const toIdle = machine.transitionTo('idle')
        const reference2 = fakeElement()
        machine.timeline().bind(reference2)
        start = el.writes.length
        refStart = reference2.writes.length
        before = el.count('transform')
        for (let i = 0; i < 4; i++) {
            frame(100)
            expect(el.count('transform')).toBe(before + 1)
            before = el.count('transform')
        }
        expect(el.writes.slice(start)).toEqual(
            reference2.writes.slice(refStart)
        )
        expect(el.current.transform).not.toBe(midway)

        expect(await toActive).toBe('interrupted')
        finish()
        expect(await toIdle).toBe('ended')
        expect(el.current.transform).toBe(reference2.current.transform)
        expect(String(el.current.transform)).toContain('0')
    })

    it('A4: the element is written from the first notification of each timeline', () => {
        const { clock, frame } = setup()
        const machine = make(clock)
        const el = fakeElement()
        machine.bind(el)

        void machine.transitionTo('active')
        frame(250)
        const afterFirst = el.count('transform')
        expect(afterFirst).toBeGreaterThan(0)

        void machine.transitionTo('idle')
        frame(250)
        expect(el.count('transform')).toBeGreaterThan(afterFirst)
    })

    it('A4: bind honors the resolver option across transitions', () => {
        const { clock, frame } = setup()
        const machine = make(clock)
        const el = fakeElement()
        machine.bind(el, {
            resolver: {
                translateX: (v: number) => ({ key: 'left', value: `${v}px` }),
            },
        })

        void machine.transitionTo('active')
        frame(500)
        expect(el.current.left).toBe('50px')
        expect(el.count('transform')).toBe(0)

        void machine.transitionTo('idle')
        frame(500)
        const value = machine.timeline().value
        expect(el.current.left).toBe(`${value?.translateX}px`)
        expect(el.count('transform')).toBe(0)
    })

    it('A4: unbind stops all future writes', () => {
        const { clock, frame } = setup()
        const machine = make(clock)
        const el = fakeElement()
        const unbind = machine.bind(el)

        void machine.transitionTo('active')
        frame(250)
        const written = el.writes.length
        expect(written).toBeGreaterThan(0)

        unbind()
        frame(250)
        expect(el.writes.length).toBe(written)

        // future timelines are not bound either
        void machine.transitionTo('idle')
        frame(250)
        void machine.transitionTo('active')
        frame(250)
        expect(el.writes.length).toBe(written)
    })

    it('A4: dispose() drops the machine bindings', () => {
        const { clock, frame } = setup()
        const machine = make(clock)
        const el = fakeElement()
        machine.bind(el)

        void machine.transitionTo('active')
        frame(250)
        const written = el.writes.length

        machine.dispose()
        frame(250)

        expect(el.writes.length).toBe(written)
    })

    it('A5: onUpdate receives one frame per tick from every successive timeline', () => {
        const { clock, frame } = setup()
        const machine = make(clock)
        const frames: Frame[] = []
        machine.onUpdate((f) => {
            frames.push({ state: { ...f.state }, status: f.status })
        })

        void machine.transitionTo('active')
        const reference: Frame[] = []
        machine.timeline().onUpdate((f) => {
            reference.push({ state: { ...f.state }, status: f.status })
        })
        frames.length = 0
        for (let i = 0; i < 3; i++) {
            const before = frames.length
            frame(100)
            expect(frames.length).toBe(before + 1)
        }
        expect(frames).toEqual(reference)
        expect(frames.at(-1)?.status).toBe('PLAYING')
        expect(frames.at(-1)?.state.translateX).toBeCloseTo(30)

        void machine.transitionTo('idle')
        const reference2: Frame[] = []
        machine.timeline().onUpdate((f) => {
            reference2.push({ state: { ...f.state }, status: f.status })
        })
        frames.length = 0
        for (let i = 0; i < 3; i++) {
            const before = frames.length
            frame(100)
            expect(frames.length).toBe(before + 1)
        }
        expect(frames).toEqual(reference2)
        expect(frames.at(-1)?.state.translateX).toBeLessThan(30)
    })

    it('A5: unsubscribe stops the listener for all timelines', () => {
        const { clock, frame } = setup()
        const machine = make(clock)
        const frames: Frame[] = []
        const unsubscribe = machine.onUpdate((f) => {
            frames.push(f)
        })

        void machine.transitionTo('active')
        frame(100)
        expect(frames.length).toBeGreaterThan(0)

        unsubscribe()
        const count = frames.length
        frame(100)
        void machine.transitionTo('idle')
        frame(100)
        expect(frames.length).toBe(count)
    })

    it('A5: dispose() drops the onUpdate listeners', () => {
        const { clock, frame } = setup()
        const machine = make(clock)
        const frames: Frame[] = []
        machine.onUpdate((f) => {
            frames.push(f)
        })

        void machine.transitionTo('active')
        frame(100)
        machine.dispose()
        const count = frames.length
        frame(100)
        frame(100)

        expect(frames.length).toBe(count)
    })

    it('A6: onTransition receives (state, timeline) before the new timeline plays', () => {
        const { clock, frame } = setup()
        const machine = make(clock)
        const calls: {
            state: StateName
            timeline: Timeline
            status: string
            current: unknown
        }[] = []
        machine.onTransition((state, timeline) => {
            calls.push({
                state,
                timeline,
                status: timeline.status,
                current: machine.timeline(),
            })
        })

        void machine.transitionTo('active')
        expect(calls).toHaveLength(1)
        expect(calls[0]?.state).toBe('active')
        expect(calls[0]?.status).toBe('IDLE')
        expect(calls[0]?.timeline).toBe(machine.timeline())
        expect(calls[0]?.current).toBe(calls[0]?.timeline)
        expect(machine.timeline().status).toBe('PLAYING')

        frame(100)
        void machine.transitionTo('idle')
        expect(calls).toHaveLength(2)
        expect(calls[1]?.state).toBe('idle')
        expect(calls[1]?.timeline).toBe(machine.timeline())
        expect(calls[1]?.timeline).not.toBe(calls[0]?.timeline)
    })

    it('A6: onTransition unsubscribe works and listener errors are isolated and rethrown asynchronously', () => {
        const { clock } = setup()
        const machine = make(clock)
        const seen: StateName[] = []
        const boom = new Error('boom')
        machine.onTransition(() => {
            throw boom
        })
        const off = machine.onTransition((state) => {
            seen.push(state)
        })

        expect(() => machine.transitionTo('active')).not.toThrow()
        expect(seen).toEqual(['active'])
        expect(reported).toEqual([boom])
        expect(machine.state()).toBe('active')

        off()
        void machine.transitionTo('idle')
        expect(seen).toEqual(['active'])
    })

    it('A6: onTimelineChange still works', () => {
        const { clock } = setup()
        const machine = make(clock)
        const timelines: Timeline[] = []
        const off = machine.onTimelineChange((timeline) => {
            timelines.push(timeline)
        })

        void machine.transitionTo('active')
        expect(timelines).toHaveLength(1)
        expect(timelines[0]).toBe(machine.timeline())

        off()
        void machine.transitionTo('idle')
        expect(timelines).toHaveLength(1)
    })

    it('A7: 1000 alternating transitions leak no subscription or binding', async () => {
        const { clock, frame, finish } = setup()
        const machine = make(clock)
        const el = fakeElement()
        machine.bind(el)
        let calls = 0
        machine.onUpdate(() => {
            calls++
        })

        const runs: Promise<RunResult>[] = []
        for (let i = 0; i < 1000; i++) {
            runs.push(machine.transitionTo(i % 2 === 0 ? 'active' : 'idle'))
            expect(clock.size).toBe(1)
            const writes = el.count('transform')
            const before = calls
            frame(5)
            // only the current timeline writes and notifies
            expect(el.count('transform')).toBe(writes + 1)
            expect(calls).toBe(before + 1)
        }
        expect(clock.size).toBe(1)

        finish()
        const results = await Promise.all(runs)
        expect(results.slice(0, 999).every((r) => r === 'interrupted')).toBe(
            true
        )
        expect(results[999]).toBe('ended')
        expect(machine.state()).toBe('idle')
    })

    it('A7: dispose() after many transitions leaves nothing on the clock', () => {
        const { clock, frame } = setup()
        const machine = make(clock)
        const el = fakeElement()
        machine.bind(el)
        machine.onUpdate(() => undefined)

        for (let i = 0; i < 50; i++) {
            void machine.transitionTo(i % 2 === 0 ? 'active' : 'idle')
            frame(5)
        }
        machine.dispose()

        expect(clock.size).toBe(0)
    })
})
