/**
 * The layout scope: registry, capture epochs, flush, runs and lifecycle
 * (§4, §5.5, §5.6, §9). The public `LayoutGroup`.
 */
import { type Clock, DEV, defaultClock } from '@freestylejs/ani-core'
import {
    adoptAuthored,
    animatedOwned,
    borderSize,
    type Len,
    type Measured,
    measure,
    OPACITY_PROPERTIES,
    OWNED_PRIORITY,
    POSE_PROPERTIES,
    pageRect,
    pageScroll,
    put,
    RADIUS_PROPERTIES,
    resolveLen,
    type Saved,
    save,
    scrolledSince,
    scrollOffsets,
    viewportBox,
} from './dom'
import { hasDOM } from './feature'
import {
    aboutOrigin,
    type Box,
    compose,
    IDENTITY_MAP,
    invert,
    type Map2,
    mapBox,
    ownMap,
    unmapOwn,
} from './geometry'
import {
    assertKeys,
    type Curve,
    clampMotion,
    invalidOptions,
    type LayoutMotion,
    type LayoutOptions,
    type Motion,
    resolveMotion,
    sameTrackOptions,
    validateLayoutOptions,
    validateMotion,
    validateReducedMotion,
} from './motion'
import {
    type Action,
    type IdHistory,
    type PlanNode,
    plan,
    type SnapReason,
} from './plan'
import { exitingPresence, presenceOf } from './presence_link'
import { createRaf } from './realize/raf'
import {
    type BoxVelocity,
    drawnBoxes,
    drawnVelocities,
    type Fade,
    type Solved,
    type SolveNode,
    solve,
    type Track,
    trackEnded,
} from './solve'
import type {
    LayoutGroup,
    LayoutGroupOptions,
    LayoutReport,
    LayoutStatus,
} from './types'

const DEFAULT_THRESHOLD = 1
const DEFAULT_MAX_NODES = 300
const DEFAULT_RETAIN = 1
const MIN_SCALE = 1 / 50
const MAX_SCALE = 50
/** Border-box size check for a non-participant ancestor's scale (px, relative). */
const SIZE_TOLERANCE_PX = 0.1
const SIZE_TOLERANCE_REL = 1e-3

function within(measured: number, exact: number, slack: number): boolean {
    return (
        Math.abs(measured - exact) <=
        slack + SIZE_TOLERANCE_PX + SIZE_TOLERANCE_REL * exact
    )
}

/**
 * Whether the CSS box recovered from the rect has the element's real size:
 * otherwise an ancestor that is not a participant scales, rotates or skews.
 * The rounded offset size decides when it can; the exact computed size only
 * when it cannot.
 */
function sizeMatches(
    element: HTMLElement,
    css: Box,
    rounded: readonly [number, number]
): boolean {
    if (within(css.w, rounded[0], 0.5) && within(css.h, rounded[1], 0.5)) {
        // rounding hides at most half a pixel: only a near-1 scale on a tiny box escapes
        return true
    }
    const exact = borderSize(element)
    if (!exact) return true
    return within(css.w, exact[0], 0) && within(css.h, exact[1], 0)
}

interface Authored {
    readonly tx: number
    readonly ty: number
    readonly sx: number
    readonly sy: number
}

/** A participant's frame of reference, frozen at a flush (§3.1). */
interface Geometry {
    /** Visual box at rest. */
    readonly a: Box
    /** `X = Q(L)` in the local frame. */
    readonly box: Box
    /** Transform origin, local frame. */
    readonly ox: number
    readonly oy: number
    /** Inner map `Q`, local frame. */
    readonly inner: Map2
    /** Page map at rest: the parent's rest map ∘ `Q`. */
    readonly rest: Map2
    /** Origin as fractions of the CSS box. */
    readonly fx: number
    readonly fy: number
    readonly authored: Authored
    /** Corner radii at A in px (x/y per corner), when `radius: true`. */
    readonly radius: readonly number[] | null
    /** The presence part of the computed `transform` at this flush. */
    readonly matrix: Measured['matrix']
    readonly unsupported: string | null
}

interface DriveFade {
    readonly role: 'lead' | 'follower'
    elapsed: number
    /** Its first clock update has happened (independent of the track's). */
    started: boolean
    readonly duration: number
    readonly curve: Curve
}

interface Drive {
    kind: 'track' | 'static' | 'follow' | 'held'
    track: Track | null
    /** The A its track runs to. */
    target: Box | null
    elapsed: number
    /** Its first clock update has happened (that one has `dt = 0`). */
    started: boolean
    fade: DriveFade | null
    lead: Participant | null
    readonly saved: Saved
    readonly authored: Authored
    /** The reduced-motion mode its track was planned under. */
    mode: string
    run: Run | null
    release: (() => void) | null
    /** Last written value per owned property. */
    readonly written: Map<string, string>
}

interface Participant {
    readonly element: HTMLElement
    options: LayoutOptions
    readonly order: number
    changed: boolean
    /** `layoutDependency` at the previous flush, when given. */
    dependency: { readonly value: unknown } | null
    /** Visual box at rest at the previous flush. */
    lastBox: Box | null
    drive: Drive | null
    /** Geometry from the last flush that measured it. */
    geometry: Geometry | null
    /** Nearest participant ancestor at the last flush. */
    parent: Participant | null
    removed: boolean
    /** Resolved motion for a reduced-motion mode, until its options change. */
    motion: { readonly mode: string; readonly value: Motion } | null
}

interface Run {
    readonly nodes: Set<Participant>
    readonly snapped: LayoutReport['snapped']
    readonly resolve: (report: LayoutReport) => void
    done: boolean
}

interface Capture {
    live: boolean
    readonly rects: Map<Participant, Box>
    /** Participants driven at capture time (not read: B is their drawn box). */
    readonly driven: Set<Participant>
    readonly scroll: ReadonlyMap<Element, readonly [number, number]>
}

interface FrameNode {
    readonly p: Participant
    readonly parent: number
    readonly geometry: Geometry
}

interface Write {
    readonly element: HTMLElement
    readonly property: string
    /** `''` removes the declaration. */
    readonly value: string
    readonly priority: string
}

const GROUP_KEYS = [
    'clock',
    'motion',
    'reducedMotion',
    'threshold',
    'maxNodes',
    'retain',
    'onSnap',
] as const

function validateGroupOptions(options: unknown): void {
    if (options === undefined) return
    if (typeof options !== 'object' || options === null) {
        throw invalidOptions(
            'type',
            `layout group options must be an object, received ${String(options)}.`
        )
    }
    const value = options as Record<string, unknown>
    assertKeys(value, GROUP_KEYS, 'layout group options')
    const clock = value.clock as Partial<Clock> | undefined
    if (
        clock !== undefined &&
        (typeof clock !== 'object' ||
            clock === null ||
            typeof clock.subscribe !== 'function' ||
            typeof clock.unsubscribe !== 'function')
    ) {
        throw invalidOptions('type', 'clock must be an Ani clock.')
    }
    validateMotion(value.motion)
    validateReducedMotion(value.reducedMotion)
    const threshold = value.threshold
    if (
        threshold !== undefined &&
        (typeof threshold !== 'number' ||
            !Number.isFinite(threshold) ||
            threshold < 0)
    ) {
        throw invalidOptions(
            'range',
            `threshold must be a finite number of px >= 0, received ${String(threshold)}.`
        )
    }
    const maxNodes = value.maxNodes
    if (
        maxNodes !== undefined &&
        (typeof maxNodes !== 'number' ||
            !Number.isInteger(maxNodes) ||
            maxNodes < 0)
    ) {
        throw invalidOptions(
            'range',
            `maxNodes must be an integer >= 0, received ${String(maxNodes)}.`
        )
    }
    const retain = value.retain
    if (
        retain !== undefined &&
        (typeof retain !== 'number' || Number.isNaN(retain) || retain < 0)
    ) {
        throw invalidOptions(
            'range',
            `retain must be a number of seconds >= 0, received ${String(retain)}.`
        )
    }
    if (value.onSnap !== undefined && typeof value.onSnap !== 'function') {
        throw invalidOptions('type', 'onSnap must be a function.')
    }
}

function format(n: number): string {
    // avoid exponent notation, which CSS lengths do not accept
    return Math.abs(n) < 1e-9 ? '0' : String(Number(n.toFixed(6)))
}

function fadeEnded(fade: DriveFade): boolean {
    return fade.elapsed >= fade.duration
}

const IDENTITY_POSE = { tx: 0, ty: 0, sx: 1, sy: 1 }

function noop(): void {
    // a removal after dispose has nothing to undo
}

function now(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function microtask(fn: () => void): void {
    if (typeof queueMicrotask === 'function') queueMicrotask(fn)
    else void Promise.resolve().then(fn)
}

export function createLayoutGroup(
    options: LayoutGroupOptions = {}
): LayoutGroup {
    validateGroupOptions(options)
    const clock: Clock = options.clock ?? defaultClock
    const policy = validateReducedMotion(options.reducedMotion)
    const threshold = options.threshold ?? DEFAULT_THRESHOLD
    const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES
    const retain = options.retain ?? DEFAULT_RETAIN
    const groupMotion: LayoutMotion | undefined = options.motion

    const registry = new Map<HTMLElement, Participant>()
    let sequence = 0
    let capture: Capture | null = null
    let frame: FrameNode[] = []
    let pending: Write[] = []
    let disposed = false
    /** Previous lead per `layoutId`. */
    const leads = new Map<string, Participant>()
    /** Drawn boxes and velocities of leads removed within `retain` seconds. */
    const retained = new Map<
        string,
        {
            readonly box: Box
            readonly velocity: BoxVelocity | null
            readonly until: number
        }
    >()
    const warned = new Set<string>()
    const stats = { captures: 0, reads: 0, tracks: 0 }

    function warn(kind: string, message: string): void {
        if (!DEV || warned.has(kind)) return
        warned.add(kind)
        // biome-ignore lint/suspicious/noConsole: development warning
        console.warn(`[ani-layout] ${message}`)
    }

    /* ───────────────────────── frame ───────────────────────── */

    function solveNodes(at: FrameNode[]): SolveNode[] {
        const index = new Map<Participant, number>()
        at.forEach((node, i) => index.set(node.p, i))
        return at.map((node) => {
            const d = node.p.drive
            const g = node.geometry
            const live = d !== null && d.kind !== 'held'
            const fade: Fade | null =
                live && d.fade
                    ? {
                          role: d.fade.role,
                          elapsed: Math.max(0, d.fade.elapsed),
                          duration: d.fade.duration,
                          curve: d.fade.curve,
                      }
                    : null
            return {
                parent: node.parent,
                a: g.a,
                box: g.box,
                ox: g.ox,
                oy: g.oy,
                inner: g.inner,
                track: live && d.kind === 'track' ? d.track : null,
                elapsed: d?.elapsed ?? 0,
                follow:
                    live && d.kind === 'follow' && d.lead
                        ? (index.get(d.lead) ?? -1)
                        : -1,
                fade,
                radius: live && node.p.options.radius ? g.radius : null,
            }
        })
    }

    function writeValue(
        element: HTMLElement,
        d: Drive,
        property: string,
        value: string
    ): void {
        if (d.written.get(property) === value) return
        d.written.set(property, value)
        pending.push({ element, property, value, priority: OWNED_PRIORITY })
    }

    /**
     * Queues the saved declarations of `d` (the author's latest, §6) for the
     * write phase: never between reads, never outside a commit (§4.2, §4.3).
     */
    function queueRestore(
        element: HTMLElement,
        d: Drive,
        properties?: readonly string[]
    ): void {
        adoptAuthored(element, d.saved, d.written)
        for (const [property, [value, priority]] of d.saved) {
            if (properties && !properties.includes(property)) continue
            pending.push({ element, property, value, priority })
        }
    }

    function queuePose(node: FrameNode, solved: Solved): void {
        const d = node.p.drive!
        const { pose } = solved
        const a = d.authored
        const element = node.p.element
        writeValue(
            element,
            d,
            'translate',
            `${format(pose.tx + pose.sx * a.tx)}px ${format(pose.ty + pose.sy * a.ty)}px`
        )
        writeValue(
            element,
            d,
            'scale',
            `${format(pose.sx * a.sx)} ${format(pose.sy * a.sy)}`
        )
        // only while it owns a fade: a lead gives its opacity back at the end
        if (solved.opacity !== null && d.fade !== null) {
            writeValue(element, d, 'opacity', format(solved.opacity))
        }
        if (solved.radius) {
            RADIUS_PROPERTIES.forEach((property, corner) => {
                writeValue(
                    element,
                    d,
                    property,
                    `${format(solved.radius![corner * 2]!)}px ${format(solved.radius![corner * 2 + 1]!)}px`
                )
            })
        }
    }

    function finishRunNode(p: Participant): void {
        const run = p.drive?.run
        if (!run) return
        run.nodes.delete(p)
        if (run.nodes.size === 0 && !run.done) {
            run.done = true
            run.resolve({ status: 'ended', snapped: run.snapped })
        }
    }

    /** A node leaves its run unfinished: unregistered or gone from the document (§9). */
    function cancelRunNode(p: Participant): void {
        const run = p.drive?.run
        if (!run) return
        run.nodes.delete(p)
        p.drive!.run = null
        if (run.nodes.size === 0 && !run.done) {
            run.done = true
            run.resolve({ status: 'disposed', snapped: run.snapped })
        }
    }

    /** Queues the restore of every owned declaration of `p` and drops its drive. */
    function settle(p: Participant, cancelled = false): void {
        const d = p.drive
        if (!d) return
        if (cancelled) cancelRunNode(p)
        else finishRunNode(p)
        d.release?.()
        p.drive = null
        if (p.geometry) p.lastBox = p.geometry.a
        queueRestore(p.element, d)
    }

    function restoreOpacity(element: HTMLElement, d: Drive): void {
        if (!d.saved.has('opacity')) return
        queueRestore(element, d, OPACITY_PROPERTIES)
        d.written.delete('opacity')
    }

    /** Ends a crossfade: the lead owns no opacity any more, a follower stays invisible. */
    function endFade(p: Participant): void {
        const d = p.drive!
        const fade = d.fade!
        d.fade = null
        if (fade.role === 'lead') {
            restoreOpacity(p.element, d)
            return
        }
        d.kind = 'held'
        writeValue(p.element, d, 'opacity', '0')
        d.release?.()
        d.release = null
    }

    /**
     * Solves the current frame; `dt === null` writes the current time without
     * advancing (the flush's t = 0 pose). Returns whether anything animates.
     */
    function step(dt: number | null): boolean {
        if (dt !== null) {
            for (const node of frame) {
                const d = node.p.drive
                if (!d || d.kind === 'held') continue
                if (d.started) d.elapsed += dt
                else d.started = true
                // a fade kept across a retarget stays in step with its pair
                if (d.fade) {
                    if (d.fade.started) d.fade.elapsed += dt
                    else d.fade.started = true
                }
            }
        }
        // a follower whose lead left the frame stays where it is
        for (const node of frame) {
            const d = node.p.drive
            if (d?.kind === 'follow' && (!d.lead?.drive || d.lead.removed)) {
                d.kind = 'held'
                d.release?.()
                d.release = null
            }
        }
        const solved = solve(solveNodes(frame))
        const animating: boolean[] = []
        let running = false
        let tracks = 0
        for (const node of frame) {
            const d = node.p.drive
            const live = d !== null && d.kind !== 'held'
            const ownTrack =
                live &&
                d.kind === 'track' &&
                d.track !== null &&
                !trackEnded(d.track, d.elapsed)
            const ownFade = live && d.fade !== null && !fadeEnded(d.fade)
            if (ownTrack) tracks += 1
            animating.push(
                ownTrack ||
                    ownFade ||
                    (node.parent >= 0 && animating[node.parent]!)
            )
        }
        frame.forEach((node, i) => {
            const p = node.p
            if (!p.drive || p.drive.kind === 'held') return
            // a lead gives its opacity back; a follower is drawn at the lead
            // one last time, then held invisible
            if (p.drive.fade && fadeEnded(p.drive.fade)) {
                if (p.drive.fade.role === 'follower') {
                    queuePose(node, solved[i]!)
                    endFade(p)
                    return
                }
                endFade(p)
            }
            const d = p.drive
            if (d.kind === 'held') return
            if (!animating[i]) {
                settle(p)
                return
            }
            queuePose(node, solved[i]!)
            running = true
        })
        stats.tracks = tracks
        return running
    }

    function commitWrites(): void {
        const writes = pending
        pending = []
        for (const w of writes) put(w.element, w.property, w.value, w.priority)
    }

    const realizer = createRaf(clock, {
        update(dt) {
            return step(dt)
        },
        commit: commitWrites,
    })

    /* ───────────────────────── capture ───────────────────────── */

    function takeCapture(): void {
        if (disposed || !hasDOM()) return
        if (capture?.live) return
        const rects = new Map<Participant, Box>()
        const driven = new Set<Participant>()
        const elements: HTMLElement[] = []
        let scroll: readonly [number, number] | null = null
        for (const p of registry.values()) {
            if (!p.element.isConnected) continue
            elements.push(p.element)
            if (p.drive) {
                driven.add(p)
                continue
            }
            scroll ??= pageScroll(p.element.ownerDocument)
            rects.set(p, pageRect(p.element, scroll))
            stats.reads += 1
        }
        const current: Capture = {
            live: true,
            rects,
            driven,
            scroll: scrollOffsets(elements),
        }
        capture = current
        stats.captures += 1
        microtask(() => {
            current.live = false
        })
    }

    /* ───────────────────────── flush ───────────────────────── */

    function resolved(
        status: LayoutStatus,
        snapped: LayoutReport['snapped'] = []
    ): Promise<LayoutReport> {
        return Promise.resolve({ status, snapped })
    }

    function interrupt(run: Run | null): void {
        if (!run || run.done) return
        run.done = true
        for (const p of run.nodes) if (p.drive?.run === run) p.drive.run = null
        run.nodes.clear()
        run.resolve({ status: 'interrupted', snapped: run.snapped })
    }

    function nearestParticipant(element: HTMLElement): Participant | null {
        for (
            let node = element.parentElement;
            node;
            node = node.parentElement
        ) {
            const p = registry.get(node)
            if (p && !p.removed && node.isConnected) return p
        }
        return null
    }

    function resolveGeometry(
        p: Participant,
        rect: Box,
        m: Measured,
        parentFull: Map2,
        parentRest: Map2
    ): { geometry: Geometry; full: Map2 } {
        const local = mapBox(invert(parentFull), rect)
        let unsupported = m.unsupported
        const kx = m.scale[0] * m.matrix.a
        const ky = m.scale[1] * m.matrix.d
        if (!(kx > 0) || !(ky > 0)) unsupported ??= 'a zero or negative scale'
        const sx = kx > 0 ? kx : 1
        const sy = ky > 0 ? ky : 1
        const w = local.w / sx
        const h = local.h / sy
        const own = {
            kx: sx,
            ky: sy,
            tx: resolveLen(m.translate[0], w) + m.scale[0] * m.matrix.e,
            ty: resolveLen(m.translate[1], h) + m.scale[1] * m.matrix.f,
            ox: m.origin[0],
            oy: m.origin[1],
        }
        const css = unmapOwn(local, own)
        const full = compose(parentFull, ownMap(css, own))
        const authored: Authored = p.drive?.authored ?? {
            tx: resolveLen(m.translate[0], css.w),
            ty: resolveLen(m.translate[1], css.h),
            sx: m.scale[0],
            sy: m.scale[1],
        }
        const ox = css.x + m.origin[0]
        const oy = css.y + m.origin[1]
        const inner = aboutOrigin(
            {
                tx: authored.tx + authored.sx * m.matrix.e,
                ty: authored.ty + authored.sy * m.matrix.f,
                sx: authored.sx * m.matrix.a,
                sy: authored.sy * m.matrix.d,
            },
            ox,
            oy
        )
        const box = mapBox(inner, css)
        const rest = compose(parentRest, inner)
        if (!unsupported && !sizeMatches(p.element, css, m.size)) {
            unsupported =
                'a scaled, rotated or skewed ancestor that is not a participant'
        }
        let radius: number[] | null = null
        if (m.radius) {
            radius = m.radius.map((len: Len, i) =>
                resolveLen(len, i % 2 === 0 ? css.w : css.h)
            )
        }
        return {
            geometry: {
                a: mapBox(parentRest, box),
                box,
                ox,
                oy,
                inner,
                rest,
                fx: css.w > 0 ? m.origin[0] / css.w : 0.5,
                fy: css.h > 0 ? m.origin[1] / css.h : 0.5,
                authored,
                radius,
                matrix: m.matrix,
                unsupported,
            },
            full,
        }
    }

    function reducedMode(): 'jump' | 'clamp' | 'none' {
        if (policy === 'ignore' || !clock.reducedMotion) return 'none'
        return policy === 'jump' ? 'jump' : 'clamp'
    }

    function motionOf(
        p: Participant,
        reduced: 'jump' | 'clamp' | 'none'
    ): Motion {
        if (p.motion?.mode === reduced) return p.motion.value
        const motion = resolveMotion([groupMotion, p.options.motion])
        const value =
            reduced === 'clamp' && typeof policy === 'object'
                ? clampMotion(motion, policy.maxDuration)
                : motion
        p.motion = { mode: reduced, value }
        return value
    }

    /**
     * B of a driven node is its drawn box as the user sees it now: through the
     * presence layers as they are at this flush, not as they were frozen at the
     * last one (§3.1). Only the presence matrix can differ (it is not React's,
     * so the commit did not change it); the poses are the engine's own.
     */
    function reconcileLayers(
        index: ReadonlyMap<Participant, number>,
        geometry: readonly (Geometry | null)[],
        nowSolve: readonly SolveNode[],
        drawn: Map<Participant, Box>,
        velocity: Map<Participant, BoxVelocity>
    ): void {
        if (frame.length === 0) return
        const current = frame.map((node) => {
            const i = index.get(node.p)
            return i === undefined ? null : (geometry[i]?.matrix ?? null)
        })
        const changed = frame.some((node, k) => {
            const m = current[k] ?? null
            const f = node.geometry.matrix
            return (
                m !== null &&
                (m.a !== f.a || m.d !== f.d || m.e !== f.e || m.f !== f.f)
            )
        })
        if (!changed) return
        const solved = solve(nowSolve)
        const maps: Map2[] = []
        frame.forEach((node, k) => {
            const g = node.geometry
            const m = current[k] ?? g.matrix
            const au = node.p.drive?.authored ?? g.authored
            const inner = aboutOrigin(
                {
                    tx: au.tx + au.sx * m.e,
                    ty: au.ty + au.sy * m.f,
                    sx: au.sx * m.a,
                    sy: au.sy * m.d,
                },
                g.ox,
                g.oy
            )
            const parent = node.parent >= 0 ? maps[node.parent]! : IDENTITY_MAP
            const pose = node.p.drive ? solved[k]!.pose : IDENTITY_POSE
            const map = compose(
                compose(parent, aboutOrigin(pose, g.ox, g.oy)),
                inner
            )
            maps.push(map)
            if (!node.p.drive) return
            const seen = mapBox(map, mapBox(invert(g.inner), g.box))
            const was = drawn.get(node.p)
            drawn.set(node.p, seen)
            const v = velocity.get(node.p)
            if (v && was && was.w > 0 && was.h > 0) {
                const rx = seen.w / was.w
                const ry = seen.h / was.h
                velocity.set(node.p, {
                    x: v.x * rx,
                    y: v.y * ry,
                    w: v.w * rx,
                    h: v.h * ry,
                })
            }
        })
    }

    function flush(): Promise<LayoutReport> {
        if (disposed) return resolved('disposed')
        const cap = capture
        capture = null
        if (!hasDOM()) return resolved('no-change')

        // drives of participants that left the document end here (their
        // restores are written with the others, after every read); the author's
        // inline changes to owned properties are taken in (§6)
        for (const p of registry.values()) {
            if (!p.drive) continue
            if (p.element.isConnected)
                adoptAuthored(p.element, p.drive.saved, p.drive.written)
            else settle(p, true)
        }
        const list = [...registry.values()].filter((p) => p.element.isConnected)
        if (list.length === 0) {
            frame = []
            commitWrites()
            realizer.stop()
            stats.tracks = 0
            return resolved('no-change')
        }

        // tree, parents first
        const parentOf = new Map<Participant, Participant | null>()
        const depth = new Map<Participant, number>()
        const depthOf = (p: Participant): number => {
            const known = depth.get(p)
            if (known !== undefined) return known
            const parent = nearestParticipant(p.element)
            parentOf.set(p, parent)
            const d = parent ? depthOf(parent) + 1 : 0
            depth.set(p, d)
            return d
        }
        for (const p of list) depthOf(p)
        list.sort((a, b) => depth.get(a)! - depth.get(b)! || a.order - b.order)
        const index = new Map<Participant, number>()
        list.forEach((p, i) => index.set(p, i))
        const parents = list.map((p) => {
            const parent = parentOf.get(p)
            return parent ? index.get(parent)! : -1
        })

        // the engine's own state before this flush
        const nowSolve = solveNodes(frame)
        const drawn = new Map<Participant, Box>()
        const velocity = new Map<Participant, BoxVelocity>()
        if (frame.length > 0) {
            const boxes = drawnBoxes(nowSolve)
            const velocities = drawnVelocities(nowSolve)
            frame.forEach((node, i) => {
                drawn.set(node.p, boxes[i]!)
                velocity.set(node.p, velocities[i]!)
            })
        }

        // 1. reads: every rect, then computed styles of what the plan needs
        const doc = list[0]!.element.ownerDocument
        const scroll = pageScroll(doc)
        const rects = list.map((p) => pageRect(p.element, scroll))
        stats.reads += list.length
        const stale = cap ? scrolledSince(cap.scroll) : false
        const viewport = viewportBox(doc)

        const geometry: (Geometry | null)[] = list.map(() => null)
        const fulls: (Map2 | null)[] = list.map(() => null)
        let animated: Set<Element> | null = null
        const animatedNow = () => {
            animated ??= animatedOwned(doc)
            return animated
        }
        /** Measures the wanted nodes and their ancestors; returns the new ones. */
        const measureNodes = (wanted: boolean[]): number[] => {
            // ancestors of every wanted node are wanted
            for (let i = list.length - 1; i >= 0; i--) {
                if (wanted[i] && parents[i]! >= 0) wanted[parents[i]!] = true
            }
            const added: number[] = []
            for (let i = 0; i < list.length; i++) {
                if (!wanted[i] || geometry[i]) continue
                const p = list[i]!
                const m = measure(
                    p.element,
                    p.options.radius === true,
                    animatedNow
                )
                stats.reads += 1
                const parent = parents[i]!
                const { geometry: g, full } = resolveGeometry(
                    p,
                    rects[i]!,
                    m,
                    parent >= 0 ? fulls[parent]! : IDENTITY_MAP,
                    parent >= 0 ? geometry[parent]!.rest : IDENTITY_MAP
                )
                geometry[i] = g
                fulls[i] = full
                added.push(i)
            }
            return added
        }
        // every node with a driven node at or above it divides out poses
        const chained: boolean[] = []
        list.forEach((p, i) => {
            const parent = parents[i]!
            chained.push(p.drive !== null || (parent >= 0 && chained[parent]!))
        })
        measureNodes(chained)
        reconcileLayers(index, geometry, nowSolve, drawn, velocity)

        const reduced = reducedMode()
        const ids = new Map<string, IdHistory>()
        const at = now()
        for (const [id, entry] of retained) {
            if (entry.until < at) retained.delete(id)
        }
        const idsOf = (): Map<string, IdHistory> => {
            ids.clear()
            for (const p of list) {
                const id = p.options.layoutId
                if (id === undefined || ids.has(id)) continue
                const previous = leads.get(id)
                const lead =
                    previous && !previous.removed
                        ? index.get(previous)
                        : undefined
                const kept = lead === undefined ? retained.get(id) : undefined
                ids.set(id, {
                    lead: lead ?? null,
                    retained: kept?.box ?? null,
                    retainedVelocity: kept?.velocity ?? null,
                })
            }
            return ids
        }

        const planNodes = (): PlanNode[] =>
            list.map((p, i) => {
                const g = geometry[i]
                const a = g?.a ?? rects[i]!
                const d = p.drive
                let before: Box | null = null
                if (d) before = drawn.get(p) ?? p.lastBox
                else if (cap) {
                    before =
                        cap.rects.get(p) ??
                        (cap.driven.has(p) ? p.lastBox : null)
                }
                const moving =
                    d?.kind === 'track' &&
                    d.track !== null &&
                    !trackEnded(d.track, d.elapsed)
                const holding = moving && d!.elapsed < d!.track!.delay
                const options = p.options
                let unsupported = g?.unsupported ?? null
                if (!unsupported && (a.w <= 0 || a.h <= 0))
                    unsupported = 'zero size'
                if (!unsupported && before) {
                    const rx = before.w / a.w
                    const ry = before.h / a.h
                    if (
                        before.w <= 0 ||
                        before.h <= 0 ||
                        rx < MIN_SCALE ||
                        rx > MAX_SCALE ||
                        ry < MIN_SCALE ||
                        ry > MAX_SCALE
                    ) {
                        unsupported = 'a size change beyond 50×'
                    }
                }
                const hasDependency = 'layoutDependency' in options
                const presence = presenceOf(p.element)
                return {
                    parent: parents[i]!,
                    order: p.order,
                    a,
                    fx: g?.fx ?? 0.5,
                    fy: g?.fy ?? 0.5,
                    before,
                    velocity:
                        moving && !holding ? (velocity.get(p) ?? null) : null,
                    moving,
                    track: moving ? d!.track : null,
                    trackTarget: moving ? d!.target : null,
                    mode: options.layout ?? true,
                    anchor: options.layoutAnchor ?? null,
                    motion: motionOf(p, reduced),
                    layoutId: options.layoutId ?? null,
                    crossfade: options.layoutCrossfade ?? true,
                    exiting: exitingPresence(p.element) !== null,
                    presenceOpacity: presence?.opacity ?? false,
                    unsupported: unsupported !== null,
                    skip:
                        hasDependency &&
                        p.dependency !== null &&
                        Object.is(p.dependency.value, options.layoutDependency),
                    // a changed reduced-motion mode re-plans a running track
                    optionsChanged:
                        p.changed || (moving && d!.mode !== reduced),
                    following:
                        d?.kind === 'follow' && d.lead
                            ? (index.get(d.lead) ?? -1)
                            : -1,
                }
            })

        // 2. plan; measure what it animates; plan again until nothing new
        let nodes = planNodes()
        let result = plan({
            nodes,
            ids: idsOf(),
            viewport,
            threshold,
            maxNodes,
            stale,
        })
        for (;;) {
            const wanted = result.actions.map(
                (action) => action.kind !== 'none'
            )
            const added = measureNodes(wanted)
            // the plan assumed a centred origin and support for every node it
            // had not measured; it is redone only when that assumption failed
            const assumed = added.every((i) => {
                const g = geometry[i]!
                return g.unsupported === null && g.fx === 0.5 && g.fy === 0.5
            })
            if (assumed) break
            nodes = planNodes()
            result = plan({
                nodes,
                ids: idsOf(),
                viewport,
                threshold,
                maxNodes,
                stale,
            })
        }

        // bookkeeping that does not depend on the outcome
        list.forEach((p, i) => {
            p.parent = parents[i]! >= 0 ? list[parents[i]!]! : null
            if (geometry[i]) p.geometry = geometry[i]
            p.lastBox = geometry[i]?.a ?? rects[i]!
            p.changed = false
            p.dependency =
                'layoutDependency' in p.options
                    ? { value: p.options.layoutDependency }
                    : null
        })
        for (const [id, lead] of result.leads) leads.set(id, list[lead]!)

        for (const warning of result.warnings) {
            if (warning.kind === 'duplicate-id') {
                warn(
                    `duplicate:${warning.id}`,
                    `two live participants share layoutId "${warning.id}"; the newest leads and the other animates on its own.`
                )
            } else {
                warn(
                    'presence-opacity',
                    'presence animates opacity on a layoutId participant, so it hands off without a crossfade. Animate opacity on a child instead.'
                )
            }
        }

        // 3. outcome
        const snapped: { element: HTMLElement; reason: SnapReason }[] =
            result.snapped.map(({ index: i, reason }) => ({
                element: list[i]!.element,
                reason,
            }))
        let actions: readonly Action[] = result.actions
        let status: LayoutStatus | null = null
        if (result.status !== 'run') {
            status = result.status
        } else if (reduced === 'jump') {
            const moves = actions.some(
                (a) => a.kind === 'track' || a.kind === 'follow'
            )
            actions.forEach((action, i) => {
                if (
                    action.kind === 'track' ||
                    action.kind === 'follow' ||
                    action.kind === 'keep'
                ) {
                    snapped.push({
                        element: list[i]!.element,
                        reason: 'reduced',
                    })
                }
            })
            actions = actions.map(() => ({ kind: 'none' }) as const)
            status = moves ? 'reduced' : null
        }
        for (const { element, reason } of snapped) {
            if (reason === 'unsupported') {
                const p = registry.get(element)!
                const g = p.geometry
                warn(
                    'unsupported',
                    `a participant cannot be animated exactly and snaps (${g?.unsupported ?? 'unsupported'}).`
                )
            } else if (reason === 'capped') {
                warn(
                    'capped',
                    `more than ${maxNodes} visible participants moved at once; the change snaps. Raise maxNodes or narrow the scope.`
                )
            } else if (reason === 'stale') {
                warn(
                    'stale',
                    'a scroll container scrolled between capture and flush; the change snaps.'
                )
            }
        }

        // 4. apply: every write happens after every read
        let run: Run | null = null
        let promise: Promise<LayoutReport> | null = null
        if (actions.some((a) => a.kind === 'track')) {
            promise = new Promise<LayoutReport>((resolve) => {
                run = { nodes: new Set(), snapped, resolve, done: false }
            })
        }
        const startDrive = (
            p: Participant,
            kind: Drive['kind'],
            g: Geometry,
            properties: readonly string[]
        ): Drive => {
            const existing = p.drive
            if (existing) {
                // an owned property it did not save yet (opacity for a new
                // crossfade, corners when `radius` was turned on mid-run)
                const wanted = [...properties]
                if (p.options.radius && g.radius)
                    wanted.push(...RADIUS_PROPERTIES)
                const missing = wanted.filter(
                    (prop) => !existing.saved.has(prop)
                )
                for (const [k, v] of save(p.element, missing))
                    existing.saved.set(k, v)
                // corners it no longer owns go back now
                if (
                    !p.options.radius &&
                    existing.saved.has(RADIUS_PROPERTIES[0])
                ) {
                    queueRestore(p.element, existing, RADIUS_PROPERTIES)
                    for (const prop of RADIUS_PROPERTIES) {
                        existing.saved.delete(prop)
                        existing.written.delete(prop)
                    }
                }
                existing.kind = kind
                return existing
            }
            const all = [...POSE_PROPERTIES, ...properties]
            if (p.options.radius && g.radius) all.push(...RADIUS_PROPERTIES)
            const d: Drive = {
                kind,
                track: null,
                target: null,
                elapsed: 0,
                started: false,
                fade: null,
                lead: null,
                saved: save(p.element, all),
                authored: g.authored,
                mode: reduced,
                run: null,
                release: null,
                written: new Map(),
            }
            p.drive = d
            return d
        }

        actions.forEach((action, i) => {
            const p = list[i]!
            const g = geometry[i]
            const d = p.drive
            switch (action.kind) {
                case 'none':
                    // a crossfade follower stays invisible until presence removes it
                    if (d && (d.kind !== 'held' || !nodes[i]!.exiting))
                        settle(p)
                    return
                case 'keep':
                    return
                case 'static': {
                    if (d?.kind === 'held') return
                    if (d?.run) {
                        finishRunNode(p)
                        d.run = null
                    }
                    const drive = startDrive(p, 'static', g!, [])
                    drive.track = null
                    drive.target = null
                    return
                }
                case 'track': {
                    if (d?.run) {
                        const old = d.run
                        old.nodes.delete(p)
                        d.run = null
                        interrupt(old)
                    }
                    const wasFollower =
                        d?.kind === 'follow' || d?.kind === 'held'
                    // a lead retargeted mid-crossfade keeps its fade: the pair
                    // stays complementary and the release follows it (§5.6)
                    const keptFade =
                        !action.fadeLead &&
                        d?.fade?.role === 'lead' &&
                        !fadeEnded(d.fade)
                            ? d.fade
                            : null
                    const drive = startDrive(
                        p,
                        'track',
                        g!,
                        action.fadeLead ? OPACITY_PROPERTIES : []
                    )
                    if (wasFollower && !action.fadeLead)
                        restoreOpacity(p.element, drive)
                    drive.release?.()
                    drive.release = null
                    drive.track = action.track
                    drive.target = nodes[i]!.a
                    drive.elapsed = 0
                    drive.started = false
                    drive.mode = reduced
                    drive.lead = null
                    drive.fade = action.fadeLead
                        ? {
                              role: 'lead',
                              elapsed: -action.track.delay,
                              started: false,
                              duration: action.track.duration,
                              curve: action.track.curve,
                          }
                        : keptFade
                    drive.run = run
                    ;(run as Run | null)?.nodes.add(p)
                    return
                }
                case 'follow': {
                    if (!action.start) return
                    if (d?.run) {
                        const old = d.run
                        old.nodes.delete(p)
                        d.run = null
                        interrupt(old)
                    }
                    const lead = list[action.lead]!
                    const leadAction = actions[action.lead]!
                    const track =
                        leadAction.kind === 'track' ? leadAction.track : null
                    const drive = startDrive(
                        p,
                        'follow',
                        g!,
                        OPACITY_PROPERTIES
                    )
                    drive.track = null
                    drive.target = null
                    drive.elapsed = 0
                    drive.started = false
                    drive.lead = lead
                    drive.fade = {
                        role: 'follower',
                        elapsed: -(track?.delay ?? 0),
                        started: false,
                        duration: track?.duration ?? 0,
                        curve: track?.curve ?? nodes[i]!.motion.curve,
                    }
                    const presence = exitingPresence(p.element)
                    if (presence) {
                        let release!: () => void
                        presence.hold(
                            new Promise<void>((done) => {
                                release = done
                            })
                        )
                        drive.release = release
                    }
                    return
                }
            }
        })

        // the frame: every driven node and its participant ancestors
        const inFrame: boolean[] = list.map((p) => p.drive !== null)
        for (let i = list.length - 1; i >= 0; i--) {
            if (inFrame[i] && parents[i]! >= 0) inFrame[parents[i]!] = true
        }
        const frameIndex = new Map<number, number>()
        const next: FrameNode[] = []
        list.forEach((p, i) => {
            if (!inFrame[i]) return
            frameIndex.set(i, next.length)
            const parent = parents[i]!
            next.push({
                p,
                parent: parent >= 0 ? frameIndex.get(parent)! : -1,
                geometry: geometry[i]!,
            })
        })
        frame = next

        // the pose at each node's current time (t = 0 for a new track)
        const running = frame.length > 0 && step(null)
        commitWrites()
        if (running) realizer.start()
        else realizer.stop()

        for (const { element, reason } of snapped)
            options.onSnap?.(element, reason)

        const started = run as Run | null
        if (promise && started) {
            if (started.nodes.size === 0 && !started.done) {
                started.done = true
                started.resolve({ status: 'ended', snapped })
            }
            return promise
        }
        return resolved(status ?? 'no-change', snapped)
    }

    /* ───────────────────────── lifecycle ───────────────────────── */

    /** The drawn box of a driven node now, and its velocity while its own track moves. */
    function currentMotion(
        p: Participant
    ): { box: Box; velocity: BoxVelocity | null } | null {
        const d = p.drive
        if (!d) return null
        const at = frame.findIndex((node) => node.p === p)
        if (at < 0) return null
        const nodes = solveNodes(frame)
        const box = drawnBoxes(nodes)[at]
        if (!box) return null
        const moving =
            d.kind === 'track' &&
            d.track !== null &&
            !trackEnded(d.track, d.elapsed) &&
            d.elapsed >= d.track.delay
        return {
            box,
            velocity: moving ? (drawnVelocities(nodes)[at] ?? null) : null,
        }
    }

    function countTracks(): number {
        let tracks = 0
        for (const node of frame) {
            const d = node.p.drive
            if (
                d?.kind === 'track' &&
                d.track &&
                !trackEnded(d.track, d.elapsed)
            ) {
                tracks += 1
            }
        }
        return tracks
    }

    function rebuildFrame(): void {
        const kept = frame.filter((node) => !node.p.removed)
        const position = new Map<Participant, number>()
        frame = kept.map((node, i) => {
            position.set(node.p, i)
            let parent = node.p.parent
            while (parent && (parent.removed || !position.has(parent)))
                parent = parent.parent
            return {
                p: node.p,
                parent: parent ? position.get(parent)! : -1,
                geometry: node.geometry,
            }
        })
    }

    function finishAll(status: 'ended' | 'disposed'): void {
        // every run reports the cause before its nodes settle
        const runs = new Set<Run>()
        for (const node of frame)
            if (node.p.drive?.run) runs.add(node.p.drive.run)
        for (const r of runs) {
            if (r.done) continue
            r.done = true
            r.resolve({ status, snapped: r.snapped })
        }
        // every track jumps to A
        for (const node of frame) {
            const d = node.p.drive
            if (!d || d.kind === 'held') continue
            if (d.track) d.elapsed = d.track.delay + d.track.duration
            if (d.fade) d.fade.elapsed = d.fade.duration
        }
        if (status === 'ended') {
            step(null)
            commitWrites()
        }
        for (const node of frame) {
            const d = node.p.drive
            if (!d) continue
            if (status === 'disposed' || d.kind !== 'held') settle(node.p)
        }
        commitWrites()
        frame = frame.filter((node) => node.p.drive !== null)
        realizer.stop()
        stats.tracks = 0
    }

    const group: LayoutGroup = {
        add(element, layoutOptions) {
            validateLayoutOptions(layoutOptions)
            if (disposed) return noop
            let p = registry.get(element)
            if (p) {
                // only a change that draws another track retargets (§3.3 inv. 5)
                if (
                    !sameTrackOptions(
                        p.options,
                        layoutOptions ?? {},
                        groupMotion
                    )
                )
                    p.changed = true
                p.options = layoutOptions ?? {}
                p.motion = null
            } else {
                p = {
                    element,
                    options: layoutOptions ?? {},
                    order: ++sequence,
                    changed: false,
                    dependency: null,
                    lastBox: null,
                    drive: null,
                    geometry: null,
                    parent: null,
                    removed: false,
                    motion: null,
                }
                registry.set(element, p)
            }
            const self = p
            return () => {
                if (self.removed || registry.get(element) !== self) return
                self.removed = true
                registry.delete(element)
                const id = self.options.layoutId
                if (id !== undefined && leads.get(id) === self) {
                    // the box and the velocity it left with (§5.6)
                    const motion = currentMotion(self)
                    const box =
                        motion?.box ?? capture?.rects.get(self) ?? self.lastBox
                    leads.delete(id)
                    if (box && retain > 0)
                        retained.set(id, {
                            box,
                            velocity: motion?.velocity ?? null,
                            until: now() + retain * 1000,
                        })
                }
                const d = self.drive
                if (d) {
                    // unmount cancels its track (§9): the run reports
                    // 'disposed' if nothing else of it is left
                    cancelRunNode(self)
                    d.release?.()
                    self.drive = null
                    pending = pending.filter((w) => w.element !== element)
                    queueRestore(element, d)
                    commitWrites()
                    rebuildFrame()
                    stats.tracks = countTracks()
                    if (
                        !frame.some(
                            (node) =>
                                node.p.drive !== null &&
                                node.p.drive.kind !== 'held'
                        )
                    ) {
                        realizer.stop()
                    }
                }
            }
        },

        set(element, layoutOptions) {
            validateLayoutOptions(layoutOptions)
            const p = registry.get(element)
            if (!p) return
            if (!sameTrackOptions(p.options, layoutOptions, groupMotion))
                p.changed = true
            p.options = layoutOptions
            p.motion = null
        },

        capture: takeCapture,

        flush,

        update(mutate) {
            takeCapture()
            try {
                mutate()
            } catch (error) {
                capture = null
                throw error
            }
            return flush()
        },

        finish() {
            if (disposed) return
            finishAll('ended')
        },

        dispose() {
            if (disposed) return
            finishAll('disposed')
            disposed = true
            capture = null
            for (const p of registry.values()) p.removed = true
            registry.clear()
            frame = []
            leads.clear()
            retained.clear()
        },

        get stats() {
            return {
                captures: stats.captures,
                reads: stats.reads,
                tracks: stats.tracks,
            }
        },
    }
    return group
}
