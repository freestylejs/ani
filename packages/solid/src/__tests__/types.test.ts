import * as a from '@freestylejs/ani-core'
import {
    type RafAniTimeline,
    type RafGroup,
    rafGroup,
    rafTimeline,
} from '@freestylejs/ani-core'
import type { Accessor, JSX } from 'solid-js'
import { describe, expectTypeOf, it } from 'vitest'
import { createAni } from '../ani/create_ani'
import { createAniGroup } from '../ani/create_ani_group'
import { createAniRef } from '../ani/create_ani_ref'
import { createAniStates } from '../ani/create_ani_states'
import { createFollow } from '../ani/create_follow'
import { createTimeline } from '../ani/create_timeline'

type G = { x: number }
const node = a.ani({ to: { x: 1 }, duration: 1 })
type Style = Accessor<JSX.CSSProperties | undefined>

// Compile-time contract (checked by `pnpm ts:typecheck`).
describe('solid public types', () => {
    it('primitives keep the group type end to end', () => {
        const check = () => {
            const timeline = rafTimeline(node)
            expectTypeOf(createAni(() => timeline, { x: 0 })).toEqualTypeOf<
                readonly [() => G, RafAniTimeline<G>]
            >()
            expectTypeOf(createAni(timeline, { x: 0 })[1]).toEqualTypeOf<
                RafAniTimeline<G>
            >()

            const owned = createTimeline(() => rafTimeline(node))
            expectTypeOf(owned).toEqualTypeOf<RafAniTimeline<G>>()

            const single = createAniRef(timeline, { initialValue: { x: 0 } })
            expectTypeOf(single.style).toEqualTypeOf<Style>()
            expectTypeOf(single.ref).parameter(0).toExtend<HTMLElement>()

            const group = rafGroup(node)
            const grouped = createAniGroup<G>(() => group as RafGroup<G>)
            expectTypeOf(grouped.ref(0)).parameter(0).toExtend<HTMLElement>()

            const states = createAniStates({
                initial: 'idle',
                initialValue: { x: 0 },
                states: { idle: node, active: node },
            })
            expectTypeOf(states.state()).toEqualTypeOf<'idle' | 'active'>()
            // @ts-expect-error unknown state
            states.transitionTo('missing')

            const follow = createFollow({ x: 0 })
            expectTypeOf(follow.follower.value.x).toBeNumber()
        }
        void check
    })
})
