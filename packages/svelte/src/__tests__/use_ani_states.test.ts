// @vitest-environment node

import * as a from '@freestylejs/ani-core'
import { describe, expect, it, vi } from 'vitest'
import { useAniStates } from '../ani/use_ani_states'
import { createManualClock } from './clock'

vi.mock('svelte', async (importOriginal) => ({
    ...(await importOriginal<typeof import('svelte')>()),
    onDestroy: () => undefined,
}))

describe('svelte useAniStates', () => {
    it('renders initialValue as the initial style', () => {
        const m = createManualClock({ lagThreshold: Infinity })
        const { style } = useAniStates({
            initial: 'idle',
            initialValue: { opacity: 0.5 },
            states: {
                idle: a.ani({ to: { opacity: 0 }, duration: 1 }),
            },
            clock: m.clock,
        })
        expect(style).toBe('opacity: 0.5')
    })
})
