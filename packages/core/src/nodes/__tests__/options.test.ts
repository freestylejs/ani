import { describe, expect, it } from 'vitest'
import { T } from '~/timing'
import { delay } from '../delay'
import { loop } from '../loop'
import { parallel } from '../parallel'
import { ani } from '../segment'
import { sequence } from '../sequence'
import { stagger } from '../stagger'

describe('node options-object form unit tests', () => {
    const ease = T.ease()
    const leaf = () => ani({ to: { x: 10 }, duration: 1 })

    describe('ani', () => {
        it('supports id in props and strips it from node props', () => {
            const node = ani({ to: { x: 1 }, duration: 1, id: 'prop-id' })
            expect(node.id).toBe('prop-id')
            expect('id' in node.props).toBe(false)
        })

        it('gives precedence to positional id over props id', () => {
            const node = ani(
                { to: { x: 1 }, duration: 1, id: 'props-id' },
                'positional-id'
            )
            expect(node.id).toBe('positional-id')
            expect('id' in node.props).toBe(false)
        })
    })

    describe('delay', () => {
        it('supports options object form with id', () => {
            const d = delay(0.5, { id: 'd-id' })
            expect(d.id).toBe('d-id')
            expect(d.duration).toBe(0.5)
        })

        it('supports positional id', () => {
            const d = delay(0.5, 'd-pos')
            expect(d.id).toBe('d-pos')
        })

        it('throws TypeError on unknown option keys', () => {
            expect(() => delay(1, { foo: 'bar' } as never)).toThrow(/foo/)
        })

        it('throws TypeError when mixing options and positional arguments', () => {
            expect(() => delay(1, { id: 'a' }, 'extra' as never)).toThrow(
                TypeError
            )
        })
    })

    describe('sequence, parallel, loop', () => {
        it('accepts options object form with timing and id', () => {
            const s = sequence([leaf()], { timing: ease, id: 's' })
            expect(s.id).toBe('s')

            const p = parallel([leaf()], { timing: ease, id: 'p' })
            expect(p.id).toBe('p')

            const l = loop(leaf(), 2, { timing: ease, id: 'l' })
            expect(l.id).toBe('l')
        })

        it('supports positional timing and id', () => {
            const s = sequence([leaf()], ease, 's')
            expect(s.id).toBe('s')

            const p = parallel([leaf()], ease, 'p')
            expect(p.id).toBe('p')

            const l = loop(leaf(), 2, ease, 'l')
            expect(l.id).toBe('l')
        })

        it('supports positional id with undefined timing', () => {
            const s = sequence([leaf()], undefined, 's-pos')
            expect(s.id).toBe('s-pos')

            const p = parallel([leaf()], undefined, 'p-pos')
            expect(p.id).toBe('p-pos')

            const l = loop(leaf(), 2, undefined, 'l-pos')
            expect(l.id).toBe('l-pos')
        })

        it('throws TypeError on unknown option keys', () => {
            expect(() =>
                sequence([leaf()], { unknownKey: 1 } as never)
            ).toThrow(/unknownKey/)
            expect(() =>
                parallel([leaf()], { invalid: 'opt' } as never)
            ).toThrow(/invalid/)
            expect(() => loop(leaf(), 2, { bad: true } as never)).toThrow(/bad/)
        })

        it('throws TypeError when mixing options and positional arguments', () => {
            expect(() =>
                sequence([leaf()], { timing: ease }, 'pos-id' as never)
            ).toThrow(TypeError)
            expect(() =>
                parallel([leaf()], { id: 'p' }, 'pos-id' as never)
            ).toThrow(TypeError)
            expect(() =>
                loop(leaf(), 2, { timing: ease }, 'pos-id' as never)
            ).toThrow(TypeError)
        })
    })

    describe('stagger', () => {
        it('accepts options object with offset, timing, and id', () => {
            const st = stagger([leaf(), leaf()], {
                offset: 0.2,
                timing: ease,
                id: 'st-id',
            })
            expect(st.id).toBe('st-id')
            expect(st.offset).toBe(0.2)
        })

        it('accepts positional offset, timing, and id', () => {
            const st = stagger([leaf(), leaf()], 0.2, ease, 'st-pos')
            expect(st.id).toBe('st-pos')
            expect(st.offset).toBe(0.2)
        })

        it('throws RangeError for missing or invalid offset in options', () => {
            expect(() => stagger([leaf()], {} as never)).toThrow(RangeError)
            expect(() => stagger([leaf()], { offset: -0.5 })).toThrow(
                RangeError
            )
            expect(() =>
                stagger([leaf()], { offset: Number.NaN } as never)
            ).toThrow(RangeError)
        })

        it('throws TypeError for unknown option keys in stagger', () => {
            expect(() =>
                stagger([leaf()], { offset: 0.1, unknownKey: 123 } as never)
            ).toThrow(/unknownKey/)
        })

        it('throws TypeError when mixing options and positional arguments in stagger', () => {
            expect(() =>
                stagger([leaf()], { offset: 0.1 }, ease as never)
            ).toThrow(TypeError)
            expect(() =>
                stagger([leaf()], { offset: 0.1 }, undefined, 'pos-id' as never)
            ).toThrow(TypeError)
        })
    })
})
