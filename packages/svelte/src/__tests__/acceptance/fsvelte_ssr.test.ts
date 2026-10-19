// @vitest-environment node

import * as a from '@freestylejs/ani-core'
import { rafGroup, rafTimeline } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../../core/src/testing'
import * as api from '../../index'
import {
    useAni,
    useAniGroup,
    useAniRef,
    useAniStates,
    useFollow,
    useTimeline,
} from '../../index'

const scope = vi.hoisted(() => ({ destroyers: [] as Array<() => void> }))

vi.mock('svelte', async (importOriginal) => ({
    ...(await importOriginal<typeof import('svelte')>()),
    onDestroy: (callback: () => void) => {
        scope.destroyers.push(callback)
    },
}))

const linear = a.timing.linear()
const node = () => a.ani({ to: { opacity: 1 }, duration: 1, timing: linear })

describe('FSVELTE: the public surface and server rendering', () => {
    beforeEach(() => {
        scope.destroyers.length = 0
    })
    afterEach(() => {
        scope.destroyers.length = 0
    })

    it('P1: the V2 primitives are exported', () => {
        for (const name of [
            'useTimeline',
            'useAni',
            'useAniRef',
            'useAniGroup',
            'useAniStates',
            'useFollow',
        ]) {
            expect(typeof (api as Record<string, unknown>)[name]).toBe(
                'function'
            )
        }
    })

    it('P2: there is no DOM here', () => {
        expect(typeof window).toBe('undefined')
        expect(typeof document).toBe('undefined')
    })

    it('P3: useAniRef renders the initial style and subscribes to nothing', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const timeline = rafTimeline(node(), { clock: m.clock })
        const bind = vi.spyOn(timeline, 'bind')
        const onUpdate = vi.spyOn(timeline, 'onUpdate')
        const { style, action } = useAniRef(timeline, {
            initialValue: { opacity: 0.25 },
        })
        expect(style).toBe('opacity: 0.25')
        expect(typeof action).toBe('function')
        expect(bind).not.toHaveBeenCalled()
        expect(onUpdate).not.toHaveBeenCalled()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('P4: useAniRef renders transform and custom properties', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const timeline = rafTimeline(
            a.ani({
                to: { translateX: 10, x: 1 },
                duration: 1,
                timing: linear,
            }),
            { clock: m.clock }
        )
        const { style } = useAniRef(timeline, {
            initialValue: { translateX: 0, x: 1 },
            resolver: { x: (v: number) => ({ key: '--x', value: `${v}px` }) },
        })
        const parts = String(style)
            .split(';')
            .map((part) => part.trim())
            .sort()
        expect(parts).toEqual(['--x: 1px', 'transform: translateX(0px)'])
    })

    it('P5: useAniGroup renders the initial style and subscribes to nothing', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const group = rafGroup(node(), { clock: m.clock })
        const bindAt = vi.spyOn(group, 'bindAt')
        const onUpdate = vi.spyOn(group, 'onUpdate')
        const { style, action } = useAniGroup(group, {
            initialValue: { opacity: 0 },
        })
        expect(style).toBe('opacity: 0')
        expect(typeof action).toBe('function')
        expect(bindAt).not.toHaveBeenCalled()
        expect(onUpdate).not.toHaveBeenCalled()
        expect(m.clock.size).toBe(0)
    })

    it('P6: useAniStates renders the initial style and starts nothing on the clock', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const { style, state, machine, transitionTo } = useAniStates({
            initial: 'idle',
            initialValue: { opacity: 0 },
            states: {
                idle: a.ani({
                    to: { opacity: 0 },
                    duration: 1,
                    timing: linear,
                }),
                active: node(),
            },
            clock: m.clock,
        })
        expect(style).toBe('opacity: 0')
        expect(machine.state()).toBe('idle')
        let seen: unknown
        state.subscribe((s) => {
            seen = s
        })()
        expect(seen).toBe('idle')
        expect(typeof transitionTo).toBe('function')
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('P7: useFollow renders the initial style and starts nothing on the clock', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const { style, follower } = useFollow(
            { translateY: 12 },
            { clock: m.clock }
        )
        expect(style).toBe('transform: translateY(12px)')
        expect(follower.status).toBe('IDLE')
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('P8: useTimeline creates the object and registers its disposal, nothing else', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const timeline = useTimeline(() =>
            rafTimeline(node(), { clock: m.clock })
        )
        expect(timeline.status).toBe('IDLE')
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
        expect(scope.destroyers).toHaveLength(1)
    })

    it('P9: useAni gives its initial value and does not subscribe until read', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const timeline = rafTimeline(node(), { clock: m.clock })
        const onUpdate = vi.spyOn(timeline, 'onUpdate')
        const [store] = useAni(timeline, { opacity: 0.1 })
        expect(onUpdate).not.toHaveBeenCalled()
        let seen = -1
        store.subscribe((v) => {
            seen = v.opacity
        })()
        expect(seen).toBe(0.1)
        expect(m.clock.size).toBe(0)
    })

    it('P10: the server flow runs end to end: render, transition, dispose', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const { machine, transitionTo, style } = useAniStates({
            initial: 'idle',
            initialValue: { opacity: 0 },
            states: {
                idle: a.ani({
                    to: { opacity: 0 },
                    duration: 1,
                    timing: linear,
                }),
                active: node(),
            },
            clock: m.clock,
        })
        expect(style).toBe('opacity: 0')
        expect(() => transitionTo('active')).not.toThrow()
        expect(machine.state()).toBe('active')
        for (const callback of scope.destroyers.splice(0)) callback()
        expect(m.clock.size).toBe(0)
    })
})
