import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ani } from '~/nodes'
import { waapiTimeline } from '../timeline'

interface MockAnimationInstance {
    finish: ReturnType<typeof vi.fn>
    play: ReturnType<typeof vi.fn>
    playbackRate: number
}

describe('WebAniTimeline reduced motion', () => {
    let iterations: number[]
    let animations: MockAnimationInstance[]

    beforeEach(() => {
        iterations = []
        animations = []

        class KeyframeEffectMock {
            public constructor(
                _target: Element,
                _keyframes: Keyframe[],
                options: KeyframeEffectOptions
            ) {
                iterations.push(options.iterations as number)
            }
        }

        class AnimationMock {
            public play = vi.fn()
            public finish = vi.fn()
            public cancel = vi.fn()
            public commitStyles = vi.fn()
            public finished = new Promise<void>(() => undefined)
            public playbackRate = 1
            public constructor() {
                animations.push(this)
            }
        }

        vi.stubGlobal('KeyframeEffect', KeyframeEffectMock)
        vi.stubGlobal('Animation', AnimationMock)
        vi.stubGlobal('document', { timeline: {} })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    const tree = ani({ to: { opacity: 1 }, duration: 1 })
    const on = { reducedMotion: true }

    it('jump ends an endless run after one iteration', async () => {
        const line = waapiTimeline(tree, { clock: on })

        const run = line.play({} as Element, {
            from: { opacity: 0 },
            repeat: Infinity,
        })

        expect(iterations).toEqual([1])
        expect(animations[0]!.finish).toHaveBeenCalledTimes(1)
        expect(animations[0]!.play).not.toHaveBeenCalled()
        await expect(run).resolves.toBe('ended')
        expect(line.status).toBe('ENDED')
    })

    it('jump keeps the iterations of a finite repeat', () => {
        const line = waapiTimeline(tree, { clock: on })

        line.play({} as Element, { from: { opacity: 0 }, repeat: 2 })

        expect(iterations).toEqual([3])
    })

    it('the preference is read at each play', () => {
        const source = { reducedMotion: false }
        const line = waapiTimeline(tree, { clock: source })

        line.play({} as Element, { from: { opacity: 0 } })
        expect(animations[0]!.finish).not.toHaveBeenCalled()

        source.reducedMotion = true
        line.play({} as Element, { from: { opacity: 0 } })
        expect(animations[1]!.finish).toHaveBeenCalledTimes(1)
        expect(line.status).toBe('ENDED')
    })

    it('rejects a malformed policy at construction', () => {
        expect(() =>
            waapiTimeline(tree, { reducedMotion: 'always' as never })
        ).toThrow(TypeError)
        expect(() =>
            waapiTimeline(tree, { reducedMotion: { maxDuration: Infinity } })
        ).toThrow(RangeError)
    })
})
