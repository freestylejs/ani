import '../env'

declare const __ANI_DEV__: boolean

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

/**
 * Codes of the development-only warnings (`devWarn`). They are never thrown:
 * production builds carry no warning code at all.
 */
export type AniDevWarningCode =
    | 'ANI_DEV_CONFLICTING_WRITERS'
    | 'ANI_DEV_DISPOSED_USE'

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

/** Docs URL of an error or development-warning code. */
export function docsFor(code: AniErrorCode | AniDevWarningCode): string {
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
 *
 * In a production build the long human text is dropped: the message is
 * `[CODE] <docs url>` and the docs URL carries the explanation.
 */
export class AniError extends Error {
    readonly code: AniErrorCode
    readonly docs: string

    constructor(code: AniErrorCode, message: string, options?: ErrorOptions) {
        super(`[${code}] ${__ANI_DEV__ ? message : docsFor(code)}`, options)
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
 *
 * `message` should be handed over as `DEV ? \`...\` : ''` so the production
 * build removes the long text; the message then is `[CODE] <docs url>`.
 * (`DEV` is exported by the package; core sources read the build-time
 * `__ANI_DEV__` flag directly.)
 */
export function createAniError<E extends Error>(
    Kind: new (message?: string, options?: ErrorOptions) => E,
    code: AniErrorCode,
    message: string,
    options?: ErrorOptions
): E & { code: AniErrorCode; docs: string } {
    const error = new Kind(
        `[${code}] ${__ANI_DEV__ ? message : docsFor(code)}`,
        options
    )
    Object.defineProperties(error, {
        code: { value: code, enumerable: false },
        docs: { value: docsFor(code), enumerable: false },
    })
    return error as E & { code: AniErrorCode; docs: string }
}
