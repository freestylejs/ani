import type { ExecutionPlan, Groupable } from '~/ani/core/interface/core_types'
import { createStyleSheet } from '~/style'
import { TimingFunction } from '~/timing'
import { resolveStateAt } from './resolver'
import { compileTiming } from './timing_compiler'

export interface WebAniKeyframe extends Record<string, string | number | null> {
    offset: number
    easing?: string
}

/**
 * Compiles an ExecutionPlan into WAAPI Keyframes.
 * @param plan The resolved execution plan (from TimelineBase).
 * @param initialFrom The initial state (values).
 */
export function compileToKeyframes<G extends Groupable>(
    plan: ExecutionPlan<G>,
    initialFrom: G
): WebAniKeyframe[] {
    if (plan.length === 0) {
        return []
    }

    const FPS = 60
    const SAMPLE_RATE = 1 / FPS

    // 1. Calculate Duration from the Plan, not the Node
    const duration = Math.max(...plan.map((s) => s.endTime))

    if (duration === 0) {
        const state = resolveStateAt(plan, initialFrom, 0, SAMPLE_RATE)
        const style = createStyleSheet(state as Record<string, number>)
        return [
            { offset: 0, ...style },
            { offset: 1, ...style },
        ]
    }

    // 2. Collect critical time points
    const timePoints = new Set<number>([0, duration])
    for (const seg of plan) {
        timePoints.add(seg.startTime)
        timePoints.add(seg.endTime)
    }
    const sortedTimes = Array.from(timePoints).sort((a, b) => a - b)

    const keyframes: WebAniKeyframe[] = []

    const getEasingForInterval = (t: number, nextT: number): string | null => {
        const activeSegments = plan.filter(
            (s) => s.startTime <= t && s.endTime >= nextT
        )

        // If no segments are active (gap), linear is fine (maintains state)
        if (activeSegments.length === 0) return 'linear'

        const timings = activeSegments
            .map((s) => s.node.props.timing)
            .filter((t) => t !== undefined)

        if (timings.length === 0) return 'linear'

        const firstTiming = timings[0]

        // If mixing different timings, we must sample
        const allSame = timings.every((t) => t === firstTiming)

        if (allSame && firstTiming instanceof TimingFunction) {
            return compileTiming(firstTiming)
        }

        // Fallback to sampling
        return null
    }

    for (let i = 0; i < sortedTimes.length; i++) {
        const currT = sortedTimes[i]!
        const state = resolveStateAt(plan, initialFrom, currT, SAMPLE_RATE)
        const style = createStyleSheet(state as Record<string, number>)

        const keyframe: WebAniKeyframe = {
            offset: currT / duration,
            ...style,
        }

        keyframes.push(keyframe)

        if (i < sortedTimes.length - 1) {
            const nextT = sortedTimes[i + 1]!
            const easing = getEasingForInterval(currT, nextT)

            if (easing === null) {
                let sampleT = currT + SAMPLE_RATE
                while (sampleT < nextT) {
                    const sampleState = resolveStateAt(
                        plan,
                        initialFrom,
                        sampleT,
                        SAMPLE_RATE
                    )
                    const sampleStyle = createStyleSheet(
                        sampleState as Record<string, number>
                    )
                    keyframes.push({
                        offset: sampleT / duration,
                        ...sampleStyle,
                        easing: 'linear',
                    })
                    sampleT += SAMPLE_RATE
                }
                keyframe.easing = 'linear'
            } else {
                keyframe.easing = easing
            }
        }
    }

    return keyframes
}
