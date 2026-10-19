import { describe, expect, it } from 'vitest'
import { a, rafGroup } from '../../index'
import { createManualClock } from '../../testing'

function fakeElement() {
    const current: Record<string, unknown> = {}
    const style = new Proxy({} as Record<string, unknown>, {
        set(_t, prop, value) {
            current[String(prop)] = value
            return true
        },
        get(_t, prop) {
            if (prop === 'setProperty') {
                return (name: string, value: unknown) => {
                    current[name] = value
                }
            }
            return current[String(prop)]
        },
    })
    return { style: style as unknown as CSSStyleDeclaration, current }
}

const node = () =>
    a.ani({ to: { translateX: 100 }, duration: 1, timing: a.timing.linear() })
const from = { translateX: 0 }

function setup() {
    const m = createManualClock({ lagThreshold: Infinity })
    const group = rafGroup(node(), { clock: m.clock })
    return { m, group }
}

describe('FX3: the count rule', () => {
    it('B1: only bindAt and no count throws, naming count and bindAt', () => {
        const { group } = setup()
        group.bindAt(0, fakeElement())
        group.bindAt(1, fakeElement())
        let message = ''
        try {
            group.play({ from })
        } catch (error) {
            expect(error).toBeInstanceOf(RangeError)
            message = (error as Error).message
        }
        expect(message).toMatch(/count/)
        expect(message).toMatch(/bindAt/)
        group.dispose()
    })

    it('B2: bindAt bindings do not set the count', () => {
        const { group } = setup()
        group.bind([fakeElement(), fakeElement(), fakeElement()])
        group.bindAt(9, fakeElement())
        group.play({ from })
        expect(group.count).toBe(3)
        group.dispose()
    })

    it('B3: no binding and no count still throws', () => {
        const { group } = setup()
        expect(() => group.play({ from })).toThrow(RangeError)
        group.dispose()
    })

    it('B4: an explicit count wins', () => {
        const { m, group } = setup()
        const far = fakeElement()
        group.bindAt(0, fakeElement())
        group.bindAt(4, far)
        group.play({ from, count: 2 })
        expect(group.count).toBe(2)
        m.frame(500)
        expect(far.current.transform).toBeUndefined()
        group.dispose()
    })
})

describe('FX3: seek on an endless group', () => {
    it('E1: seek(Infinity) on an endless group throws and never ends the group', async () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const group = rafGroup(a.loop(node(), Number.POSITIVE_INFINITY), {
            clock: m.clock,
        })
        group.bindAt(0, fakeElement())
        const results: string[] = []
        group.play({ from, count: 1 }).then((result) => results.push(result))
        m.frame(100)
        expect(() => group.seek(Number.POSITIVE_INFINITY)).toThrow(RangeError)
        group.resume()
        m.frames(10, 16)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(group.status).not.toBe('ENDED')
        expect(results).toEqual([])
        group.dispose()
    })

    it('E2: a finite group seek(Infinity) matches the RAF timeline', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const group = rafGroup(node(), { clock: m.clock })
        group.bindAt(0, fakeElement())
        group.play({ from, count: 1 })
        const line = a.rafTimeline(node(), { clock: m.clock })
        line.play({ from })
        let groupThrew = false
        let lineThrew = false
        try {
            group.seek(Number.POSITIVE_INFINITY)
        } catch {
            groupThrew = true
        }
        try {
            line.seek(Number.POSITIVE_INFINITY)
        } catch {
            lineThrew = true
        }
        expect(groupThrew).toBe(lineThrew)
        group.dispose()
        line.dispose()
    })
})
