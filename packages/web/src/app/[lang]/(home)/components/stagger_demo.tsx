'use client'

import { a } from '@freestylejs/ani-core'
import { useAniRef } from '@freestylejs/ani-react'
import { useMemo, useRef } from 'react'
import { useAppear } from './timeline'

export function StaggerDemo() {
    const refs = [
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
        useRef<HTMLDivElement>(null),
    ]

    const controllers = refs.map((ref) => {
        const myTimeline = useMemo(
            () =>
                a.timeline(
                    a.stagger(
                        [
                            a.ani({
                                to: { translateY: -20, translateX: 10 },
                                duration: 1.3,
                                timing: a.timing.spring({
                                    m: 1,
                                    k: 500,
                                    c: 10,
                                }),
                            }),
                            a.ani({
                                to: { translateY: 20, translateX: 0 },
                                duration: 0.6,
                                timing: a.timing.spring({ m: 1, k: 2, c: 1 }),
                            }),
                        ],
                        {
                            offset: 1,
                        }
                    )
                ),
            []
        )
        return useAniRef(ref, {
            timeline: myTimeline,
        })
    })

    const handleMouseEnter = () => {
        controllers.forEach((controller, i) => {
            setTimeout(() => {
                controller.play({ from: { translateX: -50, translateY: 0 } })
            }, i * 75)
        })
    }

    refs.forEach((ref) => useAppear(ref))

    return (
        <div
            className="flex size-full items-center justify-center space-x-2"
            onClick={handleMouseEnter}
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
