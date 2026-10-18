// @vitest-environment jsdom

import { a } from '@freestylejs/ani-core'
import { createRoot } from 'solid-js'
import { afterEach, describe, expect, it } from 'vitest'
import { createAniStates } from '../ani/create_ani_states'
import { createManualClock } from './clock'

const linear = a.timing.linear()
const makeStates = () => ({
    idle: a.ani({ to: { opacity: 0 }, duration: 1, timing: linear }),
    active: a.ani({ to: { opacity: 1 }, duration: 1, timing: linear }),
})

function setup() {
    const m = createManualClock()
    const el = document.createElement('div')
    document.body.appendChild(el)
    let api!: ReturnType<
        typeof createAniStates<HTMLDivElement, ReturnType<typeof makeStates>>
    >
    const dispose = createRoot((d) => {
        api = createAniStates<HTMLDivElement, ReturnType<typeof makeStates>>({
            initial: 'idle',
            initialFrom: { opacity: 0 },
            states: makeStates(),
            clock: m.clock,
        })
        api[0](el)
        return d
    })
    return { m, el, api, dispose }
}

describe('solid createAniStates', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('transitions animate the element and mirror the state', () => {
        const { m, el, api, dispose } = setup()
        expect(api[1].state()).toBe('idle')
        const firstTimeline = api[1].timeline()
        api[2]('active', { from: { opacity: 0 } })
        m.frames(5, 100)
        expect(api[1].state()).toBe('active')
        expect(api[1].timeline()).not.toBe(firstTimeline)
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        dispose()
    })

    it('stops the running timeline when the owner is disposed', () => {
        const { m, api, dispose } = setup()
        api[2]('active', { from: { opacity: 0 }, repeat: Infinity })
        m.frames(3, 100)
        expect(m.clock.size).toBe(1)
        dispose()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('rejects unknown states atomically', () => {
        const { api, dispose } = setup()
        expect(() => api[2]('nope' as never)).toThrow(RangeError)
        expect(api[1].state()).toBe('idle')
        dispose()
    })

    it('keeps state unchanged when a non-interruptible transition is rejected', () => {
        const { m, api, dispose } = setup()
        api[2]('active', { from: { opacity: 0 } })
        m.frame(100)
        api[2]('idle', undefined, false)
        expect(api[1].state()).toBe('active')
        dispose()
    })

    it('leaves no clock subscribers after 300 create/transition/dispose cycles', () => {
        const m = createManualClock()
        for (let i = 0; i < 300; i++) {
            createRoot((d) => {
                const [ref, , transitionTo] = createAniStates<
                    HTMLDivElement,
                    ReturnType<typeof makeStates>
                >({
                    initial: 'idle',
                    initialFrom: { opacity: 0 },
                    states: makeStates(),
                    clock: m.clock,
                })
                ref(document.createElement('div'))
                transitionTo('active', {
                    from: { opacity: 0 },
                    repeat: Infinity,
                })
                d()
            })
        }
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })
})
