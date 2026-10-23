import type { TimingFunction } from '@freestylejs/ani-core'
import { supportsLinearEasing } from './feature'

const EASING_SAMPLES = 48

/** Samples a core timing function for both CSS and analytic plan evaluation. */
function easingValues(timingFunction: TimingFunction): number[] {
    const samples: number[] = []
    const context = {
        dt: 0,
        from: 0,
        to: 1,
        duration: 1,
    }
    for (let i = 0; i <= EASING_SAMPLES; i++) {
        samples.push(timingFunction.step(i / EASING_SAMPLES, context).value)
    }
    return samples
}

/** Samples a core timing function to a CSS easing string. */
export function cssEasing(timingFunction: TimingFunction): string {
    if (!supportsLinearEasing()) return 'ease-out'
    return `linear(${easingValues(timingFunction).join(',')})`
}
