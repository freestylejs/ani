/**
 * Cost gates of §11.5 and their negative-control seams. Every value is copied
 * from the authority; nothing here may be tuned by a scene.
 */
import { frameSamples, median, percentile } from './stats.ts'
import type { FrameCost } from './types.ts'

export interface GateResult {
    readonly id: string
    readonly label: string
    readonly gate: string
    readonly unit: string
    readonly value: number
    readonly pass: boolean
    readonly perRun?: readonly number[]
    readonly worst?:
        | {
              readonly run?: number | undefined
              readonly detail?: string | undefined
          }
        | undefined
    readonly detail?: string | undefined
}

export function commitRatioGate(
    engineMedians: readonly number[],
    floorMedians: readonly number[]
): GateResult {
    if (engineMedians.length !== floorMedians.length) {
        throw new Error('engine and floor run counts differ')
    }
    const ratios = engineMedians.map((engine, i) => engine / floorMedians[i]!)
    const value = median(ratios)
    return {
        id: 'G9',
        label: 'Commit (capture + flush) over the required-work floor',
        gate: 'median of 5 per-run ratios <= 2',
        unit: 'ratio',
        value,
        pass: value <= 2,
        perRun: ratios,
        worst: {
            run: ratios.indexOf(Math.max(...ratios)),
        },
    }
}

export function floorAuditGate(audit: FloorAudit): GateResult {
    return {
        id: 'G9.floor',
        label: 'Required-work floor audit (reads and writes against §4.1/§4.3)',
        gate: 'exact required counts; no extra read',
        unit: 'count mismatches',
        value: audit.mismatches.length,
        pass: audit.pass,
        worst: { detail: audit.mismatches.join('; ') || undefined },
        detail: audit.summary,
    }
}

export interface FloorAuditInput {
    readonly participants: number
    readonly poses: number
    readonly typedOM: boolean
    readonly captureRects: number
    readonly captureOffsets: number
    readonly flushRects: number
    readonly flushOffsets: number
    readonly styleReads: number
    readonly poseWrites: number
    readonly extraReads: number
}

export interface FloorAudit {
    readonly expected: {
        readonly captureRects: number
        readonly captureOffsets: number
        readonly flushRects: number
        readonly flushOffsets: number
        readonly styleReads: number
        readonly poseWrites: number
    }
    readonly actual: FloorAuditInput
    readonly mismatches: readonly string[]
    readonly pass: boolean
    readonly summary: string
}

/**
 * §4.1 item 1 reads one rect and one offsetWidth/offsetHeight pair per
 * participant in the capture; §4.3 step 2 reads the same in the flush; step 4
 * writes one t = 0 pose per engine node. A pose is one `translate` and one
 * `scale` declaration.
 */
export function auditFloor(input: FloorAuditInput): FloorAudit {
    const expected = {
        captureRects: input.participants,
        captureOffsets: input.participants,
        flushRects: input.participants,
        flushOffsets: input.participants,
        // §4.3 step 2 computed values for the active nodes; WebKit also reads
        // the Typed OM transform-origin where it snaps the reference box.
        styleReads: input.poses * (input.typedOM ? 2 : 1),
        poseWrites: input.poses,
    }
    const mismatches: string[] = []
    const compare = (name: string, actual: number, want: number) => {
        if (actual !== want) mismatches.push(`${name} ${actual} != ${want}`)
    }
    compare('capture rects', input.captureRects, expected.captureRects)
    compare(
        'capture offset pairs',
        input.captureOffsets,
        expected.captureOffsets
    )
    compare('flush rects', input.flushRects, expected.flushRects)
    compare('flush offset pairs', input.flushOffsets, expected.flushOffsets)
    compare('computed-style reads', input.styleReads, expected.styleReads)
    compare('pose writes', input.poseWrites, expected.poseWrites)
    if (input.extraReads !== 0) {
        mismatches.push(`extra reads ${input.extraReads}`)
    }
    return {
        expected,
        actual: input,
        mismatches,
        pass: mismatches.length === 0,
        summary: `${input.participants} participants, ${input.poses} active poses; capture ${input.captureRects}/${input.captureOffsets}, flush ${input.flushRects}/${input.flushOffsets}, computed ${input.styleReads}, writes ${input.poseWrites}, extra ${input.extraReads}`,
    }
}

export function realClockGate(
    costs: readonly FrameCost[],
    g: number,
    gateMs = 2,
    longFrameMs = 8
): GateResult {
    if (costs.length === 0) {
        return {
            id: 'G8',
            label: 'Real-clock frame script cost',
            gate: `p95 <= ${gateMs} ms; no long frame (> ${longFrameMs} ms) after the commit frame`,
            unit: 'ms',
            value: Number.POSITIVE_INFINITY,
            pass: false,
            detail: 'no frame samples',
        }
    }
    const sampleSet = frameSamples(
        costs.map((cost) => cost.ms),
        g
    )
    const samples = sampleSet.samples
    const p95 = percentile(samples, 0.95)
    const longFrames = costs.filter(
        (cost) => !cost.commit && cost.ms > longFrameMs
    )
    return {
        id: 'G8',
        label: 'Real-clock frame script cost',
        gate: `p95 <= ${gateMs} ms; no long frame (> ${longFrameMs} ms) after the commit frame`,
        unit: 'ms',
        value: p95,
        pass: p95 <= gateMs && longFrames.length === 0,
        worst: {
            detail: `${sampleSet.detail}; ${samples.length} samples, ${costs.length} frames${
                longFrames.length === 0
                    ? ''
                    : `; ${longFrames.length} long frames after a commit; worst ${Math.max(...longFrames.map((cost) => cost.ms)).toFixed(3)} ms`
            }`,
        },
    }
}

export function steadyFrameGate(
    costs: readonly number[],
    g: number,
    label = 'Steady frame at 300 nested movers'
): GateResult {
    if (costs.length === 0) {
        return {
            id: 'G10',
            label,
            gate: 'p95 <= 2 ms',
            unit: 'ms',
            value: Number.POSITIVE_INFINITY,
            pass: false,
            detail: 'no frame samples',
        }
    }
    const sampleSet = frameSamples(costs, g)
    const samples = sampleSet.samples
    const p95 = percentile(samples, 0.95)
    return {
        id: 'G10',
        label,
        gate: 'p95 <= 2 ms',
        unit: 'ms',
        value: p95,
        pass: p95 <= 2,
        detail: `${sampleSet.detail}; ${samples.length} samples`,
    }
}

export function sustainedGate(
    costs: readonly number[],
    g: number,
    gateMs = 2
): GateResult {
    if (costs.length === 0) {
        return {
            id: 'G11',
            label: 'Sustained 60 Hz commits with 300 moving participants',
            gate: `p95 of every frame sample in the 5 s window <= ${gateMs} ms`,
            unit: 'ms',
            value: Number.POSITIVE_INFINITY,
            pass: false,
            detail: 'no frame samples',
        }
    }
    const sampleSet = frameSamples(costs, g)
    const samples = sampleSet.samples
    const p95 = percentile(samples, 0.95)
    return {
        id: 'G11',
        label: 'Sustained 60 Hz commits with 300 moving participants',
        gate: `p95 of every frame sample in the 5 s window <= ${gateMs} ms`,
        unit: 'ms',
        value: p95,
        pass: p95 <= gateMs,
        detail: `${sampleSet.detail}; ${samples.length} samples`,
    }
}

export function heldGate(
    costs: readonly number[],
    held: number,
    g: number
): GateResult {
    if (held <= 0) throw new Error('held count must be positive')
    if (costs.length === 0) {
        return {
            id: 'G12',
            label: `Held frame at ${held} held element${held === 1 ? '' : 's'}`,
            gate: 'p95 / held <= 0.1 ms',
            unit: 'ms/held',
            value: Number.POSITIVE_INFINITY,
            pass: false,
            detail: 'no frame samples',
        }
    }
    const sampleSet = frameSamples(costs, g)
    const samples = sampleSet.samples
    const perHeld = percentile(samples, 0.95) / held
    return {
        id: 'G12',
        label: `Held frame at ${held} held element${held === 1 ? '' : 's'}`,
        gate: 'p95 / held <= 0.1 ms',
        unit: 'ms/held',
        value: perHeld,
        pass: perHeld <= 0.1,
        detail: `${sampleSet.detail}; ${samples.length} samples`,
    }
}
