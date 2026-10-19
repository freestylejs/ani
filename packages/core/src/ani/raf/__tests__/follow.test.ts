import { describe, expect, it } from 'vitest'
import { createManualClock } from '../../../testing'
import { follow } from '../follow'

describe('follow()', () => {
    it('rejects an initial value that is not a record of finite numbers', () => {
        const { clock } = createManualClock()
        expect(() =>
            follow(null as unknown as { y: number }, { clock })
        ).toThrow(TypeError)
        expect(() =>
            follow([1] as unknown as { y: number }, { clock })
        ).toThrow(TypeError)
        expect(() => follow({ y: Number.NaN }, { clock })).toThrow(TypeError)
        expect(clock.size).toBe(0)
    })

    it('keeps the velocity of a set that no frame has advanced yet', () => {
        const m = createManualClock()
        const f = follow({ y: 0 }, { clock: m.clock })
        void f.set({ y: 100 }, { velocity: { y: 500 } })
        void f.set({ y: 200 })
        expect(f.velocity.y).toBe(500)
    })

    it('overrides only the given keys of the carried velocity', () => {
        const m = createManualClock()
        const f = follow({ x: 0, y: 0 }, { clock: m.clock })
        void f.set({ x: 100, y: 100 })
        m.frames(3, 10)
        const { x } = f.velocity
        void f.set({ x: 200, y: 200 }, { velocity: { y: 0 } })
        expect(f.velocity.x).toBe(x)
        expect(f.velocity.y).toBe(0)
    })

    it('settles a pending set as disposed when disposed before its first frame', async () => {
        const m = createManualClock()
        const f = follow({ y: 0 }, { clock: m.clock })
        const pending = f.set({ y: 10 })
        f.dispose()
        expect(await pending).toBe('disposed')
        expect(f.value).toEqual({ y: 0 })
        expect(m.clock.size).toBe(0)
    })

    it('does not notify listeners for the start of a set', () => {
        const m = createManualClock()
        const f = follow({ y: 0 }, { clock: m.clock })
        const seen: number[] = []
        f.onUpdate((frame) => {
            seen.push(frame.state.y)
        })
        void f.set({ y: 10 })
        expect(seen).toEqual([])
        m.frame()
        expect(seen).toHaveLength(1)
    })

    it('rejects malformed reducedMotion at construction', () => {
        const m = createManualClock()
        expect(() =>
            follow(
                { y: 0 },
                { clock: m.clock, reducedMotion: 'always' as never }
            )
        ).toThrow(TypeError)
        expect(() =>
            follow(
                { y: 0 },
                { clock: m.clock, reducedMotion: { maxDuration: 1 } as never }
            )
        ).toThrow(TypeError)
    })

    it('reaches target on next frame and notifies listeners once under reduced motion', async () => {
        const m = createManualClock({ reducedMotion: true })
        const f = follow({ y: 0 }, { clock: m.clock })
        const seen: { state: { y: number }; status: string }[] = []
        f.onUpdate((frame) => {
            seen.push({ state: { ...frame.state }, status: frame.status })
        })

        const run = f.set({ y: 100 })
        expect(f.status).toBe('PLAYING')
        expect(f.value.y).toBe(0)
        expect(seen).toEqual([])

        m.frame(16)
        expect(await run).toBe('ended')
        expect(f.value.y).toBe(100)
        expect(f.velocity.y).toBe(0)
        expect(f.status).toBe('IDLE')
        expect(seen).toEqual([{ state: { y: 100 }, status: 'IDLE' }])
    })

    it('interrupts a pending jump with a subsequent set', async () => {
        const m = createManualClock({ reducedMotion: true })
        const f = follow({ y: 0 }, { clock: m.clock })
        const first = f.set({ y: 50 })
        const second = f.set({ y: 100 })

        expect(await first).toBe('interrupted')
        m.frame(16)
        expect(await second).toBe('ended')
        expect(f.value.y).toBe(100)
    })

    it('interrupts a pending jump with jump()', async () => {
        const m = createManualClock({ reducedMotion: true })
        const f = follow({ y: 0 }, { clock: m.clock })
        const run = f.set({ y: 50 })
        f.jump({ y: 75 })

        expect(await run).toBe('interrupted')
        expect(f.value.y).toBe(75)
        expect(f.status).toBe('IDLE')
    })
})
