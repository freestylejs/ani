// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunResult } from '~/ani/waapi'
import { webTimeline } from '~/ani/waapi'
import { a } from '~/index'

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

const tree = () =>
    a.ani({
        to: { opacity: 1, translateX: 100 },
        duration: 1,
        timing: a.timing.linear(),
    })

const fromZero = { opacity: 0, translateX: 0 }

function makeTargets(count: number): Element[] {
    return Array.from({ length: count }, () => document.createElement('div'))
}

describe('M5W: WAAPI timeline (multi-target run surface)', () => {
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

    it('A1: creates one animation per target with stacked delays', () => {
        const line = webTimeline(tree())
        const elements = makeTargets(3)

        line.play(elements, { from: fromZero, stagger: 0.1, delay: 0 })

        expect(createdEffects).toHaveLength(3)
        expect(line.animations).toHaveLength(3)
        expect(line.duration).toBe(1)
        expect(createdEffects.map((effect) => effect.options.delay)).toEqual([
            0, 100, 200,
        ])
        expect(createdEffects[0]!.options.fill).toBe('forwards')

        const withBaseDelay = webTimeline(tree())
        withBaseDelay.play(elements, {
            from: fromZero,
            stagger: 0.1,
            delay: 0.5,
        })

        expect(
            createdEffects.slice(3).map((effect) => effect.options.delay)
        ).toEqual([500, 600, 700])
    })

    it('A2: applies a stagger function per target', () => {
        const line = webTimeline(tree())

        line.play(makeTargets(3), {
            from: fromZero,
            stagger: (index, count) => (count - 1 - index) * 0.05,
        })

        expect(createdEffects.map((effect) => effect.options.delay)).toEqual([
            100, 50, 0,
        ])
    })

    it('A3: resolves "ended" after all animations finished, reporting PLAYING then ENDED', async () => {
        const line = webTimeline(tree())
        const statuses: string[] = []
        const unsubscribe = line.onStatus((status) => {
            statuses.push(status)
        })

        const run = line.play(makeTargets(3), { from: fromZero })
        expect(line.status).toBe('PLAYING')

        for (const animation of createdAnimations) animation.finish()

        const result: RunResult = await run
        expect(result).toBe('ended')
        expect(line.status).toBe('ENDED')
        expect(statuses).toEqual(['PLAYING', 'ENDED'])
        expect(typeof unsubscribe).toBe('function')
        unsubscribe()
    })

    it('A4: interruption commits styles then cancels each old animation', async () => {
        const line = webTimeline(tree())
        const elements = makeTargets(2)

        const firstRun = line.play(elements, { from: fromZero })
        expect(createdEffects).toHaveLength(2)
        const [firstOld, secondOld] = createdAnimations

        const secondRun = line.play(elements, {
            from: { opacity: 0.5, translateX: 50 },
        })
        expect(createdEffects).toHaveLength(4)
        const [firstNew] = createdAnimations.slice(2)
        expect(firstNew).not.toBe(firstOld)

        for (const old of [firstOld!, secondOld!]) {
            expect(old.commitStyles).toHaveBeenCalledTimes(1)
            expect(old.cancel).toHaveBeenCalledTimes(1)
            expect(old.commitStyles.mock.invocationCallOrder[0]).toBeLessThan(
                old.cancel.mock.invocationCallOrder[0]!
            )
        }

        await expect(firstRun).resolves.toBe('interrupted')

        expect(line.animations).toHaveLength(2)
        expect(line.animations[0]).toBe(firstNew)
        expect(firstNew!.play).toHaveBeenCalledTimes(1)

        for (const animation of createdAnimations.slice(2)) animation.finish()
        await expect(secondRun).resolves.toBe('ended')
    })

    it('A5: interrupt false resolves "skipped" while running', async () => {
        const line = webTimeline(tree())
        const elements = makeTargets(2)

        const run = line.play(elements, { from: fromZero })
        expect(createdEffects).toHaveLength(2)

        await expect(
            line.play(elements, { from: fromZero, interrupt: false })
        ).resolves.toBe('skipped')
        expect(createdEffects).toHaveLength(2)
        expect(line.status).toBe('PLAYING')

        line.pause()
        expect(line.status).toBe('PAUSED')
        await expect(
            line.play(elements, { from: fromZero, interrupt: false })
        ).resolves.toBe('skipped')
        expect(createdEffects).toHaveLength(2)
        expect(line.status).toBe('PAUSED')

        line.resume()
        for (const animation of createdAnimations) animation.finish()
        await expect(run).resolves.toBe('ended')
    })

    it('A6: valueAt evaluates the plan at the target animation currentTime', async () => {
        const idle = webTimeline(tree())
        expect(idle.value).toBeNull()
        expect(idle.valueAt(0)).toBeNull()

        const line = webTimeline(tree())
        const run = line.play(makeTargets(3), {
            from: fromZero,
            stagger: 0.1,
        })
        expect(createdAnimations).toHaveLength(3)

        createdAnimations[1]!.currentTime = 600
        expect(line.valueAt(1)).toEqual({ opacity: 0.5, translateX: 50 })

        createdAnimations[0]!.currentTime = 250
        expect(line.value).toEqual({ opacity: 0.25, translateX: 25 })

        expect(line.valueAt(3)).toBeNull()
        expect(line.valueAt(-1)).toBeNull()

        for (const animation of createdAnimations) animation.finish()
        await expect(run).resolves.toBe('ended')
    })

    it('A6: valueAt subtracts the delay, clamps to the run and wraps repeats', () => {
        const line = webTimeline(tree())
        line.play(makeTargets(1), { from: fromZero, delay: 0.1, repeat: 1 })
        const [animation] = createdAnimations

        animation!.currentTime = 50
        expect(line.valueAt(0)).toEqual({ opacity: 0, translateX: 0 })

        animation!.currentTime = 1350
        expect(line.valueAt(0)).toEqual({ opacity: 0.25, translateX: 25 })

        const single = webTimeline(tree())
        single.play(makeTargets(1), { from: fromZero })
        createdAnimations[1]!.currentTime = 5000
        expect(single.valueAt(0)).toEqual({ opacity: 1, translateX: 100 })
    })

    it('A7: cancel, finish and dispose settle the right results', async () => {
        const line = webTimeline(tree())
        const [element] = makeTargets(1)

        const resetRun = line.play(element!, { from: fromZero })
        expect(line.status).toBe('PLAYING')
        const [resetAnimation] = createdAnimations

        line.cancel()
        await expect(resetRun).resolves.toBe('reset')
        expect(line.status).toBe('IDLE')
        expect(resetAnimation!.cancel).toHaveBeenCalledTimes(1)

        const endedRun = line.play(element!, { from: fromZero })
        const endedAnimation = createdAnimations[1]!
        line.finish()
        await expect(endedRun).resolves.toBe('ended')
        expect(line.status).toBe('ENDED')
        expect(endedAnimation.finish).toHaveBeenCalledTimes(1)

        line.dispose()
        line.dispose()
        const createdBeforeDispose = createdAnimations.length
        await expect(line.play(element!, { from: fromZero })).resolves.toBe(
            'disposed'
        )
        expect(createdAnimations).toHaveLength(createdBeforeDispose)
    })

    it('A8: invalid input throws synchronously and leaves the run untouched', async () => {
        const line = webTimeline(tree())
        const [element] = makeTargets(1)

        const run = line.play([element!], { from: fromZero })
        expect(createdEffects).toHaveLength(1)
        const [animation] = createdAnimations

        type PlayConfig = Parameters<typeof line.play>[1]

        expect(() =>
            line.play([element!], {
                from: [0, 0],
            } as unknown as PlayConfig)
        ).toThrow(TypeError)
        expect(() =>
            line.play([element!], { from: fromZero, delay: -0.1 })
        ).toThrow()
        expect(() =>
            line.play([element!], { from: fromZero, stagger: Number.NaN })
        ).toThrow()
        expect(() => line.play([], { from: fromZero })).toThrow(RangeError)

        expect(createdEffects).toHaveLength(1)
        expect(animation!.cancel).not.toHaveBeenCalled()
        expect(line.status).toBe('PLAYING')

        animation!.finish()
        await expect(run).resolves.toBe('ended')
    })

    it('A9: a throwing commitStyles does not prevent the interruption', async () => {
        const line = webTimeline(tree())
        const elements = makeTargets(2)

        const run = line.play(elements, { from: fromZero })
        expect(createdEffects).toHaveLength(2)
        const [firstOld, secondOld] = createdAnimations
        firstOld!.commitStyles.mockImplementation(() => {
            throw new Error('element is not rendered')
        })

        const nextRun = line.play(elements, {
            from: { opacity: 0.5, translateX: 50 },
        })

        expect(firstOld!.cancel).toHaveBeenCalledTimes(1)
        expect(secondOld!.commitStyles).toHaveBeenCalledTimes(1)
        expect(secondOld!.cancel).toHaveBeenCalledTimes(1)
        await expect(run).resolves.toBe('interrupted')

        expect(line.animations).toHaveLength(2)
        for (const animation of createdAnimations.slice(2)) animation.finish()
        await expect(nextRun).resolves.toBe('ended')
    })

    it('A10: a function from shares keyframes per distinct value set', () => {
        const line = webTimeline(tree())
        const elements = makeTargets(3)

        line.play(elements, {
            from: (index) =>
                index < 2
                    ? { opacity: 0, translateX: 0 }
                    : { opacity: 0.5, translateX: 50 },
        })

        expect(createdEffects).toHaveLength(3)
        for (let index = 0; index < elements.length; index++) {
            expect(createdEffects[index]!.target).toBe(elements[index])
        }
        expect(createdEffects[0]!.keyframes).toBe(createdEffects[1]!.keyframes)
        expect(createdEffects[2]!.keyframes).not.toBe(
            createdEffects[0]!.keyframes
        )
    })
})
