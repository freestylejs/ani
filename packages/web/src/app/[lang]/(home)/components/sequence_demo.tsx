'use client'

import { a } from '@freestylejs/ani-core'
import { useMemo, useRef } from 'react'
import { useAppear } from './timeline'

export const SequenceDemo = () => {
    const ref = useRef<HTMLDivElement>(null)

    useAppear(ref)

    const myTimeline = useMemo(() => {
        return a.timeline(
            a.sequence(
                [
                    a.ani({
                        to: {
                            translateX: 50,
                            translateY: 0,
                            rotate: 0,
                            borderRadius: 10,
                        },
                        duration: 0.5,
                    }),
                    a.ani({
                        to: {
                            translateX: 0,
                            translateY: 50,
                            rotate: -90,
                            borderRadius: 15,
                        },
                        duration: 0.5,
                    }),
                    a.ani({
                        to: {
                            translateX: -50,
                            translateY: 0,
                            rotate: -0,
                            borderRadius: 25,
                        },
                        duration: 0.5,
                    }),
                    a.ani({
                        to: {
                            translateX: 0,
                            translateY: -50,
                            rotate: +90,
                            borderRadius: 15,
                        },
                        duration: 0.5,
                    }),
                    a.ani({
                        to: {
                            translateX: 0,
                            translateY: 0,
                            rotate: 0,
                            borderRadius: 30,
                        },
                        duration: 0.5,
                    }),
                ],
                a.timing.spring({ m: 1, k: 120, c: 15 })
            )
        )
    }, [])

    return (
        <div className="flex size-full items-center justify-center">
            <div
                ref={ref}
                className="h-16 w-16 cursor-pointer rounded-lg bg-blue-500 opacity-100 transition-colors duration-200 hover:bg-blue-400"
                onClick={() => {
                    if (ref.current) {
                        myTimeline.play(ref.current, {
                            from: {
                                translateX: 0,
                                translateY: 0,
                                rotate: 0,
                                borderRadius: 10,
                            },
                            repeat: Infinity,
                        })
                    }
                }}
            />
        </div>
    )
}

export const sequenceCode = `
const SequenceDemo = () => {
    const ref = useRef<HTMLDivElement>(null)

    const myTimeline = useMemo(() => {
        return a.timeline(
            a.sequence(
                [
                    a.ani({
                        to: {
                            translateX: 50,
                            translateY: 0,
                            rotate: 0,
                            borderRadius: 10,
                        },
                        duration: 0.5,
                    }),
                    a.ani({
                        to: {
                            translateX: 0,
                            translateY: 50,
                            rotate: -90,
                            borderRadius: 15,
                        },
                        duration: 0.5,
                    }),
                    a.ani({
                        to: {
                            translateX: -50,
                            translateY: 0,
                            rotate: -0,
                            borderRadius: 25,
                        },
                        duration: 0.5,
                    }),
                    a.ani({
                        to: {
                            translateX: 0,
                            translateY: -50,
                            rotate: +90,
                            borderRadius: 15,
                        },
                        duration: 0.5,
                    }),
                    a.ani({
                        to: {
                            translateX: 0,
                            translateY: 0,
                            rotate: 0,
                            borderRadius: 30,
                        },
                        duration: 0.5,
                    }),
                ],
                a.timing.spring({ m: 1, k: 120, c: 15 })
            )
        )
    }, [])

    return (
        <div className="flex size-full items-center justify-center">
            <div
                ref={ref}
                className="size-16"
                onClick={() => {
                    if (ref.current) {
                        myTimeline.play(ref.current, {
                            from: {
                                translateX: 0,
                                translateY: 0,
                                rotate: 0,
                                borderRadius: 10,
                            },
                            repeat: Infinity,
                        })
                    }
                }}
            />
        </div>
    )
}`
