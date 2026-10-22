// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
    boxOf,
    cancelAnimations,
    pauseAt,
    resumeAnimations,
    runPausedOracle,
    sampleBoxes,
} from '../../../../tests/browser/cases/cpc_harness'

interface FakeAnimation {
    paused: boolean
    currentTime: number
    plays: number
    cancels: number
    pause(): void
    play(): void
    cancel(): void
}

function fakeAnimation(): FakeAnimation {
    return {
        paused: false,
        currentTime: 0,
        plays: 0,
        cancels: 0,
        pause() {
            this.paused = true
        },
        play() {
            this.paused = false
            this.plays += 1
        },
        cancel() {
            this.cancels += 1
        },
    }
}

function fakeElement(box: {
    left: number
    top: number
    width: number
    height: number
}): HTMLElement {
    const element = document.createElement('div')
    element.getBoundingClientRect = () =>
        ({
            ...box,
            x: box.left,
            y: box.top,
            right: box.left + box.width,
            bottom: box.top + box.height,
            toJSON: () => ({}),
        }) as DOMRect
    return element
}

describe('CPC oracle helper', () => {
    it('pauses at an explicit timeline offset and captures all box edges', () => {
        const element = fakeElement({
            left: 10,
            top: 20,
            width: 30,
            height: 40,
        })
        const animation = fakeAnimation()
        const sample = sampleBoxes(
            [element],
            [animation as unknown as Animation],
            120
        )
        expect(animation.paused).toBe(true)
        expect(animation.currentTime).toBe(120)
        expect(sample.at).toBe(120)
        expect(sample.boxes[0]).toEqual({
            left: 10,
            top: 20,
            width: 30,
            height: 40,
        })
        expect(boxOf(element).width).toBe(30)
    })

    it('resumes and cancels paused animations', () => {
        const animation = fakeAnimation()
        pauseAt([animation as unknown as Animation], 42)
        resumeAnimations([animation as unknown as Animation])
        expect(animation.plays).toBe(1)
        expect(animation.paused).toBe(false)
        cancelAnimations([animation as unknown as Animation])
        expect(animation.cancels).toBe(1)
    })

    it('runs mutate, target, interior samples and completion through a group', async () => {
        const element = fakeElement({
            left: 0,
            top: 20,
            width: 10,
            height: 10,
        })
        const animation = fakeAnimation()
        Object.defineProperty(element, 'getAnimations', {
            configurable: true,
            value: () => [animation as unknown as Animation],
        })
        const play = vi.fn(() => Promise.resolve('ended'))
        const group = {
            play,
            finish: vi.fn(),
            capture: vi.fn(),
            dispose: vi.fn(),
        }
        const run = await runPausedOracle(
            group as never,
            [element],
            {} as never,
            () => {
                element.getBoundingClientRect = () =>
                    ({
                        left: 0,
                        top: 0,
                        x: 0,
                        y: 0,
                        width: 10,
                        height: 10,
                        right: 10,
                        bottom: 10,
                        toJSON: () => ({}),
                    }) as DOMRect
            }
        )
        expect(play).toHaveBeenCalledTimes(1)
        expect(run.before[0]!.top).toBe(20)
        expect(run.target[0]!.top).toBe(0)
        expect(run.first.at).toBe(0)
        expect(run.middle.at).toBe(120)
        expect(run.result).toBe('ended')
        expect(animation.plays).toBe(1)
    })
})
