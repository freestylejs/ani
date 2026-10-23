import { type TimingFunction, timing } from '@freestylejs/ani-core'
import { describe, expect, it } from 'vitest'
import { aboutOrigin } from '../geometry'
import { resolveMotion } from '../motion'
import {
    type AnchorRule,
    createTrack,
    drawnBoxes,
    drawnVelocities,
    type SolveNode,
    solve,
    trackEnded,
} from '../solve'
import { rootNode } from './nodes'
import {
    applyPose,
    easing,
    easingSlope0,
    expectedBox,
    maxDiff,
    NO_POSE,
    type OBox,
    type ONode,
    type OTrackSpec,
    rendered,
    rng,
} from './oracle'

const TOL = 1e-9

function timings(random: () => number): TimingFunction {
    const pick = Math.floor(random() * 4)
    if (pick === 0) return timing.linear()
    if (pick === 1) return timing.easeInOut()
    if (pick === 2) {
        return timing.bezier({
            p2: { x: random(), y: random() * 2 - 0.5 },
            p3: { x: random(), y: random() * 2 - 0.5 },
        })
    }
    return timing.spring({
        m: 1,
        k: 100 + random() * 300,
        c: 8 + random() * 30,
    })
}

function randomBox(random: () => number): OBox {
    return {
        x: random() * 1200 - 200,
        y: random() * 900 - 100,
        w: 10 + random() * 400,
        h: 10 + random() * 300,
    }
}

/** An own transform: identity half the time, else translate + scale. */
function randomInner(random: () => number) {
    if (random() < 0.5) return NO_POSE
    return {
        tx: random() * 100 - 50,
        ty: random() * 100 - 50,
        sx: 0.5 + random(),
        sy: 0.5 + random(),
    }
}

/** The browser's view of a node without an own transform. */
function plain(node: SolveNode): ONode {
    return {
        parent: node.parent,
        css: node.box,
        ox: node.ox,
        oy: node.oy,
        inner: NO_POSE,
    }
}

interface Built {
    nodes: SolveNode[]
    dom: ONode[]
    specs: OTrackSpec[]
    anchors: ({ u: number; v: number } | null)[]
}

/**
 * A random tree (depth ≤ 5) where every node has a CSS box, an origin and an
 * own transform in its parent's frame, a track between visual boxes and a
 * random elapsed time.
 */
function randomTree(seed: number): Built {
    const random = rng(seed)
    const count = 1 + Math.floor(random() * 24)
    const nodes: SolveNode[] = []
    const dom: ONode[] = []
    const specs: OTrackSpec[] = []
    const anchors: ({ u: number; v: number } | null)[] = []
    const depth: number[] = []
    for (let i = 0; i < count; i++) {
        let parent = -1
        if (i > 0 && random() < 0.8) {
            parent = Math.floor(random() * i)
            if (depth[parent]! >= 4) parent = -1
        }
        depth.push(parent < 0 ? 0 : depth[parent]! + 1)
        const css = randomBox(random)
        const fx = random()
        const fy = random()
        const ox = css.x + fx * css.w
        const oy = css.y + fy * css.h
        const inner = randomInner(random)
        dom.push({ parent, css, ox, oy, inner })
        // the visual box at rest: every pose identity
        const a = rendered(
            i,
            dom,
            dom.map(() => NO_POSE)
        )
        const before = randomBox(random)
        const anchored = parent >= 0 && random() < 0.25
        const modes = [true, 'position', 'size'] as const
        // an anchor replaces the origin channels; its size animates
        const mode = anchored ? true : modes[Math.floor(random() * 3)]!
        const velocity =
            random() < 0.3
                ? null
                : {
                      x: random() * 4000 - 2000,
                      y: random() * 4000 - 2000,
                      w: random() * 400 - 200,
                      h: random() * 400 - 200,
                  }
        const fn = timings(random)
        const duration = 0.05 + random() * 1.2
        const delay = random() < 0.3 ? random() * 0.4 : 0
        const motion = resolveMotion([{ duration, delay, timing: fn }])
        let rule: AnchorRule | null = null
        if (anchored) {
            const u = random()
            const v = random()
            const parentBefore = specs[parent]!.before
            const parentAfter = nodes[parent]!.a
            const fromX =
                before.x + u * before.w - (parentBefore.x + u * parentBefore.w)
            const fromY =
                before.y + v * before.h - (parentBefore.y + v * parentBefore.h)
            const toX = a.x + u * a.w - (parentAfter.x + u * parentAfter.w)
            const toY = a.y + v * a.h - (parentAfter.y + v * parentAfter.h)
            // a moving node carries its velocity relative to the parent's anchor point
            const pv = specs[parent]!.velocity ?? { x: 0, y: 0, w: 0, h: 0 }
            const s0 = easingSlope0(fn)
            const kx = velocity
                ? (velocity.x + u * velocity.w - (pv.x + u * pv.w)) * duration +
                  (fromX - toX) * s0
                : 0
            const ky = velocity
                ? (velocity.y + v * velocity.h - (pv.y + v * pv.h)) * duration +
                  (fromY - toY) * s0
                : 0
            rule = {
                u,
                v,
                kx,
                ky,
                fromX,
                fromY,
                toX,
                toY,
            }
        }
        const track = createTrack(
            before,
            a,
            velocity,
            fx,
            fy,
            mode,
            motion,
            rule
        )
        nodes.push({
            parent,
            a,
            box: applyPose(inner, ox, oy, css),
            ox,
            oy,
            inner: aboutOrigin(inner, ox, oy),
            track,
            elapsed: random() * (delay + duration) * 1.3,
            follow: -1,
            fade: null,
            radius: null,
        })
        specs.push({
            before,
            after: a,
            velocity,
            fx,
            fy,
            mode: anchored ? 'size' : mode,
            duration,
            delay,
            timing: fn,
        })
        anchors.push(rule ? { u: rule.u, v: rule.v } : null)
    }
    return { nodes, dom, specs, anchors }
}

/** Oracle drawn box of every node, including the anchor rule. */
function oracleDrawn(built: Built): OBox[] {
    const out: OBox[] = []
    built.nodes.forEach((node, i) => {
        const spec = built.specs[i]!
        const own = expectedBox(spec, node.elapsed)
        const anchor = built.anchors[i]
        if (!anchor) {
            out.push(own)
            return
        }
        const parent = out[node.parent]!
        const rule = node.track!.anchor!
        const t = node.elapsed - spec.delay
        const tau = t <= 0 ? 0 : Math.min(1, t / spec.duration)
        const rest = 1 - easing(spec.timing, tau)
        const bump = tau > 0 && tau < 1 ? tau * (1 - tau) ** 2 : 0
        out.push({
            x:
                parent.x +
                anchor.u * parent.w -
                anchor.u * own.w +
                rule.toX +
                (rule.fromX - rule.toX) * rest +
                rule.kx * bump,
            y:
                parent.y +
                anchor.v * parent.h -
                anchor.v * own.h +
                rule.toY +
                (rule.fromY - rule.toY) * rest +
                rule.ky * bump,
            w: own.w,
            h: own.h,
        })
    })
    return out
}

function relative(got: OBox, want: OBox): number {
    const scale = Math.max(
        1,
        Math.abs(want.x),
        Math.abs(want.y),
        Math.abs(want.w),
        Math.abs(want.h)
    )
    return maxDiff(got, want) / scale
}

describe('solve: exact projection (random trees with own transforms, depth ≤ 5)', () => {
    it('the rendered box of every node equals its oracle track within 1e-9', () => {
        let checked = 0
        for (let seed = 1; seed <= 400; seed++) {
            const built = randomTree(seed)
            const solved = solve(built.nodes)
            const expected = oracleDrawn(built)
            built.nodes.forEach((_, i) => {
                const got = rendered(
                    i,
                    built.dom,
                    solved.map((s) => s.pose)
                )
                expect(
                    relative(got, expected[i]!),
                    `seed ${seed} node ${i}`
                ).toBeLessThan(TOL)
                checked += 1
            })
        }
        expect(checked).toBeGreaterThan(1000)
    })

    it('every pose is identity once every track has ended (exact settle)', () => {
        for (let seed = 1; seed <= 100; seed++) {
            const built = randomTree(seed)
            const ended = built.nodes.map((n) => ({ ...n, elapsed: 1e3 }))
            for (const s of solve(ended)) {
                expect(Math.abs(s.pose.tx)).toBeLessThan(1e-6)
                expect(Math.abs(s.pose.ty)).toBeLessThan(1e-6)
                expect(s.pose.sx).toBeCloseTo(1, 12)
                expect(s.pose.sy).toBeCloseTo(1, 12)
            }
        }
    })

    it('a delayed child holds its visual B under a scaled, moving parent (CP2 trial J-001 counterexample)', () => {
        const linear = resolveMotion([{ duration: 1, timing: timing.linear() }])
        const delayed = resolveMotion([
            { duration: 1, delay: 1, timing: timing.linear() },
        ])
        // the trial's DOM: parent left 0 → 100, width 200, scaleX(.8) about
        // its top-left; child left 50, width 100
        const scale = { tx: 0, ty: 0, sx: 0.8, sy: 1 }
        const dom: ONode[] = [
            {
                parent: -1,
                css: { x: 100, y: 0, w: 200, h: 100 },
                ox: 100,
                oy: 0,
                inner: scale,
            },
            {
                parent: 0,
                css: { x: 150, y: 10, w: 100, h: 40 },
                ox: 150,
                oy: 10,
                inner: NO_POSE,
            },
        ]
        const parentA = { x: 100, y: 0, w: 160, h: 100 }
        const childA = { x: 140, y: 10, w: 80, h: 40 }
        expect(maxDiff(rendered(1, dom, [NO_POSE, NO_POSE]), childA)).toBe(0)
        const build = (elapsed: number): SolveNode[] => [
            {
                parent: -1,
                a: parentA,
                box: parentA,
                ox: 100,
                oy: 0,
                inner: aboutOrigin(scale, 100, 0),
                track: createTrack(
                    { x: 0, y: 0, w: 160, h: 100 },
                    parentA,
                    null,
                    0,
                    0,
                    true,
                    linear,
                    null
                ),
                elapsed,
                follow: -1,
                fade: null,
                radius: null,
            },
            {
                parent: 0,
                a: childA,
                box: dom[1]!.css,
                ox: 150,
                oy: 10,
                inner: aboutOrigin(NO_POSE, 150, 10),
                track: createTrack(
                    { x: 40, y: 10, w: 80, h: 40 },
                    childA,
                    null,
                    0,
                    0,
                    true,
                    delayed,
                    null
                ),
                elapsed,
                follow: -1,
                fade: null,
                radius: null,
            },
        ]
        const half = solve(build(0.5))
        const poses = half.map((s) => s.pose)
        expect(rendered(0, dom, poses).x).toBeCloseTo(50, 12)
        expect(rendered(1, dom, poses).x).toBeCloseTo(40, 12)
        expect(half[1]!.pose.tx).toBeCloseTo(-62.5, 12)
        expect(half[1]!.pose.sx).toBeCloseTo(1, 12)
        for (const s of solve(build(2))) {
            expect(Math.abs(s.pose.tx)).toBeLessThan(1e-12)
            expect(s.pose.sx).toBeCloseTo(1, 12)
        }
    })

    it('a node without a track under a moving parent stays at its visual box', () => {
        const fn = timing.linear()
        const motion = resolveMotion([{ duration: 1, timing: fn }])
        const parentA = { x: 100, y: 100, w: 300, h: 200 }
        const parent = rootNode(parentA, {
            fx: 0.5,
            fy: 0.5,
            track: createTrack(
                { x: 0, y: 0, w: 150, h: 100 },
                parentA,
                null,
                0.5,
                0.5,
                true,
                motion,
                null
            ),
            elapsed: 0.37,
        })
        const childA = { x: 120, y: 130, w: 40, h: 20 }
        const child = rootNode(childA, { fx: 0.5, fy: 0.5, parent: 0 })
        const solved = solve([parent, child])
        const got = rendered(
            1,
            [plain(parent), plain(child)],
            solved.map((s) => s.pose)
        )
        expect(maxDiff(got, childA)).toBeLessThan(TOL)
        // counter-scale: the child's own scale undoes the parent's
        expect(solved[1]!.pose.sx * solved[0]!.pose.sx).toBeCloseTo(1, 12)
    })
})

describe('solve: track endpoints and velocity', () => {
    const fns: [string, TimingFunction][] = [
        ['linear', timing.linear()],
        ['easeOut', timing.easeOut()],
        ['spring', timing.spring({ m: 1, k: 180, c: 12 })],
    ]
    for (const [name, fn] of fns) {
        it(`${name}: c(0) = B, c(1) = A, c′(0) = v`, () => {
            const b = { x: 10, y: 20, w: 100, h: 50 }
            const a = { x: 300, y: -40, w: 160, h: 90 }
            const v = { x: 900, y: -300, w: 120, h: 40 }
            const motion = resolveMotion([{ duration: 0.4, timing: fn }])
            const track = createTrack(b, a, v, 0, 0, true, motion, null)
            const node = (elapsed: number) => rootNode(a, { track, elapsed })
            expect(maxDiff(drawnBoxes([node(0)])[0]!, b)).toBeLessThan(TOL)
            expect(maxDiff(drawnBoxes([node(0.4)])[0]!, a)).toBeLessThan(TOL)
            expect(trackEnded(track, 0.4)).toBe(true)
            expect(trackEnded(track, 0.39)).toBe(false)
            const h = 1e-7
            const d0 = drawnBoxes([node(0)])[0]!
            const d1 = drawnBoxes([node(h)])[0]!
            const fd = {
                x: (d1.x - d0.x) / h,
                y: (d1.y - d0.y) / h,
                w: (d1.w - d0.w) / h,
                h: (d1.h - d0.h) / h,
            }
            expect(maxDiff(fd, v)).toBeLessThan(0.5)
            expect(maxDiff(drawnVelocities([node(0)])[0]!, v)).toBeLessThan(
                1e-3
            )
        })
    }

    it('carries a fast retarget over a tiny distance in full (CP1 trial J-004 counterexample)', () => {
        const fn = timing.linear()
        const motion = resolveMotion([{ duration: 0.35, timing: fn }])
        const b = { x: 375, y: 0, w: 20, h: 20 }
        const a = { x: 376, y: 0, w: 20, h: 20 }
        const v = { x: 3571.428571, y: 0, w: 0, h: 0 }
        const track = createTrack(b, a, v, 0.5, 0.5, true, motion, null)
        const node = rootNode(a, { fx: 0.5, fy: 0.5, track })
        expect(drawnVelocities([node])[0]!.x).toBeCloseTo(3571.428571, 3)
    })

    it('analytic velocities match finite differences on random trees', () => {
        for (let seed = 500; seed < 600; seed++) {
            const built = randomTree(seed)
            const h = 1e-6
            const shift = (dt: number) =>
                built.nodes.map((n) => ({ ...n, elapsed: n.elapsed + dt }))
            const lo = drawnBoxes(shift(-h))
            const hi = drawnBoxes(shift(h))
            const analytic = drawnVelocities(built.nodes)
            built.nodes.forEach((node, i) => {
                const t = node.track!
                const tau = (node.elapsed - t.delay) / t.duration
                // skip the instants where a piecewise channel has a corner
                if (Math.abs(tau) < 1e-3 || Math.abs(tau - 1) < 1e-3) return
                const fd = {
                    x: (hi[i]!.x - lo[i]!.x) / (2 * h),
                    y: (hi[i]!.y - lo[i]!.y) / (2 * h),
                    w: (hi[i]!.w - lo[i]!.w) / (2 * h),
                    h: (hi[i]!.h - lo[i]!.h) / (2 * h),
                }
                expect(
                    relative(fd, analytic[i]!),
                    `seed ${seed} node ${i}`
                ).toBeLessThan(1e-3)
            })
        }
    })

    it('floors a shrinking size at one pixel', () => {
        const motion = resolveMotion([
            { duration: 0.5, timing: timing.linear() },
        ])
        const b = { x: 0, y: 0, w: 50, h: 50 }
        const a = { x: 0, y: 0, w: 10, h: 10 }
        const track = createTrack(
            b,
            a,
            { x: 0, y: 0, w: -5000, h: -5000 },
            0,
            0,
            true,
            motion,
            null
        )
        for (let e = 0; e <= 0.5; e += 0.01) {
            const box = drawnBoxes([rootNode(a, { track, elapsed: e })])[0]!
            expect(box.w).toBeGreaterThanOrEqual(1)
            expect(box.h).toBeGreaterThanOrEqual(1)
        }
    })

    it('holds B during the delay', () => {
        const motion = resolveMotion([
            { duration: 0.5, delay: 0.8, timing: timing.linear() },
        ])
        const b = { x: 0, y: 0, w: 70, h: 70 }
        const a = { x: 0, y: 0, w: 100, h: 100 }
        const track = createTrack(b, a, null, 0.5, 0.5, true, motion, null)
        const at = (elapsed: number) =>
            drawnBoxes([rootNode(a, { fx: 0.5, fy: 0.5, track, elapsed })])[0]!
        expect(at(0.79).w).toBe(70)
        expect(at(0.8).w).toBe(70)
        expect(at(0.81).w).toBeGreaterThan(70)
        expect(at(1.3).w).toBe(100)
    })
})

describe('solve: a node at rest follows the timing curve exactly', () => {
    it('k = 0: linear timing gives a linear path', () => {
        const motion = resolveMotion([{ duration: 1, timing: timing.linear() }])
        const b = { x: 0, y: 0, w: 100, h: 100 }
        const a = { x: 400, y: 0, w: 100, h: 100 }
        const track = createTrack(b, a, null, 0.5, 0.5, true, motion, null)
        for (const e of [0.1, 0.25, 0.5, 0.9]) {
            const box = drawnBoxes([
                rootNode(a, { fx: 0.5, fy: 0.5, track, elapsed: e }),
            ])[0]!
            expect(box.x).toBeCloseTo(400 * e, 10)
        }
    })
})

describe('solve: modes', () => {
    const motion = resolveMotion([{ duration: 1, timing: timing.linear() }])
    const b = { x: 0, y: 0, w: 100, h: 40 }
    const a = { x: 200, y: 100, w: 300, h: 80 }
    const at = (track: ReturnType<typeof createTrack>, elapsed: number) =>
        drawnBoxes([rootNode(a, { fx: 0.5, fy: 0.5, track, elapsed })])[0]!

    it("'position' pins the drawn size to A and moves the origin point", () => {
        const track = createTrack(
            b,
            a,
            null,
            0.5,
            0.5,
            'position',
            motion,
            null
        )
        for (const e of [0, 0.25, 0.5, 1]) {
            const box = at(track, e)
            expect(box.w).toBe(300)
            expect(box.h).toBe(80)
        }
        const first = at(track, 0)
        // origin point (50 %, 50 %) of B: (50, 20)
        expect(first.x + 0.5 * first.w).toBeCloseTo(50, 12)
        expect(first.y + 0.5 * first.h).toBeCloseTo(20, 12)
    })

    it("'size' pins the origin point to A and animates the size", () => {
        const track = createTrack(b, a, null, 0.5, 0.5, 'size', motion, null)
        for (const e of [0, 0.5, 1]) {
            const box = at(track, e)
            expect(box.x + 0.5 * box.w).toBeCloseTo(350, 12)
            expect(box.y + 0.5 * box.h).toBeCloseTo(140, 12)
            expect(box.w).toBeCloseTo(100 + 200 * e, 12)
        }
    })
})

describe('solve: crossfade and radius', () => {
    const motion = resolveMotion([{ duration: 1, timing: timing.linear() }])
    const a = { x: 0, y: 0, w: 200, h: 100 }
    const lead = rootNode(a, {
        track: createTrack(
            { x: 0, y: 0, w: 100, h: 50 },
            a,
            null,
            0,
            0,
            true,
            motion,
            null
        ),
        elapsed: 0.25,
        fade: {
            role: 'lead',
            from: 0,
            elapsed: 0.25,
            duration: 1,
            curve: motion.curve,
        },
        radius: [20, 20, 20, 20, 20, 20, 20, 20],
    })
    const follower = rootNode(
        { x: 500, y: 500, w: 50, h: 50 },
        {
            fx: 0.5,
            fy: 0.5,
            follow: 0,
            fade: {
                role: 'follower',
                from: 0,
                elapsed: 0.25,
                duration: 1,
                curve: motion.curve,
            },
        }
    )

    it('draws the follower at the lead box with opacities w and 1 − w', () => {
        const solved = solve([lead, follower])
        const dom = [plain(lead), plain(follower)]
        const poses = solved.map((s) => s.pose)
        expect(
            maxDiff(rendered(0, dom, poses), rendered(1, dom, poses))
        ).toBeLessThan(TOL)
        expect(solved[0]!.opacity! + solved[1]!.opacity!).toBeCloseTo(1, 12)
        expect(solved[0]!.opacity).toBeCloseTo(0.25, 12)
    })

    it('a reversed pair starts from the opacities it shows (no pop)', () => {
        const from = 0.7
        const at = (elapsed: number) =>
            solve([
                {
                    ...lead,
                    fade: { ...lead.fade!, from, elapsed },
                },
                {
                    ...follower,
                    fade: { ...follower.fade!, from, elapsed },
                },
            ])
        const start = at(0)
        expect(start[0]!.opacity).toBeCloseTo(0.7, 12)
        expect(start[1]!.opacity).toBeCloseTo(0.3, 12)
        const mid = at(0.5)
        expect(mid[0]!.opacity! + mid[1]!.opacity!).toBeCloseTo(1, 12)
        expect(mid[0]!.opacity).toBeCloseTo(
            0.7 + 0.3 * motion.curve.value(0.5),
            12
        )
        expect(at(1)[0]!.opacity).toBeCloseTo(1, 12)
    })

    it('keeps the on-screen corner radius under scale', () => {
        const solved = solve([lead, follower])
        const drawn = solved[0]!.drawn
        const r = solved[0]!.radius!
        expect(r[0]! * (drawn.w / a.w)).toBeCloseTo(20, 12)
        expect(r[1]! * (drawn.h / a.h)).toBeCloseTo(20, 12)
    })
})

describe('solve: CP3 trial regressions', () => {
    const motion = resolveMotion([{ duration: 1, timing: timing.linear() }])

    it('J-009: a follower listed before its lead is drawn at the lead, with its velocity', () => {
        const a = { x: 200, y: 0, w: 400, h: 100 }
        const lead = rootNode(a, {
            track: createTrack(
                { x: 10, y: 0, w: 80, h: 100 },
                a,
                null,
                0,
                0,
                true,
                motion,
                null
            ),
            elapsed: 0.5,
        })
        const follower = rootNode({ x: 10, y: 0, w: 80, h: 100 }, { follow: 1 })
        for (const nodes of [
            [follower, lead],
            [{ ...lead }, { ...follower, follow: 0 }],
        ]) {
            const boxes = drawnBoxes(nodes)
            const velocities = drawnVelocities(nodes)
            expect(boxes[0]).toEqual(boxes[1])
            expect(velocities[0]).toEqual(velocities[1])
            const leadIndex = nodes[0]!.follow >= 0 ? 1 : 0
            expect(boxes[leadIndex]!.x).toBeCloseTo(105, 12)
            expect(velocities[leadIndex]!.x).toBeCloseTo(190, 9)
        }
    })

    it('J-015: a subpixel endpoint is exact; the floor is the smaller endpoint below one pixel', () => {
        const b = { x: 0, y: 0, w: 10, h: 10 }
        const a = { x: 0, y: 0, w: 0.5, h: 0.5 }
        const track = createTrack(
            b,
            a,
            { x: 0, y: 0, w: -100, h: -100 },
            0,
            0,
            true,
            motion,
            null
        )
        let low = Number.POSITIVE_INFINITY
        for (let e = 0; e <= 1.0001; e += 0.01) {
            const box = drawnBoxes([rootNode(a, { track, elapsed: e })])[0]!
            low = Math.min(low, box.w)
        }
        expect(low).toBeCloseTo(0.5, 12)
        expect(drawnBoxes([rootNode(a, { track, elapsed: 1 })])[0]!.w).toBe(0.5)
        expect(drawnBoxes([rootNode(a, { track, elapsed: 0 })])[0]!.w).toBe(10)
    })
})
