'use client'

import { a } from '@freestylejs/ani-core'
import { useMemo, useRef } from 'react'
import { useAppear } from './timeline'

export const StaggerDemo = () => {
    const refs = [
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
    ]

    const timelines = useMemo(() => {
        return refs.map(() => {
            const spring = a.timing.spring({
                m: 1,
                k: 500,
                c: 10,
            })
            return a.timeline(
                a.stagger(
                    [
                        a.ani({
                            to: { translateY: -20, translateX: 20 },
                            duration: 1,
                            timing: spring,
                        }),
                        a.ani({
                            to: { translateY: +20, translateX: -20 },
                            duration: 1,
                            timing: spring,
                        }),
                        a.ani({
                            to: { translateY: 0, translateX: 0 },
                            duration: 0.6,
                            timing: spring,
                        }),
                    ],
                    1
                )
            )
        })
    }, [])

    const handleClick = () => {
        timelines.forEach((timeline, i) => {
            const ref = refs[i]
            if (ref?.current) {
                timeline.play(ref.current, {
                    from: { translateX: 0, translateY: 0 },
                    delay: i * 50,
                })
            }
        })
    }

    refs.forEach((ref) => useAppear(ref))

    return (
        <div
            className="flex size-full items-center justify-center space-x-2"
            onClick={handleClick}
        >
            {refs.map((ref, i) => (
                <div
                    key={i}
                    ref={ref}
                    className="size-7 cursor-pointer rounded-full bg-green-500 opacity-100 transition-colors duration-200 hover:bg-green-400 hover:opacity-90"
                />
            ))}
        </div>
    )
}

export const staggerCode = `
export const StaggerDemo = () => {
    const refs = [
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
    ]

    const timelines = useMemo(() => {
        return refs.map(() => {
            const spring = a.timing.spring({
                m: 1,
                k: 500,
                c: 10,
            })
            return a.timeline(
                a.stagger(
                    [
                        a.ani({
                            to: { translateY: -20, translateX: 20 },
                            duration: 1,
                            timing: spring,
                        }),
                        a.ani({
                            to: { translateY: +20, translateX: -20 },
                            duration: 1,
                            timing: spring,
                        }),
                        a.ani({
                            to: { translateY: 0, translateX: 0 },
                            duration: 0.6,
                            timing: spring,
                        }),
                    ],
                    {
                        offset: 1,
                    }
                )
            )
        })
    }, [])

    const handleClick = () => {
        timelines.forEach((timeline, i) => {
            const ref = refs[i]
            if (ref?.current) {
                timeline.play(ref.current, {
                    from: { translateX: 0, translateY: 0 },
                    delay: i * 50,
                })
            }
        })
    }

    return (
        <div
            className="flex size-full items-center justify-center space-x-2"
            onClick={handleClick}
        >
            {refs.map((ref, i) => (
                <div
                    key={i}
                    ref={ref}
                    className="size-7 cursor-pointer rounded-full bg-green-500 opacity-100 transition-colors duration-200 hover:bg-green-400 hover:opacity-90"
                />
            ))}
        </div>
    )
}
`
