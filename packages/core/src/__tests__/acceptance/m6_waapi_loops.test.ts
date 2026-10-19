// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as a from '~/index'

/**
 * Minimal stable-API fake: jsdom has no Web Animations. `finish()` resolves
 * the `finished` promise, `cancel()` rejects it, `currentTime` is settable.
 */
interface FakeEffect {
    target: Element
    keyframes: readonly unknown[]
    options: KeyframeEffectOptions
}

class FakeKeyframeEffect {
    public readonly target: Element
    public readonly keyframes: readonly unknown[]
    public readonly options: KeyframeEffectOptions

    public constructor(
        target: Element,
        keyframes: readonly unknown[],
        options: KeyframeEffectOptions
    ) {
        this.target = target
        this.keyframes = keyframes
        this.options = options
        createdEffects.push(this)
    }
}

class FakeAnimation {
    public readonly effect: FakeEffect
    public readonly timeline: unknown
    public currentTime: number | null = null
    public playState: AnimationPlayState = 'idle'
    public readonly commitStyles = vi.fn((): void => undefined)
    public readonly play = vi.fn((): void => {
        this.playState = 'running'
    })
    public readonly pause = vi.fn((): void => {
        this.playState = 'paused'
    })
    public readonly cancel = vi.fn((): void => {
        this.playState = 'idle'
        this._rejectFinished(new Error('animation canceled'))
    })
    public readonly finish = vi.fn((): void => {
        this.playState = 'finished'
        this._resolveFinished()
    })

    private readonly _finished: Promise<void>
    private _resolveFinished!: () => void
    private _rejectFinished!: (reason: unknown) => void

    public constructor(effect: FakeEffect, timeline: unknown) {
        this.effect = effect
        this.timeline = timeline
        this._finished = new Promise<void>((resolve, reject) => {
            this._resolveFinished = resolve
            this._rejectFinished = reject
        })
        // `cancel()` rejects it; the timeline is expected to ignore that.
        this._finished.catch(() => undefined)
        createdAnimations.push(this)
    }

    public get finished(): Promise<void> {
        return this._finished
    }
}

const createdEffects: FakeEffect[] = []
const createdAnimations: FakeAnimation[] = []

const linear = a.timing.linear()

/** Two segments of 1 s each: x 0 -> 100, then x 100 -> 0. */
const child = () =>
    a.sequence([
        a.ani({ to: { x: 100 }, duration: 1, timing: linear }),
        a.ani({ to: { x: 0 }, duration: 1, timing: linear }),
    ])

const other = () => a.ani({ to: { y: 1 }, duration: 2, timing: linear })

const from = { x: 0, y: 0 }

function makeTarget(): Element {
    return document.createElement('div')
}

describe('M6: WAAPI loops', () => {
    beforeEach(() => {
        createdEffects.length = 0
        createdAnimations.length = 0
        vi.stubGlobal('KeyframeEffect', FakeKeyframeEffect)
        vi.stubGlobal('Animation', FakeAnimation)
        Object.defineProperty(document, 'timeline', {
            value: {},
            configurable: true,
            writable: true,
        })
    })

    afterEach(() => {
        Reflect.deleteProperty(document, 'timeline')
        vi.unstubAllGlobals()
    })

    it('A9: an infinite root loop plays with iterations: Infinity', () => {
        const line = a.waapiTimeline(a.loop(child(), Infinity))

        line.play(makeTarget(), { from })

        expect(createdEffects).toHaveLength(1)
        expect(createdAnimations).toHaveLength(1)
        expect(createdEffects[0]!.options.iterations).toBe(Infinity)
        expect(createdAnimations[0]!.play).toHaveBeenCalled()
        line.cancel()
    })

    it('A9: the child is compiled once and one iteration lasts the child duration', () => {
        const infinite = a.waapiTimeline(a.loop(child(), Infinity))
        infinite.play(makeTarget(), { from })
        const single = a.waapiTimeline(child())
        single.play(makeTarget(), { from })

        const [looped, written] = createdEffects
        expect(looped!.options.duration).toBe(2000)
        expect(looped!.options.duration).toBe(written!.options.duration)
        expect(looped!.keyframes).toEqual(written!.keyframes)
        expect(written!.options.iterations).toBe(1)
        infinite.cancel()
    })

    it('A9: every target gets an infinite animation', () => {
        const line = a.waapiTimeline(a.loop(child(), Infinity))

        line.play([makeTarget(), makeTarget(), makeTarget()], {
            from,
            stagger: 0.1,
        })

        expect(createdEffects).toHaveLength(3)
        for (const effect of createdEffects) {
            expect(effect.options.iterations).toBe(Infinity)
        }
        expect(createdEffects.map((effect) => effect.options.delay)).toEqual([
            0, 100, 200,
        ])
        line.cancel()
    })

    it('A9: any other infinite tree throws RangeError from play(), pointing to the RAF engine', () => {
        const node = a.sequence([child(), a.loop(child(), Infinity)])
        const line = a.waapiTimeline(node)

        expect(() => line.play(makeTarget(), { from })).toThrow(RangeError)
        expect(() => line.play(makeTarget(), { from })).toThrow(/RAF/i)
        expect(createdEffects).toHaveLength(0)
        expect(createdAnimations).toHaveLength(0)
    })

    it('A9: a parallel with an infinite loop throws RangeError from play()', () => {
        const line = a.waapiTimeline(
            a.parallel([a.loop(child(), Infinity), other()])
        )

        expect(() => line.play(makeTarget(), { from })).toThrow(RangeError)
        expect(() => line.play(makeTarget(), { from })).toThrow(/RAF/i)
        expect(createdAnimations).toHaveLength(0)
    })

    it('A9: a loop of an infinite loop that is not the root throws too, the root loop(infinite, n) is just infinite', () => {
        const nested = a.waapiTimeline(
            a.sequence([other(), a.loop(a.loop(child(), Infinity), 2)])
        )
        expect(() => nested.play(makeTarget(), { from })).toThrow(RangeError)

        const root = a.waapiTimeline(a.loop(a.loop(child(), Infinity), 2))
        root.play(makeTarget(), { from })
        expect(createdEffects[0]!.options.iterations).toBe(Infinity)
        root.cancel()
    })

    it('A9: building the timeline does not throw, only play() does', () => {
        expect(() =>
            a.waapiTimeline(a.sequence([child(), a.loop(child(), Infinity)]))
        ).not.toThrow()
    })

    it('A9: finite loops still compile to a single finite animation', () => {
        const line = a.waapiTimeline(a.loop(child(), 3))

        line.play(makeTarget(), { from })

        expect(createdEffects).toHaveLength(1)
        expect(createdEffects[0]!.options.iterations).toBe(1)
        expect(createdEffects[0]!.options.duration).toBe(6000)
        expect(line.duration).toBe(6)
    })
})
