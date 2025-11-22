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
import type { CSSProperties, RefObject } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

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
    Element extends HTMLElement = HTMLElement,
>(
    ref: React.RefObject<Element | null>,
    {
        timeline,
        initialValue,
        events,
        cleanupEvents = true,
    }: AniRefProps<RafAniTimeline<G>, G>
): RafAniTimeline<G> {
    const [manager] = useState(() =>
        events
            ? new EventManager<readonly EventKey[], AniRefContext<G>>(
                  Object.keys(events).map(EventManager.getEvtKey)
              )
            : null
    )

    const animeValue = useRef<AniGroup<G> | null>(initialValue ?? null)

    const controller = useMemo((): RafAniTimeline<G> => {
        return {
            play: (config) => {
                animeValue.current = config.from as AniGroup<G>
                timeline.play(config)
            },
            seek: (time) => timeline.seek(time),
            pause: () => timeline.pause(),
            resume: () => timeline.resume(),
            reset: () => {
                timeline.reset()
                // back to initial value
                const initial = initialValue ?? null
                if (ref.current && initial) {
                    const styleObject = createStyleSheet(
                        initial as Record<string, number>,
                        timeline.currentConfig?.propertyResolver
                    )
                    applyStylesToRef(ref, styleObject)
                }
            },
            get currentConfig() {
                return timeline.currentConfig
            },
            onUpdate: (cb) => timeline.onUpdate(cb),
            getCurrentValue: () => timeline.getCurrentValue(),
        } as RafAniTimeline<G>
    }, [timeline, initialValue])

    // >> animation subscription + direct style application.
    useEffect(() => {
        if (!timeline || !ref.current) return

        const target = timeline.getCurrentValue() ?? initialValue
        const styleObject = createStyleSheet(
            target as Record<string, number>,
            timeline.currentConfig?.propertyResolver
        )
        applyStylesToRef(ref, styleObject)

        const unsubscribe = timeline.onUpdate((value) => {
            /**
             * !TODO: WebAnimation PRIORITY = This code will remove animation when executed.
             * if (!ref.current) return
             * ref.current.getAnimations().forEach((anim) => anim.cancel())
             */

            animeValue.current = value.state as AniGroup<G>
            const styleObject = createStyleSheet(
                value.state as Record<string, number>,
                timeline.currentConfig?.propertyResolver
            )
            applyStylesToRef(ref, styleObject)
        })
        return () => unsubscribe()
    }, [timeline, ref])

    // >> event subscription
    useLayoutEffect(() => {
        if (!manager || !ref.current || !events) return

        const contextGetter = (): AniRefContext<G> => {
            return {
                current: animeValue.current,
                ...controller,
            } as AniRefContext<G>
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
