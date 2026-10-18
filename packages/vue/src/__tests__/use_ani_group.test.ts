// @vitest-environment jsdom

import { a, createClock, rafGroup } from '@freestylejs/ani-core'
import { describe, expect, it } from 'vitest'
import { createManualClockWith } from '../../../core/src/__tests__/integration/harness'
import { useAniGroup } from '../index'

describe('useAniGroup invalid index', () => {
    it('throws a TypeError synchronously from ref(index)', () => {
        const m = createManualClockWith(createClock)
        const group = rafGroup(a.ani({ to: { opacity: 1 }, duration: 1 }), {
            stagger: 0.1,
            clock: m.clock,
        })
        const { ref } = useAniGroup(group)
        expect(() => ref(-1)).toThrow(TypeError)
        expect(() => ref(1.5)).toThrow(TypeError)
        expect(() => ref(Number.NaN)).toThrow(TypeError)
        expect(() => ref(2 ** 32)).toThrow(TypeError)
        expect(() => ref(0)).not.toThrow()
    })
})
