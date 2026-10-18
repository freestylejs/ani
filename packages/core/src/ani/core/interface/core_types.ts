import type { SegmentNode } from '~/nodes'
import type { StylesheetSupportedLiteral } from '~/style'
import type { TimingFunction } from '~/timing'
import type {
    Prettify,
    UnionToIntersection,
    WithLiteral,
    WithLiteralRecord,
} from '~/utils/types'

export type { Footprint } from '~/nodes/footprint'

/**
 * Animatable target values
 */
export type Groupable = AnimePrimitive | GroupableRecord

export type GroupableRecordKey = WithLiteral<StylesheetSupportedLiteral>

export type GroupableRecord = WithLiteralRecord<
    GroupableRecordKey,
    AnimePrimitive[number]
>

export type AniGroup<G extends Groupable> = Prettify<UnionToIntersection<G>>

export interface ExecutionSegment<G extends Groupable> {
    /**
     * Execution segment node
     */
    node: SegmentNode<G>
    /**
     * Animation start time
     */
    startTime: number
    /**
     * Animation end time
     */
    endTime: number
    /**
     * Position of the segment node in the tree as written. Every iteration of
     * a loop shares the slots of the loop child (`keyframes` / `durations`
     * overrides address slots).
     */
    slot?: number
}

export type ExecutionPlan<G extends Groupable> = Array<ExecutionSegment<G>>

export type AnimePrimitive = readonly number[]

export interface SegmentDefinition {
    from: AnimePrimitive
    to: AnimePrimitive
    duration: number
    timing: SegmentTiming
}

export type SegmentTiming<G extends Groupable = Groupable> =
    G extends AnimePrimitive
        ? readonly TimingFunction[] | TimingFunction
        : G extends GroupableRecord
          ? Record<keyof G, TimingFunction> | TimingFunction
          : never

export interface SegmentState {
    values: AnimePrimitive
    isComplete: boolean
}
