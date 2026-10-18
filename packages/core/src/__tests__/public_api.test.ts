import { describe, expect, it } from 'vitest'
import { rafTimeline } from '~/ani/raf'
import { webTimeline } from '~/ani/waapi'
import * as core from '~/index'
import { a } from '~/index'

// Names exported by v0 (before the hardening release). The public API may only
// grow: removing or renaming any of these is a breaking change.
const V0_EXPORTS = [
    'AnimationClock',
    'BezierTimingFunction',
    'DynamicSpringTimingFunction',
    'EventManager',
    'LinearTimingFunction',
    'RafAniTimeline',
    'SpringTimingFunction',
    'T',
    'TimelineBase',
    'TimingFunction',
    'WebAniTimeline',
    'a',
    'calculateSegmentState',
    'compileToKeyframes',
    'createStates',
    'createStyleSheet',
    'normalizeRepeatCount',
    'rafTimeline',
    'toIterationCount',
    'webTimeline',
]

const V0_NAMESPACE = [
    'ani',
    'createStates',
    'delay',
    'dynamicTimeline',
    'loop',
    'parallel',
    'rafTimeline',
    'sequence',
    'stagger',
    'timeline',
    'timing',
    'waapiTimeline',
    'webTimeline',
]

describe('public api aliases', () => {
    it('should expose explicit timeline engine aliases', () => {
        expect(a.dynamicTimeline).toBe(rafTimeline)
        expect(a.timeline).toBe(webTimeline)
        expect(a.rafTimeline).toBe(rafTimeline)
        expect(a.waapiTimeline).toBe(webTimeline)
        expect(a.webTimeline).toBe(webTimeline)
    })
})

describe('public api surface', () => {
    it('keeps every v0 export (additive-only)', () => {
        expect(Object.keys(core)).toEqual(expect.arrayContaining(V0_EXPORTS))
        expect(Object.keys(a)).toEqual(expect.arrayContaining(V0_NAMESPACE))
    })

    it('exposes the clock factory additively', () => {
        expect(typeof core.createClock).toBe('function')
        expect(a.createClock).toBe(core.createClock)
        expect(typeof core.AnimationClock.create).toBe('function')
        expect(typeof core.AnimationClock.configure).toBe('function')
        expect(typeof core.AnimationClock.reset).toBe('function')
    })

    it('exposes the shared binding helpers', () => {
        expect(typeof core.createTimelineController).toBe('function')
        expect(typeof core.applyStyleSheet).toBe('function')
    })

    it('createClock returns an independent clock with a size', () => {
        const clock = core.createClock({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
            now: () => 0,
        })
        expect(clock).not.toBe(core.AnimationClock.create())
        expect(clock.size).toBe(0)
        expect(typeof clock.subscribe).toBe('function')
        expect(typeof clock.unsubscribe).toBe('function')
    })

    it('createStates controllers expose dispose()', () => {
        const controller = a.createStates({
            initial: 'idle',
            initialFrom: { x: 0 },
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
                'onTimelineChange',
                'state',
                'timeline',
                'transitionTo',
            ])
        )
    })
})
