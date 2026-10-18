import { afterEach, describe, expect, it, vi } from 'vitest'
import { a, createClock, rafTimeline } from '../../index'

const linear = a.timing.linear()

/**
 * Clock fed by an injected frame source: only `frame()` advances time, so the
 * tests never touch a real timer.
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
    const frame = (ms = 16) => {
        time += ms
        const callbacks = [...pending.values()]
        pending.clear()
        for (const callback of callbacks) callback(time)
    }
    return {
        clock,
        errors,
        frame,
        get pending(): number {
            return pending.size
        },
    }
}

/** Subscriber that records every phase into the shared log as `r1 u1 c1`. */
function probe(id: string, log: string[]) {
    return {
        read: () => {
            log.push(`r${id}`)
        },
        update: (_dt: number) => {
            log.push(`u${id}`)
        },
        commit: () => {
            log.push(`c${id}`)
        },
    }
}

describe('R1C: clock frame phases (read -> update -> commit)', () => {
    it('A1: all reads, then all updates, then all commits, in subscription order', () => {
        const s = setup()
        const log: string[] = []
        s.clock.subscribe(probe('1', log))
        s.clock.subscribe(probe('2', log))
        s.frame()
        expect(log).toEqual(['r1', 'r2', 'u1', 'u2', 'c1', 'c2'])
        log.length = 0
        s.frame()
        expect(log).toEqual(['r1', 'r2', 'u1', 'u2', 'c1', 'c2'])
    })

    it('A2: an update-only subscriber still updates with the right dt', () => {
        const s = setup()
        const deltas: number[] = []
        s.clock.subscribe({ update: (dt) => deltas.push(dt) })
        s.frame(16)
        s.frame(20)
        expect(deltas).toHaveLength(2)
        expect(deltas[0]).toBeCloseTo(0.016, 6)
        expect(deltas[1]).toBeCloseTo(0.02, 6)
    })

    it('A2: a mixed set orders the phases correctly', () => {
        const s = setup()
        const log: string[] = []
        s.clock.subscribe({ update: () => log.push('u1') })
        s.clock.subscribe(probe('2', log))
        s.clock.subscribe({
            update: () => log.push('u3'),
            commit: () => log.push('c3'),
        })
        s.clock.subscribe({
            read: () => log.push('r4'),
            update: () => log.push('u4'),
        })
        s.frame()
        expect(log).toEqual(['r2', 'r4', 'u1', 'u2', 'u3', 'u4', 'c2', 'c3'])
    })

    it('A3: a subscriber unsubscribing itself in update still commits in that tick and never again', () => {
        const s = setup()
        const log: string[] = []
        const quitter = {
            read: () => log.push('r1'),
            update: () => {
                log.push('u1')
                s.clock.unsubscribe(quitter)
            },
            commit: () => log.push('c1'),
        }
        s.clock.subscribe(quitter)
        s.clock.subscribe(probe('2', log))
        s.frame()
        expect(log).toEqual(['r1', 'r2', 'u1', 'u2', 'c1', 'c2'])
        log.length = 0
        s.frame()
        expect(log).toEqual(['r2', 'u2', 'c2'])
        expect(s.clock.size).toBe(1)
    })

    it('A3: a sole subscriber that ends itself in update commits and the loop drains', () => {
        const s = setup()
        const log: string[] = []
        const only = {
            update: () => {
                log.push('u')
                s.clock.unsubscribe(only)
            },
            commit: () => log.push('c'),
        }
        s.clock.subscribe(only)
        s.frame()
        expect(log).toEqual(['u', 'c'])
        expect(s.clock.size).toBe(0)
        expect(s.pending).toBe(0)
    })

    it('A4: a subscriber unsubscribed by an earlier update gets neither update nor commit', () => {
        const s = setup()
        const log: string[] = []
        const second = probe('2', log)
        s.clock.subscribe({
            read: () => log.push('r1'),
            update: () => {
                log.push('u1')
                s.clock.unsubscribe(second)
            },
            commit: () => log.push('c1'),
        })
        s.clock.subscribe(second)
        s.frame()
        expect(log).toEqual(['r1', 'r2', 'u1', 'c1'])
        log.length = 0
        s.frame()
        expect(log).toEqual(['r1', 'u1', 'c1'])
    })

    for (const phase of ['read', 'update', 'commit'] as const) {
        it(`A5: a subscriber added during the ${phase} phase first runs in the next tick`, () => {
            const s = setup()
            const log: string[] = []
            const late = probe('L', log)
            let added = false
            const adder = probe('1', log)
            const original = adder[phase]
            adder[phase] = ((dt: number) => {
                original(dt)
                if (!added) {
                    added = true
                    s.clock.subscribe(late)
                }
            }) as never
            s.clock.subscribe(adder)
            s.frame()
            expect(log).toEqual(['r1', 'u1', 'c1'])
            log.length = 0
            s.frame()
            expect(log).toEqual(['r1', 'rL', 'u1', 'uL', 'c1', 'cL'])
        })
    }

    it('A6: read(fn) on an idle clock arms a frame and runs before any update', () => {
        const s = setup()
        const log: string[] = []
        s.clock.read(() => log.push('fn'))
        expect(s.pending).toBe(1)
        expect(log).toEqual([])
        s.clock.subscribe(probe('1', log))
        s.frame()
        expect(log).toEqual(['fn', 'r1', 'u1', 'c1'])
    })

    it('A6: after the callback ran and with no subscribers no further frame is requested', () => {
        const s = setup()
        const log: string[] = []
        s.clock.read(() => log.push('a'))
        s.clock.read(() => log.push('b'))
        expect(s.pending).toBe(1)
        s.frame()
        expect(log).toEqual(['a', 'b'])
        expect(s.pending).toBe(0)
        s.frame()
        expect(log).toEqual(['a', 'b'])
        expect(s.clock.size).toBe(0)
    })

    it('A7: read(fn) called inside a one-shot read callback runs in the following tick', () => {
        const s = setup()
        const log: string[] = []
        s.clock.read(() => {
            log.push('outer')
            s.clock.read(() => log.push('inner'))
        })
        s.frame()
        expect(log).toEqual(['outer'])
        expect(s.pending).toBe(1)
        s.frame()
        expect(log).toEqual(['outer', 'inner'])
        expect(s.pending).toBe(0)
    })

    for (const phase of ['read', 'update', 'commit'] as const) {
        it(`A7: read(fn) called inside a subscriber's ${phase} runs in the following tick, before its reads`, () => {
            const s = setup()
            const log: string[] = []
            let queued = false
            const sub = probe('1', log)
            const original = sub[phase]
            sub[phase] = ((dt: number) => {
                original(dt)
                if (!queued) {
                    queued = true
                    s.clock.read(() => log.push('q'))
                }
            }) as never
            s.clock.subscribe(sub)
            s.frame()
            expect(log).toEqual(['r1', 'u1', 'c1'])
            log.length = 0
            s.frame()
            expect(log).toEqual(['q', 'r1', 'u1', 'c1'])
        })
    }

    it('A8: a throwing read, update and commit each reach onError and the other subscribers still run all phases', () => {
        const s = setup()
        const log: string[] = []
        const boom = {
            read: () => {
                log.push('rb')
                throw new Error('read')
            },
            update: () => {
                log.push('ub')
                throw new Error('update')
            },
            commit: () => {
                log.push('cb')
                throw new Error('commit')
            },
        }
        s.clock.subscribe(probe('1', log))
        s.clock.subscribe(boom)
        s.clock.subscribe(probe('2', log))
        s.frame()
        expect(log).toEqual([
            'r1',
            'rb',
            'r2',
            'u1',
            'ub',
            'u2',
            'c1',
            'cb',
            'c2',
        ])
        expect(s.errors).toHaveLength(3)
        expect(s.errors.map((e) => (e as Error).message).sort()).toEqual([
            'commit',
            'read',
            'update',
        ])
        expect(s.pending).toBe(1)
        log.length = 0
        s.frame()
        expect(log).toHaveLength(9)
        expect(s.errors).toHaveLength(6)
    })

    it('A8: a throwing one-shot read callback is reported and the rest of the frame runs', () => {
        const s = setup()
        const log: string[] = []
        s.clock.subscribe(probe('1', log))
        s.clock.read(() => {
            throw new Error('queued')
        })
        s.clock.read(() => log.push('after'))
        s.frame()
        expect(log).toEqual(['after', 'r1', 'u1', 'c1'])
        expect(s.errors).toHaveLength(1)
        expect((s.errors[0] as Error).message).toBe('queued')
        expect(s.pending).toBe(1)
    })

    it('A9: dispose() drops queued read callbacks and requests no frame', () => {
        const s = setup()
        const log: string[] = []
        s.clock.read(() => log.push('fn'))
        s.clock.subscribe(probe('1', log))
        s.clock.dispose()
        expect(s.pending).toBe(0)
        s.frame()
        s.frame()
        expect(log).toEqual([])
        expect(s.pending).toBe(0)
        expect(s.clock.size).toBe(0)
    })

    describe('without a frame source', () => {
        afterEach(() => {
            vi.unstubAllGlobals()
        })

        it('A10: read(fn) neither throws nor runs fn', () => {
            vi.stubGlobal('window', undefined)
            vi.stubGlobal('requestAnimationFrame', undefined)
            const clock = createClock({ now: () => 1000 })
            const fn = vi.fn()
            expect(() => clock.read(fn)).not.toThrow()
            expect(fn).not.toHaveBeenCalled()
            expect(clock.size).toBe(0)
        })
    })

    it('A11: a rafTimeline on the clock produces the same linear values frame by frame', () => {
        const s = setup()
        const t = rafTimeline(
            a.ani({ to: { x: 100 }, duration: 1, timing: linear }),
            s.clock
        )
        t.play({ from: { x: 0 } })
        const values: number[] = []
        for (let i = 0; i < 5; i++) {
            s.frame(100)
            values.push(t.getCurrentValue()!.x)
        }
        values.forEach((value, i) => {
            expect(value).toBeCloseTo((i + 1) * 10, 5)
        })
        for (let i = 0; i < 6; i++) s.frame(100)
        expect(t.getCurrentValue()).toEqual({ x: 100 })
        expect(t.status).toBe('ENDED')
        expect(s.clock.size).toBe(0)
        expect(s.pending).toBe(0)
    })
})
