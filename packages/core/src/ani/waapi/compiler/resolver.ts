import type { ExecutionPlan, Groupable } from '~/ani/core/interface/core_types'
import { evaluatePlanAt } from '~/ani/core/plan_runtime'
import { resolveGroup, resolveStateToGroup } from '~/ani/core/resolver'

/**
 * One-shot state lookup. Every call simulates from scratch, so stateful
 * timings (dynamic springs) are deterministic and isolated.
 */
export function resolveStateAt<G extends Groupable>(
    plan: ExecutionPlan<G>,
    initialFrom: G,
    targetTime: number,
    dt?: number
): Groupable {
    const { keyMap, values: initialValues } = resolveGroup(initialFrom)

    const rawResultState = evaluatePlanAt(
        plan,
        initialValues,
        keyMap ? [...keyMap.keys()] : null,
        targetTime,
        dt
    )

    return resolveStateToGroup(rawResultState, keyMap)
}
