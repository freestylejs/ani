import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnimationClock } from '~/loop/clock'
import { type AnimationNode, ani, parallel, sequence, stagger } from '~/nodes'
import { T, type TimingFunction } from '~/timing'
import { rafTimeline } from '../timeline'

// A simple linear timing function for predictable tests
const linear: TimingFunction = T.linear()

// Mock the AnimationClock to have manual control over time
vi.mock('~/loop/clock', () => {
    const subscribers = new Set<{ update: (dt: number) => void }>()
    return {
        AnimationClock: {
            create: () => ({
                subscribe: (sub: any) => subscribers.add(sub),
                unsubscribe: (sub: any) => subscribers.delete(sub),
                // Manual tick function for tests
                tick: (dt: number) => {
                    for (const sub of subscribers) {
                        sub.update(dt)
                    }
                },
            }),
        },
    }
})

describe('Timeline Controller', () => {
    let clock: any

    beforeEach(() => {
        vi.clearAllMocks()
        // Reset the mock clock before each test
        const MockClock = AnimationClock.create()
        clock = MockClock
    })

    it('should correctly calculate total duration upon creation', () => {
        const root = sequence([
            ani({ to: [1], duration: 1, timing: linear }),
            parallel([
                ani({ to: [1], duration: 2, timing: linear }),
                ani({ to: [1], duration: 1, timing: linear }),
            ]),
        ])
        const line = rafTimeline(root)
        // 1 (sequence) + 2 (longest in parallel) = 3
        expect(line.duration).toBe(3)
    })

    it('should play a simple sequence animation', () => {
        const root = sequence([
            ani({ to: [100], duration: 1, timing: linear }),
            ani({ to: [200], duration: 1, timing: linear }),
        ])
        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)

        line.play({ from: [0] })
        expect(onUpdate).toHaveBeenCalledWith({
            state: [0],
            status: 'PLAYING',
        })

        clock.tick(0.5) // Halfway through first segment
        expect(onUpdate).toHaveBeenCalledWith({
            state: [50],
            status: 'PLAYING',
        })

        clock.tick(0.5) // End of first segment
        expect(onUpdate).toHaveBeenCalledWith({
            state: [100],
            status: 'PLAYING',
        })

        clock.tick(1) // End of second segment
        expect(onUpdate).toHaveBeenCalledWith({
            state: [200],
            status: 'PLAYING',
        })
    })

    it('should handle parallel animations with last-write-wins precedence', () => {
        const root = parallel([
            // race conflicts -> x/y removed
            ani({ to: { x: 100, y: 50 }, duration: 1, timing: linear }),
            ani({ to: { y: 100 }, duration: 1, timing: linear }),

            // race conflict -> last-write wins
            ani({ to: { x: 200 }, duration: 1, timing: linear }),
        ])

        // >> x = 200 / y = 100 wins
        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate((a) => {
            onUpdate(a)
        })

        line.play({ from: { x: 0, y: 0 } })
        expect(onUpdate).toHaveBeenCalledWith({
            state: { x: 0, y: 0 },
            status: 'PLAYING',
        })

        clock.tick(0.5)
        expect(onUpdate).toHaveBeenCalledWith({
            state: { x: 100, y: 50 },
            status: 'PLAYING',
        })

        clock.tick(0.5)
        expect(onUpdate).toHaveBeenCalledWith({
            state: { x: 200, y: 100 },
            status: 'PLAYING',
        })
    })

    it('should correctly capture from state in a stagger', () => {
        const root = stagger(
            [
                ani({ to: [100], duration: 1, timing: linear }), // 0s -> 1s
                ani({ to: [200], duration: 1, timing: linear }), // 0.75s -> 1.75s
            ],
            0.75
        )
        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate((arg) => {
            onUpdate(arg)
        })

        line.play({ from: [0] })

        clock.tick(0.25)
        expect(onUpdate).toHaveBeenCalledWith({
            state: [25],
            status: 'PLAYING',
        })

        clock.tick(0.25)
        expect(onUpdate).toHaveBeenCalledWith({
            state: [50],
            status: 'PLAYING',
        })

        clock.tick(0.25)
        expect(onUpdate).toHaveBeenCalledWith({
            state: [75],
            status: 'PLAYING',
        })

        clock.tick(0.25) // 1s -> curr = 100 -> 100 + (200-100) * 0.25s = 125
        expect(onUpdate).toHaveBeenCalledWith({
            state: [125],
            status: 'PLAYING',
        })
    })

    it('should pause and resume correctly', () => {
        const root = ani({ to: [100], duration: 2, timing: linear })
        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)

        line.play({ from: [0] })
        clock.tick(0.5)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [25],
            status: 'PLAYING',
        })

        line.pause()
        clock.tick(1) // Time passes, but animation is paused
        expect(onUpdate).toHaveBeenCalledTimes(2) // play() + first tick

        line.resume()
        clock.tick(0.5) // Animation continues
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [50],
            status: 'PLAYING',
        })
    })

    it('should seek to a position correctly', () => {
        const root = sequence([
            ani({ to: [100], duration: 1, timing: linear }),
            ani({ to: [0], duration: 1, timing: linear }),
        ])
        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)

        line.play({ from: [0] }) // Must play once to set initial state

        line.seek(1.5)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [50],
            status: 'PAUSED',
        })

        line.seek(0.5)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [50],
            status: 'PAUSED',
        })

        line.seek(2)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [0],
            status: 'PAUSED',
        })
    })

    it('should resume correctly after a seek', () => {
        const root = ani({ to: [100], duration: 2, timing: linear })
        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)

        line.play({ from: [0] })
        line.seek(1)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [50],
            status: 'PAUSED',
        })

        line.resume()
        clock.tick(0.5) // Advance time by 0.5s from the 1s mark
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [75],
            status: 'PLAYING',
        })
    })

    it('should handle zero-duration segments correctly', () => {
        const root = sequence([
            ani({ to: { y: 0 }, duration: 1, timing: linear }),
            ani({ to: { y: 200 }, duration: 0, timing: linear }), // Jumps instantly
            ani({ to: { y: 200 }, duration: 1, timing: linear }),
        ])
        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate((a) => {
            onUpdate(a)
        })

        expect(line.duration).toBe(2)

        line.play({ from: { y: 0 } })
        expect(onUpdate).toHaveBeenCalledWith({
            state: { y: 0 },
            status: 'PLAYING',
        })

        clock.tick(1.0)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: { y: 200 },
            status: 'PLAYING',
        })

        clock.tick(0.5)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: { y: 200 },
            status: 'PLAYING',
        })
    })

    it('should resolve property conflicts in parallel nodes using last-write-wins', () => {
        const root = parallel([
            ani({
                to: { x: 100, y: 100, z: 0 },
                duration: 1,
                timing: linear,
            }),
            ani({ to: { y: 200, z: 200 }, duration: 1, timing: linear }),
            ani({ to: { z: 300 }, duration: 1, timing: linear }),
        ])

        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)

        line.play({ from: { x: 0, y: 0, z: 0 } })

        clock.tick(1)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: { x: 100, y: 200, z: 300 },
            status: 'ENDED',
        })
    })

    it('should propagate state correctly through a sequence of parallel blocks', () => {
        const root = sequence([
            parallel([
                ani({
                    to: { x: 100, y: 200 },
                    duration: 1,
                    timing: linear,
                }),
                ani({ to: { y: 200 }, duration: 1, timing: linear }),
            ]),
            parallel([
                ani({ to: { x: 0, y: 100 }, duration: 1, timing: linear }),
                ani({ to: { y: 100 }, duration: 1, timing: linear }),
            ]),
        ])
        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)

        line.play({ from: { x: 0, y: 0 } })
        expect(line.duration).toBe(2)

        clock.tick(1)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: { x: 100, y: 200 },
            status: 'PLAYING',
        })

        clock.tick(0.5)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: { x: 50, y: 150 },
            status: 'PLAYING',
        })
    })

    it('should seek and resume correctly in a complex nested timeline', () => {
        const root: AnimationNode<{ a: number; b: number }> = sequence([
            stagger(
                [
                    ani({
                        to: { a: 10, b: 0 },
                        duration: 0.5,
                        timing: linear,
                    }),
                    ani({ to: { b: 20 }, duration: 0.5, timing: linear }),
                ],
                0.2
            ),
            parallel([
                ani({ to: { a: 0, b: 0 }, duration: 1, timing: linear }),
                ani({ to: { b: 0 }, duration: 1, timing: linear }),
            ]),
        ])
        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)

        expect(line.duration).toBeCloseTo(1.7)

        line.play({ from: { a: 0, b: 0 } })
        line.seek(1.25)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: { a: 4.5, b: 9 },
            status: 'PAUSED',
        })

        line.resume()
        clock.tick(0.25) // t=1.5
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: { a: 2, b: 4 },
            status: 'PLAYING',
        })
    })

    it('should handle empty composition nodes gracefully', () => {
        const root = sequence([
            ani({ to: [100], duration: 1, timing: linear }),
            parallel([]),
            stagger([], 0.1),
            sequence([]),
            ani({ to: [200], duration: 1, timing: linear }),
        ])
        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)

        expect(line.duration).toBe(2)

        line.play({ from: [0] })
        clock.tick(1)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [100],
            status: 'PLAYING',
        })
        clock.tick(1)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [200],
            status: 'ENDED',
        })
    })

    it('should reset and play again with a different from state', () => {
        const root = ani({ to: [100], duration: 1, timing: linear })
        const line = rafTimeline(root, clock)
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)

        line.play({ from: [0] })
        clock.tick(0.5)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [50],
            status: 'PLAYING',
        })
        line.pause()

        line.play({ from: [1000] })
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [1000],
            status: 'PLAYING',
        })
        clock.tick(0.5)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [550],
            status: 'PLAYING',
        })
    })

    it('should not have transitionTo method for non-state nodes', () => {
        const root = ani({ to: { x: 1 }, duration: 1 })
        const line = rafTimeline(root, clock)
        // @ts-expect-error transitionTo should not exist
        expect(line.transitionTo).toBeUndefined()
    })

    describe('`ENDED` state behavior', () => {
        it('should have status "ENDED" and hold the final state upon completion', () => {
            const root = ani({ to: [100], duration: 1, timing: linear })
            const line = rafTimeline(root, clock)
            const onUpdate = vi.fn()
            line.onUpdate(onUpdate)

            line.play({ from: [0] })
            clock.tick(1)

            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [100],
                status: 'ENDED',
            })

            // Further ticks should not trigger updates
            const callCount = onUpdate.mock.calls.length
            clock.tick(1)
            expect(onUpdate).toHaveBeenCalledTimes(callCount)
        })

        it('should return the final state via getCurrentValue() after ending', () => {
            const root = ani({ to: { x: 50 }, duration: 1, timing: linear })
            const line = rafTimeline(root, clock)

            expect(line.getCurrentValue()).toBeNull()

            line.play({ from: { x: 0 } })
            clock.tick(1)

            expect(line.getCurrentValue()).toEqual({ x: 50 })
        })

        it('should allow seeking after the timeline has ended', () => {
            const root = ani({ to: [100], duration: 1, timing: linear })
            const line = rafTimeline(root, clock)
            const onUpdate = vi.fn()
            line.onUpdate(onUpdate)

            line.play({ from: [0] })
            clock.tick(1)
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [100],
                status: 'ENDED',
            })

            line.seek(0.5)
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [50],
                status: 'PAUSED',
            })
        })

        it('should allow playing a new animation after the previous one has ended', () => {
            const root = ani({ to: [100], duration: 1, timing: linear })
            const line = rafTimeline(root, clock)
            const onUpdate = vi.fn()
            line.onUpdate(onUpdate)

            // First run
            line.play({ from: [0] })
            clock.tick(1)
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [100],
                status: 'ENDED',
            })

            // Second run
            line.play({ from: [500] })
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [500],
                status: 'PLAYING',
            })

            clock.tick(0.5)
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [300], // 500 + (100 - 500) * 0.5
                status: 'PLAYING',
            })
        })
    })

    describe('Dynamic Keyframes', () => {
        it('should override default `to` values when keyframes are provided', () => {
            const root = sequence([
                ani({ to: { x: 100 }, duration: 1, timing: linear }),
                ani({ to: { x: 200 }, duration: 1, timing: linear }),
            ])
            const line = rafTimeline(root, clock)
            const onUpdate = vi.fn()
            line.onUpdate(onUpdate)

            line.play({
                from: { x: 0 },
                keyframes: [{ x: 1000 }, { x: 2000 }],
            })

            clock.tick(1)
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: { x: 1000 },
                status: 'PLAYING',
            })

            clock.tick(1)
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: { x: 2000 },
                status: 'ENDED',
            })
        })

        it('should throw an error if the number of keyframes does not match the number of segments', () => {
            const root = sequence([
                ani({ to: { x: 100 }, duration: 1 }),
                ani({ to: { x: 200 }, duration: 1 }),
            ])
            const line = rafTimeline(root, clock)

            const playWithWrongKeyframes = () => {
                line.play({
                    from: { x: 0 },
                    keyframes: [{ x: 1000 }],
                })
            }

            expect(playWithWrongKeyframes).toThrow(
                '[Timeline] Keyframe mismatch: Expected 2, received 1.'
            )
        })
    })

    describe('Delay Behavior', () => {
        it('should delay the start of the animation', () => {
            const root = ani({ to: [100], duration: 1, timing: linear })
            const line = rafTimeline(root, clock)
            const onUpdate = vi.fn()
            line.onUpdate(onUpdate)

            line.play({ from: [0], delay: 0.5 * 1e3 })

            // Initial state should be set immediately
            expect(onUpdate).toHaveBeenCalledWith({
                state: [0],
                status: 'PLAYING',
            })

            // During the delay, state should not change
            clock.tick(0.25)
            expect(onUpdate).toHaveBeenCalledTimes(1) // No new updates

            clock.tick(0.25) // Delay finishes
            expect(onUpdate).toHaveBeenCalledTimes(1)

            // After delay, animation starts
            clock.tick(0.5) // Halfway through animation
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [50],
                status: 'PLAYING',
            })

            clock.tick(0.5) // Animation finishes
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [100],
                status: 'ENDED',
            })
        })

        it('should handle a delay of zero correctly', () => {
            const root = ani({ to: [100], duration: 1, timing: linear })
            const line = rafTimeline(root, clock)
            const onUpdate = vi.fn()
            line.onUpdate(onUpdate)

            line.play({ from: [0], delay: 0 * 1e3 }), clock.tick(0.5)
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [50],
                status: 'PLAYING',
            })
        })

        it('should pause and resume during the delay period', () => {
            const root = ani({ to: [100], duration: 1, timing: linear })
            const line = rafTimeline(root, clock)
            const onUpdate = vi.fn()
            line.onUpdate(onUpdate)

            line.play({ from: [0], delay: 1 * 1e3 })

            clock.tick(0.5) // Halfway through delay
            line.pause()

            // Tick while paused, nothing should happen
            const callCount = onUpdate.mock.calls.length
            clock.tick(1)
            expect(onUpdate).toHaveBeenCalledTimes(callCount)

            line.resume()
            clock.tick(0.25) // Tick for half of the remaining delay
            expect(onUpdate).toHaveBeenCalledTimes(callCount) // Still in delay

            clock.tick(0.25) // Remaining delay finishes
            clock.tick(0.5) // Animation is halfway
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [50],
                status: 'PLAYING',
            })
        })

        it('should reset correctly during the delay period', () => {
            const root = ani({ to: [100], duration: 1, timing: linear })
            const line = rafTimeline(root, clock)
            const onUpdate = vi.fn()
            line.onUpdate(onUpdate)

            line.play({ from: [0], delay: 1 * 1e3 })
            clock.tick(0.5)

            line.reset()
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [],
                status: 'IDLE',
            })

            // Ensure clock subscription is removed
            const callCount = onUpdate.mock.calls.length
            clock.tick(1)
            expect(onUpdate).toHaveBeenCalledTimes(callCount)
        })

        it('should bypass the delay when seeking', () => {
            const root = ani({ to: [100], duration: 1, timing: linear })
            const line = rafTimeline(root, clock)
            const onUpdate = vi.fn()
            line.onUpdate(onUpdate)

            line.play({ from: [0], delay: 1 * 1e3 })
            line.seek(0.5)

            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [50],
                status: 'PAUSED',
            })
        })

        it('should only apply the delay on the first run, not on repetitions', () => {
            const root = ani({ to: [100], duration: 1, timing: linear })
            const line = rafTimeline(root, clock)
            const onUpdate = vi.fn()
            line.onUpdate(onUpdate)

            line.play({ from: [0], delay: 0.5 * 1e3, repeat: 1 })

            // Initial delay
            clock.tick(0.5)

            // First run
            clock.tick(1)
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [100],
                status: 'PLAYING',
            })

            line.play({
                from: [0],
                delay: 0 * 1e3,
            })
            expect(onUpdate).toHaveBeenCalledTimes(3) // tick(0.5) + tick(1) + play()
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [0],
                status: 'PLAYING',
            })

            clock.tick(0.5)
            expect(onUpdate).toHaveBeenLastCalledWith({
                state: [50],
                status: 'PLAYING',
            })
        })
    })
})
