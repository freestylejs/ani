// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLayoutGroup } from '../layout_group'

type Box = { x: number; y: number; width: number; height: number }

function makeElement(box: Box): HTMLElement {
    const element = document.createElement('div')
    document.body.append(element)
    setBox(element, box)
    return element
}

function setBox(element: HTMLElement, box: Box): void {
    element.getBoundingClientRect = () =>
        ({
            x: box.x,
            y: box.y,
            left: box.x,
            top: box.y,
            right: box.x + box.width,
            bottom: box.y + box.height,
            width: box.width,
            height: box.height,
            toJSON: () => ({}),
        }) as DOMRect
    Object.defineProperty(element, 'offsetWidth', {
        configurable: true,
        value: box.width,
    })
    Object.defineProperty(element, 'offsetHeight', {
        configurable: true,
        value: box.height,
    })
}

interface FakeAnimation extends Animation {
    keyframes: Keyframe[]
    options: KeyframeAnimationOptions
}

const animations: FakeAnimation[] = []
let animateSpy: ReturnType<typeof vi.fn>

function installAnimation(): void {
    animateSpy = vi.fn(
        (keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
            let resolve!: (value: Animation) => void
            const finished = new Promise<Animation>((done) => {
                resolve = done
            })
            const animation = {
                keyframes,
                options,
                finished,
                cancel: vi.fn(() => resolve(animation as Animation)),
                finish: vi.fn(() => resolve(animation as Animation)),
            } as unknown as FakeAnimation
            animations.push(animation)
            queueMicrotask(() => resolve(animation as Animation))
            return animation
        }
    )
    ;(Element.prototype as unknown as { animate: typeof animateSpy }).animate =
        animateSpy
}

beforeEach(() => {
    animations.length = 0
    ;(globalThis as unknown as { CSS: { supports: () => boolean } }).CSS = {
        supports: () => true,
    }
    installAnimation()
})

afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    delete (Element.prototype as unknown as { animate?: unknown }).animate
    delete (globalThis as unknown as { CSS?: unknown }).CSS
})

describe('createLayoutGroup', () => {
    it('animates position with additive translate and leaves inline styles alone', async () => {
        const element = makeElement({ x: 0, y: 0, width: 100, height: 50 })
        const group = createLayoutGroup({ motion: { duration: 0.2 } })
        group.add(element)
        const snapshot = group.capture()
        setBox(element, { x: 40, y: 20, width: 100, height: 50 })

        const result = await group.play(snapshot)

        expect(result).toBe('ended')
        expect(animateSpy).toHaveBeenCalledTimes(1)
        const [keyframes, options] = animateSpy.mock.calls[0]!
        expect(keyframes).toEqual([
            { translate: '-40px -20px' },
            { translate: '0px 0px' },
        ])
        expect(options).toMatchObject({
            composite: 'add',
            fill: 'none',
            duration: 200,
        })
        expect(element.style.translate).toBe('')
        expect(group.active).toBe(false)
        group.dispose()
    })

    it('returns no-change without creating or cancelling animations', async () => {
        const element = makeElement({ x: 0, y: 0, width: 100, height: 50 })
        const group = createLayoutGroup()
        group.add(element)
        const snapshot = group.capture()

        await expect(group.play(snapshot)).resolves.toBe('no-change')
        expect(animateSpy).not.toHaveBeenCalled()
        group.dispose()
    })

    it('steps box mode down to scale with origin compensation', async () => {
        const element = makeElement({ x: 0, y: 0, width: 100, height: 50 })
        const group = createLayoutGroup({ motion: { duration: 0.2 } })
        group.add(element, { layout: 'box' })
        const snapshot = group.capture()
        setBox(element, { x: 20, y: 10, width: 50, height: 25 })

        await expect(group.play(snapshot)).resolves.toBe('ended')

        const [keyframes] = animateSpy.mock.calls[0]!
        expect(keyframes[0]).toMatchObject({
            translate: '5px 2.5px',
            scale: '2 2',
        })
        expect(keyframes[1]).toMatchObject({
            translate: '0px 0px',
            scale: '1 1',
        })
        group.dispose()
    })

    it('caps a large change instead of animating half the list', async () => {
        const group = createLayoutGroup({ maxAnimated: 1 })
        const first = makeElement({ x: 0, y: 0, width: 10, height: 10 })
        const second = makeElement({ x: 20, y: 0, width: 10, height: 10 })
        group.add(first)
        group.add(second)
        const snapshot = group.capture()
        setBox(first, { x: 1, y: 0, width: 10, height: 10 })
        setBox(second, { x: 21, y: 0, width: 10, height: 10 })

        await expect(group.play(snapshot)).resolves.toBe('capped')
        expect(animateSpy).not.toHaveBeenCalled()
        group.dispose()
    })

    it('hands a layoutId from a removed element to a new element', async () => {
        const group = createLayoutGroup({ motion: { duration: 0.2 } })
        const old = makeElement({ x: 0, y: 0, width: 100, height: 50 })
        group.add(old, { layoutId: 'card' })
        const snapshot = group.capture()
        group.add(old)()
        old.remove()

        const next = makeElement({ x: 30, y: 20, width: 100, height: 50 })
        group.add(next, { layoutId: 'card' })

        await expect(group.play(snapshot)).resolves.toBe('ended')
        expect(animateSpy).toHaveBeenCalledTimes(1)
        const [keyframes] = animateSpy.mock.calls[0]!
        expect(keyframes[0]).toEqual({ translate: '-30px -20px' })
        group.dispose()
    })

    it('rejects a snapshot that expired before play', async () => {
        const element = makeElement({ x: 0, y: 0, width: 10, height: 10 })
        const group = createLayoutGroup()
        group.add(element)
        const snapshot = group.capture()
        await Promise.resolve()
        await expect(group.play(snapshot)).resolves.toBe('stale')
        expect(animateSpy).not.toHaveBeenCalled()
        group.dispose()
    })

    it('does not interrupt an active run when a later play has no change', async () => {
        const element = makeElement({ x: 0, y: 0, width: 10, height: 10 })
        const group = createLayoutGroup()
        group.add(element)
        const first = group.capture()
        setBox(element, { x: 10, y: 0, width: 10, height: 10 })
        void group.play(first)
        const second = group.capture()
        const secondRun = group.play(second)

        expect(animations[0]!.cancel).not.toHaveBeenCalled()
        expect(group.active).toBe(true)
        await expect(secondRun).resolves.toBe('no-change')
        expect(animateSpy).toHaveBeenCalledTimes(1)
        group.finish()
        group.dispose()
    })

    it('retargets from the live visual box without a jump', async () => {
        const element = makeElement({ x: 0, y: 0, width: 10, height: 10 })
        const group = createLayoutGroup()
        group.add(element)
        const first = group.capture()
        setBox(element, { x: 100, y: 0, width: 10, height: 10 })
        void group.play(first)

        setBox(element, { x: 140, y: 0, width: 10, height: 10 })
        const second = group.capture()
        setBox(element, { x: 200, y: 0, width: 10, height: 10 })
        void group.play(second)

        expect(animateSpy).toHaveBeenCalledTimes(2)
        const secondKeyframes = animateSpy.mock.calls[1]![0]
        expect(secondKeyframes[0]).toEqual({ translate: '-60px 0px' })
        group.finish()
        group.dispose()
    })

    it('snaps transformed contexts instead of trusting rect/offset ratios', async () => {
        const element = makeElement({ x: 0, y: 0, width: 100, height: 50 })
        const group = createLayoutGroup()
        group.add(element)
        const snapshot = group.capture()
        setBox(element, { x: 20, y: 0, width: 100, height: 50 })
        Object.defineProperty(element, 'offsetWidth', {
            configurable: true,
            value: 50,
        })

        await expect(group.play(snapshot)).resolves.toBe('no-change')
        expect(animateSpy).not.toHaveBeenCalled()
        group.dispose()
    })

    it('bounds computed-style reads to maxBoxes including rejected boxes', async () => {
        const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
            scale: '2',
            rotate: 'none',
            transform: 'none',
            translate: 'none',
            transformOrigin: '50% 50%',
            borderTopLeftRadius: '0px',
            borderTopRightRadius: '0px',
            borderBottomRightRadius: '0px',
            borderBottomLeftRadius: '0px',
        } as CSSStyleDeclaration)
        const group = createLayoutGroup({ maxBoxes: 1 })
        const elements = Array.from({ length: 3 }, (_, index) =>
            makeElement({ x: index * 10, y: 0, width: 10, height: 10 })
        )
        for (const element of elements) {
            group.add(element, { layout: 'box' })
        }
        const snapshot = group.capture()
        for (const [index, element] of elements.entries()) {
            setBox(element, {
                x: index * 10 + 20,
                y: 0,
                width: 10,
                height: 10,
            })
        }

        await expect(group.play(snapshot)).resolves.toBe('ended')
        expect(spy).toHaveBeenCalledTimes(1)
        group.dispose()
        spy.mockRestore()
    })

    it('lets the newest participant win a duplicate layoutId', async () => {
        const group = createLayoutGroup()
        const old = makeElement({ x: 0, y: 0, width: 10, height: 10 })
        const next = makeElement({ x: 20, y: 0, width: 10, height: 10 })
        group.add(old, { layoutId: 'card' })
        group.add(next, { layoutId: 'card' })
        const snapshot = group.capture()
        setBox(old, { x: 40, y: 0, width: 10, height: 10 })
        setBox(next, { x: 60, y: 0, width: 10, height: 10 })

        await expect(group.play(snapshot)).resolves.toBe('ended')
        expect(animateSpy).toHaveBeenCalledTimes(1)
        expect(animateSpy.mock.calls[0]![0][0]).toEqual({
            translate: '-40px 0px',
        })
        group.dispose()
    })

    it('samples radius with axis-separated slash syntax', async () => {
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({
            scale: 'none',
            rotate: 'none',
            transform: 'none',
            translate: 'none',
            transformOrigin: '50% 50%',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px',
            borderBottomRightRadius: '8px',
            borderBottomLeftRadius: '8px',
        } as CSSStyleDeclaration)
        const element = makeElement({ x: 0, y: 0, width: 100, height: 50 })
        const group = createLayoutGroup()
        group.add(element, { layout: 'box' })
        const snapshot = group.capture()
        setBox(element, { x: 0, y: 0, width: 50, height: 50 })

        await expect(group.play(snapshot)).resolves.toBe('ended')
        const frames = animateSpy.mock.calls[0]![0]
        expect(frames).toHaveLength(11)
        expect(frames[0]?.borderRadius).toBe('4px / 8px')
        expect(frames[10]?.borderRadius).toBe('8px / 8px')
        group.dispose()
    })

    it('animates a new layoutId lead while an older run is active', async () => {
        const group = createLayoutGroup()
        const old = makeElement({ x: 0, y: 0, width: 10, height: 10 })
        const removeOld = group.add(old, { layoutId: 'card' })
        const first = group.capture()
        setBox(old, { x: 100, y: 0, width: 10, height: 10 })
        void group.play(first)

        const handoff = group.capture()
        removeOld()
        old.remove()
        const next = makeElement({ x: 140, y: 0, width: 10, height: 10 })
        group.add(next, { layoutId: 'card' })
        void group.play(handoff)

        expect(animateSpy).toHaveBeenCalledTimes(2)
        expect(animateSpy.mock.calls[1]![0][0]).toEqual({
            translate: '-40px 0px',
        })
        group.finish()
        group.dispose()
    })
})
