import {
    createAniError,
    DEV,
    type Groupable,
    type RafGroup,
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
    type ElementBinder,
    type ElementRef,
    withResolver,
} from './element'
import type { VueAniRefOptions } from './use_ani_ref'

/** Largest index `group.bindAt` accepts (largest array index). */
const MAX_INDEX = 2 ** 32 - 2

/**
 * Element refs for a group: `<li :ref="ref(i)" :style="style">`.
 *
 * `ref(index)` returns the same function for the same index and binds the
 * element to target `index` through `group.bindAt`. `group` may be a group or
 * a ref of one; swaps rebind every element. Never disposes a group it is given.
 */
export function useAniGroup<G extends Groupable>(
    group: RafGroup<G> | Ref<RafGroup<G>>,
    options: VueAniRefOptions<G> = {}
): {
    ref: (index: number) => (element: ElementRef) => void
    style: ComputedRef<StyleValue | undefined>
} {
    const current = computed(() => toRaw(unref(group)))
    const binders = new Map<number, ElementBinder>()

    const refAt = (index: number) => {
        if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) {
            throw createAniError(
                TypeError,
                'ANI_INVALID_OPTIONS',
                DEV
                    ? `[useAniGroup] \`index\` must be a non-negative integer, received ${index}.`
                    : ''
            )
        }
        let binder = binders.get(index)
        if (!binder) {
            binder = createElementBinder((target) =>
                current.value.bindAt(
                    index,
                    target,
                    withResolver(options.resolver)
                )
            )
            binders.set(index, binder)
        }
        return binder.set
    }

    watch(
        current,
        () => {
            for (const binder of binders.values()) binder.rebind()
        },
        { flush: 'sync' }
    )
    if (getCurrentScope()) {
        onScopeDispose(() => {
            for (const binder of binders.values()) binder.dispose()
        })
    }

    return { ref: refAt, style: createInitialStyle(options) }
}
