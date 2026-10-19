import { describe, expect, it } from 'vitest'
import * as core from '../../index'
import * as testing from '../../testing'

const removed = [
    'a',
    'T',
    'webTimeline',
    'dynamicTimeline',
    'EventManager',
    'AnimationClock',
    'RafAniTimeline',
    'WebAniTimeline',
    'TimelineBase',
    'PlanRuntime',
    'AnimationNode',
    'CompositionNode',
    'SegmentNode',
    'SequenceNode',
    'ParallelNode',
    'StaggerNode',
    'LoopNode',
    'calculateSegmentState',
    'applyStyleSheet',
] as const

const kept = [
    'ani',
    'delay',
    'loop',
    'parallel',
    'sequence',
    'stagger',
    'timing',
    'rafTimeline',
    'waapiTimeline',
    'rafGroup',
    'follow',
    'createStates',
    'createClock',
    'defaultClock',
    'isRafTimeline',
    'isWaapiTimeline',
    'createStyleSheet',
    'createTimelineController',
    'TimingFunction',
] as const

describe('MIG3b: the 1.x surface is gone from the root entry', () => {
    it('R1: removed names are not exported', () => {
        const ns = core as unknown as Record<string, unknown>
        const left = removed.filter((name) => ns[name] !== undefined)
        expect(left).toEqual([])
    })

    it('R2: the V2 surface is exported', () => {
        const ns = core as unknown as Record<string, unknown>
        const missing = kept.filter((name) => ns[name] === undefined)
        expect(missing).toEqual([])
    })

    it('R3: the testing entry keeps its helpers', () => {
        expect(typeof testing.createManualClock).toBe('function')
        expect(typeof testing.resetDefaultClock).toBe('function')
        expect(() => testing.resetDefaultClock()).not.toThrow()
    })

    it('R4: removed members are gone from the instances', () => {
        const m = testing.createManualClock()
        const node = core.ani({
            to: { x: 1 },
            duration: 1,
            timing: core.timing.linear(),
        })
        const line = core.rafTimeline(node, { clock: m.clock })
        for (const name of [
            'getCurrentValue',
            'getCurrentVelocity',
            'currentConfig',
        ]) {
            expect(name in line, name).toBe(false)
        }
        const machine = core.createStates({
            initial: 'idle',
            initialValue: { x: 0 },
            states: { idle: node },
            clock: m.clock,
        })
        expect('onTimelineChange' in machine).toBe(false)
        expect('setTiming' in m.clock).toBe(false)
        expect('setTiming' in core.defaultClock).toBe(false)
        const spring = core.timing.dynamicSpring({ m: 1, k: 100, c: 10 })
        expect('init' in spring).toBe(false)
        expect('reset' in spring).toBe(false)
        line.dispose()
        machine.dispose()
    })

    it('R5: isWaapiTimeline tells the engines apart', () => {
        const node = core.ani({
            to: { x: 1 },
            duration: 1,
            timing: core.timing.linear(),
        })
        const waapi = core.waapiTimeline(node)
        const raf = core.rafTimeline(node, {
            clock: testing.createManualClock().clock,
        })
        expect(core.isWaapiTimeline(waapi)).toBe(true)
        expect(core.isWaapiTimeline(raf)).toBe(false)
        expect(core.isRafTimeline(waapi)).toBe(false)
        for (const value of [null, undefined, {}, 1]) {
            expect(core.isWaapiTimeline(value)).toBe(false)
        }
        raf.dispose()
    })
})
