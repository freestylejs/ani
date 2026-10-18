/**
 * Identifies a misuse error so callers can react to it programmatically.
 */
export type AniErrorCode = 'ANI_CODEC_MISMATCH'

/**
 * Error thrown by ani helpers for loud, synchronous misuse.
 *
 * `code` identifies the failure class and `docs` points at the reference page
 * for it. `message` starts with `[CODE] ` for log-greppability.
 */
export class AniError extends Error {
    readonly code: AniErrorCode
    readonly docs: string

    constructor(code: AniErrorCode, message: string) {
        super(`[${code}] ${message}`)
        this.name = 'AniError'
        this.code = code
        this.docs = `https://ani.freestylejs.dev/docs/errors#${code.toLowerCase()}`
    }
}
