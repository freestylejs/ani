import type { LayoutGroup, LayoutSnapshot } from '@freestylejs/ani-layout'

export interface Box {
    left: number
    top: number
    width: number
    height: number
}

export interface PausedSample {
    at: number
    boxes: Box[]
}

export function boxOf(element: HTMLElement): Box {
    const rect = element.getBoundingClientRect()
    return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
    }
}

/** All animations created by the core group for these elements. */
export function animationsOf(elements: readonly HTMLElement[]): Animation[] {
    return elements.flatMap((element) => element.getAnimations())
}

/**
 * Pause a live FLIP run and sample a specific timeline point. The caller owns
 * `finish()`/`cancel()` afterwards.
 */
export function pauseAt(animations: readonly Animation[], at: number): void {
    for (const animation of animations) {
        animation.pause()
        animation.currentTime = at
    }
}

export function sampleBoxes(
    elements: readonly HTMLElement[],
    animations: readonly Animation[],
    at: number
): PausedSample {
    pauseAt(animations, at)
    return { at, boxes: elements.map(boxOf) }
}

export function resumeAnimations(animations: readonly Animation[]): void {
    for (const animation of animations) animation.play()
}

export function cancelAnimations(animations: readonly Animation[]): void {
    for (const animation of animations) animation.cancel()
}

export interface BaselineRun {
    before: Box[]
    target: Box[]
    first: PausedSample
    middle: PausedSample
    final: Box[]
    result: string
}

/**
 * Run a core group with a deterministic pause/sample/resume oracle.
 * This is the reference shape used by the showcase fixture.
 */
export async function runPausedOracle(
    group: LayoutGroup,
    elements: readonly HTMLElement[],
    snapshot: LayoutSnapshot,
    mutate: () => void
): Promise<BaselineRun> {
    const before = elements.map(boxOf)
    mutate()
    const target = elements.map(boxOf)
    const pending = group.play(snapshot)
    const animations = animationsOf(elements)
    if (animations.length === 0) {
        throw new Error('oracle expected managed animations')
    }
    const first = sampleBoxes(elements, animations, 0)
    const middle = sampleBoxes(elements, animations, 120)
    resumeAnimations(animations)
    const result = await pending
    return {
        before,
        target,
        first,
        middle,
        final: elements.map(boxOf),
        result,
    }
}

/** Synchronous main-thread block used by the P9 jank proof. */
export function blockMainThread(ms: number): void {
    const start = performance.now()
    while (performance.now() - start < ms) {
        // deliberately busy: the compositor must keep running
    }
}
