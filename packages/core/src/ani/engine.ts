import type { TimingFunction } from '~/timing'
import { isEndOfAnimation } from '~/utils/time'

export type AnimePrimitive = readonly number[]

export interface SegmentDefinition {
    from: AnimePrimitive
    to: AnimePrimitive
    duration: number
    timing: SegmentTiming
}

export type SegmentTiming = TimingFunction | readonly TimingFunction[]

export interface SegmentState {
    values: AnimePrimitive
    isComplete: boolean
}

/**
 * Calculates the animated values for a single segment at a specific local time.
 *
 * @param localTime Time elapsed within this specific segment (from 0 to duration).
 * @param segmentDef Target segment def
 * @parma dt Delta time
 * @returns Calculated values and whether the segment is complete.
 */
export function calculateSegmentState(
    localTime: number,
    segmentDef: SegmentDefinition,
    dt: number = 0
): SegmentState {
    const t = Math.max(0, Math.min(localTime, segmentDef.duration))

    const animeValues: Array<number> = []
    let allComplete = true

    const isMultipleTiming = Array.isArray(segmentDef.timing)

    if (
        isMultipleTiming &&
        (segmentDef.timing as Array<TimingFunction>).length !==
            segmentDef.from.length
    ) {
        throw new TypeError(
            `[calculateSegmentState] timing does not correctly set. It requires multiple timing for ${segmentDef.from}, but received ${segmentDef.timing}`
        )
    }

    for (let i = 0; i < segmentDef.from.length; i++) {
        const timingFunction: TimingFunction = isMultipleTiming
            ? (segmentDef.timing as TimingFunction[])[i]!
            : (segmentDef.timing as TimingFunction)

        const animeResponse = timingFunction.step(t, {
            dt: dt,
            from: segmentDef.from[i]!,
            to: segmentDef.to[i]!,
            duration: segmentDef.duration,
        })

        animeValues.push(animeResponse.value)
        if (!animeResponse.endOfAnimation) {
            allComplete = false
        }
    }

    return {
        values: animeValues,
        isComplete: allComplete || isEndOfAnimation(t, segmentDef.duration),
    }
}
