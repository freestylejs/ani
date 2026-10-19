// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import { rafTimeline } from '@freestylejs/ani-core'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAni } from '../ani/use_ani'
import { createManualClock, trackSubscriptions } from './clock'
import { act, mount } from './helpers'

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

describe('react useAni', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('renders initial value, then every frame value, and unsubscribes on unmount', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const subs = trackSubscriptions(timeline)
        function C() {
            const [v] = useAni(timeline, { opacity: 0.1 })
            return <p>{v.opacity.toFixed(2)}</p>
        }
        const view = await mount(<C />)
        expect(view.container.textContent).toBe('0.10')
        expect(subs.live).toBe(1)

        await act(async () => {
            timeline.play({ from: { opacity: 0 } })
            m.frames(5, 100)
        })
        expect(view.container.textContent).toBe('0.50')
        await view.unmount()
        expect(subs.live).toBe(0)
    })

    it('follows timeline identity changes', async () => {
        const m = createManualClock()
        const first = rafTimeline(node(), { clock: m.clock })
        const second = rafTimeline(node(), { clock: m.clock })
        const firstSubs = trackSubscriptions(first)
        const secondSubs = trackSubscriptions(second)
        second.play({ from: { opacity: 0.8 } })
        function C({ timeline }: { timeline: typeof first }) {
            const [v, controller] = useAni(timeline, { opacity: 0 })
            return (
                <p data-same={String(controller.duration === 1)}>
                    {v.opacity.toFixed(1)}
                </p>
            )
        }
        const view = await mount(<C timeline={first} />)
        expect(view.container.textContent).toBe('0.0')
        await view.rerender(<C timeline={second} />)
        expect(view.container.textContent).toBe('0.8')
        expect(firstSubs.live).toBe(0)
        expect(secondSubs.live).toBe(1)
        await view.unmount()
        expect(secondSubs.live).toBe(0)
    })

    it('is balanced under StrictMode and across 1000 mount cycles', async () => {
        const m = createManualClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const subs = trackSubscriptions(timeline)
        function C() {
            const [v] = useAni(timeline, { opacity: 0 })
            return <p>{v.opacity}</p>
        }
        const strict = await mount(
            <StrictMode>
                <C />
            </StrictMode>
        )
        expect(subs.live).toBe(1)
        await strict.unmount()
        expect(subs.live).toBe(0)
        for (let i = 0; i < 1000; i++) {
            await (await mount(<C />)).unmount()
        }
        expect(subs.live).toBe(0)
    }, 60_000)
})
