import { type TimingFunction, timing } from '@freestylejs/ani-core'
import {
    hasDOM,
    isActiveViewTransition,
    reducedLayoutMotion,
    supportsFlip,
    supportsLinearEasing,
} from './feature'
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
}

interface Candidate {
    element: HTMLElement
    dx: number
    dy: number
    mode: LayoutMode
    sx: number
    sy: number
    originX?: number
    originY?: number
    radius?: number
}

interface RunState {
    animations: Animation[]
    elements: HTMLElement[]
    resolve: (result: LayoutResult) => void
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

function easingFor(timingFunction: TimingFunction): string {
    if (!supportsLinearEasing()) return 'ease-out'
    const samples: number[] = []
    const context = {
        dt: 0,
        from: 0,
        to: 1,
        duration: 1,
    }
    for (let i = 0; i <= 48; i++) {
        samples.push(timingFunction.step(i / 48, context).value)
    }
    return `linear(${samples.join(',')})`
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
): { duration: number; easing: string } {
    const duration =
        motion?.duration ?? options.motion?.duration ?? DEFAULT_DURATION
    if (!Number.isFinite(duration) || duration <= 0) {
        throw new RangeError(
            `[Layout] motion.duration must be a finite number > 0, received ${String(duration)}.`
        )
    }
    const timingFunction =
        motion?.timing ?? options.motion?.timing ?? defaultTiming()
    return { duration, easing: easingFor(timingFunction) }
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
    let run: RunState | null = null

    const finishRun = (state: RunState, result: LayoutResult): void => {
        if (run !== state) return
        run = null
        state.resolve(result)
    }

    const cancelRun = (result: LayoutResult): void => {
        const state = run
        if (!state) return
        run = null
        for (const animation of state.animations) {
            try {
                animation.cancel()
            } catch {
                // A browser may already have cancelled it.
            }
        }
        state.resolve(result)
    }

    const group: LayoutGroup = {
        add(element, participantOptions = {}) {
            const existing = participants.get(element)
            if (existing) {
                existing.layout = participantOptions.layout ?? 'position'
                existing.layoutId = participantOptions.layoutId
                return () => {
                    if (participants.get(element)?.element !== element) return
                    participants.delete(element)
                }
            }
            participants.set(element, {
                element,
                layout: participantOptions.layout ?? 'position',
                layoutId: participantOptions.layoutId,
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
            }
            if (hasDOM()) {
                for (const participant of participants.values()) {
                    const element = participant.element
                    if (!element.isConnected) continue
                    const item: SnapshotItem = {
                        element,
                        rect: rectOf(element),
                        offsetWidth: element.offsetWidth,
                        offsetHeight: element.offsetHeight,
                    }
                    data.items.set(element, item)
                    if (participant.layoutId) {
                        data.byId.set(participant.layoutId, item)
                    }
                }
            }
            queueMicrotask(() => {
                if (!data.used) data.expired = true
            })
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

            let { duration, easing } = motionOf(options, motion)
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
            if (active) {
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
                    const before =
                        data.items.get(element) ??
                        (participant.layoutId
                            ? data.byId.get(participant.layoutId)
                            : undefined)
                    if (!before) continue
                    const current = rectOf(element)
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
                if (!before || sameRect(before.rect, current.rect)) continue
                if (!visible(before.rect) && !visible(current.rect)) continue

                const dx = before.rect.x - current.rect.x
                const dy = before.rect.y - current.rect.y
                const sx = before.rect.width / current.rect.width
                const sy = before.rect.height / current.rect.height
                const moved =
                    Math.abs(dx) >= threshold ||
                    Math.abs(dy) >= threshold ||
                    Math.abs(sx - 1) >= 0.01 ||
                    Math.abs(sy - 1) >= 0.01
                if (!moved) continue

                candidates.push({
                    element,
                    dx,
                    dy,
                    mode: participant.layout,
                    sx,
                    sy,
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
                        candidate.mode = 'position'
                        continue
                    }
                    const afterRect =
                        after.get(candidate.element)?.rect ??
                        rectOf(candidate.element)
                    const origin = parseOrigin(
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
                    candidate.mode = 'position'
                    options.onError?.(error, candidate.element)
                }
            }

            const animations: Animation[] = []
            for (const candidate of candidates) {
                try {
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
                        const steps = candidate.radius === undefined ? 2 : 11
                        const keyframes: Keyframe[] = []
                        for (let index = 0; index < steps; index++) {
                            const q = steps === 2 ? index : index / (steps - 1)
                            const scaleX = 1 + (candidate.sx - 1) * (1 - q)
                            const scaleY = 1 + (candidate.sy - 1) * (1 - q)
                            const frame: Record<string, string | number> = {
                                translate: `${tx * (1 - q)}px ${ty * (1 - q)}px`,
                                scale: `${scaleX} ${scaleY}`,
                            }
                            if (steps > 2) frame.offset = q
                            if (candidate.radius !== undefined) {
                                frame.borderRadius = `${candidate.radius / scaleX}px / ${candidate.radius / scaleY}px`
                            }
                            keyframes.push(frame as Keyframe)
                        }
                        animations.push(
                            candidate.element.animate(keyframes, {
                                duration: duration * 1000,
                                easing,
                                composite: 'replace',
                                fill: 'none',
                            })
                        )
                        continue
                    }

                    animations.push(
                        candidate.element.animate(
                            [
                                {
                                    translate: `${candidate.dx}px ${candidate.dy}px`,
                                },
                                { translate: '0px 0px' },
                            ] as Keyframe[],
                            {
                                duration: duration * 1000,
                                easing,
                                composite: 'add',
                                fill: 'none',
                            }
                        )
                    )
                } catch (error) {
                    options.onError?.(error, candidate.element)
                }
            }

            if (animations.length === 0) return 'unsupported'

            let resolve!: (result: LayoutResult) => void
            const promise = new Promise<LayoutResult>((done) => {
                resolve = done
            })
            const state: RunState = {
                animations,
                elements: candidates.map((candidate) => candidate.element),
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
            for (const animation of state.animations) {
                try {
                    animation.finish()
                } catch {
                    // ignore an already-finished/cancelled animation
                }
            }
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
