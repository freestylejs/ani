import type { Groupable } from '~/ani/core'
import {
    assertConfigKeys,
    type RafTimeline,
    type RafTimelineConfig,
} from '~/ani/raf'

/**
 * Every public member of `T`, required. Used with `satisfies` so that adding
 * a public member to `RafTimeline` without forwarding it fails `tsc`.
 */
export type TimelineMembers<T> = { [K in keyof T]-?: T[K] }

export interface TimelineControllerHooks<G extends Groupable> {
    /**
     * Runs before every forwarded `play()`.
     */
    onPlay?: (config: RafTimelineConfig<G>) => void
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
export function createTimelineController<G extends Groupable>(
    getTimeline: () => RafTimeline<G>,
    hooks: TimelineControllerHooks<G> = {}
): RafTimeline<G> {
    return {
        get duration() {
            return getTimeline().duration
        },
        get status() {
            return getTimeline().status
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
        // A call the timeline rejects (extra arguments, removed config keys)
        // throws before the hook runs: the hook never sees a play that does
        // not happen.
        play: (config, ...extra: unknown[]) => {
            if (extra.length === 0) {
                assertConfigKeys(config)
                hooks.onPlay?.(config)
            }
            return getTimeline().play(config, ...(extra as []))
        },
        drive: (progress, config) => getTimeline().drive(progress, config),
        seek: (time) => getTimeline().seek(time),
        pause: () => getTimeline().pause(),
        resume: () => getTimeline().resume(),
        reset: (...extra: unknown[]) => {
            getTimeline().reset(...(extra as []))
            hooks.onReset?.()
        },
        dispose: () => getTimeline().dispose(),
        bind: (target, options) => getTimeline().bind(target, options),
        onUpdate: (callback) => getTimeline().onUpdate(callback),
    } satisfies TimelineMembers<RafTimeline<G>>
}
