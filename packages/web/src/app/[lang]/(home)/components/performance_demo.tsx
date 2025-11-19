'use client'

import { a } from '@freestylejs/ani-core'
import { useAniRef } from '@freestylejs/ani-react'
import { useEffect, useMemo, useRef, useState } from 'react'

const STRESS_DURATION = 500 // ms to block thread

export const performanceCode = `import { a } from '@freestylejs/ani-core'
import { useAniRef } from '@freestylejs/ani-react'

// 1. Standard JS Animation (Main Thread)
// Subject to jank if the main thread is busy.
const jsTimeline = a.timeline(
    a.loop(
        a.ani({ to: { x: 200 }, duration: 1 }),
        Infinity,
        a.timing.bezier({ p2: { x: 0.4, y: 0 }, p3: { x: 0.2, y: 1 } })
    )
)

// 2. Web Animation API (Compositor Thread)
// Runs smoothly even if the main thread is blocked.
const webAniTimeline = a.webTimeline(
    a.loop(
        a.ani({ to: { x: 200 }, duration: 1 }),
        Infinity,
        a.timing.bezier({ p2: { x: 0.4, y: 0 }, p3: { x: 0.2, y: 1 } })
    )
)

// ... Usage in Component
const jsRef = useRef(null)
const webRef = useRef(null)

// Standard
useAniRef(jsRef, { timeline: jsTimeline })

// Native
useEffect(() => {
    if (webRef.current) {
        webAniTimeline.play(webRef.current, { 
            from: { x: 0 },
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
                a.loop(
                    a.sequence([
                        a.ani({ to: { x: 200 }, duration: 1 }),
                        a.ani({ to: { x: 0 }, duration: 1 }),
                    ]),
                    Infinity
                )
            ),
        []
    )
    const controller = useAniRef(jsRef, {
        timeline: jsTimeline,
        initialValue: { x: 0 },
    })

    // 2. Web Ani Based
    const webTimeline = useMemo(
        () =>
            a.webTimeline(
                a.loop(
                    a.sequence([
                        a.ani({ to: { x: 200 }, duration: 1 }),
                        a.ani({ to: { x: 0 }, duration: 1 }),
                    ]),
                    Infinity
                )
            ),
        []
    )

    useEffect(() => {
        // Auto play
        controller.play({ from: { x: 0 } })
        if (webRef.current) {
            webTimeline.play(webRef.current, {
                from: { x: 0 },
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
        <div className="flex size-full flex-col items-center justify-center gap-4 p-4">
            <div className="w-full space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>JS Engine (Main Thread)</span>
                </div>
                <div className="relative h-8 w-full rounded-full bg-secondary/50">
                    <div
                        ref={jsRef}
                        className="absolute size-8 rounded-full bg-red-500 shadow-sm"
                    />
                </div>
            </div>

            <div className="w-full space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>WAAPI (Native Compositor)</span>
                </div>
                <div className="relative h-8 w-full rounded-full bg-secondary/50">
                    <div
                        ref={webRef}
                        className="absolute size-8 rounded-full bg-green-500 shadow-sm"
                    />
                </div>
            </div>

            <button
                onClick={blockMainThread}
                disabled={isBlocking}
                className={`mt-4 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
                    isBlocking
                        ? 'cursor-not-allowed bg-gray-400'
                        : 'bg-blue-600 hover:bg-blue-700'
                }`}
            >
                {isBlocking ? 'Blocking Thread...' : 'Stress Test (Block Main Thread)'}
            </button>
        </div>
    )
}
