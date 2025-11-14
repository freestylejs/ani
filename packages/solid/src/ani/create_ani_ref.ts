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
import type { JSX } from 'solid-js'
import { createEffect, createMemo, onCleanup } from 'solid-js'
import { createStore, produce } from 'solid-js/store'

function applyStylesToRef<E extends HTMLElement>(
    el: E | null,
    style: JSX.CSSProperties
): void {
    if (el) {
        Object.assign(el.style, style)
    }
}

/**
 * Event-based non-reactive(ref) ani animation hook
 *
 * @param props - Configuration including the timeline accessor and event handlers.
 * @returns `[ref, controller]`
 */
export function createAniRef<
    G extends Groupable,
    E extends HTMLElement = HTMLElement,
>(
    props: AniRefProps<G, true>
): readonly [(el: E) => void, TimelineController<G>] {
    let element: E | null = null

    const { timeline, initialValue, events, cleanupEvents = true } = props

    const [latestValue, setLatestValue] = createStore<AniGroup<G>>(
        initialValue ?? ({} as AniGroup<G>)
    )

    const manager = events
        ? new EventManager<readonly EventKey[], AniRefContext<G>>(
              Object.keys(events).map(EventManager.getEvtKey)
          )
        : null

    const controller = createMemo((): TimelineController<G> => {
        const tl = timeline()
        return {
            play: (config) => {
                setLatestValue(
                    produce((s) => Object.assign(s as G, config.from))
                )
                tl?.play(config)
            },
            pause: tl.pause,
            resume: tl.resume,
            seek: tl.seek,
            reset: () => {
                tl?.reset()
                const resetVal = initialValue ?? ({} as G)
                setLatestValue(produce((s) => Object.assign(s as G, resetVal)))
                if (element) {
                    const styleObject = createStyleSheet(
                        resetVal as Record<string, number>,
                        tl.currentConfig?.propertyResolver
                    )
                    applyStylesToRef(element, styleObject)
                }
            },
        }
    })

    // >> animation subscription + direct style application.
    createEffect(() => {
        const tl = timeline()
        if (!element) return

        const unsubscribe = tl.onUpdate((value) => {
            setLatestValue(produce((s) => Object.assign(s as G, value.state)))
            const styleObject = createStyleSheet(
                value.state as Record<string, number>,
                tl.currentConfig?.propertyResolver
            )
            applyStylesToRef(element, styleObject)
        })

        onCleanup(unsubscribe)
    })

    // >> event subscription
    createEffect(() => {
        if (!manager || !element || !events) return

        const contextGetter = (): AniRefContext<G> => {
            return {
                current: latestValue,
                ...controller(),
            }
        }

        manager.bind(element)
        manager.attach(events)
        manager.setAnimeGetter(contextGetter)

        onCleanup(() => {
            if (cleanupEvents) {
                manager.cleanupAll()
            }
        })
    })

    // >> ref updater
    const refCallback = (el: E) => {
        element = el
    }

    return [refCallback, controller()] as const
}
