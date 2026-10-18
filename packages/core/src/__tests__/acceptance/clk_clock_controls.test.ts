import { describe, expect, it } from 'vitest'
import { AniError, a, createClock, rafTimeline } from '../../index'

/**
 * Clock fed by an injected frame source: only `frame()` / `advance()` move
 * time, so the tests never touch a real timer.
 */
function setup(options: Record<string, unknown> = {}) {
    let time = 1000
    let nextId = 1
    const pending = new Map<number, (timestamp: number) => void>()
    const errors: unknown[] = []
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
        onError: (error) => {
            errors.push(error)
        },
        ...options,
    } as Parameters<typeof createClock>[0])
    return {
        clock,
        errors,
        frame(ms = 16): void {
            time += ms
            const callbacks = [...pending.values()]
            pending.clear()
            for (const callback of callbacks) callback(time)
        },
        advance(ms: number): void {
            time += ms
        },
        get pending(): number {
            return pending.size
        },
    }
}

type Setup = ReturnType<typeof setup>

// 10 units per second
function measure(s: Setup) {
    const t = rafTimeline(
        a.ani({ to: { x: 100 }, duration: 10, timing: a.timing.linear() }),
        s.clock
    )
    t.play({ from: { x: 0 } })
    return t
}

const x = (t: ReturnType<typeof measure>) => t.getCurrentValue()!.x

describe('CLK: timeScale', () => {
    it('A1: timeScale scales the advance, from the next frame on', () => {
        const s = setup()
        const t = measure(s)
        expect(s.clock.timeScale).toBe(1)
        s.clock.timeScale = 0.5
        expect(s.clock.timeScale).toBe(0.5)
        s.frame(16)
        s.frame(16)
        expect(x(t)).toBeCloseTo(0.16, 5)

        s.clock.timeScale = 2
        s.frame(16)
        expect(x(t)).toBeCloseTo(0.48, 5)
    })

    it('A1: the createClock option sets the initial scale', () => {
        const s = setup({ timeScale: 0.5 })
        const t = measure(s)
        expect(s.clock.timeScale).toBe(0.5)
        s.frame(16)
        s.frame(16)
        expect(x(t)).toBeCloseTo(0.16, 5)
    })

    it('A1: timeScale never changes the lag bookkeeping', () => {
        const s = setup({ timeScale: 0.5 })
        const t = measure(s)
        s.frame(16)
        // a 600 ms gap exceeds the 0.5 s lag threshold: one ordinary frame
        // (16 ms), scaled by 0.5
        s.frame(600)
        expect(x(t)).toBeCloseTo(0.16, 5)
    })

    it('A2: timeScale 0 freezes animation time but frames keep running', () => {
        const s = setup()
        const t = measure(s)
        s.frame(16)
        const frozen = x(t)
        expect(frozen).toBeCloseTo(0.16, 5)

        s.clock.timeScale = 0
        for (let i = 0; i < 5; i++) {
            s.frame(16)
            expect(s.pending).toBe(1)
            expect(t.status).toBe('PLAYING')
            expect(x(t)).toBe(frozen)
        }

        s.clock.timeScale = 1
        s.frame(16)
        expect(x(t)).toBeCloseTo(0.32, 5)
        expect(t.status).toBe('PLAYING')
    })

    it('A2: a subscriber receives dt = 0 while frozen', () => {
        const s = setup({ timeScale: 0 })
        const deltas: number[] = []
        s.clock.subscribe({ update: (dt) => deltas.push(dt) })
        s.frame(16)
        s.frame(16)
        expect(deltas).toEqual([0, 0])
        expect(s.pending).toBe(1)
    })

    it('A3: invalid timeScale throws RangeError from the setter and keeps the scale', () => {
        const s = setup()
        s.clock.timeScale = 0.5
        const invalid: unknown[] = [-1, Number.NaN, Infinity, '2']
        for (const value of invalid) {
            expect(() => {
                s.clock.timeScale = value as number
            }).toThrow(RangeError)
            expect(() => {
                s.clock.timeScale = value as number
            }).toThrow(/timeScale/)
            expect(s.clock.timeScale).toBe(0.5)
        }
    })

    it('A3: invalid timeScale throws RangeError from createClock', () => {
        const invalid: unknown[] = [-1, Number.NaN, Infinity, '2']
        for (const value of invalid) {
            expect(() => setup({ timeScale: value })).toThrow(RangeError)
            expect(() => setup({ timeScale: value })).toThrow(/timeScale/)
        }
    })

    it('A3: a rejected value does not change the animation speed', () => {
        const s = setup()
        const t = measure(s)
        s.clock.timeScale = 0.5
        expect(() => {
            s.clock.timeScale = -1
        }).toThrow(RangeError)
        s.frame(16)
        s.frame(16)
        expect(x(t)).toBeCloseTo(0.16, 5)
    })

    it('A4: the join-time delta is scaled too', () => {
        const s = setup({ timeScale: 0.5 })
        // keeps the loop running so the next timeline joins a live clock
        s.clock.subscribe({ update: () => undefined })
        s.frame(16)

        s.advance(8)
        const t = measure(s)
        s.frame(8)
        // joined 8 ms before the frame: 8 ms * 0.5 = 4 ms of animation
        expect(x(t)).toBeCloseTo(0.04, 5)
        s.frame(16)
        expect(x(t)).toBeCloseTo(0.12, 5)
    })
})

describe('CLK: pause / resume', () => {
    it('A5: pause cancels the pending frame and resume does not apply the gap', () => {
        const s = setup()
        const t = measure(s)
        s.frame(16)
        s.frame(16)
        expect(x(t)).toBeCloseTo(0.32, 5)
        expect(s.pending).toBe(1)
        expect(s.clock.paused).toBe(false)

        s.clock.pause()
        expect(s.clock.paused).toBe(true)
        expect(s.pending).toBe(0)
        expect(s.clock.size).toBe(1)

        s.advance(5000)
        expect(s.pending).toBe(0)
        expect(x(t)).toBeCloseTo(0.32, 5)
        expect(t.status).toBe('PLAYING')

        s.clock.resume()
        expect(s.clock.paused).toBe(false)
        expect(s.pending).toBe(1)
        s.frame(16)
        expect(x(t)).toBeCloseTo(0.48, 5)
        expect(t.status).toBe('PLAYING')
        expect(s.pending).toBe(1)
    })

    it('A5: the first frame after resume advances by the time since resume()', () => {
        const s = setup()
        const deltas: number[] = []
        s.clock.subscribe({ update: (dt) => deltas.push(dt) })
        s.frame(16)
        s.clock.pause()
        s.advance(100)
        s.clock.resume()
        s.advance(4)
        s.frame(12)
        expect(deltas).toHaveLength(2)
        expect(deltas[1]).toBeCloseTo(0.016, 6)
    })

    it('A6: subscribe and read(fn) while paused request no frame', () => {
        const s = setup()
        s.clock.pause()
        const deltas: number[] = []
        const reads: string[] = []
        const sub = { update: (dt: number) => deltas.push(dt) }
        s.clock.subscribe(sub)
        s.clock.read(() => reads.push('read'))
        expect(s.pending).toBe(0)
        expect(s.clock.size).toBe(1)
        expect(s.clock.paused).toBe(true)

        s.advance(5000)
        expect(s.pending).toBe(0)
        expect(deltas).toEqual([])
        expect(reads).toEqual([])

        s.clock.resume()
        expect(s.pending).toBe(1)
        s.frame(16)
        expect(reads).toEqual(['read'])
        expect(deltas).toHaveLength(1)
        expect(deltas[0]).toBeCloseTo(0.016, 6)
        expect(s.pending).toBe(1)
    })

    it('A6: unsubscribe works as usual while paused', () => {
        const s = setup()
        const sub = { update: () => undefined }
        s.clock.subscribe(sub)
        s.clock.pause()
        s.clock.unsubscribe(sub)
        expect(s.clock.size).toBe(0)
        s.clock.resume()
        expect(s.pending).toBe(0)
    })

    it('A6: resume with nothing subscribed or queued requests no frame', () => {
        const s = setup()
        s.clock.pause()
        s.clock.resume()
        expect(s.clock.paused).toBe(false)
        expect(s.pending).toBe(0)
    })

    it('A7: pause and resume are idempotent', () => {
        const s = setup()
        s.clock.subscribe({ update: () => undefined })
        s.frame(16)

        s.clock.pause()
        s.clock.pause()
        expect(s.clock.paused).toBe(true)
        expect(s.pending).toBe(0)

        s.clock.resume()
        s.clock.resume()
        expect(s.clock.paused).toBe(false)
        expect(s.pending).toBe(1)
    })

    it('A7: resume on a running clock does nothing', () => {
        const s = setup()
        const deltas: number[] = []
        s.clock.subscribe({ update: (dt) => deltas.push(dt) })
        s.frame(16)
        s.advance(8)
        s.clock.resume()
        expect(s.pending).toBe(1)
        s.frame(8)
        // the time base was not restarted: the whole 16 ms are applied
        expect(deltas[1]).toBeCloseTo(0.016, 6)
    })

    it('A7: dispose while paused leaves the clock not paused and idle', () => {
        const s = setup()
        s.clock.subscribe({ update: () => undefined })
        s.frame(16)
        s.clock.pause()
        s.clock.dispose()
        expect(s.clock.paused).toBe(false)
        expect(s.clock.size).toBe(0)
        expect(s.pending).toBe(0)
        s.clock.resume()
        expect(s.pending).toBe(0)
    })
})

describe('CLK: quarantine of failing subscribers', () => {
    it('A8: an update that throws every tick is quarantined after 3 ticks', () => {
        const s = setup()
        const boom = new Error('boom')
        let calls = 0
        const healthy: number[] = []
        s.clock.subscribe({
            update: () => {
                calls++
                throw boom
            },
        })
        s.clock.subscribe({ update: (dt) => healthy.push(dt) })
        expect(s.clock.size).toBe(2)

        s.frame()
        expect(s.errors).toEqual([boom])
        s.frame()
        expect(s.errors).toEqual([boom, boom])
        expect(s.clock.size).toBe(2)
        s.frame()

        expect(s.errors).toHaveLength(4)
        expect(s.errors.slice(0, 3)).toEqual([boom, boom, boom])
        const report = s.errors[3]
        expect(report).toBeInstanceOf(AniError)
        expect((report as AniError).code).toBe('ANI_SUBSCRIBER_QUARANTINED')
        expect((report as AniError).cause).toBe(boom)
        expect((report as AniError).message).toContain(
            'ANI_SUBSCRIBER_QUARANTINED'
        )
        expect(s.clock.size).toBe(1)

        s.frame()
        s.frame()
        expect(calls).toBe(3)
        expect(s.errors).toHaveLength(4)
        expect(healthy).toHaveLength(5)
        expect(s.pending).toBe(1)
    })

    it('A8: the quarantine cause is the last error', () => {
        const s = setup()
        let n = 0
        s.clock.subscribe({
            update: () => {
                throw new Error(`fail ${++n}`)
            },
        })
        s.frame()
        s.frame()
        s.frame()
        const report = s.errors[3] as AniError
        expect(report.code).toBe('ANI_SUBSCRIBER_QUARANTINED')
        expect(report.cause).toBe(s.errors[2])
        expect((report.cause as Error).message).toBe('fail 3')
    })

    it('A8: a quarantined sole subscriber leaves the clock idle', () => {
        const s = setup()
        s.clock.subscribe({
            update: () => {
                throw new Error('boom')
            },
        })
        s.frame()
        s.frame()
        s.frame()
        expect(s.clock.size).toBe(0)
        expect(s.pending).toBe(0)
    })

    it('A8: AniError accepts an optional cause', () => {
        const cause = new Error('inner')
        const error = new AniError('ANI_SUBSCRIBER_QUARANTINED', 'msg', {
            cause,
        })
        expect(error.cause).toBe(cause)
        expect(error.code).toBe('ANI_SUBSCRIBER_QUARANTINED')
        expect(new AniError('ANI_CODEC_MISMATCH', 'msg').cause).toBeUndefined()
    })

    it('A9: a successful tick resets the count', () => {
        const s = setup()
        const failing = new Set([1, 2, 4, 5])
        let tick = 0
        s.clock.subscribe({
            update: () => {
                if (failing.has(++tick)) throw new Error(`tick ${tick}`)
            },
        })
        for (let i = 0; i < 5; i++) s.frame()
        expect(s.errors).toHaveLength(4)
        expect(
            s.errors.some(
                (e) =>
                    e instanceof AniError &&
                    e.code === 'ANI_SUBSCRIBER_QUARANTINED'
            )
        ).toBe(false)
        expect(s.clock.size).toBe(1)
    })

    it('A9: after a reset it takes 3 consecutive failing ticks again', () => {
        const s = setup()
        const failing = new Set([1, 2, 4, 5, 6])
        let tick = 0
        s.clock.subscribe({
            update: () => {
                if (failing.has(++tick)) throw new Error(`tick ${tick}`)
            },
        })
        for (let i = 0; i < 5; i++) s.frame()
        expect(s.clock.size).toBe(1)
        s.frame()
        expect(s.clock.size).toBe(0)
        const report = s.errors.at(-1) as AniError
        expect(report.code).toBe('ANI_SUBSCRIBER_QUARANTINED')
        expect((report.cause as Error).message).toBe('tick 6')
    })

    it('A9: unsubscribing resets the count', () => {
        const s = setup()
        const boom = new Error('boom')
        const sub = {
            update: () => {
                throw boom
            },
        }
        // a second subscriber keeps the loop alive across the unsubscribe
        s.clock.subscribe({ update: () => undefined })
        s.clock.subscribe(sub)
        s.frame()
        s.frame()
        s.clock.unsubscribe(sub)
        s.clock.subscribe(sub)
        s.frame()
        s.frame()
        expect(s.clock.size).toBe(2)
        expect(s.errors).toEqual([boom, boom, boom, boom])
        s.frame()
        expect(s.clock.size).toBe(1)
    })

    it('A10: read and commit failures count like update failures', () => {
        const s = setup()
        const boom = new Error('boom')
        s.clock.subscribe({
            read: () => {
                throw boom
            },
            update: () => undefined,
        })
        s.clock.subscribe({
            update: () => undefined,
            commit: () => {
                throw boom
            },
        })
        s.frame()
        s.frame()
        expect(s.clock.size).toBe(2)
        s.frame()
        expect(s.clock.size).toBe(0)
        const reports = s.errors.filter(
            (e) => e instanceof AniError
        ) as AniError[]
        expect(reports).toHaveLength(2)
        for (const report of reports) {
            expect(report.code).toBe('ANI_SUBSCRIBER_QUARANTINED')
            expect(report.cause).toBe(boom)
        }
        expect(s.errors).toHaveLength(8)
    })

    it('A10: a mix of phases across consecutive ticks quarantines after 3', () => {
        const s = setup()
        const plan = ['read', 'update', 'commit']
        let tick = 0
        const throwIf = (phase: string) => {
            if (plan[tick - 1] === phase) throw new Error(phase)
        }
        s.clock.subscribe({
            read: () => {
                tick++
                throwIf('read')
            },
            update: () => throwIf('update'),
            commit: () => throwIf('commit'),
        })
        s.frame()
        s.frame()
        expect(s.clock.size).toBe(1)
        s.frame()
        expect(s.clock.size).toBe(0)
        const report = s.errors.at(-1) as AniError
        expect(report.code).toBe('ANI_SUBSCRIBER_QUARANTINED')
        expect((report.cause as Error).message).toBe('commit')
        expect(s.errors).toHaveLength(4)
    })

    it('A10: several failing phases in one tick count as one tick', () => {
        const s = setup()
        s.clock.subscribe({
            read: () => {
                throw new Error('read')
            },
            update: () => {
                throw new Error('update')
            },
        })
        s.frame()
        s.frame()
        expect(s.clock.size).toBe(1)
        s.frame()
        expect(s.clock.size).toBe(0)
        const reports = s.errors.filter((e) => e instanceof AniError)
        expect(reports).toHaveLength(1)
    })
})
