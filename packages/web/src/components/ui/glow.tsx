'use client'

import { a } from '@freestylejs/ani-core/index'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { rand } from '@/lib/math/rand'
import { cn } from '@/lib/utils/index'

const Spring = a.timing.spring({ m: 1, k: 1.5, c: 2 })

const glowTimeline = a.timeline(
    a.parallel([
        // 3s sequence
        a.sequence(
            [
                a.ani({
                    to: {
                        opacity: 0,
                        scale: 0.75,
                    },
                    duration: 0.5,
                }),

                a.ani({
                    to: {
                        opacity: 0.5,
                        scale: 1.25,
                    },
                    duration: 0.75,
                }),

                a.ani({
                    to: {
                        opacity: 1,
                        scale: 1.75,
                    },
                    duration: 1.5,
                }),
            ],

            Spring
        ),
    ])
)

const randLoc = () => {
    return {
        x: rand([-450, 100]),
        y: rand([-200, 100]),
    }
}

export function Glow({
    className,
    children,
    ...props
}: React.PropsWithChildren<React.ComponentProps<'div'>>) {
    const targetGlob = useRef<HTMLDivElement>(null)

    const [randLocation, setRandLocation] = useState<{
        x: number
        y: number
    } | null>(null)

    useEffect(() => {
        if (!targetGlob.current) return
        setRandLocation(randLoc())
        glowTimeline.play(targetGlob.current, {
            from: {
                scale: 0,
                opacity: 0,
            },
        })
    }, [])

    if (!randLocation) return

    return (
        <div
            ref={targetGlob}
            data-slot="glow"
            className="absolute size-full"
            style={{
                top: randLocation.x,
                left: randLocation.y,
            }}
            {...props}
        >
            <div
                className={cn(
                    'group-hover:-translate-x-1/2 -translate-x-1/2 absolute left-1/2 h-64 w-[60%] scale-[2.5] rounded-[50%] bg-radial from-10% from-[#85BEFFFF]/0 to-60% to-[#85BEFFFF]/0 opacity-100 duration-500 group-hover:scale-150 group-hover:opacity-90 sm:h-[512px] dark:from-[#85BEFFFF]-800/20 dark:to-[#85BEFFFF]-800/0'
                )}
            />

            <div
                className={cn(
                    'group-hover:-translate-x-1/2 -translate-x-1/2 scale absolute left-1/2 h-32 w-[40%] rounded-[50%] bg-radial from-0% to-60% opacity-100 duration-500 group-hover:scale-150 group-hover:opacity-90 sm:h-64 dark:from-[#7CB9FFFF]/10 dark:to-[#85BEFFFF]/0'
                )}
            />
            {children}
        </div>
    )
}
