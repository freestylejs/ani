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
import type { RefObject } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'

// `useLayoutEffect` warns during SSR (React 18); no-op there anyway.
const useIsoLayoutEffect =
    typeof window === 'undefined' ? useEffect : useLayoutEffect

interface Binding {
    el: HTMLElement
    timeline: unknown
    eventKeys: string
    detach: () => void
}

/**
 * Event-based non-reactive(ref) ani animation hook
 *
 * The element is (re)bound in a layout effect that runs after every render of
 * the owning component, so refs that attach later (conditional rendering)
 * receive the initial style and event handlers without any dependency on the
 * identity of `events` / `initialValue`. `events` handlers are read at event
 * time, so inline objects never cause listener churn.
 *
 * The hook never disposes the `timeline` it is given; it only detaches.
 *
 * @param ref - ref pointing to the DOM element to be animated.
 * @param props - Configuration including the timeline and event handlers.
 *
 * @returns timeline controller (stable per `timeline`).
 */
export function useAniRef<
    G extends Groupable,
    Element extends HTMLElement = HTMLElement,
>(
    ref: RefObject<Element | null>,
    props: AniRefProps<RafAniTimeline<G>, G>
): RafAniTimeline<G> {
    const { timeline } = props

    const latest = useRef(props)
    const animeValue = useRef<AniGroup<G> | null>(props.initialValue ?? null)
    const binding = useRef<Binding | null>(null)

    const controller = useMemo(
        () =>
            createTimelineController<G>(() => timeline, {
                onPlay: (config) => {
                    if (config.from) {
                        animeValue.current = config.from as AniGroup<G>
                    }
                },
                onReset: () => {
                    const initial = latest.current.initialValue ?? null
                    animeValue.current = initial
                    const el = binding.current?.el
                    if (el && initial) {
                        applyStyleSheet(
                            el,
                            createStyleSheet(
                                initial as Record<string, number>,
                                timeline.currentConfig?.propertyResolver
                            )
                        )
                    }
                },
            }),
        [timeline]
    )

    useIsoLayoutEffect(() => {
        latest.current = props
        const el = ref.current
        const events = props.events as Record<string, unknown> | undefined
        const eventKeys = events ? Object.keys(events).join(',') : ''

        const bound = binding.current
        if (
            bound &&
            bound.el === el &&
            bound.timeline === timeline &&
            bound.eventKeys === eventKeys
        ) {
            return
        }
        if (bound) {
            bound.detach()
            binding.current = null
        }
        if (!el) return

        const apply = (value: AniGroup<G>) => {
            // Element swapped out without this component re-rendering yet.
            if (ref.current !== el) return
            animeValue.current = value
            applyStyleSheet(
                el,
                createStyleSheet(
                    value as Record<string, number>,
                    timeline.currentConfig?.propertyResolver
                )
            )
        }

        const initial = timeline.getCurrentValue() ?? props.initialValue
        if (initial) apply(initial)

        const unsubscribe = timeline.onUpdate((value) => {
            apply(value.state as AniGroup<G>)
        })

        let manager: EventManager<
            readonly EventKey[],
            AniRefContext<G>
        > | null = null
        if (events && eventKeys) {
            manager = new EventManager<readonly EventKey[], AniRefContext<G>>(
                Object.keys(events).map(EventManager.getEvtKey)
            )
            manager.bind(el)
            // Dispatchers resolve the handler at event time.
            const dispatchers: Record<string, unknown> = {}
            for (const key of Object.keys(events)) {
                dispatchers[key] = (ctx: AniRefContext<G>, ev: Event) =>
                    (
                        latest.current.events as Record<
                            string,
                            | ((c: AniRefContext<G>, e: Event) => unknown)
                            | undefined
                        >
                    )?.[key]?.(ctx, ev)
            }
            manager.attach(dispatchers)
            manager.setAnimeGetter(
                () =>
                    ({
                        current: animeValue.current,
                        ...controller,
                    }) as AniRefContext<G>
            )
        }

        binding.current = {
            el,
            timeline,
            eventKeys,
            detach: () => {
                unsubscribe()
                if (manager && (latest.current.cleanupEvents ?? true)) {
                    manager.cleanupAll()
                }
            },
        }
    })

    useIsoLayoutEffect(
        () => () => {
            binding.current?.detach()
            binding.current = null
        },
        []
    )

    return controller
}
