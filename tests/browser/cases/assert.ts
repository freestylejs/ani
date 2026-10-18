declare global {
    interface Window {
        /** Exposed by `run.ts`: V8 heap in bytes after two forced GCs. */
        aniHeapUsed(): Promise<number>
        /** Exposed by `run.ts`: CDP `LayoutCount` of this page. */
        aniLayoutCount(): Promise<number>
    }
}

function show(value: unknown): string {
    if (typeof value === 'object' && value !== null) {
        try {
            return JSON.stringify(value)
        } catch {
            return String(value)
        }
    }
    return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

/** Throws unless `actual` equals `expected` (`Object.is`, JSON for objects). */
export function expectEqual<T>(
    actual: T,
    expected: T,
    message = 'values differ'
): void {
    const same =
        typeof actual === 'object' && actual !== null
            ? show(actual) === show(expected)
            : Object.is(actual, expected)
    if (!same) {
        throw new Error(
            `${message}: expected ${show(expected)}, received ${show(actual)}`
        )
    }
}

/** Throws unless `a` and `b` differ by at most `eps`. */
export function expectClose(
    a: number,
    b: number,
    eps: number,
    message = 'numbers differ'
): void {
    if (!(Math.abs(a - b) <= eps)) {
        throw new Error(`${message}: ${a} is not within ${eps} of ${b}`)
    }
}

/** Resolves with the timestamp of the next real animation frame. */
export function nextFrame(): Promise<number> {
    return new Promise((resolve) => requestAnimationFrame(resolve))
}

/** Resolves after `count` real animation frames. */
export async function frames(count: number): Promise<void> {
    for (let i = 0; i < count; i++) await nextFrame()
}

/**
 * Polls `predicate` once per animation frame until it returns `true`.
 * Rejects after `timeoutMs` of wall time.
 */
export function waitFor(
    predicate: () => boolean,
    timeoutMs = 2000,
    message = 'condition'
): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = performance.now()
        const poll = () => {
            let done: boolean
            try {
                done = predicate()
            } catch (error) {
                reject(error)
                return
            }
            if (done) {
                resolve()
            } else if (performance.now() - start > timeoutMs) {
                reject(
                    new Error(
                        `waitFor timed out after ${timeoutMs} ms: ${message}`
                    )
                )
            } else {
                requestAnimationFrame(poll)
            }
        }
        poll()
    })
}

/** One recorded `style` attribute mutation. */
export interface StyleEntry {
    element: Element
    /** Value of the frame counter when the mutation was delivered. */
    frame: number
    /** Inline `transform` when the mutation was delivered. */
    transform: string
}

export interface StyleLog {
    /** Mutations recorded so far, oldest first. */
    readonly entries: readonly StyleEntry[]
    /** The elements whose style was mutated, per frame number. */
    changedByFrame(): Map<number, Set<Element>>
    /** Stops observing and the frame counter. */
    stop(): void
}

/**
 * Records every `style` attribute mutation of `elements` with the number of
 * the animation frame it happened in (a counter bumped by a rAF loop).
 */
export function styleLog(elements: Iterable<Element>): StyleLog {
    let frame = 0
    let running = true
    const tick = () => {
        if (!running) return
        frame += 1
        requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    const entries: StyleEntry[] = []
    const record = (records: readonly MutationRecord[]) => {
        for (const { target } of records) {
            const element = target as HTMLElement
            entries.push({ element, frame, transform: element.style.transform })
        }
    }
    const observer = new MutationObserver(record)
    for (const element of elements) {
        observer.observe(element, {
            attributes: true,
            attributeFilter: ['style'],
        })
    }

    return {
        get entries() {
            record(observer.takeRecords())
            return entries
        },
        changedByFrame() {
            const byFrame = new Map<number, Set<Element>>()
            for (const { element, frame: at } of this.entries) {
                const set = byFrame.get(at) ?? new Set<Element>()
                set.add(element)
                byFrame.set(at, set)
            }
            return byFrame
        },
        stop() {
            running = false
            observer.disconnect()
        },
    }
}

/** The x translation the browser computed for `element`. */
export function computedTranslateX(element: Element): number {
    return new DOMMatrixReadOnly(getComputedStyle(element).transform).m41
}

/** A fresh container attached to the page, to mount a component into. */
export function createContainer(): HTMLElement {
    const container = document.createElement('div')
    document.body.append(container)
    return container
}

/** Measurements only the Node side can take (CDP). */
export const host = {
    /** V8 heap used in bytes, after two forced garbage collections. */
    heapUsed: (): Promise<number> => window.aniHeapUsed(),
    /** Layouts this page has run so far. */
    layoutCount: (): Promise<number> => window.aniLayoutCount(),
}
