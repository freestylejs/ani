'use client'

import { a } from '@freestylejs/ani-core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { rand } from '@/lib/math/rand'
import { useAppear } from './timeline'

interface Location {
    top: number
    left: number
    size: number
}

const randomColor = (): `rgba(${number},${number},${number},${number})` => {
    const randHex = () => Math.floor(rand([0, 255]))
    return `rgba(${randHex()},${randHex()},${randHex()},1)`
}

const randLoc = (config: {
    top: [number, number]
    left: [number, number]
    size: [number, number]
}): Location => {
    return {
        top: rand(config.top),
        left: rand(config.left),
        size: rand(config.size),
    }
}

const CreateRandKeyframe = () => {
    return {
        scale: rand([0.5, 1.5]),
        rotate: rand([0, 10]),
        borderRadius: rand([0, 20]),
        translateX: rand([-100, 100]),
        skewX: rand([0, 10]),
    }
}

export const ParallelDemo = ({
    parallelCount = 5,
}: {
    parallelCount?: number
}) => {
    const refs = Array.from({ length: parallelCount }).map(() =>
        useRef<HTMLDivElement>(null)
    )

    const parallelTimelines = useMemo(() => {
        return refs.map(() =>
            a.timeline(
                a.parallel([
                    a.sequence(
                        [
                            a.ani({ to: { scale: 1.5 }, duration: 0.5 }),
                            a.ani({ to: { scale: 1 }, duration: 0.5 }),
                        ],
                        a.timing.spring({ m: 1, k: 200, c: 15 })
                    ),
                    a.sequence(
                        [
                            a.ani({ to: { rotate: 180 }, duration: 0.5 }),
                            a.ani({ to: { rotate: 360 }, duration: 0.5 }),
                        ],
                        a.timing.spring({ m: 1, k: 200, c: 15 })
                    ),
                    a.sequence(
                        [
                            a.ani({
                                to: { borderRadius: 50 },
                                duration: 0.5,
                            }),
                            a.ani({
                                to: { borderRadius: 10 },
                                duration: 0.5,
                            }),
                        ],
                        a.timing.spring({ m: 1, k: 250, c: 15 })
                    ),
                    a.sequence(
                        [
                            a.ani({
                                to: { skewX: -20 },
                                duration: 0.5,
                            }),
                            a.ani({ to: { skewX: 0 }, duration: 1 }),
                        ],
                        a.timing.spring({ m: 1, k: 250, c: 25 })
                    ),
                    a.sequence(
                        [
                            a.ani({
                                to: { translateX: -50 },
                                duration: 1,
                            }),
                            a.ani({ to: { translateX: +50 }, duration: 1 }),
                        ],
                        a.timing.spring({ m: 1, k: 250, c: 25 })
                    ),
                ])
            )
        )
    }, [])

    const [locations, setLocations] = useState<Location[]>([])
    const [colors, setColors] = useState<string[]>([])

    const containerRef = useRef<HTMLDivElement>(null)

    useAppear(containerRef)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const { offsetWidth, offsetHeight } = container
        const newLocations = Array.from({ length: parallelCount }).map(() =>
            randLoc({
                left: [0, offsetWidth],
                top: [0, offsetHeight],
                size: [35, 75],
            })
        )
        const newColors = Array.from({ length: parallelCount }).map(() =>
            randomColor()
        )

        setLocations(newLocations)
        setColors(newColors)
    }, [parallelCount])

    return (
        <div ref={containerRef} className="relative size-full">
            {locations.length > 0 &&
                colors.length > 0 &&
                locations.map((loc, i) => {
                    const { size, left, top } = loc
                    const color = colors[i]
                    const ref = refs[i]

                    return (
                        <div
                            onPointerDown={() => {
                                if (!ref.current) return
                                parallelTimelines[i].play(ref.current, {
                                    from: CreateRandKeyframe(),
                                    repeat: Infinity,
                                })
                            }}
                            key={i}
                            ref={ref}
                            style={{
                                top: `${top}px`,
                                left: `${left}px`,
                                width: size,
                                height: size,
                                backgroundColor: color,
                            }}
                            className="absolute cursor-pointer rounded-lg brightness-100 transition-[filter] hover:brightness-75"
                        />
                    )
                })}
        </div>
    )
}

export const parallelCode = `
const ParallelDemo = ({
    parallelCount = 5,
}: {
    parallelCount?: number
}) => {
    const refs = Array.from({ length: parallelCount }).map(() =>
        useRef<HTMLDivElement>(null)
    )

    const [locations, setLocations] = useState<Location[]>([])
    const [colors, setColors] = useState<string[]>([])

    const containerRef = useRef<HTMLDivElement>(null)

    const parallelTimelines = useMemo(() => {
        return refs.map(() =>
            a.timeline(
                a.parallel([
                    a.sequence(
                        [
                            a.ani({ to: { scale: 1.5 }, duration: 0.5 }),
                            a.ani({ to: { scale: 1 }, duration: 0.5 }),
                        ],
                        a.timing.spring({ m: 1, k: 200, c: 15 })
                    ),
                    a.sequence(
                        [
                            a.ani({ to: { rotate: 180 }, duration: 0.5 }),
                            a.ani({ to: { rotate: 360 }, duration: 0.5 }),
                        ],
                        a.timing.spring({ m: 1, k: 200, c: 15 })
                    ),
                    a.sequence(
                        [
                            a.ani({
                                to: { borderRadius: 50 },
                                duration: 0.5,
                            }),
                            a.ani({
                                to: { borderRadius: 10 },
                                duration: 0.5,
                            }),
                        ],
                        a.timing.spring({ m: 1, k: 250, c: 15 })
                    ),
                    a.sequence(
                        [
                            a.ani({
                                to: { skewX: -20 },
                                duration: 0.5,
                            }),
                            a.ani({ to: { skewX: 0 }, duration: 1 }),
                        ],
                        a.timing.spring({ m: 1, k: 250, c: 25 })
                    ),
                    a.sequence(
                        [
                            a.ani({
                                to: { translateX: -50 },
                                duration: 1,
                            }),
                            a.ani({ to: { translateX: +50 }, duration: 1 }),
                        ],
                        a.timing.spring({ m: 1, k: 250, c: 25 })
                    ),
                ])
            )
        )
    }, [])

    const CreateRandKeyframe = () => {
        return {
            scale: rand([0, 1]),
            rotate: rand([0, 10]),
            borderRadius: rand([0, 20]),
            translateX: rand([1, 0]),
            skewX: rand([0, 10]),
        }
    }

    refs.map((ref, i) =>
        useAniRef(ref, {
            timeline: parallelTimelines[i],
            events: {
                onPointerdown: (ctx, e) => {
                    ctx.play({
                        from: CreateRandKeyframe(),
                        repeat: 2,
                    })
                },
            },
        })
    )

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const { offsetWidth, offsetHeight } = container
        const newLocations = Array.from({ length: parallelCount }).map(() =>
            randLoc({
                left: [0, offsetWidth],
                top: [0, offsetHeight],
                size: [35, 75],
            })
        )
        const newColors = Array.from({ length: parallelCount }).map(() =>
            randomColor()
        )

        setLocations(newLocations)
        setColors(newColors)
    }, [parallelCount])

    return (
        <div ref={containerRef} className="relative size-full">
            {locations.length > 0 &&
                colors.length > 0 &&
                locations.map((loc, i) => {
                    const { size, left, top } = loc
                    const color = colors[i]
                    const ref = refs[i]

                    return (
                        <div
                            key={i}
                            ref={ref}
                            className="absolute"
                            style={{
                                top: \`\${top}px\`,
                                left: \`\${left}px\`,
                                width: size,
                                height: size,
                                backgroundColor: color,
                            }}
                        />
                    )
                })}
        </div>
    )
}`
