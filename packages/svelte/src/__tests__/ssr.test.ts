// @vitest-environment node

import { a, rafTimeline } from '@freestylejs/ani-core'
import { get } from 'svelte/store'
import { describe, expect, it } from 'vitest'
import { useAni } from '../ani/use_ani'
import { useAniRef } from '../ani/use_ani_ref'
import { useAniStates } from '../ani/use_ani_states'

describe('svelte SSR (no window/document)', () => {
    it('sets up every primitive, subscribes and plays without throwing', () => {
        expect(typeof window).toBe('undefined')
        const timeline = rafTimeline(a.ani({ to: { opacity: 1 }, duration: 1 }))
        const [store] = useAni(timeline, { opacity: 0.1 })
        expect(get(store).opacity).toBe(0.1)
        useAniRef({ timeline, initialValue: { opacity: 0 } })
        const [, s, transitionTo] = useAniStates({
            initial: 'idle',
            initialFrom: { opacity: 0 },
            states: {
                idle: a.ani({ to: { opacity: 0 }, duration: 1 }),
                active: a.ani({ to: { opacity: 1 }, duration: 1 }),
            },
        })
        expect(() => transitionTo('active')).not.toThrow()
        expect(get(s.state)).toBe('active')
    })
})
