'use client'

import type { RafGroup, RunResult, WaapiTimeline } from '@freestylejs/ani-core'
import * as a from '@freestylejs/ani-core'
import { Cpu, Pause, Play, RotateCcw, Waves, Zap } from 'lucide-react'
import {
    type CSSProperties,
    type PointerEvent as ReactPointerEvent,
    useEffect,
    useRef,
    useState,
} from 'react'

const COLS = 12
const TILE_COUNT = 36
const TAU = Math.PI * 2

type Tile = {
    opacity: number
    scale: number
    translateX: number
    translateY: number
    rotate: number
}

type Engine = 'raf' | 'waapi'
type Phase = 'playing' | 'paused' | 'ended'

/**
 * The immutable description. Both engines read this same value: it contains
 * no DOM, no clock and no target count, so it is safe to replay forever.
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
        duration: 0.8,
        timing: a.timing.easeOut(),
    }),
    a.ani({
        to: { opacity: 1, scale: 1, translateX: 0, translateY: 0, rotate: 0 },
        duration: 0.45,
        timing: a.timing.easeInOut(),
    }),
])

const stagger = (index: number) =>
    (index % COLS) * 0.022 + Math.floor(index / COLS) * 0.05

/** Deterministic scatter: a new seed produces a new, repeatable `from`. */
function noise(index: number, seed: number): number {
    const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453
    return value - Math.floor(value)
}

function fromFor(index: number, seed: number): Tile {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    const angle = noise(index, seed) * TAU
    const radius = 24 + noise(index + 101, seed) * 92
    return {
        opacity: 0,
        scale: 0.35 + noise(index + 211, seed) * 0.3,
        translateX: (col - (COLS - 1) / 2) * 6 + Math.cos(angle) * radius,
        translateY: (row - 1) * 8 + Math.sin(angle) * radius * 0.7,
        rotate: (noise(index + 307, seed) - 0.5) * 84,
    }
}

type Realizer = {
    play: (seed: number) => Promise<RunResult>
    pause: () => void
    resume: () => void
    dispose: () => void
}

function tilesIn(field: HTMLElement): HTMLElement[] {
    return Array.from(field.querySelectorAll<HTMLElement>('[data-tile]'))
}

function clearTiles(tiles: HTMLElement[]): void {
    for (const tile of tiles) {
        tile.style.transform = ''
        tile.style.opacity = ''
    }
}

const ENGINE_COPY: Record<
    Engine,
    { time: string; clock: string; write: string }
> = {
    raf: {
        time: '1 clock',
        clock: 'read → update → commit',
        write: 'one bind · one commit',
    },
    waapi: {
        time: 'native timeline',
        clock: 'no RAF tick',
        write: 'one bind · keyframes',
    },
}

const FIELD_MASK: CSSProperties = {
    maskImage:
        'linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent), linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)',
    maskComposite: 'intersect',
    WebkitMaskImage:
        'linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent), linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)',
    WebkitMaskComposite: 'source-in',
}

const ENGINES = [
    {
        id: 'raf',
        label: 'RAF GROUP',
        aria: 'Use the RAF group engine',
        icon: Cpu,
    },
    {
        id: 'waapi',
        label: 'WAAPI',
        aria: 'Use the Web Animations API engine',
        icon: Zap,
    },
] as const

export function GroupShowcase() {
    const fieldRef = useRef<HTMLDivElement>(null)
    const realizerRef = useRef<Realizer | null>(null)
    const runTokenRef = useRef(0)
    const seedRef = useRef(0)

    const [engine, setEngine] = useState<Engine>('raf')
    const [phase, setPhase] = useState<Phase>('playing')
    const [reducedMotion, setReducedMotion] = useState(false)

    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)')
        const update = () => setReducedMotion(query.matches)
        update()
        query.addEventListener('change', update)
        return () => query.removeEventListener('change', update)
    }, [])

    useEffect(() => {
        const field = fieldRef.current
        if (field === null) return
        const tiles = tilesIn(field)
        if (tiles.length === 0) return

        // A switch must not inherit inline declarations from the old engine.
        clearTiles(tiles)

        let raf: RafGroup<Tile> | null = null
        let waapi: WaapiTimeline<Tile> | null = null
        let unbind: () => void = () => undefined

        if (engine === 'raf') {
            raf = a.rafGroup(tree, { stagger })
            unbind = raf.bind(tiles)
        } else {
            waapi = a.waapiTimeline(tree)
        }

        const play = (seed: number): Promise<RunResult> =>
            raf === null
                ? waapi!.play(tiles, {
                      from: (index) => fromFor(index, seed),
                      stagger,
                      // Apply `from` during each target's stagger delay too,
                      // so WAAPI and RAF show the same state before start.
                      effect: { fill: 'both' },
                  })
                : raf.play({ from: (index) => fromFor(index, seed) })

        const realizer: Realizer = {
            play,
            pause: () => (raf === null ? waapi!.pause() : raf.pause()),
            resume: () => (raf === null ? waapi!.resume() : raf.resume()),
            dispose: () => {
                unbind()
                raf?.dispose()
                waapi?.dispose()
                clearTiles(tiles)
            },
        }
        realizerRef.current = realizer

        // This token retires every promise belonging to a previous run.
        const token = ++runTokenRef.current
        setPhase('playing')
        void play(seedRef.current).then((result) => {
            if (runTokenRef.current === token && result === 'ended') {
                setPhase('ended')
            }
        })

        return () => {
            runTokenRef.current++
            realizer.dispose()
            if (realizerRef.current === realizer) realizerRef.current = null
        }
    }, [engine])

    const begin = (realizer: Realizer, seed: number) => {
        // A replay starts from a clean slate; natural end keeps fill forwards.
        if (engine === 'waapi') {
            const field = fieldRef.current
            if (field !== null) clearTiles(tilesIn(field))
        }
        const token = ++runTokenRef.current
        setPhase('playing')
        void realizer.play(seed).then((result) => {
            if (runTokenRef.current === token && result === 'ended') {
                setPhase('ended')
            }
        })
    }

    const togglePlayback = () => {
        const realizer = realizerRef.current
        if (realizer === null) return
        if (phase === 'playing') {
            realizer.pause()
            setPhase('paused')
            return
        }
        if (phase === 'paused') {
            realizer.resume()
            setPhase('playing')
            return
        }
        begin(realizer, seedRef.current)
    }

    const replay = () => {
        const realizer = realizerRef.current
        if (realizer === null) return
        seedRef.current += 1
        begin(realizer, seedRef.current)
    }

    const moveSpotlight = (event: ReactPointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()
        event.currentTarget.style.setProperty(
            '--spot-x',
            `${event.clientX - rect.left}px`
        )
        event.currentTarget.style.setProperty(
            '--spot-y',
            `${event.clientY - rect.top}px`
        )
    }

    const copy = ENGINE_COPY[engine]
    const metrics = [
        {
            index: '01',
            label: 'DESCRIPTION',
            value: '1 tree',
            detail: '2 ani · 1 sequence',
        },
        {
            index: '02',
            label: 'TIME',
            value: copy.time,
            detail: copy.clock,
        },
        {
            index: '03',
            label: 'REALIZATION',
            value: `${TILE_COUNT} targets`,
            detail: copy.write,
        },
    ]

    return (
        <div className="not-prose my-10 w-full text-white">
            <div
                onPointerMove={moveSpotlight}
                className="relative isolate overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#05060b] pt-5 shadow-[0_32px_90px_-48px_rgba(34,211,238,0.55)] sm:pt-6"
            >
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                >
                    <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-cyan-400/[0.16] blur-3xl" />
                    <div className="absolute top-1/4 -right-16 h-72 w-72 rounded-full bg-violet-500/[0.18] blur-3xl" />
                    <div className="absolute -bottom-32 left-1/3 h-72 w-96 rounded-full bg-fuchsia-500/[0.09] blur-3xl" />
                    <div
                        className="absolute inset-0 opacity-[0.16]"
                        style={{
                            backgroundImage:
                                'linear-gradient(to right, rgba(255,255,255,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.09) 1px, transparent 1px)',
                            backgroundSize: '44px 44px',
                            maskImage:
                                'radial-gradient(ellipse at 50% 40%, black, transparent 76%)',
                        }}
                    />
                    <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
                    <div
                        className="absolute inset-0"
                        style={{
                            background:
                                'radial-gradient(340px circle at var(--spot-x, 50%) var(--spot-y, 38%), rgba(103,232,249,0.09), transparent 70%)',
                        }}
                    />
                </div>

                <div
                    data-copy="header"
                    className="relative z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 sm:px-7"
                >
                    <div className="flex items-center gap-2.5">
                        <span className="relative flex h-2 w-2">
                            <span
                                className={`absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-60 motion-reduce:hidden ${
                                    phase === 'playing'
                                        ? 'animate-ping'
                                        : 'hidden'
                                }`}
                            />
                            <span
                                className={`relative inline-flex h-2 w-2 rounded-full ${
                                    phase === 'playing'
                                        ? 'bg-cyan-300 shadow-[0_0_12px_2px_rgba(34,211,238,0.55)]'
                                        : 'bg-white/30'
                                }`}
                            />
                        </span>
                        <span className="font-medium font-mono text-[10px] text-white/65 tracking-[0.18em] sm:tracking-[0.22em]">
                            EXPERIMENT 01
                        </span>
                        <span
                            aria-hidden="true"
                            className="h-3 w-px bg-white/15"
                        />
                        <span className="font-medium font-mono text-[10px] text-white/90 tracking-[0.18em] sm:tracking-[0.22em]">
                            IMMUTABLE DESCRIPTION
                        </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px] text-white/55 tracking-[0.14em] sm:tracking-[0.18em]">
                        <span>{TILE_COUNT} TARGETS</span>
                        <span
                            aria-hidden="true"
                            className="h-3 w-px bg-white/15"
                        />
                        <span className="text-cyan-200/90">
                            {engine === 'raf' ? 'RAF GROUP' : 'WAAPI'}
                        </span>
                    </div>
                </div>

                <div className="relative z-10 px-5 pt-5 sm:px-7 sm:pt-6">
                    <div
                        data-field-viewport={true}
                        className="relative isolate -mx-4 overflow-hidden px-4 py-5"
                        style={FIELD_MASK}
                    >
                        <div
                            ref={fieldRef}
                            aria-hidden="true"
                            className="grid grid-cols-6 gap-2 sm:grid-cols-9 xl:grid-cols-12 xl:gap-2.5"
                        >
                            {Array.from({ length: TILE_COUNT }, (_, index) => {
                                const hueA = 184 + (index % 12) * 5
                                const hueB = 256 + (index % 7) * 5
                                return (
                                    <div
                                        key={index}
                                        data-tile={true}
                                        className="relative aspect-square min-w-0 rounded-[9px] will-change-transform"
                                        style={{
                                            background: `linear-gradient(140deg, hsl(${hueA} 95% 69%) 0%, hsl(${hueB} 88% 64%) 55%, hsl(${hueB + 16} 82% 52%) 100%)`,
                                            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45), 0 8px 26px -12px hsl(${hueB} 90% 60% / 0.8), 0 0 22px -14px rgba(34,211,238,0.9)`,
                                        }}
                                    >
                                        <span className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/25 via-transparent to-black/25" />
                                        <span className="absolute top-1.5 left-1.5 h-1 w-1 rounded-full bg-white/80" />
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div
                        data-copy="caption"
                        className="mt-2 flex flex-wrap items-center justify-between gap-2"
                    >
                        <p className="font-mono text-[10px] tracking-[0.08em] text-white/60">
                            The tree never changes.{' '}
                            <span className="text-white/90">
                                The realizer does.
                            </span>
                        </p>
                        {reducedMotion && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/20 bg-amber-200/[0.06] px-2.5 py-1 font-mono text-[10px] text-amber-100/70 uppercase tracking-[0.1em]">
                                <Waves size={10} aria-hidden="true" />
                                reduced motion: system
                            </span>
                        )}
                    </div>

                    <div className="mt-4 flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={togglePlayback}
                                aria-label={
                                    phase === 'playing'
                                        ? 'Pause the animation'
                                        : phase === 'paused'
                                          ? 'Resume the animation'
                                          : 'Play the animation again'
                                }
                                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 px-4 font-semibold text-[#03141a] text-[12px] shadow-[0_0_26px_-7px_rgba(34,211,238,0.85)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080910] active:scale-[0.98] motion-reduce:transition-none sm:flex-none"
                            >
                                {phase === 'playing' ? (
                                    <Pause size={14} aria-hidden="true" />
                                ) : (
                                    <Play size={14} aria-hidden="true" />
                                )}
                                {phase === 'playing'
                                    ? 'Pause'
                                    : phase === 'paused'
                                      ? 'Resume'
                                      : 'Play again'}
                            </button>
                            <button
                                type="button"
                                onClick={replay}
                                aria-label="Replay with a new scatter"
                                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 font-medium text-[11px] text-white/75 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080910] motion-reduce:transition-none sm:flex-none"
                            >
                                <RotateCcw size={13} aria-hidden="true" />
                                Replay
                            </button>
                        </div>

                        <div
                            role="group"
                            aria-label="Animation engine"
                            className="flex rounded-xl border border-white/10 bg-black/30 p-1"
                        >
                            {ENGINES.map((option) => {
                                const Icon = option.icon
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setEngine(option.id)}
                                        aria-pressed={engine === option.id}
                                        aria-label={option.aria}
                                        className={`inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 font-mono text-[10px] font-medium tracking-[0.1em] transition focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080910] focus-visible:outline-none motion-reduce:transition-none sm:flex-none ${
                                            engine === option.id
                                                ? 'bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                                                : 'text-white/55 hover:text-white/80'
                                        }`}
                                    >
                                        <Icon size={11} aria-hidden="true" />
                                        {option.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>

                <p className="sr-only" aria-live="polite">
                    {engine === 'raf' ? 'RAF group' : 'WAAPI'} engine, {phase}
                </p>
            </div>

            <div className="mt-3 grid overflow-hidden rounded-2xl border border-white/10 bg-[#080910] sm:grid-cols-3">
                {metrics.map((metric, index) => (
                    <div
                        key={metric.label}
                        className={`px-4 py-3.5 sm:px-5 ${
                            index > 0
                                ? 'border-t border-white/10 sm:border-t-0 sm:border-l'
                                : ''
                        }`}
                    >
                        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em]">
                            <span className="text-cyan-200/90">
                                {metric.index}
                            </span>
                            <span className="text-white/60">
                                {metric.label}
                            </span>
                        </div>
                        <p className="mt-1 font-medium text-[15px] text-white/90">
                            {metric.value}
                        </p>
                        <p className="mt-0.5 min-h-7 font-mono text-[10px] text-white/55 uppercase tracking-[0.08em] sm:min-h-14 lg:min-h-7">
                            {metric.detail}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}
