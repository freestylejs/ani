import type { AnimationClockInterface } from '~/loop'
import type { AnimationNode, ExtractAnimationNode } from './nodes'
import {
    type AniGroup,
    type Groupable,
    type Timeline,
    type TimelineStartingConfig,
    timeline,
} from './timeline'

export type AnimationStateShape = Record<string, AnimationNode<Groupable>>

export type GetTimeline<State extends AnimationStateShape> = Timeline<
    ExtractAnimationNode<State[keyof State]>,
    any
>

export interface StateController<AnimationStates extends AnimationStateShape> {
    /**
     * Get current timeline.
     */
    timeline: () => GetTimeline<AnimationStates>

    /**
     * Transition timeline animation into another state.
     * @param newState transition target.
     *
     * @param timelineConfig animation play config.
     * @param canBeIntercepted animation canBeIntercepted config.
     */
    transitionTo(
        newState: keyof AnimationStates,
        timelineConfig?: TimelineStartingConfig<
            ExtractAnimationNode<AnimationStates[keyof AnimationStates]>,
            any
        >,
        canBeIntercepted?: boolean
    ): void

    /**
     * Subscribe to timeline changes.
     * @param callback
     * @returns unsubscribe function
     */
    onTimelineChange(
        callback: (newTimeline: GetTimeline<AnimationStates>) => void
    ): () => void
}

export interface StateProps<AnimationStates extends AnimationStateShape> {
    /**
     * Initial animation target state.
     */
    initial: keyof AnimationStates
    /**
     * Initial animation `from` value.
     */
    initialFrom: AniGroup<
        ExtractAnimationNode<AnimationStates[keyof AnimationStates]>
    >
    /**
     * Animating target states.
     */
    states: AnimationStates
    /**
     * Custom timeline clock
     */
    clock?: AnimationClockInterface
}

/**
 * Creates a state machine controller for managing animations.
 *
 * @param config - The configuration for the state machine.
 * @param clock - Optional custom animation clock.
 * @returns A controller for managing the animation states.
 */
export function createStates<AnimationStates extends AnimationStateShape>(
    config: StateProps<AnimationStates>
): StateController<AnimationStates> {
    let State: keyof AnimationStates = config.initial
    let Timeline: Timeline<Groupable> = timeline(
        config.states[State]!,
        config.clock
    )

    const subs = new Set<(newTimeline: GetTimeline<AnimationStates>) => void>()
    const notify = (timeline: GetTimeline<AnimationStates>) => {
        for (const Sub of subs) {
            Sub(timeline)
        }
    }

    return {
        timeline: () => Timeline as unknown as GetTimeline<AnimationStates>,
        onTimelineChange(callback) {
            subs.add(callback)
            return () => subs.delete(callback)
        },
        transitionTo(newState, timelineConfig, canBeIntercepted) {
            // keep current timeline
            if (!config.states[newState] || State === newState) {
                return
            }

            // new timeline
            const from = (timelineConfig?.from ?? // 1. config
                Timeline.getCurrentValue() ?? // 2. last value
                config.initialFrom) as TimelineStartingConfig<Groupable>['from'] // 3. initial value

            State = newState
            Timeline = timeline(config.states[State]!, config.clock)
            notify(Timeline as unknown as GetTimeline<AnimationStates>)

            Timeline.play(
                {
                    ...timelineConfig,
                    from,
                },
                canBeIntercepted
            )
        },
    }
}
