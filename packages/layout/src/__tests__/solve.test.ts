import { type TimingFunction, timing } from '@freestylejs/ani-core'
import { describe, expect, it } from 'vitest'
import {
    aboutOrigin,
    type Box,
    compose,
    IDENTITY_MAP,
    invert,
    mapBox,
} from '../geometry'
import { resolveMotion, type TimingMotion } from '../motion'
import {
    type AnchorPath,
    drawnBoxes,
    drawnRates,
    drawnVelocities,
    fadeEnded,
    fadeOpacity,
    type Layer,
    createTrack as planTrack,
    type SolveNode,
    solve,
    trackEnded,
    trackEndTime,
    trackProgress,
} from '../solve'
import { trackOf as createTrack, rootNode } from './nodes'
import {
    applyPose,
    crossfadeAt,
    easing,
    easingSlope0,
    expectedBox,
    expectedCrossfade,
    expectedRadiusBlend,
    maxDiff,
    NO_POSE,
    type OBox,
    type ONode,
    ORACLE_REDUCED_GRID,
    ORACLE_SETTLE_CAP,
    type OTrackSpec,
    perceptualOracle,
    reducedSpringOracle,
    rendered,
    rng,
    settleOracle,
    springOracle,
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
    anchors: (OAnchor | null)[]
}

/** The oracle's anchor terms: timing momentum `k`, or a spring's relative `v₀`. */
interface OAnchor {
    u: number
    v: number
    kx: number
    ky: number
    vx: number
    vy: number
}

const BOUNCES = [-0.8, -0.3, 0, 0.2, 0.4, 0.9] as const
/** Random trees move thousands of px over long durations: a very bouncy or heavily overdamped spring there would exceed the 10 s cap. */
const TREE_BOUNCES = [-0.3, -0.1, 0, 0.2, 0.4, 0.6] as const

/**
 * A random tree (depth ≤ 5) where every node has a CSS box, an origin and an
 * own transform in its parent's frame, a track between visual boxes and a
 * random elapsed time.
 */
function randomTree(seed: number, springs = 0): Built {
    const random = rng(seed)
    const count = 1 + Math.floor(random() * 24)
    const nodes: SolveNode[] = []
    const dom: ONode[] = []
    const specs: OTrackSpec[] = []
    const anchors: (OAnchor | null)[] = []
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
        const spring =
            springs > 0 && random() < springs
                ? {
                      duration: 0.15 + random(),
                      bounce: TREE_BOUNCES[
                          Math.floor(random() * TREE_BOUNCES.length)
                      ]!,
                  }
                : null
        const motion = spring
            ? resolveMotion([{ type: 'spring', ...spring, delay }])
            : resolveMotion([{ duration, delay, timing: fn }])
        let rule: AnchorPath | null = null
        let ks: Omit<OAnchor, 'u' | 'v'> | null = null
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
                fromX,
                fromY,
                toX,
                toY,
                velocity: velocity && {
                    x: velocity.x + u * velocity.w - (pv.x + u * pv.w),
                    y: velocity.y + v * velocity.h - (pv.y + v * pv.h),
                },
            }
            // the oracle's own momentum terms (timing) and relative velocity (spring)
            ks = {
                kx,
                ky,
                vx: rule.velocity?.x ?? 0,
                vy: rule.velocity?.y ?? 0,
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
            elapsed:
                random() *
                (delay + (spring ? 2 * spring.duration : duration)) *
                1.3,
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
            spring:
                spring && track.law.kind === 'spring'
                    ? { ...spring, end: track.law.settle }
                    : undefined,
        })
        anchors.push(rule && ks ? { u: rule.u, v: rule.v, ...ks } : null)
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
        let offX: number
        let offY: number
        if (spec.spring) {
            const { duration: D, bounce, end } = spec.spring
            const at = (from: number, to: number, v0: number) =>
                t <= 0
                    ? from
                    : t >= end
                      ? to
                      : to + springOracle(D, bounce, from - to, v0, t).d
            offX = at(rule.fromX, rule.toX, anchor.vx)
            offY = at(rule.fromY, rule.toY, anchor.vy)
        } else {
            const tau = t <= 0 ? 0 : Math.min(1, t / spec.duration)
            const rest = 1 - easing(spec.timing, tau)
            const bump = tau > 0 && tau < 1 ? tau * (1 - tau) ** 2 : 0
            offX = rule.toX + (rule.fromX - rule.toX) * rest + anchor.kx * bump
            offY = rule.toY + (rule.fromY - rule.toY) * rest + anchor.ky * bump
        }
        out.push({
            x: parent.x + anchor.u * parent.w - anchor.u * own.w + offX,
            y: parent.y + anchor.v * parent.h - anchor.v * own.h + offY,
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

    it('drawnVelocities returns the same velocities as drawnRates on random trees', () => {
        for (let seed = 900; seed < 920; seed++) {
            const built = randomTree(seed)
            expect(drawnVelocities(built.nodes)).toEqual(
                drawnRates(built.nodes).velocities
            )
        }
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
                const tau = (node.elapsed - t.delay) / t.law.duration
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
            law: {
                kind: 'timing',
                duration: 1,
                curve: (motion as TimingMotion).curve,
            },
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
                from: 1,
                elapsed: 0.25,
                law: {
                    kind: 'timing',
                    duration: 1,
                    curve: (motion as TimingMotion).curve,
                },
            },
        }
    )

    it('draws the follower at the lead box with the coverage-preserving crossfade', () => {
        const solved = solve([lead, follower])
        const dom = [plain(lead), plain(follower)]
        const poses = solved.map((s) => s.pose)
        const want = expectedCrossfade(timing.linear(), 0.25)
        expect(
            maxDiff(rendered(0, dom, poses), rendered(1, dom, poses))
        ).toBeLessThan(TOL)
        expect(solved[0]!.opacity).toBeCloseTo(want.lead, 12)
        expect(solved[1]!.opacity).toBeCloseTo(want.follower, 12)
        const coverage =
            1 - (1 - solved[0]!.opacity!) * (1 - solved[1]!.opacity!)
        expect(coverage).toBeCloseTo(1, 12)
    })

    it('a reversed pair starts from both opacities it shows (no pop)', () => {
        const fromLead = 0.6
        const fromFollower = 1
        const at = (elapsed: number) =>
            solve([
                {
                    ...lead,
                    fade: { ...lead.fade!, from: fromLead, elapsed },
                },
                {
                    ...follower,
                    fade: { ...follower.fade!, from: fromFollower, elapsed },
                },
            ])
        for (const elapsed of [0, 0.25, 0.5, 0.75, 1]) {
            const got = at(elapsed)
            const want = expectedCrossfade(
                timing.linear(),
                elapsed,
                fromLead,
                fromFollower
            )
            expect(got[0]!.opacity).toBeCloseTo(want.lead, 12)
            expect(got[1]!.opacity).toBeCloseTo(want.follower, 12)
        }
    })

    it('keeps the on-screen corner radius under scale', () => {
        const solved = solve([lead, follower])
        const drawn = solved[0]!.drawn
        const r = solved[0]!.radius!
        expect(r[0]! * (drawn.w / a.w)).toBeCloseTo(20, 12)
        expect(r[1]! * (drawn.h / a.h)).toBeCloseTo(20, 12)
    })

    it('blends a shared handoff radius identically on both layers', () => {
        const from = [20, 12, 20, 12, 20, 12, 20, 12]
        const to = [8, 24, 8, 24, 8, 24, 8, 24]
        for (const elapsed of [0, 0.25, 0.5, 0.75, 1]) {
            const track = lead.track!
            const pair = solve([
                {
                    ...lead,
                    elapsed,
                    radius: to,
                    radiusBlend: { from, to, track, elapsed },
                },
                {
                    ...follower,
                    fade: null,
                    radius: from,
                    radiusBlend: { from, to, track, elapsed },
                },
            ])
            const want = expectedRadiusBlend(from, to, timing.linear(), elapsed)
            for (let i = 0; i < pair.length; i++) {
                const node = i === 0 ? lead : follower
                const got = pair[i]!
                for (let j = 0; j < want.length; j++) {
                    const axisScale =
                        j % 2 === 0
                            ? got.drawn.w / node.a.w
                            : got.drawn.h / node.a.h
                    expect(got.radius![j]! * axisScale).toBeCloseTo(
                        want[j]!,
                        12
                    )
                }
            }
        }
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

describe('solve: a node composes its ancestors at its own flush (§3.1; CP6 trial J-032, CP8 trial J-035/J-036)', () => {
    type Sub = Map<number, { tx: number; ty: number; sx: number; sy: number }>

    /** Random layers: ancestors of some nodes with the inner transform of another flush. */
    function withLayers(built: Built, seed: number) {
        const random = rng(seed * 7919)
        const subs: Sub[] = []
        const nodes = built.nodes.map((node) => {
            const sub: Sub = new Map()
            const layers: Layer[] = []
            const chain: number[] = []
            for (let k = node.parent; k >= 0; k = built.nodes[k]!.parent)
                chain.unshift(k)
            for (const k of chain) {
                if (random() >= 0.4) continue
                const q = {
                    tx: random() * 60 - 30,
                    ty: random() * 60 - 30,
                    sx: 0.5 + random(),
                    sy: 0.5 + random(),
                }
                const d = built.dom[k]!
                sub.set(k, q)
                layers.push({
                    at: k,
                    map: compose(
                        invert(built.nodes[k]!.inner),
                        aboutOrigin(q, d.ox, d.oy)
                    ),
                })
            }
            subs.push(sub)
            return { ...node, layers: layers.length > 0 ? layers : null }
        })
        return { nodes, subs }
    }

    /**
     * What the browser draws for `i` with the inner transforms of `sub` on its
     * ancestors (and on `i` itself with `self`), independent of the solver.
     */
    function renderedIn(
        i: number,
        dom: readonly ONode[],
        poses: readonly { tx: number; ty: number; sx: number; sy: number }[],
        sub: Sub,
        self = false
    ): OBox {
        let box = dom[i]!.css
        for (let j = i; j >= 0; j = dom[j]!.parent) {
            const n = dom[j]!
            box = applyPose(
                ((self || j !== i) && sub.get(j)) || n.inner,
                n.ox,
                n.oy,
                box
            )
            box = applyPose(poses[j]!, n.ox, n.oy, box)
        }
        return box
    }

    it("layers that restore the ancestors' own inner maps change nothing (random trees)", () => {
        for (let seed = 1; seed <= 200; seed++) {
            const { nodes } = randomTree(seed)
            const same = nodes.map((node) => {
                const layers: Layer[] = []
                for (let k = node.parent; k >= 0; k = nodes[k]!.parent)
                    layers.unshift({ at: k, map: IDENTITY_MAP })
                return { ...node, layers: layers.length > 0 ? layers : null }
            })
            const a = solve(nodes)
            const b = solve(same)
            a.forEach((s, i) => {
                const t = b[i]!
                expect(Math.abs(s.pose.tx - t.pose.tx)).toBeLessThan(1e-9)
                expect(Math.abs(s.pose.ty - t.pose.ty)).toBeLessThan(1e-9)
                expect(Math.abs(s.pose.sx - t.pose.sx)).toBeLessThan(1e-12)
                expect(Math.abs(s.pose.sy - t.pose.sy)).toBeLessThan(1e-12)
            })
        }
    })

    it('every node is drawn on its track through its own layers: the browser chain recomposed (random trees, random layers)', () => {
        let layered = 0
        for (let seed = 1; seed <= 300; seed++) {
            const built = randomTree(seed)
            const { nodes, subs } = withLayers(built, seed)
            const solved = solve(nodes)
            const poses = solved.map((s) => s.pose)
            solved.forEach((s, i) => {
                if (subs[i]!.size > 0) layered++
                const seen = renderedIn(i, built.dom, poses, subs[i]!)
                const scale = 1 + Math.abs(s.drawn.x) + s.drawn.w
                expect(
                    maxDiff(seen, s.drawn) / scale,
                    `seed ${seed} node ${i}`
                ).toBeLessThan(1e-9)
            })
        }
        expect(layered).toBeGreaterThan(500)
    })

    it("an anchored node is placed on its parent's anchor point as its own layers draw the parent (random trees, J-035)", () => {
        let checked = 0
        for (let seed = 1; seed <= 400; seed++) {
            const built = randomTree(seed)
            const { nodes, subs } = withLayers(built, seed)
            const plainNodes = nodes.map((node) => ({ ...node, layers: null }))
            const plainDrawn = drawnBoxes(plainNodes)
            const solved = solve(nodes)
            const poses = solved.map((s) => s.pose)
            nodes.forEach((node, i) => {
                const rule = node.track?.anchor
                const parent = node.parent
                if (!rule || parent < 0 || nodes[parent]!.track?.anchor) return
                // the parent as this node's layers draw it, from the browser chain
                const P = renderedIn(parent, built.dom, poses, subs[i]!, true)
                const P0 = plainDrawn[parent]!
                const shiftX = P.x + rule.u * P.w - (P0.x + rule.u * P0.w)
                const shiftY = P.y + rule.v * P.h - (P0.y + rule.v * P0.h)
                const d = solved[i]!.drawn
                const d0 = plainDrawn[i]!
                const scale = 1 + Math.abs(d.x) + d.w
                expect(
                    Math.max(
                        Math.abs(d.x - (d0.x + shiftX)),
                        Math.abs(d.y - (d0.y + shiftY)),
                        Math.abs(d.w - d0.w),
                        Math.abs(d.h - d0.h)
                    ) / scale,
                    `seed ${seed} node ${i}`
                ).toBeLessThan(1e-9)
                if (subs[i]!.size > 0 || subs[parent]!.size > 0) checked++
            })
        }
        expect(checked).toBeGreaterThan(50)
    })

    it('analytic velocities match finite differences with layers (random trees)', () => {
        let checked = 0
        for (let seed = 500; seed < 700; seed++) {
            const { nodes } = withLayers(randomTree(seed), seed)
            const h = 1e-6
            const shift = (dt: number) =>
                nodes.map((n) => ({ ...n, elapsed: n.elapsed + dt }))
            const lo = drawnBoxes(shift(-h))
            const hi = drawnBoxes(shift(h))
            const lo2 = drawnBoxes(shift(-h / 2))
            const hi2 = drawnBoxes(shift(h / 2))
            const analytic = drawnVelocities(nodes)
            nodes.forEach((node, i) => {
                if (!node.track?.anchor || node.parent < 0) return
                const fd = (a: Box[], b: Box[], step: number) => ({
                    x: (b[i]!.x - a[i]!.x) / (2 * step),
                    y: (b[i]!.y - a[i]!.y) / (2 * step),
                    w: (b[i]!.w - a[i]!.w) / (2 * step),
                    h: (b[i]!.h - a[i]!.h) / (2 * step),
                })
                const coarse = fd(lo, hi, h)
                // a corner of a piecewise channel anywhere it depends on
                if (relative(coarse, fd(lo2, hi2, h / 2)) > 1e-4) return
                expect(
                    relative(coarse, analytic[i]!),
                    `seed ${seed} node ${i}`
                ).toBeLessThan(1e-3)
                checked++
            })
        }
        expect(checked).toBeGreaterThan(100)
    })

    it('a follower is drawn at its lead as its own flush draws its ancestors, in either order, with its rate (random trees with layers, J-037/J-038)', () => {
        let before = 0
        let after = 0
        let apart = 0
        let rates = 0
        for (let seed = 1; seed <= 300; seed++) {
            const built = randomTree(seed)
            const layered = withLayers(built, seed)
            const nodes = [...layered.nodes]
            const random = rng(seed * 31)
            const above = (a: number, b: number) => {
                for (let k = nodes[b]!.parent; k >= 0; k = nodes[k]!.parent)
                    if (k === a) return true
                return false
            }
            const pairs: [number, number][] = []
            for (let f = 0; f < nodes.length; f++) {
                if (random() > 0.3) continue
                const l = Math.floor(random() * nodes.length)
                if (
                    l === f ||
                    above(f, l) ||
                    above(l, f) ||
                    pairs.some(([pf, pl]) => pf === l || pl === f || pf === f)
                )
                    continue
                nodes[f] = { ...nodes[f]!, follow: l }
                pairs.push([f, l])
            }
            const solved = solve(nodes)
            const poses = solved.map((x) => x.pose)
            const h = 1e-6
            const shift = (dt: number) =>
                nodes.map((n) => ({ ...n, elapsed: n.elapsed + dt }))
            const lo = drawnBoxes(shift(-h))
            const hi = drawnBoxes(shift(h))
            const lo2 = drawnBoxes(shift(-h / 2))
            const hi2 = drawnBoxes(shift(h / 2))
            const analytic = drawnVelocities(nodes)
            for (const [f, l] of pairs) {
                // the browser chain: the follower as its flush saw its
                // ancestors; the lead with those same ancestors, and every
                // other element as the lead's flush saw it
                const fb = renderedIn(f, built.dom, poses, layered.subs[f]!)
                const seen: Sub = new Map(layered.subs[l]!)
                for (
                    let k = built.nodes[l]!.parent;
                    k >= 0;
                    k = nodes[k]!.parent
                ) {
                    if (!above(k, f)) continue
                    const q = layered.subs[f]!.get(k)
                    if (q) seen.set(k, q)
                    else seen.delete(k)
                }
                const lb = renderedIn(l, built.dom, poses, seen)
                const scale = 1 + Math.abs(lb.x) + lb.w
                expect(
                    maxDiff(fb, lb) / scale,
                    `seed ${seed} follower ${f} lead ${l}`
                ).toBeLessThan(1e-9)
                if (f < l) before++
                else after++
                if (
                    [
                        ...layered.subs[f]!.keys(),
                        ...layered.subs[l]!.keys(),
                    ].some((k) => !above(k, f) || !above(k, l))
                )
                    apart++
                const fd = (a: Box[], b: Box[], step: number) => ({
                    x: (b[f]!.x - a[f]!.x) / (2 * step),
                    y: (b[f]!.y - a[f]!.y) / (2 * step),
                    w: (b[f]!.w - a[f]!.w) / (2 * step),
                    h: (b[f]!.h - a[f]!.h) / (2 * step),
                })
                const coarse = fd(lo, hi, h)
                if (relative(coarse, fd(lo2, hi2, h / 2)) > 1e-4) continue
                expect(
                    relative(coarse, analytic[f]!),
                    `seed ${seed} follower ${f} rate`
                ).toBeLessThan(1e-3)
                rates++
            }
        }
        expect(before).toBeGreaterThan(50)
        expect(after).toBeGreaterThan(50)
        expect(apart).toBeGreaterThan(50)
        expect(rates).toBeGreaterThan(100)
    })

    it('a new follower under a changed layer is drawn at a lead outside that parent as is (J-038)', () => {
        const motion = resolveMotion([{ duration: 1, timing: timing.linear() }])
        // the parent's track was planned under scaleX(0.8); its layer is 1 now
        const frozen = aboutOrigin({ tx: 0, ty: 0, sx: 0.8, sy: 1 }, 200, 0)
        const parentCss = { x: 200, y: 0, w: 300, h: 100 }
        const parent = rootNode(
            { x: 200, y: 0, w: 240, h: 100 },
            {
                box: mapBox(frozen, parentCss),
                ox: 200,
                inner: frozen,
                track: createTrack(
                    { x: 120, y: 0, w: 240, h: 100 },
                    { x: 200, y: 0, w: 240, h: 100 },
                    { x: 100, y: 0, w: 0, h: 0 },
                    0,
                    0,
                    true,
                    motion,
                    null
                ),
                elapsed: 0.25,
            }
        )
        // the follower, planned in this flush: its view of the parent is 1
        const follower = rootNode(
            { x: 200, y: 0, w: 40, h: 40 },
            {
                parent: 0,
                follow: 2,
                layers: [{ at: 0, map: compose(invert(frozen), IDENTITY_MAP) }],
            }
        )
        // the new lead, top level, from the follower's box B
        const lead = rootNode(
            { x: 400, y: 0, w: 100, h: 40 },
            {
                track: createTrack(
                    { x: 120, y: 0, w: 40, h: 40 },
                    { x: 400, y: 0, w: 100, h: 40 },
                    { x: 100, y: 0, w: 0, h: 0 },
                    0,
                    0,
                    true,
                    motion,
                    null
                ),
                elapsed: 0.3,
            }
        )
        for (const nodes of [
            [parent, follower, lead],
            // the lead first: its index moves
            [
                lead,
                parent,
                {
                    ...follower,
                    parent: 1,
                    follow: 0,
                    layers: [{ at: 1, map: follower.layers![0]!.map }],
                },
            ],
        ]) {
            const solved = solve(nodes)
            const boxes = drawnBoxes(nodes)
            const velocities = drawnVelocities(nodes)
            const f = nodes.findIndex((n) => n.follow >= 0)
            const l = nodes[f]!.follow
            expect(boxes[f]).toEqual(boxes[l])
            expect(velocities[f]).toEqual(velocities[l])
            // as the browser draws it: the parent's pose under its current layer 1
            const p = nodes[f]!.parent
            const actual = compose(
                aboutOrigin(solved[p]!.pose, 200, 0),
                aboutOrigin(solved[f]!.pose, 200, 0)
            )
            expect(
                maxDiff(
                    mapBox(actual, { x: 200, y: 0, w: 40, h: 40 }),
                    boxes[l]!
                )
            ).toBeLessThan(TOL)
        }
    })

    it("a child planned after its parent's layer changed is drawn through that layer, not the frozen one", () => {
        const motion = resolveMotion([{ duration: 1, timing: timing.linear() }])
        // the parent's track was planned under scaleX(0.8); its layer is 1 now
        const frozen = aboutOrigin({ tx: 0, ty: 0, sx: 0.8, sy: 1 }, 0, 0)
        const parentBox = { x: 0, y: 0, w: 160, h: 100 }
        const parent = rootNode(parentBox, { inner: frozen })
        // the child's B and A were measured through scaleX(1)
        const css = { x: 100, y: 0, w: 40, h: 40 }
        const b = { x: 40, y: 0, w: 40, h: 40 }
        const child = rootNode(css, {
            parent: 0,
            track: createTrack(b, css, null, 0, 0, true, motion, null),
            elapsed: 0.3,
            layers: [{ at: 0, map: compose(invert(frozen), IDENTITY_MAP) }],
        })
        const solved = solve([parent, child])
        const drawn = { x: 40 + 60 * 0.3, y: 0, w: 40, h: 40 }
        // as the browser draws it: the parent's pose and its current layer
        const actual = compose(
            compose(aboutOrigin(solved[0]!.pose, 0, 0), IDENTITY_MAP),
            aboutOrigin(solved[1]!.pose, css.x, css.y)
        )
        expect(maxDiff(mapBox(actual, css), drawn)).toBeLessThan(TOL)
        expect(maxDiff(mapBox(solved[1]!.map, css), drawn)).toBeLessThan(TOL)
        // composed with the frozen layer instead, it would be 1 / 0.8 wide
        const stale = solve([parent, { ...child, layers: null }])
        expect(
            mapBox(
                compose(
                    IDENTITY_MAP,
                    aboutOrigin(stale[1]!.pose, css.x, css.y)
                ),
                css
            ).w
        ).toBeCloseTo(50, 9)
    })

    it("a centred anchored child planned after its parent's layer changed stays on the parent's visual centre (J-035)", () => {
        const motion = resolveMotion([{ duration: 1, timing: timing.linear() }])
        // the parent's track was planned under scaleX(0.8) about its left edge; its layer is 1 now
        const frozen = aboutOrigin({ tx: 0, ty: 0, sx: 0.8, sy: 1 }, 200, 0)
        const parentCss = { x: 200, y: 0, w: 200, h: 100 }
        const parentTrack = createTrack(
            { x: 0, y: 0, w: 160, h: 100 },
            { x: 200, y: 0, w: 160, h: 100 },
            null,
            0,
            0,
            true,
            motion,
            null
        )
        const parent = rootNode(
            { x: 200, y: 0, w: 160, h: 100 },
            {
                box: mapBox(frozen, parentCss),
                ox: 200,
                inner: frozen,
                track: parentTrack,
            }
        )
        // the child: 40 → 60 wide, its centre on the parent's (offset 0)
        const css = { x: 270, y: 30, w: 60, h: 40 }
        const rule: AnchorPath = {
            u: 0.5,
            v: 0.5,
            fromX: 0,
            fromY: 0,
            toX: 0,
            toY: 0,
            velocity: null,
        }
        const child = rootNode(css, {
            parent: 0,
            fx: 0.5,
            fy: 0.5,
            track: createTrack(
                { x: 120, y: 30, w: 40, h: 40 },
                css,
                null,
                0.5,
                0.5,
                true,
                motion,
                rule
            ),
            layers: [{ at: 0, map: compose(invert(frozen), IDENTITY_MAP) }],
        })
        for (const t of [0, 0.1, 0.5, 0.9, 1]) {
            const nodes = [
                { ...parent, elapsed: 0.22 + t },
                { ...child, elapsed: t },
            ]
            const solved = solve(nodes)
            const R = 200 * Math.min(1, 0.22 + t)
            const W = 40 + 20 * t
            // the browser: parent pose ∘ scaleX(1), then the child's pose
            const parentMap = compose(
                aboutOrigin(solved[0]!.pose, 200, 0),
                IDENTITY_MAP
            )
            const seen = mapBox(
                compose(
                    parentMap,
                    aboutOrigin(solved[1]!.pose, css.x + 30, css.y + 20)
                ),
                css
            )
            expect(seen.x).toBeCloseTo(R + 100 - W / 2, 9)
            expect(seen.w).toBeCloseTo(W, 9)
            expect(mapBox(parentMap, parentCss).x + 100).toBeCloseTo(R + 100, 9)
        }
    })
})

describe('solve: spring tracks (§5.3)', () => {
    it('L-SPRING-1: random trees with springs match the closed-form oracle within 1e-9', () => {
        let springs = 0
        for (let seed = 1; seed <= 400; seed++) {
            const built = randomTree(seed, 0.6)
            const solved = solve(built.nodes)
            const expected = oracleDrawn(built)
            built.nodes.forEach((node, i) => {
                if (node.track?.law.kind === 'spring') springs += 1
                const got = rendered(
                    i,
                    built.dom,
                    solved.map((s) => s.pose)
                )
                expect(
                    relative(got, expected[i]!),
                    `seed ${seed} node ${i}`
                ).toBeLessThan(TOL)
            })
        }
        expect(springs).toBeGreaterThan(1000)
    })

    it('L-SPRING-1: a spring settles on every visible edge, not only on its origin and size channels', () => {
        const motion = resolveMotion([
            { type: 'spring', duration: 0.45, bounce: 0 },
        ])
        const b: Box = { x: 0, y: 0, w: 100, h: 50 }
        const a: Box = { x: 30, y: 10, w: 200, h: 100 }
        const track = planTrack(b, a, null, 0.5, 0.5, true, motion, null)
        if (typeof track === 'string' || track.law.kind !== 'spring') {
            throw new Error(String(track))
        }
        const edges = [
            settleOracle(0.45, 0, b.x - a.x, 0),
            settleOracle(0.45, 0, b.x + b.w - (a.x + a.w), 0),
            settleOracle(0.45, 0, b.y - a.y, 0),
            settleOracle(0.45, 0, b.y + b.h - (a.y + a.h), 0),
        ]
        // the right edge moves 130 px while the origin moves 80 and the size
        // 100: a settle on the channels alone would leave it 0.1 px off.
        expect(track.law.settle).toBeGreaterThanOrEqual(
            Math.max(...edges) - 1e-9
        )
    })

    it('L-SPRING-1: analytic velocities of spring trees equal finite differences', () => {
        for (let seed = 700; seed < 800; seed++) {
            const built = randomTree(seed, 1)
            const h = 1e-6
            const shift = (dt: number) =>
                built.nodes.map((n) => ({ ...n, elapsed: n.elapsed + dt }))
            const lo = drawnBoxes(shift(-h))
            const hi = drawnBoxes(shift(h))
            const analytic = drawnVelocities(built.nodes)
            built.nodes.forEach((node, i) => {
                const t = node.track!
                const local = node.elapsed - t.delay
                const end =
                    t.law.kind === 'spring' ? t.law.settle : t.law.duration
                // skip the corners: the start, the settle, a size floor
                if (Math.abs(local) < 1e-3 || Math.abs(local - end) < 1e-3)
                    return
                const fd = {
                    x: (hi[i]!.x - lo[i]!.x) / (2 * h),
                    y: (hi[i]!.y - lo[i]!.y) / (2 * h),
                    w: (hi[i]!.w - lo[i]!.w) / (2 * h),
                    h: (hi[i]!.h - lo[i]!.h) / (2 * h),
                }
                const scale = Math.max(
                    1,
                    ...Object.values(analytic[i]!).map(Math.abs)
                )
                expect(
                    maxDiff(fd, analytic[i]!) / scale,
                    `seed ${seed} node ${i}`
                ).toBeLessThan(1e-4)
            })
        }
    })

    it('L-SPRING-1: c(0) = B and c′(0) = v exactly on every channel, for every bounce, at 60 and 120 Hz', () => {
        const b = { x: 10, y: 20, w: 100, h: 80 }
        const a = { x: 400, y: -50, w: 160, h: 40 }
        const v = { x: 1200, y: -800, w: 300, h: -150 }
        for (const bounce of BOUNCES) {
            const motion = resolveMotion([
                { type: 'spring', duration: 0.5, bounce },
            ])
            const track = createTrack(b, a, v, 0.5, 0.5, true, motion, null)
            const node = (elapsed: number) =>
                rootNode(a, { fx: 0.5, fy: 0.5, track, elapsed })
            expect(maxDiff(drawnBoxes([node(0)])[0]!, b)).toBe(0)
            const v0 = drawnVelocities([node(0)])[0]!
            expect(maxDiff(v0, v)).toBeLessThan(1e-9)
            // every frame on the oracle, at 60 and 120 Hz
            if (track.law.kind !== 'spring') throw new Error('spring')
            const { settle } = track.law
            for (const hz of [60, 120]) {
                for (let f = 0; f * (1 / hz) < settle + 0.1; f++) {
                    const t = f / hz
                    const got = drawnBoxes([node(t)])[0]!
                    const want = expectedBox(
                        {
                            before: b,
                            after: a,
                            velocity: v,
                            fx: 0.5,
                            fy: 0.5,
                            mode: true,
                            duration: 0.5,
                            delay: 0,
                            timing: timing.linear(),
                            spring: { duration: 0.5, bounce, end: settle },
                        },
                        t
                    )
                    expect(
                        maxDiff(got, want),
                        `${bounce} ${hz} Hz f${f}`
                    ).toBeLessThan(1e-9)
                }
            }
        }
    })

    it('settles exactly: the documented example ends at 0.918 s; A is drawn from the settle on', () => {
        const b = { x: 300, y: 0, w: 100, h: 100 }
        const a = { x: 0, y: 0, w: 100, h: 100 }
        const motion = resolveMotion([{ type: 'spring', duration: 0.55 }])
        const track = createTrack(b, a, null, 0, 0, true, motion, null)
        if (track.law.kind !== 'spring') throw new Error('spring')
        expect(track.law.settle).toBeGreaterThan(0.9175)
        expect(track.law.settle).toBeLessThan(0.9185)
        expect(trackEndTime(track)).toBe(track.law.settle)
        const at = (elapsed: number) =>
            drawnBoxes([rootNode(a, { track, elapsed })])[0]!
        // within 0.1 px before the end, exactly A from it on
        const before = at(track.law.settle - 1e-9)
        expect(Math.abs(before.x)).toBeLessThanOrEqual(0.1)
        expect(at(track.law.settle)).toEqual(a)
        expect(trackEnded(track, track.law.settle)).toBe(true)
        expect(trackEnded(track, track.law.settle - 1e-6)).toBe(false)
    })

    it('a spring settling later than 10 s is refused (spring-timeout)', () => {
        const motion = resolveMotion([
            { type: 'spring', duration: 4, bounce: 0.99 },
        ])
        expect(
            planTrack(
                { x: 500, y: 0, w: 10, h: 10 },
                { x: 0, y: 0, w: 10, h: 10 },
                null,
                0,
                0,
                true,
                motion,
                null
            )
        ).toBe('spring-timeout')
    })

    it('P1-002: every reduced-motion candidate settling later than 10 s is refused (spring-timeout)', () => {
        // Tribunal counterexample: 500 px move, duration 100, bounce 0, reducedMotion { maxDuration: 1e9 }
        const base = resolveMotion([
            { type: 'spring', duration: 100, bounce: 0 },
        ])
        const reduced = { ...base, maxDuration: 1e9 } as typeof base
        expect(
            planTrack(
                { x: 500, y: 0, w: 10, h: 10 },
                { x: 0, y: 0, w: 10, h: 10 },
                null,
                0,
                0,
                true,
                reduced,
                null
            )
        ).toBe('spring-timeout')

        // Zero-velocity retry candidate exceeding 10 s cap when carried-velocity candidates exceed maxDuration
        const retryBase = resolveMotion([
            { type: 'spring', duration: 8, bounce: 0 },
        ])
        const retryReduced = {
            ...retryBase,
            maxDuration: 15,
        } as typeof retryBase
        expect(
            planTrack(
                { x: 500, y: 0, w: 10, h: 10 },
                { x: 0, y: 0, w: 10, h: 10 },
                { x: 1e9, y: 0, w: 0, h: 0 },
                0,
                0,
                'position',
                retryReduced,
                null
            )
        ).toBe('spring-timeout')
    })

    it('a delayed spring holds B through its delay, then starts at rest', () => {
        const b = { x: 100, y: 0, w: 50, h: 50 }
        const a = { x: 0, y: 0, w: 50, h: 50 }
        const motion = resolveMotion([
            { type: 'spring', duration: 0.4, bounce: 0.3, delay: 0.2 },
        ])
        const track = createTrack(b, a, null, 0, 0, 'position', motion, null)
        const node = (elapsed: number) => rootNode(a, { track, elapsed })
        expect(drawnBoxes([node(0.1)])[0]).toEqual(b)
        expect(drawnVelocities([node(0.1)])[0]).toEqual({
            x: 0,
            y: 0,
            w: 0,
            h: 0,
        })
        const t = 0.15
        expect(drawnBoxes([node(0.2 + t)])[0]!.x).toBeCloseTo(
            springOracle(0.4, 0.3, 100, 0, t).d,
            9
        )
    })
})

describe('solve: the perceptual timeline of a spring lead (§5.3, §5.8, §5.9)', () => {
    const motion = resolveMotion([
        { type: 'spring', duration: 0.5, bounce: 0.3 },
    ])
    const lead = createTrack(
        { x: 0, y: 0, w: 50, h: 50 },
        { x: 300, y: 200, w: 200, h: 120 },
        null,
        0.5,
        0.5,
        true,
        motion,
        null
    )

    it('L-SPRING-2: crossfade opacities follow p(t), keep coverage 1, and end at t = D', () => {
        for (let k = 0; k <= 120; k++) {
            const elapsed = (k / 100) * 0.5
            const p = perceptualOracle(elapsed, 0.5)
            const want = crossfadeAt(p)
            const leadFade = {
                role: 'lead' as const,
                from: 0,
                elapsed,
                law: lead.law,
            }
            const follower = {
                role: 'follower' as const,
                from: 1,
                elapsed,
                law: lead.law,
            }
            const L = fadeOpacity(leadFade)
            const F = fadeOpacity(follower)
            expect(L).toBeCloseTo(want.lead, 12)
            expect(F).toBeCloseTo(want.follower, 12)
            expect(1 - (1 - L) * (1 - F)).toBeGreaterThanOrEqual(1 - 1e-12)
            expect(fadeEnded(leadFade)).toBe(elapsed >= 0.5)
        }
        // the fade ends at D, long before the physical settle
        if (lead.law.kind !== 'spring') throw new Error('spring')
        expect(lead.law.settle).toBeGreaterThan(0.5)
        expect(
            fadeOpacity({
                role: 'follower',
                from: 1,
                elapsed: 0.5,
                law: lead.law,
            })
        ).toBe(0)
    })

    it('L-SPRING-2: the radius blend follows p(t) and reaches its end at t = D', () => {
        for (const elapsed of [0, 0.05, 0.2, 0.35, 0.5, 0.7]) {
            expect(trackProgress(lead, elapsed)).toBeCloseTo(
                perceptualOracle(elapsed, 0.5),
                12
            )
        }
        const node = rootNode(
            { x: 300, y: 200, w: 200, h: 120 },
            {
                fx: 0.5,
                fy: 0.5,
                track: lead,
                elapsed: 0.5,
                radius: [8, 8, 8, 8, 8, 8, 8, 8],
                radiusBlend: {
                    from: [30, 30, 30, 30, 30, 30, 30, 30],
                    to: [8, 8, 8, 8, 8, 8, 8, 8],
                    track: lead,
                    elapsed: 0.5,
                },
            }
        )
        const [out] = solve([node])
        const drawn = out!.drawn
        // at D the on-screen radius is the authored end, whatever the box is doing
        expect(out!.radius![0]! * (drawn.w / 200)).toBeCloseTo(8, 9)
    })
})

describe('solve: reduced motion { maxDuration } on a spring (§9.4)', () => {
    it('L-SPRING-4: matches the independent reduced-grid oracle (factor, carry/retry, bounce clamp, maxDuration, 10 s cap, exact end)', () => {
        const random = rng(0x4ed0)
        let carriedCount = 0
        let retriedCount = 0
        let jumpedCount = 0
        let timeoutCount = 0
        for (let i = 0; i < 600; i++) {
            const long = i >= 540
            const highVel = i >= 460 && i < 540
            const D = long
                ? 8 + random() * 20
                : highVel
                  ? 0.8 + random() * 1.2
                  : 0.1 + random() * 1.5
            const bounce = BOUNCES[Math.floor(random() * BOUNCES.length)]!
            const delay = random() < 0.3 ? random() * 0.3 : 0
            const max = long
                ? 15 + random() * 100
                : highVel
                  ? 0.18 + random() * 0.28
                  : 0.05 + random() * 1.5
            const dx = long
                ? (random() < 0.5 ? -1 : 1) * (200 + random() * 400)
                : highVel
                  ? (random() < 0.5 ? -1 : 1) * (10 + random() * 150)
                  : (random() - 0.5) * 1200
            const moving = highVel || random() < 0.5
            const v = moving
                ? {
                      x: highVel
                          ? (random() < 0.5 ? -1 : 1) * (5e4 + random() * 5e6)
                          : (random() - 0.5) * 8000,
                      y: 0,
                      w: 0,
                      h: 0,
                  }
                : null
            const base = resolveMotion([
                { type: 'spring', duration: D, bounce, delay },
            ])
            const motion = { ...base, maxDuration: max } as typeof base
            const b = { x: dx, y: 0, w: 40, h: 40 }
            const a = { x: 0, y: 0, w: 40, h: 10 }
            const track = planTrack(b, a, v, 0, 0, 'position', motion, null)
            const expected = reducedSpringOracle(D, bounce, delay, max, [
                { x0: dx, v0: v?.x ?? 0 },
                { x0: 0, v0: 0 },
            ])
            if (expected === 'reduced') {
                expect(track).toBe('reduced')
                jumpedCount += 1
                continue
            }
            if (expected === 'spring-timeout') {
                expect(track).toBe('spring-timeout')
                timeoutCount += 1
                continue
            }
            if (typeof track === 'string' || track.law.kind !== 'spring') {
                throw new Error(String(track))
            }
            const law = track.law
            const f = law.duration / D
            expect(f).toBeCloseTo(expected.factor, 12)
            expect(law.spring.bounce).toBe(expected.bounce)
            expect(law.spring.bounce).toBeLessThanOrEqual(0)
            expect(track.delay).toBeCloseTo(expected.delay, 12)
            expect(law.settle).toBeCloseTo(expected.settle, 6)
            expect(track.delay + law.settle).toBeLessThanOrEqual(max + 1e-12)
            expect(law.settle).toBeLessThanOrEqual(ORACLE_SETTLE_CAP)
            const expectedSeed = expected.carry ? (v?.x ?? 0) : 0
            expect(track.seed[0]).toBe(expectedSeed)
            if (v && v.x !== 0) {
                if (expected.carry) carriedCount += 1
                else retriedCount += 1
            } else {
                carriedCount += 1
            }
            // Every larger factor in the same pass must exceed maxDuration according to settleOracle
            for (const g of ORACLE_REDUCED_GRID) {
                if (g <= expected.factor + 1e-12) continue
                const s = settleOracle(D * g, expected.bounce, dx, expectedSeed)
                expect(delay * g + s).toBeGreaterThan(max - 1e-9)
            }
            // When the zero-velocity retry was chosen for a moving node, every factor with carried velocity must have exceeded maxDuration
            if (!expected.carry && v && v.x !== 0) {
                for (const g of ORACLE_REDUCED_GRID) {
                    const s = settleOracle(D * g, expected.bounce, dx, v.x)
                    expect(delay * g + s).toBeGreaterThan(max - 1e-9)
                }
            }
            // Final exactness at settle and settle bound thereafter
            expect(
                drawnBoxes([
                    rootNode(a, {
                        track,
                        elapsed: track.delay + law.settle + 1e-12,
                    }),
                ])[0]
            ).toEqual(a)
            for (let k = 0; k <= 50; k++) {
                const t = law.settle + (k / 50) * law.duration
                const o = springOracle(
                    law.duration,
                    law.spring.bounce,
                    dx,
                    expectedSeed,
                    t
                )
                expect(Math.abs(o.d)).toBeLessThanOrEqual(0.1 + 1e-9)
                expect(Math.abs(o.v)).toBeLessThanOrEqual(1 + 1e-9)
            }
        }
        expect(carriedCount).toBeGreaterThan(100)
        expect(retriedCount).toBeGreaterThan(20)
        expect(jumpedCount).toBeGreaterThan(10)
        expect(timeoutCount).toBeGreaterThan(10)
    })
})
