import type { Groupable, RafGroup } from '@freestylejs/ani-core'
import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import {
    bindOptions,
    createElementRef,
    type ElementRef,
    useInitialStyle,
    useLatest,
} from './bind_ref'
import type { UseAniRefOptions } from './use_ani_ref'

/**
 * Non-reactive animation of many elements: element `i` is bound with
 * `group.bindAt(i, element)`, without rendering per frame.
 *
 * `ref(index)` returns the same function for the same index and `group`. A
 * new `group` rebinds the current elements. The hook never disposes the
 * `group` it is given.
 *
 * @param group - Group that drives the elements.
 * @param options - `initialValue` for the initial `style`, `resolver` read when an element attaches.
 *
 * @returns `{ ref, style }`: `ref(index)` per element, `style` for all.
 */
export function useAniGroup<G extends Groupable>(
    group: RafGroup<G>,
    options: UseAniRefOptions<G> = {}
): {
    ref: (index: number) => ElementRef
    style: CSSProperties | undefined
} {
    const resolver = useLatest(options.resolver)
    const style = useInitialStyle(
        options.initialValue as Record<string, number> | undefined,
        options.resolver
    )
    const ref = useMemo(() => {
        const refs = new Map<number, ElementRef>()
        return (index: number): ElementRef => {
            let target = refs.get(index)
            if (!target) {
                target = createElementRef((element) =>
                    group.bindAt(index, element, bindOptions(resolver.current))
                )
                refs.set(index, target)
            }
            return target
        }
    }, [group, resolver])
    return { ref, style }
}
