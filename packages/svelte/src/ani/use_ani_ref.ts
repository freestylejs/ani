import {
    type AniGroup,
    type AniRefContext,
    type AniRefProps,
    createStyleSheet,
    type EventKey,
    EventManager,
    type Groupable,
    type TimelineController,
} from '@freestylejs/ani-core'
import type { Action } from 'svelte/action'

function applyStylesToNode<E extends HTMLElement>(
    node: E,
    style: Record<string, string | number>
): void {
    Object.assign(node.style, style)
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
}: AniRefProps<G>): readonly [Action<HTMLElement, any>, TimelineController<G>] {
    let animeValue: AniGroup<G> | null = initialValue ?? null

    const controller: TimelineController<G> = {
        play: (config) => {
            animeValue = config.from
            timeline.play(config)
        },
        seek: timeline.seek,
        pause: timeline.pause,
        resume: timeline.resume,
        reset: () => {
            timeline.reset()
            animeValue = initialValue ?? null
        },
    }

    const action: Action<HTMLElement, any> = (node) => {
        if (initialValue) {
            const styleObject = createStyleSheet(
                initialValue as Record<string, number>,
                timeline.currentConfig?.propertyResolver
            )
            applyStylesToNode(node, styleObject)
        }

        const unsubscribe = timeline.onUpdate((value) => {
            animeValue = value.state
            const styleObject = createStyleSheet(
                value.state as Record<string, number>,
                timeline.currentConfig?.propertyResolver
            )
            applyStylesToNode(node, styleObject)
        })

        let manager: EventManager<
            readonly EventKey[],
            AniRefContext<G>
        > | null = null
        if (events) {
            manager = new EventManager(
                Object.keys(events).map(EventManager.getEvtKey)
            )
            const contextGetter = (): AniRefContext<G> => ({
                current: animeValue,
                ...controller,
            })
            manager.bind(node)
            manager.attach(events)
            manager.setAnimeGetter(contextGetter)
        }

        return {
            destroy() {
                unsubscribe()
                if (manager && cleanupEvents) {
                    manager.cleanupAll()
                }
            },
        }
    }

    return [action, controller]
}
