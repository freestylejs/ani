import { describe, expect, it } from 'vitest'
import * as root from '../../index'
import { a, type FollowOptions, follow, type RunResult } from '../../index'
import { createManualClock, type ManualClock } from '../../testing'

type Y = { y: number }
type XY = { x: number; y: number }

type Write = { prop: string; value: unknown }

/** `{ style }` that records every assignment and `setProperty` call. */
function fakeElement() {
    const writes: Write[] = []
    const style = new Proxy({} as Record<string, unknown>, {
        set(_target, prop, value) {
            writes.push({ prop: String(prop), value })
            return true
        },
        get(_target, prop) {
            if (prop === 'setProperty') {
                return (name: string, value: unknown) => {
                    writes.push({ prop: name, value })
                }
            }
            return undefined
        },
    })
    return {
        style: style as unknown as CSSStyleDeclaration,
        writes,
        last(prop: string): unknown {
            for (let i = writes.length - 1; i >= 0; i--) {
                if (writes[i]!.prop === prop) return writes[i]!.value
            }
            return undefined
        },
    }
}

const topResolver = {
    y: (value: number) => ({ key: 'top', value }),
}

function make(
    options: Omit<FollowOptions, 'clock'> = {},
    initial: Y = { y: 0 }
) {
    const m = createManualClock()
    const f = follow<Y>(initial, { ...options, clock: m.clock })
    return { m, f }
}

/** Runs frames until the follower is idle; fails if it never settles. */
function settle(m: ManualClock, f: { readonly status: 'IDLE' | 'PLAYING' }) {
    for (let i = 0; i < 2000 && f.status === 'PLAYING'; i++) m.frame(16)
    expect(f.status).toBe('IDLE')
}

describe('FOL: follow()', () => {
    it('A1: a fresh follower is idle at its initial value', () => {
        const { f } = make()
        expect(f.value).toEqual({ y: 0 })
        expect(Object.isFrozen(f.value)).toBe(true)
        expect(f.target).toEqual({ y: 0 })
        expect(f.status).toBe('IDLE')
        expect(f.velocity).toEqual({ y: 0 })
    })

    it('A1: follow is exported from the root and as a.follow', () => {
        expect(typeof follow).toBe('function')
        expect(a.follow).toBe(follow)
        expect(root.follow).toBe(follow)
    })

    it('A2: set moves the target at once, then the value settles on it', async () => {
        const { m, f } = make()
        const promise = f.set({ y: 100 })
        expect(f.target).toEqual({ y: 100 })
        expect(f.status).toBe('PLAYING')

        m.frame()
        expect(f.value.y).toBeGreaterThan(0)
        expect(f.value.y).toBeLessThan(100)
        expect(f.status).toBe('PLAYING')
        expect(f.target).toEqual({ y: 100 })

        settle(m, f)
        expect(f.value.y).toBeCloseTo(100, 6)
        expect(f.target).toEqual({ y: 100 })
        expect(f.velocity).toEqual({ y: 0 })
        expect(await promise).toBe('ended')
    })

    it('A2: set merges a partial record into the target', () => {
        const m = createManualClock()
        const f = follow<XY>({ x: 1, y: 2 }, { clock: m.clock })
        void f.set({ y: 10 })
        expect(f.target).toEqual({ x: 1, y: 10 })
        settle(m, f)
        expect(f.value.x).toBeCloseTo(1, 6)
        expect(f.value.y).toBeCloseTo(10, 6)
    })

    it('A2: set to the current target while idle resolves ended at once', async () => {
        const { m, f } = make()
        const promise = f.set({ y: 0 })
        expect(f.status).toBe('IDLE')
        expect(m.clock.size).toBe(0)
        expect(await promise).toBe('ended')
        expect(f.value).toEqual({ y: 0 })

        void f.set({ y: 50 })
        settle(m, f)
        const again = f.set({ y: 50 })
        expect(f.status).toBe('IDLE')
        expect(m.clock.size).toBe(0)
        expect(await again).toBe('ended')
    })

    it('A2: a later set replaces the motion and carries its velocity', async () => {
        const { m, f } = make()
        const first = f.set({ y: 100 })
        m.frames(5, 10)
        const second = f.set({ y: 0 })
        expect(f.target).toEqual({ y: 0 })
        expect(await first).toBe('interrupted')
        settle(m, f)
        expect(f.value.y).toBeCloseTo(0, 6)
        expect(await second).toBe('ended')
    })

    /** Three presses 50 ms apart, in 10 ms frames, then settle. */
    async function accumulate() {
        const { m, f } = make()
        const results: Promise<RunResult>[] = []
        const values: number[] = [f.value.y]
        const deltas: number[] = []
        const checks: {
            speedBefore: number
            speedAfter: number
            deltaBefore: number
            deltaAfter: number
        }[] = []
        let speedBefore = 0
        let deltaBefore = 0

        for (let press = 0; press < 3; press++) {
            results.push(f.set({ y: f.target.y + 100 }))
            const speedAfter = f.velocity.y
            for (let frame = 0; frame < 5; frame++) {
                m.frame(10)
                const value = f.value.y
                deltas.push(value - values[values.length - 1]!)
                values.push(value)
                if (press > 0 && frame === 0) {
                    checks.push({
                        speedBefore,
                        speedAfter,
                        deltaBefore,
                        deltaAfter: deltas[deltas.length - 1]!,
                    })
                }
            }
            speedBefore = f.velocity.y
            deltaBefore = deltas[deltas.length - 1]!
        }
        settle(m, f)
        return { f, results, values, deltas, checks }
    }

    it('A3: repeated input accumulates and never slows at a press', async () => {
        const { f, values, deltas, checks } = await accumulate()
        expect(f.target).toEqual({ y: 300 })
        expect(f.value.y).toBeCloseTo(300, 6)

        // strictly increasing, frame by frame, across all three presses
        for (let i = 1; i < values.length; i++) {
            expect(values[i]!).toBeGreaterThan(values[i - 1]!)
        }
        expect(deltas.length).toBe(15)

        expect(checks).toHaveLength(2)
        for (const check of checks) {
            expect(check.speedBefore).toBeGreaterThan(0)
            expect(check.speedAfter).toBeGreaterThanOrEqual(
                check.speedBefore - 1e-6
            )
            expect(check.deltaAfter).toBeGreaterThanOrEqual(
                check.deltaBefore - 1e-6
            )
        }
    })

    it('A4: superseded presses resolve interrupted, the last one ended', async () => {
        const { results } = await accumulate()
        expect(await Promise.all(results)).toEqual([
            'interrupted',
            'interrupted',
            'ended',
        ])
    })

    it('A5: options.velocity overrides the carried velocity', () => {
        const m = createManualClock()
        const continuing = follow<Y>({ y: 0 }, { clock: m.clock })
        const fromRest = follow<Y>({ y: 0 }, { clock: m.clock })
        void continuing.set({ y: 100 })
        void fromRest.set({ y: 100 })
        m.frames(5, 10)
        expect(continuing.value.y).toBeCloseTo(fromRest.value.y, 9)

        const before = continuing.value.y
        void continuing.set({ y: 200 })
        void fromRest.set({ y: 200 }, { velocity: { y: 0 } })
        m.frame(10)
        const movedContinuing = continuing.value.y - before
        const movedFromRest = fromRest.value.y - before
        expect(movedFromRest).toBeGreaterThan(0)
        expect(movedFromRest).toBeLessThan(movedContinuing)
    })

    it('A5: options.velocity can also seed a push from rest', () => {
        const m = createManualClock()
        const plain = follow<Y>({ y: 0 }, { clock: m.clock })
        const pushed = follow<Y>({ y: 0 }, { clock: m.clock })
        void plain.set({ y: 100 })
        void pushed.set({ y: 100 }, { velocity: { y: 1000 } })
        m.frame(10)
        expect(pushed.value.y).toBeGreaterThan(plain.value.y)
    })

    it('A6: jump while moving lands at once and interrupts the set', async () => {
        const m = createManualClock()
        const f = follow<Y>({ y: 0 }, { clock: m.clock })
        const el = fakeElement()
        f.bind(el, { resolver: topResolver })
        const promise = f.set({ y: 100 })
        m.frames(3)
        expect(f.status).toBe('PLAYING')

        const seen: { y: number; status: string }[] = []
        f.onUpdate((frame) => {
            seen.push({ y: frame.state.y, status: frame.status })
        })

        f.jump({ y: 40 })
        expect(f.value).toEqual({ y: 40 })
        expect(f.target).toEqual({ y: 40 })
        expect(f.velocity).toEqual({ y: 0 })
        expect(f.status).toBe('IDLE')
        expect(seen).toEqual([{ y: 40, status: 'IDLE' }])
        expect(el.last('top')).toBe(40)
        expect(await promise).toBe('interrupted')

        m.frames(10)
        expect(f.value).toEqual({ y: 40 })
        expect(seen).toHaveLength(1)
        expect(m.clock.size).toBe(0)
    })

    it('A6: jump while idle writes and notifies synchronously, merging keys', () => {
        const m = createManualClock()
        const f = follow<XY>({ x: 1, y: 2 }, { clock: m.clock })
        const seen: number[] = []
        f.onUpdate((frame) => {
            seen.push(frame.state.y)
        })
        f.jump({ y: 9 })
        expect(f.value).toEqual({ x: 1, y: 9 })
        expect(f.target).toEqual({ x: 1, y: 9 })
        expect(f.status).toBe('IDLE')
        expect(seen).toEqual([9])
        expect(m.clock.size).toBe(0)
    })

    describe('A7: validation', () => {
        const bad: [string, unknown][] = [
            ['unknown key', { z: 1 }],
            ['NaN', { y: Number.NaN }],
            ['Infinity', { y: Number.POSITIVE_INFINITY }],
            ['string value', { y: '5' }],
            ['null', null],
            ['array', [5]],
            ['number', 5],
            ['valid key next to an unknown one', { y: 5, z: 1 }],
        ]

        for (const [label, input] of bad) {
            it(`A7: set rejects ${label} and changes nothing`, () => {
                const m = createManualClock()
                const f = follow<XY>({ x: 1, y: 2 }, { clock: m.clock })
                expect(() => f.set(input as Partial<XY>)).toThrow(TypeError)
                expect(f.value).toEqual({ x: 1, y: 2 })
                expect(f.target).toEqual({ x: 1, y: 2 })
                expect(f.status).toBe('IDLE')
                expect(m.clock.size).toBe(0)
            })

            it(`A7: jump rejects ${label} and changes nothing`, () => {
                const m = createManualClock()
                const f = follow<XY>({ x: 1, y: 2 }, { clock: m.clock })
                const seen: unknown[] = []
                f.onUpdate((frame) => {
                    seen.push(frame)
                })
                expect(() => f.jump(input as Partial<XY>)).toThrow(TypeError)
                expect(f.value).toEqual({ x: 1, y: 2 })
                expect(f.target).toEqual({ x: 1, y: 2 })
                expect(seen).toHaveLength(0)
            })
        }

        it('A7: an invalid set leaves a running motion alone', async () => {
            const { m, f } = make()
            const promise = f.set({ y: 100 })
            m.frames(2)
            const value = f.value.y
            expect(() => f.set({ y: Number.NaN })).toThrow(TypeError)
            expect(() => f.jump({ z: 1 } as unknown as Partial<Y>)).toThrow(
                TypeError
            )
            expect(f.target).toEqual({ y: 100 })
            expect(f.value.y).toBe(value)
            expect(f.status).toBe('PLAYING')
            settle(m, f)
            expect(f.value.y).toBeCloseTo(100, 6)
            expect(await promise).toBe('ended')
        })

        it('A7: a non-finite velocity throws and changes nothing', () => {
            const { f } = make()
            expect(() =>
                f.set({ y: 5 }, { velocity: { y: Number.NaN } })
            ).toThrow(TypeError)
            expect(f.target).toEqual({ y: 0 })
            expect(f.status).toBe('IDLE')
        })

        const badSprings: [string, { m: number; k: number; c: number }][] = [
            ['m = 0', { m: 0, k: 170, c: 26 }],
            ['negative k', { m: 1, k: -1, c: 26 }],
            ['k = 0', { m: 1, k: 0, c: 26 }],
            ['negative c', { m: 1, k: 170, c: -1 }],
            ['NaN m', { m: Number.NaN, k: 170, c: 26 }],
        ]
        for (const [label, spring] of badSprings) {
            it(`A7: spring options with ${label} throw RangeError`, () => {
                const m = createManualClock()
                expect(() =>
                    follow<Y>({ y: 0 }, { clock: m.clock, spring })
                ).toThrow(RangeError)
                expect(m.clock.size).toBe(0)
            })
        }
    })

    it('A8: bind writes the initial value at once and follows the motion', async () => {
        const { m, f } = make()
        const el = fakeElement()
        const unbind = f.bind(el)
        expect(el.writes).toEqual([{ prop: 'y', value: 0 }])
        expect(m.clock.size).toBe(0)

        void f.set({ y: 100 })
        for (let i = 0; i < 5; i++) {
            const before = el.writes.length
            m.frame()
            expect(el.writes.length).toBe(before + 1)
            expect(el.last('y')).toBe(f.value.y)
        }

        settle(m, f)
        expect(el.last('y')).toBeCloseTo(100, 6)

        // diffed: an unchanged value is not written again
        const settled = el.writes.length
        f.jump({ y: f.value.y })
        m.frames(5)
        expect(el.writes.length).toBe(settled)

        unbind()
        void f.set({ y: 0 })
        m.frames(5)
        expect(el.last('y')).toBeCloseTo(100, 6)
        expect(el.writes.length).toBe(settled)
        unbind()
    })

    it('A8: bind uses a custom resolver', () => {
        const { m, f } = make()
        const el = fakeElement()
        f.bind(el, { resolver: topResolver })
        expect(el.writes).toEqual([{ prop: 'top', value: 0 }])
        void f.set({ y: 100 })
        m.frame()
        expect(el.last('top')).toBe(f.value.y)
    })

    it('A8: bind after a motion writes the current value at once', () => {
        const { m, f } = make()
        void f.set({ y: 100 })
        m.frames(4)
        const el = fakeElement()
        f.bind(el)
        expect(el.writes).toEqual([{ prop: 'y', value: f.value.y }])
    })

    it('A8: onUpdate sees one frame per clock frame while moving, none idle', () => {
        const { m, f } = make()
        const seen: { y: number; status: string }[] = []
        const off = f.onUpdate((frame) => {
            seen.push({ y: frame.state.y, status: frame.status })
        })
        m.frames(10)
        expect(seen).toHaveLength(0)

        void f.set({ y: 100 })
        seen.length = 0
        let frames = 0
        while (f.status === 'PLAYING' && frames < 2000) {
            m.frame()
            frames++
        }
        expect(f.status).toBe('IDLE')
        expect(seen).toHaveLength(frames)
        expect(frames).toBeGreaterThan(5)
        for (const frame of seen.slice(0, -1)) {
            expect(frame.status).toBe('PLAYING')
        }
        expect(seen[0]!.y).toBeGreaterThan(0)
        expect(seen[seen.length - 1]!.status).toBe('IDLE')
        expect(seen[seen.length - 1]!.y).toBeCloseTo(100, 6)

        const count = seen.length
        m.frames(10)
        expect(seen).toHaveLength(count)

        off()
        void f.set({ y: 0 })
        m.frames(5)
        expect(seen).toHaveLength(count)
    })

    it('A9: dispose stops writes and notifications and settles the set', async () => {
        const { m, f } = make()
        const el = fakeElement()
        f.bind(el)
        const seen: unknown[] = []
        f.onUpdate((frame) => {
            seen.push(frame)
        })
        const promise = f.set({ y: 100 })
        m.frames(3)
        const writes = el.writes.length
        const notified = seen.length
        const value = f.value.y

        f.dispose()
        expect(await promise).toBe('disposed')
        expect(m.clock.size).toBe(0)
        m.frames(10)
        expect(el.writes.length).toBe(writes)
        expect(seen).toHaveLength(notified)

        expect(await f.set({ y: 5 })).toBe('disposed')
        f.jump({ y: 7 })
        expect(f.value.y).toBe(value)
        expect(el.writes.length).toBe(writes)
        expect(seen).toHaveLength(notified)
        m.frames(5)
        expect(m.clock.size).toBe(0)
        expect(el.writes.length).toBe(writes)

        expect(() => f.dispose()).not.toThrow()
    })

    it('A10: followers with different springs are independent', async () => {
        const m = createManualClock()
        const stiff = { m: 1, k: 600, c: 50 }
        const soft = { m: 1, k: 40, c: 8 }
        const a1 = follow<Y>({ y: 0 }, { clock: m.clock, spring: stiff })
        const a2 = follow<Y>({ y: 0 }, { clock: m.clock, spring: soft })

        const soloClock = createManualClock()
        const solo = follow<Y>(
            { y: 0 },
            { clock: soloClock.clock, spring: soft }
        )

        const p1 = a1.set({ y: 100 })
        const p2 = a2.set({ y: -50 })
        void solo.set({ y: -50 })
        expect(m.clock.size).toBe(2)

        for (let i = 0; i < 20; i++) {
            m.frame()
            soloClock.frame()
        }
        expect(a1.target).toEqual({ y: 100 })
        expect(a2.target).toEqual({ y: -50 })
        expect(a2.value.y).toBeCloseTo(solo.value.y, 9)
        expect(a1.value.y).toBeGreaterThan(0)
        expect(a2.value.y).toBeLessThan(0)

        // disposing one leaves the other untouched
        a1.dispose()
        expect(await p1).toBe('disposed')
        for (let i = 0; i < 20; i++) {
            m.frame()
            soloClock.frame()
        }
        expect(a2.value.y).toBeCloseTo(solo.value.y, 9)
        settle(m, a2)
        expect(a2.value.y).toBeCloseTo(-50, 6)
        expect(await p2).toBe('ended')
    })

    it('A10: a stiffer spring settles sooner than a soft one', () => {
        const m = createManualClock()
        const stiff = follow<Y>(
            { y: 0 },
            { clock: m.clock, spring: { m: 1, k: 900, c: 60 } }
        )
        const soft = follow<Y>(
            { y: 0 },
            { clock: m.clock, spring: { m: 1, k: 30, c: 10 } }
        )
        void stiff.set({ y: 100 })
        void soft.set({ y: 100 })
        let frames = 0
        while (stiff.status === 'PLAYING' && frames < 2000) {
            m.frame()
            frames++
        }
        expect(stiff.status).toBe('IDLE')
        expect(soft.status).toBe('PLAYING')
        expect(m.clock.size).toBe(1)
    })

    it('A10: one clock subscriber while moving, none while idle', () => {
        const { m, f } = make()
        f.bind(fakeElement())
        f.onUpdate(() => undefined)
        expect(m.clock.size).toBe(0)

        void f.set({ y: 100 })
        expect(m.clock.size).toBe(1)
        m.frames(2, 10)
        void f.set({ y: 200 })
        void f.set({ y: 300 })
        expect(m.clock.size).toBe(1)

        settle(m, f)
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)

        void f.set({ y: 0 })
        expect(m.clock.size).toBe(1)
        f.jump({ y: 5 })
        expect(m.clock.size).toBe(0)

        void f.set({ y: 50 })
        expect(m.clock.size).toBe(1)
        f.dispose()
        expect(m.clock.size).toBe(0)
    })
})
