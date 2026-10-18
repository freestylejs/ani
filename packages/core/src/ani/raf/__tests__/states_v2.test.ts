import { describe, expect, it } from 'vitest'
import type { Animatable, AnimationClockInterface } from '~/loop'
import { ani } from '~/nodes'
import { T } from '~/timing'
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

const machine = () => {
    const clock = new MockClock()
    const states = createStates({
        initial: 'closed',
        initialValue: { x: 0 },
        states: {
            closed: ani({ to: { x: 0 }, duration: 1, timing: T.linear() }),
            open: ani({ to: { x: 100 }, duration: 1, timing: T.linear() }),
            half: ani({ to: { x: 50 }, duration: 1, timing: T.linear() }),
        },
        clock,
    })
    return { clock, states }
}

const element = () => {
    const writes: string[] = []
    const style = new Proxy({} as Record<string, unknown>, {
        set(_target, prop, value) {
            writes.push(`${String(prop)}:${value}`)
            return true
        },
        get: () => undefined,
    })
    return {
        target: { style: style as unknown as CSSStyleDeclaration },
        writes,
    }
}

describe('createStates V2', () => {
    it('keeps the machine bindings on the previous timeline when play throws', async () => {
        const { clock, states } = machine()
        const el = element()
        const frames: number[] = []
        states.bind(el.target)
        states.onUpdate(({ state }) => frames.push(state.x))

        const run = states.transitionTo('open')
        clock.tick(0.5)
        const timeline = states.timeline()

        expect(() =>
            states.transitionTo('closed', { from: { x: Number.NaN } })
        ).toThrow(TypeError)
        expect(states.timeline()).toBe(timeline)

        const written = el.writes.length
        const count = frames.length
        clock.tick(0.25)
        expect(el.writes.length).toBeGreaterThan(written)
        expect(frames.length).toBe(count + 1)

        clock.tick(1)
        expect(await run).toBe('ended')
        expect(clock.subscribers.size).toBe(0)
    })

    it('does not attach a binding unsubscribed from a transition listener', () => {
        const { clock, states } = machine()
        const el = element()
        const unbind = states.bind(el.target)
        states.onTransition(() => unbind())

        void states.transitionTo('open')
        const written = el.writes.length
        clock.tick(0.5)

        expect(el.writes.length).toBe(written)
    })

    it('resolves a transition made on a reset timeline with its own result', async () => {
        const { states } = machine()

        const run = states.transitionTo('open')
        states.timeline().reset()

        expect(await run).toBe('reset')
        expect(states.value).toEqual({ x: 0 })
    })

    it('resolves "ended" for a finished run followed by a transition in the same tick', async () => {
        const { clock, states } = machine()

        const first = states.transitionTo('open')
        clock.tick(1)
        void states.transitionTo('closed')

        expect(await first).toBe('ended')
    })

    it('unbind and unsubscribe inside onTransition stop the very next timeline', () => {
        const { clock, states } = machine()
        const el = element()
        const frames: number[] = []
        const unbind = states.bind(el.target)
        const stop = states.onUpdate(({ state }) => frames.push(state.x))
        states.onTransition(() => {
            unbind()
            stop()
        })

        void states.transitionTo('open')
        clock.tick(0.5)

        expect(el.writes).toEqual([])
        expect(frames).toEqual([])
    })

    it('attaches a subscription made inside onTransition exactly once', () => {
        const { clock, states } = machine()
        const frames: number[] = []
        states.onTransition(() => {
            states.onUpdate(({ state }) => frames.push(state.x))
        })

        void states.transitionTo('open')
        const first = frames.length
        clock.tick(0.5)

        expect(frames.length).toBe(first + 1)
    })

    describe('transitionTo from an onUpdate listener during play', () => {
        it('keeps the nested run live and settles the outer one as interrupted', async () => {
            const { clock, states } = machine()
            let nested: Promise<string> | undefined
            let redirected = false
            states.onUpdate(() => {
                if (redirected) return
                redirected = true
                nested = states.transitionTo('half')
            })

            const outer = states.transitionTo('open')

            expect(states.state()).toBe('half')
            expect(states.timeline().status).toBe('PLAYING')
            expect(await outer).toBe('interrupted')
            clock.tick(1)
            expect(await nested).toBe('ended')
            expect(clock.subscribers.size).toBe(0)
        })

        it('unbind detaches from the live timeline', () => {
            const { clock, states } = machine()
            const el = element()
            const unbind = states.bind(el.target)
            let nested = false
            states.onUpdate(() => {
                if (nested) return
                nested = true
                void states.transitionTo('half')
            })

            void states.transitionTo('open')
            clock.tick(0.1)
            unbind()
            const written = el.writes.length
            clock.tick(0.1)

            expect(el.writes.length).toBe(written)
        })
    })

    describe('transitionTo from an onTransition listener', () => {
        const redirect = (states: ReturnType<typeof machine>['states']) => {
            const nested: { run?: Promise<string> } = {}
            let first = true
            states.onTransition((state) => {
                if (first && state === 'open') {
                    first = false
                    nested.run = states.transitionTo('half')
                }
            })
            return nested
        }

        it('keeps the nested transition live and settles the outer one as interrupted', async () => {
            const { clock, states } = machine()
            const nested = redirect(states)

            const outer = states.transitionTo('open')

            expect(states.state()).toBe('half')
            expect(await outer).toBe('interrupted')
            clock.tick(0.5)
            expect(states.value).toEqual({ x: 25 })
            clock.tick(1)
            expect(await nested.run).toBe('ended')
            expect(clock.subscribers.size).toBe(0)
        })

        it('unbind detaches from the live timeline', () => {
            const { clock, states } = machine()
            const el = element()
            const unbind = states.bind(el.target)
            redirect(states)

            void states.transitionTo('open')
            clock.tick(0.1)
            unbind()
            const written = el.writes.length
            clock.tick(0.1)

            expect(el.writes.length).toBe(written)
        })
    })
})

describe('redirect inside onTransition keeps velocity', () => {
    const build = () => {
        const clock = new MockClock()
        const states = createStates({
            initial: 'moving',
            initialValue: { x: 0 },
            states: {
                moving: ani({
                    to: { x: 100 },
                    duration: 1,
                    timing: T.linear(),
                }),
                other: ani({ to: { x: 10 }, duration: 1, timing: T.linear() }),
                settle: ani({
                    to: { x: 50 },
                    duration: 2,
                    timing: T.dynamicSpring({ m: 1, k: 100, c: 20 }),
                }),
            },
            clock,
        })
        return { clock, states }
    }

    it('matches a direct transition', () => {
        const direct = build()
        void direct.states.transitionTo('moving')
        direct.clock.tick(0.5)
        void direct.states.transitionTo('settle')
        direct.clock.tick(0.016)

        const redirected = build()
        void redirected.states.transitionTo('moving')
        redirected.clock.tick(0.5)
        let first = true
        redirected.states.onTransition((state) => {
            if (first && state === 'other') {
                first = false
                void redirected.states.transitionTo('settle')
            }
        })
        void redirected.states.transitionTo('other')
        redirected.clock.tick(0.016)

        expect(redirected.states.value).toEqual(direct.states.value)
    })
})
