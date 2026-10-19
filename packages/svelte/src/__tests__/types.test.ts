import type {
    Follower,
    RafAniTimeline,
    RafGroup,
    StateController,
} from '@freestylejs/ani-core'
import * as a from '@freestylejs/ani-core'
import type { Action } from 'svelte/action'
import type { Readable } from 'svelte/store'
import { describe, expectTypeOf, it } from 'vitest'
import { useAni } from '../ani/use_ani'
import { useAniGroup } from '../ani/use_ani_group'
import { useAniRef } from '../ani/use_ani_ref'
import { useAniStates } from '../ani/use_ani_states'
import { useFollow } from '../ani/use_follow'
import { useTimeline } from '../ani/use_timeline'

type G = { x: number }
const node = a.ani({ to: { x: 1 }, duration: 1 })

// Compile-time contract (checked by `pnpm ts:typecheck`).
describe('svelte public types', () => {
    it('stores/actions keep the group type end to end', () => {
        const check = (
            source: Readable<RafAniTimeline<G>>,
            groups: Readable<RafGroup<G>>
        ) => {
            const timeline = useTimeline(() => a.rafTimeline(node))
            expectTypeOf(timeline).toEqualTypeOf<RafAniTimeline<G>>()
            expectTypeOf(useAni(timeline, { x: 0 })[0]).toEqualTypeOf<
                Readable<G>
            >()
            // a store of timelines is accepted too
            useAni(source, { x: 0 })

            const ref = useAniRef(source, { initialValue: { x: 0 } })
            expectTypeOf(ref.action).toEqualTypeOf<Action<HTMLElement>>()
            expectTypeOf(ref.style).toEqualTypeOf<string | undefined>()

            const grouped = useAniGroup(groups)
            expectTypeOf(grouped.action).toEqualTypeOf<
                Action<HTMLElement, number>
            >()

            const states = useAniStates({
                initial: 'idle',
                initialValue: { x: 0 },
                states: { idle: node, active: node },
            })
            expectTypeOf(states.state).toEqualTypeOf<
                Readable<'idle' | 'active'>
            >()
            expectTypeOf(states.machine).toMatchTypeOf<
                StateController<{ idle: typeof node; active: typeof node }>
            >()
            // @ts-expect-error unknown state
            states.transitionTo('missing')

            const followed = useFollow({ x: 0 })
            expectTypeOf(followed.follower).toEqualTypeOf<Follower<G>>()
        }
        void check
    })
})
