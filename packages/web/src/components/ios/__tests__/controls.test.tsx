// @vitest-environment jsdom
import { act, type ReactNode, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../../../core/src/testing/index'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
    ;(
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const captures = new WeakMap<Element, number>()
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
    vi.restoreAllMocks()
})
async function render(node: ReactNode) {
    await act(async () => root.render(node))
}
async function press(element: Element, key: string) {
    await act(async () =>
        element.dispatchEvent(
            new KeyboardEvent('keydown', {
                key,
                bubbles: true,
                cancelable: true,
            })
        )
    )
}
async function pointer(
    element: Element,
    type: string,
    x: number,
    y: number,
    time: number,
    id = 1
) {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
    })
    Object.defineProperties(event, {
        pointerId: { value: id },
        pointerType: { value: 'touch' },
        timeStamp: { value: time },
    })
    await act(async () => element.dispatchEvent(event))
}
async function load() {
    const modules = await Promise.all([
        import('../ios_slider').catch(() => null),
        import('../ios_exposure_slider').catch(() => null),
        import('../ios_swipe_actions').catch(() => null),
        import('../ios_pointer').catch(() => null),
    ])
    expect(
        modules.every(Boolean),
        'all four reusable controls must exist'
    ).toBe(true)
    return { ...modules[0]!, ...modules[1]!, ...modules[2]!, ...modules[3]! }
}

it('brightness keyboard input is semantic, bounded and leaves no clock subscription on unmount', async () => {
    const { IosSlider } = await load()
    const mc = createManualClock()
    const change = vi.fn()
    await render(
        <StrictMode>
            <IosSlider
                clock={mc.clock}
                defaultValue={0.5}
                onValueChange={change}
            />
        </StrictMode>
    )
    const slider = host.querySelector('[role="slider"]')!
    expect(slider.getAttribute('aria-valuenow')).toBe('0.5')
    await press(slider, 'ArrowUp')
    expect(change).toHaveBeenLastCalledWith(0.55)
    expect(slider.getAttribute('aria-valuenow')).toBe('0.55')
    await press(slider, 'End')
    expect(change).toHaveBeenLastCalledWith(1)
    await press(slider, 'ArrowUp')
    expect(slider.getAttribute('aria-valuenow')).toBe('1')
    await act(async () => mc.frames(150, 16))
    expect(mc.clock.size).toBe(0)
    await render(null)
    expect(mc.clock.size).toBe(0)
})

it('controlled brightness never changes without owner acceptance; disabled input is inert', async () => {
    const { IosSlider } = await load()
    const mc = createManualClock()
    const change = vi.fn()
    await render(
        <IosSlider clock={mc.clock} value={0.25} onValueChange={change} />
    )
    await press(host.querySelector('[role="slider"]')!, 'End')
    expect(change).toHaveBeenCalledWith(1)
    expect(
        host.querySelector('[role="slider"]')!.getAttribute('aria-valuenow')
    ).toBe('0.25')
    await render(
        <IosSlider
            clock={mc.clock}
            value={0.75}
            onValueChange={change}
            disabled={true}
        />
    )
    expect(
        host.querySelector('[role="slider"]')!.getAttribute('aria-valuenow')
    ).toBe('0.75')
    change.mockClear()
    await press(host.querySelector('[role="slider"]')!, 'Home')
    expect(change).not.toHaveBeenCalled()
})

it('exposure supports both ends, reset and an owner supplied image', async () => {
    const { IosExposureSlider } = await load()
    const mc = createManualClock()
    const change = vi.fn()
    await render(
        <IosExposureSlider
            clock={mc.clock}
            imageSrc="/fixture.jpg"
            onValueChange={change}
        />
    )
    const slider = host.querySelector('[role="slider"]')!
    await press(slider, 'End')
    expect(change).toHaveBeenLastCalledWith(100)
    await press(slider, 'Home')
    expect(change).toHaveBeenLastCalledWith(-100)
    const reset = host.querySelector<HTMLButtonElement>(
        '[data-exposure-reset]'
    )!
    await act(async () => reset.click())
    expect(change).toHaveBeenLastCalledWith(0)
    expect(host.querySelector('img')!.getAttribute('src')).toBe('/fixture.jpg')
})

it('swipe keyboard reveals an action, activates once and cancels without activation', async () => {
    const { IosSwipeActions } = await load()
    const mc = createManualClock()
    const action = vi.fn()
    await render(<IosSwipeActions clock={mc.clock} onAction={action} />)
    const row = host.querySelector<HTMLElement>('[data-swipe-surface]')!
    await press(row, 'ArrowLeft')
    await act(async () => mc.frames(100, 16))
    expect(
        host.querySelector('[data-swipe-root]')!.getAttribute('data-open')
    ).toBe('right')
    const button = host.querySelector<HTMLButtonElement>(
        '[data-swipe-action="flag"]'
    )!
    await act(async () => button.click())
    expect(action).toHaveBeenCalledExactlyOnceWith('flag')
    await press(row, 'ArrowRight')
    await press(row, 'Escape')
    await act(async () => mc.frames(100, 16))
    expect(action).toHaveBeenCalledTimes(1)
    expect(
        host.querySelector('[data-swipe-root]')!.getAttribute('data-open')
    ).toBe('none')
})

it('pointer is scoped, reusable and never writes document cursor styles', async () => {
    const { IosPointer } = await load()
    const mc = createManualClock()
    const select = vi.fn()
    const cursor = document.documentElement.style.cursor
    await render(
        <>
            <IosPointer clock={mc.clock} label="Appearance" onPress={select} />
            <IosPointer clock={mc.clock} label="Another" />
        </>
    )
    const buttons = host.querySelectorAll('button')
    await act(async () => (buttons[0] as HTMLButtonElement).click())
    expect(select).toHaveBeenCalledTimes(1)
    expect(buttons[1]!.textContent).toContain('Another')
    await render(null)
    expect(document.documentElement.style.cursor).toBe(cursor)
    expect(mc.clock.size).toBe(0)
})

it('brightness ignores another pointer and cancels to its captured semantic baseline', async () => {
    const { IosSlider } = await load()
    const mc = createManualClock()
    const commit = vi.fn()
    await render(
        <IosSlider clock={mc.clock} defaultValue={0.5} onValueCommit={commit} />
    )
    const slider = host.querySelector<HTMLElement>('[role="slider"]')!
    await pointer(slider, 'pointerdown', 50, 100, 100)
    await pointer(slider, 'pointermove', 50, 0, 120, 2)
    expect(slider.getAttribute('aria-valuenow')).toBe('0.5')
    await pointer(slider, 'pointermove', 50, 50, 140)
    expect(Number(slider.getAttribute('aria-valuenow'))).toBeGreaterThan(0.7)
    await pointer(slider, 'pointercancel', 50, 50, 150)
    expect(slider.getAttribute('aria-valuenow')).toBe('0.5')
    expect(slider.hasPointerCapture(1)).toBe(false)
    expect(commit).not.toHaveBeenCalled()
    await act(async () => mc.frames(150, 16))
    expect(mc.clock.size).toBe(0)
})

it('full swipe acts on the actually revealed side even when final velocity reverses', async () => {
    const { IosSwipeActions } = await load()
    const mc = createManualClock()
    const action = vi.fn()
    await render(<IosSwipeActions clock={mc.clock} onAction={action} />)
    const row = host.querySelector<HTMLElement>('[data-swipe-surface]')!
    await pointer(row, 'pointerdown', 0, 0, 1)
    // Final position stays beyond full-swipe threshold, while the sampled
    // velocity predicts the opposite side. Both terminal position and velocity
    // must be consumed; crossing back below the threshold is tested separately.
    await pointer(row, 'pointermove', 380, 0, 100)
    await pointer(row, 'pointerup', 320, 0, 110)
    expect(action).toHaveBeenCalledExactlyOnceWith('read')
    expect(row.hasPointerCapture(1)).toBe(false)
})

it('exposure release commits the same snapped semantic value that it displays', async () => {
    const { IosExposureSlider } = await load()
    const mc = createManualClock()
    const commit = vi.fn()
    await render(<IosExposureSlider clock={mc.clock} onValueCommit={commit} />)
    const slider = host.querySelector<HTMLElement>('[role="slider"]')!
    await pointer(slider, 'pointerdown', 100, 50, 100)
    await pointer(slider, 'pointermove', 79, 50, 120)
    await pointer(slider, 'pointerup', 79, 50, 220)
    expect(commit).toHaveBeenCalledExactlyOnceWith(11)
    expect(slider.getAttribute('aria-valuenow')).toBe('11')
})
