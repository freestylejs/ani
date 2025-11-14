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

const TransformProperties = new Set(Object.keys(TransformFunctionMap))

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

const PxProperties = new Set([
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
])

type UnitlessPropertiesLiteral =
    | 'opacity'
    | 'zIndex'
    | 'lineHeight'
    | 'fontWeight'

const UnitlessProperties = new Set([
    'opacity',
    'zIndex',
    'lineHeight',
    'fontWeight',
])

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

type StylesheetValueTarget = Record<string, number>

export function createStyleSheet(
    animeStyleValue: StylesheetValueTarget,
    resolver?: Resolver<StylesheetValueTarget>
): Record<string, any> {
    const styleAccumulator: Record<string, any> = {}
    const CssTransformParts: Array<string> = []

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

        // Transform
        if (TransformProperties.has(key)) {
            const res = TransformFunctionMap[key as TransformPropertiesLiteral]

            const transformPart =
                'unit' in res
                    ? `${res.fn}(${value}${res.unit})`
                    : `${res.fn}(${value})`

            CssTransformParts.push(transformPart)
            continue
        }

        // PX
        if (PxProperties.has(key)) {
            styleAccumulator[key] = `${value}px`
            continue
        }

        // Unitless
        if (UnitlessProperties.has(key)) {
            styleAccumulator[key] = value
            continue
        }

        // Fallback
        styleAccumulator[key] = value
    }

    // Combine Transform Syntax
    if (CssTransformParts.length > 0) {
        styleAccumulator['transform'] = CssTransformParts.join(' ')
    }

    return styleAccumulator
}
