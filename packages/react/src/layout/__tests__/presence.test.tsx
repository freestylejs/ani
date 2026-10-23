// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import { type CSSProperties, StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../../core/src/testing/index'
import { act, mount } from '../../__tests__/helpers'
import {
    AnimatePresence,
    LayoutGroup,
    usePresence,
    usePresenceControl,
} from '..'

afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
})

const fadeOut = {
    present: { opacity: 1 },
    exit: a.ani({
        to: { opacity: 0 },
        duration: 0.2,
        timing: a.timing.linear(),
    }),
}

function rect(left: number, top: number, width: number, height: number) {
    return () =>
        ({
            left,
            top,
            x: left,
            y: top,
            right: left + width,
            bottom: top + height,
            width,
            height,
            toJSON: () => ({}),
        }) as DOMRect
}

/** A popLayout child inside `block`, exited after its geometry is stubbed. */
async function popInside(
    blockStyle: CSSProperties,
    stub: (row: HTMLElement, block: HTMLElement) => void,
    rowStyle: CSSProperties = { height: 20 }
): Promise<Record<'left' | 'top' | 'width' | 'height', string>> {
    const clock = createManualClock()
    function Row() {
        const presence = usePresence(fadeOut, { clock: clock.clock })
        return (
            <div
                ref={presence.ref}
                data-id="row"
                style={{ ...rowStyle, ...presence.style }}
            />
        )
    }
    function App({ show }: { show: boolean }) {
        return (
            <div data-block="true" style={blockStyle}>
                <div>
                    <AnimatePresence initial={false} mode="popLayout">
                        {show && <Row key="row" />}
                    </AnimatePresence>
                </div>
            </div>
        )
    }
    const view = await mount(<App show={true} />)
    stub(
        view.container.querySelector('[data-id="row"]') as HTMLElement,
        view.container.querySelector('[data-block]') as HTMLElement
    )
    await view.rerender(<App show={false} />)
    const exiting = view.container.querySelector(
        '[data-id="row"]'
    ) as HTMLElement
    const { left, top, width, height } = exiting.style
    await act(async () => {
        clock.frames(20)
    })
    await view.unmount()
    return { left, top, width, height }
}

describe('react presence', () => {
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
            return <li ref={presence.ref} data-id={id} style={presence.style} />
        }
        function List({ ids }: { ids: string[] }) {
            return (
                <AnimatePresence initial={false} mode="popLayout">
                    {ids.map((id) => (
                        <Row key={id} id={id} />
                    ))}
                </AnimatePresence>
            )
        }
        const view = await mount(<List ids={['a', 'b']} />)
        try {
            const before = view.container.querySelector(
                '[data-id="b"]'
            ) as HTMLElement
            await view.rerender(<List ids={['a']} />)
            expect(
                (view.container.querySelector('[data-id="b"]') as HTMLElement)
                    .style.position
            ).toBe('absolute')
            await view.rerender(<List ids={['a', 'b']} />)
            expect(view.container.querySelector('[data-id="b"]')).toBe(before)
            expect(before.style.position).not.toBe('absolute')
            await act(async () => {
                clock.frames(20)
            })
            expect(view.container.querySelector('[data-id="b"]')).toBe(before)
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

    it('returns motion.initial as SSR/first-enter style and clears it at rest', async () => {
        const motion = {
            present: { opacity: 1, translateY: 0 },
            initial: { opacity: 0, translateY: 8 },
            exit: a.ani({
                to: { opacity: 0, translateY: 8 },
                duration: 0.1,
                timing: a.timing.linear(),
            }),
        }
        let captured: CSSProperties | undefined
        function Row() {
            const presence = usePresence(motion)
            captured = presence.style
            return <div ref={presence.ref} style={presence.style} />
        }
        const markup = renderToString(
            <AnimatePresence initial={true}>
                <Row key="row" />
            </AnimatePresence>
        )
        expect(markup).toContain('opacity:0')
        const markupStyle = captured

        const view = await mount(
            <AnimatePresence initial={true}>
                <Row key="row" />
            </AnimatePresence>
        )
        try {
            // a prop while the enter runs: React must not clear its values
            expect(captured).toEqual(markupStyle)
            await vi.waitFor(() => expect(captured).toBeUndefined())
        } finally {
            await view.unmount()
        }
    })

    it('pops an exiting child out of flow until its exit completes', async () => {
        const clock = createManualClock()
        const motion = {
            present: { opacity: 1 },
            exit: a.ani({
                to: { opacity: 0 },
                duration: 0.2,
                timing: a.timing.linear(),
            }),
        }
        function Row({ id, left }: { id: string; left: number }) {
            const presence = usePresence(motion, { clock: clock.clock })
            return (
                <div
                    ref={presence.ref}
                    data-id={id}
                    style={{
                        position: 'relative',
                        left,
                        height: 20,
                        ...presence.style,
                    }}
                />
            )
        }
        function List({ ids }: { ids: string[] }) {
            return (
                <AnimatePresence initial={false} mode="popLayout">
                    {ids.map((id, index) => (
                        <Row key={id} id={id} left={index * 40} />
                    ))}
                </AnimatePresence>
            )
        }
        const view = await mount(<List ids={['a', 'b']} />)
        try {
            await view.rerender(<List ids={['b']} />)
            const exiting = view.container.querySelector(
                '[data-id="a"]'
            ) as HTMLElement
            expect(exiting).not.toBeNull()
            expect(exiting.style.position).toBe('absolute')
            expect(exiting.style.pointerEvents).toBe('none')
            await act(async () => {
                clock.frames(20)
            })
            expect(view.container.querySelector('[data-id="a"]')).toBeNull()
        } finally {
            await view.unmount()
        }
    })

    it('measures the popLayout box in the render that exits', async () => {
        const clock = createManualClock()
        const motion = {
            present: { opacity: 1 },
            exit: a.ani({
                to: { opacity: 0 },
                duration: 0.2,
                timing: a.timing.linear(),
            }),
        }
        function Row({ width }: { width: number }) {
            const presence = usePresence(motion, { clock: clock.clock })
            return (
                <div
                    ref={presence.ref}
                    data-id="row"
                    style={{
                        position: 'relative',
                        width,
                        height: 20,
                        ...presence.style,
                    }}
                />
            )
        }
        function App({ show, width }: { show: boolean; width: number }) {
            return (
                <AnimatePresence initial={false} mode="popLayout">
                    {show && <Row key="row" width={width} />}
                </AnimatePresence>
            )
        }
        const view = await mount(<App show={true} width={20} />)
        try {
            const row = view.container.querySelector(
                '[data-id="row"]'
            ) as HTMLElement
            row.getBoundingClientRect = () =>
                ({
                    left: 80,
                    top: 10,
                    x: 80,
                    y: 10,
                    right: 120,
                    bottom: 30,
                    width: 40,
                    height: 20,
                    toJSON: () => ({}),
                }) as DOMRect
            await view.rerender(<App show={true} width={40} />)
            await view.rerender(<App show={false} width={40} />)
            const exiting = view.container.querySelector(
                '[data-id="row"]'
            ) as HTMLElement
            expect(exiting.style.left).toBe('80px')
            expect(exiting.style.top).toBe('10px')
            expect(exiting.style.width).toBe('40px')
            await act(async () => {
                clock.frames(20)
            })
        } finally {
            await view.unmount()
        }
    })

    it('does not render a never-committed child as a wait ghost', async () => {
        const clock = createManualClock()
        const motion = {
            present: { opacity: 1 },
            exit: a.ani({
                to: { opacity: 0 },
                duration: 0.2,
                timing: a.timing.linear(),
            }),
        }
        function Row({ id }: { id: string }) {
            const presence = usePresence(motion, { clock: clock.clock })
            return (
                <div ref={presence.ref} data-id={id} style={presence.style} />
            )
        }
        function App({ ids }: { ids: string[] }) {
            return (
                <AnimatePresence initial={false} mode="wait">
                    {ids.map((id) => (
                        <Row key={id} id={id} />
                    ))}
                </AnimatePresence>
            )
        }
        const view = await mount(<App ids={['a']} />)
        try {
            await view.rerender(<App ids={['b']} />)
            await view.rerender(<App ids={['c']} />)
            await act(async () => undefined)
            expect(view.container.querySelector('[data-id="b"]')).toBeNull()
            await act(async () => {
                clock.frames(20)
            })
            expect(view.container.querySelector('[data-id="c"]')).not.toBeNull()
        } finally {
            await view.unmount()
        }
    })

    it('shares custom presence data with the child and supports SSR wrappers', () => {
        const motion = {
            present: { opacity: 1 },
            exit: a.ani({ to: { opacity: 0 }, duration: 0.1 }),
        }
        function Row() {
            const presence = usePresence(motion)
            return (
                <div ref={presence.ref} data-custom={String(presence.custom)} />
            )
        }
        const markup = renderToString(
            <AnimatePresence custom="urgent">
                <Row key="row" />
            </AnimatePresence>
        )
        expect(markup).toContain('data-custom="urgent"')
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
    it('delays a new child in wait mode', async () => {
        const clock = createManualClock()
        const motion = {
            present: { opacity: 1 },
            exit: a.ani({
                to: { opacity: 0 },
                duration: 0.2,
                timing: a.timing.linear(),
            }),
        }
        function Row({ id }: { id: string }) {
            const presence = usePresence(motion, { clock: clock.clock })
            return (
                <div ref={presence.ref} data-id={id} style={presence.style} />
            )
        }
        function App({ ids }: { ids: string[] }) {
            return (
                <AnimatePresence initial={false} mode="wait">
                    {ids.map((id) => (
                        <Row key={id} id={id} />
                    ))}
                </AnimatePresence>
            )
        }
        const view = await mount(<App ids={['a']} />)
        try {
            await view.rerender(<App ids={['b']} />)
            expect(view.container.querySelector('[data-id="b"]')).toBeNull()
            await act(async () => {
                clock.frames(20)
            })
            expect(view.container.querySelector('[data-id="b"]')).not.toBeNull()
        } finally {
            await view.unmount()
        }
    })

    it('offsets popLayout in the positioned containing block: border and scroll', async () => {
        const style = await popInside(
            {
                position: 'relative',
                width: 200,
                height: 100,
                boxSizing: 'border-box',
                borderLeft: '10px solid',
                borderTop: '2px solid',
            },
            (row, block) => {
                row.getBoundingClientRect = rect(30, 10, 40, 20)
                block.getBoundingClientRect = rect(0, 0, 200, 100)
                Object.defineProperty(block, 'scrollLeft', { value: 5 })
                Object.defineProperty(block, 'scrollTop', { value: 3 })
            }
        )
        // 30 - 10 (border) + 5 (scroll), 10 - 2 + 3
        expect(style.left).toBe('25px')
        expect(style.top).toBe('11px')
        expect(style.width).toBe('40px')
        expect(style.height).toBe('20px')
    })

    it('divides out a transformed containing block that is not positioned', async () => {
        const style = await popInside(
            {
                transform: 'scale(2)',
                width: 200,
                height: 100,
                boxSizing: 'border-box',
            },
            (row, block) => {
                row.getBoundingClientRect = rect(30, 10, 40, 20)
                block.getBoundingClientRect = rect(0, 0, 400, 200)
            },
            // drawn 20 px tall at scale 2
            { height: 10 }
        )
        expect(style.left).toBe('15px')
        expect(style.top).toBe('5px')
        expect(style.width).toBe('20px')
        expect(style.height).toBe('10px')
    })

    it('uses page coordinates without a containing block', async () => {
        const style = await popInside({}, (row) => {
            row.getBoundingClientRect = rect(30, 10, 40, 20)
        })
        expect(style.left).toBe(`${30 + window.scrollX}px`)
        expect(style.top).toBe(`${10 + window.scrollY}px`)
    })

    it('J-027: takes the own transform of the element back out of the popLayout box', async () => {
        // CSS box left 50 / top 80 / 100 × 50 in a positioned block; presence
        // draws it through translateY(14px) scale(0.8) about 0 0
        const style = await popInside(
            {
                position: 'relative',
                width: 400,
                height: 300,
                boxSizing: 'border-box',
            },
            (row, block) => {
                row.getBoundingClientRect = rect(50, 94, 80, 40)
                block.getBoundingClientRect = rect(0, 0, 400, 300)
            },
            {
                width: 100,
                height: 50,
                transform: 'matrix(0.8, 0, 0, 0.8, 0, 14)',
                transformOrigin: '0px 0px',
            }
        )
        expect(style).toEqual({
            left: '50px',
            top: '80px',
            width: '100px',
            height: '50px',
        })
    })

    it('J-027: inverts an own transform about a centred origin inside a scaled block', async () => {
        // block scale 2; CSS box 10 / 20 / 60 × 30, scaleX 0.5 about its centre
        // and translateY 5: drawn (2·(10 + 15), 2·(20 + 5), 2·30, 2·30)
        const style = await popInside(
            {
                transform: 'scale(2)',
                width: 200,
                height: 100,
                boxSizing: 'border-box',
            },
            (row, block) => {
                row.getBoundingClientRect = rect(50, 50, 60, 60)
                block.getBoundingClientRect = rect(0, 0, 400, 200)
            },
            {
                width: 60,
                height: 30,
                transform: 'matrix(0.5, 0, 0, 1, 0, 5)',
                transformOrigin: '30px 15px',
            }
        )
        expect(style).toEqual({
            left: '10px',
            top: '20px',
            width: '60px',
            height: '30px',
        })
    })

    it('J-028: keeps a running enter and exit across a StrictMode moved-fiber replay', async () => {
        const clock = createManualClock()
        const exits: string[] = []
        const motion = {
            present: { opacity: 1, translateY: 0, scaleX: 1 },
            initial: { opacity: 0, translateY: 14, scaleX: 0.8 },
            enter: a.ani({
                to: { opacity: 1, translateY: 0, scaleX: 1 },
                duration: 1,
                timing: a.timing.linear(),
            }),
            exit: a.ani({
                to: { opacity: 0, translateY: 0, scaleX: 1 },
                duration: 1,
                timing: a.timing.linear(),
            }),
        }
        function Row({ id }: { id: string }) {
            const presence = usePresence(motion, { clock: clock.clock })
            return <li ref={presence.ref} data-id={id} style={presence.style} />
        }
        function List({ ids }: { ids: string[] }) {
            return (
                <StrictMode>
                    <AnimatePresence
                        initial={false}
                        onExitComplete={(key) => exits.push(key)}
                    >
                        {ids.map((id) => (
                            <Row key={id} id={id} />
                        ))}
                    </AnimatePresence>
                </StrictMode>
            )
        }
        const row = (id: string) =>
            view.container.querySelector(`[data-id="${id}"]`) as HTMLElement
        /** opacity, translateY, scaleX as written */
        const pose = (id: string) => {
            const style = row(id).style
            const y = /translateY\(([-\d.e]+)px\)/.exec(style.transform)
            const sx = /scaleX\(([-\d.e]+)\)/.exec(style.transform)
            return [Number(style.opacity), Number(y?.[1]), Number(sx?.[1])]
        }
        const expectPose = (id: string, want: number[]) =>
            pose(id).forEach((value, i) =>
                expect(value).toBeCloseTo(want[i]!, 9)
            )
        const view = await mount(<List ids={[]} />)
        try {
            // both enter for 1 s from opacity 0, translateY 14, scaleX 0.8
            await view.rerender(<List ids={['a', 'b']} />)
            await act(async () => {
                clock.frame(200)
            })
            expectPose('a', [0.2, 11.2, 0.84])
            expectPose('b', [0.2, 11.2, 0.84])
            // a reorder moves `a`: its ref and effects replay, time stands still
            await view.rerender(<List ids={['b', 'a']} />)
            expectPose('a', [0.2, 11.2, 0.84])
            expectPose('b', [0.2, 11.2, 0.84])
            await act(async () => {
                clock.frame(200)
            })
            expectPose('a', [0.4, 8.4, 0.88])
            expectPose('b', [0.4, 8.4, 0.88])

            // finish the enters, then exit `a` and move it mid-exit
            await act(async () => {
                clock.frames(60)
            })
            await view.rerender(<List ids={['b', 'c']} />)
            await act(async () => {
                clock.frame(200)
            })
            expectPose('a', [0.8, 0, 1])
            // [b, (a), c] → [c, b, (a)]: `a` moves
            await view.rerender(<List ids={['c', 'b']} />)
            expect(row('a')).not.toBeNull()
            expectPose('a', [0.8, 0, 1])
            await act(async () => {
                clock.frame(200)
            })
            expectPose('a', [0.6, 0, 1])
            expect(exits).toEqual([])
            await act(async () => {
                clock.frames(40)
            })
            expect(row('a')).toBeNull()
            expect(exits).toEqual(['a'])
        } finally {
            await view.unmount()
        }
    })

    it('J-028: an inline merged ref (new every render) keeps the running enter', async () => {
        const clock = createManualClock()
        const motion = {
            present: { opacity: 1 },
            initial: { opacity: 0 },
            enter: a.ani({
                to: { opacity: 1 },
                duration: 1,
                timing: a.timing.linear(),
            }),
            exit: a.ani({ to: { opacity: 0 }, duration: 0.2 }),
        }
        const seen: Array<HTMLElement | null> = []
        function Row({ tick }: { tick: number }) {
            const presence = usePresence(motion, { clock: clock.clock })
            return (
                <div
                    // React calls the previous callback with null, this one
                    // with the element, in every commit
                    ref={(element: HTMLDivElement | null) => {
                        seen.push(element)
                        presence.ref(element)
                    }}
                    data-id="row"
                    data-tick={tick}
                    style={presence.style}
                />
            )
        }
        function App({ show, tick }: { show: boolean; tick: number }) {
            return (
                <AnimatePresence initial={false}>
                    {show && <Row key="row" tick={tick} />}
                </AnimatePresence>
            )
        }
        const view = await mount(<App show={false} tick={0} />)
        try {
            await view.rerender(<App show={true} tick={0} />)
            await act(async () => {
                clock.frame(200)
            })
            const row = view.container.querySelector(
                '[data-id="row"]'
            ) as HTMLElement
            expect(Number(row.style.opacity)).toBeCloseTo(0.2, 9)
            await view.rerender(<App show={true} tick={1} />)
            expect(seen).toContain(null)
            expect(Number(row.style.opacity)).toBeCloseTo(0.2, 9)
            await act(async () => {
                clock.frame(200)
            })
            expect(Number(row.style.opacity)).toBeCloseTo(0.4, 9)
        } finally {
            await view.unmount()
        }
    })
})
