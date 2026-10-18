// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { a } from '~/index'
import { createManualClock } from '../../testing'

/**
 * Minimal stable-API fake: jsdom has no Web Animations. `finish()` resolves
 * the `finished` promise, `cancel()` rejects it.
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
    public playbackRate = 1
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
        this._finished.catch(() => undefined)
        createdAnimations.push(this)
    }

    public get finished(): Promise<void> {
        return this._finished
    }
}

const createdEffects: FakeEffect[] = []
const createdAnimations: FakeAnimation[] = []

const tree = (duration = 1) =>
    a.ani({
        to: { opacity: 1, translateX: 100 },
        duration,
        timing: a.timing.linear(),
    })

const fromZero = { opacity: 0, translateX: 0 }

function makeTargets(count: number): Element[] {
    return Array.from({ length: count }, () => document.createElement('div'))
}

type WaapiPolicy = 'jump' | 'ignore' | { maxDuration: number }

// the options type of waapiTimeline does not know reducedMotion before M1
function make(reducedMotion: WaapiPolicy, preference: boolean, duration = 1) {
    const m = createManualClock({ reducedMotion: preference })
    const line = a.waapiTimeline(tree(duration), {
        clock: m.clock,
        reducedMotion,
    } as never)
    return { m, line }
}

describe('M1: reduced motion (WAAPI policy)', () => {
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

    it('A8: "jump" creates the animations and finishes them at once', async () => {
        const { line } = make('jump', true)
        const statuses: string[] = []
        line.onStatus((status) => {
            statuses.push(status)
        })

        const run = line.play(makeTargets(3), { from: fromZero })

        expect(createdEffects).toHaveLength(3)
        expect(createdAnimations).toHaveLength(3)
        for (const animation of createdAnimations) {
            expect(animation.finish).toHaveBeenCalledTimes(1)
        }

        await expect(run).resolves.toBe('ended')
        expect(line.status).toBe('ENDED')
        expect(statuses[statuses.length - 1]).toBe('ENDED')
        expect(line.duration).toBe(1)
    })

    it('A8: "jump" without the preference leaves the animations running', () => {
        const { line } = make('jump', false)

        line.play(makeTargets(2), { from: fromZero })

        expect(createdAnimations).toHaveLength(2)
        for (const animation of createdAnimations) {
            expect(animation.finish).not.toHaveBeenCalled()
            expect(animation.playbackRate).toBe(1)
        }
        expect(line.status).toBe('PLAYING')
    })

    it('A8: { maxDuration } sets the playbackRate of a longer tree', async () => {
        const { line } = make({ maxDuration: 0.5 }, true)

        const run = line.play(makeTargets(2), { from: fromZero })

        expect(createdAnimations).toHaveLength(2)
        for (const animation of createdAnimations) {
            expect(animation.playbackRate).toBe(2)
            expect(animation.finish).not.toHaveBeenCalled()
        }
        expect(line.status).toBe('PLAYING')
        expect(line.duration).toBe(1)

        for (const animation of createdAnimations) animation.finish()
        await expect(run).resolves.toBe('ended')
    })

    it('A8: { maxDuration } leaves a tree that is not longer alone', () => {
        const { line } = make({ maxDuration: 0.5 }, true, 0.5)

        line.play(makeTargets(2), { from: fromZero })

        for (const animation of createdAnimations) {
            expect(animation.playbackRate).toBe(1)
            expect(animation.finish).not.toHaveBeenCalled()
        }
    })

    it('A8: "ignore" leaves the animations alone', () => {
        const { line } = make('ignore', true)

        line.play(makeTargets(2), { from: fromZero })

        for (const animation of createdAnimations) {
            expect(animation.playbackRate).toBe(1)
            expect(animation.finish).not.toHaveBeenCalled()
        }
        expect(line.status).toBe('PLAYING')
    })

    it('A9: an invalid maxDuration throws a RangeError at construction', () => {
        const m = createManualClock({ reducedMotion: true })
        for (const bad of [0, -1, Number.NaN]) {
            expect(() =>
                a.waapiTimeline(tree(), {
                    clock: m.clock,
                    reducedMotion: { maxDuration: bad },
                } as never)
            ).toThrow(RangeError)
        }
    })
})
