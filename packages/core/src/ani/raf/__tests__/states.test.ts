import { describe, expect, it, vi } from 'vitest'
import type { Animatable, AnimationClockInterface } from '~/loop'
import { ani } from '~/nodes'
import { timing } from '~/timing'
import { createStates } from '../states'

class MockClock implements AnimationClockInterface {
    public readonly subscribers = new Set<Animatable>()

    public subscribe(animatable: Animatable): void {
        this.subscribers.add(animatable)
    }

    public unsubscribe(animatable: Animatable): void {
        this.subscribers.delete(animatable)
    }

    public tick(dt: number): void {
        const frame = [...this.subscribers]
        for (const subscriber of frame) subscriber.update(dt)
        for (const subscriber of frame) subscriber.commit?.()
    }
}

describe('createStates', () => {
    it('should release previous timeline when transitioning repeatedly', () => {
        const clock = new MockClock()
        const states = createStates({
            initial: 'idle',
            initialValue: { x: 0 },
            states: {
                idle: ani({ to: { x: 0 }, duration: 1 }),
                active: ani({ to: { x: 100 }, duration: 1 }),
            },
            clock,
        })

        for (let i = 0; i < 1000; i++) {
            const target = i % 2 === 0 ? 'active' : 'idle'
            states.transitionTo(target, { from: { x: 0 } })
            expect(clock.subscribers.size).toBe(1)
        }

        clock.tick(0.5)
        expect(states.timeline().value).not.toBeNull()
        expect(clock.subscribers.size).toBe(1)
    })

    const lin = () => timing.linear()
    const machine = (clock = new MockClock()) => {
        const states = createStates({
            initial: 'closed',
            initialValue: { x: 0 },
            states: {
                closed: ani({ to: { x: 0 }, duration: 1, timing: lin() }),
                open: ani({ to: { x: 100 }, duration: 1, timing: lin() }),
            },
            clock,
        })
        return { clock, states }
    }

    describe('transitionTo atomicity', () => {
        it('throws on an unknown state before mutating anything', () => {
            const { states } = machine()
            states.transitionTo('open')
            const timeline = states.timeline()
            const onChange = vi.fn()
            states.onTransition((_state, timeline) => onChange(timeline))

            expect(() => states.transitionTo('nope' as 'open')).toThrow(
                /Unknown state "nope"/
            )

            expect(states.state()).toBe('open')
            expect(states.timeline()).toBe(timeline)
            expect(timeline.status).toBe('PLAYING')
            expect(onChange).not.toHaveBeenCalled()
        })

        it('keeps the previous timeline when play() rejects the config', () => {
            const { clock, states } = machine()
            states.transitionTo('open')
            clock.tick(0.5)
            const timeline = states.timeline()
            const onChange = vi.fn()
            states.onTransition((_state, timeline) => onChange(timeline))

            expect(() =>
                states.transitionTo('closed', { durations: [1, 2] })
            ).toThrow()

            expect(states.state()).toBe('open')
            expect(states.timeline()).toBe(timeline)
            expect(timeline.status).toBe('PLAYING')
            expect(clock.subscribers.size).toBe(1)
            // listeners are told about the swap and about the rollback
            expect(onChange).toHaveBeenLastCalledWith(timeline)
            clock.tick(0.25)
            expect(timeline.value).toEqual({ x: 75 })
        })
    })

    describe('interrupt', () => {
        it('rejects the transition while the current timeline is playing', () => {
            const { clock, states } = machine()
            states.transitionTo('open')
            clock.tick(0.5)
            const timeline = states.timeline()
            const onChange = vi.fn()
            states.onTransition((_state, timeline) => onChange(timeline))

            states.transitionTo('closed', { interrupt: false })

            expect(states.state()).toBe('open')
            expect(states.timeline()).toBe(timeline)
            expect(onChange).not.toHaveBeenCalled()
            clock.tick(0.25)
            expect(timeline.value).toEqual({ x: 75 })
        })

        it('transitions when the current timeline is not playing', () => {
            const { clock, states } = machine()
            // never played
            states.transitionTo('open', { interrupt: false })
            expect(states.state()).toBe('open')

            // ended
            clock.tick(1)
            expect(states.timeline().status).toBe('ENDED')
            states.transitionTo('closed', { interrupt: false })
            expect(states.state()).toBe('closed')
        })

        it('intercepts by default', () => {
            const { clock, states } = machine()
            states.transitionTo('open')
            clock.tick(0.5)
            states.transitionTo('closed')
            expect(states.state()).toBe('closed')
            clock.tick(0.5)
            expect(states.timeline().value).toEqual({ x: 25 })
        })
    })

    describe('dispose', () => {
        it('releases the timeline and subscribers, is idempotent and final', () => {
            const { clock, states } = machine()
            const onChange = vi.fn()
            states.onTransition((_state, timeline) => onChange(timeline))
            states.transitionTo('open')
            onChange.mockClear()
            const timeline = states.timeline()

            states.dispose()
            states.dispose()

            expect(clock.subscribers.size).toBe(0)
            expect(timeline.status).not.toBe('PLAYING')

            states.transitionTo('closed')
            expect(states.state()).toBe('open')
            expect(onChange).not.toHaveBeenCalled()
            expect(clock.subscribers.size).toBe(0)

            const late = vi.fn()
            const off = states.onTransition((_state, timeline) =>
                late(timeline)
            )
            expect(() => off()).not.toThrow()
        })
    })

    describe('value continuity', () => {
        it('uses the last shown value after timeline().reset()', () => {
            const { clock, states } = machine()
            states.transitionTo('open')
            clock.tick(0.6)
            states.timeline().reset()
            expect(states.timeline().value).toBeNull()

            states.transitionTo('closed')

            expect(states.timeline().value).toEqual({ x: 60 })
        })

        it('tracks the last shown value by reference per frame and copies it only on use', () => {
            const { clock, states } = machine()
            states.transitionTo('open')
            let shown: { x: number } | undefined
            states.timeline().onUpdate(({ state, status }) => {
                if (status !== 'IDLE') shown = state as { x: number }
            })
            clock.tick(0.5)
            states.timeline().reset()

            // No eager per-frame copy: the tracker still holds the very object
            // the engine published, so a (contract-violating) mutation of it
            // is visible when the value is consumed.
            shown!.x = 999
            states.transitionTo('closed')
            const next = states.timeline()
            expect(next.value).toEqual({ x: 999 })

            // The consumed value is a defensive copy, not an alias.
            shown!.x = -1
            expect(next.value).toEqual({ x: 999 })
        })

        it('falls back to initialValue for a machine that never ran', () => {
            const { states } = machine()
            states.transitionTo('open')
            expect(states.timeline().value).toEqual({ x: 0 })
        })
    })

    describe('velocity handoff', () => {
        const springMachine = () => {
            const clock = new MockClock()
            const states = createStates({
                initial: 'moving',
                initialValue: { x: 0 },
                states: {
                    moving: ani({ to: { x: 100 }, duration: 1, timing: lin() }),
                    // target == position the machine is interrupted at (50)
                    settle: ani({
                        to: { x: 50 },
                        duration: 2,
                        timing: timing.dynamicSpring({ m: 1, k: 100, c: 20 }),
                    }),
                },
                clock,
            })
            return { clock, states }
        }

        it('carries the velocity of a playing timeline into the new one', () => {
            const { clock, states } = springMachine()
            states.transitionTo('moving')
            clock.tick(0.25)
            clock.tick(0.25) // x = 50, moving at +100/s
            states.transitionTo('settle')
            clock.tick(0.016)

            // from rest at its own target the spring would not move at all
            expect(
                (states.timeline().value as { x: number }).x
            ).toBeGreaterThan(51)
        })

        it('starts from rest when the previous timeline is not playing', () => {
            const { clock, states } = springMachine()
            states.transitionTo('moving', { from: { x: 50 } })
            clock.tick(1) // ended
            states.transitionTo('settle', { from: { x: 50 } })
            clock.tick(0.016)
            expect(states.timeline().value).toEqual({ x: 50 })
        })

        it('an explicit config velocity wins over the handoff', () => {
            const { clock, states } = springMachine()
            states.transitionTo('moving')
            clock.tick(0.5)
            states.transitionTo('settle', { velocity: { x: 0 } })
            clock.tick(0.016)
            expect(states.timeline().value).toEqual({ x: 50 })
        })
    })
})
