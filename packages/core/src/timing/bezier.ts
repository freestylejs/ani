import {
    type Coord,
    TimingFunction,
    type TimingFunctionContext,
} from './function'

export interface BezierTimingFunctionOpt {
    p2: Coord
    p3: Coord
}

// Newton-Raphson constants
const NEWTON_ITERATIONS = 4
const NEWTON_MIN_SLOPE = 0.001
const SUBDIVISION_PRECISION = 0.0000001
const SUBDIVISION_MAX_ITERATIONS = 10

const SAMPLE_TABLE_SIZE = 11
const SAMPLE_STEP_SIZE = 1.0 / (SAMPLE_TABLE_SIZE - 1.0)

export class BezierTimingFunction extends TimingFunction {
    private sampleValues: Float32Array | null = null

    public constructor(public readonly opt: { p2: Coord; p3: Coord }) {
        super()
        // Pre-calculate sample table
        if (
            this.opt.p2.x !== this.opt.p2.y ||
            this.opt.p3.x !== this.opt.p3.y
        ) {
            this.sampleValues = new Float32Array(SAMPLE_TABLE_SIZE)
            for (let i = 0; i < SAMPLE_TABLE_SIZE; ++i) {
                this.sampleValues[i] = this.calcBezier(
                    i * SAMPLE_STEP_SIZE,
                    this.opt.p2.x,
                    this.opt.p3.x
                )
            }
        }
    }

    private calcBezier(t: number, a1: number, a2: number): number {
        return (
            ((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t * t + 3 * a1 * t
        )
    }

    private getSlope(t: number, a1: number, a2: number): number {
        return (
            3 * (1 - 3 * a2 + 3 * a1) * t * t +
            2 * (3 * a2 - 6 * a1) * t +
            3 * a1
        )
    }

    private getTForX(x: number): number {
        const mX1 = this.opt.p2.x
        const mX2 = this.opt.p3.x

        let intervalStart = 0.0
        let currentSample = 1

        const lastSample = SAMPLE_TABLE_SIZE - 1

        for (
            ;
            currentSample !== lastSample &&
            this.sampleValues![currentSample]! <= x;
            ++currentSample
        ) {
            intervalStart += SAMPLE_STEP_SIZE
        }
        --currentSample

        // Interpolate to provide an initial guess for t
        const dist =
            (x - this.sampleValues![currentSample]!) /
            (this.sampleValues![currentSample + 1]! -
                this.sampleValues![currentSample]!)
        const guessForT = intervalStart + dist * SAMPLE_STEP_SIZE

        const initialSlope = this.getSlope(guessForT, mX1, mX2)
        if (initialSlope >= NEWTON_MIN_SLOPE) {
            return this.newtonRaphsonIterate(x, guessForT, mX1, mX2)
        }
        if (initialSlope === 0.0) {
            return guessForT
        }
        return this.binarySubdivide(
            x,
            intervalStart,
            intervalStart + SAMPLE_STEP_SIZE,
            mX1,
            mX2
        )
    }

    private binarySubdivide(
        aX: number,
        aA: number,
        aB: number,
        mX1: number,
        mX2: number
    ): number {
        let currentX: number
        let currentT: number
        let i = 0
        let currentA = aA
        let currentB = aB
        do {
            currentT = currentA + (currentB - currentA) / 2.0
            currentX = this.calcBezier(currentT, mX1, mX2) - aX
            if (currentX > 0.0) {
                currentB = currentT
            } else {
                currentA = currentT
            }
        } while (
            Math.abs(currentX) > SUBDIVISION_PRECISION &&
            ++i < SUBDIVISION_MAX_ITERATIONS
        )
        return currentT
    }

    private newtonRaphsonIterate(
        aX: number,
        aGuessT: number,
        mX1: number,
        mX2: number
    ): number {
        let guessT = aGuessT
        for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
            const currentSlope = this.getSlope(guessT, mX1, mX2)
            if (currentSlope === 0.0) {
                return guessT
            }
            const currentX = this.calcBezier(guessT, mX1, mX2) - aX
            guessT -= currentX / currentSlope
        }
        return guessT
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
        let easedT = x

        // If linear (p2.x=p2.y, p3.x=p3.y), skip solving.
        // Otherwise solve x(t) = time for t.
        if (
            this.opt.p2.x !== this.opt.p2.y ||
            this.opt.p3.x !== this.opt.p3.y
        ) {
            if (!this.sampleValues) {
                // Should have been initialized in constructor
            }
            // Solve for t given x
            const t = this.getTForX(x)
            // Calculate y(t)
            easedT = this.calcBezier(t, this.opt.p2.y, this.opt.p3.y)
        }

        const value = from + (to - from) * easedT
        const endOfAnimation = time >= duration

        return {
            value,
            endOfAnimation,
        }
    }
}
