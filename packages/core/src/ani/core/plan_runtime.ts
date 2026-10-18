import {
    BezierTimingFunction,
    LinearTimingFunction,
    TimingFunction,
    type TimingFunctionContext,
} from '~/timing'
import { END_TOLERANCE } from '~/utils/time'
import type { ExecutionPlan, Groupable } from './interface/core_types'

/**
 * Evaluation core of the raf engine.
 *
 * `compilePlan` flattens an execution plan into per-property "lanes" once.
 * A lane lists, in start order, every segment that writes the property.
 * `PlanRuntime` evaluates a compiled plan at a point in time:
 *
 * - Overlap rule: at time `t` a property is produced by the most recently
 *   started segment touching it (ties: later declaration wins). Its `from` is
 *   the property's resolved value at that segment's start (a fixed snapshot),
 *   computed once when the runtime is created.
 * - Per frame, work is O(properties): a monotonic cursor per lane tracks the
 *   winning segment, finished segments are never re-evaluated (value = `to`).
 * - Stateful timings (physics) get a private state object per
 *   (segment, property) owned by the runtime, never by the timing instance.
 */

const LINEAR = new LinearTimingFunction()

export interface CompiledPlan {
    readonly laneCount: number
    /** lane -> property name (record timelines), `null` for array timelines */
    readonly keys: readonly string[] | null
    /** lane `k` owns entries `[laneOff[k], laneOff[k + 1])` in start order */
    readonly laneOff: Int32Array
    readonly eStart: Float64Array
    readonly eDur: Float64Array
    readonly eTo: Float64Array
    readonly eTiming: TimingFunction[]
    readonly eStateful: Uint8Array
    /** 0 = generic `step`, 1 = built-in linear, 2 = built-in bezier */
    readonly eKind: Uint8Array
    /**
     * Latest end of every segment that can not finish early. Only segments
     * driven exclusively by stateful timings (settling springs) may end before
     * their nominal duration.
     */
    readonly hardEnd: number
}

const compiledCache = new WeakMap<object, Map<string, CompiledPlan>>()

function isTimingFunction(value: unknown): value is TimingFunction {
    return (
        value instanceof TimingFunction ||
        typeof (value as TimingFunction | undefined)?.step === 'function'
    )
}

function describe(keys: readonly string[] | null, lane: number): string {
    return keys ? `"${keys[lane]}"` : `[${lane}]`
}

function pickTiming(
    timing: unknown,
    isRecord: boolean,
    key: string | undefined,
    index: number,
    segmentIndex: number
): TimingFunction {
    if (timing === undefined || timing === null) return LINEAR
    if (isTimingFunction(timing)) return timing
    if (isRecord) {
        const t = (timing as Record<string, unknown>)[key!]
        if (!isTimingFunction(t)) {
            throw new TypeError(
                `[Timeline] segment #${segmentIndex}: \`timing\` has no TimingFunction for animated property "${key}".`
            )
        }
        return t
    }
    const t = Array.isArray(timing) ? timing[index] : undefined
    if (!isTimingFunction(t)) {
        throw new TypeError(
            `[Timeline] segment #${segmentIndex}: \`timing\` has no TimingFunction for animated value [${index}].`
        )
    }
    return t
}

function isSortedByStart(plan: ExecutionPlan<any>): boolean {
    for (let i = 1; i < plan.length; i++) {
        if (plan[i]!.startTime < plan[i - 1]!.startTime) return false
    }
    return true
}

/**
 * Compiles (and caches per plan identity) the static part of a plan for a
 * given property layout. Throws a descriptive error for malformed plans so the
 * failure happens at `play()`, never inside a clock tick.
 *
 * @param keys Property names of a record timeline (`from`'s key order), `null` for array timelines.
 * @param laneCount Number of animated values (`from.length` for arrays).
 */
export function compilePlan(
    plan: ExecutionPlan<Groupable>,
    keys: readonly string[] | null,
    laneCount: number
): CompiledPlan {
    const sig = keys ? keys.join('\u0000') : `#${laneCount}`
    let bySig = compiledCache.get(plan)
    const cached = bySig?.get(sig)
    if (cached) return cached

    const segments = isSortedByStart(plan)
        ? plan
        : [...plan].sort((a, b) => a.startTime - b.startTime)

    const laneMap = keys ? new Map(keys.map((key, i) => [key, i])) : null
    const segLanes: number[][] = []
    const segTo: number[][] = []
    const segHard: boolean[] = []
    const counts = new Int32Array(laneCount)
    let entryCount = 0

    for (let s = 0; s < segments.length; s++) {
        const node = segments[s]!.node
        const duration = node.duration
        if (!Number.isFinite(duration) || duration < 0) {
            throw new RangeError(
                `[Timeline] segment #${s}: duration must be a finite number >= 0, received ${duration}.`
            )
        }
        const to = node.props.to as Groupable
        const lanes: number[] = []
        const tos: number[] = []

        if (Array.isArray(to)) {
            if (keys !== null) {
                throw new TypeError(
                    `[Timeline] segment #${s}: array \`to\` can not animate a record \`from\`.`
                )
            }
            if (to.length !== laneCount) {
                throw new TypeError(
                    `[Timeline] segment #${s}: \`to\` has ${to.length} values but \`from\` has ${laneCount}.`
                )
            }
            for (let i = 0; i < to.length; i++) {
                lanes.push(i)
                tos.push(to[i] as number)
            }
        } else {
            const record = to as Record<string, number>
            const names = Object.keys(record)
            if (laneMap === null) {
                if (names.length > 0) {
                    throw new TypeError(
                        `[Timeline] segment #${s}: record \`to\` can not animate an array \`from\`.`
                    )
                }
            } else {
                for (const name of names) {
                    const lane = laneMap.get(name)
                    if (lane === undefined) {
                        throw new TypeError(
                            `[Timeline] segment #${s}: property "${name}" is animated but missing from \`from\`.`
                        )
                    }
                    lanes.push(lane)
                    tos.push(record[name] as number)
                }
            }
        }

        for (let j = 0; j < tos.length; j++) {
            if (!Number.isFinite(tos[j])) {
                throw new TypeError(
                    `[Timeline] segment #${s}: \`to\` ${describe(keys, lanes[j]!)} must be a finite number, received ${tos[j]}.`
                )
            }
            counts[lanes[j]!]!++
        }
        entryCount += lanes.length
        segLanes.push(lanes)
        segTo.push(tos)
    }

    const laneOff = new Int32Array(laneCount + 1)
    for (let k = 0; k < laneCount; k++) {
        laneOff[k + 1] = laneOff[k]! + counts[k]!
    }
    const fill = laneOff.slice(0, laneCount)
    const eStart = new Float64Array(entryCount)
    const eDur = new Float64Array(entryCount)
    const eTo = new Float64Array(entryCount)
    const eStateful = new Uint8Array(entryCount)
    const eKind = new Uint8Array(entryCount)
    const eTiming = new Array<TimingFunction>(entryCount)
    let hardEnd = 0

    for (let s = 0; s < segments.length; s++) {
        const { node, startTime } = segments[s]!
        const lanes = segLanes[s]!
        const tos = segTo[s]!
        const timing = node.props.timing as unknown
        const isRecordTimeline = keys !== null
        let hard = lanes.length === 0
        for (let j = 0; j < lanes.length; j++) {
            const lane = lanes[j]!
            const e = fill[lane]!++
            const fn = pickTiming(
                timing,
                isRecordTimeline,
                keys?.[lane],
                lane,
                s
            )
            eStart[e] = startTime
            eDur[e] = node.duration
            eTo[e] = tos[j]!
            eTiming[e] = fn
            eStateful[e] = fn.stateful ? 1 : 0
            // exact built-ins only: a subclass may override `step`
            eKind[e] =
                fn.constructor === LinearTimingFunction
                    ? 1
                    : fn.constructor === BezierTimingFunction
                      ? 2
                      : 0
            if (!fn.stateful) hard = true
        }
        segHard.push(hard)
        const end = startTime + node.duration
        if (hard && end > hardEnd) hardEnd = end
    }

    const compiled: CompiledPlan = {
        laneCount,
        keys,
        laneOff,
        eStart,
        eDur,
        eTo,
        eTiming,
        eStateful,
        eKind,
        hardEnd,
    }
    if (!bySig) {
        bySig = new Map()
        compiledCache.set(plan, bySig)
    }
    if (bySig.size >= 4) bySig.clear()
    bySig.set(sig, compiled)
    return compiled
}

export class PlanRuntime {
    /** Current value of every lane (valid after `evaluate`). */
    public values: number[]
    /**
     * Values of the previous `evaluate` call. The two buffers swap on every
     * call: read them between calls, never keep a reference.
     */
    public previous: number[]
    /**
     * Integrator velocity (units/second) of lanes currently driven by a
     * stateful timing, `NaN` for the others.
     */
    public readonly velocities: number[]
    /** True once every property reached its final value (see `hardEnd`). */
    public finished = false

    private readonly c: CompiledPlan
    private readonly initial: number[]
    private readonly seed: number[]
    private readonly eFrom: Float64Array
    private readonly eState: Array<Record<string, any> | null>
    private readonly cursor: Int32Array
    private readonly ctx: TimingFunctionContext = {
        dt: 0,
        from: 0,
        to: 0,
        duration: 0,
    }

    /**
     * @param initial Starting value of every lane.
     * @param velocity Optional per-lane velocity seed for stateful timings.
     */
    constructor(
        compiled: CompiledPlan,
        initial: ArrayLike<number>,
        velocity?: ArrayLike<number> | null
    ) {
        const L = compiled.laneCount
        this.c = compiled
        this.initial = Array.from(initial)
        this.values = Array.from(initial)
        this.previous = Array.from(initial)
        this.velocities = new Array<number>(L).fill(Number.NaN)
        this.seed = new Array<number>(L).fill(0)
        if (velocity) {
            for (let k = 0; k < L; k++) {
                const v = velocity[k]
                if (v !== undefined && v !== 0) this.seed[k] = v
            }
        }
        const E = compiled.eStart.length
        this.eFrom = new Float64Array(E)
        this.eState = new Array(E).fill(null)
        this.cursor = new Int32Array(L)
        this.resolveFrom()
        this.reset()
    }

    /** Back to time zero: forgets integrator state and cursors. */
    public reset(): void {
        const { laneCount, laneOff, eStateful } = this.c
        for (let k = 0; k < laneCount; k++) {
            this.cursor[k] = laneOff[k]! - 1
            this.values[k] = this.initial[k]!
            this.previous[k] = this.initial[k]!
            this.velocities[k] = Number.NaN
        }
        for (let e = 0; e < eStateful.length; e++) {
            this.eState[e] = eStateful[e] ? {} : null
        }
        this.finished = false
    }

    /**
     * `from` of every lane entry = the lane's value at the entry's own start
     * (fixed snapshot). Entries finished by then simply hold their `to`.
     */
    private resolveFrom(): void {
        const { laneCount, laneOff, eStart, eDur, eTo } = this.c
        for (let k = 0; k < laneCount; k++) {
            for (let e = laneOff[k]!; e < laneOff[k + 1]!; e++) {
                if (e === laneOff[k]) {
                    this.eFrom[e] = this.initial[k]!
                    continue
                }
                const p = e - 1
                const local = eStart[e]! - eStart[p]!
                this.eFrom[e] =
                    local >= eDur[p]! - END_TOLERANCE
                        ? eTo[p]!
                        : this.sampleDetached(p, local, k)
            }
        }
    }

    /** Value of entry `e` at `local` without touching the live state. */
    private sampleDetached(e: number, local: number, lane: number): number {
        const fn = this.c.eTiming[e]!
        const ctx = this.ctx
        ctx.dt = 0
        ctx.from = this.eFrom[e]!
        ctx.to = this.c.eTo[e]!
        ctx.duration = this.c.eDur[e]!
        ctx.state = this.c.eStateful[e] ? {} : undefined
        ctx.velocity = this.seedFor(e, lane)
        const r = fn.step(local, ctx)
        return r.endOfAnimation ? ctx.to : r.value
    }

    /** Velocity seeds only apply to a lane's opening segment. */
    private seedFor(e: number, lane: number): number {
        return e === this.c.laneOff[lane] && this.c.eStart[e]! <= END_TOLERANCE
            ? this.seed[lane]!
            : 0
    }

    /**
     * Evaluates every lane at `time` (seconds from timeline start).
     * Any `time` is valid (seek in both directions is deterministic).
     * @param dt Frame delta handed to legacy (non-stateful) timings.
     */
    public evaluate(time: number, dt: number): void {
        const {
            laneCount,
            laneOff,
            eStart,
            eDur,
            eTo,
            eTiming,
            eStateful,
            eKind,
        } = this.c
        const { velocities, cursor, eFrom, eState, ctx } = this
        const values = this.previous
        this.previous = this.values
        this.values = values
        const t = time < 0 ? 0 : time
        let allDone = true
        // properties of one segment usually share a timing: ease once per frame
        let memoFn: TimingFunction | null = null
        let memoLocal = -1
        let memoDur = -1
        let memoEased = 0

        for (let k = 0; k < laneCount; k++) {
            const lo = laneOff[k]!
            const hi = laneOff[k + 1]!
            if (lo === hi) {
                velocities[k] = Number.NaN
                continue
            }

            let c = cursor[k]!
            if (c >= lo && eStart[c]! > t) {
                // seek backwards: re-locate the winner
                let a = lo - 1
                let b = c
                while (b - a > 1) {
                    const mid = (a + b) >> 1
                    if (eStart[mid]! <= t) a = mid
                    else b = mid
                }
                c = a
            }
            while (c + 1 < hi && eStart[c + 1]! <= t) c++
            cursor[k] = c

            if (c < lo) {
                values[k] = this.initial[k]!
                velocities[k] = Number.NaN
                if (allDone) allDone = false
                continue
            }

            const local = t - eStart[c]!
            const dur = eDur[c]!
            if (local >= dur - END_TOLERANCE) {
                values[k] = eTo[c]!
                velocities[k] = eStateful[c] ? 0 : Number.NaN
                if (c !== hi - 1) allDone = false
                continue
            }

            const kind = eKind[c]!
            if (kind !== 0) {
                const fn = eTiming[c]!
                if (fn !== memoFn || local !== memoLocal || dur !== memoDur) {
                    memoFn = fn
                    memoLocal = local
                    memoDur = dur
                    const x = local / dur
                    memoEased =
                        kind === 1 ? x : (fn as BezierTimingFunction).ease(x)
                }
                const origin = eFrom[c]!
                values[k] = origin + (eTo[c]! - origin) * memoEased
                velocities[k] = Number.NaN
                allDone = false
                continue
            }

            ctx.dt = dt
            ctx.from = eFrom[c]!
            ctx.to = eTo[c]!
            ctx.duration = dur
            ctx.state = eState[c] ?? undefined
            ctx.velocity = this.seedFor(c, k)
            const r = eTiming[c]!.step(local, ctx)
            if (r.endOfAnimation) {
                values[k] = ctx.to
                if (eStateful[c]) {
                    velocities[k] = 0
                    if (c !== hi - 1) allDone = false
                } else {
                    velocities[k] = Number.NaN
                    allDone = false
                }
            } else {
                values[k] = r.value
                allDone = false
                if (eStateful[c]) {
                    const v = ctx.state?.velocity
                    velocities[k] = typeof v === 'number' ? v : Number.NaN
                } else {
                    velocities[k] = Number.NaN
                }
            }
        }

        this.finished = allDone && t >= this.c.hardEnd - END_TOLERANCE
    }
}

/**
 * Convenience one-shot evaluation (no caching of the runtime).
 */
export function evaluatePlanAt(
    plan: ExecutionPlan<Groupable>,
    initial: readonly number[],
    keys: readonly string[] | null,
    time: number,
    dt: number = 0
): number[] {
    const runtime = new PlanRuntime(
        compilePlan(plan, keys, initial.length),
        initial
    )
    runtime.evaluate(time, dt)
    return runtime.values.slice()
}
