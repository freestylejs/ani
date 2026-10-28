/**
 * Frame scoring for the P5 layout bench. The functions here are pure: they
 * take a scene plan (data) and a recorded trace and decide every §11.6 metric
 * with the gate values verbatim. The same functions score the deliberately
 * broken traces of the negative-control suite.
 */
import {
    type Box,
    blendRadius,
    coverage,
    crossfade,
    edgeError,
    perceptualOf,
    settleOfBox,
    trackState,
    zeroBoxVelocity,
} from './oracle.ts'
import type {
    Observation,
    ScenePlan,
    SceneTrace,
    SegmentPlan,
    StyleSnapshot,
} from './types.ts'

export interface MetricFinding {
    readonly id: string
    readonly label: string
    readonly gate: string
    readonly unit: string
    readonly value: number
    readonly pass: boolean
    /** False when the scene declared the metric but the trace has no data. */
    readonly measured?: boolean
    /** The metric cannot be decided on this engine/timer; not a failure. */
    readonly blocked?: boolean
    /** False for reporting-only evidence; it never decides a scene gate. */
    readonly deciding?: boolean
    readonly worst?:
        | {
              readonly frame?: number | undefined
              readonly participant?: string | undefined
              readonly edge?: string | undefined
              readonly label?: string | undefined
              readonly detail?: string | undefined
          }
        | undefined
    readonly detail?: string | undefined
}

export interface SceneScore {
    readonly scene: string
    readonly metrics: readonly MetricFinding[]
    readonly shape: readonly MetricFinding[]
    readonly pass: boolean
    readonly observations: number
}

interface SegmentState {
    readonly key: string
    readonly kind: 'spring' | 'timing' | 'none'
    readonly startFrame: number
    readonly from: Box
    readonly to: Box
    readonly motion: SegmentPlan['motion']
    readonly v0: Box
    readonly moving: boolean
    readonly settle: number
}

interface Expected {
    readonly byObservation: ReadonlyMap<
        number,
        ReadonlyMap<string, { readonly box: Box; readonly spring: boolean }>
    >
    readonly commits: readonly {
        readonly plan: ScenePlan['commits'][number]
        readonly index: number
        readonly g2: readonly {
            readonly key: string
            readonly source: string
            readonly error: number
            readonly frame: number
        }[]
        readonly g3: readonly {
            readonly key: string
            readonly before: Box
            readonly after: Box
            readonly frame: number
            readonly label: string
        }[]
    }[]
}

function velocityAllowed(before: number, after: number): number {
    return 0.01 * Math.max(Math.abs(before), Math.abs(after)) + 1
}

function elapsedAt(state: SegmentState, frame: number, stepMs: number): number {
    if (state.kind === 'none') return 0
    const local = frame - state.startFrame
    if (local <= 0) return 0
    return state.moving
        ? (local * stepMs) / 1000
        : (Math.max(0, local - 1) * stepMs) / 1000
}

function valueAt(state: SegmentState, frame: number, stepMs: number): Box {
    if (state.kind === 'none') return state.to
    const elapsed = elapsedAt(state, frame, stepMs)
    return trackState(
        state.motion!,
        state.from,
        state.to,
        state.v0,
        elapsed,
        state.settle
    ).box
}

function velocityAt(state: SegmentState, frame: number, stepMs: number): Box {
    if (state.kind === 'none') return zeroBoxVelocity()
    const elapsed = elapsedAt(state, frame, stepMs)
    return trackState(
        state.motion!,
        state.from,
        state.to,
        state.v0,
        elapsed,
        state.settle
    ).velocity
}

function activeAt(state: SegmentState, frame: number, stepMs: number): boolean {
    if (state.kind === 'none') return false
    if (frame <= state.startFrame) return false
    return elapsedAt(state, frame, stepMs) < state.settle
}

function sameStyle(a: StyleSnapshot, b: StyleSnapshot): string[] {
    const mismatches: string[] = []
    if (a.translate !== b.translate) mismatches.push('translate')
    if (a.translatePriority !== b.translatePriority)
        mismatches.push('translate priority')
    if (a.scale !== b.scale) mismatches.push('scale')
    if (a.scalePriority !== b.scalePriority) mismatches.push('scale priority')
    if (a.radius !== b.radius) mismatches.push('border-radius')
    if (a.radiusPriority !== b.radiusPriority)
        mismatches.push('border-radius priority')
    if (a.overflowAnchor !== b.overflowAnchor)
        mismatches.push('overflow-anchor')
    if (a.overflowAnchorPriority !== b.overflowAnchorPriority)
        mismatches.push('overflow-anchor priority')
    if (a.inert !== b.inert) mismatches.push('inert')
    return mismatches
}

function observationAt(
    trace: SceneTrace,
    frame: number
): Observation | undefined {
    let found: Observation | undefined
    for (const observation of trace.observations) {
        if (observation.frame === frame) found = observation
    }
    return found
}

function worstEdge(drawn: Box, expected: Box): { error: number; edge: string } {
    const result = edgeError(drawn, expected)
    return { error: result.max, edge: result.edge }
}

function buildExpected(plan: ScenePlan, trace: SceneTrace): Expected {
    const byObservation = new Map<
        number,
        Map<string, { box: Box; spring: boolean }>
    >()
    const commits: Expected['commits'][number][] = []
    const states = new Map<string, SegmentState>()
    const commitByLabel = new Map(
        plan.commits.map((commit) => [commit.label, commit])
    )
    const stepMs = plan.stepMs

    trace.observations.forEach((observation, index) => {
        let g2: {
            key: string
            source: string
            error: number
            frame: number
        }[] = []
        let g3: {
            key: string
            before: Box
            after: Box
            frame: number
            label: string
        }[] = []
        if (observation.kind === 'flush' && observation.commitLabel) {
            const commitPlan = commitByLabel.get(observation.commitLabel)
            if (!commitPlan) {
                throw new Error(
                    `trace commit "${observation.commitLabel}" has no plan`
                )
            }
            const previousObservation = trace.observations[index - 1]
            const pending: {
                segment: SegmentPlan
                state: SegmentState
                source: string
            }[] = []
            for (const segment of commitPlan.segments) {
                const source = segment.handoffFrom ?? segment.key
                const sourceState = states.get(source)
                // B is the last presented observation, not the oracle ideal
                // (H14-15). The oracle only supplies A and the incoming
                // analytic velocity.
                const observedFrom = previousObservation?.boxes[source] ?? null
                const from =
                    observedFrom ??
                    (sourceState
                        ? valueAt(sourceState, observation.frame, stepMs)
                        : (plan.initial[source] ??
                          (segment.kind === 'none' ? segment.to : undefined)))
                if (!from) {
                    throw new Error(
                        `commit ${commitPlan.label}: no B for "${segment.key}" (source "${source}")`
                    )
                }
                const active = sourceState
                    ? activeAt(sourceState, observation.frame, stepMs)
                    : false
                const sourceVelocity = active
                    ? velocityAt(sourceState!, observation.frame, stepMs)
                    : zeroBoxVelocity()
                const v0 =
                    segment.velocityOverride === undefined
                        ? sourceVelocity
                        : (segment.velocityOverride ?? zeroBoxVelocity())
                const moving =
                    segment.velocityOverride === undefined
                        ? active
                        : v0.x !== 0 || v0.y !== 0
                const settle =
                    segment.kind === 'spring'
                        ? settleOfBox(
                              segment.motion!.duration,
                              (segment.motion as { bounce: number }).bounce,
                              from,
                              segment.to,
                              v0
                          )
                        : segment.kind === 'timing'
                          ? segment.motion!.duration
                          : 0
                const state: SegmentState = {
                    key: segment.key,
                    kind: segment.kind,
                    startFrame: observation.frame,
                    from,
                    to: segment.to,
                    motion: segment.motion,
                    v0,
                    moving,
                    settle,
                }
                pending.push({ segment, state, source })
                if (segment.kind !== 'none') {
                    const sourceBox = previousObservation?.boxes[source] ?? null
                    const drawn = observation.boxes[segment.key] ?? null
                    if (sourceBox && drawn) {
                        g2 = [
                            ...g2,
                            {
                                key: segment.key,
                                source,
                                error: edgeError(drawn, sourceBox).max,
                                frame: observation.frame,
                            },
                        ]
                    }
                    if (
                        active &&
                        commitPlan.segments.some((entry) => entry === segment)
                    ) {
                        g3 = [
                            ...g3,
                            {
                                key: segment.key,
                                before: sourceVelocity,
                                after: v0,
                                frame: observation.frame,
                                label: commitPlan.label,
                            },
                        ]
                    }
                }
            }
            for (const entry of pending)
                states.set(entry.segment.key, entry.state)
            commits.push({ plan: commitPlan, index, g2, g3 })
        }

        const expected = new Map<string, { box: Box; spring: boolean }>()
        for (const key of observation.connected) {
            const state = states.get(key)
            let box: Box | undefined
            if (!state) box = plan.initial[key]
            else if (
                observation.kind === 'flush' &&
                state.startFrame === observation.frame
            )
                box = state.from
            else box = valueAt(state, observation.frame, stepMs)
            if (!box) continue
            expected.set(key, {
                box,
                spring: state?.kind === 'spring',
            })
        }
        byObservation.set(index, expected)
    })

    return { byObservation, commits }
}

function scoreOracle(
    id: 'G1' | 'G4',
    trace: SceneTrace,
    expected: Expected,
    springOnly: boolean
): MetricFinding {
    let worst = 0
    let worstFrame: number | undefined
    let worstKey: string | undefined
    let worstEdgeName: string | undefined
    let counted = 0
    trace.observations.forEach((observation, index) => {
        const wanted = expected.byObservation.get(index)
        if (!wanted) return
        for (const [key, want] of wanted) {
            if (springOnly && !want.spring) continue
            const drawn = observation.boxes[key]
            if (!drawn) continue
            const result = worstEdge(drawn, want.box)
            counted += 1
            if (result.error > worst) {
                worst = result.error
                worstFrame = observation.frame
                worstKey = key
                worstEdgeName = result.edge
            }
        }
    })
    return {
        id,
        label:
            id === 'G1'
                ? 'Oracle error: drawn rect against the independent oracle'
                : 'Spring fidelity: drawn edge against the independent spring oracle',
        gate: '<= 0.05 px on every edge',
        unit: 'px',
        value: worst,
        pass: worst <= 0.05,
        measured: counted > 0,
        worst: {
            frame: worstFrame,
            participant: worstKey,
            edge: worstEdgeName,
            detail: `${counted} participant-frames`,
        },
        detail: counted === 0 ? 'n/a: no scored frames' : undefined,
    }
}

function scoreContinuity(trace: SceneTrace, expected: Expected): MetricFinding {
    let worst = 0
    let worstFrame: number | undefined
    let worstKey: string | undefined
    let worstLabel: string | undefined
    let worstDetail: string | undefined
    let count = 0
    let failures = 0
    for (const commit of expected.commits) {
        const observedCommit = trace.commits.find(
            (entry) => entry.label === commit.plan.label
        )
        for (const pair of commit.g2) {
            count += 1
            const aged =
                observedCommit?.aged === true &&
                (observedCommit.agedKeys.length === 0 ||
                    observedCommit.agedKeys.includes(pair.key))
            const gate = aged ? 0.5 : 0.05
            if (pair.error > gate) failures += 1
            if (pair.error > worst) {
                worst = pair.error
                worstFrame = pair.frame
                worstKey = pair.key
                worstLabel = commit.plan.label
                worstDetail = aged
                    ? 'aged capture, allowance 0.5 px'
                    : 'fresh capture, gate 0.05 px'
            }
        }
    }
    return {
        id: 'G2',
        label: 'First-frame continuity against the last presented frame',
        gate: '<= 0.05 px; <= 0.5 px only for the aged participant of that commit',
        unit: 'px',
        value: worst,
        pass: failures === 0,
        measured: count > 0,
        worst: {
            frame: worstFrame,
            participant: worstKey,
            label: worstLabel,
            detail: worstDetail,
        },
        detail:
            count === 0
                ? 'n/a: no measured commit handoff'
                : `${count} commit layers; ${failures} over their per-commit gate`,
    }
}

/** Supporting evidence only (A-11): presented-rect finite difference. */
function observedVelocityDetail(
    trace: SceneTrace,
    key: string,
    frame: number,
    label: string
): string {
    const flushIndex = trace.observations.findIndex(
        (observation) =>
            observation.kind === 'flush' &&
            observation.frame === frame &&
            observation.commitLabel === label
    )
    if (flushIndex < 0) return 'observed FD n/a (no flush)'
    const before = trace.observations[flushIndex - 1]?.boxes[key] ?? null
    const at = trace.observations[flushIndex]?.boxes[key] ?? null
    const next = trace.observations[flushIndex + 1]?.boxes[key] ?? null
    if (!before || !at || !next) return 'observed FD n/a (missing frame)'
    const dt = trace.stepMs / 1000
    const vBefore = Math.max(
        Math.abs((at.x - before.x) / dt),
        Math.abs((at.y - before.y) / dt)
    )
    const vAfter = Math.max(
        Math.abs((next.x - at.x) / dt),
        Math.abs((next.y - at.y) / dt)
    )
    const error = Math.abs(vAfter - vBefore)
    const allowed = 0.01 * Math.max(vBefore, vAfter) + 1
    return `observed FD before ${vBefore.toFixed(1)} px/s after ${vAfter.toFixed(1)} px/s, error ${error.toFixed(1)} (allowed ${allowed.toFixed(1)}; supporting only, acceleration included)`
}

function scoreVelocity(trace: SceneTrace, expected: Expected): MetricFinding {
    let worstRatio = 0
    let worstFrame: number | undefined
    let worstKey: string | undefined
    let worstLabel: string | undefined
    let worstDetail: string | undefined
    let count = 0
    for (const commit of expected.commits) {
        for (const pair of commit.g3) {
            count += 1
            const ratio = Math.max(
                Math.abs(pair.after.x - pair.before.x) /
                    velocityAllowed(pair.before.x, pair.after.x),
                Math.abs(pair.after.y - pair.before.y) /
                    velocityAllowed(pair.before.y, pair.after.y),
                Math.abs(pair.after.w - pair.before.w) /
                    velocityAllowed(pair.before.w, pair.after.w),
                Math.abs(pair.after.h - pair.before.h) /
                    velocityAllowed(pair.before.h, pair.after.h)
            )
            if (worstFrame === undefined || ratio > worstRatio) {
                worstRatio = ratio
                worstFrame = pair.frame
                worstKey = pair.key
                worstLabel = pair.label
                worstDetail = `analytic before ${JSON.stringify(pair.before)} after ${JSON.stringify(pair.after)}; ${observedVelocityDetail(trace, pair.key, pair.frame, pair.label)}`
            }
        }
    }
    return {
        id: 'G3',
        label: 'Velocity continuity at each retarget',
        gate: '<= 1 % of the larger edge speed + 1 px/s',
        unit: 'ratio',
        value: worstRatio,
        pass: worstRatio <= 1,
        measured: count > 0,
        worst: {
            frame: worstFrame,
            participant: worstKey,
            label: worstLabel,
            detail: worstDetail,
        },
        detail:
            count === 0 ? 'n/a: no moving retarget in this scene' : undefined,
    }
}

function scoreSettle(plan: ScenePlan, trace: SceneTrace): MetricFinding {
    let worst = 0
    let worstFrame: number | undefined
    let worstKey: string | undefined
    let poseProblem: string | undefined
    let firstFrame: number | undefined
    let firstKey: string | undefined
    let checked = 0
    for (const frame of plan.settleFrames) {
        const observation = observationAt(trace, frame)
        if (!observation) continue
        for (const key of observation.connected) {
            const drawn = observation.boxes[key]
            if (!drawn) continue
            const mount = plan.mounts[key]
            const target =
                latestSegment(plan, key, frame)?.to ?? plan.initial[key]
            if (!target) continue
            checked += 1
            firstFrame ??= frame
            firstKey ??= key
            const result = worstEdge(drawn, target)
            if (result.error > worst) {
                worst = result.error
                worstFrame = frame
                worstKey = key
            }
            if (mount) {
                const style = observation.style[key]
                if (style) {
                    if (style.translate !== mount.translate)
                        poseProblem ??= `${key}: leftover translate "${style.translate}"`
                    if (style.scale !== mount.scale)
                        poseProblem ??= `${key}: leftover scale "${style.scale}"`
                }
            }
        }
    }
    return {
        id: 'G5',
        label: 'Settle exactness: rect against the layout box, and the pose',
        gate: '<= 0.01 px; no pose declaration left',
        unit: 'px',
        value: worst,
        pass: worst <= 0.01 && poseProblem === undefined,
        measured: checked > 0,
        worst: {
            frame: worstFrame ?? firstFrame,
            participant: worstKey ?? firstKey,
            detail: poseProblem,
        },
        detail:
            checked === 0
                ? 'n/a: no settle frame recorded'
                : (poseProblem ?? `${checked} settled participants`),
    }
}

function latestSegment(
    plan: ScenePlan,
    key: string,
    frame: number
): SegmentPlan | null {
    let found: SegmentPlan | null = null
    for (const commit of plan.commits) {
        if (commit.frame > frame) break
        for (const segment of commit.segments) {
            if (segment.key === key) found = segment
        }
    }
    return found
}

function scoreRestoration(plan: ScenePlan, trace: SceneTrace): MetricFinding {
    let worstKey: string | undefined
    let worstDeclarations: string | undefined
    let firstKey: string | undefined
    let count = 0
    let inlineDifferences = 0
    const check = (
        observation: Observation | undefined,
        key: string,
        label: string,
        declarations?: readonly string[]
    ) => {
        if (!observation) return
        const mount = plan.mounts[key]
        const style = observation.style[key]
        if (!mount || !style) return
        firstKey ??= key
        if (style.inline !== mount.inline) inlineDifferences += 1
        const mismatches = sameStyle(style, mount).filter(
            (declaration) =>
                declarations === undefined || declarations.includes(declaration)
        )
        if (mismatches.length > 0) {
            count += 1
            if (!worstKey) {
                worstKey = key
                worstDeclarations = `${label}: ${mismatches.join(', ')}`
            }
        }
    }
    for (const frame of plan.settleFrames) {
        const observation = observationAt(trace, frame)
        if (!observation) continue
        for (const key of observation.connected)
            check(observation, key, `settle ${frame}`)
    }
    for (const checkPlan of plan.restorationChecks) {
        check(
            observationAt(trace, checkPlan.frame),
            checkPlan.key,
            checkPlan.label,
            checkPlan.declarations
        )
    }
    const final = trace.observations[trace.observations.length - 1]
    if (final) {
        for (const key of final.connected) check(final, key, 'final')
    }
    // Every participant that leaves the trace is checked at its last
    // connected frame. A crossfade follower is expected to be inert there
    // (P3b); a settled removal is compared with its mount snapshot.
    for (const key of plan.completeness.requiredKeys) {
        let lastIndex = -1
        trace.observations.forEach((observation, index) => {
            if (observation.connected.includes(key)) lastIndex = index
        })
        if (lastIndex < 0) continue
        const last = trace.observations[lastIndex]!
        const removed = !final?.connected.includes(key)
        if (!removed) continue
        const pair = plan.pairs.find((candidate) => candidate.follower === key)
        const followerAtRemoval =
            pair !== undefined &&
            last.frame >= pair.startFrame &&
            plan.pairs.find(
                (candidate) =>
                    candidate.startFrame ===
                        Math.max(
                            ...plan.pairs
                                .filter(
                                    (entry) => entry.startFrame <= last.frame
                                )
                                .map((entry) => entry.startFrame)
                        ) && candidate.follower === key
            ) !== undefined
        if (followerAtRemoval) {
            const style = last.style[key]
            if (style?.inert === null) {
                count += 1
                worstKey ??= key
                worstDeclarations ??= `removed follower ${key} at frame ${last.frame}: inert absent`
            }
            continue
        }
        check(last, key, `last connected frame ${last.frame}`)
    }
    return {
        id: 'G6',
        label: 'Restoration of every owned inline declaration',
        gate: 'byte for byte the authored one',
        unit: 'declarations',
        value: count,
        pass: count === 0,
        worst: {
            participant: worstKey ?? firstKey,
            detail:
                worstDeclarations ??
                (count === 0
                    ? `0 mismatches; ${inlineDifferences} inline cssText difference(s) recorded as evidence`
                    : undefined),
        },
    }
}

function scoreReports(plan: ScenePlan, trace: SceneTrace): MetricFinding {
    const expectedDiagnostics = [...(plan.expectedDiagnostics ?? [])].sort()
    const actualDiagnostics = trace.diagnostics
        .map((diagnostic) => diagnostic.code)
        .sort()
    const expectedOnSnap = [...(plan.expectedOnSnap ?? [])].sort()
    const actualOnSnap = trace.onSnap.map((snap) => snap.reason).sort()
    let problems = 0
    let detail: string | undefined
    for (const commit of plan.commits) {
        const report = trace.reports.find(
            (entry) => entry.label === commit.label
        )
        if (!report) {
            problems += 1
            detail ??= `${commit.label}: no report resolved`
            continue
        }
        if (report.status !== commit.expectedStatus) {
            problems += 1
            detail ??= `${commit.label}: status "${report.status}" != "${commit.expectedStatus}"`
        }
        const expectedSnapped = [...(commit.expectedSnapped ?? [])].sort()
        const actualSnapped = report.snapped
            .map((snap) => `${snap.key}:${snap.reason}`)
            .sort()
        if (JSON.stringify(expectedSnapped) !== JSON.stringify(actualSnapped)) {
            problems += 1
            detail ??= `${commit.label}: snapped [${actualSnapped.join(',')}] != [${expectedSnapped.join(',')}]`
        }
    }
    if (
        JSON.stringify(expectedDiagnostics) !==
        JSON.stringify(actualDiagnostics)
    ) {
        problems += 1
        detail ??= `diagnostics [${actualDiagnostics.join(',')}] != [${expectedDiagnostics.join(',')}]`
    }
    if (JSON.stringify(expectedOnSnap) !== JSON.stringify(actualOnSnap)) {
        problems += 1
        detail ??= `onSnap [${actualOnSnap.join(',')}] != [${expectedOnSnap.join(',')}]`
    }
    if (trace.reports.length !== plan.commits.length) {
        problems += 1
        detail ??= `${trace.reports.length} reports for ${plan.commits.length} commits`
    }
    const firstLabel = plan.commits[0]?.label
    return {
        id: 'G7',
        label: 'Reports: status, snapped set and diagnostics',
        gate: 'exactly as the scene script expects',
        unit: 'mismatches',
        value: problems,
        pass: problems === 0,
        worst: {
            label: firstLabel,
            detail: detail ?? 'all reports match',
        },
        detail,
    }
}

function scoreReads(trace: SceneTrace): MetricFinding {
    let excess = 0
    let worstLabel: string | undefined
    let detail: string | undefined
    for (const commit of trace.commits) {
        const required = commit.nBefore + commit.nAfter
        const styleExcess =
            commit.styles < commit.stylesMin
                ? commit.stylesMin - commit.styles
                : commit.styles > commit.stylesMax
                  ? commit.styles - commit.stylesMax
                  : 0
        const commitExcess =
            Math.max(0, commit.rects - required) +
            Math.max(0, commit.offsets - required) +
            Math.max(0, commit.frameReads) +
            styleExcess
        if (commitExcess > excess) {
            excess = commitExcess
            worstLabel = commit.label
            detail = `${commit.label}: ${commit.rects} rects, ${commit.offsets} pairs, ${commit.styles} computed reads (${commit.stylesMin}..${commit.stylesMax}: ${commit.styleRadiusCapture} radius capture + ${commit.styleActiveFlush} active flush, plus optional Typed OM), ${commit.frameReads} frame reads; required ${required}/${required}/0 (probes ${commit.probes}, parents ${commit.parents})`
        }
    }
    if (trace.steadyFrameReads > 0) {
        excess += trace.steadyFrameReads
        detail ??= `steady frame ${trace.steadyFrameReadsAt}: ${trace.steadyFrameReads} reads`
    }
    return {
        id: 'G13',
        label: 'Exact read counts per commit and zero steady-frame reads',
        gate: '<= 2N rects and 2N layout-size pairs, exactly the §4.1/§4.3 computed reads; steady frames read zero',
        unit: 'excess reads',
        value: excess,
        pass: excess === 0,
        worst: {
            label: worstLabel ?? trace.commits[0]?.label,
            detail: detail ?? 'all commits exact; steady frames read zero',
        },
        detail,
    }
}

function scoreFocus(plan: ScenePlan, trace: SceneTrace): MetricFinding {
    let problems = 0
    let compared = 0
    let worstFrame: number | undefined
    let worstKey: string | undefined
    for (const observation of trace.observations) {
        const activePairs = activePairsAt(
            plan,
            observation.frame,
            observation.kind === 'flush'
        )
        for (const active of activePairs) {
            compared += 1
            if (observation.activeElementKey === active.pair.follower) {
                problems += 1
                worstFrame ??= observation.frame
                worstKey ??= active.pair.follower
            }
        }
    }
    return {
        id: 'shape.focus',
        label: 'Focus is not inside a crossfade follower',
        gate: 'activeElement is never the follower participant',
        unit: 'violations',
        value: problems,
        pass: problems === 0,
        measured: compared > 0,
        worst: { frame: worstFrame, participant: worstKey },
    }
}

function scoreShape(plan: ScenePlan, trace: SceneTrace): MetricFinding[] {
    return [
        scoreCrossfadeOpacity(plan, trace),
        scoreCoverage(plan, trace),
        scoreRadius(plan, trace),
        scoreStaticRadius(plan, trace),
        scoreInert(plan, trace),
        scoreFocus(plan, trace),
        scoreFont(plan, trace),
        scoreTeardown(trace),
    ]
}

function activePairsAt(
    plan: ScenePlan,
    frame: number,
    flushed: boolean
): { pair: ScenePlan['pairs'][number]; index: number }[] {
    let latest = -1
    plan.pairs.forEach((pair) => {
        if (pair.startFrame < frame || (pair.startFrame === frame && flushed)) {
            latest = Math.max(latest, pair.startFrame)
        }
    })
    if (latest < 0) return []
    return plan.pairs
        .map((pair, index) => ({ pair, index }))
        .filter(({ pair }) => pair.startFrame === latest)
}

function pairProgress(
    plan: ScenePlan,
    trace: SceneTrace,
    pair: ScenePlan['pairs'][number],
    frame: number,
    flushed: boolean
): number {
    const states = stateHistory(plan, trace)
    const history = states.get(pair.lead)
    if (!history || history.length === 0) return 0
    let active: SegmentState | null = null
    for (const state of history) {
        if (
            state.startFrame < frame ||
            (state.startFrame === frame && flushed)
        ) {
            active = state
        }
    }
    if (!active || active.kind === 'none') return 0
    return perceptualOf(active.motion!, elapsedAt(active, frame, plan.stepMs))
}

function pairOpacities(
    plan: ScenePlan,
    trace: SceneTrace,
    index: number,
    frame: number,
    flushed: boolean
): { lead: number; follower: number } {
    const pair = plan.pairs[index]!
    const p = pairProgress(plan, trace, pair, frame, flushed)
    if (pair.reversal) {
        let previous: {
            pair: ScenePlan['pairs'][number]
            index: number
        } | null = null
        for (let i = 0; i < index; i++) {
            const candidate = plan.pairs[i]!
            if (
                candidate.id === pair.id &&
                candidate.startFrame < pair.startFrame
            ) {
                previous = { pair: candidate, index: i }
            }
        }
        if (previous) {
            const at = pairOpacities(
                plan,
                trace,
                previous.index,
                pair.startFrame,
                false
            )
            return crossfade(p, at.follower, at.lead)
        }
    }
    return crossfade(p, 0, 1)
}

function pairRadius(
    plan: ScenePlan,
    trace: SceneTrace,
    index: number,
    frame: number,
    flushed: boolean
): number | null {
    const pair = plan.pairs[index]!
    if (pair.radiusFrom === undefined || pair.radiusTo === undefined)
        return null
    const p = pairProgress(plan, trace, pair, frame, flushed)
    let from = pair.radiusFrom
    if (pair.reversal) {
        for (let i = 0; i < index; i++) {
            const previous = plan.pairs[i]!
            if (
                previous.id === pair.id &&
                previous.startFrame < pair.startFrame
            ) {
                const previousRadius = pairRadius(
                    plan,
                    trace,
                    i,
                    pair.startFrame,
                    false
                )
                if (previousRadius !== null) from = previousRadius
            }
        }
    }
    return blendRadius(from, pair.radiusTo, p)
}

/** The states by key, in commit order (rebuilt from the plan and trace). */
function stateHistory(
    plan: ScenePlan,
    trace: SceneTrace
): Map<string, SegmentState[]> {
    const history = new Map<string, SegmentState[]>()
    const states = new Map<string, SegmentState>()
    const commitByLabel = new Map(
        plan.commits.map((commit) => [commit.label, commit])
    )
    trace.observations.forEach((observation, observationIndex) => {
        if (observation.kind !== 'flush' || !observation.commitLabel) return
        const commit = commitByLabel.get(observation.commitLabel)
        if (!commit) return
        const previousObservation = trace.observations[observationIndex - 1]
        const pending: { key: string; state: SegmentState }[] = []
        for (const segment of commit.segments) {
            const source = segment.handoffFrom ?? segment.key
            const sourceState = states.get(source)
            const observedFrom = previousObservation?.boxes[source] ?? null
            const from =
                observedFrom ??
                (sourceState
                    ? valueAt(sourceState, observation.frame, plan.stepMs)
                    : (plan.initial[source] ??
                      (segment.kind === 'none' ? segment.to : undefined)))
            if (!from) continue
            const active = sourceState
                ? activeAt(sourceState, observation.frame, plan.stepMs)
                : false
            const v0 =
                segment.velocityOverride === undefined
                    ? active
                        ? velocityAt(
                              sourceState!,
                              observation.frame,
                              plan.stepMs
                          )
                        : zeroBoxVelocity()
                    : (segment.velocityOverride ?? zeroBoxVelocity())
            const settle =
                segment.kind === 'spring'
                    ? settleOfBox(
                          segment.motion!.duration,
                          (segment.motion as { bounce: number }).bounce,
                          from,
                          segment.to,
                          v0
                      )
                    : segment.kind === 'timing'
                      ? segment.motion!.duration
                      : 0
            const state: SegmentState = {
                key: segment.key,
                kind: segment.kind,
                startFrame: observation.frame,
                from,
                to: segment.to,
                motion: segment.motion,
                v0,
                moving:
                    segment.velocityOverride === undefined
                        ? active
                        : v0.x !== 0 || v0.y !== 0,
                settle,
            }
            pending.push({ key: segment.key, state })
        }
        for (const entry of pending) {
            states.set(entry.key, entry.state)
            const list = history.get(entry.key) ?? []
            list.push(entry.state)
            history.set(entry.key, list)
        }
    })
    return history
}

function scoreCrossfadeOpacity(
    plan: ScenePlan,
    trace: SceneTrace
): MetricFinding {
    let worst = 0
    let worstFrame: number | undefined
    let worstKey: string | undefined
    let compared = 0
    for (const observation of trace.observations) {
        const activePairs = activePairsAt(
            plan,
            observation.frame,
            observation.kind === 'flush'
        )
        for (const active of activePairs) {
            const expected = pairOpacities(
                plan,
                trace,
                active.index,
                observation.frame,
                observation.kind === 'flush'
            )
            for (const [key, want] of [
                [active.pair.lead, expected.lead],
                [active.pair.follower, expected.follower],
            ] as const) {
                const got = observation.opacity[key]
                if (got === undefined) continue
                compared += 1
                const error = Math.abs(got - want)
                if (error > worst) {
                    worst = error
                    worstFrame = observation.frame
                    worstKey = key
                }
            }
        }
    }
    return {
        id: 'shape.opacity',
        label: 'Crossfade layer opacity',
        gate: '<= 1e-5 against the independent crossfade',
        unit: 'opacity',
        value: worst,
        pass: worst <= 1e-5,
        measured: compared > 0,
        worst: { frame: worstFrame, participant: worstKey },
        detail: compared === 0 ? 'n/a: no crossfade pair' : undefined,
    }
}

function scoreCoverage(plan: ScenePlan, trace: SceneTrace): MetricFinding {
    let worst = 0
    let worstFrame: number | undefined
    let compared = 0
    for (const observation of trace.observations) {
        const activePairs = activePairsAt(
            plan,
            observation.frame,
            observation.kind === 'flush'
        )
        for (const active of activePairs) {
            const lead = observation.opacity[active.pair.lead]
            const follower = observation.opacity[active.pair.follower]
            if (lead === undefined || follower === undefined) continue
            compared += 1
            const error = Math.abs(coverage(lead, follower) - 1)
            if (error > worst) {
                worst = error
                worstFrame = observation.frame
            }
        }
    }
    return {
        id: 'shape.coverage',
        label: 'Crossfade source-over coverage',
        gate: '|coverage - 1| <= 1e-5',
        unit: 'coverage',
        value: worst,
        pass: worst <= 1e-5,
        measured: compared > 0,
        worst: { frame: worstFrame },
        detail: compared === 0 ? 'n/a: no crossfade pair' : undefined,
    }
}

function scoreRadius(plan: ScenePlan, trace: SceneTrace): MetricFinding {
    let worst = 0
    let worstFrame: number | undefined
    let worstKey: string | undefined
    let compared = 0
    for (const observation of trace.observations) {
        const activePairs = activePairsAt(
            plan,
            observation.frame,
            observation.kind === 'flush'
        )
        for (const active of activePairs) {
            const want = pairRadius(
                plan,
                trace,
                active.index,
                observation.frame,
                observation.kind === 'flush'
            )
            if (want === null) continue
            for (const key of [active.pair.lead, active.pair.follower]) {
                const radii = observation.radii[key]
                if (!radii) continue
                compared += 1
                for (const radius of radii) {
                    const error = Math.abs(radius - want)
                    if (error > worst) {
                        worst = error
                        worstFrame = observation.frame
                        worstKey = key
                    }
                }
            }
        }
    }
    return {
        id: 'shape.radius',
        label: 'Crossfade on-screen corner radius',
        gate: '<= 0.03 px between both layers and the blend',
        unit: 'px',
        value: worst,
        pass: worst <= 0.03,
        measured: compared > 0,
        worst: { frame: worstFrame, participant: worstKey },
        detail: compared === 0 ? 'n/a: no radius-blended pair' : undefined,
    }
}

function scoreStaticRadius(plan: ScenePlan, trace: SceneTrace): MetricFinding {
    const expected = plan.staticRadii ?? {}
    let worst = 0
    let worstFrame: number | undefined
    let worstKey: string | undefined
    let compared = 0
    for (const observation of trace.observations) {
        for (const [key, want] of Object.entries(expected)) {
            const radii = observation.radii[key]
            if (!radii) continue
            compared += 1
            for (const radius of radii) {
                const error = Math.abs(radius - want)
                if (error > worst) {
                    worst = error
                    worstFrame = observation.frame
                    worstKey = key
                }
            }
        }
    }
    return {
        id: 'shape.pill-radius',
        label: 'Constant participant radius',
        gate: '<= 0.01 px',
        unit: 'px',
        value: worst,
        pass: worst <= 0.01,
        measured: compared > 0,
        worst: { frame: worstFrame, participant: worstKey },
        detail:
            compared === 0 ? 'n/a: no constant-radius participant' : undefined,
    }
}

function scoreInert(plan: ScenePlan, trace: SceneTrace): MetricFinding {
    let problems = 0
    let compared = 0
    let worstFrame: number | undefined
    let worstKey: string | undefined
    for (const observation of trace.observations) {
        const activePairs = activePairsAt(
            plan,
            observation.frame,
            observation.kind === 'flush'
        )
        for (const active of activePairs) {
            const follower = observation.style[active.pair.follower]
            const lead = observation.style[active.pair.lead]
            if (follower || lead) compared += 1
            if (follower && follower.inert === null) {
                problems += 1
                worstFrame ??= observation.frame
                worstKey ??= active.pair.follower
            }
            if (lead && lead.inert !== null) {
                problems += 1
                worstFrame ??= observation.frame
                worstKey ??= active.pair.lead
            }
        }
    }
    return {
        id: 'shape.inert',
        label: 'Crossfade follower inert, lead focusable',
        gate: 'follower inert from the first crossfade frame, restored on reversal',
        unit: 'violations',
        value: problems,
        pass: problems === 0,
        measured: compared > 0,
        worst: { frame: worstFrame, participant: worstKey },
    }
}

function scoreFont(plan: ScenePlan, trace: SceneTrace): MetricFinding {
    let problems = 0
    let compared = 0
    let worstFrame: number | undefined
    let fonts: string | undefined
    for (const observation of trace.observations) {
        const activePairs = activePairsAt(
            plan,
            observation.frame,
            observation.kind === 'flush'
        )
        for (const active of activePairs) {
            if (active.pair.id !== 'today-title') continue
            const a = observation.font[active.pair.lead]
            const b = observation.font[active.pair.follower]
            if (a === undefined || b === undefined) continue
            compared += 1
            if (a !== b) {
                problems += 1
                worstFrame ??= observation.frame
                fonts ??= `${a} != ${b}`
            }
        }
    }
    return {
        id: 'shape.font',
        label: 'Computed font equality across the shared title pair',
        gate: 'identical computed font string',
        unit: 'violations',
        value: problems,
        pass: problems === 0,
        measured: compared > 0,
        worst: { frame: worstFrame, detail: fonts },
    }
}

function scoreTeardown(trace: SceneTrace): MetricFinding {
    const final = trace.final
    const clean =
        final.tracks === 0 &&
        final.holds === 0 &&
        final.clockPending === 0 &&
        final.clockSize === 0
    return {
        id: 'shape.teardown',
        label: 'Teardown: no track, hold, clock frame request or pending frame',
        gate: 'all zero',
        unit: 'leftovers',
        value:
            final.tracks + final.holds + final.clockPending + final.clockSize,
        pass: clean,
        worst: {
            detail: `tracks ${final.tracks}, holds ${final.holds}, clock pending ${final.clockPending}, clock size ${final.clockSize}`,
        },
    }
}

function scoreCompleteness(
    plan: ScenePlan,
    trace: SceneTrace,
    metrics: readonly MetricFinding[],
    shape: readonly MetricFinding[]
): MetricFinding {
    const req = plan.completeness
    const problems: string[] = []
    const note = (message: string) => {
        if (problems.length < 20) problems.push(message)
    }
    if (trace.observations.length < req.requiredObservations) {
        note(
            `observations ${trace.observations.length} < required ${req.requiredObservations}`
        )
    }
    if (trace.commits.length !== req.requiredCommits) {
        note(
            `commits ${trace.commits.length} != required ${req.requiredCommits}`
        )
    }
    const expectedCommitLabels = plan.commits.map((commit) => commit.label)
    const actualCommitLabels = trace.commits.map((commit) => commit.label)
    if (
        actualCommitLabels.length !== expectedCommitLabels.length ||
        actualCommitLabels.some(
            (label, index) => label !== expectedCommitLabels[index]
        )
    ) {
        note(
            `commit labels [${actualCommitLabels.join(',')}] != [${expectedCommitLabels.join(',')}]`
        )
    }
    if (trace.reports.length !== req.requiredReports) {
        note(
            `reports ${trace.reports.length} != required ${req.requiredReports}`
        )
    }
    for (const label of expectedCommitLabels) {
        const reports = trace.reports.filter((report) => report.label === label)
        if (reports.length !== 1) {
            note(`report "${label}" count ${reports.length} != 1`)
        }
        const flushes = trace.observations.filter(
            (observation) =>
                observation.kind === 'flush' &&
                observation.commitLabel === label
        )
        if (flushes.length !== 1) {
            note(`flush observation "${label}" count ${flushes.length} != 1`)
        }
    }
    if (trace.settleFrames.length < req.requiredSettleFrames) {
        note(
            `settle frames ${trace.settleFrames.length} < required ${req.requiredSettleFrames}`
        )
    }
    for (const frame of plan.settleFrames) {
        const observed = trace.observations.some(
            (observation) =>
                observation.frame === frame && observation.kind === 'frame'
        )
        if (!observed) note(`no frame observation at settle frame ${frame}`)
    }
    const seen = new Set<string>()
    for (const observation of trace.observations) {
        for (const key of observation.connected) {
            if (!req.requiredKeys.includes(key)) {
                note(
                    `unknown data-p key "${key}" at frame ${observation.frame}`
                )
            }
            seen.add(key)
            if (!observation.boxes[key]) {
                note(
                    `connected "${key}" has no box at frame ${observation.frame}`
                )
            }
        }
    }
    for (const key of req.requiredKeys) {
        if (!seen.has(key)) note(`participant "${key}" is never connected`)
    }
    let pairObservations = 0
    for (const pair of plan.pairs) {
        const found = trace.observations.find(
            (observation) =>
                observation.connected.includes(pair.lead) &&
                observation.connected.includes(pair.follower) &&
                observation.opacity[pair.lead] !== undefined &&
                observation.opacity[pair.follower] !== undefined
        )
        if (!found) {
            note(
                `pair "${pair.id}" has no observation with both layers and opacities`
            )
            continue
        }
        pairObservations += 1
        if (pair.radiusFrom !== undefined && pair.radiusTo !== undefined) {
            for (const key of [pair.lead, pair.follower]) {
                const anyRadii = trace.observations.some((observation) =>
                    Boolean(observation.radii[key])
                )
                if (!anyRadii)
                    note(`pair "${pair.id}" has no radii for "${key}"`)
            }
        }
        if (pair.id === 'today-title') {
            const anyFont = trace.observations.some(
                (observation) =>
                    observation.font[pair.lead] !== undefined &&
                    observation.font[pair.follower] !== undefined
            )
            if (!anyFont) note(`pair "${pair.id}" has no font strings`)
        }
    }
    if (pairObservations !== req.requiredPairs) {
        note(
            `pair observations ${pairObservations} != required ${req.requiredPairs}`
        )
    }
    for (const key of req.requiredStaticRadii) {
        if (!trace.observations.some((observation) => observation.radii[key])) {
            note(`no radii observation for "${key}"`)
        }
    }
    for (const id of req.requiredMetrics) {
        const finding = metrics.find((entry) => entry.id === id)
        if (!finding) {
            note(`required metric ${id} is missing`)
            continue
        }
        if (finding.measured === false) note(`required metric ${id} is n/a`)
        if (!Number.isFinite(finding.value))
            note(`required metric ${id} is not finite`)
        if (finding.detail?.startsWith('n/a'))
            note(`required metric ${id} is n/a`)
    }
    for (const id of req.requiredShape) {
        const finding = shape.find((entry) => entry.id === id)
        if (!finding) {
            note(`required shape metric ${id} is missing`)
            continue
        }
        if (finding.measured === false)
            note(`required shape metric ${id} is n/a`)
        if (!Number.isFinite(finding.value))
            note(`required shape metric ${id} is not finite`)
        if (finding.detail?.startsWith('n/a'))
            note(`required shape metric ${id} is n/a`)
    }
    if (trace.final.connected.length === 0) {
        note('no connected participants in the final state')
    }
    return {
        id: 'C1',
        label: 'Trace completeness against the scene contract',
        gate: 'required observations, commits, reports, settle frames, participants, pair/opacity/radius/font data, and no n/a declared metric',
        unit: 'contract failures',
        value: problems.length,
        pass: problems.length === 0,
        measured: true,
        worst: { detail: problems.slice(0, 5).join('; ') },
        detail: problems.length === 0 ? 'complete' : problems.join('; '),
    }
}

/** Scores every §11.6 metric and the scene-specific shape assertions. */
export function scoreScene(plan: ScenePlan, trace: SceneTrace): SceneScore {
    const expected = buildExpected(plan, trace)
    const base: MetricFinding[] = [
        scoreOracle('G1', trace, expected, false),
        scoreContinuity(trace, expected),
        scoreVelocity(trace, expected),
        scoreOracle('G4', trace, expected, true),
        scoreSettle(plan, trace),
        scoreRestoration(plan, trace),
        scoreReports(plan, trace),
        scoreReads(trace),
    ]
    const shape = scoreShape(plan, trace)
    const completeness = scoreCompleteness(plan, trace, base, shape)
    const metrics = [completeness, ...base]
    return {
        scene: plan.scene,
        metrics,
        shape,
        pass:
            metrics.every((metric) => metric.pass) &&
            shape.every((metric) => metric.pass),
        observations: trace.observations.length,
    }
}

/** Exposed for negative controls: the exact per-commit G3 pair of a trace. */
export function analyticVelocityPairs(
    plan: ScenePlan,
    trace: SceneTrace
): Expected['commits'][number]['g3'] {
    return buildExpected(plan, trace).commits.flatMap((commit) => commit.g3)
}

/** Exposed for negative controls: G2 pairs of a trace. */
export function continuityPairs(
    plan: ScenePlan,
    trace: SceneTrace
): Expected['commits'][number]['g2'] {
    return buildExpected(plan, trace).commits.flatMap((commit) => commit.g2)
}
