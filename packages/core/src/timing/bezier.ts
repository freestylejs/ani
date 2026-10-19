import {
    type Coord,
    TimingFunction,
    type TimingFunctionContext,
} from './function'

export interface BezierTimingFunctionOpt {
    p2: Coord
    p3: Coord
}

// Solver constants
const NEWTON_ITERATIONS = 8
const NEWTON_MIN_SLOPE = 0.001
/** Newton stops once a step is smaller than this (in t). */
const T_PRECISION = 1e-14
const BISECTION_MAX_ITERATIONS = 60

const SAMPLE_TABLE_SIZE = 11
const SAMPLE_STEP_SIZE = 1.0 / (SAMPLE_TABLE_SIZE - 1.0)

export class BezierTimingFunction extends TimingFunction {
    private sampleValues: Float64Array | null = null
    // coefficients of c(t) = ((a * t + b) * t + c) * t, per axis
    private readonly ax: number
    private readonly bx: number
    private readonly cx: number
    private readonly ay: number
    private readonly by: number
    private readonly cy: number

    public constructor(public readonly opt: { p2: Coord; p3: Coord }) {
        super()
        // x coordinates must stay within [0, 1] (CSS cubic-bezier contract),
        // otherwise x(t) is non-monotonic and the inverse lookup is invalid.
        if (
            !(this.opt.p2.x >= 0 && this.opt.p2.x <= 1) ||
            !(this.opt.p3.x >= 0 && this.opt.p3.x <= 1)
        ) {
            throw new RangeError(
                '[BezierTimingFunction] control point x values must be within [0, 1].'
            )
        }
        const { p2, p3 } = this.opt
        this.ax = 1 - 3 * p3.x + 3 * p2.x
        this.bx = 3 * p3.x - 6 * p2.x
        this.cx = 3 * p2.x
        this.ay = 1 - 3 * p3.y + 3 * p2.y
        this.by = 3 * p3.y - 6 * p2.y
        this.cy = 3 * p2.y
        // Pre-calculate sample table
        if (p2.x !== p2.y || p3.x !== p3.y) {
            this.sampleValues = new Float64Array(SAMPLE_TABLE_SIZE)
            for (let i = 0; i < SAMPLE_TABLE_SIZE; ++i) {
                this.sampleValues[i] = this.calcX(i * SAMPLE_STEP_SIZE)
            }
        }
    }

    private calcX(t: number): number {
        return ((this.ax * t + this.bx) * t + this.cx) * t
    }

    private getSlope(t: number): number {
        return (3 * this.ax * t + 2 * this.bx) * t + this.cx
    }

    /**
     * Solves x(t) = x to near machine precision: Newton-Raphson from an
     * interpolated guess, inside a bracket that every evaluation narrows.
     * Bisection takes over when the slope is small or a step leaves the
     * bracket.
     */
    private getTForX(x: number): number {
        const samples = this.sampleValues!
        const lastSample = SAMPLE_TABLE_SIZE - 1

        let currentSample = 1
        while (currentSample !== lastSample && samples[currentSample]! <= x) {
            ++currentSample
        }
        --currentSample
        let low = currentSample * SAMPLE_STEP_SIZE
        let high = low + SAMPLE_STEP_SIZE

        // Interpolate to provide an initial guess for t
        const dist =
            (x - samples[currentSample]!) /
            (samples[currentSample + 1]! - samples[currentSample]!)
        let t = low + dist * SAMPLE_STEP_SIZE
        if (!(t > low && t < high)) t = (low + high) / 2

        for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
            const residual = this.calcX(t) - x
            if (residual === 0.0) return t
            if (residual > 0.0) high = t
            else low = t
            const slope = this.getSlope(t)
            if (slope < NEWTON_MIN_SLOPE) break
            const next = t - residual / slope
            if (!(next > low && next < high)) break
            const step = Math.abs(next - t)
            t = next
            if (step < T_PRECISION) return t
        }

        for (let i = 0; i < BISECTION_MAX_ITERATIONS; ++i) {
            if (high - low < T_PRECISION) break
            t = (low + high) / 2
            if (this.calcX(t) > x) high = t
            else low = t
        }
        return (low + high) / 2
    }

    /**
     * Eased progress for normalized time `x` in `[0, 1]`.
     */
    public ease(x: number): number {
        // If linear (p2.x=p2.y, p3.x=p3.y), skip solving.
        // Otherwise solve x(t) = time for t.
        if (
            this.opt.p2.x === this.opt.p2.y &&
            this.opt.p3.x === this.opt.p3.y
        ) {
            return x
        }
        if (x <= 0) return 0
        if (x >= 1) return 1
        // Solve for t given x, then calculate y(t)
        const t = this.getTForX(x)
        return ((this.ay * t + this.by) * t + this.cy) * t
    }

    public step(
        time: number,
        context: TimingFunctionContext
    ): { value: number; endOfAnimation: boolean } {
        const { duration, from, to } = context
        if (duration === 0) {
            return { value: to, endOfAnimation: true }
        }

        // Normalize time [0, 1]
        const x = Math.max(0, Math.min(time / duration, 1))
        const value = from + (to - from) * this.ease(x)
        const endOfAnimation = time >= duration

        return {
            value,
            endOfAnimation,
        }
    }
}
