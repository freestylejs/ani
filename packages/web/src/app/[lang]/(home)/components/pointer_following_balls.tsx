'use client'
import { a } from '@freestylejs/ani-core'
import { useAniRef } from '@freestylejs/ani-react'
import { useCallback, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'

const BALL_SIZE = 25
const THROTTLE_DELAY = 32

const colors = ['#4285F4', '#DB4437', '#F4B400', '#0F9D58', '#4285F4']

export const PointerFollowingBalls = ({
    ballCount,
    className,
}: {
    ballCount: number
    className?: string
}) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const ballRefs = Array.from({ length: ballCount }, () =>
        useRef<HTMLDivElement>(null)
    )

    const timelines = useMemo(() => {
        return Array.from({ length: ballCount }, (_, i) =>
            a.timeline(
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
        )
    }, [])

    const controllers = ballRefs.map((ref, i) =>
        useAniRef(ref, {
            timeline: timelines[i],
        })
    )

    const throttleTimeout = useRef<NodeJS.Timeout | null>(null)
    const latestEventRef = useRef<React.MouseEvent<HTMLDivElement> | null>(null)

    const updatePositions = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()

            const x = e.clientX - rect.left
            const y = e.clientY - rect.top

            const numItems = controllers.length
            const size = Math.ceil(Math.sqrt(numItems))

            const spacing = BALL_SIZE * 1.25
            const offset = ((size - 1) * spacing) / 2

            controllers.forEach((controller, i) => {
                const t = timelines[i]
                const curr = t.getCurrentValue() ?? {
                    translateX: 0,
                    translateY: 0,
                    scale: 1,
                }

                const col = i % size
                const row = Math.floor(i / size)
                const targetX = x + col * spacing - offset
                const targetY = y + row * spacing - offset

                controller.play({
                    from: curr,
                    delay: i,
                    keyframes: [
                        { translateX: targetX, translateY: targetY, scale: 1 },
                    ],
                })
            })
        },
        [controllers, timelines] // Dependencies for the callback
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
        controllers.forEach((controller, i) => {
            const t = timelines[i]
            const curr = t.getCurrentValue() ?? {
                translateX: 0,
                translateY: 0,
                scale: 1,
            }

            controller.play({
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

            {ballRefs.map((ref, i) => (
                <div
                    key={i}
                    ref={ref}
                    className="absolute rounded-full"
                    style={{
                        width: BALL_SIZE,
                        height: BALL_SIZE,
                        backgroundColor: colors[i % colors.length],
                        left: -BALL_SIZE / 2,
                        top: -BALL_SIZE / 2,
                    }}
                />
            ))}
        </div>
    )
}

export const pointerFollowingCode = `

export const PointerFollowingBalls = () => {
    const containerRef = useRef<HTMLDivElement>(null)
    const ballRefs = Array.from({ length: NUM_BALLS }, () =>
        useRef<HTMLDivElement>(null)
    )

    const timelines = useMemo(() => {
        return Array.from({ length: NUM_BALLS }, (_, i) =>
            a.timeline(
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
        )
    }, [])

    const controllers = ballRefs.map((ref, i) =>
        useAniRef(ref, {
            timeline: timelines[i],
        })
    )

    const throttleTimeout = useRef<NodeJS.Timeout | null>(null)
    const latestEventRef = useRef<React.MouseEvent<HTMLDivElement> | null>(null)

    const updatePositions = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()

            const x = e.clientX - rect.left
            const y = e.clientY - rect.top

            const numItems = controllers.length
            const size = Math.ceil(Math.sqrt(numItems))

            const spacing = BALL_SIZE * 1.25
            const offset = ((size - 1) * spacing) / 2

            controllers.forEach((controller, i) => {
                const t = timelines[i]
                const curr = t.getCurrentValue() ?? {
                    translateX: 0,
                    translateY: 0,
                    scale: 1,
                }

                const col = i % size
                const row = Math.floor(i / size)
                const targetX = x + col * spacing - offset
                const targetY = y + row * spacing - offset

                controller.play({
                    from: curr,
                    delay: i,
                    keyframes: [
                        { translateX: targetX, translateY: targetY, scale: 1 },
                    ],
                })
            })
        },
        [controllers, timelines]
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
        controllers.forEach((controller, i) => {
            const t = timelines[i]
            const curr = t.getCurrentValue() ?? {
                translateX: 0,
                translateY: 0,
                scale: 1,
            }

            controller.play({
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
            {ballRefs.map((ref, i) => (
                <div
                    key={i}
                    ref={ref}
                    className="absolute"
                    style={{
                        width: BALL_SIZE,
                        height: BALL_SIZE,
                        backgroundColor: colors[i % colors.length],
                        left: -BALL_SIZE / 2,
                        top: -BALL_SIZE / 2,
                    }}
                />
            ))}
        </div>
    )
}
`
