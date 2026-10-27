import { describe, expect, it } from 'vitest'
import type { Box, Pose } from '../geometry'
import {
    keepPath,
    type PresentedNode,
    presentedLayoutBoxes,
    presentedVelocities,
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

    /**
     * The reviewer's scene: p is 100 px with q = 1.003 hiding in its own M;
     * j is 2000 px under a non-participant zoom of 1/1.003 (its rect is
     * 2000 px, its true E is 1.003); i is 2000 px under p alone.
     */
    function reviewerScene(order: 'jFirst' | 'iFirst') {
        const q = 1.003
        const p: SupportNode = {
            parent: -1,
            rect: { w: 100 * q, h: 100 * q },
            offset: [100, 100],
            pose: { sx: 1, sy: 1 },
        }
        const j: SupportNode = {
            parent: 0,
            rect: { w: 2000 * q * (1 / q), h: 2000 * q * (1 / q) },
            offset: [2000, 2000],
            pose: { sx: 1, sy: 1 },
        }
        const i: SupportNode = {
            parent: 0,
            rect: { w: 2000 * q, h: 2000 * q },
            offset: [2000, 2000],
            pose: { sx: 1, sy: 1 },
        }
        const nodes = order === 'jFirst' ? [p, j, i] : [p, i, j]
        const jAt = order === 'jFirst' ? 1 : 2
        const iAt = order === 'jFirst' ? 2 : 1
        return { q, nodes, jAt, iAt }
    }

    for (const order of ['jFirst', 'iFirst'] as const) {
        const name = order === 'jFirst' ? '[p, j, i]' : '[p, i, j]'
        it(`SC-8: order independence — in the order ${name}, reading p's q while verifying i compares j again, and j is detected; every node is read at most once`, () => {
            const { q, nodes, jAt, iAt } = reviewerScene(order)
            const res = supportCheck(
                nodes,
                (k) => (k === 0 ? { sx: q, sy: q } : { sx: 1, sy: 1 }),
                () => ({ w: Number.NaN, h: Number.NaN })
            )
            const expected = [true, true, true]
            expected[jAt] = false
            expect(res.supported).toEqual(expected)
            expect(res.scales[iAt]).toEqual({ sx: q, sy: q })
            // p is read for i, then j for its own verification
            expect(res.reads).toEqual([0, iAt, jAt])
        })

        it(`SC-8: values already read — in the order ${name}, p's q known from a value already read is used at the first comparison and not read again`, () => {
            const { q, nodes, jAt } = reviewerScene(order)
            const res = supportCheck(
                nodes,
                () => ({ sx: 1, sy: 1 }),
                () => ({ w: Number.NaN, h: Number.NaN }),
                (k) => (k === 0 ? { sx: q, sy: q } : null)
            )
            const expected = [true, true, true]
            expected[jAt] = false
            expect(res.supported).toEqual(expected)
            expect(res.reads).toEqual([jAt])
            // a known classifier failure snaps the node and its subtree, unread
            const rotated = supportCheck(
                nodes,
                () => ({ sx: 1, sy: 1 }),
                () => ({ w: Number.NaN, h: Number.NaN }),
                (k) => (k === 0 ? 'unsupported' : null)
            )
            expect(rotated.supported).toEqual([false, false, false])
            expect(rotated.reads).toEqual([])
        })
    }

    /** Nodes whose every field access is counted: the check's work. */
    function counted(nodes: SupportNode[]): {
        nodes: SupportNode[]
        work: () => number
    } {
        let work = 0
        const wrapped = nodes.map((node) => ({
            get parent() {
                work += 1
                return node.parent
            },
            get rect() {
                work += 1
                return node.rect
            },
            get offset() {
                work += 1
                return node.offset
            },
            get pose() {
                work += 1
                return node.pose
            },
        }))
        return { nodes: wrapped, work: () => work }
    }

    it('SC-9: work stays linear — 1,000 nodes that all fail their first comparison (siblings under a zoom, top-level nodes under a zoom, a 1,000-deep chain hiding q = 1.01 at every level): each read once, and field accesses within a small constant per node', () => {
        const N = 1000
        const unit = { sx: 1, sy: 1 }
        const flat: SupportNode[] = [
            {
                parent: -1,
                rect: { w: 200, h: 200 },
                offset: [200, 200],
                pose: unit,
            },
            ...Array.from({ length: N - 1 }, () => ({
                parent: 0,
                rect: { w: 220, h: 220 },
                offset: [200, 200] as const,
                pose: unit,
            })),
        ]
        const top: SupportNode[] = Array.from({ length: N }, () => ({
            parent: -1,
            rect: { w: 220, h: 220 },
            offset: [200, 200] as const,
            pose: unit,
        }))
        const deep: SupportNode[] = Array.from({ length: N }, (_, k) => ({
            parent: k - 1,
            rect: { w: 200 * 1.01 ** (k + 1), h: 200 * 1.01 ** (k + 1) },
            offset: [200, 200] as const,
            pose: unit,
        }))
        const cases = [
            {
                nodes: flat,
                q: unit,
                supported: [true, ...new Array(N - 1).fill(false)],
            },
            { nodes: top, q: unit, supported: new Array(N).fill(false) },
            {
                nodes: deep,
                q: { sx: 1.01, sy: 1.01 },
                supported: new Array(N).fill(true),
            },
        ]
        for (const c of cases) {
            const { nodes, work } = counted(c.nodes)
            const res = supportCheck(
                nodes,
                () => c.q,
                () => ({ w: Number.NaN, h: Number.NaN })
            )
            expect(res.supported).toEqual(c.supported)
            expect(res.reads.length).toBe(N)
            expect(new Set(res.reads).size).toBe(N)
            expect(work()).toBeLessThan(30 * N)
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

describe('measure: presentedVelocities (§4.2 Velocity)', () => {
    it('PV-1: property — 5,000 random nested trees (depth <= 4) with poses moving at random rates (translate and scale) and static inner maps: v is the derivative of the drawn box, to 1e-9 relative of a 5-point difference (exact for these polynomials)', () => {
        const random = rng(0x7e10_c17e)
        let maxRelErr = 0
        let offsetTerm = 0
        for (let trial = 0; trial < 5000; trial++) {
            const maxDepth = 1 + Math.floor(random() * 4)
            const domNodes: ONode[] = []
            const poses: Pose[] = []
            const rates: (Pose | null)[] = []
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
                domNodes.push({
                    parent,
                    css,
                    ox: css.x + origin[0],
                    oy: css.y + origin[1],
                    inner: randomPose(random, 0.4),
                })
                poses.push(randomPose(random, 0.3))
                rates.push(
                    random() < 0.3
                        ? null
                        : {
                              tx: (random() - 0.5) * 1000,
                              ty: (random() - 0.5) * 1000,
                              sx: (random() - 0.5) * 6,
                              sy: (random() - 0.5) * 6,
                          }
                )
                origins.push(origin)
                if (depth < maxDepth) {
                    const children = 1 + Math.floor(random() * 2)
                    for (let c = 0; c < children; c++) {
                        if (domNodes.length < 12) build(idx, depth + 1)
                    }
                }
            }
            build(-1, 1)
            const posesAt = (t: number): Pose[] =>
                poses.map((p, i) => {
                    const r = rates[i]
                    if (!r) return p
                    return {
                        tx: p.tx + r.tx * t,
                        ty: p.ty + r.ty * t,
                        sx: p.sx + r.sx * t,
                        sy: p.sy + r.sy * t,
                    }
                })
            const nodes: PresentedNode[] = domNodes.map((n, i) => ({
                parent: n.parent,
                rect: rendered(i, domNodes, poses),
                pose: poses[i]!,
                inner: n.inner,
                origin: origins[i]!,
            }))
            const got = presentedVelocities(nodes, rates)
            // each drawn coordinate is a polynomial of degree <= 4 in t
            const h = 0.01
            const at = [-2, -1, 1, 2].map((m) => posesAt(m * h))
            for (let i = 0; i < domNodes.length; i++) {
                const [a, b, c, d] = at.map((p) => rendered(i, domNodes, p))
                const fd = (k: keyof Box) =>
                    (a![k] - 8 * b![k] + 8 * c![k] - d![k]) / (12 * h)
                const expected = {
                    x: fd('x'),
                    y: fd('y'),
                    w: fd('w'),
                    h: fd('h'),
                }
                // the screen motion of the node's offset in a scaling parent
                // frame, which the node's own pose rate alone does not carry
                if (domNodes[i]!.parent >= 0 && rates[domNodes[i]!.parent]) {
                    offsetTerm += 1
                }
                const scale = Math.max(
                    1,
                    ...(['x', 'y', 'w', 'h'] as const).map((k) =>
                        Math.abs(expected[k])
                    )
                )
                const err =
                    Math.max(
                        ...(['x', 'y', 'w', 'h'] as const).map((k) =>
                            Math.abs(got[i]![k] - expected[k])
                        )
                    ) / scale
                if (err > maxRelErr) maxRelErr = err
            }
        }
        expect(offsetTerm).toBeGreaterThan(1000)
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
                frame: 0,
                change,
                pose: { sx: 1, sy: 1 },
                origin: { fx: 0.5, fy: 0.5 },
                parent: null,
            })
        ).toBeCloseTo(0.6, 12)
        // an origin outside the box and a pose scale of 2: e_x = 0.3 + 5·1.5·0.1
        expect(
            screenBound({
                frame: 0,
                change,
                pose: { sx: 2, sy: 1 },
                origin: { fx: -1.5, fy: 0 },
                parent: null,
            })
        ).toBeCloseTo(1.05, 12)
        // J-004: a 0.009 px change under a parent drawn 300× (100 → 30,000 px)
        const amplified = screenBound({
            frame: 0,
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
                frame: 0,
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
                frame: 0,
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

    /**
     * A two-level chain under a map `G` above the parent: the parent's and the
     * child's layouts move and resize, each pose is held relative to its
     * layout box (§4.4). Returns the child's drawn corners before and after.
     */
    type Chain = {
        g: {
            a: number
            b: number
            c: number
            d: number
            ex: number
            ey: number
        }
        gsize: { w: number; h: number }
        parent: {
            box: Box
            change: Box
            s: { sx: number; sy: number }
            f: { fx: number; fy: number }
            t: { x: number; y: number }
        }
        child: {
            rel: Box
            change: Box
            s: { sx: number; sy: number }
            f: { fx: number; fy: number }
            t: { x: number; y: number }
        }
    }
    const corners = (b: Box): [number, number][] => [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x, b.y + b.h],
        [b.x + b.w, b.y + b.h],
    ]
    const posed = (
        b: Box,
        s: { sx: number; sy: number },
        f: { fx: number; fy: number },
        t: { x: number; y: number }
    ) => {
        const ox = b.x + f.fx * b.w
        const oy = b.y + f.fy * b.h
        return ([x, y]: [number, number]): [number, number] => [
            ox + t.x + s.sx * (x - ox),
            oy + t.y + s.sy * (y - oy),
        ]
    }
    const grow = (b: Box, d: Box): Box => ({
        x: b.x + d.x,
        y: b.y + d.y,
        w: b.w + d.w,
        h: b.h + d.h,
    })
    const drawnChain = (k: Chain, after: boolean) => {
        const P = after ? grow(k.parent.box, k.parent.change) : k.parent.box
        const rel = after ? grow(k.child.rel, k.child.change) : k.child.rel
        const C: Box = { x: P.x + rel.x, y: P.y + rel.y, w: rel.w, h: rel.h }
        const G = ([x, y]: [number, number]): [number, number] => [
            k.g.a * x + k.g.c * y + k.g.ex,
            k.g.b * x + k.g.d * y + k.g.ey,
        ]
        const parentPose = posed(P, k.parent.s, k.parent.f, k.parent.t)
        const childPose = posed(C, k.child.s, k.child.f, k.child.t)
        return {
            parent: corners(P).map((c) => G(parentPose(c))),
            child: corners(C).map((c) => G(parentPose(childPose(c)))),
        }
    }
    const bboxOf = (points: [number, number][]) => {
        const xs = points.map((p) => p[0])
        const ys = points.map((p) => p[1])
        const x = Math.min(...xs)
        const y = Math.min(...ys)
        return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
    }
    const randomChain = (random: () => number, g: Chain['g']): Chain => {
        const signed = (scale: number) => (random() * 2 - 1) * scale
        const size = () => 2 + random() * 400
        const change = (big: number): Box => ({
            x: signed(random() < 0.5 ? 0.01 : big),
            y: signed(random() < 0.5 ? 0.01 : big),
            w: random() < 0.3 ? 0 : signed(1),
            h: random() < 0.3 ? 0 : signed(1),
        })
        const pose = () => ({
            s: { sx: 0.05 + random() * 5, sy: 0.05 + random() * 5 },
            f: { fx: signed(2), fy: signed(2) },
            t: { x: signed(100), y: signed(100) },
        })
        return {
            g,
            gsize: { w: size(), h: size() },
            parent: {
                box: { x: signed(300), y: signed(300), w: size(), h: size() },
                change: change(30),
                ...pose(),
            },
            child: {
                rel: { x: signed(200), y: signed(200), w: size(), h: size() },
                change: change(10),
                ...pose(),
            },
        }
    }
    const displacement = (from: [number, number][], to: [number, number][]) =>
        Math.max(
            ...from.map((p, i) =>
                Math.max(Math.abs(to[i]![0] - p[0]), Math.abs(to[i]![1] - p[1]))
            )
        )

    it('ST-5: property — a driven child under a driven parent whose layout moves and resizes, poses varying, under any affine map above: no corner of the child moves on screen by more than β = β_π + bound', () => {
        const random = rng(0x5b05_2026)
        const signed = (scale: number) => (random() * 2 - 1) * scale
        let worst = 0
        let framed = 0
        for (let trial = 0; trial < 20_000; trial++) {
            const g = {
                a: signed(3),
                b: random() < 0.5 ? 0 : signed(1),
                c: random() < 0.5 ? 0 : signed(1),
                d: signed(3),
                ex: signed(500),
                ey: signed(500),
            }
            const k = randomChain(random, g)
            const before = drawnChain(k, false)
            const after = drawnChain(k, true)
            const gp = {
                w: Math.abs(g.a) * k.gsize.w + Math.abs(g.c) * k.gsize.h,
                h: Math.abs(g.b) * k.gsize.w + Math.abs(g.d) * k.gsize.h,
            }
            const parentBound = screenBound({
                frame: 0,
                change: k.parent.change,
                pose: k.parent.s,
                origin: k.parent.f,
                parent: { rect: gp, size: k.gsize },
            })
            const P = grow(k.parent.box, k.parent.change)
            const bound = screenBound({
                frame: parentBound,
                change: k.child.change,
                pose: k.child.s,
                origin: k.child.f,
                parent: {
                    rect: bboxOf(after.parent),
                    size: { w: P.w, h: P.h },
                },
            })
            const moved = displacement(before.child, after.child)
            expect(moved).toBeLessThanOrEqual(bound * (1 + 1e-9) + 1e-9)
            if (bound > 0) worst = Math.max(worst, moved / bound)
            // the frame term is needed: without it the bound fails somewhere
            const without = bound - parentBound
            if (moved > without * (1 + 1e-9) + 1e-9) framed += 1
        }
        expect(worst).toBeGreaterThan(0.1)
        expect(framed).toBeGreaterThan(100)
    })

    it("ST-6: property — under an undriven parent (pose identity) the parent's box displacement on any edge bounds its frame, for every map the support check passes (axis-aligned scales, quarter turns)", () => {
        const random = rng(0x5b06_2026)
        const signed = (scale: number) => (random() * 2 - 1) * scale
        let framed = 0
        for (let trial = 0; trial < 20_000; trial++) {
            const kx = 0.1 + random() * 5
            const ky = 0.1 + random() * 5
            const turn = Math.floor(random() * 4)
            const rot = [
                [1, 0, 0, 1],
                [0, 1, -1, 0],
                [-1, 0, 0, -1],
                [0, -1, 1, 0],
            ][turn]!
            const g = {
                a: rot[0]! * kx,
                b: rot[1]! * kx,
                c: rot[2]! * ky,
                d: rot[3]! * ky,
                ex: signed(500),
                ey: signed(500),
            }
            const k = randomChain(random, g)
            k.parent.s = { sx: 1, sy: 1 }
            k.parent.t = { x: 0, y: 0 }
            const before = drawnChain(k, false)
            const after = drawnChain(k, true)
            const from = bboxOf(before.parent)
            const to = bboxOf(after.parent)
            const frame = Math.max(
                Math.abs(to.x - from.x),
                Math.abs(to.y - from.y),
                Math.abs(to.x + to.w - from.x - from.w),
                Math.abs(to.y + to.h - from.y - from.h)
            )
            const P = grow(k.parent.box, k.parent.change)
            const bound = screenBound({
                frame,
                change: k.child.change,
                pose: k.child.s,
                origin: k.child.f,
                parent: {
                    rect: bboxOf(after.parent),
                    size: { w: P.w, h: P.h },
                },
            })
            const moved = displacement(before.child, after.child)
            expect(moved).toBeLessThanOrEqual(bound * (1 + 1e-9) + 1e-9)
            if (moved > (bound - frame) * (1 + 1e-9) + 1e-9) framed += 1
        }
        expect(framed).toBeGreaterThan(100)
    })
})
