// @vitest-environment node

import { a, rafTimeline } from '@freestylejs/ani-core'
import { createRoot } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { createAni } from '../ani/create_ani'
import { createAniRef } from '../ani/create_ani_ref'
import { createAniStates } from '../ani/create_ani_states'

describe('solid SSR (no window/document)', () => {
    it('sets up every primitive and plays without throwing', () => {
        expect(typeof window).toBe('undefined')
        const timeline = rafTimeline(a.ani({ to: { opacity: 1 }, duration: 1 }))
        createRoot((dispose) => {
            const [value] = createAni(() => timeline, { opacity: 0.1 })
            createAniRef({
                timeline: () => timeline,
                initialValue: { opacity: 0 },
            })
            const [, s, transitionTo] = createAniStates({
                initial: 'idle',
                initialFrom: { opacity: 0 },
                states: {
                    idle: a.ani({ to: { opacity: 0 }, duration: 1 }),
                    active: a.ani({ to: { opacity: 1 }, duration: 1 }),
                },
            })
            expect(value().opacity).toBe(0.1)
            expect(() => transitionTo('active')).not.toThrow()
            expect(s.state()).toBe('active')
            dispose()
        })
    })
})
