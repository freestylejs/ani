// @vitest-environment node

import * as a from '@freestylejs/ani-core'
import {
    type Clock,
    createClock,
    type Follower,
    type RafGroup,
    type RafTimeline,
    rafGroup,
    rafTimeline,
} from '@freestylejs/ani-core'
import { type Accessor, createRoot } from 'solid-js'
import { describe, expect, it } from 'vitest'
import * as solid from '../../index'

type Values = { opacity: number; borderRadius: number }
type Style = Record<string, string | number> | undefined
interface Styled {
    ref: (element: HTMLElement) => void
    style: Accessor<Style>
}

const api = solid as unknown as {
    createTimeline<T extends { dispose(): void }>(factory: () => T): T
    createAniRef(
        timeline: RafTimeline<Values>,
        options?: { initialValue?: Values }
    ): Styled
    createAniGroup(
        group: RafGroup<Values>,
        options?: { initialValue?: Values }
    ): Styled & { ref: (index: number) => (element: HTMLElement) => void }
    createAniStates(config: {
        initial: 'idle' | 'active'
        initialValue: Values
        states: Record<'idle' | 'active', ReturnType<typeof a.ani>>
        clock: Clock
    }): Styled & { state: Accessor<string> }
    createFollow(
        initial: Values,
        options?: { clock?: Clock }
    ): Styled & { follower: Follower<Values> }
}

/** Counts the frames requested from the (never cranked) frame source. */
function makeClock() {
    let requested = 0
    const clock = createClock({
        requestFrame: () => {
            requested++
            return requested
        },
        cancelFrame: () => undefined,
        now: () => 1000,
        onError: () => undefined,
    })
    return {
        clock,
        get requested() {
            return requested
        },
    }
}

const node = () =>
    a.ani({
        to: { opacity: 1, borderRadius: 10 },
        duration: 1,
        timing: a.timing.linear(),
    })
const initialValue: Values = { opacity: 0.25, borderRadius: 5 }
const expected = { opacity: 0.25, 'border-radius': '5px' }

describe('FSOLID: server rendering (no window, no document)', () => {
    it('A1: the environment really is a server', () => {
        expect(typeof window).toBe('undefined')
        expect(typeof document).toBe('undefined')
    })

    it('A2: every element primitive yields its initial style without subscribing to a clock', () => {
        const m = makeClock()
        const states = {
            idle: node(),
            active: node(),
        }
        createRoot((dispose) => {
            const timeline = rafTimeline(node(), { clock: m.clock })
            const group = rafGroup(node(), { clock: m.clock })

            expect(
                api.createAniRef(timeline, { initialValue }).style()
            ).toEqual(expected)
            expect(api.createAniGroup(group, { initialValue }).style()).toEqual(
                expected
            )
            const machine = api.createAniStates({
                initial: 'idle',
                initialValue,
                states,
                clock: m.clock,
            })
            expect(machine.style()).toEqual(expected)
            expect(machine.state()).toBe('idle')
            expect(
                api.createFollow(initialValue, { clock: m.clock }).style()
            ).toEqual(expected)

            expect(m.clock.size).toBe(0)
            expect(m.requested).toBe(0)
            dispose()
        })
    })

    it('A2: the style is plain serializable data', () => {
        const m = makeClock()
        createRoot((dispose) => {
            const timeline = rafTimeline(node(), { clock: m.clock })
            const { style } = api.createAniRef(timeline, { initialValue })
            expect(JSON.parse(JSON.stringify(style()))).toEqual(expected)
            dispose()
        })
    })

    it('A2: without initialValue there is no inline style', () => {
        const m = makeClock()
        createRoot((dispose) => {
            const timeline = rafTimeline(node(), { clock: m.clock })
            const group = rafGroup(node(), { clock: m.clock })
            expect(api.createAniRef(timeline).style()).toBeUndefined()
            expect(api.createAniGroup(group).style()).toBeUndefined()
            dispose()
        })
    })

    it('A3: createTimeline creates and disposes with the owner, touching no clock', () => {
        const m = makeClock()
        createRoot((dispose) => {
            const timeline = api.createTimeline(() =>
                rafTimeline(node(), { clock: m.clock })
            )
            expect(timeline.status).toBe('IDLE')
            expect(m.clock.size).toBe(0)
            expect(m.requested).toBe(0)
            dispose()
        })
    })

    it('A4: setup and dispose never touch the DOM', () => {
        const m = makeClock()
        expect(() =>
            createRoot((dispose) => {
                const timeline = rafTimeline(node(), { clock: m.clock })
                api.createAniRef(timeline, { initialValue })
                api.createAniStates({
                    initial: 'idle',
                    initialValue,
                    states: { idle: node(), active: node() },
                    clock: m.clock,
                })
                api.createFollow(initialValue, { clock: m.clock })
                dispose()
            })
        ).not.toThrow()
        expect(m.clock.size).toBe(0)
        expect(m.requested).toBe(0)
    })
})
