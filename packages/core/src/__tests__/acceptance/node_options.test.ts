import { describe, expect, it } from 'vitest'
import * as a from '../../index'
import { rafTimeline } from '../../index'
import { createManualClock } from '../../testing'

const ease = a.timing.ease()
const leaf = (x = 100) =>
    a.ani({ to: { x }, duration: 1, timing: a.timing.linear() })

describe('NODE: options objects', () => {
    it('A1: sequence / parallel / loop accept { timing, id }', () => {
        const s1 = a.sequence([leaf()], { timing: ease, id: 's' })
        const s2 = a.sequence([leaf()], { timing: ease, id: 's' })
        expect(s1.id).toBe('s')
        expect(s1.duration).toBe(s2.duration)
        expect(a.parallel([leaf()], { id: 'p' }).id).toBe('p')
        const l = a.loop(leaf(), 3, { id: 'l' })
        expect(l.id).toBe('l')
        expect(l.duration).toBe(3)
    })

    it('A2: the options timing is inherited by children without their own', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const inherited = rafTimeline(
            a.sequence([a.ani({ to: { x: 100 }, duration: 1 })], {
                timing: ease,
            }),
            { clock: m.clock }
        )
        const explicit = rafTimeline(
            a.sequence([a.ani({ to: { x: 100 }, duration: 1, timing: ease })]),
            { clock: m.clock }
        )
        inherited.play({ from: { x: 0 } })
        explicit.play({ from: { x: 0 } })
        m.frame(300)
        expect(inherited.value!.x).toBeCloseTo(explicit.value!.x, 9)
    })

    it('A3: stagger takes { offset, timing, id }', () => {
        const st = a.stagger([leaf(), leaf()], { offset: 0.25, id: 'st' })
        expect(st.id).toBe('st')
        expect(st.duration).toBeCloseTo(1.25, 9)
        expect(
            a.stagger([leaf(), leaf()], { offset: 0.25 }).duration
        ).toBeCloseTo(1.25, 9)
        expect(() => a.stagger([leaf()], { offset: -1 })).toThrow(RangeError)
        expect(() => a.stagger([leaf()], { offset: {} as never })).toThrow(
            RangeError
        )
    })

    it('A4: ani takes id in its props; delay takes { id }', () => {
        const n = a.ani({ to: { x: 1 }, duration: 1, id: 'leaf' })
        expect(n.id).toBe('leaf')
        expect(Object.keys(n.props).sort()).toEqual(
            ['duration', 'timing', 'to'].filter((k) => k in n.props).sort()
        )
        expect('id' in n.props).toBe(false)
        expect(a.delay(0.5, { id: 'd' }).id).toBe('d')
        expect(a.delay(0.5, { id: 'd2' }).id).toBe('d2')
    })

    it('A5: unknown option keys throw a TypeError naming the key', () => {
        const bogus = { bogus: 1 } as never
        expect(() => a.sequence([leaf()], bogus)).toThrow(/bogus/)
        expect(() => a.parallel([leaf()], bogus)).toThrow(/bogus/)
        expect(() => a.loop(leaf(), 2, bogus)).toThrow(/bogus/)
        expect(() =>
            a.stagger([leaf()], { offset: 0.1, bogus: 1 } as never)
        ).toThrow(/bogus/)
        expect(() => a.delay(1, bogus)).toThrow(/bogus/)
        expect(() => a.sequence([leaf()], bogus)).toThrow(TypeError)
    })
})
