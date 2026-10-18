const TransformFunctionMap = {
    // deg
    rotate: { fn: 'rotate', unit: 'deg' },
    rotateX: { fn: 'rotateX', unit: 'deg' },
    rotateY: { fn: 'rotateY', unit: 'deg' },
    rotateZ: { fn: 'rotateZ', unit: 'deg' },
    skew: { fn: 'skew', unit: 'deg' },
    skewX: { fn: 'skewX', unit: 'deg' },
    skewY: { fn: 'skewY', unit: 'deg' },
    // px
    translate: { fn: 'translate', unit: 'px' },
    translateX: { fn: 'translateX', unit: 'px' },
    translateY: { fn: 'translateY', unit: 'px' },
    translateZ: { fn: 'translateZ', unit: 'px' },
    // unitless
    scale: { fn: 'scale' },
    scaleX: { fn: 'scaleX' },
    scaleY: { fn: 'scaleY' },
    scaleZ: { fn: 'scaleZ' },
} as const satisfies Record<string, { fn: string; unit?: string }>

type TransformPropertiesLiteral = keyof typeof TransformFunctionMap

type PxPropertiesLiteral =
    | 'width'
    | 'height'
    | 'margin'
    | 'marginTop'
    | 'marginBottom'
    | 'marginLeft'
    | 'marginRight'
    | 'padding'
    | 'paddingTop'
    | 'paddingBottom'
    | 'paddingLeft'
    | 'paddingRight'
    | 'top'
    | 'left'
    | 'right'
    | 'bottom'
    | 'borderWidth'
    | 'borderRadius'

type UnitlessPropertiesLiteral =
    | 'opacity'
    | 'zIndex'
    | 'lineHeight'
    | 'fontWeight'

export type StylesheetSupportedLiteral =
    | TransformPropertiesLiteral
    | PxPropertiesLiteral
    | UnitlessPropertiesLiteral

export type Resolver<T> = {
    [Key in keyof T]?: (target: T[keyof T]) => {
        key: string
        value: string | number
    }
}

const PX_KEYS = [
    'width',
    'height',
    'margin',
    'marginTop',
    'marginBottom',
    'marginLeft',
    'marginRight',
    'padding',
    'paddingTop',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'top',
    'left',
    'right',
    'bottom',
    'borderWidth',
    'borderRadius',
] as const

type StylesheetValueTarget = Record<string, number>

interface TransformKind {
    // `fn(` and `unit)` pre-joined so a part is built with two concatenations
    readonly open: string
    readonly close: string
}

/** Sentinel: value is written as `<n>px`. */
const PX = Symbol('px')

/**
 * One lookup classifies a key: transform function, px length, or (absent)
 * unitless / pass-through. Null prototype: keys like `constructor` must not
 * hit `Object.prototype`.
 */
const KEY_KIND: Record<string, TransformKind | typeof PX> = Object.create(null)

for (const [key, def] of Object.entries(TransformFunctionMap)) {
    KEY_KIND[key] = {
        open: `${def.fn}(`,
        close: 'unit' in def ? `${def.unit})` : ')',
    }
}
for (const key of PX_KEYS) {
    KEY_KIND[key] = PX
}

export function createStyleSheet(
    animeStyleValue: StylesheetValueTarget,
    resolver?: Resolver<StylesheetValueTarget>
): Record<string, any> {
    const styleAccumulator: Record<string, any> = {}
    let transform = ''

    for (const key in animeStyleValue) {
        if (!Object.hasOwn(animeStyleValue, key)) {
            continue
        }
        const value = animeStyleValue[key]

        if (typeof value !== 'number') {
            continue
        }

        // Custom Resolver
        const styleResolver = resolver?.[key]
        if (styleResolver) {
            const { key: resolvedKey, value: resolvedValue } =
                styleResolver(value)

            styleAccumulator[resolvedKey] = resolvedValue
            continue
        }

        const kind = KEY_KIND[key]

        // Transform (parts are joined with a single space, in key order)
        if (kind !== undefined && kind !== PX) {
            const part = `${kind.open}${value}${kind.close}`
            transform = transform === '' ? part : `${transform} ${part}`
            continue
        }

        // PX
        if (kind === PX) {
            styleAccumulator[key] = `${value}px`
            continue
        }

        // Unitless & fallback
        styleAccumulator[key] = value
    }

    // Combine Transform Syntax
    if (transform !== '') {
        styleAccumulator['transform'] = transform
    }

    return styleAccumulator
}
