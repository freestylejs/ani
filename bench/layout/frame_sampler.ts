/** A pure rAF frame-cost sampler; the page wrapper only supplies timestamps. */
import type { FrameCost } from './types.ts'

export class FrameSampler {
    readonly frames: FrameCost[] = []
    private batchTimestamp: number | null = null
    private batchMs = 0
    private batchCommit = false
    private nextCommit = false
    private pendingScript = 0

    /** A commit in a task between frames marks the next frame. */
    markCommit(): void {
        this.nextCommit = true
    }

    /** A commit inside a callback marks the frame that contains it. */
    markCommitInFrame(): void {
        if (this.batchTimestamp === null) this.nextCommit = true
        else this.batchCommit = true
    }

    /** Script done between frames is charged to the next frame sample. */
    addScript(ms: number): void {
        this.pendingScript += ms
    }

    /**
     * Runs one callback and records its duration. The next-commit flag is
     * consumed when a new frame batch starts, never by the previous frame.
     */
    frame(timestamp: number, run: () => void): void {
        if (this.batchTimestamp !== null && timestamp !== this.batchTimestamp) {
            this.flush()
        }
        if (this.batchTimestamp === null) {
            this.batchTimestamp = timestamp
            this.batchMs = this.pendingScript
            this.pendingScript = 0
            this.batchCommit = this.nextCommit
            this.nextCommit = false
        }
        const start = performance.now()
        try {
            run()
        } finally {
            this.batchMs += performance.now() - start
        }
    }

    /** Test/measurement seam: add a known callback duration. */
    record(timestamp: number, duration: number): void {
        if (this.batchTimestamp !== null && timestamp !== this.batchTimestamp) {
            this.flush()
        }
        if (this.batchTimestamp === null) {
            this.batchTimestamp = timestamp
            this.batchMs = this.pendingScript
            this.pendingScript = 0
            this.batchCommit = this.nextCommit
            this.nextCommit = false
        }
        this.batchMs += duration
    }

    stop(): void {
        this.flush()
    }

    private flush(): void {
        if (this.batchTimestamp === null) return
        this.frames.push({
            at: this.batchTimestamp,
            ms: this.batchMs,
            commit: this.batchCommit,
        })
        this.batchTimestamp = null
        this.batchMs = 0
        this.batchCommit = false
    }
}
