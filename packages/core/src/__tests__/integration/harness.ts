/**
 * Test harness shared by the core integration tests and the framework binding
 * tests. It has no runtime or type dependency on the library itself (the
 * clock factory is injected), so every package can type-check it without
 * resolving anything it does not already depend on.
 */

export interface HarnessAnimatable {
    update(dt: number): void
}

export interface HarnessClock {
    readonly size: number
    subscribe(animatable: HarnessAnimatable): void
    unsubscribe(animatable: HarnessAnimatable): void
}

export type ClockFactory = (options: {
    lagThreshold?: number | undefined
    maxDeltaTime?: number | undefined
    onError?: ((error: unknown) => void) | undefined
    requestFrame: (callback: (timestamp: number) => void) => number
    cancelFrame: (id: number) => void
    now: () => number
}) => HarnessClock

/**
 * A real clock (from `createClock`) fed by a hand-cranked frame source: the
 * same code path as production, with deterministic time.
 */
export function createManualClockWith(
    createClock: ClockFactory,
    options: {
        lagThreshold?: number
        maxDeltaTime?: number
        onError?: (error: unknown) => void
    } = {}
) {
    let nextId = 1
    let time = 1000
    const pending = new Map<number, (timestamp: number) => void>()
    const clock = createClock({
        lagThreshold: options.lagThreshold,
        maxDeltaTime: options.maxDeltaTime,
        onError: options.onError,
        requestFrame: (callback) => {
            const id = nextId++
            pending.set(id, callback)
            return id
        },
        cancelFrame: (id) => {
            pending.delete(id)
        },
        now: () => time,
    })

    return {
        clock,
        /** run one display frame, `ms` after the previous one */
        frame(ms = 16): void {
            time += ms
            const callbacks = [...pending.values()]
            pending.clear()
            for (const callback of callbacks) callback(time)
        },
        /** move time forward without delivering a frame */
        advance(ms: number): void {
            time += ms
        },
        /** run `count` frames */
        frames(count: number, ms = 16): void {
            for (let i = 0; i < count; i++) this.frame(ms)
        },
        /** outstanding frame requests (a healthy clock has at most 1) */
        get pending(): number {
            return pending.size
        },
        /** simulate an environment that silently loses queued frames */
        drop(): void {
            pending.clear()
        },
    }
}

/**
 * Counts live `onUpdate` subscriptions of a timeline through its public API.
 */
export function trackSubscriptions(timeline: {
    onUpdate: (callback: any) => () => void
}) {
    let live = 0
    const original = timeline.onUpdate.bind(timeline)
    timeline.onUpdate = (callback) => {
        live++
        const unsubscribe = original(callback)
        let active = true
        return () => {
            if (active) {
                active = false
                live--
            }
            unsubscribe()
        }
    }
    return {
        get live(): number {
            return live
        },
    }
}

/**
 * Counts live DOM listeners (`addEventListener` minus `removeEventListener`)
 * on the elements accepted by `filter`. Call `restore()` when done.
 */
export function trackListeners(filter: (target: EventTarget) => boolean) {
    const proto = HTMLElement.prototype
    const live = new Map<EventTarget, Set<string>>()
    const ids = new WeakMap<object, number>()
    let counter = 0
    let adds = 0
    const key = (type: string, listener: unknown, options: unknown) => {
        const capture =
            typeof options === 'boolean' ? options : !!(options as any)?.capture
        if (typeof listener !== 'function') return `${type}:${String(listener)}`
        let id = ids.get(listener)
        if (!id) ids.set(listener, (id = ++counter))
        return `${type}:${id}:${capture}`
    }
    const hadAdd = Object.hasOwn(proto, 'addEventListener')
    const hadRemove = Object.hasOwn(proto, 'removeEventListener')
    const add = proto.addEventListener
    const remove = proto.removeEventListener
    proto.addEventListener = function (
        this: HTMLElement,
        type: string,
        listener: any,
        options?: any
    ) {
        if (filter(this)) {
            adds++
            const set = live.get(this) ?? new Set<string>()
            set.add(key(type, listener, options))
            live.set(this, set)
        }
        return add.call(this, type, listener, options)
    } as typeof proto.addEventListener
    proto.removeEventListener = function (
        this: HTMLElement,
        type: string,
        listener: any,
        options?: any
    ) {
        live.get(this)?.delete(key(type, listener, options))
        return remove.call(this, type, listener, options)
    } as typeof proto.removeEventListener
    return {
        get live(): number {
            let total = 0
            for (const set of live.values()) total += set.size
            return total
        },
        /** total accepted addEventListener calls */
        get adds(): number {
            return adds
        },
        restore(): void {
            if (hadAdd) proto.addEventListener = add
            else Reflect.deleteProperty(proto, 'addEventListener')
            if (hadRemove) proto.removeEventListener = remove
            else Reflect.deleteProperty(proto, 'removeEventListener')
        },
    }
}
