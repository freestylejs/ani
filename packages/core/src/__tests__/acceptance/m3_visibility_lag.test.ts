import { describe, expect, it } from 'vitest'
import * as a from '../../index'
import {
    type Clock,
    createClock,
    rafTimeline,
    type VisibilitySource,
} from '../../index'

const linear = a.timing.linear()
const node = (duration = 10) =>
    a.ani({ to: { x: 100 }, duration, timing: linear })

/**
 * Clock fed by an injected frame source and an injected `VisibilitySource`:
 * only `frame()` advances time, so the tests never touch a real timer.
 * A linear 0 -> 100 over 10 s timeline moves 10 units per second.
 */
function setup(options: Record<string, unknown> = {}) {
    let time = 1000
    let nextId = 1
    const pending = new Map<number, (timestamp: number) => void>()
    const listeners = new Set<() => void>()
    const doc = {
        hidden: false,
        addEventListener: (_: 'visibilitychange', listener: () => void) => {
            listeners.add(listener)
        },
        removeEventListener: (_: 'visibilitychange', listener: () => void) => {
            listeners.delete(listener)
        },
    }
    const source: VisibilitySource = doc
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
        visibility: source,
        ...options,
    } as Parameters<typeof createClock>[0])
    const frame = (ms: number) => {
        time += ms
        const callbacks = [...pending.values()]
        pending.clear()
        for (const callback of callbacks) callback(time)
    }
    const setHidden = (hidden: boolean) => {
        doc.hidden = hidden
        for (const listener of [...listeners]) listener()
    }
    const advance = (ms: number) => {
        time += ms
    }
    return { clock, doc, listeners, frame, setHidden, advance }
}

describe('M3: visibility-aware lag smoothing', () => {
    it('A1: a frame hidden for 300 ms suspends even below lagThreshold', () => {
        const s = setup()
        const t = rafTimeline(node(10), { clock: s.clock })
        t.play({ from: { x: 0 } })
        s.frame(16)
        s.frame(16)
        expect(t.value!.x).toBeCloseTo(0.32, 5)

        s.setHidden(true)
        s.advance(300)
        s.setHidden(false)
        s.frame(16)
        // 316 ms of wall time, but only one ordinary frame of animation time
        expect(t.value!.x).toBeCloseTo(0.48, 5)
    })

    it('A2: without visibility events the same 316 ms gap applies in full', () => {
        const s = setup()
        const t = rafTimeline(node(10), { clock: s.clock })
        t.play({ from: { x: 0 } })
        s.frame(16)
        s.frame(16)
        s.advance(300)
        s.frame(16)
        expect(t.value!.x).toBeCloseTo(3.48, 5)
    })

    it('A3: visibility: false ignores the events and attaches no listener', () => {
        const s = setup({ visibility: false })
        const t = rafTimeline(node(10), { clock: s.clock })
        t.play({ from: { x: 0 } })
        expect(s.listeners.size).toBe(0)

        s.frame(16)
        s.frame(16)
        s.setHidden(true)
        s.advance(300)
        s.setHidden(false)
        expect(s.listeners.size).toBe(0)
        s.frame(16)
        expect(s.listeners.size).toBe(0)
        expect(t.value!.x).toBeCloseTo(3.48, 5)
    })

    it('A4: hidden then visible before the next frame still suspends it', () => {
        const s = setup()
        const t = rafTimeline(node(10), { clock: s.clock })
        t.play({ from: { x: 0 } })
        s.frame(16)
        s.frame(16)

        s.setHidden(true)
        s.advance(10)
        s.setHidden(false)
        s.frame(16)
        // 26 ms of wall time, one 16 ms ordinary frame of animation time
        expect(t.value!.x).toBeCloseTo(0.48, 5)
    })

    it('A5: the suspended flag clears after the frame', () => {
        const s = setup()
        const t = rafTimeline(node(10), { clock: s.clock })
        t.play({ from: { x: 0 } })
        s.frame(16)
        s.frame(16)
        s.setHidden(true)
        s.advance(300)
        s.setHidden(false)
        s.frame(16)
        expect(t.value!.x).toBeCloseTo(0.48, 5)

        s.frame(30)
        // real elapsed time again: 30 ms, not another ordinary frame
        expect(t.value!.x).toBeCloseTo(0.78, 5)
    })

    it('A6: the ordinary frame is not polluted by a suspension', () => {
        const s = setup()
        const t = rafTimeline(node(10), { clock: s.clock })
        t.play({ from: { x: 0 } })
        s.frame(20)
        s.frame(20)
        s.setHidden(true)
        s.advance(300)
        s.setHidden(false)
        s.frame(20)
        expect(t.value!.x).toBeCloseTo(0.6, 5)

        s.frame(30)
        expect(t.value!.x).toBeCloseTo(0.9, 5)

        // a later long suspension advances by the latest ordinary 30 ms
        // frame, never by the 320 ms gap nor by a suspended frame's gap
        s.setHidden(true)
        s.advance(300)
        s.setHidden(false)
        s.frame(10)
        expect(t.value!.x).toBeCloseTo(1.2, 5)
        // and a suspended frame never advances more than its real 6 ms
        s.setHidden(true)
        s.setHidden(false)
        s.frame(6)
        expect(t.value!.x).toBeCloseTo(1.26, 5)
    })

    it('A7: maxDeltaTime still caps the suspended frame delta', () => {
        const s = setup({ maxDeltaTime: 0.01 })
        const t = rafTimeline(node(10), { clock: s.clock })
        t.play({ from: { x: 0 } })
        s.frame(16)
        s.frame(16)
        s.setHidden(true)
        s.advance(300)
        s.setHidden(false)
        s.frame(16)
        expect(t.value!.x).toBeCloseTo(0.3, 5)
    })

    it('A8: the listener follows the armed frame loop', () => {
        const s = setup()
        const t = rafTimeline(node(0.2), { clock: s.clock })
        expect(s.listeners.size).toBe(0)

        t.play({ from: { x: 0 } })
        expect(s.listeners.size).toBe(1)
        s.frame(16)
        s.frame(16)
        expect(s.listeners.size).toBe(1)

        t.play({ from: { x: 0 } })
        s.frame(16)
        s.frame(16)
        expect(t.status).toBe('PLAYING')
        expect(s.listeners.size).toBe(1)

        for (let i = 0; i < 20; i++) s.frame(16)
        expect(t.status).toBe('ENDED')
        expect(s.clock.size).toBe(0)
        expect(s.listeners.size).toBe(0)

        // a new run attaches again, exactly once
        t.play({ from: { x: 0 } })
        expect(s.listeners.size).toBe(1)
        s.frame(16)
        expect(s.listeners.size).toBe(1)

        const clock = s.clock as Clock
        clock.dispose()
        expect(s.listeners.size).toBe(0)
    })

    it('A9: a hidden event while the clock is idle has no effect later', () => {
        const s = setup()
        const t = rafTimeline(node(10), { clock: s.clock })
        s.setHidden(true)
        expect(s.listeners.size).toBe(0)

        t.play({ from: { x: 0 } })
        s.advance(300)
        s.frame(16)
        // the first frame measures the real elapsed time since play()
        expect(t.value!.x).toBeCloseTo(3.16, 5)
    })

    it('A10: hidden at tick time without an event does not suspend', () => {
        const s = setup()
        const t = rafTimeline(node(10), { clock: s.clock })
        t.play({ from: { x: 0 } })
        s.doc.hidden = true
        s.frame(16)
        expect(t.value!.x).toBeCloseTo(0.16, 5)
        s.frame(100)
        expect(t.value!.x).toBeCloseTo(1.16, 5)
    })

    it('A11: invalid visibility values throw a TypeError mentioning visibility', () => {
        const invalid: unknown[] = [
            1,
            'yes',
            {},
            {
                hidden: 'no',
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            },
        ]
        for (const value of invalid) {
            const label = `visibility: ${JSON.stringify(value)}`
            const create = () =>
                createClock({
                    visibility: value,
                } as Parameters<typeof createClock>[0])
            expect(create, label).toThrowError(TypeError)
            expect(create, label).toThrowError(/visibility/)
        }

        const validSource: VisibilitySource = {
            hidden: false,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }
        for (const value of [true, false, undefined, validSource]) {
            expect(() =>
                createClock({
                    visibility: value,
                } as Parameters<typeof createClock>[0])
            ).not.toThrow()
        }
    })

    it('A12: an addEventListener that throws is reported to onError', () => {
        const errors: unknown[] = []
        const failure = new Error('visibility listener attach failed')
        const s = setup({
            onError: (error: unknown) => {
                errors.push(error)
            },
            visibility: {
                hidden: false,
                addEventListener: () => {
                    throw failure
                },
                removeEventListener: () => undefined,
            },
        })
        const t = rafTimeline(node(0.05), { clock: s.clock })
        t.play({ from: { x: 0 } })
        expect(errors).toContain(failure)
        expect(t.status).toBe('PLAYING')

        for (let i = 0; i < 4; i++) s.frame(16)
        expect(t.status).toBe('ENDED')
        expect(t.value!.x).toBeCloseTo(100, 5)
    })

    it('A13: no document global and visibility omitted is a silent no-op', () => {
        expect((globalThis as { document?: unknown }).document).toBeUndefined()
        const s = setup({ visibility: undefined })
        const t = rafTimeline(node(10), { clock: s.clock })
        t.play({ from: { x: 0 } })
        s.frame(16)
        s.frame(16)
        s.advance(300)
        s.frame(16)
        expect(t.status).toBe('PLAYING')
        expect(t.value!.x).toBeCloseTo(3.48, 5)
        expect(s.listeners.size).toBe(0)
    })
})
