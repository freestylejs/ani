'use client'

import { a } from '@freestylejs/ani-core'
import { useAniRef } from '@freestylejs/ani-react'
import { useEffect, useMemo, useRef } from 'react'
import { useAppear } from './timeline'

export function LoopDelayDemo() {
    const ref = useRef<HTMLDivElement>(null)

    useAppear(ref)

    const myTimeline = useMemo(() => {
        // A small, reusable pulse animation
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
                    // Initial animation to get attention
                    a.ani({
                        to: { rotate: -15, scale: 1.1 },
                        duration: 0.3,
                    }),
                    // Loop the pulse animation 3 times
                    a.loop(Pulse, 3),
                    // Pause for 0.5 seconds
                    a.delay(0.5),
                    // Return to the initial state
                    a.ani({
                        to: { rotate: 0, scale: 1 },
                        duration: 0.5,
                    }),
                ],
                a.timing.spring({ m: 1, k: 200, c: 12 })
            )
        )
    }, [])

    const controller = useAniRef(ref, {
        timeline: myTimeline,
    })

    useEffect(() => {
        const unsub = myTimeline.onUpdate((val) => {
            if (!ref.current) return
            ref.current.innerHTML = `<div className="text-xl font-bold">${String(val.state.scale.toFixed(2))}</div>`
        })

        return () => {
            unsub()
        }
    }, [])

    return (
        <div className="flex size-full items-center justify-center">
            <div
                ref={ref}
                className="flex size-16 cursor-pointer items-center justify-center rounded-lg bg-purple-500 transition-colors duration-200 hover:bg-purple-400"
                onClick={() => {
                    controller.play({
                        from: { rotate: 0, scale: 1, opacity: 1 },
                    })
                }}
            ></div>
        </div>
    )
}
