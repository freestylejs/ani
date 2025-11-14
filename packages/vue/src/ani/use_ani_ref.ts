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
import { onMounted, onUnmounted, type Ref, ref } from 'vue'

function applyStylesToNode<E extends HTMLElement>(
    node: E,
    style: Record<string, string | number>
): void {
    Object.assign(node.style, style)
}

/**
 * Event-based non-reactive(ref) ani animation composable for Vue.
 *
 * @param props - Configuration including the timeline and event handlers.
 *
 * @returns A tuple containing the template ref and the timeline controller.
 */
export function useAniRef<G extends Groupable>({
    timeline,
    initialValue,
    events,
    cleanupEvents = true,
}: AniRefProps<G>): readonly [Ref<HTMLElement | null>, TimelineController<G>] {
    const elementRef = ref<HTMLElement | null>(null)
    const animeValue = ref<AniGroup<G> | null>(
        initialValue ?? null
    ) as Ref<AniGroup<G> | null>

    const controller: TimelineController<G> = {
        play: (config) => {
            animeValue.value = config.from
            timeline.play(config)
        },
        seek: timeline.seek,
        pause: timeline.pause,
        resume: timeline.resume,
        reset: () => {
            timeline.reset()
            animeValue.value = initialValue ?? null
        },
    }

    let unsubscribe: () => void
    let manager: EventManager<readonly EventKey[], AniRefContext<G>> | null =
        null

    onMounted(() => {
        if (!elementRef.value) {
            return
        }

        if (initialValue) {
            const styleObject = createStyleSheet(
                initialValue as Record<string, number>,
                timeline.currentConfig?.propertyResolver
            )
            applyStylesToNode(elementRef.value, styleObject)
        }

        unsubscribe = timeline.onUpdate((value) => {
            animeValue.value = value.state
            if (elementRef.value) {
                const styleObject = createStyleSheet(
                    value.state as Record<string, number>,
                    timeline.currentConfig?.propertyResolver
                )
                applyStylesToNode(elementRef.value, styleObject)
            }
        })

        if (events && elementRef.value) {
            manager = new EventManager(
                Object.keys(events).map(EventManager.getEvtKey)
            )
            const contextGetter = (): AniRefContext<G> => ({
                current: animeValue.value,
                ...controller,
            })
            manager.bind(elementRef.value)
            manager.attach(events)
            manager.setAnimeGetter(contextGetter)
        }
    })

    onUnmounted(() => {
        if (unsubscribe) {
            unsubscribe()
        }
        if (manager && cleanupEvents) {
            manager.cleanupAll()
        }
    })

    return [elementRef, controller]
}
