import { createStates, rafTimeline } from './ani/raf'
import { webTimeline } from './ani/waapi'
import { ani, delay, loop, parallel, sequence, stagger } from './nodes'
import { T } from './timing'

export * from './ani'
export * from './binding_api'
export * from './event'
export * from './loop'
export * from './style'
export * from './timing'

export const a = {
    timing: T,

    dynamicTimeline: rafTimeline,
    timeline: webTimeline,
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
} as const
