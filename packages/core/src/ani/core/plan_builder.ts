import { type AniErrorCode, createAniError } from '~/error'
import type { AnimationNode } from '~/nodes'
import { propertiesOf } from '~/nodes/footprint'
import { END_TOLERANCE } from '~/utils/time'
import type {
    ExecutionPlan,
    ExecutionSegment,
    Groupable,
} from './interface/core_types'
import {
    loopEnd,
    type PlanLoop,
    type PlanState,
    planStateOf,
} from './plan_state'

declare const __ANI_DEV__: boolean

/** A plan plus how its segment slots are ordered for overrides. */
export interface BuiltPlan<G extends Groupable> {
    /** Chronological, stable for equal start times. */
    readonly plan: ExecutionPlan<G>
    readonly loops: readonly PlanLoop[]
    /** Number of `keyframes` / `durations` entries an override must provide. */
    readonly slotCount: number
    /** Slot -> position of the slot in an override array. */
    readonly rankOf: readonly number[]
}

export interface BuildOptions {
    /** Write every finite loop out (reference path, WAAPI keyframes). */
    expandAll?: boolean
    /** Finite loops (by node and start time) to write out. */
    expand?: ReadonlyMap<object, ReadonlySet<number>>
}

/** Property names an overlap check cares about, per segment. */
function propertiesOfSegment(segment: ExecutionSegment<Groupable>): string[] {
    return propertiesOf(segment.node.props.to)
}

interface Writer {
    start: number
    end: number
    segment: ExecutionSegment<Groupable>
}

interface PropertyIndex {
    /** Writers of one property by start time, with the running latest end. */
    readonly writers: Writer[]
    readonly latest: number[]
}

function indexProperties(
    plan: readonly ExecutionSegment<Groupable>[]
): Map<string, PropertyIndex> {
    const index = new Map<string, PropertyIndex>()
    plan.forEach((segment) => {
        for (const name of propertiesOfSegment(segment)) {
            let entry = index.get(name)
            if (entry === undefined) {
                entry = { writers: [], latest: [] }
                index.set(name, entry)
            }
            entry.writers.push({
                start: segment.startTime,
                end: segment.endTime,
                segment,
            })
        }
    })
    for (const entry of index.values()) {
        entry.writers.sort((a, b) => a.start - b.start)
        let latest = -Infinity
        for (const writer of entry.writers) {
            if (writer.end > latest) latest = writer.end
            entry.latest.push(latest)
        }
    }
    return index
}

/** Names of the properties written by the segments of `loop`. */
function loopProperties(loop: PlanLoop): Set<string> {
    const names = new Set<string>()
    for (const iteration of loop.iterations) {
        for (const segment of iteration) {
            for (const name of propertiesOfSegment(segment)) names.add(name)
        }
    }
    return names
}

/**
 * Whether another segment writes a property of the loop while the loop runs.
 * The loop's own segments (nested loops included) do not count.
 */
function overlapsOutside(
    loop: PlanLoop,
    index: Map<string, PropertyIndex>
): string | null {
    const start = loop.startTime
    const end = loopEnd(loop)
    const own = new Set<object>(loop.iterations.flat())
    for (const name of loopProperties(loop)) {
        const { writers, latest } = index.get(name)!
        // writers starting before the loop ends, latest first
        let lo = 0
        let hi = writers.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (writers[mid]!.start < end - END_TOLERANCE) lo = mid + 1
            else hi = mid
        }
        // sums of durations differ by an ulp: touching is not overlapping
        const after = start + END_TOLERANCE
        for (let i = lo - 1; i >= 0 && latest[i]! > after; i--) {
            const writer = writers[i]!
            if (writer.end > after && !own.has(writer.segment)) return name
        }
    }
    return null
}

/**
 * Whether a segment of the loop runs past the iteration it belongs to. The
 * next iteration would then start from a partial value, which the repeated
 * iteration can not reproduce.
 */
export function overruns(loop: PlanLoop): boolean {
    for (let i = 0; i < loop.iterations.length; i++) {
        const limit = loop.startTime + (i + 1) * loop.period + END_TOLERANCE
        for (const segment of loop.iterations[i]!) {
            if (
                segment.endTime > limit &&
                propertiesOfSegment(segment).length > 0
            ) {
                return true
            }
        }
    }
    return false
}

function endlessError(code: AniErrorCode, reason: string): RangeError {
    return createAniError(
        RangeError,
        code,
        __ANI_DEV__
            ? `[Timeline] An endless loop ${reason}. Give the loop a finite count, or animate the property elsewhere.`
            : ''
    )
}

/**
 * Loops that can not be represented once: a finite loop overlapping another
 * segment on a shared property (`overlapsOutside`) is written out instead.
 */
function unfoldable(
    plan: readonly ExecutionSegment<Groupable>[],
    loops: readonly PlanLoop[]
): PlanLoop[] {
    const index = indexProperties(plan)
    const bad: PlanLoop[] = []
    for (const loop of loops) {
        const name = overlapsOutside(loop, index)
        if (name === null) continue
        if (loop.count === Infinity) {
            throw endlessError(
                'ANI_UNREACHABLE_NODE',
                __ANI_DEV__ ? `overlaps another animation of "${name}"` : ''
            )
        }
        bad.push(loop)
    }
    return bad
}

function walk<G extends Groupable>(
    root: AnimationNode<G>,
    expandAll: boolean,
    expand: Map<object, Set<number>>
): { plan: ExecutionPlan<G>; state: PlanState } {
    const plan: ExecutionPlan<G> = []
    const state = planStateOf(plan)
    state.expand = (node, startTime) =>
        expandAll || expand.get(node)?.has(startTime) === true
    root.construct(plan, 0)
    return { plan, state }
}

/**
 * Walks the tree into a chronological plan. Loops are represented once
 * (`planLoops`) unless they overlap other animations of a shared property, in
 * which case they are written out like `sequence` of copies.
 */
export function buildPlan<G extends Groupable>(
    root: AnimationNode<G>,
    options: BuildOptions = {}
): BuiltPlan<G> {
    const expand = new Map<object, Set<number>>()
    for (const [node, starts] of options.expand ?? []) {
        expand.set(node, new Set(starts))
    }

    let built = walk(root, options.expandAll === true, expand)
    // expanding a loop can create loops inside its copies: settle in rounds
    while (built.state.loops.length > 0) {
        const bad = unfoldable(built.plan, built.state.loops)
        if (bad.length === 0) break
        for (const loop of bad) {
            let starts = expand.get(loop.node)
            if (starts === undefined) {
                starts = new Set()
                expand.set(loop.node, starts)
            }
            starts.add(loop.startTime)
        }
        built = walk(root, options.expandAll === true, expand)
    }

    const { plan, state } = built
    const slotCount = state.slot
    const order = Array.from({ length: slotCount }, (_, slot) => slot)
    order.sort(
        (a, b) => (state.slotStart[a] ?? 0) - (state.slotStart[b] ?? 0) || a - b
    )
    const rankOf = new Array<number>(slotCount)
    order.forEach((slot, rank) => {
        rankOf[slot] = rank
    })

    // stable: simultaneous starts keep their declaration order
    plan.sort((a, b) => a.startTime - b.startTime)
    return { plan, loops: state.loops, slotCount, rankOf }
}

/**
 * Loops of a plan that overrides turned into something the runtime can not
 * repeat: a `durations` entry that runs past the iteration, or (with
 * `keyframes`) a property that another segment writes while the loop runs.
 * An endless one is a mistake of the caller.
 * @param plan The overridden plan.
 * @param keys Whether `keyframes` may have changed the animated properties.
 */
export function unstableLoops(
    plan: ExecutionPlan<Groupable>,
    loops: readonly PlanLoop[],
    keys: boolean
): PlanLoop[] {
    const bad = new Set<PlanLoop>()
    for (const loop of loops) {
        if (!overruns(loop)) continue
        if (loop.count === Infinity) {
            throw endlessError(
                'ANI_INVALID_CONFIG',
                __ANI_DEV__
                    ? 'would overrun its iteration with the given `durations`: an iteration must end by the time the next one starts'
                    : ''
            )
        }
        bad.add(loop)
    }
    if (keys) {
        for (const loop of unfoldable(plan, loops)) bad.add(loop)
    }
    return [...bad]
}
