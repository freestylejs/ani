import type { Groupable } from '~/ani/core'
import { createAniError } from '~/error'
import { END_TOLERANCE } from '~/utils/time'

declare const __ANI_DEV__: boolean

/**
 * What a node writes, in time relative to its own start. Composition nodes
 * use it to reject trees in which an endless loop shares a property with
 * another animation (see `assertNoEndlessOverlap`).
 */
export interface Footprint {
    /** Property -> latest end of a segment writing it (`Infinity` when endless). */
    readonly ends: ReadonlyMap<string, number>
    /** Property -> start of the earliest endless loop writing it. */
    readonly endless: ReadonlyMap<string, number>
}

/** A child placed `offset` seconds after the start of its parent. */
export interface Placed {
    readonly footprint: Footprint
    readonly offset: number
}

export const EMPTY_FOOTPRINT: Footprint = {
    ends: new Map(),
    endless: new Map(),
}

/** Animated properties of a `to` value: record keys or array indices. */
export function propertiesOf(to: Groupable): string[] {
    // malformed values are reported by the timeline when it compiles the plan
    if (typeof to !== 'object' || to === null) return []
    return Array.isArray(to)
        ? to.map((_, index) => String(index))
        : Object.keys(to)
}

export function segmentFootprint(to: Groupable, duration: number): Footprint {
    const names = propertiesOf(to)
    if (names.length === 0) return EMPTY_FOOTPRINT
    return {
        ends: new Map(names.map((name) => [name, duration])),
        endless: EMPTY_FOOTPRINT.endless,
    }
}

/** The footprint of nodes that run side by side or one after another. */
export function mergeFootprints(parts: readonly Placed[]): Footprint {
    const ends = new Map<string, number>()
    const endless = new Map<string, number>()
    for (const { footprint, offset } of parts) {
        for (const [name, end] of footprint.ends) {
            const at = offset + end
            const known = ends.get(name)
            if (known === undefined || at > known) ends.set(name, at)
        }
        for (const [name, start] of footprint.endless) {
            const at = offset + start
            const known = endless.get(name)
            if (known === undefined || at < known) endless.set(name, at)
        }
    }
    return ends.size === 0 ? EMPTY_FOOTPRINT : { ends, endless }
}

/** The footprint of `count` iterations of a child lasting `period` each. */
export function loopFootprint(
    child: Footprint,
    period: number,
    count: number
): Footprint {
    if (count === 0 || child.ends.size === 0) return EMPTY_FOOTPRINT
    // a child without extent (or without end) is emitted once
    if (!(period > 0) || !Number.isFinite(period)) return child
    if (count === Infinity) {
        const ends = new Map<string, number>()
        const endless = new Map<string, number>()
        for (const name of child.ends.keys()) {
            ends.set(name, Infinity)
            endless.set(name, 0)
        }
        return { ends, endless }
    }
    const ends = new Map<string, number>()
    for (const [name, end] of child.ends) {
        ends.set(name, (count - 1) * period + end)
    }
    return { ends, endless: child.endless }
}

/**
 * Throws when an endless loop in one of the parts shares a property with
 * another part that is still writing it when the loop starts. An endless loop
 * owns its properties from its start on, so the overlap could never resolve.
 */
export function assertNoEndlessOverlap(
    caller: string,
    parts: readonly Placed[]
): void {
    if (!parts.some((part) => part.footprint.endless.size > 0)) return

    // the two latest ends per property tell, for any part, the latest end of the others
    const best = new Map<
        string,
        { end: number; index: number; other: number }
    >()
    parts.forEach(({ footprint, offset }, index) => {
        for (const [name, end] of footprint.ends) {
            const at = offset + end
            const entry = best.get(name)
            if (entry === undefined) {
                best.set(name, { end: at, index, other: -Infinity })
            } else if (at > entry.end) {
                entry.other = entry.end
                entry.end = at
                entry.index = index
            } else if (at > entry.other) {
                entry.other = at
            }
        }
    })

    parts.forEach(({ footprint, offset }, index) => {
        for (const [name, start] of footprint.endless) {
            const entry = best.get(name)!
            const others = entry.index === index ? entry.other : entry.end
            // sums of durations differ by an ulp: touching is not overlapping
            if (others > offset + start + END_TOLERANCE) {
                throw createAniError(
                    RangeError,
                    'ANI_UNREACHABLE_NODE',
                    __ANI_DEV__
                        ? `[${caller}] An endless loop and another animation both write "${name}" at the same time. An endless loop owns its properties from its start on: animate "${name}" in only one of them, or give the loop a finite count.`
                        : ''
                )
            }
        }
    })
}
