export interface Rng {
    /** Uniform float in [0, 1). */
    next(): number
    /** Uniform integer in [min, max], both included. */
    int(min: number, max: number): number
    /** Uniform float in [min, max), rounded to 3 decimals (readable replay files). */
    float(min: number, max: number): number
    chance(probability: number): boolean
    pick<T>(items: readonly T[]): T
    /** Index into `weights`, proportional to the weight (0 never wins). */
    weighted(weights: readonly number[]): number
}

/** mulberry32: 32 bits of state, passes the usual small-PRNG batteries. */
export function createRng(seed: number): Rng {
    let state = seed >>> 0
    const next = (): number => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    return {
        next,
        int: (min, max) => min + Math.floor(next() * (max - min + 1)),
        float: (min, max) =>
            Math.round((min + next() * (max - min)) * 1000) / 1000,
        chance: (probability) => next() < probability,
        pick: (items) => items[Math.floor(next() * items.length)]!,
        weighted: (weights) => {
            let total = 0
            for (const weight of weights) total += weight
            let roll = next() * total
            for (let i = 0; i < weights.length; i++) {
                roll -= weights[i]!
                if (roll < 0) return i
            }
            return weights.length - 1
        },
    }
}

/**
 * Pure hash of (seed, n) in [0, 2^32): decisions that must replay from an op
 * file alone (does call `n` of a listener throw?) never touch the stream.
 */
export function hash32(seed: number, n: number): number {
    let t = (seed + Math.imul(n, 0x9e3779b1)) >>> 0
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
}
