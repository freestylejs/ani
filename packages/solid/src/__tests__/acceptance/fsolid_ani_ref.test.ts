// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import {
    createClock,
    type RafAniTimeline,
    type Resolver,
    rafTimeline,
} from '@freestylejs/ani-core'
import {
    type Accessor,
    createRoot,
    createSignal,
    getOwner,
    runWithOwner,
} from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as solid from '../../index'

type Values = { opacity: number; borderRadius: number }
type Timeline = RafAniTimeline<Values>
type Style = Record<string, string | number> | undefined
interface Bound {
    ref: (element: HTMLElement) => void
    style: Accessor<Style>
}
type Options = {
    initialValue?: Values
    resolver?: Resolver<Record<string, number>>
}

const { createAniRef } = solid as unknown as {
    createAniRef(
        timeline: Timeline | Accessor<Timeline>,
        options?: Options
    ): Bound
}

/** A real clock fed by an injected frame source: only `frames()` advances time. */
function makeClock() {
    let time = 1000
    let nextId = 1
    const queue = new Map<number, (timestamp: number) => void>()
    const clock = createClock({
        lagThreshold: Infinity,
        requestFrame: (callback) => {
            const id = nextId++
            queue.set(id, callback)
            return id
        },
        cancelFrame: (id) => {
            queue.delete(id)
        },
        now: () => time,
        onError: () => undefined,
    })
    return {
        clock,
        frames(count: number, ms = 100) {
            for (let i = 0; i < count; i++) {
                time += ms
                const callbacks = [...queue.values()]
                queue.clear()
                for (const callback of callbacks) callback(time)
            }
        },
    }
}

const node = () =>
    a.ani({
        to: { opacity: 1, borderRadius: 10 },
        duration: 1,
        timing: a.timing.linear(),
    })
const from = { opacity: 0, borderRadius: 0 }

const makeEl = () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    return el
}

describe('FSOLID: createAniRef', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('A1: returns { ref, style } and no tuple', () => {
        const m = makeClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        createRoot((dispose) => {
            const result = createAniRef(timeline)
            expect(Array.isArray(result)).toBe(false)
            expect(typeof result.ref).toBe('function')
            expect(typeof result.style).toBe('function')
            dispose()
        })
    })

    it('A2: ref binds the element through timeline.bind and follows the frames', () => {
        const m = makeClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const bind = vi.spyOn(timeline, 'bind')
        const reference = makeEl()
        timeline.bind(reference)
        bind.mockClear()
        const el = makeEl()
        const dispose = createRoot((d) => {
            createAniRef(timeline).ref(el)
            return d
        })
        expect(bind).toHaveBeenCalledTimes(1)
        expect(bind.mock.calls[0]?.[0]).toBe(el)

        void timeline.play({ from })
        m.frames(5)
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        expect(el.style.borderRadius).toBe('5px')
        expect(el.style.cssText).toBe(reference.style.cssText)
        m.frames(3)
        expect(Number(el.style.opacity)).toBeCloseTo(0.8, 5)
        expect(el.style.cssText).toBe(reference.style.cssText)
        dispose()
    })

    it('A3: style() is the initial inline style of initialValue, with kebab-case keys', () => {
        const m = makeClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        createRoot((dispose) => {
            const { style } = createAniRef(timeline, {
                initialValue: { opacity: 0.25, borderRadius: 5 },
            })
            expect(style()).toEqual({
                opacity: 0.25,
                'border-radius': '5px',
            })
            dispose()
        })
    })

    it('A3: style() is undefined without initialValue', () => {
        const m = makeClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        createRoot((dispose) => {
            expect(createAniRef(timeline).style()).toBeUndefined()
            dispose()
        })
    })

    it('A3: style() keeps being the initial style while the element animates', () => {
        const m = makeClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const el = makeEl()
        let style!: Accessor<Style>
        const dispose = createRoot((d) => {
            const result = createAniRef(timeline, {
                initialValue: { opacity: 0.25, borderRadius: 5 },
            })
            result.ref(el)
            style = result.style
            return d
        })
        void timeline.play({ from })
        m.frames(5)
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        expect(style()).toEqual({
            opacity: 0.25,
            'border-radius': '5px',
        })
        dispose()
    })

    it('A4: the resolver option shapes style() and the bound writes', () => {
        const m = makeClock()
        const timeline = rafTimeline(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() }),
            { clock: m.clock }
        )
        const el = makeEl()
        const resolver: Resolver<Record<string, number>> = {
            x: (v: number) => ({ key: '--x', value: `${v}px` }),
        }
        const dispose = createRoot((d) => {
            const { ref, style } = createAniRef(
                timeline as unknown as Timeline,
                { initialValue: { x: 10 } as unknown as Values, resolver }
            )
            expect(style()).toEqual({ '--x': '10px' })
            ref(el)
            return d
        })
        void timeline.play({ from: { x: 0 } })
        m.frames(5)
        expect(el.style.getPropertyValue('--x')).toBe('50px')
        dispose()
    })

    it('A5: a late ref is written with the current value at once', () => {
        const m = makeClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        let owner: ReturnType<typeof getOwner> = null
        let ref!: (element: HTMLElement) => void
        const dispose = createRoot((d) => {
            owner = getOwner()
            ref = createAniRef(timeline).ref
            return d
        })
        void timeline.play({ from })
        m.frames(5)

        const el = makeEl()
        expect(el.style.opacity).toBe('')
        runWithOwner(owner, () => ref(el))
        expect(Number(el.style.opacity)).toBeCloseTo(0.5, 5)
        m.frames(1)
        expect(Number(el.style.opacity)).toBeCloseTo(0.6, 5)
        dispose()
    })

    it('A6: cleaning up the owner releases the element and keeps the timeline alive', async () => {
        const m = makeClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const el = makeEl()
        const dispose = createRoot((d) => {
            createAniRef(timeline).ref(el)
            return d
        })
        void timeline.play({ from })
        m.frames(2)
        expect(Number(el.style.opacity)).toBeCloseTo(0.2, 5)

        dispose()
        m.frames(2)
        expect(Number(el.style.opacity)).toBeCloseTo(0.2, 5)
        expect(timeline.status).toBe('PLAYING')
        expect(timeline.value?.opacity).toBeCloseTo(0.4, 5)
        expect(m.clock.size).toBe(1)

        // the timeline still belongs to the caller
        const run = timeline.play({ from })
        m.frames(11)
        expect(await run).toBe('ended')
        expect(timeline.value).toEqual({ opacity: 1, borderRadius: 10 })
        expect(Number(el.style.opacity)).toBeCloseTo(0.2, 5)
    })

    it('A7: an accessor change rebinds the element to the new timeline', () => {
        const m = makeClock()
        const first = rafTimeline(node(), { clock: m.clock })
        const second = rafTimeline(node(), { clock: m.clock })
        const el = makeEl()
        const [current, setCurrent] = createSignal<Timeline>(first)
        const dispose = createRoot((d) => {
            createAniRef(current).ref(el)
            return d
        })
        void first.play({ from })
        m.frames(2)
        expect(Number(el.style.opacity)).toBeCloseTo(0.2, 5)

        setCurrent(() => second)
        void second.play({ from: { opacity: 0.5, borderRadius: 0 } })
        m.frames(1)
        // first keeps running but no longer writes; second does
        expect(first.value?.opacity).toBeCloseTo(0.3, 5)
        expect(Number(el.style.opacity)).toBeCloseTo(0.55, 5)
        m.frames(1)
        expect(first.value?.opacity).toBeCloseTo(0.4, 5)
        expect(Number(el.style.opacity)).toBeCloseTo(0.6, 5)

        dispose()
        m.frames(1)
        expect(Number(el.style.opacity)).toBeCloseTo(0.6, 5)
    })

    it('A7: an accessor change writes the new timeline value to the element at once', () => {
        const m = makeClock()
        const first = rafTimeline(node(), { clock: m.clock })
        const second = rafTimeline(node(), { clock: m.clock })
        void second.play({ from: { opacity: 0.8, borderRadius: 0 } })
        m.frames(1)
        const el = makeEl()
        const [current, setCurrent] = createSignal<Timeline>(first)
        const dispose = createRoot((d) => {
            createAniRef(current).ref(el)
            return d
        })
        expect(el.style.opacity).toBe('')
        setCurrent(() => second)
        expect(Number(el.style.opacity)).toBeCloseTo(0.82, 5)
        dispose()
    })

    it('A8: DOM events are not part of the primitive', () => {
        const m = makeClock()
        const timeline = rafTimeline(node(), { clock: m.clock })
        const el = makeEl()
        const add = vi.spyOn(el, 'addEventListener')
        const dispose = createRoot((d) => {
            createAniRef(timeline, {
                initialValue: { opacity: 0, borderRadius: 0 },
            }).ref(el)
            return d
        })
        expect(add).not.toHaveBeenCalled()
        dispose()
    })
})
