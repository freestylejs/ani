export * from './function'
export * from './linear'

import * as Bezier from './bezier'
import { LinearTimingFunction } from './linear'
import * as Spring from './spring'

/**
 * Core timing functions
 */
export const T = {
    /**
     * Creates a new Bezier timing function instance.
     *
     * @param {Bezier.BezierTimingFunctionOpt} opt - Options for configuring the Bezier curve.
     * A new instance of BezierTimingFunction.
     */
    bezier: (opt: Bezier.BezierTimingFunctionOpt) =>
        new Bezier.BezierTimingFunction(opt),

    /**
     * Creates a new Spring timing function instance.
     *
     * @param {Spring.SpringTimingFunctionOpt} opt - Options for configuring the Spring timing function.
     * A new instance of SpringTimingFunction.
     */
    spring: (opt: Spring.SpringTimingFunctionOpt) =>
        new Spring.SpringTimingFunction(opt),

    /**
     * Creates linear timing function instance.
     */
    linear: () => new LinearTimingFunction(),
} as const
