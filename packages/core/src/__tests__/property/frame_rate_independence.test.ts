import { describe, expect, it } from 'vitest'
import { rafTimeline } from '~/ani/raf/timeline'
import { createManualClock } from '../integration/manual_clock'
import type { AnimationRecord } from './gen'
import { caseMessage, generateTree, mulberry32 } from './gen'
import { snapshot } from './helpers'

/**
 * P2: the value at a wall-clock timestamp must not depend on the frame
 * slicing that produced it. The same tree is played at 60 fps, at 144 fps and
 * with seeded irregular frames; every schedule must land on the shared
 * timestamps and agree with a fresh `seek` there.
 */

const CASES = 200
const BASE_SEED = 0xa42001
const STATELESS_TOLERANCE = 1e-9
/** dynamicSpring tolerance: 1e-4 of the key's observed value range. */
const DYNAMIC_RANGE_FACTOR = 1e-4

interface Schedule {
    label: string
    nextDelta: () => number
}

function playSchedule(
    node: Parameters<typeof rafTimeline>[0],
    from: AnimationRecord,
    times: readonly number[],
    schedule: Schedule
): AnimationRecord[] {
    const { clock, frame } = createManualClock()
    const line = rafTimeline(node, { clock })
    line.play({ from })
    const out: AnimationRecord[] = []
    let elapsed = 0
    for (const target of times) {
        while (elapsed < target) {
            const step = Math.min(schedule.nextDelta(), target - elapsed)
            if (!(step > 0)) break
            frame(step * 1000)
            elapsed += step
        }
        out.push(snapshot(line.value!))
    }
    return out
}

function seekAt(
    node: Parameters<typeof rafTimeline>[0],
    from: AnimationRecord,
    times: readonly number[]
): AnimationRecord[] {
    const { clock } = createManualClock()
    const line = rafTimeline(node, { clock })
    line.play({ from })
    return times.map((time) => {
        line.seek(time)
        return snapshot(line.value!)
    })
}

function rangeOf(values: readonly number[]): number {
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const value of values) {
        if (value < min) min = value
        if (value > max) max = value
    }
    return max - min
}

describe('P2: frame-rate independence', () => {
    it('agrees at shared timestamps for 60/144 fps and irregular frames', () => {
        for (let i = 0; i < CASES; i++) {
            const seed = BASE_SEED + i
            const rng = mulberry32(seed)
            const { node, keys, from, hasDynamicSpring } = generateTree(rng)
            const duration = node.duration
            // A tree of only zero-length segments has no positive shared
            // timestamp to compare; the frame schedules never advance.
            if (duration <= 0) continue

            const fractions: number[] = []
            for (let j = 0; j < 5; j++) {
                fractions.push(rng.range(0.03, 0.97))
            }
            fractions.sort((a, b) => a - b)
            const times = fractions.map((fraction) => fraction * duration)

            const reference = seekAt(node, from, times)
            const schedules: Array<{
                schedule: Schedule
                values: AnimationRecord[]
            }> = [
                {
                    schedule: { label: '60fps', nextDelta: () => 1 / 60 },
                    values: [],
                },
                {
                    schedule: { label: '144fps', nextDelta: () => 1 / 144 },
                    values: [],
                },
                {
                    schedule: {
                        label: 'irregular',
                        nextDelta: () => rng.range(0.008, 0.04),
                    },
                    values: [],
                },
            ]
            for (const entry of schedules) {
                entry.values = playSchedule(node, from, times, entry.schedule)
            }

            for (const key of keys) {
                const observed: number[] = []
                for (let j = 0; j < times.length; j++) {
                    observed.push(reference[j]![key]!)
                    for (const entry of schedules) {
                        observed.push(entry.values[j]![key]!)
                    }
                }
                const tolerance = hasDynamicSpring
                    ? DYNAMIC_RANGE_FACTOR * Math.max(rangeOf(observed), 1)
                    : STATELESS_TOLERANCE
                for (const entry of schedules) {
                    for (let j = 0; j < times.length; j++) {
                        const message = caseMessage(
                            seed,
                            `key "${key}" at t=${times[j]} (${entry.schedule.label})`
                        )
                        const difference = Math.abs(
                            entry.values[j]![key]! - reference[j]![key]!
                        )
                        expect(difference, message).toBeLessThanOrEqual(
                            tolerance
                        )
                    }
                }
            }
        }
    })
})
