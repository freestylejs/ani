import type { AnimationNode, Groupable } from '../ani'
import { compileToKeyframes, type WebAniKeyframe } from './compiler'

export interface WebAniTimelineConfig<G extends Groupable> {
    from: G
    repeat?: number
    delay?: number // ms
}

export class WebAniTimeline<G extends Groupable> {
    private _animation: Animation | null = null
    private _keyframes: WebAniKeyframe[] = []

    constructor(public readonly rootNode: AnimationNode<G>) {}

    public play(
        target: Element,
        config: WebAniTimelineConfig<G>
    ): Animation | null {
        if (this._animation) {
            this._animation.cancel()
        }

        this._keyframes = compileToKeyframes(this.rootNode, config.from)

        if (this._keyframes.length === 0) {
            return null
        }

        const totalDurationMs = this.rootNode.duration * 1000

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

    public cancel(): void {
        this._animation?.cancel()
        this._animation = null
    }

    public seek(time: number): void {
        if (this._animation) {
            this._animation.currentTime = time * 1000
        }
    }

    public get nativeAnimation(): Animation | null {
        return this._animation
    }
}

export function webTimeline<G extends Groupable>(
    rootNode: AnimationNode<G>
): WebAniTimeline<G> {
    return new WebAniTimeline(rootNode)
}
