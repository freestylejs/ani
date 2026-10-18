import { a, type RafAniTimeline, rafTimeline } from '@freestylejs/ani-core'
import { describe, expectTypeOf, it } from 'vitest'
import type { Ref } from 'vue'
import { useAni } from '../ani/use_ani'
import { useAniRef } from '../ani/use_ani_ref'
import { useAniStates } from '../ani/use_ani_states'

type G = { x: number }
const node = a.ani({ to: { x: 1 }, duration: 1 })

// Compile-time contract (checked by `pnpm ts:typecheck`).
describe('vue public types', () => {
    it('composables keep the group type end to end', () => {
        const check = (timelineRef: Ref<RafAniTimeline<G>>) => {
            const timeline = rafTimeline(node)
            expectTypeOf(useAni(timeline, { x: 0 })).toEqualTypeOf<
                readonly [Ref<G>, RafAniTimeline<G>]
            >()
            // a ref of a timeline is accepted too
            useAni(timelineRef, { x: 0 })
            expectTypeOf(
                useAniRef({ timeline: timelineRef, initialValue: { x: 0 } })
            ).toEqualTypeOf<
                readonly [Ref<HTMLElement | null>, RafAniTimeline<G>]
            >()
            const [, { state }, transitionTo] = useAniStates({
                initial: 'idle',
                initialFrom: { x: 0 },
                states: { idle: node, active: node },
            })
            expectTypeOf(state.value).toEqualTypeOf<'idle' | 'active'>()
            // @ts-expect-error unknown state
            transitionTo('missing')
        }
        void check
    })
})
