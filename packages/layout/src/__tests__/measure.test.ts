import { describe, expect, it } from 'vitest'
import type { Box, Pose } from '../geometry'
import {
    keepPath,
    type PresentedNode,
    presentedLayoutBoxes,
    type StaleNode,
    type SupportNode,
    screenBound,
    staleReported,
    supportCheck,
    translationExact,
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
                },
                {
                    parent: 0,
                    rect: { w: 1000 * totalScale, h: 1000 * totalScale },
                    offset: [1000, 1000],
                    pose: childPose,
                },
            ]
            const res = supportCheck(
                nodes,
                () => ({ sx: 1, sy: 1 }),
                (i) => (i === 0 ? { w: 50.49, h: 50.49 } : { w: 1000, h: 1000 })
            )
            expect(res.supported).toEqual([true, true])
            // E is the exact model: the pose scale, never a measurement
            expect(res.scales[0]).toEqual({ sx: totalScale, sy: totalScale })
            expect(res.scales[1]).toEqual({ sx: totalScale, sy: totalScale })
            expect(res.reads).toEqual([])

            // Also when the scale sits on the parent's inner map instead of its pose
            const nodesInner: SupportNode[] = [
                {
                    parent: -1,
                    rect: { w: 50.49 * totalScale, h: 50.49 * totalScale },
                    offset: [50, 50],
                    pose: { sx: 1, sy: 1 },
                },
                {
                    parent: 0,
                    rect: { w: 1000 * totalScale, h: 1000 * totalScale },
                    offset: [1000, 1000],
                    pose: { sx: 1, sy: 1 },
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
            expect(resInner.scales[1]).toEqual({
                sx: totalScale,
                sy: totalScale,
            })
        }
    })

    it('SC-2: property — 20,000 random supported chains and trees, with assumed inner scales hiding inside M, have zero false positives', () => {
        const random = rng(0x5c02_2026)
        let totalNodes = 0
        let totalReads = 0
        let unsupportedCount = 0
        let modelViolations = 0
        /** Reads of an ancestor whose assumed q hid inside its own M. */
        let hiddenReads = 0

        for (let trial = 0; trial < 20_000; trial++) {
            const maxDepth = 1 + Math.floor(random() * 6)
            const pixelSnap = trial % 2 === 1
            const parents: number[] = []
            const trueW: number[] = []
            const trueH: number[] = []
            const poseScales: { sx: number; sy: number }[] = []
            const innerScales: { sx: number; sy: number }[] = []
            const totalScales: { sx: number; sy: number }[] = []
            const hidden: boolean[] = []

            const buildLevel = (parentIdx: number, depth: number) => {
                const idx = parents.length
                parents.push(parentIdx)

                const w = randomLayoutSize(random)
                const h = randomLayoutSize(random)
                const psx = randomPoseScale(random)
                const psy = randomPoseScale(random)
                let isx = randomInnerScale(random)
                let isy = randomInnerScale(random)
                // an inner scale within the node's own rounding interval: the
                // node passes on q = 1, and a larger descendant must verify it
                const hides = random() < 0.25 && w > 2 && h > 2
                if (hides) {
                    isx = 1 + (random() * 2 - 1) * (0.9 / (w + 1))
                    isy = 1 + (random() * 2 - 1) * (0.9 / (h + 1))
                }
                hidden.push(hides)
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
            }))

            const read = new Set<number>()
            const res = supportCheck(
                nodes,
                (i) => {
                    expect(read.has(i)).toBe(false)
                    read.add(i)
                    return innerScales[i]!
                },
                (i) => ({ w: trueW[i]!, h: trueH[i]! })
            )
            totalNodes += nodes.length
            totalReads += res.reads.length

            for (let i = 0; i < nodes.length; i++) {
                if (!res.supported[i]) {
                    unsupportedCount += 1
                    continue
                }
                // with every q on its chain read, E is the true total scale
                let chainRead = true
                for (let k = i; k >= 0; k = parents[k]!) {
                    if (!read.has(k) && innerScales[k]!.sx !== 1) {
                        chainRead = false
                    }
                    if (!read.has(k) && innerScales[k]!.sy !== 1) {
                        chainRead = false
                    }
                }
                if (!chainRead) continue
                const e = res.scales[i]!
                const ts = totalScales[i]!
                if (
                    Math.abs(e.sx - ts.sx) > 1e-9 * ts.sx ||
                    Math.abs(e.sy - ts.sy) > 1e-9 * ts.sy
                ) {
                    modelViolations += 1
                }
            }
            for (const k of res.reads) {
                if (hidden[k] && parents.some((parent) => parent === k)) {
                    hiddenReads += 1
                }
            }
        }

        expect(unsupportedCount).toBe(0)
        expect(modelViolations).toBe(0)
        // verification ran on hidden ancestors
        expect(hiddenReads).toBeGreaterThan(100)
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
            },
            {
                parent: 0,
                rect: { w: 1000 * 1.03, h: 1000 * 1.03 },
                offset: [1000, 1000],
                pose: { sx: 1, sy: 1 },
            },
            {
                parent: 1,
                rect: { w: 200 * 1.03, h: 200 * 1.03 },
                offset: [200, 200],
                pose: { sx: 1, sy: 1 },
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
        expect(res3Pct.scales[0]).toEqual({ sx: 1, sy: 1 })
        expect(res3Pct.scales[1]).toBeNull()
        expect(res3Pct.scales[2]).toBeNull()
        // the failing chain is verified top-down; the subtree is not read
        expect(res3Pct.reads).toEqual([0, 1])

        // Under a 1000px parent, E is exact: a child with O = 1000 and true
        // width W fails when z · W / 1001 > E or z · W / 999 < E, whatever
        // the parent's own rounding interval.
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
                },
                {
                    parent: 0,
                    rect: {
                        w: childW * parentInner * zoom,
                        h: childW * parentInner * zoom,
                    },
                    offset: [1000, 1000],
                    pose: { sx: 1, sy: 1 },
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

        // Fractional 1000.4px child (offset 1000) under a 1000px parent:
        // 1.002 · 1000.4 / 1001 > 1 is detected; 1.0005 · 1000.4 / 1001 < 1 is not
        expect(checkChildZoom(1.002, 1, 1000.4).supported).toEqual([
            true,
            false,
        ])
        expect(checkChildZoom(1.0005, 1, 1000.4).supported).toEqual([
            true,
            true,
        ])

        // Exact 1000px child under a parent whose inner scale 1.5 is read
        expect(checkChildZoom(1.002, 1.5, 1000).supported).toEqual([
            true,
            false,
        ])
        expect(checkChildZoom(1.0005, 1.5, 1000).supported).toEqual([
            true,
            true,
        ])
    })

    it('SC-4: the classifier runs on every node read: a rotated node fails with its subtree, a rotated ancestor read in verification fails with its subtree; reads <= 1 per node, zero when matching', () => {
        const narrowNodes: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 500, h: 400 },
                offset: [500, 400],
                pose: { sx: 1, sy: 1 },
            },
            {
                parent: 0,
                rect: { w: 300, h: 250 },
                offset: [300, 250],
                pose: { sx: 1, sy: 1 },
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

        const badTree: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 400, h: 400 },
                offset: [400, 400],
                pose: { sx: 1, sy: 1 },
            },
            {
                parent: 0,
                // mismatches E = 1 (rect is 2x offset), triggering verification
                rect: { w: 600, h: 600 },
                offset: [300, 300],
                pose: { sx: 1, sy: 1 },
            },
            {
                parent: 1,
                rect: { w: 100, h: 100 },
                offset: [50, 50],
                pose: { sx: 1, sy: 1 },
            },
        ]
        // the failing node itself is rotated
        const callCounts = [0, 0, 0]
        const badRes = supportCheck(
            badTree,
            (i) => {
                callCounts[i]! += 1
                return i === 1 ? 'unsupported' : { sx: 1, sy: 1 }
            },
            (i) => ({ w: badTree[i]!.offset[0], h: badTree[i]!.offset[1] })
        )
        expect(badRes.supported).toEqual([true, false, false])
        expect(badRes.scales[0]).not.toBeNull()
        expect(badRes.scales[1]).toBeNull()
        expect(badRes.scales[2]).toBeNull()
        expect(badRes.reads).toEqual([0, 1])
        expect(callCounts).toEqual([1, 1, 0])

        // its ancestor is rotated: read first (top-down), it fails with its subtree
        const ancestorCounts = [0, 0, 0]
        const ancestorRes = supportCheck(
            badTree,
            (i) => {
                ancestorCounts[i]! += 1
                return i === 0 ? 'unsupported' : { sx: 1, sy: 1 }
            },
            (i) => ({ w: badTree[i]!.offset[0], h: badTree[i]!.offset[1] })
        )
        expect(ancestorRes.supported).toEqual([false, false, false])
        expect(ancestorRes.reads).toEqual([0])
        expect(ancestorCounts).toEqual([1, 0, 0])

        // a small parent with its scale on its inner map: read once, on its own
        // failing comparison; its matching child is never read
        const smallParentCounts = [0, 0]
        const smallParentNodes: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 80, h: 80 },
                offset: [40, 40],
                pose: { sx: 1, sy: 1 },
            },
            {
                parent: 0,
                rect: { w: 200, h: 200 },
                offset: [100, 100],
                pose: { sx: 1, sy: 1 },
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
        expect(smallParentCounts).toEqual([1, 0])

        // an assumed q that hides inside a small parent's M: the large child's
        // first comparison fails, verification reads the parent, both pass
        const hiddenCounts = [0, 0]
        const hiddenNodes: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 40 * 1.01, h: 40 },
                offset: [40, 40],
                pose: { sx: 1, sy: 1 },
            },
            {
                parent: 0,
                rect: { w: 1000 * 1.01, h: 1000 },
                offset: [1000, 1000],
                pose: { sx: 1, sy: 1 },
            },
        ]
        const hiddenRes = supportCheck(
            hiddenNodes,
            (i) => {
                hiddenCounts[i]! += 1
                return i === 0 ? { sx: 1.01, sy: 1 } : { sx: 1, sy: 1 }
            },
            (i) => ({ w: hiddenNodes[i]!.offset[0], h: 40 })
        )
        expect(hiddenRes.supported).toEqual([true, true])
        expect(hiddenRes.reads).toEqual([0, 1])
        expect(hiddenCounts).toEqual([1, 1])
        expect(hiddenRes.scales[1]!.sx).toBeCloseTo(1.01, 12)
    })

    it('SC-5: degenerate axes (offset 0 or 1) use the exact size and never fail by themselves', () => {
        const nodes: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 0, h: 3 },
                offset: [0, 1],
                pose: { sx: 2, sy: 1.5 },
            },
            {
                parent: 0,
                rect: { w: 600, h: 600 },
                offset: [200, 200],
                pose: { sx: 1, sy: 1 },
            },
            {
                parent: 0,
                rect: { w: 0, h: 0 },
                offset: [1, 0],
                pose: { sx: 0.5, sy: 0.5 },
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
        // the parent's expected scale: x = 1 * 2 * 1.5 = 3, y = 1 * 1.5 * 2 = 3
        expect(res.scales[0]).toEqual({ sx: 3, sy: 3 })
        expect(res.reads).toEqual([0])
        // only nodes 0 and 2 have a degenerate axis (offset <= 1)
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
        expect(res1px.scales).toEqual([null])
        expect(res1px.reads).toEqual([0])
        expect(exactCalls1).toEqual([0])

        // Sub-half-pixel leaf (O = 0, W = 0.4) under unowned zoom: 2 -> rect is 0.8x0.8
        const leaf0px: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 0.8, h: 0.8 },
                offset: [0, 0],
                pose: { sx: 1, sy: 1 },
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
        expect(res0px.scales).toEqual([null])
        expect(res0px.reads).toEqual([0])
        expect(exactCalls0).toEqual([0])

        // True zero-size leaf (O = 0, W = 0) stays supported because the plan snaps zero size
        const zeroLeaf: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 0, h: 40 },
                offset: [0, 40],
                pose: { sx: 1, sy: 1 },
            },
        ]
        const resZero = supportCheck(
            zeroLeaf,
            () => ({ sx: 1, sy: 1 }),
            () => ({ w: 0, h: 40 })
        )
        expect(resZero.supported).toEqual([true])
    })

    it('SC-7 (P0-N002): a chain of 201 px participant squares with skewX 0.0048 per level is detected at the first participant the composed skew moves out of its own M, never deeper, at 3 and 1,999 levels', () => {
        const SIDE = 201
        const SHEAR = 0.0048
        /** The rect of level n (1-based): skewX composes additively. */
        const chain = (levels: number): SupportNode[] =>
            Array.from({ length: levels }, (_, i) => ({
                parent: i - 1,
                rect: { w: SIDE * (1 + SHEAR * (i + 1)), h: SIDE },
                offset: [SIDE, SIDE] as const,
                pose: { sx: 1, sy: 1 },
            }))
        // the first level whose rect leaves M = [R / 202, R / 200] around E = 1
        let first = 0
        while (
            (SIDE * (1 + SHEAR * (first + 1)) * (1 - 1e-6)) / (SIDE + 1) <=
            1
        ) {
            first += 1
        }
        expect(first).toBe(1)

        for (const levels of [3, 1999]) {
            const nodes = chain(levels)
            // a skew the scale reader cannot see: the measurement detects it
            const res = supportCheck(
                nodes,
                () => ({ sx: 1, sy: 1 }),
                () => ({ w: SIDE, h: SIDE })
            )
            expect(res.supported.indexOf(false)).toBe(first)
            expect(res.supported.slice(0, first).every(Boolean)).toBe(true)
            expect(res.supported.slice(first).some(Boolean)).toBe(false)
            // verification read the failing chain once, nothing deeper
            expect(res.reads).toEqual(
                Array.from({ length: first + 1 }, (_, i) => i)
            )

            // the classifier sees each level's skew: the first failing
            // comparison verifies the chain top-down and snaps its root
            const classified = supportCheck(
                nodes,
                () => 'unsupported',
                () => ({ w: SIDE, h: SIDE })
            )
            expect(classified.supported.some(Boolean)).toBe(false)
            expect(classified.reads).toEqual([0])
        }
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
    const still = {
        pose: { sx: 1, sy: 1 },
        innerNow: { sx: 1, sy: 1 },
        innerPlanned: { sx: 1, sy: 1 },
    }
    const live300 = {
        pose: { sx: 300, sy: 300 },
        innerNow: { sx: 1, sy: 1 },
        innerPlanned: { sx: 1, sy: 1 },
    }
    const jump = (x: number, y = 0, w = 0, h = 0) => ({ x, y, w, h })

    it('KP-1: the measured jump decides path 1: |J| < 0.01 on every edge is unchanged, whatever the ancestors', () => {
        expect(keepPath({ jump: jump(0), ancestors: [] })).toBe('unchanged')
        // |J| = 0.0099 under a skewed, live-scale chain: J already holds
        // every map above the node, so the track is left alone
        expect(
            keepPath({
                jump: jump(0.0099, -0.0099, 0.0099, -0.0099),
                ancestors: [live300, live300],
            })
        ).toBe('unchanged')
        // any edge at 0.01 is a jump: under the live scale it retargets
        for (const edge of [
            jump(0.01),
            jump(0, -0.01),
            jump(0, 0, 0.01),
            jump(0, 0, 0, -0.0100001),
        ]) {
            expect(keepPath({ jump: edge, ancestors: [live300] })).toBe(
                'retarget'
            )
            expect(keepPath({ jump: edge, ancestors: [still] })).toBe(
                'translate'
            )
        }
        // J-001: a sub-0.01 px δ under an ancestor scale of 323 measures
        // 2.907 px on screen: not unchanged
        expect(
            keepPath({ jump: jump(0.009 * 323), ancestors: [live300] })
        ).toBe('retarget')
    })

    it('KP-2: ancestor pose != 1 or innerNow != innerPlanned returns retarget', () => {
        expect(
            keepPath({
                jump: jump(20),
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
                jump: jump(0, 0.01),
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
                jump: jump(10, 5),
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
                jump: jump(10, 5),
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
        expect(keepPath({ jump: jump(0.01), ancestors: [] })).toBe('translate')

        const exactChain = [
            {
                pose: { sx: 1 + 5e-13, sy: 1 - 5e-13 },
                innerNow: { sx: 2, sy: 0.5 * (1 + 5e-13) },
                innerPlanned: { sx: 2, sy: 0.5 },
            },
            still,
        ]
        expect(keepPath({ jump: jump(-15, 40), ancestors: exactChain })).toBe(
            'translate'
        )
        expect(translationExact(exactChain)).toBe(true)
        expect(translationExact([])).toBe(true)
        expect(translationExact([still, live300])).toBe(false)
    })
})

describe('measure: staleReported and screenBound (§4.4)', () => {
    const baseBox: Box = { x: 10, y: 20, w: 100, h: 50 }
    const diff = (from: Box, to: Box) =>
        moved(from, to, { mode: true, anchor: null, fx: 0.5, fy: 0.5 })
    const driven = (bound: number, translationExact: boolean): StaleNode => ({
        driven: true,
        a: baseBox,
        lastKnown: null,
        bound,
        translationExact,
    })

    it('ST-1: undriven nodes — lastKnown === null is true; otherwise difference >= threshold', () => {
        const undriven = (a: Box, lastKnown: Box | null): StaleNode => ({
            driven: false,
            a,
            lastKnown,
            bound: 0,
            translationExact: true,
        })
        expect(staleReported(undriven(baseBox, null), 1, diff)).toBe(true)
        expect(
            staleReported(undriven({ ...baseBox, x: 10.5 }, baseBox), 1, diff)
        ).toBe(false)
        expect(
            staleReported(undriven({ ...baseBox, x: 11 }, baseBox), 1, diff)
        ).toBe(true)
    })

    it('ST-2: driven nodes — β >= threshold, or β >= 0.01 when the translation is not exact', () => {
        expect(staleReported(driven(0.8, true), 1, diff)).toBe(false)
        expect(staleReported(driven(1, true), 1, diff)).toBe(true)
        expect(staleReported(driven(0.01, false), 1, diff)).toBe(true)
        expect(staleReported(driven(0.0099, false), 1, diff)).toBe(false)
        // no inputs: reported
        expect(
            staleReported(driven(Number.POSITIVE_INFINITY, true), 1, diff)
        ).toBe(true)
        expect(staleReported(driven(Number.NaN, true), 1, diff)).toBe(true)
    })

    it('ST-3: β = (R_axis / min(w, h))·max(e_x, e_y), e = |Δx| + (1 + 2s)·max(1, |f|)·|Δw|; the top level has factor 1', () => {
        const change = { x: 0.3, y: -0.2, w: 0.1, h: 0 }
        // top level: e_x = 0.3 + 3·1·0.1 = 0.6, e_y = 0.2
        expect(
            screenBound({
                change,
                pose: { sx: 1, sy: 1 },
                origin: { fx: 0.5, fy: 0.5 },
                parent: null,
            })
        ).toBeCloseTo(0.6, 12)
        // an origin outside the box and a pose scale of 2: e_x = 0.3 + 5·1.5·0.1
        expect(
            screenBound({
                change,
                pose: { sx: 2, sy: 1 },
                origin: { fx: -1.5, fy: 0 },
                parent: null,
            })
        ).toBeCloseTo(1.05, 12)
        // J-004: a 0.009 px change under a parent drawn 300× (100 → 30,000 px)
        const amplified = screenBound({
            change: { x: 0.009, y: 0, w: 0, h: 0 },
            pose: { sx: 1, sy: 1 },
            origin: { fx: 0.5, fy: 0.5 },
            parent: {
                rect: { w: 30_000, h: 300 },
                size: { w: 99, h: 99 },
            },
        })
        expect(amplified).toBeCloseTo((30_000 / 99) * 0.009, 9)
        expect(staleReported(driven(amplified, true), 1, diff)).toBe(true)
        // a zero-size parent side bounds nothing: reported
        expect(
            screenBound({
                change: { x: 0, y: 0, w: 0, h: 0 },
                pose: { sx: 1, sy: 1 },
                origin: { fx: 0, fy: 0 },
                parent: { rect: { w: 0, h: 10 }, size: { w: 0, h: 10 } },
            })
        ).toBe(Number.POSITIVE_INFINITY)
    })

    it('ST-4: property — over random affine 2×2 maps with off-diagonals, box sizes and pose scales, no edge moves on screen by more than β', () => {
        const random = rng(0x5b07_2026)
        const signed = (scale: number) => (random() * 2 - 1) * scale
        let worst = 0
        for (let trial = 0; trial < 20_000; trial++) {
            // the parent's linear map, with skew and rotation
            const a = signed(3)
            const b = random() < 0.5 ? 0 : signed(1)
            const c = random() < 0.5 ? 0 : signed(1)
            const d = signed(3)
            const pw = 1 + random() * 600
            const ph = 1 + random() * 600
            const rect = {
                w: Math.abs(a) * pw + Math.abs(c) * ph,
                h: Math.abs(b) * pw + Math.abs(d) * ph,
            }
            const s = { sx: 0.05 + random() * 5, sy: 0.05 + random() * 5 }
            const f = { fx: signed(2), fy: signed(2) }
            const t = { x: signed(100), y: signed(100) }
            const box: Box = {
                x: signed(300),
                y: signed(300),
                w: 1 + random() * 300,
                h: 1 + random() * 300,
            }
            const change = {
                x: signed(random() < 0.5 ? 0.01 : 20),
                y: signed(random() < 0.5 ? 0.01 : 20),
                w: random() < 0.3 ? 0 : signed(10),
                h: random() < 0.3 ? 0 : signed(10),
            }
            const after: Box = {
                x: box.x + change.x,
                y: box.y + change.y,
                w: Math.max(0.5, box.w + change.w),
                h: Math.max(0.5, box.h + change.h),
            }
            const real = {
                ...change,
                w: after.w - box.w,
                h: after.h - box.h,
            }
            /** The drawn box's corners on screen, with the pose held. */
            const screen = (layout: Box): [number, number][] => {
                const ox = layout.x + f.fx * layout.w
                const oy = layout.y + f.fy * layout.h
                const corners: [number, number][] = [
                    [layout.x, layout.y],
                    [layout.x + layout.w, layout.y],
                    [layout.x, layout.y + layout.h],
                    [layout.x + layout.w, layout.y + layout.h],
                ]
                return corners.map(([x, y]) => {
                    const dx = ox + s.sx * (x - ox) + t.x
                    const dy = oy + s.sy * (y - oy) + t.y
                    return [a * dx + c * dy, b * dx + d * dy]
                })
            }
            const edges = (points: [number, number][]) => [
                Math.min(...points.map((p) => p[0])),
                Math.max(...points.map((p) => p[0])),
                Math.min(...points.map((p) => p[1])),
                Math.max(...points.map((p) => p[1])),
            ]
            const from = edges(screen(box))
            const to = edges(screen(after))
            const moved = Math.max(...from.map((v, i) => Math.abs(to[i]! - v)))
            const bound = screenBound({
                change: real,
                pose: s,
                origin: f,
                parent: { rect, size: { w: pw, h: ph } },
            })
            expect(moved).toBeLessThanOrEqual(bound * (1 + 1e-9) + 1e-9)
            if (bound > 0) worst = Math.max(worst, moved / bound)
        }
        // the bound is attained up to a constant, not vacuous
        expect(worst).toBeGreaterThan(0.1)
    })
})
