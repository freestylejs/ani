// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { bindOptions, isReadable, toStyleString } from '../ani/shared'

describe('svelte shared helpers', () => {
    it('toStyleString writes CSS names, joins transforms and keeps custom properties', () => {
        expect(toStyleString({ opacity: 0.5 }, undefined)).toBe('opacity: 0.5')
        expect(
            toStyleString({ translateX: 4, scale: 2, marginTop: 3 }, undefined)
        ).toBe('margin-top: 3px; transform: translateX(4px) scale(2)')
        expect(
            toStyleString(
                { x: 1 },
                { x: (v: number) => ({ key: '--x', value: v }) }
            )
        ).toBe('--x: 1')
        expect(toStyleString({}, undefined)).toBe('')
    })

    it('isReadable detects stores only', () => {
        expect(isReadable({ subscribe: () => () => undefined })).toBe(true)
        expect(isReadable({})).toBe(false)
        expect(isReadable(null)).toBe(false)
    })

    it('bindOptions omits an undefined resolver', () => {
        const resolver = { x: (v: number) => ({ key: '--x', value: v }) }
        expect(bindOptions(undefined)).toEqual({})
        expect(bindOptions(resolver).resolver).toBe(resolver)
    })
})
