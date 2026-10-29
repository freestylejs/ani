/**
 * Node-side scene plans: the scripted geometry and motion as data. The oracle
 * derives every trajectory from this plan and the page's engine-free layout
 * probe; it never reads an engine pose to compute an expectation.
 */
import { type Box, bezierAt, EASE_OUT, perceptualSpring } from './oracle.ts'
import type {
    CommitPlan,
    PairPlan,
    ScenePlan,
    SceneTrace,
    SegmentPlan,
} from './types.ts'

const CARD_SPRING = {
    type: 'spring',
    duration: 0.55,
    bounce: 0.05,
} as const
const SEG_SPRING = {
    type: 'spring',
    duration: 0.35,
    bounce: 0.12,
} as const
const STACK_SPRING = {
    type: 'spring',
    duration: 0.55,
    bounce: 0.08,
} as const

const STACK_KEYS = Array.from({ length: 6 }, (_, i) => [
    `card-${i}`,
    `badge-${i}`,
]).flat()

function aBox(trace: SceneTrace, key: string): Box {
    const box = trace.aBoxes[key]
    if (!box) throw new Error(`scene ${trace.scene}: no probe box "${key}"`)
    return box
}

function commitFrame(trace: SceneTrace, label: string): number {
    const commit = trace.commits.find((entry) => entry.label === label)
    if (!commit) throw new Error(`scene ${trace.scene}: no commit "${label}"`)
    return commit.frame
}

/** The frame of a scripted flush event (a release has no engine commit). */
function flushFrame(trace: SceneTrace, label: string): number {
    const flush = trace.observations.find(
        (observation) =>
            observation.kind === 'flush' && observation.commitLabel === label
    )
    if (!flush)
        throw new Error(`scene ${trace.scene}: no flush event "${label}"`)
    return flush.frame
}

function cardPairs(
    frame: number,
    reversal: boolean,
    forward: boolean,
    radiusFrom: number,
    radiusTo: number
): PairPlan[] {
    const lead = forward ? 'sheet' : 'card'
    const follower = forward ? 'card' : 'sheet'
    const leadImage = forward ? 'sheet-image' : 'card-image'
    const followerImage = forward ? 'card-image' : 'sheet-image'
    const leadTitle = forward ? 'sheet-title' : 'card-title'
    const followerTitle = forward ? 'card-title' : 'sheet-title'
    return [
        {
            id: 'today-card',
            startFrame: frame,
            lead,
            follower,
            radiusFrom,
            radiusTo,
            reversal,
        },
        {
            id: 'today-image',
            startFrame: frame,
            lead: leadImage,
            follower: followerImage,
            reversal,
        },
        {
            id: 'today-title',
            startFrame: frame,
            lead: leadTitle,
            follower: followerTitle,
            reversal,
        },
    ]
}

function cardOpen(frame: number, trace: SceneTrace): CommitPlan {
    const sheet = aBox(trace, 'sheet')
    const sheetImage = aBox(trace, 'sheet-image')
    const sheetTitle = aBox(trace, 'sheet-title')
    const content = aBox(trace, 'sheet-content')
    const spring = (
        key: string,
        to: Box,
        handoffFrom: string
    ): SegmentPlan => ({
        key,
        kind: 'spring',
        to,
        handoffFrom,
        motion: CARD_SPRING,
    })
    return {
        frame,
        label: 'open',
        expectedStatus: 'ended',
        segments: [
            spring('card', sheet, 'card'),
            spring('sheet', sheet, 'card'),
            spring('card-image', sheetImage, 'card-image'),
            spring('sheet-image', sheetImage, 'card-image'),
            spring('card-title', sheetTitle, 'card-title'),
            spring('sheet-title', sheetTitle, 'card-title'),
            {
                key: 'sheet-content',
                kind: 'none',
                to: content,
            },
        ],
    }
}

function cardClose(frame: number, trace: SceneTrace): CommitPlan {
    const card = aBox(trace, 'card')
    const cardImage = aBox(trace, 'card-image')
    const cardTitle = aBox(trace, 'card-title')
    const content = aBox(trace, 'sheet-content')
    const spring = (
        key: string,
        to: Box,
        handoffFrom: string
    ): SegmentPlan => ({
        key,
        kind: 'spring',
        to,
        handoffFrom,
        motion: CARD_SPRING,
    })
    return {
        frame,
        label: 'close',
        expectedStatus: 'interrupted',
        segments: [
            spring('sheet', card, 'sheet'),
            spring('card', card, 'sheet'),
            spring('sheet-image', cardImage, 'sheet-image'),
            spring('card-image', cardImage, 'sheet-image'),
            spring('sheet-title', cardTitle, 'sheet-title'),
            spring('card-title', cardTitle, 'sheet-title'),
            { key: 'sheet-content', kind: 'none', to: content },
        ],
    }
}

function cardReverse(frame: number, trace: SceneTrace): CommitPlan {
    const sheet = aBox(trace, 'sheet')
    const sheetImage = aBox(trace, 'sheet-image')
    const sheetTitle = aBox(trace, 'sheet-title')
    const content = aBox(trace, 'sheet-content')
    const spring = (
        key: string,
        to: Box,
        handoffFrom: string
    ): SegmentPlan => ({
        key,
        kind: 'spring',
        to,
        handoffFrom,
        motion: CARD_SPRING,
    })
    return {
        frame,
        label: 'reverse',
        expectedStatus: 'ended',
        segments: [
            spring('sheet', sheet, 'sheet'),
            spring('card', sheet, 'sheet'),
            spring('sheet-image', sheetImage, 'sheet-image'),
            spring('card-image', sheetImage, 'sheet-image'),
            spring('sheet-title', sheetTitle, 'sheet-title'),
            spring('card-title', sheetTitle, 'sheet-title'),
            { key: 'sheet-content', kind: 'none', to: content },
        ],
    }
}

export function cardPlan(trace: SceneTrace): ScenePlan {
    const openFrame = commitFrame(trace, 'open')
    const closeFrame = commitFrame(trace, 'close')
    const jump = trace.variant === 'rm-jump'
    const reverseFrame = jump ? null : commitFrame(trace, 'reverse')
    return {
        scene: 's-card',
        stepMs: 16,
        completeness: {
            requiredObservations: 100,
            requiredCommits: 3,
            requiredReports: 3,
            requiredSettleFrames: 2,
            requiredKeys: [
                'card',
                'card-image',
                'card-title',
                'sheet',
                'sheet-image',
                'sheet-title',
                'sheet-content',
            ],
            requiredPairs: 9,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: [
                'shape.opacity',
                'shape.coverage',
                'shape.radius',
                'shape.inert',
                'shape.focus',
                'shape.font',
                'shape.teardown',
            ],
            requiredOpacityKeys: [
                'card',
                'sheet',
                'card-image',
                'sheet-image',
                'card-title',
                'sheet-title',
            ],
            requiredRadiiKeys: ['card', 'sheet'],
            requiredFontKeys: ['card-title', 'sheet-title'],
        },
        initial: trace.initialBoxes,
        mounts: trace.mounts,
        commits: [
            cardOpen(openFrame, trace),
            cardClose(closeFrame, trace),
            ...(reverseFrame === null
                ? []
                : [cardReverse(reverseFrame, trace)]),
        ],
        settleFrames: trace.settleFrames,
        restorationChecks:
            reverseFrame === null
                ? []
                : [
                      {
                          key: 'sheet',
                          frame: reverseFrame,
                          label: 'sheet re-enters as lead: inert restored',
                          declarations: ['inert'],
                      },
                  ],
        authorStyleKeys: [
            'card',
            'sheet',
            'sheet-image',
            'sheet-title',
            'sheet-content',
        ],
        pairs: [
            ...cardPairs(openFrame, false, true, 20, 0),
            ...cardPairs(closeFrame, false, false, 0, 20),
            ...(reverseFrame === null
                ? []
                : [cardPairs(reverseFrame, true, true, 0, 0)]
            ).flat(),
        ],
        expectedDiagnostics: [],
        expectedOnSnap: [],
    }
}

export function segPlan(trace: SceneTrace): ScenePlan {
    const frames = [0, 5, 10, 15]
    const labels = ['tap-1', 'tap-2', 'tap-3', 'tap-4'] as const
    const statuses = [
        'interrupted',
        'interrupted',
        'interrupted',
        'ended',
    ] as const
    const segments: CommitPlan[] = labels.map((label, index) => {
        const actualFrame = trace.commits.find((entry) => entry.label === label)
        return {
            frame: actualFrame?.frame ?? frames[index]!,
            label,
            expectedStatus: statuses[index]!,
            segments: [
                {
                    key: 'pill',
                    kind: 'spring',
                    to: aBox(trace, `pill-${index === 3 ? 0 : index + 1}`),
                    motion: SEG_SPRING,
                },
            ],
        }
    })
    return {
        scene: 's-seg',
        stepMs: 16,
        completeness: {
            requiredObservations: 40,
            requiredCommits: 4,
            requiredReports: 4,
            requiredSettleFrames: 1,
            requiredKeys: ['pill'],
            requiredPairs: 0,
            requiredStaticRadii: ['pill'],
            requiredMetrics: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: ['shape.pill-radius', 'shape.teardown'],
            requiredOpacityKeys: [],
            requiredRadiiKeys: [],
            requiredFontKeys: [],
        },
        initial: trace.initialBoxes,
        mounts: trace.mounts,
        commits: segments,
        settleFrames: trace.settleFrames,
        restorationChecks: [],
        authorStyleKeys: ['pill'],
        pairs: [],
        staticRadii: { pill: 7 },
        expectedDiagnostics: [],
        expectedOnSnap: [],
    }
}

/* ───────────────────────── P5b interaction scenes ───────────────────────── */

export function stackPlan(trace: SceneTrace): ScenePlan {
    const expandFrame = commitFrame(trace, 'expand')
    const collapseFrame = commitFrame(trace, 'collapse')
    const spring = (key: string, suffix: 'fan' | 'stack'): SegmentPlan => ({
        key,
        kind: 'spring',
        to: aBox(trace, `${key}@${suffix}`),
        motion: STACK_SPRING,
    })
    return {
        scene: 's-stack',
        stepMs: 16,
        completeness: {
            requiredObservations: 80,
            requiredCommits: 2,
            requiredReports: 2,
            requiredSettleFrames: 2,
            requiredKeys: STACK_KEYS,
            requiredPairs: 0,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: [
                'shape.presence-opacity',
                'shape.badge-scale',
                'shape.teardown',
            ],
            requiredOpacityKeys: [
                'badge-1',
                'badge-2',
                'badge-3',
                'badge-4',
                'badge-5',
            ],
            requiredRadiiKeys: [],
            requiredFontKeys: [],
        },
        initial: trace.initialBoxes,
        mounts: trace.mounts,
        commits: [
            {
                frame: expandFrame,
                label: 'expand',
                expectedStatus: 'ended',
                segments: STACK_KEYS.map((key) => spring(key, 'fan')),
            },
            {
                frame: collapseFrame,
                label: 'collapse',
                expectedStatus: 'ended',
                segments: STACK_KEYS.map((key) => spring(key, 'stack')),
            },
        ],
        presenceScale: [
            ...[1, 2, 3, 4, 5].flatMap((i) => [
                {
                    key: `badge-${i}-disc`,
                    startFrame: expandFrame,
                    from: 0.8,
                    to: 1,
                    durationMs: 250,
                    easing: 'ease-out' as const,
                },
                {
                    key: `badge-${i}-disc`,
                    startFrame: collapseFrame,
                    from: 1,
                    to: 0.8,
                    durationMs: 150,
                    easing: 'ease-in' as const,
                },
            ]),
        ],
        presenceOpacity: [
            ...[1, 2, 3, 4, 5].flatMap((i) => [
                {
                    key: `badge-${i}`,
                    startFrame: expandFrame,
                    from: 0,
                    to: 1,
                    durationMs: 250,
                    easing: 'ease-out' as const,
                },
                {
                    key: `badge-${i}`,
                    startFrame: collapseFrame,
                    from: 1,
                    to: 0,
                    durationMs: 150,
                    easing: 'ease-in' as const,
                },
            ]),
        ],
        settleFrames: trace.settleFrames,
        restorationChecks: [],
        authorStyleKeys: STACK_KEYS.filter((key) => key.startsWith('badge-')),
        pairs: [],
        expectedDiagnostics: [],
        expectedOnSnap: [],
    }
}

const PHOTO_SPRING = {
    type: 'spring',
    duration: 0.45,
    bounce: 0,
} as const

const PHOTO_KEYS = [
    ...Array.from({ length: 300 }, (_, i) => `cell-${i}`),
    'cell-37-image',
    'detail-frame',
    'detail-image',
]

export function photoPlan(trace: SceneTrace): ScenePlan {
    const openFrame = commitFrame(trace, 'open')
    const backFrame = commitFrame(trace, 'back')
    const spring = (
        key: string,
        to: Box,
        handoffFrom: string
    ): SegmentPlan => ({
        key,
        kind: 'spring',
        to,
        handoffFrom,
        motion: PHOTO_SPRING,
    })
    return {
        scene: 's-photo',
        stepMs: 16,
        completeness: {
            requiredObservations: 70,
            requiredCommits: 2,
            requiredReports: 2,
            requiredSettleFrames: 2,
            requiredKeys: PHOTO_KEYS,
            requiredPairs: 0,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: ['shape.teardown'],
            requiredOpacityKeys: [],
            requiredRadiiKeys: [],
            requiredFontKeys: [],
        },
        initial: trace.initialBoxes,
        mounts: trace.mounts,
        commits: [
            {
                frame: openFrame,
                label: 'open',
                expectedStatus: 'ended',
                segments: [
                    spring(
                        'detail-frame',
                        aBox(trace, 'detail-frame'),
                        'cell-37'
                    ),
                    spring(
                        'detail-image',
                        aBox(trace, 'detail-image'),
                        'cell-37-image'
                    ),
                ],
            },
            {
                frame: backFrame,
                label: 'back',
                expectedStatus: 'ended',
                segments: [
                    spring(
                        'cell-37',
                        aBox(trace, 'cell-37@rest'),
                        'detail-frame'
                    ),
                    spring(
                        'cell-37-image',
                        aBox(trace, 'cell-37-image@rest'),
                        'detail-image'
                    ),
                ],
            },
        ],
        settleFrames: trace.settleFrames,
        restorationChecks: [],
        authorStyleKeys: [],
        pairs: [],
        expectedDiagnostics: [],
        expectedOnSnap: [],
    }
}

const ISLAND_SPRING = {
    type: 'spring',
    duration: 0.5,
    bounce: 0.1,
} as const
const ISLAND_KEYS = ['pill', 'card', 'pill-content', 'card-content'] as const

export function islandPlan(trace: SceneTrace): ScenePlan {
    const expandFrame = commitFrame(trace, 'expand')
    const reverseFrame = commitFrame(trace, 'reverse')
    const stepMs = 10
    // The content starts when the lead's perceptual timeline reaches 0.5;
    // the fade starts on the first frame at or after that instant.
    let cardFadeOffset = 1
    while (perceptualSpring(0.5, ((cardFadeOffset - 1) * stepMs) / 1000) < 0.5)
        cardFadeOffset += 1
    const cardFadeFrame = expandFrame + cardFadeOffset
    const cardAtReverse = bezierAt(
        EASE_OUT,
        Math.min(1, ((reverseFrame - cardFadeFrame) * stepMs) / 180)
    ).value
    const spring = (
        key: string,
        to: Box,
        handoffFrom: string
    ): SegmentPlan => ({
        key,
        kind: 'spring',
        to,
        handoffFrom,
        motion: ISLAND_SPRING,
    })
    const toCard = aBox(trace, 'card')
    const toPill = aBox(trace, 'pill')
    const pillContent = aBox(trace, 'pill-content')
    return {
        scene: 's-island',
        stepMs,
        completeness: {
            requiredObservations: 60,
            requiredCommits: 2,
            requiredReports: 2,
            requiredSettleFrames: 1,
            requiredKeys: [...ISLAND_KEYS],
            requiredPairs: 2,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: [
                'shape.opacity',
                'shape.coverage',
                'shape.radius',
                'shape.inert',
                'shape.focus',
                'shape.presence-opacity',
                'shape.teardown',
            ],
            requiredOpacityKeys: [
                'pill',
                'card',
                'pill-content',
                'card-content',
            ],
            requiredRadiiKeys: ['pill', 'card'],
            requiredFontKeys: [],
        },
        initial: trace.initialBoxes,
        mounts: trace.mounts,
        commits: [
            {
                frame: expandFrame,
                label: 'expand',
                expectedStatus: 'interrupted',
                segments: [
                    spring('card', toCard, 'pill'),
                    spring('pill', toCard, 'pill'),
                    { key: 'pill-content', kind: 'none', to: pillContent },
                ],
            },
            {
                frame: reverseFrame,
                label: 'reverse',
                expectedStatus: 'ended',
                segments: [
                    spring('pill', toPill, 'card'),
                    spring('card', toPill, 'card'),
                    {
                        key: 'card-content',
                        kind: 'spring',
                        to: toPill,
                        handoffFrom: 'card-content',
                        motion: { type: 'spring', duration: 0.28, bounce: 0 },
                    },
                ],
            },
        ],
        presenceOpacity: [
            {
                key: 'pill-content',
                startFrame: expandFrame,
                from: 1,
                to: 0,
                durationMs: 120,
                easing: 'ease-out',
            },
            {
                key: 'pill-content',
                startFrame: reverseFrame,
                from: 0,
                to: 1,
                durationMs: 120,
                easing: 'ease-out',
            },
            {
                key: 'card-content',
                startFrame: expandFrame,
                from: 0,
                to: 0,
                durationMs: 1,
                easing: 'linear',
            },
            {
                key: 'card-content',
                startFrame: cardFadeFrame,
                from: 0,
                to: 1,
                durationMs: 180,
                easing: 'ease-out',
            },
            {
                key: 'card-content',
                startFrame: reverseFrame,
                from: cardAtReverse,
                to: 0,
                durationMs: 120,
                easing: 'ease-out',
            },
        ],
        settleFrames: trace.settleFrames,
        restorationChecks: [],
        removedWith: { 'card-content': 'card' },
        requiredRestorations: ['card-content'],
        authorStyleKeys: ['pill', 'card', 'pill-content', 'card-content'],
        pairs: [
            {
                id: 'island',
                startFrame: expandFrame,
                lead: 'card',
                follower: 'pill',
                radiusFrom: 18.5,
                radiusTo: 40,
            },
            {
                id: 'island',
                startFrame: reverseFrame,
                lead: 'pill',
                follower: 'card',
                radiusFrom: 18.5,
                radiusTo: 18.5,
                reversal: true,
            },
        ],
        expectedDiagnostics: [],
        expectedOnSnap: [],
    }
}

const ACC_SPRING = {
    type: 'spring',
    duration: 0.5,
    bounce: 0.06,
} as const
const ACC_ROWS = 11
const ACC_KEYS = [
    ...Array.from({ length: ACC_ROWS }, (_, i) => `row-${i}`),
    ...Array.from({ length: ACC_ROWS }, (_, i) => `header-${i}`),
    ...Array.from({ length: ACC_ROWS }, (_, i) => `body-${i}`),
    ...Array.from({ length: ACC_ROWS - 1 }, (_, i) => `sep-${i}`),
]

function accSegments(
    phase: 'c1' | 'c2' | 'c3',
    keys: readonly string[]
): SegmentPlan[] {
    return keys.map((key) => ({
        key,
        kind: 'spring',
        to: aBoxByKeyCache[key]?.[phase] ?? (undefined as unknown as Box),
        motion: ACC_SPRING,
    }))
}

// Filled per trace by accPlan; the phase suffix maps to the probe box.
const aBoxByKeyCache: Record<
    string,
    Partial<Record<'c1' | 'c2' | 'c3', Box>>
> = {}

export function accPlan(trace: SceneTrace): ScenePlan {
    for (const key of ACC_KEYS) {
        for (const phase of ['c1', 'c2', 'c3'] as const) {
            const box = trace.aBoxes[`${key}@${phase}`]
            if (box) {
                aBoxByKeyCache[key] ??= {}
                aBoxByKeyCache[key]![phase] = box
            }
        }
    }
    const c1Frame = commitFrame(trace, 'c1')
    const c2Frame = commitFrame(trace, 'c2')
    const c3Frame = commitFrame(trace, 'c3')
    const rows = (from: number, to: number): string[] =>
        Array.from({ length: to - from + 1 }, (_, i) => `row-${from + i}`)
    const headers = (from: number, to: number): string[] =>
        Array.from({ length: to - from + 1 }, (_, i) => `header-${from + i}`)
    const bodies = (from: number, to: number): string[] =>
        Array.from({ length: to - from + 1 }, (_, i) => `body-${from + i}`)
    const seps = (from: number, to: number): string[] =>
        Array.from({ length: to - from + 1 }, (_, i) => `sep-${from + i}`)
    const c1Keys = [
        'row-2',
        ...rows(3, 10),
        ...headers(3, 10),
        ...bodies(3, 10),
        ...seps(2, 9),
    ]
    const c2Keys = [
        'row-6',
        ...rows(7, 10),
        ...headers(7, 10),
        ...bodies(7, 10),
        ...seps(6, 9),
    ]
    const c3Keys = [
        'row-2',
        ...rows(3, 10),
        ...headers(3, 10),
        ...bodies(3, 10),
        ...seps(2, 9),
    ]
    return {
        scene: 's-acc',
        stepMs: 16,
        completeness: {
            requiredObservations: 60,
            requiredCommits: 3,
            requiredReports: 3,
            requiredSettleFrames: 1,
            requiredKeys: ACC_KEYS,
            requiredPairs: 0,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: ['shape.teardown'],
            requiredOpacityKeys: [],
            requiredRadiiKeys: [],
            requiredFontKeys: [],
        },
        initial: trace.initialBoxes,
        mounts: trace.mounts,
        commits: [
            {
                frame: c1Frame,
                label: 'c1',
                expectedStatus: 'interrupted',
                segments: accSegments('c1', c1Keys),
            },
            {
                frame: c2Frame,
                label: 'c2',
                expectedStatus: 'interrupted',
                segments: accSegments('c2', c2Keys),
            },
            {
                frame: c3Frame,
                label: 'c3',
                expectedStatus: 'ended',
                segments: accSegments('c3', c3Keys),
            },
        ],
        settleFrames: trace.settleFrames,
        restorationChecks: [],
        authorStyleKeys: [],
        pairs: [],
        expectedDiagnostics: [],
        expectedOnSnap: [],
    }
}

const INSERT_SPRING = {
    type: 'spring',
    duration: 0.5,
    bounce: 0.05,
} as const
const INSERT_KEYS = [
    ...Array.from({ length: 3 }, (_, i) => `new-${i}`),
    ...Array.from({ length: 13 }, (_, i) => `row-${9 + i}`),
]

export function insertPlan(trace: SceneTrace): ScenePlan {
    const insertFrame = commitFrame(trace, 'insert')
    const existing = INSERT_KEYS.filter((key) => key.startsWith('row-'))
    return {
        scene: 's-insert',
        stepMs: 16,
        completeness: {
            requiredObservations: 40,
            requiredCommits: 1,
            requiredReports: 1,
            requiredSettleFrames: 1,
            requiredKeys: INSERT_KEYS,
            requiredPairs: 0,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: ['shape.presence-opacity', 'shape.teardown'],
            requiredOpacityKeys: ['new-0', 'new-1', 'new-2'],
            requiredRadiiKeys: [],
            requiredFontKeys: [],
        },
        initial: trace.initialBoxes,
        mounts: trace.mounts,
        commits: [
            {
                frame: insertFrame,
                label: 'insert',
                expectedStatus: 'ended',
                segments: [
                    ...existing.map((key) => ({
                        key,
                        kind: 'spring' as const,
                        to: aBox(trace, `${key}@after`),
                        motion: INSERT_SPRING,
                    })),
                    ...Array.from({ length: 3 }, (_, i) => ({
                        key: `new-${i}`,
                        kind: 'timing' as const,
                        to: aBox(trace, `new-${i}@after`),
                        motion: {
                            type: 'timing' as const,
                            duration: 0.3,
                            easing: 'ease-out' as const,
                        },
                        startMoving: true,
                    })),
                ],
            },
        ],
        presenceOpacity: Array.from({ length: 3 }, (_, i) => ({
            key: `new-${i}`,
            startFrame: insertFrame,
            from: 0,
            to: 1,
            durationMs: 300,
            easing: 'ease-out' as const,
        })),
        settleFrames: trace.settleFrames,
        restorationChecks: [],
        authorStyleKeys: ['new-0', 'new-1', 'new-2'],
        pairs: [],
        expectedDiagnostics: [],
    }
}

/* ───────────────────────── P5c drive scenes ───────────────────────── */

const REORDER_SPRING = {
    type: 'spring',
    duration: 0.45,
    bounce: 0.1,
} as const
const SHEET_SPRING = {
    type: 'spring',
    duration: 0.45,
    bounce: 0.08,
} as const
const BULK_SPRING = {
    type: 'spring',
    duration: 0.4,
    bounce: 0.1,
} as const

const REORDER_KEYS = Array.from({ length: 7 }, (_, i) => [
    `row-${i}`,
    `title-${i}`,
]).flat()

function reorderSlot(trace: SceneTrace, key: string, slot: number): Box {
    return aBox(trace, `${key}@slot-${slot}`)
}

export function reorderPlan(trace: SceneTrace): ScenePlan {
    const reorder2 = commitFrame(trace, 'reorder-2')
    const reorder5 = commitFrame(trace, 'reorder-5')
    const reorder9 = commitFrame(trace, 'reorder-9')
    const release = flushFrame(trace, 'release')
    const takeFrame = 0
    const spring = (
        key: string,
        slot: number,
        moving = false
    ): SegmentPlan => ({
        key,
        kind: 'spring',
        to: reorderSlot(trace, key, slot),
        motion: REORDER_SPRING,
        ...(moving
            ? {
                  holdRelease: true,
                  velocityOverride: { x: 0, y: 900, w: 0, h: 0 },
              }
            : {}),
    })
    const reorderCommit = (
        label: string,
        frame: number,
        row: string,
        title: string,
        slot: number
    ): CommitPlan => ({
        frame,
        label,
        expectedStatus: 'ended',
        // Clarification 2026-10-29: a per-sibling reorder does not replace a
        // running sibling track; the runs resolve `ended` at frames 28/31/35.
        // A future script that retargets a running sibling must expect
        // `interrupted` (A-13) and add that row.
        segments: [spring(row, slot), spring(title, slot)],
    })
    return {
        scene: 's-reorder',
        stepMs: 20,
        completeness: {
            requiredObservations: 20,
            requiredCommits: 3,
            requiredReports: 3,
            requiredSettleFrames: 1,
            requiredKeys: REORDER_KEYS,
            requiredPairs: 0,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: [
                'shape.hold',
                'shape.kill-switch',
                'shape.pill-radius',
                'shape.teardown',
            ],
            requiredOpacityKeys: [],
            requiredRadiiKeys: REORDER_KEYS.filter((key) =>
                key.startsWith('row-')
            ),
            requiredFontKeys: [],
        },
        initial: trace.initialBoxes,
        mounts: trace.mounts,
        commits: [
            reorderCommit('reorder-2', reorder2, 'row-2', 'title-2', 1),
            reorderCommit('reorder-5', reorder5, 'row-3', 'title-3', 2),
            reorderCommit('reorder-9', reorder9, 'row-4', 'title-4', 3),
            {
                frame: release,
                label: 'release',
                kind: 'release',
                expectedStatus: 'no-change',
                // §5.10: the release velocity enters once on the held node;
                // the nested title is a rider and receives none. It is drawn
                // at the row's release track + (66, 10).
                segments: [spring('row-1', 4, true)],
            },
        ],
        settleFrames: trace.settleFrames,
        restorationChecks: [],
        authorStyleKeys: [
            ...REORDER_KEYS.filter((key) => key.startsWith('row-')),
        ],
        pairs: [],
        holds: [
            {
                key: 'row-1',
                riders: [{ key: 'title-1', dx: 66, dy: 10 }],
                takeFrame,
                points: Array.from({ length: 10 }, (_, i) => ({
                    frame: takeFrame + i + 1,
                    x: 16,
                    y: 250 + 18 * (i + 1),
                })),
                releaseFrame: release,
                releaseVelocity: { x: 0, y: 900 },
            },
        ],
        staticRadii: Object.fromEntries(
            REORDER_KEYS.filter((key) => key.startsWith('row-')).map(
                (key) => [key, 10] as const
            )
        ),
        expectedDiagnostics: [],
        expectedOnSnap: [],
        expectedKillSwitch: true,
        g3NotApplicable:
            'release G3: a release from direct manipulation has no analytic layout track before the supplied gesture velocity (A-11); G3 is not applicable. G2/G4, origin and the observed finite difference decide.',
    }
}

export function sheetPlan(trace: SceneTrace): ScenePlan {
    const release1 = flushFrame(trace, 'release-1')
    const release2 = flushFrame(trace, 'release-2')
    const take2 = trace.holds?.[1]?.takeFrame ?? release2 - 10
    const spring = (
        to: Box,
        velocity: { x: number; y: number }
    ): SegmentPlan => ({
        key: 'sheet',
        kind: 'spring',
        to,
        motion: SHEET_SPRING,
        holdRelease: true,
        velocityOverride: { x: velocity.x, y: velocity.y, w: 0, h: 0 },
    })
    return {
        scene: 's-sheet',
        stepMs: 16,
        completeness: {
            requiredObservations: 20,
            requiredCommits: 2,
            requiredReports: 2,
            requiredSettleFrames: 1,
            requiredKeys: ['sheet'],
            requiredPairs: 0,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: [
                'shape.hold',
                'shape.pill-radius',
                'shape.teardown',
            ],
            requiredOpacityKeys: [],
            requiredRadiiKeys: ['sheet'],
            requiredFontKeys: [],
        },
        initial: trace.initialBoxes,
        mounts: trace.mounts,
        commits: [
            {
                frame: release1,
                label: 'detent-1',
                expectedStatus: 'no-change',
                segments: [],
            },
            {
                frame: release1,
                label: 'release-1',
                kind: 'release',
                expectedStatus: 'no-change',
                segments: [
                    spring(aBox(trace, 'sheet@large'), { x: 0, y: -1200 }),
                ],
            },
            {
                frame: release2,
                label: 'detent-2',
                expectedStatus: 'no-change',
                segments: [],
            },
            {
                frame: release2,
                label: 'release-2',
                kind: 'release',
                expectedStatus: 'no-change',
                segments: [
                    spring(aBox(trace, 'sheet@dismissed'), { x: 0, y: 1600 }),
                ],
            },
        ],
        settleFrames: trace.settleFrames,
        restorationChecks: [],
        authorStyleKeys: ['sheet'],
        pairs: [],
        holds: [
            {
                key: 'sheet',
                riders: [],
                takeFrame: 0,
                points: Array.from({ length: 12 }, (_, i) => ({
                    frame: i + 1,
                    x: 0,
                    y: 422 - 15 * (i + 1),
                })),
                releaseFrame: release1,
                releaseVelocity: { x: 0, y: -1200 },
            },
            {
                key: 'sheet',
                riders: [],
                takeFrame: take2,
                takeBox: aBox(trace, 'sheet@large'),
                points: Array.from({ length: 10 }, (_, i) => ({
                    frame: take2 + i + 1,
                    x: 0,
                    y: 124 + 30 * (i + 1),
                })),
                releaseFrame: release2,
                releaseVelocity: { x: 0, y: 1600 },
            },
        ],
        staticRadii: { sheet: [10, 10, 0, 0] },
        expectedDiagnostics: [],
        expectedOnSnap: [],
        requiredRestorations: ['sheet'],
        allowEmptyFinal: true,
        g3NotApplicable:
            'release G3: a release from direct manipulation has no analytic layout track before the supplied gesture velocity (A-11); G3 is not applicable. G2/G4, origin and the observed finite difference decide.',
    }
}

const BULK_TILES = 850
const BULK_LABELS = 150
const BULK_KEYS = [
    ...Array.from({ length: BULK_TILES }, (_, i) => `tile-${i}`),
    ...Array.from({ length: BULK_LABELS }, (_, i) => `label-${i}`),
]

export function bulkPlan(trace: SceneTrace): ScenePlan {
    const shuffle = commitFrame(trace, 'shuffle')
    const mover = (key: string, to: Box): SegmentPlan => ({
        key,
        kind: 'spring',
        to,
        motion: BULK_SPRING,
    })
    return {
        scene: 's-bulk',
        stepMs: 16,
        completeness: {
            requiredObservations: 30,
            requiredCommits: 1,
            requiredReports: 1,
            requiredSettleFrames: 1,
            requiredKeys: BULK_KEYS,
            requiredPairs: 0,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: ['shape.teardown'],
            requiredOpacityKeys: [],
            requiredRadiiKeys: [],
            requiredFontKeys: [],
        },
        initial: trace.initialBoxes,
        mounts: trace.mounts,
        commits: [
            {
                frame: shuffle,
                label: 'shuffle',
                expectedStatus: 'ended',
                segments: [
                    ...Array.from({ length: BULK_LABELS }, (_, i) =>
                        mover(`tile-${i}`, aBox(trace, `tile-${i}@shuffle`))
                    ),
                    ...Array.from({ length: BULK_LABELS }, (_, i) =>
                        mover(`label-${i}`, aBox(trace, `label-${i}@shuffle`))
                    ),
                ],
            },
        ],
        settleFrames: trace.settleFrames,
        restorationChecks: [],
        authorStyleKeys: Array.from(
            { length: BULK_LABELS },
            (_, i) => `tile-${i}`
        ),
        pairs: [],
        expectedDiagnostics: [],
        expectedOnSnap: [],
    }
}

const DELETE_SPRING = {
    type: 'spring',
    duration: 0.45,
    bounce: 0.08,
} as const
const DELETE_LINEAR = {
    type: 'timing',
    duration: 0.25,
    easing: 'linear',
} as const
const DELETE_KEYS = Array.from({ length: 9 }, (_, i) => `row-${i}`)

export function deletePlan(trace: SceneTrace): ScenePlan {
    const c1Frame = commitFrame(trace, 'delete-1')
    const c2Frame = commitFrame(trace, 'delete-2')
    const exit = (key: string): SegmentPlan => ({
        key,
        kind: 'timing',
        to: aBox(trace, `${key}@init`),
        motion: DELETE_LINEAR,
        startMoving: true,
        presenceExit: true,
        toFromB: { dx: -390, dy: 0 },
        velocityOverride: null,
    })
    const spring = (key: string, phase: 'c1' | 'c2'): SegmentPlan => ({
        key,
        kind: 'spring',
        to: aBox(trace, `${key}@${phase}`),
        motion: DELETE_SPRING,
    })
    return {
        scene: 's-delete',
        stepMs: 10,
        completeness: {
            requiredObservations: 40,
            requiredCommits: 2,
            requiredReports: 2,
            requiredSettleFrames: 1,
            requiredKeys: DELETE_KEYS,
            requiredPairs: 0,
            requiredStaticRadii: [],
            requiredMetrics: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G13'],
            requiredShape: ['shape.presence-opacity', 'shape.teardown'],
            requiredOpacityKeys: ['row-2', 'row-5'],
            requiredRadiiKeys: [],
            requiredFontKeys: [],
        },
        initial: trace.initialBoxes,
        mounts: trace.mounts,
        commits: [
            {
                frame: c1Frame,
                label: 'delete-1',
                expectedStatus: 'interrupted',
                segments: [
                    exit('row-2'),
                    ...[3, 4, 5, 6, 7, 8].map((i) => spring(`row-${i}`, 'c1')),
                ],
            },
            {
                frame: c2Frame,
                label: 'delete-2',
                expectedStatus: 'ended',
                segments: [
                    exit('row-5'),
                    ...[6, 7, 8].map((i) => spring(`row-${i}`, 'c2')),
                ],
            },
        ],
        authoredTranslate: [
            {
                key: 'row-2',
                startFrame: 0,
                endFrame: 8,
                from: { x: 0, y: 0 },
                to: { x: -80, y: 0 },
            },
        ],
        presenceOpacity: [
            {
                key: 'row-2',
                startFrame: c1Frame,
                from: 1,
                to: 0,
                durationMs: 200,
                easing: 'linear',
            },
            {
                key: 'row-5',
                startFrame: c2Frame,
                from: 1,
                to: 0,
                durationMs: 200,
                easing: 'linear',
            },
        ],
        settleFrames: trace.settleFrames,
        restorationChecks: [],
        authorStyleKeys: ['row-2', 'row-5'],
        pairs: [],
        expectedDiagnostics: [],
        expectedOnSnap: [],
    }
}
