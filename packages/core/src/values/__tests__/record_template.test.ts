import { describe, expect, it } from 'vitest'
import { AniError } from '../../error'
import { length, record, template } from '../index'

function caughtBy(run: () => unknown): unknown {
    try {
        run()
    } catch (error) {
        return error
    }
    return undefined
}

function expectMismatch(run: () => unknown): void {
    const error = caughtBy(run)
    expect(error).toBeInstanceOf(AniError)
    expect((error as AniError).code).toBe('ANI_CODEC_MISMATCH')
}

describe('record codec', () => {
    const xy = record({ x: length('px'), y: length('px') })

    it('encodes and decodes a complete record', () => {
        expect(xy.encode({ x: '1px', y: '2px' })).toEqual([1, 2])
        expect(xy.decode([1, 2])).toEqual({ x: '1px', y: '2px' })
    })

    it('rejects non-objects and null', () => {
        expectMismatch(() => xy.encode(null as never))
        expectMismatch(() => xy.encode('1px' as never))
    })

    it('rejects a missing key and ignores an extra one', () => {
        expectMismatch(() => xy.encode({ x: '1px' } as never))
        expect(xy.encode({ x: '1px', y: '2px', z: '3px' } as never)).toEqual([
            1, 2,
        ])
    })

    it('rejects the wrong decoded length', () => {
        expectMismatch(() => xy.decode([1]))
        expectMismatch(() => xy.decode([1, 2, 3]))
    })
})

describe('template codec', () => {
    const translate = template`translate(${'px'}, ${'px'})`

    it('encodes and decodes the matching string', () => {
        expect(translate.encode('translate(10px, 20px)')).toEqual([10, 20])
        expect(translate.decode([10, 20])).toBe('translate(10px, 20px)')
    })

    it('rejects a non-string unit', () => {
        expectMismatch(() => template`x(${1 as unknown as string})`)
    })

    it('rejects non-string and non-matching values', () => {
        expectMismatch(() => translate.encode(10 as never))
        expectMismatch(() => translate.encode('translate(10px)'))
    })

    it('rejects the wrong decoded length', () => {
        expectMismatch(() => translate.decode([10]))
        expectMismatch(() => translate.decode([10, 20, 30]))
    })
})
