import { describe, expect, it } from 'vitest'
import { ModuleB } from '../b'

describe('ModuleB', () => {
    it('should handle absolute path import', () => {
        expect(ModuleB()).toBe(2)
    })
})
