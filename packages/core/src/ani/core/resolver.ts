import { calculateSegmentState } from '~/ani/core'
import type {
    AnimePrimitive,
    ExecutionPlan,
    Groupable,
    GroupableRecord,
    SegmentDefinition,
} from '~/ani/core/interface/core_types'
import { T, TimingFunction } from '~/timing'
import { isEndOfAnimation } from '~/utils/time'

const DEFAULT_LINEAR = T.linear()

export interface CompiledExecutionSegment {
    startTime: number
    duration: number
    stateIndices: readonly number[]
    toValues: AnimePrimitive
    timings: readonly TimingFunction[]
}

export interface CompiledExecutionPlan {
    segments: readonly CompiledExecutionSegment[]
    maxSegmentLength: number
}

export function resolveGroup(group: Groupable): {
    keys: readonly string[] | null
    keyMap: Map<string, number> | null
    values: AnimePrimitive
} {
    if (Array.isArray(group)) {
        return { keys: null, keyMap: null, values: group }
    }
    const typedGroup = group as GroupableRecord
    const keys = Object.keys(typedGroup)
    const keyMap = new Map(keys.map((key, i) => [key, i]))
    const values = keys.map((key) => typedGroup[key]!)
    return { keys, keyMap, values }
}

export function resolveStateToGroup(
    state: AnimePrimitive,
    keyMap: Map<string, number> | null,
    orderedKeys: readonly string[] | null = null
): Groupable {
    if (!keyMap) {
        return state
    }
    const group: Record<string, number> = {}
    if (orderedKeys) {
        for (let i = 0; i < orderedKeys.length; i++) {
            group[orderedKeys[i]!] = state[i]!
        }
        return group
    }
    for (const [key, index] of keyMap.entries()) {
        group[key] = state[index]!
    }
    return group
}

function createUniformTimings(
    length: number,
    timing: TimingFunction = DEFAULT_LINEAR
): TimingFunction[] {
    return new Array(length).fill(timing)
}

function compileArraySegment(
    segment: ExecutionPlan<any>[number]
): CompiledExecutionSegment {
    const toValues = segment.node.props.to as AnimePrimitive
    const timing = segment.node.props.timing
    const singleTiming =
        (timing as TimingFunction | undefined) ?? DEFAULT_LINEAR

    if (Array.isArray(timing) && timing.length !== toValues.length) {
        throw new TypeError(
            `[calculateSegmentState] timing does not correctly set. It requires multiple timing for ${toValues}, but received ${timing}`
        )
    }

    return {
        startTime: segment.startTime,
        duration: segment.node.duration,
        stateIndices: toValues.map((_, index) => index),
        toValues,
        timings: Array.isArray(timing)
            ? timing
            : createUniformTimings(toValues.length, singleTiming),
    }
}

function compileRecordSegment(
    segment: ExecutionPlan<any>[number],
    rootKeyMap: Map<string, number>
): CompiledExecutionSegment {
    const typedGroup = segment.node.props.to as GroupableRecord
    const keys = Object.keys(typedGroup)
    const timing = segment.node.props.timing
    const timings: TimingFunction[] = []
    const stateIndices: number[] = []
    const toValues: number[] = []
    const isRecordTiming = timing && !(timing instanceof TimingFunction)

    for (const key of keys) {
        stateIndices.push(rootKeyMap.get(key) ?? -1)
        toValues.push(typedGroup[key]!)
        timings.push(
            isRecordTiming
                ? (timing as Record<string, TimingFunction>)[key]!
                : ((timing as TimingFunction | undefined) ?? DEFAULT_LINEAR)
        )
    }

    return {
        startTime: segment.startTime,
        duration: segment.node.duration,
        stateIndices,
        toValues,
        timings,
    }
}

export function compileResolvedPlan(
    plan: ExecutionPlan<any>,
    rootKeyMap: Map<string, number> | null
): CompiledExecutionPlan {
    const segments: CompiledExecutionSegment[] = []
    let maxSegmentLength = 0

    for (const segment of plan) {
        const compiledSegment = Array.isArray(segment.node.props.to)
            ? compileArraySegment(segment)
            : compileRecordSegment(segment, rootKeyMap!)

        segments.push(compiledSegment)
        if (compiledSegment.stateIndices.length > maxSegmentLength) {
            maxSegmentLength = compiledSegment.stateIndices.length
        }
    }

    return {
        segments,
        maxSegmentLength,
    }
}

export function resolveCompiledPlanState(
    compiledPlan: CompiledExecutionPlan,
    initialValues: AnimePrimitive,
    targetTime: number,
    dt: number = 0,
    scratch: number[] = []
): number[] {
    const nextState: number[] = [...initialValues]

    for (const segment of compiledPlan.segments) {
        if (targetTime < segment.startTime) {
            continue
        }

        const localTime = targetTime - segment.startTime
        const t = Math.max(0, Math.min(localTime, segment.duration))
        let allComplete = true

        for (let i = 0; i < segment.stateIndices.length; i++) {
            const stateIndex = segment.stateIndices[i]!
            const fromValue =
                stateIndex === -1 ? undefined : nextState[stateIndex]!
            const animeResponse = segment.timings[i]!.step(t, {
                dt,
                from: fromValue as number,
                to: segment.toValues[i]!,
                duration: segment.duration,
            })

            scratch[i] = animeResponse.value
            if (!animeResponse.endOfAnimation) {
                allComplete = false
            }
        }

        const finalValues =
            allComplete || isEndOfAnimation(t, segment.duration)
                ? segment.toValues
                : scratch

        for (let i = 0; i < segment.stateIndices.length; i++) {
            const stateIndex = segment.stateIndices[i]
            if (stateIndex !== undefined && stateIndex !== -1) {
                nextState[stateIndex] = finalValues[i]!
            }
        }
    }

    return nextState
}

export function resolvePlanState(
    plan: ExecutionPlan<any>,
    initialValues: AnimePrimitive,
    keyMap: Map<string, number> | null,
    targetTime: number,
    dt: number = 0
): number[] {
    const nextState: number[] = [...initialValues]
    let stateAtLastStartTime: number[] = [...initialValues]

    for (const segment of plan) {
        // Skip future
        if (targetTime < segment.startTime) {
            continue
        }

        // Snapshot state at segment start
        stateAtLastStartTime = [...nextState]

        const { keyMap: segKeyMap, values: toValues } = resolveGroup(
            segment.node.props.to
        )

        const isRecordAni = keyMap !== null

        let fromValues: number[] = []
        const timings: Array<TimingFunction> = []
        const t = segment.node.props.timing
        const isRecordTiming = t && !(t instanceof TimingFunction)

        if (isRecordAni) {
            // Record/Object-based animation
            for (const key of segKeyMap!.keys()) {
                const index = keyMap!.get(key)!
                fromValues.push(stateAtLastStartTime[index]!)

                if (isRecordTiming) {
                    timings.push((t as Record<string, TimingFunction>)[key]!)
                }
            }
        } else {
            // Array-based animation
            fromValues = stateAtLastStartTime
        }

        const localTime = targetTime - segment.startTime
        const segmentDef: SegmentDefinition = {
            from: fromValues,
            to: toValues,
            duration: segment.node.duration,
            // default fallback = linear
            timing:
                isRecordAni && isRecordTiming ? timings : (t ?? DEFAULT_LINEAR),
        }

        const result = calculateSegmentState(localTime, segmentDef, dt)

        const finalValues = result.isComplete ? toValues : result.values

        if (isRecordAni) {
            let i = 0
            for (const key of segKeyMap!.keys()) {
                const stateIndex = keyMap!.get(key)
                if (stateIndex !== undefined && stateIndex !== -1) {
                    nextState[stateIndex] = finalValues[i]!
                }
                i++
            }
        } else {
            for (let i = 0; i < finalValues.length; i++) {
                nextState[i] = finalValues[i]!
            }
        }
    }

    return nextState
}
