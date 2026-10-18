import { describe, expect, it, vi } from 'vitest'
import type { ExecutionPlan } from '~/ani/core'
import { buildPlan } from '~/ani/core/plan_builder'
import { loopEnd, planLoops } from '~/ani/core/plan_state'
import { ani, loop, parallel, sequence } from '~/nodes'

describe('LoopNode', () => {
    it('should calculate duration as child duration multiplied by count', () => {
        const child = ani({ to: [1], duration: 1.5 })
        const looped = loop(child, 3)
        expect(looped.duration).toBe(4.5)
    })

    it('should have a duration of 0 if the child has 0 duration', () => {
        const child = ani({ to: [1], duration: 0 })
        const looped = loop(child, 10)
        expect(looped.duration).toBe(0)
    })

    it('should have a duration of 0 if the count is 0', () => {
        const child = ani({ to: [1], duration: 1.5 })
        const looped = loop(child, 0)
        expect(looped.duration).toBe(0)
    })

    it('should have a duration of 0 for an endless loop of a zero-length child', () => {
        const child = ani({ to: [1], duration: 0 })
        expect(loop(child, Infinity).duration).toBe(0)
        expect(loop(child, Infinity).footprint.endless.size).toBe(0)
    })

    it('should construct a small loop count times', () => {
        const child = ani({ to: [1], duration: 2 })
        const mockConstruct = vi.spyOn(child, 'construct')
        const looped = loop(child, 3)
        const plan: any[] = []
        looped.construct(plan, 0)

        expect(mockConstruct).toHaveBeenCalledTimes(3)
        expect(planLoops(plan)).toHaveLength(0)
    })

    it('should construct a large loop three times, however large the count', () => {
        const child = ani({ to: [1], duration: 2 })
        const mockConstruct = vi.spyOn(child, 'construct')
        const plan: ExecutionPlan<number[]> = []
        loop(child, 1_000_000).construct(plan, 0)

        expect(mockConstruct).toHaveBeenCalledTimes(3)
        expect(plan.map((segment) => segment.startTime)).toEqual([0, 2, 4])
        const [region] = planLoops(plan)
        expect(region).toMatchObject({ startTime: 0, period: 2, count: 1e6 })
        expect(loopEnd(region!)).toBe(2e6)
    })

    it('should construct an endless loop three times', () => {
        const child = ani({ to: [1], duration: 2 })
        const mockConstruct = vi.spyOn(child, 'construct')
        const plan: ExecutionPlan<number[]> = []
        loop(child, Infinity).construct(plan, 0)

        expect(mockConstruct).toHaveBeenCalledTimes(3)
        expect(loopEnd(planLoops(plan)[0]!)).toBe(Infinity)
    })

    it('should construct a loop of an endless child once', () => {
        const inner = loop(ani({ to: [1], duration: 1 }), Infinity)
        const outer = loop(inner, 5)
        const plan: ExecutionPlan<number[]> = []
        outer.construct(plan, 0)

        expect(outer.duration).toBe(Infinity)
        expect(plan).toHaveLength(3)
        expect(planLoops(plan)).toHaveLength(1)
    })

    it('should construct nothing for a count of 0 and keep the slots', () => {
        const none = loop(ani({ to: { x: 1 }, duration: 1 }), 0)
        const root = sequence([none, ani({ to: { x: 2 }, duration: 1 })])
        const built = buildPlan(root)

        expect(built.plan).toHaveLength(1)
        expect(built.slotCount).toBe(2)
    })

    it('should construct children sequentially with correct start times', () => {
        const child = ani({ to: [1], duration: 2 })
        const mockConstruct = vi.spyOn(child, 'construct')
        const looped = loop(child, 3)
        const plan: any[] = []
        looped.construct(plan, 5) // Start at arbitrary time 5

        expect(mockConstruct).toHaveBeenCalledWith(plan, 5) // 5 + 0 * 2
        expect(mockConstruct).toHaveBeenCalledWith(plan, 7) // 5 + 1 * 2
        expect(mockConstruct).toHaveBeenCalledWith(plan, 9) // 5 + 2 * 2
    })

    it('should work correctly inside another composition node', () => {
        const bounce = sequence([
            ani({ to: { y: -10 }, duration: 0.5 }),
            ani({ to: { y: 0 }, duration: 0.5 }),
        ]) // 1s duration

        const full = sequence([
            ani({ to: { opacity: 1 }, duration: 1 }),
            loop(bounce, 3), // 3s duration
            ani({ to: { opacity: 0 }, duration: 1 }),
        ])

        expect(full.duration).toBe(5)
    })

    describe('input validation', () => {
        it.each([
            Number.NaN,
            -1,
            -Infinity,
            2.5,
        ])('rejects loopCount %s with a descriptive RangeError', (count) => {
            const child = ani({ to: [1], duration: 1 })
            expect(() => loop(child, count)).toThrow(RangeError)
            expect(() => loop(child, count)).toThrow(/loopCount/)
        })

        it('accepts Infinity', () => {
            const looped = loop(ani({ to: [1], duration: 1 }), Infinity)
            expect(looped.duration).toBe(Infinity)
            expect(looped.count).toBe(Infinity)
        })

        it('still accepts large finite integer counts', () => {
            const looped = loop(ani({ to: [1], duration: 1 }), 10_000)
            expect(looped.duration).toBe(10_000)
        })
    })

    describe('endless loops in compositions', () => {
        const endless = () => loop(ani({ to: { x: 1 }, duration: 1 }), Infinity)

        it('makes every container that holds it in time endless', () => {
            expect(sequence([endless()]).duration).toBe(Infinity)
            expect(
                parallel([endless(), ani({ to: { y: 1 }, duration: 1 })])
                    .duration
            ).toBe(Infinity)
        })

        it('rejects a sequence child after an endless one as unreachable', () => {
            expect(() =>
                sequence([endless(), ani({ to: { y: 1 }, duration: 1 })])
            ).toThrow(/unreachable/)
        })

        it('rejects an endless loop sharing a property with a sibling', () => {
            expect(() =>
                parallel([endless(), ani({ to: { x: 5 }, duration: 3 })])
            ).toThrow(/"x"/)
        })

        it('allows a sibling that finished before the loop starts', () => {
            expect(() =>
                sequence([
                    parallel([
                        ani({ to: { x: 5 }, duration: 1 }),
                        ani({ to: { y: 5 }, duration: 2 }),
                    ]),
                    endless(),
                ])
            ).not.toThrow()
        })

        it('allows two endless loops on different properties', () => {
            expect(() =>
                parallel([
                    endless(),
                    loop(ani({ to: { y: 1 }, duration: 1 }), Infinity),
                ])
            ).not.toThrow()
        })

        it('rejects two endless loops on the same property', () => {
            expect(() => parallel([endless(), endless()])).toThrow(RangeError)
        })
    })
})
