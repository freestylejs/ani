import { describe, expect, it } from 'vitest'
import * as a from '../../index'
import { rafGroup } from '../../index'
import { createManualClock } from '../../testing'

function fakeElement() {
    const current: Record<string, unknown> = {}
    const writes: string[] = []
    const style = new Proxy({} as Record<string, unknown>, {
        set(_t, prop, value) {
            writes.push(String(prop))
            current[String(prop)] = value
            return true
        },
        get(_t, prop) {
            if (prop === 'setProperty') {
                return (name: string, value: unknown) => {
                    writes.push(name)
                    current[name] = value
                }
            }
            return current[String(prop)]
        },
    })
    return { style: style as unknown as CSSStyleDeclaration, current, writes }
}

const node = () =>
    a.ani({ to: { translateX: 100 }, duration: 1, timing: a.timing.linear() })

describe('GBA: rafGroup.bindAt', () => {
    it('A1: binds one element to one target index', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const group = rafGroup(node(), { clock: m.clock, stagger: 0.25 })
        const el1 = fakeElement()
        const el2 = fakeElement()
        group.bindAt(1, el1)
        group.bindAt(2, el2)
        group.play({ from: { translateX: 0 }, count: 3 })
        m.frame(500)
        expect(el1.current.transform).toBe('translateX(25px)')
        expect(el2.current.transform).toBe('translateX(0px)')
    })

    it('A2: a late bindAt writes immediately; unbind stops writes and keeps styles', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const group = rafGroup(node(), { clock: m.clock })
        group.play({ from: { translateX: 0 }, count: 2 })
        m.frame(500)
        const el = fakeElement()
        const unbind = group.bindAt(0, el)
        expect(el.current.transform).toBe('translateX(50px)')
        unbind()
        unbind()
        const n = el.writes.length
        m.frame(100)
        expect(el.writes).toHaveLength(n)
        expect(el.current.transform).toBe('translateX(50px)')
    })

    it('A3: indices beyond count are not written, and are written by a later bigger run', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const group = rafGroup(node(), { clock: m.clock })
        const el = fakeElement()
        group.bindAt(5, el)
        group.play({ from: { translateX: 0 }, count: 2 })
        m.frame(100)
        expect(el.writes).toHaveLength(0)
        group.play({ from: { translateX: 0 }, count: 6 })
        m.frame(100)
        expect(el.current.transform).toBe('translateX(10px)')
    })

    it('A4: bindAt does not provide a count', () => {
        const m = createManualClock()
        const group = rafGroup(node(), { clock: m.clock })
        group.bindAt(0, fakeElement())
        expect(() => group.play({ from: { translateX: 0 } })).toThrow(
            RangeError
        )
    })

    it('A5: invalid index or target throws a TypeError', () => {
        const m = createManualClock()
        const group = rafGroup(node(), { clock: m.clock })
        for (const index of [-1, 1.5, Number.NaN]) {
            expect(() => group.bindAt(index, fakeElement())).toThrow(TypeError)
        }
        expect(() => group.bindAt(0, null as never)).toThrow(TypeError)
        expect(() => group.bindAt(0, {} as never)).toThrow(TypeError)
    })

    it('A6: the resolver option and dispose work like bind', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const group = rafGroup(node(), { clock: m.clock })
        const el = fakeElement()
        group.bindAt(0, el, {
            resolver: {
                translateX: (v: number) => ({ key: 'left', value: `${v}px` }),
            },
        })
        group.play({ from: { translateX: 0 }, count: 1 })
        m.frame(500)
        expect(el.current.left).toBe('50px')
        group.dispose()
        const n = el.writes.length
        m.frame(100)
        expect(el.writes).toHaveLength(n)
    })
})
