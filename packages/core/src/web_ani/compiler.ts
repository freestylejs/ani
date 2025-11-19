import type { AnimationNode, ExecutionPlan, Groupable } from '../ani'
import {
    type AnimePrimitive,
    calculateSegmentState,
    type SegmentDefinition,
} from '../ani/engine'
import { createStyleSheet } from '../style'
import { TimingFunction } from '../timing'
import { LinearTimingFunction } from '../timing/linear'
import { compileTiming } from './timing_compiler'

/**
 * Represents a WAAPI compatible keyframe
 */
export interface WebAniKeyframe extends Record<string, string | number | null> {
    offset: number
    easing?: string
}

/**
 * Compiles an AnimationNode tree into a set of Keyframes compatible with Element.animate().
 *
 * @param rootNode The root animation node.
 * @param initialFrom The initial state (values).
 * @param options Configuration options.
 */
export function compileToKeyframes<G extends Groupable>(
    rootNode: AnimationNode<G>,
    initialFrom: G
): WebAniKeyframe[] {
    const plan: ExecutionPlan<G> = []
    rootNode.construct(plan, 0)

    if (plan.length === 0) {
        return []
    }

    const duration = Math.max(...plan.map((s) => s.endTime))
    if (duration === 0) {
        const state = resolveStateAt(plan, initialFrom, 0)
        const style = createStyleSheet(state as Record<string, number>)
        return [
            { offset: 0, ...style },
            { offset: 1, ...style },
        ]
    }

    // Collect critical time points (start/end of segments)
    const timePoints = new Set<number>([0, duration])
    for (const seg of plan) {
        timePoints.add(seg.startTime)
        timePoints.add(seg.endTime)
    }
    const sortedTimes = Array.from(timePoints).sort((a, b) => a - b)

    const keyframes: WebAniKeyframe[] = []

    const getEasingForInterval = (t: number, nextT: number): string => {
        const activeSegments = plan.filter(
            (s) => s.startTime <= t && s.endTime >= nextT
        )

        if (activeSegments.length === 0) return 'linear'

        const timings = activeSegments
            .map((s) => s.node.props.timing)
            .filter((t) => t !== undefined)

        if (timings.length === 0) return 'linear'

        const firstTiming = timings[0]

        if (!(firstTiming instanceof TimingFunction)) {
            return 'linear'
        }

        const allSame = timings.every((t) => t === firstTiming)

        if (allSame) {
            return compileTiming(firstTiming)
        }

        return 'linear'
    }

    for (let i = 0; i < sortedTimes.length; i++) {
        const t = sortedTimes[i]!
        const state = resolveStateAt(plan, initialFrom, t)
        const normalizedState = normalizeKeys(state)
        const style = createStyleSheet(normalizedState as Record<string, number>)

        const keyframe: WebAniKeyframe = {
            offset: t / duration,
            ...style,
        }

        if (i < sortedTimes.length - 1) {
            const nextT = sortedTimes[i + 1]!
            keyframe.easing = getEasingForInterval(t, nextT)
        }

        keyframes.push(keyframe)
    }

    return keyframes
}

function normalizeKeys(state: Groupable): Record<string, any> {
    if (Array.isArray(state)) return {}
    const normalized: Record<string, any> = {}
    const recordState = state as Record<string, any>
    for (const key in recordState) {
        if (key === 'x') {
            normalized['translateX'] = recordState[key]
        } else if (key === 'y') {
            normalized['translateY'] = recordState[key]
        } else if (key === 'z') {
            normalized['translateZ'] = recordState[key]
        } else {
            normalized[key] = recordState[key]
        }
    }
    return normalized
}

function resolveGroup(group: Groupable): {
    keyMap: Map<string, number> | null
    values: AnimePrimitive
} {
    if (Array.isArray(group)) {
        return { keyMap: null, values: group }
    }
    const keyMap = new Map(Object.keys(group).map((key, i) => [key, i]))
    const values = Object.values(group) as AnimePrimitive
    return { keyMap, values }
}

function resolveStateToGroup(
    state: AnimePrimitive,
    keyMap: Map<string, number> | null
): Groupable {
    if (!keyMap) {
        return state
    }
    const group: Record<string, number> = {}
    let i = 0
    for (const key of keyMap.keys()) {
        group[key] = state[i]!
        i++
    }
    return group
}

function resolveStateAt<G extends Groupable>(
    plan: ExecutionPlan<G>,
    initialFrom: G,
    targetTime: number
): Groupable {
    const { keyMap, values: initialValues } = resolveGroup(initialFrom)
    const propertyKeyMap = keyMap

    const nextState: number[] = [...initialValues]
    let stateAtLastStartTime: number[] = [...initialValues]

    for (const segment of plan) {
        if (targetTime < segment.startTime) {
            continue
        }

        stateAtLastStartTime = [...nextState]

        const { keyMap: segKeyMap, values: toValues } = resolveGroup(
            segment.node.props.to
        )

        let fromValues: number[] = []
        if (propertyKeyMap) {
            for (const key of segKeyMap!.keys()) {
                const index = propertyKeyMap.get(key)!
                fromValues.push(stateAtLastStartTime[index]!)
            }
        } else {
            fromValues = stateAtLastStartTime
        }

        const localTime = targetTime - segment.startTime
        const timing =
            (segment.node.props.timing as any) ?? new LinearTimingFunction()
        const segmentDef: SegmentDefinition = {
            from: fromValues,
            to: toValues,
            duration: segment.node.duration,
            timing: timing,
        }

        const result = calculateSegmentState(localTime, segmentDef)

        if (propertyKeyMap) {
            let i = 0
            for (const key of segKeyMap!.keys()) {
                const stateIndex = propertyKeyMap.get(key)!
                nextState[stateIndex] = result.values[i]!
                i++
            }
        } else {
            for (let i = 0; i < result.values.length; i++) {
                nextState[i] = result.values[i]!
            }
        }
    }

    return resolveStateToGroup(nextState, propertyKeyMap)
}
