import { a, type RafAniTimeline, rafTimeline } from '@freestylejs/ani-core'
import { describe, expectTypeOf, it } from 'vitest'
import { createAni } from '../ani/create_ani'
import { createAniRef } from '../ani/create_ani_ref'
import { createAniStates } from '../ani/create_ani_states'

type G = { x: number }
const node = a.ani({ to: { x: 1 }, duration: 1 })

// Compile-time contract (checked by `pnpm ts:typecheck`).
describe('solid public types', () => {
    it('primitives keep the group type end to end', () => {
        const check = () => {
            const timeline = rafTimeline(node)
            expectTypeOf(createAni(() => timeline, { x: 0 })).toEqualTypeOf<
                readonly [() => G, RafAniTimeline<G>]
            >()
            const [ref, controller] = createAniRef({
                timeline: () => timeline,
                initialValue: { x: 0 },
            })
            expectTypeOf(controller).toEqualTypeOf<RafAniTimeline<G>>()
            expectTypeOf(ref).parameter(0).toExtend<HTMLElement>()
            const [, { state }, transitionTo] = createAniStates({
                initial: 'idle',
                initialFrom: { x: 0 },
                states: { idle: node, active: node },
            })
            expectTypeOf(state()).toEqualTypeOf<'idle' | 'active'>()
            // @ts-expect-error unknown state
            transitionTo('missing')
        }
        void check
    })
})
