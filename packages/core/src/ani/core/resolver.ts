import { calculateSegmentState } from '~/ani/core'
import type {
    AnimePrimitive,
    ExecutionPlan,
    Groupable,
    GroupableRecord,
    SegmentDefinition,
} from '~/ani/core/interface/core_types'
import { T, TimingFunction } from '~/timing'

export function resolveGroup(group: Groupable): {
    keyMap: Map<string, number> | null
    values: AnimePrimitive
} {
    if (Array.isArray(group)) {
        return { keyMap: null, values: group }
    }
    const typedGroup = group as GroupableRecord
    const keys = Object.keys(typedGroup)
    const keyMap = new Map(keys.map((key, i) => [key, i]))
    const values = keys.map((key) => typedGroup[key]!)
    return { keyMap, values }
}

export function resolveStateToGroup(
    state: AnimePrimitive,
    keyMap: Map<string, number> | null
): Groupable {
    if (!keyMap) {
        return state
    }
    const group: Record<string, number> = {}
    for (const [key, index] of keyMap.entries()) {
        group[key] = state[index]!
    }
    return group
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
            timing: isRecordAni && isRecordTiming ? timings : (t ?? T.linear()),
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
