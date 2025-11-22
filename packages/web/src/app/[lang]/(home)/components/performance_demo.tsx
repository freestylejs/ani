'use client'

import { a } from '@freestylejs/ani-core'
import { useAniRef } from '@freestylejs/ani-react'
import Link from 'fumadocs-core/link'
import { Loader } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'

const STRESS_DURATION = 1000 // ms to block thread

export const performanceCode = `
// 1. Standard JS Animation (Main Thread)
const jsTimeline = a.timeline(
    a.sequence([
        a.ani({ 
            to: { translateX: 200, rotate: 180, scale: 1.2 }, 
            duration: 1 
        }),
        a.ani({ 
            to: { translateX: 0, rotate: 0, scale: 1 }, 
            duration: 1 
        })
    ])
)

// 2. Web Animation API (Compositor Thread)
const webAniTimeline = a.webTimeline(
    a.sequence([
        a.ani({ 
            to: { translateX: 200, rotate: 180, scale: 1.2 }, 
            duration: 1 
        }),
        a.ani({ 
            to: { translateX: 0, rotate: 0, scale: 1 }, 
            duration: 1 
        })
    ])
)

const jsRef = useRef(null)
const webRef = useRef(null)

// Ref Controller
const controller = useAniRef(jsRef, { 
    timeline: jsTimeline,
    initialValue: { translateX: 0, rotate: 0, scale: 1 }
})

useEffect(() => {
    // Raf start
    controller.play({
        from: { translateX: 0, rotate: 0, scale: 1 },
        repeat: Infinity 
    })

    // Native start
    if (webRef.current) {
        webAniTimeline.play(webRef.current, { 
            from: { translateX: 0, rotate: 0, scale: 1 },
            repeat: Infinity 
        })
    }
}, [])
`

export function PerformanceDemo() {
    const jsRef = useRef<HTMLDivElement>(null)
    const webRef = useRef<HTMLDivElement>(null)
    const trackRef = useRef<HTMLDivElement>(null)

    // 1. JS Based
    const jsTimeline = useMemo(
        () =>
            a.dynamicTimeline(
                a.sequence(
                    [
                        a.ani({
                            to: { translateX: 240, rotate: 180, scale: 1.2 },
                            duration: 1,
                        }),
                        a.ani({
                            to: { translateX: 0, rotate: 0, scale: 1 },
                            duration: 1,
                        }),
                    ],
                    a.timing.linear()
                )
            ),
        []
    )
    const controller = useAniRef(jsRef, {
        timeline: jsTimeline,
        initialValue: { translateX: 0, rotate: 0, scale: 1 },
    })

    // 2. Web Ani Based
    const webTimeline = useMemo(
        () =>
            a.timeline(
                a.sequence(
                    [
                        a.ani({
                            to: { translateX: 240, rotate: 180, scale: 1.2 },
                            duration: 1,
                        }),
                        a.ani({
                            to: { translateX: 0, rotate: 0, scale: 1 },
                            duration: 1,
                        }),
                    ],
                    a.timing.linear()
                )
            ),
        []
    )

    useEffect(() => {
        const handleAnimation = () => {
            if (!trackRef.current) return

            const trackSize = trackRef.current.offsetWidth
            // Auto play
            controller.play({
                from: { translateX: 0, rotate: 0, scale: 1 },
                repeat: Infinity,
                keyframes: [
                    { translateX: trackSize, rotate: 180, scale: 1.5 },
                    { translateX: 0, rotate: 0, scale: 1 },
                ],
            })
            if (webRef.current) {
                webTimeline.play(webRef.current, {
                    from: { translateX: 0, rotate: 0, scale: 1 },
                    repeat: Infinity,
                    keyframes: [
                        { translateX: trackSize, rotate: 180, scale: 1.5 },
                        { translateX: 0, rotate: 0, scale: 1 },
                    ],
                })
            }
        }

        handleAnimation()

        window.addEventListener('resize', handleAnimation)

        return () => {
            controller.pause()
            webTimeline.pause()
            window.removeEventListener('resize', handleAnimation)
        }
    }, [controller, webTimeline])

    const blockMainThread = () => {
        const start = performance.now()
        while (performance.now() - start < STRESS_DURATION) {
            //
        }
    }

    return (
        <div className="flex size-full flex-col items-center justify-center gap-8 p-4">
            <div ref={trackRef} className="w-full max-w-md space-y-6">
                {/* JS Track */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between font-medium text-muted-foreground text-xs uppercase tracking-wider">
                        <span>JS Engine (Main Thread)</span>
                        <span className="text-red-500/80">Janky</span>
                    </div>
                    <div className="relative h-3 w-full rounded-full bg-secondary/30">
                        <div
                            ref={jsRef}
                            className="-top-2.5 absolute size-8 rounded-lg bg-linear-to-br from-red-500 to-pink-600 shadow-lg dark:from-red-500 dark:to-pink-600"
                        />
                    </div>
                </div>

                {/* WAAPI Track */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between font-medium text-muted-foreground text-xs uppercase tracking-wider">
                        <span>
                            <Link
                                href="/en/docs/core-api/web-timeline"
                                className="transition-colors hover:text-primary hover:underline"
                            >
                                WAAPI (Native Compositor) ↗
                            </Link>
                        </span>
                        <span className="text-green-500/80">Smooth</span>
                    </div>
                    <div className="relative h-3 w-full rounded-full bg-secondary/30">
                        <div
                            ref={webRef}
                            className="-top-2.5 absolute size-8 rounded-lg bg-linear-to-br from-green-500 to-emerald-600 shadow-lg dark:from-green-500 dark:to-emerald-600"
                        />
                    </div>
                </div>
            </div>

            <button
                onClick={() => {
                    blockMainThread()
                }}
                className={`group relative flex items-center gap-2 rounded-lg border-transparent px-6 py-3 font-semibold text-sm shadow-lg ring-2 ring-zinc-500 transition-all hover:scale-105 hover:shadow-xl active:scale-95 ${'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'}`}
            >
                <Loader className="size-4 animate-spin" />
                <span>Freezing UI...</span>
            </button>
        </div>
    )
}
