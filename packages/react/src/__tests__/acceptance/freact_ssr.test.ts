// @vitest-environment node

import * as a from '@freestylejs/ani-core'
import {
    type AnimationStateShape,
    createClock,
    type Follower,
    type FollowOptions,
    type RafGroup,
    type RafTimeline,
    type Resolver,
    rafGroup,
    rafTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import { type CSSProperties, createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import * as lib from '../../index'

type Opacity = { opacity: number }
type Moving = { translateX: number }
type ResolverOf = Resolver<Record<string, number>>
type ElementRef = (element: HTMLElement | null) => void

const makeStates = () => ({
    idle: a.ani({ to: { opacity: 0 }, duration: 1, timing: a.timing.linear() }),
    active: a.ani({
        to: { opacity: 1 },
        duration: 1,
        timing: a.timing.linear(),
    }),
})
type Shape = ReturnType<typeof makeStates> & AnimationStateShape

interface Api {
    useTimeline<T extends { dispose(): void }>(factory: () => T): T
    useAni(
        timeline: RafTimeline<Opacity>,
        initialValue: Opacity
    ): readonly [Opacity, unknown]
    useAniRef(
        timeline: RafTimeline<Opacity>,
        options?: { initialValue?: Opacity }
    ): { ref: ElementRef; style: CSSProperties | undefined }
    useAniGroup(
        group: RafGroup<Opacity>,
        options?: { initialValue?: Opacity }
    ): {
        ref: (index: number) => ElementRef
        style: CSSProperties | undefined
    }
    useAniStates(config: StateProps<Shape> & { resolver?: ResolverOf }): {
        ref: ElementRef
        style: CSSProperties | undefined
        state: keyof Shape
        machine: StateController<Shape>
    }
    useFollow(
        initial: Moving,
        options?: FollowOptions & { resolver?: ResolverOf }
    ): {
        ref: ElementRef
        style: CSSProperties | undefined
        follower: Follower<Moving>
    }
}

const { useTimeline, useAni, useAniRef, useAniGroup, useAniStates, useFollow } =
    lib as unknown as Api

/** A real clock that fails the test on any attempt to schedule a frame. */
function silentClock() {
    const requestFrame = vi.fn(() => 1)
    const clock = createClock({
        requestFrame,
        cancelFrame: () => undefined,
        now: () => 1000,
        onError: () => undefined,
    })
    return { clock, requestFrame }
}

const node = () =>
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })

describe('FREACT: server rendering', () => {
    it('F1: renders initial inline styles on the server and subscribes to nothing', () => {
        expect(typeof window).toBe('undefined')
        expect(typeof document).toBe('undefined')
        const { clock, requestFrame } = silentClock()
        const factory = vi.fn(() => rafTimeline(node(), { clock: clock }))

        function C() {
            const timeline = useTimeline(factory)
            const group = useTimeline(() => rafGroup(node(), { clock }))
            const [shown] = useAni(timeline, { opacity: 0.1 })
            const single = useAniRef(timeline, {
                initialValue: { opacity: 0.25 },
            })
            const many = useAniGroup(group, { initialValue: { opacity: 0.5 } })
            const states = useAniStates({
                initial: 'idle',
                initialValue: { opacity: 0.75 },
                states: makeStates(),
                clock,
            } as unknown as StateProps<Shape>)
            const chaser = useFollow({ translateX: 10 }, { clock })
            return createElement(
                'main',
                null,
                createElement('p', { id: 'v' }, String(shown.opacity)),
                createElement('div', {
                    id: 'single',
                    ref: single.ref,
                    style: single.style,
                }),
                createElement('div', {
                    id: 'many0',
                    ref: many.ref(0),
                    style: many.style,
                }),
                createElement('div', {
                    id: 'many1',
                    ref: many.ref(1),
                    style: many.style,
                }),
                createElement(
                    'div',
                    {
                        id: 'states',
                        ref: states.ref,
                        style: states.style,
                    },
                    String(states.state)
                ),
                createElement('div', {
                    id: 'follow',
                    ref: chaser.ref,
                    style: chaser.style,
                })
            )
        }

        const html = renderToString(createElement(C))

        expect(html).toContain('id="single" style="opacity:0.25"')
        expect(html).toContain('id="many0" style="opacity:0.5"')
        expect(html).toContain('id="many1" style="opacity:0.5"')
        expect(html).toContain('id="states" style="opacity:0.75"')
        expect(html).toContain('id="follow" style="transform:translateX(10px)"')
        expect(html).toContain('>0.1</p>')
        expect(html).toContain('>idle</div>')

        expect(factory).toHaveBeenCalledTimes(1)
        expect(clock.size).toBe(0)
        expect(requestFrame).not.toHaveBeenCalled()
    })

    it('F2: without initialValue nothing is rendered into style', () => {
        const { clock } = silentClock()
        function C() {
            const timeline = useTimeline(() =>
                rafTimeline(node(), { clock: clock })
            )
            const group = useTimeline(() => rafGroup(node(), { clock }))
            const single = useAniRef(timeline)
            const many = useAniGroup(group)
            return createElement(
                'main',
                null,
                createElement('div', {
                    id: 'single',
                    ref: single.ref,
                    style: single.style,
                }),
                createElement('div', {
                    id: 'many',
                    ref: many.ref(0),
                    style: many.style,
                })
            )
        }
        const html = renderToString(createElement(C))
        expect(html).toContain('<div id="single"></div>')
        expect(html).toContain('<div id="many"></div>')
        expect(clock.size).toBe(0)
    })
})
