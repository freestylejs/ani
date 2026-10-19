import { describe, expect, it } from 'vitest'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import { rafTimeline } from '~/ani/raf/timeline'
import type { AnimationRecord } from './gen'
import { caseMessage, generateTree, mulberry32 } from './gen'
import { snapshot } from './helpers'

/**
 * P1: `seek(t)` is a pure time-domain override. The value at `t` must not
 * depend on which times were sought before, nor on how many seeks a timeline
 * already performed (stateful dynamic springs included).
 */

const CASES = 200
const BASE_SEED = 0xa41001
const DYNAMIC_SPRING_TOLERANCE = 1e-9

type Snapshots = Record<number, AnimationRecord>

function seekInOrder(
    node: Parameters<typeof rafTimeline>[0],
    from: AnimationRecord,
    times: readonly number[],
    order: readonly number[]
): Snapshots {
    const line = rafTimeline(node, { clock: new ManualClock() })
    line.play({ from })
    const out: Snapshots = {}
    for (const index of order) {
        line.seek(times[index]!)
        out[index] = snapshot(line.value!)
    }
    return out
}

describe('P1: seek determinism', () => {
    it('agrees across ascending, descending and fresh seeks (200 trees)', () => {
        for (let i = 0; i < CASES; i++) {
            const seed = BASE_SEED + i
            const rng = mulberry32(seed)
            const { node, keys, from, hasDynamicSpring } = generateTree(rng)
            const duration = node.duration

            const times: number[] = []
            for (let j = 0; j < 5; j++) {
                times.push(duration * rng.range(-0.05, 1.05))
            }
            const ascendingOrder = times
                .map((time, index) => ({ time, index }))
                .sort((a, b) => a.time - b.time)
                .map((entry) => entry.index)
            const descendingOrder = [...ascendingOrder].reverse()

            const ascending = seekInOrder(node, from, times, ascendingOrder)
            const descending = seekInOrder(node, from, times, descendingOrder)
            const fresh: Snapshots = {}
            for (let j = 0; j < times.length; j++) {
                const line = rafTimeline(node, { clock: new ManualClock() })
                line.play({ from })
                line.seek(times[j]!)
                fresh[j] = snapshot(line.value!)
            }

            for (let j = 0; j < times.length; j++) {
                for (const key of keys) {
                    const message = caseMessage(
                        seed,
                        `key "${key}" at t=${times[j]}`
                    )
                    if (hasDynamicSpring) {
                        expect(
                            Math.abs(ascending[j]![key]! - fresh[j]![key]!),
                            message
                        ).toBeLessThanOrEqual(DYNAMIC_SPRING_TOLERANCE)
                        expect(
                            Math.abs(descending[j]![key]! - fresh[j]![key]!),
                            message
                        ).toBeLessThanOrEqual(DYNAMIC_SPRING_TOLERANCE)
                    } else {
                        expect(ascending[j]![key]!, message).toBe(
                            fresh[j]![key]!
                        )
                        expect(descending[j]![key]!, message).toBe(
                            fresh[j]![key]!
                        )
                    }
                }
            }
        }
    })
})
