import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import type { ExecutionPlan, Groupable } from '~/ani/core/interface/core_types'
import { rafTimeline } from '~/ani/raf/timeline'
import { ani, parallel, SegmentNode, sequence } from '~/nodes'
import { TimingFunction, type TimingFunctionContext, timing } from '~/timing'
import { compileToKeyframes } from '../compiler'
import { waapiTimeline } from '../timeline'

class CountingLinear extends TimingFunction {
    public calls = 0
    public step(time: number, context: TimingFunctionContext) {
        this.calls++
        const progress = Math.min(time / context.duration, 1)
        return {
            value: context.from + (context.to - context.from) * progress,
            endOfAnimation: time >= context.duration,
        }
    }
}

const planOf = (node: { construct: (plan: any, start: number) => void }) => {
    const plan: ExecutionPlan<Groupable> = []
    node.construct(plan, 0)
    return plan
}

describe('compileToKeyframes scaling', () => {
    it('evaluates O(properties) per sample, not O(segments)', () => {
        const timing = new CountingLinear()
        const node = sequence(
            Array.from({ length: 200 }, (_, i) =>
                ani({ to: { x: i + 1 }, duration: 0.1, timing })
            )
        )
        const keyframes = compileToKeyframes(planOf(node), { x: 0 })
        // a custom timing forces sampling: ~7 samples per 0.1s segment
        expect(keyframes.length).toBeGreaterThan(1000)
        // old engine: every sample stepped every already-started segment
        expect(timing.calls).toBeLessThan(keyframes.length * 2)
    })

    it('does not overflow the stack on huge plans (Math.max spread)', () => {
        const plan: ExecutionPlan<Groupable> = []
        for (let i = 0; i < 150_000; i++) {
            plan.push({
                node: new SegmentNode({ to: { x: i }, duration: 1 }),
                startTime: 0,
                endTime: 1,
            })
        }
        const keyframes = compileToKeyframes(plan, { x: 0 })
        // later declaration wins for every tie
        expect(keyframes.at(-1)!.x).toBe(149_999)
    })
})

describe('compileToKeyframes parity with the raf engine', () => {
    it('treats a missing timing as linear next to a bezier segment', () => {
        const node = parallel([
            ani({ to: { x: 100 }, duration: 1, timing: timing.ease() }),
            ani({ to: { y: 100 }, duration: 1 }),
        ])
        const keyframes = compileToKeyframes(planOf(node), { x: 0, y: 0 })
        // one cubic-bezier easing for both would bend y; it must be sampled
        expect(keyframes.length).toBeGreaterThan(2)
        const mid = keyframes.find((k) => Math.abs(k.offset - 0.5) < 1e-9)!
        expect(mid.y).toBeCloseTo(50)
        const line = rafTimeline(node, { clock: new ManualClock() })
        line.play({ from: { x: 0, y: 0 } })
        line.seek(0.5)
        expect(Number(mid.x)).toBeCloseTo(line.value!.x!, 6)
    })

    it('still delegates a lone bezier segment to a cubic-bezier easing', () => {
        const keyframes = compileToKeyframes(
            planOf(ani({ to: { x: 100 }, duration: 1, timing: timing.ease() })),
            { x: 0 }
        )
        expect(keyframes).toHaveLength(2)
        expect(keyframes[0]!.easing).toMatch(/^cubic-bezier/)
    })

    it('dynamic springs are sampled with isolated, repeatable state', () => {
        const spring = timing.dynamicSpring({ m: 1, k: 100, c: 10 })
        const node = ani({ to: { x: 100 }, duration: 3, timing: spring })

        const clock = new ManualClock()
        const line = rafTimeline(node, { clock })
        line.play({ from: { x: 0 } })
        clock.run(15)
        const before = line.value!.x

        const first = compileToKeyframes(planOf(node), { x: 0 })
        const second = compileToKeyframes(planOf(node), { x: 0 })
        expect(second).toEqual(first)

        // compiling must not disturb the live run that shares the instance
        clock.run(15)
        const control = rafTimeline(node, { clock: new ManualClock() })
        control.play({ from: { x: 0 } })
        control.seek(0.5)
        expect(line.value!.x).toBeCloseTo(control.value!.x!, 8)
        expect(before).toBeLessThan(line.value!.x!)
    })
})

describe('WebAniTimeline', () => {
    let animations: Array<{ cancel: ReturnType<typeof vi.fn> }>

    beforeEach(() => {
        animations = []
        vi.stubGlobal(
            'KeyframeEffect',
            class {
                public constructor(
                    public target: unknown,
                    public keyframes: unknown,
                    public options: unknown
                ) {}
            }
        )
        vi.stubGlobal(
            'Animation',
            class {
                public play = vi.fn()
                public pause = vi.fn()
                public cancel = vi.fn()
                public commitStyles = vi.fn()
                public finished = new Promise<void>(() => undefined)
                public currentTime = null
                public constructor() {
                    animations.push(this)
                }
            }
        )
        vi.stubGlobal('document', { timeline: {} })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('compiles the same plan + from + resolver once', () => {
        const timing = new CountingLinear()
        const node = ani({ to: { x: 100 }, duration: 1, timing })
        const first = waapiTimeline(node)
        const target = {} as Element

        first.play(target, { from: { x: 0 } })
        const compiledCalls = timing.calls
        expect(compiledCalls).toBeGreaterThan(0)

        // repeated play(), and another timeline over the same node (e.g. one
        // per element), hit the cache
        first.play(target, { from: { x: 0 } })
        waapiTimeline(node).play(target, { from: { x: 0 } })
        expect(timing.calls).toBe(compiledCalls)

        // a different `from` or resolver must recompile
        first.play(target, { from: { x: 10 } })
        expect(timing.calls).toBeGreaterThan(compiledCalls)
    })

    it('keeps the running animation untouched behind a failing play()', () => {
        const timeline = waapiTimeline(ani({ to: { x: 1 }, duration: 1 }))
        timeline.play({} as Element, { from: { x: 0 } })
        expect(timeline.animations).toHaveLength(1)

        expect(() =>
            timeline.play({} as Element, { from: [0] as never })
        ).toThrow(TypeError)
        expect(timeline.animations).toHaveLength(1)
        expect(animations[0]!.cancel).not.toHaveBeenCalled()
    })
})
