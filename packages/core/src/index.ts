import {
    ani,
    createStates,
    delay,
    loop,
    parallel,
    sequence,
    stagger,
    timeline,
} from './ani'
import { T } from './timing'
import { webTimeline } from './web_ani'

export * from './ani'
export * from './binding_api'
export * from './event'
export * from './loop'
export * from './style'
export * from './timing'
export * from './web_ani'

export const a = {
    timing: T,
    ani,
    createStates,
    delay,
    loop,
    parallel,
    sequence,
    stagger,
    timeline,
    webTimeline,
} as const
