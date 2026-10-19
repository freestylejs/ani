import { describe, expect, it } from 'vitest'
import * as a from '../../index'
import { AniError, rafTimeline } from '../../index'
import { color, colorIn, length, record, template } from '../../values'

/** Deterministic Park-Miller PRNG: the A5 sweep must be reproducible. */
function createRandom(seed: number): () => number {
    let state = seed % 2147483647
    if (state <= 0) state += 2147483646
    return () => {
        state = (state * 16807) % 2147483647
        return (state - 1) / 2147483646
    }
}

function caughtBy(run: () => unknown): unknown {
    try {
        run()
    } catch (error) {
        return error
    }
    return undefined
}

function expectNear(actual: number, expected: number, tolerance: number): void {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

function expectVectorNear(
    actual: readonly number[],
    expected: readonly number[],
    tolerance: number
): void {
    expect(actual).toHaveLength(expected.length)
    for (let i = 0; i < expected.length; i++) {
        expectNear(actual[i]!, expected[i]!, tolerance)
    }
}

function expectCodecMismatch(run: () => unknown): void {
    const error = caughtBy(run)
    expect(error).toBeInstanceOf(AniError)
    expect((error as AniError).code).toBe('ANI_CODEC_MISMATCH')
}

describe('VAL color codec', () => {
    it('A1: encodes white, black and named red to oklab vectors', () => {
        expectVectorNear(color.encode('#ffffff'), [1, 0, 0, 1], 1e-6)
        expectVectorNear(color.encode('#000'), [0, 0, 0, 1], 1e-6)
        expectVectorNear(
            color.encode('red'),
            [0.627955, 0.224863, 0.125846, 1],
            1e-5
        )
    })

    it('A2: all accepted syntaxes of one color agree', () => {
        const reference = color.encode('#ff3366')
        const forms = [
            '#F36',
            'rgb(255, 51, 102)',
            'rgb(255 51 102 / 1)',
            'rgba(100%, 20%, 40%, 1)',
            'hsl(345 100% 60%)',
        ]
        for (const form of forms) {
            expectVectorNear(color.encode(form), reference, 1e-5)
        }
    })

    it('A3: alpha forms are parsed', () => {
        expectNear(color.encode('#ff336680')[3]!, 0.50196, 1e-5)
        expect(color.encode('rgb(0 0 0 / 50%)')[3]).toBe(0.5)
        expectVectorNear(color.encode('transparent'), [0, 0, 0, 0], 1e-6)
    })

    it('A4: oklch and oklab inputs encode to oklab vectors', () => {
        expectVectorNear(
            color.encode('oklch(0.7 0.1 180)'),
            [0.7, -0.1, 0, 1],
            1e-6
        )
        expectVectorNear(
            color.encode('oklab(70% 0.1 -0.05)'),
            [0.7, 0.1, -0.05, 1],
            1e-6
        )
    })

    it('A5: 50 seeded sRGB colors round trip through srgb and oklab', () => {
        const random = createRandom(42)
        const srgb = colorIn('srgb')
        for (let i = 0; i < 50; i++) {
            const r = Math.floor(random() * 256)
            const g = Math.floor(random() * 256)
            const b = Math.floor(random() * 256)
            const alpha = Math.floor(random() * 101) / 100
            const canonical = `rgb(${r} ${g} ${b} / ${alpha})`
            expect(srgb.decode(srgb.encode(canonical))).toBe(canonical)

            const encoded = color.encode(canonical)
            const reEncoded = color.encode(color.decode(encoded))
            for (let channel = 0; channel < 4; channel++) {
                expectNear(reEncoded[channel]!, encoded[channel]!, 1e-4)
            }
        }
    })

    it('A6: srgb decode clamps channels and alpha', () => {
        expect(colorIn('srgb').decode([1.2, -0.1, 0.5, 2])).toBe(
            'rgb(255 0 127.5 / 1)'
        )
    })

    it('A7: invalid color input throws AniError ANI_CODEC_MISMATCH', () => {
        const invalid = [
            '#ff',
            'rgb(1,2)',
            'notacolor',
            'currentcolor',
            'color(display-p3 1 0 0)',
            '',
        ]
        for (const input of invalid) {
            expectCodecMismatch(() => color.encode(input))
        }
        expectCodecMismatch(() => colorIn('lab' as never))
        expectCodecMismatch(() => color.decode([1, 2, 3]))
    })
})

describe('VAL length codec', () => {
    it('A8: parses and formats values for a fixed unit', () => {
        const rem = length('rem')
        expect(rem.size).toBe(1)
        expect(rem.encode('12.5rem')).toEqual([12.5])
        expect(rem.encode('-1.5e2rem')).toEqual([-150])
        expect(rem.encode('0')).toEqual([0])
        expect(rem.decode([1 / 3])).toBe('0.3333rem')
        expect(rem.decode([-0])).toBe('0rem')
        expect(rem.encode(' 12rem ')).toEqual([12])
        expectCodecMismatch(() => rem.encode('12px'))
        expectCodecMismatch(() => rem.encode('12'))
        expectCodecMismatch(() => rem.encode('12 rem'))
        expect(() => length('bogus' as never)).toThrow()
    })
})

describe('VAL template codec', () => {
    it('A9: encodes and decodes interpolation slots', () => {
        const transform = template`translate(${'px'}, ${'px'}) rotate(${'deg'})`
        expect(transform.size).toBe(3)
        expect(transform.encode('translate(10px, 20px) rotate(45deg)')).toEqual(
            [10, 20, 45]
        )
        expect(transform.decode([10, 20, 45])).toBe(
            'translate(10px, 20px) rotate(45deg)'
        )
        expect(
            transform.encode('translate(10px,  20px) rotate(45deg)')
        ).toEqual([10, 20, 45])
        expectCodecMismatch(() => transform.encode('translate(10px, 20px)'))
        expectCodecMismatch(() =>
            transform.encode('translate(10em, 20px) rotate(45deg)')
        )
    })
})

describe('VAL record codec', () => {
    it('A10: composes member codecs in key order', () => {
        const style = record({ bg: color, w: length('px') })
        expect(style.size).toBe(5)

        const encoded = style.encode({ bg: '#fff', w: '10px' })
        expect(encoded).toHaveLength(5)
        expectVectorNear(encoded.slice(0, 4), [1, 0, 0, 1], 1e-6)
        expect(encoded[4]).toBe(10)
        expect(style.decode(encoded)).toEqual({
            bg: 'oklab(1 0 0 / 1)',
            w: '10px',
        })
        expect(
            style.encode({ bg: '#fff', w: '10px', extra: 1 } as never)
        ).toEqual(encoded)
        expectCodecMismatch(() => style.encode({ bg: '#fff' } as never))
    })
})

describe('VAL engine integration', () => {
    it('A11: a rafTimeline animates a color vector and decodes mid-run', () => {
        const timeline = rafTimeline(
            a.ani({
                to: color.encode('#fff'),
                duration: 1,
                timing: a.timing.linear(),
            })
        )
        timeline.play({ from: color.encode('#000') })
        timeline.seek(0.5)
        const state = timeline.value
        expect(state).not.toBeNull()
        expect(color.decode(state!)).toBe('oklab(0.5 0 0 / 1)')
        timeline.dispose()
    })
})

describe('VAL isolation', () => {
    it('A12: codecs stay out of the root entry and AniError carries metadata', async () => {
        const root = await import('../../index')
        for (const name of ['color', 'length', 'template', 'record']) {
            expect(Object.keys(root)).not.toContain(name)
        }

        const error = caughtBy(() => color.encode('notacolor'))
        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(AniError)
        const aniError = error as AniError
        expect(aniError.name).toBe('AniError')
        expect(aniError.code).toBe('ANI_CODEC_MISMATCH')
        expect(aniError.docs).toBe(
            'https://ani.freestylejs.dev/docs/errors#ani_codec_mismatch'
        )
        expect(aniError.message.startsWith('[ANI_CODEC_MISMATCH] ')).toBe(true)
    })
})
