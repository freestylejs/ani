import { ani, delay, loop, parallel, sequence, stagger } from './nodes'
import { createStates } from './states'
import { timeline } from './timeline'

/**
 * Core ani lib
 */
export { ani, createStates, delay, loop, parallel, sequence, stagger, timeline }

export {
    AnimationDuration,
    AnimationId,
    AnimationNode,
    AnimationNodeType,
    CompositionNode,
    ParallelNode,
    SegmentNode,
    SequenceNode,
    StaggerNode,
} from './nodes'
export {
    AnimationStateShape,
    GetTimeline,
    StateController,
    StateProps,
} from './states'
export {
    AniGroup,
    ExecutionPlan,
    ExecutionSegment,
    Groupable,
    GroupableRecord,
    GroupableRecordKey,
    OnUpdateCallback,
    Timeline,
    TimelineController,
    TimelineStartingConfig,
} from './timeline'
