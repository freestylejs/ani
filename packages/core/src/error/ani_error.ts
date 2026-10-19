/**
 * Identifies a misuse error so callers can react to it programmatically.
 */
export type AniErrorCode =
    | 'ANI_INVALID_NODE'
    | 'ANI_UNREACHABLE_NODE'
    | 'ANI_INVALID_CONFIG'
    | 'ANI_UNKNOWN_STATE'
    | 'ANI_INVALID_OPTIONS'
    | 'ANI_REMOVED_API'
    | 'ANI_CODEC_MISMATCH'
    | 'ANI_SUBSCRIBER_QUARANTINED'

const CODES: ReadonlySet<string> = new Set<AniErrorCode>([
    'ANI_INVALID_NODE',
    'ANI_UNREACHABLE_NODE',
    'ANI_INVALID_CONFIG',
    'ANI_UNKNOWN_STATE',
    'ANI_INVALID_OPTIONS',
    'ANI_REMOVED_API',
    'ANI_CODEC_MISMATCH',
    'ANI_SUBSCRIBER_QUARANTINED',
])

const DOCS_URL = 'https://ani.freestylejs.dev/docs/errors#'

function docsFor(code: AniErrorCode): string {
    return `${DOCS_URL}${code.toLowerCase()}`
}

/**
 * True for every error ani throws or reports: an `AniError` or an error made
 * by `createAniError`. Narrows to an `Error` with a known `code` and `docs`.
 */
export function isAniError(
    value: unknown
): value is Error & { code: AniErrorCode; docs: string } {
    if (!(value instanceof Error)) return false
    const { code, docs } = value as { code?: unknown; docs?: unknown }
    return (
        typeof code === 'string' &&
        CODES.has(code) &&
        docs === docsFor(code as AniErrorCode)
    )
}

/**
 * Error thrown by ani helpers for loud, synchronous misuse.
 *
 * `code` identifies the failure class and `docs` points at the reference page
 * for it. `message` starts with `[CODE] ` for log-greppability.
 * `instanceof AniError` is true for every ani error, including the native
 * `TypeError` / `RangeError` instances made by `createAniError`.
 */
export class AniError extends Error {
    readonly code: AniErrorCode
    readonly docs: string

    constructor(code: AniErrorCode, message: string, options?: ErrorOptions) {
        super(`[${code}] ${message}`, options)
        this.name = 'AniError'
        this.code = code
        this.docs = docsFor(code)
    }

    static override [Symbol.hasInstance](value: unknown): boolean {
        return isAniError(value)
    }
}

/**
 * Creates a native `TypeError` / `RangeError` / `Error` that carries an ani
 * `code` and `docs` URL, so `isAniError` and `instanceof AniError` hold while
 * `instanceof TypeError` / `RangeError` keep working. For binding authors.
 */
export function createAniError<E extends Error>(
    Kind: new (message?: string, options?: ErrorOptions) => E,
    code: AniErrorCode,
    message: string,
    options?: ErrorOptions
): E & { code: AniErrorCode; docs: string } {
    const error = new Kind(`[${code}] ${message}`, options)
    Object.defineProperties(error, {
        code: { value: code, enumerable: false },
        docs: { value: docsFor(code), enumerable: false },
    })
    return error as E & { code: AniErrorCode; docs: string }
}
