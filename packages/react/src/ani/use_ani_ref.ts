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
import type { CSSProperties, RefObject } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

function applyStylesToRef<E extends HTMLElement>(
    ref: RefObject<E | null>,
    style: CSSProperties
): void {
    if (ref.current) {
        Object.assign(ref.current.style, style)
    }
}

/**
 * Event-based non-reactive(ref) ani animation hook
 *
 * @param ref - ref pointing to the DOM element to be animated.
 * @param props - Configuration including the timeline and event handlers.
 *
 * @returns timeline controller.
 */
export function useAniRef<
    G extends Groupable,
    E extends HTMLElement = HTMLElement,
>(
    ref: React.RefObject<E | null>,
    { timeline, initialValue, events, cleanupEvents = true }: AniRefProps<G>
): TimelineController<G> {
    const [manager] = useState(() =>
        events
            ? new EventManager<readonly EventKey[], AniRefContext<G>>(
                  Object.keys(events).map(EventManager.getEvtKey)
              )
            : null
    )

    const animeValue = useRef<AniGroup<G> | null>(initialValue ?? null)

    const controller = useMemo((): TimelineController<G> => {
        return {
            play: (config) => {
                animeValue.current = config.from
                timeline.play(config)
            },
            seek: timeline.seek,
            pause: timeline.pause,
            resume: timeline.resume,
            reset: () => {
                timeline.reset()
                // back to initial value
                animeValue.current = initialValue ?? null
                if (ref.current && animeValue.current) {
                    const styleObject = createStyleSheet(
                        animeValue.current as Record<string, number>,
                        timeline.currentConfig?.propertyResolver
                    )
                    applyStylesToRef(ref, styleObject)
                }
            },
        }
    }, [timeline, initialValue, ref])

    // >> animation subscription + direct style application.
    useEffect(() => {
        if (!timeline) return

        const unsubscribe = timeline.onUpdate((value) => {
            animeValue.current = value.state
            const styleObject = createStyleSheet(
                value.state as Record<string, number>,
                timeline.currentConfig?.propertyResolver
            )
            applyStylesToRef(ref, styleObject)
        })

        return () => unsubscribe()
    }, [timeline, ref])

    // >> event subscription
    useEffect(() => {
        if (!manager || !ref.current || !events) return

        const contextGetter = (): AniRefContext<G> => {
            return {
                current: animeValue.current,
                ...controller,
            }
        }

        manager.bind(ref.current)
        manager.attach(events)
        manager.setAnimeGetter(contextGetter)

        return () => {
            if (cleanupEvents) {
                manager.cleanupAll()
            }
        }
    }, [manager, ref, events, cleanupEvents, controller])

    return controller
}
