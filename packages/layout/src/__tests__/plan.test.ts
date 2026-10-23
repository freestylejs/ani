import { timing } from '@freestylejs/ani-core'
import { describe, expect, it } from 'vitest'
import type { Box } from '../geometry'
import { resolveMotion } from '../motion'
import { type IdHistory, type PlanInput, type PlanNode, plan } from '../plan'
import { createTrack, drawnBoxes, drawnVelocities } from '../solve'
import { rootNode } from './nodes'

const motion = resolveMotion([
    { duration: 0.4, delay: 0.2, timing: timing.linear() },
])
const VIEWPORT: Box = { x: 0, y: 0, w: 1000, h: 800 }

function node(overrides: Partial<PlanNode> = {}): PlanNode {
    return {
        parent: -1,
        order: 0,
        a: { x: 100, y: 100, w: 100, h: 50 },
        fx: 0.5,
        fy: 0.5,
        before: { x: 100, y: 100, w: 100, h: 50 },
        velocity: { x: 0, y: 0, w: 0, h: 0 },
        moving: false,
        track: null,
        trackTarget: null,
        mode: true,
        anchor: null,
        motion,
        layoutId: null,
        crossfade: true,
        exiting: false,
        presenceOpacity: false,
        unsupported: false,
        skip: false,
        optionsChanged: false,
        following: -1,
        ...overrides,
    }
}

function input(nodes: PlanNode[], extra: Partial<PlanInput> = {}): PlanInput {
    return {
        nodes,
        ids: new Map(),
        viewport: VIEWPORT,
        threshold: 1,
        maxNodes: 300,
        stale: false,
        ...extra,
    }
}

describe('plan: movers and threshold', () => {
    it('a node that did not move is not animated; one that moved gets a track from B', () => {
        const result = plan(
            input([
                node(),
                node({ before: { x: 0, y: 100, w: 100, h: 50 } }),
                node({ before: { x: 100.4, y: 100, w: 100, h: 50 } }),
            ])
        )
        expect(result.status).toBe('run')
        expect(result.actions.map((a) => a.kind)).toEqual([
            'none',
            'track',
            'none',
        ])
        const action = result.actions[1]!
        if (action.kind !== 'track') throw new Error('expected a track')
        expect(action.track.delay).toBe(0.2)
        expect(action.track.k).toEqual([0, 0, 0, 0])
    })

    it("judges only the animated channels: 'position' ignores a size change around a fixed origin point", () => {
        const before = { x: 125, y: 112.5, w: 50, h: 25 } // same centre as `a`
        const result = plan(
            input([
                node({ before, mode: 'position' }),
                node({ before, mode: 'size' }),
            ])
        )
        expect(result.actions.map((a) => a.kind)).toEqual(['none', 'track'])
    })

    it('a new node (no before box) is not animated', () => {
        expect(plan(input([node({ before: null })])).actions[0]!.kind).toBe(
            'none'
        )
    })

    it('a skipped node (unchanged layoutDependency) is not animated, but solved under a moving parent', () => {
        const result = plan(
            input([
                node({ before: { x: 0, y: 0, w: 100, h: 50 } }),
                node({
                    parent: 0,
                    skip: true,
                    before: { x: 0, y: 0, w: 10, h: 10 },
                }),
                node({ skip: true, before: { x: 0, y: 0, w: 10, h: 10 } }),
            ])
        )
        expect(result.actions.map((a) => a.kind)).toEqual([
            'track',
            'static',
            'none',
        ])
    })
})

describe('plan: interruption', () => {
    const a = { x: 100, y: 100, w: 100, h: 50 }
    const running = createTrack(
        { x: 0, y: 0, w: 100, h: 50 },
        a,
        null,
        0.5,
        0.5,
        true,
        motion,
        null
    )
    const velocity = drawnVelocities([
        rootNode(a, { fx: 0.5, fy: 0.5, track: running, elapsed: 0.35 }),
    ])[0]!
    const drawn = drawnBoxes([
        rootNode(a, { fx: 0.5, fy: 0.5, track: running, elapsed: 0.35 }),
    ])[0]!
    const moving = (overrides: Partial<PlanNode>) =>
        node({
            moving: true,
            track: running,
            trackTarget: a,
            before: drawn,
            velocity,
            ...overrides,
        })

    it('keeps a running track whose target did not move (an unrelated re-render restarts nothing)', () => {
        const result = plan(input([moving({ a: { ...a, x: 100.5 } })]))
        expect(result.actions[0]!.kind).toBe('keep')
    })

    it('retargets from the drawn box with the current velocity and no delay', () => {
        const target = { x: 400, y: 100, w: 100, h: 50 }
        const result = plan(input([moving({ a: target })]))
        const action = result.actions[0]!
        if (action.kind !== 'track') throw new Error('expected a track')
        expect(action.track.delay).toBe(0)
        const next = rootNode(target, {
            fx: 0.5,
            fy: 0.5,
            track: action.track,
            elapsed: 0,
        })
        expect(drawnBoxes([next])[0]!.x).toBeCloseTo(drawn.x, 12)
        expect(drawnVelocities([next])[0]!.x).toBeCloseTo(velocity.x, 6)
    })

    it('retargets when the options changed', () => {
        const result = plan(input([moving({ optionsChanged: true })]))
        expect(result.actions[0]!.kind).toBe('track')
    })
})

describe('plan: layoutId', () => {
    const cardBox = { x: 10, y: 10, w: 80, h: 80 }
    const detailBox = { x: 200, y: 50, w: 400, h: 300 }

    it('a new lead starts from the departing node (live, exiting): handoff and crossfade', () => {
        const ids = new Map<string, IdHistory>([
            ['card', { lead: 0, retained: null }],
        ])
        const result = plan(
            input(
                [
                    node({
                        layoutId: 'card',
                        exiting: true,
                        a: cardBox,
                        before: cardBox,
                        order: 1,
                    }),
                    node({
                        layoutId: 'card',
                        a: detailBox,
                        before: null,
                        order: 2,
                    }),
                ],
                { ids }
            )
        )
        expect(result.leads.get('card')).toBe(1)
        expect(result.actions[0]).toEqual({
            kind: 'follow',
            lead: 1,
            start: true,
        })
        const lead = result.actions[1]!
        if (lead.kind !== 'track') throw new Error('expected a track')
        expect(lead.fadeLead).toBe(true)
        const first = drawnBoxes([
            rootNode(detailBox, {
                fx: 0.5,
                fy: 0.5,
                track: lead.track,
                elapsed: 0,
            }),
        ])[0]!
        expect(first.x).toBeCloseTo(cardBox.x, 12)
        expect(first.w).toBeCloseTo(cardBox.w, 12)
    })

    it('hands off from a retained box when the departing node is gone; no crossfade', () => {
        const ids = new Map<string, IdHistory>([
            ['card', { lead: null, retained: cardBox }],
        ])
        const result = plan(
            input([node({ layoutId: 'card', a: detailBox, before: null })], {
                ids,
            })
        )
        const lead = result.actions[0]!
        if (lead.kind !== 'track') throw new Error('expected a track')
        expect(lead.fadeLead).toBe(false)
    })

    for (const [name, patch] of [
        ['the follower is not exiting', { exiting: false }],
        ['the lead opts out', 'lead-off'],
        ['the follower opts out', { crossfade: false }],
        ['the box did not move', 'same-box'],
    ] as const) {
        it(`no crossfade when ${name}`, () => {
            const ids = new Map<string, IdHistory>([
                ['card', { lead: 0, retained: null }],
            ])
            const follower = node({
                layoutId: 'card',
                exiting: true,
                a: cardBox,
                before: cardBox,
                order: 1,
                ...(typeof patch === 'object' ? patch : {}),
            })
            const lead = node({
                layoutId: 'card',
                a: patch === 'same-box' ? cardBox : detailBox,
                before: null,
                order: 2,
                crossfade: patch !== 'lead-off',
            })
            const result = plan(input([follower, lead], { ids }))
            const action = result.actions[1]!
            expect(action.kind === 'track' && action.fadeLead).toBeFalsy()
            expect(result.actions[0]!.kind).not.toBe('follow')
        })
    }

    it('presence animating opacity on a crossfade node: handoff without crossfade, warning', () => {
        const ids = new Map<string, IdHistory>([
            ['card', { lead: 0, retained: null }],
        ])
        const result = plan(
            input(
                [
                    node({
                        layoutId: 'card',
                        exiting: true,
                        a: cardBox,
                        before: cardBox,
                        order: 1,
                        presenceOpacity: true,
                    }),
                    node({
                        layoutId: 'card',
                        a: detailBox,
                        before: null,
                        order: 2,
                    }),
                ],
                { ids }
            )
        )
        expect(result.warnings).toEqual([
            { kind: 'presence-opacity', index: 0 },
        ])
        const lead = result.actions[1]!
        expect(lead.kind === 'track' && !lead.fadeLead).toBe(true)
    })

    it('two live nodes with one id: the newest leads, a warning, no handoff to an existing node', () => {
        const result = plan(
            input([
                node({ layoutId: 'x', order: 5 }),
                node({ layoutId: 'x', order: 9 }),
            ])
        )
        expect(result.leads.get('x')).toBe(1)
        expect(result.warnings).toEqual([{ kind: 'duplicate-id', id: 'x' }])
    })

    it('a running crossfade follower keeps following while it exits and the lead still leads', () => {
        const ids = new Map<string, IdHistory>([
            ['card', { lead: 1, retained: null }],
        ])
        const result = plan(
            input(
                [
                    node({
                        layoutId: 'card',
                        exiting: true,
                        following: 1,
                        order: 1,
                    }),
                    node({
                        layoutId: 'card',
                        a: detailBox,
                        before: detailBox,
                        order: 2,
                    }),
                ],
                { ids }
            )
        )
        expect(result.actions[0]).toEqual({
            kind: 'follow',
            lead: 1,
            start: false,
        })
    })
})

describe('plan: nesting and anchors', () => {
    it('descendants of a mover are solved (static) even when their own box did not move', () => {
        const result = plan(
            input([
                node({ before: { x: 0, y: 0, w: 50, h: 50 } }),
                node({ parent: 0 }),
                node({ parent: 1 }),
            ])
        )
        expect(result.actions.map((a) => a.kind)).toEqual([
            'track',
            'static',
            'static',
        ])
    })

    it('an anchored child follows a moving parent with its own track (E1: delay holds the size)', () => {
        const parentBefore = { x: 0, y: 0, w: 150, h: 150 }
        const parentAfter = { x: 0, y: 0, w: 300, h: 300 }
        const child = { x: 115, y: 115, w: 70, h: 70 }
        const childAfter = { x: 100, y: 100, w: 100, h: 100 }
        const delayed = resolveMotion([
            { duration: 0.5, delay: 0.8, timing: timing.linear() },
        ])
        const result = plan(
            input([
                node({
                    a: parentAfter,
                    before: parentBefore,
                    fx: 0.5,
                    fy: 0.5,
                }),
                node({
                    parent: 0,
                    a: childAfter,
                    before: { x: 40, y: 40, w: 70, h: 70 },
                    anchor: { x: 0.5, y: 0.5 },
                    motion: delayed,
                }),
            ])
        )
        const action = result.actions[1]!
        if (action.kind !== 'track') throw new Error('expected a track')
        expect(action.track.anchor).toEqual({
            u: 0.5,
            v: 0.5,
            fromX: 0,
            fromY: 0,
            toX: 0,
            toY: 0,
        })
        expect(action.track.delay).toBe(0.8)
        void child
    })

    it('an unsupported node snaps with its subtree', () => {
        const result = plan(
            input([
                node({
                    unsupported: true,
                    before: { x: 0, y: 0, w: 50, h: 50 },
                }),
                node({ parent: 0, before: { x: 0, y: 0, w: 5, h: 5 } }),
                node({ before: { x: 0, y: 0, w: 50, h: 50 } }),
            ])
        )
        expect(result.actions.map((a) => a.kind)).toEqual([
            'none',
            'none',
            'track',
        ])
        expect(result.snapped).toEqual([
            { index: 0, reason: 'unsupported' },
            { index: 1, reason: 'unsupported' },
        ])
    })
})

describe('plan: snaps', () => {
    it('culls a root mover whose path stays outside the viewport ± 10 %', () => {
        const result = plan(
            input([
                node({
                    a: { x: 0, y: 2000, w: 50, h: 50 },
                    before: { x: 0, y: 1900, w: 50, h: 50 },
                }),
                node({
                    a: { x: 0, y: 870, w: 50, h: 50 },
                    before: { x: 0, y: 1900, w: 50, h: 50 },
                }),
            ])
        )
        expect(result.actions.map((a) => a.kind)).toEqual(['none', 'track'])
        expect(result.snapped).toEqual([{ index: 0, reason: 'culled' }])
    })

    it('snaps the whole flush when visible movers exceed maxNodes', () => {
        const nodes = Array.from({ length: 4 }, (_, i) =>
            node({
                before: { x: i * 10, y: 0, w: 50, h: 50 },
                a: { x: i * 10 + 100, y: 0, w: 50, h: 50 },
            })
        )
        const result = plan(input(nodes, { maxNodes: 3 }))
        expect(result.status).toBe('capped')
        expect(result.actions.every((a) => a.kind === 'none')).toBe(true)
        expect(result.snapped.map((s) => s.reason)).toEqual([
            'capped',
            'capped',
            'capped',
            'capped',
        ])
        expect(plan(input(nodes, { maxNodes: 4 })).status).toBe('run')
    })

    it('a stale epoch snaps every node that would have moved', () => {
        const result = plan(
            input([node(), node({ before: { x: 0, y: 0, w: 100, h: 50 } })], {
                stale: true,
            })
        )
        expect(result.status).toBe('stale')
        expect(result.snapped).toEqual([{ index: 1, reason: 'stale' }])
    })
})
