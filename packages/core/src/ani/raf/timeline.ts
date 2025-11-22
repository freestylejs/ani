import type { AniGroup, AnimePrimitive, Groupable } from '~/ani/core'
import { TimelineBase, type TimelineCommonConfig } from '~/ani/core'
import {
    type Animatable,
    AnimationClock,
    type AnimationClockInterface,
} from '~/loop'
import type { AnimationNode } from '~/nodes'
import { isEndOfAnimation } from '~/utils/time'
import {
    resolveGroup,
    resolvePlanState,
    resolveStateToGroup,
} from '../core/resolver'

export interface RafTimelineConfig<G extends Groupable, Ctx = any>
    extends TimelineCommonConfig<G> {
    /**
     * Custom context definition during animation cycle.
     */
    context?: Ctx
}

type TimelineStatus = 'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED'

export type OnUpdateCallback<G extends Groupable> = (current: {
    /**
     * Current animation state
     */
    state: AniGroup<G>
    /**
     * Current animation status
     */
    status: TimelineStatus
}) => void

export class RafAniTimeline<G extends Groupable, Ctx = any>
    extends TimelineBase<G>
    // Raf clock
    implements Animatable
{
    private readonly _clock: AnimationClockInterface

    private _masterTime = 0
    private _delay = 0
    private _status: TimelineStatus = 'IDLE'

    private _currentConfig: RafTimelineConfig<G, Ctx> | null = null
    public get currentConfig() {
        return this._currentConfig
    }

    private _state: AnimePrimitive = []
    private _initialState: AnimePrimitive = []
    private _repeatCount: number = 0

    private _propertyKeyMap: Map<string, number> | null = null
    private _onUpdateCallbacks = new Set<OnUpdateCallback<G>>()

    constructor(rootNode: AnimationNode<G>, clock?: AnimationClockInterface) {
        super(rootNode)
        this._clock = clock ?? AnimationClock.create()

        this.play = this.play.bind(this)
        this.pause = this.pause.bind(this)
        this.seek = this.seek.bind(this)
        this.resume = this.resume.bind(this)
        this.reset = this.reset.bind(this)
    }

    public getCurrentValue(): AniGroup<G> | null {
        if (this._state.length === 0) return null
        return resolveStateToGroup(
            this._state,
            this._propertyKeyMap
        ) as AniGroup<G>
    }

    private _calculateStateAtTime(
        targetTime: number,
        dt: number = 0
    ): AnimePrimitive {
        if (this._initialState.length === 0 || !this._currentExecutionPlan) {
            return []
        }

        return resolvePlanState(
            this._currentExecutionPlan,
            this._initialState,
            this._propertyKeyMap, // Using the class property directly
            targetTime,
            dt
        )
    }

    private notify(): void {
        for (const subscriber of this._onUpdateCallbacks) {
            subscriber({
                state: resolveStateToGroup(
                    this._state,
                    this._propertyKeyMap
                ) as AniGroup<G>,
                status: this._status,
            })
        }
    }

    /**
     * @private Internal clock subscription callback.
     */
    update(dt: number): void {
        if (this._status !== 'PLAYING') return

        if (this._delay > 0) {
            this._delay -= dt
            if (this._delay < 0) {
                dt = -this._delay
                this._delay = 0
            } else {
                return
            }
        }

        this._masterTime += dt
        if (this._masterTime >= this.duration) this._masterTime = this.duration

        this._state = this._calculateStateAtTime(this._masterTime, dt)
        this.notify()

        if (isEndOfAnimation(this._masterTime, this.duration)) {
            this._repeatCount += 1
            const noRepeat = (this._currentConfig!.repeat ?? 0) === 0
            if (noRepeat) {
                this._status = 'ENDED'
                this._clock.unsubscribe(this)
                this.notify()
            } else {
                this.play(this._currentConfig!)
            }
        }
    }

    /**
     * Plays animation.
     * @param config {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame RequestAnimationFrame API} based config.
     * @param canBeIntercepted if `true` animation can be intercepted even if already animation started.
     */
    public play(
        config: RafTimelineConfig<G, Ctx>,
        canBeIntercepted: boolean = true
    ): void {
        if (this._status === 'PLAYING' && !canBeIntercepted) return

        const isRepeating = (this._currentConfig?.repeat ?? 0) >= 1
        const savedRepeatCount = isRepeating ? this._repeatCount : 0

        this.reset(false)
        this._repeatCount = savedRepeatCount

        if (isRepeating && this._repeatCount >= config.repeat!) {
            this._repeatCount = 0
            return
        }

        this._currentConfig = config
        if (this._repeatCount === 0) {
            this._delay = (this._currentConfig.delay ?? 0) * 1e-3
        }

        // >> Resolve Dynamic Plan via Base Class <<
        this._currentExecutionPlan = this._resolveExecutionPlan(
            config.keyframes,
            config.durations
        )

        const { keyMap, values } = resolveGroup(config.from)
        this._propertyKeyMap = keyMap
        this._state = values
        this._initialState = values

        this._status = 'PLAYING'
        this._clock.subscribe(this)
        this.notify()
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
        this._delay = 0
        this._state = []
        this._initialState = []
        this._propertyKeyMap = null
        this._currentExecutionPlan = null
        this._clock.unsubscribe(this)
        this._repeatCount = 0
        if (notify) this.notify()
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

    /**
     * When timeline updates, subscribes on update callback.
     * @param callback Subscription callback.
     * @returns Unsubscribe.
     */
    public onUpdate(callback: OnUpdateCallback<G>): () => void {
        this._onUpdateCallbacks.add(callback)
        return () => {
            this._onUpdateCallbacks.delete(callback)
        }
    }
}

/**
 * Create dynamic timeline. {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame RequestAnimationFrame API} based.
 * @param rootNode Root animation node.
 * @param clock [Custom clock]
 */
export function rafTimeline<G extends Groupable, Ctx = any>(
    rootNode: AnimationNode<G>,
    clock?: AnimationClockInterface
): RafAniTimeline<G, Ctx> {
    return new RafAniTimeline<G, Ctx>(rootNode, clock)
}
