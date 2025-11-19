import { describe, expect, it } from 'vitest'
import { a } from '../../index'
import { compileTiming } from '../timing_compiler'

describe('Timing Compiler', () => {
    it('should compile undefined timing to linear', () => {
        expect(compileTiming(undefined)).toBe('linear')
    })

    it('should compile LinearTimingFunction to linear', () => {
        const timing = a.timing.linear()
        expect(compileTiming(timing)).toBe('linear')
    })

    it('should compile BezierTimingFunction to cubic-bezier string', () => {
        const timing = a.timing.bezier({
            p2: { x: 0.4, y: 0 },
            p3: { x: 0.2, y: 1 },
        })
        expect(compileTiming(timing)).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
    })

    it('should fallback to null for SpringTimingFunction (to trigger sampling)', () => {
        const timing = a.timing.spring({ m: 1, k: 100, c: 10 })
        expect(compileTiming(timing)).toBeNull()
    })

    it('should compile standard presets', () => {
        expect(compileTiming(a.timing.ease())).toBe('cubic-bezier(0.25, 0.1, 0.25, 1)')
        expect(compileTiming(a.timing.easeIn())).toBe('cubic-bezier(0.42, 0, 1, 1)')
        expect(compileTiming(a.timing.easeOut())).toBe('cubic-bezier(0, 0, 0.58, 1)')
        expect(compileTiming(a.timing.easeInOut())).toBe('cubic-bezier(0.42, 0, 0.58, 1)')
    })
})
