// @vitest-environment jsdom

import type {
    Animatable,
    AnimationClockInterface,
    RafAniTimeline,
} from '@freestylejs/ani-core'
import { a, rafTimeline } from '@freestylejs/ani-core'
import React, { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { useAniRef } from '../ani/use_ani_ref'

class TestClock implements AnimationClockInterface {
    public readonly subscribers = new Set<Animatable>()

    public subscribe(animatable: Animatable): void {
        this.subscribers.add(animatable)
    }

    public unsubscribe(animatable: Animatable): void {
        this.subscribers.delete(animatable)
    }
}

describe('useAniRef', () => {
    afterEach(() => {
        document.body.innerHTML = ''
        ;(
            globalThis as typeof globalThis & {
                IS_REACT_ACT_ENVIRONMENT?: boolean
            }
        ).IS_REACT_ACT_ENVIRONMENT = false
    })

    it('delegates duration and update while applying styles to the element', async () => {
        ;(
            globalThis as typeof globalThis & {
                IS_REACT_ACT_ENVIRONMENT?: boolean
            }
        ).IS_REACT_ACT_ENVIRONMENT = true

        const clock = new TestClock()
        const timeline = rafTimeline(
            a.ani({ to: { opacity: 1 }, duration: 1 }),
            clock
        )

        let controller!: RafAniTimeline<{ opacity: number }>

        function TestComponent() {
            const ref = useRef<HTMLDivElement>(null)
            controller = useAniRef(ref, {
                timeline,
                initialValue: { opacity: 0 },
            })
            return <div ref={ref} />
        }

        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)

        await act(async () => {
            root.render(<TestComponent />)
        })

        const element = container.firstElementChild as HTMLDivElement

        expect(element.style.opacity).toBe('0')
        expect(controller.duration).toBe(timeline.duration)

        await act(async () => {
            controller.play({ from: { opacity: 0 } })
            controller.update(0.5)
        })

        expect(controller.getCurrentValue()).toEqual({ opacity: 0.5 })
        expect(element.style.opacity).toBe('0.5')

        await act(async () => {
            root.unmount()
        })
    })
})
