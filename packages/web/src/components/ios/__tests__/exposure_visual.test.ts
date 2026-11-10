import { expect, it } from 'vitest'

it('exposure reproduces the observed neutral ruler and signed collapse, without inflating the zero notch', async () => {
    const module = await import('../interaction_math')
    expect(
        'exposureNotch' in module,
        'the reference-derived notch policy must exist'
    ).toBe(true)
    const notch = (
        module as unknown as {
            exposureNotch(
                tick: number,
                value: number,
                activity?: number
            ): { height: number; opacity: number; emphasis: number }
        }
    ).exposureNotch
    expect(notch(0, 0).height).toBe(40)
    expect(notch(5, 0).height).toBe(20)
    expect(notch(5, 100).opacity).toBe(0)
    expect(notch(-5, -100).opacity).toBe(0)
    expect(notch(-5, 100).opacity).toBeGreaterThan(0)
    expect(notch(0, 100).opacity).toBeLessThan(0.8)
    expect(notch(0, 100).height).toBe(40)
    expect(notch(-5, 22, 1).height).toBeGreaterThan(20)
    for (const value of [-100, -22, 0, 22, 100])
        for (const tick of [-100, -5, 0, 5, 100]) {
            expect(notch(tick, value, 1)).toEqual(notch(-tick, -value, 1))
            expect(notch(tick, value).opacity).toBeGreaterThanOrEqual(0)
            expect(notch(tick, value).opacity).toBeLessThanOrEqual(1)
        }
})
