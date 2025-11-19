import { describe, expect, it } from 'vitest'
import { a } from '../../index'
import { compileToKeyframes } from '../compiler'

describe('WebAni Compiler', () => {
    it('should compile a simple segment', () => {
        const node = a.ani({
            to: { translateX: 100 },
            duration: 1,
        })
        const initialFrom = { translateX: 0 }

        const keyframes = compileToKeyframes(node, initialFrom)

        expect(keyframes).toHaveLength(2)
        // offset 0
        expect(keyframes[0]!.offset).toBe(0)
        expect(keyframes[0]!['transform']).toBe('translateX(0px)')

        // offset 1
        expect(keyframes[1]!.offset).toBe(1)
        expect(keyframes[1]!['transform']).toBe('translateX(100px)')
    })

    it('should compile a sequence with offsets', () => {
        const node = a.sequence([
            a.ani({ to: { translateX: 100 }, duration: 1 }), // 0-1s
            a.ani({ to: { translateX: 200 }, duration: 1 }), // 1-2s
        ])
        const initialFrom = { translateX: 0 }

        const keyframes = compileToKeyframes(node, initialFrom)

        // Total duration = 2
        // Keyframes should be at:
        // t=0 (offset 0): x=0
        // t=1 (offset 0.5): x=100
        // t=2 (offset 1): x=200

        expect(keyframes).toHaveLength(3)
        expect(keyframes[0]).toMatchObject({
            offset: 0,
            transform: 'translateX(0px)',
        })
        expect(keyframes[1]).toMatchObject({
            offset: 0.5,
            transform: 'translateX(100px)',
        })
        expect(keyframes[2]).toMatchObject({
            offset: 1,
            transform: 'translateX(200px)',
        })
    })

    it('should compile a parallel block', () => {
        const node = a.parallel([
            a.ani({ to: { translateX: 100 }, duration: 1 }),
            a.ani({ to: { translateY: 100 }, duration: 1 }),
        ])
        const initialFrom = { translateX: 0, translateY: 0 }

        const keyframes = compileToKeyframes(node, initialFrom)

        // Total duration 1.
        // t=0: x=0, y=0
        // t=1: x=100, y=100

        expect(keyframes).toHaveLength(2)
        expect(keyframes[0]).toMatchObject({
            offset: 0,
            transform: 'translateX(0px) translateY(0px)',
        })
        expect(keyframes[1]).toMatchObject({
            offset: 1,
            transform: 'translateX(100px) translateY(100px)',
        })
    })

    it('should handle overlapping parallel animations (complex)', () => {
        // A: x -> 100 (0-2s)
        // B: y -> 100 (0.5-1.5s)
        const _node = a.parallel([
            a.ani({ to: { translateX: 100 }, duration: 2 }),
            a.delay(0.5), // Just to offset? No delay in parallel just extends duration.
            // Parallel children start at 0.
            // We need to use sequence inside parallel to offset B.
        ])

        const complexNode = a.parallel([
            a.ani({ to: { translateX: 200 }, duration: 2 }), // 0-2s
            a.sequence([
                a.delay(0.5),
                a.ani({ to: { translateY: 100 }, duration: 1 }), // 0.5-1.5s
            ]),
        ])
        const initialFrom = { translateX: 0, translateY: 0 }

        const keyframes = compileToKeyframes(complexNode, initialFrom)

        // Critical points:
        // 0 (start of all)
        // 0.5 (start of y)
        // 1.5 (end of y)
        // 2.0 (end of x)

        // Total duration: 2.0.

        // Expect 4 keyframes.
        expect(keyframes).toHaveLength(4)

        // t=0 (offset 0)
        expect(keyframes[0]!.offset).toBe(0)
        expect(keyframes[0]!['transform']).toContain('translateX(0px)')
        expect(keyframes[0]!['transform']).toContain('translateY(0px)')

        // t=0.5 (offset 0.25)
        // x should be interpolated (linear). 0->200 in 2s. At 0.5s -> 50.
        // y is 0.
        expect(keyframes[1]!.offset).toBe(0.25)
        expect(keyframes[1]!['transform']).toContain('translateX(50px)')
        expect(keyframes[1]!['transform']).toContain('translateY(0px)')

        // t=1.5 (offset 0.75)
        // x at 1.5s -> 150.
        // y at 1.5s -> 100 (finished).
        expect(keyframes[2]!.offset).toBe(0.75)
        expect(keyframes[2]!['transform']).toContain('translateX(150px)')
        expect(keyframes[2]!['transform']).toContain('translateY(100px)')

        // t=2.0 (offset 1.0)
        // x -> 200.
        // y -> 100 (remains).
        expect(keyframes[3]!.offset).toBe(1)
        expect(keyframes[3]!['transform']).toContain('translateX(200px)')
        expect(keyframes[3]!['transform']).toContain('translateY(100px)')
    })

    it('should extract bezier easing', () => {
        const node = a.ani({
            to: { translateX: 100 },
            duration: 1,
            timing: a.timing.bezier({
                p2: { x: 0.4, y: 0 },
                p3: { x: 0.2, y: 1 },
            }),
        })

        const keyframes = compileToKeyframes(node, { translateX: 0 })
        expect(keyframes).toHaveLength(2)
        // CSS bezier: cubic-bezier(x1, y1, x2, y2)
        // Our p2 is x1,y1. p3 is x2,y2.
        expect(keyframes[0]!.easing).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
    })

    it('should compile a stagger block', () => {
        const node = a.stagger(
            [
                a.ani({ to: { translateX: 100 }, duration: 1 }),
                a.ani({ to: { translateX: 200 }, duration: 1 }),
            ],
            { offset: 0.5 }
        )
        const initialFrom = { translateX: 0 }

        const keyframes = compileToKeyframes(node, initialFrom)

        // Stagger offset 0.5.
        // Item 1: 0-1s. x -> 100.
        // Item 2: 0.5-1.5s. x -> 200. (Starts from x=50?)

        // Critical points:
        // 0, 0.5, 1.0, 1.5. Total 1.5.

        expect(keyframes).toHaveLength(4)

        // t=0
        expect(keyframes[0]!.offset).toBe(0)
        expect(keyframes[0]!['transform']).toBe('translateX(0px)')

        // t=0.5 (Item 1 is at 50%. Item 2 starts)
        // x = 50.
        expect(keyframes[1]!.offset).toBeCloseTo(0.5 / 1.5)
        expect(keyframes[1]!['transform']).toBe('translateX(50px)')

        expect(keyframes[2]!.offset).toBeCloseTo(1.0 / 1.5)
        expect(keyframes[2]!['transform']).toBe('translateX(150px)')

        // t=1.5.
        // Item 1 finished (100).
        // Item 2 finished (200).
        expect(keyframes[3]!.offset).toBe(1)
        expect(keyframes[3]!['transform']).toBe('translateX(200px)')
    })

    it('should compile a loop block', () => {
        // Loop a 1s animation 3 times. Total duration = 3s.
        const node = a.loop(a.ani({ to: { translateX: 100 }, duration: 1 }), 3)
        const initialFrom = { translateX: 0 }

        const keyframes = compileToKeyframes(node, initialFrom)

        expect(keyframes).toHaveLength(4) // 0, 1, 2, 3

        // t=0 (start)
        expect(keyframes[0]!.offset).toBe(0)
        expect(keyframes[0]!['transform']).toBe('translateX(0px)')

        // t=1 (end of loop 1)
        expect(keyframes[1]!.offset).toBeCloseTo(1 / 3)
        expect(keyframes[1]!['transform']).toBe('translateX(100px)')

        // t=2 (end of loop 2)

        // Let's test with a reset sequence inside loop for clarity.
        const pingPong = a.loop(
            a.sequence([
                a.ani({ to: { translateX: 100 }, duration: 0.5 }),
                a.ani({ to: { translateX: 0 }, duration: 0.5 }),
            ]),
            2
        )
        // Total duration 2s.
        // 0 -> 100 (0.5s)
        // 100 -> 0 (1.0s)
        // 0 -> 100 (1.5s)
        // 100 -> 0 (2.0s)

        const pingPongKeyframes = compileToKeyframes(pingPong, {
            translateX: 0,
        })

        expect(pingPongKeyframes).toHaveLength(5) // 0, 0.5, 1, 1.5, 2

        expect(pingPongKeyframes[0]!.offset).toBe(0)
        expect(pingPongKeyframes[0]!['transform']).toBe('translateX(0px)')

        expect(pingPongKeyframes[1]!.offset).toBe(0.25)
        expect(pingPongKeyframes[1]!['transform']).toBe('translateX(100px)')

        expect(pingPongKeyframes[2]!.offset).toBe(0.5)
        expect(pingPongKeyframes[2]!['transform']).toBe('translateX(0px)')

        expect(pingPongKeyframes[3]!.offset).toBe(0.75)
        expect(pingPongKeyframes[3]!['transform']).toBe('translateX(100px)')

        expect(pingPongKeyframes[4]!.offset).toBe(1)
        expect(pingPongKeyframes[4]!['transform']).toBe('translateX(0px)')
    })

    it('should compile a delay node', () => {
        const node = a.sequence([
            a.ani({ to: { translateX: 100 }, duration: 1 }),
            a.delay(1), // Hold for 1s
            a.ani({ to: { translateX: 200 }, duration: 1 }),
        ])

        const keyframes = compileToKeyframes(node, { translateX: 0 })

        // Total 3s.
        // 0-1: 0->100
        // 1-2: 100 (hold)
        // 2-3: 100->200

        expect(keyframes).toHaveLength(4) // 0, 1, 2, 3

        // t=1 (offset 0.33)
        expect(keyframes[1]!.offset).toBeCloseTo(1 / 3)
        expect(keyframes[1]!['transform']).toBe('translateX(100px)')

        // t=2 (offset 0.66) - should still be 100
        expect(keyframes[2]!.offset).toBeCloseTo(2 / 3)
        expect(keyframes[2]!['transform']).toBe('translateX(100px)')

        // t=3 (offset 1)
        expect(keyframes[3]!.offset).toBe(1)
        expect(keyframes[3]!['transform']).toBe('translateX(200px)')
    })

    it('should sample spring animations', () => {
        const node = a.ani({
            to: { translateX: 100 },
            duration: 1,
            timing: a.timing.spring({ m: 1, k: 100, c: 10 })
        })
        
        const keyframes = compileToKeyframes(node, { translateX: 0 })
        
        // Should be many keyframes due to sampling (60fps)
        expect(keyframes.length).toBeGreaterThan(10)
        
        // Verify start and end
        expect(keyframes[0]!.offset).toBe(0)
        expect(keyframes[0]!['transform']).toBe('translateX(0px)')
        
        const last = keyframes[keyframes.length - 1]!
        expect(last.offset).toBe(1)
        expect(last['transform']).toBe('translateX(100px)')
        
        // Verify easing is linear for sampled frames
        expect(keyframes[5]!.easing).toBe('linear')
    })
})
