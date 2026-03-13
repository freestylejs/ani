import { describe, expect, it } from 'vitest'
import {
    compileResolvedPlan,
    resolveCompiledPlanState,
    resolvePlanState,
} from '~/ani/core/resolver'
import type { ExecutionPlan, GroupableRecord } from '~/ani/core/interface/core_types'
import { ani } from '~/nodes'

type PerfCase = {
    label: string
    plan: ExecutionPlan<any>
    initialValues: readonly number[]
    keyMap: Map<string, number> | null
    targetTime: number
    iterations: number
}

function buildArrayPlan(segmentCount: number, width: number): PerfCase {
    const plan: ExecutionPlan<any> = []
    const initialValues = Array.from({ length: width }, (_, index) => index)

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
        plan.push({
            node: ani({
                to: Array.from(
                    { length: width },
                    (_, valueIndex) => segmentIndex + valueIndex + 1
                ),
                duration: 1,
            }),
            startTime: segmentIndex,
            endTime: segmentIndex + 1,
        })
    }

    return {
        label: `array/${segmentCount}/${width}`,
        plan,
        initialValues,
        keyMap: null,
        targetTime: segmentCount / 2 + 0.5,
        iterations: segmentCount >= 1024 ? 1200 : 3000,
    }
}

function buildRecordPlan(segmentCount: number, width: number): PerfCase {
    const plan: ExecutionPlan<any> = []
    const keys = Array.from({ length: width }, (_, index) => `k${index}`)
    const initialValues = Array.from({ length: width }, (_, index) => index)
    const keyMap = new Map(keys.map((key, index) => [key, index]))

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
        const to = Object.fromEntries(
            keys.map((key, index) => [key, segmentIndex + index + 1])
        ) as GroupableRecord

        plan.push({
            node: ani({
                to,
                duration: 1,
            }),
            startTime: segmentIndex,
            endTime: segmentIndex + 1,
        })
    }

    return {
        label: `record/${segmentCount}/${width}`,
        plan,
        initialValues,
        keyMap,
        targetTime: segmentCount / 2 + 0.5,
        iterations: segmentCount >= 1024 ? 800 : 1500,
    }
}

function warmup(caseDef: PerfCase, compiled = compileResolvedPlan(caseDef.plan, caseDef.keyMap)) {
    const warmupIterations = Math.min(500, Math.floor(caseDef.iterations / 2))
    for (let i = 0; i < warmupIterations; i++) {
        resolvePlanState(
            caseDef.plan,
            caseDef.initialValues,
            caseDef.keyMap,
            caseDef.targetTime,
            1 / 60
        )
        resolveCompiledPlanState(
            compiled,
            caseDef.initialValues,
            caseDef.targetTime,
            1 / 60
        )
    }
    return compiled
}

function measure(caseDef: PerfCase) {
    const compiled = warmup(caseDef)

    const legacyStart = performance.now()
    for (let i = 0; i < caseDef.iterations; i++) {
        resolvePlanState(
            caseDef.plan,
            caseDef.initialValues,
            caseDef.keyMap,
            caseDef.targetTime,
            1 / 60
        )
    }
    const legacyMs = performance.now() - legacyStart

    const optimizedStart = performance.now()
    for (let i = 0; i < caseDef.iterations; i++) {
        resolveCompiledPlanState(
            compiled,
            caseDef.initialValues,
            caseDef.targetTime,
            1 / 60
        )
    }
    const optimizedMs = performance.now() - optimizedStart

    return {
        label: caseDef.label,
        legacyMsPerCall: Number((legacyMs / caseDef.iterations).toFixed(4)),
        compiledMsPerCall: Number(
            (optimizedMs / caseDef.iterations).toFixed(4)
        ),
    }
}

describe('raf timeline perf harness', () => {
    it('prints legacy vs compiled resolver timing', () => {
        const results = [
            buildArrayPlan(256, 4),
            buildArrayPlan(1024, 4),
            buildRecordPlan(256, 4),
            buildRecordPlan(256, 16),
            buildRecordPlan(1024, 4),
        ].map(measure)

        console.table(results)

        expect(results).toHaveLength(5)
    })
})
