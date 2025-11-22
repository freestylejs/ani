export * from './bezier'
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

    /**
     * Standard CSS 'ease' timing function (0.25, 0.1, 0.25, 1.0).
     */
    ease: () =>
        new Bezier.BezierTimingFunction({
            p2: { x: 0.25, y: 0.1 },
            p3: { x: 0.25, y: 1.0 },
        }),

    /**
     * Standard CSS 'ease-in' timing function (0.42, 0, 1.0, 1.0).
     */
    easeIn: () =>
        new Bezier.BezierTimingFunction({
            p2: { x: 0.42, y: 0 },
            p3: { x: 1.0, y: 1.0 },
        }),

    /**
     * Standard CSS 'ease-out' timing function (0, 0, 0.58, 1.0).
     */
    easeOut: () =>
        new Bezier.BezierTimingFunction({
            p2: { x: 0, y: 0 },
            p3: { x: 0.58, y: 1.0 },
        }),

    /**
     * Standard CSS 'ease-in-out' timing function (0.42, 0, 0.58, 1.0).
     */
    easeInOut: () =>
        new Bezier.BezierTimingFunction({
            p2: { x: 0.42, y: 0 },
            p3: { x: 0.58, y: 1.0 },
        }),
} as const
