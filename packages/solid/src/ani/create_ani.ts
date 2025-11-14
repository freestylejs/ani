import type {
    AniGroup,
    Groupable,
    Timeline,
    TimelineController,
} from '@freestylejs/ani-core'
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'

/**
 * Reactive ani animation hook.
 *
 * @param timeline - `Timeline` instance.
 * @param initialValue - Initial value for the animation state.
 *
 * @returns `[valueAccessor, controller]`.
 */
export function createAni<G extends Groupable>(
    timeline: () => Timeline<G>,
    initialValue: AniGroup<G>
): readonly [() => AniGroup<G>, TimelineController<G>] {
    const [value, setValue] = createSignal<AniGroup<G>>(initialValue)

    createEffect(() => {
        const tl = timeline()
        const unsubscribe = tl.onUpdate((val) => {
            setValue(() => val.state)
        })
        onCleanup(unsubscribe)
    })

    const controller = createMemo((): TimelineController<G> => {
        const tl = timeline()
        return {
            play: (config) => {
                setValue(() => config.from)
                tl.play(config)
            },
            seek: tl.seek,
            pause: tl.pause,
            resume: tl.resume,
            reset: tl.reset,
        }
    })

    return [value, controller()] as const
}
