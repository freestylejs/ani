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
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js'

/**
 * Event-based non-reactive(ref) ani animation hook
 *
 * `timeline` is an accessor; swaps are followed and the returned controller
 * always targets the current timeline. The hook never disposes a timeline it
 * is given.
 *
 * @param props - Configuration including the timeline accessor and event handlers.
 * @returns `[ref, controller]`
 */
export function createAniRef<
    G extends Groupable,
    E extends HTMLElement = HTMLElement,
>(
    props: AniRefProps<RafAniTimeline<G>, G, true>
): readonly [(el: E) => void, RafAniTimeline<G>] {
    // Reactive element holder so late-mounted refs re-trigger effects.
    const [element, setElement] = createSignal<E | null>(null)

    const { timeline, initialValue, events, cleanupEvents = true } = props

    let animeValue: AniGroup<G> | null = initialValue ?? null

    const manager = events
        ? new EventManager<readonly EventKey[], AniRefContext<G>>(
              Object.keys(events).map(EventManager.getEvtKey)
          )
        : null

    const controller = createTimelineController<G>(() => untrack(timeline), {
        onPlay: (config) => {
            if (config.from) {
                animeValue = config.from as AniGroup<G>
            }
        },
        onReset: () => {
            animeValue = initialValue ?? null
            const el = untrack(element)
            if (el && initialValue) {
                applyStyleSheet(
                    el,
                    createStyleSheet(
                        initialValue as Record<string, number>,
                        untrack(timeline).currentConfig?.propertyResolver
                    )
                )
            }
        },
    })

    // >> animation subscription + direct style application.
    createEffect(() => {
        const tl = timeline()
        const el = element()
        if (!el) return

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
            animeValue = value.state as AniGroup<G>
            applyStyleSheet(
                el,
                createStyleSheet(
                    value.state as Record<string, number>,
                    tl.currentConfig?.propertyResolver
                )
            )
        })

        onCleanup(unsubscribe)
    })

    // >> event subscription
    createEffect(() => {
        const el = element()
        if (!manager || !el || !events) return

        const contextGetter = (): AniRefContext<G> => {
            return {
                current: animeValue,
                ...controller,
            } as AniRefContext<G>
        }

        manager.bind(el)
        manager.attach(events)
        manager.setAnimeGetter(contextGetter)

        onCleanup(() => {
            if (cleanupEvents) {
                manager.cleanupAll()
            }
        })
    })

    // Drop the element reference with the owner.
    onCleanup(() => setElement(null))

    // >> ref updater
    const refCallback = (el: E) => {
        setElement(() => el)
    }

    return [refCallback, controller] as const
}
