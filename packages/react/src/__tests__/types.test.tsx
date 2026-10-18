import { a, type RafAniTimeline, rafTimeline } from '@freestylejs/ani-core'
import type { RefObject } from 'react'
import { describe, expectTypeOf, it } from 'vitest'
import { useAni } from '../ani/use_ani'
import { useAniRef } from '../ani/use_ani_ref'
import { useAniStates } from '../ani/use_ani_states'

type G = { x: number }
const node = a.ani({ to: { x: 1 }, duration: 1 })

// Compile-time contract (checked by `pnpm ts:typecheck`).
describe('react public types', () => {
    it('hooks keep the group type end to end', () => {
        const check = (ref: RefObject<HTMLDivElement | null>) => {
            const timeline = rafTimeline(node)
            expectTypeOf(useAni(timeline, { x: 0 })).toEqualTypeOf<
                readonly [G, RafAniTimeline<G>]
            >()
            expectTypeOf(
                useAniRef(ref, { timeline, initialValue: { x: 0 } })
            ).toEqualTypeOf<RafAniTimeline<G>>()
            const [{ state }, transitionTo] = useAniStates(ref, {
                initial: 'idle',
                initialFrom: { x: 0 },
                states: { idle: node, active: node },
            })
            expectTypeOf(state).toEqualTypeOf<'idle' | 'active'>()
            // @ts-expect-error unknown state
            transitionTo('missing')
            // @ts-expect-error wrong initial value shape
            useAni(timeline, { y: 0 })
        }
        void check
    })
})
