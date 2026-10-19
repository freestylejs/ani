import { createStates, follow, rafGroup, rafTimeline } from './ani/raf'
import { waapiTimeline, webTimeline } from './ani/waapi'
import { createClock } from './loop'
import { ani, delay, loop, parallel, sequence, stagger } from './nodes'
import { T } from './timing'

export * from './ani'
export * from './binding'
export * from './binding_api'
export * from './error'
export * from './event'
export * from './loop'
export * from './nodes'
export * from './style'
export * from './timing'

export const a = {
    timing: T,

    /**
     * @deprecated Use `rafTimeline` alias for explicit engine naming.
     */
    dynamicTimeline: rafTimeline,
    /**
     * @deprecated Use `waapiTimeline` alias for explicit engine naming.
     */
    timeline: webTimeline,
    webTimeline,
    rafTimeline,
    /**
     * Create a group: one plan drives N targets through one clock subscription.
     */
    rafGroup,
    /**
     * Create a value that chases a target with a spring, keeping its velocity.
     */
    follow,
    waapiTimeline,
    /**
     * Create animation segment.
     */
    ani,
    /**
     * Add delay
     */
    delay,
    loop,
    parallel,
    sequence,
    stagger,
    createStates,
    /**
     * Create an independent animation clock (own frame loop).
     */
    createClock,
} as const
