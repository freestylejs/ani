import type {
    AniGroup,
    Groupable,
    ReducedMotionPolicy,
    RunResult,
} from '~/ani/core'
import { devKey, devWarn } from '~/dev'
import { createAniError } from '~/error'
import type { AnimationClockInterface } from '~/loop'
import type { AnimationNode, ExtractAnimationNode } from '~/nodes'
import {
    type BindOptions,
    type RafTimeline,
    type RafTimelineConfig,
    rafTimeline,
} from './timeline'

declare const __ANI_DEV__: boolean

export type AnimationStateShape = Record<string, AnimationNode<Groupable>>

export type GetTimeline<State extends AnimationStateShape> = RafTimeline<
    ExtractAnimationNode<State[keyof State]>
>

type TransitionCallback<AnimationStates extends AnimationStateShape> = (
    state: keyof AnimationStates,
    timeline: GetTimeline<AnimationStates>
) => void

type StateUpdateCallback<AnimationStates extends AnimationStateShape> =
    Parameters<GetTimeline<AnimationStates>['onUpdate']>[0]

type BindTarget = Parameters<RafTimeline<Groupable>['bind']>[0]

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
     *
     * The transition is atomic: an unknown state name throws before anything
     * changes, and a failing `play` (invalid config) restores the previous
     * timeline. When the previous timeline is still playing, its velocity is
     * handed to the new one (unless `timelineConfig.velocity` is given).
     *
     * With `timelineConfig.interrupt` set to `false` and the current timeline
     * playing, the transition is rejected and nothing changes. A third
     * argument throws a `TypeError`.
     *
     * @param newState transition target.
     *
     * @param timelineConfig animation play config.
     * @returns The run of the new timeline. Never rejects: `'ended'`,
     * `'interrupted'` (replaced by another transition), `'skipped'` (rejected),
     * `'reset'` or `'disposed'` (also after `dispose()`).
     */
    transitionTo(
        newState: keyof AnimationStates,
        timelineConfig?: Partial<
            RafTimelineConfig<
                ExtractAnimationNode<AnimationStates[keyof AnimationStates]>
            >
        >
    ): Promise<RunResult>

    /**
     * Latest value: the current timeline's value, else the last value the
     * machine showed (it survives `timeline().reset()`), else the initial
     * value. Frozen.
     */
    readonly value: AniGroup<
        ExtractAnimationNode<AnimationStates[keyof AnimationStates]>
    >

    /**
     * Writes the value to `target.style` on every notification of the current
     * timeline, now and after every transition.
     * @returns Unbind: stops the writes of all future timelines too.
     */
    bind(target: BindTarget, options?: BindOptions): () => void

    /**
     * Subscribes to the `{ state, status }` notifications of the current
     * timeline, now and after every transition.
     * @returns unsubscribe function
     */
    onUpdate(callback: StateUpdateCallback<AnimationStates>): () => void

    /**
     * Subscribes to transitions. Called with the new state and timeline right
     * before the timeline starts playing.
     * @returns unsubscribe function
     */
    onTransition(callback: TransitionCallback<AnimationStates>): () => void

    /**
     * Releases the current timeline, its bindings and every subscriber.
     * Idempotent; later `transitionTo` calls resolve `'disposed'`.
     */
    dispose(): void
}

type InitialGroup<AnimationStates extends AnimationStateShape> = AniGroup<
    ExtractAnimationNode<AnimationStates[keyof AnimationStates]>
>

interface StateBaseProps<AnimationStates extends AnimationStateShape> {
    /**
     * Initial animation target state.
     */
    initial: keyof AnimationStates
    /**
     * Animating target states.
     */
    states: AnimationStates
    /**
     * Custom timeline clock
     */
    clock?: AnimationClockInterface
    /**
     * What a timeline does when the user prefers reduced motion. Forwarded
     * to every state's timeline.
     * @default 'jump'
     */
    reducedMotion?: ReducedMotionPolicy
}

/**
 * Props of `createStates`. A missing `initialValue` throws a `TypeError`.
 */
export type StateProps<AnimationStates extends AnimationStateShape> =
    StateBaseProps<AnimationStates> & {
        /**
         * Initial animation `from` value.
         */
        initialValue: InitialGroup<AnimationStates>
    }

interface Subscription {
    attach(timeline: RafTimeline<Groupable>): () => void
    detach: () => void
}

function copyGroup(group: Groupable | null): Groupable | null {
    if (group === null) return null
    return (Array.isArray(group) ? [...group] : { ...group }) as Groupable
}

function rethrowAsync(error: unknown): void {
    queueMicrotask(() => {
        throw error
    })
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
    if ((config as { initialFrom?: unknown }).initialFrom !== undefined) {
        throw createAniError(
            TypeError,
            'ANI_REMOVED_API',
            __ANI_DEV__
                ? '[createStates] `initialFrom` was renamed `initialValue`.'
                : ''
        )
    }
    if (config.initialValue === undefined) {
        throw createAniError(
            TypeError,
            'ANI_INVALID_OPTIONS',
            __ANI_DEV__ ? '[createStates] `initialValue` is required.' : ''
        )
    }
    if (!Object.hasOwn(config.states, config.initial as string)) {
        throw createAniError(
            RangeError,
            'ANI_UNKNOWN_STATE',
            __ANI_DEV__
                ? `[createStates] Unknown initial state "${String(config.initial)}". Available states: ${Object.keys(config.states).join(', ')}.`
                : ''
        )
    }
    const initialValue = Object.freeze(
        copyGroup(config.initialValue as Groupable)
    ) as Groupable

    let State: keyof AnimationStates = config.initial
    let Timeline: RafTimeline<Groupable> = rafTimeline(config.states[State]!, {
        clock: config.clock,
        reducedMotion: config.reducedMotion,
    })
    let disposed = false

    // Last value the machine showed. Survives `timeline().reset()`, which
    // clears the timeline's own value. Only the reference is kept per frame:
    // the engine hands out an immutable snapshot per update, and the
    // defensive copy happens lazily in `transitionTo`.
    let lastValue = null as Groupable | null
    const track = (timeline: RafTimeline<Groupable>) => {
        timeline.onUpdate(({ state, status }) => {
            if (status === 'IDLE') return
            lastValue = state as Groupable
        })
    }
    track(Timeline)

    const subs = new Set<TransitionCallback<AnimationStates>>()
    const notify = (
        state: keyof AnimationStates,
        timeline: RafTimeline<Groupable>
    ) => {
        for (const Sub of [...subs]) {
            try {
                Sub(state, timeline as unknown as GetTimeline<AnimationStates>)
            } catch (error) {
                rethrowAsync(error)
            }
        }
    }

    const onTransition: StateController<AnimationStates>['onTransition'] = (
        callback
    ) => {
        if (disposed) return () => undefined
        subs.add(callback)
        return () => {
            subs.delete(callback)
        }
    }

    // Bindings and `onUpdate` listeners of the machine, re-attached to every
    // new timeline. A replaced timeline drops its own when it is disposed.
    const subscriptions = new Set<Subscription>()
    // Key owner for dev warnings: one per state machine, stable across timelines.
    const devOwner = {}
    const subscribe = (
        method: string,
        attach: Subscription['attach']
    ): (() => void) => {
        if (disposed) {
            if (__ANI_DEV__) {
                devWarn(
                    'ANI_DEV_DISPOSED_USE',
                    `[createStates] \`${method}()\` on a disposed state machine is a no-op.`,
                    devKey(devOwner, method)
                )
            }
            return () => undefined
        }
        const subscription: Subscription = {
            attach,
            detach: attach(Timeline),
        }
        subscriptions.add(subscription)
        return () => {
            if (!subscriptions.delete(subscription)) return
            subscription.detach()
        }
    }

    // The run returned by the latest `transitionTo`, settled as `'interrupted'`
    // when the next transition replaces it while still running.
    let lastRun: {
        timeline: RafTimeline<Groupable>
        settle: (result: RunResult) => void
    } | null = null

    // What the timeline announced to `onTransition` listeners replaces, for
    // transitions those listeners start.
    let handover: {
        timeline: RafTimeline<Groupable>
        from: RafTimelineConfig<Groupable>['from']
        velocity: RafTimelineConfig<Groupable>['velocity']
    } | null = null

    return {
        timeline: () => Timeline as unknown as GetTimeline<AnimationStates>,
        state: () => State,
        get value() {
            const current = Timeline.value ?? copyGroup(lastValue)
            return Object.freeze(
                current ?? initialValue
            ) as unknown as StateController<AnimationStates>['value']
        },
        bind: (target, options) =>
            subscribe('bind', (timeline) => timeline.bind(target, options)),
        onUpdate: (callback) =>
            subscribe('onUpdate', (timeline) =>
                timeline.onUpdate(
                    callback as Parameters<typeof timeline.onUpdate>[0]
                )
            ),
        onTransition,
        transitionTo(newState, timelineConfig, ...extra: unknown[]) {
            if (extra.length > 0) {
                throw createAniError(
                    TypeError,
                    'ANI_REMOVED_API',
                    __ANI_DEV__
                        ? '[createStates] `transitionTo` takes two arguments. Pass `interrupt` in the config: `transitionTo(state, { ...config, interrupt })`.'
                        : ''
                )
            }
            if (disposed) {
                if (__ANI_DEV__) {
                    devWarn(
                        'ANI_DEV_DISPOSED_USE',
                        '[createStates] `transitionTo()` on a disposed state machine is a no-op.',
                        devKey(devOwner, 'transitionTo')
                    )
                }
                return Promise.resolve('disposed')
            }
            if (!Object.hasOwn(config.states, newState as string)) {
                throw createAniError(
                    RangeError,
                    'ANI_UNKNOWN_STATE',
                    __ANI_DEV__
                        ? `[createStates] Unknown state "${String(newState)}". Available states: ${Object.keys(config.states).join(', ')}.`
                        : ''
                )
            }

            const previousTimeline = Timeline
            const previousState = State
            const wasPlaying = previousTimeline.status === 'PLAYING'

            const interrupt = timelineConfig?.interrupt ?? true
            if (!interrupt && wasPlaying) return Promise.resolve('skipped')

            // A transition started by an `onTransition` listener replaces a
            // timeline that never played: hand over what its predecessor had.
            const inherited =
                handover?.timeline === previousTimeline ? handover : null

            const carriedFrom =
                inherited?.from ?? // 1. predecessor of a redirected transition
                previousTimeline.value ?? // 2. last value
                copyGroup(lastValue) ?? // 3. last shown value (e.g. after reset())
                initialValue // 4. initial value
            const carriedVelocity = inherited
                ? inherited.velocity
                : wasPlaying
                  ? (previousTimeline.velocity ?? undefined)
                  : undefined

            const from = (timelineConfig?.from ??
                carriedFrom) as RafTimelineConfig<Groupable>['from']
            const velocity = timelineConfig?.velocity ?? carriedVelocity

            const nextTimeline = rafTimeline(config.states[newState]!, {
                clock: config.clock,
                reducedMotion: config.reducedMotion,
            })
            track(nextTimeline)

            State = newState
            Timeline = nextTimeline
            // Subscriptions made inside a transition listener attach
            // themselves to the new timeline; only the older ones are
            // attached here, after the listeners had their chance to drop them.
            const existing = [...subscriptions]
            const attached = new Map<Subscription, () => void>()
            const outerHandover = handover
            handover = {
                timeline: nextTimeline,
                from: carriedFrom,
                velocity: carriedVelocity,
            }
            try {
                notify(newState, nextTimeline)
            } finally {
                handover = outerHandover
            }

            // A listener redirected the machine: the nested transition owns the
            // bookkeeping and this timeline was replaced.
            const superseded = (): Promise<RunResult> => {
                for (const detach of attached.values()) detach()
                nextTimeline.dispose()
                previousTimeline.dispose()
                return Promise.resolve('interrupted')
            }
            if (Timeline !== nextTimeline) return superseded()

            // Attached before play so they observe its first update.
            for (const subscription of existing) {
                if (!subscriptions.has(subscription)) continue
                attached.set(subscription, subscription.attach(nextTimeline))
            }

            let run: Promise<RunResult>
            try {
                run = nextTimeline.play({
                    ...timelineConfig,
                    from,
                    ...(velocity !== undefined && { velocity }),
                })
            } catch (error) {
                // Invalid config: keep the machine on the previous timeline.
                nextTimeline.dispose()
                State = previousState
                Timeline = previousTimeline
                notify(previousState, previousTimeline)
                throw error
            }

            // The first notification of play() may have redirected the machine.
            if (Timeline !== nextTimeline) return superseded()

            for (const [subscription, detach] of attached) {
                // unsubscribed from inside a listener
                if (subscriptions.has(subscription))
                    subscription.detach = detach
                else detach()
            }
            const result = new Promise<RunResult>((resolve) => {
                run.then(resolve)
                // A run that already ended settles by itself.
                const status = lastRun?.timeline.status
                if (status === 'PLAYING' || status === 'PAUSED') {
                    lastRun?.settle('interrupted')
                }
                lastRun = { timeline: nextTimeline, settle: resolve }
            })
            previousTimeline.dispose()
            return result
        },
        dispose() {
            if (disposed) return
            disposed = true
            Timeline.dispose()
            subs.clear()
            subscriptions.clear()
        },
    }
}
