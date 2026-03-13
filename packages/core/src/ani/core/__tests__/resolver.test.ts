import { describe, expect, it } from 'vitest'
import { ani, sequence } from '~/nodes'
import type { TimingFunction } from '~/timing'
import {
    compileResolvedPlan,
    resolveCompiledPlanState,
    resolveGroup,
    resolvePlanState,
} from '../resolver'

describe('compiled resolver', () => {
    it('should preserve user-provided timing instances in compiled array segments', () => {
        const timing = {
            step: () => ({ value: 1, endOfAnimation: false }),
        } as unknown as TimingFunction
        const root = sequence([ani({ to: [10], duration: 1, timing })])
        const plan: any[] = []

        root.construct(plan, 0)
        const compiled = compileResolvedPlan(plan, null)

        expect(compiled.segments[0]!.timings[0]).toBe(timing)
    })

    it('should preserve user-provided timing instances in compiled record segments', () => {
        const timing = {
            x: {
                step: () => ({ value: 1, endOfAnimation: false }),
            } as unknown as TimingFunction,
        }
        const root = sequence([ani({ to: { x: 10 }, duration: 1, timing })])
        const plan: any[] = []

        root.construct(plan, 0)
        const { keyMap } = resolveGroup({ x: 0 })
        const compiled = compileResolvedPlan(plan, keyMap)

        expect(compiled.segments[0]!.timings[0]).toBe(timing.x)
    })

    it('should resolve compiled plan states identically to the legacy resolver', () => {
        const root = sequence([
            ani({ to: { x: 100, y: 50 }, duration: 1 }),
            ani({ to: { y: 200 }, duration: 1 }),
            ani({ to: { x: 0 }, duration: 1 }),
        ])
        const plan: any[] = []

        root.construct(plan, 0)
        const { keyMap, values } = resolveGroup({ x: 0, y: 0 })
        const compiled = compileResolvedPlan(plan, keyMap)

        const legacy = resolvePlanState(plan, values, keyMap, 1.5, 1 / 60)
        const optimized = resolveCompiledPlanState(
            compiled,
            values,
            1.5,
            1 / 60
        )

        expect(optimized).toEqual(legacy)
    })
})
