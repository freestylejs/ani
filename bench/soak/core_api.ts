// The parts of the built core that the soak runner touches, typed loosely:
// the runner imports the built bundle, so it carries its own small contract.

export type Values = Record<string, number>

export type RunResult =
    | 'ended'
    | 'interrupted'
    | 'skipped'
    | 'reset'
    | 'disposed'

export const RUN_RESULTS: readonly string[] = [
    'ended',
    'interrupted',
    'skipped',
    'reset',
    'disposed',
]

export type Status = 'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED'

export type Unsubscribe = () => void

export type Listener = (frame: { status: string }) => void

export interface StyleTarget {
    style: object
}

export interface TimelineHandle {
    readonly status: Status
    readonly value: Values | null
    readonly velocity: Values | null
    play(config: object): Promise<RunResult>
    pause(): void
    resume(): void
    seek(time: number): void
    reset(): void
    dispose(): void
    bind(target: StyleTarget): Unsubscribe
    onUpdate(listener: Listener): Unsubscribe
}

export interface GroupHandle {
    readonly status: Status
    play(config: object): Promise<RunResult>
    pause(): void
    resume(): void
    seek(time: number): void
    reset(): void
    dispose(): void
    valueAt(index: number): Values | null
    bind(targets: StyleTarget[]): Unsubscribe
    bindAt(index: number, target: StyleTarget): Unsubscribe
    onUpdate(listener: Listener): Unsubscribe
}

export interface FollowHandle {
    readonly status: 'IDLE' | 'PLAYING'
    readonly value: Values
    readonly velocity: Values
    readonly target: Values
    set(target: Values, options?: { velocity: Values }): Promise<RunResult>
    jump(value: Values): void
    bind(target: StyleTarget): Unsubscribe
    onUpdate(listener: Listener): Unsubscribe
    dispose(): void
}

export interface StatesHandle {
    timeline(): TimelineHandle
    state(): string
    readonly value: Values
    transitionTo(state: string, config?: object): Promise<RunResult>
    bind(target: StyleTarget): Unsubscribe
    onUpdate(listener: Listener): Unsubscribe
    dispose(): void
}

export interface Clock {
    readonly size: number
    subscribe(animatable: { update(dt: number): void }): void
    unsubscribe(animatable: { update(dt: number): void }): void
}

export interface CoreApi {
    ani(props: { to: Values; duration: number; timing: unknown }): unknown
    delay(duration: number): unknown
    sequence(children: unknown[]): unknown
    parallel(children: unknown[]): unknown
    stagger(children: unknown[], options: { offset: number }): unknown
    loop(child: unknown, count: number): unknown
    timing: {
        linear(): unknown
        bezier(options: {
            p2: { x: number; y: number }
            p3: { x: number; y: number }
        }): unknown
        spring(options: { m: number; k: number; c: number }): unknown
    }
    rafTimeline(node: unknown, options: { clock: Clock }): TimelineHandle
    rafGroup(
        node: unknown,
        options: { clock: Clock; stagger: number }
    ): GroupHandle
    follow(
        initial: Values,
        options: { clock: Clock; spring?: { m: number; k: number; c: number } }
    ): FollowHandle
    createStates(config: {
        initial: string
        initialValue: Values
        states: Record<string, unknown>
        clock: Clock
    }): StatesHandle
}

export interface ManualClock {
    readonly clock: Clock
    readonly pending: number
    frame(ms?: number): void
    advance(ms: number): void
    setHidden(hidden: boolean): void
    setReducedMotion(on: boolean): void
}

export interface CoreModules {
    a: CoreApi
    createManualClock(options?: {
        onError?: (error: unknown) => void
    }): ManualClock
}
