import { type Codec, clamp01, formatNumber, mismatch } from './codec'

declare const __ANI_DEV__: boolean

/**
 * Color spaces a codec can animate in.
 *
 * - `oklab`: perceptually uniform, `[L, a, b, alpha]` with `L` in `0..1`.
 * - `srgb`: gamma-encoded `[r, g, b, alpha]` with channels in `0..1`.
 * - `srgb-linear`: linear-light `[r, g, b, alpha]` with channels in `0..1`.
 */
export type ColorSpace = 'oklab' | 'srgb-linear' | 'srgb'

interface SrgbColor {
    readonly space: 'srgb'
    readonly channels: readonly [number, number, number]
    readonly alpha: number
}

interface OklabColor {
    readonly space: 'oklab'
    readonly channels: readonly [number, number, number]
    readonly alpha: number
}

type ParsedColor = SrgbColor | OklabColor

const COLOR_SIZE = 4

/**
 * The 148 CSS named colors, as `0xrrggbb`. `transparent` is handled apart.
 * Internal to the codec.
 */
const NAMED_COLORS: Record<string, number> = {
    aliceblue: 0xf0f8ff,
    antiquewhite: 0xfaebd7,
    aqua: 0x00ffff,
    aquamarine: 0x7fffd4,
    azure: 0xf0ffff,
    beige: 0xf5f5dc,
    bisque: 0xffe4c4,
    black: 0x000000,
    blanchedalmond: 0xffebcd,
    blue: 0x0000ff,
    blueviolet: 0x8a2be2,
    brown: 0xa52a2a,
    burlywood: 0xdeb887,
    cadetblue: 0x5f9ea0,
    chartreuse: 0x7fff00,
    chocolate: 0xd2691e,
    coral: 0xff7f50,
    cornflowerblue: 0x6495ed,
    cornsilk: 0xfff8dc,
    crimson: 0xdc143c,
    cyan: 0x00ffff,
    darkblue: 0x00008b,
    darkcyan: 0x008b8b,
    darkgoldenrod: 0xb8860b,
    darkgray: 0xa9a9a9,
    darkgreen: 0x006400,
    darkgrey: 0xa9a9a9,
    darkkhaki: 0xbdb76b,
    darkmagenta: 0x8b008b,
    darkolivegreen: 0x556b2f,
    darkorange: 0xff8c00,
    darkorchid: 0x9932cc,
    darkred: 0x8b0000,
    darksalmon: 0xe9967a,
    darkseagreen: 0x8fbc8f,
    darkslateblue: 0x483d8b,
    darkslategray: 0x2f4f4f,
    darkslategrey: 0x2f4f4f,
    darkturquoise: 0x00ced1,
    darkviolet: 0x9400d3,
    deeppink: 0xff1493,
    deepskyblue: 0x00bfff,
    dimgray: 0x696969,
    dimgrey: 0x696969,
    dodgerblue: 0x1e90ff,
    firebrick: 0xb22222,
    floralwhite: 0xfffaf0,
    forestgreen: 0x228b22,
    fuchsia: 0xff00ff,
    gainsboro: 0xdcdcdc,
    ghostwhite: 0xf8f8ff,
    gold: 0xffd700,
    goldenrod: 0xdaa520,
    gray: 0x808080,
    green: 0x008000,
    greenyellow: 0xadff2f,
    grey: 0x808080,
    honeydew: 0xf0fff0,
    hotpink: 0xff69b4,
    indianred: 0xcd5c5c,
    indigo: 0x4b0082,
    ivory: 0xfffff0,
    khaki: 0xf0e68c,
    lavender: 0xe6e6fa,
    lavenderblush: 0xfff0f5,
    lawngreen: 0x7cfc00,
    lemonchiffon: 0xfffacd,
    lightblue: 0xadd8e6,
    lightcoral: 0xf08080,
    lightcyan: 0xe0ffff,
    lightgoldenrodyellow: 0xfafad2,
    lightgray: 0xd3d3d3,
    lightgreen: 0x90ee90,
    lightgrey: 0xd3d3d3,
    lightpink: 0xffb6c1,
    lightsalmon: 0xffa07a,
    lightseagreen: 0x20b2aa,
    lightskyblue: 0x87cefa,
    lightslategray: 0x778899,
    lightslategrey: 0x778899,
    lightsteelblue: 0xb0c4de,
    lightyellow: 0xffffe0,
    lime: 0x00ff00,
    limegreen: 0x32cd32,
    linen: 0xfaf0e6,
    magenta: 0xff00ff,
    maroon: 0x800000,
    mediumaquamarine: 0x66cdaa,
    mediumblue: 0x0000cd,
    mediumorchid: 0xba55d3,
    mediumpurple: 0x9370db,
    mediumseagreen: 0x3cb371,
    mediumslateblue: 0x7b68ee,
    mediumspringgreen: 0x00fa9a,
    mediumturquoise: 0x48d1cc,
    mediumvioletred: 0xc71585,
    midnightblue: 0x191970,
    mintcream: 0xf5fffa,
    mistyrose: 0xffe4e1,
    moccasin: 0xffe4b5,
    navajowhite: 0xffdead,
    navy: 0x000080,
    oldlace: 0xfdf5e6,
    olive: 0x808000,
    olivedrab: 0x6b8e23,
    orange: 0xffa500,
    orangered: 0xff4500,
    orchid: 0xda70d6,
    palegoldenrod: 0xeee8aa,
    palegreen: 0x98fb98,
    paleturquoise: 0xafeeee,
    palevioletred: 0xdb7093,
    papayawhip: 0xffefd5,
    peachpuff: 0xffdab9,
    peru: 0xcd853f,
    pink: 0xffc0cb,
    plum: 0xdda0dd,
    powderblue: 0xb0e0e6,
    purple: 0x800080,
    rebeccapurple: 0x663399,
    red: 0xff0000,
    rosybrown: 0xbc8f8f,
    royalblue: 0x4169e1,
    saddlebrown: 0x8b4513,
    salmon: 0xfa8072,
    sandybrown: 0xf4a460,
    seagreen: 0x2e8b57,
    seashell: 0xfff5ee,
    sienna: 0xa0522d,
    silver: 0xc0c0c0,
    skyblue: 0x87ceeb,
    slateblue: 0x6a5acd,
    slategray: 0x708090,
    slategrey: 0x708090,
    snow: 0xfffafa,
    springgreen: 0x00ff7f,
    steelblue: 0x4682b4,
    tan: 0xd2b48c,
    teal: 0x008080,
    thistle: 0xd8bfd8,
    tomato: 0xff6347,
    turquoise: 0x40e0d0,
    violet: 0xee82ee,
    wheat: 0xf5deb3,
    white: 0xffffff,
    whitesmoke: 0xf5f5f5,
    yellow: 0xffff00,
    yellowgreen: 0x9acd32,
}

const HEX_PATTERN = /^[0-9a-f]+$/i
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

const ANGLE_UNITS: ReadonlyArray<readonly [string, number]> = [
    ['turn', 360],
    ['grad', 0.9],
    ['deg', 1],
    ['rad', 180 / Math.PI],
]

interface ArgumentList {
    readonly channels: readonly [string, string, string]
    readonly alpha: string | null
}

function parseNumber(text: string): number | null {
    return NUMBER_PATTERN.test(text) ? Number(text) : null
}

function parsePercentage(text: string): number | null {
    if (!text.endsWith('%')) return null
    const value = parseNumber(text.slice(0, -1))
    return value === null ? null : value / 100
}

function parseAlpha(text: string): number | null {
    const value = parsePercentage(text) ?? parseNumber(text)
    return value === null ? null : clamp01(value)
}

function parseRgbChannel(text: string): number | null {
    const percentage = parsePercentage(text)
    if (percentage !== null) return clamp01(percentage)
    const value = parseNumber(text)
    return value === null ? null : clamp01(value / 255)
}

function parseLightness(text: string): number | null {
    const value = parsePercentage(text) ?? parseNumber(text)
    return value === null ? null : clamp01(value)
}

function parseAngle(text: string): number | null {
    const lower = text.toLowerCase()
    for (const [suffix, scale] of ANGLE_UNITS) {
        if (!lower.endsWith(suffix)) continue
        const value = parseNumber(lower.slice(0, lower.length - suffix.length))
        if (value !== null) return value * scale
    }
    return parseNumber(lower)
}

function splitSpaceArguments(body: string): ArgumentList | null {
    const parts = body.split('/')
    if (parts.length > 2) return null
    const channelList = (parts[0] ?? '').trim().split(/\s+/)
    if (channelList.length !== 3) return null
    const [first, second, third] = channelList
    if (first === undefined || second === undefined || third === undefined) {
        return null
    }
    const alpha = parts.length === 2 ? (parts[1] ?? '').trim() : null
    return { channels: [first, second, third], alpha }
}

function splitArguments(body: string): ArgumentList | null {
    if (!body.includes(',')) return splitSpaceArguments(body)
    const parts = body.split(',').map((part) => part.trim())
    const [first, second, third, fourth] = parts
    if (first === undefined || second === undefined || third === undefined) {
        return null
    }
    if (parts.length === 4 && fourth !== undefined) {
        return { channels: [first, second, third], alpha: fourth }
    }
    if (parts.length === 3) {
        return { channels: [first, second, third], alpha: null }
    }
    return null
}

function parseHex(text: string): ParsedColor | null {
    const digits = text.slice(1)
    if (!HEX_PATTERN.test(digits)) return null
    if (digits.length === 3 || digits.length === 4) {
        return {
            space: 'srgb',
            channels: [
                parseInt(digits.charAt(0).repeat(2), 16) / 255,
                parseInt(digits.charAt(1).repeat(2), 16) / 255,
                parseInt(digits.charAt(2).repeat(2), 16) / 255,
            ],
            alpha:
                digits.length === 4
                    ? parseInt(digits.charAt(3).repeat(2), 16) / 255
                    : 1,
        }
    }
    if (digits.length === 6 || digits.length === 8) {
        return {
            space: 'srgb',
            channels: [
                parseInt(digits.slice(0, 2), 16) / 255,
                parseInt(digits.slice(2, 4), 16) / 255,
                parseInt(digits.slice(4, 6), 16) / 255,
            ],
            alpha:
                digits.length === 8
                    ? parseInt(digits.slice(6, 8), 16) / 255
                    : 1,
        }
    }
    return null
}

function parseNamed(keyword: string): ParsedColor | null {
    if (!Object.hasOwn(NAMED_COLORS, keyword)) return null
    const hex = NAMED_COLORS[keyword] ?? 0
    return {
        space: 'srgb',
        channels: [
            ((hex >> 16) & 0xff) / 255,
            ((hex >> 8) & 0xff) / 255,
            (hex & 0xff) / 255,
        ],
        alpha: 1,
    }
}

function parseRgb(body: string): ParsedColor | null {
    const args = splitArguments(body)
    if (args === null) return null
    const red = parseRgbChannel(args.channels[0])
    const green = parseRgbChannel(args.channels[1])
    const blue = parseRgbChannel(args.channels[2])
    const alpha = args.alpha === null ? 1 : parseAlpha(args.alpha)
    if (red === null || green === null || blue === null || alpha === null) {
        return null
    }
    return { space: 'srgb', channels: [red, green, blue], alpha }
}

function parseHsl(body: string): ParsedColor | null {
    const args = splitArguments(body)
    if (args === null) return null
    const hue = parseAngle(args.channels[0])
    const saturation = parsePercentage(args.channels[1])
    const lightness = parsePercentage(args.channels[2])
    const alpha = args.alpha === null ? 1 : parseAlpha(args.alpha)
    if (
        hue === null ||
        saturation === null ||
        lightness === null ||
        alpha === null
    ) {
        return null
    }
    return {
        space: 'srgb',
        channels: hslToSrgb(hue, clamp01(saturation), clamp01(lightness)),
        alpha,
    }
}

function parseOklab(body: string): ParsedColor | null {
    const args = splitSpaceArguments(body)
    if (args === null) return null
    const lightness = parseLightness(args.channels[0])
    const a = parseNumber(args.channels[1])
    const b = parseNumber(args.channels[2])
    const alpha = args.alpha === null ? 1 : parseAlpha(args.alpha)
    if (lightness === null || a === null || b === null || alpha === null) {
        return null
    }
    return { space: 'oklab', channels: [lightness, a, b], alpha }
}

function parseOklch(body: string): ParsedColor | null {
    const args = splitSpaceArguments(body)
    if (args === null) return null
    const lightness = parseLightness(args.channels[0])
    const chroma = parseNumber(args.channels[1])
    const hue = parseAngle(args.channels[2])
    const alpha = args.alpha === null ? 1 : parseAlpha(args.alpha)
    if (
        lightness === null ||
        chroma === null ||
        hue === null ||
        alpha === null
    ) {
        return null
    }
    const radians = (hue * Math.PI) / 180
    const radius = Math.max(chroma, 0)
    return {
        space: 'oklab',
        channels: [
            lightness,
            radius * Math.cos(radians),
            radius * Math.sin(radians),
        ],
        alpha,
    }
}

function parseFunction(name: string, body: string): ParsedColor | null {
    if (name === 'rgb' || name === 'rgba') return parseRgb(body)
    if (name === 'hsl' || name === 'hsla') return parseHsl(body)
    if (name === 'oklab') return parseOklab(body)
    if (name === 'oklch') return parseOklch(body)
    return null
}

function parseColor(input: string): ParsedColor {
    const text = input.trim()

    if (text.startsWith('#')) {
        const parsed = parseHex(text)
        if (parsed === null) {
            throw mismatch(
                __ANI_DEV__ ? `Cannot parse "${input}" as a color.` : ''
            )
        }
        return parsed
    }

    const open = text.indexOf('(')
    if (open > 0 && text.endsWith(')')) {
        const parsed = parseFunction(
            text.slice(0, open).toLowerCase(),
            text.slice(open + 1, -1)
        )
        if (parsed === null) {
            throw mismatch(
                __ANI_DEV__ ? `Cannot parse "${input}" as a color.` : ''
            )
        }
        return parsed
    }

    const keyword = text.toLowerCase()
    if (keyword === 'transparent') {
        return { space: 'srgb', channels: [0, 0, 0], alpha: 0 }
    }
    const named = parseNamed(keyword)
    if (named === null) {
        throw mismatch(__ANI_DEV__ ? `Cannot parse "${input}" as a color.` : '')
    }
    return named
}

function srgbToLinear(channel: number): number {
    return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(channel: number): number {
    return channel <= 0.0031308
        ? channel * 12.92
        : 1.055 * channel ** (1 / 2.4) - 0.055
}

function hslToSrgb(
    hue: number,
    saturation: number,
    lightness: number
): [number, number, number] {
    if (saturation === 0) return [lightness, lightness, lightness]
    const h = (((hue % 360) + 360) % 360) / 360
    const q =
        lightness < 0.5
            ? lightness * (1 + saturation)
            : lightness + saturation - lightness * saturation
    const p = 2 * lightness - q
    const channel = (t: number): number => {
        let value = t
        if (value < 0) value += 1
        if (value > 1) value -= 1
        if (value < 1 / 6) return p + (q - p) * 6 * value
        if (value < 1 / 2) return q
        if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
        return p
    }
    return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]
}

/**
 * linear-light sRGB -> CIE XYZ (D65): the CSS Color 4 reference matrix.
 */
function linearSrgbToXyz(
    r: number,
    g: number,
    b: number
): [number, number, number] {
    return [
        (506752 / 1228815) * r + (87881 / 245763) * g + (12673 / 70218) * b,
        (87098 / 409605) * r + (175762 / 245763) * g + (12673 / 175545) * b,
        (7918 / 409605) * r + (87881 / 737289) * g + (1001167 / 1053270) * b,
    ]
}

/**
 * CIE XYZ (D65) -> linear-light sRGB: the CSS Color 4 reference matrix.
 */
function xyzToLinearSrgb(
    x: number,
    y: number,
    z: number
): [number, number, number] {
    return [
        (12831 / 3959) * x + (-329 / 214) * y + (-1974 / 3959) * z,
        (-851781 / 878810) * x + (1648619 / 878810) * y + (36519 / 878810) * z,
        (705 / 12673) * x + (-2585 / 12673) * y + (705 / 667) * z,
    ]
}

/**
 * CIE XYZ (D65) -> OKLab: the CSS Color 4 reference matrices.
 */
function xyzToOklab(x: number, y: number, z: number): [number, number, number] {
    const l = Math.cbrt(
        0.819022437996703 * x + 0.3619062600528904 * y - 0.1288737815209879 * z
    )
    const m = Math.cbrt(
        0.0329836539323885 * x + 0.9292868615863434 * y + 0.0361446663506424 * z
    )
    const s = Math.cbrt(
        0.0481771893596242 * x + 0.2642395317527308 * y + 0.6335478284694309 * z
    )
    return [
        0.210454268309314 * l + 0.7936177747023054 * m - 0.0040720430116193 * s,
        1.9779985324311684 * l - 2.4285922420485799 * m + 0.450593709617411 * s,
        0.0259040424655478 * l +
            0.7827717124575296 * m -
            0.8086757549230774 * s,
    ]
}

/**
 * OKLab -> CIE XYZ (D65): the CSS Color 4 reference matrices.
 */
function oklabToXyz(l: number, a: number, b: number): [number, number, number] {
    const long = (l + 0.3963377773761749 * a + 0.2158037573099136 * b) ** 3
    const medium = (l - 0.1055613458156586 * a - 0.0638541728258133 * b) ** 3
    const short = (l - 0.0894841775298119 * a - 1.2914855480194092 * b) ** 3
    return [
        1.2268798758459243 * long -
            0.5578149944602171 * medium +
            0.2813910456659647 * short,
        -0.0405757452148008 * long +
            1.112286803280317 * medium -
            0.0717110580655164 * short,
        -0.0763729366746601 * long -
            0.4214933324022432 * medium +
            1.5869240198367816 * short,
    ]
}

function srgbToOklab(
    r: number,
    g: number,
    b: number
): [number, number, number] {
    const [x, y, z] = linearSrgbToXyz(
        srgbToLinear(r),
        srgbToLinear(g),
        srgbToLinear(b)
    )
    return xyzToOklab(x, y, z)
}

function oklabToSrgb(
    l: number,
    a: number,
    b: number
): [number, number, number] {
    const [x, y, z] = oklabToXyz(l, a, b)
    const [r, g, blue] = xyzToLinearSrgb(x, y, z)
    return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(blue)]
}

function toVector(
    color: ParsedColor,
    space: ColorSpace
): [number, number, number] {
    const [c1, c2, c3] = color.channels
    if (color.space === 'oklab') {
        if (space === 'oklab') return [c1, c2, c3]
        const [r, g, b] = oklabToSrgb(c1, c2, c3)
        return space === 'srgb'
            ? [r, g, b]
            : [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]
    }
    if (space === 'srgb') return [c1, c2, c3]
    if (space === 'srgb-linear') {
        return [srgbToLinear(c1), srgbToLinear(c2), srgbToLinear(c3)]
    }
    return srgbToOklab(c1, c2, c3)
}

function formatColor(space: ColorSpace, values: readonly number[]): string {
    const first = values[0] ?? 0
    const second = values[1] ?? 0
    const third = values[2] ?? 0
    const alpha = formatNumber(clamp01(values[3] ?? 0))
    if (space === 'srgb') {
        return `rgb(${formatNumber(clamp01(first) * 255)} ${formatNumber(
            clamp01(second) * 255
        )} ${formatNumber(clamp01(third) * 255)} / ${alpha})`
    }
    if (space === 'srgb-linear') {
        return `color(srgb-linear ${formatNumber(first)} ${formatNumber(
            second
        )} ${formatNumber(third)} / ${alpha})`
    }
    return `oklab(${formatNumber(first)} ${formatNumber(second)} ${formatNumber(
        third
    )} / ${alpha})`
}

/**
 * Codec for a color string in the given space. Accepts every CSS Color 4
 * syntax the library supports: hex, `rgb()`/`rgba()`, `hsl()`/`hsla()`,
 * `oklab()`, `oklch()`, `transparent` and the 148 named colors. Anything
 * else throws `AniError` with code `ANI_CODEC_MISMATCH`.
 */
export function colorIn(space: ColorSpace): Codec<string> {
    if (space !== 'oklab' && space !== 'srgb-linear' && space !== 'srgb') {
        throw mismatch(
            `Unknown color space "${String(space)}". ` +
                'Expected "oklab", "srgb-linear" or "srgb".'
        )
    }
    return {
        size: COLOR_SIZE,
        encode(value) {
            if (typeof value !== 'string') {
                throw mismatch(
                    __ANI_DEV__
                        ? `A color must be a string, received ${typeof value}.`
                        : ''
                )
            }
            const parsed = parseColor(value)
            const channels = toVector(parsed, space)
            return [...channels, clamp01(parsed.alpha)]
        },
        decode(values) {
            if (values.length !== COLOR_SIZE) {
                throw mismatch(
                    `A color decodes ${COLOR_SIZE} numbers, ` +
                        `received ${values.length}.`
                )
            }
            return formatColor(space, values)
        },
    }
}

/**
 * The default color codec, in the OKLab space: `[L, a, b, alpha]` with `L`
 * and alpha in `0..1`. `decode` renders `oklab(L a b / A)`.
 */
export const color: Codec<string> = colorIn('oklab')
