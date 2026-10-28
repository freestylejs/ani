import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateFingerprint, type Fingerprint } from './fingerprint.ts'
import {
    auditFloor,
    commitRatioGate,
    floorAuditGate,
    heldGate,
    realClockGate,
    steadyFrameGate,
    sustainedGate,
} from './gates.ts'
import { type Box, settleOfBox, trackState, zeroBoxVelocity } from './oracle.ts'
import { removedWithFollower, scoreScene } from './scoring.ts'
import type {
    Observation,
    ScenePlan,
    SceneTrace,
    SegmentPlan,
    StyleSnapshot,
} from './types.ts'

const EMPTY_STYLE: StyleSnapshot = {
    translate: '',
    translatePriority: '',
    scale: '',
    scalePriority: '',
    radius: '',
    radiusPriority: '',
    overflowAnchor: '',
    overflowAnchorPriority: '',
    inert: null,
    inline: '',
}

const START: Box = { x: 0, y: 0, w: 100, h: 20 }
const MID: Box = { x: 100, y: 0, w: 100, h: 20 }
const END: Box = { x: 200, y: 0, w: 100, h: 20 }
const MOTION = { type: 'spring', duration: 0.5, bounce: 0 } as const

function segment(key: string, to: Box): SegmentPlan {
    return { key, kind: 'spring', to, motion: MOTION }
}

function basePlan(): ScenePlan {
    return {
        scene: 'unit',
        stepMs: 16,
        completeness: {
            requiredObservations: 3,
            requiredCommits: 2,
            requiredReports: 2,
            requiredSettleFrames: 1,
            requiredKeys: ['pill'],
            requiredPairs: 0,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: ['shape.teardown'],
            requiredOpacityKeys: [],
            requiredRadiiKeys: [],
            requiredFontKeys: [],
        },
        initial: { pill: START },
        mounts: { pill: EMPTY_STYLE },
        commits: [
            {
                frame: 0,
                label: 'a',
                segments: [segment('pill', MID)],
                expectedStatus: 'interrupted',
            },
            {
                frame: 5,
                label: 'b',
                segments: [segment('pill', END)],
                expectedStatus: 'ended',
            },
        ],
        settleFrames: [60],
        restorationChecks: [],
        pairs: [],
        staticRadii: {},
    }
}

interface State {
    readonly start: number
    readonly from: Box
    readonly to: Box
    readonly v0: Box
    readonly moving: boolean
    readonly settle: number
}

function valueAt(state: State, frame: number): Box {
    if (frame === state.start) return state.from
    const local = frame - state.start
    const elapsed = state.moving
        ? (local * 16) / 1000
        : (Math.max(0, local - 1) * 16) / 1000
    return trackState(
        MOTION,
        state.from,
        state.to,
        state.v0,
        elapsed,
        state.settle
    ).box
}

function velocityAt(state: State, frame: number): Box {
    const local = frame - state.start
    const elapsed = state.moving
        ? (local * 16) / 1000
        : (Math.max(0, local - 1) * 16) / 1000
    return trackState(
        MOTION,
        state.from,
        state.to,
        state.v0,
        elapsed,
        state.settle
    ).velocity
}

function makeTrace(plan: ScenePlan): SceneTrace {
    const first: State = {
        start: 0,
        from: plan.initial.pill!,
        to: plan.commits[0]!.segments[0]!.to,
        v0: zeroBoxVelocity(),
        moving: false,
        settle: settleOfBox(
            0.5,
            0,
            plan.initial.pill!,
            plan.commits[0]!.segments[0]!.to,
            null
        ),
    }
    const secondPlan = plan.commits[1]!.segments[0]!
    const secondFrom = valueAt(first, 5)
    const secondV0 =
        secondPlan.velocityOverride === undefined
            ? velocityAt(first, 5)
            : (secondPlan.velocityOverride ?? zeroBoxVelocity())
    const second: State = {
        start: 5,
        from: secondFrom,
        to: secondPlan.to,
        v0: secondV0,
        moving: secondPlan.velocityOverride === undefined ? true : false,
        settle: settleOfBox(0.5, 0, secondFrom, secondPlan.to, secondV0),
    }
    const observations: Observation[] = []
    const add = (
        kind: 'frame' | 'flush',
        frame: number,
        box: Box,
        label?: string
    ) => {
        observations.push({
            kind,
            frame,
            now: 1000 + frame * 16,
            commitLabel: label,
            connected: ['pill'],
            boxes: { pill: box },
            opacity: { pill: 1 },
            radii: { pill: null },
            style: { pill: EMPTY_STYLE },
            font: {},
            samples: {},
            activeElementKey: null,
        })
    }
    add('frame', 0, START)
    add('flush', 0, first.from, 'a')
    for (let frame = 1; frame < 5; frame++)
        add('frame', frame, valueAt(first, frame))
    add('frame', 5, valueAt(first, 5))
    add('flush', 5, second.from, 'b')
    for (let frame = 6; frame <= 60; frame++) {
        add('frame', frame, valueAt(second, frame))
    }
    return {
        scene: plan.scene,
        mode: 'manual',
        stepMs: 16,
        observations,
        commits: [
            {
                label: 'a',
                frame: 0,
                nBefore: 1,
                nAfter: 1,
                rects: 2,
                offsets: 2,
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
                styleRadiusCapture: 1,
                styleActiveFlush: 1,
            },
            {
                label: 'b',
                frame: 5,
                nBefore: 1,
                nAfter: 1,
                rects: 2,
                offsets: 2,
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
                styleRadiusCapture: 1,
                styleActiveFlush: 1,
            },
        ],
        reports: [
            { label: 'a', status: 'interrupted', snapped: [], settledFrame: 5 },
            { label: 'b', status: 'ended', snapped: [], settledFrame: 60 },
        ],
        diagnostics: [],
        onSnap: [],
        settleFrames: [60],
        steadyFrameReads: 0,
        steadyFrameReadsAt: null,
        mounts: { pill: EMPTY_STYLE },
        initialBoxes: { pill: START },
        aBoxes: { pill: MID },
        final: {
            tracks: 0,
            holds: 0,
            clockPending: 0,
            clockSize: 0,
            connected: ['pill'],
            diagnostics: [],
        },
    }
}

function copy<T>(value: T): T {
    return structuredClone(value)
}

function metric(score: ReturnType<typeof scoreScene>, id: string) {
    return score.metrics.find((entry) => entry.id === id)!
}

function shape(score: ReturnType<typeof scoreScene>, id: string) {
    return score.shape.find((entry) => entry.id === id)!
}

test('the clean trace passes every metric and shape check', () => {
    const plan = basePlan()
    const trace = makeTrace(plan)
    const score = scoreScene(plan, trace)
    for (const finding of score.metrics) {
        assert.ok(
            finding.pass,
            `${finding.id}: ${finding.value} ${finding.detail ?? ''}`
        )
    }
    for (const finding of score.shape) {
        assert.ok(
            finding.pass,
            `${finding.id}: ${finding.value} ${finding.detail ?? ''}`
        )
    }
    assert.ok(score.pass)
})

test('negative control G1: a 0.1 px offset fails the oracle error', () => {
    const plan = basePlan()
    const trace = copy(makeTrace(plan))
    const observation = trace.observations.find(
        (entry) => entry.kind === 'frame' && entry.frame === 10
    )!
    ;(observation.boxes as Record<string, Box>).pill = {
        ...observation.boxes.pill!,
        x: observation.boxes.pill!.x + 0.1,
    }
    const score = scoreScene(plan, trace)
    assert.equal(metric(score, 'G1').pass, false)
    assert.ok(metric(score, 'G1').value >= 0.1 - 1e-12)
})

test('negative control G2: a 0.1 px first-frame jump fails continuity', () => {
    const plan = basePlan()
    const trace = copy(makeTrace(plan))
    const flush = trace.observations.find(
        (entry) => entry.kind === 'flush' && entry.frame === 5
    )!
    ;(flush.boxes as Record<string, Box>).pill = {
        ...flush.boxes.pill!,
        x: flush.boxes.pill!.x + 0.1,
    }
    const score = scoreScene(plan, trace)
    assert.equal(metric(score, 'G2').pass, false)
    assert.ok(metric(score, 'G2').value >= 0.1 - 1e-12)
})

test('negative control G3: starting a retarget from rest fails velocity continuity', () => {
    const plan = copy(basePlan())
    const retarget = plan.commits[1]!.segments[0]! as SegmentPlan
    ;(plan.commits[1] as unknown as { segments: SegmentPlan[] }).segments = [
        { ...retarget, velocityOverride: zeroBoxVelocity() },
    ]
    const trace = makeTrace(plan)
    const score = scoreScene(plan, trace)
    assert.equal(metric(score, 'G3').pass, false)
    assert.ok(metric(score, 'G3').value > 1)
})

test('negative control G4: a 0.1 px spring displacement fails spring fidelity', () => {
    const plan = basePlan()
    const trace = copy(makeTrace(plan))
    const observation = trace.observations.find(
        (entry) => entry.kind === 'frame' && entry.frame === 20
    )!
    ;(observation.boxes as Record<string, Box>).pill = {
        ...observation.boxes.pill!,
        y: observation.boxes.pill!.y + 0.1,
    }
    const score = scoreScene(plan, trace)
    assert.equal(metric(score, 'G4').pass, false)
})

test('negative control G5: a leftover pose and a 0.02 px settle error fail', () => {
    const plan = basePlan()
    const trace = copy(makeTrace(plan))
    const final = trace.observations[trace.observations.length - 1]!
    ;(final.boxes as Record<string, Box>).pill = {
        ...final.boxes.pill!,
        x: final.boxes.pill!.x + 0.02,
    }
    ;(final.style as Record<string, StyleSnapshot>).pill = {
        ...EMPTY_STYLE,
        translate: '0.5px 0px',
    }
    const score = scoreScene(plan, trace)
    assert.equal(metric(score, 'G5').pass, false)
    assert.ok(metric(score, 'G5').value >= 0.02 - 1e-12)
})

test('negative control G6: a leftover declaration fails restoration', () => {
    const plan = basePlan()
    const trace = copy(makeTrace(plan))
    const final = trace.observations[trace.observations.length - 1]!
    ;(final.style as Record<string, StyleSnapshot>).pill = {
        ...EMPTY_STYLE,
        radius: '7px',
    }
    const score = scoreScene(plan, trace)
    assert.equal(metric(score, 'G6').pass, false)
})

test('negative control G7: a wrong status or a wrong snapped set fails reports', () => {
    const plan = basePlan()
    const wrongStatus = copy(makeTrace(plan))
    ;(
        wrongStatus.reports as unknown as { label: string; status: string }[]
    )[1]!.status = 'no-change'
    assert.equal(metric(scoreScene(plan, wrongStatus), 'G7').pass, false)

    const wrongSnap = copy(makeTrace(plan))
    ;(
        wrongSnap.reports as unknown as { label: string; snapped: unknown[] }[]
    )[1]!.snapped = [{ key: 'pill', reason: 'stale' }]
    assert.equal(metric(scoreScene(plan, wrongSnap), 'G7').pass, false)
})

test('negative control G8: a 9 ms frame after the commit and a high p95 fail', () => {
    const result = realClockGate(
        [
            { at: 0, ms: 1, commit: true },
            { at: 1, ms: 1, commit: false },
            { at: 2, ms: 9, commit: false },
        ],
        0.01
    )
    assert.equal(result.pass, false)
    assert.ok(result.value >= 9)
})

test('negative control G9: a floor with an extra read fails its audit', () => {
    const input = {
        participants: 1000,
        poses: 300,
        typedOM: false,
        captureRects: 1000,
        captureOffsets: 1000,
        flushRects: 1000,
        flushOffsets: 1000,
        styleReads: 300,
        poseWrites: 300,
        extraReads: 1,
    }
    assert.equal(auditFloor(input).pass, false)
    assert.equal(auditFloor({ ...input, extraReads: 0 }).pass, true)
    assert.equal(floorAuditGate(auditFloor(input)).pass, false)
    const ratio = commitRatioGate([10], [4])
    assert.equal(ratio.pass, false)
    assert.ok(ratio.value > 2)
})

test('negative control G10 and G11: a p95 above 2 ms fails', () => {
    assert.equal(steadyFrameGate([1, 1, 2.1], 0.01).pass, false)
    assert.equal(sustainedGate([1, 1, 2.2], 0.01).pass, false)
    assert.equal(steadyFrameGate([1, 1, 1.9], 0.01).pass, true)
})

test('negative control G12: 0.11 ms per held element fails', () => {
    assert.equal(heldGate([0.11, 0.11, 0.11], 1, 0.01).pass, false)
    assert.equal(heldGate([0.05, 0.05], 1, 0.01).pass, true)
})

test('negative control G13: an extra rect or a steady-frame read fails', () => {
    const plan = basePlan()
    const extraRect = copy(makeTrace(plan))
    ;(extraRect.commits as unknown as { rects: number }[])[0]!.rects = 3
    assert.equal(metric(scoreScene(plan, extraRect), 'G13').pass, false)

    const frameRead = copy(makeTrace(plan))
    ;(frameRead.commits as unknown as { frameReads: number }[])[0]!.frameReads =
        1
    assert.equal(metric(scoreScene(plan, frameRead), 'G13').pass, false)
})

test('negative control G14: a load or build mismatch is advisory, not a frame gate', () => {
    const fingerprint: Fingerprint = {
        host: 'Mac14,9',
        os: { productVersion: '27.0.1', kernel: '27.0.0' },
        cpu: 'Apple M2 Pro',
        cores: 10,
        memoryBytes: 34359738368,
        node: 'v24.19.0',
        pnpm: '10.20.0',
        playwright: '1.55.0',
        browsers: {
            chromium: 'chromium_headless_shell-1187',
            chromiumHeadlessShell: 'chromium_headless_shell-1187',
            webkit: 'webkit-2203',
            firefox: 'firefox-1490',
        },
        load1: 0.5,
    }
    assert.equal(evaluateFingerprint(fingerprint).cost, false)
    const loaded = evaluateFingerprint({ ...fingerprint, load1: 3.2 })
    assert.equal(loaded.cost, true)
    assert.ok(loaded.reasons.length > 0)
})

test('shape negative controls: opacity, coverage, radius, inert and font fail', () => {
    const plan = copy(basePlan())
    ;(plan as unknown as { pairs: unknown[] }).pairs = [
        {
            id: 'today-title',
            startFrame: 0,
            lead: 'pill',
            follower: 'pill2',
            radiusFrom: 20,
            radiusTo: 0,
        },
    ]
    ;(plan.initial as Record<string, Box>).pill2 = START
    ;(plan.mounts as Record<string, StyleSnapshot>).pill2 = EMPTY_STYLE
    ;(plan.commits[0] as unknown as { segments: SegmentPlan[] }).segments = [
        segment('pill', MID),
        { ...segment('pill2', MID), handoffFrom: 'pill' },
    ]
    ;(plan.commits[1] as unknown as { segments: SegmentPlan[] }).segments = [
        segment('pill', END),
    ]
    const trace = copy(makeTrace(plan))
    for (const observation of trace.observations) {
        if (!('pill' in observation.boxes)) continue
        const frames = observation.boxes as Record<string, Box>
        frames.pill2 = frames.pill!
        ;(observation.connected as string[]).push('pill2')
        ;(observation.opacity as Record<string, number>).pill2 = 0.4
        ;(observation.opacity as Record<string, number>).pill = 0.4
        ;(observation.radii as Record<string, number[] | null>).pill = [
            12, 12, 12, 12, 12, 12, 12, 12,
        ]
        ;(observation.radii as Record<string, number[] | null>).pill2 = [
            12, 12, 12, 12, 12, 12, 12, 12,
        ]
        ;(observation.style as Record<string, StyleSnapshot>).pill2 =
            EMPTY_STYLE
        ;(observation.font as Record<string, string>).pill = '15px A'
        ;(observation.font as Record<string, string>).pill2 = '16px B'
    }
    const score = scoreScene(plan, trace)
    assert.equal(shape(score, 'shape.opacity').pass, false)
    assert.equal(shape(score, 'shape.coverage').pass, false)
    assert.equal(shape(score, 'shape.radius').pass, false)
    assert.equal(shape(score, 'shape.inert').pass, false)
    assert.equal(shape(score, 'shape.font').pass, false)
})

test('H14-19: focus inside the follower fails shape.focus', () => {
    const plan = basePlan()
    ;(plan as unknown as { pairs: unknown[] }).pairs = [
        {
            id: 'today-title',
            startFrame: 0,
            lead: 'pill',
            follower: 'pill2',
            radiusFrom: 20,
            radiusTo: 0,
        },
    ]
    ;(plan as unknown as { initial: Record<string, Box> }).initial.pill2 = START
    ;(
        plan as unknown as { mounts: Record<string, StyleSnapshot> }
    ).mounts.pill2 = EMPTY_STYLE
    ;(plan.commits[0] as unknown as { segments: SegmentPlan[] }).segments = [
        segment('pill', MID),
        { ...segment('pill2', MID), handoffFrom: 'pill' },
    ]
    const trace = copy(makeTrace(plan))
    for (const observation of trace.observations) {
        if (!observation.connected.includes('pill')) continue
        ;(observation.connected as string[]).push('pill2')
        ;(observation.boxes as Record<string, Box>).pill2 =
            observation.boxes.pill!
        ;(observation.opacity as Record<string, number>).pill2 = 0.5
        ;(observation.activeElementKey as string | null) = 'pill2'
    }
    const score = scoreScene(plan, trace)
    assert.equal(shape(score, 'shape.focus').pass, false)
})

test('H14-01: a blank trace fails completeness and cannot pass', () => {
    const plan = basePlan()
    const trace = makeTrace(plan)
    const blank = {
        ...trace,
        observations: [],
        commits: [],
        reports: [],
        settleFrames: [],
        final: {
            ...trace.final,
            connected: [],
        },
    }
    const score = scoreScene(plan, blank)
    const completeness = score.metrics.find((entry) => entry.id === 'C1')!
    assert.equal(completeness.pass, false)
    assert.equal(score.pass, false)
})

test('H14-01: a partial trace (commits but no observations) fails', () => {
    const plan = basePlan()
    const trace = makeTrace(plan)
    const partial = { ...trace, observations: [] }
    const score = scoreScene(plan, partial)
    assert.equal(score.metrics.find((entry) => entry.id === 'C1')!.pass, false)
    assert.equal(score.pass, false)
})

test('H14-08: a priority change fails restoration', () => {
    const plan = basePlan()
    const trace = copy(makeTrace(plan))
    const final = trace.observations[trace.observations.length - 1]!
    ;(final.style as Record<string, StyleSnapshot>).pill = {
        ...EMPTY_STYLE,
        translatePriority: 'important',
    }
    assert.equal(metric(scoreScene(plan, trace), 'G6').pass, false)
})

test('H14-09: an extra computed-style read fails G13', () => {
    const plan = basePlan()
    const trace = copy(makeTrace(plan))
    ;(trace.commits as unknown as { styles: number }[])[0]!.styles = 3
    assert.equal(metric(scoreScene(plan, trace), 'G13').pass, false)
})

test('H14-11: aged G2 gets 0.5 px only for the aged commit', () => {
    const plan = basePlan()
    const trace = copy(makeTrace(plan))
    const flush = trace.observations.find(
        (entry) => entry.kind === 'flush' && entry.frame === 5
    )!
    ;(flush.boxes as Record<string, Box>).pill = {
        ...flush.boxes.pill!,
        x: flush.boxes.pill!.x + 0.1,
    }
    const aged = copy(trace)
    ;(aged.commits as unknown as { aged: boolean }[])[1]!.aged = true
    assert.equal(metric(scoreScene(plan, aged), 'G2').pass, true)
    assert.equal(metric(scoreScene(plan, trace), 'G2').pass, false)
})

test('H14-20: teardown and pill-radius controls', () => {
    const plan = basePlan()
    const trace = copy(makeTrace(plan))
    ;(trace.final as unknown as { tracks: number }).tracks = 1
    assert.equal(shape(scoreScene(plan, trace), 'shape.teardown').pass, false)

    const radiusPlan = copy(plan)
    ;(
        radiusPlan as unknown as { staticRadii: Record<string, number> }
    ).staticRadii = { pill: 7 }
    const radiusTrace = copy(makeTrace(plan))
    for (const observation of radiusTrace.observations) {
        ;(observation.radii as Record<string, number[] | null>).pill = [
            8, 8, 8, 8, 8, 8, 8, 8,
        ]
    }
    assert.equal(
        shape(scoreScene(radiusPlan, radiusTrace), 'shape.pill-radius').pass,
        false
    )
})

test('H14-07: a trace-level retarget restart is visible in the observed FD and fails G1', () => {
    const plan = basePlan()
    const trace = copy(makeTrace(plan))
    const flush = trace.observations.find(
        (entry) => entry.kind === 'flush' && entry.frame === 5
    )!
    const first = trace.observations.find(
        (entry) => entry.kind === 'frame' && entry.frame === 6
    )!
    ;(first.boxes as Record<string, Box>).pill = { ...flush.boxes.pill! }
    const score = scoreScene(plan, trace)
    assert.equal(metric(score, 'G1').pass, false)
    assert.match(metric(score, 'G3').worst?.detail ?? '', /observed FD/)
})

test('N5: a missing mount snapshot fails C1 and G6', () => {
    const plan = basePlan()
    const trace = makeTrace(plan)
    ;(plan as unknown as { mounts: Record<string, StyleSnapshot> }).mounts = {}
    const score = scoreScene(plan, trace)
    assert.equal(metric(score, 'C1').pass, false)
    assert.equal(metric(score, 'G6').pass, false)
    assert.equal(metric(score, 'G6').measured, false)
    assert.match(metric(score, 'C1').detail ?? '', /has no mount snapshot/)
})

test('N5: an unowned inline cssText difference fails G6', () => {
    const plan = basePlan()
    const trace = copy(makeTrace(plan))
    const final = trace.observations[trace.observations.length - 1]!
    ;(final.style as Record<string, StyleSnapshot>).pill = {
        ...EMPTY_STYLE,
        inline: 'color: red',
    }
    const score = scoreScene(plan, trace)
    assert.equal(metric(score, 'G6').pass, false)
    assert.match(metric(score, 'G6').worst?.detail ?? '', /inline cssText/)
})

test('N5: declared opacity, radii and font data are required', () => {
    const plan = basePlan()
    ;(
        plan as unknown as {
            completeness: {
                requiredOpacityKeys: string[]
                requiredRadiiKeys: string[]
                requiredFontKeys: string[]
            }
        }
    ).completeness.requiredOpacityKeys = ['ghost']
    ;(
        plan as unknown as {
            completeness: {
                requiredOpacityKeys: string[]
                requiredRadiiKeys: string[]
                requiredFontKeys: string[]
            }
        }
    ).completeness.requiredRadiiKeys = ['pill']
    ;(
        plan as unknown as {
            completeness: {
                requiredOpacityKeys: string[]
                requiredRadiiKeys: string[]
                requiredFontKeys: string[]
            }
        }
    ).completeness.requiredFontKeys = ['pill']
    const score = scoreScene(plan, makeTrace(plan))
    assert.equal(metric(score, 'C1').pass, false)
    const detail = metric(score, 'C1').detail ?? ''
    assert.match(detail, /required opacity/)
    assert.match(detail, /required radii/)
    assert.match(detail, /required font/)
})

test('H15-07: a descendant removed with a crossfade follower is exempt', () => {
    const plan = {
        ...basePlan(),
        pairs: [
            {
                id: 'pair',
                startFrame: 0,
                lead: 'pill',
                follower: 'card',
            },
        ],
        removedWith: { content: 'card' },
    }
    assert.equal(removedWithFollower(plan, 'content', 5), true)
    assert.equal(removedWithFollower(plan, 'content', 0), true)
    assert.equal(removedWithFollower(plan, 'other', 5), false)
    const later = {
        ...plan,
        pairs: [
            ...plan.pairs,
            {
                id: 'pair',
                startFrame: 4,
                lead: 'card',
                follower: 'pill',
            },
        ],
    }
    assert.equal(removedWithFollower(later, 'content', 5), false)
})
