import {
    type AnimationNode,
    ani,
    delay,
    loop,
    parallel,
    sequence,
    stagger,
} from '~/nodes'
import { T, type TimingFunction } from '~/timing'

/**
 * Deterministic random generators for the property tests.
 *
 * Everything is driven by a seeded {@link mulberry32} PRNG: the same seed
 * always produces the same tree, the same values and the same times, so a
 * failing case can be replayed from its seed alone.
 */

export type AnimationRecord = Record<string, number>

export const PROPERTY_KEYS = ['x', 'y', 'opacity', 'scale'] as const
export type PropertyKey = (typeof PROPERTY_KEYS)[number]

/**
 * Keys whose compiled WAAPI values are plain numbers (not `transform` strings).
 */
export const NUMBER_KEYS = ['x', 'y', 'opacity'] as const

const MAX_DEPTH = 3
const MAX_LEAVES = 12
const MIN_DURATION = 0.05
const MAX_DURATION = 1.5
const MAX_VALUE = 500
/** Probability that a leaf gets a zero-length duration. */
const ZERO_DURATION_CHANCE = 0.08

export interface Rng {
    readonly seed: number
    /** Uniform in `[0, 1)`. */
    unit(): number
    /** Uniform in `[min, max)`. */
    range(min: number, max: number): number
    /** Uniform integer in `[min, max]`. */
    int(min: number, max: number): number
    pick<T>(values: readonly T[]): T
    chance(probability: number): boolean
}

/** Small, fast, well distributed PRNG; returns the same stream per seed. */
export function mulberry32(seed: number): Rng {
    let state = seed >>> 0
    const unit = (): number => {
        state = (state + 0x6d2b79f5) | 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    return {
        seed,
        unit,
        range: (min, max) => min + (max - min) * unit(),
        int: (min, max) => min + Math.floor(unit() * (max - min + 1)),
        pick: (values) => values[Math.floor(unit() * values.length)]!,
        chance: (probability) => unit() < probability,
    }
}

export interface TreeOptions {
    /** Keys allowed in generated records; defaults to {@link PROPERTY_KEYS}. */
    keys?: readonly PropertyKey[]
}

export interface GeneratedTree {
    node: AnimationNode<AnimationRecord>
    keys: PropertyKey[]
    from: AnimationRecord
    /** True when any leaf timing is a dynamic spring. */
    hasDynamicSpring: boolean
}

function round3(value: number): number {
    return Math.round(value * 1000) / 1000
}

function randomKeys(rng: Rng, allowed: readonly PropertyKey[]): PropertyKey[] {
    const pool = [...allowed]
    const count = rng.int(1, Math.min(3, pool.length))
    const keys: PropertyKey[] = []
    for (let i = 0; i < count; i++) {
        keys.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!)
    }
    return keys
}

function springOptions(rng: Rng) {
    return {
        m: round3(rng.range(0.5, 3)),
        k: round3(rng.range(50, 400)),
        c: round3(rng.range(2, 40)),
    }
}

interface BuildContext {
    remaining: number
    hasDynamicSpring: boolean
}

function randomTiming(rng: Rng, context: BuildContext): TimingFunction {
    switch (rng.int(0, 7)) {
        case 0:
            return T.linear()
        case 1:
            return T.ease()
        case 2:
            return T.easeIn()
        case 3:
            return T.easeOut()
        case 4:
            return T.easeInOut()
        case 5:
            return T.bezier({
                p2: { x: round3(rng.range(0, 1)), y: round3(rng.range(0, 1)) },
                p3: { x: round3(rng.range(0, 1)), y: round3(rng.range(0, 1)) },
            })
        case 6:
            return T.spring(springOptions(rng))
        default:
            context.hasDynamicSpring = true
            return T.dynamicSpring(springOptions(rng))
    }
}

function buildLeaf(
    rng: Rng,
    keys: readonly PropertyKey[],
    context: BuildContext
): AnimationNode<AnimationRecord> {
    const injection = (): TimingFunction => randomTiming(rng, context)
    const duration = rng.chance(ZERO_DURATION_CHANCE)
        ? 0
        : round3(rng.range(MIN_DURATION, MAX_DURATION))
    if (rng.chance(0.12)) {
        return delay(duration) as unknown as AnimationNode<AnimationRecord>
    }

    const to: AnimationRecord = {}
    for (const key of keys) {
        to[key] = round3(rng.range(-MAX_VALUE, MAX_VALUE))
    }

    if (keys.length === 1 || rng.chance(0.45)) {
        return ani({ to, duration, timing: injection() })
    }
    const timing: Record<string, TimingFunction> = {}
    for (const key of keys) {
        timing[key] = injection()
    }
    return ani({ to, duration, timing })
}

function buildNode(
    rng: Rng,
    keys: readonly PropertyKey[],
    depth: number,
    context: BuildContext
): AnimationNode<AnimationRecord> {
    const compose =
        depth < MAX_DEPTH && context.remaining > 1 && !rng.chance(0.2)
    if (!compose) {
        context.remaining--
        return buildLeaf(rng, keys, context)
    }

    if (rng.int(0, 3) === 3) {
        // loop: the child may itself be a composition
        const child = buildNode(rng, keys, depth + 1, context)
        return loop(child, rng.int(1, 3))
    }

    const count = rng.int(1, Math.min(4, context.remaining))
    const children: AnimationNode<AnimationRecord>[] = []
    for (let i = 0; i < count; i++) {
        // keep one leaf for every sibling still to come, so a composite child
        // can not eat the budget and push the tree over MAX_LEAVES
        const reserved = count - 1 - i
        context.remaining -= reserved
        children.push(buildNode(rng, keys, depth + 1, context))
        context.remaining += reserved
    }
    const kind = rng.int(0, 2)
    if (kind === 0) {
        return sequence(children)
    }
    if (kind === 1) {
        return parallel(children)
    }
    return stagger(children, round3(rng.range(0, 0.3)))
}

/** Builds a random tree (depth <= 3, <= 12 leaves) plus its `from` values. */
export function generateTree(
    rng: Rng,
    options: TreeOptions = {}
): GeneratedTree {
    const keys = randomKeys(rng, options.keys ?? PROPERTY_KEYS)
    const context: BuildContext = {
        remaining: MAX_LEAVES,
        hasDynamicSpring: false,
    }
    const node = buildNode(rng, keys, 1, context)
    const from: AnimationRecord = {}
    for (const key of keys) {
        from[key] = round3(rng.range(-MAX_VALUE, MAX_VALUE))
    }
    return { node, keys, from, hasDynamicSpring: context.hasDynamicSpring }
}

/** Message prefix that makes every failure reproducible from its seed. */
export function caseMessage(seed: number, detail: string): string {
    return `seed=${seed} ${detail}`
}
