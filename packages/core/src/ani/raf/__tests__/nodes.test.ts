import { describe, expect, it, vi } from 'vitest'
import {
    type AnimationNode,
    ani,
    delay,
    parallel,
    sequence,
    stagger,
} from '~/nodes'
import { type TimingFunction, timing } from '~/timing'
import { rafTimeline } from '../timeline'

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
            const node = ani({
                to: [1],
                duration: 1,
                timing,
                id: 'my-anim',
            })
            expect(node.id).toBe('my-anim')
            expect(node.props.timing).toBe(timing)
        })
    })

    describe('delay()', () => {
        it('should create a SegmentNode with an empty `to` and correct duration', () => {
            const node = delay(1.5, { id: 'my-delay' })
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

        it('should not mutate reused child compositions when parent timing is provided', () => {
            const reused = sequence([ani({ to: [1], duration: 1 })])

            const parentTiming = {
                step: () => ({ value: 0, endOfAnimation: false }),
            } as unknown as TimingFunction

            // Applies timing inheritance to a tree that includes `reused`.
            sequence([reused], { timing: parentTiming })

            // Reusing the same child composition in a new tree should stay unmodified.
            const plainParent = sequence([reused])
            const plan: any[] = []
            plainParent.construct(plan, 0)

            expect(plan[0]!.node.props.timing).toBeUndefined()
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

    describe('input validation', () => {
        it.each([
            Number.NaN,
            -1,
            Number.POSITIVE_INFINITY,
        ])('ani() rejects duration %s with a RangeError', (duration) => {
            expect(() => ani({ to: [1], duration })).toThrow(RangeError)
        })

        it('delay() rejects non-finite / negative durations', () => {
            expect(() => delay(Number.POSITIVE_INFINITY)).toThrow(RangeError)
            expect(() => delay(-0.5)).toThrow(RangeError)
            expect(delay(0).duration).toBe(0)
        })

        it.each([
            Number.NaN,
            -0.1,
            Number.POSITIVE_INFINITY,
        ])('stagger() rejects offset %s', (offset) => {
            expect(() =>
                stagger([ani({ to: [1], duration: 1 })], { offset: offset })
            ).toThrow(RangeError)
        })
    })

    describe('parallel() same-key resolution', () => {
        const line = (root: AnimationNode<any>, from: any) => {
            const timeline = rafTimeline(root)
            timeline.play({ from })
            return timeline
        }

        it('keeps a trailing delay: timeline duration equals node duration', () => {
            const par = parallel([
                ani({ to: { x: 10 }, duration: 1 }),
                delay(2),
            ])
            expect(par.duration).toBe(2)
            expect(rafTimeline(par).duration).toBe(2)
        })

        it('keeps the duration of a fully overridden segment', () => {
            const par = parallel([
                ani({ to: { x: 10 }, duration: 3, timing: timing.linear() }),
                ani({ to: { x: 50 }, duration: 1, timing: timing.linear() }),
            ])
            const timeline = line(par, { x: 0 })

            expect(timeline.duration).toBe(par.duration)
            expect(timeline.duration).toBe(3)

            timeline.seek(0.5)
            expect(timeline.value).toEqual({ x: 25 })
            timeline.seek(2)
            expect(timeline.value).toEqual({ x: 50 })
        })

        it('only strips the overridden keys of earlier segments', () => {
            const par = parallel([
                ani({
                    to: { x: 10, y: 20 },
                    duration: 1,
                    timing: timing.linear(),
                }),
                ani({ to: { x: 5 }, duration: 1, timing: timing.linear() }),
            ])
            const timeline = line(par, { x: 0, y: 0 })
            timeline.seek(1)
            expect(timeline.value).toEqual({ x: 5, y: 20 })
        })

        it('does not rebuild segments that have no conflicts and keeps ids', () => {
            const a = ani({ to: { x: 1 }, duration: 1, id: 'a' })
            const b = ani({ to: { y: 1 }, duration: 1, id: 'b' })
            const par = parallel([a, b])
            expect(par.children[0]).toBe(a)
            expect(par.children[1]).toBe(b)

            const overridden = parallel([
                ani({ to: { x: 1 }, duration: 1, id: 'first' }),
                ani({ to: { x: 2 }, duration: 2, id: 'second' }),
            ])
            expect(overridden.children.map((c) => c.id)).toEqual([
                'first',
                'second',
            ])
        })

        it('scales to very large child counts (no spread stack overflow)', () => {
            const children = Array.from({ length: 200_000 }, (_, i) =>
                ani({ to: [i], duration: 1 + (i % 3) })
            )
            expect(parallel(children).duration).toBe(3)
            expect(stagger(children, { offset: 0 }).duration).toBe(3)
        })
    })

    describe('composition timing inheritance', () => {
        it('shares subtrees that do not change instead of cloning them', () => {
            const nested = sequence([ani({ to: [1], duration: 1 })])
            const outer = sequence([nested])
            expect(outer.children[0]).toBe(nested)
        })

        it('keeps ids, types and durations of cloned nodes', () => {
            const segment = ani({ to: [1], duration: 1, id: 'seg' })
            const nested = sequence([segment], { id: 'nested' })
            const outer = sequence([nested], {
                timing: timing.linear(),
                id: 'outer',
            })

            const clonedNested = outer.children[0] as typeof nested
            expect(clonedNested).not.toBe(nested)
            expect(clonedNested.id).toBe('nested')
            expect(clonedNested.type).toBe('SEQUENCE')
            expect(clonedNested.duration).toBe(1)
            expect(clonedNested.children[0]!.id).toBe('seg')
            expect(outer.id).toBe('outer')
            // original untouched
            expect(segment.props.timing).toBeUndefined()
        })
    })
})
