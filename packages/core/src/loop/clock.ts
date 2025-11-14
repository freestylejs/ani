export interface Animatable {
    /**
     * Update animation based on dt
     * @param dt delta time
     */
    update(dt: number): void
}

/**
 * Animation clock interface, can be user-injected.
 */
export interface AnimationClockInterface {
    subscribe(animatable: Animatable): void
    unsubscribe(animatable: Animatable): void
}

export class AnimationClock implements AnimationClockInterface {
    private subscribers: Set<Animatable> = new Set()
    private animationFrameId: number | null = null
    private lastTimestamp: number = 0
    private maxDeltaTime: number

    protected static clock: AnimationClock
    /**
     * Crete new clock(singleton)
     * @param maxDeltaTime default maxDt = 100ms
     * @returns clock
     */
    public static create(maxDeltaTime: number = 1 / 10): AnimationClock {
        AnimationClock.clock = new AnimationClock(maxDeltaTime)
        return AnimationClock.clock
    }
    private constructor(maxDeltaTime: number) {
        this.maxDeltaTime = maxDeltaTime
    }

    public subscribe(animatable: Animatable): void {
        this.subscribers.add(animatable)
        if (!this.animationFrameId) {
            this.start()
        }
    }

    public unsubscribe(animatable: Animatable): void {
        this.subscribers.delete(animatable)
        if (this.subscribers.size === 0) {
            this.stop()
        }
    }

    private start(): void {
        this.lastTimestamp = performance.now()
        this.animationFrameId = window.requestAnimationFrame(this.tick)
    }

    private stop(): void {
        if (this.animationFrameId) {
            window.cancelAnimationFrame(this.animationFrameId)
            this.animationFrameId = null
        }
    }

    private tick = (timestamp: number): void => {
        if (!this.animationFrameId) return

        const MS = 1000 as const
        let dt = (timestamp - this.lastTimestamp) / MS
        this.lastTimestamp = timestamp

        // prevent large jumps or negatives
        if (dt < 0) dt = 0
        if (dt > this.maxDeltaTime) {
            dt = this.maxDeltaTime
        }

        for (const subscriber of this.subscribers) {
            subscriber.update(dt)
        }

        this.animationFrameId = window.requestAnimationFrame(this.tick)
    }
}
