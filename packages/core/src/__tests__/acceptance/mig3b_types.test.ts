import { describe, expect, it } from 'vitest'
import type { ExecutionPlan, ExecutionSegment } from '../../index'
import * as a from '../../index'
import { createManualClock } from '../../testing'

/** The type checker (`pnpm ts:typecheck`) asserts the imports and signatures. */
function planTypesAtTheSurface() {
    const node = a.ani({ to: { x: 1 }, duration: 1 })
    const plan: ExecutionPlan<{ x: number }> = []
    node.construct(plan, 0)
    const segment: ExecutionSegment<{ x: number }> = plan[0]!
    return { plan, segment }
}

/** Never called: the type checker (`pnpm ts:typecheck`) is the assertion. */
function removedAtTheTypeLevel() {
    const m = createManualClock()
    const n = a.ani({ to: { x: 1 }, duration: 1 })
    const line = a.rafTimeline(n, { clock: m.clock })
    const machine = a.createStates({
        initial: 'idle',
        initialValue: { x: 0 },
        states: { idle: n, active: n },
        clock: m.clock,
    })

    // @ts-expect-error removed: use `value`
    line.getCurrentValue()
    // @ts-expect-error removed: use `velocity`
    line.getCurrentVelocity()
    // @ts-expect-error removed: use `config`
    line.currentConfig
    // @ts-expect-error removed: use `{ ...config, interrupt }`
    line.play({ from: { x: 0 } }, false)
    // @ts-expect-error removed: `context` was never read
    line.play({ from: { x: 0 }, context: 1 })
    // @ts-expect-error removed: pass the resolver to `bind`
    line.play({ from: { x: 0 }, propertyResolver: () => ({}) })
    // @ts-expect-error removed: `reset()` takes no arguments
    line.reset(true)
    // @ts-expect-error removed: positional timing
    a.sequence([n], a.timing.linear())
    // @ts-expect-error removed: positional id
    a.ani({ to: { x: 1 }, duration: 1 }, 'id')
    // @ts-expect-error removed: positional id
    a.delay(1, 'id')
    // @ts-expect-error removed: positional offset
    a.stagger([n], 0.1)
    // @ts-expect-error removed: pass `{ clock }`
    a.rafTimeline(n, m.clock)
    // @ts-expect-error removed: use `onTransition`
    machine.onTimelineChange
    // @ts-expect-error removed: use `{ ...config, interrupt }`
    machine.transitionTo('active', {}, false)
    const legacy = {
        initial: 'idle' as const,
        initialFrom: { x: 0 },
        states: { idle: n },
    }
    // @ts-expect-error removed: use `initialValue`
    a.createStates(legacy)
    // @ts-expect-error removed: use `import * as a`
    a.a
    // @ts-expect-error removed: use `timing`
    a.T
    // @ts-expect-error removed: use `waapiTimeline`
    a.webTimeline
    // @ts-expect-error removed: use `defaultClock` / `createClock`
    a.AnimationClock
    // @ts-expect-error removed: use the `RafTimeline` interface
    a.RafAniTimeline
    // @ts-expect-error removed: use `configure`
    m.clock.setTiming
}

describe('MIG3b: removed APIs do not type-check', () => {
    it('T1: the type-only block exists (checked by tsc)', () => {
        expect(typeof removedAtTheTypeLevel).toBe('function')
    })

    it('T2: the plan input types and compiler are exported', () => {
        const { plan, segment } = planTypesAtTheSurface()
        expect(segment.startTime).toBe(0)
        expect(a.compileToKeyframes(plan, { x: 0 }).length).toBeGreaterThan(0)
    })
})
