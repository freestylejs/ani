import {
    type Codec,
    escapeRegExp,
    formatNumber,
    mismatch,
    NUMBER_SOURCE,
} from './codec'

declare const __ANI_DEV__: boolean

/**
 * Tagged-template codec for strings that carry numbers between literals,
 * such as transform lists. Every interpolation is the unit that follows the
 * number in its slot (`''` for unitless).
 *
 * ```ts
 * const transform = template`translate(${'px'}, ${'px'}) rotate(${'deg'})`
 * transform.encode('translate(10px, 20px) rotate(45deg)') // [10, 20, 45]
 * ```
 *
 * `encode` must match the literal parts (runs of whitespace match any run)
 * with a number plus the declared unit in each slot; anything else throws
 * `AniError` with code `ANI_CODEC_MISMATCH`.
 */
export function template(
    strings: TemplateStringsArray,
    ...units: string[]
): Codec<string> {
    for (const unit of units) {
        if (typeof unit !== 'string') {
            throw mismatch(
                __ANI_DEV__
                    ? 'Every template interpolation must be a unit string.'
                    : ''
            )
        }
    }
    const size = units.length
    let source = ''
    for (let index = 0; index < size; index++) {
        source += patternLiteral(strings[index] ?? '')
        source += `(${NUMBER_SOURCE})${escapeRegExp(units[index] ?? '')}`
    }
    source += patternLiteral(strings[size] ?? '')
    const matcher = new RegExp(`^${source}$`)

    return {
        size,
        encode(value) {
            if (typeof value !== 'string') {
                throw mismatch(
                    __ANI_DEV__
                        ? `A template value must be a string, received ${typeof value}.`
                        : ''
                )
            }
            const match = matcher.exec(value)
            if (match === null) {
                throw mismatch(
                    __ANI_DEV__
                        ? `Cannot encode "${value}" with this template.`
                        : ''
                )
            }
            const values: number[] = []
            for (let index = 0; index < size; index++) {
                values.push(Number(match[index + 1]))
            }
            return values
        },
        decode(values) {
            if (values.length !== size) {
                throw mismatch(
                    `This template decodes ${size} numbers, ` +
                        `received ${values.length}.`
                )
            }
            let text = strings[0] ?? ''
            for (let index = 0; index < size; index++) {
                text += `${formatNumber(values[index] ?? 0)}${units[index] ?? ''}${
                    strings[index + 1] ?? ''
                }`
            }
            return text
        },
    }
}

function patternLiteral(text: string): string {
    return escapeRegExp(text).replace(/\s+/g, '\\s+')
}
