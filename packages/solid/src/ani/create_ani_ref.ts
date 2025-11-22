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
import type { JSX } from 'solid-js'
import { createEffect, createMemo, onCleanup } from 'solid-js'

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
    props: AniRefProps<RafAniTimeline<G>, G, true>
): readonly [(el: E) => void, RafAniTimeline<G>] {
    let element: E | null = null

    const { timeline, initialValue, events, cleanupEvents = true } = props

    let animeValue: AniGroup<G> | null = initialValue ?? null

    const manager = events
        ? new EventManager<readonly EventKey[], AniRefContext<G>>(
              Object.keys(events).map(EventManager.getEvtKey)
          )
        : null

    const controller = createMemo((): RafAniTimeline<G> => {
        const tl = timeline()
        return {
            play: (config) => {
                if (config.from) {
                    animeValue = config.from as AniGroup<G>
                }
                tl?.play(config)
            },
            seek: (time) => tl.seek(time),
            pause: () => tl.pause(),
            resume: () => tl.resume(),
            reset: () => {
                tl?.reset()
                const resetVal = initialValue ?? null
                animeValue = resetVal
                if (element && resetVal) {
                    const styleObject = createStyleSheet(
                        resetVal as Record<string, number>,
                        tl.currentConfig?.propertyResolver
                    )
                    applyStylesToRef(element, styleObject)
                }
            },
            get currentConfig() {
                return tl.currentConfig
            },
            onUpdate: (cb) => tl.onUpdate(cb),
            getCurrentValue: () => tl.getCurrentValue(),
        } as RafAniTimeline<G>
    })

    // >> animation subscription + direct style application.
    createEffect(() => {
        const tl = timeline()
        if (!element) return

        const target = tl.getCurrentValue() ?? initialValue
        if (target) {
            const styleObject = createStyleSheet(
                target as Record<string, number>,
                tl.currentConfig?.propertyResolver
            )
            applyStylesToRef(element, styleObject)
        }

        const unsubscribe = tl.onUpdate((value) => {
            animeValue = value.state as AniGroup<G>
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
                current: animeValue,
                ...controller(),
            } as AniRefContext<G>
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
