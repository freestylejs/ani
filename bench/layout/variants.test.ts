import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ScenePlan, SceneTrace } from './types.ts'
import {
    applyVariantPlan,
    clampReducedSpring,
    REDUCED_GRID,
    selectedVariants,
    variantKey,
    variantSpec,
    variantsForScene,
} from './variants.ts'

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

function trace(): SceneTrace {
    return {
        scene: 's-card',
        mode: 'manual',
        stepMs: 16,
        observations: [
            {
                kind: 'frame',
                frame: 0,
                now: 1000,
                connected: ['card', 'sheet'],
                boxes: { card: box(16, 176, 358, 440), sheet: null },
                opacity: { card: 1, sheet: 1 },
                radii: {},
                style: {},
                font: {},
                samples: {},
                activeElementKey: null,
            },
            {
                kind: 'flush',
                frame: 0,
                now: 1000,
                commitLabel: 'open',
                connected: ['card', 'sheet'],
                boxes: {
                    card: box(16, 176, 358, 440),
                    sheet: box(16, 176, 358, 440),
                },
                opacity: { card: 0, sheet: 1 },
                radii: {},
                style: {},
                font: {},
                samples: {},
                activeElementKey: null,
            },
        ],
        commits: [
            {
                label: 'open',
                frame: 0,
                nBefore: 1,
                nAfter: 2,
                rects: 3,
                offsets: 3,
                styles: 2,
                probes: 0,
                parents: 0,
                frameReads: 0,
                frameReadsAt: null,
                diagnostics: [],
                onSnap: [],
                aged: false,
                agedKeys: [],
                stylesExpected: 2,
                styleRadiusCapture: 0,
                styleActiveFlush: 2,
            },
        ],
        reports: [
            {
                label: 'open',
                status: 'ended',
                snapped: [],
                settledFrame: 0,
            },
        ],
        diagnostics: [],
        onSnap: [],
        settleFrames: [1],
        steadyFrameReads: 0,
        steadyFrameReadsAt: null,
        mounts: {},
        initialBoxes: {},
        aBoxes: {},
        final: {
            tracks: 0,
            holds: 0,
            clockPending: 0,
            clockSize: 0,
            connected: ['sheet'],
            diagnostics: [],
        },
    }
}

function plan(): ScenePlan {
    return {
        scene: 's-card',
        stepMs: 16,
        completeness: {
            requiredObservations: 1,
            requiredCommits: 1,
            requiredReports: 1,
            requiredSettleFrames: 1,
            requiredKeys: ['card', 'sheet'],
            requiredPairs: 1,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G3', 'G4', 'G8', 'G13'],
            requiredShape: [],
            requiredOpacityKeys: [],
            requiredRadiiKeys: [],
            requiredFontKeys: [],
        },
        initial: { card: box(16, 176, 358, 440) },
        mounts: {},
        commits: [
            {
                frame: 0,
                label: 'open',
                expectedStatus: 'ended',
                segments: [
                    {
                        key: 'sheet',
                        kind: 'spring',
                        to: box(0, 0, 390, 844),
                        handoffFrom: 'card',
                        motion: {
                            type: 'spring',
                            duration: 0.55,
                            bounce: 0.05,
                        },
                    },
                ],
            },
            {
                frame: 0,
                label: 'release',
                kind: 'release',
                expectedStatus: 'no-change',
                segments: [
                    {
                        key: 'sheet',
                        kind: 'spring',
                        to: box(0, 0, 390, 844),
                        motion: {
                            type: 'spring',
                            duration: 0.45,
                            bounce: 0.08,
                        },
                    },
                ],
            },
        ],
        settleFrames: [1],
        restorationChecks: [],
        pairs: [
            {
                id: 'today-card',
                startFrame: 0,
                lead: 'sheet',
                follower: 'card',
                radiusFrom: 20,
                radiusTo: 0,
            },
        ],
        expectedDiagnostics: [],
        expectedOnSnap: [],
        allowEmptyFinal: false,
    }
}

test('H19 variants: registry covers the required support rows', () => {
    assert.deepEqual(variantsForScene('s-card'), [
        'dpr1',
        'dpr3',
        'rm-jump',
        'rm-max',
        'rm-ignore',
    ])
    assert.deepEqual(variantsForScene('s-seg'), ['dpr1', 'dpr3'])
    assert.deepEqual(variantsForScene('s-stack'), [])
    assert.equal(variantKey('s-card', 'rm-jump'), 's-card@rm-jump')
    assert.equal(variantSpec('s-card', 'dpr3').dpr, 3)
    assert.equal(variantSpec('s-card', 'rm-max').policy, 'maxDuration')
    assert.equal(selectedVariants(['s-card'], ['rm-jump']).length, 1)
})

test('H19 maxDuration: the §9.4 grid is re-derived by the oracle', () => {
    const clamped = clampReducedSpring(
        0.55,
        0.05,
        box(0, 0, 390, 844),
        box(16, 176, 358, 440),
        box(0, 0, 0, 0),
        false,
        0.2
    )
    assert.equal(clamped.fits, true)
    assert.equal(
        clamped.motion.duration,
        0.55 * REDUCED_GRID[REDUCED_GRID.length - 1]!
    )
    assert.equal(clamped.motion.bounce, 0)
    // Independent settle for f = 0.1 is 0.1167 s; every larger factor misses
    // the 0.2 s bound.
    assert.ok(Math.abs(clamped.settle - 0.1167) < 0.002)
})

test('H19 jump: no tracks, endpoint A, reduced status and snapped set', () => {
    const t = trace()
    const p = applyVariantPlan(plan(), t, variantSpec('s-card', 'rm-jump'))
    assert.equal(p.reducedMotion, 'jump')
    assert.equal(p.commits[0]!.segments[0]!.kind, 'none')
    assert.equal(p.commits[0]!.segments[0]!.reducedJump, true)
    assert.equal(p.commits[0]!.expectedStatus, 'reduced')
    assert.deepEqual(p.commits[0]!.expectedSnapped, ['sheet:reduced'])
    // The release has no public report/onSnap and is excluded.
    assert.deepEqual(p.expectedOnSnap, ['reduced'])
    assert.equal(p.pairs[0]!.reducedJump, true)
})

test('H19 maxDuration: the planned spring is the clamped spring', () => {
    const t = trace()
    const p = applyVariantPlan(plan(), t, variantSpec('s-card', 'rm-max'))
    assert.equal(p.reducedMotion, 'maxDuration')
    assert.equal(p.maxDuration, 0.2)
    const motion = p.commits[0]!.segments[0]!.motion
    assert.equal(motion?.type, 'spring')
    assert.ok(motion && motion.type === 'spring' && motion.duration < 0.55)
    assert.ok(p.completeness.requiredShape.includes('shape.reduced-policy'))
})

test('H19 DPR: the authored plan is unchanged', () => {
    const t = trace()
    const base = plan()
    const p = applyVariantPlan(base, t, variantSpec('s-card', 'dpr1'))
    assert.equal(p.commits[0]!.segments[0]!.kind, 'spring')
    assert.equal(p.commits[0]!.expectedStatus, 'ended')
    assert.equal(p.reducedMotion, undefined)
})
