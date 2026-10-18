import { describe, expectTypeOf, it } from 'vitest'
import {
    type AniRefContext,
    type AniRefProps,
    a,
    createClock,
    type GetTimeline,
    type ManagedClock,
    type RafAniTimeline,
    rafTimeline,
    type StateController,
    type StateProps,
} from '../../index'

const node = a.ani({ to: { x: 1, y: 2 }, duration: 1 })

// Type-level contract of the public API. Assertions are checked by
// `pnpm ts:typecheck`; the runtime body only keeps the file a valid test.
describe('public types', () => {
    it('rafTimeline infers the animated group', () => {
        const timeline = rafTimeline(node)
        expectTypeOf(timeline).toExtend<
            RafAniTimeline<{ x: number; y: number }>
        >()
        expectTypeOf(timeline.status).toEqualTypeOf<
            'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED'
        >()
        expectTypeOf(timeline.dispose).toEqualTypeOf<() => void>()
        expectTypeOf(timeline.getCurrentValue()).toEqualTypeOf<{
            x: number
            y: number
        } | null>()
        expectTypeOf(timeline.getCurrentVelocity()).toEqualTypeOf<{
            x: number
            y: number
        } | null>()
        expectTypeOf(timeline.onUpdate).returns.toEqualTypeOf<() => void>()
        timeline.onUpdate(({ state, status }) => {
            expectTypeOf(state).toEqualTypeOf<{ x: number; y: number }>()
            expectTypeOf(status).toEqualTypeOf<
                'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED'
            >()
        })
    })

    it('play() config is keyed by the animated group', () => {
        const timeline = rafTimeline(node)
        const play = () => {
            timeline.play({ from: { x: 0, y: 0 } }, false)
            timeline.play({ from: { x: 0, y: 0 }, velocity: { x: 3 } })
            // @ts-expect-error unknown key in `from`
            timeline.play({ from: { x: 0, z: 0 } })
            // @ts-expect-error missing key in `from`
            timeline.play({ from: { x: 0 } })
        }
        void play
    })

    it('createClock returns a managed clock', () => {
        expectTypeOf(createClock()).toEqualTypeOf<ManagedClock>()
        expectTypeOf(createClock().size).toEqualTypeOf<number>()
    })

    it('createStates narrows state names and exposes dispose', () => {
        const states = a.createStates({
            initial: 'idle',
            initialFrom: { x: 0, y: 0 },
            states: {
                idle: a.ani({ to: { x: 0, y: 0 }, duration: 1 }),
                active: a.ani({ to: { x: 1, y: 1 }, duration: 1 }),
            },
        })
        expectTypeOf(states.state()).toEqualTypeOf<'idle' | 'active'>()
        expectTypeOf(states.dispose).toEqualTypeOf<() => void>()
        expectTypeOf(states.timeline()).toExtend<
            RafAniTimeline<{ x: number; y: number }, any>
        >()
        const invalid = () => {
            // @ts-expect-error unknown state name
            states.transitionTo('missing')
        }
        void invalid
    })

    it('binding prop types', () => {
        type G = { x: number }
        expectTypeOf<
            AniRefProps<RafAniTimeline<G>, G>['timeline']
        >().toEqualTypeOf<RafAniTimeline<G>>()
        expectTypeOf<
            AniRefProps<RafAniTimeline<G>, G, true>['timeline']
        >().toEqualTypeOf<() => RafAniTimeline<G>>()
        expectTypeOf<AniRefContext<G>['current']>().toEqualTypeOf<G | null>()
        expectTypeOf<
            StateProps<{ a: ReturnType<typeof a.ani<G>> }>['initial']
        >().toEqualTypeOf<'a'>()
        expectTypeOf<
            GetTimeline<{ a: ReturnType<typeof a.ani<G>> }>
        >().toExtend<RafAniTimeline<G, any>>()
        expectTypeOf<
            StateController<{ a: ReturnType<typeof a.ani<G>> }>
        >().toHaveProperty('dispose')
    })
})
