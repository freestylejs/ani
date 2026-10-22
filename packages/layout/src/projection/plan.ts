export interface PlanBox {
    x: number
    y: number
    width: number
    height: number
}

export type PlanMode = 'position' | 'box' | 'size' | 'preserve-aspect'

export interface NodePlan {
    readonly element: HTMLElement
    readonly mode: PlanMode
    readonly before: PlanBox
    readonly after: PlanBox
    readonly dx: number
    readonly dy: number
    readonly sx: number
    readonly sy: number
    readonly originX: number
    readonly originY: number
    readonly durationMs: number
    readonly startTime: number
    readonly easing: readonly number[]
    readonly animation: Animation
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/**
 * Deterministic eased progress at the requested time. The retained easing
 * samples are the authority; live WAAPI progress is deliberately not read.
 */
function planNow(plan: NodePlan, now: number): number {
    try {
        if (
            plan.animation.playState === 'paused' &&
            typeof plan.animation.currentTime === 'number'
        ) {
            return plan.startTime + plan.animation.currentTime
        }
    } catch {
        // test doubles may not implement playState/currentTime
    }
    return now
}

function easingAt(plan: NodePlan, time: number): number {
    const samples = plan.easing
    if (samples.length < 2) return time
    const position = time * (samples.length - 1)
    const lower = Math.floor(position)
    const upper = Math.min(samples.length - 1, lower + 1)
    const mix = position - lower
    return (samples[lower] ?? 0) * (1 - mix) + (samples[upper] ?? 0) * mix
}

export function planProgress(plan: NodePlan, now: number): number {
    if (plan.durationMs <= 0) return plan.easing.at(-1) ?? 1
    const time = clamp(
        (planNow(plan, now) - plan.startTime) / plan.durationMs,
        0,
        1
    )
    return easingAt(plan, time)
}

/**
 * Visual box at a timeline point, derived from the retained plan. No DOM
 * measurement is performed.
 */
export function evaluatePlanAtProgress(
    plan: NodePlan,
    progress: number
): PlanBox {
    const remaining = 1 - progress
    if (plan.mode === 'position') {
        return {
            x: plan.after.x + plan.dx * remaining,
            y: plan.after.y + plan.dy * remaining,
            width: plan.after.width,
            height: plan.after.height,
        }
    }
    const scaleX = 1 + (plan.sx - 1) * remaining
    const scaleY = 1 + (plan.sy - 1) * remaining
    const tx = plan.dx - plan.originX * (1 - plan.sx)
    const ty = plan.dy - plan.originY * (1 - plan.sy)
    return {
        x: plan.after.x + tx * remaining + plan.originX * (1 - scaleX),
        y: plan.after.y + ty * remaining + plan.originY * (1 - scaleY),
        width: plan.after.width * scaleX,
        height: plan.after.height * scaleY,
    }
}

export function evaluatePlanBox(plan: NodePlan, now: number): PlanBox {
    return evaluatePlanAtProgress(plan, planProgress(plan, now))
}

/** Give every animation in a group the same explicit timeline origin. */
export function assignGroupStartTime(
    animations: readonly Animation[],
    startTime: number
): void {
    for (const animation of animations) {
        try {
            animation.startTime = startTime
        } catch {
            // Some test doubles do not expose startTime; the browser path does.
        }
    }
}

/** Analytic position derivative in local px per millisecond. */
export function planVelocity(
    plan: NodePlan,
    now: number,
    axis: 'x' | 'y' = 'x'
): number {
    if (plan.durationMs <= 0) return 0
    const epsilon = 0.001
    const time = clamp(
        (planNow(plan, now) - plan.startTime) / plan.durationMs,
        0,
        1
    )
    const first = easingAt(plan, time)
    const second = easingAt(plan, Math.min(1, time + epsilon))
    const delta = axis === 'x' ? plan.dx : plan.dy
    return -((second - first) / (plan.durationMs * epsilon)) * delta
}

export function timelineNow(): number {
    if (typeof document !== 'undefined') {
        const value = document.timeline?.currentTime
        if (typeof value === 'number') return value
    }
    if (typeof performance !== 'undefined') return performance.now()
    return 0
}
