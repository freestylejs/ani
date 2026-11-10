import { physics } from '@freestylejs/ani-core'

/**
 * Fixed App Store snapshot choreography, calibrated against the PUBLIC live
 * example's native effects (2026-11-04). This is a finite sampled timing curve,
 * not a velocity-native LayoutMotion spring or a second physics engine.
 * Core supplies every displacement and derivative.
 */
function profile(visualDuration: number, bounce: number, durationMs: number) {
    const spring = physics.spring({ duration: visualDuration * 1.2, bounce })
    const count = Math.ceil(durationMs / 10)
    let ended = false
    const samples = Array.from({ length: count }, (_, index) => {
        const time = ((index / (count - 1)) * durationMs) / 1000
        const displacement = spring.at(time, -1, 0)
        const velocity = spring.velocity(time, -1, 0)
        if (Math.abs(displacement) <= 0.005 && Math.abs(velocity) <= 0.02)
            ended = true
        return index === count - 1 || ended
            ? 1
            : Number((1 + displacement).toFixed(4))
    })
    return Object.freeze({
        durationMs,
        samples: Object.freeze(samples),
        easing: `linear(${samples.join(',')})`,
    })
}
const OPEN = profile(0.4, 0.3, 650)
const CLOSED = profile(0.3, 0.2, 550)
export function storeViewProfile(open: boolean) {
    return open ? OPEN : CLOSED
}
