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
    type TrackRefusalDetail,
} from './solve'

export type SnapReason =
    | 'culled'
    | 'capped'
    | 'unsupported'
    | 'stale'
    | 'reduced'
    | 'disabled'
    | 'failed'

/** A run's lifecycle status, in the precedence order of §9.3. */
export type LayoutStatus =
    | 'failed'
    | 'disposed'
    | 'disabled'
    | 'capped'
    | 'interrupted'
    | 'ended'
    | 'reduced'
    | 'stale'
    | 'no-change'

/** §9.3, earliest first. */
const STATUS_PRECEDENCE: readonly LayoutStatus[] = [
    'failed',
    'disposed',
    'disabled',
    'capped',
    'interrupted',
    'ended',
    'reduced',
    'stale',
    'no-change',
]

/**
 * The first status that applies (§9.3): `'failed'`, `'disposed'`,
 * `'disabled'`, `'capped'`, `'interrupted'`, `'ended'`, `'reduced'`,
 * `'stale'`, `'no-change'`. `null` when none applies.
 */
export function resolveLayoutStatus(
    statuses: Iterable<LayoutStatus>
): LayoutStatus | null {
    let first: LayoutStatus | null = null
    let rank = Number.POSITIVE_INFINITY
    for (const status of statuses) {
        const at = STATUS_PRECEDENCE.indexOf(status)
        if (at >= 0 && at < rank) {
            rank = at
            first = status
        }
    }
    return first
}

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
    /**
     * Focus is inside this element in the flat tree (§8): if it is the
     * exiting follower of a handoff, the pair does not crossfade and neither
     * node animates; the lead appears at A and presence alone draws the exit.
     */
    readonly focusInside: boolean
    readonly unsupported: boolean
    /** `layoutDependency` unchanged since the previous flush. */
    readonly skip: boolean
    readonly optionsChanged: boolean
    /** The lead this node follows in a running crossfade, or -1. */
    readonly following: number
    /**
     * Its B is a valid measurement of what was presented (§4.4): false in a
     * flush with no fresh capture, and for a node without a valid B in a fresh
     * one (disconnected at capture, an owned declaration replaced by the
     * author) and its participant subtree. Such a node starts nothing: a
     * running track is kept whatever moved, any other node appears at A.
     */
    readonly measured: boolean
    /**
     * Registered after the fresh capture (§4.4, OPS-10). It may still take a
     * `layoutId` handoff from the departing lead; without one it has no B.
     */
    readonly lateRegistered: boolean
    /**
     * It would fly from a box measured inside an actively scrolling container
     * that it is outside of now (§5.8): a handoff out of that container, or a
     * reparent out of it. It does not fly: it appears at A (a presence enter
     * plays its own motion), a running track of its own ends, and nothing is
     * handed over to it.
     */
    readonly scrollActive: boolean
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
    /**
     * Parents before children. A `null` entry is a participant the scope has
     * proven quiescent for this flush (no drive in its subtree, no shared id,
     * unchanged box): it cannot animate, snap or report, so its plan action is
     * `none`; the array stays index-aligned with the participant list.
     */
    readonly nodes: readonly (PlanNode | null)[]
    readonly ids: ReadonlyMap<string, IdHistory>
    readonly viewport: Box
    readonly threshold: number
    readonly maxNodes: number
    /**
     * The scope has no `layoutId` participant at all: no lead, handoff or
     * crossfade is possible, so the id pass can be skipped (an optimization;
     * the per-node actions are unchanged).
     */
    readonly leadless?: boolean
    /**
     * The scope has a fresh, measured, plain retarget frame: every running
     * track has `path: 'retarget'`, no holds/rides/ids/anchors/layers/fades
     * are present and every node is measured. The plan may use the
     * retarget-only path when the nodes still satisfy that proof; otherwise
     * it falls back to the general plan unchanged.
     */
    readonly retargetOnly?: boolean
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
    | {
          readonly kind: 'spring-timeout'
          readonly index: number
          /** The refused spring's settle, ms; `null` when it could not be computed. */
          readonly settleMs: number | null
      }

/**
 * A defined degradation that is not a snap (`report.snapped` does not list
 * it), with the reason of its diagnostic (§5.8, §9.1).
 */
export interface Degraded {
    readonly index: number
    readonly reason: 'handoff-scroll-active' | 'focus-in-follower'
}

export interface Plan {
    readonly status: 'run' | 'capped'
    readonly actions: readonly Action[]
    readonly snapped: readonly {
        readonly index: number
        readonly reason: SnapReason
    }[]
    readonly degraded: readonly Degraded[]
    /** The lead of every `layoutId` that has one. */
    readonly leads: ReadonlyMap<string, number>
    /**
     * Accepted handoffs: node index -> departing live index, or -1 for a
     * retained box. A late lead here has a valid B even when it needs no track.
     */
    readonly handoffs: ReadonlyMap<number, number>
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

/**
 * Per `layoutId`, its lead and the node a handoff takes over from (§5.8).
 * `from` is the departing live node (an exiting previous lead), `'retained'`
 * for a previous lead that left the scope within `retain`, and `null` when
 * nothing is handed over (no change of lead, or a previous lead that is still
 * live and not exiting: a duplicate id).
 */
export interface LeadChange {
    readonly id: string
    readonly index: number
    readonly from: number | 'retained' | null
    /** Two live, non-exiting nodes share the id. */
    readonly duplicate: boolean
}

export function leadChanges(
    nodes: readonly (Pick<PlanNode, 'layoutId' | 'exiting' | 'order'> | null)[],
    ids: ReadonlyMap<string, IdHistory>
): LeadChange[] {
    const byId = new Map<string, number[]>()
    nodes.forEach((node, index) => {
        if (node === null || node.layoutId === null) return
        const list = byId.get(node.layoutId)
        if (list) list.push(index)
        else byId.set(node.layoutId, [index])
    })
    const changes: LeadChange[] = []
    for (const [id, members] of byId) {
        const live = members.filter((i) => !nodes[i]!.exiting)
        if (live.length === 0) continue
        let index = live[0]!
        for (const i of live) {
            if (nodes[i]!.order > nodes[index]!.order) index = i
        }
        const history = ids.get(id)
        const previous = history?.lead ?? null
        let from: LeadChange['from'] = null
        if (previous !== index) {
            if (previous === null) {
                // the previous lead left the scope: its retained box
                if (history?.retained) from = 'retained'
            } else if (nodes[previous]?.exiting) {
                from = previous
            }
        }
        changes.push({ id, index, from, duplicate: live.length > 1 })
    }
    return changes
}

function resolveLeads(input: PlanInput, warnings: PlanWarning[]): Lead[] {
    return leadChanges(input.nodes, input.ids).map(
        ({ id, index, from, duplicate }) => {
            if (duplicate) warnings.push({ kind: 'duplicate-id', id })
            let handoff: Box | null = null
            let handoffVelocity: BoxVelocity | null = null
            let follower = -1
            if (from === 'retained') {
                const history = input.ids.get(id)!
                handoff = history.retained
                handoffVelocity = history.retainedVelocity
            } else if (from !== null) {
                const old = input.nodes[from]
                if (old) {
                    handoff = old.before ?? old.a
                    handoffVelocity = old.velocity
                    follower = from
                }
            }
            return { id, index, handoff, handoffVelocity, follower }
        }
    )
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
    threshold: number
): boolean {
    if (!node.measured || node.before === null) return true
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

/**
 * The retarget-only proof: every non-null node is measured, has no
 * hold/skip/degradation, shared-id, anchor, layer or fade complication, and a
 * moving node is a plain measured retarget with a valid B. Unsupported
 * ancestors are excluded too. If anything fails, the caller uses the general
 * plan; the fast path never has to guess.
 */
export function retargetEligible(nodes: readonly (PlanNode | null)[]): boolean {
    const unsupported: boolean[] = []
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if (!node) {
            unsupported.push(false)
            continue
        }
        const inherited =
            node.unsupported || (node.parent >= 0 && unsupported[node.parent]!)
        if (inherited) return false
        unsupported.push(false)
        if (
            !node.measured ||
            node.lateRegistered ||
            node.scrollActive ||
            node.skip ||
            node.following >= 0 ||
            node.anchor !== null ||
            node.layoutId !== null ||
            node.exiting ||
            node.presenceOpacity ||
            node.focusInside
        ) {
            return false
        }
        if (node.moving) {
            if (
                node.before === null ||
                node.path !== 'retarget' ||
                node.track === null ||
                node.trackTarget === null ||
                node.track.anchor !== null
            ) {
                return false
            }
        }
    }
    return true
}

/**
 * The exact plan for a retarget-only flush: no leads, handoffs, follows,
 * presence, keeps or anchors are possible by `retargetEligible`, so each node is
 * either a plain retarget track, a new track from a measured B, or
 * none/static under a moving ancestor. Every other decision is the same as
 * the general `decide` branch it replaces.
 */
function planRetarget(input: PlanInput): Plan {
    const { nodes, threshold } = input
    const actions: Action[] = []
    const snapped: { index: number; reason: SnapReason }[] = []
    const warnings: PlanWarning[] = []
    const animated: boolean[] = []
    const ancestorAnimated: boolean[] = []
    let movers = 0
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if (!node) {
            actions.push(NONE)
            animated.push(false)
            ancestorAnimated.push(false)
            continue
        }
        const p = node.parent
        const underMotion = p >= 0 && (animated[p]! || ancestorAnimated[p]!)
        ancestorAnimated.push(underMotion)
        const b = node.before
        let own: Action = NONE
        if (
            node.moving ||
            (b !== null &&
                moved(b, node.a, node, undefined, undefined) >= threshold)
        ) {
            const from = b ?? node.a
            const velocity = node.velocity
            const motion = velocity ? { ...node.motion, delay: 0 } : node.motion
            const refusal: TrackRefusalDetail = { settle: null }
            const track = createTrack(
                from,
                node.a,
                velocity,
                node.fx,
                node.fy,
                node.mode,
                motion,
                null,
                refusal
            )
            if (typeof track === 'string') {
                snapped.push({
                    index: i,
                    reason: track === 'reduced' ? 'reduced' : 'unsupported',
                })
                if (track === 'spring-timeout')
                    warnings.push({
                        kind: 'spring-timeout',
                        index: i,
                        settleMs:
                            refusal.settle === null
                                ? null
                                : refusal.settle * 1000,
                    })
                const action = underMotion ? STATIC : NONE
                actions.push(action)
                animated.push(false)
                continue
            }
            own = {
                kind: 'track',
                track,
                fadeLead: false,
                handoffFrom: undefined,
            }
        }
        if (own.kind === 'none') {
            const action = underMotion ? STATIC : NONE
            actions.push(action)
            animated.push(false)
            continue
        }
        if (!visible(b ?? node.a, node.a, input.viewport)) {
            snapped.push({ index: i, reason: 'culled' })
            const action = underMotion ? STATIC : NONE
            actions.push(action)
            animated.push(false)
            continue
        }
        actions.push(own)
        animated.push(true)
        movers += 1
    }
    if (movers > input.maxNodes) {
        const capped = actions.flatMap((action, index) =>
            action.kind === 'track'
                ? [{ index, reason: 'capped' as const }]
                : []
        )
        return {
            status: 'capped',
            actions: nodes.map(() => NONE),
            snapped: [...snapped, ...capped],
            degraded: [],
            leads: new Map(),
            handoffs: new Map(),
            warnings,
        }
    }
    return {
        status: 'run',
        actions,
        snapped,
        degraded: [],
        leads: new Map(),
        handoffs: new Map(),
        warnings,
    }
}

export function plan(input: PlanInput): Plan {
    if (input.retargetOnly && input.leadless && retargetEligible(input.nodes)) {
        return planRetarget(input)
    }
    const { nodes, threshold } = input
    const warnings: PlanWarning[] = []
    const snapped: { index: number; reason: SnapReason }[] = []
    const degraded: Degraded[] = []
    // H18-A: a late registrant's handoff can only be judged after its parent's
    // (parents first, as the plan array is ordered). Resolving the leads in
    // that order lets a nested late lead inherit the measurement its parent
    // takes in the same plan.
    const leadList = input.leadless
        ? []
        : resolveLeads(input, warnings).sort((a, b) => a.index - b.index)
    const leads = new Map(leadList.map((lead) => [lead.id, lead.index]))

    // effective before-box and carried velocity: a new lead starts from the
    // box it takes over, moving if that node was moving. Without a valid
    // measurement nothing is taken over (§4.4)
    const before = nodes.map((node) => node?.before ?? null)
    const carried: (BoxVelocity | null)[] = nodes.map(
        (node) => node?.velocity ?? null
    )
    const fadeLead = new Set<number>()
    const handoffFrom = new Map<number, number>()
    const newFollower = new Map<number, number>()
    /** A late-registered lead becomes measured by the handoff it takes. */
    const measuredForPlan = nodes.map((node) => node?.measured ?? false)
    /**
     * §8: focus inside a handoff's exiting follower. When the pair would
     * otherwise crossfade, it is not coupled at all: no handoff box, no
     * crossfade; the lead appears at A and presence alone draws the exit.
     */
    const noMotion = new Set<number>()
    for (const lead of leadList) {
        const node = nodes[lead.index]
        if (!node) continue
        // H18-A: a late node whose parent is measured in this plan (or took
        // its own handoff earlier in it) may take its handoff; a late node
        // under an unmeasured, non-late parent may not.
        const eligible =
            node.measured ||
            (node.lateRegistered &&
                (node.parent < 0 || measuredForPlan[node.parent]))
        if (
            lead.handoff === null ||
            !eligible ||
            // out of an actively scrolling container: nothing is handed over
            node.scrollActive ||
            (lead.follower >= 0 && !nodes[lead.follower]!.measured)
        ) {
            continue
        }
        const follower = lead.follower >= 0 ? nodes[lead.follower]! : null
        // a pair that reverses mid-crossfade keeps fading, however little it
        // moves: its opacities must not pop (§5.6)
        const reversing = follower !== null && node.following === lead.follower
        const crosses =
            follower !== null &&
            (reversing || moved(lead.handoff, node.a, node) >= threshold) &&
            node.crossfade &&
            follower.crossfade
        // a presence opacity owns the fade: the pair hands off without a
        // crossfade and warns, focus or not (§5.8, C5)
        if (crosses && (node.presenceOpacity || follower.presenceOpacity)) {
            warnings.push({
                kind: 'presence-opacity',
                index: node.presenceOpacity ? lead.index : lead.follower,
            })
            before[lead.index] = lead.handoff
            measuredForPlan[lead.index] = true
            carried[lead.index] = lead.handoffVelocity
            handoffFrom.set(lead.index, lead.follower)
            continue
        }
        if (crosses && follower.focusInside) {
            // §8, C5: focus inside the exiting follower skips the crossfade
            // and the handoff; the pair is not made inert
            degraded.push({
                index: lead.follower,
                reason: 'focus-in-follower',
            })
            noMotion.add(lead.index)
            noMotion.add(lead.follower)
            continue
        }
        before[lead.index] = lead.handoff
        measuredForPlan[lead.index] = true
        carried[lead.index] = lead.handoffVelocity
        handoffFrom.set(lead.index, lead.follower)
        if (follower === null || !crosses) continue
        fadeLead.add(lead.index)
        newFollower.set(lead.follower, lead.index)
    }

    const actions: Action[] = []
    const unsupported: boolean[] = []
    const animated: boolean[] = []
    const ancestorAnimated: boolean[] = []
    let movers = 0
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if (!node) {
            unsupported.push(false)
            ancestorAnimated.push(false)
            actions.push(NONE)
            animated.push(false)
            continue
        }
        const p = node.parent
        unsupported.push(node.unsupported || (p >= 0 && unsupported[p]!))
        ancestorAnimated.push(p >= 0 && (animated[p]! || ancestorAnimated[p]!))
        const action = decide(i)
        actions.push(action)
        animated.push(action.kind !== 'none' && action.kind !== 'static')
        if (
            action.kind === 'track' ||
            action.kind === 'keep' ||
            action.kind === 'follow'
        ) {
            movers += 1
        }
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
        if (node.scrollActive) {
            // §5.8: it does not fly from where the scrolling container drew
            // it; it appears at A, reported as a degradation, not a snap
            degraded.push({ index: i, reason: 'handoff-scroll-active' })
            return underMotion ? STATIC : NONE
        }
        if (noMotion.has(i)) {
            // §8: focus is inside the exiting follower; the pair does not
            // crossfade and neither node animates (reported, not a snap)
            return underMotion ? STATIC : NONE
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
            keeps(node, parentAfter, threshold)
        ) {
            own = KEEP
            // a kept track with no measured B cannot be shown to be outside
            // the viewport: it keeps running (culling would make it jump)
            if (b === null) return own
        } else if (
            // without a valid measurement nothing starts: the node appears at A
            measuredForPlan[i] &&
            (node.moving ||
                (b !== null && movedFrom(b) >= threshold) ||
                parentMoves ||
                fadeLead.has(i))
        ) {
            const from = b ?? node.a
            const velocity = carried[i]!
            // a moving node starts at once so its velocity is never dropped
            const motion = velocity ? { ...node.motion, delay: 0 } : node.motion
            const refusal: TrackRefusalDetail = { settle: null }
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
                path,
                refusal
            )
            if (typeof track === 'string') {
                // reduced motion found no fit, or the spring would run too long
                snapped.push({
                    index: i,
                    reason: track === 'reduced' ? 'reduced' : 'unsupported',
                })
                if (track === 'spring-timeout')
                    warnings.push({
                        kind: 'spring-timeout',
                        index: i,
                        settleMs:
                            refusal.settle === null
                                ? null
                                : refusal.settle * 1000,
                    })
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
            // the whole flush snaps 'capped': nothing degrades on its own
            degraded: [],
            leads,
            handoffs: handoffFrom,
            warnings,
        }
    }
    return {
        status: 'run',
        actions,
        snapped,
        degraded,
        leads,
        handoffs: handoffFrom,
        warnings,
    }
}
