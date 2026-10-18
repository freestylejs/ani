/**
 * Pure statistics helpers for the browser benchmark. No DOM, no I/O:
 * everything here is deterministic given the samples.
 */

export interface FrameSample {
    /** rAF callback durations (ms), one per executed frame. */
    ticks: readonly number[]
    /** rAF timestamps (ms), one per executed frame. */
    frames: readonly number[]
}

/** CDP `Performance` counters accumulated over the measured window. */
export interface PerfDelta {
    layoutCount: number
    recalcStyleCount: number
    layoutDuration: number
    recalcStyleDuration: number
    scriptDuration: number
}

export interface RunMetrics {
    tickP50: number
    tickP95: number
    tickMax: number
    intervalP50: number
    intervalP95: number
    longFramesPerSecond: number
    layoutsPerFrame: number
    styleRecalcsPerFrame: number
    scriptMsPerFrame: number
    layoutMsPerFrame: number
    styleMsPerFrame: number
    setupMs: number
}

/** A frame interval above this (ms) counts as a long frame. */
export const LONG_FRAME_MS = 25

function sortAscending(values: readonly number[]): number[] {
    return [...values].sort((a, b) => a - b)
}

/**
 * Nearest-rank percentile (`fraction` in `[0, 1]`), `NaN` for an empty sample.
 */
export function percentile(
    values: readonly number[],
    fraction: number
): number {
    if (values.length === 0) return Number.NaN
    const sorted = sortAscending(values)
    const rank = Math.ceil(fraction * sorted.length) - 1
    const index = Math.min(Math.max(rank, 0), sorted.length - 1)
    return sorted[index]!
}

/** Median of the values (nearest-rank), `NaN` for an empty sample. */
export function median(values: readonly number[]): number {
    return percentile(values, 0.5)
}

/** Consecutive differences between frame timestamps (ms). */
export function frameIntervals(frames: readonly number[]): number[] {
    const intervals: number[] = []
    for (let i = 1; i < frames.length; i++) {
        intervals.push(frames[i]! - frames[i - 1]!)
    }
    return intervals
}

function perFrame(total: number, frames: number): number {
    return frames === 0 ? Number.NaN : total / frames
}

function longFramesPerSecond(
    intervals: readonly number[],
    seconds: number
): number {
    if (intervals.length === 0 || !(seconds > 0)) return 0
    let long = 0
    for (const interval of intervals) {
        if (interval > LONG_FRAME_MS) long++
    }
    return long / seconds
}

/** Everything one measured window (one page run) contributes. */
export function computeMetrics(
    sample: FrameSample,
    perf: PerfDelta,
    setupMs: number,
    measureSeconds: number
): RunMetrics {
    const frames = sample.frames.length
    const intervals = frameIntervals(sample.frames)
    return {
        tickP50: percentile(sample.ticks, 0.5),
        tickP95: percentile(sample.ticks, 0.95),
        tickMax:
            sample.ticks.length === 0 ? Number.NaN : Math.max(...sample.ticks),
        intervalP50: percentile(intervals, 0.5),
        intervalP95: percentile(intervals, 0.95),
        longFramesPerSecond: longFramesPerSecond(intervals, measureSeconds),
        layoutsPerFrame: perFrame(perf.layoutCount, frames),
        styleRecalcsPerFrame: perFrame(perf.recalcStyleCount, frames),
        scriptMsPerFrame: perFrame(perf.scriptDuration * 1000, frames),
        layoutMsPerFrame: perFrame(perf.layoutDuration * 1000, frames),
        styleMsPerFrame: perFrame(perf.recalcStyleDuration * 1000, frames),
        setupMs,
    }
}

function medianOf(values: readonly number[]): number {
    const finite = values.filter((value) => Number.isFinite(value))
    return finite.length === 0 ? Number.NaN : median(finite)
}

/** Element-wise median across repeated runs of one scenario × N pair. */
export function medianMetrics(runs: readonly RunMetrics[]): RunMetrics {
    const pick = (key: keyof RunMetrics): number =>
        medianOf(runs.map((run) => run[key]))
    return {
        tickP50: pick('tickP50'),
        tickP95: pick('tickP95'),
        tickMax: pick('tickMax'),
        intervalP50: pick('intervalP50'),
        intervalP95: pick('intervalP95'),
        longFramesPerSecond: pick('longFramesPerSecond'),
        layoutsPerFrame: pick('layoutsPerFrame'),
        styleRecalcsPerFrame: pick('styleRecalcsPerFrame'),
        scriptMsPerFrame: pick('scriptMsPerFrame'),
        layoutMsPerFrame: pick('layoutMsPerFrame'),
        styleMsPerFrame: pick('styleMsPerFrame'),
        setupMs: pick('setupMs'),
    }
}
