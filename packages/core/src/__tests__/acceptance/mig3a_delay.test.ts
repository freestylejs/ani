import { afterEach, describe, expect, it } from 'vitest'
import { a, createStates, type RunResult, rafTimeline } from '../../index'
import { createManualClock } from '../../testing'

const linear = a.timing.linear()
const move = () => a.ani({ to: { x: 100 }, duration: 1, timing: linear })

const owned: Array<{ dispose(): void }> = []
afterEach(() => {
    for (const item of owned.splice(0)) item.dispose()
})

function track(promise: Promise<RunResult>) {
    const seen: { result: RunResult | null } = { result: null }
    promise.then((result) => {
        seen.result = result
    })
    return seen
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('MIG3a: RAF `delay` is in seconds', () => {
    it('D1: `delay: 0.5` equals a 0.5 s `delay` node in front of the tree', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const delayed = rafTimeline(move(), { clock: m.clock })
        const reference = rafTimeline(
            a.sequence([a.delay(0.5), move()]) as unknown as ReturnType<
                typeof move
            >,
            { clock: m.clock }
        )
        owned.push(delayed, reference)
        delayed.play({ from: { x: 0 }, delay: 0.5 })
        reference.play({ from: { x: 0 } })

        // 0.4 s in: still waiting (milliseconds would already be at x = 40).
        m.frames(20, 20)
        expect(delayed.value?.x ?? 0).toBe(0)

        for (let frame = 20; frame < 90; frame += 5) {
            m.frames(5, 20)
            if (frame + 5 <= 25) continue
            expect(delayed.value?.x, `frame ${frame + 5}`).toBeCloseTo(
                reference.value?.x as number,
                9
            )
        }
        expect(delayed.value).toEqual({ x: 100 })
    })

    it('D2: the run ends after delay + duration', async () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const line = rafTimeline(move(), { clock: m.clock })
        owned.push(line)
        const seen = track(line.play({ from: { x: 0 }, delay: 0.5 }))

        m.frames(70, 20) // 1.4 s
        await flush()
        expect(line.status).toBe('PLAYING')
        expect(seen.result).toBeNull()

        m.frames(10, 20) // 1.6 s
        await flush()
        expect(seen.result).toBe('ended')
    })

    it('D3: an invalid delay throws, and the message says seconds', () => {
        const m = createManualClock()
        const line = rafTimeline(move(), { clock: m.clock })
        owned.push(line)
        for (const delay of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(() => line.play({ from: { x: 0 }, delay })).toThrow(/second/)
        }
    })

    it('D4: `transitionTo(state, { delay })` waits in seconds', async () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const machine = createStates({
            initial: 'idle',
            initialValue: { opacity: 0 },
            states: {
                idle: a.ani({
                    to: { opacity: 0 },
                    duration: 1,
                    timing: linear,
                }),
                active: a.ani({
                    to: { opacity: 1 },
                    duration: 1,
                    timing: linear,
                }),
            },
            clock: m.clock,
        })
        owned.push(machine)
        const seen = track(machine.transitionTo('active', { delay: 0.5 }))

        m.frames(20, 20) // 0.4 s
        expect(machine.timeline().value?.opacity ?? 0).toBe(0)

        m.frames(60, 20) // 1.6 s
        await flush()
        expect(seen.result).toBe('ended')
        expect(machine.timeline().value).toEqual({ opacity: 1 })
    })
})
