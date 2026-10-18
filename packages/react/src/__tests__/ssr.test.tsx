// @vitest-environment node

import { a, rafTimeline } from '@freestylejs/ani-core'
import { useRef } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useAni } from '../ani/use_ani'
import { useAniRef } from '../ani/use_ani_ref'
import { useAniStates } from '../ani/use_ani_states'

describe('react SSR', () => {
    it('renders every hook without window/document and retains no subscriptions', () => {
        expect(typeof window).toBe('undefined')
        const timeline = rafTimeline(a.ani({ to: { opacity: 1 }, duration: 1 }))
        function C() {
            const ref = useRef<HTMLDivElement>(null)
            const [v] = useAni(timeline, { opacity: 0.1 })
            useAniRef(ref, {
                timeline,
                initialValue: { opacity: 0 },
                events: { onClick: () => undefined },
            })
            const [{ state }] = useAniStates(ref, {
                initial: 'idle',
                initialFrom: { opacity: 0 },
                states: {
                    idle: a.ani({ to: { opacity: 0 }, duration: 1 }),
                },
            })
            return (
                <div ref={ref}>
                    {state}:{v.opacity}
                </div>
            )
        }
        expect(renderToString(<C />)).toContain('idle')
    })
})
