import { type Box, IDENTITY_MAP } from '../geometry'
import { createTrack, type SolveNode, type Track } from '../solve'

/** `createTrack` for a plan that must produce a track (no refusal). */
export function trackOf(...args: Parameters<typeof createTrack>): Track {
    const track = createTrack(...args)
    if (typeof track === 'string') throw new Error(`no track: ${track}`)
    return track
}

/**
 * A top-level solver node with no inner map: its local frame is the page and
 * its box at rest is `a`; the origin is at fractions `(fx, fy)` of `a`.
 */
export function rootNode(
    a: Box,
    fields: Partial<SolveNode> & { fx?: number; fy?: number } = {}
): SolveNode {
    const { fx = 0, fy = 0, ...rest } = fields
    return {
        parent: -1,
        a,
        box: a,
        ox: a.x + fx * a.w,
        oy: a.y + fy * a.h,
        inner: IDENTITY_MAP,
        track: null,
        elapsed: 0,
        follow: -1,
        fade: null,
        radius: null,
        ...rest,
    }
}
