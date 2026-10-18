// @vitest-environment jsdom

import {
    a,
    createClock,
    type RafGroup,
    type Resolver,
    rafGroup,
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

type Values = { opacity: number }
type Group = RafGroup<Values>
type Style = Record<string, string | number> | undefined
interface Bound {
    ref: (index: number) => (element: HTMLElement) => void
    style: Accessor<Style>
}
type Options = {
    initialValue?: Values
    resolver?: Resolver<Record<string, number>>
}

const { createAniGroup } = solid as unknown as {
    createAniGroup(group: Group | Accessor<Group>, options?: Options): Bound
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
    a.ani({ to: { opacity: 1 }, duration: 1, timing: a.timing.linear() })
const from = { opacity: 0 }

const makeEls = (count: number) =>
    Array.from({ length: count }, () => {
        const el = document.createElement('div')
        document.body.appendChild(el)
        return el
    })
const opacities = (els: HTMLElement[]) =>
    els.map((el) => (el.style.opacity === '' ? null : Number(el.style.opacity)))

describe('FSOLID: createAniGroup', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('A1: returns { ref, style } where ref(index) gives one element ref per index', () => {
        const m = makeClock()
        const group = rafGroup(node(), { clock: m.clock })
        createRoot((dispose) => {
            const result = createAniGroup(group)
            expect(Array.isArray(result)).toBe(false)
            expect(typeof result.ref).toBe('function')
            expect(typeof result.ref(0)).toBe('function')
            expect(typeof result.style).toBe('function')
            dispose()
        })
    })

    it('A2: each element follows its own target of the staggered group, through bindAt', () => {
        const m = makeClock()
        const group = rafGroup(node(), { clock: m.clock, stagger: 0.25 })
        const bindAt = vi.spyOn(group, 'bindAt')
        const els = makeEls(3)
        const dispose = createRoot((d) => {
            const { ref } = createAniGroup(group)
            els.forEach((el, index) => {
                ref(index)(el)
            })
            return d
        })
        expect(bindAt).toHaveBeenCalledTimes(3)
        els.forEach((el, index) => {
            expect(bindAt.mock.calls[index]?.[0]).toBe(index)
            expect(bindAt.mock.calls[index]?.[1]).toBe(el)
        })

        void group.play({ from, count: 3 })
        m.frames(5)
        const [first, second, third] = opacities(els)
        expect(first).toBeCloseTo(0.5, 5)
        expect(second).toBeCloseTo(0.25, 5)
        expect(third).toBeCloseTo(0, 5)
        m.frames(3)
        expect(opacities(els)[0]).toBeCloseTo(0.8, 5)
        expect(opacities(els)[1]).toBeCloseTo(0.55, 5)
        expect(opacities(els)[2]).toBeCloseTo(0.3, 5)
        dispose()
    })

    it('A2: refs can be given in any order and for a subset of the indices', () => {
        const m = makeClock()
        const group = rafGroup(node(), { clock: m.clock, stagger: 0.25 })
        const els = makeEls(2)
        const dispose = createRoot((d) => {
            const { ref } = createAniGroup(group)
            ref(2)(els[0] as HTMLElement)
            ref(0)(els[1] as HTMLElement)
            return d
        })
        void group.play({ from, count: 3 })
        m.frames(5)
        expect(opacities(els)[0]).toBeCloseTo(0, 5)
        expect(opacities(els)[1]).toBeCloseTo(0.5, 5)
        dispose()
    })

    it('A3: style() is the initial inline style of initialValue, with kebab-case keys', () => {
        const m = makeClock()
        const group = rafGroup(node(), { clock: m.clock })
        createRoot((dispose) => {
            const { style } = createAniGroup(group, {
                initialValue: { opacity: 0.25 },
            })
            expect(style()).toEqual({ opacity: 0.25 })
            dispose()
        })
        createRoot((dispose) => {
            expect(createAniGroup(group).style()).toBeUndefined()
            dispose()
        })
    })

    it('A3: the resolver option shapes style() and the bound writes', () => {
        const m = makeClock()
        const group = rafGroup(
            a.ani({ to: { x: 100 }, duration: 1, timing: a.timing.linear() }),
            { clock: m.clock }
        )
        const [el] = makeEls(1)
        const resolver: Resolver<Record<string, number>> = {
            x: (v: number) => ({ key: '--x', value: `${v}px` }),
        }
        const dispose = createRoot((d) => {
            const { ref, style } = createAniGroup(group as unknown as Group, {
                initialValue: { x: 10 } as unknown as Values,
                resolver,
            })
            expect(style()).toEqual({ '--x': '10px' })
            ref(0)(el as HTMLElement)
            return d
        })
        void group.play({ from: { x: 0 }, count: 1 })
        m.frames(5)
        expect(el?.style.getPropertyValue('--x')).toBe('50px')
        dispose()
    })

    it('A4: cleaning up the owner releases every element and keeps the group alive', async () => {
        const m = makeClock()
        const group = rafGroup(node(), { clock: m.clock })
        const els = makeEls(2)
        const dispose = createRoot((d) => {
            const { ref } = createAniGroup(group)
            ref(0)(els[0] as HTMLElement)
            ref(1)(els[1] as HTMLElement)
            return d
        })
        void group.play({ from, count: 2 })
        m.frames(2)
        expect(opacities(els)).toEqual([expect.any(Number), expect.any(Number)])

        dispose()
        const before = opacities(els)
        m.frames(2)
        expect(opacities(els)).toEqual(before)
        expect(group.status).toBe('PLAYING')
        expect(group.valueAt(0)?.opacity).toBeCloseTo(0.4, 5)

        // the group still belongs to the caller
        const run = group.play({ from, count: 2 })
        m.frames(11)
        expect(await run).toBe('ended')
        expect(group.valueAt(1)).toEqual({ opacity: 1 })
        expect(opacities(els)).toEqual(before)
    })

    it('A5: a late ref is written with its target at once', () => {
        const m = makeClock()
        const group = rafGroup(node(), { clock: m.clock })
        let owner: ReturnType<typeof getOwner> = null
        let ref!: Bound['ref']
        const dispose = createRoot((d) => {
            owner = getOwner()
            ref = createAniGroup(group).ref
            return d
        })
        void group.play({ from, count: 2 })
        m.frames(5)

        const els = makeEls(1)
        runWithOwner(owner, () => ref(1)(els[0] as HTMLElement))
        expect(opacities(els)[0]).toBeCloseTo(0.5, 5)
        dispose()
    })

    it('A6: a group accessor change rebinds every element to the new group', () => {
        const m = makeClock()
        const first = rafGroup(node(), { clock: m.clock })
        const second = rafGroup(node(), { clock: m.clock, stagger: 0.5 })
        const els = makeEls(2)
        const [current, setCurrent] = createSignal<Group>(first)
        const dispose = createRoot((d) => {
            const { ref } = createAniGroup(current)
            ref(0)(els[0] as HTMLElement)
            ref(1)(els[1] as HTMLElement)
            return d
        })
        void first.play({ from, count: 2 })
        m.frames(2)
        expect(opacities(els)).toEqual([
            expect.closeTo(0.2, 5),
            expect.closeTo(0.2, 5),
        ])

        setCurrent(() => second)
        void second.play({ from, count: 2 })
        m.frames(3)
        // the first group runs on, unbound; the second drives both elements
        expect(first.valueAt(0)?.opacity).toBeCloseTo(0.5, 5)
        expect(opacities(els)[0]).toBeCloseTo(0.3, 5)
        expect(opacities(els)[1]).toBeCloseTo(0, 5)
        m.frames(4)
        expect(opacities(els)[0]).toBeCloseTo(0.7, 5)
        expect(opacities(els)[1]).toBeCloseTo(0.2, 5)

        dispose()
        const before = opacities(els)
        m.frames(1)
        expect(opacities(els)).toEqual(before)
    })

    it('A7: an invalid index throws a TypeError while the component is set up', () => {
        const m = makeClock()
        const group = rafGroup(node(), { clock: m.clock })
        const [el] = makeEls(1)
        for (const index of [-1, 1.5, Number.NaN]) {
            let dispose: () => void = () => undefined
            expect(() =>
                createRoot((d) => {
                    dispose = d
                    createAniGroup(group).ref(index)(el as HTMLElement)
                })
            ).toThrow(TypeError)
            dispose()
        }
    })

    it('A8: DOM events are not part of the primitive', () => {
        const m = makeClock()
        const group = rafGroup(node(), { clock: m.clock })
        const [el] = makeEls(1)
        const add = vi.spyOn(el as HTMLElement, 'addEventListener')
        const dispose = createRoot((d) => {
            createAniGroup(group, { initialValue: { opacity: 0 } }).ref(0)(
                el as HTMLElement
            )
            return d
        })
        expect(add).not.toHaveBeenCalled()
        dispose()
    })
})
