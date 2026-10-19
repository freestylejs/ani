import type {
    Follower,
    RafGroup,
    RafTimeline,
    ReducedMotionPolicy,
    RunResult,
    StateProps,
} from '@freestylejs/ani-core'
import * as a from '@freestylejs/ani-core'

// Type aliases, not interfaces: core's `Groupable` needs an index signature.

/** The value every fixture animates. */
export type Pose = { translateX: number; opacity: number }

/** The node `a.ani` makes for `G` (core does not export the node type). */
export type NodeOf<G extends Record<string, number>> = ReturnType<
    typeof a.ani<G>
>
export type PoseNode = NodeOf<Pose>

export const INITIAL: Pose = { translateX: 0, opacity: 0.5 }
export const TARGET: Pose = { translateX: 100, opacity: 1 }
export const DEFAULT_DURATION = 0.3

/** One linear segment to `TARGET`. */
export function pose(duration: number = DEFAULT_DURATION): PoseNode {
    return a.ani({ to: TARGET, duration, timing: a.timing.linear() })
}

export type StatesShape = {
    idle: NodeOf<{ opacity: number }>
    active: NodeOf<{ opacity: number }>
}

/** `idle` is `opacity: 0`, `active` is `opacity: 1`. */
export function statesConfig(): StateProps<StatesShape> {
    return {
        initial: 'idle',
        initialValue: { opacity: 0 },
        states: {
            idle: a.ani({
                to: { opacity: 0 },
                duration: 0.2,
                timing: a.timing.linear(),
            }),
            active: a.ani({
                to: { opacity: 1 },
                duration: 0.2,
                timing: a.timing.linear(),
            }),
        },
    }
}

/** What a component mounted by a driver hands back to a case. */
export interface Mount {
    /** Unmounts the component (synchronously) and detaches its DOM. Idempotent. */
    unmount(): void
}

/** `fn` that runs on its first call only. */
export function once(fn: () => void): () => void {
    let called = false
    return () => {
        if (called) return
        called = true
        fn()
    }
}

export interface RefOptions {
    node: PoseNode
    reducedMotion?: ReducedMotionPolicy
}

/** A component that owns a timeline and binds a `div` with `INITIAL`. */
export interface RefMount extends Mount {
    element: HTMLElement
    timeline: RafTimeline<Pose>
}

/** A component with `count` elements bound to one `rafGroup`. */
export interface GroupMount extends Mount {
    elements: HTMLElement[]
    group: RafGroup<Pose>
}

/** A state machine bound to a `div` plus a text node showing the state. */
export interface StatesMount extends Mount {
    element: HTMLElement
    /** Text the framework rendered for the current state. */
    stateText(): string
    transitionTo(state: keyof StatesShape): Promise<RunResult>
}

/** A spring follower bound to a `div`, starting at `translateX: 0`. */
export interface FollowMount extends Mount {
    element: HTMLElement
    follower: Follower<{ translateX: number }>
}

/** Framework-specific part of the shared cases: mounting components. */
export interface Driver {
    mountRef(options: RefOptions): RefMount
    mountGroup(options: { node: PoseNode; count: number }): GroupMount
    mountStates(): StatesMount
    mountFollow(): FollowMount
}
