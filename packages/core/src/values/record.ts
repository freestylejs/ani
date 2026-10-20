import { type Codec, type CodecValue, mismatch } from './codec'

declare const __ANI_DEV__: boolean

/**
 * Composes codecs into one codec for an object. Members are laid out in
 * `Object.keys(codecs)` order and `size` is the sum of the member sizes.
 *
 * `encode` requires every key (a missing key throws `AniError` with code
 * `ANI_CODEC_MISMATCH`); extra keys are ignored. `decode` splits the vector.
 */
export function record<R extends Record<string, Codec<unknown>>>(
    codecs: R
): Codec<{ [K in keyof R]: CodecValue<R[K]> }> {
    type Value = { [K in keyof R]: CodecValue<R[K]> }
    const keys = Object.keys(codecs)
    const members = keys.map((key) => codecs[key] as Codec<unknown>)
    let size = 0
    for (const member of members) size += member.size

    return {
        size,
        encode(value) {
            if (typeof value !== 'object' || value === null) {
                throw mismatch(
                    __ANI_DEV__
                        ? `A record value must be an object, received ${
                              value === null ? 'null' : typeof value
                          }.`
                        : ''
                )
            }
            const source = value as Record<string, unknown>
            const encoded: number[] = []
            keys.forEach((key, index) => {
                if (!Object.hasOwn(source, key)) {
                    throw mismatch(
                        __ANI_DEV__
                            ? `Record value is missing the key "${key}".`
                            : ''
                    )
                }
                const member = members[index] as Codec<unknown>
                for (const item of member.encode(source[key])) {
                    encoded.push(item)
                }
            })
            return encoded
        },
        decode(values) {
            if (values.length !== size) {
                throw mismatch(
                    `This record decodes ${size} numbers, ` +
                        `received ${values.length}.`
                )
            }
            const decoded: Record<string, unknown> = {}
            let offset = 0
            keys.forEach((key, index) => {
                const member = members[index] as Codec<unknown>
                decoded[key] = member.decode(
                    values.slice(offset, offset + member.size)
                )
                offset += member.size
            })
            return decoded as Value
        },
    }
}
