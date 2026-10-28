/**
 * Node-side scene plans: the scripted geometry and motion as data. The oracle
 * derives every trajectory from this plan and the page's engine-free layout
 * probe; it never reads an engine pose to compute an expectation.
 */
import type { Box } from './oracle.ts'
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
    const reverseFrame = commitFrame(trace, 'reverse')
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
            cardReverse(reverseFrame, trace),
        ],
        settleFrames: trace.settleFrames,
        restorationChecks: [
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
            ...cardPairs(reverseFrame, true, true, 0, 0),
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
