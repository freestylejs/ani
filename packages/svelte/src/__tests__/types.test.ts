import { a, type RafAniTimeline, rafTimeline } from '@freestylejs/ani-core'
import type { Readable } from 'svelte/store'
import { describe, expectTypeOf, it } from 'vitest'
import { useAni } from '../ani/use_ani'
import { useAniRef } from '../ani/use_ani_ref'
import { useAniStates } from '../ani/use_ani_states'

type G = { x: number }
const node = a.ani({ to: { x: 1 }, duration: 1 })

// Compile-time contract (checked by `pnpm ts:typecheck`).
describe('svelte public types', () => {
    it('stores/actions keep the group type end to end', () => {
        const check = (source: Readable<RafAniTimeline<G>>) => {
            const timeline = rafTimeline(node)
            expectTypeOf(useAni(timeline, { x: 0 })[0]).toEqualTypeOf<
                Readable<G>
            >()
            // a store of timelines is accepted too
            useAni(source, { x: 0 })
            expectTypeOf(
                useAniRef({ timeline: source, initialValue: { x: 0 } })[1]
            ).toEqualTypeOf<RafAniTimeline<G>>()
            const [, { state }, transitionTo] = useAniStates({
                initial: 'idle',
                initialFrom: { x: 0 },
                states: { idle: node, active: node },
            })
            expectTypeOf(state).toEqualTypeOf<Readable<'idle' | 'active'>>()
            // @ts-expect-error unknown state
            transitionTo('missing')
        }
        void check
    })
})
