import { TimingFunction, type TimingFunctionContext } from './function'

import type { SpringTimingFunctionOpt } from './spring'

export class DynamicSpringTimingFunction extends TimingFunction {
    public constructor(public readonly opt: SpringTimingFunctionOpt) {
        super()
    }

    private currentValue: number = 0
    private currentVelocity: number = 0
    private isInitialized: boolean = false

    public init(startValue: number): void {
        this.currentValue = startValue
        this.currentVelocity = 0
        this.isInitialized = true
    }

    private getDerivatives(
        state: { x: number; v: number },
        to: number
    ): { dx: number; dv: number } {
        const { m, k, c } = this.opt
        const displacement = state.x - to

        const a = (-k * displacement - c * state.v) / m

        return { dx: state.v, dv: a }
    }

    public step(
        _time: number,
        context: TimingFunctionContext
    ): {
        value: number
        endOfAnimation: boolean
    } {
        if (!this.isInitialized) {
            this.init(context.from)
        }

        const { to, tolerance, dt } = context

        if (dt === 0) {
            return {
                value: this.currentValue,
                endOfAnimation: false, // Or check for end state
            }
        }

        const x = this.currentValue
        const v = this.currentVelocity

        // RK4
        // k1
        const k1 = this.getDerivatives({ x, v }, to)
        // k2
        const k2State = {
            x: x + k1.dx * (dt / 2),
            v: v + k1.dv * (dt / 2),
        }
        const k2 = this.getDerivatives(k2State, to)
        // k3
        const k3State = {
            x: x + k2.dx * (dt / 2),
            v: v + k2.dv * (dt / 2),
        }
        const k3 = this.getDerivatives(k3State, to)
        // k4
        const k4State = {
            x: x + k3.dx * dt,
            v: v + k3.dv * dt,
        }
        const k4 = this.getDerivatives(k4State, to)

        const avgDx = (1.0 / 6.0) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx)
        const avgDv = (1.0 / 6.0) * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv)

        this.currentValue = x + avgDx * dt
        this.currentVelocity = v + avgDv * dt

        // Check for end of animation
        const tol = tolerance ?? 1e-3
        const displacement = this.currentValue - to
        const isMoving = Math.abs(this.currentVelocity) > tol
        const isDisplaced = Math.abs(displacement) > tol
        const endOfAnimation = !isMoving && !isDisplaced

        if (endOfAnimation) {
            // Snap to final value
            this.currentValue = to
            this.currentVelocity = 0
        }

        return {
            value: this.currentValue,
            endOfAnimation: endOfAnimation,
        }
    }
}
