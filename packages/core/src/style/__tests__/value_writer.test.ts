import { describe, expect, it } from 'vitest'
import { createValueStylePlan } from '../create_sheet'
import { createStyleWriter, formatTransform } from '../writer'

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

describe('createStyleWriter.writeValues', () => {
    it('writes every declaration on the first frame, in plan order', () => {
        const plan = createValueStylePlan(['translateX', 'opacity'])
        const { style, calls } = fakeStyle()
        createStyleWriter({ style }).writeValues(plan, [10, 0.5])
        expect(calls).toEqual([
            ['opacity', 0.5],
            ['transform', 'translateX(10px)'],
        ])
    })

    it('writes only the declarations whose values changed', () => {
        const plan = createValueStylePlan(['translateX', 'opacity'])
        const { style, calls } = fakeStyle()
        const writer = createStyleWriter({ style })
        writer.writeValues(plan, [10, 0.5])
        calls.length = 0
        writer.writeValues(plan, [10, 0.5])
        expect(calls).toEqual([])
        writer.writeValues(plan, [20, 0.5])
        expect(calls).toEqual([['transform', 'translateX(20px)']])
        calls.length = 0
        writer.writeValues(plan, [20, 0.7])
        expect(calls).toEqual([['opacity', 0.7]])
    })

    it('formats px, custom and hyphenated declarations', () => {
        const plan = createValueStylePlan([
            'width',
            '--shift',
            'background-color',
        ])
        const { style, calls } = fakeStyle()
        createStyleWriter({ style }).writeValues(plan, [12, 3, 4])
        expect(calls).toEqual([
            ['width', '12px'],
            ['--shift', '3'],
            ['background-color', '4'],
        ])
    })

    it('uses the shared transform string without rebuilding it', () => {
        const plan = createValueStylePlan(['translateX', 'rotate', 'opacity'])
        const values = [10, 45, 0.5]
        const text = formatTransform(plan, values)
        expect(text).toBe('translateX(10px) rotate(45deg)')
        const { style, calls } = fakeStyle()
        createStyleWriter({ style }).writeValues(plan, values, text)
        expect(calls).toContainEqual(['transform', text])
    })

    it('resets the written cache when the plan signature changes', () => {
        const opacityPlan = createValueStylePlan(['opacity'])
        const widthPlan = createValueStylePlan(['width'])
        const { style, calls } = fakeStyle()
        const writer = createStyleWriter({ style })
        writer.writeValues(opacityPlan, [0.5])
        writer.writeValues(widthPlan, [10])
        expect(calls).toEqual([
            ['opacity', 0.5],
            ['width', '10px'],
        ])
    })

    it('treats NaN as equal across frames', () => {
        const plan = createValueStylePlan(['opacity'])
        const { style, calls } = fakeStyle()
        const writer = createStyleWriter({ style })
        writer.writeValues(plan, [Number.NaN])
        calls.length = 0
        writer.writeValues(plan, [Number.NaN])
        expect(calls).toEqual([])
    })

    it('does not write a transform when the plan has no transform parts', () => {
        const plan = createValueStylePlan(['opacity'])
        const { style, calls } = fakeStyle()
        createStyleWriter({ style }).writeValues(plan, [0.5])
        expect(calls).toEqual([['opacity', 0.5]])
    })
})
