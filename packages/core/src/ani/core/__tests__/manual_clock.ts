import type { Animatable, AnimationClockInterface } from '~/loop'

/**
 * Hand-driven clock: `tick(dt)` updates every subscriber once (snapshot, like
 * the real clock) and `size` exposes how many are subscribed.
 */
export class ManualClock implements AnimationClockInterface {
    private subscribers = new Set<Animatable>()

    public get size(): number {
        return this.subscribers.size
    }

    public subscribe(animatable: Animatable): void {
        this.subscribers.add(animatable)
    }

    public unsubscribe(animatable: Animatable): void {
        this.subscribers.delete(animatable)
    }

    public tick(dt: number): void {
        for (const subscriber of [...this.subscribers]) {
            subscriber.update(dt)
        }
    }

    /** `count` frames of `dt` seconds */
    public run(count: number, dt: number = 1 / 60): void {
        for (let i = 0; i < count; i++) this.tick(dt)
    }
}
