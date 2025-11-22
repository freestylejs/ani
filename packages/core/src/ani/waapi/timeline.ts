import type { Groupable } from '~/ani/core'
import { TimelineBase, type TimelineCommonConfig } from '~/ani/core'
import type { AnimationNode } from '~/nodes'
import { compileToKeyframes, type WebAniKeyframe } from './compiler'

export interface WebAniTimelineConfig<G extends Groupable>
    extends TimelineCommonConfig<G> {
    /**
     * Web Animations API config.
     *
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/KeyframeEffect/KeyframeEffect#options KeyframeEffect Options}.
     */
    keyframeEffect?: Omit<
        KeyframeEffectOptions,
        'duration' | 'iterations' | 'delay'
    >
}

export class WebAniTimeline<G extends Groupable> extends TimelineBase<G> {
    private _animation: Animation | null = null
    private _keyframes: WebAniKeyframe[] = []

    constructor(rootNode: AnimationNode<G>) {
        super(rootNode)
    }

    /**
     * Plays animation.
     * @param target Target element.
     * @param config {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API Web Animations API} based config.
     */
    public play(
        target: Element,
        config: WebAniTimelineConfig<G>
    ): Animation | null {
        if (this._animation) {
            this._animation.cancel()
        }

        this._currentExecutionPlan = this._resolveExecutionPlan(
            config.keyframes,
            config.durations
        )

        this._keyframes = compileToKeyframes(
            this._currentExecutionPlan,
            config.from
        )

        if (this._keyframes.length === 0) {
            return null
        }

        const totalDurationMs =
            this._currentExecutionPlan.reduce(
                (max, seg) => Math.max(max, seg.endTime),
                0
            ) * 1000

        const effect = new KeyframeEffect(target, this._keyframes, {
            duration: totalDurationMs,
            iterations: config.repeat ?? 1,
            delay: config.delay ?? 0,
            fill: 'forwards',
        })

        this._animation = new Animation(effect, document.timeline)
        this._animation.play()
        return this._animation
    }

    public pause(): void {
        this._animation?.pause()
    }
    public resume(): void {
        this._animation?.play()
    }

    public reset(): void {
        this._animation?.cancel()
        this._animation = null
    }

    public seek(targetTime: number): void {
        if (this._animation) {
            this._animation.currentTime = targetTime * 1000
        }
    }

    /**
     * Native animation object.
     *
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Animation Animation}.
     */
    public get nativeAnimation(): Animation | null {
        return this._animation
    }
}

/**
 * Create web timeline. {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API Web Animations API} based.
 * @param rootNode Root animation node.
 */
export function webTimeline<G extends Groupable>(
    rootNode: AnimationNode<G>
): WebAniTimeline<G> {
    return new WebAniTimeline(rootNode)
}
