import { describe, expect, it } from 'vitest'
import { timing } from '~/timing'
import { delay } from '../delay'
import { loop } from '../loop'
import { parallel } from '../parallel'
import { ani } from '../segment'
import { sequence } from '../sequence'
import { stagger } from '../stagger'

type Loose = (...args: unknown[]) => unknown
const loose = (fn: unknown) => fn as Loose

describe('node options-object form unit tests', () => {
    const ease = timing.ease()
    const leaf = () => ani({ to: { x: 10 }, duration: 1 })

    describe('ani', () => {
        it('supports id in props and strips it from node props', () => {
            const node = ani({ to: { x: 1 }, duration: 1, id: 'prop-id' })
            expect(node.id).toBe('prop-id')
            expect('id' in node.props).toBe(false)
        })

        it('throws TypeError naming the props id for an extra argument', () => {
            expect(() =>
                loose(ani)({ to: { x: 1 }, duration: 1 }, 'id')
            ).toThrow(/id/)
        })
    })

    describe('delay', () => {
        it('supports options object form with id', () => {
            const d = delay(0.5, { id: 'd-id' })
            expect(d.id).toBe('d-id')
            expect(d.duration).toBe(0.5)
        })

        it('has no id without options', () => {
            expect(delay(0.5).id).toBeUndefined()
        })

        it('throws TypeError on unknown option keys', () => {
            expect(() => delay(1, { foo: 'bar' } as never)).toThrow(/foo/)
        })

        it('throws TypeError for a positional id or extra arguments', () => {
            expect(() => loose(delay)(1, 'id')).toThrow(TypeError)
            expect(() => loose(delay)(1, { id: 'a' }, 'extra')).toThrow(
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

        it('accepts an id without timing', () => {
            const s = sequence([leaf()], { id: 's-id' })
            expect(s.id).toBe('s-id')

            const p = parallel([leaf()], { id: 'p-id' })
            expect(p.id).toBe('p-id')

            const l = loop(leaf(), 2, { id: 'l-id' })
            expect(l.id).toBe('l-id')
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

        it('throws TypeError naming the options form for a positional timing', () => {
            expect(() => loose(sequence)([leaf()], ease)).toThrow(
                /sequence\(children, \{ timing, id \}\)/
            )
            expect(() => loose(parallel)([leaf()], ease)).toThrow(
                /parallel\(children, \{ timing, id \}\)/
            )
            expect(() => loose(loop)(leaf(), 2, ease)).toThrow(
                /loop\(child, count, \{ timing, id \}\)/
            )
        })

        it('throws TypeError for extra arguments and non-object options', () => {
            expect(() => loose(sequence)([leaf()], undefined, 'id')).toThrow(
                TypeError
            )
            expect(() => loose(parallel)([leaf()], { id: 'p' }, 'x')).toThrow(
                TypeError
            )
            expect(() => loose(loop)(leaf(), 2, { id: 'l' }, 'x')).toThrow(
                TypeError
            )
            expect(() => loose(sequence)([leaf()], 'id')).toThrow(TypeError)
            expect(() => loose(sequence)([leaf()], null)).toThrow(TypeError)
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

        it('throws RangeError for missing or invalid offset in options', () => {
            expect(() => stagger([leaf()], { offset: {} as never })).toThrow(
                RangeError
            )
            expect(() => stagger([leaf()], {} as never)).toThrow(RangeError)
            expect(() => stagger([leaf()], { offset: -0.5 })).toThrow(
                RangeError
            )
            expect(() => stagger([leaf()], { offset: Number.NaN })).toThrow(
                RangeError
            )
        })

        it('throws TypeError for unknown option keys in stagger', () => {
            expect(() =>
                stagger([leaf()], { offset: 0.1, unknownKey: 123 } as never)
            ).toThrow(/unknownKey/)
        })

        it('throws TypeError naming the options form for a positional offset', () => {
            expect(() => loose(stagger)([leaf()], 0.1)).toThrow(
                /stagger\(children, \{ offset, timing, id \}\)/
            )
            expect(() => loose(stagger)([leaf()], 0.1, ease, 'id')).toThrow(
                TypeError
            )
            expect(() =>
                loose(stagger)([leaf()], { offset: 0.1 }, 'x')
            ).toThrow(TypeError)
        })
    })
})
