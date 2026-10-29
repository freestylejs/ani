/**
 * P5c support variants (H19): the DPR 1/3 sweep and the §9.4 reduced-motion
 * policies. A variant is scored with the same gates and the same independent
 * oracle as the primary run; the only difference is the method of the
 * out-of-scope support sweep (`deviceScaleFactor`) or the policy declared by
 * §9.4. No gate value or tolerance is changed here.
 */
import { type Box, settleOfBox, trackState, zeroBoxVelocity } from './oracle.ts'
import type {
    CommitPlan,
    PairPlan,
    ScenePlan,
    SceneTrace,
    SegmentPlan,
    VariantId,
    VariantRunOptions,
} from './types.ts'

export const REDUCED_GRID = [1, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2, 0.1] as const
export const REDUCED_MAX_DURATION = 0.2

export interface VariantSpec extends VariantRunOptions {
    readonly scene: string
    readonly label: string
}

const DPR_SCENES = ['s-card', 's-photo', 's-acc', 's-seg'] as const
const REDUCED_SCENES = [
    's-card',
    's-photo',
    's-acc',
    's-reorder',
    's-sheet',
] as const
const DPR_IDS = ['dpr1', 'dpr3'] as const
const REDUCED_IDS = ['rm-jump', 'rm-max', 'rm-ignore'] as const

export function variantsForScene(scene: string): readonly VariantId[] {
    const ids: VariantId[] = []
    if ((DPR_SCENES as readonly string[]).includes(scene)) ids.push(...DPR_IDS)
    if ((REDUCED_SCENES as readonly string[]).includes(scene)) {
        ids.push(...REDUCED_IDS)
    }
    return ids
}

export function variantSpec(scene: string, id: VariantId): VariantSpec {
    if (id === 'dpr1' || id === 'dpr3') {
        const dpr = id === 'dpr1' ? 1 : 3
        return {
            scene,
            id,
            kind: 'dpr',
            dpr,
            policy: null,
            reducedPreference: false,
            label: `${scene} DPR ${dpr}`,
        }
    }
    const policy =
        id === 'rm-jump' ? 'jump' : id === 'rm-max' ? 'maxDuration' : 'ignore'
    return {
        scene,
        id,
        kind: 'reduced',
        dpr: 2,
        policy,
        reducedPreference: true,
        label: `${scene} reduced-motion ${policy}`,
    }
}

export function variantKey(scene: string, id: VariantId): string {
    return `${scene}@${id}`
}

export function selectedVariants(
    scenes: readonly string[],
    patterns: readonly string[]
): VariantSpec[] {
    const variants: VariantSpec[] = []
    for (const scene of scenes) {
        for (const id of variantsForScene(scene)) {
            if (!patterns.includes(id)) continue
            variants.push(variantSpec(scene, id))
        }
    }
    return variants
}

/* ───────────────────────── reduced-motion plan ───────────────────────── */

interface SimState {
    readonly key: string
    readonly kind: 'spring' | 'timing' | 'none'
    readonly startFrame: number
    readonly from: Box
    readonly to: Box
    readonly motion: SegmentPlan['motion']
    readonly v0: Box
    readonly moving: boolean
    readonly carrying: boolean
    readonly settle: number
}

function elapsedAt(state: SimState, frame: number, stepMs: number): number {
    if (state.kind === 'none') return 0
    const local = frame - state.startFrame
    if (local <= 0) return 0
    return state.moving
        ? (local * stepMs) / 1000
        : (Math.max(0, local - 1) * stepMs) / 1000
}

function valueAt(state: SimState, frame: number, stepMs: number): Box {
    if (state.kind === 'none') return state.to
    return trackState(
        state.motion!,
        state.from,
        state.to,
        state.carrying ? state.v0 : null,
        elapsedAt(state, frame, stepMs),
        state.settle
    ).box
}

function velocityAt(state: SimState, frame: number, stepMs: number): Box {
    if (state.kind === 'none') return zeroBoxVelocity()
    return trackState(
        state.motion!,
        state.from,
        state.to,
        state.carrying ? state.v0 : null,
        elapsedAt(state, frame, stepMs),
        state.settle
    ).velocity
}

function activeAt(state: SimState, frame: number, stepMs: number): boolean {
    if (state.kind === 'none') return false
    if (frame <= state.startFrame) return false
    return elapsedAt(state, frame, stepMs) < state.settle
}

function targetOf(segment: SegmentPlan, from: Box): Box {
    return segment.toFromB
        ? {
              x: from.x + segment.toFromB.dx,
              y: from.y + segment.toFromB.dy,
              w: from.w,
              h: from.h,
          }
        : segment.to
}

interface ClampedSpring {
    readonly motion: Extract<SegmentPlan['motion'], { type: 'spring' }>
    readonly carrying: boolean
    readonly settle: number
    readonly fits: boolean
}

/**
 * The §9.4 spring grid: bounce clamped to <= 0; the largest factor of the
 * grid whose delay·f + T_s(D·f, x₀, v₀) fits `maxDuration`; first carrying
 * the incoming velocity, then from rest; otherwise the node jumps. The settle
 * is recomputed by the independent oracle (`settleOfBox`), never by the
 * production solver.
 */
export function clampReducedSpring(
    duration: number,
    bounce: number,
    from: Box,
    to: Box,
    velocity: Box,
    carry: boolean,
    maxDuration: number,
    delay = 0
): ClampedSpring {
    const clampedBounce = Math.min(bounce, 0)
    for (const candidate of carry ? [true, false] : [false]) {
        for (const factor of REDUCED_GRID) {
            const scaled = duration * factor
            const settle = settleOfBox(
                scaled,
                clampedBounce,
                from,
                to,
                candidate ? velocity : null
            )
            if (delay * factor + settle <= maxDuration) {
                return {
                    motion: {
                        type: 'spring',
                        duration: scaled,
                        bounce: clampedBounce,
                    },
                    carrying: candidate,
                    settle,
                    fits: true,
                }
            }
        }
    }
    return {
        motion: {
            type: 'spring',
            duration: duration * REDUCED_GRID[REDUCED_GRID.length - 1]!,
            bounce: clampedBounce,
        },
        carrying: false,
        settle: Number.POSITIVE_INFINITY,
        fits: false,
    }
}

function clampTiming(
    motion: Extract<NonNullable<SegmentPlan['motion']>, { type: 'timing' }>,
    maxDuration: number
): Extract<NonNullable<SegmentPlan['motion']>, { type: 'timing' }> {
    const total = motion.duration
    if (total <= maxDuration) return motion
    return {
        ...motion,
        duration: motion.duration * (maxDuration / total),
    }
}

function flushIndex(trace: SceneTrace, label: string): number {
    return trace.observations.findIndex(
        (observation) =>
            observation.kind === 'flush' && observation.commitLabel === label
    )
}

/**
 * Re-scores one reduced-motion policy as data: rewrites every segment's
 * motion to the clamped spring, or to the `'jump'` endpoint, and derives the
 * exact status/snapped expectation from §9.3/§9.4 and A-13.
 */
export function applyVariantPlan(
    plan: ScenePlan,
    trace: SceneTrace,
    variant: VariantSpec
): ScenePlan {
    if (variant.kind === 'dpr') {
        return { ...plan, reducedMotion: undefined }
    }
    if (variant.policy === 'ignore') {
        return { ...plan, reducedMotion: 'ignore' }
    }
    if (variant.policy === 'jump') {
        return jumpPlan(plan)
    }
    return maxDurationPlan(plan, trace)
}

function jumpPlan(plan: ScenePlan): ScenePlan {
    const commits: CommitPlan[] = plan.commits.map((commit) => {
        const moving = commit.segments.filter(
            (segment) => segment.kind !== 'none'
        )
        const followers = new Set(
            plan.pairs
                .filter((pair) => pair.startFrame === commit.frame)
                .map((pair) => pair.follower)
        )
        const expectedSnapped =
            commit.kind === 'release'
                ? commit.expectedSnapped
                : moving.map((segment) => `${segment.key}:reduced`).sort()
        return {
            ...commit,
            expectedStatus:
                commit.kind === 'release'
                    ? commit.expectedStatus
                    : moving.length > 0
                      ? 'reduced'
                      : 'no-change',
            ...(commit.kind === 'release'
                ? {}
                : { expectedSnapped: expectedSnapped ?? [] }),
            segments: commit.segments.map((segment) =>
                segment.kind === 'none'
                    ? segment
                    : {
                          ...segment,
                          kind: 'none' as const,
                          reducedJump: true,
                          reducedCarry: false,
                          reducedHoldFrom: followers.has(segment.key),
                          velocityOverride: null,
                      }
            ),
        }
    })
    const pairs: PairPlan[] = plan.pairs.map((pair) => ({
        ...pair,
        reducedJump: true,
    }))
    const engineCommits = plan.commits.filter(
        (commit) => commit.kind !== 'release'
    )
    const completeness = {
        ...plan.completeness,
        requiredObservations: Math.min(
            plan.completeness.requiredObservations,
            JUMP_OBSERVATIONS[plan.scene] ?? 12
        ),
        requiredCommits: engineCommits.length,
        requiredReports: engineCommits.length,
        requiredSettleFrames: Math.min(
            plan.completeness.requiredSettleFrames,
            JUMP_SETTLE_FRAMES[plan.scene] ?? 1
        ),
        requiredPairs:
            plan.scene === 's-card' ? 6 : plan.completeness.requiredPairs,
        requiredShape: [
            ...new Set([
                ...plan.completeness.requiredShape,
                'shape.reduced-policy',
            ]),
        ],
    }
    return {
        ...plan,
        commits,
        pairs,
        completeness,
        presenceOpacity: plan.presenceOpacity?.map((track) => ({
            ...track,
            from: track.to,
            to: track.to,
            durationMs: 0,
        })),
        expectedOnSnap: commits
            .filter((commit) => commit.kind !== 'release')
            .flatMap((commit) => commit.segments)
            .filter((segment) => segment.reducedJump === true)
            .map(() => 'reduced'),
        reducedMotion: 'jump',
        maxDuration: undefined,
    }
}

const JUMP_OBSERVATIONS: Readonly<Record<string, number>> = {
    's-card': 7,
    's-photo': 20,
    's-acc': 14,
    's-reorder': 12,
    's-sheet': 20,
}

const JUMP_SETTLE_FRAMES: Readonly<Record<string, number>> = {
    's-card': 2,
    's-photo': 2,
    's-acc': 1,
    's-reorder': 1,
    's-sheet': 1,
}

/** Reduced { maxDuration } shortens the loops; per-scene observation floor. */
const MAX_OBSERVATIONS: Readonly<Record<string, number>> = {
    's-card': 18,
    's-photo': 40,
    's-acc': 20,
    's-reorder': 12,
    's-sheet': 20,
}

function maxDurationPlan(plan: ScenePlan, trace: SceneTrace): ScenePlan {
    const states = new Map<string, SimState>()
    const commits: CommitPlan[] = []
    for (const commit of plan.commits) {
        const index = flushIndex(trace, commit.label)
        const previous = index > 0 ? trace.observations[index - 1] : undefined
        const segments: SegmentPlan[] = []
        for (const segment of commit.segments) {
            const source = segment.handoffFrom ?? segment.key
            const sourceState = states.get(source)
            const observedFrom = previous?.boxes[source] ?? null
            const from =
                observedFrom ??
                (sourceState
                    ? valueAt(sourceState, commit.frame, plan.stepMs)
                    : (plan.initial[source] ??
                      (segment.kind === 'none' ? segment.to : undefined)))
            if (!from) {
                throw new Error(
                    `variant ${plan.scene}: no B for "${segment.key}" at "${commit.label}"`
                )
            }
            const active = sourceState
                ? activeAt(sourceState, commit.frame, plan.stepMs)
                : false
            const sourceVelocity = active
                ? velocityAt(sourceState!, commit.frame, plan.stepMs)
                : zeroBoxVelocity()
            const v0 =
                segment.velocityOverride === undefined
                    ? sourceVelocity
                    : (segment.velocityOverride ?? zeroBoxVelocity())
            const moving =
                segment.holdRelease === true
                    ? false
                    : segment.startMoving === true ||
                      (segment.velocityOverride === undefined
                          ? active
                          : v0.x !== 0 ||
                            v0.y !== 0 ||
                            v0.w !== 0 ||
                            v0.h !== 0)
            const target = targetOf(segment, from)
            let kind = segment.kind
            let motion = segment.motion
            let carrying =
                segment.holdRelease === true ||
                (segment.velocityOverride === undefined
                    ? active && segment.startMoving !== true
                    : v0.x !== 0 || v0.y !== 0 || v0.w !== 0 || v0.h !== 0)
            let settle = 0
            let fits = true
            if (kind === 'spring' && motion?.type === 'spring') {
                const clamped = clampReducedSpring(
                    motion.duration,
                    motion.bounce,
                    from,
                    target,
                    v0,
                    carrying,
                    REDUCED_MAX_DURATION
                )
                kind = clamped.fits ? 'spring' : 'none'
                motion = clamped.motion
                carrying = clamped.carrying
                settle = clamped.settle
                fits = clamped.fits
            } else if (kind === 'timing' && motion?.type === 'timing') {
                const clamped = clampTiming(motion, REDUCED_MAX_DURATION)
                motion = clamped
                settle = clamped.duration
            } else if (kind === 'none') {
                settle = 0
            }
            const next: SegmentPlan = {
                ...segment,
                kind,
                motion,
                reducedCarry: kind === 'spring' ? carrying : false,
                ...(kind === 'none' ? { reducedJump: !fits } : {}),
            }
            segments.push(next)
            states.set(segment.key, {
                key: segment.key,
                kind,
                startFrame: commit.frame,
                from,
                to: target,
                motion: kind === 'none' ? undefined : motion,
                v0,
                moving,
                carrying,
                settle,
            })
        }
        const movingSegments = segments.filter(
            (segment) => segment.kind !== 'none'
        )
        const reducedSegments = segments.filter(
            (segment) => segment.reducedJump === true
        )
        const expectedSnapped =
            commit.kind === 'release'
                ? commit.expectedSnapped
                : reducedSegments.length > 0
                  ? reducedSegments.map((segment) => `${segment.key}:reduced`)
                  : commit.expectedSnapped
        commits.push({
            ...commit,
            segments,
            expectedStatus:
                commit.kind === 'release'
                    ? commit.expectedStatus
                    : movingSegments.length === 0 && reducedSegments.length > 0
                      ? 'reduced'
                      : commit.expectedStatus,
            ...(expectedSnapped === undefined
                ? {}
                : { expectedSnapped: [...expectedSnapped].sort() }),
        })
    }
    return {
        ...plan,
        commits,
        reducedMotion: 'maxDuration',
        maxDuration: REDUCED_MAX_DURATION,
        completeness: {
            ...plan.completeness,
            requiredObservations: Math.min(
                plan.completeness.requiredObservations,
                MAX_OBSERVATIONS[plan.scene] ??
                    plan.completeness.requiredObservations
            ),
            requiredShape: [
                ...new Set([
                    ...plan.completeness.requiredShape,
                    'shape.reduced-policy',
                ]),
            ],
        },
    }
}
