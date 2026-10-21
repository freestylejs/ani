import { describe, expect, it } from 'vitest'
import * as layout from '../index'

describe('layout package without DOM', () => {
    it('imports and exposes the public surface in Node', () => {
        expect(typeof layout.createPresence).toBe('function')
        expect(typeof layout.reconcilePresence).toBe('function')
        expect(typeof layout.settlePresence).toBe('function')
        expect(layout.hasDOM()).toBe(false)
        expect(layout.supportsFlip()).toBe(false)
        expect(layout.supportsViewTransition()).toBe(false)
    })
})
