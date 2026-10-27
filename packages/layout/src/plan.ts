/**
 * Per flush: who animates, keep or retarget, `layoutId` handoff, crossfade
 * pairs and every snap reason. Pure: no DOM, no clock.
 */
import type { Box } from './geometry'
import type { KeepPath } from './measure'
import type { LayoutAnchor, LayoutMode, Motion } from './motion'
import {
    type AnchorPath,
    type BoxVelocity,
    channelsOf,
    createTrack,
    type Track,
} from './solve'

export type SnapReason =
    | 'culled'
    | 'capped'
    | 'unsupported'
    | 'stale'
    | 'reduced'

export interface PlanNode {
    /** Index of the nearest participant ancestor, or -1. Parents come first. */
    readonly parent: number
    /** Registration order; the newest registrant of a `layoutId` leads. */
    readonly order: number
    /** Visual box at rest now (the track target). */
    readonly a: Box
    /** Transform origin as fractions of the box. */
    readonly fx: number
    readonly fy: number
    /**
     * B: the presented box measured by a fresh capture (§4.1); `null` when
     * the capture holds none (a node new to the scope, or no valid capture).
     */
    readonly before: Box | null
    /** Drawn-box velocity now; `null` at rest (including a track's delay hold). */
    readonly velocity: BoxVelocity | null
    /** Has a running own track (it may still hold its delay). */
    readonly moving: boolean
    /** The running own track and its target (A at the flush that planned it). */
    readonly track: Track | null
    readonly trackTarget: Box | null
    /**
     * A under the presence matrices the running track was planned with
     * (§3.2): a presence transform that changed since is a visual layer, not
     * a move, so the keep test (§5.7) is judged on this box. `null`: on `a`.
     */
    readonly planned: Box | null
    /** The parent's A in the same space as `planned` (an anchored track's offset target). */
    readonly parentPlanned: Box | null
    /**
     * The presented layout box `L_k` of a running track (§4.2), in the same
     * space as `planned`; `null` when the capture gives none.
     */
    readonly presented: Box | null
    /** The parent's `L_k` in the same space (an anchored track's offset). */
    readonly parentPresented: Box | null
    /** The re-expression path of a running track (§5.7); `null` at rest. */
    readonly path: KeepPath | null
    readonly mode: LayoutMode
    readonly anchor: LayoutAnchor | null
    readonly motion: Motion
    readonly layoutId: string | null
    readonly crossfade: boolean
    /** Inside a presence subtree that is exiting. */
    readonly exiting: boolean
    /** Presence animates `opacity` on this element. */
    readonly presenceOpacity: boolean
    readonly unsupported: boolean
    /** `layoutDependency` unchanged since the previous flush. */
    readonly skip: boolean
    readonly optionsChanged: boolean
    /** The lead this node follows in a running crossfade, or -1. */
    readonly following: number
}

export interface IdHistory {
    /** The previous lead's index when it is still registered. */
    readonly lead: number | null
    /** The previous lead's drawn box when it left within `retain`. */
    readonly retained: Box | null
    /** Its velocity then, when its own track was moving. */
    readonly retainedVelocity: BoxVelocity | null
}

export interface PlanInput {
    readonly nodes: readonly PlanNode[]
    readonly ids: ReadonlyMap<string, IdHistory>
    readonly viewport: Box
    readonly threshold: number
    readonly maxNodes: number
    /**
     * The flush consumed a fresh capture, a valid measurement of what was
     * presented. Without one (§4.4) nothing starts: every running track is
     * kept whatever moved, and every other node appears at A.
     */
    readonly measured: boolean
}

export type Action =
    | { readonly kind: 'none' }
    | { readonly kind: 'keep' }
    | {
          readonly kind: 'track'
          readonly track: Track
          /** Starts a crossfade as its lead. */
          readonly fadeLead: boolean
          /** Departing shared lead: live node index, -1 for retained removal, or no handoff. */
          readonly handoffFrom: number | undefined
      }
    | { readonly kind: 'static' }
    | {
          readonly kind: 'follow'
          readonly lead: number
          readonly start: boolean
      }

export type PlanWarning =
    | { readonly kind: 'duplicate-id'; readonly id: string }
    | { readonly kind: 'presence-opacity'; readonly index: number }
    | { readonly kind: 'spring-timeout'; readonly index: number }

export interface Plan {
    readonly status: 'run' | 'capped'
    readonly actions: readonly Action[]
    readonly snapped: readonly {
        readonly index: number
        readonly reason: SnapReason
    }[]
    /** The lead of every `layoutId` that has one. */
    readonly leads: ReadonlyMap<string, number>
    readonly warnings: readonly PlanWarning[]
}

const NONE: Action = { kind: 'none' }
const KEEP: Action = { kind: 'keep' }
const STATIC: Action = { kind: 'static' }
const CULL_MARGIN = 0.1

function anchorPoint(anchor: LayoutAnchor, box: Box) {
    return { x: box.x + anchor.x * box.w, y: box.y + anchor.y * box.h }
}

/** A box's offset from its parent's anchor point (§5.4). */
function anchorOffsetOf(
    anchor: LayoutAnchor,
    box: Box,
    parent: Box
): { x: number; y: number } {
    const b = anchorPoint(anchor, box)
    const p = anchorPoint(anchor, parent)
    return { x: b.x - p.x, y: b.y - p.y }
}

/**
 * How far a box moved in the channels its mode animates. An anchored node
 * (one with a participant parent, whose boxes are given) moves by its size and
 * by its offset from the parent's anchor point.
 */
export function moved(
    from: Box,
    to: Box,
    node: Pick<PlanNode, 'mode' | 'anchor' | 'fx' | 'fy'>,
    parentFrom?: Box,
    parentTo?: Box
): number {
    const b = channelsOf(from, node.fx, node.fy)
    const a = channelsOf(to, node.fx, node.fy)
    const origin = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
    const size = Math.max(Math.abs(b[2] - a[2]), Math.abs(b[3] - a[3]))
    if (node.anchor && parentFrom && parentTo) {
        const ob = anchorOffsetOf(node.anchor, from, parentFrom)
        const oa = anchorOffsetOf(node.anchor, to, parentTo)
        return Math.max(size, Math.abs(ob.x - oa.x), Math.abs(ob.y - oa.y))
    }
    if (node.mode === 'position') return origin
    if (node.mode === 'size') return size
    return Math.max(origin, size)
}

function visible(before: Box, after: Box, viewport: Box): boolean {
    const mx = viewport.w * CULL_MARGIN
    const my = viewport.h * CULL_MARGIN
    const left = Math.min(before.x, after.x)
    const top = Math.min(before.y, after.y)
    const right = Math.max(before.x + before.w, after.x + after.w)
    const bottom = Math.max(before.y + before.h, after.y + after.h)
    return (
        right >= viewport.x - mx &&
        left <= viewport.x + viewport.w + mx &&
        bottom >= viewport.y - my &&
        top <= viewport.y + viewport.h + my
    )
}

/**
 * The offset path of an anchored node, with the node's incoming velocity
 * relative to the parent's anchor point when it is moving (§5.6).
 */
function anchorPath(
    anchor: LayoutAnchor,
    before: Box,
    after: Box,
    parentBefore: Box,
    parentAfter: Box,
    velocity: BoxVelocity | null,
    parentVelocity: BoxVelocity | null
): AnchorPath {
    const from = anchorOffsetOf(anchor, before, parentBefore)
    const to = anchorOffsetOf(anchor, after, parentAfter)
    let relative: { x: number; y: number } | null = null
    if (velocity) {
        const pv = parentVelocity ?? { x: 0, y: 0, w: 0, h: 0 }
        relative = {
            x: velocity.x + anchor.x * velocity.w - (pv.x + anchor.x * pv.w),
            y: velocity.y + anchor.y * velocity.h - (pv.y + anchor.y * pv.h),
        }
    }
    return {
        u: anchor.x,
        v: anchor.y,
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        velocity: relative,
    }
}

interface Lead {
    readonly id: string
    readonly index: number
    readonly handoff: Box | null
    /** The departing node's velocity when it was moving. */
    readonly handoffVelocity: BoxVelocity | null
    readonly follower: number
}

function resolveLeads(input: PlanInput, warnings: PlanWarning[]): Lead[] {
    const byId = new Map<string, number[]>()
    input.nodes.forEach((node, index) => {
        if (node.layoutId === null) return
        const list = byId.get(node.layoutId)
        if (list) list.push(index)
        else byId.set(node.layoutId, [index])
    })
    const leads: Lead[] = []
    for (const [id, members] of byId) {
        const live = members.filter((i) => !input.nodes[i]!.exiting)
        if (live.length === 0) continue
        if (live.length > 1) warnings.push({ kind: 'duplicate-id', id })
        let index = live[0]!
        for (const i of live) {
            if (input.nodes[i]!.order > input.nodes[index]!.order) index = i
        }
        const history = input.ids.get(id)
        const previous = history?.lead ?? null
        let handoff: Box | null = null
        let handoffVelocity: BoxVelocity | null = null
        let follower = -1
        if (previous !== index) {
            if (previous === null) {
                // the previous lead left the scope: its retained box and velocity
                handoff = history?.retained ?? null
                handoffVelocity = history?.retainedVelocity ?? null
            } else if (input.nodes[previous]!.exiting) {
                const old = input.nodes[previous]!
                handoff = old.before ?? old.a
                handoffVelocity = old.velocity
                follower = previous
            }
            // a previous lead that is still live keeps its own motion (duplicate id)
        }
        leads.push({ id, index, handoff, handoffVelocity, follower })
    }
    return leads
}

/**
 * How far a running track's targets are from the new A (§5.7 keep test,
 * condition 2): its size target, and for an anchored track its offset target
 * from the parent's new anchor point (§5.6).
 */
function targetMoved(node: PlanNode, parentAfter: Box | undefined): number {
    const target = node.trackTarget!
    const rule = node.track!.anchor
    const a = node.planned ?? node.a
    const size = Math.max(Math.abs(target.w - a.w), Math.abs(target.h - a.h))
    if (rule && node.anchor && parentAfter) {
        const to = anchorOffsetOf(node.anchor, a, parentAfter)
        return Math.max(
            size,
            Math.abs(to.x - rule.toX),
            Math.abs(to.y - rule.toY)
        )
    }
    return size
}

/**
 * The keep test of a running track (§5.7), judged under the presence
 * matrices it was planned with: its new A equals its presented layout box
 * `L_k` (1), its size and offset targets are unchanged (2), and its options
 * are unchanged (3), each within `threshold`; and its re-expression is not a
 * retarget. Without a measurement of what was presented there is nothing to
 * retarget from, so the track is kept whatever moved (§4.4).
 */
function keeps(
    node: PlanNode,
    parentAfter: Box | undefined,
    measured: boolean,
    threshold: number
): boolean {
    if (!measured || node.before === null) return true
    if (node.optionsChanged || node.path === 'retarget' || !node.presented) {
        return false
    }
    if (targetMoved(node, node.parentPlanned ?? parentAfter) >= threshold) {
        return false
    }
    const a = node.planned ?? node.a
    return (
        moved(
            node.presented,
            a,
            node,
            node.parentPresented ?? undefined,
            node.parentPresented
                ? (node.parentPlanned ?? parentAfter)
                : undefined
        ) < threshold
    )
}

export function plan(input: PlanInput): Plan {
    const { nodes, threshold } = input
    const warnings: PlanWarning[] = []
    const snapped: { index: number; reason: SnapReason }[] = []
    const leadList = resolveLeads(input, warnings)
    const leads = new Map(leadList.map((lead) => [lead.id, lead.index]))

    // effective before-box and carried velocity: a new lead starts from the
    // box it takes over, moving if that node was moving. Without a valid
    // measurement nothing is taken over (§4.4)
    const before = nodes.map((node) => node.before)
    const carried: (BoxVelocity | null)[] = nodes.map((node) => node.velocity)
    const fadeLead = new Set<number>()
    const handoffFrom = new Map<number, number>()
    const newFollower = new Map<number, number>()
    for (const lead of leadList) {
        const node = nodes[lead.index]!
        if (lead.handoff === null || !input.measured) continue
        before[lead.index] = lead.handoff
        carried[lead.index] = lead.handoffVelocity
        handoffFrom.set(lead.index, lead.follower)
        if (lead.follower < 0) continue
        const follower = nodes[lead.follower]!
        // a pair that reverses mid-crossfade keeps fading, however little
        // it moves: its opacities must not pop (§5.6)
        const reversing = node.following === lead.follower
        if (
            (!reversing && moved(lead.handoff, node.a, node) < threshold) ||
            !node.crossfade ||
            !follower.crossfade
        ) {
            continue
        }
        if (node.presenceOpacity || follower.presenceOpacity) {
            warnings.push({
                kind: 'presence-opacity',
                index: node.presenceOpacity ? lead.index : lead.follower,
            })
            continue
        }
        fadeLead.add(lead.index)
        newFollower.set(lead.follower, lead.index)
    }

    const actions: Action[] = []
    const unsupported: boolean[] = []
    const animated: boolean[] = []
    const ancestorAnimated: boolean[] = []
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!
        const p = node.parent
        unsupported.push(node.unsupported || (p >= 0 && unsupported[p]!))
        ancestorAnimated.push(p >= 0 && (animated[p]! || ancestorAnimated[p]!))
        const action = decide(i)
        actions.push(action)
        animated.push(action.kind !== 'none' && action.kind !== 'static')
    }

    function decide(i: number): Action {
        const node = nodes[i]!
        const b = before[i]!
        const underMotion = ancestorAnimated[i]!
        const parentIndex = node.parent
        // an anchor needs a participant parent; without one it is ignored
        const anchored = node.anchor !== null && parentIndex >= 0
        const parentNode = anchored ? nodes[parentIndex]! : null
        const parentBefore = parentNode
            ? (before[parentIndex] ?? parentNode.a)
            : undefined
        const parentAfter = parentNode?.a
        // without parent boxes `moved` ignores the anchor
        const movedFrom = (from: Box) =>
            moved(from, node.a, node, parentBefore, parentAfter)
        if (unsupported[i]) {
            if (node.moving || (b && movedFrom(b) >= threshold)) {
                snapped.push({ index: i, reason: 'unsupported' })
            }
            return NONE
        }
        const lead = newFollower.get(i)
        if (lead !== undefined) return { kind: 'follow', lead, start: true }
        if (
            node.following >= 0 &&
            node.exiting &&
            node.layoutId !== null &&
            leads.get(node.layoutId) === node.following
        ) {
            return { kind: 'follow', lead: node.following, start: false }
        }
        if (node.skip) return underMotion ? STATIC : NONE
        const parentMoves =
            anchored &&
            (animated[parentIndex]! || ancestorAnimated[parentIndex]!)
        let own: Action = NONE
        if (
            node.moving &&
            node.track &&
            node.trackTarget &&
            keeps(node, parentAfter, input.measured, threshold)
        ) {
            own = KEEP
            // a kept track with no measured B cannot be shown to be outside
            // the viewport: it keeps running (culling would make it jump)
            if (b === null) return own
        } else if (
            // without a valid measurement nothing starts: the node appears at A
            input.measured &&
            (node.moving ||
                (b !== null && movedFrom(b) >= threshold) ||
                parentMoves ||
                fadeLead.has(i))
        ) {
            const from = b ?? node.a
            const velocity = carried[i]!
            // a moving node starts at once so its velocity is never dropped
            const motion = velocity ? { ...node.motion, delay: 0 } : node.motion
            const path = parentNode
                ? anchorPath(
                      node.anchor!,
                      from,
                      node.a,
                      parentBefore!,
                      parentNode.a,
                      velocity,
                      parentNode.velocity
                  )
                : null
            const track = createTrack(
                from,
                node.a,
                velocity,
                node.fx,
                node.fy,
                node.mode,
                motion,
                path
            )
            if (typeof track === 'string') {
                // reduced motion found no fit, or the spring would run too long
                snapped.push({
                    index: i,
                    reason: track === 'reduced' ? 'reduced' : 'unsupported',
                })
                if (track === 'spring-timeout')
                    warnings.push({ kind: 'spring-timeout', index: i })
                return underMotion ? STATIC : NONE
            }
            own = {
                kind: 'track',
                track,
                fadeLead: fadeLead.has(i),
                handoffFrom: handoffFrom.get(i),
            }
        }
        if (own.kind === 'none') return underMotion ? STATIC : NONE
        // a path wholly outside the viewport jumps, uncounted; under a moving
        // ancestor it is still counter-projected
        if (!visible(b ?? node.a, node.a, input.viewport)) {
            snapped.push({ index: i, reason: 'culled' })
            return underMotion ? STATIC : NONE
        }
        return own
    }

    let movers = 0
    for (const action of actions) {
        if (
            action.kind === 'track' ||
            action.kind === 'keep' ||
            action.kind === 'follow'
        ) {
            movers += 1
        }
    }
    if (movers > input.maxNodes) {
        const capped = actions.flatMap((action, index) =>
            action.kind === 'track' ||
            action.kind === 'keep' ||
            action.kind === 'follow'
                ? [{ index, reason: 'capped' as const }]
                : []
        )
        return {
            status: 'capped',
            actions: nodes.map(() => NONE),
            snapped: [...snapped, ...capped],
            leads,
            warnings,
        }
    }
    return { status: 'run', actions, snapped, leads, warnings }
}
