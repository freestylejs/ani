'use client'

import { a } from '@freestylejs/ani-core'
import { useAniRef } from '@freestylejs/ani-react'
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

const STRESS_DURATION = 1000 // ms to block thread

export const performanceCode = `import { a } from '@freestylejs/ani-core'
import { useAniRef } from '@freestylejs/ani-react'

// 1. Standard JS Animation (Main Thread)
// Subject to jank if the main thread is busy.
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
// Runs smoothly even if the main thread is blocked.
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

// ... Usage in Component
const jsRef = useRef(null)
const webRef = useRef(null)

// Standard
useAniRef(jsRef, { 
    timeline: jsTimeline,
    initialValue: { translateX: 0, rotate: 0, scale: 1 }
})

// Native
useEffect(() => {
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
    const [isBlocking, setIsBlocking] = useState(false)

    // 1. JS Based
    const jsTimeline = useMemo(
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
    const controller = useAniRef(jsRef, {
        timeline: jsTimeline,
        initialValue: { translateX: 0, rotate: 0, scale: 1 },
    })

    // 2. Web Ani Based
    const webTimeline = useMemo(
        () =>
            a.webTimeline(
                a.sequence([
                    a.ani({
                        to: { translateX: 240, rotate: 180, scale: 1.2 },
                        duration: 1,
                    }),
                    a.ani({
                        to: { translateX: 0, rotate: 0, scale: 1 },
                        duration: 1,
                    }),
                ])
            ),
        []
    )

    useEffect(() => {
        // Auto play
        controller.play({
            from: { translateX: 0, rotate: 0, scale: 1 },
            repeat: Infinity,
        })
        if (webRef.current) {
            webTimeline.play(webRef.current, {
                from: { translateX: 0, rotate: 0, scale: 1 },
                repeat: Infinity,
            })
        }
        return () => {
            controller.pause()
            webTimeline.cancel()
        }
    }, [controller, webTimeline])

    const blockMainThread = () => {
        setIsBlocking(true)
        // Allow UI to update "Blocking..." state before freezing
        setTimeout(() => {
            const start = performance.now()
            while (performance.now() - start < STRESS_DURATION) {
                // Busy wait
            }
            setIsBlocking(false)
        }, 50)
    }

    return (
        <div className="flex size-full flex-col items-center justify-center gap-8 p-4">
            <div className="w-full max-w-md space-y-6">
                {/* JS Track */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground text-xs font-medium uppercase tracking-wider">
                        <span>JS Engine (Main Thread)</span>
                        <span className="text-red-500/80">Janky</span>
                    </div>
                    <div className="relative h-3 w-full rounded-full bg-secondary/30">
                        <div
                            ref={jsRef}
                            className="-top-2.5 absolute size-8 rounded-lg border border-white/20 bg-gradient-to-br from-red-500 to-pink-600 shadow-lg dark:from-red-500 dark:to-pink-600"
                        />
                    </div>
                </div>

                {/* WAAPI Track */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground text-xs font-medium uppercase tracking-wider">
                        <span>
                            <a
                                href="/docs/core-api/web-timeline"
                                className="hover:text-primary hover:underline transition-colors"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                WAAPI (Native Compositor) ↗
                            </a>
                        </span>
                        <span className="text-green-500/80">Smooth</span>
                    </div>
                    <div className="relative h-3 w-full rounded-full bg-secondary/30">
                        <div
                            ref={webRef}
                            className="-top-2.5 absolute size-8 rounded-lg border border-white/20 bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg dark:from-green-500 dark:to-emerald-600"
                        />
                    </div>
                </div>
            </div>

            <button
                onClick={blockMainThread}
                disabled={isBlocking}
                className={`group relative flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-sm text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95 ${
                    isBlocking
                        ? 'cursor-not-allowed bg-zinc-600'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
                }`}
            >
                {isBlocking ? (
                    <>
                        <Loader2 className="size-4 animate-spin" />
                        <span>Freezing UI...</span>
                    </>
                ) : (
                    <>
                        <span>Stress Test (Freeze 1s)</span>
                    </>
                )}
                
                {/* Visual cue that this button itself is on main thread */}
                {!isBlocking && (
                    <div className="-right-1 -top-1 absolute size-3 animate-ping rounded-full bg-indigo-400 opacity-75" />
                )}
            </button>
        </div>
    )
}
