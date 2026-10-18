// @vitest-environment jsdom

import { a } from '@freestylejs/ani-core'
import { get } from 'svelte/store'
import { afterEach, describe, expect, it } from 'vitest'
import { useAniStates } from '../ani/use_ani_states'
import { createManualClock } from './clock'

const linear = a.timing.linear()
const makeStates = () => ({
    idle: a.ani({ to: { opacity: 0 }, duration: 1, timing: linear }),
    active: a.ani({ to: { opacity: 1 }, duration: 1, timing: linear }),
})
type Binding = { destroy(): void }

function setup() {
    const m = createManualClock()
    const [action, stores, transitionTo] = useAniStates({
        initial: 'idle',
        initialFrom: { opacity: 0 },
        states: makeStates(),
        clock: m.clock,
    })
    const el = document.createElement('div')
    document.body.appendChild(el)
    const apply = (node: HTMLElement) =>
        (action as unknown as (n: HTMLElement) => Binding)(node)
    return { m, stores, transitionTo, el, apply }
}

describe('svelte useAniStates', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('transitions animate the element and mirror state/timeline stores', () => {
        const { m, stores, transitionTo, el, apply } = setup()
        const binding = apply(el)
        expect(get(stores.state)).toBe('idle')
        const first = get(stores.timeline)
        transitionTo('active', { from: { opacity: 0 } })
        m.frames(5, 100)
        expect(get(stores.state)).toBe('active')
        expect(get(stores.timeline)).not.toBe(first)
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        binding.destroy()
    })

    it('stops the running timeline when the last node is destroyed', () => {
        const { m, transitionTo, el, apply } = setup()
        const binding = apply(el)
        transitionTo('active', { from: { opacity: 0 }, repeat: Infinity })
        m.frames(3, 100)
        expect(m.clock.size).toBe(1)
        binding.destroy()
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })

    it('does not unsubscribe the controller notification leak: store keeps working across re-apply', () => {
        const { m, stores, transitionTo, el, apply } = setup()
        apply(el).destroy()
        // re-applied to a new node: a fresh controller starts from initial
        const el2 = document.createElement('div')
        const b2 = apply(el2)
        expect(get(stores.state)).toBe('idle')
        transitionTo('active', { from: { opacity: 0 } })
        m.frames(5, 100)
        expect(Number(el2.style.opacity)).toBeCloseTo(0.5, 5)
        b2.destroy()
        expect(m.clock.size).toBe(0)
    })

    it('rejects unknown states atomically', () => {
        const { stores, transitionTo, el, apply } = setup()
        const binding = apply(el)
        expect(() => transitionTo('nope' as never)).toThrow(RangeError)
        expect(get(stores.state)).toBe('idle')
        binding.destroy()
    })

    it('keeps state unchanged when a non-interruptible transition is rejected', () => {
        const { m, stores, transitionTo, el, apply } = setup()
        const binding = apply(el)
        transitionTo('active', { from: { opacity: 0 } })
        m.frame(100)
        transitionTo('idle', undefined, false)
        expect(get(stores.state)).toBe('active')
        binding.destroy()
    })

    it('leaves no clock subscribers after 300 apply/transition/destroy cycles', () => {
        const { m, transitionTo, apply } = setup()
        for (let i = 0; i < 300; i++) {
            const binding = apply(document.createElement('div'))
            transitionTo('active', { from: { opacity: 0 }, repeat: Infinity })
            binding.destroy()
        }
        expect(m.clock.size).toBe(0)
        expect(m.pending).toBe(0)
    })
})
