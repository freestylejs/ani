/**
 * The WAAPI realizer (§10): one `translate` animation per depth-0
 * `'position'` track, created in the flush and played from the next animation
 * frame without a `startTime`, so its first painted frame is τ = 0 and it runs
 * on the compositor. The only module that calls `Element.animate`.
 */

import { layoutFault } from '../fault'
import type { Curve } from '../motion'

/** Largest drawn error of the sampled easing, px. */
const EASING_TOLERANCE = 0.05
const PROBES = 1024
const MAX_STOPS = 1000

export interface WaapiTrack {
    /** Total translate at the start and at the end (the authored translate), px. */
    readonly from: readonly [number, number]
    readonly to: readonly [number, number]
    /** Seconds. */
    readonly duration: number
    readonly delay: number
    readonly curve: Curve
    /**
     * The node is never the scroll anchor (§6, §11.4 S2): both keyframes
     * carry `overflow-anchor: none`, a discrete value held for the whole
     * animation, its delay included (`fill: 'backwards'`).
     */
    readonly noAnchor: boolean
}

function format(n: number): string {
    return Math.abs(n) < 1e-9 ? '0' : String(Number(n.toFixed(6)))
}

/**
 * The curve as a CSS `linear()` easing, sampled evenly so that a move of
 * `distance` px is drawn within `EASING_TOLERANCE` (the chord error of a
 * piecewise-linear curve is `|e″|·h²/8`).
 */
export function linearEasing(curve: Curve, distance: number): string {
    let bend = 0
    const h = 1 / PROBES
    for (let i = 1; i < PROBES; i++) {
        const second =
            (curve.value((i + 1) * h) -
                2 * curve.value(i * h) +
                curve.value((i - 1) * h)) /
            (h * h)
        bend = Math.max(bend, Math.abs(second))
    }
    const stops = Math.min(
        MAX_STOPS,
        Math.max(
            1,
            Math.ceil(Math.sqrt((bend * distance) / (8 * EASING_TOLERANCE)))
        )
    )
    const values: string[] = []
    for (let i = 0; i <= stops; i++) values.push(format(curve.value(i / stops)))
    return `linear(${values.join(', ')})`
}

/** Starts a track; `onEnd` runs once when it finishes (not when cancelled). */
export function play(
    element: HTMLElement,
    track: WaapiTrack,
    onEnd: () => void
): Animation {
    layoutFault('animate')
    const [fx, fy] = track.from
    const [tx, ty] = track.to
    const keyframe = (x: number, y: number): Keyframe => {
        const translate = `${format(x)}px ${format(y)}px`
        return track.noAnchor
            ? { translate, overflowAnchor: 'none' }
            : { translate }
    }
    const animation = element.animate([keyframe(fx, fy), keyframe(tx, ty)], {
        duration: track.duration * 1000,
        delay: track.delay * 1000,
        easing: linearEasing(
            track.curve,
            Math.max(Math.abs(fx - tx), Math.abs(fy - ty))
        ),
        // the delay holds the start; at the end the layout box is A
        fill: 'backwards',
    })
    // held at τ = 0 until the next animation frame: a pending play would
    // count a main-thread block after the flush as elapsed time in Gecko and
    // WebKit; started from a frame, every browser starts it at that frame
    animation.pause()
    requestAnimationFrame(() => {
        if (animation.playState === 'paused' && animation.currentTime === 0)
            animation.play()
    })
    animation.finished.then(onEnd, () => undefined)
    return animation
}

/** Seconds since the track started (its delay included); 0 while pending. */
export function elapsedOf(animation: Animation): number {
    const time = animation.currentTime
    return typeof time === 'number' ? time / 1000 : 0
}
