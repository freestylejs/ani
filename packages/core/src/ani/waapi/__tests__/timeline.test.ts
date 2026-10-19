import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rafTimeline } from '~/ani/raf'
import { ani } from '~/nodes'
import { isWaapiTimeline, waapiTimeline } from '../timeline'

interface MockEffect {
    target: Element
    keyframes: Keyframe[]
    options: KeyframeEffectOptions
}

interface MockAnimationInstance {
    effect: MockEffect
    timeline: unknown
    play: ReturnType<typeof vi.fn>
    pause: ReturnType<typeof vi.fn>
    cancel: ReturnType<typeof vi.fn>
    commitStyles: ReturnType<typeof vi.fn>
    finish: ReturnType<typeof vi.fn>
    playState: string
    finished: Promise<void>
    currentTime: number | null
}

describe('WebAniTimeline', () => {
    let createdEffects: MockEffect[]
    let createdAnimations: MockAnimationInstance[]

    beforeEach(() => {
        createdEffects = []
        createdAnimations = []

        class KeyframeEffectMock {
            public constructor(
                target: Element,
                keyframes: Keyframe[],
                options: KeyframeEffectOptions
            ) {
                createdEffects.push({ target, keyframes, options })
            }
        }

        class AnimationMock {
            public play = vi.fn()
            public pause = vi.fn()
            public cancel = vi.fn()
            public commitStyles = vi.fn()
            public finished = new Promise<void>(() => undefined)
            public finish = vi.fn()
            public playState = 'running'
            public currentTime: number | null = null
            public constructor(
                public effect: MockEffect,
                public timeline: unknown
            ) {
                createdAnimations.push(this)
            }
        }

        vi.stubGlobal('KeyframeEffect', KeyframeEffectMock)
        vi.stubGlobal('Animation', AnimationMock)

        vi.stubGlobal('document', { timeline: {} })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('should interpret repeat as additional iterations', () => {
        const timeline = waapiTimeline(ani({ to: { opacity: 1 }, duration: 1 }))
        timeline.play({} as Element, {
            from: { opacity: 0 },
            repeat: 2,
        })

        expect(createdEffects[0]!.options.iterations).toBe(3)
    })

    it('should forward effect options to KeyframeEffect', () => {
        const timeline = waapiTimeline(ani({ to: { opacity: 1 }, duration: 1 }))
        timeline.play({} as Element, {
            from: { opacity: 0 },
            effect: {
                direction: 'alternate',
                fill: 'both',
            },
        })

        expect(createdEffects[0]!.options.direction).toBe('alternate')
        expect(createdEffects[0]!.options.fill).toBe('both')
    })

    it('should apply resolver while compiling keyframes', () => {
        const timeline = waapiTimeline(ani({ to: { x: 100 }, duration: 1 }))
        timeline.play({} as Element, {
            from: { x: 0 },
            resolver: {
                x: (value) => ({
                    key: 'left',
                    value: `${value}px`,
                }),
            },
        })

        const [first, last] = createdEffects[0]!.keyframes as Array<
            Record<string, unknown>
        >

        expect(first!.left).toBe('0px')
        expect(last!.left).toBe('100px')
        expect(first!.x).toBeUndefined()
        expect(last!.x).toBeUndefined()
    })

    it('isWaapiTimeline accepts a timeline and an object with the same surface', () => {
        const timeline = waapiTimeline(ani({ to: { opacity: 1 }, duration: 1 }))
        const facade = {
            status: timeline.status,
            duration: timeline.duration,
            animations: timeline.animations,
            value: timeline.value,
            play: timeline.play,
            pause: timeline.pause,
            resume: timeline.resume,
            seek: timeline.seek,
            finish: timeline.finish,
            cancel: timeline.cancel,
            reset: timeline.reset,
            dispose: timeline.dispose,
            valueAt: timeline.valueAt,
            onStatus: timeline.onStatus,
        }
        expect(isWaapiTimeline(timeline)).toBe(true)
        expect(isWaapiTimeline(facade)).toBe(true)
        expect(isWaapiTimeline({ ...facade, finish: undefined })).toBe(false)
        expect(
            isWaapiTimeline(rafTimeline(ani({ to: [1], duration: 1 })))
        ).toBe(false)
    })

    it('should expose cancel alias with reset behavior', () => {
        const timeline = waapiTimeline(ani({ to: { opacity: 1 }, duration: 1 }))
        timeline.play({} as Element, {
            from: { opacity: 0 },
        })

        expect(timeline.animations).toHaveLength(1)
        timeline.cancel()

        expect(createdAnimations[0]!.cancel).toHaveBeenCalledTimes(1)
        expect(timeline.animations).toHaveLength(0)
        expect(timeline.status).toBe('IDLE')
    })

    it('should pause, resume and seek every target keeping its delay', () => {
        const timeline = waapiTimeline(ani({ to: { opacity: 1 }, duration: 2 }))
        const targets = [{}, {}] as Element[]
        timeline.play(targets, { from: { opacity: 0 }, stagger: 0.5 })

        timeline.pause()
        expect(timeline.status).toBe('PAUSED')
        expect(createdAnimations[0]!.pause).toHaveBeenCalledTimes(1)
        timeline.pause()
        expect(createdAnimations[1]!.pause).toHaveBeenCalledTimes(1)

        timeline.seek(1)
        expect(createdAnimations.map((x) => x.currentTime)).toEqual([
            1000, 1500,
        ])
        timeline.seek(99)
        expect(createdAnimations[0]!.currentTime).toBe(2000)

        timeline.resume()
        expect(timeline.status).toBe('PLAYING')
        expect(createdAnimations[0]!.play).toHaveBeenCalledTimes(2)
        timeline.resume()
        expect(createdAnimations[0]!.play).toHaveBeenCalledTimes(2)
    })

    it('should leave finished targets alone on pause and resume', () => {
        const timeline = waapiTimeline(ani({ to: { opacity: 1 }, duration: 1 }))
        timeline.play([{}, {}] as Element[], {
            from: { opacity: 0 },
            stagger: 0.5,
        })
        createdAnimations[0]!.playState = 'finished'

        timeline.pause()
        timeline.resume()

        expect(createdAnimations[0]!.pause).not.toHaveBeenCalled()
        expect(createdAnimations[0]!.play).toHaveBeenCalledTimes(1)
        expect(createdAnimations[1]!.pause).toHaveBeenCalledTimes(1)
        expect(createdAnimations[1]!.play).toHaveBeenCalledTimes(2)
    })

    it('should not start a run from a listener notified during dispose', async () => {
        const timeline = waapiTimeline(ani({ to: { opacity: 1 }, duration: 1 }))
        const element = {} as Element
        timeline.play(element, { from: { opacity: 0 } })
        let replay: Promise<string> | null = null
        timeline.onStatus((status) => {
            if (status === 'IDLE') {
                replay = timeline.play(element, { from: { opacity: 0 } })
            }
        })

        timeline.dispose()

        await expect(replay).resolves.toBe('disposed')
        expect(createdAnimations).toHaveLength(1)
    })

    it('should isolate status listener errors and stop after unsubscribe', () => {
        const deferred: Array<() => void> = []
        vi.stubGlobal('queueMicrotask', (task: () => void) => {
            deferred.push(task)
        })
        const timeline = waapiTimeline(ani({ to: { opacity: 1 }, duration: 1 }))
        const seen: string[] = []
        timeline.onStatus(() => {
            throw new Error('listener failed')
        })
        const off = timeline.onStatus((status) => seen.push(status))

        timeline.play({} as Element, { from: { opacity: 0 } })
        expect(seen).toEqual(['PLAYING'])
        expect(deferred).toHaveLength(1)
        expect(() => deferred[0]!()).toThrow('listener failed')

        off()
        timeline.cancel()
        expect(seen).toEqual(['PLAYING'])
    })

    it('should commit and cancel the held animations of an ended run', async () => {
        const timeline = waapiTimeline(ani({ to: { opacity: 1 }, duration: 1 }))
        const element = {} as Element
        const first = timeline.play(element, { from: { opacity: 0 } })
        timeline.finish()
        await expect(first).resolves.toBe('ended')

        timeline.play(element, { from: { opacity: 0 } })
        expect(createdAnimations[0]!.commitStyles).toHaveBeenCalledTimes(1)
        expect(createdAnimations[0]!.cancel).toHaveBeenCalledTimes(1)
    })

    it('should refuse to finish an endless run', () => {
        const timeline = waapiTimeline(ani({ to: { opacity: 1 }, duration: 1 }))
        timeline.play({} as Element, {
            from: { opacity: 0 },
            repeat: Infinity,
        })

        expect(() => timeline.finish()).toThrow(RangeError)
        expect(timeline.status).toBe('PLAYING')
    })
})
