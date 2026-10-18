import { TimingFunction, type TimingFunctionContext } from './function'

import type { SpringTimingFunctionOpt } from './spring'

/**
 * Upper bound of one integration substep (seconds). The integrator only ever
 * advances in whole substeps, so the result depends on the queried time alone,
 * never on how the frames happened to be sliced.
 */
const MAX_SUBSTEP = 1 / 120
const MIN_SUBSTEP = 1 / 2000

interface SpringState {
    init: boolean
    done: boolean
    /** whole substeps integrated so far */
    n: number
    x: number
    v: number
    /** velocity at the last queried time */
    velocity: number
}

function createSpringState(): SpringState {
    return { init: false, done: false, n: 0, x: 0, v: 0, velocity: 0 }
}

/**
 * Physically simulated spring (RK4, fixed substeps).
 *
 * - Deterministic: the value at local time `t` is a pure function of
 *   `(from, to, velocity seed, opt, t)`; `dt` is ignored. Seeking re-simulates
 *   from the segment start.
 * - Ends when settled (`|x - to|` and `|v|` both within `opt.tolerance`,
 *   default 1e-3) or when the segment `duration` elapses, whichever is first.
 *   Either way the value snaps to `to`.
 * - Integrator state lives in the timeline's plan runtime (`context.state`),
 *   so a single instance may be shared freely. Calling `step` directly without
 *   a `state` falls back to a per-instance slot (single consumer only).
 */
export class DynamicSpringTimingFunction extends TimingFunction {
    public override readonly stateful = true

    private readonly substep: number
    private legacyState: SpringState = createSpringState()

    // scratch for the RK4 result (avoids per-step allocations)
    private rx = 0
    private rv = 0

    public constructor(public readonly opt: SpringTimingFunctionOpt) {
        super()
        const { m, k, c } = opt
        if (!(m > 0) || !(k > 0) || !(c >= 0)) {
            throw new RangeError(
                `[DynamicSpringTimingFunction] requires m > 0, k > 0 and c >= 0, received m=${m}, k=${k}, c=${c}.`
            )
        }
        // RK4 stays accurate while omega * substep is well below ~1.
        const omega = Math.max(Math.sqrt(k / m), c / m)
        this.substep = Math.min(MAX_SUBSTEP, Math.max(MIN_SUBSTEP, 0.5 / omega))
    }

    /**
     * Seeds the standalone (state-less `step`) integrator.
     */
    public init(startValue: number, velocity: number = 0): void {
        const s = this.legacyState
        s.init = true
        s.done = false
        s.n = 0
        s.x = startValue
        s.v = velocity
        s.velocity = velocity
    }

    /**
     * Clears the standalone integrator so the next `step` re-initializes
     * from the incoming `context.from`.
     */
    public reset(): void {
        this.legacyState = createSpringState()
    }

    private integrate(x: number, v: number, h: number, to: number): void {
        const { m, k, c } = this.opt
        const a1 = (-k * (x - to) - c * v) / m
        const x2 = x + v * (h / 2)
        const v2 = v + a1 * (h / 2)
        const a2 = (-k * (x2 - to) - c * v2) / m
        const x3 = x + v2 * (h / 2)
        const v3 = v + a2 * (h / 2)
        const a3 = (-k * (x3 - to) - c * v3) / m
        const x4 = x + v3 * h
        const v4 = v + a3 * h
        const a4 = (-k * (x4 - to) - c * v4) / m
        this.rx = x + (h / 6) * (v + 2 * v2 + 2 * v3 + v4)
        this.rv = v + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4)
    }

    public step(
        time: number,
        context: TimingFunctionContext
    ): { value: number; endOfAnimation: boolean } {
        const s = (context.state as SpringState | undefined) ?? this.legacyState
        const { to } = context
        const tol = this.opt.tolerance ?? context.tolerance ?? 1e-3

        if (time >= context.duration) {
            s.velocity = 0
            return { value: to, endOfAnimation: true }
        }

        const h = this.substep
        // epsilon keeps exact multiples of `h` on the right side of floor()
        const target = Math.floor(time / h + 1e-9)

        if (!s.init || target < s.n) {
            s.init = true
            s.n = 0
            s.x = context.from
            s.v = context.velocity ?? 0
            s.done = isSettled(s.x, s.v, to, tol)
        }

        if (!s.done) {
            while (s.n < target) {
                this.integrate(s.x, s.v, h, to)
                s.x = this.rx
                s.v = this.rv
                s.n++
                if (isSettled(s.x, s.v, to, tol)) {
                    s.done = true
                    break
                }
            }
        }

        if (s.done) {
            s.velocity = 0
            return { value: to, endOfAnimation: true }
        }

        // The committed state sits on a substep boundary; the remainder is
        // evaluated on a throwaway copy so the result stays frame-independent.
        const rest = time - s.n * h
        if (rest > 1e-12) {
            this.integrate(s.x, s.v, rest, to)
            s.velocity = this.rv
            return { value: this.rx, endOfAnimation: false }
        }
        s.velocity = s.v
        return { value: s.x, endOfAnimation: false }
    }
}

function isSettled(x: number, v: number, to: number, tol: number): boolean {
    return Math.abs(x - to) <= tol && Math.abs(v) <= tol
}
