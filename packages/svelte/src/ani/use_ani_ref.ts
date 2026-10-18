import {
    type AniGroup,
    type AniRefContext,
    type AniRefProps,
    applyStyleSheet,
    createStyleSheet,
    createTimelineController,
    type EventKey,
    EventManager,
    type Groupable,
    type RafAniTimeline,
} from '@freestylejs/ani-core'
import type { Action } from 'svelte/action'
import { get, type Readable } from 'svelte/store'

export function isReadable<T>(value: unknown): value is Readable<T> {
    return (
        !!value &&
        typeof (value as { subscribe?: unknown }).subscribe === 'function'
    )
}

export type SvelteAniRefProps<G extends Groupable> = Omit<
    AniRefProps<RafAniTimeline<G>, G>,
    'timeline'
> & {
    timeline: RafAniTimeline<G> | Readable<RafAniTimeline<G>>
}

/**
 * Event-based non-reactive(ref) ani animation action for Svelte.
 *
 * `timeline` may be a timeline or a store of one; swaps are followed. The
 * returned action may be applied to several nodes: each keeps its own
 * subscription and listeners, and the controller's `reset()` restyles all of
 * them. The action never disposes a timeline it is given.
 *
 * @param props - Configuration including the timeline and event handlers.
 *
 * @returns A tuple containing the Svelte Action and the timeline controller.
 */
export function useAniRef<G extends Groupable>({
    timeline,
    initialValue,
    events,
    cleanupEvents = true,
}: SvelteAniRefProps<G>): readonly [
    Action<HTMLElement, any>,
    RafAniTimeline<G>,
] {
    let animeValue: AniGroup<G> | null = initialValue ?? null
    const nodes = new Set<HTMLElement>()

    const getTimeline = (): RafAniTimeline<G> => {
        return isReadable<RafAniTimeline<G>>(timeline)
            ? get(timeline)
            : timeline
    }

    const controller = createTimelineController<G>(getTimeline, {
        onPlay: (config) => {
            if (config.from) {
                animeValue = config.from as AniGroup<G>
            }
        },
        onReset: () => {
            animeValue = initialValue ?? null
            if (!initialValue) return
            const resolver = getTimeline().currentConfig?.propertyResolver
            for (const node of nodes) {
                applyStyleSheet(
                    node,
                    createStyleSheet(
                        initialValue as Record<string, number>,
                        resolver
                    )
                )
            }
        },
    })

    const action: Action<HTMLElement, any> = (node) => {
        nodes.add(node)
        let unsubscribeTimelineUpdate: (() => void) | undefined

        const setupTimeline = (tl: RafAniTimeline<G>) => {
            unsubscribeTimelineUpdate?.()

            // Apply immediate/initial value
            const target = tl.getCurrentValue() ?? initialValue
            if (target) {
                applyStyleSheet(
                    node,
                    createStyleSheet(
                        target as Record<string, number>,
                        tl.currentConfig?.propertyResolver
                    )
                )
            }

            unsubscribeTimelineUpdate = tl.onUpdate((value) => {
                animeValue = value.state
                applyStyleSheet(
                    node,
                    createStyleSheet(
                        value.state as Record<string, number>,
                        tl.currentConfig?.propertyResolver
                    )
                )
            })
        }

        let unsubscribeStore: (() => void) | undefined

        if (isReadable<RafAniTimeline<G>>(timeline)) {
            unsubscribeStore = timeline.subscribe(setupTimeline)
        } else {
            setupTimeline(timeline)
        }

        // Events
        let manager: EventManager<
            readonly EventKey[],
            AniRefContext<G>
        > | null = null
        if (events) {
            manager = new EventManager(
                Object.keys(events).map(EventManager.getEvtKey)
            )
            manager.bind(node)
            manager.attach(events)
            manager.setAnimeGetter(
                () =>
                    ({
                        current: animeValue,
                        ...controller,
                    }) as AniRefContext<G>
            )
        }

        return {
            destroy() {
                nodes.delete(node)
                unsubscribeTimelineUpdate?.()
                unsubscribeStore?.()
                if (manager && cleanupEvents) {
                    manager.cleanupAll()
                }
            },
        }
    }

    return [action, controller]
}
