import { describe, expect, it } from 'vitest'
import type { ExecutionPlan } from '~/ani/core'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import { rafTimeline } from '~/ani/raf/timeline'
import { SpringTimingFunction, TimingFunction } from '~/timing'
import type { AnimationRecord } from './gen'
import { caseMessage, generateTree, mulberry32 } from './gen'
import {
    DEFAULT_SETTLE_TOLERANCE,
    planOutcome,
    snapshot,
    sortedPlan,
} from './helpers'

/**
 * P3: boundaries. `seek(0)` reports `from` (unless a zero-length segment
 * starts there; a dynamic spring already at rest may snap within its settling
 * tolerance of it), and once the run
 * ended every key holds the `to` of the segment that started last for it
 * (ties: later declaration).
 */

const CASES = 200
const BASE_SEED = 0xa43001
/**
 * `SpringTimingFunction` evaluates its `from` at t=0 as `(from - to) + to`,
 * which can differ from `from` by a few ulp. Only keys driven by one get this
 * slack; every other timing must report `from` exactly.
 */
const FROM_TOLERANCE = 1e-9

/**
 * True when a segment writing `key` that starts at t=0 uses a static spring
 * for it. Not only the winner: a later opening segment starts from the value
 * the earlier ones report at t=0, so their spring noise is inherited.
 */
function startsWithStaticSpring(
    plan: ExecutionPlan<AnimationRecord>,
    key: string
): boolean {
    return plan.some((segment) => {
        if (segment.startTime > 0 || !(key in segment.node.props.to)) {
            return false
        }
        const timing = segment.node.props.timing as unknown
        const own =
            timing instanceof TimingFunction
                ? timing
                : (timing as Record<string, TimingFunction> | undefined)?.[key]
        return own instanceof SpringTimingFunction
    })
}

describe('P3: boundaries', () => {
    it('reports `from` at t=0 and the last-started `to` after ENDED', () => {
        for (let i = 0; i < CASES; i++) {
            const seed = BASE_SEED + i
            const rng = mulberry32(seed)
            const { node, keys, from } = generateTree(rng)
            const plan = sortedPlan(node)
            const outcome = planOutcome(plan, from)

            const clock = new ManualClock()
            const line = rafTimeline(node, clock)
            line.play({ from })
            line.seek(0)
            for (const key of keys) {
                if (outcome.zeroStartKeys.has(key)) continue
                const actual = line.getCurrentValue()![key]!
                // a dynamic spring already at rest snaps to `to`, which is
                // within its settling tolerance of `from`
                let tolerance = outcome.settledAtStartKeys.has(key)
                    ? DEFAULT_SETTLE_TOLERANCE
                    : 0
                if (startsWithStaticSpring(plan, key)) {
                    tolerance +=
                        FROM_TOLERANCE * Math.max(1, Math.abs(from[key]!))
                }
                expect(
                    Math.abs(actual - from[key]!),
                    caseMessage(seed, `seek(0) key "${key}"`)
                ).toBeLessThanOrEqual(tolerance)
            }

            line.resume()
            clock.tick(line.duration + 1)
            expect(line.status, caseMessage(seed, 'status after the run')).toBe(
                'ENDED'
            )
            expect(clock.size, caseMessage(seed, 'clock subscriptions')).toBe(0)

            const final = snapshot(line.getCurrentValue()!)
            for (const key of keys) {
                expect(
                    final[key]!,
                    caseMessage(seed, `final key "${key}"`)
                ).toBe(outcome.final[key]!)
            }
        }
    })
})
