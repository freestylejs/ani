import { describe, expect, it } from 'vitest'
import type { ExecutionPlan, Groupable } from '~/ani/core'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import { rafTimeline } from '~/ani/raf/timeline'
import { compileToKeyframes } from '~/ani/waapi/compiler'
import { caseMessage, generateTree, mulberry32 } from './gen'
import { snapshot, sortedPlan } from './helpers'

/**
 * P5: compile purity. `compileToKeyframes` is a pure read of the plan: two
 * compiles of the same plan produce deep-equal keyframes, a freshly built
 * equivalent plan compiles to the same output, and compiling never perturbs a
 * live RAF run that shares the tree (and therefore the timing instances).
 */

const CASES = 200
const BASE_SEED = 0xa45001
const FRAME = 1 / 60

describe('P5: compile purity', () => {
    it('recompiles identically and leaves shared live runs untouched (200 trees)', () => {
        for (let i = 0; i < CASES; i++) {
            const seed = BASE_SEED + i
            const rng = mulberry32(seed)
            const { node, keys, from } = generateTree(rng)
            const plan = sortedPlan(node) as ExecutionPlan<Groupable>

            // 1. compiling the same plan twice is deep-equal (the second pass
            //    reuses the cached compiled plan)
            const first = compileToKeyframes(plan, from)
            const second = compileToKeyframes(plan, from)
            expect(
                second,
                caseMessage(seed, 'second compile of the same plan')
            ).toEqual(first)

            // 2. a freshly reconstructed plan compiles to the same keyframes
            const fresh = compileToKeyframes(
                sortedPlan(node) as ExecutionPlan<Groupable>,
                from
            )
            expect(
                fresh,
                caseMessage(seed, 'compile of a freshly built plan')
            ).toEqual(first)

            // 3. a live run sharing the timing instances is not disturbed.
            //    The control is rebuilt from the same seed, so it equals the
            //    tree but shares no node or timing instance with the line (or
            //    with the compiled plan); compiling between every frame must
            //    not make the line drift from it.
            const clock = new ManualClock()
            const line = rafTimeline(node, { clock })
            line.play({ from })
            const controlClock = new ManualClock()
            const control = rafTimeline(generateTree(mulberry32(seed)).node, {
                clock: controlClock,
            })
            control.play({ from })

            const framesBefore = rng.int(2, 8)
            for (let frame = 0; frame < framesBefore; frame++) {
                clock.tick(FRAME)
                controlClock.tick(FRAME)
            }

            const framesAfter = rng.int(4, 16)
            for (let frame = 0; frame < framesAfter; frame++) {
                compileToKeyframes(plan, from)
                clock.tick(FRAME)
                controlClock.tick(FRAME)
                const actual = snapshot(line.value!)
                const expected = snapshot(control.value!)
                for (const key of keys) {
                    expect(
                        actual[key]!,
                        caseMessage(
                            seed,
                            `key "${key}" at frame ${framesBefore + frame}`
                        )
                    ).toBe(expected[key]!)
                }
            }
        }
    })
})
