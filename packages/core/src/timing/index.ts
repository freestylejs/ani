export * from './function'
export * from './linear'

import * as Bezier from './bezier'
import { DynamicSpringTimingFunction } from './dynamic_spring'
import { LinearTimingFunction } from './linear'
import { SpringTimingFunction, type SpringTimingFunctionOpt } from './spring'

/**
 * Core timing functions
 */
export const T = {
    /**
     * Creates a new Bezier timing function instance.
     *
     * @param {Bezier.BezierTimingFunctionOpt} opt - Options for configuring the Bezier curve.
     */
    bezier: (opt: Bezier.BezierTimingFunctionOpt) =>
        new Bezier.BezierTimingFunction(opt),

    /**
     * Creates a new Spring timing function instance.
     *
     * @param {SpringTimingFunctionOpt} opt - Options for configuring the Spring timing function.
     */
    spring: (opt: SpringTimingFunctionOpt) => new SpringTimingFunction(opt),

    /**
     * Creates a new Dynamic Spring timing function instance.
     *
     * @param SpringTimingFunctionOpt} opt - Options for configuring the Spring timing function.
     */
    dynamicSpring: (opt: SpringTimingFunctionOpt) =>
        new DynamicSpringTimingFunction(opt),

    /**
     * Creates linear timing function instance.
     */
    linear: () => new LinearTimingFunction(),
} as const
