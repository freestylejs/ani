import type { ExecutionPlan, Groupable } from '~/ani/core/interface/core_types'
import {
    resolveGroup,
    resolvePlanState,
    resolveStateToGroup,
} from '~/ani/core/resolver'

export function resolveStateAt<G extends Groupable>(
    plan: ExecutionPlan<G>,
    initialFrom: G,
    targetTime: number,
    dt?: number
): Groupable {
    const { keyMap, values: initialValues } = resolveGroup(initialFrom)

    const rawResultState = resolvePlanState(
        plan,
        initialValues,
        keyMap,
        targetTime,
        dt
    )

    return resolveStateToGroup(rawResultState, keyMap)
}
