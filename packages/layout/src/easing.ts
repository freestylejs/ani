import type { TimingFunction } from '@freestylejs/ani-core'
import { supportsLinearEasing } from './feature'

/** Samples a core timing function to a CSS easing string. */
export function cssEasing(timingFunction: TimingFunction): string {
    if (!supportsLinearEasing()) return 'ease-out'
    const samples: number[] = []
    const context = {
        dt: 0,
        from: 0,
        to: 1,
        duration: 1,
    }
    for (let i = 0; i <= 48; i++) {
        samples.push(timingFunction.step(i / 48, context).value)
    }
    return `linear(${samples.join(',')})`
}
