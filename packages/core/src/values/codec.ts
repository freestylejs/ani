import { AniError } from '../error'

declare const __ANI_DEV__: boolean

/**
 * Turns a display value into the number vector the engine animates and back.
 *
 * `size` is the number of numbers one value occupies in the vector.
 */
export interface Codec<T> {
    /** Numbers per value. */
    readonly size: number
    /** Encodes a display value. Throws `AniError` on bad input. */
    encode(value: T): number[]
    /** Decodes `size` numbers back into a display value. */
    decode(values: readonly number[]): T
}

/**
 * The display value a codec produces: `CodecValue<typeof length('px')>` is
 * `string`.
 */
export type CodecValue<C> = C extends Codec<infer T> ? T : never

/**
 * Regex source matching one signed CSS number with an optional exponent.
 * Internal to the codecs.
 */
export const NUMBER_SOURCE =
    '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?'

/**
 * Formats a decoded number: at most 4 decimals, trailing zeros removed and
 * `-0` printed as `0`. Internal to the codecs.
 */
export function formatNumber(value: number): string {
    const rounded = Math.round(value * 1e4) / 1e4
    return rounded === 0 ? '0' : `${rounded}`
}

/** Clamps a number into `[0, 1]`. Internal to the codecs. */
export function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value))
}

/** Builds an `ANI_CODEC_MISMATCH` error. Internal to the codecs. */
export function mismatch(message: string): AniError {
    return new AniError('ANI_CODEC_MISMATCH', __ANI_DEV__ ? message : '')
}

/** Escapes regex metacharacters so a literal can be embedded. Internal. */
export function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
