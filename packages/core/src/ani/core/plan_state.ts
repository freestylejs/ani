import { END_TOLERANCE } from '~/utils/time'
import type { ExecutionSegment, Groupable } from './interface/core_types'

/**
 * A loop represented once instead of as `count` copies. The first three
 * iterations are in the plan (`iterations`); iteration `k >= 3` behaves
 * exactly like iteration 2 shifted by `(k - 2) * period`, so the runtime maps
 * the time of the properties the loop writes into iteration 2.
 */
export interface PlanLoop {
    /** The loop node (identifies the loop when it has to be expanded). */
    readonly node: object
    readonly startTime: number
    /** Duration of one iteration. */
    readonly period: number
    /** Iteration count (>= 4), `Infinity` for an endless loop. */
    readonly count: number
    /** The segments of the first three iterations, nested loops included. */
    readonly iterations: readonly [
        readonly ExecutionSegment<Groupable>[],
        readonly ExecutionSegment<Groupable>[],
        readonly ExecutionSegment<Groupable>[],
    ]
}

/**
 * Bookkeeping that `construct` keeps next to a plan while the tree is walked.
 * It lives outside the plan array so that a plan stays a plain array of
 * segments.
 */
export interface PlanState {
    /** Next segment slot; a loop rewinds it for every iteration it emits. */
    slot: number
    /** Start time of the first emission of every slot. */
    slotStart: number[]
    /** Loops represented once (see {@link PlanLoop}). */
    loops: PlanLoop[]
    /** Whether the finite loop `node` at `startTime` is expanded, not folded. */
    expand: ((node: object, startTime: number) => boolean) | null
}

const states = new WeakMap<object, PlanState>()

/** The state of `plan`, created on first use. */
export function planStateOf(plan: object): PlanState {
    let state = states.get(plan)
    if (state === undefined) {
        state = { slot: 0, slotStart: [], loops: [], expand: null }
        states.set(plan, state)
    }
    return state
}

/** The loops of `plan` that are represented once. */
export function planLoops(plan: object): readonly PlanLoop[] {
    return states.get(plan)?.loops ?? []
}

/** End of the time a loop covers (`Infinity` for an endless loop). */
export function loopEnd(loop: PlanLoop): number {
    return loop.startTime + loop.period * loop.count
}

/**
 * Where each loop really ends. Normally that is {@link loopEnd}; a `durations`
 * override that shortens the child makes the last iteration end earlier, like
 * the written-out copies do. Nested loops count with their own end.
 */
export function loopEnds(loops: readonly PlanLoop[]): Map<PlanLoop, number> {
    const known = endsCache.get(loops)
    if (known !== undefined) return known

    const size = (loop: PlanLoop) =>
        loop.iterations[0].length +
        loop.iterations[1].length +
        loop.iterations[2].length
    // inner loops have fewer segments than the loops around them
    const order = [...loops].sort((a, b) => size(a) - size(b))
    // the innermost loop whose third iteration holds a segment
    const owner = new Map<object, PlanLoop>()
    for (let i = order.length - 1; i >= 0; i--) {
        for (const segment of order[i]!.iterations[2]) {
            owner.set(segment, order[i]!)
        }
    }

    const ends = new Map<PlanLoop, number>()
    const nested = new Map<PlanLoop, number>()
    for (const loop of order) {
        const full = loopEnd(loop)
        // the third iteration stands for every later one
        const origin = loop.startTime + 2 * loop.period
        let latest = Math.max(origin, nested.get(loop) ?? origin)
        for (const segment of loop.iterations[2]) {
            if (segment.endTime > latest) latest = segment.endTime
        }
        const real =
            loop.startTime + (loop.count - 1) * loop.period + (latest - origin)
        const end = real < full - END_TOLERANCE ? real : full
        ends.set(loop, end)

        const first = loop.iterations[0][0]
        const parent = first === undefined ? undefined : owner.get(first)
        if (parent !== undefined && end > (nested.get(parent) ?? -Infinity)) {
            nested.set(parent, end)
        }
    }
    endsCache.set(loops, ends)
    return ends
}

const endsCache = new WeakMap<readonly PlanLoop[], Map<PlanLoop, number>>()
