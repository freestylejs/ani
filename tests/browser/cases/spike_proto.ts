// CP2 spike S1: prototype of the render-capture / commit-flush mechanism.
// Not the engine: it only records which before-boxes a flush would use.

export interface S1Stats {
    touches: number
    captures: number
    refreshes: number
    flushes: number
    compared: number
    missing: number
    violations: number
    maxError: number
}

export function emptyStats(): S1Stats {
    return {
        touches: 0,
        captures: 0,
        refreshes: 0,
        flushes: 0,
        compared: 0,
        missing: 0,
        violations: 0,
        maxError: 0,
    }
}

interface Capture {
    live: boolean
    rects: Map<HTMLElement, DOMRect>
}

const participants = new Set<HTMLElement>()
let capture: Capture | null = null
let queued = false
let truth: Map<HTMLElement, DOMRect> | null = null
/** `false` is the control run: a capture is never refreshed. */
let refresh = true
export let stats = emptyStats()

export function resetProto(refreshCaptures: boolean): void {
    participants.clear()
    capture = null
    queued = false
    truth = null
    refresh = refreshCaptures
    stats = emptyStats()
}

function readAll(): Map<HTMLElement, DOMRect> {
    const rects = new Map<HTMLElement, DOMRect>()
    for (const element of participants) {
        rects.set(element, element.getBoundingClientRect())
    }
    return rects
}

/** A render has captured and its commit has not flushed yet. */
export function pendingCapture(): boolean {
    return capture !== null
}

export function register(element: HTMLElement): () => void {
    participants.add(element)
    return () => {
        participants.delete(element)
    }
}

/** Render touch: capture once per task; a capture from an earlier task is read again. */
export function touch(): void {
    stats.touches += 1
    if (capture && (capture.live || !refresh)) return
    if (capture) stats.refreshes += 1
    const current: Capture = { live: true, rects: readAll() }
    capture = current
    stats.captures += 1
    queueMicrotask(() => {
        current.live = false
    })
}

/** Layout effect: one flush microtask per commit. */
export function close(): void {
    if (queued) return
    queued = true
    queueMicrotask(flush)
}

/** Truth: the before-mutation snapshot of the first probed commit since the last flush. */
export function probe(): void {
    if (truth === null) truth = readAll()
}

function flush(): void {
    queued = false
    const used = capture
    capture = null
    const expected = truth
    truth = null
    stats.flushes += 1
    if (expected === null) return
    if (used === null) {
        stats.missing += 1
        return
    }
    for (const [element, rect] of expected) {
        const before = used.rects.get(element)
        if (!before) continue
        stats.compared += 1
        const error = Math.max(
            Math.abs(before.left - rect.left),
            Math.abs(before.top - rect.top),
            Math.abs(before.width - rect.width),
            Math.abs(before.height - rect.height)
        )
        stats.maxError = Math.max(stats.maxError, error)
        if (error > 0.5) stats.violations += 1
    }
}
