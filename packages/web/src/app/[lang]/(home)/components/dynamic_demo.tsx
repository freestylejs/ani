'use client'

import { a } from '@freestylejs/ani-core'
import type { PointerEvent } from 'react'
import { useMemo, useRef } from 'react'
import { useAppear } from './timeline'

export const DynamicDemo = () => {
    const ref = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    useAppear(ref)

    const controller = useMemo(
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

    const lastVal = useRef<{ translateX: number; translateY: number }>({
        translateX: 0,
        translateY: 0,
    })

    const play = (e: PointerEvent<HTMLDivElement>) => {
        if (!containerRef.current || !ref.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left - 32
        const y = e.clientY - rect.top - 32

        controller.play(ref.current, {
            from: lastVal.current,
            keyframes: [{ translateX: x, translateY: y }],
        })

        lastVal.current = {
            translateX: x,
            translateY: y,
        }
    }

    return (
        <div
            ref={containerRef}
            onPointerDown={(e) => {
                play(e)
            }}
            className="glass-3 group relative h-full min-h-52 w-full cursor-pointer rounded-xl border border-transparent border-dashed transition-colors duration-200 hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-800 hover:dark:bg-transparent"
        >
            <div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 text-center text-gray-500 opacity-100 transition-opacity duration-300 group-hover:opacity-50 dark:text-gray-400">
                <p className="font-semibold text-lg">Click anywhere</p>
                <p>Move to new dynamic keyframe.</p>
            </div>

            <div
                ref={ref}
                className="absolute h-16 w-16 cursor-auto rounded-lg border-2 border-pink-300 bg-pink-500"
            />
        </div>
    )
}

export const dynamicCode = `
export const DynamicDemo = () => {
    const ref = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const timeline = useMemo(
        () =>
            a.webTimeline(
                a.ani({
                    to: { translateX: 0, translateY: 0 },
                    duration: 0.5,
                    timing: a.timing.spring({ m: 1, k: 200, c: 20 }),
                })
            ),
        []
    )

    const lastVal = useRef<{ translateX: number; translateY: number }>({
        translateX: 0,
        translateY: 0,
    })

    const play = (e: PointerEvent<HTMLDivElement>) => {
        if (!containerRef.current || !ref.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left - 32
        const y = e.clientY - rect.top - 32

        timeline.play(ref.current, {
            from: lastVal.current,
            keyframes: [{ translateX: x, translateY: y }],
        })

        lastVal.current = {
            translateX: x,
            translateY: y,
        }
    }

    return (
        <div
            ref={containerRef}
            onPointerDown={(e) => {
                play(e)
            }}
            className="relative h-full min-h-52 w-full cursor-pointer"
        >
            <div
                ref={ref}
                className="absolute h-16 w-16"
            />
        </div>
    )
}

`
