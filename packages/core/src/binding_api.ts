// public binding api type-defs.

import type { AniGroup, Groupable, Timeline, TimelineController } from './ani'
import type { EventHandlerRegistration } from './event'

export type AniRefContext<G extends Groupable> = TimelineController<G> & {
    /**
     * Current animation value
     */
    current: AniGroup<G> | null
}

export interface AniRefProps<
    G extends Groupable,
    AsGetter extends boolean = false,
> {
    /**
     * The compositional timeline to bind to the element.
     */
    timeline: AsGetter extends true ? () => Timeline<G> : Timeline<G>
    /**
     * The initial style to apply to the element before the animation plays.
     */
    initialValue?: AniGroup<G>
    /**
     * Event handlers to attach to the element.
     */
    events?: EventHandlerRegistration<AniRefContext<G>>
    /**
     * If `true`, all event listeners will be removed on cleanup.
     *
     * @default true
     */
    cleanupEvents?: boolean
}
