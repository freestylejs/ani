import { describe, expect, it } from 'vitest'
import * as core from '~/index'
import * as a from '~/index'

// Names the public API keeps from before the V2 surface. The removed 1.x names
// are covered by the `mig3b_surface` acceptance test.
const KEPT_EXPORTS = [
    'BezierTimingFunction',
    'DynamicSpringTimingFunction',
    'LinearTimingFunction',
    'SpringTimingFunction',
    'TimingFunction',
    'compileToKeyframes',
    'createStates',
    'createStyleSheet',
    'normalizeRepeatCount',
    'rafTimeline',
    'toIterationCount',
    'waapiTimeline',
]

const NAMESPACE = [
    'ani',
    'createClock',
    'createStates',
    'delay',
    'loop',
    'parallel',
    'rafTimeline',
    'sequence',
    'stagger',
    'timing',
    'waapiTimeline',
]

describe('public api surface', () => {
    it('keeps the exports that are not part of the 1.x removal', () => {
        expect(Object.keys(core)).toEqual(expect.arrayContaining(KEPT_EXPORTS))
        expect(Object.keys(a)).toEqual(expect.arrayContaining(NAMESPACE))
    })

    it('exposes the clock factory', () => {
        expect(typeof core.createClock).toBe('function')
        expect(a.createClock).toBe(core.createClock)
    })

    it('exposes the shared binding helpers', () => {
        expect(typeof core.createTimelineController).toBe('function')
        expect(typeof core.createStyleSheet).toBe('function')
    })

    it('createClock returns an independent clock with a size', () => {
        const clock = core.createClock({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
            now: () => 0,
        })
        expect(clock).not.toBe(core.defaultClock)
        expect(clock.size).toBe(0)
        expect(typeof clock.subscribe).toBe('function')
        expect(typeof clock.unsubscribe).toBe('function')
    })

    it('createStates controllers expose dispose()', () => {
        const controller = a.createStates({
            initial: 'idle',
            initialValue: { x: 0 },
            states: { idle: a.ani({ to: { x: 1 }, duration: 1 }) },
            clock: core.createClock({
                requestFrame: () => 1,
                cancelFrame: () => undefined,
                now: () => 0,
            }),
        })
        expect(Object.keys(controller).sort()).toEqual(
            expect.arrayContaining([
                'dispose',
                'onTransition',
                'state',
                'timeline',
                'transitionTo',
            ])
        )
    })
})
