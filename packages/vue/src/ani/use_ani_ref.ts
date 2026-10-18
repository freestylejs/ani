import {
    type AniGroup,
    type Groupable,
    type RafTimeline,
    type Resolver,
} from '@freestylejs/ani-core'
import {
    type ComputedRef,
    computed,
    getCurrentScope,
    onScopeDispose,
    type Ref,
    type StyleValue,
    toRaw,
    unref,
    watch,
} from 'vue'
import {
    createElementBinder,
    createInitialStyle,
    type ElementRef,
    withResolver,
} from './element'

export interface VueAniRefOptions<G extends Groupable> {
    /** Rendered as the initial inline `style` (also on the server). */
    initialValue?: AniGroup<G>
    /** Custom style resolver for the bound frames and the initial style. */
    resolver?: Resolver<Record<string, number>>
}

/**
 * Element ref for a timeline: `<div :ref="ref" :style="style">`.
 *
 * `timeline` may be a timeline or a ref of one; swaps rebind the element. The
 * element is written through `timeline.bind` only, and the composable never
 * disposes a timeline it is given. A component instance resolves to its `$el`.
 *
 * @returns `ref` (function ref) and `style` (the initial inline style).
 */
export function useAniRef<G extends Groupable>(
    timeline: RafTimeline<G> | Ref<RafTimeline<G>>,
    options: VueAniRefOptions<G> = {}
): {
    ref: (element: ElementRef) => void
    style: ComputedRef<StyleValue | undefined>
} {
    // toRaw: a user-made `ref(timeline)` is a deep reactive proxy; the clock
    // and the timeline internals must only ever see the raw instance.
    const current = computed(() => toRaw(unref(timeline)))
    const binder = createElementBinder((target) =>
        current.value.bind(target, withResolver(options.resolver))
    )

    // `sync`: a swap must not leave a frame-sized gap before the rebind.
    watch(current, binder.rebind, { flush: 'sync' })
    if (getCurrentScope()) onScopeDispose(binder.dispose)

    return { ref: binder.set, style: createInitialStyle(options) }
}
