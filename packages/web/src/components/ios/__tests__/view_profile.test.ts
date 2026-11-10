import { expect, it } from 'vitest'

it('the public App Store snapshot profile samples Ani physics, including observed overshoot', async () => {
    const path = '../view_profile'
    const module = await import(/* @vite-ignore */ path).catch(() => null)
    expect(module, 'snapshot profile must exist').not.toBeNull()
    const profile = module!.storeViewProfile(true)
    expect(profile.durationMs).toBe(650)
    expect(profile.samples).toHaveLength(65)
    expect(profile.samples[0]).toBe(0)
    // Public native-effect measurement, not a call to the implementation as oracle.
    expect(profile.samples[1]).toBeCloseTo(0.0083, 4)
    expect(profile.samples[8]).toBeCloseTo(0.335, 4)
    expect(profile.samples[16]).toBeCloseTo(0.7675, 4)
    expect(profile.samples[32]).toBeCloseTo(1.0455, 4)
    expect(profile.samples[48]).toBeCloseTo(1.0129, 4)
    expect(profile.samples[62]).toBeCloseTo(0.9983, 4)
    expect(profile.samples[63]).toBe(1)
    expect(profile.samples[64]).toBe(1)
    expect(profile.easing).toMatch(/^linear\(/)
})
