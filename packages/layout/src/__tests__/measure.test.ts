import { describe, expect, it } from 'vitest'
import type { Box, Pose } from '../geometry'
import {
    keepPath,
    type PresentedNode,
    presentedLayoutBoxes,
    type StaleNode,
    type SupportNode,
    staleReported,
    supportCheck,
} from '../measure'
import { moved } from '../plan'
import { NO_POSE, type ONode, rendered, rng } from './oracle'

function randomLayoutSize(random: () => number): number {
    const pick = random()
    if (pick < 0.25) return 0.3 + random() * 9.7
    if (pick < 0.6) return 10 + random() * 190
    return 200 + random() * 1300
}

function randomPoseScale(random: () => number): number {
    if (random() < 0.5) return 1
    return 0.1 * 100 ** random()
}

function randomInnerScale(random: () => number): number {
    if (random() < 0.7) return 1
    return 0.5 * 4 ** random()
}

function randomPose(random: () => number, identityChance: number): Pose {
    if (random() < identityChance) return NO_POSE
    return {
        tx: (random() - 0.5) * 200,
        ty: (random() - 0.5) * 200,
        sx: 0.2 + random() * 2.8,
        sy: 0.2 + random() * 2.8,
    }
}

describe('measure: supportCheck (§4.2)', () => {
    it('SC-1: tribunal counterexample — parent W=50.49 (offset 50), child W=1000, total scales 0.1, 1, 10 all supported', () => {
        for (const totalScale of [0.1, 1, 10]) {
            const parentPose = { sx: totalScale, sy: totalScale }
            const childPose = { sx: 1, sy: 1 }
            const nodes: SupportNode[] = [
                {
                    parent: -1,
                    rect: { w: 50.49 * totalScale, h: 50.49 * totalScale },
                    offset: [50, 50],
                    pose: parentPose,
                    hasChildren: true,
                },
                {
                    parent: 0,
                    rect: { w: 1000 * totalScale, h: 1000 * totalScale },
                    offset: [1000, 1000],
                    pose: childPose,
                    hasChildren: false,
                },
            ]
            const res = supportCheck(
                nodes,
                () => ({ sx: 1, sy: 1 }),
                (i) => (i === 0 ? { w: 50.49, h: 50.49 } : { w: 1000, h: 1000 })
            )
            expect(res.supported).toEqual([true, true])
            expect(res.intervals[0]).not.toBeNull()
            expect(res.intervals[1]).not.toBeNull()

            // Also when the scale sits on the parent's inner map instead of its pose
            const nodesInner: SupportNode[] = [
                {
                    parent: -1,
                    rect: { w: 50.49 * totalScale, h: 50.49 * totalScale },
                    offset: [50, 50],
                    pose: { sx: 1, sy: 1 },
                    hasChildren: true,
                },
                {
                    parent: 0,
                    rect: { w: 1000 * totalScale, h: 1000 * totalScale },
                    offset: [1000, 1000],
                    pose: { sx: 1, sy: 1 },
                    hasChildren: false,
                },
            ]
            const resInner = supportCheck(
                nodesInner,
                (i) =>
                    i === 0
                        ? { sx: totalScale, sy: totalScale }
                        : { sx: 1, sy: 1 },
                (i) => (i === 0 ? { w: 50.49, h: 50.49 } : { w: 1000, h: 1000 })
            )
            expect(resInner.supported).toEqual([true, true])
        }
    })

    it('SC-2: property — 20,000 random supported chains and trees have zero false positives', () => {
        const random = rng(0x5c02_2026)
        let totalNodes = 0
        let totalReads = 0
        let unsupportedCount = 0

        let intervalViolations = 0

        for (let trial = 0; trial < 20_000; trial++) {
            const maxDepth = 1 + Math.floor(random() * 6)
            const pixelSnap = trial % 2 === 1
            const parents: number[] = []
            const trueW: number[] = []
            const trueH: number[] = []
            const poseScales: { sx: number; sy: number }[] = []
            const innerScales: { sx: number; sy: number }[] = []
            const totalScales: { sx: number; sy: number }[] = []
            const hasChildren: boolean[] = []

            const buildLevel = (parentIdx: number, depth: number) => {
                const idx = parents.length
                parents.push(parentIdx)
                if (parentIdx >= 0) hasChildren[parentIdx] = true
                hasChildren.push(false)

                const w = randomLayoutSize(random)
                const h = randomLayoutSize(random)
                const psx = randomPoseScale(random)
                const psy = randomPoseScale(random)
                const isx = randomInnerScale(random)
                const isy = randomInnerScale(random)
                const parentTotal =
                    parentIdx >= 0 ? totalScales[parentIdx]! : { sx: 1, sy: 1 }
                const tsx = parentTotal.sx * psx * isx
                const tsy = parentTotal.sy * psy * isy

                trueW.push(w)
                trueH.push(h)
                poseScales.push({ sx: psx, sy: psy })
                innerScales.push({ sx: isx, sy: isy })
                totalScales.push({ sx: tsx, sy: tsy })

                if (depth < maxDepth) {
                    const branch =
                        trial % 4 === 0 ? 1 : 1 + Math.floor(random() * 3)
                    for (let b = 0; b < branch; b++) {
                        if (parents.length < 32) buildLevel(idx, depth + 1)
                    }
                }
            }

            buildLevel(-1, 1)

            const snapOffset = (size: number): number => {
                if (!pixelSnap) return Math.round(size)
                const u = (random() * 2 - 1) * 0.489999
                return Math.max(0, Math.round(size + u))
            }

            const nodes: SupportNode[] = parents.map((parent, i) => ({
                parent,
                rect: {
                    w: trueW[i]! * totalScales[i]!.sx,
                    h: trueH[i]! * totalScales[i]!.sy,
                },
                offset: [snapOffset(trueW[i]!), snapOffset(trueH[i]!)],
                pose: poseScales[i]!,
                hasChildren: hasChildren[i]!,
            }))

            const res = supportCheck(
                nodes,
                (i) => innerScales[i]!,
                (i) => ({ w: trueW[i]!, h: trueH[i]! })
            )
            totalNodes += nodes.length
            totalReads += res.reads.length

            for (let i = 0; i < nodes.length; i++) {
                if (!res.supported[i]) {
                    unsupportedCount += 1
                    continue
                }
                const iv = res.intervals[i]!
                const ts = totalScales[i]!
                if (
                    iv.x.lo > ts.sx * (1 + 1e-12) ||
                    iv.x.hi < ts.sx * (1 - 1e-12) ||
                    iv.y.lo > ts.sy * (1 + 1e-12) ||
                    iv.y.hi < ts.sy * (1 - 1e-12)
                ) {
                    intervalViolations += 1
                }
            }
        }

        expect(unsupportedCount).toBe(0)
        expect(intervalViolations).toBe(0)
        const avgReadsPerNode = totalReads / totalNodes
        expect(avgReadsPerNode).toBeGreaterThan(0)
        expect(avgReadsPerNode).toBeLessThan(1)
    })

    it('SC-3: detection — 3% unowned zoom under 50.49px parent fails child and subtree; 0.2% vs 0.05% under 1000px parent', () => {
        const tree3Pct: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 50.49, h: 50.49 },
                offset: [50, 50],
                pose: { sx: 1, sy: 1 },
                hasChildren: true,
            },
            {
                parent: 0,
                rect: { w: 1000 * 1.03, h: 1000 * 1.03 },
                offset: [1000, 1000],
                pose: { sx: 1, sy: 1 },
                hasChildren: true,
            },
            {
                parent: 1,
                rect: { w: 200 * 1.03, h: 200 * 1.03 },
                offset: [200, 200],
                pose: { sx: 1, sy: 1 },
                hasChildren: false,
            },
        ]
        const res3Pct = supportCheck(
            tree3Pct,
            () => ({ sx: 1, sy: 1 }),
            (i) => ({
                w: tree3Pct[i]!.offset[0],
                h: tree3Pct[i]!.offset[1],
            })
        )
        expect(res3Pct.supported).toEqual([true, false, false])
        expect(res3Pct.intervals[0]).not.toBeNull()
        expect(res3Pct.intervals[1]).toBeNull()
        expect(res3Pct.intervals[2]).toBeNull()
        expect(res3Pct.reads).not.toContain(2)

        // Bound under a 1000px parent:
        // - Each node with O = 1000 has measured interval M = [R / 1001, R / 999] (±0.1%).
        // - When the parent's inner scale is read (or known, so I_parent = [q, q] is a point),
        //   the child's expected interval is a point and any unowned zoom z > 1001 / 1000 = 1.001
        //   (0.1%) makes M_child.lo = z * W / 1001 > 1, so 0.2% (1.002) is detected and 0.05%
        //   (1.0005) is not.
        // - When the parent's q = 1 is assumed (not read because 1 / 1000 <= 0.005),
        //   I_parent = [W_p / 1001, W_p / 999]; M_child ∩ I_parent is empty when
        //   z * W_c / 1001 > W_p / 999, i.e. z * (W_c / W_p) > 1001 / 999 ≈ 1.002002 (0.2002%).
        const checkChildZoom = (
            zoom: number,
            parentInner = 1,
            childW = 1000.4
        ) => {
            const nodes: SupportNode[] = [
                {
                    parent: -1,
                    rect: { w: 1000 * parentInner, h: 1000 * parentInner },
                    offset: [1000, 1000],
                    pose: { sx: 1, sy: 1 },
                    hasChildren: true,
                },
                {
                    parent: 0,
                    rect: {
                        w: childW * parentInner * zoom,
                        h: childW * parentInner * zoom,
                    },
                    offset: [1000, 1000],
                    pose: { sx: 1, sy: 1 },
                    hasChildren: false,
                },
            ]
            return supportCheck(
                nodes,
                (i) =>
                    i === 0
                        ? { sx: parentInner, sy: parentInner }
                        : { sx: 1, sy: 1 },
                (i) =>
                    i === 0 ? { w: 1000, h: 1000 } : { w: childW, h: childW }
            )
        }

        // Fractional 1000.4px child (offset 1000) under 1000px parent (q assumed = 1):
        expect(checkChildZoom(1.002, 1, 1000.4).supported).toEqual([
            true,
            false,
        ])
        expect(checkChildZoom(1.0005, 1, 1000.4).supported).toEqual([
            true,
            true,
        ])

        // Exact 1000px child under 1000px parent whose inner scale was read (I_parent point):
        expect(checkChildZoom(1.002, 1.5, 1000).supported).toEqual([
            true,
            false,
        ])
        expect(checkChildZoom(1.0005, 1.5, 1000).supported).toEqual([
            true,
            true,
        ])
    })

    it("SC-4: reader 'unsupported' fails node and subtree; reads <= 1 per node; zero reads when narrow and matching on assumed q", () => {
        const narrowNodes: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 500, h: 400 },
                offset: [500, 400],
                pose: { sx: 1, sy: 1 },
                hasChildren: true,
            },
            {
                parent: 0,
                rect: { w: 300, h: 250 },
                offset: [300, 250],
                pose: { sx: 1, sy: 1 },
                hasChildren: false,
            },
        ]
        const narrowRes = supportCheck(
            narrowNodes,
            () => ({ sx: 1, sy: 1 }),
            (i) => ({
                w: narrowNodes[i]!.offset[0],
                h: narrowNodes[i]!.offset[1],
            })
        )
        expect(narrowRes.supported).toEqual([true, true])
        expect(narrowRes.reads).toEqual([])

        // Reader returning 'unsupported' fails the node and its descendants without reading children
        const callCounts = [0, 0, 0]
        const badTree: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 400, h: 400 },
                offset: [400, 400],
                pose: { sx: 1, sy: 1 },
                hasChildren: true,
            },
            {
                parent: 0,
                // Mismatches assumed q = 1 (rect is 2x offset), triggering a read
                rect: { w: 600, h: 600 },
                offset: [300, 300],
                pose: { sx: 1, sy: 1 },
                hasChildren: true,
            },
            {
                parent: 1,
                rect: { w: 100, h: 100 },
                offset: [50, 50],
                pose: { sx: 1, sy: 1 },
                hasChildren: false,
            },
        ]
        const badRes = supportCheck(
            badTree,
            (i) => {
                callCounts[i]! += 1
                return 'unsupported'
            },
            (i) => ({ w: badTree[i]!.offset[0], h: badTree[i]!.offset[1] })
        )
        expect(badRes.supported).toEqual([true, false, false])
        expect(badRes.intervals[0]).not.toBeNull()
        expect(badRes.intervals[1]).toBeNull()
        expect(badRes.intervals[2]).toBeNull()
        expect(badRes.reads).toEqual([1])
        expect(callCounts).toEqual([0, 1, 0])

        // Small parent (wide interval, hasChildren) that ALSO mismatches assumed q = 1:
        // reader is still called at most once for that node.
        const smallParentCounts = [0, 0]
        const smallParentNodes: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 80, h: 80 },
                offset: [40, 40],
                pose: { sx: 1, sy: 1 },
                hasChildren: true,
            },
            {
                parent: 0,
                rect: { w: 200, h: 200 },
                offset: [100, 100],
                pose: { sx: 1, sy: 1 },
                hasChildren: false,
            },
        ]
        const smallRes = supportCheck(
            smallParentNodes,
            (i) => {
                smallParentCounts[i]! += 1
                return i === 0 ? { sx: 2, sy: 2 } : { sx: 1, sy: 1 }
            },
            (i) => ({
                w: smallParentNodes[i]!.offset[0],
                h: smallParentNodes[i]!.offset[1],
            })
        )
        expect(smallRes.supported).toEqual([true, true])
        expect(smallParentCounts[0]).toBe(1)
        expect(smallParentCounts[1]).toBe(0)
    })

    it('SC-5: degenerate axes (offset 0 or 1) propagate the expected interval and never fail by themselves', () => {
        const nodes: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 0, h: 3 },
                offset: [0, 1],
                pose: { sx: 2, sy: 1.5 },
                hasChildren: true,
            },
            {
                parent: 0,
                rect: { w: 600, h: 600 },
                offset: [200, 200],
                pose: { sx: 1, sy: 1 },
                hasChildren: false,
            },
            {
                parent: 0,
                rect: { w: 0, h: 0 },
                offset: [1, 0],
                pose: { sx: 0.5, sy: 0.5 },
                hasChildren: false,
            },
        ]
        const exactReads: number[] = []
        const res = supportCheck(
            nodes,
            (i) => (i === 0 ? { sx: 1.5, sy: 2 } : { sx: 1, sy: 1 }),
            (i) => {
                exactReads.push(i)
                return i === 0 ? { w: 0, h: 1 } : { w: 0, h: 0 }
            }
        )
        expect(res.supported).toEqual([true, true, true])
        // Parent's expected scale: x = 1 * 2 * 1.5 = 3, y = 1 * 1.5 * 2 = 3
        expect(res.intervals[0]).toEqual({
            x: { lo: 3, hi: 3 },
            y: { lo: 3, hi: 3 },
        })
        expect(res.reads).toEqual([0])
        // Only nodes 0 and 2 have a degenerate axis (offset <= 1)
        expect(exactReads).toEqual([0, 2])
    })

    it('SC-6 (P0-N001): degenerate leaf (offset 1 or 0) under unowned zoom: 2 or ancestor transform is detected via readExactSize', () => {
        // 1px leaf (O = 1, W = 1) under unowned zoom: 2 -> rect is 2x2
        const leaf1px: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 2, h: 2 },
                offset: [1, 1],
                pose: { sx: 1, sy: 1 },
                hasChildren: false,
            },
        ]
        const exactCalls1: number[] = []
        const res1px = supportCheck(
            leaf1px,
            () => ({ sx: 1, sy: 1 }),
            (i) => {
                exactCalls1.push(i)
                return { w: 1, h: 1 }
            }
        )
        expect(res1px.supported).toEqual([false])
        expect(res1px.intervals).toEqual([null])
        expect(res1px.reads).toEqual([0])
        expect(exactCalls1).toEqual([0])

        // Sub-half-pixel leaf (O = 0, W = 0.4) under unowned zoom: 2 -> rect is 0.8x0.8
        const leaf0px: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 0.8, h: 0.8 },
                offset: [0, 0],
                pose: { sx: 1, sy: 1 },
                hasChildren: false,
            },
        ]
        const exactCalls0: number[] = []
        const res0px = supportCheck(
            leaf0px,
            () => ({ sx: 1, sy: 1 }),
            (i) => {
                exactCalls0.push(i)
                return { w: 0.4, h: 0.4 }
            }
        )
        expect(res0px.supported).toEqual([false])
        expect(res0px.intervals).toEqual([null])
        expect(res0px.reads).toEqual([0])
        expect(exactCalls0).toEqual([0])

        // True zero-size leaf (O = 0, W = 0) stays supported because the plan snaps zero size
        const zeroLeaf: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 0, h: 40 },
                offset: [0, 40],
                pose: { sx: 1, sy: 1 },
                hasChildren: false,
            },
        ]
        const resZero = supportCheck(
            zeroLeaf,
            () => ({ sx: 1, sy: 1 }),
            () => ({ w: 0, h: 40 })
        )
        expect(resZero.supported).toEqual([true])
    })
})

describe('measure: presentedLayoutBoxes (§4.2)', () => {
    it('PL-1: property — 10,000 random nested trees (depth <= 5) match forward rest boxes within 1e-9 relative', () => {
        const random = rng(0x7101_2026)
        let maxRelErr = 0

        for (let trial = 0; trial < 10_000; trial++) {
            const maxDepth = 1 + Math.floor(random() * 5)
            const domNodes: ONode[] = []
            const poses: Pose[] = []
            const origins: [number, number][] = []

            const build = (parent: number, depth: number) => {
                const idx = domNodes.length
                const css: Box = {
                    x: (random() - 0.3) * 800,
                    y: (random() - 0.3) * 800,
                    w: 2 + random() * 500,
                    h: 2 + random() * 500,
                }
                const origin: [number, number] = [
                    random() * css.w,
                    random() * css.h,
                ]
                const inner = randomPose(random, 0.4)
                const pose = randomPose(random, 0.3)

                domNodes.push({
                    parent,
                    css,
                    ox: css.x + origin[0],
                    oy: css.y + origin[1],
                    inner,
                })
                poses.push(pose)
                origins.push(origin)

                if (depth < maxDepth) {
                    const children = 1 + Math.floor(random() * 2)
                    for (let c = 0; c < children; c++) {
                        if (domNodes.length < 16) build(idx, depth + 1)
                    }
                }
            }

            build(-1, 1)

            const identityPoses = domNodes.map(() => NO_POSE)
            const presentedNodes: PresentedNode[] = domNodes.map((n, i) => ({
                parent: n.parent,
                rect: rendered(i, domNodes, poses),
                pose: poses[i]!,
                inner: n.inner,
                origin: origins[i]!,
            }))

            const recovered = presentedLayoutBoxes(presentedNodes)

            for (let i = 0; i < domNodes.length; i++) {
                const expected = rendered(i, domNodes, identityPoses)
                const got = recovered[i]!
                const scale = Math.max(
                    1,
                    Math.abs(expected.x),
                    Math.abs(expected.y),
                    expected.w,
                    expected.h
                )
                const err =
                    Math.max(
                        Math.abs(got.x - expected.x),
                        Math.abs(got.y - expected.y),
                        Math.abs(got.w - expected.w),
                        Math.abs(got.h - expected.h)
                    ) / scale
                if (err > maxRelErr) maxRelErr = err
            }
        }

        expect(maxRelErr).toBeLessThan(1e-9)
    })
})

describe('measure: keepPath (§5.7)', () => {
    it('KP-1: |δ|·max(1, ρ) below 0.01 on both axes returns unchanged; an amplified δ does not', () => {
        expect(
            keepPath({
                delta: { x: 0, y: 0 },
                ancestors: [],
            })
        ).toBe('unchanged')

        expect(
            keepPath({
                delta: { x: 0.0099, y: -0.0099 },
                ancestors: [
                    {
                        pose: { sx: 0.5, sy: 0.5 },
                        innerNow: { sx: 2, sy: 2 },
                        innerPlanned: { sx: 1, sy: 1 },
                    },
                ],
            })
        ).toBe('unchanged')

        // J-001: delta = 0.009 px amplified by ancestor pose scale 323 (0.009 * 323 = 2.907 >= 0.01) retargets
        expect(
            keepPath({
                delta: { x: 0.009, y: 0 },
                ancestors: [
                    {
                        pose: { sx: 323, sy: 1 },
                        innerNow: { sx: 1, sy: 1 },
                        innerPlanned: { sx: 1, sy: 1 },
                    },
                ],
            })
        ).toBe('retarget')
    })

    it('KP-2: ancestor pose != 1 or innerNow != innerPlanned returns retarget', () => {
        expect(
            keepPath({
                delta: { x: 20, y: 0 },
                ancestors: [
                    {
                        pose: { sx: 0.5, sy: 1 },
                        innerNow: { sx: 1, sy: 1 },
                        innerPlanned: { sx: 1, sy: 1 },
                    },
                ],
            })
        ).toBe('retarget')

        expect(
            keepPath({
                delta: { x: 0, y: 0.01 },
                ancestors: [
                    {
                        pose: { sx: 1, sy: 0.5 },
                        innerNow: { sx: 1, sy: 1 },
                        innerPlanned: { sx: 1, sy: 1 },
                    },
                ],
            })
        ).toBe('retarget')

        expect(
            keepPath({
                delta: { x: 10, y: 5 },
                ancestors: [
                    {
                        pose: { sx: 1, sy: 1 },
                        innerNow: { sx: 1.2, sy: 1 },
                        innerPlanned: { sx: 1, sy: 1 },
                    },
                ],
            })
        ).toBe('retarget')

        expect(
            keepPath({
                delta: { x: 10, y: 5 },
                ancestors: [
                    {
                        pose: { sx: 1, sy: 1 },
                        innerNow: { sx: 1, sy: 0.8 },
                        innerPlanned: { sx: 1, sy: 1 },
                    },
                ],
            })
        ).toBe('retarget')
    })

    it('KP-3: no ancestors or all ancestors at unit pose and unchanged inner scale returns translate', () => {
        expect(
            keepPath({
                delta: { x: 0.01, y: 0 },
                ancestors: [],
            })
        ).toBe('translate')

        expect(
            keepPath({
                delta: { x: -15, y: 40 },
                ancestors: [
                    {
                        pose: { sx: 1 + 5e-13, sy: 1 - 5e-13 },
                        innerNow: { sx: 2, sy: 0.5 * (1 + 5e-13) },
                        innerPlanned: { sx: 2, sy: 0.5 },
                    },
                    {
                        pose: { sx: 1, sy: 1 },
                        innerNow: { sx: 1, sy: 1 },
                        innerPlanned: { sx: 1, sy: 1 },
                    },
                ],
            })
        ).toBe('translate')
    })
})

describe('measure: staleReported (§4.4)', () => {
    const baseBox: Box = { x: 10, y: 20, w: 100, h: 50 }
    const diff = (from: Box, to: Box) =>
        moved(from, to, { mode: true, anchor: null, fx: 0.5, fy: 0.5 })

    it('ST-1: undriven nodes — lastKnown === null is true; otherwise difference >= threshold', () => {
        const neverKnown: StaleNode = {
            driven: false,
            a: baseBox,
            lastKnown: null,
            delta: { x: 0, y: 0 },
            rho: { x: 1, y: 1 },
            translationExact: true,
        }
        expect(staleReported(neverKnown, 1, diff)).toBe(true)

        const unmoved: StaleNode = {
            driven: false,
            a: { ...baseBox, x: 10.5 },
            lastKnown: baseBox,
            delta: { x: 0, y: 0 },
            rho: { x: 1, y: 1 },
            translationExact: true,
        }
        expect(staleReported(unmoved, 1, diff)).toBe(false)

        const jumped: StaleNode = {
            driven: false,
            a: { ...baseBox, x: 11 },
            lastKnown: baseBox,
            delta: { x: 0, y: 0 },
            rho: { x: 1, y: 1 },
            translationExact: true,
        }
        expect(staleReported(jumped, 1, diff)).toBe(true)
    })

    it('ST-2: driven nodes — max(|dx|*max(1,rho.x), |dy|*max(1,rho.y)) >= threshold, or >= 0.01 when !translationExact', () => {
        const exactSmall: StaleNode = {
            driven: true,
            a: baseBox,
            lastKnown: baseBox,
            delta: { x: 0.5, y: -0.8 },
            rho: { x: 1, y: 1 },
            translationExact: true,
        }
        expect(staleReported(exactSmall, 1, diff)).toBe(false)

        const exactLarge: StaleNode = {
            driven: true,
            a: baseBox,
            lastKnown: baseBox,
            delta: { x: 0.2, y: -1 },
            rho: { x: 1, y: 1 },
            translationExact: true,
        }
        expect(staleReported(exactLarge, 1, diff)).toBe(true)

        const inexactSubThreshold: StaleNode = {
            driven: true,
            a: baseBox,
            lastKnown: baseBox,
            delta: { x: 0.01, y: 0 },
            rho: { x: 1, y: 1 },
            translationExact: false,
        }
        expect(staleReported(inexactSubThreshold, 1, diff)).toBe(true)

        const inexactTiny: StaleNode = {
            driven: true,
            a: baseBox,
            lastKnown: baseBox,
            delta: { x: 0.009, y: -0.005 },
            rho: { x: 1, y: 1 },
            translationExact: false,
        }
        expect(staleReported(inexactTiny, 1, diff)).toBe(false)

        // J-004: delta = 0.009 px amplified by ancestor scale rho = 323 (2.907 px) is reported stale
        const amplified: StaleNode = {
            driven: true,
            a: baseBox,
            lastKnown: baseBox,
            delta: { x: 0.009, y: 0 },
            rho: { x: 323, y: 1 },
            translationExact: false,
        }
        expect(staleReported(amplified, 1, diff)).toBe(true)
    })
})
