import type { Groupable } from '~/ani/core'
import type { RafAniTimeline, RafTimeline, RafTimelineConfig } from '~/ani/raf'

/**
 * Every public member of `T`, required. Used with `satisfies` so that adding
 * a public member to `RafAniTimeline` without forwarding it fails `tsc`.
 */
export type TimelineMembers<T> = { [K in keyof T]-?: T[K] }

export interface TimelineControllerHooks<G extends Groupable, Ctx = any> {
    /**
     * Runs before every forwarded `play()`.
     */
    onPlay?: (config: RafTimelineConfig<G, Ctx>) => void
    /**
     * Runs after every forwarded `reset()`.
     */
    onReset?: () => void
}

/**
 * Stable timeline facade for framework bindings. Every public member is
 * forwarded to whichever timeline `getTimeline()` returns *at call time*, so
 * the facade never goes stale when the bound timeline is swapped (e.g. a
 * state machine transition).
 *
 * `dispose` is forwarded as-is: bindings never call it on timelines they were
 * handed, only the user may.
 */
export function createTimelineController<G extends Groupable, Ctx = any>(
    getTimeline: () => RafAniTimeline<G, Ctx>,
    hooks?: TimelineControllerHooks<G, Ctx>
): RafAniTimeline<G, Ctx>
export function createTimelineController<G extends Groupable>(
    getTimeline: () => RafTimeline<G>,
    hooks?: TimelineControllerHooks<G>
): RafTimeline<G>
export function createTimelineController<G extends Groupable, Ctx = any>(
    getTimelineOrV2: () => RafAniTimeline<G, Ctx> | RafTimeline<G>,
    hooks: TimelineControllerHooks<G, Ctx> = {}
): RafAniTimeline<G, Ctx> {
    // The V2 overload only types the result as `RafTimeline`; the forwarded
    // 1.x members are reached only through the `RafAniTimeline` overload.
    const getTimeline = getTimelineOrV2 as () => RafAniTimeline<G, Ctx>
    const forwarded = {
        get duration() {
            return getTimeline().duration
        },
        get status() {
            return getTimeline().status
        },
        get currentConfig() {
            return getTimeline().currentConfig
        },
        get config() {
            return getTimeline().config
        },
        get value() {
            return getTimeline().value
        },
        get velocity() {
            return getTimeline().velocity
        },
        play: (config, canBeIntercepted) => {
            hooks.onPlay?.(config)
            return getTimeline().play(config, canBeIntercepted)
        },
        update: (dt) => getTimeline().update(dt),
        seek: (time) => getTimeline().seek(time),
        pause: () => getTimeline().pause(),
        resume: () => getTimeline().resume(),
        reset: (notify, unsubscribeClock) => {
            getTimeline().reset(notify, unsubscribeClock)
            hooks.onReset?.()
        },
        dispose: () => getTimeline().dispose(),
        commit: () => getTimeline().commit(),
        bind: (target, options) => getTimeline().bind(target, options),
        onUpdate: (callback) => getTimeline().onUpdate(callback),
        getCurrentValue: () => getTimeline().getCurrentValue(),
        getCurrentVelocity: () => getTimeline().getCurrentVelocity(),
    } satisfies TimelineMembers<RafAniTimeline<G, Ctx>>

    // The class has private fields, so a structural literal can never be
    // assigned to it; `satisfies` above is what proves the public surface is
    // complete.
    return forwarded as unknown as RafAniTimeline<G, Ctx>
}
