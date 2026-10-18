import { describe, expect, it } from 'vitest'
import { createStyleWriter } from '../writer'

function fakeStyle() {
    const calls: [string, unknown][] = []
    const style = new Proxy({} as Record<string, unknown>, {
        set(_target, prop, value) {
            calls.push([String(prop), value])
            return true
        },
        get(_target, prop) {
            if (prop === 'setProperty') {
                return (name: string, value: string) => {
                    calls.push([name, value])
                }
            }
            return undefined
        },
    })
    return { style: style as unknown as CSSStyleDeclaration, calls }
}

describe('createStyleWriter', () => {
    it('throws a TypeError synchronously for a target without a style object', () => {
        for (const target of [null, undefined, {}, { style: null }, 'a']) {
            expect(() => createStyleWriter(target as never)).toThrow(TypeError)
        }
    })

    it('writes every declaration on the first write', () => {
        const { style, calls } = fakeStyle()
        createStyleWriter({ style }).write({
            transform: 'translateX(1px)',
            opacity: 0.5,
        })
        expect(calls).toEqual([
            ['transform', 'translateX(1px)'],
            ['opacity', 0.5],
        ])
    })

    it('assigns camelCase keys and uses setProperty for custom and hyphenated keys', () => {
        const { style, calls } = fakeStyle()
        createStyleWriter({ style }).write({
            marginLeft: '4px',
            '--shift': '7px',
            'background-color': 'red',
        })
        expect(calls).toEqual([
            ['marginLeft', '4px'],
            ['--shift', '7px'],
            ['background-color', 'red'],
        ])
    })

    it('skips declarations whose written value did not change', () => {
        const { style, calls } = fakeStyle()
        const writer = createStyleWriter({ style })
        writer.write({ transform: 'a', opacity: 1, '--v': '1' })
        calls.length = 0
        writer.write({ transform: 'b', opacity: 1, '--v': '1' })
        expect(calls).toEqual([['transform', 'b']])
        calls.length = 0
        writer.write({ transform: 'b', opacity: 1, '--v': '1' })
        expect(calls).toEqual([])
    })

    it('compares written strings, so 1 and "1" are the same declaration', () => {
        const { style, calls } = fakeStyle()
        const writer = createStyleWriter({ style })
        writer.write({ opacity: 1 })
        writer.write({ opacity: '1' })
        expect(calls).toEqual([['opacity', 1]])
    })

    it('keeps an independent cache per writer', () => {
        const first = fakeStyle()
        const second = fakeStyle()
        const a = createStyleWriter({ style: first.style })
        const b = createStyleWriter({ style: second.style })
        a.write({ opacity: 1 })
        b.write({ opacity: 1 })
        expect(first.calls).toHaveLength(1)
        expect(second.calls).toHaveLength(1)
    })

    it('does not cache a declaration whose write threw', () => {
        let fail = true
        const calls: unknown[] = []
        const style = new Proxy({} as Record<string, unknown>, {
            set(_target, _prop, value) {
                if (fail) throw new Error('boom')
                calls.push(value)
                return true
            },
        }) as unknown as CSSStyleDeclaration
        const writer = createStyleWriter({ style })
        expect(() => writer.write({ opacity: 1 })).toThrow('boom')
        fail = false
        writer.write({ opacity: 1 })
        expect(calls).toEqual([1])
    })
})
