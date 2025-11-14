import { describe, expect, it, vi } from 'vitest'
import type { TimingFunction } from '~/timing'
import {
    type AnimationNode,
    ani,
    delay,
    parallel,
    sequence,
    stagger,
} from '../nodes'

describe('Animation Nodes & Compositors', () => {
    describe('animate()', () => {
        it('should create a SegmentNode with correct properties', () => {
            const node = ani({ to: { x: 100 }, duration: 2 })
            expect(node.type).toBe('SEGMENT')
            expect(node.duration).toBe(2)
            expect(node.props.to).toEqual({ x: 100 })
        })

        it('should handle optional id and timing properties', () => {
            const timing = {
                step: () => ({ value: 0, endOfAnimation: true }),
            } as unknown as TimingFunction
            const node = ani(
                {
                    to: [1],
                    duration: 1,
                    timing,
                },
                'my-anim'
            )
            expect(node.id).toBe('my-anim')
            expect(node.props.timing).toBe(timing)
        })
    })

    describe('delay()', () => {
        it('should create a SegmentNode with an empty `to` and correct duration', () => {
            const node = delay(1.5, 'my-delay')
            expect(node.type).toBe('SEGMENT')
            expect(node.duration).toBe(1.5)
            expect(node.props.to).toEqual({})
            expect(node.id).toBe('my-delay')
        })
    })

    describe('sequence()', () => {
        it('should calculate duration as the sum of its children', () => {
            const seq = sequence([
                ani({ to: [1], duration: 1 }),
                ani({ to: [1], duration: 2 }),
            ])
            expect(seq.duration).toBe(3)
        })

        it('should have a duration of 0 for no children', () => {
            const seq = sequence([])
            expect(seq.duration).toBe(0)
        })

        it('should compile children sequentially', () => {
            const child1 = ani({ to: [1], duration: 1 })
            const child2 = ani({ to: [1], duration: 2 })
            const mockCompile1 = vi.spyOn(child1, 'construct')
            const mockCompile2 = vi.spyOn(child2, 'construct')
            const seq = sequence([child1, child2])
            const plan: any[] = []
            seq.construct(plan, 0)
            expect(mockCompile1).toHaveBeenCalledWith(plan, 0)
            expect(mockCompile2).toHaveBeenCalledWith(plan, 1) // 0 + duration of child1
        })
    })

    describe('parallel()', () => {
        it('should calculate duration as the max of its children', () => {
            const par = parallel([
                ani({ to: [1], duration: 1 }),
                ani({ to: [1], duration: 3 }),
            ])
            expect(par.duration).toBe(3)
        })

        it('should have a duration of 0 for no children', () => {
            const par = parallel([])
            expect(par.duration).toBe(0)
        })

        it('should compile children in parallel', () => {
            const child1 = ani({ to: [1], duration: 1 })
            const child2 = ani({ to: [1], duration: 2 })
            const mockCompile1 = vi.spyOn(child1, 'construct')
            const mockCompile2 = vi.spyOn(child2, 'construct')
            const par = parallel([child1, child2])
            const plan: any[] = []
            par.construct(plan, 5) // Start at arbitrary time 5
            expect(mockCompile1).toHaveBeenCalledWith(plan, 5) // Starts at the same time
            expect(mockCompile2).toHaveBeenCalledWith(plan, 5) // Starts at the same time
        })
    })

    describe('stagger()', () => {
        it('should calculate duration correctly', () => {
            const children: AnimationNode<number[]>[] = [
                ani({ to: [1], duration: 1 }), // ends at 0 + 1 = 1
                ani({ to: [1], duration: 1 }), // ends at 0.5 + 1 = 1.5
                ani({ to: [1], duration: 2 }), // ends at 1.0 + 2 = 3.0
            ]
            const stag = stagger(children, { offset: 0.5 })
            // Total duration = (2 * 0.5) + 2 = 3
            expect(stag.duration).toBe(3)
        })

        it('should compile children with a stagger offset', () => {
            const child1 = ani({ to: [1], duration: 1 })
            const child2 = ani({ to: [1], duration: 2 })
            const mockCompile1 = vi.spyOn(child1, 'construct')
            const mockCompile2 = vi.spyOn(child2, 'construct')
            const stag = stagger([child1, child2], { offset: 0.5 })
            const plan: any[] = []
            stag.construct(plan, 0)
            expect(mockCompile1).toHaveBeenCalledWith(plan, 0)
            expect(mockCompile2).toHaveBeenCalledWith(plan, 0.5) // 0 + offset
        })
    })
})
