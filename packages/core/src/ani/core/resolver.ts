import type {
    AnimePrimitive,
    ExecutionPlan,
    Groupable,
    GroupableRecord,
} from '~/ani/core/interface/core_types'
import { evaluatePlanAt } from './plan_runtime'

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

/**
 * Resolves the state of `plan` at `targetTime` (one-shot, uncached runtime).
 * The live engine keeps a `PlanRuntime` instead; this is for ad-hoc sampling.
 */
export function resolvePlanState(
    plan: ExecutionPlan<any>,
    initialValues: AnimePrimitive,
    keyMap: Map<string, number> | null,
    targetTime: number,
    dt: number = 0
): number[] {
    return evaluatePlanAt(
        plan,
        initialValues,
        keyMap ? [...keyMap.keys()] : null,
        targetTime,
        dt
    )
}
