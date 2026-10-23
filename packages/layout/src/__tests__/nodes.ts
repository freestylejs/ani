import { type Box, IDENTITY_MAP } from '../geometry'
import type { SolveNode } from '../solve'

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
