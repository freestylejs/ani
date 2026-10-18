import { describe, expect, it } from 'vitest'
import { AniError } from '../error'
import { color, colorIn, length, record, template } from './index'

function mismatchCode(run: () => unknown): string | undefined {
    try {
        run()
    } catch (error) {
        return error instanceof AniError ? error.code : 'other'
    }
    return undefined
}

describe('values codecs', () => {
    it('srgb-linear round trips white and prints a color() function', () => {
        const linear = colorIn('srgb-linear')
        const encoded = linear.encode('#fff')
        expect(encoded[0]).toBeCloseTo(1, 6)
        expect(linear.decode(encoded)).toBe('color(srgb-linear 1 1 1 / 1)')
    })

    it('accepts named colors case-insensitively and hsl hue units', () => {
        expect(color.encode(' RebeccaPurple ')).toEqual(color.encode('#663399'))
        const reference = color.encode('hsl(180 100% 50%)')
        for (const form of [
            'hsl(0.5turn 100% 50%)',
            'hsla(180deg, 100%, 50%, 1)',
        ]) {
            const encoded = color.encode(form)
            encoded.forEach((value, index) => {
                expect(value).toBeCloseTo(reference[index] ?? 0, 6)
            })
        }
    })

    it('rejects a wrong-sized vector and unknown units', () => {
        expect(mismatchCode(() => length('px').decode([1, 2]))).toBe(
            'ANI_CODEC_MISMATCH'
        )
        expect(mismatchCode(() => length('pt' as never))).toBe(
            'ANI_CODEC_MISMATCH'
        )
        expect(mismatchCode(() => template`a(${'px'})`.decode([1, 2]))).toBe(
            'ANI_CODEC_MISMATCH'
        )
    })

    it('supports unitless template slots and nested records', () => {
        const matrix = template`scale(${''}, ${''})`
        expect(matrix.encode('scale(1.5, 2)')).toEqual([1.5, 2])
        expect(matrix.decode([1.5, 2])).toBe('scale(1.5, 2)')

        const style = record({ w: length('px'), t: matrix })
        expect(style.size).toBe(3)
        expect(style.decode([4, 1, 2])).toEqual({
            w: '4px',
            t: 'scale(1, 2)',
        })
    })
})
