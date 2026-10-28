import { describe, expect, it } from 'vitest'
import {
    type LayoutStatus,
    resolveLayoutStatus,
    type SnapReason,
} from '../plan'

/** §9.3, earliest first. */
const ORDER: readonly LayoutStatus[] = [
    'failed',
    'disposed',
    'disabled',
    'capped',
    'interrupted',
    'ended',
    'reduced',
    'stale',
    'no-change',
]

describe('§9.3 status precedence', () => {
    it('resolves every pair that can co-occur to the earlier status, in any order', () => {
        for (let a = 0; a < ORDER.length; a++) {
            for (let b = a + 1; b < ORDER.length; b++) {
                const earlier = ORDER[a]!
                const later = ORDER[b]!
                expect(
                    resolveLayoutStatus([earlier, later]),
                    `${earlier} before ${later}`
                ).toBe(earlier)
                expect(
                    resolveLayoutStatus([later, earlier]),
                    `${later} then ${earlier}`
                ).toBe(earlier)
            }
        }
    })

    it('resolves the whole set to failed', () => {
        expect(resolveLayoutStatus(ORDER)).toBe('failed')
        expect(resolveLayoutStatus([...ORDER].reverse())).toBe('failed')
    })

    it('returns null when no status applies', () => {
        expect(resolveLayoutStatus([])).toBeNull()
    })

    it('keeps the failure and kill-switch reasons in SnapReason', () => {
        const reasons: SnapReason[] = ['failed', 'disabled']
        expect(reasons).toEqual(['failed', 'disabled'])
    })
})
