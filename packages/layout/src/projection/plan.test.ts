// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
    assignGroupStartTime,
    evaluatePlanBox,
    type NodePlan,
    planProgress,
    planVelocity,
    timelineNow,
} from './plan'

function animation(progress: number | undefined): Animation {
    return {
        effect: {
            getComputedTiming: () => ({ progress }),
        },
    } as unknown as Animation
}

function plan(overrides: Partial<NodePlan> = {}): NodePlan {
    return {
        element: document.createElement('div'),
        mode: 'position',
        before: { x: 0, y: 20, width: 10, height: 10 },
        after: { x: 0, y: 0, width: 10, height: 10 },
        dx: 0,
        dy: 20,
        sx: 1,
        sy: 1,
        originX: 0,
        originY: 0,
        durationMs: 200,
        startTime: 1000,
        easing: [0, 0.5, 1],
        animation: animation(0.5),
        ...overrides,
    }
}

describe('projection plan', () => {
    it('evaluates position at analytic progress', () => {
        const node = plan()
        expect(planProgress(node, 1100)).toBe(0.5)
        expect(evaluatePlanBox(node, 1100)).toEqual({
            x: 0,
            y: 10,
            width: 10,
            height: 10,
        })
    })

    it('evaluates box scale around an origin', () => {
        const node = plan({
            mode: 'box',
            before: { x: 0, y: 0, width: 20, height: 20 },
            after: { x: 0, y: 0, width: 10, height: 10 },
            dx: 0,
            dy: 0,
            sx: 2,
            sy: 2,
            originX: 5,
            originY: 5,
            animation: animation(0),
            easing: [0, 0.5, 1],
        })
        const start = evaluatePlanBox(node, 1000)
        expect(start.width).toBe(20)
        expect(start.height).toBe(20)
        const end = evaluatePlanBox({ ...node, animation: animation(1) }, 1200)
        expect(end.width).toBe(10)
        expect(end.height).toBe(10)
    })

    it('falls back to wall time and assigns a shared startTime', () => {
        const node = plan({ animation: animation(undefined) })
        expect(planProgress(node, 1050)).toBe(0.25)
        const first = { startTime: 0 } as unknown as Animation
        const second = { startTime: 0 } as unknown as Animation
        assignGroupStartTime([first, second], 123)
        expect(first.startTime).toBe(123)
        expect(second.startTime).toBe(123)
    })

    it('clamps progress outside the plan', () => {
        const node = plan({ animation: animation(undefined) })
        expect(planProgress(node, 0)).toBe(0)
        expect(planProgress(node, 5000)).toBe(1)
    })

    it('derives velocity from the retained easing', () => {
        const node = plan({ animation: animation(undefined) })
        expect(planVelocity(node, 1100, 'y')).toBeLessThan(0)
    })
})

describe('projection plan edge cases', () => {
    it('uses paused animation time and supports overshoot samples', () => {
        const animation = {
            playState: 'paused',
            currentTime: 100,
            effect: { getComputedTiming: () => ({ progress: 0.2 }) },
        } as unknown as Animation
        const node = plan({
            easing: [0, 0.25, 1.2, 1],
            animation,
        })
        expect(planProgress(node, 9999)).toBe(0.725)
        expect(
            evaluatePlanBox({ ...node, easing: [0, 1.2, 1] }, 1100).y
        ).toBeLessThan(0)
    })

    it('handles zero-duration and missing-easing plans', () => {
        const node = plan({
            durationMs: 0,
            easing: [0, 1],
            animation: animation(0.5),
        })
        expect(planProgress(node, 0)).toBe(1)
        const missing = plan({ easing: [], animation: animation(undefined) })
        expect(planProgress(missing, 1050)).toBe(0.25)
    })

    it('handles a throwing startTime setter', () => {
        const animation = {
            set startTime(_: number) {
                throw new Error('readonly')
            },
        } as unknown as Animation
        expect(() => assignGroupStartTime([animation], 5)).not.toThrow()
    })

    it('evaluates at explicit progress and reports timeline now', () => {
        const node = plan()
        const start = evaluatePlanBox(node, 1000)
        expect(start.y).toBe(20)
        const box = (
            evaluatePlanBox as unknown as (
                p: NodePlan,
                t: number
            ) => ReturnType<typeof evaluatePlanBox>
        )(node, 1100)
        expect(box.y).toBe(10)
        expect(timelineNow()).toBeGreaterThanOrEqual(0)
    })
})
