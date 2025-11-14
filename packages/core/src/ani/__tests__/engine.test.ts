import { describe, expect, it, vi } from 'vitest'
import { T, type TimingFunction } from '~/timing'
import { calculateSegmentState } from '../engine'

describe('calculateSegmentState', () => {
    it('should correctly interpolate a single value', () => {
        const segment = {
            from: [0],
            to: [100],
            duration: 1,
            timing: T.linear(),
        }
        expect(calculateSegmentState(0, segment).values).toEqual([0])
        expect(calculateSegmentState(0.5, segment).values).toEqual([50])
        expect(calculateSegmentState(1, segment).values).toEqual([100])
    })

    it('should correctly interpolate multiple values', () => {
        const segment = {
            from: [0, 10],
            to: [100, -10],
            duration: 1,
            timing: T.linear(),
        }
        expect(calculateSegmentState(0.5, segment).values).toEqual([50, 0])
    })

    it('should clamp time values outside the duration range', () => {
        const segment = {
            from: [0],
            to: [100],
            duration: 1,
            timing: T.linear(),
        }
        expect(calculateSegmentState(-1, segment).values).toEqual([0])
        expect(calculateSegmentState(2, segment).values).toEqual([100])
    })

    it('should handle zero duration correctly', () => {
        const segment = {
            from: [0],
            to: [100],
            duration: 0,
            timing: T.linear(),
        }
        expect(calculateSegmentState(0, segment).values).toEqual([100])
        expect(calculateSegmentState(1, segment).values).toEqual([100])
    })

    it('should report isComplete correctly', () => {
        const segment = {
            from: [0],
            to: [100],
            duration: 1,
            timing: T.linear(),
        }
        expect(calculateSegmentState(0.5, segment).isComplete).toBe(false)
        expect(calculateSegmentState(1, segment).isComplete).toBe(true)
        expect(calculateSegmentState(2, segment).isComplete).toBe(true)
    })

    it('should use a custom timing function', () => {
        const mockTiming: TimingFunction = {
            step: vi.fn().mockReturnValue({ value: 42, endOfAnimation: false }),
        } as unknown as TimingFunction
        const segment = {
            from: [0],
            to: [100],
            duration: 1,
            timing: mockTiming,
        }
        const result = calculateSegmentState(0.5, segment)
        expect(mockTiming.step).toHaveBeenCalled()
        expect(result.values).toEqual([42])
    })

    it('should use multiple timing functions for multiple values', () => {
        const timing1: TimingFunction = {
            step: () => ({ value: 10, endOfAnimation: true }),
        } as unknown as TimingFunction
        const timing2: TimingFunction = {
            step: () => ({ value: 20, endOfAnimation: true }),
        } as unknown as TimingFunction
        const segment = {
            from: [0, 0],
            to: [100, 100],
            duration: 1,
            timing: [timing1, timing2],
        }
        expect(calculateSegmentState(0.5, segment).values).toEqual([10, 20])
    })
})
