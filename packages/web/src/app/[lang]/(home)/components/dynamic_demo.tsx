'use client'

import { a } from '@freestylejs/ani-core'
import { useAniRef } from '@freestylejs/ani-react'
import type { PointerEvent } from 'react'
import { useMemo, useRef } from 'react'
import { useAppear } from './timeline'

export function DynamicDemo() {
    const ref = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    useAppear(ref)

    const myTimeline = useMemo(
        () =>
            a.timeline(
                a.ani({
                    to: { translateX: 0, translateY: 0 },
                    duration: 0.5,
                    timing: a.timing.spring({ m: 1, k: 200, c: 20 }),
                })
            ),
        []
    )
    myTimeline.onUpdate((val) => {
        lastVal.current = {
            translateX: val.state.translateX,
            translateY: val.state.translateY,
        }
    })

    const controller = useAniRef(ref, {
        timeline: myTimeline,
    })

    const lastVal = useRef<{ translateX: number; translateY: number }>({
        translateX: 0,
        translateY: 0,
    })

    const play = (e: PointerEvent<HTMLDivElement>) => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left - 32
        const y = e.clientY - rect.top - 32

        controller.play({
            from: lastVal.current,
            keyframes: [{ translateX: x, translateY: y }],
        })
    }

    return (
        <div
            ref={containerRef}
            onPointerDown={(e) => {
                play(e)
            }}
            className="hover:glass-3 relative h-full w-full cursor-pointer rounded-xl border border-transparent border-dashed transition-colors duration-200 hover:border-zinc-200 dark:hover:border-zinc-800"
        >
            <div
                ref={ref}
                className="absolute h-16 w-16 cursor-auto rounded-lg border-2 border-pink-300 bg-pink-500"
            />
        </div>
    )
}
