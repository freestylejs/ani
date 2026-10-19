import { describe, expect, it } from 'vitest'
import * as a from '../../index'
import { isRafTimeline, TimingFunction } from '../../index'
import { createManualClock } from '../../testing'

const builders = [
    'ani',
    'delay',
    'loop',
    'parallel',
    'sequence',
    'stagger',
    'rafTimeline',
    'waapiTimeline',
    'rafGroup',
    'follow',
    'createStates',
    'createClock',
] as const

describe('MIG3a: `import * as a` covers every 1.x `a.<name>` call site', () => {
    it('N1: every builder is a named export of the root entry', () => {
        const ns = a as unknown as Record<string, unknown>
        for (const name of builders) {
            expect(typeof ns[name], name).toBe('function')
        }
    })

    it('N2: `timing` is a named export with every preset', () => {
        const presets = [
            a.timing.linear(),
            a.timing.ease(),
            a.timing.easeIn(),
            a.timing.easeOut(),
            a.timing.easeInOut(),
            a.timing.bezier({ p2: { x: 0.25, y: 0.1 }, p3: { x: 0.25, y: 1 } }),
            a.timing.spring({ m: 1, k: 320, c: 34 }),
            a.timing.dynamicSpring({ m: 1, k: 320, c: 34 }),
        ]
        for (const preset of presets) {
            expect(preset).toBeInstanceOf(TimingFunction)
        }
    })

    it('N3: a tree built through the namespace plays on a RAF timeline', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const tree = a.sequence([
            a.ani({ to: { x: 100 }, duration: 0.5, timing: a.timing.linear() }),
            a.ani({ to: { x: 50 }, duration: 0.5, timing: a.timing.linear() }),
        ])
        const line = a.rafTimeline(tree, { clock: m.clock })
        line.play({ from: { x: 0 } })
        m.frames(80, 16)
        expect(line.value).toEqual({ x: 50 })
        line.dispose()
    })

    it('N4: `waapiTimeline` creates a WAAPI timeline, not a RAF one', () => {
        const line = a.waapiTimeline(
            a.ani({ to: { x: 1 }, duration: 1, timing: a.timing.linear() })
        )
        expect(isRafTimeline(line)).toBe(false)
        expect(typeof line.play).toBe('function')
    })

    it('N5: `defaultClock` is exported and has an instance `configure`', () => {
        expect(typeof a.defaultClock.configure).toBe('function')
    })
})
