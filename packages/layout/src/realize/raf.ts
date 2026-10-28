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
    start(): void
    stop(): void
}

export function createRaf(
    clock: AnimationClockInterface,
    driver: FrameDriver
): Realizer {
    let running = false
    let finished = false
    const animatable: Animatable = {
        update(dt) {
            finished = !driver.update(dt)
        },
        // the last frame's writes (settle restores) land in its commit
        commit() {
            driver.commit()
            if (finished) realizer.stop()
        },
    }
    const realizer: Realizer = {
        start() {
            finished = false
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
