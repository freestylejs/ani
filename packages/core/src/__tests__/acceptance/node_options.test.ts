import { describe, expect, it } from 'vitest'
import { a, rafTimeline } from '../../index'
import { createManualClock } from '../../testing'

const ease = a.timing.ease()
const leaf = (x = 100) =>
    a.ani({ to: { x }, duration: 1, timing: a.timing.linear() })

describe('NODE: options objects', () => {
    it('A1: sequence / parallel / loop accept { timing, id }', () => {
        const s1 = a.sequence([leaf()], { timing: ease, id: 's' })
        const s2 = a.sequence([leaf()], ease, 's')
        expect(s1.id).toBe('s')
        expect(s1.duration).toBe(s2.duration)
        expect(a.parallel([leaf()], { id: 'p' }).id).toBe('p')
        const l = a.loop(leaf(), 3, { id: 'l' })
        expect(l.id).toBe('l')
        expect(l.duration).toBe(3)
    })

    it('A2: the options timing is inherited exactly like the positional one', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const untimed = a.ani({ to: { x: 100 }, duration: 1 })
        const viaOptions = rafTimeline(
            a.sequence([untimed], { timing: ease }),
            m.clock
        )
        const viaPositional = rafTimeline(a.sequence([untimed], ease), m.clock)
        viaOptions.play({ from: { x: 0 } })
        viaPositional.play({ from: { x: 0 } })
        m.frame(300)
        expect(viaOptions.getCurrentValue()!.x).toBeCloseTo(
            viaPositional.getCurrentValue()!.x,
            9
        )
    })

    it('A3: stagger takes { offset, timing, id }', () => {
        const st = a.stagger([leaf(), leaf()], { offset: 0.25, id: 'st' })
        expect(st.id).toBe('st')
        expect(st.duration).toBeCloseTo(1.25, 9)
        expect(a.stagger([leaf(), leaf()], 0.25).duration).toBeCloseTo(1.25, 9)
        expect(() => a.stagger([leaf()], { offset: -1 })).toThrow(RangeError)
        expect(() => a.stagger([leaf()], {} as never)).toThrow(RangeError)
    })

    it('A4: ani takes id in its props; delay takes { id }', () => {
        const n = a.ani({ to: { x: 1 }, duration: 1, id: 'leaf' })
        expect(n.id).toBe('leaf')
        expect(Object.keys(n.props).sort()).toEqual(
            ['duration', 'timing', 'to'].filter((k) => k in n.props).sort()
        )
        expect('id' in n.props).toBe(false)
        expect(a.delay(0.5, { id: 'd' }).id).toBe('d')
        expect(a.delay(0.5, 'd2').id).toBe('d2')
    })

    it('A5: mixing both forms or unknown keys throws a TypeError', () => {
        expect(() =>
            a.sequence([leaf()], { timing: ease }, 'x' as never)
        ).toThrow(TypeError)
        expect(() => a.parallel([leaf()], { bogus: 1 } as never)).toThrow(
            /bogus/
        )
        expect(() => a.loop(leaf(), 2, { id: 'a' }, 'b' as never)).toThrow(
            TypeError
        )
        expect(() =>
            a.stagger([leaf()], { offset: 0.1 }, ease as never)
        ).toThrow(TypeError)
        expect(() => a.delay(1, { idd: 'x' } as never)).toThrow(TypeError)
    })
})
