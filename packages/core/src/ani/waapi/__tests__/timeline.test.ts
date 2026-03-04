import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ani } from '~/nodes'
import { webTimeline } from '../timeline'

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
            public currentTime: number | null = null
            public constructor(effect: MockEffect, timeline: unknown) {
                const animation: MockAnimationInstance = {
                    effect,
                    timeline,
                    play: this.play,
                    pause: this.pause,
                    cancel: this.cancel,
                    currentTime: null,
                }
                createdAnimations.push(animation)
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
        const timeline = webTimeline(
            ani({ to: { opacity: 1 }, duration: 1 })
        )
        timeline.play({} as Element, {
            from: { opacity: 0 },
            repeat: 2,
        })

        expect(createdEffects[0]!.options.iterations).toBe(3)
    })

    it('should forward keyframeEffect options to KeyframeEffect', () => {
        const timeline = webTimeline(
            ani({ to: { opacity: 1 }, duration: 1 })
        )
        timeline.play({} as Element, {
            from: { opacity: 0 },
            keyframeEffect: {
                direction: 'alternate',
                fill: 'both',
            },
        })

        expect(createdEffects[0]!.options.direction).toBe('alternate')
        expect(createdEffects[0]!.options.fill).toBe('both')
    })

    it('should apply propertyResolver while compiling keyframes', () => {
        const timeline = webTimeline(ani({ to: { x: 100 }, duration: 1 }))
        timeline.play({} as Element, {
            from: { x: 0 },
            propertyResolver: {
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
})
