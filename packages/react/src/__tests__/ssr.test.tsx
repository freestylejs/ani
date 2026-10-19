// @vitest-environment node

import * as a from '@freestylejs/ani-core'
import { rafGroup, rafTimeline } from '@freestylejs/ani-core'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
    useAni,
    useAniGroup,
    useAniRef,
    useAniStates,
    useFollow,
    useTimeline,
} from '../ani'
import { createManualClock } from './clock'

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

describe('react SSR', () => {
    it('renders every hook without window/document and retains no subscriptions', () => {
        expect(typeof window).toBe('undefined')
        const m = createManualClock()
        function C() {
            const timeline = useTimeline(() =>
                rafTimeline(node(), { clock: m.clock })
            )
            const group = useTimeline(() =>
                rafGroup(node(), { clock: m.clock })
            )
            const [v] = useAni(timeline, { opacity: 0.1 })
            const single = useAniRef(timeline, {
                initialValue: { opacity: 0.2 },
            })
            const many = useAniGroup(group, { initialValue: { opacity: 0.3 } })
            const { state, ...states } = useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0.4 },
                states: { idle: node() },
                clock: m.clock,
            })
            const chaser = useFollow({ translateX: 5 }, { clock: m.clock })
            return (
                <main>
                    <p>{v.opacity}</p>
                    <i ref={single.ref} style={single.style} />
                    <b ref={many.ref(0)} style={many.style} />
                    <u ref={states.ref} style={states.style}>
                        {state}
                    </u>
                    <s ref={chaser.ref} style={chaser.style} />
                </main>
            )
        }
        const html = renderToString(<C />)
        expect(html).toContain('<i style="opacity:0.2">')
        expect(html).toContain('<b style="opacity:0.3">')
        expect(html).toContain('<u style="opacity:0.4">idle</u>')
        expect(html).toContain('<s style="transform:translateX(5px)">')
        expect(m.clock.size).toBe(0)
    })
})
