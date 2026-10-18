// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { a } from '~/index'
import { createManualClock } from '~/testing'

class FakeKeyframeEffect {
    public constructor(
        public readonly target: Element,
        public readonly keyframes: readonly unknown[],
        public readonly options: KeyframeEffectOptions
    ) {}
}

class FakeAnimation {
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
        this._reject(new Error('animation canceled'))
    })
    public readonly finish = vi.fn((): void => {
        this.playState = 'finished'
        this._resolve()
    })
    private readonly _finished: Promise<void>
    private _resolve!: () => void
    private _reject!: (reason: unknown) => void
    public constructor(
        public readonly effect: unknown,
        public readonly timeline: unknown
    ) {
        this._finished = new Promise<void>((resolve, reject) => {
            this._resolve = resolve
            this._reject = reject
        })
        this._finished.catch(() => undefined)
    }
    public get finished(): Promise<void> {
        return this._finished
    }
}

describe('WAAPI endless root loop under reduced motion jump', () => {
    beforeEach(() => {
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

    const endless = () => {
        const m = createManualClock({ reducedMotion: true })
        return a.waapiTimeline(
            a.loop(a.ani({ to: { x: 100 }, duration: 1 }), Infinity),
            { clock: m.clock, reducedMotion: 'jump' }
        )
    }

    it('holds PAUSED and never reports ENDED', async () => {
        const line = endless()
        const statuses: string[] = []
        line.onStatus((status) => {
            statuses.push(status)
        })
        const settled: string[] = []
        line.play(document.createElement('div'), { from: { x: 0 } }).then(
            (result) => {
                settled.push(result)
            }
        )
        expect(statuses).toEqual(['PAUSED'])
        expect(line.animations[0]!.playState).toBe('finished')
        await Promise.resolve()
        expect(settled).toEqual([])

        line.cancel()
        await Promise.resolve()
        expect(settled).toEqual(['reset'])
    })

    it('has no end to finish() to', () => {
        const line = endless()
        line.play(document.createElement('div'), { from: { x: 0 } })
        expect(() => line.finish()).toThrow(RangeError)
    })
})

describe('WAAPI seek', () => {
    beforeEach(() => {
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

    const currentTime = (line: ReturnType<typeof a.waapiTimeline>) =>
        (line.animations[0] as unknown as FakeAnimation).currentTime

    it('clamps a finite tree played with repeat: Infinity to one run', () => {
        const line = a.waapiTimeline(a.ani({ to: { x: 100 }, duration: 2 }))
        line.play(document.createElement('div'), {
            from: { x: 0 },
            repeat: Infinity,
            delay: 0.5,
        })

        line.seek(6)
        expect(currentTime(line)).toBe(2000 + 500)
        expect(() => line.seek(Infinity)).not.toThrow()
        expect(currentTime(line)).toBe(2000 + 500)
    })

    it('does not clamp an endless loop, which has no end to seek to', () => {
        const line = a.waapiTimeline(
            a.loop(a.ani({ to: { x: 100 }, duration: 2 }), Infinity)
        )
        line.play(document.createElement('div'), { from: { x: 0 } })

        line.seek(61)
        expect(currentTime(line)).toBe(61000)
        expect(() => line.seek(Infinity)).toThrow(RangeError)
    })
})
