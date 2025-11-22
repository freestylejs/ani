'use client'

import { a } from '@freestylejs/ani-core'
import { useMemo, useRef } from 'react'
import { useAppear } from './timeline'

export const LoopDelayDemo = () => {
    const ref = useRef<HTMLDivElement>(null)

    useAppear(ref)

    const myTimeline = useMemo(() => {
        const Pulse = a.sequence(
            [
                a.ani({ to: { scale: 1.5, opacity: 0.5 }, duration: 0.25 }),
                a.ani({ to: { scale: 1, opacity: 1 }, duration: 0.35 }),
            ],
            a.timing.spring({ m: 1, k: 200, c: 12 })
        )

        return a.timeline(
            a.sequence(
                [
                    a.ani({
                        to: { rotate: -15, scale: 1.1 },
                        duration: 0.3,
                    }),
                    a.loop(Pulse, 3),
                    a.delay(0.5),
                    a.ani({
                        to: { rotate: 0, scale: 1 },
                        duration: 0.5,
                    }),
                ],
                a.timing.spring({ m: 1, k: 200, c: 12 })
            )
        )
    }, [])

    return (
        <div className="flex size-full items-center justify-center">
            <div
                ref={ref}
                className="flex size-16 cursor-pointer items-center justify-center rounded-lg bg-purple-500 transition-colors duration-200 hover:bg-purple-400"
                onClick={() => {
                    if (ref.current) {
                        myTimeline.play(ref.current, {
                            from: { rotate: 0, scale: 1, opacity: 1 },
                        })
                    }
                }}
            ></div>
        </div>
    )
}

export const loopDelayDemoCodeString = `
const LoopDelayDemo = () => {
    const ref = useRef<HTMLDivElement>(null)

    const myTimeline = useMemo(() => {
        const Pulse = a.sequence(
            [
                a.ani({ to: { scale: 1.5, opacity: 0.5 }, duration: 0.25 }),
                a.ani({ to: { scale: 1, opacity: 1 }, duration: 0.35 }),
            ],
            a.timing.spring({ m: 1, k: 200, c: 12 })
        )

        return a.webTimeline(
            a.sequence(
                [
                    a.ani({
                        to: { rotate: -15, scale: 1.1 },
                        duration: 0.3,
                    }),
                    a.loop(Pulse, 3),
                    a.delay(0.5),
                    a.ani({
                        to: { rotate: 0, scale: 1 },
                        duration: 0.5,
                    }),
                ],
                a.timing.spring({ m: 1, k: 200, c: 12 })
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
                            from: { rotate: 0, scale: 1, opacity: 1 },
                        })
                    }
                }}
            ></div>
        </div>
    )
}

`
