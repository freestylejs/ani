import { isAniError, TimingFunction, timing } from '@freestylejs/ani-core'
import { describe, expect, it } from 'vitest'
import {
    clampMotion,
    curveOf,
    ownsRadius,
    resolveMotion,
    sameTrackOptions,
    validateLayoutOptions,
    validateMotion,
    validateReducedMotion,
} from '../motion'

/** e(τ) = √τ: an infinite initial slope no momentum term can cancel. */
class SqrtTiming extends TimingFunction {
    override step(time: number) {
        return {
            value: Math.sqrt(Math.max(0, Math.min(1, time))),
            endOfAnimation: time >= 1,
        }
    }
}

function code(fn: () => unknown): string | null {
    try {
        fn()
        return null
    } catch (error) {
        return isAniError(error) ? error.code : 'not an AniError'
    }
}

describe('motion: validation throws ANI_INVALID_OPTIONS synchronously', () => {
    const bad: [string, unknown][] = [
        ['layout: "both"', { layout: 'both' }],
        ['layout: false', { layout: false }],
        ['empty layoutId', { layoutId: '' }],
        ['anchor outside 0..1', { layoutAnchor: { x: 1.2, y: 0 } }],
        ['anchor missing y', { layoutAnchor: { x: 0.5 } }],
        ['non-boolean crossfade', { layoutCrossfade: 'yes' }],
        ['non-boolean radius', { radius: 1 }],
        ['unknown option', { layoutRoot: true }],
        ['negative duration', { motion: { duration: -1 } }],
        ['NaN delay', { motion: { delay: Number.NaN } }],
        [
            'infinite duration',
            { motion: { duration: Number.POSITIVE_INFINITY } },
        ],
        ['not a timing', { motion: { timing: 'ease' } }],
        [
            'stateful timing',
            {
                motion: {
                    timing: timing.dynamicSpring({ m: 1, k: 100, c: 10 }),
                },
            },
        ],
        ['unknown motion key', { motion: { easing: 1 } }],
        [
            'a bezier that starts vertically (CP3 trial J-014)',
            {
                motion: {
                    timing: timing.bezier({
                        p2: { x: 0, y: 1 },
                        p3: { x: 1, y: 1 },
                    }),
                },
            },
        ],
        [
            'a custom timing that starts vertically',
            { motion: { timing: new SqrtTiming() } },
        ],
        ['not an object', 'fast'],
    ]
    for (const [name, value] of bad) {
        it(name, () => {
            expect(code(() => validateLayoutOptions(value))).toBe(
                'ANI_INVALID_OPTIONS'
            )
        })
    }

    it('accepts every valid option', () => {
        expect(
            code(() =>
                validateLayoutOptions({
                    layout: 'position',
                    layoutId: 'a',
                    layoutAnchor: { x: 0, y: 1 },
                    layoutCrossfade: false,
                    layoutDependency: Symbol('d'),
                    radius: true,
                    motion: {
                        duration: 0,
                        delay: 0.1,
                        timing: timing.spring({ m: 1, k: 100, c: 10 }),
                    },
                })
            )
        ).toBeNull()
        expect(code(() => validateLayoutOptions(undefined))).toBeNull()
        expect(code(() => validateMotion({}))).toBeNull()
    })

    it('reduced-motion policies', () => {
        expect(validateReducedMotion(undefined)).toBe('jump')
        expect(validateReducedMotion('ignore')).toBe('ignore')
        expect(validateReducedMotion({ maxDuration: 0.2 })).toEqual({
            maxDuration: 0.2,
        })
        expect(code(() => validateReducedMotion({ maxDuration: 0 }))).toBe(
            'ANI_INVALID_OPTIONS'
        )
        expect(code(() => validateReducedMotion('skip'))).toBe(
            'ANI_INVALID_OPTIONS'
        )
    })
})

describe('motion: defaults, merge and clamp', () => {
    it('defaults: 0.35 s, no delay, ease-out', () => {
        const m = resolveMotion([])
        expect(m.duration).toBe(0.35)
        expect(m.delay).toBe(0)
        expect(m.curve.slope0).toBeCloseTo(1 / 0.58, 4)
    })

    it('later layers win field by field', () => {
        const fn = timing.linear()
        const m = resolveMotion([
            { duration: 1, delay: 0.5 },
            { duration: 0.2 },
            undefined,
            { timing: fn },
        ])
        expect(m).toMatchObject({ duration: 0.2, delay: 0.5 })
        expect(m.curve).toBe(curveOf(fn))
    })

    it('maxDuration scales delay + duration to fit; shorter runs untouched', () => {
        const m = resolveMotion([{ duration: 0.6, delay: 0.2 }])
        const c = clampMotion(m, 0.2)
        expect(c.duration).toBeCloseTo(0.15, 12)
        expect(c.delay).toBeCloseTo(0.05, 12)
        expect(clampMotion(m, 1)).toBe(m)
    })
})

describe('motion: track option equality (J-016)', () => {
    const group = { duration: 1, timing: timing.linear() }

    it('compares effective motion: defaults and inherited fields are the same track', () => {
        for (const b of [
            { motion: { duration: 1 } },
            { motion: { delay: 0 } },
            { motion: { timing: timing.linear() } },
            { layout: true as const },
            { radius: false },
        ]) {
            expect(sameTrackOptions({}, b, group)).toBe(true)
            expect(sameTrackOptions(b, {}, group)).toBe(true)
        }
        expect(sameTrackOptions({}, { motion: { duration: 0.35 } })).toBe(true)
        expect(
            sameTrackOptions({}, { motion: { duration: 0.35 } }, group)
        ).toBe(false)
    })

    it('radius defaults on for a shared layoutId only', () => {
        expect(ownsRadius({})).toBe(false)
        expect(ownsRadius({ radius: true })).toBe(true)
        expect(ownsRadius({ layoutId: 'a' })).toBe(true)
        expect(ownsRadius({ layoutId: 'a', radius: false })).toBe(false)
        expect(
            sameTrackOptions({ layoutId: 'a' }, { layoutId: 'a', radius: true })
        ).toBe(true)
        expect(
            sameTrackOptions(
                { layoutId: 'a' },
                { layoutId: 'a', radius: false }
            )
        ).toBe(false)
    })

    it('an omitted timing is the default ease-out (CP6 trial J-016)', () => {
        const explicit = { motion: { timing: timing.easeOut() } }
        for (const g of [undefined, { duration: 1 }, { delay: 0.1 }]) {
            expect(sameTrackOptions({}, explicit, g)).toBe(true)
            expect(sameTrackOptions(explicit, {}, g)).toBe(true)
            expect(
                sameTrackOptions(
                    { motion: { duration: 0.5 } },
                    { motion: { duration: 0.5, timing: timing.easeOut() } },
                    g
                )
            ).toBe(true)
        }
        // the group's timing is inherited instead of the default
        expect(
            sameTrackOptions({}, explicit, { timing: timing.linear() })
        ).toBe(false)
        for (const other of [
            timing.easeIn(),
            timing.linear(),
            timing.spring({ m: 1, k: 170, c: 26 }),
        ]) {
            expect(sameTrackOptions({}, { motion: { timing: other } })).toBe(
                false
            )
        }
    })

    it('compares timing parameters independently of key order', () => {
        const a = { motion: { timing: timing.spring({ m: 1, k: 200, c: 20 }) } }
        const b = { motion: { timing: timing.spring({ c: 20, k: 200, m: 1 }) } }
        expect(sameTrackOptions(a, b)).toBe(true)
        const bezier = (x: number) =>
            timing.bezier({ p2: { x, y: 0 }, p3: { y: 1, x: 0.58 } })
        expect(
            sameTrackOptions(
                { motion: { timing: bezier(0.42) } },
                { motion: { timing: bezier(0.42) } }
            )
        ).toBe(true)
    })

    it('a genuine change is another track', () => {
        for (const b of [
            { motion: { duration: 0.9 } },
            { motion: { delay: 0.1 } },
            { motion: { timing: timing.spring({ m: 1, k: 200, c: 21 }) } },
            { motion: { timing: timing.easeOut() } },
            { layout: 'position' as const },
            { layoutAnchor: { x: 0, y: 0 } },
            { radius: true },
        ]) {
            expect(sameTrackOptions({}, b, group)).toBe(false)
        }
    })
})

describe('motion: curves', () => {
    it('are normalized to e(0) = 0 and e(1) = 1, including a spring', () => {
        for (const fn of [
            timing.linear(),
            timing.easeInOut(),
            timing.spring({ m: 1, k: 50, c: 3 }),
        ]) {
            const curve = curveOf(fn)
            expect(curve.value(0)).toBe(0)
            expect(curve.value(1)).toBe(1)
            expect(curve.value(-1)).toBe(0)
            expect(curve.value(2)).toBe(1)
        }
    })

    it('a spring starts at rest; linear has slope 1', () => {
        expect(curveOf(timing.linear()).slope0).toBeCloseTo(1, 6)
        expect(
            Math.abs(curveOf(timing.spring({ m: 1, k: 200, c: 20 })).slope0)
        ).toBeLessThan(0.05)
    })

    it('is cached per timing instance', () => {
        const fn = timing.ease()
        expect(curveOf(fn)).toBe(curveOf(fn))
    })
})
