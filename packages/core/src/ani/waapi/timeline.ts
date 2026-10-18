import type { Groupable } from '~/ani/core'
import {
    TimelineBase,
    type TimelineCommonConfig,
    toIterationCount,
} from '~/ani/core'
import type { AnimationNode } from '~/nodes'
import type { Resolver } from '~/style'
import { compileToKeyframes, type WebAniKeyframe } from './compiler'

interface CachedKeyframes {
    keys: string[]
    values: number[]
    resolver: Resolver<Record<string, number>> | undefined
    keyframes: WebAniKeyframe[]
}

const MAX_CACHE_ENTRIES = 8
// Compiled keyframes depend only on (plan, from, resolver) and the plan is a
// pure function of the root node, so every timeline built over the same node
// (e.g. one per element) shares the work. Plans with runtime overrides are not
// cached.
const keyframeCache = new WeakMap<object, CachedKeyframes[]>()

function sameFrom(entry: CachedKeyframes, from: Record<string, number>) {
    const keys = Object.keys(from)
    if (keys.length !== entry.keys.length) return false
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] !== entry.keys[i] || from[keys[i]!] !== entry.values[i]) {
            return false
        }
    }
    return true
}

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

export class WebAniTimeline<G extends Groupable> extends TimelineBase<
    G,
    [target: Element, config: WebAniTimelineConfig<G>]
> {
    private _animation: Animation | null = null
    private _keyframes: WebAniKeyframe[] = []
    private _delayMs: number = 0
    private _paused = false

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
        // never leave a previous animation running behind a failed/empty play
        if (this._animation) {
            this._animation.cancel()
            this._animation = null
        }
        this._paused = false

        this._currentExecutionPlan = this._resolveExecutionPlan(
            config.keyframes,
            config.durations
        )

        this._keyframes = this._compile(config)

        if (this._keyframes.length === 0) {
            return null
        }

        const totalDurationMs =
            this._currentExecutionPlan.reduce(
                (max, seg) => Math.max(max, seg.endTime),
                0
            ) * 1000
        const iterations = toIterationCount(config.repeat)

        this._delayMs = config.delay ?? 0
        this._paused = false

        const effect = new KeyframeEffect(target, this._keyframes, {
            duration: totalDurationMs,
            iterations:
                // Infinite iterations require a positive duration per spec.
                totalDurationMs === 0 && iterations === Infinity
                    ? 1
                    : iterations,
            delay: this._delayMs,
            fill: 'forwards',
            ...config.keyframeEffect,
        })

        this._animation = new Animation(effect, document.timeline)
        this._animation.play()
        return this._animation
    }

    private _compile(config: WebAniTimelineConfig<G>): WebAniKeyframe[] {
        const plan = this._currentExecutionPlan!
        const resolver = config.propertyResolver as
            | Resolver<Record<string, number>>
            | undefined
        const cacheable =
            !config.keyframes &&
            !config.durations &&
            !Array.isArray(config.from)

        if (cacheable) {
            const entries = keyframeCache.get(this.rootNode)
            const from = config.from as Record<string, number>
            const hit = entries?.find(
                (entry) => entry.resolver === resolver && sameFrom(entry, from)
            )
            if (hit) return hit.keyframes
        }

        const keyframes = compileToKeyframes(plan, config.from, resolver)

        if (cacheable) {
            const from = config.from as Record<string, number>
            const entries = keyframeCache.get(this.rootNode) ?? []
            if (entries.length >= MAX_CACHE_ENTRIES) entries.shift()
            entries.push({
                keys: Object.keys(from),
                values: Object.values(from),
                resolver,
                keyframes,
            })
            keyframeCache.set(this.rootNode, entries)
        }
        return keyframes
    }

    public pause(): void {
        this._paused = true
        this._animation?.pause()
    }
    public resume(): void {
        // Parity with the RAF engine: resume is a no-op unless paused.
        if (!this._paused) return
        this._paused = false
        this._animation?.play()
    }

    public reset(): void {
        this._animation?.cancel()
        this._animation = null
        this._paused = false
    }

    /**
     * Alias of reset() for WAAPI naming parity.
     */
    public cancel(): void {
        this.reset()
    }

    public seek(targetTime: number): void {
        if (!this._animation) return
        const seekTime = Math.max(0, Math.min(targetTime, this.duration))
        this._animation.currentTime = seekTime * 1000 + this._delayMs
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
