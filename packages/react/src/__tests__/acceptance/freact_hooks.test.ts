// @vitest-environment jsdom

import {
    type AnimationStateShape,
    a,
    createClock,
    createStyleSheet,
    type Follower,
    type FollowOptions,
    type RafGroup,
    type RafTimeline,
    type Resolver,
    type RunResult,
    rafGroup,
    rafTimeline,
    type StateController,
    type StateProps,
} from '@freestylejs/ani-core'
import {
    act,
    type CSSProperties,
    createElement,
    type DependencyList,
    type ReactElement,
    type ReactNode,
    StrictMode,
} from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as lib from '../../index'

;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// ---------------------------------------------------------------------------
// The V2 React surface, typed locally for the oracle (it does not exist yet).
// ---------------------------------------------------------------------------

type Opacity = { opacity: number }
type ResolverOf = Resolver<Record<string, number>>
type ElementRef = (element: HTMLElement | null) => void

interface RefResult {
    ref: ElementRef
    style: CSSProperties | undefined
}

interface GroupResult {
    ref: (index: number) => ElementRef
    style: CSSProperties | undefined
}

const makeStates = () => ({
    idle: a.ani({ to: { opacity: 0 }, duration: 1, timing: a.timing.linear() }),
    active: a.ani({
        to: { opacity: 1 },
        duration: 1,
        timing: a.timing.linear(),
    }),
})
type Shape = ReturnType<typeof makeStates> & AnimationStateShape
type StatesConfig = StateProps<Shape> & { resolver?: ResolverOf }
type Machine = StateController<Shape>

interface StatesResult extends RefResult {
    state: keyof Shape
    transitionTo: Machine['transitionTo']
    machine: Machine
}

interface FollowResult extends RefResult {
    follower: Follower<Opacity>
}

interface Api {
    useTimeline<T extends { dispose(): void }>(
        factory: () => T,
        deps?: DependencyList
    ): T
    useAni(
        timeline: ReturnType<typeof rafTimeline<Opacity>>,
        initialValue: Opacity
    ): readonly [Opacity, unknown]
    useAniRef(
        timeline: RafTimeline<Opacity>,
        options?: { initialValue?: Opacity; resolver?: ResolverOf }
    ): RefResult
    useAniGroup(
        group: RafGroup<Opacity>,
        options?: { initialValue?: Opacity; resolver?: ResolverOf }
    ): GroupResult
    useAniStates(config: StatesConfig): StatesResult
    useFollow(
        initial: Opacity,
        options?: FollowOptions & { resolver?: ResolverOf }
    ): FollowResult
}

const { useTimeline, useAni, useAniRef, useAniGroup, useAniStates, useFollow } =
    lib as unknown as Api

// ---------------------------------------------------------------------------
// Deterministic infrastructure
// ---------------------------------------------------------------------------

/** A real clock fed by a hand-cranked frame source. */
function manualClock() {
    let time = 1000
    let nextId = 1
    const pending = new Map<number, (timestamp: number) => void>()
    const clock = createClock({
        lagThreshold: Number.POSITIVE_INFINITY,
        requestFrame: (callback) => {
            const id = nextId++
            pending.set(id, callback)
            return id
        },
        cancelFrame: (id) => {
            pending.delete(id)
        },
        now: () => time,
        onError: () => undefined,
    })
    return {
        clock,
        /** one display frame, `ms` after the previous one */
        frame(ms: number): void {
            time += ms
            const callbacks = [...pending.values()]
            pending.clear()
            for (const callback of callbacks) callback(time)
        },
    }
}

const roots: Array<{ root: Root; container: HTMLElement }> = []

async function mount(ui: ReactElement, options: { strict?: boolean } = {}) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const entry = { root, container }
    roots.push(entry)
    const wrap = (next: ReactElement) =>
        options.strict ? createElement(StrictMode, null, next) : next
    await act(async () => {
        root.render(wrap(ui))
    })
    return {
        container,
        rerender: (next: ReactElement) =>
            act(async () => {
                root.render(wrap(next))
            }),
        unmount: async () => {
            const index = roots.indexOf(entry)
            if (index >= 0) roots.splice(index, 1)
            await act(async () => {
                root.unmount()
            })
            container.remove()
        },
    }
}

afterEach(async () => {
    for (const { root, container } of roots.splice(0)) {
        await act(async () => {
            root.unmount()
        })
        container.remove()
    }
    document.body.innerHTML = ''
})

const node = (to = 1) =>
    a.ani({ to: { opacity: to }, duration: 1, timing: a.timing.linear() })

const byId = (container: HTMLElement, id: string) =>
    container.querySelector(`#${id}`) as HTMLElement | null

const opacityOf = (element: HTMLElement | null) =>
    Number(element?.style.opacity)

/** Counts the live `bind` calls of a timeline-like through its public API. */
function trackBind(target: { bind: RafTimeline<Opacity>['bind'] }) {
    let live = 0
    let total = 0
    const original = target.bind
    target.bind = (element, options) => {
        live++
        total++
        const unbind = original.call(target, element, options)
        let active = true
        return () => {
            if (active) {
                active = false
                live--
            }
            unbind()
        }
    }
    return {
        get live(): number {
            return live
        },
        get total(): number {
            return total
        },
    }
}

/** Counts the live `bindAt` calls of a group, in total and per index. */
function trackBindAt(group: RafGroup<Opacity>) {
    const perIndex = new Map<number, number>()
    let total = 0
    const original = group.bindAt
    group.bindAt = (index, element, options) => {
        perIndex.set(index, (perIndex.get(index) ?? 0) + 1)
        total++
        const unbind = original.call(group, index, element, options)
        let active = true
        return () => {
            if (active) {
                active = false
                perIndex.set(index, (perIndex.get(index) ?? 0) - 1)
                total--
            }
            unbind()
        }
    }
    return {
        get live(): number {
            return total
        },
        at: (index: number) => perIndex.get(index) ?? 0,
    }
}

/** A disposable that records how often it was disposed. */
function disposable() {
    const item = {
        disposed: 0,
        dispose() {
            item.disposed++
        },
    }
    return item
}

const widthResolver: ResolverOf = {
    opacity: (value: number) => ({ key: 'width', value: `${value * 100}px` }),
}

// ---------------------------------------------------------------------------
// useTimeline: the owner primitive
// ---------------------------------------------------------------------------

describe('FREACT: useTimeline', () => {
    it('A1: creates the object once and returns the same instance on every render', async () => {
        const factory = vi.fn(disposable)
        const seen: Array<ReturnType<typeof disposable>> = []
        function C(props: { tick: number }) {
            seen.push(useTimeline(factory))
            return createElement('p', null, props.tick)
        }
        const view = await mount(createElement(C, { tick: 0 }))
        await view.rerender(createElement(C, { tick: 1 }))
        await view.rerender(createElement(C, { tick: 2 }))

        expect(factory).toHaveBeenCalledTimes(1)
        expect(seen.length).toBeGreaterThanOrEqual(3)
        expect(new Set(seen).size).toBe(1)
        expect(seen[0]?.disposed).toBe(0)
    })

    it('A2: disposes the object when the component unmounts', async () => {
        let item!: ReturnType<typeof disposable>
        function C() {
            item = useTimeline(disposable)
            return null
        }
        const view = await mount(createElement(C))
        expect(item.disposed).toBe(0)
        await view.unmount()
        expect(item.disposed).toBe(1)
    })

    it('A3: changing deps disposes the old object and creates a new one', async () => {
        const seen: Array<ReturnType<typeof disposable>> = []
        function C(props: { dep: number }) {
            seen.push(useTimeline(disposable, [props.dep]))
            return null
        }
        const view = await mount(createElement(C, { dep: 1 }))
        await view.rerender(createElement(C, { dep: 1 }))
        const first = seen[seen.length - 1]!
        expect(new Set(seen).size).toBe(1)
        expect(first.disposed).toBe(0)

        await view.rerender(createElement(C, { dep: 2 }))
        const second = seen[seen.length - 1]!
        expect(second).not.toBe(first)
        expect(first.disposed).toBe(1)
        expect(second.disposed).toBe(0)

        await view.rerender(createElement(C, { dep: 2 }))
        expect(seen[seen.length - 1]).toBe(second)

        await view.unmount()
        expect(second.disposed).toBe(1)
        expect(first.disposed).toBe(1)
    })

    it('A4: survives StrictMode: the instance in use is never disposed', async () => {
        const created: Array<ReturnType<typeof disposable>> = []
        const seen: Array<ReturnType<typeof disposable>> = []
        function C(props: { tick: number }) {
            const item = useTimeline(() => {
                const next = disposable()
                created.push(next)
                return next
            })
            seen.push(item)
            return createElement('p', null, props.tick)
        }
        const view = await mount(createElement(C, { tick: 0 }), {
            strict: true,
        })
        const live = seen[seen.length - 1]!
        expect(live.disposed).toBe(0)

        await view.rerender(createElement(C, { tick: 1 }))
        expect(seen[seen.length - 1]).toBe(live)
        expect(live.disposed).toBe(0)

        await view.unmount()
        expect(live.disposed).toBe(1)
    })

    it('A4: a rafTimeline from useTimeline plays under StrictMode and drives a bound element', async () => {
        const m = manualClock()
        let timeline!: ReturnType<typeof rafTimeline<Opacity>>
        function C() {
            timeline = useTimeline(() => rafTimeline(node(), m.clock))
            const { ref, style } = useAniRef(timeline, {
                initialValue: { opacity: 0.25 },
            })
            return createElement('div', { id: 'el', ref, style })
        }
        const view = await mount(createElement(C), { strict: true })
        const el = byId(view.container, 'el')
        expect(el?.style.opacity).toBe('0.25')

        let run!: Promise<RunResult>
        await act(async () => {
            run = timeline.play({ from: { opacity: 0 } })
            m.frame(500)
        })
        expect(opacityOf(el)).toBeCloseTo(0.5, 5)
        await act(async () => {
            m.frame(1000)
            m.frame(1000)
        })
        expect(await run).toBe('ended')
        expect(opacityOf(el)).toBe(1)

        await view.unmount()
        expect(await timeline.play({ from: { opacity: 0 } })).toBe('disposed')
    })

    it('A5: disposing on unmount releases the clock subscription of a timeline', async () => {
        const m = manualClock()
        let timeline!: ReturnType<typeof rafTimeline<Opacity>>
        function C() {
            timeline = useTimeline(() => rafTimeline(node(), m.clock))
            return null
        }
        const view = await mount(createElement(C))
        void timeline.play({ from: { opacity: 0 } })
        expect(m.clock.size).toBe(1)
        await view.unmount()
        expect(m.clock.size).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// useAni: unchanged
// ---------------------------------------------------------------------------

describe('FREACT: useAni (unchanged)', () => {
    it('A6: re-renders with the timeline value, returns a stable controller and never disposes', async () => {
        const m = manualClock()
        const timeline = rafTimeline(node(), m.clock)
        const dispose = vi.spyOn(timeline, 'dispose')
        const controllers: unknown[] = []
        function C() {
            const [value, controller] = useAni(timeline, { opacity: 0 })
            controllers.push(controller)
            return createElement('p', { id: 'v' }, String(value.opacity))
        }
        const view = await mount(createElement(C))
        expect(byId(view.container, 'v')?.textContent).toBe('0')

        await act(async () => {
            void timeline.play({ from: { opacity: 0 } })
            m.frame(500)
        })
        expect(byId(view.container, 'v')?.textContent).toBe('0.5')
        expect(new Set(controllers).size).toBe(1)

        await view.unmount()
        expect(dispose).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// useAniRef
// ---------------------------------------------------------------------------

describe('FREACT: useAniRef', () => {
    function Single(props: {
        timeline: RafTimeline<Opacity>
        initialValue?: Opacity
        resolver?: ResolverOf
        show?: boolean
        tick?: number
        onRender?: (result: RefResult) => void
    }) {
        const options: { initialValue?: Opacity; resolver?: ResolverOf } = {}
        if (props.initialValue) options.initialValue = props.initialValue
        if (props.resolver) options.resolver = props.resolver
        const result = useAniRef(props.timeline, options)
        props.onRender?.(result)
        return createElement(
            'div',
            null,
            props.show === false
                ? null
                : createElement('div', {
                      id: 'el',
                      ref: result.ref,
                      style: result.style,
                  }),
            createElement('i', null, props.tick ?? 0)
        )
    }

    it('B1: binds the element: frames write its style without re-rendering the owner', async () => {
        const m = manualClock()
        const timeline = rafTimeline(node(), m.clock)
        const track = trackBind(timeline)
        let renders = 0
        const view = await mount(
            createElement(Single, { timeline, onRender: () => renders++ })
        )
        const el = byId(view.container, 'el')
        expect(track.live).toBe(1)
        const before = renders

        await act(async () => {
            void timeline.play({ from: { opacity: 0 } })
            m.frame(250)
            m.frame(250)
        })
        expect(opacityOf(el)).toBeCloseTo(0.5, 5)
        expect(renders).toBe(before)
    })

    it('B2: style is undefined without initialValue and the stable initial style with it', async () => {
        const m = manualClock()
        const timeline = rafTimeline(node(), m.clock)
        const styles: Array<CSSProperties | undefined> = []
        const view = await mount(
            createElement(Single, {
                timeline,
                onRender: (r) => styles.push(r.style),
            })
        )
        expect(styles.every((s) => s === undefined)).toBe(true)
        await view.unmount()

        const withInitial: Array<CSSProperties | undefined> = []
        const view2 = await mount(
            createElement(Single, {
                timeline,
                initialValue: { opacity: 0.25 },
                tick: 0,
                onRender: (r) => withInitial.push(r.style),
            })
        )
        expect(opacityOf(byId(view2.container, 'el'))).toBe(0.25)
        await view2.rerender(
            createElement(Single, {
                timeline,
                initialValue: { opacity: 0.25 },
                tick: 1,
                onRender: (r) => withInitial.push(r.style),
            })
        )
        expect(withInitial.length).toBeGreaterThanOrEqual(2)
        expect(withInitial[0]).toEqual(createStyleSheet({ opacity: 0.25 }))
        expect(new Set(withInitial).size).toBe(1)
    })

    it('B2: initialValue goes through the resolver', async () => {
        const m = manualClock()
        const timeline = rafTimeline(node(), m.clock)
        let style: CSSProperties | undefined
        const view = await mount(
            createElement(Single, {
                timeline,
                initialValue: { opacity: 0.25 },
                resolver: widthResolver,
                onRender: (r) => {
                    style = r.style
                },
            })
        )
        expect(style).toEqual(
            createStyleSheet({ opacity: 0.25 }, widthResolver)
        )
        expect(byId(view.container, 'el')?.style.width).toBe('25px')

        await act(async () => {
            void timeline.play({ from: { opacity: 0 } })
            m.frame(500)
        })
        expect(byId(view.container, 'el')?.style.width).toBe('50px')
    })

    it('B3: the ref callback is stable across renders of the same timeline', async () => {
        const m = manualClock()
        const timeline = rafTimeline(node(), m.clock)
        const refs: ElementRef[] = []
        const view = await mount(
            createElement(Single, {
                timeline,
                tick: 0,
                onRender: (r) => refs.push(r.ref),
            })
        )
        await view.rerender(
            createElement(Single, {
                timeline,
                tick: 1,
                onRender: (r) => refs.push(r.ref),
            })
        )
        await view.rerender(
            createElement(Single, {
                timeline,
                tick: 2,
                onRender: (r) => refs.push(r.ref),
            })
        )
        expect(refs.length).toBeGreaterThanOrEqual(3)
        expect(typeof refs[0]).toBe('function')
        expect(new Set(refs).size).toBe(1)
    })

    it('B4: detaching the element unbinds it, attaching another binds that one', async () => {
        const m = manualClock()
        const timeline = rafTimeline(node(), m.clock)
        const track = trackBind(timeline)
        const view = await mount(createElement(Single, { timeline }))
        const first = byId(view.container, 'el')
        expect(track.live).toBe(1)

        await act(async () => {
            void timeline.play({ from: { opacity: 0 } })
            m.frame(250)
        })
        expect(opacityOf(first)).toBeCloseTo(0.25, 5)

        await view.rerender(createElement(Single, { timeline, show: false }))
        expect(track.live).toBe(0)
        await act(async () => {
            m.frame(250)
        })
        expect(opacityOf(first)).toBeCloseTo(0.25, 5)

        await view.rerender(createElement(Single, { timeline, show: true }))
        const second = byId(view.container, 'el')
        expect(second).not.toBe(first)
        expect(track.live).toBe(1)
        // a bind of a timeline that has a value writes it at once
        expect(opacityOf(second)).toBeCloseTo(0.5, 5)
        await act(async () => {
            m.frame(250)
        })
        expect(opacityOf(second)).toBeCloseTo(0.75, 5)
        expect(opacityOf(first)).toBeCloseTo(0.25, 5)
    })

    it('B5: unmount unbinds and never disposes the timeline it was given', async () => {
        const m = manualClock()
        const timeline = rafTimeline(node(), m.clock)
        const dispose = vi.spyOn(timeline, 'dispose')
        const track = trackBind(timeline)
        const view = await mount(createElement(Single, { timeline }))
        expect(track.live).toBe(1)
        await view.unmount()
        expect(track.live).toBe(0)
        expect(dispose).not.toHaveBeenCalled()
    })

    it('B6: a new timeline rebinds the current element', async () => {
        const m = manualClock()
        const t1 = rafTimeline(node(1), m.clock)
        const t2 = rafTimeline(node(0.5), m.clock)
        const track1 = trackBind(t1)
        const track2 = trackBind(t2)
        const view = await mount(createElement(Single, { timeline: t1 }))
        const el = byId(view.container, 'el')
        expect(track1.live).toBe(1)

        await act(async () => {
            void t1.play({ from: { opacity: 0 } })
            m.frame(250)
        })
        expect(opacityOf(el)).toBeCloseTo(0.25, 5)

        await view.rerender(createElement(Single, { timeline: t2 }))
        expect(byId(view.container, 'el')).toBe(el)
        expect(track1.live).toBe(0)
        expect(track2.live).toBe(1)

        await act(async () => {
            void t2.play({ from: { opacity: 0 } })
            m.frame(250)
        })
        // t1 would be at 0.5 by now; t2 is at 0.125
        expect(opacityOf(el)).toBeCloseTo(0.125, 5)
    })

    it('B6: rebinding to a timeline that already has a value writes it at once', async () => {
        const m = manualClock()
        const t1 = rafTimeline(node(), m.clock)
        const t2 = rafTimeline(node(), m.clock)
        const view = await mount(createElement(Single, { timeline: t1 }))
        const el = byId(view.container, 'el')

        await act(async () => {
            void t2.play({ from: { opacity: 0 } })
            m.frame(300)
        })
        expect(el?.style.opacity).toBe('')

        await view.rerender(createElement(Single, { timeline: t2 }))
        expect(opacityOf(el)).toBeCloseTo(0.3, 5)
    })

    it('B7: binds an element rendered by a child component that mounts later', async () => {
        const m = manualClock()
        const timeline = rafTimeline(node(), m.clock)
        const track = trackBind(timeline)
        function Child(props: { show: boolean; target: ElementRef }) {
            return props.show
                ? createElement('div', { id: 'el', ref: props.target })
                : null
        }
        function Parent(props: { show: boolean }) {
            const { ref } = useAniRef(timeline)
            return createElement(Child, { show: props.show, target: ref })
        }
        const view = await mount(createElement(Parent, { show: false }))
        expect(track.live).toBe(0)

        await act(async () => {
            void timeline.play({ from: { opacity: 0 } })
            m.frame(500)
        })
        await view.rerender(createElement(Parent, { show: true }))
        expect(track.live).toBe(1)
        expect(opacityOf(byId(view.container, 'el'))).toBeCloseTo(0.5, 5)

        await act(async () => {
            m.frame(250)
        })
        expect(opacityOf(byId(view.container, 'el'))).toBeCloseTo(0.75, 5)

        await view.rerender(createElement(Parent, { show: false }))
        expect(track.live).toBe(0)
    })

    it('B8: re-rendering the owner does not reset an animated style', async () => {
        const m = manualClock()
        const timeline = rafTimeline(node(), m.clock)
        const view = await mount(
            createElement(Single, {
                timeline,
                initialValue: { opacity: 0.25 },
                tick: 0,
            })
        )
        const el = byId(view.container, 'el')
        await act(async () => {
            void timeline.play({ from: { opacity: 0 } })
            m.frame(500)
        })
        expect(opacityOf(el)).toBeCloseTo(0.5, 5)

        await view.rerender(
            createElement(Single, {
                timeline,
                initialValue: { opacity: 0.25 },
                tick: 1,
            })
        )
        expect(opacityOf(el)).toBeCloseTo(0.5, 5)
    })

    it('B9: stays bound exactly once under StrictMode', async () => {
        const m = manualClock()
        const timeline = rafTimeline(node(), m.clock)
        const track = trackBind(timeline)
        const view = await mount(createElement(Single, { timeline }), {
            strict: true,
        })
        const el = byId(view.container, 'el')
        expect(track.live).toBe(1)
        await act(async () => {
            void timeline.play({ from: { opacity: 0 } })
            m.frame(500)
        })
        expect(opacityOf(el)).toBeCloseTo(0.5, 5)
        await view.unmount()
        expect(track.live).toBe(0)
    })

    it('B10: the events / cleanupEvents options are gone: no listener is added to the element', async () => {
        const m = manualClock()
        const timeline = rafTimeline(node(), m.clock)
        const handler = vi.fn()
        const added: string[] = []
        const proto = HTMLElement.prototype
        const original = proto.addEventListener
        proto.addEventListener = function (
            this: HTMLElement,
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | AddEventListenerOptions
        ) {
            if (this.id === 'el') added.push(type)
            return original.call(this, type, listener, options)
        } as typeof proto.addEventListener
        try {
            function C() {
                const { ref } = (
                    useAniRef as unknown as (
                        timeline: RafTimeline<Opacity>,
                        options: Record<string, unknown>
                    ) => RefResult
                )(timeline, {
                    events: { onClick: handler },
                    cleanupEvents: false,
                })
                return createElement('div', { id: 'el', ref })
            }
            const view = await mount(createElement(C))
            const el = byId(view.container, 'el')
            await act(async () => {
                void timeline.play({ from: { opacity: 0 } })
                m.frame(500)
                el?.click()
            })
            // the element is still driven by the timeline
            expect(opacityOf(el)).toBeCloseTo(0.5, 5)
            expect(added).toEqual([])
            expect(handler).not.toHaveBeenCalled()
        } finally {
            proto.addEventListener = original
        }
    })
})

// ---------------------------------------------------------------------------
// useAniGroup
// ---------------------------------------------------------------------------

describe('FREACT: useAniGroup', () => {
    function List(props: {
        group: RafGroup<Opacity>
        count: number
        initialValue?: Opacity
        tick?: number
        onRender?: (result: GroupResult) => void
    }) {
        const options: { initialValue?: Opacity } = {}
        if (props.initialValue) options.initialValue = props.initialValue
        const result = useAniGroup(props.group, options)
        props.onRender?.(result)
        return createElement(
            'div',
            null,
            ...Array.from({ length: props.count }, (_, index) =>
                createElement('div', {
                    key: index,
                    id: `el${index}`,
                    ref: result.ref(index),
                    style: result.style,
                })
            ),
            createElement('i', null, props.tick ?? 0)
        )
    }

    const makeGroup = (clock: ReturnType<typeof manualClock>['clock']) =>
        rafGroup(node(), { clock, stagger: 0.25 })

    it('C1: ref(index) returns the same function per index across renders', async () => {
        const m = manualClock()
        const group = makeGroup(m.clock)
        const seen: GroupResult[] = []
        const view = await mount(
            createElement(List, {
                group,
                count: 2,
                tick: 0,
                onRender: (r) => seen.push(r),
            })
        )
        await view.rerender(
            createElement(List, {
                group,
                count: 2,
                tick: 1,
                onRender: (r) => seen.push(r),
            })
        )
        const first = seen[0]!
        const last = seen[seen.length - 1]!
        expect(last.ref(0)).toBe(first.ref(0))
        expect(last.ref(1)).toBe(first.ref(1))
        expect(first.ref(0)).toBe(first.ref(0))
        expect(first.ref(0)).not.toBe(first.ref(1))
    })

    it('C2: binds every element at its index, without re-rendering per frame', async () => {
        const m = manualClock()
        const group = makeGroup(m.clock)
        const track = trackBindAt(group)
        let renders = 0
        const view = await mount(
            createElement(List, { group, count: 3, onRender: () => renders++ })
        )
        expect(track.live).toBe(3)
        expect([track.at(0), track.at(1), track.at(2)]).toEqual([1, 1, 1])
        const before = renders

        await act(async () => {
            void group.play({ from: { opacity: 0 }, count: 3 })
            m.frame(500)
        })
        expect(opacityOf(byId(view.container, 'el0'))).toBeCloseTo(0.5, 5)
        expect(opacityOf(byId(view.container, 'el1'))).toBeCloseTo(0.25, 5)
        expect(opacityOf(byId(view.container, 'el2'))).toBeCloseTo(0, 5)
        expect(renders).toBe(before)
    })

    it('C3: removing an element unbinds only its index', async () => {
        const m = manualClock()
        const group = makeGroup(m.clock)
        const track = trackBindAt(group)
        const view = await mount(createElement(List, { group, count: 3 }))
        const removed = byId(view.container, 'el2')
        await act(async () => {
            void group.play({ from: { opacity: 0 }, count: 3 })
            m.frame(500)
        })

        await view.rerender(createElement(List, { group, count: 2 }))
        expect(track.live).toBe(2)
        expect([track.at(0), track.at(1), track.at(2)]).toEqual([1, 1, 0])

        await act(async () => {
            m.frame(500)
        })
        expect(opacityOf(byId(view.container, 'el0'))).toBeCloseTo(1, 5)
        expect(opacityOf(byId(view.container, 'el1'))).toBeCloseTo(0.75, 5)
        expect(opacityOf(removed)).toBeCloseTo(0, 5)
    })

    it('C4: unmount unbinds every index and never disposes the group', async () => {
        const m = manualClock()
        const group = makeGroup(m.clock)
        const dispose = vi.spyOn(group, 'dispose')
        const track = trackBindAt(group)
        const view = await mount(createElement(List, { group, count: 3 }))
        expect(track.live).toBe(3)
        await view.unmount()
        expect(track.live).toBe(0)
        expect(dispose).not.toHaveBeenCalled()
    })

    it('C5: a new group rebinds the current elements', async () => {
        const m = manualClock()
        const g1 = makeGroup(m.clock)
        const g2 = rafGroup(node(0.5), { clock: m.clock, stagger: 0.25 })
        const track1 = trackBindAt(g1)
        const track2 = trackBindAt(g2)
        const view = await mount(createElement(List, { group: g1, count: 2 }))
        const el0 = byId(view.container, 'el0')
        const el1 = byId(view.container, 'el1')
        expect(track1.live).toBe(2)

        await view.rerender(createElement(List, { group: g2, count: 2 }))
        expect(byId(view.container, 'el0')).toBe(el0)
        expect(track1.live).toBe(0)
        expect(track2.live).toBe(2)

        await act(async () => {
            void g2.play({ from: { opacity: 0 }, count: 2 })
            m.frame(500)
        })
        expect(opacityOf(el0)).toBeCloseTo(0.25, 5)
        expect(opacityOf(el1)).toBeCloseTo(0.125, 5)
    })

    it('C6: style is undefined without initialValue and the stable initial style with it', async () => {
        const m = manualClock()
        const group = makeGroup(m.clock)
        const bare: Array<CSSProperties | undefined> = []
        const view = await mount(
            createElement(List, {
                group,
                count: 1,
                onRender: (r) => bare.push(r.style),
            })
        )
        expect(bare.every((s) => s === undefined)).toBe(true)
        await view.unmount()

        const styled: Array<CSSProperties | undefined> = []
        const view2 = await mount(
            createElement(List, {
                group,
                count: 2,
                tick: 0,
                initialValue: { opacity: 0.25 },
                onRender: (r) => styled.push(r.style),
            })
        )
        expect(opacityOf(byId(view2.container, 'el0'))).toBe(0.25)
        expect(opacityOf(byId(view2.container, 'el1'))).toBe(0.25)
        await view2.rerender(
            createElement(List, {
                group,
                count: 2,
                tick: 1,
                initialValue: { opacity: 0.25 },
                onRender: (r) => styled.push(r.style),
            })
        )
        expect(styled[0]).toEqual(createStyleSheet({ opacity: 0.25 }))
        expect(new Set(styled).size).toBe(1)
    })

    it('C7: binds elements of a child component that mounts later', async () => {
        const m = manualClock()
        const group = makeGroup(m.clock)
        const track = trackBindAt(group)
        function Item(props: { index: number; target: ElementRef }) {
            return createElement('div', {
                id: `el${props.index}`,
                ref: props.target,
            })
        }
        function Parent(props: { count: number }) {
            const { ref } = useAniGroup(group)
            return createElement(
                'div',
                null,
                ...Array.from({ length: props.count }, (_, index) =>
                    createElement(Item, {
                        key: index,
                        index,
                        target: ref(index),
                    })
                )
            )
        }
        const view = await mount(createElement(Parent, { count: 0 }))
        expect(track.live).toBe(0)

        await act(async () => {
            void group.play({ from: { opacity: 0 }, count: 3 })
            m.frame(500)
        })
        await view.rerender(createElement(Parent, { count: 2 }))
        expect(track.live).toBe(2)
        expect(opacityOf(byId(view.container, 'el0'))).toBeCloseTo(0.5, 5)
        expect(opacityOf(byId(view.container, 'el1'))).toBeCloseTo(0.25, 5)
    })

    it('C8: stays bound exactly once per index under StrictMode', async () => {
        const m = manualClock()
        const group = makeGroup(m.clock)
        const track = trackBindAt(group)
        const view = await mount(createElement(List, { group, count: 2 }), {
            strict: true,
        })
        expect(track.live).toBe(2)
        await act(async () => {
            void group.play({ from: { opacity: 0 }, count: 2 })
            m.frame(500)
        })
        expect(opacityOf(byId(view.container, 'el0'))).toBeCloseTo(0.5, 5)
        expect(opacityOf(byId(view.container, 'el1'))).toBeCloseTo(0.25, 5)
        await view.unmount()
        expect(track.live).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// useAniStates
// ---------------------------------------------------------------------------

describe('FREACT: useAniStates', () => {
    const config = (
        clock: ReturnType<typeof manualClock>['clock'],
        extra: Record<string, unknown> = {}
    ): StatesConfig =>
        ({
            initial: 'idle',
            initialValue: { opacity: 0 },
            states: makeStates(),
            clock,
            ...extra,
        }) as unknown as StatesConfig

    function View(props: {
        config: StatesConfig
        show?: boolean
        tick?: number
        onRender?: (result: StatesResult) => void
    }) {
        const result = useAniStates(props.config)
        props.onRender?.(result)
        return createElement(
            'div',
            null,
            createElement('span', { id: 'state' }, String(result.state)),
            props.show === false
                ? null
                : createElement('div', {
                      id: 'el',
                      ref: result.ref,
                      style: result.style,
                  }),
            createElement('i', null, props.tick ?? 0)
        )
    }

    const stateText = (container: HTMLElement) =>
        byId(container, 'state')?.textContent

    it('D1: returns ref, style, state, transitionTo and the machine', async () => {
        const m = manualClock()
        let result!: StatesResult
        const view = await mount(
            createElement(View, {
                config: config(m.clock, { initialValue: { opacity: 0.25 } }),
                onRender: (r) => {
                    result = r
                },
            })
        )
        expect(typeof result.ref).toBe('function')
        expect(typeof result.transitionTo).toBe('function')
        expect(result.state).toBe('idle')
        expect(result.style).toEqual(createStyleSheet({ opacity: 0.25 }))
        expect(result.machine.state()).toBe('idle')
        expect(typeof result.machine.transitionTo).toBe('function')
        expect(opacityOf(byId(view.container, 'el'))).toBe(0.25)
    })

    it('D2: transitionTo re-renders `state`, runs the element and resolves ended', async () => {
        const m = manualClock()
        let result!: StatesResult
        let renders = 0
        const view = await mount(
            createElement(View, {
                config: config(m.clock),
                onRender: (r) => {
                    result = r
                    renders++
                },
            })
        )
        const el = byId(view.container, 'el')
        expect(stateText(view.container)).toBe('idle')

        let run!: Promise<RunResult>
        await act(async () => {
            run = result.transitionTo('active')
        })
        expect(stateText(view.container)).toBe('active')
        const afterTransition = renders

        await act(async () => {
            m.frame(500)
        })
        expect(opacityOf(el)).toBeCloseTo(0.5, 5)
        expect(renders).toBe(afterTransition)

        await act(async () => {
            m.frame(1000)
            m.frame(1000)
        })
        expect(await run).toBe('ended')
        expect(opacityOf(el)).toBe(1)
        expect(result.machine.value).toEqual({ opacity: 1 })
    })

    it('D2: a transition issued on the machine directly re-renders `state`', async () => {
        const m = manualClock()
        let result!: StatesResult
        const view = await mount(
            createElement(View, {
                config: config(m.clock),
                onRender: (r) => {
                    result = r
                },
            })
        )
        await act(async () => {
            void result.machine.transitionTo('active')
        })
        expect(stateText(view.container)).toBe('active')
        await act(async () => {
            void result.machine.transitionTo('idle')
        })
        expect(stateText(view.container)).toBe('idle')
    })

    it('D3: transitionTo, machine and ref are stable; a second transition interrupts the first', async () => {
        const m = manualClock()
        const seen: StatesResult[] = []
        const cfg = config(m.clock)
        const view = await mount(
            createElement(View, {
                config: cfg,
                tick: 0,
                onRender: (r) => seen.push(r),
            })
        )
        await view.rerender(
            createElement(View, {
                config: cfg,
                tick: 1,
                onRender: (r) => seen.push(r),
            })
        )
        expect(seen.length).toBeGreaterThanOrEqual(2)
        expect(new Set(seen.map((r) => r.transitionTo)).size).toBe(1)
        expect(new Set(seen.map((r) => r.machine)).size).toBe(1)
        expect(new Set(seen.map((r) => r.ref)).size).toBe(1)

        const hook = seen[seen.length - 1]!
        let first!: Promise<RunResult>
        let second!: Promise<RunResult>
        await act(async () => {
            first = hook.transitionTo('active')
            m.frame(500)
            second = hook.transitionTo('idle')
        })
        expect(await first).toBe('interrupted')
        await act(async () => {
            m.frame(1000)
            m.frame(1000)
        })
        expect(await second).toBe('ended')
        expect(stateText(view.container)).toBe('idle')
    })

    it('D4: props are read on the first render only', async () => {
        const m = manualClock()
        const seen: StatesResult[] = []
        const view = await mount(
            createElement(View, {
                config: config(m.clock),
                tick: 0,
                onRender: (r) => seen.push(r),
            })
        )
        const machine = seen[0]!.machine
        await view.rerender(
            createElement(View, {
                config: config(m.clock, {
                    initial: 'active',
                    initialValue: { opacity: 1 },
                }),
                tick: 1,
                onRender: (r) => seen.push(r),
            })
        )
        const last = seen[seen.length - 1]!
        expect(last.machine).toBe(machine)
        expect(last.state).toBe('idle')
        expect(stateText(view.container)).toBe('idle')
    })

    it('D5: unmount disposes the machine', async () => {
        const m = manualClock()
        let result!: StatesResult
        const view = await mount(
            createElement(View, {
                config: config(m.clock),
                onRender: (r) => {
                    result = r
                },
            })
        )
        const machine = result.machine
        void machine.transitionTo('active')
        expect(m.clock.size).toBe(1)
        await view.unmount()
        expect(m.clock.size).toBe(0)
        expect(await machine.transitionTo('active')).toBe('disposed')
    })

    it('D6: survives StrictMode: the machine in use is alive and transitions work', async () => {
        const m = manualClock()
        let result!: StatesResult
        const view = await mount(
            createElement(View, {
                config: config(m.clock),
                onRender: (r) => {
                    result = r
                },
            }),
            { strict: true }
        )
        const el = byId(view.container, 'el')
        let run!: Promise<RunResult>
        await act(async () => {
            run = result.transitionTo('active')
        })
        expect(stateText(view.container)).toBe('active')
        await act(async () => {
            m.frame(500)
        })
        expect(opacityOf(el)).toBeCloseTo(0.5, 5)
        await act(async () => {
            m.frame(1000)
            m.frame(1000)
        })
        expect(await run).toBe('ended')
        expect(opacityOf(el)).toBe(1)

        const machine = result.machine
        await view.unmount()
        expect(await machine.transitionTo('idle')).toBe('disposed')
    })

    it('D7: detaching the element unbinds it; a later element is bound to the current value', async () => {
        const m = manualClock()
        let result!: StatesResult
        const onRender = (r: StatesResult) => {
            result = r
        }
        const cfg = config(m.clock)
        const view = await mount(createElement(View, { config: cfg, onRender }))
        const first = byId(view.container, 'el')
        await act(async () => {
            void result.transitionTo('active')
            m.frame(250)
        })
        expect(opacityOf(first)).toBeCloseTo(0.25, 5)

        await view.rerender(
            createElement(View, { config: cfg, show: false, onRender })
        )
        await act(async () => {
            m.frame(250)
        })
        expect(opacityOf(first)).toBeCloseTo(0.25, 5)

        await view.rerender(
            createElement(View, { config: cfg, show: true, onRender })
        )
        const second = byId(view.container, 'el')
        expect(second).not.toBe(first)
        expect(opacityOf(second)).toBeCloseTo(0.5, 5)
        await act(async () => {
            m.frame(250)
        })
        expect(opacityOf(second)).toBeCloseTo(0.75, 5)
        expect(opacityOf(first)).toBeCloseTo(0.25, 5)
    })

    it('D8: the resolver option shapes the written declarations', async () => {
        const m = manualClock()
        let result!: StatesResult
        const view = await mount(
            createElement(View, {
                config: config(m.clock, { resolver: widthResolver }),
                onRender: (r) => {
                    result = r
                },
            })
        )
        const el = byId(view.container, 'el')
        expect(result.style).toEqual(
            createStyleSheet({ opacity: 0 }, widthResolver)
        )
        await act(async () => {
            void result.transitionTo('active')
            m.frame(500)
        })
        expect(el?.style.width).toBe('50px')
    })

    it('D9: binds an element that a child component renders later', async () => {
        const m = manualClock()
        const cfg = config(m.clock)
        let result!: StatesResult
        function Child(props: { show: boolean; target: ElementRef }) {
            return props.show
                ? createElement('div', { id: 'el', ref: props.target })
                : null
        }
        function Parent(props: { show: boolean }) {
            result = useAniStates(cfg)
            return createElement(Child, {
                show: props.show,
                target: result.ref,
            })
        }
        const view = await mount(createElement(Parent, { show: false }))
        await act(async () => {
            void result.transitionTo('active')
            m.frame(500)
        })
        await view.rerender(createElement(Parent, { show: true }))
        expect(opacityOf(byId(view.container, 'el'))).toBeCloseTo(0.5, 5)
        await act(async () => {
            m.frame(250)
        })
        expect(opacityOf(byId(view.container, 'el'))).toBeCloseTo(0.75, 5)
    })
})

// ---------------------------------------------------------------------------
// useFollow
// ---------------------------------------------------------------------------

describe('FREACT: useFollow', () => {
    function Chaser(props: {
        initial?: Opacity
        resolver?: ResolverOf
        clock: ReturnType<typeof manualClock>['clock']
        show?: boolean
        tick?: number
        onRender?: (result: FollowResult) => void
    }) {
        const options: FollowOptions & { resolver?: ResolverOf } = {
            clock: props.clock,
        }
        if (props.resolver) options.resolver = props.resolver
        const result = useFollow(props.initial ?? { opacity: 0.25 }, options)
        props.onRender?.(result)
        const children: ReactNode[] = []
        if (props.show !== false) {
            children.push(
                createElement('div', {
                    key: 'el',
                    id: 'el',
                    ref: result.ref,
                    style: result.style,
                })
            )
        }
        children.push(createElement('i', { key: 'i' }, props.tick ?? 0))
        return createElement('div', null, ...children)
    }

    const settle = (
        m: ReturnType<typeof manualClock>,
        f: Follower<Opacity>
    ) => {
        for (let i = 0; i < 2000 && f.status === 'PLAYING'; i++) m.frame(16)
        expect(f.status).toBe('IDLE')
    }

    it('E1: style is the stable initial style and follower is stable across renders', async () => {
        const m = manualClock()
        const seen: FollowResult[] = []
        const view = await mount(
            createElement(Chaser, {
                clock: m.clock,
                tick: 0,
                onRender: (r) => seen.push(r),
            })
        )
        expect(opacityOf(byId(view.container, 'el'))).toBe(0.25)
        await view.rerender(
            createElement(Chaser, {
                clock: m.clock,
                tick: 1,
                onRender: (r) => seen.push(r),
            })
        )
        expect(seen.length).toBeGreaterThanOrEqual(2)
        expect(seen[0]?.style).toEqual(createStyleSheet({ opacity: 0.25 }))
        expect(new Set(seen.map((r) => r.style)).size).toBe(1)
        expect(new Set(seen.map((r) => r.follower)).size).toBe(1)
        expect(new Set(seen.map((r) => r.ref)).size).toBe(1)
        expect(seen[0]?.follower.value).toEqual({ opacity: 0.25 })
    })

    it('E2: the element chases the target without re-rendering the owner', async () => {
        const m = manualClock()
        let result!: FollowResult
        let renders = 0
        const view = await mount(
            createElement(Chaser, {
                clock: m.clock,
                onRender: (r) => {
                    result = r
                    renders++
                },
            })
        )
        const el = byId(view.container, 'el')
        const before = renders
        let run!: Promise<RunResult>
        await act(async () => {
            run = result.follower.set({ opacity: 1 })
            for (let i = 0; i < 5; i++) m.frame(16)
        })
        expect(result.follower.status).toBe('PLAYING')
        expect(opacityOf(el)).toBeGreaterThan(0.25)
        expect(opacityOf(el)).toBeLessThan(1)
        expect(opacityOf(el)).toBeCloseTo(result.follower.value.opacity, 5)

        await act(async () => {
            settle(m, result.follower)
        })
        expect(await run).toBe('ended')
        expect(opacityOf(el)).toBeCloseTo(1, 2)
        expect(renders).toBe(before)
    })

    it('E3: jump writes the bound element synchronously', async () => {
        const m = manualClock()
        let result!: FollowResult
        const view = await mount(
            createElement(Chaser, {
                clock: m.clock,
                onRender: (r) => {
                    result = r
                },
            })
        )
        const el = byId(view.container, 'el')
        await act(async () => {
            result.follower.jump({ opacity: 0.75 })
        })
        expect(opacityOf(el)).toBe(0.75)
        expect(result.follower.target).toEqual({ opacity: 0.75 })
    })

    it('E4: the resolver option shapes the style and the writes', async () => {
        const m = manualClock()
        let result!: FollowResult
        const view = await mount(
            createElement(Chaser, {
                clock: m.clock,
                resolver: widthResolver,
                onRender: (r) => {
                    result = r
                },
            })
        )
        const el = byId(view.container, 'el')
        expect(result.style).toEqual(
            createStyleSheet({ opacity: 0.25 }, widthResolver)
        )
        expect(el?.style.width).toBe('25px')
        await act(async () => {
            result.follower.jump({ opacity: 0.5 })
        })
        expect(el?.style.width).toBe('50px')
    })

    it('E5: unmount disposes the follower and releases the clock', async () => {
        const m = manualClock()
        let result!: FollowResult
        const view = await mount(
            createElement(Chaser, {
                clock: m.clock,
                onRender: (r) => {
                    result = r
                },
            })
        )
        const follower = result.follower
        void follower.set({ opacity: 1 })
        expect(m.clock.size).toBe(1)
        await view.unmount()
        expect(m.clock.size).toBe(0)
        expect(await follower.set({ opacity: 0 })).toBe('disposed')
    })

    it('E6: survives StrictMode: the follower in use is alive and bound', async () => {
        const m = manualClock()
        let result!: FollowResult
        const view = await mount(
            createElement(Chaser, {
                clock: m.clock,
                onRender: (r) => {
                    result = r
                },
            }),
            { strict: true }
        )
        const el = byId(view.container, 'el')
        await act(async () => {
            result.follower.jump({ opacity: 0.5 })
        })
        expect(opacityOf(el)).toBe(0.5)

        let run!: Promise<RunResult>
        await act(async () => {
            run = result.follower.set({ opacity: 1 })
            settle(m, result.follower)
        })
        expect(await run).toBe('ended')
        expect(opacityOf(el)).toBeCloseTo(1, 2)

        const follower = result.follower
        await view.unmount()
        expect(await follower.set({ opacity: 0 })).toBe('disposed')
    })

    it('E7: detaching the element unbinds it; a later element is bound to the current value', async () => {
        const m = manualClock()
        let result!: FollowResult
        const onRender = (r: FollowResult) => {
            result = r
        }
        const view = await mount(
            createElement(Chaser, { clock: m.clock, onRender })
        )
        const first = byId(view.container, 'el')
        await act(async () => {
            result.follower.jump({ opacity: 0.5 })
        })
        await view.rerender(
            createElement(Chaser, { clock: m.clock, show: false, onRender })
        )
        await act(async () => {
            result.follower.jump({ opacity: 0.75 })
        })
        expect(opacityOf(first)).toBe(0.5)

        await view.rerender(
            createElement(Chaser, { clock: m.clock, show: true, onRender })
        )
        const second = byId(view.container, 'el')
        expect(second).not.toBe(first)
        expect(opacityOf(second)).toBe(0.75)
        await act(async () => {
            result.follower.jump({ opacity: 0.9 })
        })
        expect(opacityOf(second)).toBe(0.9)
        expect(opacityOf(first)).toBe(0.5)
    })
})

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

describe('FREACT: surface', () => {
    it('G1: exports the six primitives and none of the removed event machinery', () => {
        const exports = lib as unknown as Record<string, unknown>
        for (const name of [
            'useTimeline',
            'useAni',
            'useAniRef',
            'useAniGroup',
            'useAniStates',
            'useFollow',
        ]) {
            expect(typeof exports[name], name).toBe('function')
        }
        expect(exports.EventManager).toBeUndefined()
        expect(exports.AniRefContext).toBeUndefined()
    })
})
