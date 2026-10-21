// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import type { LayoutGroup as CoreLayoutGroup } from '@freestylejs/ani-layout'
import {
    createRef,
    type RefObject,
    StrictMode,
    useContext,
    useEffect,
    useLayoutEffect,
    useState,
} from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../../core/src/testing/index'
import { act, mount } from '../../__tests__/helpers'
import {
    AnimatePresence,
    LayoutGroup,
    useLayout,
    useLayoutGroup,
    usePresence,
    usePresenceControl,
} from '..'
import {
    createLayoutFacade,
    LayoutContext,
    type LayoutFacade,
} from '../context'

function installLayoutDom(): void {
    ;(globalThis as unknown as { CSS: { supports: () => boolean } }).CSS = {
        supports: () => true,
    }
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        get() {
            return 20
        },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() {
            return 20
        },
    })
    Element.prototype.getBoundingClientRect = function () {
        const left = Number.parseFloat((this as HTMLElement).style.left || '0')
        return {
            left,
            top: 0,
            x: left,
            y: 0,
            right: left + 20,
            bottom: 20,
            width: 20,
            height: 20,
            toJSON: () => ({}),
        } as DOMRect
    }
    ;(
        Element.prototype as unknown as {
            animate: (keyframes: Keyframe[]) => Animation
        }
    ).animate = vi.fn(() => {
        let resolve!: (value: Animation) => void
        const finished = new Promise<Animation>((done) => {
            resolve = done
        })
        const animation = {
            finished,
            cancel: vi.fn(() => resolve(animation as unknown as Animation)),
            finish: vi.fn(() => resolve(animation as unknown as Animation)),
        }
        queueMicrotask(() => resolve(animation as unknown as Animation))
        return animation as unknown as Animation
    })
}

beforeEach(installLayoutDom)

afterEach(() => {
    document.body.innerHTML = ''
    delete (Element.prototype as unknown as { animate?: unknown }).animate
    delete (globalThis as unknown as { CSS?: unknown }).CSS
    vi.restoreAllMocks()
})

describe('react layout adapter', () => {
    it('registers refs and flips on a LayoutGroup boundary update', async () => {
        const items = [{ id: 'a' }, { id: 'b' }]
        function Row({ item, index }: { item: { id: string }; index: number }) {
            const ref = useLayout<HTMLLIElement>()
            return (
                <li
                    ref={ref}
                    data-id={item.id}
                    style={{ position: 'absolute', left: index * 40 }}
                />
            )
        }
        function List({ list }: { list: typeof items }) {
            return (
                <LayoutGroup deps={[list]}>
                    <ul>
                        {list.map((item, index) => (
                            <Row key={item.id} item={item} index={index} />
                        ))}
                    </ul>
                </LayoutGroup>
            )
        }

        const view = await mount(<List list={items} />)
        try {
            expect(view.container.querySelector('ul')).not.toBeNull()
            expect(view.container.querySelectorAll('li')).toHaveLength(2)
            expect(Element.prototype.animate).toHaveBeenCalledTimes(0)
            await view.rerender(<List list={[items[1]!, items[0]!]} />)
            expect(Element.prototype.animate).toHaveBeenCalled()
            const frames = (
                Element.prototype.animate as unknown as {
                    mock: { calls: Array<[Keyframe[]]> }
                }
            ).mock.calls[0]![0]
            expect(frames[0]).toHaveProperty('translate')
        } finally {
            await view.unmount()
        }
    })

    it('keeps an exiting child mounted until its exit completes', async () => {
        const clock = createManualClock()
        const exits: string[] = []
        const motion = {
            present: { opacity: 1 },
            initial: { opacity: 0 },
            exit: a.ani({
                to: { opacity: 0 },
                duration: 0.2,
                timing: a.timing.linear(),
            }),
        }
        function Row({ id }: { id: string }) {
            const presence = usePresence(motion, { clock: clock.clock })
            return <li ref={presence.ref} data-id={id} />
        }
        function List({ ids }: { ids: string[] }) {
            return (
                <AnimatePresence
                    initial={false}
                    onExitComplete={(key) => exits.push(key)}
                >
                    {ids.map((id) => (
                        <Row key={id} id={id} />
                    ))}
                </AnimatePresence>
            )
        }

        const view = await mount(<List ids={['a', 'b']} />)
        try {
            expect(view.container.querySelectorAll('li')).toHaveLength(2)
            await view.rerender(<List ids={['a']} />)
            expect(view.container.querySelector('[data-id="b"]')).not.toBeNull()
            await act(async () => {
                clock.frames(20)
            })
            expect(view.container.querySelector('[data-id="b"]')).toBeNull()
            expect(exits).toHaveLength(1)
        } finally {
            await view.unmount()
        }
    })

    it('survives StrictMode remount and still flips', async () => {
        const items = [{ id: 'a' }, { id: 'b' }]
        function Row({ index }: { index: number }) {
            const ref = useLayout<HTMLLIElement>()
            return (
                <li
                    ref={ref}
                    style={{ position: 'absolute', left: index * 40 }}
                />
            )
        }
        function List({ list }: { list: typeof items }) {
            return (
                <StrictMode>
                    <LayoutGroup deps={[list]}>
                        <ul>
                            {list.map((item, index) => (
                                <Row key={item.id} index={index} />
                            ))}
                        </ul>
                    </LayoutGroup>
                </StrictMode>
            )
        }
        const view = await mount(<List list={items} />)
        try {
            await view.rerender(<List list={[items[1]!, items[0]!]} />)
            expect(Element.prototype.animate).toHaveBeenCalled()
        } finally {
            await view.unmount()
        }
    })

    it('keeps the same node when a key re-enters during exit', async () => {
        const clock = createManualClock()
        const motion = {
            present: { opacity: 1 },
            initial: { opacity: 0 },
            exit: a.ani({
                to: { opacity: 0 },
                duration: 0.2,
                timing: a.timing.linear(),
            }),
        }
        function Row({ id }: { id: string }) {
            const presence = usePresence(motion, { clock: clock.clock })
            return <li ref={presence.ref} data-id={id} />
        }
        function List({ ids }: { ids: string[] }) {
            return (
                <AnimatePresence initial={false}>
                    {ids.map((id) => (
                        <Row key={id} id={id} />
                    ))}
                </AnimatePresence>
            )
        }
        const view = await mount(<List ids={['a', 'b']} />)
        try {
            const before = view.container.querySelector('[data-id="b"]')
            await view.rerender(<List ids={['a']} />)
            await view.rerender(<List ids={['a', 'b']} />)
            expect(view.container.querySelector('[data-id="b"]')).toBe(before)
            await act(async () => {
                clock.frames(20)
            })
            expect(view.container.querySelector('[data-id="b"]')).toBe(before)
        } finally {
            await view.unmount()
        }
    })

    it('composes a forwarded ref and exposes safe no-context fallbacks', async () => {
        const forwarded = createRef<HTMLDivElement>()
        function Inside() {
            const ref = useLayout<HTMLDivElement>({ ref: forwarded })
            return <div ref={ref} data-test="inside" />
        }
        const view = await mount(
            <LayoutGroup>
                <Inside />
            </LayoutGroup>
        )
        try {
            expect(forwarded.current?.getAttribute('data-test')).toBe('inside')
        } finally {
            await view.unmount()
        }

        let called = false
        function Outside() {
            const control = useLayoutGroup()
            const safety = usePresenceControl()
            const ref = useLayout<HTMLDivElement>()
            const presence = usePresence({
                present: { opacity: 1 },
                exit: a.ani({ to: { opacity: 0 }, duration: 0.1 }),
            })
            useEffect(() => {
                void control.update(() => {
                    called = true
                })
            }, [control])
            expect(safety.isPresent).toBe(true)
            expect(typeof safety.safeToRemove).toBe('function')
            expect(presence.style).toBeUndefined()
            return <div ref={ref} />
        }
        const outside = await mount(<Outside />)
        try {
            expect(called).toBe(true)
        } finally {
            await outside.unmount()
        }
    })

    it('deduplicates nested LayoutGroup boundaries into one transaction', async () => {
        const items = [{ id: 'a' }, { id: 'b' }]
        function Row({ index }: { index: number }) {
            const ref = useLayout<HTMLLIElement>()
            return (
                <li
                    ref={ref}
                    style={{ position: 'absolute', left: index * 40 }}
                />
            )
        }
        function List({ list }: { list: typeof items }) {
            return (
                <LayoutGroup deps={[list]}>
                    <LayoutGroup deps={[list]}>
                        <ul>
                            {list.map((item, index) => (
                                <Row key={item.id} index={index} />
                            ))}
                        </ul>
                    </LayoutGroup>
                </LayoutGroup>
            )
        }
        const view = await mount(<List list={items} />)
        try {
            await view.rerender(<List list={[items[1]!, items[0]!]} />)
            expect(Element.prototype.animate).toHaveBeenCalledTimes(2)
        } finally {
            await view.unmount()
        }
    })

    it('flushes an imperative descendant update between capture and play', async () => {
        function Child() {
            const control = useLayoutGroup()
            const [left, setLeft] = useState(0)
            const ref = useLayout<HTMLDivElement>()
            useEffect(() => {
                queueMicrotask(() => {
                    void control.update(() => setLeft(40))
                })
            }, [control])
            return <div ref={ref} style={{ position: 'absolute', left }} />
        }
        const view = await mount(
            <LayoutGroup>
                <Child />
            </LayoutGroup>
        )
        try {
            expect(Element.prototype.animate).toHaveBeenCalled()
            expect(
                (view.container.firstElementChild as HTMLElement).style.left
            ).toBe('40px')
        } finally {
            await view.unmount()
        }
    })

    it('transfers a forwarded ref when the ref prop changes', async () => {
        const first = createRef<HTMLDivElement>()
        const second = createRef<HTMLDivElement>()
        function Child({
            target,
        }: {
            target: RefObject<HTMLDivElement | null>
        }) {
            const ref = useLayout<HTMLDivElement>({ ref: target })
            return <div ref={ref} />
        }
        const view = await mount(<Child target={first} />)
        try {
            expect(first.current).not.toBeNull()
            await view.rerender(<Child target={second} />)
            expect(first.current).toBeNull()
            expect(second.current).not.toBeNull()
        } finally {
            await view.unmount()
        }
    })

    it('waits for every registrant before releasing a key', async () => {
        const clock = createManualClock()
        const short = {
            present: { opacity: 1 },
            exit: a.ani({
                to: { opacity: 0 },
                duration: 0.1,
                timing: a.timing.linear(),
            }),
        }
        const long = {
            present: { opacity: 1 },
            exit: a.ani({
                to: { opacity: 0 },
                duration: 0.3,
                timing: a.timing.linear(),
            }),
        }
        function Pair() {
            const first = usePresence(short, { clock: clock.clock })
            const second = usePresence(long, { clock: clock.clock })
            return (
                <>
                    <div ref={first.ref} data-part="short" />
                    <div ref={second.ref} data-part="long" />
                </>
            )
        }
        function App({ show }: { show: boolean }) {
            return (
                <AnimatePresence initial={false}>
                    {show && <Pair key="pair" />}
                </AnimatePresence>
            )
        }
        const view = await mount(<App show={true} />)
        try {
            await view.rerender(<App show={false} />)
            await act(async () => {
                clock.frames(10)
            })
            expect(
                view.container.querySelector('[data-part="short"]')
            ).not.toBeNull()
            await act(async () => {
                clock.frames(20)
            })
            expect(
                view.container.querySelector('[data-part="long"]')
            ).toBeNull()
        } finally {
            await view.unmount()
        }
    })

    it('releases a custom exit through the control watchdog', async () => {
        vi.useFakeTimers()
        function Content() {
            const control = usePresenceControl({ maxExitMs: 10 })
            return <div data-custom={true}>{String(control.isPresent)}</div>
        }
        function App({ show }: { show: boolean }) {
            return (
                <AnimatePresence initial={false}>
                    {show && <Content key="custom" />}
                </AnimatePresence>
            )
        }
        const view = await mount(<App show={true} />)
        try {
            await view.rerender(<App show={false} />)
            expect(view.container.querySelector('[data-custom]')).not.toBeNull()
            await act(async () => {
                vi.advanceTimersByTime(11)
            })
            expect(view.container.querySelector('[data-custom]')).toBeNull()
        } finally {
            await view.unmount()
        }
    })

    it('keeps distinct boundary transactions separate across microtasks', async () => {
        const group = {
            capture: vi.fn(() => ({})),
            play: vi.fn(() => Promise.resolve('ended')),
            dispose: vi.fn(),
        } as unknown as CoreLayoutGroup
        const facade = createLayoutFacade()
        facade.attach(group)
        const first = facade.capture()
        const firstRun = facade.play(first!)
        const second = facade.capture()
        const secondRun = facade.play(second!)
        expect(firstRun).not.toBe(secondRun)
        await Promise.all([firstRun, secondRun])
        expect(group.play).toHaveBeenCalledTimes(2)
        facade.dispose()
    })

    it('transfers a replacement ref and participant options in the layout phase', async () => {
        const first = createRef<HTMLDivElement>()
        const second = createRef<HTMLDivElement>()
        let observed = false
        let observedOptions: unknown
        let facade: LayoutFacade | null = null
        let setSpy: ReturnType<typeof vi.spyOn> | null = null
        function Capture() {
            facade = useContext(LayoutContext)
            return null
        }
        function Child({
            target,
            layout,
            layoutId,
        }: {
            target: RefObject<HTMLDivElement | null>
            layout: 'position' | 'box'
            layoutId?: string | undefined
        }) {
            const ref = useLayout<HTMLDivElement>({
                ref: target,
                layout,
                ...(layoutId !== undefined && { layoutId }),
            })
            return <div ref={ref} />
        }
        function Parent({
            target,
            layout,
            layoutId,
        }: {
            target: RefObject<HTMLDivElement | null>
            layout: 'position' | 'box'
            layoutId?: string | undefined
        }) {
            useLayoutEffect(() => {
                observed = target.current !== null
                observedOptions = setSpy?.mock.calls.at(-1)?.[1]
            }, [target])
            return (
                <LayoutGroup>
                    <Capture />
                    <Child
                        target={target}
                        layout={layout}
                        layoutId={layoutId}
                    />
                </LayoutGroup>
            )
        }
        const view = await mount(<Parent target={first} layout="position" />)
        try {
            setSpy = vi.spyOn(facade!.group!, 'set')
            await view.rerender(
                <Parent target={second} layout="box" layoutId="hero" />
            )
            expect(observed).toBe(true)
            expect(first.current).toBeNull()
            expect(second.current).not.toBeNull()
            expect(observedOptions).toMatchObject({
                layout: 'box',
                layoutId: 'hero',
            })
        } finally {
            await view.unmount()
        }
    })

    it('keeps a newer control watchdog when an old completion runs', async () => {
        vi.useFakeTimers()
        let oldSafe: (() => void) | null = null
        function Content() {
            const control = usePresenceControl({ maxExitMs: 10 })
            if (!oldSafe) oldSafe = control.safeToRemove
            return <div data-custom="true" />
        }
        function App({ show }: { show: boolean }) {
            return (
                <AnimatePresence initial={false}>
                    {show && <Content key="custom" />}
                </AnimatePresence>
            )
        }
        const view = await mount(<App show={true} />)
        try {
            await view.rerender(<App show={false} />)
            await view.rerender(<App show={true} />)
            await view.rerender(<App show={false} />)
            oldSafe!()
            await act(async () => {
                vi.advanceTimersByTime(11)
            })
            expect(view.container.querySelector('[data-custom]')).toBeNull()
        } finally {
            await view.unmount()
        }
    })

    it('propagates a playback rejection and keeps the facade usable', async () => {
        const play = vi
            .fn()
            .mockRejectedValueOnce(new Error('playback failed'))
            .mockResolvedValue('ended')
        const group = {
            capture: vi.fn(() => ({})),
            play,
            dispose: vi.fn(),
        } as unknown as CoreLayoutGroup
        const facade = createLayoutFacade()
        facade.attach(group)
        const first = facade.capture()
        await expect(facade.play(first!)).rejects.toThrow('playback failed')
        const second = facade.capture()
        await expect(facade.play(second!)).resolves.toBe('ended')
        expect(play).toHaveBeenCalledTimes(2)
        facade.dispose()
    })

    it('renders no wrapper DOM and produces SSR markup without boundaries', () => {
        const markup = renderToString(
            <LayoutGroup>
                <ul>
                    <AnimatePresence>
                        <li key="a">A</li>
                    </AnimatePresence>
                </ul>
            </LayoutGroup>
        )
        expect(markup).toBe('<ul><li>A</li></ul>')
    })
})
