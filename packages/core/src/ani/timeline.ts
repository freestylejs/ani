import {
    type Animatable,
    AnimationClock,
    type AnimationClockInterface,
} from '~/loop'
import type { Resolver, StylesheetSupportedLiteral } from '~/style'
import { isEndOfAnimation } from '~/utils/time'
import type {
    Prettify,
    UnionToIntersection,
    WithLiteral,
    WithLiteralRecord,
} from '~/utils/types'
import {
    type AnimePrimitive,
    calculateSegmentState,
    type SegmentDefinition,
} from './engine'
import { type AnimationNode, SegmentNode, type SegmentNodeProps } from './nodes'

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
}

export type ExecutionPlan<G extends Groupable> = Array<ExecutionSegment<G>>

type TimelineStatus = 'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED'
export type OnUpdateCallback<G extends Groupable> = (current: {
    state: AniGroup<G>
    status: TimelineStatus
}) => void

type ShouldKeepSymbol = 'keep'
type Keyframe<G extends Groupable> = Array<G | ShouldKeepSymbol>
type Duration = Array<number | ShouldKeepSymbol>

export interface TimelineStartingConfig<G extends Groupable, Ctx = any> {
    /**
     * Starting dynamic value.
     */
    from: AniGroup<G>
    /**
     * Dynamic `from` values, if passed `keep` for specific index, keep original timeline config.
     */
    keyframes?: Keyframe<G>
    /**
     * Dynamic `duration` values, if passed `keep` for specific index, keep original timeline config.
     */
    durations?: Duration
    /**
     * Custom context definition during animation cycle.
     */
    context?: Ctx
    /**
     * Animation repeat count.
     *
     * - if `Infinity` goes infinity repeat
     */
    repeat?: number

    /**
     * Custom style property resolver.
     *
     * @example
     * ```ts
     * const timeline = a.timeline(...)
     * timeline.play({
     *    propertyResolver: {
     *       'px': (pxValue) => { key: `top`, value: `${pxValue}px` }
     *    }
     * })
     * ```
     */
    propertyResolver?: G extends AnimePrimitive ? never : Resolver<G>
}

/**
 * Public timeline controller
 */
export interface TimelineController<G extends Groupable, Ctx = any> {
    /**
     * Play timeline
     * @param config Timeline starting configuration
     * @param canBeIntercepted if `true`, will play animation again even if already PLAYING.
     */
    play(
        config: TimelineStartingConfig<G, Ctx>,
        canBeIntercepted?: boolean
    ): void
    /**
     * Pause timeline
     */
    pause(): void
    /**
     * Resume timeline
     */
    resume(): void
    /**
     * Seek to target time
     * @param time
     */
    seek(time: number): void
    /**
     * Reset timeline
     */
    reset(): void
}

export class Timeline<G extends Groupable, Ctx = any>
    implements TimelineController<G, Ctx>, Animatable
{
    public readonly duration: number

    private readonly _baseExecutionPlan: ExecutionPlan<G>
    private _currentExecutionPlan: ExecutionPlan<G> | null = null

    private readonly _clock: AnimationClockInterface

    private _masterTime = 0

    private _status: TimelineStatus = 'IDLE'
    private _currentConfig: TimelineStartingConfig<G, Ctx> | null = null
    /**
     * Current animation running config.
     */
    public get currentConfig() {
        return this._currentConfig
    }

    private _state: AnimePrimitive = []
    private _initialState: AnimePrimitive = []

    private _repeatCount: number = 0

    private _propertyKeyMap: Map<string, number> | null = null
    private _segmentStartStates = new Map<number, AnimePrimitive>()

    private _onUpdateCallbacks = new Set<OnUpdateCallback<G>>()

    constructor(
        /**
         * Animation construction root node.
         */
        protected readonly rootNode: AnimationNode<G>,
        clock?: AnimationClockInterface
    ) {
        this.duration = rootNode.duration
        this._baseExecutionPlan = this._constructExecutionPlan(rootNode)

        // default clock
        this._clock = clock ?? AnimationClock.create()

        // binding
        this.play.bind(this)
        this.pause.bind(this)
        this.seek.bind(this)
        this.resume.bind(this)
        this.reset.bind(this)
    }

    /**
     * Resolves a Group (like {x, y}) into keys and values.
     */
    private _resolveGroup(group: G): {
        keyMap: Map<string, number> | null
        values: AnimePrimitive
    } {
        if (Array.isArray(group)) {
            return { keyMap: null, values: group }
        }
        const keyMap = new Map(Object.keys(group).map((key, i) => [key, i]))
        const values = Object.values(group) as AnimePrimitive
        return { keyMap, values }
    }

    /**
     * Resolves the internal state (a number array) back into Group.
     */
    private _resolveStateToGroup(state: AnimePrimitive): AniGroup<G> {
        if (!this._propertyKeyMap) {
            return state as unknown as AniGroup<G>
        }
        const group = {} as Record<string, number>

        let i = 0
        for (const key of this._propertyKeyMap.keys()) {
            group[key] = state[i]!
            i++
        }
        return group as AniGroup<G>
    }

    /**
     * Compile animation execution plan
     */
    private _constructExecutionPlan(
        rootNode: AnimationNode<G>
    ): ExecutionPlan<G> {
        const plan: ExecutionPlan<G> = []
        rootNode.construct(plan, 0)
        return plan
    }

    /**
     * Calculates the exact state of the animation at point.
     */
    private _calculateStateAtTime(
        targetTime: number,
        dt: number = 0
    ): AnimePrimitive {
        if (this._initialState.length === 0 || !this._currentExecutionPlan) {
            return []
        }

        const nextState: Array<number> = [...this._initialState]
        let stateAtLastStartTime: Array<number> = [...this._initialState]

        for (const segment of this._currentExecutionPlan) {
            // Only for activated animation segment
            if (targetTime < segment.startTime) {
                continue
            }

            if (!segment.node.props.timing) {
                throw new Error(
                    `[Timeline] timing should be provided. Please specify timing using a.timing.(...). Check target segment: ${JSON.stringify(segment, null, 2)}.`,
                    { cause: segment }
                )
            }

            // Use the state before this segment for "from" calculation
            stateAtLastStartTime = [...nextState]

            const { keyMap, values: toValues } = this._resolveGroup(
                segment.node.props.to
            )
            const isRecordAni: boolean =
                this._propertyKeyMap !== null && keyMap !== null

            // From value calculations
            let fromValues: Array<number> = []
            if (isRecordAni) {
                for (const key of keyMap!.keys()) {
                    fromValues.push(
                        stateAtLastStartTime[this._propertyKeyMap!.get(key)!]!
                    )
                }
            } else {
                fromValues = stateAtLastStartTime
            }

            let finalAnimeValues: AnimePrimitive = []

            const localTime = targetTime - segment.startTime

            const segmentDef: SegmentDefinition = {
                from: fromValues,
                to: toValues,
                duration: segment.node.duration,
                timing: segment.node.props.timing,
            }

            const segmentState = calculateSegmentState(
                localTime,
                segmentDef,
                dt
            )

            if (segmentState.isComplete) {
                finalAnimeValues = toValues // End target
            } else {
                finalAnimeValues = segmentState.values // Calculated current target
            }

            // Update next state
            if (isRecordAni) {
                // Record ani
                let i = 0
                for (const key of keyMap!.keys()) {
                    const stateIndex = this._propertyKeyMap!.get(key)!
                    if (stateIndex === -1) {
                        continue
                    }
                    nextState[stateIndex] = finalAnimeValues[i]!
                    i++
                }
            } else {
                // Array ani
                for (let i = 0; i < finalAnimeValues.length; i++) {
                    nextState[i] = finalAnimeValues[i]!
                }
            }
        }

        return nextState
    }

    private _resolveExecutionPlan(
        keyframes?: Keyframe<G>,
        durations?: Duration
    ): ExecutionPlan<G> {
        if (!keyframes && !durations) {
            return [...this._baseExecutionPlan]
        }

        const segmentNodes = this._baseExecutionPlan.filter(
            (segment) => segment.node.type === 'SEGMENT'
        )
        const segLength = segmentNodes.length

        if (keyframes && keyframes.length !== segLength) {
            throw new Error(
                `Timeline keyframe mismatch: Expected ${segLength} keyframes, but received ${keyframes.length}.`
            )
        }
        if (durations && durations.length !== segLength) {
            throw new Error(
                `Timeline keyframe mismatch: Expected ${segLength} durations, but received ${durations.length}.`
            )
        }

        const newPlan: ExecutionPlan<G> = []

        let keyframeIndex = 0

        // Create dynamic to keyframes based plans
        for (const segment of this._baseExecutionPlan) {
            if (segment.node.type === 'SEGMENT') {
                const dynamicTo = keyframes?.[keyframeIndex]
                const dynamicDuration = durations?.[keyframeIndex]

                const newSegmentProps: SegmentNodeProps<G> = {
                    ...segment.node.props,

                    // >> dynamic to
                    ...(dynamicTo && {
                        to:
                            dynamicTo === 'keep'
                                ? segment.node.props.to
                                : dynamicTo,
                    }),

                    // >> dynamic duration
                    ...(dynamicDuration && {
                        duration:
                            dynamicDuration === 'keep'
                                ? segment.node.props.duration
                                : dynamicDuration,
                    }),
                }

                const newSegment = new SegmentNode(
                    newSegmentProps,
                    segment.node.id
                )
                newPlan.push({ ...segment, node: newSegment })
                keyframeIndex++
            } else {
                // non-segment nodes
                newPlan.push({ ...segment })
            }
        }

        return newPlan
    }

    private notify(): void {
        for (const subscriber of this._onUpdateCallbacks) {
            subscriber({
                state: this._resolveStateToGroup(this._state),
                status: this._status,
            })
        }
    }

    public play(
        config: TimelineStartingConfig<G, Ctx>,
        canBeIntercepted: boolean = true
    ): void {
        if (this._status === 'PLAYING' && !canBeIntercepted) {
            return
        }

        const isRepeating =
            this._currentConfig?.repeat && this._currentConfig?.repeat >= 1
        const savedRepeatCount = isRepeating ? this._repeatCount : 0

        // can be intercepted -> reset
        this.reset(false)
        // recover repeat count
        this._repeatCount = savedRepeatCount

        // repeat exceed -> reset repeat
        if (isRepeating && this._repeatCount >= config.repeat!) {
            this._repeatCount = 0
            return
        }

        // update current config
        this._currentConfig = config

        this._currentExecutionPlan = this._resolveExecutionPlan(
            config.keyframes,
            config.durations
        )

        const { keyMap: keys, values } = this._resolveGroup(config.from as G)
        this._propertyKeyMap = keys
        this._state = values
        this._initialState = values

        this._status = 'PLAYING'
        this._clock.subscribe(this)
        this.update(0) // Render initial frame
    }

    public pause(): void {
        this._status = 'PAUSED'
        this._clock.unsubscribe(this)
    }

    public resume(): void {
        if (this._status !== 'PAUSED') return
        this._status = 'PLAYING'
        this._clock.subscribe(this)
    }

    public reset(notify: boolean = true): void {
        this._status = 'IDLE'

        this._currentConfig = null

        this._masterTime = 0

        this._state = []
        this._initialState = []

        this._propertyKeyMap = null

        this._segmentStartStates.clear()
        this._currentExecutionPlan = null

        this._clock.unsubscribe(this)

        this._repeatCount = 0

        if (notify) {
            this.notify()
        }
    }

    public seek(targetTime: number): void {
        if (this._status === 'PLAYING' || this._status === 'ENDED') {
            this.pause()
        }
        const seekTime = Math.max(0, Math.min(targetTime, this.duration))

        this._masterTime = seekTime
        this._state = this._calculateStateAtTime(seekTime, 0)

        this.notify()
    }

    public getCurrentValue(): AniGroup<G> | null {
        if (this._state.length === 0) return null
        return this._resolveStateToGroup(this._state)
    }

    public onUpdate(callback: OnUpdateCallback<G>): () => void {
        this._onUpdateCallbacks.add(callback)
        return () => {
            this._onUpdateCallbacks.delete(callback)
        }
    }

    update(dt: number): void {
        if (this._status !== 'PLAYING') {
            return
        }

        this._masterTime += dt
        if (this._masterTime >= this.duration) {
            this._masterTime = this.duration
        }

        this._state = this._calculateStateAtTime(this._masterTime, dt)
        this.notify()

        if (isEndOfAnimation(this._masterTime, this.duration)) {
            // repeat update
            this._repeatCount += 1

            if (!this._currentConfig) {
                throw new Error(
                    `[Timeline] currentConfig can not be null when update(dt)`
                )
            }

            // no-repeat -> ended(don't have to reset)
            const noRepeat = (this._currentConfig.repeat ?? 0) === 0

            if (noRepeat) {
                this._status = 'ENDED'
                this._clock.unsubscribe(this)
                this.notify()
            } else {
                this.play(this._currentConfig)
            }
        }
    }
}

export function timeline<G extends Groupable, Ctx = any>(
    rootNode: AnimationNode<G>,
    clock?: AnimationClockInterface
): Timeline<G, Ctx> {
    return new Timeline<G, Ctx>(rootNode, clock)
}
