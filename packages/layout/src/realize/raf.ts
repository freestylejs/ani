/**
 * The scope's one `Animatable` (§4.3): `update` advances and solves, `commit`
 * writes. The only module that touches the clock.
 */
import type { Animatable, AnimationClockInterface } from '@freestylejs/ani-core'

export interface FrameDriver {
    /** Advance by `dt` seconds and solve; returns whether anything still runs. */
    update(dt: number): boolean
    commit(): void
}

export interface Realizer {
    readonly running: boolean
    start(): void
    stop(): void
}

export function createRaf(
    clock: AnimationClockInterface,
    driver: FrameDriver
): Realizer {
    let running = false
    const animatable: Animatable = {
        update(dt) {
            if (!driver.update(dt)) realizer.stop()
        },
        commit() {
            driver.commit()
        },
    }
    const realizer: Realizer = {
        get running() {
            return running
        },
        start() {
            if (running) return
            running = true
            clock.subscribe(animatable)
        },
        stop() {
            if (!running) return
            running = false
            clock.unsubscribe(animatable)
        },
    }
    return realizer
}
