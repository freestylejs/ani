import { timing } from '@freestylejs/ani-core'
import { describe, expect, it } from 'vitest'
import type { Box } from '../geometry'
import { resolveMotion } from '../motion'
import {
    type IdHistory,
    leadChanges,
    type PlanInput,
    type PlanNode,
    plan,
} from '../plan'
import { drawnBoxes, drawnVelocities } from '../solve'
import { trackOf as createTrack, rootNode } from './nodes'

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
        velocity: null,
        moving: false,
        track: null,
        trackTarget: null,
        planned: null,
        parentPlanned: null,
        presented: null,
        parentPresented: null,
        path: null,
        mode: true,
        anchor: null,
        motion,
        layoutId: null,
        crossfade: true,
        exiting: false,
        presenceOpacity: false,
        focusInside: false,
        unsupported: false,
        skip: false,
        optionsChanged: false,
        following: -1,
        measured: true,
        lateRegistered: false,
        scrollActive: false,
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
        expect(action.track.seed).toEqual([0, 0, 0, 0])
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
            presented: a,
            path: 'unchanged',
            ...overrides,
        })

    it('keeps a running track whose target did not move (an unrelated re-render restarts nothing)', () => {
        const shifted = { ...a, x: 100.5 }
        const result = plan(
            input([
                moving({ a: shifted, presented: shifted, path: 'translate' }),
            ])
        )
        expect(result.actions[0]!.kind).toBe('keep')
    })

    it('keeps a track whose A moved with its presented layout box, however far (a presented scroll, §5.7)', () => {
        const scrolled = { ...a, y: a.y - 240 }
        const result = plan(
            input([
                moving({ a: scrolled, presented: scrolled, path: 'translate' }),
            ])
        )
        expect(result.actions[0]!.kind).toBe('keep')
    })

    it('retargets from B when the commit moved A away from its presented layout box (D3)', () => {
        const result = plan(
            input([
                moving({ presented: { ...a, x: a.x - 5 }, path: 'unchanged' }),
            ])
        )
        expect(result.actions[0]!.kind).toBe('track')
    })

    it('retargets when its size target changed, even with A on its presented layout box', () => {
        const resized = { ...a, w: 120 }
        const result = plan(input([moving({ a: resized, presented: resized })]))
        expect(result.actions[0]!.kind).toBe('track')
    })

    it('retargets when its translation cannot be proven exact (§5.7 path 3)', () => {
        const scrolled = { ...a, y: a.y - 20 }
        const result = plan(
            input([
                moving({ a: scrolled, presented: scrolled, path: 'retarget' }),
            ])
        )
        expect(result.actions[0]!.kind).toBe('track')
    })

    it('retargets when the capture gives no presented layout box', () => {
        const result = plan(input([moving({ presented: null })]))
        expect(result.actions[0]!.kind).toBe('track')
    })

    it('keeps a running track with no measured B: there is nothing to retarget from', () => {
        const result = plan(
            input([
                moving({
                    a: { ...a, x: 400 },
                    before: null,
                    presented: null,
                    path: 'retarget',
                }),
            ])
        )
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
            ['card', { lead: 0, retained: null, retainedVelocity: null }],
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
        expect(lead.handoffFrom).toBe(0)
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

    it('§8 focus inside the exiting follower skips the pair’s handoff and crossfade, reported as a degradation', () => {
        const ids = new Map<string, IdHistory>([
            ['card', { lead: 0, retained: null, retainedVelocity: null }],
        ])
        const result = plan(
            input(
                [
                    node({
                        layoutId: 'card',
                        exiting: true,
                        focusInside: true,
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
        // neither the lead nor the follower animates: the lead appears at A
        // and presence alone draws the exit
        expect(result.actions.map((action) => action.kind)).toEqual([
            'none',
            'none',
        ])
        expect(result.degraded).toEqual([
            { index: 0, reason: 'focus-in-follower' },
        ])
        expect(result.snapped).toEqual([])
        expect(result.leads.get('card')).toBe(1)
    })

    it('§8 focus inside the lead leaves the crossfade on', () => {
        const ids = new Map<string, IdHistory>([
            ['card', { lead: 0, retained: null, retainedVelocity: null }],
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
                        focusInside: true,
                        a: detailBox,
                        before: null,
                        order: 2,
                    }),
                ],
                { ids }
            )
        )
        expect(result.actions[0]!.kind).toBe('follow')
        const lead = result.actions[1]!
        if (lead.kind !== 'track') throw new Error('expected a track')
        expect(lead.fadeLead).toBe(true)
        expect(result.degraded).toEqual([])
    })

    it('hands off from a retained box when the departing node is gone; no crossfade', () => {
        const ids = new Map<string, IdHistory>([
            ['card', { lead: null, retained: cardBox, retainedVelocity: null }],
        ])
        const result = plan(
            input([node({ layoutId: 'card', a: detailBox, before: null })], {
                ids,
            })
        )
        const lead = result.actions[0]!
        if (lead.kind !== 'track') throw new Error('expected a track')
        expect(lead.fadeLead).toBe(false)
        expect(lead.handoffFrom).toBe(-1)
    })

    for (const [name, patch] of [
        ['the follower is not exiting', { exiting: false }],
        ['the lead opts out', 'lead-off'],
        ['the follower opts out', { crossfade: false }],
        ['the box did not move', 'same-box'],
    ] as const) {
        it(`no crossfade when ${name}`, () => {
            const ids = new Map<string, IdHistory>([
                ['card', { lead: 0, retained: null, retainedVelocity: null }],
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
            ['card', { lead: 0, retained: null, retainedVelocity: null }],
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
            ['card', { lead: 1, retained: null, retainedVelocity: null }],
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

    it('a pair that reverses mid-crossfade keeps fading below the threshold (no opacity pop)', () => {
        // the follower becomes the lead again while the old lead exits, its
        // box within the threshold of where the pair is drawn
        const ids = new Map<string, IdHistory>([
            ['card', { lead: 0, retained: null, retainedVelocity: null }],
        ])
        const near = { ...cardBox, x: cardBox.x + 0.4 }
        const nodes = (following: number) => [
            node({
                layoutId: 'card',
                exiting: true,
                a: cardBox,
                before: cardBox,
                order: 1,
            }),
            node({
                layoutId: 'card',
                a: near,
                before: cardBox,
                following,
                order: 2,
            }),
        ]
        const reversed = plan(input(nodes(0), { ids }))
        expect(reversed.leads.get('card')).toBe(1)
        expect(reversed.actions[0]).toEqual({
            kind: 'follow',
            lead: 1,
            start: true,
        })
        const lead = reversed.actions[1]!
        if (lead.kind !== 'track') throw new Error('expected a track')
        expect(lead.fadeLead).toBe(true)
        expect(lead.handoffFrom).toBe(0)
        // control: a node that was not the follower gets no crossfade there
        const fresh = plan(input(nodes(-1), { ids }))
        expect(fresh.actions[1]!.kind).not.toBe('track')
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
            seedX: 0,
            seedY: 0,
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

    it('without a valid measurement nothing starts and every running track is kept (§4.4)', () => {
        const target = { x: 100, y: 100, w: 100, h: 50 }
        const track = createTrack(
            { x: 0, y: 0, w: 100, h: 50 },
            target,
            null,
            0.5,
            0.5,
            true,
            motion,
            null
        )
        const ids = new Map<string, IdHistory>([
            [
                'x',
                {
                    lead: null,
                    retained: { x: 600, y: 0, w: 40, h: 40 },
                    retainedVelocity: null,
                },
            ],
        ])
        const result = plan(
            input(
                [
                    // undriven, moved: no B, so it appears at A
                    node({
                        before: null,
                        a: { x: 300, y: 0, w: 100, h: 50 },
                        measured: false,
                    }),
                    // a running track whose A moved: kept whatever moved
                    node({
                        before: null,
                        a: { x: 500, y: 500, w: 140, h: 50 },
                        moving: true,
                        track,
                        trackTarget: target,
                        path: 'retarget',
                        optionsChanged: true,
                        measured: false,
                    }),
                    // a new lead does not take over the retained box
                    node({ before: null, layoutId: 'x', measured: false }),
                    // an unsupported running track still snaps
                    node({
                        before: null,
                        moving: true,
                        track,
                        trackTarget: target,
                        unsupported: true,
                        measured: false,
                    }),
                ],
                { ids }
            )
        )
        expect(result.status).toBe('run')
        expect(result.actions.map((a) => a.kind)).toEqual([
            'none',
            'keep',
            'none',
            'none',
        ])
        expect(result.leads.get('x')).toBe(2)
        expect(result.snapped).toEqual([{ index: 3, reason: 'unsupported' }])
    })
})

describe('plan: CP3 trial regressions', () => {
    const linear = resolveMotion([{ duration: 1, timing: timing.linear() }])
    const box = (x: number, w = 20): Box => ({ x, y: 0, w, h: 20 })

    it('J-010: an anchor without a participant parent is ignored; the node moves by its mode', () => {
        const result = plan(
            input([
                node({
                    a: box(100),
                    before: box(0),
                    anchor: { x: 0, y: 0 },
                    motion: linear,
                }),
            ])
        )
        const action = result.actions[0]!
        if (action.kind !== 'track') throw new Error('expected a track')
        expect(action.track.anchor).toBeNull()
        const at = drawnBoxes([
            rootNode(box(100), { track: action.track, elapsed: 0.5 }),
        ])[0]!
        expect(at.x).toBeCloseTo(50, 12)
    })

    it('J-010: an anchored child whose offset changes under a stationary parent animates', () => {
        const parent = { x: 0, y: 0, w: 400, h: 100 }
        const result = plan(
            input([
                node({ a: parent, before: parent }),
                node({
                    parent: 0,
                    a: box(100),
                    before: box(0),
                    anchor: { x: 0, y: 0 },
                    motion: linear,
                }),
            ])
        )
        expect(result.actions.map((a) => a.kind)).toEqual(['none', 'track'])
    })

    it('J-010: a running anchored track whose offset target moved is retargeted, an unchanged one kept', () => {
        const parent = { x: 0, y: 0, w: 400, h: 100 }
        const first = plan(
            input([
                node({ a: parent, before: parent }),
                node({
                    parent: 0,
                    a: box(100),
                    before: box(0),
                    anchor: { x: 0, y: 0 },
                    motion: linear,
                }),
            ])
        ).actions[1]!
        if (first.kind !== 'track') throw new Error('expected a track')
        const running = (a: Box) =>
            node({
                parent: 0,
                a,
                before: box(50),
                anchor: { x: 0, y: 0 },
                motion: linear,
                moving: true,
                track: first.track,
                trackTarget: box(100),
                velocity: { x: 100, y: 0, w: 0, h: 0 },
                presented: box(100),
                parentPresented: parent,
                path: 'unchanged',
            })
        const parentNode = node({ a: parent, before: parent })
        expect(
            plan(input([parentNode, running(box(100))])).actions[1]!.kind
        ).toBe('keep')
        expect(
            plan(input([parentNode, running(box(200))])).actions[1]!.kind
        ).toBe('track')
    })

    it('J-011: an anchored retarget keeps the incoming visual velocity', () => {
        const parent = { x: 0, y: 0, w: 400, h: 100 }
        const parentNode = node({ a: parent, before: parent })
        const result = plan(
            input([
                parentNode,
                node({
                    parent: 0,
                    a: box(200, 40),
                    before: box(50),
                    anchor: { x: 0, y: 0 },
                    motion: linear,
                    moving: true,
                    velocity: { x: 100, y: 0, w: 0, h: 0 },
                }),
            ])
        )
        const action = result.actions[1]!
        if (action.kind !== 'track') throw new Error('expected a track')
        const nodes = [
            rootNode(parent),
            { ...rootNode(box(200, 40), { track: action.track }), parent: 0 },
        ]
        expect(drawnBoxes(nodes)[1]!.x).toBeCloseTo(50, 12)
        expect(drawnVelocities(nodes)[1]!.x).toBeCloseTo(100, 9)
        const h = 1e-7
        const later = nodes.map((n) => ({ ...n, elapsed: h }))
        expect((drawnBoxes(later)[1]!.x - 50) / h).toBeCloseTo(100, 3)
    })

    it('J-012: a registered node that becomes the lead takes over the departing lead (handoff + crossfade)', () => {
        const ids = new Map<string, IdHistory>([
            ['x', { lead: 1, retained: null, retainedVelocity: null }],
        ])
        const result = plan(
            input(
                [
                    node({
                        layoutId: 'x',
                        order: 1,
                        a: box(10, 80),
                        before: box(10, 80),
                    }),
                    node({
                        layoutId: 'x',
                        order: 2,
                        a: box(200, 300),
                        before: box(200, 300),
                        exiting: true,
                    }),
                ],
                { ids }
            )
        )
        expect(result.leads.get('x')).toBe(0)
        const action = result.actions[0]!
        if (action.kind !== 'track') throw new Error('expected a track')
        expect(action.fadeLead).toBe(true)
        expect(result.actions[1]).toEqual({
            kind: 'follow',
            lead: 0,
            start: true,
        })
        const at = drawnBoxes([
            rootNode(box(10, 80), { fx: 0.5, fy: 0.5, track: action.track }),
        ])[0]!
        expect(at.x).toBeCloseTo(200, 12)
        expect(at.w).toBeCloseTo(300, 12)
    })

    it('J-020: a lead that left while moving hands off its box and its velocity', () => {
        const linear = resolveMotion([
            { duration: 1, delay: 0, timing: timing.linear() },
        ])
        const ids = new Map<string, IdHistory>([
            [
                'x',
                {
                    lead: null,
                    retained: box(40, 40),
                    retainedVelocity: { x: 200, y: 0, w: 0, h: 0 },
                },
            ],
        ])
        const result = plan(
            input(
                [
                    node({
                        layoutId: 'x',
                        a: box(400, 40),
                        before: null,
                        motion: linear,
                    }),
                ],
                { ids }
            )
        )
        const action = result.actions[0]!
        if (action.kind !== 'track') throw new Error('expected a track')
        const at = (elapsed: number) =>
            drawnBoxes([
                rootNode(box(400, 40), {
                    fx: 0.5,
                    fy: 0.5,
                    track: action.track,
                    elapsed,
                }),
            ])[0]!.x
        expect(at(0)).toBeCloseTo(40, 12)
        // c(τ) = A + (B − A)(1 − τ) + kτ(1 − τ)², k = vD + (B − A)
        expect(at(0.02)).toBeCloseTo(44.12672, 9)
        for (const h of [1e-5, 1e-6, 1e-7]) {
            expect((at(h) - 40) / h).toBeCloseTo(200, 2)
        }
    })

    it('J-030: the retained size velocity is handed off too (position and size momentum)', () => {
        const linear = resolveMotion([
            { duration: 1, delay: 0, timing: timing.linear() },
        ])
        const a: Box = { x: 400, y: 0, w: 40, h: 40 }
        const ids = new Map<string, IdHistory>([
            [
                'x',
                {
                    lead: null,
                    retained: { x: 138.4, y: 0, w: 51.52, h: 40 },
                    retainedVelocity: { x: 200, y: 0, w: 60, h: 0 },
                },
            ],
        ])
        const result = plan(
            input([node({ layoutId: 'x', a, before: null, motion: linear })], {
                ids,
            })
        )
        const action = result.actions[0]!
        if (action.kind !== 'track') throw new Error('expected a track')
        const at = (elapsed: number) =>
            drawnBoxes([
                rootNode(a, {
                    fx: 0.5,
                    fy: 0.5,
                    track: action.track,
                    elapsed,
                }),
            ])[0]!
        expect(at(0)).toEqual({ x: 138.4, y: 0, w: 51.52, h: 40 })
        // w: A + (B − A)(1 − τ) + kτ(1 − τ)², k = vD + (B − A) = 60 + 11.52
        expect(at(0.02).w).toBeCloseTo(
            40 + 11.52 * 0.98 + 71.52 * 0.02 * 0.98 ** 2,
            9
        )
        for (const h of [1e-5, 1e-6, 1e-7]) {
            expect((at(h).w - 51.52) / h).toBeCloseTo(60, 2)
            expect((at(h).x - 138.4) / h).toBeCloseTo(200, 2)
        }
    })

    it('J-013: an offscreen child under a visible mover is culled before the cap and stays counter-projected', () => {
        const result = plan(
            input(
                [
                    node({ a: box(100), before: box(0) }),
                    node({ parent: 0, a: box(2000), before: box(2100) }),
                ],
                { maxNodes: 1 }
            )
        )
        expect(result.status).toBe('run')
        expect(result.actions.map((a) => a.kind)).toEqual(['track', 'static'])
        expect(result.snapped).toEqual([{ index: 1, reason: 'culled' }])
    })
})

describe('plan: spring refusals (§5.3, §9.4)', () => {
    it('a spring settling later than 10 s snaps unsupported, with a warning', () => {
        const result = plan(
            input([
                node({
                    before: { x: 900, y: 100, w: 100, h: 50 },
                    motion: resolveMotion([
                        { type: 'spring', duration: 4, bounce: 0.99 },
                    ]),
                }),
            ])
        )
        expect(result.actions[0]!.kind).toBe('none')
        expect(result.snapped).toEqual([{ index: 0, reason: 'unsupported' }])
        expect(result.warnings).toEqual([
            {
                kind: 'spring-timeout',
                index: 0,
                settleMs: expect.any(Number),
            },
        ])
    })

    it('reduced motion with no fitting factor jumps (reduced)', () => {
        const spring = resolveMotion([{ type: 'spring', duration: 1 }])
        const result = plan(
            input([
                node({
                    before: { x: 900, y: 100, w: 100, h: 50 },
                    motion: { ...spring, maxDuration: 0.01 } as typeof spring,
                }),
            ])
        )
        expect(result.actions[0]!.kind).toBe('none')
        expect(result.snapped).toEqual([{ index: 0, reason: 'reduced' }])
    })

    it('a moving node retargets on a spring with its velocity and no delay', () => {
        const spring = resolveMotion([
            { type: 'spring', duration: 0.5, bounce: 0.2, delay: 0.3 },
        ])
        const result = plan(
            input([
                node({
                    before: { x: 500, y: 100, w: 100, h: 50 },
                    velocity: { x: 900, y: 0, w: 0, h: 0 },
                    moving: true,
                    motion: spring,
                }),
            ])
        )
        const action = result.actions[0]!
        if (action.kind !== 'track') throw new Error('expected a track')
        expect(action.track.delay).toBe(0)
        expect(action.track.law.kind).toBe('spring')
        expect(action.track.seed).toEqual([900, 0, 0, 0])
    })
})

describe('plan: out of an actively scrolling container (§5.8)', () => {
    const cardBox = { x: 10, y: 10, w: 80, h: 80 }
    const detailBox = { x: 200, y: 50, w: 400, h: 300 }
    const degraded = [{ index: 1, reason: 'handoff-scroll-active' }]

    it('a lead taking over from a live exiting node does not fly and does not crossfade', () => {
        const ids = new Map<string, IdHistory>([
            ['card', { lead: 0, retained: null, retainedVelocity: null }],
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
                        scrollActive: true,
                    }),
                ],
                { ids }
            )
        )
        expect(result.leads.get('card')).toBe(1)
        expect(result.actions.map((a) => a.kind)).toEqual(['none', 'none'])
        expect(result.snapped).toEqual([])
        expect(result.degraded).toEqual(degraded)
    })

    it('a lead taking over a retained box does not fly', () => {
        const ids = new Map<string, IdHistory>([
            ['card', { lead: null, retained: cardBox, retainedVelocity: null }],
        ])
        const result = plan(
            input(
                [
                    node(),
                    node({
                        layoutId: 'card',
                        a: detailBox,
                        before: null,
                        scrollActive: true,
                    }),
                ],
                { ids }
            )
        )
        expect(result.actions.map((a) => a.kind)).toEqual(['none', 'none'])
        expect(result.degraded).toEqual(degraded)
    })

    it('an already registered lead appears at A instead of moving from its own B', () => {
        const ids = new Map<string, IdHistory>([
            ['card', { lead: null, retained: cardBox, retainedVelocity: null }],
        ])
        const result = plan(
            input(
                [
                    node(),
                    node({
                        layoutId: 'card',
                        a: detailBox,
                        before: { x: 300, y: 50, w: 400, h: 300 },
                        scrollActive: true,
                    }),
                ],
                { ids }
            )
        )
        expect(result.actions[1]).toEqual({ kind: 'none' })
        expect(result.degraded).toEqual(degraded)
    })

    it('a reparented node ends its running track; under a moving parent it is counter-projected', () => {
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
        const result = plan(
            input([
                node({ before: { x: 0, y: 0, w: 100, h: 50 } }),
                node({
                    moving: true,
                    track: running,
                    trackTarget: a,
                    path: 'retarget',
                    before: { x: 40, y: 40, w: 100, h: 50 },
                    scrollActive: true,
                }),
                node({
                    parent: 0,
                    before: { x: 10, y: 0, w: 10, h: 10 },
                    a: { x: 30, y: 0, w: 10, h: 10 },
                    scrollActive: true,
                }),
            ])
        )
        expect(result.actions.map((a) => a.kind)).toEqual([
            'track',
            'none',
            'static',
        ])
        expect(result.snapped).toEqual([])
        expect(result.degraded).toEqual([
            { index: 1, reason: 'handoff-scroll-active' },
            { index: 2, reason: 'handoff-scroll-active' },
        ])
    })
})

describe('leadChanges (§5.8)', () => {
    it('names the node each new lead takes over from', () => {
        const box = { x: 0, y: 0, w: 10, h: 10 }
        const nodes = [
            { layoutId: 'a', exiting: true, order: 1 },
            { layoutId: 'a', exiting: false, order: 2 },
            { layoutId: 'b', exiting: false, order: 3 },
            { layoutId: 'c', exiting: false, order: 4 },
            { layoutId: 'd', exiting: false, order: 5 },
            { layoutId: 'd', exiting: false, order: 6 },
            { layoutId: null, exiting: false, order: 7 },
        ]
        const ids = new Map<string, IdHistory>([
            ['a', { lead: 0, retained: null, retainedVelocity: null }],
            ['b', { lead: null, retained: box, retainedVelocity: null }],
            ['c', { lead: null, retained: null, retainedVelocity: null }],
            ['d', { lead: 4, retained: null, retainedVelocity: null }],
        ])
        expect(leadChanges(nodes, ids)).toEqual([
            { id: 'a', index: 1, from: 0, duplicate: false },
            { id: 'b', index: 2, from: 'retained', duplicate: false },
            { id: 'c', index: 3, from: null, duplicate: false },
            // the previous lead is live and not exiting: a duplicate id
            { id: 'd', index: 5, from: null, duplicate: true },
        ])
    })
})
