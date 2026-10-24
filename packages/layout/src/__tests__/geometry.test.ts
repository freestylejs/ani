import { describe, expect, it } from 'vitest'
import {
    aboutOrigin,
    carry,
    compose,
    composeMoving,
    IDENTITY_MAP,
    invert,
    invertMoving,
    type Map2,
    type MovingMap,
    mapBox,
    movingOnto,
    ownMap,
    poseFor,
    unmapOwn,
    usedOrigin,
} from '../geometry'
import { applyPose, maxDiff, rng } from './oracle'

describe('geometry', () => {
    const random = rng(7)
    const box = () => ({
        x: random() * 500,
        y: random() * 500,
        w: 1 + random() * 300,
        h: 1 + random() * 300,
    })
    const map = () => ({
        x: { k: 0.1 + random() * 3, b: random() * 200 - 100 },
        y: { k: 0.1 + random() * 3, b: random() * 200 - 100 },
    })

    it('compose / invert are a group', () => {
        for (let i = 0; i < 200; i++) {
            const m = map()
            const n = map()
            const b = box()
            expect(
                maxDiff(mapBox(compose(m, n), b), mapBox(m, mapBox(n, b)))
            ).toBeLessThan(1e-9)
            expect(maxDiff(mapBox(compose(invert(m), m), b), b)).toBeLessThan(
                1e-9
            )
            expect(maxDiff(mapBox(IDENTITY_MAP, b), b)).toBe(0)
        }
    })

    it('poseFor draws a box at the target box about any origin point (independent pose application)', () => {
        for (let i = 0; i < 200; i++) {
            const a = box()
            const v = box()
            // the origin need not lie inside the box (an own translation moves it)
            const ox = a.x + (random() * 3 - 1) * a.w
            const oy = a.y + (random() * 3 - 1) * a.h
            const pose = poseFor(v, a, ox, oy)
            expect(maxDiff(applyPose(pose, ox, oy, a), v)).toBeLessThan(1e-9)
            expect(
                maxDiff(mapBox(aboutOrigin(pose, ox, oy), a), v)
            ).toBeLessThan(1e-9)
        }
    })

    it('unmapOwn inverts ownMap', () => {
        for (let i = 0; i < 200; i++) {
            const b = box()
            const own = {
                kx: 0.2 + random() * 2,
                ky: 0.2 + random() * 2,
                tx: random() * 40 - 20,
                ty: random() * 40 - 20,
                ox: random() * b.w,
                oy: random() * b.h,
            }
            expect(
                maxDiff(unmapOwn(mapBox(ownMap(b, own), b), own), b)
            ).toBeLessThan(1e-9)
        }
    })
})

describe('geometry: moving maps', () => {
    // maps that move linearly in time: k(t) = k + k′t, b(t) = b + b′t
    const at = (m: MovingMap, t: number): Map2 => ({
        x: { k: m.map.x.k + m.rate.x.k * t, b: m.map.x.b + m.rate.x.b * t },
        y: { k: m.map.y.k + m.rate.y.k * t, b: m.map.y.b + m.rate.y.b * t },
    })
    const derivative = (f: (t: number) => Map2): Map2 => {
        const h = 1e-6
        const a = f(-h)
        const b = f(h)
        const d = (u: number, v: number) => (v - u) / (2 * h)
        return {
            x: { k: d(a.x.k, b.x.k), b: d(a.x.b, b.x.b) },
            y: { k: d(a.y.k, b.y.k), b: d(a.y.b, b.y.b) },
        }
    }
    const outer: MovingMap = {
        map: { x: { k: 0.8, b: 20 }, y: { k: 1.2, b: -5 } },
        rate: { x: { k: 0.3, b: 200 }, y: { k: -0.1, b: 15 } },
    }
    const inner: MovingMap = {
        map: { x: { k: 1.5, b: 7 }, y: { k: 0.5, b: 3 } },
        rate: { x: { k: -0.2, b: 40 }, y: { k: 0.4, b: -9 } },
    }
    const close = (got: Map2, want: Map2) => {
        for (const axis of ['x', 'y'] as const) {
            expect(got[axis].k).toBeCloseTo(want[axis].k, 6)
            expect(got[axis].b).toBeCloseTo(want[axis].b, 6)
        }
    }

    it('compose and invert carry the exact derivative', () => {
        close(
            composeMoving(outer, inner).rate,
            derivative((t) => compose(at(outer, t), at(inner, t)))
        )
        close(
            invertMoving(outer).rate,
            derivative((t) => invert(at(outer, t)))
        )
        const round = composeMoving(invertMoving(outer), outer)
        close(round.map, IDENTITY_MAP)
        close(round.rate, { x: { k: 0, b: 0 }, y: { k: 0, b: 0 } })
    })

    it('movingOnto and carry: a box moving at a velocity, through a moving map', () => {
        const css = { x: 10, y: 20, w: 40, h: 30 }
        const drawn = { x: 50, y: 60, w: 80, h: 45 }
        const velocity = { x: 200, y: -30, w: 60, h: 12 }
        const onto = movingOnto(css, drawn, velocity)!
        expect(mapBox(onto.map, css)).toEqual(drawn)
        const self = carry(onto, css, { x: 0, y: 0, w: 0, h: 0 })
        for (const key of ['x', 'y', 'w', 'h'] as const) {
            expect(self.box[key]).toBeCloseTo(drawn[key], 9)
            expect(self.velocity[key]).toBeCloseTo(velocity[key], 9)
        }
        // through a moving outer map: d/dt outer(t)(box(t))
        const moved = carry(outer, drawn, velocity)
        const boxAt = (t: number) =>
            mapBox(at(outer, t), {
                x: drawn.x + velocity.x * t,
                y: drawn.y + velocity.y * t,
                w: drawn.w + velocity.w * t,
                h: drawn.h + velocity.h * t,
            })
        const h = 1e-6
        for (const key of ['x', 'y', 'w', 'h'] as const) {
            expect(moved.velocity[key]).toBeCloseTo(
                (boxAt(h)[key] - boxAt(-h)[key]) / (2 * h),
                5
            )
        }
        expect(movingOnto({ ...css, w: 0 }, drawn, velocity)).toBeNull()
    })
})

describe('geometry: the origin the browser applies (§5.3)', () => {
    it('is the computed origin where the browser uses the exact box', () => {
        expect(
            usedOrigin([35.09375, 10.1484375], null, 70.1875, 20.296875, 1)
        ).toEqual([35.09375, 10.1484375])
    })

    // the origins WebKit applied in a probe (left 20, scale 5): a percentage
    // of round(w · dpr) / dpr, a length as it is
    it.each([
        [
            '50% 50%, dpr 1',
            [35.09375, 10.1484375],
            [0.5, 0.5],
            70.1875,
            20.296875,
            1,
            [35, 10],
        ],
        [
            '50% 50%, dpr 2',
            [5.1484375, 10.1484375],
            [0.5, 0.5],
            10.296875,
            20.296875,
            2,
            [5.25, 10.25],
        ],
        [
            '50% 50%, dpr 3',
            [35.09375, 10.1484375],
            [0.5, 0.5],
            70.1875,
            20.296875,
            3,
            [35.1666667, 10.1666667],
        ],
        [
            '100% 0, dpr 2',
            [50.296875, 0],
            [1, 0],
            50.296875,
            20.296875,
            2,
            [50.5, 0],
        ],
        ['10px 0, dpr 2', [10, 0], [0, 0], 50.296875, 20.296875, 2, [10, 0]],
        [
            'calc(20% + 3px) 0, dpr 2',
            [13.059375, 0],
            [0.2, 0],
            50.296875,
            20.296875,
            2,
            [13.1, 0],
        ],
    ] as const)('%s', (_, origin, pct, w, h, dpr, want) => {
        const [x, y] = usedOrigin(origin, pct, w, h, dpr)
        expect(x).toBeCloseTo(want[0], 6)
        expect(y).toBeCloseTo(want[1], 6)
    })
})
