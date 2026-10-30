/**
 * Hard per-operation deadlines for the P5 bench.
 *
 * A bench operation must fail honestly when the page or browser stops
 * answering: the harness may not wait forever on a Playwright promise that a
 * crashed renderer or browser cannot settle. The deadline names the exact
 * stage so a future hang is visible in the log.
 */

export class OperationTimeoutError extends Error {
    readonly stage: string
    readonly timeoutMs: number

    constructor(stage: string, timeoutMs: number) {
        super(`timed out after ${timeoutMs} ms: ${stage}`)
        this.name = 'OperationTimeoutError'
        this.stage = stage
        this.timeoutMs = timeoutMs
    }
}

/**
 * Race an operation against a hard deadline. The operation's later rejection
 * (if the deadline won) is observed here so Node does not emit an unhandled
 * rejection while the caller tears the stage down.
 */
export async function withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    stage: string
): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error(`invalid timeout ${timeoutMs} ms for ${stage}`)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new OperationTimeoutError(stage, timeoutMs)),
            timeoutMs
        )
    })
    // Keep a handled branch on the operation: after a timeout the stage may
    // still settle (for example, a context close that completes late).
    operation.catch(() => undefined)
    try {
        return await Promise.race([operation, deadline])
    } finally {
        if (timer !== undefined) clearTimeout(timer)
    }
}
