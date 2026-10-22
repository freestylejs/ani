import { type TimingFunction, timing } from '@freestylejs/ani-core'
import { cssEasing, easingValues } from './easing'
import {
    hasDOM,
    isActiveViewTransition,
    reducedLayoutMotion,
    supportsFlip,
} from './feature'
import { anchorOrigin, compileChildProjection } from './projection/compiler'
import {
    cancelGroupRun,
    finishGroupRun,
    type GroupRun,
} from './projection/group_plan'
import {
    assignGroupStartTime,
    evaluatePlanAtProgress,
    evaluatePlanBox,
    type NodePlan,
    type PlanPoint,
    planVelocity,
    timelineNow,
} from './projection/plan'
import type {
    LayoutGroup,
    LayoutGroupOptions,
    LayoutMode,
    LayoutMotion,
    LayoutResult,
    LayoutSnapshot,
} from './types'

interface Rect {
    x: number
    y: number
    width: number
    height: number
}

interface SnapshotItem {
    element: HTMLElement
    rect: Rect
    offsetWidth: number
    offsetHeight: number
}

interface SnapshotData {
    dependencies: Map<HTMLElement, unknown>
    parents: Map<HTMLElement, HTMLElement>
    owner: object
    items: Map<HTMLElement, SnapshotItem>
    byId: Map<string, SnapshotItem>
    used: boolean
    expired: boolean
}

interface Participant {
    element: HTMLElement
    layout: LayoutMode
    layoutId?: string | undefined
    layoutAnchor?: { x: number; y: number } | undefined
    motion?: LayoutMotion | undefined
    layoutDependency?: unknown
}

interface Candidate {
    element: HTMLElement
    before: Rect
    after: Rect
    dx: number
    dy: number
    mode: LayoutMode
    sx: number
    sy: number
    originX: number
    originY: number
    velocityX?: number | undefined
    velocityY?: number | undefined
    requestedMode: 'size' | 'preserve-aspect' | 'other'
    parentElement?: HTMLElement | undefined
    parent?: Candidate | undefined
    projected?: boolean
    anchor?: { x: number; y: number } | undefined
    motion?: LayoutMotion | undefined
    skip?: boolean
    radius?: number
}

const DEFAULT_DURATION = 0.35
const DEFAULT_THRESHOLD = 1
const DEFAULT_MAX_ANIMATED = 300
const DEFAULT_MAX_BOXES = 16

function defaultTiming(): TimingFunction {
    return timing.bezier({
        p2: { x: 0.2, y: 0 },
        p3: { x: 0, y: 1 },
    })
}

function rectOf(element: HTMLElement): Rect {
    const rect = element.getBoundingClientRect()
    return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
    }
}

function sameRect(a: Rect, b: Rect): boolean {
    return (
        a.x === b.x &&
        a.y === b.y &&
        a.width === b.width &&
        a.height === b.height
    )
}

function parseOrigin(
    value: string,
    width: number,
    height: number
): { x: number; y: number } {
    const parts = value.trim().split(/\s+/)
    const parse = (part: string | undefined, size: number): number => {
        if (!part) return size / 2
        if (part.endsWith('%')) return (Number.parseFloat(part) / 100) * size
        if (part.endsWith('px')) return Number.parseFloat(part)
        return Number.parseFloat(part)
    }
    return {
        x: parse(parts[0], width),
        y: parse(parts[1] ?? parts[0], height),
    }
}

function motionOf(
    options: LayoutGroupOptions,
    motion: LayoutMotion | undefined
): { duration: number; easing: string; easingValues: number[] } {
    const duration =
        motion?.duration ?? options.motion?.duration ?? DEFAULT_DURATION
    if (!Number.isFinite(duration) || duration <= 0) {
        throw new RangeError(
            `[Layout] motion.duration must be a finite number > 0, received ${String(duration)}.`
        )
    }
    const timingFunction =
        motion?.timing ?? options.motion?.timing ?? defaultTiming()
    return {
        duration,
        easing: cssEasing(timingFunction),
        easingValues: easingValues(timingFunction),
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/**
 * Sampled Hermite path with the old velocity at the start and zero velocity at
 * the target. The path is retained and is the same data used by the keyframes.
 */
function velocityPath(
    dx: number,
    dy: number,
    velocityX: number,
    velocityY: number,
    durationMs: number
): PlanPoint[] {
    const slopeX = dx === 0 ? 0 : clamp((velocityX * durationMs) / dx, -4, 4)
    const slopeY = dy === 0 ? 0 : clamp((velocityY * durationMs) / dy, -4, 4)
    const points: PlanPoint[] = [
        { q: 0, tx: dx, ty: dy, sx: 1, sy: 1 },
        {
            q: Math.min(0.5, 1 / durationMs),
            tx: dx + velocityX,
            ty: dy + velocityY,
            sx: 1,
            sy: 1,
        },
    ]
    const steps = 11
    for (let index = 1; index < steps; index++) {
        const q = index / (steps - 1)
        const basis = 2 * q ** 3 - 3 * q ** 2 + 1
        const slopeBasis = q ** 3 - 2 * q ** 2 + q
        points.push({
            q,
            tx: dx * (basis + slopeX * slopeBasis),
            ty: dy * (basis + slopeY * slopeBasis),
            sx: 1,
            sy: 1,
        })
    }
    return points
}

function pathKeyframes(path: readonly PlanPoint[]): Keyframe[] {
    return path.map((point) => ({
        offset: point.q,
        translate: `${point.tx}px ${point.ty}px`,
        scale: `${point.sx} ${point.sy}`,
    })) as Keyframe[]
}

function positionPath(dx: number, dy: number): PlanPoint[] {
    return [
        { q: 0, tx: dx, ty: dy, sx: 1, sy: 1 },
        { q: 1, tx: 0, ty: 0, sx: 1, sy: 1 },
    ]
}

interface LivePlanSample {
    box: ReturnType<typeof evaluatePlanAtProgress>
    x: number
    y: number
}

/** Current visual box and 1ms visual velocity from the live paused animation. */
function livePlanSample(plan: NodePlan): LivePlanSample | null {
    const animation = plan.animation
    if (
        typeof animation.currentTime !== 'number' ||
        typeof animation.effect?.getComputedTiming !== 'function'
    ) {
        return null
    }
    const firstProgress = animation.effect.getComputedTiming().progress
    if (typeof firstProgress !== 'number') return null
    const original = animation.currentTime
    let secondProgress: number | undefined
    try {
        animation.currentTime = original + 1
        const value = animation.effect.getComputedTiming().progress
        if (typeof value === 'number') secondProgress = value
    } catch {
        // Fall through to the plan derivative.
    } finally {
        try {
            animation.currentTime = original
        } catch {
            // Ignore restoration failures on detached animations.
        }
    }
    if (secondProgress === undefined) return null
    const firstBox = evaluatePlanAtProgress(plan, firstProgress)
    const secondBox = evaluatePlanAtProgress(plan, secondProgress)
    return {
        box: firstBox,
        x: secondBox.x - firstBox.x,
        y: secondBox.y - firstBox.y,
    }
}

function hasRotateOrSkew(style: CSSStyleDeclaration): boolean {
    const rotate = style.rotate
    if (rotate && rotate !== 'none' && rotate !== '0deg') return true
    const transform = style.transform
    if (!transform || transform === 'none') return false
    const match = transform.match(/matrix\(([^)]+)\)/)
    if (!match) return transform !== 'none'
    const values = match[1]!.split(',').map(Number)
    if (values.length < 4) return true
    return Math.abs(values[1] ?? 0) > 1e-6 || Math.abs(values[2] ?? 0) > 1e-6
}

function canAnimate(): boolean {
    return hasDOM() && supportsFlip()
}

/**
 * WAAPI-backed approximate FLIP group.
 *
 * No ANI clock subscription and no per-frame JS. Capture happens before the
 * mutation; play measures after it and starts browser animations.
 */
export function createLayoutGroup(
    options: LayoutGroupOptions = {}
): LayoutGroup {
    const owner = {}
    const participants = new Map<HTMLElement, Participant>()
    let run: GroupRun | null = null

    const finishRun = (state: GroupRun, result: LayoutResult): void => {
        if (run !== state) return
        run = null
        state.resolve(result)
    }

    const cancelRun = (result: LayoutResult): void => {
        const state = run
        if (!state) return
        run = null
        cancelGroupRun(state)
        state.resolve(result)
    }

    const group: LayoutGroup = {
        add(element, participantOptions = {}) {
            const existing = participants.get(element)
            if (existing) {
                existing.layout = participantOptions.layout ?? 'position'
                existing.layoutId = participantOptions.layoutId
                existing.layoutAnchor = participantOptions.layoutAnchor
                existing.motion = participantOptions.motion
                existing.layoutDependency = participantOptions.layoutDependency
                return () => {
                    if (participants.get(element)?.element !== element) return
                    participants.delete(element)
                }
            }
            participants.set(element, {
                element,
                layout: participantOptions.layout ?? 'position',
                layoutId: participantOptions.layoutId,
                layoutAnchor: participantOptions.layoutAnchor,
                motion: participantOptions.motion,
                layoutDependency: participantOptions.layoutDependency,
            })
            return () => {
                if (participants.get(element)?.element !== element) return
                participants.delete(element)
            }
        },

        set(element, participantOptions) {
            const participant = participants.get(element)
            if (!participant) return
            participant.layout = participantOptions.layout ?? 'position'
            participant.layoutId = participantOptions.layoutId
            participant.layoutAnchor = participantOptions.layoutAnchor
            participant.motion = participantOptions.motion
            participant.layoutDependency = participantOptions.layoutDependency
        },

        update(mutate, motion) {
            const snapshot = group.capture()
            try {
                mutate()
            } catch (error) {
                ;(snapshot as unknown as SnapshotData).expired = true
                throw error
            }
            return group.play(snapshot, motion)
        },

        capture() {
            const data: SnapshotData = {
                owner,
                items: new Map(),
                byId: new Map(),
                used: false,
                expired: false,
                dependencies: new Map(),
                parents: new Map(),
            }
            if (hasDOM()) {
                const activePlans = new Map<HTMLElement, NodePlan>()
                if (run) {
                    for (const plan of run.plans) {
                        activePlans.set(plan.element, plan)
                    }
                }
                for (const participant of participants.values()) {
                    const element = participant.element
                    if (!element.isConnected) continue
                    const plan = activePlans.get(element)
                    let rect: Rect
                    let offsetWidth: number
                    let offsetHeight: number
                    try {
                        const progress =
                            plan?.animation.effect?.getComputedTiming().progress
                        if (plan?.projected) {
                            rect = rectOf(element)
                            offsetWidth = element.offsetWidth
                            offsetHeight = element.offsetHeight
                        } else if (plan && typeof progress === 'number') {
                            const box = evaluatePlanAtProgress(plan, progress)
                            rect = {
                                x: box.x,
                                y: box.y,
                                width: box.width,
                                height: box.height,
                            }
                            offsetWidth = plan.after.width
                            offsetHeight = plan.after.height
                        } else {
                            rect = rectOf(element)
                            offsetWidth = element.offsetWidth
                            offsetHeight = element.offsetHeight
                        }
                    } catch {
                        rect = rectOf(element)
                        offsetWidth = element.offsetWidth
                        offsetHeight = element.offsetHeight
                    }
                    const item: SnapshotItem = {
                        element,
                        rect,
                        offsetWidth,
                        offsetHeight,
                    }
                    data.items.set(element, item)
                    let parent = element.parentElement
                    while (parent && !participants.has(parent)) {
                        parent = parent.parentElement
                    }
                    if (parent) data.parents.set(element, parent)
                    if (participant.layoutDependency !== undefined) {
                        data.dependencies.set(
                            element,
                            participant.layoutDependency
                        )
                    }
                    if (participant.layoutId) {
                        data.byId.set(participant.layoutId, item)
                    }
                }
            }
            setTimeout(() => {
                if (!data.used) data.expired = true
            }, 0)
            return data as unknown as LayoutSnapshot
        },

        async play(snapshot, motion) {
            const data = snapshot as unknown as SnapshotData
            if (!data || data.owner !== owner || data.used || data.expired) {
                return 'stale'
            }
            data.used = true
            if (!canAnimate()) return 'unsupported'
            if (isActiveViewTransition()) {
                cancelRun('yielded')
                return 'yielded'
            }

            const reduced = reducedLayoutMotion(
                options.clock,
                options.reducedMotion
            )
            if (reduced === 'skip') {
                cancelRun('reduced')
                return 'reduced'
            }

            let {
                duration,
                easing,
                easingValues: planEasing,
            } = motionOf(options, motion)
            if (
                reduced === 'clamp' &&
                options.reducedMotion &&
                typeof options.reducedMotion === 'object'
            ) {
                duration = Math.min(duration, options.reducedMotion.maxDuration)
            }

            const threshold = options.threshold ?? DEFAULT_THRESHOLD
            const maxAnimated = options.maxAnimated ?? DEFAULT_MAX_ANIMATED
            const maxBoxes = options.maxBoxes ?? DEFAULT_MAX_BOXES
            const layoutLeads = new Map<string, Participant>()
            for (const participant of participants.values()) {
                if (participant.layoutId) {
                    layoutLeads.set(participant.layoutId, participant)
                }
            }
            const active = run
            const activeBefore = new Map<HTMLElement, SnapshotItem>()
            const activeVisual = new Map<HTMLElement, SnapshotItem>()
            const activeVelocity = new Map<
                HTMLElement,
                { x: number; y: number }
            >()
            if (active) {
                const now = timelineNow()
                for (const plan of active.plans) {
                    if (!plan.element.isConnected) continue
                    if (
                        typeof plan.animation.effect?.getComputedTiming !==
                        'function'
                    ) {
                        continue
                    }
                    const planNow =
                        typeof plan.animation.currentTime === 'number'
                            ? plan.startTime + plan.animation.currentTime
                            : now
                    const live = livePlanSample(plan)
                    const box = live?.box ?? evaluatePlanBox(plan, planNow)
                    activeVelocity.set(
                        plan.element,
                        live
                            ? { x: live.x, y: live.y }
                            : {
                                  x: planVelocity(plan, planNow, 'x'),
                                  y: planVelocity(plan, planNow, 'y'),
                              }
                    )
                    activeBefore.set(plan.element, {
                        element: plan.element,
                        rect: {
                            x: box.x,
                            y: box.y,
                            width: box.width,
                            height: box.height,
                        },
                        offsetWidth: plan.element.offsetWidth,
                        offsetHeight: plan.element.offsetHeight,
                    })
                }
                const activeElements = new Set(
                    active.plans.map((plan) => plan.element)
                )
                let changed = false
                for (const participant of participants.values()) {
                    const element = participant.element
                    if (!element.isConnected) continue
                    if (
                        participant.layoutId &&
                        layoutLeads.get(participant.layoutId) !== participant
                    ) {
                        continue
                    }
                    if (!activeElements.has(element)) {
                        changed = true
                        break
                    }
                    const before =
                        data.items.get(element) ??
                        (participant.layoutId
                            ? data.byId.get(participant.layoutId)
                            : undefined)
                    if (!before) continue
                    const current = rectOf(element)
                    activeVisual.set(element, {
                        element,
                        rect: current,
                        offsetWidth: element.offsetWidth,
                        offsetHeight: element.offsetHeight,
                    })
                    if (sameRect(before.rect, current)) continue
                    const sx = before.rect.width / current.width
                    const sy = before.rect.height / current.height
                    if (
                        Math.abs(before.rect.x - current.x) >= threshold ||
                        Math.abs(before.rect.y - current.y) >= threshold ||
                        Math.abs(sx - 1) >= 0.01 ||
                        Math.abs(sy - 1) >= 0.01
                    ) {
                        changed = true
                        break
                    }
                }
                if (!changed) return 'no-change'
                cancelRun('interrupted')
            }
            const candidates: Candidate[] = []
            const after = new Map<HTMLElement, SnapshotItem>()
            const viewportWidth =
                typeof window === 'undefined' ? Infinity : window.innerWidth
            const viewportHeight =
                typeof window === 'undefined' ? Infinity : window.innerHeight
            const visible = (rect: Rect): boolean =>
                rect.x + rect.width > -viewportWidth * 0.1 &&
                rect.x < viewportWidth * 1.1 &&
                rect.y + rect.height > -viewportHeight * 0.1 &&
                rect.y < viewportHeight * 1.1

            for (const participant of participants.values()) {
                const element = participant.element
                if (!element.isConnected) continue
                if (
                    participant.layoutId &&
                    layoutLeads.get(participant.layoutId) !== participant
                ) {
                    continue
                }
                const current: SnapshotItem = {
                    element,
                    rect: rectOf(element),
                    offsetWidth: element.offsetWidth,
                    offsetHeight: element.offsetHeight,
                }
                after.set(element, current)
                if (
                    current.rect.width === 0 ||
                    current.rect.height === 0 ||
                    current.offsetWidth === 0 ||
                    current.offsetHeight === 0
                ) {
                    continue
                }
                const ratioX = current.rect.width / current.offsetWidth
                const ratioY = current.rect.height / current.offsetHeight
                if (
                    Math.abs(ratioX - 1) > 0.02 ||
                    Math.abs(ratioY - 1) > 0.02
                ) {
                    continue
                }

                let before = data.items.get(element)
                if (!before && participant.layoutId) {
                    before = data.byId.get(participant.layoutId)
                }
                const hasParent = data.parents.has(element)
                if (
                    !before ||
                    (sameRect(before.rect, current.rect) && !hasParent)
                ) {
                    continue
                }
                if (
                    participant.layoutDependency !== undefined &&
                    Object.is(
                        data.dependencies.get(element),
                        participant.layoutDependency
                    )
                ) {
                    continue
                }
                if (!visible(before.rect) && !visible(current.rect)) continue

                let dx = before.rect.x - current.rect.x
                let dy = before.rect.y - current.rect.y
                let sx = before.rect.width / current.rect.width
                let sy = before.rect.height / current.rect.height
                let mode = participant.layout
                if (mode === 'size') {
                    dx = 0
                    dy = 0
                    mode = 'box'
                } else if (mode === 'preserve-aspect') {
                    const uniform = Math.min(sx, sy)
                    sx = uniform
                    sy = uniform
                    mode = 'box'
                }
                const moved =
                    Math.abs(dx) >= threshold ||
                    Math.abs(dy) >= threshold ||
                    Math.abs(sx - 1) >= 0.01 ||
                    Math.abs(sy - 1) >= 0.01
                if (!moved && !hasParent) continue

                candidates.push({
                    element,
                    before: before.rect,
                    after: current.rect,
                    dx,
                    dy,
                    mode,
                    sx,
                    sy,
                    originX: 0,
                    originY: 0,
                    velocityX: activeVelocity.get(element)?.x,
                    velocityY: activeVelocity.get(element)?.y,
                    parentElement: data.parents.get(element),
                    anchor: participant.layoutAnchor,
                    motion: participant.motion,
                    requestedMode:
                        participant.layout === 'size' ||
                        participant.layout === 'preserve-aspect'
                            ? participant.layout
                            : 'other',
                })
            }

            if (candidates.length === 0) {
                return 'no-change'
            }
            if (candidates.length > maxAnimated) {
                cancelRun('capped')
                return 'capped'
            }

            // Read all box facts before creating any animation. This keeps
            // every layout/style read before the first write of the pass.
            let boxCount = 0
            for (const candidate of candidates) {
                if (candidate.mode !== 'box') continue
                if (
                    boxCount >= maxBoxes ||
                    candidate.sx < 0.25 ||
                    candidate.sx > 4 ||
                    candidate.sy < 0.25 ||
                    candidate.sy > 4
                ) {
                    if (candidate.requestedMode !== 'other') {
                        candidate.skip = true
                        continue
                    }
                    candidate.mode = 'position'
                    continue
                }
                boxCount++
                try {
                    const computed = getComputedStyle(candidate.element)
                    const scale = computed.scale || 'none'
                    const rotate = computed.rotate || 'none'
                    const transform = computed.transform || 'none'
                    const translate = computed.translate || 'none'
                    if (
                        (scale !== 'none' && scale !== '1') ||
                        (rotate !== 'none' && rotate !== '0deg') ||
                        (translate !== 'none' && translate !== '0px') ||
                        transform !== 'none'
                    ) {
                        if (candidate.requestedMode !== 'other') {
                            candidate.skip = true
                            continue
                        }
                        candidate.mode = 'position'
                        continue
                    }
                    let ancestor = candidate.element.parentElement
                    while (ancestor && ancestor !== document.body) {
                        const ancestorStyle = getComputedStyle(ancestor)
                        if (hasRotateOrSkew(ancestorStyle)) {
                            candidate.skip = true
                            break
                        }
                        ancestor = ancestor.parentElement
                    }
                    if (candidate.skip) continue
                    const afterRect =
                        after.get(candidate.element)?.rect ??
                        rectOf(candidate.element)
                    const origin = candidate.anchor
                        ? anchorOrigin(
                              candidate.anchor,
                              afterRect.width,
                              afterRect.height
                          )
                        : parseOrigin(
                              computed.transformOrigin || '50% 50%',
                              afterRect.width,
                              afterRect.height
                          )
                    const corners = [
                        computed.borderTopLeftRadius,
                        computed.borderTopRightRadius,
                        computed.borderBottomRightRadius,
                        computed.borderBottomLeftRadius,
                    ]
                    const firstCorner = corners[0] ?? ''
                    if (
                        firstCorner.endsWith('px') &&
                        corners.every((corner) => corner === firstCorner)
                    ) {
                        const radius = Number.parseFloat(firstCorner)
                        if (radius > 0) candidate.radius = radius
                    }
                    candidate.originX = origin.x
                    candidate.originY = origin.y
                } catch (error) {
                    if (candidate.requestedMode === 'other') {
                        candidate.mode = 'position'
                    } else {
                        candidate.skip = true
                    }
                    options.onError?.(error, candidate.element)
                }
            }

            // Depth-1 projection: a child of a projected parent starts from
            // the local coordinate that produces its captured visual box after
            // the parent transform. This is a bounded analytic correction, not
            // a per-frame loop.
            const candidateByElement = new Map(
                candidates.map((candidate) => [candidate.element, candidate])
            )
            for (const candidate of candidates) {
                if (!candidate.parentElement) continue
                const parent = candidateByElement.get(candidate.parentElement)
                if (!parent || parent.skip) continue
                if (
                    parent.parentElement &&
                    candidateByElement.has(parent.parentElement)
                ) {
                    candidate.skip = true
                    continue
                }
                const projected = compileChildProjection(
                    {
                        after: {
                            x: parent.after.x,
                            y: parent.after.y,
                            width: parent.after.width,
                            height: parent.after.height,
                        },
                        dx: parent.dx,
                        dy: parent.dy,
                        sx: parent.sx,
                        sy: parent.sy,
                        mode: parent.mode,
                    },
                    {
                        before: {
                            x: candidate.before.x,
                            y: candidate.before.y,
                            width: candidate.before.width,
                            height: candidate.before.height,
                        },
                        after: {
                            x: candidate.after.x,
                            y: candidate.after.y,
                            width: candidate.after.width,
                            height: candidate.after.height,
                        },
                        mode: candidate.mode,
                    }
                )
                if (!projected) {
                    candidate.skip = true
                    continue
                }
                candidate.parent = parent
                candidate.projected = true
                candidate.dx = projected.dx
                candidate.dy = projected.dy
                if (candidate.mode === 'box') {
                    candidate.sx = projected.sx
                    candidate.sy = projected.sy
                    if (
                        candidate.sx < 0.25 ||
                        candidate.sx > 4 ||
                        candidate.sy < 0.25 ||
                        candidate.sy > 4
                    ) {
                        candidate.skip = true
                    }
                }
                const projectedMoved =
                    Math.abs(candidate.dx) >= threshold ||
                    Math.abs(candidate.dy) >= threshold ||
                    Math.abs(candidate.sx - 1) >= 0.01 ||
                    Math.abs(candidate.sy - 1) >= 0.01
                if (!projectedMoved) candidate.skip = true
            }

            const animations: Animation[] = []
            const plans: NodePlan[] = []
            const startTime = timelineNow()
            for (const candidate of candidates) {
                if (candidate.skip) continue
                try {
                    const candidateMotion = motionOf(
                        options,
                        candidate.motion ?? motion
                    )
                    const candidateDuration = candidateMotion.duration
                    const candidateEasing = candidateMotion.easing
                    const candidatePlanEasing = candidateMotion.easingValues
                    const candidateDurationMs = candidateDuration * 1000
                    if (
                        candidate.mode === 'box' &&
                        candidate.originX !== undefined &&
                        candidate.originY !== undefined
                    ) {
                        const tx =
                            candidate.dx -
                            candidate.originX * (1 - candidate.sx)
                        const ty =
                            candidate.dy -
                            candidate.originY * (1 - candidate.sy)
                        const steps = candidate.projected
                            ? 48
                            : candidate.radius === undefined
                              ? 2
                              : 11
                        const keyframes: Keyframe[] = []
                        const path: PlanPoint[] = []
                        for (let index = 0; index < steps; index++) {
                            const q = steps === 2 ? index : index / (steps - 1)
                            let translateX = tx * (1 - q)
                            let translateY = ty * (1 - q)
                            let scaleX = 1 + (candidate.sx - 1) * (1 - q)
                            let scaleY = 1 + (candidate.sy - 1) * (1 - q)
                            const parent = candidate.parent
                            if (parent && candidate.projected) {
                                const parentMotion = motionOf(
                                    options,
                                    parent.motion ?? motion
                                )
                                const parentQ = Math.min(
                                    1,
                                    (q * candidateDurationMs) /
                                        (parentMotion.duration * 1000)
                                )
                                const parentScaleX =
                                    parent.mode === 'box'
                                        ? 1 + (parent.sx - 1) * (1 - parentQ)
                                        : 1
                                const parentScaleY =
                                    parent.mode === 'box'
                                        ? 1 + (parent.sy - 1) * (1 - parentQ)
                                        : 1
                                const desiredLeft =
                                    candidate.after.x +
                                    (candidate.before.x - candidate.after.x) *
                                        (1 - q)
                                const desiredTop =
                                    candidate.after.y +
                                    (candidate.before.y - candidate.after.y) *
                                        (1 - q)
                                const desiredWidth =
                                    candidate.after.width +
                                    (candidate.before.width -
                                        candidate.after.width) *
                                        (1 - q)
                                const desiredHeight =
                                    candidate.after.height +
                                    (candidate.before.height -
                                        candidate.after.height) *
                                        (1 - q)
                                const localLeft =
                                    parent.after.x +
                                    (desiredLeft -
                                        parent.after.x -
                                        parent.dx * (1 - parentQ)) /
                                        parentScaleX
                                const localTop =
                                    parent.after.y +
                                    (desiredTop -
                                        parent.after.y -
                                        parent.dy * (1 - parentQ)) /
                                        parentScaleY
                                translateX =
                                    localLeft -
                                    candidate.after.x -
                                    (candidate.anchor
                                        ? candidate.originX * (1 - scaleX)
                                        : 0)
                                translateY =
                                    localTop -
                                    candidate.after.y -
                                    (candidate.anchor
                                        ? candidate.originY * (1 - scaleY)
                                        : 0)
                                scaleX =
                                    desiredWidth /
                                    parentScaleX /
                                    candidate.after.width
                                scaleY =
                                    desiredHeight /
                                    parentScaleY /
                                    candidate.after.height
                            }
                            const frame: Record<string, string | number> = {
                                translate: `${translateX}px ${translateY}px`,
                                scale: `${scaleX} ${scaleY}`,
                            }
                            if (candidate.anchor) {
                                frame.transformOrigin = `${candidate.originX}px ${candidate.originY}px`
                            } else if (candidate.projected) {
                                frame.transformOrigin = '0px 0px'
                            }
                            if (steps > 2) frame.offset = q
                            if (candidate.radius !== undefined) {
                                frame.borderRadius = `${candidate.radius / scaleX}px / ${candidate.radius / scaleY}px`
                            }
                            keyframes.push(frame as Keyframe)
                            path.push({
                                q,
                                tx: translateX,
                                ty: translateY,
                                sx: scaleX,
                                sy: scaleY,
                            })
                        }
                        const animation = candidate.element.animate(keyframes, {
                            duration: candidateDurationMs,
                            easing,
                            composite: 'replace',
                            fill: 'none',
                        })
                        animations.push(animation)
                        plans.push({
                            element: candidate.element,
                            mode: 'box',
                            before: {
                                x: candidate.before.x,
                                y: candidate.before.y,
                                width: candidate.before.width,
                                height: candidate.before.height,
                            },
                            after: {
                                x: candidate.after.x,
                                y: candidate.after.y,
                                width: candidate.after.width,
                                height: candidate.after.height,
                            },
                            path,
                            linear: false,
                            projected: candidate.projected ?? false,
                            originX: candidate.originX,
                            originY: candidate.originY,
                            durationMs: candidateDurationMs,
                            startTime,
                            easing: candidatePlanEasing,
                            animation,
                        })
                        continue
                    }

                    const hasVelocity =
                        candidate.velocityX !== undefined &&
                        candidate.velocityY !== undefined &&
                        (candidate.velocityX !== 0 || candidate.velocityY !== 0)
                    const path = hasVelocity
                        ? velocityPath(
                              candidate.dx,
                              candidate.dy,
                              candidate.velocityX!,
                              candidate.velocityY!,
                              duration * 1000
                          )
                        : positionPath(candidate.dx, candidate.dy)
                    const keyframes = hasVelocity
                        ? pathKeyframes(path)
                        : ([
                              {
                                  translate: `${candidate.dx}px ${candidate.dy}px`,
                              },
                              { translate: '0px 0px' },
                          ] as Keyframe[])
                    const animation = candidate.element.animate(keyframes, {
                        duration: candidateDurationMs,
                        easing: hasVelocity ? 'linear' : candidateEasing,
                        composite: 'add',
                        fill: 'none',
                    })
                    animations.push(animation)
                    plans.push({
                        element: candidate.element,
                        mode: 'position',
                        before: {
                            x: candidate.before.x,
                            y: candidate.before.y,
                            width: candidate.before.width,
                            height: candidate.before.height,
                        },
                        after: {
                            x: candidate.after.x,
                            y: candidate.after.y,
                            width: candidate.after.width,
                            height: candidate.after.height,
                        },
                        path,
                        linear: hasVelocity,
                        projected: candidate.projected ?? false,
                        originX: 0,
                        originY: 0,
                        durationMs: candidateDurationMs,
                        startTime,
                        easing: candidatePlanEasing,
                        animation,
                    })
                } catch (error) {
                    options.onError?.(error, candidate.element)
                }
            }

            if (animations.length === 0) return 'unsupported'
            assignGroupStartTime(animations, startTime)

            let resolve!: (result: LayoutResult) => void
            const promise = new Promise<LayoutResult>((done) => {
                resolve = done
            })
            const state: GroupRun = {
                animations,
                elements: candidates.map((candidate) => candidate.element),
                plans,
                startTime,
                resolve,
            }
            run = state
            void Promise.all(
                animations.map((animation) =>
                    animation.finished.catch(() => undefined)
                )
            ).then(() => finishRun(state, 'ended'))
            return promise
        },

        finish() {
            const state = run
            if (!state) return
            run = null
            finishGroupRun(state)
            state.resolve('finished')
        },

        get active() {
            return run !== null
        },

        dispose() {
            cancelRun('disposed')
            participants.clear()
        },
    }

    return group
}
