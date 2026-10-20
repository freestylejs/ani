import { type Codec, formatNumber, mismatch, NUMBER_SOURCE } from './codec'

declare const __ANI_DEV__: boolean

/**
 * Units a length codec can carry. There is no unit conversion: a codec only
 * ever parses and prints its own unit.
 */
export type LengthUnit = 'px' | 'rem' | 'em' | '%' | 'vw' | 'vh' | 'deg'

const LENGTH_UNITS: readonly LengthUnit[] = [
    'px',
    'rem',
    'em',
    '%',
    'vw',
    'vh',
    'deg',
]

/**
 * Codec for a length string with a fixed unit:
 * `length('rem').encode('12.5rem')` is `[12.5]` and
 * `length('rem').decode([12.5])` is `'12.5rem'`.
 *
 * Accepts signed decimals and exponents, ignores surrounding whitespace and
 * accepts the unitless `0` for every unit. A different unit, a missing unit
 * (other than `0`) or trailing text throws `AniError` with code
 * `ANI_CODEC_MISMATCH`.
 */
export function length(unit: LengthUnit): Codec<string> {
    if (!LENGTH_UNITS.includes(unit)) {
        throw mismatch(
            `Unknown length unit "${String(unit)}". ` +
                `Expected one of: ${LENGTH_UNITS.join(', ')}.`
        )
    }
    const withUnit = new RegExp(`^(${NUMBER_SOURCE})${unit}$`)
    const unitless = new RegExp(`^(${NUMBER_SOURCE})$`)
    return {
        size: 1,
        encode(value) {
            if (typeof value !== 'string') {
                throw mismatch(
                    __ANI_DEV__
                        ? `A length must be a string, received ${typeof value}.`
                        : ''
                )
            }
            const text = value.trim().toLowerCase()
            const match = withUnit.exec(text)
            if (match !== null) return [normalizeZero(Number(match[1]))]
            const zero = unitless.exec(text)
            if (zero !== null && Number(zero[1]) === 0) return [0]
            throw mismatch(
                __ANI_DEV__
                    ? `Cannot parse "${value}" as a length in "${unit}".`
                    : ''
            )
        },
        decode(values) {
            if (values.length !== 1) {
                throw mismatch(
                    __ANI_DEV__
                        ? `A length decodes 1 number, received ${values.length}.`
                        : ''
                )
            }
            return `${formatNumber(values[0] ?? 0)}${unit}`
        },
    }
}

function normalizeZero(value: number): number {
    return value === 0 ? 0 : value
}
