import { describe, expect, it } from 'vitest'
import { rafTimeline } from '~/ani/raf/timeline'
import { ani } from '~/nodes'
import { TimelineBase } from '../interface'
import { ManualClock } from './manual_clock'

// `TimelineBase` used to declare `play(...args: unknown[])`, which let
// subclasses and callers disagree about the arguments without a type error.
class CustomTimeline extends TimelineBase<[number], [speed: number]> {
    public played: number[] = []
    public play(speed: number): void {
        this.played.push(speed)
    }
    public pause(): void {
        this.played.push(-1)
    }
    public resume(): void {
        this.played.push(-2)
    }
    public reset(): void {
        this.played.push(-3)
    }
    public seek(): void {
        this.played.push(-4)
    }
}

describe('TimelineBase play() signature', () => {
    it('is typed per engine through the PlayArgs parameter', () => {
        const custom = new CustomTimeline(ani({ to: [1], duration: 1 }))
        custom.play(2)
        // @ts-expect-error the engine declares `play(speed: number)`
        const wrong = () => custom.play('fast')
        expect(typeof wrong).toBe('function')
        expect(custom.played).toEqual([2])

        const line = rafTimeline(
            ani({ to: [1], duration: 1 }),
            new ManualClock()
        )
        // @ts-expect-error a raf timeline requires a config object
        const missing = () => line.play()
        expect(typeof missing).toBe('function')
    })
})
