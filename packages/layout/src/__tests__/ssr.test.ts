import { describe, expect, it } from 'vitest'
import * as layout from '../index'

describe('layout package without DOM', () => {
    it('imports and exposes the public surface in Node', () => {
        expect(typeof layout.createPresence).toBe('function')
        expect(typeof layout.reconcilePresence).toBe('function')
        expect(typeof layout.settlePresence).toBe('function')
        expect(layout.hasDOM()).toBe(false)
        expect(layout.supportsViewTransition()).toBe(false)
    })

    it('a layout group is a no-op without DOM: hydration never animates', async () => {
        const group = layout.createLayoutGroup()
        group.capture()
        await expect(group.flush()).resolves.toEqual({
            status: 'no-change',
            snapped: [],
        })
        expect(group.stats).toEqual({ captures: 0, reads: 0, tracks: 0 })
        group.dispose()
        await expect(group.flush()).resolves.toMatchObject({
            status: 'disposed',
        })
    })
})
