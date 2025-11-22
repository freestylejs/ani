import {
    type AniGroup,
    type AniRefContext,
    type AniRefProps,
    createStyleSheet,
    type EventKey,
    EventManager,
    type Groupable,
    type RafAniTimeline,
} from '@freestylejs/ani-core'
import type { Action } from 'svelte/action'
import { get, type Readable } from 'svelte/store'

function applyStylesToNode<E extends HTMLElement>(
    node: E,
    style: Record<string, string | number>
): void {
    Object.assign(node.style, style)
}

function isReadable<T>(value: any): value is Readable<T> {
    return value && typeof value.subscribe === 'function'
}

type SvelteAniRefProps<G extends Groupable> = Omit<
    AniRefProps<RafAniTimeline<G>, G>,
    'timeline'
> & {
    timeline: RafAniTimeline<G> | Readable<RafAniTimeline<G>>
}

/**
 * Event-based non-reactive(ref) ani animation action for Svelte.
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
    let element: HTMLElement | null = null

    const getTimeline = (): RafAniTimeline<G> => {
        return isReadable(timeline) ? get(timeline) : timeline
    }

    const controller: RafAniTimeline<G> = {
        play: (config) => {
            if (config.from) {
                animeValue = config.from as AniGroup<G>
            }
            getTimeline().play(config)
        },
        seek: (time) => getTimeline().seek(time),
        pause: () => getTimeline().pause(),
        resume: () => getTimeline().resume(),
        reset: () => {
            const tl = getTimeline()
            tl.reset()
            const resetVal = initialValue ?? null
            animeValue = resetVal

            if (element && resetVal) {
                const styleObject = createStyleSheet(
                    resetVal as Record<string, number>,
                    tl.currentConfig?.propertyResolver
                )
                applyStylesToNode(element, styleObject)
            }
        },
        get currentConfig() {
            return getTimeline().currentConfig
        },
        onUpdate: (cb) => getTimeline().onUpdate(cb),
        getCurrentValue: () => getTimeline().getCurrentValue(),
    } as RafAniTimeline<G>

    const action: Action<HTMLElement, any> = (node) => {
        element = node
        let unsubscribeTimelineUpdate: (() => void) | undefined

        const setupTimeline = (tl: RafAniTimeline<G>) => {
            if (unsubscribeTimelineUpdate) {
                unsubscribeTimelineUpdate()
            }

            // Apply immediate/initial value
            const target = tl.getCurrentValue() ?? initialValue
            if (target) {
                const styleObject = createStyleSheet(
                    target as Record<string, number>,
                    tl.currentConfig?.propertyResolver
                )
                applyStylesToNode(node, styleObject)
            }

            unsubscribeTimelineUpdate = tl.onUpdate((value) => {
                animeValue = value.state
                const styleObject = createStyleSheet(
                    value.state as Record<string, number>,
                    tl.currentConfig?.propertyResolver
                )
                applyStylesToNode(node, styleObject)
            })
        }

        let unsubscribeStore: (() => void) | undefined

        if (isReadable(timeline)) {
            unsubscribeStore = timeline.subscribe((tl) => {
                setupTimeline(tl)
            })
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
            const contextGetter = (): AniRefContext<G> =>
                ({
                    current: animeValue,
                    ...controller,
                }) as AniRefContext<G>
            manager.bind(node)
            manager.attach(events)
            manager.setAnimeGetter(contextGetter)
        }

        return {
            destroy() {
                element = null
                if (unsubscribeTimelineUpdate) unsubscribeTimelineUpdate()
                if (unsubscribeStore) unsubscribeStore()
                if (manager && cleanupEvents) {
                    manager.cleanupAll()
                }
            },
        }
    }

    return [action, controller]
}
