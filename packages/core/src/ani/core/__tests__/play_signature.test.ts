import { describe, expect, it } from 'vitest'
import { rafTimeline } from '~/ani/raf/timeline'
import { ani } from '~/nodes'
import { ManualClock } from './manual_clock'

describe('play() signature', () => {
    it('a raf timeline requires a config object', () => {
        const line = rafTimeline(ani({ to: [1], duration: 1 }), {
            clock: new ManualClock(),
        })
        // @ts-expect-error a raf timeline requires a config object
        const missing = () => line.play()
        expect(typeof missing).toBe('function')
    })
})
