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
import { computed, onBeforeUnmount, type Ref, ref, unref, watch } from 'vue'

function applyStylesToNode<E extends HTMLElement>(
    node: E,
    style: Record<string, string | number>
): void {
    Object.assign(node.style, style)
}

type VueAniRefProps<G extends Groupable> = Omit<
    AniRefProps<RafAniTimeline<G>, G>,
    'timeline'
> & {
    timeline: RafAniTimeline<G> | Ref<RafAniTimeline<G>>
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
}: VueAniRefProps<G>): readonly [Ref<HTMLElement | null>, RafAniTimeline<G>] {
    const elementRef = ref<HTMLElement | null>(null)
    let animeValue: AniGroup<G> | null = initialValue ?? null

    const currentTimeline = computed(() => unref(timeline))

    const controller: RafAniTimeline<G> = {
        play: (config) => {
            if (config.from) {
                animeValue = config.from as AniGroup<G>
            }
            currentTimeline.value.play(config)
        },
        seek: (time) => currentTimeline.value.seek(time),
        pause: () => currentTimeline.value.pause(),
        resume: () => currentTimeline.value.resume(),
        reset: () => {
            currentTimeline.value.reset()
            const resetVal = initialValue ?? null
            animeValue = resetVal
            if (elementRef.value && resetVal) {
                const styleObject = createStyleSheet(
                    resetVal as Record<string, number>,
                    currentTimeline.value.currentConfig?.propertyResolver
                )
                applyStylesToNode(elementRef.value, styleObject)
            }
        },
        get currentConfig() {
            return currentTimeline.value.currentConfig
        },
        onUpdate: (cb) => currentTimeline.value.onUpdate(cb),
        getCurrentValue: () => currentTimeline.value.getCurrentValue(),
    } as RafAniTimeline<G>

    // >> animation subscription + direct style application.
    watch(
        [currentTimeline, elementRef],
        ([tl, el], _, onCleanup) => {
            if (!el || !tl) return

            const target = tl.getCurrentValue() ?? initialValue
            if (target) {
                const styleObject = createStyleSheet(
                    target as Record<string, number>,
                    tl.currentConfig?.propertyResolver
                )
                applyStylesToNode(el, styleObject)
            }

            const unsubscribe = tl.onUpdate((value) => {
                animeValue = value.state
                const styleObject = createStyleSheet(
                    value.state as Record<string, number>,
                    tl.currentConfig?.propertyResolver
                )
                applyStylesToNode(el, styleObject)
            })

            onCleanup(() => {
                unsubscribe()
            })
        },
        { immediate: true }
    )

    // >> event subscription
    let manager: EventManager<readonly EventKey[], AniRefContext<G>> | null =
        null

    if (events) {
        manager = new EventManager(
            Object.keys(events).map(EventManager.getEvtKey)
        )
    }

    watch(elementRef, (el, _, onCleanup) => {
        if (!manager || !el || !events) return

        const contextGetter = (): AniRefContext<G> =>
            ({
                current: animeValue,
                ...controller,
            }) as AniRefContext<G>

        manager.bind(el)
        manager.attach(events)
        manager.setAnimeGetter(contextGetter)

        onCleanup(() => {
            if (cleanupEvents) {
                manager.cleanupAll()
            }
        })
    })

    onBeforeUnmount(() => {
        if (manager && cleanupEvents) {
            manager.cleanupAll()
        }
    })

    return [elementRef, controller]
}
