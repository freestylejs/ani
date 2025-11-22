import { describe, expect, it, vi } from 'vitest'
import { ani, loop, sequence } from '~/nodes'

describe('LoopNode', () => {
    it('should calculate duration as child duration multiplied by count', () => {
        const child = ani({ to: [1], duration: 1.5 })
        const looped = loop(child, 3)
        expect(looped.duration).toBe(4.5)
    })

    it('should have a duration of 0 if the child has 0 duration', () => {
        const child = ani({ to: [1], duration: 0 })
        const looped = loop(child, 10)
        expect(looped.duration).toBe(0)
    })

    it('should have a duration of 0 if the count is 0', () => {
        const child = ani({ to: [1], duration: 1.5 })
        const looped = loop(child, 0)
        expect(looped.duration).toBe(0)
    })

    it('should construct its child the correct number of times', () => {
        const child = ani({ to: [1], duration: 2 })
        const mockConstruct = vi.spyOn(child, 'construct')
        const looped = loop(child, 4)
        const plan: any[] = []
        looped.construct(plan, 0)

        expect(mockConstruct).toHaveBeenCalledTimes(4)
    })

    it('should construct children sequentially with correct start times', () => {
        const child = ani({ to: [1], duration: 2 })
        const mockConstruct = vi.spyOn(child, 'construct')
        const looped = loop(child, 3)
        const plan: any[] = []
        looped.construct(plan, 5) // Start at arbitrary time 5

        expect(mockConstruct).toHaveBeenCalledWith(plan, 5) // 5 + 0 * 2
        expect(mockConstruct).toHaveBeenCalledWith(plan, 7) // 5 + 1 * 2
        expect(mockConstruct).toHaveBeenCalledWith(plan, 9) // 5 + 2 * 2
    })

    it('should work correctly inside another composition node', () => {
        const bounce = sequence([
            ani({ to: { y: -10 }, duration: 0.5 }),
            ani({ to: { y: 0 }, duration: 0.5 }),
        ]) // 1s duration

        const full = sequence([
            ani({ to: { opacity: 1 }, duration: 1 }),
            loop(bounce, 3), // 3s duration
            ani({ to: { opacity: 0 }, duration: 1 }),
        ])

        expect(full.duration).toBe(5)
    })
})
