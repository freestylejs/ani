import { isAniError, TimingFunction, timing } from '@freestylejs/ani-core'
import { describe, expect, it } from 'vitest'
import {
    clampMotion,
    curveOf,
    type LayoutMotion,
    mergeMotion,
    ownsRadius,
    resolveMotion,
    sameLayoutMotion,
    sameTrackOptions,
    type TimingMotion,
    validateLayoutOptions,
    validateMotion,
    validateMotionLayers,
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
        expect((m as TimingMotion).curve.slope0).toBeCloseTo(1 / 0.58, 4)
    })

    it('later layers win within one kind', () => {
        const fn = timing.linear()
        const m = resolveMotion([
            { duration: 1, delay: 0.5 },
            { duration: 0.2 },
            undefined,
            { timing: fn },
        ])
        expect(m).toMatchObject({ duration: 0.2, delay: 0.5 })
        expect((m as TimingMotion).curve).toBe(curveOf(fn))
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

describe('motion: the discriminated union (§5.1, L-SPRING-3)', () => {
    it('validates each layer: type, bounce only on a spring, no curve on a spring', () => {
        const bad: [string, unknown][] = [
            ['unknown type', { type: 'physics' }],
            ['bounce without a spring', { bounce: 0.2 }],
            ['bounce on a timing', { type: 'timing', bounce: 0.2 }],
            ['bounce at 1', { type: 'spring', bounce: 1 }],
            ['bounce at -1', { type: 'spring', bounce: -1 }],
            ['bounce NaN', { type: 'spring', bounce: Number.NaN }],
            ['bounce as a string', { type: 'spring', bounce: '0.2' }],
            [
                'a curve on a spring',
                { type: 'spring', timing: timing.linear() },
            ],
            ['negative duration', { type: 'spring', duration: -1 }],
            [
                'infinite delay',
                { type: 'spring', delay: Number.POSITIVE_INFINITY },
            ],
            ['unknown key', { type: 'spring', stiffness: 100 }],
        ]
        for (const [name, motion] of bad) {
            expect(
                code(() => validateMotion(motion)),
                name
            ).toBe('ANI_INVALID_OPTIONS')
            expect(
                code(() => validateLayoutOptions({ motion })),
                name
            ).toBe('ANI_INVALID_OPTIONS')
        }
        for (const motion of [
            { type: 'spring' },
            { type: 'spring', duration: 0.3, bounce: -0.99, delay: 0.1 },
            { type: 'timing', duration: 0 },
            { duration: 0 },
            { type: 'timing', timing: timing.linear() },
        ]) {
            expect(code(() => validateMotion(motion))).toBeNull()
        }
    })

    it('a merged spring needs a duration > 0; a timing keeps duration 0 (a jump)', () => {
        expect(
            code(() =>
                validateMotionLayers([{ type: 'spring' }, { duration: 0 }])
            )
        ).toBe('ANI_INVALID_OPTIONS')
        expect(
            code(() => validateMotionLayers([{ type: 'spring', duration: 0 }]))
        ).toBe('ANI_INVALID_OPTIONS')
        // a curve layer after it switches to timing, where 0 is a jump
        expect(
            code(() =>
                validateMotionLayers([
                    { type: 'spring', duration: 0 },
                    { timing: timing.linear(), duration: 0 },
                ])
            )
        ).toBeNull()
        expect(code(() => validateMotionLayers([{ duration: 0 }]))).toBeNull()
    })

    it('merges by kind: absent kind inherits, duration never switches, a switch drops the old kind fields', () => {
        const curve = timing.linear()
        const cases: [(LayoutMotion | undefined)[], LayoutMotion][] = [
            [[], { type: 'timing' }],
            [[{ duration: 0.5 }], { type: 'timing', duration: 0.5 }],
            [
                [{ type: 'spring', bounce: 0.3 }, { duration: 0.3 }],
                { type: 'spring', duration: 0.3, bounce: 0.3 },
            ],
            [
                [
                    { type: 'spring', bounce: 0.3, duration: 0.8 },
                    { timing: curve },
                ],
                { type: 'timing', timing: curve },
            ],
            [
                [
                    { duration: 0.5, timing: curve, delay: 0.1 },
                    { type: 'spring' },
                ],
                { type: 'spring', delay: 0.1 },
            ],
            [
                [
                    { type: 'spring', bounce: 0.3 },
                    { type: 'spring', duration: 0.2 },
                ],
                { type: 'spring', duration: 0.2, bounce: 0.3 },
            ],
            [
                [{ type: 'spring', bounce: 0.3 }, { type: 'timing' }],
                { type: 'timing' },
            ],
            [
                [{ delay: 0.2 }, undefined, { type: 'spring' }, { delay: 0 }],
                { type: 'spring', delay: 0 },
            ],
        ]
        for (const [layers, want] of cases) {
            expect(mergeMotion(layers), JSON.stringify(layers)).toEqual(want)
        }
    })

    it('resolves defaults per kind: a spring is 0.55 s, bounce 0; a timing is ease-out 0.35 s', () => {
        expect(resolveMotion([{ type: 'spring' }])).toEqual({
            kind: 'spring',
            duration: 0.55,
            delay: 0,
            bounce: 0,
            maxDuration: null,
        })
        const t = resolveMotion([{ type: 'spring' }, { timing: timing.ease() }])
        expect(t.kind).toBe('timing')
        expect(t.duration).toBe(0.35)
    })

    it('compares by effective value: same kind and parameters keep a track', () => {
        expect(
            sameTrackOptions(
                { motion: { duration: 0.3 } },
                { motion: { duration: 0.3 } },
                { type: 'spring' }
            )
        ).toBe(true)
        expect(
            sameTrackOptions(
                {},
                { motion: { type: 'spring', bounce: 0 } },
                { type: 'spring' }
            )
        ).toBe(true)
        expect(
            sameTrackOptions(
                { motion: { type: 'spring', bounce: 0.1 } },
                { motion: { type: 'spring', bounce: 0.2 } }
            )
        ).toBe(false)
        // the same duration under the other kind is another track
        expect(
            sameTrackOptions(
                { motion: { type: 'spring', duration: 0.35 } },
                { motion: { duration: 0.35 } }
            )
        ).toBe(false)
        expect(sameLayoutMotion({ timing: timing.easeOut() }, undefined)).toBe(
            true
        )
        expect(
            sameLayoutMotion(
                { type: 'spring' },
                { type: 'spring', duration: 0.55 }
            )
        ).toBe(true)
    })

    it('reduced motion { maxDuration } on a spring is applied per track at plan time', () => {
        const s = resolveMotion([{ type: 'spring', duration: 2 }])
        expect(clampMotion(s, 0.4)).toEqual({ ...s, maxDuration: 0.4 })
    })
})
