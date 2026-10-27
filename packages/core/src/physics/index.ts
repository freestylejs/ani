import { decay, perceptual, settleTime, spring } from './spring'

export type { SettleTolerance, Spring, SpringOptions } from './spring'

/**
 * Pure numeric physics: the physical spring, its settle time and perceptual
 * timeline, and the decay projection of a released gesture.
 */
export const physics = {
    /**
     * A physical spring of perceptual duration and bounce. `at(t, x0, v0)` is
     * the displacement from the target.
     */
    spring,
    /** First time a spring stays within the settle tolerances. */
    settleTime,
    /** Perceptual progress of a spring of perceptual duration `D`, 0–1. */
    perceptual,
    /** Distance a release coasts at a deceleration rate per millisecond. */
    decay,
} as const
