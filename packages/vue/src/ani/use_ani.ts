import type { AniGroup, Groupable, RafAniTimeline } from '@freestylejs/ani-core'
import { createTimelineController } from '@freestylejs/ani-core'
import {
    computed,
    onBeforeUnmount,
    onMounted,
    type Ref,
    shallowRef,
    toRaw,
    unref,
    watch,
} from 'vue'

/**
 * Reactive ani animation composable.
 *
 * `timeline` may be a timeline or a ref of one; swaps are followed. The value
 * is a `shallowRef`: each frame replaces it wholesale, nothing is proxied.
 * Subscribes on mount only (SSR renders `initialValue`, retains nothing).
 *
 * @returns `[value, controller]`; the controller follows timeline swaps.
 */
export function useAni<G extends Groupable>(
    timeline: RafAniTimeline<G> | Ref<RafAniTimeline<G>>,
    initialValue: AniGroup<G>
): readonly [Ref<AniGroup<G>>, RafAniTimeline<G>] {
    const current = computed(() => toRaw(unref(timeline)))
    const value = shallowRef<AniGroup<G>>(current.value.value ?? initialValue)
    let stop: (() => void) | undefined

    onMounted(() => {
        stop = watch(
            current,
            (tl, _, onCleanup) => {
                // Sync immediate value
                value.value = tl.value ?? initialValue
                onCleanup(
                    tl.onUpdate((next) => {
                        value.value = next.state
                    })
                )
            },
            { immediate: true, flush: 'sync' }
        )
    })

    onBeforeUnmount(() => stop?.())

    return [
        value as Ref<AniGroup<G>>,
        createTimelineController<G>(() => current.value),
    ]
}
