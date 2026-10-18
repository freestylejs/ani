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
import {
    computed,
    onBeforeUnmount,
    type Ref,
    ref,
    toRaw,
    unref,
    watch,
} from 'vue'

export type VueAniRefProps<G extends Groupable> = Omit<
    AniRefProps<RafAniTimeline<G>, G>,
    'timeline'
> & {
    timeline: RafAniTimeline<G> | Ref<RafAniTimeline<G>>
}

/**
 * Event-based non-reactive(ref) ani animation composable for Vue.
 *
 * `timeline` may be a timeline or a ref of one; swaps are followed
 * synchronously. The composable never disposes a timeline it is given.
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

    // toRaw: a user-made `ref(timeline)` is a deep reactive proxy; the clock
    // and the timeline internals must only ever see the raw instance.
    const currentTimeline = computed(() => toRaw(unref(timeline)))

    const controller = createTimelineController<G>(
        () => currentTimeline.value,
        {
            onPlay: (config) => {
                if (config.from) {
                    animeValue = config.from as AniGroup<G>
                }
            },
            onReset: () => {
                animeValue = initialValue ?? null
                if (elementRef.value && initialValue) {
                    applyStyleSheet(
                        elementRef.value,
                        createStyleSheet(
                            initialValue as Record<string, number>,
                            currentTimeline.value.currentConfig
                                ?.propertyResolver
                        )
                    )
                }
            },
        }
    )

    // >> animation subscription + direct style application.
    // `sync`: a timeline swap must not leave a frame-sized gap before the
    // new timeline is bound.
    watch(
        [currentTimeline, elementRef],
        ([tl, el], _, onCleanup) => {
            if (!el || !tl) return

            const target = tl.getCurrentValue() ?? initialValue
            if (target) {
                applyStyleSheet(
                    el,
                    createStyleSheet(
                        target as Record<string, number>,
                        tl.currentConfig?.propertyResolver
                    )
                )
            }

            const unsubscribe = tl.onUpdate((value) => {
                animeValue = value.state
                applyStyleSheet(
                    el,
                    createStyleSheet(
                        value.state as Record<string, number>,
                        tl.currentConfig?.propertyResolver
                    )
                )
            })

            onCleanup(unsubscribe)
        },
        { immediate: true, flush: 'sync' }
    )

    // >> event subscription
    let manager: EventManager<readonly EventKey[], AniRefContext<G>> | null =
        null

    if (events) {
        manager = new EventManager(
            Object.keys(events).map(EventManager.getEvtKey)
        )
    }

    watch(
        elementRef,
        (el, _, onCleanup) => {
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
                    manager?.cleanupAll()
                }
            })
        },
        { flush: 'sync' }
    )

    onBeforeUnmount(() => {
        if (manager && cleanupEvents) {
            manager.cleanupAll()
        }
    })

    return [elementRef, controller]
}
