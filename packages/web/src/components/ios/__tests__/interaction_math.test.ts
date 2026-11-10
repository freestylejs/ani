import { describe, expect, it } from 'vitest'

async function math() {
    const module = await import('../interaction_math').catch(() => null)
    expect(
        module,
        'the iOS interaction contract must be implemented'
    ).not.toBeNull()
    return module!
}

describe('iOS interaction math (independent of DOM/animation)', () => {
    it('clamps finite values and rejects a corrupt external range', async () => {
        const { finiteClamp } = await math()
        expect(finiteClamp(0.4, 0, 1)).toBe(0.4)
        expect(finiteClamp(-2, 0, 1)).toBe(0)
        expect(finiteClamp(2, 0, 1)).toBe(1)
        for (const value of [Number.NaN, Infinity, -Infinity]) {
            expect(() => finiteClamp(value, 0, 1)).toThrow(RangeError)
        }
        expect(() => finiteClamp(0, 1, 0)).toThrow(RangeError)
    })

    it('rubber band is odd, continuous, monotone and bounded, never a linear runaway', async () => {
        const { rubberBand } = await math()
        expect(rubberBand(0, 20)).toBe(0)
        expect(rubberBand(20, 20)).toBe(10)
        let previous = 0
        for (const d of [0.001, 1, 5, 20, 100, 1e6]) {
            const x = rubberBand(d, 20)
            expect(x).toBeGreaterThan(previous)
            expect(x).toBeLessThan(20)
            expect(rubberBand(-d, 20)).toBe(-x)
            previous = x
        }
    })

    it('slider returns semantic bounds while its separate elastic pose stretches', async () => {
        const { sliderPose } = await math()
        expect(sliderPose(0.5, 225)).toEqual({
            value: 0.5,
            pull: 0,
            sx: 1,
            sy: 1,
        })
        const above = sliderPose(2, 225)
        const below = sliderPose(-1, 225)
        expect(above.value).toBe(1)
        expect(below.value).toBe(0)
        expect(above.pull).toBeLessThan(0)
        expect(below.pull).toBeGreaterThan(0)
        expect(above.sx).toBeGreaterThanOrEqual(0.92)
        expect(above.sy).toBeLessThanOrEqual(1.08)
        expect(above.sx).toBe(below.sx)
        expect(above.sy).toBe(below.sy)
        expect(above.pull).toBe(-below.pull)
    })

    it('recent velocity ignores stale, duplicate and non-monotone samples', async () => {
        const { recordSample, sampleVelocity } = await math()
        const samples: Array<{ x: number; y: number; time: number }> = []
        recordSample(samples, { x: 0, y: 0, time: 100 })
        recordSample(samples, { x: 0, y: 20, time: 120 })
        recordSample(samples, { x: 0, y: 20, time: 120 })
        recordSample(samples, { x: 999, y: 999, time: 110 })
        expect(samples).toHaveLength(2)
        expect(sampleVelocity(samples)).toEqual({ x: 0, y: 1000 })
        recordSample(samples, { x: 0, y: 20, time: 300 })
        expect(sampleVelocity(samples)).toEqual({ x: 0, y: 0 })
        for (let i = 0; i < 1000; i++)
            recordSample(samples, { x: i, y: 20, time: 301 + i })
        expect(samples.length).toBeLessThanOrEqual(32)
    })

    it('swipe releases select a side or retract; a projected fling alone cannot commit', async () => {
        const { swipeRelease } = await math()
        expect(swipeRelease(10, 0, 384, 192)).toEqual({
            target: 0,
            action: null,
        })
        expect(swipeRelease(-110, 0, 384, 192)).toEqual({
            target: -192,
            action: null,
        })
        expect(swipeRelease(110, 0, 384, 192)).toEqual({
            target: 192,
            action: null,
        })
        expect(swipeRelease(-20, -1500, 384, 192)).toEqual({
            target: -192,
            action: null,
        })
        expect(swipeRelease(-320, 0, 384, 192)).toEqual({
            target: -384,
            action: 'right',
        })
        expect(swipeRelease(320, 0, 384, 192)).toEqual({
            target: 384,
            action: 'left',
        })
    })

    it('exposure brightness and value are bounded and reversible', async () => {
        const { exposureBrightness, exposureAt } = await math()
        expect(exposureAt(0, -200, 2)).toBe(100)
        expect(exposureAt(0, 200, 2)).toBe(-100)
        expect(exposureAt(0, 0, 2)).toBe(0)
        expect(exposureBrightness(0)).toBe(1)
        expect(exposureBrightness(100)).toBe(2)
        expect(exposureBrightness(-100)).toBe(0.5)
    })

    it('public mass/stiffness/damping map to the existing Ani physical spring', async () => {
        const { layoutSpring } = await math()
        const profile = layoutSpring(200, 22)
        expect(profile.type).toBe('spring')
        expect(profile.duration).toBeCloseTo((2 * Math.PI) / Math.sqrt(200), 12)
        expect(profile.bounce).toBeCloseTo(1 - 22 / (2 * Math.sqrt(200)), 12)
    })
})
