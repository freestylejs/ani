import { describe, expect, it } from 'vitest'
import { ani } from '~/nodes'
import { T } from '~/timing'
import { createManualClock } from '../../../testing'
import { isRafTimeline, rafTimeline } from '../timeline'

const node = () => ani({ to: { x: 100 }, duration: 2, timing: T.linear() })

describe('RafAniTimeline.drive', () => {
    it('validates velocity like play()', () => {
        const manual = createManualClock({ lagThreshold: Infinity })
        const t = rafTimeline<{ x: number }>(node(), manual.clock)

        for (const velocity of [{ x: Number.NaN }, 5, []]) {
            const config = {
                from: { x: 0 },
                velocity,
            } as unknown as Parameters<typeof t.drive>[1]
            expect(() => t.play(config)).toThrow(TypeError)
            t.reset()
            expect(() => t.drive(() => 0, config)).toThrow(TypeError)
            expect(t.status).toBe('IDLE')
            expect(manual.clock.size).toBe(0)
        }
    })

    it('reports zero velocity after an unchanged first frame', () => {
        const manual = createManualClock({ lagThreshold: Infinity })
        const t = rafTimeline<{ x: number }>(node(), manual.clock)
        t.drive(() => 0, { from: { x: 0 } })

        manual.frame(100)

        expect(t.velocity).toEqual({ x: 0 })
    })

    it('isRafTimeline requires drive on a facade', () => {
        const manual = createManualClock({ lagThreshold: Infinity })
        const t = rafTimeline<{ x: number }>(node(), manual.clock)
        const facade = {
            status: t.status,
            duration: t.duration,
            config: t.config,
            value: t.value,
            velocity: t.velocity,
            play: t.play,
            pause: t.pause,
            resume: t.resume,
            seek: t.seek,
            reset: t.reset,
            dispose: t.dispose,
            bind: t.bind,
            onUpdate: t.onUpdate,
        }
        expect(isRafTimeline(facade)).toBe(false)
        expect(isRafTimeline({ ...facade, drive: t.drive })).toBe(true)
    })
})
