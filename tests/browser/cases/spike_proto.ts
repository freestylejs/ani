// CP2 spike S1: prototype of the render-capture / commit-flush mechanism.
// Not the engine: it only records which before-boxes a flush would use.

export interface S1Stats {
    touches: number
    captures: number
    refreshes: number
    flushes: number
    compared: number
    missing: number
    /** Flushes that handed their after-boxes to a render begun since the commit. */
    handoffs: number
    /** Flushes that would animate (B differs from the DOM) with no probe truth. */
    unchecked: number
    /** Flushes of a commit that revealed resolved Suspense content, checked against truth. */
    reveals: number
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
        handoffs: 0,
        unchecked: 0,
        reveals: 0,
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
/** A participant rendered after the last layout effect: a render is in progress. */
let renderSinceCommit = false
let revealPending = false
/** Resolved contents already revealed: StrictMode replays an effect with the same content. */
const shown = new Set<string>()
/** `false` is the control run: a capture is never refreshed. */
let refresh = true
export let stats = emptyStats()

export function resetProto(refreshCaptures: boolean): void {
    participants.clear()
    capture = null
    queued = false
    truth = null
    renderSinceCommit = false
    revealPending = false
    shown.clear()
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

/** Layout effect showing resolved Suspense content; the first per content is a reveal commit. */
export function revealed(content: string): void {
    if (shown.has(content)) return
    shown.add(content)
    revealPending = true
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
    renderSinceCommit = true
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
    renderSinceCommit = false
    if (queued) return
    queued = true
    queueMicrotask(flush)
}

/** Truth: the before-mutation snapshot of the first probed commit since the last flush. */
export function probe(): void {
    if (truth === null) truth = readAll()
}

function moved(
    before: Map<HTMLElement, DOMRect>,
    after: Map<HTMLElement, DOMRect>
): boolean {
    for (const [element, rect] of before) {
        const now = after.get(element)
        if (!now) continue
        if (
            Math.abs(now.left - rect.left) > 0.5 ||
            Math.abs(now.top - rect.top) > 0.5 ||
            Math.abs(now.width - rect.width) > 0.5 ||
            Math.abs(now.height - rect.height) > 0.5
        ) {
            return true
        }
    }
    return false
}

/**
 * The flush reads A. A render that began after this commit, in the same
 * task, before this microtask (React's scheduler runs several of its tasks
 * per macrotask), already touched: A is its before-box, so it inherits a
 * capture of A (expired, so a later touch still re-reads).
 */
function flush(): void {
    queued = false
    const used = capture
    capture = null
    const expected = truth
    truth = null
    const reveal = revealPending
    revealPending = false
    stats.flushes += 1
    const after = readAll()
    if (renderSinceCommit) {
        capture = { live: false, rects: after }
        stats.handoffs += 1
    }
    if (expected === null) {
        // initial mounts, StrictMode effect replays and no-op commits move
        // nothing; anything that would animate must have been probed
        if ((used !== null && moved(used.rects, after)) || reveal) {
            stats.unchecked += 1
        }
        return
    }
    if (reveal) stats.reveals += 1
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
