import type { LayoutResult } from '../types'
import type { NodePlan } from './plan'

/** One compiled/played layout group. */
export interface GroupRun {
    animations: Animation[]
    elements: HTMLElement[]
    plans: NodePlan[]
    startTime: number
    resolve: (result: LayoutResult) => void
}

/** Cancel every animation owned by a group; safe to call repeatedly. */
export function cancelGroupRun(run: GroupRun): void {
    for (const animation of run.animations) {
        try {
            animation.cancel()
        } catch {
            // The browser may already have released it.
        }
    }
}

/** Finish then release every animation without changing the final layout. */
export function finishGroupRun(run: GroupRun): void {
    for (const animation of run.animations) {
        try {
            animation.finish()
            animation.cancel()
        } catch {
            // The browser may already have released it.
        }
    }
}
