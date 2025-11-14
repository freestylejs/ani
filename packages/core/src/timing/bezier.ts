/** biome-ignore-all lint/style/noMagicNumbers: <>*/
import {
    type Coord,
    TimingFunction,
    type TimingFunctionContext,
} from './function'

export interface BezierTimingFunctionOpt {
    p2: Coord
    p3: Coord
}
export class BezierTimingFunction extends TimingFunction {
    public constructor(public readonly opt: { p2: Coord; p3: Coord }) {
        super()
    }
    private readonly p1: Coord = {
        x: 0,
        y: 0,
    }
    private readonly p4: Coord = {
        x: 1,
        y: 1,
    }

    private _bezierFunction(t: number, duration?: number): number {
        const end: number = duration || this.p4.y
        return (
            (1 - t) ** 3 * this.p1.y +
            3 * (1 - t) ** 2 * t * this.opt.p2.y +
            3 * (1 - t) * t ** 2 * this.opt.p3.y +
            t ** 3 * end
        )
    }

    public step(
        time: number,
        context: TimingFunctionContext
    ): { value: number; endOfAnimation: boolean } {
        const f = this._bezierFunction(time, context.duration)
        return {
            value: f,
            endOfAnimation:
                (context.duration
                    ? time >= context.duration
                    : time >= this.p4.x) && f >= context.to,
        }
    }
}
