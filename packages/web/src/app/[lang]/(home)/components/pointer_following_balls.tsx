'use client'
import { a } from '@freestylejs/ani-core'
import { useAniRef, useTimeline } from '@freestylejs/ani-react'
import { useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

const BALL_SIZE = 25
const THROTTLE_DELAY = 32

const colors = ['#4285F4', '#DB4437', '#F4B400', '#0F9D58', '#4285F4']

type BallTimeline = ReturnType<typeof createBallTimeline>

const createBallTimeline = () =>
    a.rafTimeline(
        a.ani({
            to: { translateX: 0, translateY: 0, scale: 1 },
            duration: 200,
            timing: {
                translateX: a.timing.dynamicSpring({
                    m: 2,
                    k: 100,
                    c: 12,
                }),
                translateY: a.timing.dynamicSpring({
                    m: 2,
                    k: 100,
                    c: 12,
                }),
                scale: a.timing.dynamicSpring({
                    m: 1,
                    k: 100,
                    c: 15,
                }),
            },
        })
    )

const Ball = ({
    timeline,
    color,
}: {
    timeline: BallTimeline
    color: string
}) => {
    const { ref } = useAniRef(timeline)

    return (
        <div
            ref={ref}
            className="absolute rounded-full"
            style={{
                width: BALL_SIZE,
                height: BALL_SIZE,
                backgroundColor: color,
                left: -BALL_SIZE / 2,
                top: -BALL_SIZE / 2,
            }}
        />
    )
}

export const PointerFollowingBalls = ({
    ballCount,
    className,
}: {
    ballCount: number
    className?: string
}) => {
    const containerRef = useRef<HTMLDivElement>(null)

    const timelines = useTimeline(() => {
        const items = Array.from({ length: ballCount }, createBallTimeline)
        return {
            items,
            dispose: () => items.forEach((item) => item.dispose()),
        }
    }, [ballCount]).items

    const throttleTimeout = useRef<NodeJS.Timeout | null>(null)
    const latestEventRef = useRef<React.MouseEvent<HTMLDivElement> | null>(null)

    const updatePositions = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()

            const x = e.clientX - rect.left
            const y = e.clientY - rect.top

            const numItems = timelines.length
            const size = Math.ceil(Math.sqrt(numItems))

            const spacing = BALL_SIZE * 1.25
            const offset = ((size - 1) * spacing) / 2

            timelines.forEach((timeline, i) => {
                const curr = timeline.value ?? {
                    translateX: 0,
                    translateY: 0,
                    scale: 1,
                }

                const col = i % size
                const row = Math.floor(i / size)
                const targetX = x + col * spacing - offset
                const targetY = y + row * spacing - offset

                timeline.play({
                    from: curr,
                    delay: i,
                    keyframes: [
                        { translateX: targetX, translateY: targetY, scale: 1 },
                    ],
                })
            })
        },
        [timelines] // Dependencies for the callback
    )

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        // Store the latest event in the ref
        latestEventRef.current = e
        if (throttleTimeout.current) {
            return
        }

        throttleTimeout.current = setTimeout(() => {
            if (latestEventRef.current) {
                updatePositions(latestEventRef.current)
                latestEventRef.current = null
            }
            throttleTimeout.current = null
        }, THROTTLE_DELAY)
    }

    const handlePointerDown = () => {
        timelines.forEach((timeline) => {
            const curr = timeline.value ?? {
                translateX: 0,
                translateY: 0,
                scale: 1,
            }

            timeline.play({
                from: curr,
                keyframes: [{ ...curr, scale: 0.5 }],
            })
        })
    }

    return (
        <div
            ref={containerRef}
            onPointerMove={handleMouseMove}
            onPointerDown={handlePointerDown}
            className={cn(
                className,
                'glass-3 group relative h-full min-h-52 w-full cursor-pointer rounded-xl border border-transparent border-dashed transition-colors duration-200 hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-800 hover:dark:bg-transparent'
            )}
        >
            <div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 text-center text-gray-500 opacity-100 transition-opacity duration-300 group-hover:opacity-50 dark:text-gray-400">
                <p className="font-semibold text-lg">Move your mouse</p>
                <p>The balls will follow you.</p>
            </div>

            {timelines.map((timeline, i) => (
                <Ball
                    key={i}
                    timeline={timeline}
                    color={colors[i % colors.length]}
                />
            ))}
        </div>
    )
}

export const pointerFollowingCode = `
const createBallTimeline = () =>
    a.rafTimeline(
        a.ani({
            to: { translateX: 0, translateY: 0, scale: 1 },
            duration: 200,
            timing: {
                translateX: a.timing.dynamicSpring({
                    m: 2,
                    k: 100,
                    c: 12,
                }),
                translateY: a.timing.dynamicSpring({
                    m: 2,
                    k: 100,
                    c: 12,
                }),
                scale: a.timing.dynamicSpring({
                    m: 1,
                    k: 100,
                    c: 15,
                }),
            },
        })
    )

// One ref per ball: the timeline writes the element, React never renders per frame.
const Ball = ({ timeline, color }) => {
    const { ref } = useAniRef(timeline)

    return (
        <div
            ref={ref}
            className="absolute"
            style={{
                width: BALL_SIZE,
                height: BALL_SIZE,
                backgroundColor: color,
                left: -BALL_SIZE / 2,
                top: -BALL_SIZE / 2,
            }}
        />
    )
}

export const PointerFollowingBalls = () => {
    const containerRef = useRef<HTMLDivElement>(null)

    // The component owns the timelines and disposes them on unmount.
    const timelines = useTimeline(() => {
        const items = Array.from({ length: NUM_BALLS }, createBallTimeline)
        return {
            items,
            dispose: () => items.forEach((item) => item.dispose()),
        }
    }, [NUM_BALLS]).items

    const throttleTimeout = useRef<NodeJS.Timeout | null>(null)
    const latestEventRef = useRef<React.MouseEvent<HTMLDivElement> | null>(null)

    const updatePositions = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()

            const x = e.clientX - rect.left
            const y = e.clientY - rect.top

            const numItems = timelines.length
            const size = Math.ceil(Math.sqrt(numItems))

            const spacing = BALL_SIZE * 1.25
            const offset = ((size - 1) * spacing) / 2

            timelines.forEach((timeline, i) => {
                const curr = timeline.value ?? {
                    translateX: 0,
                    translateY: 0,
                    scale: 1,
                }

                const col = i % size
                const row = Math.floor(i / size)
                const targetX = x + col * spacing - offset
                const targetY = y + row * spacing - offset

                timeline.play({
                    from: curr,
                    delay: i,
                    keyframes: [
                        { translateX: targetX, translateY: targetY, scale: 1 },
                    ],
                })
            })
        },
        [timelines]
    )

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        // Store the latest event in the ref
        latestEventRef.current = e
        if (throttleTimeout.current) {
            return
        }

        throttleTimeout.current = setTimeout(() => {
            if (latestEventRef.current) {
                updatePositions(latestEventRef.current)
                latestEventRef.current = null
            }
            throttleTimeout.current = null
        }, THROTTLE_DELAY)
    }

    const handlePointerDown = () => {
        timelines.forEach((timeline) => {
            const curr = timeline.value ?? {
                translateX: 0,
                translateY: 0,
                scale: 1,
            }

            timeline.play({
                from: curr,
                keyframes: [{ ...curr, scale: 0.5 }],
            })
        })
    }

    return (
        <div
            ref={containerRef}
            onPointerMove={handleMouseMove}
            onPointerDown={handlePointerDown}
        >
            {timelines.map((timeline, i) => (
                <Ball
                    key={i}
                    timeline={timeline}
                    color={colors[i % colors.length]}
                />
            ))}
        </div>
    )
}
`
