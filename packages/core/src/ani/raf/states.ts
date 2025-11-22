import type { AniGroup, Groupable } from '~/ani/core'
import type { AnimationClockInterface } from '~/loop'
import type { AnimationNode, ExtractAnimationNode } from '~/nodes'
import {
    type RafAniTimeline,
    type RafTimelineConfig,
    rafTimeline,
} from './timeline'

export type AnimationStateShape = Record<string, AnimationNode<Groupable>>

export type GetTimeline<State extends AnimationStateShape> = RafAniTimeline<
    ExtractAnimationNode<State[keyof State]>,
    any
>

type TimelineChangeCallback<AnimationStates extends AnimationStateShape> = (
    timeline: GetTimeline<AnimationStates>
) => void

export interface StateController<AnimationStates extends AnimationStateShape> {
    /**
     * Get current timeline.
     */
    timeline: () => GetTimeline<AnimationStates>

    /**
     * Get current state.
     */
    state: () => keyof AnimationStates

    /**
     * Transition timeline animation into another state.
     * @param newState transition target.
     *
     * @param timelineConfig animation play config.
     * @param canBeIntercepted animation canBeIntercepted config.
     */
    transitionTo(
        newState: keyof AnimationStates,
        timelineConfig?: RafTimelineConfig<
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
        callback: TimelineChangeCallback<AnimationStates>
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
    let Timeline: RafAniTimeline<Groupable> = rafTimeline(
        config.states[State]!,
        config.clock
    )

    const subs = new Set<TimelineChangeCallback<AnimationStates>>()
    const notify = (timeline: GetTimeline<AnimationStates>) => {
        for (const Sub of subs) {
            Sub(timeline)
        }
    }

    return {
        timeline: () => Timeline as unknown as GetTimeline<AnimationStates>,
        state: () => State,
        onTimelineChange(callback) {
            subs.add(callback)
            return () => subs.delete(callback)
        },
        transitionTo(newState, timelineConfig, canBeIntercepted) {
            // new timeline
            const from = (timelineConfig?.from ?? // 1. config
                Timeline.getCurrentValue() ?? // 2. last value
                config.initialFrom) as RafTimelineConfig<Groupable>['from'] // 3. initial value

            State = newState
            Timeline = rafTimeline(config.states[State]!, config.clock)
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
