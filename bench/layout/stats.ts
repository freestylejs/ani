/**
 * Statistics for the P5 layout bench: nearest-rank percentiles, medians and
 * the §11.5 timer-granularity sampling rule.
 */

/** A value at the nearest rank of `p` in `values` (1-based rank ceil(p·n)). */
export function percentile(values: readonly number[], p: number): number {
    if (values.length === 0) throw new Error('percentile of no values')
    if (!(p > 0 && p <= 1)) throw new Error(`bad percentile ${p}`)
    const sorted = [...values].sort((a, b) => a - b)
    const rank = Math.max(
        1,
        Math.min(sorted.length, Math.ceil(p * sorted.length))
    )
    return sorted[rank - 1]!
}

/** The arithmetic median (the mean of the two middle values for an even count). */
export function median(values: readonly number[]): number {
    if (values.length === 0) throw new Error('median of no values')
    const sorted = [...values].sort((a, b) => a - b)
    const half = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
        ? (sorted[half - 1]! + sorted[half]!) / 2
        : sorted[half]!
}

export interface Summary {
    readonly n: number
    readonly min: number
    readonly median: number
    readonly p50: number
    readonly p95: number
    readonly p99: number
    readonly max: number
}

export function summarize(values: readonly number[]): Summary {
    if (values.length === 0) throw new Error('summary of no values')
    return {
        n: values.length,
        min: Math.min(...values),
        median: median(values),
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        p99: percentile(values, 0.99),
        max: Math.max(...values),
    }
}

/**
 * The clock granularity `g`: the smallest non-zero difference over consecutive
 * `performance.now()` reads (§11.5).
 */
export function granularity(readings: readonly number[]): number {
    let smallest = Number.POSITIVE_INFINITY
    for (let i = 1; i < readings.length; i++) {
        const delta = readings[i]! - readings[i - 1]!
        if (delta > 0 && delta < smallest) smallest = delta
    }
    return Number.isFinite(smallest) ? smallest : 0
}

/**
 * §11.5 sampling: one sample per frame when `g <= 0.05 ms`, otherwise the mean
 * of 20 consecutive frames timed as one interval.
 */
export function sampleFrames(
    frameCosts: readonly number[],
    g: number
): number[] {
    if (g <= 0.05) return [...frameCosts]
    const samples: number[] = []
    for (let i = 0; i < frameCosts.length; i += 20) {
        const chunk = frameCosts.slice(i, i + 20)
        samples.push(
            chunk.reduce((sum, value) => sum + value, 0) / chunk.length
        )
    }
    return samples
}

/** The median of a set of per-run statistics (§11.5 aggregation). */
export function aggregateMedian(perRun: readonly number[]): number {
    return median(perRun)
}

/** The median of a set of per-run ratios (§11.5 commit gate). */
export function aggregateRatio(
    enginePerRun: readonly number[],
    floorPerRun: readonly number[]
): number {
    if (enginePerRun.length !== floorPerRun.length) {
        throw new Error('engine and floor run counts differ')
    }
    return median(enginePerRun.map((engine, i) => engine / floorPerRun[i]!))
}

export function formatMs(value: number): string {
    return Number.isFinite(value) ? `${value.toFixed(3)} ms` : 'n/a'
}
