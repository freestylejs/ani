export interface PlanBox {
    x: number
    y: number
    width: number
    height: number
}

export type PlanMode = 'position' | 'box' | 'size' | 'preserve-aspect'

export interface PlanPoint {
    /** Normalized keyframe offset. */
    readonly q: number
    /** Local translate in px. */
    readonly tx: number
    readonly ty: number
    readonly sx: number
    readonly sy: number
}

export interface NodePlan {
    readonly element: HTMLElement
    readonly mode: PlanMode
    readonly before: PlanBox
    readonly after: PlanBox
    readonly path: readonly PlanPoint[]
    readonly linear: boolean
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

function easingAt(plan: NodePlan, time: number): number {
    const samples = plan.easing
    if (samples.length < 2) return time
    const position = time * (samples.length - 1)
    const lower = Math.floor(position)
    const upper = Math.min(samples.length - 1, lower + 1)
    const mix = position - lower
    return (samples[lower] ?? 0) * (1 - mix) + (samples[upper] ?? 0) * mix
}

/**
 * Deterministic progress at the requested time. Never consults live WAAPI
 * state. `linear` plans (compiled Hermite paths) use normalized time directly.
 */
export function planProgress(plan: NodePlan, now: number): number {
    if (plan.durationMs <= 0) return plan.linear ? 1 : (plan.easing.at(-1) ?? 1)
    const time = clamp((now - plan.startTime) / plan.durationMs, 0, 1)
    return plan.linear ? time : easingAt(plan, time)
}

/** Current visual progress for capture; the only live-timing entry point. */
export function planCurrentProgress(plan: NodePlan, now: number): number {
    try {
        if (typeof plan.animation.currentTime === 'number') {
            return planProgress(
                plan,
                plan.startTime + plan.animation.currentTime
            )
        }
    } catch {
        // Test doubles may not expose currentTime.
    }
    return planProgress(plan, now)
}

function pathPoint(plan: NodePlan, progress: number): PlanPoint {
    const path = plan.path
    if (path.length === 0) {
        return { q: progress, tx: 0, ty: 0, sx: 1, sy: 1 }
    }
    if (path.length === 1) return path[0]!
    const target = progress
    if (target < 0 && path[0]!.q <= 0) {
        const start = path[0]!
        const next = path[1] ?? start
        const span = next.q - start.q
        const mix = span <= 0 ? 0 : (target - start.q) / span
        return {
            q: target,
            tx: start.tx + (next.tx - start.tx) * mix,
            ty: start.ty + (next.ty - start.ty) * mix,
            sx: start.sx + (next.sx - start.sx) * mix,
            sy: start.sy + (next.sy - start.sy) * mix,
        }
    }
    if (target > 1 && path[path.length - 1]!.q >= 1) {
        const end = path[path.length - 1]!
        const previous = path[path.length - 2] ?? end
        const span = end.q - previous.q
        const mix = span <= 0 ? 0 : (target - end.q) / span
        return {
            q: target,
            tx: end.tx + (end.tx - previous.tx) * mix,
            ty: end.ty + (end.ty - previous.ty) * mix,
            sx: end.sx + (end.sx - previous.sx) * mix,
            sy: end.sy + (end.sy - previous.sy) * mix,
        }
    }
    const bounded = clamp(target, 0, 1)
    let index = 0
    while (index < path.length - 2 && bounded > path[index + 1]!.q) {
        index++
    }
    const start = path[index]!
    const end = path[index + 1] ?? start
    const span = end.q - start.q
    const mix = span <= 0 ? 0 : (bounded - start.q) / span
    return {
        q: target,
        tx: start.tx + (end.tx - start.tx) * mix,
        ty: start.ty + (end.ty - start.ty) * mix,
        sx: start.sx + (end.sx - start.sx) * mix,
        sy: start.sy + (end.sy - start.sy) * mix,
    }
}

/** Visual box at an exact progress point, represented by the emitted path. */
export function evaluatePlanAtProgress(
    plan: NodePlan,
    progress: number
): PlanBox {
    const point = pathPoint(plan, progress)
    if (plan.mode === 'position') {
        return {
            x: plan.after.x + point.tx,
            y: plan.after.y + point.ty,
            width: plan.after.width,
            height: plan.after.height,
        }
    }
    return {
        x: plan.after.x + point.tx + plan.originX * (1 - point.sx),
        y: plan.after.y + point.ty + plan.originY * (1 - point.sy),
        width: plan.after.width * point.sx,
        height: plan.after.height * point.sy,
    }
}

export function evaluatePlanBox(plan: NodePlan, now: number): PlanBox {
    return evaluatePlanAtProgress(plan, planProgress(plan, now))
}

/** Analytic position derivative in local px per millisecond. */
export function planVelocity(
    plan: NodePlan,
    now: number,
    axis: 'x' | 'y' = 'x'
): number {
    const deltaTime = Math.min(1, Math.max(0.001, plan.durationMs))
    const first = evaluatePlanBox(plan, now)
    const second = evaluatePlanBox(plan, now + deltaTime)
    const delta = axis === 'x' ? second.x - first.x : second.y - first.y
    return delta / deltaTime
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

export function timelineNow(): number {
    if (typeof document !== 'undefined') {
        const value = document.timeline?.currentTime
        if (typeof value === 'number') return value
    }
    if (typeof performance !== 'undefined') return performance.now()
    return 0
}
