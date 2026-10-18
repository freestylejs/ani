import {
    a,
    type Follower,
    type RafAniTimeline,
    type RafGroup,
    rafGroup,
    rafTimeline,
} from '@freestylejs/ani-core'
import { describe, expectTypeOf, it } from 'vitest'
import type { ComponentPublicInstance, ComputedRef, Ref, StyleValue } from 'vue'
import {
    useAni,
    useAniGroup,
    useAniRef,
    useAniStates,
    useFollow,
    useTimeline,
} from '../index'

type G = { x: number }
const node = a.ani({ to: { x: 1 }, duration: 1 })
type Element_ = Element | ComponentPublicInstance | null

// Compile-time contract (checked by `pnpm ts:typecheck`).
describe('vue public types', () => {
    it('composables keep the group type end to end', () => {
        const check = (
            timelineRef: Ref<RafAniTimeline<G>>,
            groupRef: Ref<RafGroup<G>>
        ) => {
            const timeline = rafTimeline(node)
            expectTypeOf(useAni(timeline, { x: 0 })).toEqualTypeOf<
                readonly [Ref<G>, RafAniTimeline<G>]
            >()
            // a ref of a timeline is accepted too
            useAni(timelineRef, { x: 0 })

            const bound = useAniRef(timelineRef, { initialValue: { x: 0 } })
            expectTypeOf(bound.ref).toEqualTypeOf<(el: Element_) => void>()
            expectTypeOf(bound.style).toEqualTypeOf<
                ComputedRef<StyleValue | undefined>
            >()

            const list = useAniGroup(groupRef)
            expectTypeOf(list.ref(0)).toEqualTypeOf<(el: Element_) => void>()
            useAniGroup(rafGroup(node))

            const { state, transitionTo, machine } = useAniStates({
                initial: 'idle',
                initialValue: { x: 0 },
                states: { idle: node, active: node },
            })
            expectTypeOf(state.value).toEqualTypeOf<'idle' | 'active'>()
            expectTypeOf(machine.state()).toEqualTypeOf<'idle' | 'active'>()
            // @ts-expect-error unknown state
            transitionTo('missing')

            const { follower } = useFollow({ x: 0 })
            expectTypeOf(follower).toEqualTypeOf<Follower<{ x: number }>>()

            expectTypeOf(useTimeline(() => timeline)).toEqualTypeOf<
                RafAniTimeline<G>
            >()
            // @ts-expect-error the factory must return something disposable
            useTimeline(() => ({}))
        }
        void check
    })
})
