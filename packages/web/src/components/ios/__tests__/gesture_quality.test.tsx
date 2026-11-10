// @vitest-environment jsdom
import { follow } from '@freestylejs/ani-core'
import {
    act,
    type ReactNode,
    type PointerEvent as ReactPointerEvent,
    useLayoutEffect,
    useState,
} from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../../../core/src/testing/index'
import {
    exposureNotch,
    recordSample,
    sampleVelocity,
} from '../interaction_math'
import { IosExposureSlider } from '../ios_exposure_slider'
import { IosSlider } from '../ios_slider'
import { IosSwipeActions } from '../ios_swipe_actions'
import { usePointerDrag } from '../use_pointer_drag'

let host: HTMLDivElement
let root: Root
const descriptors = new Map<string, PropertyDescriptor | undefined>()
beforeEach(() => {
    ;(
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const captures = new WeakMap<Element, number>()
    for (const key of [
        'setPointerCapture',
        'hasPointerCapture',
        'releasePointerCapture',
    ])
        descriptors.set(
            key,
            Object.getOwnPropertyDescriptor(Element.prototype, key)
        )
    Object.defineProperties(Element.prototype, {
        setPointerCapture: {
            configurable: true,
            value(this: Element, id: number) {
                captures.set(this, id)
            },
        },
        hasPointerCapture: {
            configurable: true,
            value(this: Element, id: number) {
                return captures.get(this) === id
            },
        },
        releasePointerCapture: {
            configurable: true,
            value(this: Element, id: number) {
                if (captures.get(this) === id) captures.delete(this)
            },
        },
    })
})
afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    for (const [key, descriptor] of descriptors) {
        if (descriptor)
            Object.defineProperty(Element.prototype, key, descriptor)
        else Reflect.deleteProperty(Element.prototype, key)
    }
    descriptors.clear()
    vi.restoreAllMocks()
})
async function render(node: ReactNode) {
    await act(async () => root.render(node))
}
function q(selector: string): HTMLElement {
    const element = host.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`Missing ${selector}`)
    return element
}
function pointerEvent(
    type: string,
    x: number,
    y: number,
    time: number,
    options: {
        id?: number
        kind?: string
        failCoalesced?: boolean
        coalesced?: Array<{
            x: number
            y: number
            time: number
            id?: number
            kind?: string
        }>
    } = {}
) {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
    })
    Object.defineProperties(event, {
        clientX: { value: x },
        clientY: { value: y },
        timeStamp: { value: time },
        pointerId: { value: options.id ?? 1 },
        pointerType: { value: options.kind ?? 'mouse' },
        getCoalescedEvents: {
            value: () => {
                if (options.failCoalesced)
                    throw new Error('Optional coalesced API unavailable')
                return (options.coalesced ?? []).map((sample) => ({
                    clientX: sample.x,
                    clientY: sample.y,
                    timeStamp: sample.time,
                    pointerId: sample.id ?? options.id ?? 1,
                    pointerType: sample.kind ?? options.kind ?? 'mouse',
                }))
            },
        },
    })
    return event
}
async function pointer(
    element: HTMLElement,
    ...args: Parameters<typeof pointerEvent>
) {
    await act(async () => element.dispatchEvent(pointerEvent(...args)))
}
async function key(element: HTMLElement, name: string) {
    await act(async () => {
        element.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: name,
                bubbles: true,
                cancelable: true,
            })
        )
    })
}
const rail = () =>
    Number(q('[data-ios-exposure]').style.getPropertyValue('--ani-rail-value'))
const level = () =>
    Number.parseFloat(
        q('[data-ios-slider]').style.getPropertyValue('--ani-level')
    ) / 100

it('equal-timestamp position updates replace the last sample without inventing elapsed time', () => {
    const samples: Array<{ x: number; y: number; time: number }> = []
    recordSample(samples, { x: 0, y: 0, time: 100 })
    recordSample(samples, { x: 5, y: 0, time: 110 })
    recordSample(samples, { x: 8, y: 0, time: 110 })
    expect(samples).toHaveLength(2)
    expect(samples.at(-1)!.x).toBe(8)
    expect(sampleVelocity(samples).x).toBe(800)
    recordSample(samples, { x: 999, y: 0, time: 109 })
    expect(samples.at(-1)!.x).toBe(8)
})

it('Exposure includes a final-up position even when timestamps have the same resolution bucket', async () => {
    const mc = createManualClock()
    const commit = vi.fn()
    await render(<IosExposureSlider clock={mc.clock} onValueCommit={commit} />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 90, 50, 100)
    await pointer(slider, 'pointerup', 60, 50, 100)
    expect(commit).toHaveBeenCalledExactlyOnceWith(20)
    await act(async () => mc.frames(200, 16))
    expect(rail()).toBeCloseTo(20, 6)
    expect(mc.clock.size).toBe(0)
})

it('a touch vertical-scroll intent neither changes nor commits a horizontal control', async () => {
    const mc = createManualClock()
    const change = vi.fn(),
        commit = vi.fn()
    await render(
        <IosExposureSlider
            clock={mc.clock}
            onValueChange={change}
            onValueCommit={commit}
        />
    )
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100, { kind: 'touch' })
    await pointer(slider, 'pointermove', 92, 130, 130, { kind: 'touch' })
    await pointer(slider, 'pointerup', 90, 160, 150, { kind: 'touch' })
    expect(change).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    expect(slider.hasPointerCapture(1)).toBe(false)
    expect(rail()).toBe(0)
})

it('Exposure re-catch freezes its displayed value and the next move is one-to-one', async () => {
    const mc = createManualClock()
    await render(<IosExposureSlider clock={mc.clock} />)
    const slider = q('[role="slider"]')
    await key(slider, 'End')
    await act(async () => mc.frames(5, 16))
    const before = rail()
    expect(before).toBeGreaterThan(0)
    expect(before).toBeLessThan(100)
    await pointer(slider, 'pointerdown', 100, 50, 100)
    expect(rail()).toBeCloseTo(before, 10)
    await pointer(slider, 'pointermove', 96, 50, 120)
    expect(rail()).toBeCloseTo(before + 2, 8)
    await pointer(slider, 'pointercancel', 96, 50, 130)
    await act(async () => mc.frames(200, 16))
    expect(mc.clock.size).toBe(0)
})

it('Exposure recatch in elastic overshoot is one-to-one in presented coordinates', async () => {
    const mc = createManualClock()
    await render(<IosExposureSlider clock={mc.clock} />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 300, 50, 100)
    await pointer(slider, 'pointermove', -300, 50, 200)
    await pointer(slider, 'pointerup', -300, 50, 300)
    const before = rail()
    expect(before).toBeGreaterThan(100)
    await pointer(slider, 'pointerdown', 100, 50, 400)
    expect(rail()).toBeCloseTo(before, 8)
    await pointer(slider, 'pointermove', 102, 50, 420)
    expect(rail()).toBeCloseTo(before - 1, 6)
})

it('controlled brightness follows accepted input without elastic recovery while still held', async () => {
    const mc = createManualClock()
    function Owner() {
        const [value, setValue] = useState(0.5)
        return (
            <IosSlider
                clock={mc.clock}
                value={value}
                onValueChange={setValue}
            />
        )
    }
    await render(<Owner />)
    const slider = q('[data-ios-slider]')
    await pointer(slider, 'pointerdown', 50, 120, 100)
    await pointer(slider, 'pointermove', 50, 75, 120)
    expect(level()).toBeCloseTo(0.7, 8)
    expect(slider.hasAttribute('data-dragging')).toBe(true)
    expect(mc.clock.size).toBe(0)
    await pointer(slider, 'pointermove', 50, -200, 140)
    expect(level()).toBe(1)
    const heldTransform = slider.style.transform
    await act(async () => mc.frames(5, 16))
    expect(slider.style.transform).toBe(heldTransform)
    expect(slider.hasAttribute('data-dragging')).toBe(true)
})

it('brightness recatch does not jump an in-flight displayed fill to the semantic target', async () => {
    const mc = createManualClock()
    await render(<IosSlider clock={mc.clock} />)
    const slider = q('[data-ios-slider]')
    await key(slider, 'End')
    await act(async () => mc.frames(5, 16))
    const before = level()
    expect(before).toBeLessThan(1)
    await pointer(slider, 'pointerdown', 50, 120, 100)
    expect(level()).toBeCloseTo(before, 8)
    await pointer(slider, 'pointermove', 50, 97.5, 120)
    expect(level()).toBeCloseTo(before + 0.1, 8)
})

it('controlled commit reports the bounded final request, not the previous batched owner value', async () => {
    const mc = createManualClock()
    const commit = vi.fn()
    function Owner() {
        const [value, setValue] = useState(0)
        return (
            <IosExposureSlider
                clock={mc.clock}
                value={value}
                onValueChange={setValue}
                onValueCommit={commit}
            />
        )
    }
    await render(<Owner />)
    const slider = q('[role="slider"]')
    await key(slider, 'End')
    expect(slider.getAttribute('aria-valuenow')).toBe('100')
    expect(commit).toHaveBeenCalledExactlyOnceWith(100)
})

it('controlled rejection keeps the displayed value and still reports the requested commit truthfully', async () => {
    const mc = createManualClock()
    const change = vi.fn(),
        commit = vi.fn()
    await render(
        <IosExposureSlider
            clock={mc.clock}
            value={25}
            onValueChange={change}
            onValueCommit={commit}
        />
    )
    await key(q('[role="slider"]'), 'End')
    expect(change).toHaveBeenLastCalledWith(100)
    expect(commit).toHaveBeenCalledExactlyOnceWith(100)
    await act(async () => mc.frames(200, 16))
    expect(rail()).toBe(25)
    expect(q('[role="slider"]').getAttribute('aria-valuenow')).toBe('25')
})

it('foreign pointers, lost capture, repeated terminal events and disable cannot double-commit', async () => {
    const mc = createManualClock()
    const commit = vi.fn()
    await render(<IosExposureSlider clock={mc.clock} onValueCommit={commit} />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 0, 50, 120, { id: 2 })
    expect(rail()).toBe(0)
    await pointer(slider, 'pointermove', 80, 50, 140)
    await pointer(slider, 'lostpointercapture', 80, 50, 150)
    await pointer(slider, 'pointerup', 80, 50, 160)
    expect(commit).not.toHaveBeenCalled()
    await act(async () => mc.frames(200, 16))
    expect(rail()).toBe(0)
    await pointer(slider, 'pointerdown', 100, 50, 200)
    await pointer(slider, 'pointermove', 80, 50, 220)
    await render(
        <IosExposureSlider
            clock={mc.clock}
            onValueCommit={commit}
            disabled={true}
        />
    )
    expect(slider.hasPointerCapture(1)).toBe(false)
    await pointer(slider, 'pointerup', 80, 50, 240)
    expect(commit).not.toHaveBeenCalled()
    await render(null)
    expect(mc.clock.size).toBe(0)
})

it('swipe velocity cannot throw the surface into a side that has no actions', async () => {
    const mc = createManualClock()
    await render(<IosSwipeActions clock={mc.clock} rightActions={[]} />)
    const row = q('[data-swipe-surface]')
    await pointer(row, 'pointerdown', 0, 50, 100)
    await pointer(row, 'pointermove', 80, 50, 180)
    await pointer(row, 'pointerup', 20, 50, 190)
    for (let i = 0; i < 80; i++) {
        await act(async () => mc.frame(16))
        const translate = Number.parseFloat(
            /translateX\(([^p]+)/.exec(row.style.transform)?.[1] ?? '0'
        )
        expect(translate).toBeGreaterThanOrEqual(-0.01)
    }
})

it('a rejected controlled flick cannot seed velocity into the authoritative value', async () => {
    const mc = createManualClock()
    const commit = vi.fn()
    await render(
        <IosExposureSlider
            clock={mc.clock}
            value={25}
            onValueChange={() => undefined}
            onValueCommit={commit}
        />
    )
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 80, 50, 120)
    await pointer(slider, 'pointerup', 60, 50, 140)
    expect(commit).toHaveBeenCalledExactlyOnceWith(100)
    for (let i = 0; i < 100; i++) {
        await act(async () => mc.frame(16))
        expect(rail()).toBe(25)
        expect(q('[data-exposure-reset] span').textContent).toBe('25')
        expect(slider.getAttribute('aria-valuenow')).toBe('25')
    }
    expect(mc.clock.size).toBe(0)
})

it.each([
    'batched',
    'synchronous',
] as const)('%s controlled acceptance preserves the same release trajectory as uncontrolled input', async (mode) => {
    const traces: number[][] = []
    for (const controlled of [false, true]) {
        const mc = createManualClock()
        function Owner() {
            const [value, setValue] = useState(25)
            return (
                <IosExposureSlider
                    clock={mc.clock}
                    defaultValue={25}
                    {...(controlled
                        ? {
                              value,
                              onValueChange:
                                  mode === 'synchronous'
                                      ? (next: number) =>
                                            flushSync(() => setValue(next))
                                      : setValue,
                          }
                        : {})}
                />
            )
        }
        await render(<Owner key={String(controlled)} />)
        const slider = q('[role="slider"]')
        await pointer(slider, 'pointerdown', 100, 50, 100)
        await pointer(slider, 'pointermove', 90, 50, 140)
        await pointer(slider, 'pointerup', 86, 50, 180)
        const trace: number[] = [rail()]
        for (let i = 0; i < 100; i++) {
            await act(async () => mc.frame(16))
            trace.push(rail())
        }
        traces.push(trace)
        await render(null)
        expect(mc.clock.size).toBe(0)
    }
    traces[0]!.forEach((value, i) =>
        expect(traces[1]![i]).toBeCloseTo(value, 8)
    )
})

it('optional coalesced failure falls back and a clock regression preserves terminal position without invented speed', async () => {
    const mc = createManualClock()
    const commit = vi.fn()
    await render(<IosExposureSlider clock={mc.clock} onValueCommit={commit} />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100, { failCoalesced: true })
    await pointer(slider, 'pointermove', 90, 50, 120, { failCoalesced: true })
    await pointer(slider, 'pointerup', 40, 50, 110, { failCoalesced: true })
    expect(commit).toHaveBeenCalledExactlyOnceWith(30)
    expect(slider.hasPointerCapture(1)).toBe(false)
    await act(async () => mc.frames(200, 16))
    expect(rail()).toBe(30)
    expect(mc.clock.size).toBe(0)
})

it('malformed terminal coordinates cancel instead of committing stale input', async () => {
    const mc = createManualClock()
    const commit = vi.fn()
    await render(<IosExposureSlider clock={mc.clock} onValueCommit={commit} />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 50, 50, 120)
    await pointer(slider, 'pointerup', Number.NaN, 50, 140)
    expect(commit).not.toHaveBeenCalled()
    expect(slider.hasPointerCapture(1)).toBe(false)
    await act(async () => mc.frames(200, 16))
    expect(rail()).toBe(0)
    expect(mc.clock.size).toBe(0)
})

it('swipe consumes final-up geometry for threshold crossing and reversal below the threshold', async () => {
    const mc = createManualClock()
    const action = vi.fn()
    await render(<IosSwipeActions clock={mc.clock} onAction={action} />)
    let row = q('[data-swipe-surface]')
    await pointer(row, 'pointerdown', 0, 50, 100)
    await pointer(row, 'pointerup', 340, 50, 200)
    expect(action).toHaveBeenCalledExactlyOnceWith('read')
    await render(null)
    action.mockClear()
    await render(<IosSwipeActions clock={mc.clock} onAction={action} />)
    row = q('[data-swipe-surface]')
    await pointer(row, 'pointerdown', 0, 50, 300)
    await pointer(row, 'pointermove', 340, 50, 400)
    await pointer(row, 'pointerup', 200, 50, 410)
    expect(action).not.toHaveBeenCalled()
    expect(row.hasPointerCapture(1)).toBe(false)
})

it('a held control releases capture and clock work on unmount without a late commit', async () => {
    const mc = createManualClock()
    const commit = vi.fn()
    await render(<IosExposureSlider clock={mc.clock} onValueCommit={commit} />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 80, 50, 120)
    await render(null)
    expect(slider.hasPointerCapture(1)).toBe(false)
    expect(mc.clock.size).toBe(0)
    expect(commit).not.toHaveBeenCalled()
})

it('rejected release keeps every painted value channel on the controlled value', async () => {
    const mc = createManualClock()
    await render(<IosExposureSlider clock={mc.clock} value={25} />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 80, 50, 120)
    await pointer(slider, 'pointerup', 60, 50, 140)
    for (let i = 0; i < 120; i++) {
        await act(async () => mc.frame(16))
        const surface = q('[data-ios-exposure]')
        const activity = Number(
            surface.style.getPropertyValue('--ani-rail-activity')
        )
        expect(rail()).toBe(25)
        expect(q('[data-exposure-reset] span').textContent).toBe('25')
        expect(slider.getAttribute('aria-valuenow')).toBe('25')
        expect(Number(surface.style.getPropertyValue('--ani-brightness'))).toBe(
            2 ** 0.25
        )
        expect(
            Number(q('[data-exposure-arc]').style.strokeDashoffset)
        ).toBeCloseTo(2 * Math.PI * 48 * 0.75, 8)
        // Activity has its own legitimate recovery; the notch's value channel
        // must stay authoritative throughout that recovery, not just at settle.
        for (const element of host.querySelectorAll<HTMLElement>(
            '[data-tick]'
        )) {
            const tick = Number(element.dataset.tick)
            const pose = exposureNotch(tick, 25, activity)
            expect(element.style.transform).toBe(
                `translateX(-50%) scaleY(${pose.height / 20})`
            )
            expect(Number(element.style.opacity)).toBeCloseTo(pose.opacity, 6)
        }
    }
    expect(mc.clock.size).toBe(0)
})

it.each([
    'quantize',
    'disable',
] as const)('a %s owner cannot consume the release velocity', async (mode) => {
    const mc = createManualClock()
    function Owner() {
        const [value, setValue] = useState(25)
        const [disabled, setDisabled] = useState(false)
        return (
            <IosExposureSlider
                clock={mc.clock}
                value={value}
                disabled={disabled}
                onValueChange={(next) => {
                    setValue(
                        mode === 'quantize' ? Math.round(next / 10) * 10 : next
                    )
                    if (mode === 'disable' && next > 40) setDisabled(true)
                }}
            />
        )
    }
    await render(<Owner />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 90, 50, 140)
    expect(rail()).toBe(30)
    await pointer(slider, 'pointerup', 86, 50, 180)
    const target = mode === 'quantize' ? 40 : 43
    expect(slider.getAttribute('aria-valuenow')).toBe(String(target))
    const reference = follow(
        { value: 30 },
        {
            clock: mc.clock,
            spring: { m: 1, k: 350, c: 35, tolerance: 0.001 },
        }
    )
    try {
        void reference.set({ value: target }, { velocity: { value: 0 } })
        for (let i = 0; i < 120; i++) {
            await act(async () => mc.frame(16))
            expect(rail()).toBeCloseTo(reference.value.value, 8)
        }
    } finally {
        reference.dispose()
    }
    expect(mc.clock.size).toBe(0)
})

it('keyboard in the same batch supersedes a pending controlled release', async () => {
    const mc = createManualClock()
    function Owner() {
        const [value, setValue] = useState(25)
        return (
            <IosExposureSlider
                clock={mc.clock}
                value={value}
                onValueChange={setValue}
            />
        )
    }
    await render(<Owner />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 90, 50, 140)
    await act(async () => {
        slider.dispatchEvent(pointerEvent('pointerup', 86, 50, 180))
        slider.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Home',
                bubbles: true,
                cancelable: true,
            })
        )
    })
    const reference = follow(
        { value: 30 },
        {
            clock: mc.clock,
            spring: { m: 1, k: 350, c: 35, tolerance: 0.001 },
        }
    )
    try {
        void reference.set({ value: -100 }, { velocity: { value: 0 } })
        for (let i = 0; i < 120; i++) {
            await act(async () => mc.frame(16))
            expect(rail()).toBeCloseTo(reference.value.value, 8)
        }
        expect(slider.getAttribute('aria-valuenow')).toBe('-100')
    } finally {
        reference.dispose()
    }
})

it('a later owner update cannot replay a rejected release velocity', async () => {
    const mc = createManualClock()
    const show = (value: number) =>
        render(<IosExposureSlider clock={mc.clock} value={value} />)
    await show(25)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 90, 50, 140)
    await pointer(slider, 'pointerup', 86, 50, 180)
    await act(async () => mc.frames(120, 16))
    await show(43)
    const reference = follow(
        { value: 25 },
        {
            clock: mc.clock,
            spring: { m: 1, k: 350, c: 35, tolerance: 0.001 },
        }
    )
    try {
        void reference.set({ value: 43 })
        for (let i = 0; i < 120; i++) {
            await act(async () => mc.frame(16))
            expect(rail()).toBeCloseTo(reference.value.value, 8)
        }
    } finally {
        reference.dispose()
    }
})

it.each([
    'pointer id',
    'pointer type',
] as const)('coalesced samples with a foreign %s cannot manufacture velocity', async (foreign) => {
    const mc = createManualClock()
    const commit = vi.fn()
    await render(<IosExposureSlider clock={mc.clock} onValueCommit={commit} />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 0)
    // The real stationary history is outside the 80ms velocity window. An
    // invalid coalesced sample must not become its new oldest speed sample.
    await pointer(slider, 'pointerup', 100, 50, 200, {
        coalesced: [
            {
                x: 500,
                y: 50,
                time: 180,
                ...(foreign === 'pointer id' ? { id: 2 } : { kind: 'pen' }),
            },
        ],
    })
    expect(commit).toHaveBeenCalledExactlyOnceWith(0)
    expect(slider.hasPointerCapture(1)).toBe(false)
})

it('coalesced out-and-back movement cannot turn a brightness drag into a tap', async () => {
    const mc = createManualClock()
    const commit = vi.fn()
    await render(
        <IosSlider clock={mc.clock} defaultValue={0.5} onValueCommit={commit} />
    )
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 50, 180, 100)
    await pointer(slider, 'pointerup', 50, 180, 140, {
        coalesced: [{ x: 50, y: 100, time: 120 }],
    })
    expect(commit).toHaveBeenCalledExactlyOnceWith(0.5)
})

it('disabled is authoritative in pointerup before passive cancellation effects run', async () => {
    const mc = createManualClock()
    const commit = vi.fn()
    function Owner({ disabled }: { disabled: boolean }) {
        useLayoutEffect(() => {
            if (disabled)
                q('[role="slider"]').dispatchEvent(
                    pointerEvent('pointerup', 40, 50, 140)
                )
        }, [disabled])
        return (
            <IosExposureSlider
                clock={mc.clock}
                disabled={disabled}
                onValueCommit={commit}
            />
        )
    }
    await render(<Owner disabled={false} />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 80, 50, 120)
    await render(<Owner disabled={true} />)
    expect(commit).not.toHaveBeenCalled()
    expect(slider.hasPointerCapture(1)).toBe(false)
})

it.each([
    'start',
    'move',
] as const)('an original %s callback error survives a throwing cancellation callback', async (stage) => {
    const original = new Error('original gesture callback failure')
    const cleanup = new Error('secondary cancellation failure')
    const current: { drag: ReturnType<typeof usePointerDrag> | null } = {
        drag: null,
    }
    function View() {
        current.drag = usePointerDrag({
            onStart() {
                if (stage === 'start') throw original
            },
            onMove() {
                throw original
            },
            onEnd() {
                // This case ends only through its failing start/move callback.
            },
            onCancel() {
                throw cleanup
            },
        })
        return <div data-drag-test="" />
    }
    await render(<View />)
    const element = q('[data-drag-test]')
    const event = (type: string) => {
        const nativeEvent = pointerEvent(type, 0, 0, 100)
        return {
            currentTarget: element,
            nativeEvent,
            pointerId: 1,
            pointerType: 'mouse',
            button: 0,
            isPrimary: true,
            clientX: 0,
            clientY: 0,
            timeStamp: 100,
            preventDefault() {
                // Direct handler invocation has no browser default action.
            },
        } as ReactPointerEvent<HTMLElement>
    }
    const drag = current.drag!
    if (stage === 'move') drag.onPointerDown(event('pointerdown'))
    expect(() =>
        stage === 'start'
            ? drag.onPointerDown(event('pointerdown'))
            : drag.onPointerMove(event('pointermove'))
    ).toThrow(original)
    expect(drag.active()).toBe(false)
    expect(element.hasPointerCapture(1)).toBe(false)
})

it('recatching in the release batch invalidates the old pending release', async () => {
    const mc = createManualClock()
    function Owner() {
        const [value, setValue] = useState(25)
        return (
            <IosExposureSlider
                clock={mc.clock}
                value={value}
                onValueChange={setValue}
            />
        )
    }
    await render(<Owner />)
    const slider = q('[role="slider"]')
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 90, 50, 140)
    await act(async () => {
        slider.dispatchEvent(pointerEvent('pointerup', 86, 50, 180))
        slider.dispatchEvent(pointerEvent('pointerdown', 100, 50, 190))
        slider.dispatchEvent(pointerEvent('pointermove', 96, 50, 210))
    })
    expect(slider.hasPointerCapture(1)).toBe(true)
    for (let i = 0; i < 10; i++) {
        await act(async () => mc.frame(16))
        expect(rail()).toBe(32)
    }
    expect(mc.clock.size).toBe(0)
    await pointer(slider, 'pointercancel', 96, 50, 230)
    await act(async () => mc.frames(120, 16))
    expect(rail()).toBe(30)
    expect(slider.hasPointerCapture(1)).toBe(false)
    expect(mc.clock.size).toBe(0)
})
