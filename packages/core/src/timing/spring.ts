import { TimingFunction, type TimingFunctionContext } from './function'

export interface SpringTimingFunctionOpt {
    /**
     * Mass constant.
     */
    m: number
    /**
     * Spring constant.
     */
    k: number
    /**
     * Damping constant.
     */
    c: number
    /**
     * End of spring animation threshold.
     * @default 1e-3
     */
    tolerance?: number
}
export class SpringTimingFunction extends TimingFunction {
    public constructor(public readonly opt: SpringTimingFunctionOpt) {
        super()
        if (!this.opt.tolerance) {
            const DEFAULT_TOLERANCE = 1e-3 as const
            this.opt.tolerance = DEFAULT_TOLERANCE
        }
    }

    public step(
        time: number,
        context: TimingFunctionContext
    ): {
        value: number
        endOfAnimation: boolean
    } {
        // mass-spring-damper
        // ODE
        const m = this.opt.m
        const k = this.opt.k
        const c = this.opt.c
        const tolerance = this.opt.tolerance!

        // Initial D
        const d0 = context.from - context.to

        if (typeof d0 !== 'number') {
            throw new TypeError(
                'Spring step function, needs initial displacement d(0) = context.start'
            )
        }

        const wN = Math.sqrt(k / m)
        const zetta = c / (2 * Math.sqrt(m * k))
        const Ms = 1000 as const

        if (zetta < 1) {
            // under-damped system
            const settlingTime = (-1 / (zetta * wN)) * Math.log(tolerance)
            const t = context?.duration
                ? (settlingTime / context.duration) * time
                : time

            const C1 = d0
            const C2 = (zetta / Math.sqrt(1 - zetta ** 2)) * d0
            const ode =
                Math.exp(-zetta * wN * t) *
                    (C1 * Math.cos(wN * Math.sqrt(1 - zetta ** 2) * t) +
                        C2 * Math.sin(wN * Math.sqrt(1 - zetta ** 2) * t)) +
                context.to

            return {
                value: ode,
                endOfAnimation: t >= settlingTime && ode >= context.to,
            }
        }

        if (zetta === 1) {
            // critically-damped system
            const settlingTime = (-1 / wN) * Math.log(tolerance)
            const t = context?.duration
                ? (settlingTime / context.duration) * time
                : time

            const C1 = d0
            const C2 = wN * d0
            const ode = (C1 + C2 * t) * Math.exp(-wN * t) + context.to

            return {
                value: ode,
                endOfAnimation:
                    t >= settlingTime &&
                    Math.abs(ode - context.to) <= context.to / Ms,
            }
        }

        if (zetta > 1) {
            // overdamped system
            const settlingTime = (-1 / (zetta * wN)) * Math.log(tolerance)
            const t = context?.duration
                ? (settlingTime / context.duration) * time
                : time

            const delta = Math.sqrt(zetta ** 2 - 1)
            const lambda1 = -zetta * wN + wN * delta
            const lambda2 = -zetta * wN - wN * delta

            const C2 = (-lambda1 * d0) / (lambda2 - lambda1)
            const C1 = d0 - C2

            // ODE solution
            const ode =
                C1 * Math.exp(lambda1 * t) +
                C2 * Math.exp(lambda2 * t) +
                context.to

            return {
                value: ode,
                endOfAnimation:
                    t >= settlingTime &&
                    Math.abs(ode - context.to) <= context.to / Ms,
            }
        }

        throw new Error('invalid system')
    }
}
