export type {
    AniGroup,
    AnimePrimitive,
    ExecutionPlan,
    ExecutionSegment,
    Groupable,
    GroupableRecord,
    GroupableRecordKey,
    SegmentTiming,
} from './interface/core_types'
export {
    normalizeRepeatCount,
    prefersReducedMotion,
    type ReducedMotionPolicy,
    type RunResult,
    resolveReducedMotionPolicy,
    TimelineBase,
    type TimelineCommonConfig,
    toIterationCount,
} from './interface/timeline_interface'
