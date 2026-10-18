import { describe, expect, it } from 'vitest'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import { rafTimeline } from '~/ani/raf/timeline'
import { ani, parallel, sequence } from '~/nodes'
import { T } from '~/timing'

// Found by the A4 property tests (seed 10772481): when the segment that wins
// a lane is not the lane's first entry, an interrupting play() lost the
// inherited velocity.
const FRAME = 1 / 60

function interruptAgainstControl(node: Parameters<typeof rafTimeline>[0]) {
    const clock = new ManualClock()
    const line = rafTimeline(node, clock)
    line.play({ from: { x: 0 } })
    const controlClock = new ManualClock()
    const control = rafTimeline(node, controlClock)
    control.play({ from: { x: 0 } })

    clock.tick(FRAME)
    controlClock.tick(FRAME)
    const before = line.getCurrentValue()!.x!
    line.play({ from: { x: before } })

    const gaps: number[] = []
    for (let i = 0; i < 30; i++) {
        clock.tick(FRAME)
        controlClock.tick(FRAME)
        gaps.push(
            Math.abs(line.getCurrentValue()!.x! - control.getCurrentValue()!.x!)
        )
    }
    return Math.max(...gaps)
}

describe('FX1: inherited velocity seeds the segment that wins the lane', () => {
    it('A1: nested parallel, the later child wins: the interruption is invisible', () => {
        const node = parallel([
            sequence([
                ani({
                    to: { x: 400 },
                    duration: 2,
                    timing: T.dynamicSpring({ m: 1, k: 50, c: 5 }),
                }),
            ]),
            sequence([
                ani({
                    to: { x: 800 },
                    duration: 2,
                    timing: T.dynamicSpring({ m: 1, k: 100, c: 10 }),
                }),
            ]),
        ])
        expect(interruptAgainstControl(node)).toBeLessThanOrEqual(1e-3)
    })

    it('A2: single segment (already correct) stays invisible', () => {
        const node = ani({
            to: { x: 800 },
            duration: 2,
            timing: T.dynamicSpring({ m: 1, k: 100, c: 10 }),
        })
        expect(interruptAgainstControl(node)).toBeLessThanOrEqual(1e-3)
    })

    it('A3: a later segment of a sequence is not seeded', () => {
        // The seed belongs to the opening segment only: a spring that starts
        // at 0.5 s begins from rest, whatever the interrupted velocity was.
        const spring = T.dynamicSpring({ m: 1, k: 100, c: 10 })
        const node = sequence([
            ani({ to: { x: 100 }, duration: 0.5, timing: T.linear() }),
            ani({ to: { x: 300 }, duration: 1, timing: spring }),
        ])
        const clock = new ManualClock()
        const line = rafTimeline(node, clock)
        line.play({ from: { x: 0 }, velocity: { x: 5000 } })
        const fresh = rafTimeline(node, new ManualClock())
        fresh.play({ from: { x: 0 } })
        line.seek(1)
        fresh.seek(1)
        expect(line.getCurrentValue()!.x).toBeCloseTo(
            fresh.getCurrentValue()!.x!,
            9
        )
    })
})
