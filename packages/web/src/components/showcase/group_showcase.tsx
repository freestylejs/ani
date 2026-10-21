'use client'

import type { RafGroup } from '@freestylejs/ani-core'
import * as a from '@freestylejs/ani-core'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

const COLS = 12
const TILES = 36

type Tile = {
    opacity: number
    scale: number
    translateX: number
    translateY: number
    rotate: number
}

/**
 * One immutable tree. The group evaluates it once per distinct
 * (offset, from) pair and writes all 36 targets from one clock tick.
 * The overshoot is a deliberate part of the choreography, not a spring:
 * the same tree is reused for every replay.
 */
const tree = a.sequence([
    a.ani({
        to: {
            opacity: 1,
            scale: 1.06,
            translateX: 0,
            translateY: 0,
            rotate: 0,
        },
        duration: 0.45,
        timing: a.timing.easeOut(),
    }),
    a.ani({
        to: {
            opacity: 1,
            scale: 1,
            translateX: 0,
            translateY: 0,
            rotate: 0,
        },
        duration: 0.25,
        timing: a.timing.easeInOut(),
    }),
])

function jitter(index: number, seed: number): number {
    return ((index * 37 + seed * 53) % 101) / 100
}

function fromFor(index: number, seed: number): Tile {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    const j = jitter(index, seed)
    return {
        opacity: 0,
        scale: 0.45 + j * 0.15,
        translateX: (col - (COLS - 1) / 2) * 10 + (j - 0.5) * 26,
        translateY: (row - 1) * 16 + (j - 0.5) * 24,
        rotate: (j - 0.5) * 50,
    }
}

export function GroupShowcase() {
    const containerRef = useRef<HTMLDivElement>(null)
    const groupRef = useRef<RafGroup<Tile> | null>(null)
    const seedRef = useRef(0)

    useEffect(() => {
        const container = containerRef.current
        if (container === null) return

        const group = a.rafGroup(tree, {
            stagger: (i) => (i % COLS) * 0.018 + Math.floor(i / COLS) * 0.045,
        })
        const unbind = group.bind(
            Array.from(container.children) as HTMLElement[]
        )
        groupRef.current = group
        void group.play({ from: (i) => fromFor(i, 0) })

        return () => {
            unbind()
            group.dispose()
            groupRef.current = null
        }
    }, [])

    const replay = () => {
        seedRef.current += 1
        const group = groupRef.current
        if (group === null) return
        void group.play({ from: (i) => fromFor(i, seedRef.current) })
    }

    return (
        <div className="not-prose my-8 overflow-hidden rounded-2xl border border-zinc-200 bg-linear-to-br from-zinc-50 via-white to-sky-50/60 p-5 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-sky-950/40">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                        One tree. One clock. 36 targets.
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        rafGroup · one plan · one subscription · one bind call
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={replay}>
                    Replay with a new from()
                </Button>
            </div>
            <div
                ref={containerRef}
                aria-label="Ani rafGroup kinetic grid demo"
                className="grid grid-cols-6 gap-2 sm:grid-cols-12 sm:gap-2.5"
            >
                {Array.from({ length: TILES }, (_, index) => (
                    <div
                        key={index}
                        className="aspect-square rounded-[7px] will-change-transform"
                        style={{
                            background: `linear-gradient(135deg, hsl(${
                                188 + (index % 12) * 7
                            } 88% 62%), hsl(${244 + (index % 7) * 5} 82% 56%))`,
                            boxShadow:
                                '0 6px 18px -8px rgba(14, 116, 144, 0.55)',
                        }}
                    />
                ))}
            </div>
            <p className="mt-4 text-xs text-zinc-500 leading-relaxed dark:text-zinc-400">
                The tree is never mutated. Replay only changes the{' '}
                <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.7rem] dark:bg-zinc-900">
                    from
                </code>{' '}
                function; every tile is written in the commit phase. With
                reduced motion, the clock policy jumps to the end state.
            </p>
        </div>
    )
}
