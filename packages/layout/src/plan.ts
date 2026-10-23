/**
 * Per flush: who animates, keep or retarget, `layoutId` handoff, crossfade
 * pairs and every snap reason. Pure: no DOM, no clock.
 */
import type { Box } from './geometry'
import type { LayoutAnchor, LayoutMode, Motion } from './motion'
import {
    type AnchorRule,
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
    /** Visual box before the change; `null` for a node new to the scope. */
    readonly before: Box | null
    /** Drawn-box velocity now (zero at rest). */
    readonly velocity: BoxVelocity
    /** Driven by a running own track. */
    readonly moving: boolean
    /** The running own track and its target, kept when A did not move. */
    readonly track: Track | null
    readonly trackTarget: Box | null
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
}

export interface PlanInput {
    readonly nodes: readonly PlanNode[]
    readonly ids: ReadonlyMap<string, IdHistory>
    readonly viewport: Box
    readonly threshold: number
    readonly maxNodes: number
    /** An inner scroll container moved between capture and flush. */
    readonly stale: boolean
}

export type Action =
    | { readonly kind: 'none' }
    | { readonly kind: 'keep' }
    | {
          readonly kind: 'track'
          readonly track: Track
          /** Starts a crossfade as its lead. */
          readonly fadeLead: boolean
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

export interface Plan {
    readonly status: 'run' | 'capped' | 'stale'
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

/** How far a box moved in the channels its mode animates. */
export function moved(
    from: Box,
    to: Box,
    node: Pick<PlanNode, 'mode' | 'anchor' | 'fx' | 'fy'>
): number {
    const b = channelsOf(from, node.fx, node.fy)
    const a = channelsOf(to, node.fx, node.fy)
    const origin = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
    const size = Math.max(Math.abs(b[2] - a[2]), Math.abs(b[3] - a[3]))
    if (node.anchor) return size
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

function anchorRule(
    anchor: LayoutAnchor,
    before: Box,
    after: Box,
    parentBefore: Box,
    parentAfter: Box
): AnchorRule {
    const point = (box: Box) => ({
        x: box.x + anchor.x * box.w,
        y: box.y + anchor.y * box.h,
    })
    const b = point(before)
    const pb = point(parentBefore)
    const a = point(after)
    const pa = point(parentAfter)
    return {
        u: anchor.x,
        v: anchor.y,
        fromX: b.x - pb.x,
        fromY: b.y - pb.y,
        toX: a.x - pa.x,
        toY: a.y - pa.y,
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
                handoff = history?.retained ?? null
            } else {
                const old = input.nodes[previous]!
                handoff = old.before ?? old.a
                if (old.moving) handoffVelocity = old.velocity
                if (old.exiting) follower = previous
            }
        }
        leads.push({ id, index, handoff, handoffVelocity, follower })
    }
    return leads
}

export function plan(input: PlanInput): Plan {
    const { nodes, threshold } = input
    const warnings: PlanWarning[] = []
    const snapped: { index: number; reason: SnapReason }[] = []
    const leadList = resolveLeads(input, warnings)
    const leads = new Map(leadList.map((lead) => [lead.id, lead.index]))

    if (input.stale) {
        nodes.forEach((node, index) => {
            const before = node.before
            if (
                node.moving ||
                (before && moved(before, node.a, node) >= threshold)
            ) {
                snapped.push({ index, reason: 'stale' })
            }
        })
        return {
            status: 'stale',
            actions: nodes.map(() => NONE),
            snapped,
            leads,
            warnings,
        }
    }

    // effective before-box and carried velocity: a new lead starts from the
    // box it takes over, moving if that node was moving
    const before = nodes.map((node) => node.before)
    const carried: (BoxVelocity | null)[] = nodes.map((node) =>
        node.moving ? node.velocity : null
    )
    const fadeLead = new Set<number>()
    const newFollower = new Map<number, number>()
    for (const lead of leadList) {
        const node = nodes[lead.index]!
        if (lead.handoff === null || node.before !== null) continue
        before[lead.index] = lead.handoff
        carried[lead.index] = lead.handoffVelocity
        if (lead.follower < 0) continue
        const follower = nodes[lead.follower]!
        if (
            moved(lead.handoff, node.a, node) < threshold ||
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
        if (unsupported[i]) {
            if (node.moving || (b && moved(b, node.a, node) >= threshold)) {
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
        const parentIndex = node.parent
        const anchored = node.anchor !== null && parentIndex >= 0
        const parentMoves =
            anchored &&
            (animated[parentIndex]! || ancestorAnimated[parentIndex]!)
        let own: Action = NONE
        if (
            node.moving &&
            node.track &&
            node.trackTarget &&
            !node.optionsChanged &&
            moved(node.trackTarget, node.a, node) < threshold
        ) {
            own = KEEP
        } else if (
            node.moving ||
            (b !== null && moved(b, node.a, node) >= threshold) ||
            parentMoves
        ) {
            const from = b ?? node.a
            const velocity = carried[i]!
            // a moving node starts at once so its velocity is never dropped
            const motion = velocity ? { ...node.motion, delay: 0 } : node.motion
            let rule: AnchorRule | null = null
            if (anchored) {
                const parent = nodes[parentIndex]!
                rule = anchorRule(
                    node.anchor!,
                    from,
                    node.a,
                    before[parentIndex] ?? parent.a,
                    parent.a
                )
            }
            own = {
                kind: 'track',
                track: createTrack(
                    from,
                    node.a,
                    velocity,
                    node.fx,
                    node.fy,
                    node.mode,
                    motion,
                    rule
                ),
                fadeLead: fadeLead.has(i),
            }
        }
        if (own.kind === 'none') return underMotion ? STATIC : NONE
        if (!underMotion && !visible(b ?? node.a, node.a, input.viewport)) {
            snapped.push({ index: i, reason: 'culled' })
            return NONE
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
