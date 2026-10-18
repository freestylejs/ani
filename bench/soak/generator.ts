import type { Values } from './core_api.ts'
import type { Keyframes, Op } from './ops.ts'
import type { Rng } from './rng.ts'
import { genSubject, genValues, type SubjectType } from './spec.ts'
import type { Subject, World } from './world.ts'

/** Frames of population churn (0 -> max -> 0, twice) before it holds at max. */
export const RAMP_FRAMES = 1000
const RAMP_PERIOD = 500
/** Frames the population needs after the ramp to be back at max. */
export const FILL_FRAMES = 40
const EVENT_ONE_IN = 200
const REDUCED_MOTION_FRAMES = 30
const MAX_BINDINGS = 4
const MAX_LISTENERS = 6
const MAX_OPS_PER_FRAME = 5

type RandomKind =
    | 'create'
    | 'play'
    | 'transition'
    | 'set'
    | 'add'
    | 'jump'
    | 'pause'
    | 'resume'
    | 'seek'
    | 'reset'
    | 'bind'
    | 'unbind'
    | 'sub'
    | 'unsub'
    | 'dispose'

const WEIGHTS: ReadonlyArray<readonly [RandomKind, number]> = [
    ['create', 3],
    ['play', 30],
    ['transition', 14],
    ['set', 10],
    ['add', 6],
    ['jump', 2],
    ['pause', 6],
    ['resume', 6],
    ['seek', 6],
    ['reset', 3],
    ['bind', 8],
    ['unbind', 4],
    ['sub', 6],
    ['unsub', 4],
    ['dispose', 3],
]
const WEIGHT_VALUES = WEIGHTS.map(([, weight]) => weight)

const ANY: readonly SubjectType[] = ['timeline', 'group', 'follow', 'states']
const PLAYABLE: readonly SubjectType[] = ['timeline', 'group']
const CONTROLLABLE: readonly SubjectType[] = ['timeline', 'group', 'states']

/** Population wanted at `frame`: churn through the ramp, then hold at `max`. */
export function targetPopulation(frame: number, max: number): number {
    if (frame >= RAMP_FRAMES) return max
    const triangle = 1 - Math.abs((frame % RAMP_PERIOD) / (RAMP_PERIOD / 2) - 1)
    return Math.round(max * triangle)
}

/**
 * The run as a stream of ops. It reads the world between ops (population,
 * statuses, which bindings exist) and draws every random choice from `rng`.
 */
export function* generate(
    rng: Rng,
    world: World,
    max: number
): Generator<Op, never, undefined> {
    let hidden = false
    let reducedMotionOffAt = -1

    const pickFrom = (types: readonly SubjectType[]): Subject | null => {
        let total = 0
        for (const type of types) total += world.byType[type].length
        if (total === 0) return null
        let roll = rng.int(0, total - 1)
        for (const type of types) {
            const list = world.byType[type]
            if (roll < list.length) return list[roll]!
            roll -= list.length
        }
        return null
    }

    // A few draws to land on a subject the op can act on; the last one wins.
    const pickWhere = (
        types: readonly SubjectType[],
        fits: (sub: Subject) => boolean
    ): Subject | null => {
        let sub: Subject | null = null
        for (let i = 0; i < 4; i++) {
            sub = pickFrom(types)
            if (sub === null || fits(sub)) return sub
        }
        return sub
    }

    const subset = (props: readonly string[], low: number, high: number) => {
        const values: Values = {}
        for (const key of props) {
            if (rng.chance(0.7)) values[key] = rng.float(low, high)
        }
        if (Object.keys(values).length === 0) {
            values[rng.pick(props)] = rng.float(low, high)
        }
        return values
    }

    const keyframes = (props: readonly string[], segments: number) => {
        const list: Keyframes = []
        for (let i = 0; i < segments; i++) {
            list.push(rng.chance(0.3) ? 'keep' : genValues(rng, props))
        }
        return list
    }

    const timings = () => ({
        repeat: rng.weighted([5, 3, 2]),
        interrupt: rng.chance(0.8),
        delay: rng.chance(0.4) ? rng.int(1, 200) : 0,
    })

    const create = (): Op => ({
        k: 'create',
        id: world.nextId++,
        watched: rng.chance(0.8),
        spec: genSubject(rng),
    })

    const dispose = (): Op[] => {
        const sub = pickFrom(ANY)
        if (sub === null) return []
        const ops: Op[] = [{ k: 'dispose', s: sub.id }]
        // holding at max: the object that leaves is replaced at once
        if (world.frameNo >= RAMP_FRAMES) ops.push(create())
        return ops
    }

    const unbind = (sub: Subject): Op[] => {
        const ids = [...sub.bindings.keys()]
        if (ids.length === 0) return []
        return [{ k: 'unbind', s: sub.id, b: rng.pick(ids) }]
    }

    const unsub = (sub: Subject): Op[] => {
        const ids = [...sub.listeners.keys()].filter((id) => id !== 0)
        if (ids.length === 0) return []
        return [{ k: 'unsub', s: sub.id, l: rng.pick(ids) }]
    }

    const operate = (kind: RandomKind): Op[] => {
        switch (kind) {
            case 'create':
                return world.population < max ? [create()] : []
            case 'dispose':
                return dispose()
            case 'play': {
                const sub = pickFrom(PLAYABLE)
                if (sub === null) return []
                const delays = sub.delays[0]!
                return [
                    {
                        k: 'play',
                        s: sub.id,
                        from: genValues(rng, sub.props),
                        step:
                            sub.type === 'group' && rng.chance(0.4)
                                ? Object.fromEntries(
                                      sub.props.map((key) => [
                                          key,
                                          rng.float(-5, 5),
                                      ])
                                  )
                                : null,
                        keyframes:
                            !delays && rng.chance(0.4)
                                ? keyframes(sub.props, sub.segs[0]!)
                                : null,
                        ...timings(),
                    },
                ]
            }
            case 'transition': {
                const sub = pickFrom(['states'])
                if (sub === null) return []
                const to = rng.int(0, sub.segs.length - 1)
                return [
                    {
                        k: 'transition',
                        s: sub.id,
                        to,
                        from: rng.chance(0.3)
                            ? genValues(rng, sub.props)
                            : null,
                        keyframes:
                            !sub.delays[to] && rng.chance(0.3)
                                ? keyframes(sub.props, sub.segs[to]!)
                                : null,
                        ...timings(),
                    },
                ]
            }
            case 'set':
            case 'add': {
                const sub = pickFrom(['follow'])
                if (sub === null) return []
                const velocity = rng.chance(0.2)
                    ? subset(sub.props, -500, 500)
                    : null
                return kind === 'set'
                    ? [
                          {
                              k: 'set',
                              s: sub.id,
                              to: subset(sub.props, -300, 300),
                              velocity,
                          },
                      ]
                    : [
                          {
                              k: 'add',
                              s: sub.id,
                              delta: subset(sub.props, -100, 100),
                              velocity,
                          },
                      ]
            }
            case 'jump': {
                const sub = pickFrom(['follow'])
                if (sub === null) return []
                return [
                    {
                        k: 'jump',
                        s: sub.id,
                        to: subset(sub.props, -300, 300),
                    },
                ]
            }
            case 'pause':
            case 'resume': {
                const wanted = kind === 'pause' ? 'PLAYING' : 'PAUSED'
                const sub = pickWhere(
                    CONTROLLABLE,
                    (s) => world.statusOf(s) === wanted
                )
                return sub === null ? [] : [{ k: kind, s: sub.id }]
            }
            case 'seek': {
                const sub = pickFrom(CONTROLLABLE)
                if (sub === null) return []
                return [{ k: 'seek', s: sub.id, time: rng.float(-0.1, 1.5) }]
            }
            case 'reset': {
                const sub = pickFrom(CONTROLLABLE)
                return sub === null ? [] : [{ k: 'reset', s: sub.id }]
            }
            case 'bind': {
                const sub = pickFrom(ANY)
                if (sub === null) return []
                if (sub.bindings.size >= MAX_BINDINGS) return unbind(sub)
                const grouped = sub.type === 'group'
                const single = grouped && rng.chance(0.5)
                return [
                    {
                        k: 'bind',
                        s: sub.id,
                        b: world.nextId++,
                        at: single ? rng.int(0, sub.count - 1) : null,
                        many: grouped && !single ? rng.int(1, sub.count) : null,
                    },
                ]
            }
            case 'unbind': {
                const sub = pickWhere(ANY, (s) => s.bindings.size > 0)
                return sub === null ? [] : unbind(sub)
            }
            case 'sub': {
                const sub = pickFrom(ANY)
                if (sub === null) return []
                if (sub.listeners.size >= MAX_LISTENERS) return unsub(sub)
                return [
                    {
                        k: 'sub',
                        s: sub.id,
                        l: world.nextId++,
                        seed: rng.int(0, 2 ** 31 - 1),
                    },
                ]
            }
            case 'unsub': {
                const sub = pickWhere(ANY, (s) => s.listeners.size > 1)
                return sub === null ? [] : unsub(sub)
            }
            default:
                return []
        }
    }

    for (let frame = 0; ; frame++) {
        // population control: walk toward the target in bounded steps
        const target = targetPopulation(frame, max)
        const step = Math.max(1, Math.ceil(max / 25))
        const gap = target - world.population
        for (let i = 0; i < Math.min(Math.abs(gap), step); i++) {
            if (gap > 0) yield create()
            else yield* dispose().slice(0, 1)
        }

        const count = rng.int(0, MAX_OPS_PER_FRAME)
        for (let i = 0; i < count; i++) {
            const kind = WEIGHTS[rng.weighted(WEIGHT_VALUES)]![0]
            yield* operate(kind)
        }

        yield { k: 'frame' }

        if (frame === reducedMotionOffAt) yield { k: 'rm', on: false }
        if (rng.chance(1 / EVENT_ONE_IN)) {
            const event = rng.int(0, 2)
            if (event === 0) {
                yield { k: 'advance', ms: 2000 }
            } else if (event === 1) {
                hidden = !hidden
                yield { k: 'hidden', on: hidden }
            } else {
                const on = !world.reducedMotion
                if (on) reducedMotionOffAt = frame + REDUCED_MOTION_FRAMES
                yield { k: 'rm', on }
            }
        }
    }
}
