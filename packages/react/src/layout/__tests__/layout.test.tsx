// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import type {
    LayoutGroup as CoreLayoutGroup,
    LayoutGroupOptions,
    LayoutOptions,
    LayoutReport,
} from '@freestylejs/ani-layout'
import { createRef, memo, type RefObject, StrictMode, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../../core/src/testing/index'
import { act, mount } from '../../__tests__/helpers'
import {
    AnimatePresence,
    LayoutGroup,
    useLayout,
    useLayoutGroup,
    usePresence,
} from '..'
import { createLayoutScope, rootScope } from '../context'

/** A recording stand-in for the core group: the adapter calls only its public API. */
interface Fake {
    readonly options: LayoutGroupOptions
    readonly members: Map<HTMLElement, LayoutOptions>
    readonly calls: string[]
    disposed: boolean
}

const recorder = vi.hoisted(() => ({
    fakes: [] as Fake[],
    onCapture: null as (() => void) | null,
    onFlush: null as (() => void) | null,
}))

vi.mock('@freestylejs/ani-layout', async (original) => {
    const actual = await original<typeof import('@freestylejs/ani-layout')>()
    const NO_CHANGE: LayoutReport = { status: 'no-change', snapped: [] }
    return {
        ...actual,
        createLayoutGroup(options: LayoutGroupOptions = {}): CoreLayoutGroup {
            const fake: Fake = {
                options,
                members: new Map(),
                calls: [],
                disposed: false,
            }
            recorder.fakes.push(fake)
            const group: CoreLayoutGroup = {
                add(element, layoutOptions) {
                    fake.calls.push('add')
                    fake.members.set(element, layoutOptions ?? {})
                    return () => {
                        fake.calls.push('remove')
                        fake.members.delete(element)
                    }
                },
                set(element, layoutOptions) {
                    fake.calls.push('set')
                    fake.members.set(element, layoutOptions)
                },
                capture() {
                    fake.calls.push('capture')
                    recorder.onCapture?.()
                },
                flush() {
                    fake.calls.push('flush')
                    recorder.onFlush?.()
                    return Promise.resolve(NO_CHANGE)
                },
                update(mutate) {
                    group.capture()
                    mutate()
                    return group.flush()
                },
                finish() {
                    fake.calls.push('finish')
                },
                dispose() {
                    fake.calls.push('dispose')
                    fake.disposed = true
                },
                stats: {
                    captures: 0,
                    reads: 0,
                    rects: 0,
                    offsets: 0,
                    styles: 0,
                    tracks: 0,
                    holds: 0,
                },
            }
            return group
        },
    }
})

const flushes = (fake: Fake): number =>
    fake.calls.filter((call) => call === 'flush').length

/** The groups that hold participants (StrictMode may create a spare one in render). */
const live = (): Fake[] =>
    recorder.fakes.filter((fake) => !fake.disposed && fake.members.size > 0)

const settle = () => act(async () => undefined)
const noop = (): void => undefined

beforeEach(() => {
    recorder.fakes.length = 0
    recorder.onCapture = null
    recorder.onFlush = null
})

afterEach(async () => {
    await settle()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

function Item({ id, ...options }: { id: string } & LayoutOptions) {
    const ref = useLayout<HTMLLIElement>(options)
    return <li ref={ref} data-id={id} />
}

function List({ ids, ...group }: { ids: string[] } & LayoutGroupOptions) {
    return (
        <LayoutGroup {...group}>
            <ul>
                {ids.map((id) => (
                    <Item key={id} id={id} />
                ))}
            </ul>
        </LayoutGroup>
    )
}

const order = (container: HTMLElement): string =>
    [...container.querySelectorAll('li')].map((li) => li.dataset.id).join('')

describe('react layout adapter', () => {
    it('captures in render, before React mutates, and flushes once per commit', async () => {
        const view = await mount(<List ids={['a', 'b', 'c']} />)
        try {
            const [fake] = live()
            expect(live()).toHaveLength(1)
            expect(fake!.members.size).toBe(3)
            const seen: string[] = []
            recorder.onCapture = () => seen.push(order(view.container))
            recorder.onFlush = () => seen.push(`flush ${order(view.container)}`)
            const before = flushes(fake!)

            await view.rerender(<List ids={['c', 'a', 'b']} />)
            await settle()

            expect(flushes(fake!) - before).toBe(1)
            // every capture saw the old DOM; the flush the new one
            expect(seen.at(-1)).toBe('flush cab')
            expect(seen.slice(0, -1).length).toBeGreaterThan(0)
            expect(new Set(seen.slice(0, -1))).toEqual(new Set(['abc']))
        } finally {
            await view.unmount()
        }
    })

    it('keeps one scope under StrictMode and flushes once per commit', async () => {
        const view = await mount(
            <StrictMode>
                <List ids={['a', 'b']} />
            </StrictMode>
        )
        try {
            await settle()
            expect(live()).toHaveLength(1)
            const [fake] = live()
            expect(fake!.disposed).toBe(false)
            const before = flushes(fake!)
            await view.rerender(
                <StrictMode>
                    <List ids={['b', 'a']} />
                </StrictMode>
            )
            await settle()
            expect(flushes(fake!) - before).toBe(1)
            expect(fake!.disposed).toBe(false)
        } finally {
            await view.unmount()
        }
        await settle()
        expect(
            recorder.fakes.every(
                (fake) => fake.disposed || fake.members.size === 0
            )
        ).toBe(true)
    })

    it('disposes the outermost scope on unmount', async () => {
        const view = await mount(<List ids={['a']} />)
        const [fake] = live()
        await view.unmount()
        await settle()
        expect(fake!.disposed).toBe(true)
    })

    it('nests groups into one scope: namespaced ids, merged motion, a warning for scope options', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(noop)
        const spring = a.timing.spring({ m: 1, k: 300, c: 30 })
        function App() {
            return (
                <LayoutGroup id="page" motion={{ duration: 0.5 }}>
                    <LayoutGroup
                        id="card"
                        motion={{ delay: 0.1 }}
                        threshold={4}
                    >
                        <Item
                            id="x"
                            layoutId="hero"
                            motion={{ timing: spring }}
                        />
                    </LayoutGroup>
                </LayoutGroup>
            )
        }
        const view = await mount(<App />)
        try {
            expect(live()).toHaveLength(1)
            const [options] = [...live()[0]!.members.values()]
            expect(options).toEqual({
                layoutId: 'page/card/hero',
                // the kind-level merge: the curve layer keeps the timing kind,
                // so the outer duration stays
                motion: {
                    type: 'timing',
                    duration: 0.5,
                    delay: 0.1,
                    timing: spring,
                },
            })
            // the nested threshold is not a scope option
            expect(live()[0]!.options.threshold).toBeUndefined()
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('nested LayoutGroup')
            )
        } finally {
            await view.unmount()
        }
    })

    it('merges motion by kind: a spring group, a child duration, a child curve', async () => {
        const curve = a.timing.linear()
        function App() {
            return (
                <LayoutGroup motion={{ type: 'spring', bounce: 0.2 }}>
                    <LayoutGroup motion={{ delay: 0.05 }}>
                        <Item id="s" motion={{ duration: 0.3 }} />
                        <Item id="t" motion={{ timing: curve }} />
                    </LayoutGroup>
                </LayoutGroup>
            )
        }
        const view = await mount(<App />)
        try {
            const members = [...live()[0]!.members.values()]
            // `duration` never switches the kind: a 0.3 s spring
            expect(members[0]!.motion).toEqual({
                type: 'spring',
                duration: 0.3,
                delay: 0.05,
                bounce: 0.2,
            })
            // a curve switches to timing and drops the spring's own fields
            expect(members[1]!.motion).toEqual({
                type: 'timing',
                delay: 0.05,
                timing: curve,
            })
        } finally {
            await view.unmount()
        }
    })

    it('re-creates the scope when a scope option changes by value; onSnap is always the latest', async () => {
        const first = vi.fn()
        const second = vi.fn()
        const view = await mount(
            <List ids={['a', 'b']} threshold={2} onSnap={first} />
        )
        try {
            const [old] = live()
            await view.rerender(
                <List ids={['a', 'b']} threshold={2} onSnap={second} />
            )
            expect(live()).toEqual([old])
            const element = document.querySelector('li') as HTMLElement
            old!.options.onSnap?.(element, 'culled')
            expect(first).not.toHaveBeenCalled()
            expect(second).toHaveBeenCalledWith(element, 'culled')

            await view.rerender(
                <List ids={['a', 'b']} threshold={3} onSnap={second} />
            )
            await settle()
            expect(old!.disposed).toBe(true)
            const [next] = live()
            expect(next).not.toBe(old)
            expect(next!.options.threshold).toBe(3)
            expect(next!.members.size).toBe(2)
        } finally {
            await view.unmount()
        }
    })

    it('J-026: keeps the scope for an equal policy object, re-creates it for a changed one', async () => {
        const view = await mount(
            <List ids={['a', 'b']} reducedMotion={{ maxDuration: 0.1 }} />
        )
        try {
            const [old] = live()
            // a fresh object with the same value
            await view.rerender(
                <List ids={['a', 'b']} reducedMotion={{ maxDuration: 0.1 }} />
            )
            await settle()
            expect(old!.disposed).toBe(false)
            expect(live()).toEqual([old])

            await view.rerender(
                <List ids={['a', 'b']} reducedMotion={{ maxDuration: 0.2 }} />
            )
            await settle()
            expect(old!.disposed).toBe(true)
            const [next] = live()
            expect(next!.options.reducedMotion).toEqual({ maxDuration: 0.2 })
            expect(next!.members.size).toBe(2)
        } finally {
            await view.unmount()
        }
    })

    it('calls set only when a participant option changes by value', async () => {
        function App({ layout }: { layout: 'position' | 'size' }) {
            return (
                <LayoutGroup>
                    <Item
                        id="a"
                        layout={layout}
                        layoutAnchor={{ x: 0.5, y: 0 }}
                        // a new timing object every render, equal by value
                        motion={{
                            timing: a.timing.spring({ m: 1, k: 200, c: 20 }),
                        }}
                    />
                </LayoutGroup>
            )
        }
        const view = await mount(<App layout="position" />)
        try {
            const [fake] = live()
            await view.rerender(<App layout="position" />)
            expect(fake!.calls).not.toContain('set')
            await view.rerender(<App layout="size" />)
            expect(fake!.calls.filter((call) => call === 'set')).toHaveLength(1)
            expect([...fake!.members.values()][0]!.layout).toBe('size')
        } finally {
            await view.unmount()
        }
    })

    it('J-016: compares motion by effect: defaults, inherited fields, timings in any key order', async () => {
        function App({ motion }: { motion?: LayoutOptions['motion'] }) {
            return (
                <LayoutGroup
                    motion={{ duration: 1, timing: a.timing.linear() }}
                >
                    <Item id="a" {...(motion !== undefined && { motion })} />
                </LayoutGroup>
            )
        }
        const sets = (fake: Fake) =>
            fake.calls.filter((call) => call === 'set').length
        const view = await mount(<App />)
        try {
            const [fake] = live()
            // equal to what the participant already draws: no `set`
            for (const motion of [
                { duration: 1 },
                { delay: 0 },
                { duration: 1, delay: 0, timing: a.timing.linear() },
                {},
            ]) {
                await view.rerender(<App motion={motion} />)
            }
            expect(sets(fake!)).toBe(0)
            // a real change still reaches the scope
            await view.rerender(<App motion={{ delay: 0.1 }} />)
            expect(sets(fake!)).toBe(1)
        } finally {
            await view.unmount()
        }

        function Spring({ order }: { order: 'mkc' | 'ckm' | 'k' }) {
            const spring =
                order === 'mkc'
                    ? a.timing.spring({ m: 1, k: 200, c: 20 })
                    : order === 'ckm'
                      ? a.timing.spring({ c: 20, k: 200, m: 1 })
                      : a.timing.spring({ m: 1, k: 210, c: 20 })
            return (
                <LayoutGroup>
                    <Item id="b" motion={{ timing: spring }} />
                    <Item
                        id="c"
                        // the default timing, written out
                        motion={
                            order === 'mkc'
                                ? {}
                                : { duration: 0.35, timing: a.timing.easeOut() }
                        }
                    />
                </LayoutGroup>
            )
        }
        const springs = await mount(<Spring order="mkc" />)
        try {
            const fake = live().at(-1)!
            await springs.rerender(<Spring order="ckm" />)
            await springs.rerender(<Spring order="mkc" />)
            expect(sets(fake)).toBe(0)
            await springs.rerender(<Spring order="k" />)
            expect(sets(fake)).toBe(1)
        } finally {
            await springs.unmount()
        }
    })

    it('passes layoutDependency through on every change', async () => {
        function App({ dependency }: { dependency: number }) {
            return (
                <LayoutGroup>
                    <Item id="a" layoutDependency={dependency} />
                </LayoutGroup>
            )
        }
        const view = await mount(<App dependency={1} />)
        try {
            const [fake] = live()
            await view.rerender(<App dependency={1} />)
            expect(fake!.calls).not.toContain('set')
            await view.rerender(<App dependency={2} />)
            expect([...fake!.members.values()][0]).toEqual({
                layoutDependency: 2,
            })
        } finally {
            await view.unmount()
        }
    })

    it('joins an implicit root per document, disposed when its last participant leaves', async () => {
        const main = await mount(
            <ul>
                <Item id="a" />
                <Item id="b" />
            </ul>
        )
        const other = document.implementation.createHTMLDocument('other')
        const container = other.createElement('div')
        other.body.appendChild(container)
        const root = createRoot(container)
        try {
            await act(async () => {
                root.render(<Item id="c" />)
            })
            expect(live()).toHaveLength(2)
            const mainFake = live().find((fake) => fake.members.size === 2)!
            const otherFake = live().find((fake) => fake.members.size === 1)!
            expect([...otherFake.members.keys()][0]!.ownerDocument).toBe(other)

            await act(async () => {
                root.unmount()
            })
            await settle()
            expect(otherFake.disposed).toBe(true)
            expect(mainFake.disposed).toBe(false)
        } finally {
            await main.unmount()
        }
        await settle()
        expect(
            recorder.fakes.every(
                (fake) => fake.disposed || fake.members.size === 0
            )
        ).toBe(true)
    })

    it('J-029: AnimatePresence touches the implicit root of the document of its children', async () => {
        const clock = createManualClock()
        const fade = {
            present: { opacity: 1 },
            exit: a.ani({
                to: { opacity: 0 },
                duration: 0.1,
                timing: a.timing.linear(),
            }),
        }
        function Row() {
            const presence = usePresence(fade, { clock: clock.clock })
            return <li ref={presence.ref} data-id="row" />
        }
        const Sibling = memo(function Sibling() {
            return <Item id="sibling" />
        })
        let add: ((on: boolean) => void) | null = null
        function Adder() {
            const [on, set] = useState(false)
            add = set
            return on ? <Item id="added" /> : null
        }
        function App({ show }: { show: boolean }) {
            return (
                <ul>
                    <Adder />
                    <AnimatePresence initial={false}>
                        {show && <Row key="row" />}
                    </AnimatePresence>
                    <Sibling />
                </ul>
            )
        }
        // a root in the main document exists too
        const main = await mount(
            <ul>
                <Item id="m" />
            </ul>
        )
        const other = document.implementation.createHTMLDocument('other')
        const container = other.createElement('div')
        other.body.appendChild(container)
        const root = createRoot(container)
        try {
            await act(async () => {
                root.render(<App show={true} />)
            })
            const otherFake = live().find(
                (fake) => [...fake.members.keys()][0]!.ownerDocument === other
            )!
            const mainFake = live().find((fake) => fake !== otherFake)!
            await act(async () => {
                root.render(<App show={false} />)
            })
            otherFake.calls.length = 0
            mainFake.calls.length = 0
            const seen: boolean[] = []
            recorder.onCapture = () =>
                seen.push(other.querySelector('[data-id="row"]') !== null)
            // the exit ends: the settle commit renders AnimatePresence only
            await act(async () => {
                clock.frames(10)
            })
            await settle()
            expect(other.querySelector('[data-id="row"]')).toBeNull()
            // captured before React removed the row, flushed after
            expect(otherFake.calls).toEqual(['capture', 'flush'])
            expect(seen).toEqual([true])
            expect(mainFake.calls).toEqual([])

            // a participant's first render knows no document yet: it touches
            // every implicit root, so the memoized sibling it pushes is captured
            otherFake.calls.length = 0
            seen.length = 0
            recorder.onCapture = () =>
                seen.push(other.querySelector('[data-id="added"]') !== null)
            await act(async () => {
                add!(true)
            })
            await settle()
            expect(otherFake.calls).toEqual(['capture', 'add', 'flush'])
            // every capture (one per root) saw the DOM before the add
            expect(seen.length).toBeGreaterThan(0)
            expect(seen).not.toContain(true)

            // each root is still disposed on its own
            await act(async () => {
                root.unmount()
            })
            await settle()
            expect(otherFake.disposed).toBe(true)
            expect(mainFake.disposed).toBe(false)
        } finally {
            await main.unmount()
        }
    })

    it('keeps implicit roots of different clocks apart', () => {
        const first = a.createClock()
        const second = a.createClock()
        expect(rootScope(first, document)).toBe(rootScope(first, document))
        expect(rootScope(first, document)).not.toBe(rootScope(second, document))
        expect(rootScope(undefined, document)).not.toBe(
            rootScope(first, document)
        )
    })

    it('useLayoutGroup().update: capture, flushSync, one flush', async () => {
        let control: ReturnType<typeof useLayoutGroup> | null = null
        let setIds: ((ids: string[]) => void) | null = null
        function App() {
            const [ids, set] = useState(['a', 'b'])
            setIds = set
            control = useLayoutGroup()
            return (
                <ul>
                    {ids.map((id) => (
                        <Item key={id} id={id} />
                    ))}
                </ul>
            )
        }
        // the state lives above the group: no participant renders the change
        const view = await mount(
            <LayoutGroup>
                <App />
            </LayoutGroup>
        )
        try {
            const [fake] = live()
            const seen: string[] = []
            recorder.onCapture = () => seen.push(order(view.container))
            recorder.onFlush = () => seen.push(`flush ${order(view.container)}`)
            const before = flushes(fake!)
            let report: LayoutReport | null = null
            await act(async () => {
                report = await control!.update(() => setIds!(['b', 'a']))
            })
            await settle()
            expect(report).toEqual({ status: 'no-change', snapped: [] })
            expect(flushes(fake!) - before).toBe(1)
            expect(seen[0]).toBe('ab')
            expect(seen.at(-1)).toBe('flush ba')
        } finally {
            await view.unmount()
        }
    })

    it('hands a render after the commit a fresh capture (K14)', async () => {
        const scope = createLayoutScope({})
        scope.add(document.createElement('div'), {})
        const [fake] = recorder.fakes
        fake!.calls.length = 0

        scope.commit()
        await Promise.resolve()
        expect(fake!.calls).toEqual(['flush'])

        fake!.calls.length = 0
        scope.commit()
        // the next render starts in the commit's task, before the flush: it
        // must not refresh the commit's capture (React 18 time slicing took
        // it in an earlier task); the flush hands it a fresh one
        scope.touch()
        await Promise.resolve()
        expect(fake!.calls).toEqual(['flush', 'capture'])

        // a time-sliced render: touched in one task, committed in a later
        // one that also starts the next render
        fake!.calls.length = 0
        scope.touch()
        await new Promise((resolve) => setTimeout(resolve, 0))
        scope.commit()
        scope.touch()
        await Promise.resolve()
        expect(fake!.calls).toEqual(['capture', 'flush', 'capture'])

        fake!.calls.length = 0
        scope.touch()
        scope.commit()
        scope.commit()
        await Promise.resolve()
        expect(fake!.calls).toEqual(['capture', 'flush'])
        scope.dispose()
    })

    it('warns once when the DOM around participants changed without a capture', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(noop)
        const view = await mount(<List ids={['a', 'b']} />)
        try {
            await settle()
            const list = view.container.querySelector('ul')!
            // a rendered change captures: no warning
            await view.rerender(<List ids={['b', 'a']} />)
            await settle()
            expect(warn).not.toHaveBeenCalled()
            // a change no participant rendered
            list.appendChild(document.createElement('li'))
            await settle()
            expect(warn).toHaveBeenCalledTimes(1)
            expect(warn.mock.calls[0]![0]).toContain('useLayoutGroup().update')
            list.lastElementChild!.className = 'wide'
            list.appendChild(document.createElement('li'))
            await settle()
            expect(warn).toHaveBeenCalledTimes(1)
        } finally {
            await view.unmount()
        }
    })

    it('J-031: warns once for a memoized parent class or style change, not for captured, update or owned writes', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(noop)
        const MemoItem = memo(Item)
        let flip: ((on: boolean) => void) | null = null
        let control: ReturnType<typeof useLayoutGroup> | null = null
        /** The state lives above memoized participants, in the parent's attributes. */
        function Owner({ by }: { by: 'class' | 'style' }) {
            const [row, set] = useState(false)
            flip = set
            control = useLayoutGroup()
            return (
                <ul
                    {...(by === 'class'
                        ? { className: row ? 'row' : 'column' }
                        : { style: { flexDirection: row ? 'row' : 'column' } })}
                >
                    <MemoItem id="a" />
                    <MemoItem id="b" />
                </ul>
            )
        }
        const warnings = () =>
            warn.mock.calls.filter((call) =>
                String(call[0]).includes('useLayoutGroup().update')
            ).length
        for (const by of ['class', 'style'] as const) {
            warn.mockClear()
            const view = await mount(
                <LayoutGroup>
                    <Owner by={by} />
                </LayoutGroup>
            )
            try {
                await settle()
                const list = view.container.querySelector('ul')!
                const item = list.querySelector('li')!
                // owned writes: layout's poses and corners, presence's
                // transform and opacity, on participants and on the parent
                await act(async () => {
                    item.style.setProperty('opacity', '0.5', 'important')
                    item.style.setProperty('border-radius', '4px', 'important')
                    item.style.setProperty('translate', '4px 0px', 'important')
                    list.style.transform = 'scale(0.9)'
                    list.style.opacity = '0.8'
                })
                await settle()
                await act(async () => {
                    item.style.removeProperty('opacity')
                    item.style.removeProperty('border-radius')
                    item.style.removeProperty('translate')
                    list.style.removeProperty('transform')
                    list.style.removeProperty('opacity')
                })
                await settle()
                expect(warnings()).toBe(0)
                // the same change through update(fn)
                await act(async () => {
                    await control!.update(() => flip!(true))
                })
                await settle()
                expect(warnings()).toBe(0)
                // a captured commit: the group re-renders its participants
                await view.rerender(
                    <LayoutGroup>
                        <Owner by={by} />
                    </LayoutGroup>
                )
                await settle()
                expect(warnings()).toBe(0)
                // no participant renders the change: one warning
                await act(async () => {
                    flip!(false)
                })
                await settle()
                expect(warnings()).toBe(1)
                await act(async () => {
                    flip!(true)
                })
                await settle()
                expect(warnings()).toBe(1)
            } finally {
                await view.unmount()
            }
        }
    })

    it('forwards a ref and moves it when the ref prop changes', async () => {
        function Child({
            target,
        }: {
            target: RefObject<HTMLDivElement | null>
        }) {
            const ref = useLayout<HTMLDivElement>({ ref: target })
            return <div ref={ref} data-test="inside" />
        }
        const first = createRef<HTMLDivElement>()
        const second = createRef<HTMLDivElement>()
        const view = await mount(<Child target={first} />)
        try {
            expect(first.current?.dataset.test).toBe('inside')
            await view.rerender(<Child target={second} />)
            expect(first.current).toBeNull()
            expect(second.current?.dataset.test).toBe('inside')
        } finally {
            await view.unmount()
        }
        expect(second.current).toBeNull()
    })

    it('P1-001: validates each LayoutGroup motion layer before merging or touching state', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(noop)
        const codeOf = async (node: React.ReactElement) => {
            try {
                const view = await mount(node)
                await view.unmount()
                return null
            } catch (error) {
                return a.isAniError(error) ? error.code : 'not-ani-error'
            }
        }
        try {
            // Invalid outer group motion layers, even when the child switches to timing
            const invalidLayers: unknown[] = [
                { type: 'spring', duration: 0 },
                { type: 'spring', stiffness: 100 },
                { type: 'spring', bounce: 1 },
                { type: 'spring', bounce: -1 },
                { type: 'timing', bounce: 0.2 },
                { bounce: 0.2 },
            ]
            for (const bad of invalidLayers) {
                recorder.fakes.length = 0
                expect(
                    await codeOf(
                        <LayoutGroup motion={bad as LayoutOptions['motion']}>
                            <Item
                                id="a"
                                motion={{
                                    type: 'timing',
                                    duration: 0.2,
                                    timing: a.timing.linear(),
                                }}
                            />
                        </LayoutGroup>
                    )
                ).toBe('ANI_INVALID_OPTIONS')
                expect(recorder.fakes).toHaveLength(0)
            }

            // WAAPI engine with group-level spring is rejected at the group, even if child switches to timing
            recorder.fakes.length = 0
            expect(
                await codeOf(
                    <LayoutGroup
                        engine="waapi"
                        motion={{ type: 'spring', duration: 0.4 }}
                    >
                        <Item
                            id="a"
                            layout="position"
                            motion={{ type: 'timing', duration: 0.2 }}
                        />
                    </LayoutGroup>
                )
            ).toBe('ANI_INVALID_OPTIONS')
            expect(recorder.fakes).toHaveLength(0)

            // Nested LayoutGroup with its own invalid layer (and merged spring duration 0) masked by a later kind switch
            for (const inner of [
                { type: 'spring', duration: 0 },
                { type: 'spring', bounce: 1.5 },
                { duration: 0 },
            ]) {
                expect(
                    await codeOf(
                        <LayoutGroup motion={{ type: 'spring', duration: 0.4 }}>
                            <LayoutGroup
                                motion={inner as LayoutOptions['motion']}
                            >
                                <Item
                                    id="a"
                                    motion={{
                                        timing: a.timing.linear(),
                                        duration: 0.2,
                                    }}
                                />
                            </LayoutGroup>
                        </LayoutGroup>
                    )
                ).toBe('ANI_INVALID_OPTIONS')
            }

            // Valid kind switch still works and drops spring bounce
            recorder.fakes.length = 0
            const linear = a.timing.linear()
            const view = await mount(
                <LayoutGroup motion={{ type: 'spring', bounce: 0.2 }}>
                    <Item id="a" motion={{ timing: linear, duration: 0.2 }} />
                </LayoutGroup>
            )
            try {
                const [fake] = live()
                expect([...fake!.members.values()][0]!.motion).toEqual({
                    type: 'timing',
                    duration: 0.2,
                    timing: linear,
                })
            } finally {
                await view.unmount()
            }
        } finally {
            errSpy.mockRestore()
        }
    })

    it('moves a participant between scopes when a group appears above it', async () => {
        function App({ grouped }: { grouped: boolean }) {
            const item = <Item key="a" id="a" />
            return grouped ? <LayoutGroup>{item}</LayoutGroup> : item
        }
        const view = await mount(<App grouped={false} />)
        try {
            const [root] = live()
            await view.rerender(<App grouped={true} />)
            await settle()
            expect(root!.members.size).toBe(0)
            expect(live()).toHaveLength(1)
            expect(live()[0]).not.toBe(root)
        } finally {
            await view.unmount()
        }
    })

    it('I-5: passes layoutKey through and compares it with Object.is', async () => {
        function App({ layoutKey }: { layoutKey: unknown }) {
            return (
                <LayoutGroup>
                    <Item id="a" layoutKey={layoutKey} />
                </LayoutGroup>
            )
        }
        const view = await mount(<App layoutKey={Number.NaN} />)
        try {
            const [fake] = live()
            expect([...fake!.members.values()][0]).toEqual({
                layoutKey: Number.NaN,
            })
            await view.rerender(<App layoutKey={Number.NaN} />)
            expect(fake!.calls).not.toContain('set')

            await view.rerender(<App layoutKey={+0} />)
            expect(fake!.calls.filter((call) => call === 'set')).toHaveLength(1)
            expect([...fake!.members.values()][0]).toEqual({
                layoutKey: +0,
            })

            await view.rerender(<App layoutKey={-0} />)
            expect(fake!.calls.filter((call) => call === 'set')).toHaveLength(2)
            expect(
                Object.is([...fake!.members.values()][0]!.layoutKey, -0)
            ).toBe(true)
        } finally {
            await view.unmount()
        }
    })

    it('I-5: a portal into another document inside a LayoutGroup creates or joins that document implicit scope', async () => {
        const other = document.implementation.createHTMLDocument('portal-doc')
        const target = other.createElement('ul')
        other.body.appendChild(target)

        function App({ showPortal }: { showPortal: boolean }) {
            return (
                <div>
                    <LayoutGroup id="g1">
                        <ul>
                            <Item id="main" />
                        </ul>
                        {showPortal && createPortal(<Item id="p1" />, target)}
                    </LayoutGroup>
                    <LayoutGroup id="g2">
                        {showPortal && createPortal(<Item id="p2" />, target)}
                    </LayoutGroup>
                </div>
            )
        }

        const view = await mount(<App showPortal={true} />)
        try {
            expect(live()).toHaveLength(2)
            const groupFake = live().find(
                (fake) =>
                    [...fake.members.keys()][0]!.ownerDocument === document
            )!
            const portalFake = live().find(
                (fake) => [...fake.members.keys()][0]!.ownerDocument === other
            )!
            expect(groupFake).toBeDefined()
            expect(portalFake).toBeDefined()
            expect(groupFake).not.toBe(portalFake)
            expect(groupFake.members.size).toBe(1)
            // Both portals from g1 and g2 join other's single implicit scope
            expect(portalFake.members.size).toBe(2)

            await view.rerender(<App showPortal={false} />)
            await settle()
            expect(portalFake.disposed).toBe(true)
            expect(groupFake.disposed).toBe(false)
            expect(groupFake.members.size).toBe(1)
        } finally {
            await view.unmount()
        }
    })
})
