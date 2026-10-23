import { describe, expect, it } from 'vitest'
import {
    aboutOrigin,
    compose,
    IDENTITY_MAP,
    invert,
    mapBox,
    ownMap,
    poseFor,
    unmapOwn,
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
