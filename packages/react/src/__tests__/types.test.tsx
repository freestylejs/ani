import {
    a,
    type Follower,
    type RafAniTimeline,
    type RafGroup,
    rafGroup,
    rafTimeline,
} from '@freestylejs/ani-core'
import { describe, expectTypeOf, it } from 'vitest'
import {
    useAni,
    useAniGroup,
    useAniRef,
    useAniStates,
    useFollow,
    useTimeline,
} from '../ani'

type G = { x: number }
const node = a.ani({ to: { x: 1 }, duration: 1 })

// Compile-time contract (checked by `pnpm ts:typecheck`).
describe('react public types', () => {
    it('hooks keep the group type end to end', () => {
        const check = () => {
            const timeline = rafTimeline(node)
            expectTypeOf(useAni(timeline, { x: 0 })).toEqualTypeOf<
                readonly [G, RafAniTimeline<G>]
            >()
            expectTypeOf(useTimeline(() => rafGroup(node))).toEqualTypeOf<
                RafGroup<G>
            >()
            expectTypeOf(
                useAniRef(timeline, { initialValue: { x: 0 } }).ref
            ).toBeFunction()
            expectTypeOf(useAniGroup(rafGroup(node)).ref(0)).toBeFunction()
            const { state, transitionTo } = useAniStates({
                initial: 'idle',
                initialValue: { x: 0 },
                states: { idle: node, active: node },
            })
            expectTypeOf(state).toEqualTypeOf<'idle' | 'active'>()
            // @ts-expect-error unknown state
            transitionTo('missing')
            expectTypeOf(useFollow({ x: 0 }).follower).toEqualTypeOf<
                Follower<{ x: number }>
            >()
            // @ts-expect-error wrong initial value shape
            useAni(timeline, { y: 0 })
            // @ts-expect-error the legacy ref-first signature is gone
            useAniRef({ current: null }, { timeline })
        }
        void check
    })
})
