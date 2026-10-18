import { describe, expect, it } from 'vitest'
import type { ExecutionPlan } from '~/ani/core'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import { rafTimeline } from '~/ani/raf/timeline'
import { DynamicSpringTimingFunction, TimingFunction } from '~/timing'
import type { AnimationRecord } from './gen'
import { caseMessage, generateTree, mulberry32 } from './gen'
import { planDuration, snapshot, sortedPlan } from './helpers'

/**
 * P6: interruption continuity. Playing a new run over a PLAYING timeline
 * (same tree, `from` = the current value) must not jump: the first frame after
 * the interruption may only continue the motion. Trees use the generator's
 * full mix (every timing, zero-length segments) and are interrupted at a
 * seeded random time anywhere in the run.
 *
 * Per key, the first frame may differ from the last value by at most
 * `|x0 - last| + motion + 1e-6`:
 *
 * - `x0` is where the new run's winning segment starts. It is the last value
 *   unless the tree itself jumps there (a zero-length segment at t=0).
 * - `motion` is how far the winning lane moves in `dt` from `x0`: for a
 *   dynamic spring the card's `|velocity| * dt` plus the acceleration term
 *   (the energy of the damped spring never grows, which bounds `|velocity|`
 *   and then the acceleration over the frame); for every other timing the
 *   velocity is the curve's own, observed on a fresh run from the same
 *   `from`, with acceleration 0 (these lanes have no state to inherit).
 *
 * The velocity itself must be inherited: the first frame equals that of a run
 * started with the interrupted run's velocity given explicitly.
 */

const CASES = 200
const BASE_SEED = 0xa46001
const FRAME = 1 / 60
const TIME_EPSILON = 1e-9
const JUMP_EPSILON = 1e-6
/** `DynamicSpringTimingFunction` snaps to `to` once within this of rest. */
const SETTLE_SNAP = 1e-3
/** The inherited and the explicit velocity run the same integrator. */
const INHERIT_TOLERANCE = 1e-9
/** Where in the run the interruption may land, as a share of its duration. */
const INTERRUPT_SPAN = 0.95

type Plan = ExecutionPlan<AnimationRecord>
type Segment = Plan[number]

/** Timing instance driving `key` in `segment`, if the segment writes it. */
function timingFor(segment: Segment, key: string): TimingFunction | undefined {
    const timing = segment.node.props.timing
    if (timing instanceof TimingFunction) return timing
    if (timing === undefined) return undefined
    return (timing as Record<string, TimingFunction>)[key]
}

/** Last segment that started at or before `time` and writes `key`. */
function winnerAt(plan: Plan, key: string, time: number): Segment | null {
    let winner: Segment | null = null
    for (const segment of plan) {
        if (segment.startTime > time + TIME_EPSILON) break
        if (key in segment.node.props.to) winner = segment
    }
    return winner
}

/**
 * Bound for `|x(dt) - x0|` of the linear damped spring released from
 * `(x0, v0)` towards `to`.
 *
 * Energy `E = v^2/2 + (k/m)(x-to)^2/2` never grows (`c >= 0`), so
 * `|v(t)| <= vmax = hypot(v0, omega (x0 - to))`; then
 * `|x - to| <= |x0 - to| + vmax dt`, so
 * `|a| <= amax = (k (|x0-to| + vmax dt) + c vmax) / m` and
 * `|delta| <= |v0| dt + amax dt^2 / 2`.
 */
function springDisplacementBound(
    opt: { m: number; k: number; c: number },
    x0: number,
    to: number,
    v0: number,
    dt: number
): number {
    const { m, k, c } = opt
    const distance = Math.abs(x0 - to)
    const vmax = Math.sqrt(v0 * v0 + (k / m) * distance * distance)
    const amax = (k * (distance + vmax * dt) + c * vmax) / m
    return Math.abs(v0) * dt + 0.5 * amax * dt * dt
}

/**
 * Frame small enough that every key stays on the segment winning at t = 0 of
 * the new run: away from the next scheduled start and from the end of the
 * shortest opening segment (zero-length segments end where they start).
 */
function frameFor(plan: Plan): number {
    let openingEnd = Number.POSITIVE_INFINITY
    let nextStart = Number.POSITIVE_INFINITY
    for (const segment of plan) {
        if (segment.startTime <= TIME_EPSILON) {
            if (segment.node.duration > 0 && segment.endTime < openingEnd) {
                openingEnd = segment.endTime
            }
        } else if (segment.startTime < nextStart) {
            nextStart = segment.startTime
        }
    }
    return Math.min(FRAME, openingEnd / 4, nextStart / 4)
}

describe('P6: interruption continuity', () => {
    it('continues without a jump when a new run overrides PLAYING (200 trees)', () => {
        let interrupted = 0
        let dynamicLanes = 0
        let movingDynamicLanes = 0

        for (let i = 0; i < CASES; i++) {
            const seed = BASE_SEED + i
            const rng = mulberry32(seed)
            const { node, keys, from } = generateTree(rng)
            const plan = sortedPlan(node)
            const total = planDuration(plan)
            const interruptAt = rng.range(0, total * INTERRUPT_SPAN)
            const dt = frameFor(plan)

            const clock = new ManualClock()
            const line = rafTimeline(node, clock)
            line.play({ from })
            // at least one frame, so the value and velocity exist
            let elapsed = 0
            do {
                const step = Math.min(
                    FRAME,
                    Math.max(interruptAt - elapsed, 1e-3)
                )
                clock.tick(step)
                elapsed += step
            } while (elapsed < interruptAt)
            // springs may settle before the nominal end of the tree
            if (line.status !== 'PLAYING') continue
            interrupted++

            const before = snapshot(line.getCurrentValue()!)
            const velocity = snapshot(line.getCurrentVelocity()!)

            // same tree, `from` = the current value; velocity is inherited
            line.play({ from: snapshot(before) })

            const freshClock = new ManualClock()
            const fresh = rafTimeline(node, freshClock)
            fresh.play({ from: snapshot(before) })
            fresh.seek(0)
            const start = snapshot(fresh.getCurrentValue()!)
            fresh.seek(dt)
            const moved = snapshot(fresh.getCurrentValue()!)

            const explicitClock = new ManualClock()
            const explicit = rafTimeline(node, explicitClock)
            explicit.play({ from: snapshot(before), velocity })

            clock.tick(dt)
            explicitClock.tick(dt)
            const first = snapshot(line.getCurrentValue()!)
            const given = snapshot(explicit.getCurrentValue()!)

            for (const key of keys) {
                // the velocity carried over is the one the card refers to
                expect(
                    Math.abs(first[key]! - given[key]!),
                    caseMessage(
                        seed,
                        `inherited velocity key "${key}" (interrupted at ${elapsed}, velocity=${velocity[key]})`
                    )
                ).toBeLessThanOrEqual(INHERIT_TOLERANCE)

                const winner = winnerAt(plan, key, dt)
                const timing = winner ? timingFor(winner, key) : undefined
                const dynamic = timing instanceof DynamicSpringTimingFunction
                const zeroLength = winner !== null && winner.node.duration === 0

                // no jump at the interruption instant, bar the tree's own (a
                // zero-length segment at t = 0 makes its key start from `to`)
                const treeJump = plan.some(
                    (segment) =>
                        segment.startTime <= TIME_EPSILON &&
                        segment.node.duration === 0 &&
                        key in segment.node.props.to
                )
                if (!treeJump) {
                    expect(
                        Math.abs(start[key]! - before[key]!),
                        caseMessage(seed, `interruption instant key "${key}"`)
                    ).toBeLessThanOrEqual(
                        (dynamic ? SETTLE_SNAP : 0) +
                            TIME_EPSILON * Math.max(1, Math.abs(before[key]!))
                    )
                }

                let motion = Math.abs(moved[key]! - start[key]!)
                if (winner === null || zeroLength) {
                    motion = 0
                } else if (dynamic) {
                    const seed0 =
                        winner.startTime <= TIME_EPSILON ? velocity[key]! : 0
                    motion =
                        springDisplacementBound(
                            timing.opt,
                            start[key]!,
                            winner.node.props.to[key]!,
                            seed0,
                            dt
                        ) + SETTLE_SNAP
                    dynamicLanes++
                    if (Math.abs(seed0) > 1) movingDynamicLanes++
                }
                const bound =
                    Math.abs(start[key]! - before[key]!) + motion + JUMP_EPSILON
                expect(
                    Math.abs(first[key]! - before[key]!),
                    caseMessage(
                        seed,
                        `first frame key "${key}" (dt=${dt}, velocity=${velocity[key]})`
                    )
                ).toBeLessThanOrEqual(bound)
            }
        }

        // the sweep must really exercise mid-run interruptions and springs
        // that carry velocity, or the properties above would hold vacuously
        expect(interrupted, 'interrupted runs').toBeGreaterThan(CASES / 2)
        expect(dynamicLanes, 'dynamic spring lanes').toBeGreaterThan(20)
        expect(movingDynamicLanes, 'dynamic lanes moving').toBeGreaterThan(10)
    })
})
