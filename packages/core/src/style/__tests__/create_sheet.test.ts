import { describe, expect, it } from 'vitest'
import { createStyleSheet, type Resolver } from '../create_sheet'

// Verbatim copy of the pre-optimisation implementation: the optimised
// version must stay byte-identical (values, key order, transform order).
const TRANSFORM = {
    rotate: ['rotate', 'deg'],
    rotateX: ['rotateX', 'deg'],
    rotateY: ['rotateY', 'deg'],
    rotateZ: ['rotateZ', 'deg'],
    skew: ['skew', 'deg'],
    skewX: ['skewX', 'deg'],
    skewY: ['skewY', 'deg'],
    translate: ['translate', 'px'],
    translateX: ['translateX', 'px'],
    translateY: ['translateY', 'px'],
    translateZ: ['translateZ', 'px'],
    scale: ['scale', undefined],
    scaleX: ['scaleX', undefined],
    scaleY: ['scaleY', undefined],
    scaleZ: ['scaleZ', undefined],
} as const
const PX = new Set([
    'width',
    'height',
    'margin',
    'marginTop',
    'marginBottom',
    'marginLeft',
    'marginRight',
    'padding',
    'paddingTop',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'top',
    'left',
    'right',
    'bottom',
    'borderWidth',
    'borderRadius',
])
function reference(
    values: Record<string, number>,
    resolver?: Resolver<Record<string, number>>
): Record<string, any> {
    const out: Record<string, any> = {}
    const parts: string[] = []
    for (const key in values) {
        if (!Object.hasOwn(values, key)) continue
        const value = values[key]
        if (typeof value !== 'number') continue
        const custom = resolver?.[key]
        if (custom) {
            const r = custom(value)
            out[r.key] = r.value
            continue
        }
        if (Object.hasOwn(TRANSFORM, key)) {
            const [fn, unit] = TRANSFORM[key as keyof typeof TRANSFORM]
            parts.push(unit ? `${fn}(${value}${unit})` : `${fn}(${value})`)
            continue
        }
        if (PX.has(key)) {
            out[key] = `${value}px`
            continue
        }
        out[key] = value
    }
    if (parts.length > 0) out['transform'] = parts.join(' ')
    return out
}

const same = (
    values: Record<string, number>,
    resolver?: Resolver<Record<string, number>>
) => {
    const got = createStyleSheet(values, resolver)
    const want = reference(values, resolver)
    expect(got).toEqual(want)
    // key order is part of the contract (transform lands last)
    expect(Object.keys(got)).toEqual(Object.keys(want))
    expect(JSON.stringify(got)).toBe(JSON.stringify(want))
}

describe('createStyleSheet equivalence', () => {
    it.each([
        ['empty', {}],
        ['px lengths', { width: 10, height: 0, marginTop: -4.5 }],
        [
            'unitless',
            { opacity: 0.25, zIndex: 3, lineHeight: 1.2, fontWeight: 600 },
        ],
        [
            'fallback keys',
            { flexGrow: 2, '--x': 1, 'background-position-x': 5 },
        ],
        ['single transform', { translateX: 12 }],
        ['unit-less transform', { scale: 1.5, scaleX: 2 }],
        [
            'every transform in key order',
            {
                rotate: 1,
                rotateX: 2,
                rotateY: 3,
                rotateZ: 4,
                skew: 5,
                skewX: 6,
                skewY: 7,
                translate: 8,
                translateX: 9,
                translateY: 10,
                translateZ: 11,
                scale: 12,
                scaleX: 13,
                scaleY: 14,
                scaleZ: 15,
            },
        ],
        [
            'mixed record: transforms interleaved with others',
            {
                translateX: 1,
                opacity: 0.5,
                scale: 2,
                left: 3,
                rotate: 45,
                foo: 9,
            },
        ],
        [
            'special numbers',
            { translateX: -0, opacity: Number.NaN, width: 1e21 },
        ],
        ['prototype-ish names', { constructor: 1, toString: 2, valueOf: 3 }],
    ] as const)('%s', (_name, values) => {
        same({ ...values } as Record<string, number>)
    })

    it('skips non-number values and inherited keys', () => {
        const inherited = Object.create({ width: 5 }) as Record<string, number>
        inherited.opacity = 1
        same(inherited)
        same({ width: '10' as unknown as number, opacity: 1 })
        same(
            JSON.parse('{"__proto__": 1, "scale": 2}') as Record<string, number>
        )
    })

    it('applies resolvers first, with their own keys and ordering', () => {
        const resolver: Resolver<Record<string, number>> = {
            translateX: (v) => ({ key: 'left', value: `${v}px` }),
            opacity: (v) => ({ key: '--o', value: v * 2 }),
            scale: (v) => ({ key: 'transform', value: `scale(${v})!` }),
        }
        same({ translateX: 4, opacity: 0.5, rotate: 3 }, resolver)
        // a resolver-produced `transform` is overwritten by real transform parts
        same({ scale: 2, translateY: 1 }, resolver)
        same({ scale: 2 }, resolver)
    })

    it('matches the reference for randomly generated records', () => {
        const pool = [
            'translateX',
            'translateY',
            'rotate',
            'scale',
            'scaleZ',
            'width',
            'top',
            'borderRadius',
            'opacity',
            'zIndex',
            'custom',
            '--v',
            'constructor',
        ]
        let seed = 12345
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) % 4294967296
            return seed / 4294967296
        }
        for (let n = 0; n < 500; n++) {
            const values: Record<string, number> = {}
            for (const key of pool) {
                if (rand() < 0.4)
                    values[key] = Math.round(rand() * 2000 - 1000) / 8
            }
            same(values)
        }
    })
})
